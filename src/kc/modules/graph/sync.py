"""Sync worker and full replay from Postgres source-of-truth to Neo4j AuraDB (D003, D017).

AuraDB holds ONLY the graph structure (nodes + edges); node descriptions (`summary`, `text`)
and `evidence` stay in Postgres.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text

from src.kc.core.config import settings
from src.kc.core.db import SessionLocal
from src.kc.modules.graph.aura import AuraUnavailableError, get_driver
from src.kc.modules.graph.gateway import ALLOWED_EDGE_TYPES

UPSERT_NODE_CYPHER = """
MERGE (n:Node {node_uuid: $node_uuid})
SET n.project_uuid = $project_uuid,
    n.type = $type,
    n.role = $role,
    n.layer = $layer,
    n.name = $name,
    n.status = $status,
    n.aliases = $aliases
REMOVE n.summary, n.text, n.source_doc_uuids
"""

DELETE_NODE_CYPHER = """
MATCH (n:Node {node_uuid: $node_uuid, project_uuid: $project_uuid})
DETACH DELETE n
"""

DELETE_EDGE_CYPHER = """
MATCH (:Node {project_uuid: $project_uuid})-[r {edge_uuid: $edge_uuid}]->(:Node {project_uuid: $project_uuid})
DELETE r
"""


def _edge_cypher(rel_type: str) -> str:
    safe_rel = rel_type if rel_type in ALLOWED_EDGE_TYPES else "REL"
    return f"""
    MATCH (s:Node {{node_uuid: $src_node, project_uuid: $project_uuid}})
    MATCH (d:Node {{node_uuid: $dst_node, project_uuid: $project_uuid}})
    MERGE (s)-[r:{safe_rel} {{edge_uuid: $edge_uuid}}]->(d)
    SET r.project_uuid = $project_uuid,
        r.type = $type,
        r.kind = $kind,
        r.scope = $scope,
        r.aspects = $aspects,
        r.status = $status
    """


async def _apply_change(neo_session: Any, op: str, payload: dict[str, Any]) -> None:
    if op == "upsert_node":
        await neo_session.run(
            UPSERT_NODE_CYPHER,
            node_uuid=str(payload["node_uuid"]),
            project_uuid=str(payload["project_uuid"]),
            type=payload.get("type", "Module"),
            role=payload.get("role", "Structure"),
            layer=payload.get("layer", "What"),
            name=payload.get("name", ""),
            status=payload.get("status", "agreed"),
            aliases=payload.get("aliases") or [],
        )
    elif op == "upsert_edge":
        edge_type = str(payload.get("type", "JUSTIFIES"))
        await neo_session.run(
            _edge_cypher(edge_type),
            edge_uuid=str(payload["edge_uuid"]),
            project_uuid=str(payload["project_uuid"]),
            src_node=str(payload["src_node"]),
            dst_node=str(payload["dst_node"]),
            type=edge_type,
            kind=payload.get("kind"),
            scope=payload.get("scope"),
            aspects=payload.get("aspects") or [],
            status=payload.get("status", "agreed"),
        )
    elif op == "delete_node":
        await neo_session.run(
            DELETE_NODE_CYPHER,
            node_uuid=str(payload["node_uuid"]),
            project_uuid=str(payload["project_uuid"]),
        )
    elif op == "delete_edge":
        await neo_session.run(
            DELETE_EDGE_CYPHER,
            edge_uuid=str(payload["edge_uuid"]),
            project_uuid=str(payload["project_uuid"]),
        )


async def sync_project_to_aura(project_uuid: str) -> dict[str, Any]:
    """Apply pending `graph_changes` rows for `project_uuid` in order and advance `graph_sync_state`."""
    async with SessionLocal() as pg:
        last_id = (
            await pg.execute(
                text("SELECT last_applied_change_id FROM graph_sync_state WHERE project_uuid = :p"),
                {"p": project_uuid},
            )
        ).scalar_one_or_none() or 0

        changes = (
            await pg.execute(
                text(
                    """
                    SELECT change_id, op, payload
                    FROM graph_changes
                    WHERE project_uuid = :p AND change_id > :last_id
                    ORDER BY change_id ASC
                    """
                ),
                {"p": project_uuid, "last_id": last_id},
            )
        ).mappings().all()

    if not changes:
        return {"applied": 0, "last_applied_change_id": last_id}

    try:
        driver = get_driver()
        async with driver.session(database=settings.neo4j_database) as neo:
            for row in changes:
                await _apply_change(neo, row["op"], row["payload"])
    except Exception as exc:
        raise AuraUnavailableError(f"Failed to sync changes to AuraDB: {exc}") from exc

    new_last_id = int(changes[-1]["change_id"])
    async with SessionLocal() as pg:
        await pg.execute(
            text(
                """
                INSERT INTO graph_sync_state (project_uuid, last_applied_change_id, updated_at)
                VALUES (:p, :last_id, now())
                ON CONFLICT (project_uuid) DO UPDATE
                SET last_applied_change_id = EXCLUDED.last_applied_change_id, updated_at = now()
                """
            ),
            {"p": project_uuid, "last_id": new_last_id},
        )
        await pg.commit()

    return {"applied": len(changes), "last_applied_change_id": new_last_id}


async def replay_project_to_aura(project_uuid: str) -> dict[str, int]:
    """Wipe a project's subgraph in AuraDB and rebuild it from Postgres `nodes` and `edges`."""
    async with SessionLocal() as pg:
        nodes = (
            await pg.execute(
                text(
                    """
                    SELECT node_uuid, project_uuid, type, role, layer, name, status, aliases
                    FROM nodes WHERE project_uuid = :p
                    """
                ),
                {"p": project_uuid},
            )
        ).mappings().all()
        edges = (
            await pg.execute(
                text(
                    """
                    SELECT edge_uuid, project_uuid, src_node, dst_node, type, kind, scope, aspects, status
                    FROM edges WHERE project_uuid = :p
                    """
                ),
                {"p": project_uuid},
            )
        ).mappings().all()
        max_change = (
            await pg.execute(
                text("SELECT coalesce(max(change_id), 0) FROM graph_changes WHERE project_uuid = :p"),
                {"p": project_uuid},
            )
        ).scalar_one()

    driver = get_driver()
    async with driver.session(database=settings.neo4j_database) as neo:
        await neo.run("MATCH (n:Node {project_uuid: $p}) DETACH DELETE n", p=str(project_uuid))
        for n in nodes:
            await _apply_change(neo, "upsert_node", dict(n))
        for e in edges:
            await _apply_change(neo, "upsert_edge", dict(e))

    async with SessionLocal() as pg:
        await pg.execute(
            text(
                """
                INSERT INTO graph_sync_state (project_uuid, last_applied_change_id, updated_at)
                VALUES (:p, :last_id, now())
                ON CONFLICT (project_uuid) DO UPDATE
                SET last_applied_change_id = EXCLUDED.last_applied_change_id, updated_at = now()
                """
            ),
            {"p": project_uuid, "last_id": int(max_change)},
        )
        await pg.commit()

    return {"nodes": len(nodes), "edges": len(edges)}
