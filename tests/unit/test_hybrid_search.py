from __future__ import annotations

import uuid
import pytest

from src.kc.modules.search import hybrid, keyword


def test_partition_table_name_validates_uuid_and_matches_trigger():
    pid = "3a2ab1f5-c04b-41ef-ad39-3ac7b2a88a3a"
    tbl, idx = keyword.partition_table_name(pid)
    assert tbl == "chunks_3a2ab1f5c04b41efad393ac7b2a88a3a"
    assert idx == "chunks_3a2ab1f5c04b41efad393ac7b2a88a3a_embed_text_idx"

    with pytest.raises(ValueError):
        keyword.partition_table_name("not-a-valid-uuid; DROP TABLE chunks;")


def test_fuse_rrf_combines_ranks_and_deduplicates():
    vec_ranked = ["c1", "c2", "c3"]
    kw_ranked = ["c2", "c4", "c1"]

    fused = hybrid.fuse_rrf([vec_ranked, kw_ranked], k=3, rrf_k=60)
    ids = [cid for cid, _ in fused]
    # c2 is rank 1 in vec (1/62) + rank 0 in kw (1/61) = 0.032522
    # c1 is rank 0 in vec (1/61) + rank 2 in kw (1/63) = 0.032266
    assert ids[:2] == ["c2", "c1"]
    assert len(ids) == 3


async def test_bm25_search_uses_2arg_to_bm25query_and_filters_zeros():
    executed_sql: list[tuple[str, dict]] = []

    class FakeRow:
        def __init__(self, chunk_id: str, score: float):
            self.chunk_id = chunk_id
            self.score = score

    class FakeResult:
        def __init__(self, rows):
            self._rows = rows

        def all(self):
            return self._rows

    class FakeSession:
        async def execute(self, stmt, params=None):
            executed_sql.append((str(stmt), params or {}))
            return FakeResult([FakeRow("c1", 1.42), FakeRow("c2", -0.0), FakeRow("c3", 0.0)])

    pid = str(uuid.uuid4())
    searcher = keyword.Bm25Search()
    hits = await searcher.search(FakeSession(), pid, "bm25 ranking", k=5, excluded_docs=["00000000-0000-0000-0000-000000000099"])

    assert hits == [("c1", 1.42)]
    sql, params = executed_sql[0]
    assert "to_bm25query(:q, :idx)" in sql
    assert f"FROM chunks_{uuid.UUID(pid).hex}" in sql
    assert params["idx"] == f"chunks_{uuid.UUID(pid).hex}_embed_text_idx"
    assert params["has_excluded"] is True


async def test_keyword_chunk_search_uses_savepoint_and_narrows_fallback_errors(monkeypatch):
    monkeypatch.setattr(hybrid.settings, "keyword_engine", "bm25")
    savepoint_entered = False

    class FakeSavepoint:
        async def __aenter__(self):
            nonlocal savepoint_entered
            savepoint_entered = True
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

    class FakeRow:
        def __init__(self, chunk_id: str, score: float):
            self.chunk_id = chunk_id
            self.score = score

    class FakeResult:
        def __init__(self, rows):
            self._rows = rows

        def all(self):
            return self._rows

    class FakeSessionMissingExt:
        def begin_nested(self):
            return FakeSavepoint()

        async def execute(self, stmt, params=None):
            sql = str(stmt)
            if "to_bm25query" in sql:
                raise RuntimeError("function to_bm25query(text, text) does not exist (SQLSTATE 42883)")
            return FakeResult([FakeRow("c-fts", 0.75)])

    hits, engine_used = await hybrid.keyword_chunk_search(
        FakeSessionMissingExt(),
        str(uuid.uuid4()),
        "hybrid search",
        k=5,
    )
    assert savepoint_entered is True
    assert engine_used == "tsvector"
    assert hits == [("c-fts", 0.75)]

    # Verify that a missing partition table (42P01) is NOT swallowed into tsvector fallback
    class FakeSessionMissingPartition:
        def begin_nested(self):
            return FakeSavepoint()

        async def execute(self, stmt, params=None):
            raise RuntimeError('relation "chunks_0000" does not exist (SQLSTATE 42P01)')

    with pytest.raises(RuntimeError, match="does not exist"):
        await hybrid.keyword_chunk_search(
            FakeSessionMissingPartition(),
            str(uuid.uuid4()),
            "hybrid search",
            k=5,
        )


async def test_vector_chunk_search_uses_relaxed_order_and_materialized_cte_when_excluded():
    executed_sql: list[str] = []

    class FakeSavepoint:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

    class FakeRow:
        def __init__(self, chunk_id: str, similarity: float):
            self.chunk_id = chunk_id
            self.similarity = similarity

    class FakeResult:
        def __init__(self, rows=None):
            self._rows = rows or []

        def all(self):
            return self._rows

    class FakeSession:
        def begin_nested(self):
            return FakeSavepoint()

        async def execute(self, stmt, params=None):
            sql = str(stmt)
            executed_sql.append(sql)
            if "SELECT chunk_id" in sql:
                return FakeResult([FakeRow("c1", 0.91), FakeRow("c2", 0.84)])
            return FakeResult()

    pid = str(uuid.uuid4())
    hits = await hybrid.vector_chunk_search(
        FakeSession(),
        pid,
        [0.1] * 768,
        k=4,
        excluded_docs=[str(uuid.uuid4())],
    )
    assert hits == [("c1", 0.91), ("c2", 0.84)]
    assert any("SET LOCAL hnsw.iterative_scan = 'relaxed_order'" in s for s in executed_sql)
    assert any("WITH relaxed AS MATERIALIZED" in s and "ORDER BY dist ASC" in s for s in executed_sql)


async def test_search_nodes_by_vector_accepts_null_embed_model_and_filters_allowed():
    from src.kc.modules.search import graph_rag

    executed_sql: list[tuple[str, dict]] = []

    class FakeRow:
        def __init__(self, node_uuid: str, similarity: float):
            self.node_uuid = node_uuid
            self.similarity = similarity

    class FakeResult:
        def __init__(self, rows):
            self._rows = rows

        def all(self):
            return self._rows

    class FakeSession:
        async def execute(self, stmt, params=None):
            executed_sql.append((str(stmt), params or {}))
            return FakeResult([FakeRow("00000000-0000-0000-0000-000000000011", 0.92)])

    pid = str(uuid.uuid4())
    allowed = {"00000000-0000-0000-0000-000000000011"}
    res = await graph_rag.search_nodes_by_vector(FakeSession(), pid, [0.1] * 768, allowed, k_nodes=5)

    assert res == [("00000000-0000-0000-0000-000000000011", 0.92)]
    sql, _ = executed_sql[0]
    assert "embed_model IS NULL OR embed_model = :model" in sql
    assert "dims IS NULL OR dims = :dims" in sql


async def test_retrieve_and_answer_two_phase_tool_loop_and_strict_shown_citation_filter(monkeypatch):
    from src.kc.modules.search import graph_rag

    pid = str(uuid.uuid4())
    n1 = "00000000-0000-0000-0000-000000000011"
    n2 = "00000000-0000-0000-0000-000000000022"
    n_unshown = "00000000-0000-0000-0000-000000000099"

    async def fake_retrieve_context(*args, **kwargs):
        return {
            "chunks": [
                {
                    "chunk_id": "c1",
                    "doc_uuid": "00000000-0000-0000-0000-000000000101",
                    "ordinal": 0,
                    "kind": "text",
                    "heading_path": "Architecture",
                    "page_start": 1,
                    "page_end": 1,
                    "text": "D012 replaced Firestore with Postgres + pgvector.",
                    "payload": {},
                    "node_uuid": n1,
                    "score": 0.032,
                    "vec_rank": 1,
                    "kw_rank": 1,
                    "keyword_engine": "bm25",
                }
            ],
            "graph": {
                "nodes": [
                    {
                        "node_uuid": n1,
                        "type": "Decision",
                        "role": "Decision",
                        "layer": "Why",
                        "name": "D012 Postgres Chunk Store",
                        "summary": "Use Postgres + pgvector instead of Firestore",
                        "text": "Replaced Firestore because Firestore lacks keyword search and meters 20k writes/day.",
                        "status": "agreed",
                        "is_seed": True,
                    }
                ],
                "relationships": [],
                "evidence_by_node": {
                    n1: [{"kind": "chunk", "ref": "c1", "doc_uuid": "00000000-0000-0000-0000-000000000101", "excerpt": "D012 replaced Firestore"}]
                },
                "graph_source": "postgres",
            },
            "embed_queries": 1,
        }

    llm_calls: list[dict] = []

    async def fake_tool_turn(messages, tools):
        llm_calls.append({"phase": "tool_turn", "has_tools": bool(tools)})
        if len(llm_calls) == 1:
            return {
                "tool_calls": [
                    {"name": "get_superseded_by", "args": {"node_uuid": n1}}
                ],
                "text": "",
            }
        return {"tool_calls": [], "text": "Ready to synthesize."}

    async def fake_structured_turn(prompt_text: str):
        llm_calls.append({"phase": "structured_final", "has_tools": False})
        # Model cites c1 (shown), c_guessed (NOT shown), n1 (shown), n2 (shown via tool), n_unshown (NOT shown)
        return graph_rag.GroundedAnswer(
            answer="D012 replaced Firestore with Postgres [c1], later moved to Cloud SQL in D026.",
            cited_chunk_ids=["c1", "c_guessed_unretrieved"],
            cited_node_uuids=[n1, n2, n_unshown],
        )

    async def fake_superseded_by(project_uuid, node_uuid, excluded_docs=None):
        return [
            {
                "superseding_node": {
                    "node_uuid": n2,
                    "type": "Decision",
                    "role": "Decision",
                    "layer": "Why",
                    "name": "D026 Cloud SQL Hosting",
                    "summary": "Managed Cloud SQL PG 17",
                    "text": "Supersedes self-hosted VM layout.",
                    "status": "agreed",
                },
                "scope": "partial",
                "aspects": ["hosting"],
            }
        ]

    monkeypatch.setattr(graph_rag, "retrieve_context", fake_retrieve_context)
    monkeypatch.setattr(graph_rag, "_call_tool_turn", fake_tool_turn)
    monkeypatch.setattr(graph_rag, "_call_structured_answer", fake_structured_turn)
    monkeypatch.setattr(graph_rag.read_tools, "superseded_by", fake_superseded_by)

    out = await graph_rag.retrieve_and_answer(
        project_uuid=pid,
        query="What superseded D003 and D012?",
        use_graph=True,
        use_tools=True,
        generate_answer=True,
    )

    assert out["metrics"]["tool_calls_used"] == 1
    assert out["metrics"]["llm_calls"] == 3  # 2 tool turns + 1 final no-tools structured call
    assert llm_calls[-1] == {"phase": "structured_final", "has_tools": False}
    # Only IDs actually shown to the model in initial context OR tool output are accepted!
    assert out["citations"] == {
        "chunk_ids": ["c1"],
        "node_uuids": [n1, n2],
    }
    assert out["rejected_citations"] == {
        "chunk_ids": ["c_guessed_unretrieved"],
        "node_uuids": [n_unshown],
    }


async def test_eval_harness_reports_raw_counts_and_graph_ablation():
    from src.kc.modules.search import eval as search_eval

    assert len(search_eval.VAULT_DOGFOOD_GOLD_SET) >= 5

    cases = [
        search_eval.EvalCase(
            query="Why was Supabase dropped?",
            expected_chunk_ids=["c_d015"],
            expected_node_uuids=["n_d015"],
        ),
        search_eval.EvalCase(
            query="What superseded D003 chunk store?",
            expected_chunk_ids=["c_d012"],
            expected_node_uuids=["n_d012"],
        ),
    ]

    async def fake_runner(mode: str, case: search_eval.EvalCase, k: int):
        if mode == "hybrid":
            return [case.expected_chunk_ids[0], "c_other"]
        return ["c_other"]

    report = await search_eval.evaluate_retrieval_with_runner(cases, k=2, runner=fake_runner)
    assert report["hybrid"]["hits_str"] == "2/2"
    assert report["hybrid"]["recall_at_k"] == 1.0
    assert report["vector"]["hits_str"] == "0/2"

    ans_cases = [
        search_eval.AnswerEvalCase(
            query="Why was Supabase dropped?",
            required_phrases=["500 MB", "pauses"],
            expected_citations=["c_d015", "n_d015"],
        )
    ]

    async def fake_answer_runner(case: search_eval.AnswerEvalCase, use_graph: bool):
        if use_graph:
            return {
                "answer": "Supabase free is 500 MB and pauses after 1 week idle.",
                "citations": {"chunk_ids": ["c_d015"], "node_uuids": ["n_d015"]},
            }
        return {
            "answer": "Supabase was considered.",
            "citations": {"chunk_ids": [], "node_uuids": []},
        }

    ans_report = await search_eval.evaluate_answers_with_runner(ans_cases, answer_runner=fake_answer_runner)
    assert ans_report["with_graph"]["correct_str"] == "1/1"
    assert ans_report["without_graph"]["correct_str"] == "0/1"


async def test_query_endpoint_auth_convo_visibility_and_rate_limit(monkeypatch):
    from httpx import ASGITransport, AsyncClient
    import main
    from src.kc.core.auth import get_current_user
    from src.kc.core.db import get_session
    from src.kc.core.rate_limit import query_rate_limiter

    query_rate_limiter.reset()
    user_uuid = "00000000-0000-0000-0000-000000000001"
    other_user = "00000000-0000-0000-0000-000000000002"
    proj_uuid = "00000000-0000-0000-0000-000000000010"
    convo_uuid = "00000000-0000-0000-0000-000000000050"
    excluded_doc = "00000000-0000-0000-0000-000000000102"

    is_member = True
    convo_row: dict | None = {"visibility": "shared", "created_by": user_uuid}
    captured_call: dict = {}

    class FakeResult:
        def __init__(self, row=None, scalars_list=None):
            self._row = row
            self._scalars = scalars_list or []

        def mappings(self):
            return self

        def first(self):
            return self._row

        def scalar_one_or_none(self):
            return self._row

        def scalars(self):
            return self

        def all(self):
            return self._scalars

    class FakeSession:
        async def execute(self, stmt, params=None):
            sql = str(stmt)
            if "FROM project_members" in sql:
                return FakeResult(row="owner" if is_member else None)
            if "FROM conversations" in sql:
                return FakeResult(row=convo_row)
            if "FROM conversation_excluded_sources" in sql:
                return FakeResult(scalars_list=[excluded_doc])
            return FakeResult()

    async def override_user():
        return {"user_uuid": user_uuid, "email": "u1@example.com"}

    async def override_session():
        yield FakeSession()

    async def fake_retrieve_and_answer(**kwargs):
        captured_call.update(kwargs)
        return {
            "answer": "Grounded response",
            "citations": {"chunk_ids": ["c1"], "node_uuids": []},
            "rejected_citations": {"chunk_ids": [], "node_uuids": []},
            "chunks": [],
            "graph": {"nodes": [], "relationships": [], "evidence_by_node": {}, "graph_source": "postgres"},
            "metrics": {"embed_queries": 1, "llm_calls": 1, "tool_calls_used": 0},
        }

    main.app.dependency_overrides[get_current_user] = override_user
    main.app.dependency_overrides[get_session] = override_session
    monkeypatch.setattr(main, "retrieve_and_answer", fake_retrieve_and_answer)

    try:
        transport = ASGITransport(app=main.app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Invalid project_uuid -> 422
            r_bad_uuid = await ac.post("/projects/not-a-uuid/query", json={"query": "hello"})
            assert r_bad_uuid.status_code == 422

            # 2. Non-member -> 403
            is_member = False
            r_forbidden = await ac.post(f"/projects/{proj_uuid}/query", json={"query": "hello"})
            assert r_forbidden.status_code == 403

            # 3. Private conversation owned by someone else -> 403
            is_member = True
            convo_row = {"visibility": "private", "created_by": other_user}
            r_priv = await ac.post(
                f"/projects/{proj_uuid}/query",
                json={"query": "hello", "convo_uuid": convo_uuid},
            )
            assert r_priv.status_code == 403

            # 4. Valid member + shared conversation -> 200 and merges conversation_excluded_sources
            convo_row = {"visibility": "shared", "created_by": other_user}
            r_ok = await ac.post(
                f"/projects/{proj_uuid}/query",
                json={
                    "query": "Why Cloud SQL?",
                    "convo_uuid": convo_uuid,
                    "search_mode": "hybrid",
                    "use_graph": True,
                    "use_tools": False,
                },
            )
            assert r_ok.status_code == 200
            assert r_ok.json()["answer"] == "Grounded response"
            assert excluded_doc in captured_call["excluded_docs"]
            assert captured_call["use_tools"] is False

            # 5. Exceed rate limit -> 429
            query_rate_limiter.max_requests = 1
            r_limited = await ac.post(f"/projects/{proj_uuid}/query", json={"query": "second call"})
            assert r_limited.status_code == 429
    finally:
        query_rate_limiter.max_requests = 10
        query_rate_limiter.reset()
        main.app.dependency_overrides.clear()


async def test_live_postgres_bm25_tsvector_hnsw_rrf_and_eval():
    """Empirically verify BM25 (2-arg to_bm25query via asyncpg), tsvector, HNSW relaxed_order CTE,
    and RRF fusion against the real running local-postgres instance inside a rolled-back transaction."""
    from sqlalchemy import text
    from src.kc.core.db import SessionLocal
    from src.kc.modules.search import eval as search_eval

    u_id = "00000000-0000-0000-0000-000000000901"
    p_id = "00000000-0000-0000-0000-000000000910"
    d1_id = "00000000-0000-0000-0000-000000000921"
    d2_id = "00000000-0000-0000-0000-000000000922"

    v_match = "[" + ",".join(["0.036"] * 768) + "]"
    v_ortho = "[" + ",".join(["0.036" if i % 2 == 0 else "-0.036" for i in range(768)]) + "]"

    async with SessionLocal() as session:
        async with session.begin():
            await session.execute(
                text(
                    """
                    INSERT INTO users (user_uuid, firebase_uid, email)
                    VALUES (:u, 'live_test_uid', 'live_test@example.com')
                    ON CONFLICT DO NOTHING
                    """
                ),
                {"u": u_id},
            )
            await session.execute(
                text(
                    """
                    INSERT INTO projects (project_uuid, name, created_by)
                    VALUES (:p, 'live_eval_project', :u)
                    ON CONFLICT DO NOTHING
                    """
                ),
                {"p": p_id, "u": u_id},
            )
            await session.execute(
                text(
                    """
                    INSERT INTO documents (doc_uuid, project_uuid, filename, doc_hash, uploaded_by, status)
                    VALUES
                        (:d1, :p, 'vault_decisions.md', 'hash_d1', :u, 'ready'),
                        (:d2, :p, 'excluded_draft.md', 'hash_d2', :u, 'ready')
                    ON CONFLICT DO NOTHING
                    """
                ),
                {"d1": d1_id, "d2": d2_id, "p": p_id, "u": u_id},
            )
            await session.execute(
                text(
                    """
                    INSERT INTO chunks (chunk_id, project_uuid, doc_uuid, ordinal, kind, heading_path,
                                        page_start, page_end, text, embed_text, text_hash, embedding, embed_model, dims)
                    VALUES
                        ('c_d015', :p, :d1, 0, 'text', 'D015', 1, 1,
                         'returned text: Supabase free tier is 500 MB and pauses after 1 week idle.',
                         'Supabase free tier 500 MB pauses after 1 week idle Cloud SQL',
                         'th_d015', CAST(:v1 AS vector), 'BAAI/bge-base-en-v1.5', 768),
                        ('c_d012', :p, :d1, 1, 'text', 'D012', 2, 2,
                         'returned text: Postgres pgvector HNSW and BM25 reciprocal rank fusion.',
                         'Postgres pgvector HNSW BM25 reciprocal rank fusion chunk store',
                         'th_d012', CAST(:v2 AS vector), 'BAAI/bge-base-en-v1.5', 768),
                        ('c_excl', :p, :d2, 0, 'text', 'Excluded', 1, 1,
                         'returned text: Excluded document with Supabase free tier 500 MB.',
                         'Supabase free tier 500 MB pauses after 1 week idle excluded',
                         'th_excl', CAST(:v1 AS vector), 'BAAI/bge-base-en-v1.5', 768)
                    ON CONFLICT DO NOTHING
                    """
                ),
                {"p": p_id, "d1": d1_id, "d2": d2_id, "v1": v_match, "v2": v_ortho},
            )

            # 1. BM25 search via asyncpg prepared statement with excluded_docs
            bm25_hits = await keyword.Bm25Search().search(
                session,
                p_id,
                "Supabase 500 MB pauses",
                k=5,
                excluded_docs=[d2_id],
            )
            assert [cid for cid, _ in bm25_hits] == ["c_d015"]

            # 2. Tsvector search with excluded_docs
            fts_hits = await keyword.TsvectorSearch().search(
                session,
                p_id,
                "Supabase 500 MB",
                k=5,
                excluded_docs=[d2_id],
            )
            assert [cid for cid, _ in fts_hits] == ["c_d015"]

            # 3. Hybrid RRF search returns `text` (not `embed_text`) and respects excluded_docs
            q_vec = [0.036] * 768
            hybrid_rows = await hybrid.search_chunks(
                session,
                p_id,
                "Supabase 500 MB pauses",
                query_embedding=q_vec,
                k=5,
                excluded_docs=[d2_id],
                search_mode="hybrid",
            )
            assert hybrid_rows[0]["chunk_id"] == "c_d015"
            assert hybrid_rows[0]["text"].startswith("returned text:")

            # 4. Evaluate retrieval recall@k on keyword mode
            eval_cases = [
                search_eval.EvalCase(query="Supabase 500 MB pauses", expected_chunk_ids=["c_d015"]),
                search_eval.EvalCase(query="reciprocal rank fusion HNSW", expected_chunk_ids=["c_d012"]),
            ]

            async def _local_runner(mode, case, top_k):
                rows = await hybrid.search_chunks(
                    session,
                    p_id,
                    case.query,
                    query_embedding=q_vec,
                    k=top_k,
                    excluded_docs=[d2_id],
                    search_mode=mode,
                )
                return [r["chunk_id"] for r in rows]

            report = await search_eval.evaluate_retrieval_with_runner(eval_cases, k=2, runner=_local_runner)
            assert report["keyword"]["hits_str"] == "2/2"
            assert report["hybrid"]["hits_str"] == "2/2"

            await session.rollback()



