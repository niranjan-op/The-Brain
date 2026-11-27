"""Graph write gateway (D011, D017, graph-schema-v1-1).

- Postgres `nodes` holds the full node record (`summary` + `text` description + `embedding`).
- Neo4j AuraDB holds only the lean graph projection (`node_uuid`, `project_uuid`, `type`, `role`, `layer`, `name`, `status`, `aliases`) and typed edges.
- Evidence lives strictly in Postgres (`evidence` + `node_evidence`), never in Neo4j.
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Any, Literal

from sqlalchemy import text

from src.kc.core.config import settings
from src.kc.core.db import SessionLocal
from src.kc.modules.ingestion.embedder import EMBED_DIMS, embed_document

logger = logging.getLogger(__name__)

# Graph schema v1.1 (D017): Why + What layers and platform roles (D011)
NODE_TYPE_META: dict[str, tuple[str, str]] = {
    # Why layer
    "Decision": ("Why", "Decision"),
    "Alternative": ("Why", "Decision"),
    "Constraint": ("Why", "Requirement"),
    "Requirement": ("Why", "Requirement"),
    "Assumption": ("Why", "Assumption"),
    "Question": ("Why", "Question"),
    # What layer
    "Module": ("What", "Structure"),
    "ExternalEntity": ("What", "Structure"),
    "DataStore": ("What", "Structure"),
    "DataObject": ("What", "Data"),
    "Runtime": ("What", "Structure"),
}

ALLOWED_NODE_TYPES = set(NODE_TYPE_META.keys())

ALLOWED_EDGE_TYPES = {
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
}

ALLOWED_STATUSES = {"open", "agreed", "deferred", "rejected", "superseded", "resolved"}
QUESTION_STATUSES = {"open", "resolved"}
SIMILARITY_THRESHOLD = 0.88


async def _attach_evidence(
    session: Any,
    project_uuid: str,
    evidence_items: list[dict[str, Any]],
    *,
    node_uuid: str | None = None,
    edge_uuid: str | None = None,
) -> None:
    for item in evidence_items:
        ev_id = (
            await session.execute(
                text(
                    """
                    INSERT INTO evidence (project_uuid, kind, ref, doc_uuid, excerpt)
                    VALUES (:p, :kind, :ref, :doc_uuid, :excerpt)
                    RETURNING id
                    """
                ),
                {
                    "p": project_uuid,
                    "kind": item["kind"],
                    "ref": item["ref"],
                    "doc_uuid": item.get("doc_uuid"),
                    "excerpt": item.get("excerpt"),
                },
            )
        ).scalar_one()
        await session.execute(
            text(
                """
                INSERT INTO node_evidence (node_uuid, edge_uuid, evidence_id)
                VALUES (:n, :e, :ev)
                """
            ),
            {"n": node_uuid, "e": edge_uuid, "ev": ev_id},
        )


async def _try_embed_node(name: str, summary: str) -> tuple[list[float] | None, str | None, int | None]:
    embed_input = f"{name.strip()}: {summary.strip()}".strip(": ")
    try:
        vec = await embed_document(embed_input)
        return vec, settings.embed_model, EMBED_DIMS
    except Exception as exc:  # noqa: BLE001
        logger.warning("Node embedding failed for %r (will store NULL for backfill): %s", name, exc)
        return None, None, None


async def create_or_merge_node(
    project_uuid: str,
    node_type: str,
    name: str,
    summary: str = "",
    body_text: str = "",
    role: str | None = None,
    layer: str | None = None,
    aliases: list[str] | None = None,
    status: str | None = None,
    created_by: str | None = None,
    convo_uuid: str | None = None,
    evidence: list[dict[str, Any]] | None = None,
    action: Literal["check", "create_new", "merge_into"] = "check",
    merge_into_uuid: str | None = None,
) -> dict[str, Any]:
    if node_type not in ALLOWED_NODE_TYPES:
        raise ValueError(f"Unsupported node_type: {node_type}")
    clean_name = name.strip()
    if not clean_name:
        raise ValueError("Node name must not be empty")

    default_layer, default_role = NODE_TYPE_META[node_type]
    resolved_layer = layer or default_layer
    resolved_role = role or default_role

    if status is None:
        resolved_status = "open" if node_type == "Question" else "agreed"
    else:
        resolved_status = status
    if node_type == "Question" and resolved_status not in QUESTION_STATUSES:
        raise ValueError(f"Question status must be one of {QUESTION_STATUSES}, got {resolved_status!r}")
    if resolved_status not in ALLOWED_STATUSES:
        raise ValueError(f"Unsupported status: {resolved_status!r}")

    resolved_text = body_text.strip() or summary.strip()
    resolved_summary = summary.strip() or resolved_text[:240]
    alias_list = [a.strip() for a in (aliases or []) if a.strip()]
    evidence_list = evidence or []

    # 1. Merge into existing node if requested
    if action == "merge_into":
        if not merge_into_uuid:
            raise ValueError("merge_into_uuid required when action='merge_into'")
        async with SessionLocal() as session:
            target = (
                await session.execute(
                    text(
                        """
                        SELECT node_uuid, type, role, layer, name, summary, text, aliases, status
                        FROM nodes
                        WHERE project_uuid = :p AND node_uuid = :n
                        FOR UPDATE
                        """
                    ),
                    {"p": project_uuid, "n": merge_into_uuid},
                )
            ).mappings().first()
            if target is None:
                raise ValueError("Target node for merge not found in project")

            existing_aliases = list(target["aliases"] or [])
            for candidate_alias in [clean_name, *alias_list]:
                if candidate_alias.lower() != target["name"].lower() and all(
                    candidate_alias.lower() != a.lower() for a in existing_aliases
                ):
                    existing_aliases.append(candidate_alias)

            updated_text = target["text"] or resolved_text
            if resolved_text and resolved_text not in (target["text"] or ""):
                updated_text = f"{target['text']}\n\n{resolved_text}".strip() if target["text"] else resolved_text

            await session.execute(
                text(
                    """
                    UPDATE nodes
                    SET aliases = :aliases, text = :text, updated_at = now()
                    WHERE project_uuid = :p AND node_uuid = :n
                    """
                ),
                {
                    "aliases": existing_aliases,
                    "text": updated_text,
                    "p": project_uuid,
                    "n": merge_into_uuid,
                },
            )
            await _attach_evidence(session, project_uuid, evidence_list, node_uuid=str(merge_into_uuid))

            # Neo4j projection payload: no summary/text (descriptions stay in Postgres per D003/D017)
            change_payload = {
                "node_uuid": str(merge_into_uuid),
                "project_uuid": str(project_uuid),
                "type": target["type"],
                "role": target["role"] or resolved_role,
                "layer": target["layer"] or resolved_layer,
                "name": target["name"],
                "status": target["status"] or resolved_status,
                "aliases": existing_aliases,
            }
            await session.execute(
                text(
                    """
                    INSERT INTO graph_changes (project_uuid, op, payload, actor_user, convo_uuid)
                    VALUES (:p, 'upsert_node', CAST(:payload AS jsonb), :u, :c)
                    """
                ),
                {
                    "p": project_uuid,
                    "payload": json.dumps(change_payload),
                    "u": created_by,
                    "c": convo_uuid,
                },
            )
            await session.commit()
            return {"status": "merged", "node_uuid": str(merge_into_uuid), "aliases": existing_aliases}

    # 2. Check node budget and exact-name duplicates first (fast read, then release session before embedding)
    async with SessionLocal() as session:
        max_nodes = (
            await session.execute(
                text("SELECT max_graph_nodes FROM projects WHERE project_uuid = :p"),
                {"p": project_uuid},
            )
        ).scalar_one_or_none()
        current_count = (
            await session.execute(
                text("SELECT count(*) FROM nodes WHERE project_uuid = :p"),
                {"p": project_uuid},
            )
        ).scalar_one()
        if max_nodes is not None and current_count >= max_nodes:
            raise ValueError(f"Project node budget exceeded ({max_nodes})")

        if action == "check":
            exact_matches = (
                await session.execute(
                    text(
                        """
                        SELECT node_uuid, name, type, summary, aliases
                        FROM nodes
                        WHERE project_uuid = :p
                          AND (
                              lower(name) = lower(:name)
                              OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE lower(a) = lower(:name))
                          )
                        """
                    ),
                    {"p": project_uuid, "name": clean_name},
                )
            ).mappings().all()
            if exact_matches:
                return {
                    "status": "duplicate_candidates",
                    "match_kind": "exact",
                    "candidates": [dict(r, node_uuid=str(r["node_uuid"])) for r in exact_matches],
                }

    # 3. Compute embedding OUTSIDE the DB session so a slow/failing embed call never holds a DB connection
    embedding, embed_model, dims = await _try_embed_node(clean_name, resolved_summary)
    vec_str = str(embedding) if embedding is not None else None

    async with SessionLocal() as session:
        if action == "check" and vec_str is not None:
            sim_matches = (
                await session.execute(
                    text(
                        """
                        SELECT node_uuid, name, type, summary, aliases,
                               1 - (embedding <=> CAST(:vec AS vector)) AS similarity
                        FROM nodes
                        WHERE project_uuid = :p
                          AND type = :type
                          AND embedding IS NOT NULL
                          AND (embed_model IS NULL OR embed_model = :embed_model)
                          AND (dims IS NULL OR dims = :dims)
                          AND 1 - (embedding <=> CAST(:vec AS vector)) >= :thresh
                        ORDER BY embedding <=> CAST(:vec AS vector)
                        LIMIT 3
                        """
                    ),
                    {
                        "p": project_uuid,
                        "type": node_type,
                        "vec": vec_str,
                        "embed_model": embed_model,
                        "dims": dims,
                        "thresh": SIMILARITY_THRESHOLD,
                    },
                )
            ).mappings().all()
            if sim_matches:
                return {
                    "status": "duplicate_candidates",
                    "match_kind": "similarity",
                    "candidates": [dict(r, node_uuid=str(r["node_uuid"])) for r in sim_matches],
                }

        # 4. Create new node + evidence + graph_changes in one transaction
        new_uuid = str(uuid.uuid4())
        await session.execute(
            text(
                """
                INSERT INTO nodes (node_uuid, project_uuid, type, role, layer, name, summary, text,
                                   aliases, status, embedding, embed_model, dims, created_by)
                VALUES (:n, :p, :type, :role, :layer, :name, :summary, :text,
                        :aliases, :status, CAST(:vec AS vector), :embed_model, :dims, :u)
                """
            ),
            {
                "n": new_uuid,
                "p": project_uuid,
                "type": node_type,
                "role": resolved_role,
                "layer": resolved_layer,
                "name": clean_name,
                "summary": resolved_summary,
                "text": resolved_text,
                "aliases": alias_list,
                "status": resolved_status,
                "vec": vec_str,
                "embed_model": embed_model,
                "dims": dims,
                "u": created_by,
            },
        )
        await _attach_evidence(session, project_uuid, evidence_list, node_uuid=new_uuid)

        change_payload = {
            "node_uuid": new_uuid,
            "project_uuid": str(project_uuid),
            "type": node_type,
            "role": resolved_role,
            "layer": resolved_layer,
            "name": clean_name,
            "status": resolved_status,
            "aliases": alias_list,
        }
        await session.execute(
            text(
                """
                INSERT INTO graph_changes (project_uuid, op, payload, actor_user, convo_uuid)
                VALUES (:p, 'upsert_node', CAST(:payload AS jsonb), :u, :c)
                """
            ),
            {
                "p": project_uuid,
                "payload": json.dumps(change_payload),
                "u": created_by,
                "c": convo_uuid,
            },
        )
        await session.commit()
        return {
            "status": "created",
            "node_uuid": new_uuid,
            "embedding_status": "ready" if vec_str is not None else "pending_backfill",
        }


async def update_node(
    project_uuid: str,
    node_uuid: str,
    *,
    name: str | None = None,
    summary: str | None = None,
    body_text: str | None = None,
    status: str | None = None,
    aliases: list[str] | None = None,
    actor_user: str | None = None,
    convo_uuid: str | None = None,
) -> dict[str, Any]:
    """Update a node's attributes, re-embedding outside the DB transaction when name or summary changes."""
    async with SessionLocal() as session:
        current = (
            await session.execute(
                text(
                    """
                    SELECT node_uuid, type, role, layer, name, summary, text, aliases, status
                    FROM nodes
                    WHERE project_uuid = :p AND node_uuid = :n
                    """
                ),
                {"p": project_uuid, "n": node_uuid},
            )
        ).mappings().first()
        if current is None:
            raise ValueError("Node not found in project")

    new_name = name.strip() if name is not None else current["name"]
    if not new_name:
        raise ValueError("Node name must not be empty")
    new_summary = summary.strip() if summary is not None else (current["summary"] or "")
    new_text = body_text.strip() if body_text is not None else (current["text"] or new_summary)
    new_status = status if status is not None else (current["status"] or "agreed")
    if current["type"] == "Question" and new_status not in QUESTION_STATUSES:
        raise ValueError(f"Question status must be one of {QUESTION_STATUSES}, got {new_status!r}")
    if new_status not in ALLOWED_STATUSES:
        raise ValueError(f"Unsupported status: {new_status!r}")
    new_aliases = [a.strip() for a in aliases if a.strip()] if aliases is not None else list(current["aliases"] or [])

    needs_reembed = (name is not None and new_name != current["name"]) or (
        summary is not None and new_summary != (current["summary"] or "")
    )
    vec_str: str | None = None
    embed_model: str | None = None
    dims: int | None = None
    if needs_reembed:
        vec, embed_model, dims = await _try_embed_node(new_name, new_summary)
        vec_str = str(vec) if vec is not None else None

    async with SessionLocal() as session:
        if needs_reembed:
            await session.execute(
                text(
                    """
                    UPDATE nodes
                    SET name = :name, summary = :summary, text = :text, aliases = :aliases,
                        status = :status, embedding = CAST(:vec AS vector),
                        embed_model = :embed_model, dims = :dims, updated_at = now()
                    WHERE project_uuid = :p AND node_uuid = :n
                    """
                ),
                {
                    "name": new_name,
                    "summary": new_summary,
                    "text": new_text,
                    "aliases": new_aliases,
                    "status": new_status,
                    "vec": vec_str,
                    "embed_model": embed_model,
                    "dims": dims,
                    "p": project_uuid,
                    "n": node_uuid,
                },
            )
        else:
            await session.execute(
                text(
                    """
                    UPDATE nodes
                    SET name = :name, summary = :summary, text = :text, aliases = :aliases,
                        status = :status, updated_at = now()
                    WHERE project_uuid = :p AND node_uuid = :n
                    """
                ),
                {
                    "name": new_name,
                    "summary": new_summary,
                    "text": new_text,
                    "aliases": new_aliases,
                    "status": new_status,
                    "p": project_uuid,
                    "n": node_uuid,
                },
            )

        change_payload = {
            "node_uuid": str(node_uuid),
            "project_uuid": str(project_uuid),
            "type": current["type"],
            "role": current["role"],
            "layer": current["layer"],
            "name": new_name,
            "status": new_status,
            "aliases": new_aliases,
        }
        await session.execute(
            text(
                """
                INSERT INTO graph_changes (project_uuid, op, payload, actor_user, convo_uuid)
                VALUES (:p, 'upsert_node', CAST(:payload AS jsonb), :u, :c)
                """
            ),
            {
                "p": project_uuid,
                "payload": json.dumps(change_payload),
                "u": actor_user,
                "c": convo_uuid,
            },
        )
        await session.commit()
        return {
            "status": "updated",
            "node_uuid": str(node_uuid),
            "reembedded": needs_reembed and vec_str is not None,
        }


async def backfill_missing_node_embeddings(project_uuid: str) -> int:
    """Populate embeddings for any nodes in `project_uuid` whose `embedding IS NULL`."""
    async with SessionLocal() as session:
        missing = (
            await session.execute(
                text(
                    """
                    SELECT node_uuid, name, summary
                    FROM nodes
                    WHERE project_uuid = :p AND embedding IS NULL
                    """
                ),
                {"p": project_uuid},
            )
        ).mappings().all()

    updated = 0
    for row in missing:
        vec, embed_model, dims = await _try_embed_node(row["name"], row["summary"] or "")
        if vec is None:
            continue
        async with SessionLocal() as session:
            await session.execute(
                text(
                    """
                    UPDATE nodes
                    SET embedding = CAST(:vec AS vector), embed_model = :embed_model,
                        dims = :dims, updated_at = now()
                    WHERE project_uuid = :p AND node_uuid = :n
                    """
                ),
                {
                    "vec": str(vec),
                    "embed_model": embed_model,
                    "dims": dims,
                    "p": project_uuid,
                    "n": str(row["node_uuid"]),
                },
            )
            await session.commit()
        updated += 1
    return updated


async def create_edge(
    project_uuid: str,
    src_node: str,
    dst_node: str,
    edge_type: str,
    kind: str | None = None,
    scope: Literal["full", "partial"] | None = None,
    aspects: list[str] | None = None,
    status: str = "agreed",
    actor_user: str | None = None,
    convo_uuid: str | None = None,
    evidence: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if edge_type not in ALLOWED_EDGE_TYPES:
        raise ValueError(f"Unsupported edge_type: {edge_type}")
    if src_node == dst_node:
        raise ValueError("Self-loop edges are not allowed")

    aspect_list = [a.strip() for a in (aspects or []) if a.strip()]
    if edge_type == "SUPERSEDES":
        if scope not in ("full", "partial"):
            raise ValueError("SUPERSEDES edge requires scope ('full' or 'partial')")
        if scope == "partial" and not aspect_list:
            raise ValueError("partial SUPERSEDES requires non-empty aspects")
    elif scope is not None and scope not in ("full", "partial"):
        raise ValueError("scope must be 'full', 'partial', or None")

    async with SessionLocal() as session:
        endpoints = (
            await session.execute(
                text(
                    """
                    SELECT node_uuid, type, role, layer, name, status, aliases
                    FROM nodes
                    WHERE project_uuid = :p AND node_uuid IN (:src, :dst)
                    """
                ),
                {"p": project_uuid, "src": src_node, "dst": dst_node},
            )
        ).mappings().all()
        if len(endpoints) < 2:
            raise ValueError("Both src_node and dst_node must exist in the same project")

        # Check if identical edge already exists
        existing_edge = (
            await session.execute(
                text(
                    """
                    SELECT edge_uuid FROM edges
                    WHERE project_uuid = :p AND src_node = :src AND dst_node = :dst AND type = :type
                    """
                ),
                {"p": project_uuid, "src": src_node, "dst": dst_node, "type": edge_type},
            )
        ).scalar_one_or_none()
        if existing_edge is not None:
            await _attach_evidence(session, project_uuid, evidence or [], edge_uuid=str(existing_edge))
            await session.commit()
            return {"status": "existing", "edge_uuid": str(existing_edge)}

        edge_uuid = str(uuid.uuid4())
        await session.execute(
            text(
                """
                INSERT INTO edges (edge_uuid, project_uuid, src_node, dst_node, type, kind, scope, aspects, status)
                VALUES (:e, :p, :src, :dst, :type, :kind, :scope, :aspects, :status)
                """
            ),
            {
                "e": edge_uuid,
                "p": project_uuid,
                "src": src_node,
                "dst": dst_node,
                "type": edge_type,
                "kind": kind,
                "scope": scope,
                "aspects": aspect_list,
                "status": status,
            },
        )
        await _attach_evidence(session, project_uuid, evidence or [], edge_uuid=edge_uuid)

        change_payload = {
            "edge_uuid": edge_uuid,
            "project_uuid": str(project_uuid),
            "src_node": str(src_node),
            "dst_node": str(dst_node),
            "type": edge_type,
            "kind": kind,
            "scope": scope,
            "aspects": aspect_list,
            "status": status,
        }
        await session.execute(
            text(
                """
                INSERT INTO graph_changes (project_uuid, op, payload, actor_user, convo_uuid)
                VALUES (:p, 'upsert_edge', CAST(:payload AS jsonb), :u, :c)
                """
            ),
            {
                "p": project_uuid,
                "payload": json.dumps(change_payload),
                "u": actor_user,
                "c": convo_uuid,
            },
        )

        # Graph schema v1.1: full SUPERSEDES sets dst_node status='superseded'; RESOLVES sets dst Question='resolved'
        new_dst_status: str | None = None
        if edge_type == "SUPERSEDES" and scope == "full":
            new_dst_status = "superseded"
        elif edge_type == "RESOLVES":
            new_dst_status = "resolved"

        if new_dst_status is not None:
            await session.execute(
                text("UPDATE nodes SET status = :st, updated_at = now() WHERE project_uuid = :p AND node_uuid = :dst"),
                {"st": new_dst_status, "p": project_uuid, "dst": dst_node},
            )
            dst_row = next(r for r in endpoints if str(r["node_uuid"]) == str(dst_node))
            dst_payload = {
                "node_uuid": str(dst_node),
                "project_uuid": str(project_uuid),
                "type": dst_row["type"],
                "role": dst_row["role"],
                "layer": dst_row["layer"],
                "name": dst_row["name"],
                "status": new_dst_status,
                "aliases": list(dst_row["aliases"] or []),
            }
            await session.execute(
                text(
                    """
                    INSERT INTO graph_changes (project_uuid, op, payload, actor_user, convo_uuid)
                    VALUES (:p, 'upsert_node', CAST(:payload AS jsonb), :u, :c)
                    """
                ),
                {
                    "p": project_uuid,
                    "payload": json.dumps(dst_payload),
                    "u": actor_user,
                    "c": convo_uuid,
                },
            )

        await session.commit()
        return {"status": "created", "edge_uuid": edge_uuid}


async def delete_document_cascade(
    session: Any,
    *,
    project_uuid: str,
    doc_uuid: str,
    actor_user: str | None = None,
) -> dict[str, Any]:
    """Delete a document and cascade-prune its chunks from Vector/Keyword RAG and its
    evidence, orphaned nodes, and orphaned edges from the Knowledge Graph (Postgres + Neo4j queue).
    """
    p_str = str(project_uuid)
    d_str = str(doc_uuid)

    deleted_doc = (
        await session.execute(
            text(
                """
                UPDATE documents
                SET deleted_at = now()
                WHERE project_uuid = :p AND doc_uuid = :d AND deleted_at IS NULL
                RETURNING doc_uuid
                """
            ),
            {"p": p_str, "d": d_str},
        )
    ).scalar_one_or_none()
    if deleted_doc is None:
        return {"deleted": False, "doc_uuid": d_str}

    # 1. Remove from per-conversation excluded sources
    await session.execute(
        text("DELETE FROM conversation_excluded_sources WHERE doc_uuid = :d"),
        {"d": d_str},
    )

    # 2. Delete all document chunks from Vector + BM25 RAG
    chunk_rows = (
        await session.execute(
            text(
                """
                DELETE FROM chunks
                WHERE project_uuid = :p AND doc_uuid = :d
                RETURNING chunk_id
                """
            ),
            {"p": p_str, "d": d_str},
        )
    ).scalars().all()
    deleted_chunk_ids = [str(cid) for cid in (chunk_rows or []) if cid is not None]

    if deleted_chunk_ids:
        await session.execute(
            text(
                """
                DELETE FROM message_sources
                WHERE source_kind = 'chunk' AND source_id = ANY(CAST(:cids AS text[]))
                """
            ),
            {"cids": deleted_chunk_ids},
        )

    # 3. Locate all evidence rows tied to this document or its chunks
    ev_rows = (
        await session.execute(
            text(
                """
                SELECT id
                FROM evidence
                WHERE project_uuid = :p
                  AND (
                      doc_uuid = :d
                      OR (kind = 'chunk' AND ref = ANY(CAST(:cids AS text[])))
                  )
                """
            ),
            {"p": p_str, "d": d_str, "cids": deleted_chunk_ids},
        )
    ).scalars().all()
    ev_ids = [int(eid) for eid in (ev_rows or []) if eid is not None]

    orphaned_node_ids: list[str] = []
    orphaned_edge_ids: list[str] = []

    if ev_ids:
        linked_rows = (
            await session.execute(
                text(
                    """
                    DELETE FROM node_evidence
                    WHERE evidence_id = ANY(CAST(:eids AS bigint[]))
                    RETURNING node_uuid, edge_uuid
                    """
                ),
                {"eids": ev_ids},
            )
        ).mappings().all()

        await session.execute(
            text("DELETE FROM evidence WHERE id = ANY(CAST(:eids AS bigint[]))"),
            {"eids": ev_ids},
        )

        affected_nodes = list(
            dict.fromkeys(str(r["node_uuid"]) for r in linked_rows if r.get("node_uuid") is not None)
        )
        affected_edges = list(
            dict.fromkeys(str(r["edge_uuid"]) for r in linked_rows if r.get("edge_uuid") is not None)
        )

        # 4. Prune edges that no longer have any backing evidence
        if affected_edges:
            orphan_edges = (
                await session.execute(
                    text(
                        """
                        SELECT e.edge_uuid
                        FROM edges e
                        LEFT JOIN node_evidence ne ON ne.edge_uuid = e.edge_uuid
                        WHERE e.project_uuid = :p
                          AND e.edge_uuid = ANY(CAST(:eids AS uuid[]))
                        GROUP BY e.edge_uuid
                        HAVING count(ne.evidence_id) = 0
                        """
                    ),
                    {"p": p_str, "eids": affected_edges},
                )
            ).scalars().all()
            orphaned_edge_ids = [str(eid) for eid in (orphan_edges or []) if eid is not None]
            if orphaned_edge_ids:
                await session.execute(
                    text(
                        """
                        DELETE FROM edges
                        WHERE project_uuid = :p AND edge_uuid = ANY(CAST(:eids AS uuid[]))
                        """
                    ),
                    {"p": p_str, "eids": orphaned_edge_ids},
                )
                for eid in orphaned_edge_ids:
                    await session.execute(
                        text(
                            """
                            INSERT INTO graph_changes (project_uuid, op, payload, actor_user)
                            VALUES (:p, 'delete_edge', CAST(:payload AS jsonb), :u)
                            """
                        ),
                        {
                            "p": p_str,
                            "payload": json.dumps({"edge_uuid": eid, "project_uuid": p_str}),
                            "u": actor_user,
                        },
                    )

        # 5. Prune nodes that no longer have any backing evidence
        if affected_nodes:
            orphan_nodes = (
                await session.execute(
                    text(
                        """
                        SELECT n.node_uuid
                        FROM nodes n
                        LEFT JOIN node_evidence ne ON ne.node_uuid = n.node_uuid
                        WHERE n.project_uuid = :p
                          AND n.node_uuid = ANY(CAST(:nids AS uuid[]))
                        GROUP BY n.node_uuid
                        HAVING count(ne.evidence_id) = 0
                        """
                    ),
                    {"p": p_str, "nids": affected_nodes},
                )
            ).scalars().all()
            orphaned_node_ids = [str(nid) for nid in (orphan_nodes or []) if nid is not None]
            if orphaned_node_ids:
                await session.execute(
                    text(
                        """
                        DELETE FROM edges
                        WHERE project_uuid = :p
                          AND (
                              src_node = ANY(CAST(:nids AS uuid[]))
                              OR dst_node = ANY(CAST(:nids AS uuid[]))
                          )
                        """
                    ),
                    {"p": p_str, "nids": orphaned_node_ids},
                )
                await session.execute(
                    text(
                        """
                        DELETE FROM nodes
                        WHERE project_uuid = :p AND node_uuid = ANY(CAST(:nids AS uuid[]))
                        """
                    ),
                    {"p": p_str, "nids": orphaned_node_ids},
                )
                for nid in orphaned_node_ids:
                    await session.execute(
                        text(
                            """
                            INSERT INTO graph_changes (project_uuid, op, payload, actor_user)
                            VALUES (:p, 'delete_node', CAST(:payload AS jsonb), :u)
                            """
                        ),
                        {
                            "p": p_str,
                            "payload": json.dumps({"node_uuid": nid, "project_uuid": p_str}),
                            "u": actor_user,
                        },
                    )

    return {
        "deleted": True,
        "doc_uuid": d_str,
        "deleted_chunks": len(deleted_chunk_ids),
        "deleted_nodes": len(orphaned_node_ids),
        "deleted_edges": len(orphaned_edge_ids),
    }
