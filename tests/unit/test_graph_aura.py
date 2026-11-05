import pytest

from src.kc.modules.graph import aura, gateway, read_tools, sync


async def test_init_aura_schema_runs_constraints_and_indexes(monkeypatch):
    executed_cypher: list[str] = []

    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def run(self, query, **kwargs):
            executed_cypher.append(query.strip())

    class FakeDriver:
        def session(self, **kwargs):
            return FakeSession()

    monkeypatch.setattr(aura, "get_driver", lambda: FakeDriver())
    await aura.init_aura_schema()

    assert any("CONSTRAINT node_uuid_unique" in q for q in executed_cypher)
    assert any("INDEX node_project_type" in q for q in executed_cypher)


async def test_check_aura_health_handles_unavailable(monkeypatch):
    class BrokenDriver:
        async def verify_connectivity(self):
            raise RuntimeError("Instance is paused")

    monkeypatch.setattr(aura, "get_driver", lambda: BrokenDriver())
    status = await aura.check_aura_health()
    assert status["ok"] is False
    assert "paused" in status["error"].lower()


async def test_gateway_create_node_returns_candidates_on_duplicate_name(monkeypatch):
    class FakeResult:
        def __init__(self, rows=None, scalar=None):
            self._rows = rows or []
            self._scalar = scalar

        def mappings(self):
            return self

        def all(self):
            return self._rows

        def first(self):
            return self._rows[0] if self._rows else None

        def scalar_one_or_none(self):
            return self._scalar

        def scalar_one(self):
            return self._scalar

    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def execute(self, stmt, params=None):
            sql = str(stmt)
            if "SELECT max_graph_nodes" in sql:
                return FakeResult(scalar=500)
            if "SELECT count(*)" in sql:
                return FakeResult(scalar=10)
            if "lower(name) = lower(:name)" in sql:
                return FakeResult(
                    rows=[
                        {
                            "node_uuid": "existing-uuid-1",
                            "name": "Use PostgreSQL",
                            "type": "Decision",
                            "summary": "Primary relational store",
                            "aliases": ["Postgres"],
                        }
                    ]
                )
            return FakeResult()

        async def commit(self):
            pass

    monkeypatch.setattr(gateway, "SessionLocal", lambda: FakeSession())
    monkeypatch.setattr(gateway, "embed_document", lambda text: _async_val([0.1] * 768))

    res = await gateway.create_or_merge_node(
        project_uuid="p1",
        node_type="Decision",
        name="Use PostgreSQL",
        summary="Relational DB",
    )
    assert res["status"] == "duplicate_candidates"
    assert res["candidates"][0]["node_uuid"] == "existing-uuid-1"


async def test_gateway_create_node_succeeds_when_embedder_fails_and_computes_outside_session(monkeypatch):
    session_open = False
    executed_inserts: list[tuple[str, dict]] = []

    class FakeResult:
        def __init__(self, rows=None, scalar=None):
            self._rows = rows or []
            self._scalar = scalar

        def mappings(self):
            return self

        def all(self):
            return self._rows

        def first(self):
            return self._rows[0] if self._rows else None

        def scalar_one_or_none(self):
            return self._scalar

        def scalar_one(self):
            return self._scalar

    class FakeSession:
        async def __aenter__(self):
            nonlocal session_open
            session_open = True
            return self

        async def __aexit__(self, *args):
            nonlocal session_open
            session_open = False

        async def execute(self, stmt, params=None):
            sql = str(stmt)
            if "SELECT max_graph_nodes" in sql:
                return FakeResult(scalar=500)
            if "SELECT count(*)" in sql:
                return FakeResult(scalar=1)
            if "INSERT INTO nodes" in sql:
                executed_inserts.append((sql, params or {}))
            return FakeResult()

        async def commit(self):
            pass

    async def failing_embed(text_input: str):
        # Must be called when no DB session is held open
        assert session_open is False, "embed_document must run outside DB session"
        raise RuntimeError("Embedding provider unavailable")

    monkeypatch.setattr(gateway, "SessionLocal", lambda: FakeSession())
    monkeypatch.setattr(gateway, "embed_document", failing_embed)

    res = await gateway.create_or_merge_node(
        project_uuid="p1",
        node_type="Decision",
        name="Use Cloud SQL",
        summary="Managed PG 17",
        action="create_new",
    )
    assert res["status"] == "created"
    assert res["embedding_status"] == "pending_backfill"
    assert len(executed_inserts) == 1
    _, params = executed_inserts[0]
    assert params["vec"] is None
    assert params["embed_model"] is None
    assert params["dims"] is None


async def test_gateway_update_node_reembeds_outside_session(monkeypatch):
    session_open = False
    updated_params: list[dict] = []

    class FakeResult:
        def __init__(self, rows=None):
            self._rows = rows or []

        def mappings(self):
            return self

        def first(self):
            return self._rows[0] if self._rows else None

    class FakeSession:
        async def __aenter__(self):
            nonlocal session_open
            session_open = True
            return self

        async def __aexit__(self, *args):
            nonlocal session_open
            session_open = False

        async def execute(self, stmt, params=None):
            sql = str(stmt)
            if "SELECT node_uuid" in sql:
                return FakeResult(
                    rows=[
                        {
                            "node_uuid": "n1",
                            "type": "Decision",
                            "role": "Decision",
                            "layer": "Why",
                            "name": "Old Name",
                            "summary": "Old summary",
                            "text": "Old text",
                            "aliases": ["Alias1"],
                            "status": "agreed",
                        }
                    ]
                )
            if "UPDATE nodes" in sql:
                updated_params.append(params or {})
            return FakeResult()

        async def commit(self):
            pass

    async def fake_embed(text_input: str):
        assert session_open is False, "embed_document in update_node must run outside DB session"
        return [0.25] * 768

    monkeypatch.setattr(gateway, "SessionLocal", lambda: FakeSession())
    monkeypatch.setattr(gateway, "embed_document", fake_embed)

    res = await gateway.update_node(
        project_uuid="p1",
        node_uuid="n1",
        name="New Name",
        summary="New summary",
    )
    assert res["status"] == "updated"
    assert len(updated_params) == 1
    assert updated_params[0]["dims"] == 768
    assert updated_params[0]["embed_model"] is not None
    assert updated_params[0]["vec"] is not None



async def test_gateway_create_edge_validates_supersedes_scope():
    with pytest.raises(ValueError, match="SUPERSEDES edge requires scope"):
        await gateway.create_edge(
            project_uuid="p1",
            src_node="n1",
            dst_node="n2",
            edge_type="SUPERSEDES",
            scope=None,
        )

    with pytest.raises(ValueError, match="partial SUPERSEDES requires non-empty aspects"):
        await gateway.create_edge(
            project_uuid="p1",
            src_node="n1",
            dst_node="n2",
            edge_type="SUPERSEDES",
            scope="partial",
            aspects=[],
        )


async def test_sync_project_to_aura_applies_changes_and_updates_sync_state(monkeypatch):
    cypher_calls: list[tuple[str, dict]] = []
    sql_calls: list[tuple[str, dict]] = []

    class FakePgResult:
        def __init__(self, rows=None, scalar=None):
            self._rows = rows or []
            self._scalar = scalar

        def mappings(self):
            return self

        def all(self):
            return self._rows

        def scalar_one_or_none(self):
            return self._scalar

    class FakePgSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def execute(self, stmt, params=None):
            sql = str(stmt)
            sql_calls.append((sql, params or {}))
            if "SELECT last_applied_change_id" in sql:
                return FakePgResult(scalar=0)
            if "FROM graph_changes" in sql:
                return FakePgResult(
                    rows=[
                        {
                            "change_id": 10,
                            "op": "upsert_node",
                            "payload": {
                                "node_uuid": "n1",
                                "project_uuid": "p1",
                                "type": "Decision",
                                "name": "Use Postgres",
                                "summary": "ACID + pgvector",
                                "status": "agreed",
                                "aliases": [],
                            },
                        },
                        {
                            "change_id": 11,
                            "op": "upsert_edge",
                            "payload": {
                                "edge_uuid": "e1",
                                "project_uuid": "p1",
                                "src_node": "n1",
                                "dst_node": "n2",
                                "type": "SUPERSEDES",
                                "scope": "full",
                                "aspects": [],
                                "status": "agreed",
                            },
                        },
                    ]
                )
            return FakePgResult()

        async def commit(self):
            pass

    class FakeNeoSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def run(self, query, **params):
            cypher_calls.append((query.strip(), params))

    class FakeNeoDriver:
        def session(self, **kwargs):
            return FakeNeoSession()

    monkeypatch.setattr(sync, "SessionLocal", lambda: FakePgSession())
    monkeypatch.setattr(sync, "get_driver", lambda: FakeNeoDriver())

    result = await sync.sync_project_to_aura("p1")
    assert result["applied"] == 2
    assert result["last_applied_change_id"] == 11
    assert len(cypher_calls) == 2
    assert any("INSERT INTO graph_sync_state" in sql for sql, _ in sql_calls)


async def test_read_tools_filters_excluded_source_nodes(monkeypatch):
    class FakePgResult:
        def __init__(self, rows=None):
            self._rows = rows or []

        def mappings(self):
            return self

        def all(self):
            return self._rows

    class FakePgSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def execute(self, stmt, params=None):
            sql = str(stmt)
            if "FROM nodes n" in sql:
                # Simulate n1 allowed (evidence from doc-1), n2 has evidence only from excluded doc-2
                return FakePgResult(
                    rows=[
                        {
                            "node_uuid": "n1",
                            "type": "Question",
                            "role": "Question",
                            "layer": "Why",
                            "name": "Which queue?",
                            "summary": "Need background worker queue",
                            "text": "Should we use Postgres jobs table or Celery?",
                            "status": "open",
                            "doc_uuids": ["doc-1"],
                        },
                        {
                            "node_uuid": "n2",
                            "type": "Question",
                            "role": "Question",
                            "layer": "Why",
                            "name": "Secret question from excluded doc",
                            "summary": "Should be filtered out",
                            "text": "Excluded text",
                            "status": "open",
                            "doc_uuids": ["doc-2"],
                        },
                    ]
                )
            return FakePgResult()

    monkeypatch.setattr(read_tools, "SessionLocal", lambda: FakePgSession())

    questions = await read_tools.open_questions("p1", excluded_docs=["doc-2"])
    assert len(questions) == 1
    assert questions[0]["node_uuid"] == "n1"


async def test_extract_and_sync_document_graph_writes_nodes_edges_and_syncs_aura(monkeypatch):
    from src.kc.modules.graph import extractor

    llm_json = """{
      "nodes": [
        {"name": "Obsidian Vault", "type": "DataStore", "status": "agreed", "summary": "Local-first markdown note vault", "description": "Stores notes locally as encrypted markdown files on disk.", "aliases": [], "chunk_id": "c1", "excerpt": "Local-first encrypted storage"},
        {"name": "Note Editor Module", "type": "Module", "status": "agreed", "summary": "Formats markdown and wiki links", "description": "Renders headings, tables, and [[wiki links]] as the user types.", "aliases": [], "chunk_id": "c1", "excerpt": "Create a note or link with [[Note title]]"}
      ],
      "edges": [
        {"src_name": "Note Editor Module", "dst_name": "Obsidian Vault", "type": "WRITES", "kind": "", "scope": "none", "aspects": [], "chunk_id": "c1", "excerpt": "tables and [[wiki links]] format as you type"}
      ]
    }"""

    monkeypatch.setattr(extractor, "_call_graph_llm", lambda prompt: _async_val(extractor.GraphExtraction.model_validate_json(llm_json)))

    created_nodes: list[dict] = []
    created_edges: list[dict] = []
    synced_projects: list[str] = []

    async def fake_create_or_merge_node(**kwargs):
        created_nodes.append(kwargs)
        return {"status": "created", "node_uuid": f"uuid-{kwargs['name']}"}

    async def fake_create_edge(**kwargs):
        created_edges.append(kwargs)
        return {"status": "created", "edge_uuid": "edge-1"}

    async def fake_sync(project_uuid: str):
        synced_projects.append(project_uuid)
        return {"applied": 3, "last_applied_change_id": 3}

    monkeypatch.setattr(extractor, "create_or_merge_node", fake_create_or_merge_node)
    monkeypatch.setattr(extractor, "create_edge", fake_create_edge)
    monkeypatch.setattr(extractor, "sync_project_to_aura", fake_sync)

    res = await extractor.extract_and_sync_document_graph(
        project_uuid="p1",
        doc_uuid="d1",
        user_uuid="u1",
        filename="Welcome.md",
        chunks=[{"chunk_id": "c1", "heading_path": "Intro", "text": "Local-first encrypted storage with [[Note title]]"}],
    )

    assert res["nodes_processed"] == 2
    assert res["edges_processed"] == 1
    assert synced_projects == ["p1"]
    assert created_nodes[0]["body_text"] == "Stores notes locally as encrypted markdown files on disk."
    assert created_edges[0]["src_node"] == "uuid-Note Editor Module"
    assert created_edges[0]["dst_node"] == "uuid-Obsidian Vault"
    assert created_edges[0]["edge_type"] == "WRITES"


async def test_allowed_node_ids_lru_cache_and_soft_delete_invalidation(monkeypatch):
    read_tools.invalidate_allowed_nodes_cache()
    state_version = {"max_change_id": 5, "active_doc_count": 2, "max_deleted_at": "none", "ev_count": 2}
    id_queries = 0

    class FakePgResult:
        def __init__(self, rows=None):
            self._rows = rows or []

        def mappings(self):
            return self

        def all(self):
            return self._rows

        def first(self):
            return self._rows[0] if self._rows else None

    class FakePgSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def execute(self, stmt, params=None):
            nonlocal id_queries
            sql = str(stmt)
            if "AS max_change_id" in sql:
                return FakePgResult(rows=[state_version])
            if "FROM nodes n" in sql:
                id_queries += 1
                return FakePgResult(
                    rows=[
                        {"node_uuid": "n1", "doc_uuids": ["doc-1"], "active_doc_uuids": ["doc-1"]},
                        {"node_uuid": "n2", "doc_uuids": ["doc-2"], "active_doc_uuids": []},
                    ]
                )
            return FakePgResult()

    monkeypatch.setattr(read_tools, "SessionLocal", lambda: FakePgSession())

    allowed_1 = await read_tools.get_allowed_node_ids("p1", excluded_docs=None, convo_uuid="c1")
    # n2 only had evidence from soft-deleted doc-2 (active_doc_uuids is empty), so it must be excluded!
    assert allowed_1 == {"n1"}
    assert id_queries == 1

    # Second call with same state fingerprint hits cache
    allowed_2 = await read_tools.get_allowed_node_ids("p1", excluded_docs=None, convo_uuid="c1")
    assert allowed_2 == {"n1"}
    assert id_queries == 1

    # Soft-deleting or adding a document changes fingerprint and invalidates cache
    state_version["active_doc_count"] = 1
    await read_tools.get_allowed_node_ids("p1", excluded_docs=None, convo_uuid="c1")
    assert id_queries == 2


async def test_expand_subgraph_enforces_seed_first_and_neighbour_caps(monkeypatch):
    read_tools.invalidate_allowed_nodes_cache()
    hydrated_requested_ids: list[list[str]] = []

    async def fake_get_allowed(project_uuid, excluded_docs=None, convo_uuid=None):
        return {"s1", "s2", "n1", "n2", "n3", "n4", "n5", "n6"}

    class FakePgResult:
        def __init__(self, rows=None):
            self._rows = rows or []

        def mappings(self):
            return self

        def all(self):
            return self._rows

    class FakePgSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def execute(self, stmt, params=None):
            sql = str(stmt)
            if "FROM edges" in sql:
                # Hub s1 has 6 outgoing edges: 5 What-layer (FLOWS_TO) and 1 Why-layer (SUPERSEDES to n6) + 1 edge to seed s2
                return FakePgResult(
                    rows=[
                        {"edge_uuid": "e-seed", "src_node": "s1", "dst_node": "s2", "type": "FLOWS_TO", "kind": None, "scope": None, "aspects": []},
                        {"edge_uuid": "e1", "src_node": "s1", "dst_node": "n1", "type": "FLOWS_TO", "kind": None, "scope": None, "aspects": []},
                        {"edge_uuid": "e2", "src_node": "s1", "dst_node": "n2", "type": "FLOWS_TO", "kind": None, "scope": None, "aspects": []},
                        {"edge_uuid": "e3", "src_node": "s1", "dst_node": "n3", "type": "FLOWS_TO", "kind": None, "scope": None, "aspects": []},
                        {"edge_uuid": "e4", "src_node": "s1", "dst_node": "n4", "type": "FLOWS_TO", "kind": None, "scope": None, "aspects": []},
                        {"edge_uuid": "e5", "src_node": "s1", "dst_node": "n5", "type": "FLOWS_TO", "kind": None, "scope": None, "aspects": []},
                        {"edge_uuid": "e-why", "src_node": "s1", "dst_node": "n6", "type": "SUPERSEDES", "kind": None, "scope": "full", "aspects": []},
                    ]
                )
            if "FROM nodes n" in sql and "ANY" in sql:
                req = list((params or {}).get("nids") or [])
                hydrated_requested_ids.append(req)
                return FakePgResult(
                    rows=[
                        {
                            "node_uuid": nid,
                            "type": "Decision" if nid == "n6" else "Module",
                            "role": "Decision" if nid == "n6" else "Structure",
                            "layer": "Why" if nid == "n6" else "What",
                            "name": f"Node {nid}",
                            "summary": f"Summary {nid}",
                            "text": f"Text {nid}",
                            "status": "agreed",
                            "doc_uuids": ["doc-1"],
                            "active_doc_uuids": ["doc-1"],
                        }
                        for nid in req
                    ]
                )
            if "FROM node_evidence ne" in sql:
                return FakePgResult(rows=[])
            return FakePgResult()

    monkeypatch.setattr(read_tools, "get_allowed_node_ids", fake_get_allowed)
    monkeypatch.setattr(read_tools, "SessionLocal", lambda: FakePgSession())

    sub = await read_tools.expand_subgraph(
        project_uuid="p1",
        seed_node_uuids=["s1", "s2"],
        max_neighbours_per_seed=3,
        max_subgraph_nodes=4,
    )
    node_ids = [n["node_uuid"] for n in sub["nodes"]]
    # Both seeds s1 and s2 MUST be included first; then at most 2 neighbours (max_subgraph_nodes=4),
    # and Why-layer n6 (SUPERSEDES) must beat What-layer FLOWS_TO neighbours!
    assert node_ids[:2] == ["s1", "s2"]
    assert "n6" in node_ids
    assert len(node_ids) == 4
    assert sub["graph_source"] == "postgres"
    assert len(hydrated_requested_ids) == 1
    assert set(hydrated_requested_ids[0]) == set(node_ids)



async def _async_val(v):
    return v

