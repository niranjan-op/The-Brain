"""Graph-RAG context assembly, exact node vector search, bounded tool follow-up loop,
and two-phase structured-citation answer synthesis (D003, D007, D017, D019, D022, D023)."""
from __future__ import annotations

import json
import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field
from sqlalchemy import text

from src.kc.core.config import settings
from src.kc.core.db import SessionLocal
from src.kc.core.llm import client as _client
from src.kc.modules.chat.prompts import AGENT_ANSWER_SYSTEM_PROMPT, AGENT_TOOL_SYSTEM_PROMPT
from src.kc.modules.graph import read_tools
from src.kc.modules.ingestion.embedder import EMBED_DIMS, embed_query
from src.kc.modules.search.hybrid import search_chunks

MAX_CONTEXT_CHARS = 24000
MAX_TOOL_CALLS_PER_TURN = 4

SYNTHESIS_SYSTEM_PROMPT = AGENT_ANSWER_SYSTEM_PROMPT


class GroundedAnswer(BaseModel):
    answer: str = Field(description="Grounded answer synthesized from the retrieved chunks and knowledge graph")
    cited_chunk_ids: list[str] = Field(
        default_factory=list,
        description="Exact chunk_ids from the shown context that support the answer",
    )
    cited_node_uuids: list[str] = Field(
        default_factory=list,
        description="Exact node_uuids from the shown graph context that support the answer",
    )


TOOL_DECLARATIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "search_chunks",
        "description": "Run hybrid (BM25 + HNSW + RRF) search over the project's document chunks for a specific follow-up query.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query for document chunks"},
                "k": {"type": "integer", "description": "Number of chunks to retrieve (1-10)", "default": 5},
            },
            "required": ["query"],
        },
    },
    {
        "type": "function",
        "name": "search_nodes",
        "description": "Search knowledge graph nodes by semantic vector similarity and expand 1-hop relationships.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Concept, decision, or module to search in graph nodes"},
                "k": {"type": "integer", "description": "Number of seed nodes to retrieve (1-10)", "default": 5},
            },
            "required": ["query"],
        },
    },
    {
        "type": "function",
        "name": "get_node_neighbours",
        "description": "Fetch 1-hop incoming and outgoing relationships and neighbour nodes for a specific node_uuid.",
        "parameters": {
            "type": "object",
            "properties": {
                "node_uuid": {"type": "string", "description": "UUID of the graph node"},
            },
            "required": ["node_uuid"],
        },
    },
    {
        "type": "function",
        "name": "get_why_decision",
        "description": "Fetch the rationale, supporting evidence excerpts, and related nodes for a Decision node_uuid.",
        "parameters": {
            "type": "object",
            "properties": {
                "node_uuid": {"type": "string", "description": "UUID of the Decision node"},
            },
            "required": ["node_uuid"],
        },
    },
    {
        "type": "function",
        "name": "get_path_between",
        "description": "Find the shortest path (up to 5 hops) between two node_uuids in the project's knowledge graph.",
        "parameters": {
            "type": "object",
            "properties": {
                "start_node_uuid": {"type": "string", "description": "Start node UUID"},
                "end_node_uuid": {"type": "string", "description": "End node UUID"},
            },
            "required": ["start_node_uuid", "end_node_uuid"],
        },
    },
    {
        "type": "function",
        "name": "get_superseded_by",
        "description": "Check which Decision node(s) supersede a given node_uuid (full or partial scope).",
        "parameters": {
            "type": "object",
            "properties": {
                "node_uuid": {"type": "string", "description": "UUID of the node to check"},
            },
            "required": ["node_uuid"],
        },
    },
    {
        "type": "function",
        "name": "get_open_questions",
        "description": "List all currently open Question nodes in the project's knowledge graph.",
        "parameters": {"type": "object", "properties": {}},
    },
]


async def search_nodes_by_vector(
    session: Any,
    project_uuid: str,
    query_embedding: list[float],
    allowed_ids: set[str],
    k_nodes: int = 5,
) -> list[tuple[str, float]]:
    """Exact cosine distance scan over `nodes` in `project_uuid` filtered to `allowed_ids`.
    Accepts `embed_model IS NULL` and `dims IS NULL` so pre-migration nodes remain searchable."""
    if not allowed_ids or k_nodes <= 0:
        return []
    p_str = str(uuid.UUID(str(project_uuid)))
    allowed_list = [str(uuid.UUID(str(nid))) for nid in allowed_ids]

    rows = (
        await session.execute(
            text(
                """
                SELECT node_uuid, 1 - (embedding <=> CAST(:vec AS vector)) AS similarity
                FROM nodes
                WHERE project_uuid = :p
                  AND embedding IS NOT NULL
                  AND (embed_model IS NULL OR embed_model = :model)
                  AND (dims IS NULL OR dims = :dims)
                  AND node_uuid = ANY(CAST(:allowed AS uuid[]))
                ORDER BY embedding <=> CAST(:vec AS vector) ASC
                LIMIT :k
                """
            ),
            {
                "p": p_str,
                "vec": str(query_embedding),
                "model": settings.embed_model,
                "dims": EMBED_DIMS,
                "allowed": allowed_list,
                "k": int(k_nodes),
            },
        )
    ).all()
    return [(str(r.node_uuid), float(r.similarity)) for r in rows]


async def _find_chunk_linked_nodes(
    session: Any,
    project_uuid: str,
    chunks: list[dict[str, Any]],
    allowed_ids: set[str],
) -> list[str]:
    """Collect `node_uuid`s linked to the retrieved chunks via `chunks.node_uuid` or `node_evidence`,
    explicitly intersected with `allowed_ids`."""
    if not chunks or not allowed_ids:
        return []
    direct = [str(c["node_uuid"]) for c in chunks if c.get("node_uuid") and str(c["node_uuid"]) in allowed_ids]
    chunk_ids = [str(c["chunk_id"]) for c in chunks]
    rows = (
        await session.execute(
            text(
                """
                SELECT DISTINCT ne.node_uuid
                FROM node_evidence ne
                JOIN evidence e ON e.id = ne.evidence_id
                WHERE e.project_uuid = :p
                  AND e.kind = 'chunk'
                  AND e.ref = ANY(:cids)
                  AND ne.node_uuid IS NOT NULL
                """
            ),
            {"p": str(project_uuid), "cids": chunk_ids},
        )
    ).scalars().all()
    evidenced = [str(nid) for nid in rows if str(nid) in allowed_ids]
    return list(dict.fromkeys([*direct, *evidenced]))


def format_context_within_budget(
    chunks: list[dict[str, Any]],
    graph: dict[str, Any],
    tool_outputs: list[dict[str, Any]] | None = None,
    max_chars: int = MAX_CONTEXT_CHARS,
    doc_names: dict[str, str] | None = None,
) -> str:
    """Assemble retrieved chunks, seed nodes, relationships, neighbour nodes, and tool outputs
    within `max_chars`, prioritizing chunks and seed nodes first.

    Each chunk header carries a ready-made human `cite_as` reference (filename, page, paragraph)
    so the model cites what the user can see instead of internal identifiers."""
    from src.kc.modules.chat.citations import format_page_paragraph_label

    names = doc_names or {}
    sections: list[str] = []
    used = 0

    def _try_append(block: str) -> bool:
        nonlocal used
        if used + len(block) > max_chars and sections:
            return False
        sections.append(block)
        used += len(block)
        return True

    if chunks:
        _try_append("=== RETRIEVED DOCUMENT CHUNKS ===")
        for c in chunks:
            heading = c.get("heading_path") or "root"
            p_start = c.get("page_start") or 1
            p_end = c.get("page_end") or p_start
            pages = f"{p_start}-{p_end}"
            payload = c.get("payload") or {}
            para_s = c.get("para_start") or payload.get("para_start") or (int(c.get("ordinal") or 0) + 1)
            para_e = c.get("para_end") or payload.get("para_end") or para_s
            paras = f"{para_s}-{para_e}"
            filename = c.get("filename") or names.get(str(c.get("doc_uuid"))) or "source document"
            cite_as = f"({filename}, {format_page_paragraph_label(c)[0]})"
            block = (
                f"[CHUNK chunk_id={c['chunk_id']} doc_uuid={c['doc_uuid']} source={filename!r} "
                f"heading={heading!r} pages={pages} paragraphs={paras} cite_as={cite_as!r}]\n{c['text']}\n"
            )
            if not _try_append(block):
                break

    nodes = graph.get("nodes") or []
    rels = graph.get("relationships") or []
    ev_by_node = graph.get("evidence_by_node") or {}

    if nodes:
        _try_append("\n=== SYNTHESIZED ARCHITECTURAL CONTEXT (Backed by Document Chunks) ===")
        # Seeds are already ordered first by expand_subgraph
        for n in nodes:
            nid = n["node_uuid"]
            evs = ev_by_node.get(nid) or n.get("evidence") or []
            ev_text = "; ".join(
                f"(source_chunk_id={e['ref']} doc_uuid={e.get('doc_uuid')}) {e.get('excerpt') or ''}"
                for e in evs[:3]
            )
            desc = n.get("text") or n.get("summary") or "(summary omitted due to mixed source selection)"
            block = (
                f"[NODE node_uuid={nid} type={n['type']} layer={n.get('layer')} "
                f"name={n['name']!r} status={n.get('status')} seed={n.get('is_seed', False)}]\n"
                f"Description: {desc}\n"
                + (f"Source Document Evidence: {ev_text}\n" if ev_text else "")
            )
            if not _try_append(block):
                break

    if rels:
        _try_append("\n=== KNOWLEDGE GRAPH RELATIONSHIPS ===")
        for r in rels:
            scope_str = f" scope={r['scope']} aspects={r.get('aspects')}" if r.get("scope") else ""
            line = f"[EDGE {r['src_node']} -[{r['edge_type']}{scope_str}]-> {r['dst_node']}]"
            if not _try_append(line):
                break

    if tool_outputs:
        _try_append("\n=== FOLLOW-UP TOOL OUTPUTS ===")
        for item in tool_outputs:
            result = item.get("result")
            is_empty_result = (
                result == []
                or (
                    isinstance(result, dict)
                    and not result.get("nodes")
                    and not result.get("relationships")
                    and set(result.keys()).issubset({"nodes", "relationships"})
                )
            )
            rendered_result = "(no matching records found)" if is_empty_result else json.dumps(result)
            block = (
                f'<tool_output name="{item["tool"]}" args={json.dumps(item["args"])}>\n'
                f"{rendered_result}\n"
                "</tool_output>\n"
            )
            if not _try_append(block):
                break

    return "\n".join(sections)


async def retrieve_context(
    project_uuid: str,
    query: str,
    excluded_docs: list[str] | None = None,
    convo_uuid: str | None = None,
    k_chunks: int = 8,
    k_nodes: int = 5,
    search_mode: Literal["hybrid", "vector", "keyword"] = "hybrid",
    use_graph: bool = True,
) -> dict[str, Any]:
    """Run deterministic initial retrieval:
    1. Embed query once (when needed by chunk vector/hybrid search or graph node vector search).
    2. Retrieve top-`k_chunks` via `search_chunks`.
    3. If `use_graph=True`, resolve `allowed_ids`, search `nodes.embedding`, intersect chunk-linked
       nodes with `allowed_ids`, and expand 1-hop subgraph with seed-first caps and Postgres hydration."""
    clean_q = query.strip()
    if not clean_q:
        raise ValueError("Query must not be empty")

    needs_embedding = (search_mode in ("hybrid", "vector")) or use_graph
    q_emb = await embed_query(clean_q) if needs_embedding else None
    embed_queries = 1 if needs_embedding else 0

    async with SessionLocal() as session:
        chunks = await search_chunks(
            session,
            project_uuid,
            clean_q,
            query_embedding=q_emb,
            k=k_chunks,
            excluded_docs=excluded_docs,
            search_mode=search_mode,
        )

        if not use_graph:
            return {
                "chunks": chunks,
                "graph": {
                    "nodes": [],
                    "relationships": [],
                    "evidence_by_node": {},
                    "graph_source": "none",
                },
                "embed_queries": embed_queries,
            }

        allowed_ids = await read_tools.get_allowed_node_ids(
            project_uuid,
            excluded_docs=excluded_docs,
            convo_uuid=convo_uuid,
        )
        assert q_emb is not None
        vec_node_hits = await search_nodes_by_vector(
            session,
            project_uuid,
            q_emb,
            allowed_ids=allowed_ids,
            k_nodes=k_nodes,
        )
        vec_seeds = [nid for nid, _ in vec_node_hits if nid in allowed_ids]
        chunk_seeds = await _find_chunk_linked_nodes(session, project_uuid, chunks, allowed_ids)

    # Explicit intersection with allowed_ids + strict seed cap: vector seeds first, then chunk-linked seeds
    max_seeds = min(k_nodes * 2, read_tools.MAX_SUBGRAPH_NODES)
    seed_node_uuids = [
        nid
        for nid in dict.fromkeys([*vec_seeds, *chunk_seeds])
        if nid in allowed_ids
    ][:max_seeds]

    subgraph = await read_tools.expand_subgraph(
        project_uuid=project_uuid,
        seed_node_uuids=seed_node_uuids,
        excluded_docs=excluded_docs,
        convo_uuid=convo_uuid,
    )

    return {
        "chunks": chunks,
        "graph": subgraph,
        "embed_queries": embed_queries,
    }


async def _call_tool_turn(prompt_text: str, tools: list[dict[str, Any]]) -> dict[str, Any]:
    """Execute one tool-enabled interaction turn WITHOUT `response_format` JSON schema."""
    interaction = await _client().aio.interactions.create(
        model=settings.chat_model,
        system_instruction=AGENT_TOOL_SYSTEM_PROMPT,
        input=[{"type": "text", "text": prompt_text}],
        tools=tools,  # pyright: ignore[reportArgumentType]
        store=False,
        stream=False,
    )
    tool_calls: list[dict[str, Any]] = []
    for out in getattr(interaction, "outputs", None) or []:
        if getattr(out, "type", None) == "function_call":
            args = getattr(out, "arguments", {}) or {}
            if isinstance(args, str):
                args = json.loads(args)
            tool_calls.append({"name": getattr(out, "name", ""), "args": dict(args)})
    return {
        "tool_calls": tool_calls,
        "text": getattr(interaction, "output_text", "") or "",
    }


async def _call_structured_answer(prompt_text: str) -> GroundedAnswer:
    """Final no-tools synthesis call carrying the `GroundedAnswer` structured output schema."""
    interaction = await _client().aio.interactions.create(
        model=settings.chat_model,
        system_instruction=SYNTHESIS_SYSTEM_PROMPT,
        input=[{"type": "text", "text": prompt_text}],
        response_format={
            "type": "text",
            "mime_type": "application/json",
            "schema": GroundedAnswer.model_json_schema(),
        },
        store=False,
        stream=False,
    )
    raw = getattr(interaction, "output_text", "") or ""
    if not raw:
        return GroundedAnswer(answer="", cited_chunk_ids=[], cited_node_uuids=[])
    return GroundedAnswer.model_validate_json(raw)


def _collect_shown_ids_from_tool_result(
    tool_name: str,
    result: Any,
    shown_chunk_ids: set[str],
    shown_node_uuids: set[str],
) -> None:
    """Record any `chunk_id` or `node_uuid` returned by a follow-up tool into the shown sets."""
    if isinstance(result, dict):
        if "chunk_id" in result and result["chunk_id"]:
            shown_chunk_ids.add(str(result["chunk_id"]))
        if "node_uuid" in result and result["node_uuid"]:
            shown_node_uuids.add(str(result["node_uuid"]))
        for v in result.values():
            _collect_shown_ids_from_tool_result(tool_name, v, shown_chunk_ids, shown_node_uuids)
    elif isinstance(result, list):
        for item in result:
            _collect_shown_ids_from_tool_result(tool_name, item, shown_chunk_ids, shown_node_uuids)


async def _execute_bound_tool(
    name: str,
    args: dict[str, Any],
    *,
    project_uuid: str,
    excluded_docs: list[str] | None,
    convo_uuid: str | None,
    search_mode: Literal["hybrid", "vector", "keyword"],
) -> tuple[Any, int]:
    """Execute a read-only tool with `project_uuid` and `excluded_docs` strictly bound server-side.
    Returns `(tool_result, extra_embed_queries)`."""
    if name == "search_chunks":
        q = str(args.get("query") or "").strip()
        k = max(1, min(int(args.get("k", 5)), 10))
        if not q:
            return [], 0
        async with SessionLocal() as session:
            rows = await search_chunks(
                session,
                project_uuid,
                q,
                k=k,
                excluded_docs=excluded_docs,
                search_mode=search_mode,
            )
        return rows, (1 if search_mode in ("hybrid", "vector") else 0)

    if name == "search_nodes":
        q = str(args.get("query") or "").strip()
        k = max(1, min(int(args.get("k", 5)), 10))
        if not q:
            return {"nodes": [], "relationships": []}, 0
        q_emb = await embed_query(q)
        allowed_ids = await read_tools.get_allowed_node_ids(project_uuid, excluded_docs, convo_uuid=convo_uuid)
        async with SessionLocal() as session:
            hits = await search_nodes_by_vector(session, project_uuid, q_emb, allowed_ids, k_nodes=k)
        sub = await read_tools.expand_subgraph(
            project_uuid,
            [nid for nid, _ in hits],
            excluded_docs=excluded_docs,
            convo_uuid=convo_uuid,
        )
        return sub, 1

    if name == "get_node_neighbours":
        nid = str(args.get("node_uuid") or "")
        return await read_tools.neighbours(project_uuid, nid, excluded_docs=excluded_docs), 0

    if name == "get_why_decision":
        nid = str(args.get("node_uuid") or "")
        return await read_tools.why_decision(project_uuid, nid, excluded_docs=excluded_docs), 0

    if name == "get_path_between":
        s_id = str(args.get("start_node_uuid") or "")
        e_id = str(args.get("end_node_uuid") or "")
        return await read_tools.path_between(project_uuid, s_id, e_id, excluded_docs=excluded_docs), 0

    if name == "get_superseded_by":
        nid = str(args.get("node_uuid") or "")
        return await read_tools.superseded_by(project_uuid, nid, excluded_docs=excluded_docs), 0

    if name == "get_open_questions":
        return await read_tools.open_questions(project_uuid, excluded_docs=excluded_docs), 0

    return {"error": f"Unknown tool: {name}"}, 0


async def retrieve_and_answer(
    project_uuid: str,
    query: str,
    excluded_docs: list[str] | None = None,
    convo_uuid: str | None = None,
    k_chunks: int = 8,
    k_nodes: int = 5,
    search_mode: Literal["hybrid", "vector", "keyword"] = "hybrid",
    use_graph: bool = True,
    use_tools: bool = True,
    generate_answer: bool = True,
    max_tool_calls: int = MAX_TOOL_CALLS_PER_TURN,
) -> dict[str, Any]:
    """Full Graph-RAG pipeline:
    1. Deterministic initial retrieval (`retrieve_context`).
    2. Optional bounded tool-calling loop (`use_tools=True`, capped at `max_tool_calls`) WITHOUT structured schema.
    3. Final no-tools call carrying `GroundedAnswer` JSON schema.
    4. Strict citation verification against `shown_chunk_ids` and `shown_node_uuids`."""
    ctx = await retrieve_context(
        project_uuid=project_uuid,
        query=query,
        excluded_docs=excluded_docs,
        convo_uuid=convo_uuid,
        k_chunks=k_chunks,
        k_nodes=k_nodes,
        search_mode=search_mode,
        use_graph=use_graph,
    )
    chunks: list[dict[str, Any]] = ctx["chunks"]
    graph: dict[str, Any] = ctx["graph"]
    embed_queries: int = int(ctx.get("embed_queries", 0))

    shown_chunk_ids: set[str] = {str(c["chunk_id"]) for c in chunks}
    shown_node_uuids: set[str] = {str(n["node_uuid"]) for n in (graph.get("nodes") or [])}

    if not generate_answer:
        return {
            "answer": None,
            "citations": {"chunk_ids": [], "node_uuids": []},
            "rejected_citations": {"chunk_ids": [], "node_uuids": []},
            "chunks": chunks,
            "graph": graph,
            "metrics": {
                "embed_queries": embed_queries,
                "llm_calls": 0,
                "tool_calls_used": 0,
            },
        }

    tool_outputs: list[dict[str, Any]] = []
    tool_calls_used = 0
    llm_calls = 0

    if use_tools and max_tool_calls > 0:
        active_tools = (
            TOOL_DECLARATIONS
            if use_graph
            else [t for t in TOOL_DECLARATIONS if t["name"] == "search_chunks"]
        )
        while tool_calls_used < max_tool_calls:
            context_str = format_context_within_budget(chunks, graph, tool_outputs=tool_outputs)
            turn_prompt = f"User Question: {query}\n\n{context_str}"
            turn_res = await _call_tool_turn(turn_prompt, active_tools)
            llm_calls += 1
            requested_calls = turn_res.get("tool_calls") or []
            if not requested_calls:
                break
            for call in requested_calls:
                if tool_calls_used >= max_tool_calls:
                    break
                t_name = str(call.get("name") or "")
                t_args = dict(call.get("args") or {})
                t_result, extra_embeds = await _execute_bound_tool(
                    t_name,
                    t_args,
                    project_uuid=project_uuid,
                    excluded_docs=excluded_docs,
                    convo_uuid=convo_uuid,
                    search_mode=search_mode,
                )
                embed_queries += extra_embeds
                tool_calls_used += 1
                _collect_shown_ids_from_tool_result(t_name, t_result, shown_chunk_ids, shown_node_uuids)
                tool_outputs.append({"tool": t_name, "args": t_args, "result": t_result})

    final_context_str = format_context_within_budget(chunks, graph, tool_outputs=tool_outputs)
    final_prompt = f"User Question: {query}\n\n{final_context_str}"
    structured = await _call_structured_answer(final_prompt)
    llm_calls += 1

    # Strict context-shown citation validation: cited IDs MUST be a subset of IDs actually shown this turn
    accepted_chunks: list[str] = []
    rejected_chunks: list[str] = []
    for cid in dict.fromkeys(structured.cited_chunk_ids):
        if cid in shown_chunk_ids:
            accepted_chunks.append(cid)
        else:
            rejected_chunks.append(cid)

    accepted_nodes: list[str] = []
    rejected_nodes: list[str] = []
    for nid in dict.fromkeys(structured.cited_node_uuids):
        if nid in shown_node_uuids:
            accepted_nodes.append(nid)
        else:
            rejected_nodes.append(nid)

    return {
        "answer": structured.answer,
        "citations": {
            "chunk_ids": accepted_chunks,
            "node_uuids": accepted_nodes,
        },
        "rejected_citations": {
            "chunk_ids": rejected_chunks,
            "node_uuids": rejected_nodes,
        },
        "chunks": chunks,
        "graph": graph,
        "metrics": {
            "embed_queries": embed_queries,
            "llm_calls": llm_calls,
            "tool_calls_used": tool_calls_used,
        },
    }

