"""Conversation CRUD, per-conversation excluded sources, source_scope computation, and message storage (D022, T056)."""
from __future__ import annotations

import uuid
from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.kc.modules.chat.citations import format_page_paragraph_label


async def verify_project_membership(
    session: AsyncSession,
    *,
    project_uuid: str,
    user_uuid: str,
    require_write: bool = False,
) -> str:
    """Return user's role in `project_uuid`, raising `PermissionError` if not authorized."""
    role = (
        await session.execute(
            text(
                """
                SELECT role
                FROM project_members
                WHERE project_uuid = :p AND user_uuid = :u
                """
            ),
            {"p": str(project_uuid), "u": str(user_uuid)},
        )
    ).scalar_one_or_none()
    if role is None:
        raise PermissionError("Not a member of this project")
    if require_write and role not in ("owner", "edit"):
        raise PermissionError("Insufficient permissions in this project")
    return str(role)


async def create_conversation(
    session: AsyncSession,
    *,
    project_uuid: str,
    user_uuid: str,
    title: str | None = None,
    visibility: Literal["shared", "private"] = "shared",
) -> dict[str, Any]:
    """Create a conversation in `project_uuid`."""
    row = (
        await session.execute(
            text(
                """
                INSERT INTO conversations (project_uuid, created_by, title, visibility)
                VALUES (:p, :u, :t, :v)
                RETURNING convo_uuid, project_uuid, created_by, title, visibility, created_at, updated_at
                """
            ),
            {
                "p": str(project_uuid),
                "u": str(user_uuid),
                "t": title.strip() if title else "New conversation",
                "v": visibility,
            },
        )
    ).mappings().one()
    return {
        "convo_uuid": str(row["convo_uuid"]),
        "project_uuid": str(row["project_uuid"]),
        "created_by": str(row["created_by"]),
        "title": row["title"],
        "visibility": row["visibility"],
        "excluded_doc_uuids": [],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


async def list_conversations(
    session: AsyncSession,
    *,
    project_uuid: str,
    user_uuid: str,
) -> list[dict[str, Any]]:
    """List conversations visible to `user_uuid` in `project_uuid` along with their excluded docs."""
    rows = (
        await session.execute(
            text(
                """
                SELECT c.convo_uuid, c.project_uuid, c.created_by, c.title, c.visibility,
                       c.created_at, c.updated_at,
                       coalesce(
                           array_agg(ces.doc_uuid) FILTER (WHERE ces.doc_uuid IS NOT NULL),
                           '{}'
                       ) AS excluded_doc_uuids
                FROM conversations c
                LEFT JOIN conversation_excluded_sources ces ON ces.convo_uuid = c.convo_uuid
                WHERE c.project_uuid = :p
                  AND c.deleted_at IS NULL
                  AND (c.visibility = 'shared' OR c.created_by = :u)
                GROUP BY c.convo_uuid
                ORDER BY c.updated_at DESC
                """
            ),
            {"p": str(project_uuid), "u": str(user_uuid)},
        )
    ).mappings().all()

    return [
        {
            "convo_uuid": str(r["convo_uuid"]),
            "project_uuid": str(r["project_uuid"]),
            "created_by": str(r["created_by"]),
            "title": r["title"],
            "visibility": r["visibility"],
            "excluded_doc_uuids": [str(d) for d in (r["excluded_doc_uuids"] or []) if d is not None],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        }
        for r in rows
    ]


async def get_accessible_conversation(
    session: AsyncSession,
    *,
    project_uuid: str,
    convo_uuid: str,
    user_uuid: str,
) -> dict[str, Any]:
    """Load conversation metadata after enforcing project + private-visibility access."""
    convo = (
        await session.execute(
            text(
                """
                SELECT convo_uuid, project_uuid, created_by, title, visibility, created_at, updated_at
                FROM conversations
                WHERE convo_uuid = :c AND project_uuid = :p AND deleted_at IS NULL
                """
            ),
            {"c": str(convo_uuid), "p": str(project_uuid)},
        )
    ).mappings().first()
    if convo is None:
        raise LookupError("Conversation not found in this project")
    if convo["visibility"] == "private" and str(convo["created_by"]) != str(user_uuid):
        raise PermissionError("Private conversation belongs to another user")
    return dict(convo)


async def get_conversation_detail(
    session: AsyncSession,
    *,
    project_uuid: str,
    convo_uuid: str,
    user_uuid: str,
) -> dict[str, Any]:
    """Load conversation metadata, `excluded_doc_uuids`, and ordered messages with citations."""
    convo = await get_accessible_conversation(
        session,
        project_uuid=project_uuid,
        convo_uuid=convo_uuid,
        user_uuid=user_uuid,
    )
    excluded = (
        await session.execute(
            text("SELECT doc_uuid FROM conversation_excluded_sources WHERE convo_uuid = :c"),
            {"c": str(convo_uuid)},
        )
    ).scalars().all()

    msg_rows = (
        await session.execute(
            text(
                """
                SELECT m.message_uuid, m.convo_uuid, m.user_uuid, m.content, m.type, m.status,
                       m.mode, m.model, m.input_tokens, m.output_tokens, m.source_scope, m.error,
                       m.created_at, m.updated_at
                FROM messages m
                WHERE m.convo_uuid = :c
                ORDER BY m.created_at ASC
                """
            ),
            {"c": str(convo_uuid)},
        )
    ).mappings().all()

    msg_ids = [str(m["message_uuid"]) for m in msg_rows]
    sources_by_msg: dict[str, list[dict[str, Any]]] = {mid: [] for mid in msg_ids}
    citations_by_msg: dict[str, list[dict[str, Any]]] = {mid: [] for mid in msg_ids}
    if msg_ids:
        src_rows = (
            await session.execute(
                text(
                    """
                    SELECT message_uuid, source_kind, source_id, rank
                    FROM message_sources
                    WHERE message_uuid = ANY(CAST(:mids AS uuid[]))
                    ORDER BY rank ASC NULLS LAST
                    """
                ),
                {"mids": msg_ids},
            )
        ).mappings().all()

        chunk_ids: list[str] = []
        node_ids: list[str] = []
        for sr in src_rows:
            sk = str(sr["source_kind"])
            sid = str(sr["source_id"])
            if sk == "chunk":
                chunk_ids.append(sid)
            elif sk == "node":
                try:
                    node_ids.append(str(uuid.UUID(sid)))
                except ValueError:
                    pass

        chunk_map: dict[str, dict[str, Any]] = {}
        if chunk_ids:
            chunk_rows = (
                await session.execute(
                    text(
                        """
                        SELECT c.chunk_id, c.doc_uuid, c.ordinal, c.heading_path, c.page_start, c.page_end,
                               c.text, c.payload, d.filename
                        FROM chunks c
                        JOIN documents d ON d.project_uuid = c.project_uuid AND d.doc_uuid = c.doc_uuid
                        WHERE c.project_uuid = :p AND c.chunk_id = ANY(CAST(:cids AS text[]))
                        """
                    ),
                    {"p": str(project_uuid), "cids": list(dict.fromkeys(chunk_ids))},
                )
            ).mappings().all()
            chunk_map = {str(cr["chunk_id"]): dict(cr) for cr in chunk_rows}

        node_map: dict[str, dict[str, Any]] = {}
        if node_ids:
            node_rows = (
                await session.execute(
                    text(
                        """
                        SELECT n.node_uuid, n.type, n.layer, n.name, n.summary, n.text, n.status,
                               c.chunk_id, c.doc_uuid, c.ordinal, c.heading_path, c.page_start, c.page_end,
                               c.payload, d.filename
                        FROM nodes n
                        LEFT JOIN LATERAL (
                            SELECT e.ref, e.doc_uuid, e.excerpt
                            FROM node_evidence ne
                            JOIN evidence e ON e.id = ne.evidence_id
                            WHERE ne.node_uuid = n.node_uuid
                            ORDER BY ne.evidence_id ASC
                            LIMIT 1
                        ) ev ON TRUE
                        LEFT JOIN chunks c ON c.project_uuid = n.project_uuid AND c.chunk_id = ev.ref
                        LEFT JOIN documents d ON d.project_uuid = n.project_uuid
                            AND d.doc_uuid = COALESCE(c.doc_uuid, ev.doc_uuid)
                        WHERE n.project_uuid = :p AND n.node_uuid = ANY(CAST(:nids AS uuid[]))
                        """
                    ),
                    {"p": str(project_uuid), "nids": list(dict.fromkeys(node_ids))},
                )
            ).mappings().all()
            node_map = {str(nr["node_uuid"]): dict(nr) for nr in node_rows}

        for sr in src_rows:
            mid = str(sr["message_uuid"])
            sk = str(sr["source_kind"])
            sid = str(sr["source_id"])
            rank_val = int(sr["rank"]) if sr["rank"] is not None else len(citations_by_msg[mid]) + 1
            sources_by_msg[mid].append(
                {
                    "source_kind": "chunk" if sk == "node" else sk,
                    "source_id": sid,
                    "rank": sr["rank"],
                }
            )
            if sk == "chunk":
                cinfo = chunk_map.get(sid) or {}
                page_label, p_start, p_end, para_start, para_end = format_page_paragraph_label(cinfo)
                citations_by_msg[mid].append(
                    {
                        "citation_id": f"cit-chunk-{mid}-{rank_val}",
                        "source_kind": "chunk",
                        "source_id": sid,
                        "doc_uuid": str(cinfo["doc_uuid"]) if cinfo.get("doc_uuid") else None,
                        "filename": str(cinfo.get("filename") or "Document Source"),
                        "heading_path": str(cinfo.get("heading_path") or "Retrieved Section"),
                        "page_label": page_label,
                        "page_start": p_start,
                        "page_end": p_end,
                        "para_start": para_start,
                        "para_end": para_end,
                        "excerpt": str(cinfo.get("text") or "")[:240],
                        "rank": rank_val,
                        "score": "Hybrid",
                    }
                )
            elif sk == "node":
                ninfo = node_map.get(sid) or {}
                page_label, p_start, p_end, para_start, para_end = format_page_paragraph_label(ninfo)
                citations_by_msg[mid].append(
                    {
                        "citation_id": f"cit-chunk-{mid}-{rank_val}",
                        "source_kind": "chunk",
                        "source_id": str(ninfo.get("chunk_id") or sid),
                        "doc_uuid": str(ninfo["doc_uuid"]) if ninfo.get("doc_uuid") else None,
                        "filename": str(ninfo.get("filename") or "Document Source"),
                        "heading_path": str(ninfo.get("heading_path") or ninfo.get("name") or "Document Section"),
                        "page_label": page_label,
                        "page_start": p_start,
                        "page_end": p_end,
                        "para_start": para_start,
                        "para_end": para_end,
                        "excerpt": str(ninfo.get("text") or ninfo.get("summary") or ninfo.get("name") or "")[:240],
                        "rank": rank_val,
                        "score": "Document",
                    }
                )
            else:
                citations_by_msg[mid].append(
                    {
                        "citation_id": f"cit-url-{mid}-{rank_val}",
                        "source_kind": "url",
                        "source_id": sid,
                        "filename": sid,
                        "heading_path": "Web Search",
                        "page_label": "Web",
                        "excerpt": sid,
                        "rank": rank_val,
                        "score": "Web",
                    }
                )

    return {
        "convo_uuid": str(convo["convo_uuid"]),
        "project_uuid": str(convo["project_uuid"]),
        "created_by": str(convo["created_by"]),
        "title": convo["title"],
        "visibility": convo["visibility"],
        "excluded_doc_uuids": [str(d) for d in excluded if d is not None],
        "created_at": convo["created_at"].isoformat() if convo["created_at"] else None,
        "updated_at": convo["updated_at"].isoformat() if convo["updated_at"] else None,
        "messages": [
            {
                "message_uuid": str(m["message_uuid"]),
                "convo_uuid": str(m["convo_uuid"]),
                "user_uuid": str(m["user_uuid"]) if m["user_uuid"] else None,
                "content": m["content"] or "",
                "type": m["type"],
                "status": m["status"],
                "mode": m["mode"] or "managed",
                "model": m["model"] or "gemini-2.5-flash",
                "input_tokens": int(m["input_tokens"] or 0),
                "output_tokens": int(m["output_tokens"] or 0),
                "source_scope": [str(s) for s in (m["source_scope"] or [])],
                "sources": sources_by_msg.get(str(m["message_uuid"]), []),
                "citations": citations_by_msg.get(str(m["message_uuid"]), []),
                "error": m["error"],
                "created_at": m["created_at"].isoformat() if m["created_at"] else None,
            }
            for m in msg_rows
        ],
    }


async def update_conversation(
    session: AsyncSession,
    *,
    project_uuid: str,
    convo_uuid: str,
    user_uuid: str,
    title: str | None = None,
    visibility: Literal["shared", "private"] | None = None,
) -> dict[str, Any]:
    """Update a conversation's title or visibility after access check."""
    await get_accessible_conversation(
        session,
        project_uuid=project_uuid,
        convo_uuid=convo_uuid,
        user_uuid=user_uuid,
    )
    clean_title = title.strip() if title is not None and title.strip() else None
    updated = (
        await session.execute(
            text(
                """
                UPDATE conversations
                SET title = COALESCE(:t, title),
                    visibility = COALESCE(:v, visibility),
                    updated_at = now()
                WHERE convo_uuid = :c AND project_uuid = :p AND deleted_at IS NULL
                RETURNING convo_uuid, project_uuid, created_by, title, visibility, created_at, updated_at
                """
            ),
            {"c": str(convo_uuid), "p": str(project_uuid), "t": clean_title, "v": visibility},
        )
    ).mappings().first()
    if updated is None:
        raise LookupError("Conversation not found in this project")
    excluded = (
        await session.execute(
            text("SELECT doc_uuid FROM conversation_excluded_sources WHERE convo_uuid = :c"),
            {"c": str(convo_uuid)},
        )
    ).scalars().all()
    return {
        "convo_uuid": str(updated["convo_uuid"]),
        "project_uuid": str(updated["project_uuid"]),
        "created_by": str(updated["created_by"]),
        "title": updated["title"],
        "visibility": updated["visibility"],
        "excluded_doc_uuids": [str(d) for d in excluded if d is not None],
        "created_at": updated["created_at"].isoformat() if updated["created_at"] else None,
        "updated_at": updated["updated_at"].isoformat() if updated["updated_at"] else None,
    }


async def delete_conversation(
    session: AsyncSession,
    *,
    project_uuid: str,
    convo_uuid: str,
    user_uuid: str,
) -> dict[str, Any]:
    """Soft-delete a conversation in `project_uuid`."""
    await get_accessible_conversation(
        session,
        project_uuid=project_uuid,
        convo_uuid=convo_uuid,
        user_uuid=user_uuid,
    )
    deleted = (
        await session.execute(
            text(
                """
                UPDATE conversations
                SET deleted_at = now(), updated_at = now()
                WHERE convo_uuid = :c AND project_uuid = :p AND deleted_at IS NULL
                RETURNING convo_uuid
                """
            ),
            {"c": str(convo_uuid), "p": str(project_uuid)},
        )
    ).scalar_one_or_none()
    if deleted is None:
        raise LookupError("Conversation not found in this project")
    return {"deleted": True, "convo_uuid": str(deleted)}


async def set_conversation_excluded_sources(
    session: AsyncSession,
    *,
    project_uuid: str,
    convo_uuid: str,
    excluded_doc_uuids: list[str],
) -> list[str]:
    """Replace `conversation_excluded_sources` for `convo_uuid` using only non-deleted docs in `project_uuid`."""
    valid_doc_rows = (
        await session.execute(
            text(
                """
                SELECT doc_uuid
                FROM documents
                WHERE project_uuid = :p AND deleted_at IS NULL
                """
            ),
            {"p": str(project_uuid)},
        )
    ).scalars().all()
    valid_set = {str(d) for d in valid_doc_rows}
    cleaned = [str(uuid.UUID(str(d))) for d in dict.fromkeys(excluded_doc_uuids) if str(d) in valid_set]

    await session.execute(
        text("DELETE FROM conversation_excluded_sources WHERE convo_uuid = :c"),
        {"c": str(convo_uuid)},
    )
    for did in cleaned:
        await session.execute(
            text(
                """
                INSERT INTO conversation_excluded_sources (convo_uuid, doc_uuid)
                VALUES (:c, :d)
                ON CONFLICT DO NOTHING
                """
            ),
            {"c": str(convo_uuid), "d": did},
        )
    await session.execute(
        text("UPDATE conversations SET updated_at = now() WHERE convo_uuid = :c"),
        {"c": str(convo_uuid)},
    )
    return cleaned


async def compute_source_scope(
    session: AsyncSession,
    *,
    project_uuid: str,
    convo_uuid: str | None = None,
    request_excluded_docs: list[str] | None = None,
) -> tuple[list[str], list[str], dict[str, dict[str, Any]]]:
    """Return `(source_scope_doc_uuids, excluded_doc_uuids, docs_meta_by_uuid)`.
    Follows D022: new uploads default to included; only documents in `conversation_excluded_sources`
    (or explicitly excluded in this request) are removed.
    """
    doc_rows = (
        await session.execute(
            text(
                """
                SELECT doc_uuid, filename, doc_kind, status, description, page_count
                FROM documents
                WHERE project_uuid = :p AND deleted_at IS NULL
                ORDER BY created_at ASC
                """
            ),
            {"p": str(project_uuid)},
        )
    ).mappings().all()

    docs_meta: dict[str, dict[str, Any]] = {}
    all_doc_ids: list[str] = []
    for r in doc_rows:
        did = str(r["doc_uuid"])
        all_doc_ids.append(did)
        docs_meta[did] = {
            "doc_uuid": did,
            "filename": r["filename"],
            "doc_kind": r["doc_kind"],
            "status": r["status"],
            "description": r["description"],
            "page_count": r["page_count"],
        }

    excluded_set: set[str] = {str(d) for d in (request_excluded_docs or [])}
    if convo_uuid is not None:
        convo_excluded = (
            await session.execute(
                text("SELECT doc_uuid FROM conversation_excluded_sources WHERE convo_uuid = :c"),
                {"c": str(convo_uuid)},
            )
        ).scalars().all()
        excluded_set.update(str(d) for d in convo_excluded if d is not None)

    source_scope = [did for did in all_doc_ids if did not in excluded_set]
    return source_scope, sorted(excluded_set), docs_meta


async def record_message_sources(
    session: AsyncSession,
    *,
    message_uuid: str,
    sources: list[dict[str, Any]],
) -> None:
    """Persist validated citation rows in `message_sources`."""
    for src in sources:
        await session.execute(
            text(
                """
                INSERT INTO message_sources (message_uuid, source_kind, source_id, rank)
                VALUES (:m, :sk, :sid, :rank)
                ON CONFLICT (message_uuid, source_kind, source_id)
                DO UPDATE SET rank = EXCLUDED.rank
                """
            ),
            {
                "m": str(message_uuid),
                "sk": str(src["source_kind"]),
                "sid": str(src["source_id"]),
                "rank": int(src["rank"]),
            },
        )
