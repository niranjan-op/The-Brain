"""Graph read tools with per-conversation source filtering, LRU allowed-ID cache,
subgraph-only hydration, and bounded 1-hop Postgres expansion (D017, D023, graph-schema-v1-1).

Fixed read tools only (`why_decision`, `open_questions`, `neighbours`, `path_between`,
`superseded_by`, `expand_subgraph`), never free-form Cypher. Node descriptions (`summary`, `text`)
and `evidence` are hydrated on demand from Postgres for only the requested node IDs.
"""
from __future__ import annotations

from collections import OrderedDict, deque
from collections.abc import Sequence
from typing import Any, Protocol

from sqlalchemy import text

from src.kc.core.db import SessionLocal

MAX_ALLOWED_CACHE_ENTRIES = 128
MAX_NEIGHBOURS_PER_SEED = 5
MAX_SUBGRAPH_NODES = 20

WHY_LAYER_EDGES = {
    "SUPERSEDES",
    "RESOLVES",
    "JUSTIFIES",
    "SATISFIES",
    "RELIES_ON",
    "REJECTED_FOR",
}

# LRU cache: key = (project_uuid, convo_uuid_or_empty) -> (fingerprint_tuple, set_of_allowed_node_uuids)
_ALLOWED_NODE_IDS_CACHE: OrderedDict[tuple[str, str], tuple[tuple[Any, ...], set[str]]] = OrderedDict()


def invalidate_allowed_nodes_cache(project_uuid: str | None = None) -> None:
    """Clear cached allowed node ID sets (all projects if `project_uuid` is None, else that project)."""
    if project_uuid is None:
        _ALLOWED_NODE_IDS_CACHE.clear()
        return
    p_str = str(project_uuid)
    keys_to_remove = [k for k in _ALLOWED_NODE_IDS_CACHE if k[0] == p_str]
    for k in keys_to_remove:
        _ALLOWED_NODE_IDS_CACHE.pop(k, None)


def _is_node_allowed(
    doc_uuids: Sequence[str | None],
    excluded_set: set[str],
    active_doc_uuids: Sequence[str | None] | None = None,
) -> bool:
    """A node is excluded if it has document evidence and ALL its active document evidence is in `excluded_set`
    (or soft-deleted). Nodes with only chat/url/commit evidence (`doc_uuids` empty) remain visible."""
    non_null_docs = [str(d) for d in (doc_uuids or []) if d is not None]
    if not non_null_docs:
        return True  # chat/url/commit evidence or unlinked node remains visible
    active_docs = (
        [str(d) for d in non_null_docs if d is not None]
        if active_doc_uuids is None
        else [str(d) for d in active_doc_uuids if d is not None]
    )
    if not active_docs:
        return False  # all supporting documents were soft-deleted
    if not excluded_set:
        return True
    return any(d not in excluded_set for d in active_docs)


async def get_allowed_node_ids(
    project_uuid: str,
    excluded_docs: list[str] | None = None,
    convo_uuid: str | None = None,
) -> set[str]:
    """Return the set of allowed `node_uuid`s for `project_uuid`, using an LRU cache invalidated by
    graph changes, document additions/soft-deletions, evidence count changes, or `excluded_docs` changes."""
    p_str = str(project_uuid)
    c_key = str(convo_uuid or "")
    excluded_set = {str(d) for d in (excluded_docs or [])}
    excluded_frozen = frozenset(excluded_set)
    cache_key = (p_str, c_key)

    async with SessionLocal() as session:
        fp_row = (
            await session.execute(
                text(
                    """
                    SELECT
                        coalesce((SELECT max(change_id) FROM graph_changes WHERE project_uuid = :p), 0) AS max_change_id,
                        (SELECT count(*) FROM documents WHERE project_uuid = :p AND deleted_at IS NULL) AS active_doc_count,
                        coalesce((SELECT max(deleted_at)::text FROM documents WHERE project_uuid = :p), 'none') AS max_deleted_at,
                        (SELECT count(*) FROM node_evidence ne JOIN evidence e ON e.id = ne.evidence_id WHERE e.project_uuid = :p) AS ev_count
                    """
                ),
                {"p": p_str},
            )
        ).mappings().first()

        fingerprint = (
            excluded_frozen,
            fp_row["max_change_id"] if fp_row else None,
            fp_row["active_doc_count"] if fp_row else None,
            fp_row["max_deleted_at"] if fp_row else None,
            fp_row["ev_count"] if fp_row else None,
        )

        # Only use cache when fingerprint query returned real metadata (non-None)
        if fp_row is not None and cache_key in _ALLOWED_NODE_IDS_CACHE:
            cached_fp, cached_ids = _ALLOWED_NODE_IDS_CACHE[cache_key]
            if cached_fp == fingerprint:
                _ALLOWED_NODE_IDS_CACHE.move_to_end(cache_key)
                return set(cached_ids)

        rows = (
            await session.execute(
                text(
                    """
                    SELECT n.node_uuid,
                           coalesce(array_agg(e.doc_uuid) FILTER (WHERE e.doc_uuid IS NOT NULL), '{}') AS doc_uuids,
                           coalesce(array_agg(e.doc_uuid) FILTER (WHERE e.doc_uuid IS NOT NULL AND d.deleted_at IS NULL), '{}') AS active_doc_uuids
                    FROM nodes n
                    LEFT JOIN node_evidence ne ON ne.node_uuid = n.node_uuid
                    LEFT JOIN evidence e ON e.id = ne.evidence_id
                    LEFT JOIN documents d ON d.project_uuid = e.project_uuid AND d.doc_uuid = e.doc_uuid
                    WHERE n.project_uuid = :p
                    GROUP BY n.node_uuid
                    """
                ),
                {"p": p_str},
            )
        ).mappings().all()

    allowed_ids: set[str] = set()
    for r in rows:
        docs = [str(d) for d in (r.get("doc_uuids") or []) if d is not None]
        raw_active = r.get("active_doc_uuids")
        active_docs = None if raw_active is None else [str(d) for d in raw_active if d is not None]
        if _is_node_allowed(docs, excluded_set, active_docs):
            allowed_ids.add(str(r["node_uuid"]))

    if fp_row is not None:
        _ALLOWED_NODE_IDS_CACHE[cache_key] = (fingerprint, set(allowed_ids))
        _ALLOWED_NODE_IDS_CACHE.move_to_end(cache_key)
        while len(_ALLOWED_NODE_IDS_CACHE) > MAX_ALLOWED_CACHE_ENTRIES:
            _ALLOWED_NODE_IDS_CACHE.popitem(last=False)

    return allowed_ids


async def hydrate_nodes(
    session: Any,
    project_uuid: str,
    node_uuids: list[str],
    excluded_docs: list[str] | None = None,
) -> dict[str, dict[str, Any]]:
    """Hydrate `summary`, `text`, and metadata ONLY for the requested `node_uuids` in `project_uuid`.
    Enforces Rule 6 of graph-schema-v1-1: masks mixed-source `summary`/`text` when a node has evidence
    from both ticked and unticked (or soft-deleted) documents."""
    if not node_uuids:
        return {}
    unique_ids = list(dict.fromkeys(str(nid) for nid in node_uuids))
    excluded_set = {str(d) for d in (excluded_docs or [])}

    rows = (
        await session.execute(
            text(
                """
                SELECT n.node_uuid, n.type, n.role, n.layer, n.name, n.summary, n.text, n.status,
                       coalesce(array_agg(e.doc_uuid) FILTER (WHERE e.doc_uuid IS NOT NULL), '{}') AS doc_uuids,
                       coalesce(array_agg(e.doc_uuid) FILTER (WHERE e.doc_uuid IS NOT NULL AND d.deleted_at IS NULL), '{}') AS active_doc_uuids
                FROM nodes n
                LEFT JOIN node_evidence ne ON ne.node_uuid = n.node_uuid
                LEFT JOIN evidence e ON e.id = ne.evidence_id
                LEFT JOIN documents d ON d.project_uuid = e.project_uuid AND d.doc_uuid = e.doc_uuid
                WHERE n.project_uuid = :p
                  AND n.node_uuid = ANY(CAST(:nids AS uuid[]))
                GROUP BY n.node_uuid
                """
            ),
            {"p": str(project_uuid), "nids": unique_ids},
        )
    ).mappings().all()

    hydrated: dict[str, dict[str, Any]] = {}
    for r in rows:
        docs = [str(d) for d in (r.get("doc_uuids") or []) if d is not None]
        raw_active = r.get("active_doc_uuids")
        active_docs = docs if raw_active is None else [str(d) for d in raw_active if d is not None]
        if not _is_node_allowed(docs, excluded_set, active_docs):
            continue
        nid = str(r["node_uuid"])
        active_set = set(active_docs)
        has_soft_deleted_doc = any(d not in active_set for d in docs)
        has_mixed_sources = bool(has_soft_deleted_doc or (excluded_set and any(d in excluded_set for d in docs)))
        hydrated[nid] = {
            "node_uuid": nid,
            "type": r["type"],
            "role": r["role"],
            "layer": r["layer"],
            "name": r["name"],
            "summary": None if has_mixed_sources else r["summary"],
            "text": None if has_mixed_sources else r["text"],
            "status": r["status"],
        }
    return hydrated


async def _fetch_allowed_nodes(project_uuid: str, excluded_docs: list[str] | None = None) -> dict[str, dict[str, Any]]:
    """Hydrate all allowed nodes for tools like `open_questions` that inspect project-wide status."""
    excluded_set = {str(d) for d in (excluded_docs or [])}
    async with SessionLocal() as session:
        rows = (
            await session.execute(
                text(
                    """
                    SELECT n.node_uuid, n.type, n.role, n.layer, n.name, n.summary, n.text, n.status,
                           coalesce(array_agg(e.doc_uuid) FILTER (WHERE e.doc_uuid IS NOT NULL), '{}') AS doc_uuids,
                           coalesce(array_agg(e.doc_uuid) FILTER (WHERE e.doc_uuid IS NOT NULL AND d.deleted_at IS NULL), '{}') AS active_doc_uuids
                    FROM nodes n
                    LEFT JOIN node_evidence ne ON ne.node_uuid = n.node_uuid
                    LEFT JOIN evidence e ON e.id = ne.evidence_id
                    LEFT JOIN documents d ON d.project_uuid = e.project_uuid AND d.doc_uuid = e.doc_uuid
                    WHERE n.project_uuid = :p
                    GROUP BY n.node_uuid
                    """
                ),
                {"p": project_uuid},
            )
        ).mappings().all()

    allowed: dict[str, dict[str, Any]] = {}
    for r in rows:
        docs: list[str] = [str(d) for d in (r.get("doc_uuids") or []) if d is not None]
        raw_active = r.get("active_doc_uuids")
        active_docs = docs if raw_active is None else [str(d) for d in raw_active if d is not None]
        if _is_node_allowed(docs, excluded_set, active_docs):
            nid = str(r["node_uuid"])
            active_set = set(active_docs)
            has_soft_deleted_doc = any(d not in active_set for d in docs)
            has_mixed_sources = bool(has_soft_deleted_doc or (excluded_set and any(d in excluded_set for d in docs)))
            allowed[nid] = {
                "node_uuid": nid,
                "type": r["type"],
                "role": r["role"],
                "layer": r["layer"],
                "name": r["name"],
                "summary": None if has_mixed_sources else r["summary"],
                "text": None if has_mixed_sources else r["text"],
                "status": r["status"],
            }
    return allowed


class GraphReadBackend(Protocol):
    source_name: str

    async def get_edges_for_nodes(
        self,
        session: Any,
        project_uuid: str,
        node_uuids: list[str],
        allowed_ids: set[str],
    ) -> list[dict[str, Any]]: ...


class PostgresGraphReadBackend:
    """Primary graph read backend querying the Postgres `edges` source of truth (D017)."""

    source_name = "postgres"

    async def get_edges_for_nodes(
        self,
        session: Any,
        project_uuid: str,
        node_uuids: list[str],
        allowed_ids: set[str],
    ) -> list[dict[str, Any]]:
        if not node_uuids:
            return []
        seed_list = list(dict.fromkeys(str(n) for n in node_uuids if str(n) in allowed_ids))
        if not seed_list:
            return []

        rows = (
            await session.execute(
                text(
                    """
                    SELECT edge_uuid, src_node, dst_node, type, kind, scope, aspects
                    FROM edges
                    WHERE project_uuid = :p
                      AND (src_node = ANY(CAST(:seeds AS uuid[])) OR dst_node = ANY(CAST(:seeds AS uuid[])))
                    """
                ),
                {"p": str(project_uuid), "seeds": seed_list},
            )
        ).mappings().all()

        seen_edges: set[str] = set()
        edges: list[dict[str, Any]] = []
        for idx, r in enumerate(rows):
            src_id = str(r["src_node"])
            dst_id = str(r["dst_node"])
            if src_id not in allowed_ids or dst_id not in allowed_ids:
                continue
            eid = str(r.get("edge_uuid") or f"{src_id}:{r['type']}:{dst_id}:{idx}")
            if eid in seen_edges:
                continue
            seen_edges.add(eid)
            edges.append(
                {
                    "edge_uuid": eid,
                    "src_node": src_id,
                    "dst_node": dst_id,
                    "edge_type": r["type"],
                    "kind": r["kind"],
                    "scope": r["scope"],
                    "aspects": list(r["aspects"] or []),
                }
            )
        return edges


def get_graph_read_backend() -> GraphReadBackend:
    return PostgresGraphReadBackend()


async def expand_subgraph(
    project_uuid: str,
    seed_node_uuids: list[str],
    excluded_docs: list[str] | None = None,
    convo_uuid: str | None = None,
    max_neighbours_per_seed: int = MAX_NEIGHBOURS_PER_SEED,
    max_subgraph_nodes: int = MAX_SUBGRAPH_NODES,
) -> dict[str, Any]:
    """Expand `seed_node_uuids` by 1 hop using `PostgresGraphReadBackend` with strict seed-first precedence:
    1. Intersect `seed_node_uuids` with `allowed_ids` and cap at `max_subgraph_nodes`.
    2. Rank incident edges per seed (seed-to-seed edges first, then Why-layer edges, then What-layer edges)
       and keep at most `max_neighbours_per_seed` per seed.
    3. Fill remaining `max_subgraph_nodes - len(seeds)` node slots with the highest-priority neighbours.
    4. Hydrate `summary`, `text`, and allowed `evidence` rows ONLY for the selected subgraph nodes.
    """
    allowed_ids = await get_allowed_node_ids(project_uuid, excluded_docs, convo_uuid=convo_uuid)
    seeds = [
        str(nid)
        for nid in dict.fromkeys(str(n) for n in seed_node_uuids)
        if str(nid) in allowed_ids
    ][:max_subgraph_nodes]

    backend = get_graph_read_backend()
    if not seeds:
        return {
            "nodes": [],
            "relationships": [],
            "evidence_by_node": {},
            "graph_source": backend.source_name,
        }

    seed_set = set(seeds)
    excluded_set = {str(d) for d in (excluded_docs or [])}

    async with SessionLocal() as session:
        raw_edges = await backend.get_edges_for_nodes(session, project_uuid, seeds, allowed_ids)

        # Rank and cap edges per seed
        edges_by_seed: dict[str, list[tuple[tuple[int, int, str], dict[str, Any], str]]] = {s: [] for s in seeds}
        for e in raw_edges:
            u, v = e["src_node"], e["dst_node"]
            is_why = 0 if e["edge_type"] in WHY_LAYER_EDGES else 1
            if u in seed_set:
                other = v
                rank_key = (0 if other in seed_set else 1, is_why, e["edge_uuid"])
                edges_by_seed[u].append((rank_key, e, other))
            if v in seed_set and v != u:
                other = u
                rank_key = (0 if other in seed_set else 1, is_why, e["edge_uuid"])
                edges_by_seed[v].append((rank_key, e, other))

        candidate_neighbours: list[tuple[tuple[int, int, str], str]] = []
        selected_edge_ids: set[str] = set()
        capped_edges: list[dict[str, Any]] = []

        for s in seeds:
            sorted_inc = sorted(edges_by_seed.get(s, []), key=lambda item: item[0])[:max_neighbours_per_seed]
            for rank_key, edge_obj, other_id in sorted_inc:
                if edge_obj["edge_uuid"] not in selected_edge_ids:
                    selected_edge_ids.add(edge_obj["edge_uuid"])
                    capped_edges.append(edge_obj)
                if other_id not in seed_set:
                    candidate_neighbours.append((rank_key, other_id))

        candidate_neighbours.sort(key=lambda item: item[0])
        remaining_slots = max(0, max_subgraph_nodes - len(seeds))
        selected_neighbours: list[str] = []
        seen_neigh: set[str] = set()
        for _, nid in candidate_neighbours:
            if len(selected_neighbours) >= remaining_slots:
                break
            if nid not in seen_neigh and nid not in seed_set:
                seen_neigh.add(nid)
                selected_neighbours.append(nid)

        final_node_ids = [*seeds, *selected_neighbours]
        final_node_set = set(final_node_ids)

        # Keep only edges whose both endpoints are in `final_node_set`
        final_edges = [
            e
            for e in capped_edges
            if e["src_node"] in final_node_set and e["dst_node"] in final_node_set
        ]

        hydrated_map = await hydrate_nodes(session, project_uuid, final_node_ids, excluded_docs)

        ev_rows = (
            await session.execute(
                text(
                    """
                    SELECT ne.node_uuid, e.kind, e.ref, e.doc_uuid, e.excerpt
                    FROM node_evidence ne
                    JOIN evidence e ON e.id = ne.evidence_id
                    LEFT JOIN documents d ON d.project_uuid = e.project_uuid AND d.doc_uuid = e.doc_uuid
                    WHERE ne.node_uuid = ANY(CAST(:nids AS uuid[]))
                      AND (e.doc_uuid IS NULL OR d.deleted_at IS NULL)
                    """
                ),
                {"nids": final_node_ids},
            )
        ).mappings().all()

    evidence_by_node: dict[str, list[dict[str, Any]]] = {nid: [] for nid in final_node_ids if nid in hydrated_map}
    for ev in ev_rows:
        nid = str(ev["node_uuid"])
        if nid not in evidence_by_node:
            continue
        doc_id = str(ev["doc_uuid"]) if ev.get("doc_uuid") else None
        if doc_id and doc_id in excluded_set:
            continue
        evidence_by_node[nid].append(
            {
                "kind": ev["kind"],
                "ref": ev["ref"],
                "doc_uuid": doc_id,
                "excerpt": ev["excerpt"],
            }
        )

    ordered_nodes: list[dict[str, Any]] = []
    for nid in final_node_ids:
        if nid in hydrated_map:
            node_dict = dict(hydrated_map[nid])
            node_dict["is_seed"] = nid in seed_set
            node_dict["evidence"] = evidence_by_node.get(nid, [])
            ordered_nodes.append(node_dict)

    return {
        "nodes": ordered_nodes,
        "relationships": final_edges,
        "evidence_by_node": evidence_by_node,
        "graph_source": backend.source_name,
    }


async def open_questions(project_uuid: str, excluded_docs: list[str] | None = None) -> list[dict[str, Any]]:
    allowed = await _fetch_allowed_nodes(project_uuid, excluded_docs)
    return [
        n
        for n in allowed.values()
        if n["type"] == "Question" and (n.get("status") or "open") == "open"
    ]


async def superseded_by(
    project_uuid: str,
    node_uuid: str,
    excluded_docs: list[str] | None = None,
) -> list[dict[str, Any]]:
    allowed = await _fetch_allowed_nodes(project_uuid, excluded_docs)
    if str(node_uuid) not in allowed:
        return []

    async with SessionLocal() as session:
        rows = (
            await session.execute(
                text(
                    """
                    SELECT e.edge_uuid, e.src_node, e.dst_node, e.scope, e.aspects
                    FROM edges e
                    WHERE e.project_uuid = :p AND e.dst_node = :n AND e.type = 'SUPERSEDES'
                    """
                ),
                {"p": project_uuid, "n": node_uuid},
            )
        ).mappings().all()

    results: list[dict[str, Any]] = []
    for r in rows:
        src_id = str(r["src_node"])
        if src_id in allowed:
            results.append(
                {
                    "superseding_node": allowed[src_id],
                    "scope": r["scope"],
                    "aspects": list(r["aspects"] or []),
                }
            )
    return results


async def why_decision(
    project_uuid: str,
    node_uuid: str,
    excluded_docs: list[str] | None = None,
) -> dict[str, Any] | None:
    allowed = await _fetch_allowed_nodes(project_uuid, excluded_docs)
    target = allowed.get(str(node_uuid))
    if target is None:
        return None

    excluded_set = {str(d) for d in (excluded_docs or [])}
    async with SessionLocal() as session:
        ev_rows = (
            await session.execute(
                text(
                    """
                    SELECT e.kind, e.ref, e.doc_uuid, e.excerpt
                    FROM node_evidence ne
                    JOIN evidence e ON e.id = ne.evidence_id
                    LEFT JOIN documents d ON d.project_uuid = e.project_uuid AND d.doc_uuid = e.doc_uuid
                    WHERE ne.node_uuid = :n
                      AND (e.doc_uuid IS NULL OR d.deleted_at IS NULL)
                    """
                ),
                {"n": node_uuid},
            )
        ).mappings().all()
        edge_rows = (
            await session.execute(
                text(
                    """
                    SELECT edge_uuid, src_node, dst_node, type, kind, scope, aspects
                    FROM edges
                    WHERE project_uuid = :p AND (src_node = :n OR dst_node = :n)
                    """
                ),
                {"p": project_uuid, "n": node_uuid},
            )
        ).mappings().all()

    evidence = [
        dict(ev, doc_uuid=str(ev["doc_uuid"]) if ev["doc_uuid"] else None)
        for ev in ev_rows
        if not ev["doc_uuid"] or str(ev["doc_uuid"]) not in excluded_set
    ]
    related = [
        {
            "edge_type": er["type"],
            "kind": er["kind"],
            "src_node": str(er["src_node"]),
            "dst_node": str(er["dst_node"]),
            "scope": er["scope"],
            "aspects": list(er["aspects"] or []),
        }
        for er in edge_rows
        if str(er["src_node"]) in allowed and str(er["dst_node"]) in allowed
    ]
    return {"decision": target, "evidence": evidence, "relationships": related}


async def neighbours(
    project_uuid: str,
    node_uuid: str,
    excluded_docs: list[str] | None = None,
) -> list[dict[str, Any]]:
    allowed = await _fetch_allowed_nodes(project_uuid, excluded_docs)
    if str(node_uuid) not in allowed:
        return []

    async with SessionLocal() as session:
        rows = (
            await session.execute(
                text(
                    """
                    SELECT src_node, dst_node, type, kind, scope, aspects
                    FROM edges
                    WHERE project_uuid = :p AND (src_node = :n OR dst_node = :n)
                    """
                ),
                {"p": project_uuid, "n": node_uuid},
            )
        ).mappings().all()

    out: list[dict[str, Any]] = []
    for r in rows:
        src_id, dst_id = str(r["src_node"]), str(r["dst_node"])
        if src_id not in allowed or dst_id not in allowed:
            continue
        other_id = dst_id if src_id == str(node_uuid) else src_id
        out.append(
            {
                "neighbour": allowed[other_id],
                "edge_type": r["type"],
                "kind": r["kind"],
                "direction": "outgoing" if src_id == str(node_uuid) else "incoming",
                "scope": r["scope"],
                "aspects": list(r["aspects"] or []),
            }
        )
    return out


async def path_between(
    project_uuid: str,
    start_node_uuid: str,
    end_node_uuid: str,
    excluded_docs: list[str] | None = None,
    max_hops: int = 5,
) -> list[dict[str, Any]]:
    """Find shortest path up to `max_hops` where all intermediate nodes and edges are in `allowed`."""
    allowed = await _fetch_allowed_nodes(project_uuid, excluded_docs)
    start_id, end_id = str(start_node_uuid), str(end_node_uuid)
    if start_id not in allowed or end_id not in allowed:
        return []
    if start_id == end_id:
        return [{"node": allowed[start_id], "edge": None}]

    async with SessionLocal() as session:
        rows = (
            await session.execute(
                text(
                    """
                    SELECT edge_uuid, src_node, dst_node, type, kind, scope, aspects
                    FROM edges
                    WHERE project_uuid = :p
                    """
                ),
                {"p": project_uuid},
            )
        ).mappings().all()

    adj: dict[str, list[tuple[str, dict[str, Any]]]] = {}
    for r in rows:
        u, v = str(r["src_node"]), str(r["dst_node"])
        if u not in allowed or v not in allowed:
            continue
        edge_info = {
            "edge_uuid": str(r["edge_uuid"]),
            "type": r["type"],
            "kind": r["kind"],
            "src_node": u,
            "dst_node": v,
        }
        adj.setdefault(u, []).append((v, edge_info))
        adj.setdefault(v, []).append((u, edge_info))

    queue: deque[tuple[str, list[dict[str, Any]]]] = deque(
        [(start_id, [{"node": allowed[start_id], "edge": None}])]
    )
    visited = {start_id}

    while queue:
        curr, path = queue.popleft()
        if len(path) - 1 >= max_hops:
            continue
        for nxt, edge_info in adj.get(curr, []):
            if nxt in visited:
                continue
            new_path = [*path, {"node": allowed[nxt], "edge": edge_info}]
            if nxt == end_id:
                return new_path
            visited.add(nxt)
            queue.append((nxt, new_path))

    return []
