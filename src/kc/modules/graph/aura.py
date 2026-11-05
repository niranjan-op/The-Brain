"""Neo4j AuraDB connection, schema initialization, and availability checks."""
from __future__ import annotations

from typing import Any

from neo4j import AsyncDriver, AsyncGraphDatabase

from src.kc.core.config import settings

_DRIVER: AsyncDriver | None = None

SCHEMA_QUERIES = (
    "CREATE CONSTRAINT node_uuid_unique IF NOT EXISTS FOR (n:Node) REQUIRE n.node_uuid IS UNIQUE",
    "CREATE INDEX node_project_type IF NOT EXISTS FOR (n:Node) ON (n.project_uuid, n.type)",
    "CREATE INDEX node_project_name IF NOT EXISTS FOR (n:Node) ON (n.project_uuid, n.name)",
)


class AuraUnavailableError(RuntimeError):
    """Raised when Neo4j Aura Free is paused or unreachable."""


def get_driver() -> AsyncDriver:
    global _DRIVER
    if _DRIVER is not None:
        return _DRIVER
    if not (settings.neo4j_uri and settings.neo4j_username and settings.neo4j_password):
        raise AuraUnavailableError("NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD must be configured")
    _DRIVER = AsyncGraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_username, settings.neo4j_password),
    )
    return _DRIVER


async def close_driver() -> None:
    global _DRIVER
    if _DRIVER is not None:
        await _DRIVER.close()
        _DRIVER = None


async def init_aura_schema() -> None:
    driver = get_driver()
    async with driver.session(database=settings.neo4j_database) as session:
        for query in SCHEMA_QUERIES:
            await session.run(query)


async def check_aura_health() -> dict[str, Any]:
    try:
        driver = get_driver()
        await driver.verify_connectivity()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}
    return {"ok": True}

