"""Render an ExportDocument to PDF (fpdf2).

fpdf2's built-in fonts are Latin-1 only, while model output routinely contains curly quotes,
dashes, arrows and non-English text. A Unicode TTF family is used when one is found
(`EXPORT_PDF_FONT_DIR` with DejaVu files, system DejaVu on Linux, Arial/Consolas on Windows,
Arial on macOS); otherwise text is transliterated to Latin-1 for the core fonts.
"""
from __future__ import annotations

import logging
import os
from functools import lru_cache
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos
from fpdf.errors import FPDFException
from fpdf.fonts import FontFace

from src.kc.core.config import settings
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
    runs_text,
)

logger = logging.getLogger(__name__)

_TEXT = (28, 31, 38)
_MUTED = (91, 97, 110)
_ACCENT = (2, 132, 199)
_CODE_BG = (241, 243, 247)
_HEAD_BG = (238, 242, 248)
_RULE = (200, 205, 214)

_BODY_SIZE = 10.5
_LINE_H = 5.6
_INDENT_MM = 6.0
_HEADING_SIZES = {1: 16.5, 2: 14.0, 3: 12.0, 4: 11.0, 5: 10.5, 6: 10.5}

_LATIN1_MAP = str.maketrans(
    {
        "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u2013": "-", "\u2014": "-",
        "\u2026": "...", "\u2022": "-", "\u2192": "->", "\u2190": "<-", "\u2194": "<->",
        "\u21d2": "=>", "\u2264": "<=", "\u2265": ">=", "\u2260": "!=", "\u2713": "v",
        "\u2714": "v", "\u2717": "x", "\u00a0": " ", "\u2009": " ", "\u200b": "",
    }
)

# (regular, bold, italic, bold-italic, mono) file names, tried per directory.
_FAMILIES: list[tuple[str, str, str, str, str]] = [
    ("DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans-Oblique.ttf", "DejaVuSans-BoldOblique.ttf", "DejaVuSansMono.ttf"),
    ("arial.ttf", "arialbd.ttf", "ariali.ttf", "arialbi.ttf", "consola.ttf"),
    ("Arial.ttf", "Arial Bold.ttf", "Arial Italic.ttf", "Arial Bold Italic.ttf", "Courier New.ttf"),
]


def _font_dirs() -> list[Path]:
    dirs = [
        Path("/usr/share/fonts/truetype/dejavu"),
        Path("/usr/share/fonts/dejavu"),
        Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts",
        Path("/System/Library/Fonts/Supplemental"),
    ]
    if settings.export_pdf_font_dir:
        dirs.insert(0, Path(settings.export_pdf_font_dir))
    return dirs


@lru_cache(maxsize=1)
def _unicode_font_files() -> tuple[Path, ...] | None:
    for directory in _font_dirs():
        for family in _FAMILIES:
            paths = tuple(directory / name for name in family)
            if all(p.is_file() for p in paths):
                return paths
    logger.warning("No Unicode TTF fonts found for PDF export; falling back to Latin-1 core fonts")
    return None


class _KcPdf(FPDF):
    body_family = "helvetica"

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font(self.body_family, "", 8)
        self.set_text_color(*_MUTED)
        self.cell(0, 5, f"Knowledge Cartographer   {self.page_no()}", align="R")


class _PdfRenderer:
    def __init__(self) -> None:
        pdf = _KcPdf(format="A4", unit="mm")
        pdf.set_margins(20, 18, 20)
        pdf.set_auto_page_break(True, margin=18)
        fonts = _unicode_font_files()
        if fonts:
            for style, path in zip(("", "B", "I", "BI"), fonts[:4], strict=True):
                pdf.add_font("KcBody", style, str(path))
            pdf.add_font("KcMono", "", str(fonts[4]))
            self.body, self.mono, self.unicode = "KcBody", "KcMono", True
        else:
            self.body, self.mono, self.unicode = "helvetica", "courier", False
        pdf.body_family = self.body
        pdf.set_title("Knowledge Cartographer answer")
        pdf.add_page()
        self.pdf = pdf
        self.base_left = pdf.l_margin

    # --- helpers -------------------------------------------------------------------------
    def t(self, text: str) -> str:
        if self.unicode:
            return text
        return text.translate(_LATIN1_MAP).encode("latin-1", "replace").decode("latin-1")

    def _left(self, indent: float) -> None:
        self.pdf.set_left_margin(self.base_left + indent)
        self.pdf.set_x(self.pdf.l_margin)

    def _runs(self, runs: list[Run], *, size: float = _BODY_SIZE, line_h: float = _LINE_H,
              bold: bool = False, italic: bool = False, color: tuple[int, int, int] = _TEXT) -> None:
        pdf = self.pdf
        for r in runs:
            if not r.text:
                continue
            if r.code:
                pdf.set_font(self.mono, "", size - 1.2)
                pdf.set_text_color(*_TEXT)
            else:
                style = ("B" if (r.bold or bold) else "") + ("I" if (r.italic or italic) else "")
                pdf.set_font(self.body, style + ("U" if r.link else ""), size)
                pdf.set_text_color(*(_ACCENT if r.link else color))
            pdf.write(line_h, self.t(r.text), link=r.link or "")

    # --- document ------------------------------------------------------------------------
    def header_block(self, title: str, meta: str) -> None:
        pdf = self.pdf
        pdf.set_font(self.body, "B", 18)
        pdf.set_text_color(*_TEXT)
        pdf.multi_cell(0, 8.2, self.t(title), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(1.5)
        pdf.set_font(self.body, "", 9)
        pdf.set_text_color(*_MUTED)
        pdf.multi_cell(0, 4.6, self.t(meta), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(2.5)
        y = pdf.get_y()
        pdf.set_draw_color(*_ACCENT)
        pdf.set_line_width(0.6)
        pdf.line(pdf.l_margin, y, pdf.l_margin + 24, y)
        pdf.ln(6)

    def blocks(self, blocks: list[Block], indent: float = 0.0, quote: bool = False) -> None:
        for block in blocks:
            if isinstance(block, Heading):
                self.heading(block, indent)
            elif isinstance(block, Paragraph):
                self.paragraph(block.runs, indent, quote)
            elif isinstance(block, CodeBlock):
                self.code(block, indent)
            elif isinstance(block, Quote):
                self.quote(block, indent)
            elif isinstance(block, ListBlock):
                self.list_block(block, indent, quote)
            elif isinstance(block, Table):
                self.table(block, indent)
            elif isinstance(block, Rule):
                self.rule()
        self._left(0)

    def heading(self, block: Heading, indent: float) -> None:
        size = _HEADING_SIZES.get(block.level, _BODY_SIZE)
        self.pdf.ln(3.5 if block.level <= 2 else 2)
        self._left(indent)
        self._runs(block.runs, size=size, line_h=size * 0.5, bold=True)
        self.pdf.ln(size * 0.5 + 2)

    def paragraph(self, runs: list[Run], indent: float, quote: bool = False) -> None:
        self._left(indent)
        self._runs(runs, italic=quote, color=_MUTED if quote else _TEXT)
        self.pdf.ln(_LINE_H + 2.2)

    def list_block(self, block: ListBlock, indent: float, quote: bool) -> None:
        pdf = self.pdf
        item_indent = indent + _INDENT_MM
        for number, item in enumerate(block.items, start=block.start):
            marker = f"{number}." if block.ordered else ("\u2022" if self.unicode else "-")
            first, rest = (item[0], item[1:]) if item and isinstance(item[0], Paragraph) else (None, item)
            self._left(item_indent)
            pdf.set_x(pdf.l_margin - _INDENT_MM)
            pdf.set_font(self.body, "", _BODY_SIZE)
            pdf.set_text_color(*_MUTED)
            pdf.cell(_INDENT_MM, _LINE_H, marker)
            if first is not None:
                self._runs(first.runs, italic=quote, color=_MUTED if quote else _TEXT)
            pdf.ln(_LINE_H + 1.2)
            if rest:
                self.blocks(rest, item_indent, quote)
        pdf.ln(1.2)

    def code(self, block: CodeBlock, indent: float) -> None:
        pdf = self.pdf
        self._left(indent)
        pdf.set_font(self.mono, "", 8.6)
        pdf.set_text_color(*_TEXT)
        pdf.set_fill_color(*_CODE_BG)
        pdf.ln(0.8)
        pdf.multi_cell(0, 4.3, self.t(block.text) or " ", fill=True, padding=(2, 3),
                       new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(3)

    def quote(self, block: Quote, indent: float) -> None:
        pdf = self.pdf
        start_y, start_page = pdf.get_y(), pdf.page
        self.blocks(block.blocks, indent + 5, quote=True)
        end_y = pdf.get_y() - 2.2
        if pdf.page == start_page and end_y > start_y:
            x = self.base_left + indent + 1.2
            pdf.set_draw_color(*_ACCENT)
            pdf.set_line_width(0.5)
            pdf.line(x, start_y, x, end_y)

    def table(self, block: Table, indent: float) -> None:
        cols = block.column_count
        if cols == 0:
            return
        pdf = self.pdf
        rows = ([block.header] if block.header else []) + block.rows
        aligns = tuple((block.aligns[i] if i < len(block.aligns) else "left").upper() for i in range(cols))
        self._left(indent)
        pdf.set_font(self.body, "", 9)
        pdf.set_text_color(*_TEXT)
        pdf.set_draw_color(*_RULE)
        pdf.set_line_width(0.2)
        try:
            with pdf.table(
                text_align=aligns,
                line_height=4.8,
                first_row_as_headings=bool(block.header),
                headings_style=FontFace(emphasis="BOLD", color=_TEXT, fill_color=_HEAD_BG),
                borders_layout="HORIZONTAL_LINES",
                padding=1.4,
            ) as pdf_table:
                for row in rows:
                    pdf_row = pdf_table.row()
                    for i in range(cols):
                        pdf_row.cell(self.t(runs_text(row[i]) if i < len(row) else ""))
        except FPDFException as exc:
            # Very wide tables can leave columns too narrow for a single glyph; keep the data.
            logger.info("PDF table fell back to text rows: %s", exc)
            for row in rows:
                self.paragraph([Run("  |  ".join(runs_text(c) for c in row))], indent)
        pdf.ln(3)

    def rule(self) -> None:
        pdf = self.pdf
        pdf.ln(1.5)
        y = pdf.get_y()
        pdf.set_draw_color(*_RULE)
        pdf.set_line_width(0.3)
        pdf.line(self.base_left, y, pdf.w - pdf.r_margin, y)
        pdf.ln(4)

    def sources(self, doc: ExportDocument) -> None:
        if not doc.sources:
            return
        self.heading(Heading(2, [Run("Sources")]), 0)
        for idx, src in enumerate(doc.sources, start=1):
            self._left(0)
            runs = [Run(f"[{idx}] ", bold=True), Run(src.label, link=src.url)]
            if src.detail:
                runs.append(Run(f" — {src.detail}"))
            self._runs(runs, size=9.5, line_h=5)
            self.pdf.ln(6)


def render_pdf(doc: ExportDocument) -> bytes:
    renderer = _PdfRenderer()
    renderer.pdf.set_title(renderer.t(doc.title))
    renderer.header_block(doc.title, doc.meta)
    renderer.blocks(doc.blocks)
    renderer.sources(doc)
    return bytes(renderer.pdf.output())
