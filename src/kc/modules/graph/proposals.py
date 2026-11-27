"""Chat-to-Decision graph proposals with mandatory human approval gate (D017, T089)."""
from __future__ import annotations

import logging
from typing import Any, Literal

from pydantic import BaseModel, Field

from src.kc.core.llm import call_with_retries, client as _managed_client
from src.kc.modules.chat.byok import resolve_model_name
from src.kc.modules.graph.aura import AuraUnavailableError
from src.kc.modules.graph.gateway import (
    ALLOWED_EDGE_TYPES,
    ALLOWED_NODE_TYPES,
    create_edge,
    create_or_merge_node,
)
from src.kc.modules.graph.read_tools import invalidate_allowed_nodes_cache
from src.kc.modules.graph.sync import sync_project_to_aura

logger = logging.getLogger(__name__)

PROPOSAL_SYSTEM_PROMPT = """\
Extract candidate architectural Knowledge Graph updates (Decisions, Questions, Alternatives,
Requirements, Constraints) discussed in the conversation excerpt.
Only propose items clearly stated in the text and include a verbatim quote for each.
"""


class ProposedNode(BaseModel):
    name: str = Field(description="Short canonical entity title (2-6 words)")
    type: Literal["Decision", "Alternative", "Constraint", "Requirement", "Assumption", "Question", "Module", "DataStore"]
    status: Literal["open", "agreed", "deferred", "rejected", "superseded", "resolved"] = "agreed"
    summary: str = Field(description="One-sentence summary of the entity")
    description: str = Field(default="", description="Detailed rationale or context")
    quote: str = Field(description="Verbatim excerpt from the chat message supporting this proposal")
    aliases: list[str] = Field(default_factory=list)


class ProposedEdge(BaseModel):
    src_name: str
    dst_name: str
    type: str = Field(description="Graph Schema v1.1 edge type (e.g., JUSTIFIES, SUPERSEDES, RESOLVES, REJECTED_FOR)")
    scope: Literal["full", "partial", "none"] = "none"
    aspects: list[str] = Field(default_factory=list)
    quote: str = Field(default="")


class ProposalExtraction(BaseModel):
    nodes: list[ProposedNode] = Field(default_factory=list)
    edges: list[ProposedEdge] = Field(default_factory=list)


async def propose_from_conversation(
    *,
    project_uuid: str,
    convo_uuid: str,
    transcript_text: str,
    llm_client: Any = None,
    model: str | None = None,
) -> dict[str, Any]:
    """Extract candidate nodes and edges from chat text WITHOUT writing to Postgres or Aura (T089)."""
    clean_text = transcript_text.strip()
    if not clean_text:
        raise ValueError("Conversation text must not be empty")

    client_to_use = llm_client or _managed_client()
    resolved_model = resolve_model_name(model)

    async def _call() -> Any:
        return await client_to_use.aio.interactions.create(
            model=resolved_model,
            system_instruction=PROPOSAL_SYSTEM_PROMPT,
            input=[{"type": "text", "text": clean_text}],
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": ProposalExtraction.model_json_schema(),
            },
            store=False,
            stream=False,
        )

    interaction = await call_with_retries(_call)
    raw = getattr(interaction, "output_text", "") or ""
    parsed = ProposalExtraction.model_validate_json(raw) if raw else ProposalExtraction()
    return {
        "project_uuid": str(project_uuid),
        "convo_uuid": str(convo_uuid),
        "proposed_nodes": [n.model_dump() for n in parsed.nodes],
        "proposed_edges": [e.model_dump() for e in parsed.edges if e.type in ALLOWED_EDGE_TYPES],
    }


async def approve_graph_proposal(
    *,
    project_uuid: str,
    user_uuid: str,
    convo_uuid: str | None = None,
    message_uuid: str | None = None,
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Commit user-approved chat proposals with `kind='chat'` evidence and sync to Aura."""
    ref_str = f"convo:{convo_uuid or 'manual'}:msg:{message_uuid or 'approved'}"
    created_nodes: list[dict[str, Any]] = []
    name_to_uuid: dict[str, str] = {}

    for node in nodes:
        n_type = str(node.get("type") or "Decision")
        if n_type not in ALLOWED_NODE_TYPES:
            continue
        name = str(node.get("name") or "").strip()
        if not name:
            continue
        quote = str(node.get("quote") or node.get("summary") or name)[:300]
        ev = [{"kind": "chat", "ref": ref_str, "excerpt": quote}]

        res = await create_or_merge_node(
            project_uuid=str(project_uuid),
            node_type=n_type,
            name=name,
            summary=str(node.get("summary") or quote),
            body_text=str(node.get("description") or node.get("summary") or quote),
            aliases=list(node.get("aliases") or []),
            status=node.get("status"),
            created_by=str(user_uuid),
            convo_uuid=str(convo_uuid) if convo_uuid else None,
            evidence=ev,
            action="create_new" if node.get("force_new") else "check",
        )
        if res.get("status") == "duplicate_candidates" and res.get("candidates"):
            target_uuid = str(res["candidates"][0]["node_uuid"])
            res = await create_or_merge_node(
                project_uuid=str(project_uuid),
                node_type=n_type,
                name=name,
                summary=str(node.get("summary") or quote),
                body_text=str(node.get("description") or node.get("summary") or quote),
                aliases=list(node.get("aliases") or []),
                status=node.get("status"),
                created_by=str(user_uuid),
                convo_uuid=str(convo_uuid) if convo_uuid else None,
                evidence=ev,
                action="merge_into",
                merge_into_uuid=target_uuid,
            )
        node_uuid = str(res["node_uuid"])
        name_to_uuid[name.lower()] = node_uuid
        created_nodes.append({"name": name, "node_uuid": node_uuid, "result": res.get("status")})

    created_edges: list[dict[str, Any]] = []
    for edge in edges or []:
        e_type = str(edge.get("type") or "")
        if e_type not in ALLOWED_EDGE_TYPES:
            continue
        src_uuid = str(edge.get("src_uuid") or name_to_uuid.get(str(edge.get("src_name") or "").strip().lower()) or "")
        dst_uuid = str(edge.get("dst_uuid") or name_to_uuid.get(str(edge.get("dst_name") or "").strip().lower()) or "")
        if not src_uuid or not dst_uuid or src_uuid == dst_uuid:
            continue
        scope: Literal["full", "partial"] | None = None
        aspects = [str(a) for a in (edge.get("aspects") or []) if str(a).strip()]
        if e_type == "SUPERSEDES":
            scope = "partial" if edge.get("scope") == "partial" and aspects else "full"
        quote = str(edge.get("quote") or f"{e_type} approved from chat")[:300]
        edge_res = await create_edge(
            project_uuid=str(project_uuid),
            src_node=src_uuid,
            dst_node=dst_uuid,
            edge_type=e_type,
            scope=scope,
            aspects=aspects,
            actor_user=str(user_uuid),
            convo_uuid=str(convo_uuid) if convo_uuid else None,
            evidence=[{"kind": "chat", "ref": ref_str, "excerpt": quote}],
        )
        created_edges.append({"edge_uuid": edge_res.get("edge_uuid"), "type": e_type, "result": edge_res.get("status")})

    invalidate_allowed_nodes_cache(str(project_uuid))
    synced = 0
    try:
        sync_res = await sync_project_to_aura(str(project_uuid))
        synced = int(sync_res.get("applied", 0))
    except AuraUnavailableError:
        pass

    return {
        "nodes_committed": created_nodes,
        "edges_committed": created_edges,
        "aura_synced": synced,
    }
