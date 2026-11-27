from src.kc.modules.chat.citations import humanize_answer_references

CID = "3f2b6c1e-8a4d-4b7e-9c1f-0d2e3a4b5c6d"
NID = "aa11bb22-cc33-4d44-8e55-ff6677889900"
DOC = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
UNKNOWN = "99999999-9999-4999-8999-999999999999"

CHUNKS = {CID: {"chunk_id": CID, "doc_uuid": DOC, "page_start": 4, "page_end": 4, "para_start": 2, "para_end": 3}}
NODES = {NID: {"node_uuid": NID, "evidence": [{"ref": CID, "doc_uuid": DOC}]}}
META = {DOC: {"filename": "design.pdf"}}


def _h(text: str) -> str:
    return humanize_answer_references(text, shown_chunks=CHUNKS, shown_nodes=NODES, docs_meta=META)


def test_bracketed_chunk_id_becomes_page_reference():
    out = _h(f"Postgres stores vectors [chunk_id={CID}].")
    assert out == "Postgres stores vectors (design.pdf, p. 4, ¶ 2–3)."


def test_bare_and_backticked_ids_and_nodes_resolve():
    out = _h(f"See `{CID}` and node {NID}.")
    assert CID not in out and NID not in out
    assert out.count("(design.pdf, p. 4, ¶ 2–3)") == 2


def test_grouped_ids_deduplicate_and_unknown_ids_vanish():
    out = _h(f"Claim (chunk_ids: {CID}, {NID}). Other {UNKNOWN}.")
    assert out == "Claim (design.pdf, p. 4, ¶ 2–3). Other."


def test_clean_answer_is_untouched():
    text = "Already cited (design.pdf, p. 4, ¶ 2–3)."
    assert _h(text) == text
