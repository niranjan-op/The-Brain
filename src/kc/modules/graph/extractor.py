"""Extract Knowledge Graph nodes and edges (Graph Schema v1.1 / D017) and sync to Neo4j AuraDB."""
from __future__ import annotations

import logging
from typing import Any, Literal

from pydantic import BaseModel, Field

from src.kc.core.config import settings
from src.kc.core.llm import client as _client
from src.kc.modules.graph.aura import AuraUnavailableError, init_aura_schema
from src.kc.modules.graph.gateway import create_edge, create_or_merge_node
from src.kc.modules.graph.sync import sync_project_to_aura

logger = logging.getLogger(__name__)

EXTRACTION_SYSTEM_PROMPT = """\
You extract structured Knowledge Graph nodes and edges from project and architecture documentation
following Graph Schema v1.1 (Why layer + What layer).
Only extract entities and relationships that are explicitly supported by the provided chunks.

Node types (pick the exact type):
Why layer (plan, rationale, constraints, open items):
- Decision: An architectural, algorithmic, or product choice made for the system.
- Alternative: A competing option or baseline that was considered, compared, or rejected.
- Constraint: A technical limit, hardware limit, free-tier quota, or environmental constraint.
- Requirement: A functional or non-functional goal or requirement the system must satisfy.
- Assumption: A premise or hypothesis the design relies on.
- Question: An open question, future work item, or unresolved issue.

What layer (system structure and data flow):
- Module: A software module, subsystem, pipeline stage, model, or processing component.
- ExternalEntity: An external user, actor, sensor, hardware device, or third-party API.
- DataStore: A database, file store, vector index, or persistent state repository.
- DataObject: A payload, signal, document format, or data structure carried between modules.
- Runtime: A execution environment, hardware board, server, or deployment target.

Edge types (pick the exact relationship type connecting src_name -> dst_name):
- DECOMPOSES_INTO: Parent Module decomposes into child Module.
- FLOWS_TO: Data/signal flows from src (ExternalEntity/Module/DataObject) to dst (Module/DataObject).
- READS: Module reads from DataStore or DataObject.
- WRITES: Module writes to DataStore or DataObject.
- HOSTS: Runtime hosts Module or DataStore.
- JUSTIFIES: Constraint, Requirement, or finding justifies a Decision or Module.
- REJECTED_FOR: Alternative was rejected in favor of dst Decision or Module.
- SUPERSEDES: New Decision supersedes old Decision (set scope='full' or 'partial', with aspects if partial).
- SATISFIES: Module or Decision satisfies a Requirement or Constraint.
- RELIES_ON: Decision or Module relies on an Assumption, Concept, or Module.
- RESOLVES: Decision or Module resolves a Question.

Rules:
- Every node MUST include both a concise 1-sentence `summary` AND a detailed multi-sentence `description`
  (stored in Postgres `nodes.text`) explaining what it does, its parameters, or why it matters.
- Extract 8 to 15 high-value nodes and 8 to 20 edges connecting them. Every node should participate in at least one edge where supported by the text.
- `src_name` and `dst_name` in `edges` MUST exactly match the `name` of a node in your `nodes` list.
- Every node and edge MUST cite a valid `chunk_id` from the input and a short verbatim `excerpt` (<=160 chars).
"""

_AURA_SCHEMA_INITIALIZED = False

NodeTypeLiteral = Literal[
    "Decision",
    "Alternative",
    "Constraint",
    "Requirement",
    "Assumption",
    "Question",
    "Module",
    "ExternalEntity",
    "DataStore",
    "DataObject",
    "Runtime",
]

EdgeTypeLiteral = Literal[
    "DECOMPOSES_INTO",
    "FLOWS_TO",
    "READS",
    "WRITES",
    "HOSTS",
    "JUSTIFIES",
    "REJECTED_FOR",
    "SUPERSEDES",
    "SATISFIES",
    "RELIES_ON",
    "RESOLVES",
]


class ExtractedNode(BaseModel):
    name: str = Field(description="Canonical entity name (2-6 words)")
    type: NodeTypeLiteral
    status: Literal["open", "agreed", "deferred", "rejected", "superseded", "resolved"] = Field(
        description="Status ('open' or 'resolved' for Question; 'agreed'/'rejected'/'open' for others)",
    )
    summary: str = Field(description="One-sentence summary of this entity")
    description: str = Field(
        description="Detailed 2-4 sentence description stored in Postgres (architecture role, details, rationale)"
    )
    aliases: list[str] = Field(description="Alternate names or abbreviations for this entity (empty list if none)")
    chunk_id: str = Field(description="Exact chunk_id where this entity is evidenced")
    excerpt: str = Field(description="Short verbatim quote from the chunk supporting this entity")


class ExtractedEdge(BaseModel):
    src_name: str = Field(description="Exact name of the source node from the nodes list")
    dst_name: str = Field(description="Exact name of the destination node from the nodes list")
    type: EdgeTypeLiteral
    kind: str = Field(default="", description="Optional data flow label or sub-kind (empty string if none)")
    scope: Literal["none", "full", "partial"] = Field(
        default="none",
        description="Use 'full' or 'partial' ONLY when type is 'SUPERSEDES', otherwise 'none'",
    )
    aspects: list[str] = Field(default_factory=list, description="Aspects when SUPERSEDES scope is 'partial'")
    chunk_id: str = Field(description="Exact chunk_id where this relationship is evidenced")
    excerpt: str = Field(description="Short verbatim quote from the chunk supporting this relationship")


class GraphExtraction(BaseModel):
    nodes: list[ExtractedNode] = Field(description="Extracted knowledge graph nodes (8-15 nodes)")
    edges: list[ExtractedEdge] = Field(
        description="Extracted directed edges connecting src_name -> dst_name from the nodes list (MUST NOT be empty when nodes are related)"
    )


async def _call_graph_llm(prompt: str) -> GraphExtraction:
    interaction = await _client().aio.interactions.create(
        model=settings.chat_model,
        system_instruction=EXTRACTION_SYSTEM_PROMPT,
        input=[{"type": "text", "text": prompt}],
        response_format={
            "type": "text",
            "mime_type": "application/json",
            "schema": GraphExtraction.model_json_schema(),
        },
        store=False,
        stream=False,
    )
    raw = interaction.output_text  # pyright: ignore[reportAttributeAccessIssue]
    if not raw:
        return GraphExtraction(nodes=[], edges=[])
    return GraphExtraction.model_validate_json(raw)


def _build_extraction_prompt(filename: str, chunks: list[dict[str, Any]], max_chars: int = 24000) -> str:
    parts = [f"Document: {filename}\n"]
    used = 0
    for c in chunks:
        block = f"--- CHUNK_ID: {c['chunk_id']} (Heading: {c.get('heading_path') or 'root'}) ---\n{c['text']}\n"
        if used + len(block) > max_chars and len(parts) > 1:
            break
        parts.append(block)
        used += len(block)
    return "\n".join(parts)


async def extract_and_sync_document_graph(
    project_uuid: str,
    doc_uuid: str,
    user_uuid: str | None,
    filename: str,
    chunks: list[dict[str, Any]],
) -> dict[str, Any]:
    global _AURA_SCHEMA_INITIALIZED
    if not chunks:
        return {"nodes_processed": 0, "edges_processed": 0, "synced": 0}

    valid_chunk_ids = {str(c["chunk_id"]) for c in chunks}
    default_chunk_id = str(chunks[0]["chunk_id"])

    prompt = _build_extraction_prompt(filename, chunks)
    try:
        extracted = await _call_graph_llm(prompt)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Graph LLM extraction failed for %s: %s", filename, exc)
        return {"nodes_processed": 0, "edges_processed": 0, "synced": 0}

    name_to_uuid: dict[str, str] = {}
    batch_created_uuids: set[str] = set()
    nodes_processed = 0

    for node in extracted.nodes:
        cid = node.chunk_id if node.chunk_id in valid_chunk_ids else default_chunk_id
        ev = [{"kind": "chunk", "ref": cid, "doc_uuid": str(doc_uuid), "excerpt": node.excerpt[:300]}]
        node_status = node.status
        if node.type == "Question" and node_status not in ("open", "resolved"):
            node_status = "open"
        elif node.type != "Question" and node_status == "resolved":
            node_status = "agreed"

        try:
            res = await create_or_merge_node(
                project_uuid=str(project_uuid),
                node_type=node.type,
                name=node.name,
                summary=node.summary,
                body_text=node.description,
                aliases=node.aliases,
                status=node_status,
                created_by=str(user_uuid) if user_uuid else None,
                evidence=ev,
                action="check",
            )
            if res["status"] == "duplicate_candidates" and res.get("candidates"):
                top_cand = res["candidates"][0]
                top_uuid = str(top_cand["node_uuid"])
                # Merge if exact name/alias match, or if similarity match is from an earlier document (not same batch)
                if res.get("match_kind") == "exact" or top_uuid not in batch_created_uuids:
                    merged = await create_or_merge_node(
                        project_uuid=str(project_uuid),
                        node_type=node.type,
                        name=node.name,
                        summary=node.summary,
                        body_text=node.description,
                        aliases=node.aliases,
                        status=node_status,
                        created_by=str(user_uuid) if user_uuid else None,
                        evidence=ev,
                        action="merge_into",
                        merge_into_uuid=top_uuid,
                    )
                    node_uuid = str(merged["node_uuid"])
                else:
                    created = await create_or_merge_node(
                        project_uuid=str(project_uuid),
                        node_type=node.type,
                        name=node.name,
                        summary=node.summary,
                        body_text=node.description,
                        aliases=node.aliases,
                        status=node_status,
                        created_by=str(user_uuid) if user_uuid else None,
                        evidence=ev,
                        action="create_new",
                    )
                    node_uuid = str(created["node_uuid"])
                    batch_created_uuids.add(node_uuid)
            else:
                node_uuid = str(res["node_uuid"])
                batch_created_uuids.add(node_uuid)

            name_to_uuid[node.name.strip().lower()] = node_uuid
            for alias in node.aliases:
                if alias.strip():
                    name_to_uuid[alias.strip().lower()] = node_uuid
            nodes_processed += 1
        except Exception as exc:  # noqa: BLE001
            logger.warning("Skipping extracted node %r: %s", node.name, exc)

    edges_processed = 0
    for edge in extracted.edges:
        src_uuid = name_to_uuid.get(edge.src_name.strip().lower())
        dst_uuid = name_to_uuid.get(edge.dst_name.strip().lower())
        if not src_uuid or not dst_uuid or src_uuid == dst_uuid:
            continue

        cid = edge.chunk_id if edge.chunk_id in valid_chunk_ids else default_chunk_id
        ev = [{"kind": "chunk", "ref": cid, "doc_uuid": str(doc_uuid), "excerpt": edge.excerpt[:300]}]
        scope: Literal["full", "partial"] | None = None
        aspects = list(edge.aspects or [])
        if edge.type == "SUPERSEDES":
            scope = "partial" if edge.scope == "partial" and aspects else "full"

        try:
            await create_edge(
                project_uuid=str(project_uuid),
                src_node=src_uuid,
                dst_node=dst_uuid,
                edge_type=edge.type,
                kind=edge.kind.strip() or None,
                scope=scope,
                aspects=aspects,
                actor_user=str(user_uuid) if user_uuid else None,
                evidence=ev,
            )
            edges_processed += 1
        except Exception as exc:  # noqa: BLE001
            logger.warning("Skipping extracted edge %r -> %r: %s", edge.src_name, edge.dst_name, exc)

    synced_count = 0
    try:
        if not _AURA_SCHEMA_INITIALIZED:
            await init_aura_schema()
            _AURA_SCHEMA_INITIALIZED = True
        sync_res = await sync_project_to_aura(str(project_uuid))
        synced_count = int(sync_res.get("applied", 0))
    except AuraUnavailableError:
        # Changes remain safely in Postgres `graph_changes` for next sync
        pass

    return {
        "nodes_processed": nodes_processed,
        "edges_processed": edges_processed,
        "synced": synced_count,
    }
