"""Retrieval recall@k and answer-level Graph-RAG evaluation harness (rag-module-v0, graph-schema-v1-1).

Reports both raw counts (e.g. '17/25') and rates so small gold sets (20-30 questions) are never
misrepresented by percentages alone. Includes the Knowledge Cartographer Vault Dogfood Gold Set.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal

from src.kc.modules.search.graph_rag import retrieve_and_answer
from src.kc.modules.search.hybrid import search_chunks


@dataclass(frozen=True)
class EvalCase:
    query: str
    expected_chunk_ids: list[str]
    expected_node_uuids: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class AnswerEvalCase:
    query: str
    required_phrases: list[str]
    expected_citations: list[str] = field(default_factory=list)
    forbidden_phrases: list[str] = field(default_factory=list)


# Built-in dogfood gold set from graph-schema-v1-1.md and decisions D001-D026
VAULT_DOGFOOD_GOLD_SET: tuple[AnswerEvalCase, ...] = (
    AnswerEvalCase(
        query="Why was Supabase dropped as the database host?",
        required_phrases=["500 MB", "pauses"],
        expected_citations=["D015", "D016", "D026"],
    ),
    AnswerEvalCase(
        query="What is the current hosting layout for Postgres, FastAPI, and Docling?",
        required_phrases=["Cloud SQL", "Cloud Run"],
        expected_citations=["D025", "D026"],
    ),
    AnswerEvalCase(
        query="What superseded D003's Firestore chunk store decision?",
        required_phrases=["D012", "pgvector"],
        expected_citations=["D003", "D012"],
    ),
    AnswerEvalCase(
        query="Why are Evidence nodes not stored in Neo4j Aura Free?",
        required_phrases=["50k", "Postgres"],
        expected_citations=["D017"],
    ),
    AnswerEvalCase(
        query="How does source selection filtering work when a user unticks a document in a conversation?",
        required_phrases=["excluded", "allowed"],
        expected_citations=["D022", "D023"],
    ),
    AnswerEvalCase(
        query="What is still open in the Knowledge Cartographer overview?",
        required_phrases=["pg_textsearch", "dogfood"],
        expected_citations=["overview"],
    ),
)


async def evaluate_retrieval_with_runner(
    cases: list[EvalCase] | tuple[EvalCase, ...],
    *,
    k: int = 5,
    runner: Callable[[Literal["vector", "keyword", "hybrid"], EvalCase, int], Awaitable[list[str]]],
) -> dict[str, dict[str, Any]]:
    """Compute recall@k, MRR@k, and raw hit counts (`hits_str = 'X/Y'`) across `vector`, `keyword`, and `hybrid`."""
    total = len(cases)
    modes: tuple[Literal["vector", "keyword", "hybrid"], ...] = ("vector", "keyword", "hybrid")
    summary: dict[str, dict[str, Any]] = {}

    for mode in modes:
        hits = 0
        rr_sum = 0.0
        for case in cases:
            expected = set(case.expected_chunk_ids)
            got = await runner(mode, case, k)
            top_k = got[:k]
            first_rank: int | None = None
            for idx, cid in enumerate(top_k):
                if cid in expected:
                    first_rank = idx + 1
                    break
            if first_rank is not None:
                hits += 1
                rr_sum += 1.0 / first_rank

        summary[mode] = {
            "hits": hits,
            "total": total,
            "hits_str": f"{hits}/{total}",
            "recall_at_k": (hits / total) if total > 0 else 0.0,
            "mrr_at_k": (rr_sum / total) if total > 0 else 0.0,
        }
    return summary


async def evaluate_retrieval(
    session: Any,
    project_uuid: str,
    cases: list[EvalCase] | tuple[EvalCase, ...],
    *,
    k: int = 5,
    excluded_docs: list[str] | None = None,
) -> dict[str, dict[str, Any]]:
    """Run `evaluate_retrieval_with_runner` against Postgres `search_chunks`."""

    async def _db_runner(mode: Literal["vector", "keyword", "hybrid"], case: EvalCase, top_k: int) -> list[str]:
        rows = await search_chunks(
            session,
            project_uuid,
            case.query,
            k=top_k,
            excluded_docs=excluded_docs,
            search_mode=mode,
        )
        return [str(r["chunk_id"]) for r in rows]

    return await evaluate_retrieval_with_runner(cases, k=k, runner=_db_runner)


async def evaluate_answers_with_runner(
    cases: list[AnswerEvalCase] | tuple[AnswerEvalCase, ...],
    *,
    answer_runner: Callable[[AnswerEvalCase, bool], Awaitable[dict[str, Any]]],
) -> dict[str, dict[str, Any]]:
    """Compare answer correctness and citation support with `use_graph=True` vs `use_graph=False`.
    Reports raw counts (`correct_str`, `citation_str`) alongside rates."""
    total = len(cases)
    report: dict[str, dict[str, Any]] = {}

    for label, use_graph in (("with_graph", True), ("without_graph", False)):
        correct_count = 0
        citation_count = 0
        for case in cases:
            res = await answer_runner(case, use_graph)
            ans_lower = str(res.get("answer") or "").lower()
            citations_obj = res.get("citations") or {}
            cited_all = {
                *(str(c) for c in (citations_obj.get("chunk_ids") or [])),
                *(str(n) for n in (citations_obj.get("node_uuids") or [])),
            }

            has_all_required = all(p.lower() in ans_lower for p in case.required_phrases)
            has_no_forbidden = all(p.lower() not in ans_lower for p in case.forbidden_phrases)
            if has_all_required and has_no_forbidden:
                correct_count += 1

            if not case.expected_citations or any(exp in cited_all for exp in case.expected_citations):
                citation_count += 1

        report[label] = {
            "correct": correct_count,
            "total": total,
            "correct_str": f"{correct_count}/{total}",
            "accuracy": (correct_count / total) if total > 0 else 0.0,
            "citation_hits": citation_count,
            "citation_str": f"{citation_count}/{total}",
            "citation_support_rate": (citation_count / total) if total > 0 else 0.0,
        }
    return report


async def evaluate_answers(
    project_uuid: str,
    cases: list[AnswerEvalCase] | tuple[AnswerEvalCase, ...] = VAULT_DOGFOOD_GOLD_SET,
    *,
    excluded_docs: list[str] | None = None,
    use_tools: bool = True,
) -> dict[str, dict[str, Any]]:
    """Run `evaluate_answers_with_runner` using `retrieve_and_answer`."""

    async def _live_runner(case: AnswerEvalCase, use_graph: bool) -> dict[str, Any]:
        return await retrieve_and_answer(
            project_uuid=project_uuid,
            query=case.query,
            excluded_docs=excluded_docs,
            use_graph=use_graph,
            use_tools=use_tools,
            generate_answer=True,
        )

    return await evaluate_answers_with_runner(cases, answer_runner=_live_runner)

