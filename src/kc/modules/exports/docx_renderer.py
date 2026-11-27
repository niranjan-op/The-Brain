"""Render an ExportDocument to a .docx file (python-docx)."""
from __future__ import annotations

import io
from dataclasses import replace
from typing import cast

from docx import Document
from docx.document import Document as DocxDocument
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.opc.constants import RELATIONSHIP_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.oxml.xmlchemy import BaseOxmlElement
from docx.shared import Cm, Pt, RGBColor
from docx.styles.style import ParagraphStyle
from docx.text.paragraph import Paragraph as DocxParagraph

from src.kc.modules.exports.markdown_model import (
    Block,
    CodeBlock,
    ExportDocument,
    Heading,
    ListBlock,
    Paragraph,
    Quote,
    Rule,
    Run,
    Table,
)

_ACCENT_HEX = "0284C7"
_MUTED = RGBColor(0x5B, 0x61, 0x6E)
_CODE_FILL = "F1F3F7"
_HEAD_FILL = "EEF2F8"
_RULE_HEX = "C8CDD6"
_MONO = "Consolas"
_INDENT_CM = 0.75
_ALIGN = {"left": WD_ALIGN_PARAGRAPH.LEFT, "center": WD_ALIGN_PARAGRAPH.CENTER, "right": WD_ALIGN_PARAGRAPH.RIGHT}


def render_docx(doc: ExportDocument) -> bytes:
    out = Document()
    section = out.sections[0]
    section.page_width, section.page_height = Cm(21.0), Cm(29.7)
    for side in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
        setattr(section, side, Cm(2.2))
    normal = cast(ParagraphStyle, out.styles["Normal"])
    normal.font.name = "Calibri"
    normal.font.size = Pt(11)

    out.add_heading(doc.title, level=0)
    meta = out.add_paragraph()
    meta_run = meta.add_run(doc.meta)
    meta_run.italic = True
    meta_run.font.size = Pt(9.5)
    meta_run.font.color.rgb = _MUTED

    _blocks(out, doc.blocks, indent=0, quote=False)

    if doc.sources:
        out.add_heading("Sources", level=2)
        for idx, src in enumerate(doc.sources, start=1):
            p = out.add_paragraph()
            p.paragraph_format.space_after = Pt(2)
            p.add_run(f"[{idx}] ").bold = True
            if src.url:
                _add_hyperlink(p, src.url, src.label)
            else:
                p.add_run(src.label)
            if src.detail:
                detail = p.add_run(f" — {src.detail}")
                detail.font.color.rgb = _MUTED

    buf = io.BytesIO()
    out.save(buf)
    return buf.getvalue()


def _blocks(out: DocxDocument, blocks: list[Block], *, indent: int, quote: bool) -> None:
    for block in blocks:
        if isinstance(block, Heading):
            _runs(out.add_heading(level=min(max(block.level, 1), 4)), block.runs)
        elif isinstance(block, Paragraph):
            p = out.add_paragraph(style="Quote" if quote else None)
            _indent(p, indent)
            _runs(p, block.runs)
        elif isinstance(block, CodeBlock):
            _code(out, block, indent)
        elif isinstance(block, Quote):
            _blocks(out, block.blocks, indent=indent, quote=True)
        elif isinstance(block, ListBlock):
            _list(out, block, indent=indent, quote=quote)
        elif isinstance(block, Table):
            _table(out, block)
        elif isinstance(block, Rule):
            _rule(out)


def _list(out: DocxDocument, block: ListBlock, *, indent: int, quote: bool) -> None:
    for number, item in enumerate(block.items, start=block.start):
        marker = f"{number}." if block.ordered else "•"
        first, rest = (item[0], item[1:]) if item and isinstance(item[0], Paragraph) else (None, item)
        p = out.add_paragraph(style="Quote" if quote else None)
        fmt = p.paragraph_format
        fmt.left_indent = Cm(_INDENT_CM * (indent + 1))
        fmt.first_line_indent = Cm(-0.5)
        fmt.space_after = Pt(2)
        p.add_run(f"{marker} ")
        if first is not None:
            _runs(p, first.runs)
        _blocks(out, rest, indent=indent + 1, quote=quote)


def _runs(p: DocxParagraph, runs: list[Run]) -> None:
    for r in runs:
        if r.link:
            _add_hyperlink(p, r.link, r.text)
            continue
        run = p.add_run(r.text)
        if r.bold:
            run.bold = True
        if r.italic:
            run.italic = True
        if r.strike:
            run.font.strike = True
        if r.code:
            run.font.name = _MONO
            run.font.size = Pt(9.5)
            # rPr children are order-sensitive; shading goes after font/size, so append last.
            run._r.get_or_add_rPr().append(_shading(_CODE_FILL))


def _code(out: DocxDocument, block: CodeBlock, indent: int) -> None:
    p = out.add_paragraph()
    # pPr children are order-sensitive: add shading before python-docx inserts spacing/indent.
    p._p.get_or_add_pPr().append(_shading(_CODE_FILL))
    _indent(p, indent)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(6)
    run = p.add_run(block.text or " ")
    run.font.name = _MONO
    run.font.size = Pt(9)


def _table(out: DocxDocument, block: Table) -> None:
    cols = block.column_count
    if cols == 0:
        return
    table = out.add_table(rows=0, cols=cols)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    rows = ([block.header] if block.header else []) + block.rows
    for row_idx, row in enumerate(rows):
        is_header = bool(block.header) and row_idx == 0
        docx_row = table.add_row()
        if is_header:
            docx_row._tr.get_or_add_trPr().append(OxmlElement("w:tblHeader"))
        for col_idx, cell in enumerate(docx_row.cells):
            runs = row[col_idx] if col_idx < len(row) else []
            p = cell.paragraphs[0]
            align = block.aligns[col_idx] if col_idx < len(block.aligns) else "left"
            p.alignment = _ALIGN.get(align, WD_ALIGN_PARAGRAPH.LEFT)
            _runs(p, [replace(r, bold=True) for r in runs] if is_header else runs)
            if is_header:
                cell._tc.get_or_add_tcPr().append(_shading(_HEAD_FILL))
    out.add_paragraph()


def _rule(out: DocxDocument) -> None:
    p = out.add_paragraph()
    border = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    for key, val in (("w:val", "single"), ("w:sz", "6"), ("w:space", "1"), ("w:color", _RULE_HEX)):
        bottom.set(qn(key), val)
    border.append(bottom)
    p._p.get_or_add_pPr().append(border)


def _indent(p: DocxParagraph, indent: int) -> None:
    if indent:
        p.paragraph_format.left_indent = Cm(_INDENT_CM * indent)


def _shading(fill: str) -> BaseOxmlElement:
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    return shd


def _add_hyperlink(p: DocxParagraph, url: str, text: str) -> None:
    rel_id = p.part.relate_to(url, RELATIONSHIP_TYPE.HYPERLINK, is_external=True)
    link = OxmlElement("w:hyperlink")
    link.set(qn("r:id"), rel_id)
    run = OxmlElement("w:r")
    props = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), _ACCENT_HEX)
    underline = OxmlElement("w:u")
    underline.set(qn("w:val"), "single")
    props.append(color)
    props.append(underline)
    run.append(props)
    node = OxmlElement("w:t")
    node.set(qn("xml:space"), "preserve")
    node.text = text
    run.append(node)
    link.append(run)
    p._p.append(link)
