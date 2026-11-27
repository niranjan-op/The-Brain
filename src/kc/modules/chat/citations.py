"""Strict source-scoped citation validation and frontend payload formatting (D022, D023, T060).

All user-facing citations point to concrete source documents with exact page and paragraph numbers
(or verified web URLs). The Knowledge Graph is an internal reasoning abstraction and is never exposed
as a standalone citation source; any cited graph node resolves back to its underlying document passage.
"""
from __future__ import annotations

import re
from typing import Any

_UUID_PATTERN = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
_ID_KEY_PREFIX = r"(?:(?:source_)?(?:chunk_ids?|chunk_uuid|node_uuids?|node_ids?|doc_uuids?|chunk|node|doc)\s*[:=#]?\s*)?"


def _reference_label(chunk: dict[str, Any], docs_meta: dict[str, dict[str, Any]]) -> str:
    label = format_page_paragraph_label(chunk)[0]
    doc_info = docs_meta.get(str(chunk.get("doc_uuid") or ""), {})
    filename = chunk.get("filename") or doc_info.get("filename")
    return f"{filename}, {label}" if filename else label


def humanize_answer_references(
    answer: str,
    *,
    shown_chunks: dict[str, dict[str, Any]],
    shown_nodes: dict[str, dict[str, Any]] | None = None,
    docs_meta: dict[str, dict[str, Any]] | None = None,
) -> str:
    """Rewrite internal identifiers that leaked into answer prose into human references.

    Users only know their documents, so `chunk_id=…`, node UUIDs, or doc UUIDs are replaced with
    `(filename, p. X, ¶ Y)`. Identifiers that cannot be resolved are removed rather than shown."""
    if not answer:
        return answer
    meta = docs_meta or {}
    labels: dict[str, str] = {}
    for cid, chunk in shown_chunks.items():
        labels[str(cid)] = _reference_label(chunk, meta)
    for nid, node in (shown_nodes or {}).items():
        for ev in node.get("evidence") or []:
            ref = str(ev.get("ref") or ev.get("chunk_id") or "")
            if ref in labels:
                labels[str(nid)] = labels[ref]
                break
        else:
            fname = node.get("filename") or meta.get(str(node.get("doc_uuid") or ""), {}).get("filename")
            if fname:
                labels[str(nid)] = str(fname)
    for did, info in meta.items():
        if info.get("filename"):
            labels.setdefault(str(did), str(info["filename"]))

    known = sorted((re.escape(k) for k in labels if k), key=len, reverse=True)
    id_alt = "|".join([*known, _UUID_PATTERN])
    id_token = rf"`?{_ID_KEY_PREFIX}`?(?P<id>{id_alt})`?"
    single_token_re = re.compile(id_token)

    def _labels_for(text: str) -> list[str]:
        found: list[str] = []
        for m in single_token_re.finditer(text):
            lbl = labels.get(m.group("id"))
            if lbl and lbl not in found:
                found.append(lbl)
        return found

    # 1. Bracketed groups made only of identifiers: "[chunk_id=a, chunk_id=b]" -> "(file, p. 2, ¶ 1; …)"
    group_re = re.compile(
        rf"[\[(【]\s*{id_token.replace('(?P<id>', '(?:')}(?:\s*[,;]\s*{id_token.replace('(?P<id>', '(?:')})*\s*[\])】]"
    )
    out = group_re.sub(lambda m: f"({'; '.join(_labels_for(m.group(0)))})" if _labels_for(m.group(0)) else "", answer)

    # 2. Any remaining bare identifiers.
    out = single_token_re.sub(
        lambda m: f"({labels[m.group('id')]})" if m.group("id") in labels else "",
        out,
    )

    # 3. Tidy artefacts left behind by removals.
    out = re.sub(r"\(\s*[,;]?\s*\)|\[\s*\]", "", out)
    out = re.sub(r"\(\(([^()]*)\)\)", r"(\1)", out)
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"[ \t]+([.,;:!?])", r"\1", out)
    return out.strip()


def format_page_paragraph_label(chunk: dict[str, Any]) -> tuple[str, int, int, int, int]:
    """Compute a human-readable `p. X, ¶ Y` label and integer coordinates for a document chunk."""
    raw_p_start = chunk.get("page_start")
    p_start = int(raw_p_start) if isinstance(raw_p_start, (int, float)) and int(raw_p_start) > 0 else 1
    raw_p_end = chunk.get("page_end")
    p_end = int(raw_p_end) if isinstance(raw_p_end, (int, float)) and int(raw_p_end) >= p_start else p_start

    payload = chunk.get("payload") if isinstance(chunk.get("payload"), dict) else {}
    raw_ordinal = chunk.get("ordinal")
    fallback_para = (int(raw_ordinal) + 1) if isinstance(raw_ordinal, (int, float)) and int(raw_ordinal) >= 0 else 1

    raw_para_start = chunk.get("para_start") or (payload or {}).get("para_start")
    para_start = (
        int(raw_para_start)
        if isinstance(raw_para_start, (int, float)) and int(raw_para_start) > 0
        else fallback_para
    )
    raw_para_end = chunk.get("para_end") or (payload or {}).get("para_end")
    para_end = (
        int(raw_para_end)
        if isinstance(raw_para_end, (int, float)) and int(raw_para_end) >= para_start
        else para_start
    )

    page_part = f"pp. {p_start}–{p_end}" if p_end != p_start else f"p. {p_start}"
    para_part = f"¶ {para_start}–{para_end}" if para_end != para_start else f"¶ {para_start}"
    return f"{page_part}, {para_part}", p_start, p_end, para_start, para_end


def _resolve_node_to_document_citation(
    node: dict[str, Any],
    *,
    nid: str,
    shown_chunks: dict[str, dict[str, Any]],
    meta_by_doc: dict[str, dict[str, Any]],
    excluded_set: set[str],
    allowed_docs: set[str] | None,
) -> dict[str, Any]:
    """Resolve an internal graph node to its backing source document, page, and paragraph."""
    evidence_list = node.get("evidence") if isinstance(node.get("evidence"), list) else []
    matched_chunk: dict[str, Any] | None = None
    matched_ev: dict[str, Any] | None = None

    for ev in evidence_list:
        if not isinstance(ev, dict):
            continue
        ev_doc = str(ev.get("doc_uuid") or "")
        if ev_doc and ev_doc in excluded_set:
            continue
        if allowed_docs is not None and ev_doc and ev_doc not in allowed_docs:
            continue
        ref = str(ev.get("ref") or "")
        if ref and ref in shown_chunks:
            cand = shown_chunks[ref]
            cand_doc = str(cand.get("doc_uuid") or "")
            if cand_doc and cand_doc in excluded_set:
                continue
            if allowed_docs is not None and cand_doc and cand_doc not in allowed_docs:
                continue
            matched_chunk = cand
            matched_ev = ev
            break
        if matched_ev is None and (ev_doc or ref):
            matched_ev = ev

    if matched_chunk is not None:
        cid = str(matched_chunk.get("chunk_id") or matched_ev.get("ref") or nid)
        doc_id = str(matched_chunk.get("doc_uuid") or (matched_ev or {}).get("doc_uuid") or "")
        doc_info = meta_by_doc.get(doc_id) or {}
        page_label, p_start, p_end, para_start, para_end = format_page_paragraph_label(matched_chunk)
        return {
            "source_kind": "chunk",
            "source_id": cid,
            "doc_uuid": doc_id or None,
            "filename": str(matched_chunk.get("filename") or doc_info.get("filename") or "Document Source"),
            "heading_path": str(matched_chunk.get("heading_path") or node.get("name") or "Document Section"),
            "page_label": page_label,
            "page_start": p_start,
            "page_end": p_end,
            "para_start": para_start,
            "para_end": para_end,
            "excerpt": str(matched_chunk.get("text") or (matched_ev or {}).get("excerpt") or node.get("text") or "")[:240],
            "score": "Document",
        }

    # Fallback when node evidence chunk wasn't in `shown_chunks`: use evidence doc_uuid or first allowed doc
    doc_id = str((matched_ev or {}).get("doc_uuid") or node.get("doc_uuid") or "")
    if not doc_id and meta_by_doc:
        for candidate_doc_id in meta_by_doc:
            if candidate_doc_id not in excluded_set and (allowed_docs is None or candidate_doc_id in allowed_docs):
                doc_id = candidate_doc_id
                break
    doc_info = meta_by_doc.get(doc_id) or {}
    source_id = str((matched_ev or {}).get("ref") or nid)
    synthetic_chunk = {
        "page_start": (matched_ev or {}).get("page_start") or node.get("page_start") or 1,
        "page_end": (matched_ev or {}).get("page_end") or node.get("page_end") or 1,
        "para_start": (matched_ev or {}).get("para_start") or node.get("para_start") or 1,
        "para_end": (matched_ev or {}).get("para_end") or node.get("para_end") or 1,
    }
    page_label, p_start, p_end, para_start, para_end = format_page_paragraph_label(synthetic_chunk)
    filename = str(
        node.get("filename")
        or doc_info.get("filename")
        or "Document Source"
    )
    heading = str(node.get("heading_path") or node.get("name") or "Document Section")
    excerpt = str(
        (matched_ev or {}).get("excerpt")
        or node.get("text")
        or node.get("summary")
        or node.get("name")
        or ""
    )[:240]
    return {
        "source_kind": "chunk",
        "source_id": source_id,
        "doc_uuid": doc_id or None,
        "filename": filename,
        "heading_path": heading,
        "page_label": page_label,
        "page_start": p_start,
        "page_end": p_end,
        "para_start": para_start,
        "para_end": para_end,
        "excerpt": excerpt,
        "score": "Document",
    }


def validate_and_build_citations(
    *,
    cited_chunk_ids: list[str],
    cited_node_uuids: list[str],
    cited_urls: list[str] | None = None,
    shown_chunks: dict[str, dict[str, Any]],
    shown_nodes: dict[str, dict[str, Any]],
    shown_urls: dict[str, dict[str, Any]] | None = None,
    allowed_doc_uuids: set[str] | None = None,
    excluded_doc_uuids: set[str] | None = None,
    allowed_node_ids: set[str] | None = None,
    docs_meta: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Verify every cited chunk, node, and URL against what was actually shown this turn AND
    within the conversation's active `source_scope`. Strip and record anything out-of-scope or invented.
    Resolves all graph nodes to their underlying source document, page, and paragraph.
    """
    excluded_set = {str(d) for d in (excluded_doc_uuids or set())}
    allowed_docs = {str(d) for d in allowed_doc_uuids} if allowed_doc_uuids is not None else None
    allowed_nodes = {str(n) for n in allowed_node_ids} if allowed_node_ids is not None else None
    url_map = shown_urls or {}
    meta_by_doc = docs_meta or {}

    accepted_chunks: list[str] = []
    rejected_chunks: list[str] = []
    for raw_cid in dict.fromkeys(str(c) for c in cited_chunk_ids if c):
        chunk = shown_chunks.get(raw_cid)
        if chunk is None:
            rejected_chunks.append(raw_cid)
            continue
        doc_id = str(chunk.get("doc_uuid") or "")
        if doc_id and doc_id in excluded_set:
            rejected_chunks.append(raw_cid)
            continue
        if allowed_docs is not None and doc_id and doc_id not in allowed_docs:
            rejected_chunks.append(raw_cid)
            continue
        accepted_chunks.append(raw_cid)

    accepted_nodes: list[str] = []
    rejected_nodes: list[str] = []
    for raw_nid in dict.fromkeys(str(n) for n in cited_node_uuids if n):
        if raw_nid not in shown_nodes:
            rejected_nodes.append(raw_nid)
            continue
        if allowed_nodes is not None and raw_nid not in allowed_nodes:
            rejected_nodes.append(raw_nid)
            continue
        accepted_nodes.append(raw_nid)

    accepted_urls: list[str] = []
    rejected_urls: list[str] = []
    for raw_url in dict.fromkeys(str(u) for u in (cited_urls or []) if u):
        if raw_url not in url_map:
            rejected_urls.append(raw_url)
            continue
        accepted_urls.append(raw_url)

    citation_details: list[dict[str, Any]] = []
    message_sources: list[dict[str, Any]] = []
    seen_source_ids: set[str] = set()
    rank = 1

    for cid in accepted_chunks:
        chunk = shown_chunks[cid]
        doc_id = str(chunk.get("doc_uuid") or "")
        doc_info = meta_by_doc.get(doc_id) or {}
        page_label, p_start, p_end, para_start, para_end = format_page_paragraph_label(chunk)

        raw_score = chunk.get("score")
        score_str = f"RRF {float(raw_score):.2f}" if isinstance(raw_score, (int, float)) else "Hybrid"

        citation_details.append(
            {
                "citation_id": f"cit-chunk-{rank}",
                "source_kind": "chunk",
                "source_id": cid,
                "doc_uuid": doc_id or None,
                "filename": str(chunk.get("filename") or doc_info.get("filename") or "Document Source"),
                "heading_path": str(chunk.get("heading_path") or "Retrieved Section"),
                "page_label": page_label,
                "page_start": p_start,
                "page_end": p_end,
                "para_start": para_start,
                "para_end": para_end,
                "excerpt": str(chunk.get("text") or "")[:240],
                "rank": rank,
                "score": score_str,
            }
        )
        message_sources.append({"source_kind": "chunk", "source_id": cid, "rank": rank})
        seen_source_ids.add(cid)
        rank += 1

    for nid in accepted_nodes:
        node = shown_nodes[nid]
        resolved = _resolve_node_to_document_citation(
            node,
            nid=nid,
            shown_chunks=shown_chunks,
            meta_by_doc=meta_by_doc,
            excluded_set=excluded_set,
            allowed_docs=allowed_docs,
        )
        resolved_sid = str(resolved["source_id"])
        if resolved_sid in seen_source_ids:
            continue
        seen_source_ids.add(resolved_sid)
        citation_details.append(
            {
                "citation_id": f"cit-chunk-{rank}",
                **resolved,
                "rank": rank,
            }
        )
        message_sources.append(
            {
                "source_kind": "chunk",
                "source_id": resolved_sid,
                "rank": rank,
            }
        )
        rank += 1

    for url in accepted_urls:
        info = url_map[url]
        citation_details.append(
            {
                "citation_id": f"cit-url-{rank}",
                "source_kind": "url",
                "source_id": url,
                "filename": str(info.get("title") or url),
                "heading_path": str(info.get("source") or "Web Search"),
                "page_label": "Web",
                "excerpt": str(info.get("snippet") or url)[:240],
                "rank": rank,
                "score": "Web",
            }
        )
        message_sources.append({"source_kind": "url", "source_id": url, "rank": rank})
        rank += 1

    return {
        "citations": {
            "chunk_ids": accepted_chunks,
            "node_uuids": accepted_nodes,
            "urls": accepted_urls,
        },
        "rejected_citations": {
            "chunk_ids": rejected_chunks,
            "node_uuids": rejected_nodes,
            "urls": rejected_urls,
        },
        "citation_details": citation_details,
        "message_sources": message_sources,
    }
