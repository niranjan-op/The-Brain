"""Docling + plain-text/CSV document parser and chunker.

Converts PDF, DOCX, XLSX, Markdown via Docling (HybridChunker + MarkdownTableSerializer),
enriches up to 10 non-decorative embedded figures via `describe_image`, and handles
plain `.txt` and `.csv` directly without spinning up heavy PDF models.
"""
from __future__ import annotations

import asyncio
import csv
import hashlib
import io
import math
from pathlib import Path
from typing import Any

from src.kc.modules.ingestion.images import describe_image

MAX_FIGURES_PER_DOC = 10
SKIP_PICTURE_CLASSES = {"logo", "icon", "signature", "qr_code", "bar_code", "stamp"}

_CONVERTER: Any = None
_CHUNKER: Any = None


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    try:
        if isinstance(value, float) and math.isnan(value):
            return ""
    except (TypeError, ValueError):
        pass
    return str(value).strip()


def _safe_call_text(obj: Any, method_name: str, **kwargs: Any) -> str:
    method = getattr(obj, method_name, None)
    if not callable(method):
        return ""
    try:
        return _safe_text(method(**kwargs))
    except Exception:  # noqa: BLE001
        return ""


def _get_page_numbers(item: Any) -> list[int]:
    pages: set[int] = set()
    for provenance in getattr(item, "prov", None) or []:
        page_no = getattr(provenance, "page_no", None)
        if page_no is not None:
            try:
                pages.add(int(page_no))
            except (TypeError, ValueError):
                pass
    return sorted(pages)


def _get_label(item: Any) -> str:
    label = getattr(item, "label", "")
    return str(getattr(label, "value", label)).lower()


def _get_picture_class(picture: Any) -> str:
    meta = getattr(picture, "meta", None)
    classification = getattr(meta, "classification", None) if meta else None
    if classification is None:
        return ""
    try:
        prediction = classification.get_main_prediction()
        return _safe_text(getattr(prediction, "class_name", "")).lower() if prediction else ""
    except Exception:  # noqa: BLE001
        return ""


def _get_converter() -> Any:
    global _CONVERTER
    if _CONVERTER is not None:
        return _CONVERTER

    from docling.datamodel.accelerator_options import AcceleratorDevice, AcceleratorOptions
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import (
        PdfPipelineOptions,
        TableFormerMode,
        TableStructureOptions,
    )
    from docling.document_converter import DocumentConverter, PdfFormatOption

    options = PdfPipelineOptions()
    options.do_ocr = False
    options.do_table_structure = True
    options.table_structure_options = TableStructureOptions(mode=TableFormerMode.FAST)
    options.do_picture_classification = True
    options.do_picture_description = False
    options.do_chart_extraction = False
    options.do_code_enrichment = False
    options.do_formula_enrichment = False
    options.generate_page_images = False
    options.generate_picture_images = True
    options.images_scale = 1.5
    options.accelerator_options = AcceleratorOptions(num_threads=4, device=AcceleratorDevice.CPU)
    if hasattr(options, "extract_form_fields"):
        options.extract_form_fields = True

    _CONVERTER = DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)}
    )
    return _CONVERTER


def _get_chunker() -> Any:
    global _CHUNKER
    if _CHUNKER is not None:
        return _CHUNKER

    from docling_core.transforms.chunker.hierarchical_chunker import (
        ChunkingDocSerializer,
        ChunkingSerializerProvider,
    )
    from docling_core.transforms.chunker.hybrid_chunker import HybridChunker
    from docling_core.transforms.serializer.markdown import MarkdownTableSerializer

    class MarkdownTableProvider(ChunkingSerializerProvider):
        def get_serializer(self, doc: Any) -> Any:
            return ChunkingDocSerializer(
                doc=doc,
                table_serializer=MarkdownTableSerializer(),
            )

    _CHUNKER = HybridChunker(serializer_provider=MarkdownTableProvider())
    return _CHUNKER


def _make_chunk_id(doc_uuid: str, heading_path: str, text_hash: str, occurrence: int = 0) -> str:
    seed = f"{doc_uuid}||{heading_path}||{text_hash}||{occurrence}"
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()[:32]


def parse_txt(data: bytes, filename: str, doc_uuid: str, max_chars: int = 2000) -> dict[str, Any]:
    text_content = data.decode("utf-8", errors="replace").strip()
    raw_paragraphs = [p.strip() for p in text_content.split("\n\n") if p.strip()]
    if not raw_paragraphs and text_content:
        raw_paragraphs = [text_content]

    # Deduplicate identical paragraphs before grouping
    seen_para: set[str] = set()
    paragraphs: list[str] = []
    for p in raw_paragraphs:
        if p not in seen_para:
            seen_para.add(p)
            paragraphs.append(p)

    grouped: list[str] = []
    current: list[str] = []
    current_len = 0
    for para in paragraphs:
        if current and current_len + len(para) + 2 > max_chars:
            grouped.append("\n\n".join(current))
            current = [para]
            current_len = len(para)
        else:
            current.append(para)
            current_len += len(para) + 2
    if current:
        grouped.append("\n\n".join(current))

    seen_hashes: set[str] = set()
    chunks: list[dict[str, Any]] = []
    for raw_block in grouped:
        text_hash = hashlib.sha256(raw_block.encode("utf-8")).hexdigest()
        if text_hash in seen_hashes:
            continue
        seen_hashes.add(text_hash)
        ordinal = len(chunks)
        chunks.append(
            {
                "chunk_id": _make_chunk_id(doc_uuid, "", text_hash, 0),
                "ordinal": ordinal,
                "kind": "text",
                "heading_path": "",
                "page_start": 1,
                "page_end": 1,
                "text": raw_block,
                "embed_text": raw_block,
                "text_hash": text_hash,
                "payload": {},
            }
        )

    return {
        "page_count": 1,
        "doc_kind": "other",
        "description": f"Text document {filename} ({len(chunks)} chunks)",
        "chunks": chunks,
    }


def parse_csv(data: bytes, filename: str, doc_uuid: str, rows_per_chunk: int = 50) -> dict[str, Any]:
    decoded = data.decode("utf-8", errors="replace")
    reader = list(csv.reader(io.StringIO(decoded)))
    if not reader:
        return {"page_count": 1, "doc_kind": "table", "description": f"Empty CSV {filename}", "chunks": []}

    headers = [_safe_text(col) for col in reader[0]]
    data_rows = [[_safe_text(cell) for cell in row] for row in reader[1:] if any(_safe_text(c) for c in row)]

    chunks: list[dict[str, Any]] = []
    header_line = "| " + " | ".join(headers) + " |"
    sep_line = "| " + " | ".join(["---"] * len(headers)) + " |"

    for start in range(0, max(1, len(data_rows)), rows_per_chunk):
        batch = data_rows[start : start + rows_per_chunk]
        md_rows = ["| " + " | ".join(r) + " |" for r in batch]
        md_table = "\n".join([header_line, sep_line, *md_rows])
        body = f"[Table: {filename} (rows {start + 1}-{start + len(batch)})]\n{md_table}"
        text_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
        ordinal = len(chunks)
        chunks.append(
            {
                "chunk_id": _make_chunk_id(doc_uuid, filename, text_hash, ordinal),
                "ordinal": ordinal,
                "kind": "table",
                "heading_path": filename,
                "page_start": 1,
                "page_end": 1,
                "text": body,
                "embed_text": body,
                "text_hash": text_hash,
                "payload": {"table": {"columns": headers, "rows": batch}},
            }
        )

    return {
        "page_count": 1,
        "doc_kind": "table",
        "description": f"CSV table {filename} ({len(data_rows)} rows, {len(headers)} columns)",
        "chunks": chunks,
    }


def _extract_tables_lookup(document: Any) -> dict[str, dict[str, Any]]:
    tables_lookup: dict[str, dict[str, Any]] = {}
    for index, table in enumerate(getattr(document, "tables", []) or []):
        table_ref = _safe_text(getattr(table, "self_ref", "")) or f"#/tables/{index}"
        caption = _safe_call_text(table, "caption_text", doc=document)
        record: dict[str, Any] = {
            "table_id": table_ref,
            "caption": caption,
            "columns": [],
            "rows": [],
        }
        try:
            df = table.export_to_dataframe(doc=document)
            record["columns"] = [_safe_text(col) for col in df.columns]
            record["rows"] = [[_safe_text(cell) for cell in row] for row in df.itertuples(index=False, name=None)]
        except Exception:  # noqa: BLE001
            record["markdown_fallback"] = _safe_call_text(table, "export_to_markdown", doc=document)
        tables_lookup[table_ref] = record
    return tables_lookup


def _extract_picture_crops(document: Any) -> list[dict[str, Any]]:
    pictures_info: list[dict[str, Any]] = []
    for index, picture in enumerate(getattr(document, "pictures", []) or []):
        pic_ref = _safe_text(getattr(picture, "self_ref", "")) or f"#/pictures/{index}"
        caption = _safe_call_text(picture, "caption_text", doc=document)
        pic_class = _get_picture_class(picture)
        pages = _get_page_numbers(picture)
        png_bytes: bytes | None = None

        if pic_class not in SKIP_PICTURE_CLASSES:
            get_img = getattr(picture, "get_image", None)
            if callable(get_img):
                try:
                    pil_img: Any = get_img(document)
                    if pil_img is not None:
                        buf = io.BytesIO()
                        pil_img.save(buf, format="PNG")
                        png_bytes = buf.getvalue()
                except Exception:  # noqa: BLE001
                    png_bytes = None

        pictures_info.append(
            {
                "picture_id": pic_ref,
                "caption": caption,
                "class_name": pic_class,
                "pages": pages,
                "png_bytes": png_bytes,
            }
        )
    return pictures_info


def _run_docling_sync(data: bytes, filename: str) -> tuple[Any, dict[str, dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    from docling.datamodel.base_models import DocumentStream

    converter = _get_converter()
    stream = DocumentStream(name=filename, stream=io.BytesIO(data))
    conversion_result = converter.convert(stream)
    document = conversion_result.document

    tables_lookup = _extract_tables_lookup(document)
    pictures_info = _extract_picture_crops(document)

    chunker = _get_chunker()
    raw_chunk_records: list[dict[str, Any]] = []
    for chunk in chunker.chunk(dl_doc=document):
        raw_items = list(getattr(getattr(chunk, "meta", None), "doc_items", []) or [])
        labels = [_get_label(item) for item in raw_items]

        # Skip TOC / document_index chunks
        if labels and all("document_index" in lbl for lbl in labels):
            continue

        item_pairs = [(_safe_text(getattr(item, "self_ref", "")), _get_label(item)) for item in raw_items]
        pages = sorted({p for item in raw_items for p in _get_page_numbers(item)})

        if any("table" in lbl for lbl in labels):
            kind = "table"
        elif any("picture" in lbl for lbl in labels):
            kind = "figure_context"
        else:
            kind = "text"

        content = chunker.contextualize(chunk=chunk).strip()
        if not content:
            continue

        headings = [_safe_text(h) for h in (getattr(getattr(chunk, "meta", None), "headings", None) or []) if _safe_text(h)]
        heading_path = " > ".join(headings)

        raw_chunk_records.append(
            {
                "kind": kind,
                "content": content,
                "heading_path": heading_path,
                "pages": pages,
                "table_refs": [ref for ref, lbl in item_pairs if ref and "table" in lbl],
                "picture_refs": [ref for ref, lbl in item_pairs if ref and "picture" in lbl],
            }
        )

    return document, tables_lookup, pictures_info, raw_chunk_records


async def parse_and_chunk(
    data: bytes,
    filename: str,
    mime_type: str,
    doc_uuid: str,
    storage_path: str | None = None,
) -> dict[str, Any]:
    ext = Path(filename or "").suffix.lower()
    if mime_type == "text/plain" or ext == ".txt":
        return parse_txt(data, filename, doc_uuid)
    if mime_type == "text/csv" or ext == ".csv":
        return parse_csv(data, filename, doc_uuid)

    document, tables_lookup, pictures_info, raw_chunk_records = await asyncio.to_thread(
        _run_docling_sync, data, filename
    )
    page_count = len(getattr(document, "pages", {}) or {}) or 1

    # Enrich up to MAX_FIGURES_PER_DOC non-decorative pictures via Gemini LLM
    picture_lookup: dict[str, dict[str, Any]] = {}
    llm_candidates = [p for p in pictures_info if p.get("png_bytes")][:MAX_FIGURES_PER_DOC]
    sem = asyncio.Semaphore(4)

    async def _describe_pic(pic: dict[str, Any]) -> None:
        async with sem:
            label = await describe_image(pic["png_bytes"], "image/png", f"{filename}:{pic['picture_id']}")
            entry: dict[str, Any] = {
                "picture_id": pic["picture_id"],
                "caption": pic["caption"],
                "doc_kind": label.doc_kind,
                "description": label.description,
                "needs_raw_image": label.needs_raw_image,
            }
            if label.mermaid:
                entry["mermaid"] = label.mermaid
            elif label.doc_kind == "architecture_diagram":
                entry["mermaid_status"] = "failed"
            if label.needs_raw_image and storage_path:
                entry["storage_path"] = storage_path
            picture_lookup[pic["picture_id"]] = entry

    if llm_candidates:
        await asyncio.gather(*(_describe_pic(p) for p in llm_candidates))

    for pic in pictures_info:
        if pic["picture_id"] not in picture_lookup:
            picture_lookup[pic["picture_id"]] = {
                "picture_id": pic["picture_id"],
                "caption": pic["caption"],
                "description": "",
            }

    seen_hashes: set[str] = set()
    occurrence_counts: dict[tuple[str, str], int] = {}
    chunks: list[dict[str, Any]] = []

    for rec in raw_chunk_records:
        embed_body = rec["content"]
        text_body = rec["content"]
        payload: dict[str, Any] = {}

        # Attach structured table data
        matched_tables = [tables_lookup[r] for r in rec["table_refs"] if r in tables_lookup]
        if matched_tables:
            first_tbl = matched_tables[0]
            payload["table"] = {
                "columns": first_tbl.get("columns", []),
                "rows": first_tbl.get("rows", []),
            }
            if len(matched_tables) > 1:
                payload["tables"] = matched_tables

        # Attach figure descriptions + Mermaid
        matched_figs = [picture_lookup[r] for r in rec["picture_refs"] if r in picture_lookup]
        if matched_figs:
            extra_embed: list[str] = []
            extra_text: list[str] = []
            fig_payloads: list[dict[str, Any]] = []
            for fig in matched_figs:
                if fig.get("caption") and fig["caption"] not in embed_body:
                    extra_embed.append(f"Figure caption: {fig['caption']}")
                    extra_text.append(f"Figure caption: {fig['caption']}")
                if fig.get("description") and fig["description"] not in embed_body:
                    extra_embed.append(f"Figure description: {fig['description']}")
                    extra_text.append(f"Figure description: {fig['description']}")
                if fig.get("mermaid"):
                    extra_text.append(f"```mermaid\n{fig['mermaid']}\n```")
                fig_payloads.append(fig)

            if extra_embed:
                embed_body = f"{embed_body}\n\n" + "\n".join(extra_embed)
            if extra_text:
                text_body = f"{text_body}\n\n" + "\n".join(extra_text)
            payload["figures"] = fig_payloads
            if any(f.get("needs_raw_image") for f in fig_payloads):
                payload["needs_raw_image"] = True
                if storage_path:
                    payload["storage_path"] = storage_path

        text_hash = hashlib.sha256(embed_body.encode("utf-8")).hexdigest()
        if text_hash in seen_hashes:
            continue
        seen_hashes.add(text_hash)

        key = (rec["heading_path"], text_hash)
        occ = occurrence_counts.get(key, 0)
        occurrence_counts[key] = occ + 1

        pages = rec["pages"]
        page_start = pages[0] if pages else 1
        page_end = pages[-1] if pages else page_start

        chunks.append(
            {
                "chunk_id": _make_chunk_id(doc_uuid, rec["heading_path"], text_hash, occ),
                "ordinal": len(chunks),
                "kind": rec["kind"],
                "heading_path": rec["heading_path"],
                "page_start": page_start,
                "page_end": page_end,
                "text": text_body,
                "embed_text": embed_body,
                "text_hash": text_hash,
                "payload": payload,
            }
        )

    return {
        "page_count": page_count,
        "doc_kind": "other",
        "description": f"Parsed {filename} ({page_count} pages, {len(chunks)} chunks)",
        "chunks": chunks,
    }