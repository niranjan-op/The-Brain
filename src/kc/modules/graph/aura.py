"""Neo4j AuraDB connection, schema initialization, and availability checks."""
from __future__ import annotations

from typing import Any

import certifi
from neo4j import AsyncDriver, AsyncGraphDatabase, TrustCustomCAs

from src.kc.core.config import settings

_DRIVER: AsyncDriver | None = None

# `+s` schemes verify against the OS trust store, which on some Windows machines lacks the
# root used by Aura's chain ("self-signed certificate in certificate chain"). Keep full
# verification but trust certifi's Mozilla CA bundle instead.
_VERIFIED_TLS_SCHEMES = {"neo4j+s": "neo4j", "bolt+s": "bolt"}


def _driver_target(uri: str) -> tuple[str, dict[str, Any]]:
    scheme, sep, rest = uri.partition("://")
    plain = _VERIFIED_TLS_SCHEMES.get(scheme)
    if not sep or plain is None:
        return uri, {}
    return f"{plain}://{rest}", {
        "encrypted": True,
        "trusted_certificates": TrustCustomCAs(certifi.where()),
    }

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
    uri, tls_config = _driver_target(settings.neo4j_uri)
    _DRIVER = AsyncGraphDatabase.driver(
        uri,
        auth=(settings.neo4j_username, settings.neo4j_password),
        connection_timeout=3.0,
        max_transaction_retry_time=2.0,
        **tls_config,
    )
    return _DRIVER


async def close_driver() -> None:
    global _DRIVER
    if _DRIVER is not None:
        await _DRIVER.close()
        _DRIVER = None


async def init_aura_schema() -> None:
    try:
        driver = get_driver()
        async with driver.session(database=settings.neo4j_database) as session:
            for query in SCHEMA_QUERIES:
                await session.run(query)
    except AuraUnavailableError:
        raise
    except Exception as exc:
        raise AuraUnavailableError(f"Aura schema initialization failed: {exc}") from exc


async def check_aura_health() -> dict[str, Any]:
    try:
        driver = get_driver()
        await driver.verify_connectivity()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}
    return {"ok": True}

