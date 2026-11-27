"""Parse agent Markdown into a small block model shared by the DOCX and PDF renderers.

Raw HTML is disabled in the parser, so any markup the model emits is kept as literal text.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, replace

from markdown_it import MarkdownIt
from markdown_it.token import Token

_MD = MarkdownIt("commonmark", {"html": False}).enable(["table", "strikethrough"])
_SAFE_LINK_RE = re.compile(r"^(https?://|mailto:)", re.IGNORECASE)
_ALIGN_RE = re.compile(r"text-align:\s*(left|center|right)")


@dataclass(frozen=True)
class Run:
    text: str
    bold: bool = False
    italic: bool = False
    code: bool = False
    strike: bool = False
    link: str | None = None


@dataclass
class Heading:
    level: int
    runs: list[Run]


@dataclass
class Paragraph:
    runs: list[Run]


@dataclass
class CodeBlock:
    text: str
    lang: str = ""


@dataclass
class Quote:
    blocks: list[Block]


@dataclass
class ListBlock:
    ordered: bool
    start: int
    items: list[list[Block]]


@dataclass
class Table:
    header: list[list[Run]]
    rows: list[list[list[Run]]]
    aligns: list[str]

    @property
    def column_count(self) -> int:
        return max([len(self.header), *(len(r) for r in self.rows)], default=0)


@dataclass
class Rule:
    pass


type Block = Heading | Paragraph | CodeBlock | Quote | ListBlock | Table | Rule


@dataclass
class SourceRef:
    label: str
    detail: str = ""
    url: str | None = None


@dataclass
class ExportDocument:
    title: str
    meta: str
    blocks: list[Block]
    sources: list[SourceRef] = field(default_factory=list)


def safe_link(href: str | None) -> str | None:
    """Only http(s) and mailto links survive into exported files."""
    href = (href or "").strip()
    return href if _SAFE_LINK_RE.match(href) else None


def runs_text(runs: list[Run]) -> str:
    return "".join(r.text for r in runs)


def parse_markdown(markdown: str) -> list[Block]:
    blocks, _ = _parse_blocks(_MD.parse(markdown or ""), 0, None)
    return blocks


def _parse_blocks(tokens: list[Token], i: int, close_type: str | None) -> tuple[list[Block], int]:
    blocks: list[Block] = []
    while i < len(tokens):
        tok = tokens[i]
        kind = tok.type
        if close_type is not None and kind == close_type:
            return blocks, i + 1
        if kind == "heading_open":
            blocks.append(Heading(int(tok.tag[1]), _inline_runs(tokens[i + 1])))
            i += 3
        elif kind == "paragraph_open":
            blocks.append(Paragraph(_inline_runs(tokens[i + 1])))
            i += 3
        elif kind in ("fence", "code_block"):
            lang = (tok.info or "").strip().split(" ")[0]
            blocks.append(CodeBlock(tok.content.rstrip("\n").replace("\t", "    "), lang))
            i += 1
        elif kind == "blockquote_open":
            inner, i = _parse_blocks(tokens, i + 1, "blockquote_close")
            blocks.append(Quote(inner))
        elif kind in ("bullet_list_open", "ordered_list_open"):
            ordered = kind == "ordered_list_open"
            start = int(tok.attrGet("start") or 1) if ordered else 1
            list_close = kind.replace("_open", "_close")
            items: list[list[Block]] = []
            i += 1
            while i < len(tokens) and tokens[i].type != list_close:
                item, i = _parse_blocks(tokens, i + 1, "list_item_close")
                items.append(item)
            blocks.append(ListBlock(ordered, start, items))
            i += 1
        elif kind == "table_open":
            table, i = _parse_table(tokens, i + 1)
            blocks.append(table)
        elif kind == "hr":
            blocks.append(Rule())
            i += 1
        else:
            i += 1
    return blocks, i


def _parse_table(tokens: list[Token], i: int) -> tuple[Table, int]:
    header: list[list[Run]] = []
    rows: list[list[list[Run]]] = []
    aligns: list[str] = []
    current: list[list[Run]] = []
    in_head = False
    while i < len(tokens) and tokens[i].type != "table_close":
        tok = tokens[i]
        if tok.type == "thead_open":
            in_head = True
        elif tok.type == "thead_close":
            in_head = False
        elif tok.type == "tr_open":
            current = []
        elif tok.type in ("th_open", "td_open"):
            if in_head:
                match = _ALIGN_RE.search(str(tok.attrGet("style") or ""))
                aligns.append(match.group(1) if match else "left")
            current.append(_inline_runs(tokens[i + 1]))
        elif tok.type == "tr_close":
            if in_head:
                header = current
            else:
                rows.append(current)
        i += 1
    return Table(header, rows, aligns), i + 1


def _inline_runs(inline: Token) -> list[Run]:
    runs: list[Run] = []
    bold = italic = strike = False
    link: str | None = None
    for child in inline.children or []:
        kind = child.type
        if kind == "text":
            runs.append(Run(child.content, bold, italic, False, strike, link))
        elif kind == "code_inline":
            runs.append(Run(child.content, bold, italic, True, strike, link))
        elif kind in ("strong_open", "strong_close"):
            bold = kind == "strong_open"
        elif kind in ("em_open", "em_close"):
            italic = kind == "em_open"
        elif kind in ("s_open", "s_close"):
            strike = kind == "s_open"
        elif kind == "link_open":
            link = safe_link(str(child.attrGet("href") or ""))
        elif kind == "link_close":
            link = None
        elif kind == "softbreak":
            runs.append(Run(" ", bold, italic, False, strike, link))
        elif kind == "hardbreak":
            runs.append(Run("\n", bold, italic, False, strike, link))
        elif kind == "image" and child.content:
            runs.append(Run(child.content, bold, italic, False, strike, link))
    return _merge_runs(runs)


def _merge_runs(runs: list[Run]) -> list[Run]:
    merged: list[Run] = []
    for run in runs:
        if not run.text:
            continue
        prev = merged[-1] if merged else None
        if prev is not None and replace(prev, text="") == replace(run, text=""):
            merged[-1] = replace(prev, text=prev.text + run.text)
        else:
            merged.append(run)
    return merged
