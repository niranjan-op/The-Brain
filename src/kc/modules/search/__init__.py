"""Hybrid RAG (BM25 + HNSW + RRF) and Graph-expanded retrieval module."""
from __future__ import annotations

from src.kc.modules.search import eval, graph_rag, hybrid, keyword
from src.kc.modules.search.eval import (
     VAULT_DOGFOOD_GOLD_SET,
    AnswerEvalCase,
    EvalCase,
    evaluate_answers,
    evaluate_retrieval,
)
from src.kc.modules.search.graph_rag import (
    GroundedAnswer,
    retrieve_and_answer,
    retrieve_context,
    search_nodes_by_vector,
)
from src.kc.modules.search.hybrid import (
    fuse_rrf,
    keyword_chunk_search,
    search_chunks,
    vector_chunk_search,
)
from src.kc.modules.search.keyword import (
    Bm25Search,
    KeywordSearch,
    TsvectorSearch,
    get_keyword_search,
    partition_table_name,
)

__all__ = [
    "VAULT_DOGFOOD_GOLD_SET",
    "AnswerEvalCase",
    "Bm25Search",
    "EvalCase",
    "GroundedAnswer",
    "KeywordSearch",
    "TsvectorSearch",
    "eval",
    "evaluate_answers",
    "evaluate_retrieval",
    "fuse_rrf",
    "get_keyword_search",
    "graph_rag",
    "hybrid",
    "keyword",
    "keyword_chunk_search",
    "partition_table_name",
    "retrieve_and_answer",
    "retrieve_context",
    "search_chunks",
    "search_nodes_by_vector",
    "vector_chunk_search",
]
