#!/usr/bin/env python3
"""
Build the AutoPark final-year project report as a PDF.

The report is assembled from two sources:

  * docs/project-dossier/*.md   — the verified technical dossier (source of truth)
  * docs/report/extra/*.md       — report-only chapters (literature, requirements, ...)

Usage:
    /opt/anaconda3/bin/python3 scripts/build_report_pdf.py [--out PATH] [--no-figures]

Requirements: reportlab, pillow (both present in the anaconda interpreter).
Mermaid diagrams are rendered with mermaid-cli if it is installed; otherwise the
diagram source is shown in a monospaced box so nothing silently disappears.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    HRFlowable,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

# --------------------------------------------------------------------------- paths

ROOT = Path(__file__).resolve().parent.parent
DOSSIER = ROOT / "docs" / "project-dossier"
REPORT = ROOT / "docs" / "report"
EXTRA = REPORT / "extra"
FIGS = REPORT / "figures"
META_FILE = REPORT / "metadata.json"

A4_W, A4_H = A4
LM = RM = 2.3 * cm
TM = 2.35 * cm
BM = 2.15 * cm
CONTENT_W = A4_W - LM - RM

INK = colors.HexColor("#111111")
MUTED = colors.HexColor("#5A5A5A")
FAINT = colors.HexColor("#8A8A8A")
RULE = colors.HexColor("#C8C8C8")
CODE_BG = colors.HexColor("#F5F5F5")
CODE_BORDER = colors.HexColor("#DCDCDC")
HEAD_BG = colors.HexColor("#EFEFEF")

# --------------------------------------------------------------------------- fonts

FONT_CANDIDATES = {
    "Sans": [
        "/opt/anaconda3/python.app/Contents/lib/python3.13/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans.ttf",
        "/opt/anaconda3/lib/python3.13/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans.ttf",
    ],
    "Sans-Bold": [
        "/opt/anaconda3/python.app/Contents/lib/python3.13/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans-Bold.ttf",
        "/opt/anaconda3/lib/python3.13/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans-Bold.ttf",
    ],
    "Sans-Oblique": [
        "/opt/anaconda3/python.app/Contents/lib/python3.13/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans-Oblique.ttf",
        "/opt/anaconda3/lib/python3.13/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans-Oblique.ttf",
    ],
    "Sans-BoldOblique": [
        "/opt/anaconda3/python.app/Contents/lib/python3.13/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans-BoldOblique.ttf",
        "/opt/anaconda3/lib/python3.13/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans-BoldOblique.ttf",
    ],
    "Mono": [
        "/opt/anaconda3/python.app/Contents/lib/python3.13/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSansMono.ttf",
        "/opt/anaconda3/lib/python3.13/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSansMono.ttf",
    ],
    "Mono-Bold": [
        "/opt/anaconda3/python.app/Contents/lib/python3.13/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSansMono-Bold.ttf",
        "/opt/anaconda3/lib/python3.13/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSansMono-Bold.ttf",
    ],
}


def register_fonts() -> None:
    for name, paths in FONT_CANDIDATES.items():
        for p in paths:
            if os.path.exists(p):
                pdfmetrics.registerFont(TTFont(name, p))
                break
        else:
            raise SystemExit(f"Font not found for {name}; looked in {paths}")
    pdfmetrics.registerFontFamily(
        "Sans", normal="Sans", bold="Sans-Bold", italic="Sans-Oblique", boldItalic="Sans-BoldOblique"
    )
    pdfmetrics.registerFontFamily(
        "Mono", normal="Mono", bold="Mono-Bold", italic="Mono", boldItalic="Mono-Bold"
    )


# --------------------------------------------------------------------------- styles


def build_styles() -> dict:
    s = {}
    s["body"] = ParagraphStyle(
        "Body", fontName="Sans", fontSize=10.2, leading=15.2, alignment=TA_JUSTIFY,
        spaceAfter=6, textColor=INK, splitLongWords=1,
    )
    s["body_first"] = ParagraphStyle("BodyFirst", parent=s["body"], spaceBefore=2)
    s["h1"] = ParagraphStyle(
        "H1", fontName="Sans-Bold", fontSize=19, leading=23, textColor=INK,
        spaceBefore=0, spaceAfter=4,
    )
    s["kicker"] = ParagraphStyle(
        "Kicker", fontName="Sans", fontSize=8, leading=10, textColor=FAINT,
    )
    s["h2"] = ParagraphStyle(
        "H2", fontName="Sans-Bold", fontSize=13, leading=17, textColor=INK,
        spaceBefore=16, spaceAfter=6, keepWithNext=1,
    )
    s["h3"] = ParagraphStyle(
        "H3", fontName="Sans-Bold", fontSize=10.8, leading=14.5, textColor=INK,
        spaceBefore=11, spaceAfter=4, keepWithNext=1,
    )
    s["h4"] = ParagraphStyle(
        "H4", fontName="Sans-BoldOblique", fontSize=10, leading=13.5, textColor=INK,
        spaceBefore=8, spaceAfter=3, keepWithNext=1,
    )
    s["bullet"] = ParagraphStyle(
        "Bullet", parent=s["body"], leftIndent=15, firstLineIndent=-12, spaceAfter=3.5,
    )
    s["bullet2"] = ParagraphStyle(
        "Bullet2", parent=s["body"], leftIndent=31, firstLineIndent=-12, spaceAfter=3.5,
    )
    s["code"] = ParagraphStyle(
        "Code", fontName="Mono", fontSize=7.5, leading=9.6, textColor=INK,
        backColor=CODE_BG, borderColor=CODE_BORDER, borderWidth=0.5,
        borderPadding=(6, 7, 6, 7), spaceBefore=4, spaceAfter=10,
    )
    s["quote"] = ParagraphStyle(
        "Quote", parent=s["body"], leftIndent=14, rightIndent=8, fontSize=9.8,
        leading=14, textColor=MUTED, spaceBefore=2, spaceAfter=8,
    )
    s["cell"] = ParagraphStyle(
        "Cell", fontName="Sans", fontSize=8.1, leading=10.6, textColor=INK,
        splitLongWords=1,
    )
    s["cell_head"] = ParagraphStyle(
        "CellHead", fontName="Sans-Bold", fontSize=8.1, leading=10.6, textColor=INK,
    )
    s["ref"] = ParagraphStyle(
        "Ref", fontName="Sans", fontSize=9.3, leading=12.9, alignment=TA_LEFT,
        leftIndent=20, firstLineIndent=-20, spaceAfter=4.2, textColor=INK,
    )
    s["caption"] = ParagraphStyle(
        "Caption", fontName="Sans-Oblique", fontSize=8.2, leading=11, textColor=MUTED,
        spaceBefore=5, spaceAfter=10, alignment=TA_LEFT,
    )
    s["fig_caption"] = ParagraphStyle(
        "FigCaption", parent=s["caption"], alignment=TA_CENTER, spaceBefore=5,
    )
    s["tbl_caption"] = ParagraphStyle(
        "TblCaption", fontName="Sans-Bold", fontSize=8.2, leading=11, textColor=INK,
        spaceBefore=8, spaceAfter=4, keepWithNext=1,
    )
    s["tbl_caption_loose"] = ParagraphStyle(
        "TblCaptionLoose", parent=s["tbl_caption"], keepWithNext=0,
    )
    s["title"] = ParagraphStyle(
        "DocTitle", fontName="Sans-Bold", fontSize=31, leading=36, textColor=INK,
        alignment=TA_LEFT,
    )
    s["subtitle"] = ParagraphStyle(
        "DocSub", fontName="Sans", fontSize=13, leading=19, textColor=MUTED,
        alignment=TA_LEFT,
    )
    s["front_h"] = ParagraphStyle(
        "FrontH", fontName="Sans-Bold", fontSize=15, leading=19, textColor=INK,
        spaceAfter=14,
    )
    s["front_body"] = ParagraphStyle(
        "FrontBody", parent=s["body"], alignment=TA_LEFT,
    )
    s["toc_h"] = ParagraphStyle(
        "TocH", fontName="Sans-Bold", fontSize=15, leading=19, textColor=INK,
        spaceAfter=16,
    )
    return s


STYLES: dict = {}
REPORT_META: dict = {}


# --------------------------------------------------------------------------- markdown

META_INLINE_RE = re.compile(r"\*\*\[PASTE\]\*\*|\[PASTE\]")


def clean_title(text: str) -> str:
    t = text.replace("\\u2194", "↔").replace("\\u2192", "→")
    t = re.sub(r"^\d+(\.\d+)*\.?\s+", "", t.strip())
    t = t.replace("**[PASTE]**", "").replace("[PASTE]", "").replace("`", "")
    return t.strip(" -—")


def norm_key(text: str) -> str:
    t = clean_title(text).lower()
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


EXTRA_TITLES = {norm_key(k): v for k, v in {
    "system-level evaluation (argument, not measurement)": "System-level evaluation",
    "regression checklist (run before every submission/demo)": "Regression checklist",
    "hardware limitations (state these honestly)": "Hardware limitations",
    "why these specific versions": "Version selection",
    "startup sequence": "Startup, migration and reset",
    "what has actually been demonstrated": "Verified functional results",
    "metrics that must still be measured": "Measurement definitions and protocol",
    "frontend ↔ backend contract notes": "Frontend–backend contract",
}.items()}


def override_title(title: str) -> str:
    return EXTRA_TITLES.get(norm_key(title), title)


EXCLUDE_TITLES = {
    "why this works in a viva",
    "what to show in the report",
    "elevator pitches",
    "title",
    "abstract **[paste]**",
    "abstract",
    "table notes",
}

META_QUOTE_RE = re.compile(
    r"(examiner|viva|slide|dossier|report phrasing|for the report|do not claim|"
    r"framing|generated:|source of truth|caption|screenshot|this chapter tells you|"
    r"paste|indicative only|record the|useful for the|future work\" slide|"
    r"universities differ|you can present|how to use it|maintenance rule|colour|"
    r"before submission|read before writing|claims policy|what to say|how to phrase|"
    r"how to write|if you cannot|if the examiner|the correct answer is|your team)",
    re.I,
)

META_PARA_RE = re.compile(
    r"^(\*|\s)*indicative only|^note for the report|^report phrasing|^do not fill|"
    r"^if the examiner|^how to write this|^\\\*|^for the report|^a defect table|"
    r"^the single most important sentence|^this dossier|^the rule baked",
    re.I,
)


def is_meta_quote(text: str) -> bool:
    return bool(META_QUOTE_RE.search(text))


def is_meta_para(text: str) -> bool:
    return bool(META_PARA_RE.search(text.strip()))


META_SENT_RE = re.compile(
    r"(belongs in the abstract|for the report|in the viva|the viva|examiners?|"
    r"on the slide|the slide|dossier|report phrasing|if asked|when you present|"
    r"do not claim|do not say|this is the sentence|say this out loud|your team|"
    r"\bviva\b)",
    re.I,
)


def strip_meta_sentences(text: str) -> str:
    """Drop sentences that are advice to the author rather than report content."""
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    kept = [p for p in parts if p and not META_SENT_RE.search(p)]
    return " ".join(kept).strip()


# --------------------------------------------------------------------------- parsing


def split_row(line: str) -> list[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


TABLE_SEP = re.compile(r"^\s*\|?[\s:|-]+\|[\s:|-]*$")


def parse_markdown(text: str) -> list[dict]:
    lines = text.splitlines()
    blocks: list[dict] = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        if not line.strip():
            i += 1
            continue

        if line.lstrip().startswith("```"):
            lang = line.lstrip()[3:].strip()
            i += 1
            buf = []
            while i < n and not lines[i].lstrip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            blocks.append({"t": "code", "lang": lang, "text": "\n".join(buf)})
            continue

        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            blocks.append({"t": "h", "level": len(m.group(1)), "text": m.group(2).strip()})
            i += 1
            continue

        if re.match(r"^\s*-{3,}\s*$", line):
            blocks.append({"t": "hr"})
            i += 1
            continue

        if line.lstrip().startswith(">"):
            buf = []
            while i < n and lines[i].lstrip().startswith(">"):
                buf.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            blocks.append({"t": "quote", "text": "\n".join(buf).strip()})
            continue

        if line.strip().startswith("|") and i + 1 < n and TABLE_SEP.match(lines[i + 1]):
            header = split_row(line)
            i += 2
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            width = len(header)
            rows = [r + [""] * (width - len(r)) if len(r) < width else r[:width] for r in rows]
            blocks.append({"t": "table", "header": header, "rows": rows})
            continue

        m = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", line)
        if m:
            ordered = m.group(2)[0].isdigit()
            start = int(m.group(2)[:-1]) if ordered else 1
            items: list[list] = []
            while i < n:
                raw = lines[i]
                if not raw.strip():
                    break
                m2 = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", raw)
                if m2:
                    items.append([len(m2.group(1)), m2.group(3).strip()])
                    i += 1
                    continue
                # lazy continuation lines belong to the previous item
                if not items or re.match(r"^(#{1,6}\s|```|>|\|)", raw) or re.match(
                    r"^\s*-{3,}\s*$", raw
                ):
                    break
                items[-1][1] = (items[-1][1] + " " + raw.strip()).strip()
                i += 1
            blocks.append({"t": "ol" if ordered else "ul", "items": items, "start": start})
            continue

        buf = [line.strip()]
        i += 1
        while i < n and lines[i].strip():
            nxt = lines[i]
            if re.match(r"^(#{1,6}\s|```|>|\||\s*[-*]\s+|\s*\d+\.\s+)", nxt) or re.match(
                r"^\s*-{3,}\s*$", nxt
            ):
                break
            buf.append(nxt.strip())
            i += 1
        blocks.append({"t": "p", "text": " ".join(buf)})
    return blocks


def build_tree(blocks: list[dict]) -> dict:
    root = {"level": 0, "title": "", "blocks": [], "children": []}
    stack = [root]
    for b in blocks:
        if b["t"] == "h":
            node = {"level": b["level"], "title": clean_title(b["text"]), "blocks": [], "children": []}
            while stack and stack[-1]["level"] >= b["level"]:
                stack.pop()
            stack[-1]["children"].append(node)
            stack.append(node)
        else:
            stack[-1]["blocks"].append(b)
    return root


_CACHE: dict[str, dict] = {}


def load_tree(path: Path) -> dict:
    key = str(path)
    if key not in _CACHE:
        _CACHE[key] = build_tree(parse_markdown(path.read_text(encoding="utf-8")))
    return _CACHE[key]


def find_node(root: dict, title: str) -> dict | None:
    want = norm_key(title)
    for child in root["children"]:
        if norm_key(child["title"]) == want:
            return child
        hit = find_node(child, title)
        if hit:
            return hit
    return None


# --------------------------------------------------------------------------- inline

INLINE_RE = re.compile(
    r"(\*\*[^*]+\*\*|`[^`]+`|(?<!\*)\*[^*\n]+\*(?!\*)|\[[^\]]+\]\([^)]+\))"
)
EMOJI_MAP = {
    "✅": "PASS", "❌": "FAIL", "⚠️": "!", "⚠": "!", "🟢": "G", "🟡": "A", "🔴": "R",
    "✓": "yes", "✗": "no",
}


def esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def inline_plain(text: str) -> str:
    """Inline conversion without re-splitting bold/italic markers."""
    text = META_INLINE_RE.sub("", text)
    for k, v in EMOJI_MAP.items():
        text = text.replace(k, v)
    pieces = []
    pos = 0
    for m in re.finditer(r"`([^`]+)`", text):
        pieces.append(esc(text[pos:m.start()]))
        pieces.append(f'<font name="Mono" size="8.6">{esc(m.group(1))}</font>')
        pos = m.end()
    pieces.append(esc(text[pos:]))
    return "".join(pieces)


def inline(text: str) -> str:
    for k, v in EMOJI_MAP.items():
        text = text.replace(k, v)
    text = META_INLINE_RE.sub("", text)
    out = []
    for part in INLINE_RE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) > 4:
            out.append(f"<b>{inline_plain(part[2:-2])}</b>")
        elif part.startswith("`") and part.endswith("`") and len(part) > 2:
            out.append(f'<font name="Mono" size="8.6">{esc(part[1:-1])}</font>')
        elif part.startswith("*") and part.endswith("*") and len(part) > 2:
            out.append(f"<i>{inline_plain(part[1:-1])}</i>")
        elif part.startswith("[") and "](" in part:
            label = re.match(r"\[([^\]]+)\]\(([^)]+)\)", part).group(1)
            out.append(inline_plain(label))
        else:
            out.append(esc(part))
    return "".join(out).replace(
        "[TO MEASURE]",
        '<font color="#5A5A5A"><i>[to be measured]</i></font>',
    )


# --------------------------------------------------------------------------- mermaid

MMDC = Path("/tmp/mmd/node_modules/.bin/mmdc")
PPTR = Path("/tmp/mmd/pptr.json")
MMD_CONFIG = Path("/tmp/mmd/monochrome.json")

MMD_THEME = {
    "theme": "base",
    "themeVariables": {
        "fontFamily": "DejaVu Sans, Helvetica, sans-serif",
        "fontSize": "17px",
        "primaryColor": "#FFFFFF",
        "primaryTextColor": "#111111",
        "primaryBorderColor": "#333333",
        "secondaryColor": "#F2F2F2",
        "secondaryTextColor": "#111111",
        "secondaryBorderColor": "#777777",
        "tertiaryColor": "#FFFFFF",
        "tertiaryTextColor": "#111111",
        "tertiaryBorderColor": "#AAAAAA",
        "lineColor": "#333333",
        "textColor": "#111111",
        "noteBkgColor": "#F4F4F4",
        "noteTextColor": "#111111",
        "noteBorderColor": "#BBBBBB",
        "actorBkg": "#FFFFFF",
        "actorBorder": "#333333",
        "actorTextColor": "#111111",
        "actorLineColor": "#888888",
        "signalColor": "#333333",
        "signalTextColor": "#111111",
        "labelBoxBkgColor": "#FFFFFF",
        "labelBoxBorderColor": "#333333",
        "labelTextColor": "#111111",
        "loopTextColor": "#111111",
        "activationBorderColor": "#333333",
        "activationBkgColor": "#F0F0F0",
        "sequenceNumberColor": "#111111",
        "clusterBkg": "#FAFAFA",
        "clusterBorder": "#CCCCCC",
    },
    # Extra whitespace between nodes so diagrams do not look cramped when
    # scaled down to the text column width.
    "flowchart": {
        "nodeSpacing": 70,
        "rankSpacing": 80,
        "padding": 16,
        "useMaxWidth": False,
    },
    "state": {
        "nodeSpacing": 70,
        "rankSpacing": 80,
        "padding": 16,
        "useMaxWidth": False,
    },
    "sequence": {
        "actorMargin": 55,
        "messageMargin": 38,
        "boxMargin": 12,
        "noteMargin": 12,
        "mirrorActors": False,
        "wrap": True,
        "width": 120,
        "useMaxWidth": False,
    },
    "er": {
        "entityPadding": 25,
        "minEntityWidth": 140,
        "minEntityHeight": 90,
        "useMaxWidth": False,
    },
}


def mermaid_available() -> bool:
    return MMDC.exists() and PPTR.exists()


def render_mermaid(code: str, out: Path) -> bool:
    if out.exists() and out.stat().st_size > 0:
        return True
    if not mermaid_available():
        return False
    MMD_CONFIG.write_text(json.dumps(MMD_THEME), encoding="utf-8")
    with tempfile.NamedTemporaryFile("w", suffix=".mmd", delete=False) as fh:
        fh.write(code)
        tmp = fh.name
    try:
        proc = subprocess.run(
            [str(MMDC), "-i", tmp, "-o", str(out), "-p", str(PPTR),
             "-b", "white", "-s", "3", "-c", str(MMD_CONFIG)],
            capture_output=True, text=True, timeout=180,
        )
        return proc.returncode == 0 and out.exists()
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


# --------------------------------------------------------------------------- captions


class Caption(Paragraph):
    """A caption that registers itself for the list of figures / tables."""

    def __init__(self, text, style, kind, plain):
        super().__init__(text, style)
        self.kind = kind
        self.plain = plain


class TocProxy(TableOfContents):
    """TableOfContents that listens to a custom notify kind."""

    def __init__(self, kind: str, **kw):
        self._accept = kind
        super().__init__(**kw)

    def notify(self, kind, stuff):
        if kind == self._accept:
            super().notify("TOCEntry", stuff)


class ReportBuilder:
    def __init__(self, story_ctx: dict):
        self.ctx = story_ctx
        self.story: list = []
        self.chapter = 0
        self.sec = 0
        self.sub = 0
        self.fig_n = 0
        self.tab_n = 0
        self.mermaid_n = 0
        self.ref_mode = False
        self.pending_caption = None
        self.heading_chain: list = []
        self.cap_counts: dict = {}
        self.toc_entries: list[tuple[int, str]] = []

    # -- headings ---------------------------------------------------------
    def heading(self, number: str, title: str, level: int, toc: bool = True):
        title = override_title(title)
        st = STYLES["h2"] if level == 2 else STYLES["h3"] if level == 3 else STYLES["h4"]
        label = f"{number}&nbsp;&nbsp;{inline(title)}" if number else inline(title)
        p = Paragraph(label, st)
        if toc and level == 2:
            p._toc = (1, f"{number}  {title}" if number else title)
        self.story.append(p)
        if self.heading_chain and self.story[-2:-1] == [self.heading_chain[-1]]:
            self.heading_chain.append(p)
        else:
            self.heading_chain = [p]

    def chapter_heading(self, num: int, title: str):
        self.story.append(PageBreak())
        kicker = "APPENDIX" if isinstance(num, str) and not str(num).isdigit() else "CHAPTER"
        self.story.append(Paragraph(f"{kicker} {num}", ParagraphStyle(
            "ck", fontName="Sans", fontSize=8.5, leading=11, textColor=FAINT,
            spaceAfter=2,
        )))
        p = Paragraph(inline(title), STYLES["h1"])
        p._toc = (0, f"{num}   {title}")
        self.story.append(p)
        self.story.append(Spacer(1, 4))
        self.story.append(HRFlowable(width="100%", thickness=1.1, color=INK, spaceAfter=14))
        self.sec = 0
        self.sub = 0
        self.fig_n = 0
        self.tab_n = 0

    # -- primitives -------------------------------------------------------
    def para(self, text: str):
        if is_meta_para(text):
            return
        m = re.match(r"^\*\*Table\s+[\w.]+\s*[—-]\s*(.+?)\*\*$", text.strip())
        if m:
            self.pending_caption = m.group(1).strip()
            return
        self.heading_chain = []
        text = strip_meta_sentences(text)
        if not text:
            return
        if self.ref_mode and re.match(r"^\[\d+\]", text):
            self.story.append(Paragraph(inline(text), STYLES["ref"]))
            return
        self.story.append(Paragraph(inline(text), STYLES["body"]))

    def bullets(self, items, ordered=False, start=1):
        self.heading_chain = []
        counters = {}
        for i, (indent, text) in enumerate(items):
            style = STYLES["bullet"] if indent < 2 else STYLES["bullet2"]
            if ordered:
                counters[indent] = counters.get(indent, start - 1) + 1
                bullet = f"{counters[indent]}."
            else:
                bullet = "•"
            text = strip_meta_sentences(text)
            if not text:
                continue
            self.story.append(
                Paragraph(f"{bullet}&nbsp;&nbsp;&nbsp;{inline(text)}", style)
            )

    def code(self, text: str, lang: str):
        if lang == "mermaid":
            self.figure_from_mermaid(text)
            return
        self.heading_chain = []
        text = text.rstrip()
        if not text:
            return
        lines = text.splitlines()
        art = any(ch in text for ch in "┌└│├┤┬┴┼►◄▲▼")
        avail = CONTENT_W - 22
        maxlen = max((len(l) for l in lines), default=1) or 1
        style = STYLES["code"]
        limit = 104
        if maxlen * 0.602 * 7.5 > avail:
            # shrink the font so the widest line fits rather than wrapping it
            size = max(5.4, min(7.5, avail / (0.602 * maxlen)))
            style = ParagraphStyle(
                "CodeFit", parent=STYLES["code"], fontSize=size, leading=size * 1.28,
            )
            if not art:
                limit = max(40, int(avail / (0.602 * size)))
            else:
                limit = 10_000
        wrapped = []
        for line in lines:
            while len(line) > limit:
                cut = line.rfind(" ", 0, limit)
                if cut < limit * 0.6:
                    cut = limit
                wrapped.append(line[:cut])
                line = "    " + line[cut:].lstrip()
            wrapped.append(line)
        body = "<br/>".join(
            esc(l).replace(" ", "&nbsp;") if l.strip() else "&nbsp;" for l in wrapped
        )
        self.story.append(Paragraph(body, style))

    def quote(self, text: str):
        self.heading_chain = []
        if is_meta_quote(text):
            return
        long_form = len(text) > 320
        for para in re.split(r"\n\s*\n", text):
            para = " ".join(l.strip() for l in para.splitlines() if l.strip())
            para = strip_meta_sentences(para)
            if not para or is_meta_para(para):
                continue
            self.story.append(
                Paragraph(inline(para), STYLES["body"] if long_form else STYLES["quote"])
            )

    def keep_with_heading(self, group: list) -> list:
        """Glue the heading (or heading chain) to a block that must not be split."""
        chain, self.heading_chain = self.heading_chain, []
        if chain and self.story[-len(chain):] == chain:
            del self.story[-len(chain):]
            return chain + group
        return group

    def table(self, header, rows):
        self.tab_n += 1
        explicit = self.pending_caption
        self.pending_caption = None
        caption = explicit or self.ctx.get("last_heading") or "Table"
        if not explicit:
            key = (self.chapter, caption)
            self.cap_counts[key] = self.cap_counts.get(key, 0) + 1
            if self.cap_counts[key] > 1:
                caption = f"{caption}, part {self.cap_counts[key]}"
        label = f"Table {self.chapter}.{self.tab_n}"
        cap_style = STYLES["tbl_caption"] if len(rows) <= 8 else STYLES["tbl_caption_loose"]
        cap = Caption(
            f"{label} — {esc(caption)}", cap_style, "table",
            f"{label}  {caption}",
        )

        ncols = len(header)
        weights = []
        for c in range(ncols):
            lengths = [len(re.sub(r"[*`]", "", header[c]))] + [
                len(re.sub(r"[*`]", "", r[c])) for r in rows
            ]
            avg = sum(lengths) / len(lengths)
            peak = max(lengths)
            score = 0.65 * avg + 0.35 * peak
            if any("`" in r[c] for r in rows):
                score *= 1.35
            weights.append(max(6.0, min(60.0, score ** 0.85)))
        total = sum(weights)
        widths = [CONTENT_W * w / total for w in weights]
        # never squeeze a column below its longest word (header included)
        mins = []
        for c in range(ncols):
            words = [
                re.sub(r"[`*]", "", w)
                for w in re.findall(r"\S+", " ".join([header[c]] + [r[c] for r in rows]))
            ]
            mono = any("`" in r[c] for r in rows)
            bold = any("**" in r[c] for r in rows)
            face, size = ("Mono", 8.6) if mono else ("Sans", 8.1)
            need = max(
                (pdfmetrics.stringWidth(w, face, size) for w in words if w), default=20
            )
            if bold and not mono:
                need = max(need, max(
                    (pdfmetrics.stringWidth(w, "Sans-Bold", size) for w in words if w),
                    default=20,
                ))
            cap_w = 7.4 * cm if mono else 4.2 * cm
            mins.append(min(cap_w, max(1.55 * cm, need + 9)))
        if sum(mins) > CONTENT_W:
            scale = CONTENT_W / sum(mins)
            mins = [m * scale for m in mins]
        # lift columns up to their minimum, paying for it from the slack of the
        # others in proportion to how much room they have to give
        for _ in range(6):
            deficit = sum(max(0.0, mins[i] - widths[i]) for i in range(ncols))
            if deficit < 0.5:
                break
            widths = [max(widths[i], mins[i]) for i in range(ncols)]
            slack = [max(0.0, widths[i] - mins[i]) for i in range(ncols)]
            room = sum(slack)
            if room <= 0:
                break
            for i in range(ncols):
                widths[i] -= deficit * slack[i] / room
        scale = CONTENT_W / sum(widths)
        widths = [w * scale for w in widths]

        cells_total = max(1, len(rows) * ncols)
        blanks = sum(1 for r in rows for c in r if not c.strip())
        fill_blanks = blanks / cells_total > 0.25
        data = [[Paragraph(inline(c), STYLES["cell_head"]) for c in header]]
        for r in rows:
            cells = [
                c if (c.strip() or not fill_blanks or i == 0) else "[TO MEASURE]"
                for i, c in enumerate(r)
            ]
            data.append([Paragraph(inline(c), STYLES["cell"]) for c in cells])

        t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), HEAD_BG),
            ("TEXTCOLOR", (0, 0), (-1, -1), INK),
            ("GRID", (0, 0), (-1, -1), 0.4, RULE),
            ("LINEBELOW", (0, 0), (-1, 0), 0.7, INK),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ]))
        # KeepTogether still splits a table that is taller than a whole page,
        # but it keeps the heading and caption with the first rows.
        self.story.append(
            KeepTogether(self.keep_with_heading([cap, t, Spacer(1, 9)]))
        )

    def figure_from_mermaid(self, code: str):
        self.fig_n += 1
        self.mermaid_n += 1
        out = FIGS / f"fig-{self.mermaid_n:02d}.png"
        caption = self.ctx.get("last_heading") or "Diagram"
        label = f"Figure {self.chapter}.{self.fig_n}"
        if render_mermaid(code, out):
            pil = PILImage.open(out)
            iw, ih = pil.size
            # Target an on-page text size of roughly 10 pt: mermaid renders body
            # text at 17 px and the PNG is produced at 3x, so one PNG pixel is
            # worth about 0.207 pt on the page.
            width = min(CONTENT_W, max(6.0 * cm, iw * 0.2067))
            height = width * ih / iw
            if height > 22.5 * cm:
                height = 22.5 * cm
                width = height * iw / ih
            self.story.append(KeepTogether(self.keep_with_heading([
                Image(str(out), width=width, height=height),
                Caption(
                    f"{label} — {esc(caption)}", STYLES["fig_caption"], "figure",
                    f"{label}  {caption}",
                ),
            ])))
        else:
            self.story.append(Paragraph(f"{label} — {esc(caption)}", STYLES["tbl_caption"]))
            body = "<br/>".join(esc(l).replace(" ", "&nbsp;") if l.strip() else "&nbsp;"
                                for l in code.splitlines())
            self.story.append(Paragraph(body, STYLES["code"]))

    # -- section tree -----------------------------------------------------
    def render_node(self, node: dict, number: str, level: int, props: dict):
        self.ctx["last_heading"] = node["title"]
        prev_ref = self.ref_mode
        if norm_key(node["title"]).startswith("references"):
            self.ref_mode = True
        self.heading(number, node["title"], level)
        for b in node["blocks"]:
            self.render_block(b)
        child = 0
        for c in node["children"]:
            if norm_key(c["title"]) in EXCLUDE_TITLES:
                continue
            child += 1
            self.render_node(c, f"{number}.{child}", level + 1, props)
        self.ref_mode = prev_ref

    def render_block(self, b: dict):
        t = b["t"]
        if t in ("p", "ul", "ol", "quote", "hr"):
            pass
        if t == "p":
            self.para(b["text"])
        elif t == "ul":
            self.bullets(b["items"], ordered=False)
        elif t == "ol":
            self.bullets(b["items"], ordered=True, start=b.get("start", 1))
        elif t == "code":
            self.code(b["text"], b["lang"])
        elif t == "table":
            self.table(b["header"], b["rows"])
        elif t == "quote":
            self.quote(b["text"])
        elif t == "hr":
            self.story.append(Spacer(1, 2))
        elif t == "h":
            # headings inside a flat (extra) file are handled by the tree
            pass


# --------------------------------------------------------------------------- document


class ReportDoc(BaseDocTemplate):
    def __init__(self, filename: str, meta: dict, **kw):
        super().__init__(filename, pagesize=A4, leftMargin=LM, rightMargin=RM,
                         topMargin=TM, bottomMargin=BM,
                         title=f"{meta['title']} — {meta['report_type']}",
                         author=", ".join(re.sub(r"\s*—.*$", "", m) for m in meta["team"]),
                         subject=meta["subtitle"],
                         creator="AutoPark report builder", **kw)
        frame = Frame(LM, BM, CONTENT_W, A4_H - TM - BM, id="body",
                      leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([PageTemplate(id="page", frames=[frame], onPage=self.decorate)])

    def decorate(self, canv, doc):
        canv.saveState()
        if doc.page > 1:
            canv.setFont("Sans", 7.4)
            canv.setFillColor(FAINT)
            canv.drawString(LM, A4_H - 1.55 * cm, "AutoPark — Camera-Based Smart Parking System")
            canv.drawRightString(A4_W - RM, A4_H - 1.55 * cm, REPORT_META["report_type"])
            canv.setStrokeColor(RULE)
            canv.setLineWidth(0.5)
            canv.line(LM, A4_H - 1.75 * cm, A4_W - RM, A4_H - 1.75 * cm)
            canv.setFont("Sans", 8.4)
            canv.setFillColor(MUTED)
            canv.drawCentredString(A4_W / 2, 1.15 * cm, str(doc.page))
        canv.restoreState()

    def afterFlowable(self, flowable):
        toc = getattr(flowable, "_toc", None)
        if toc:
            self.notify("TOCEntry", (toc[0], toc[1], self.page))
        if isinstance(flowable, Caption):
            kind = "LOFEntry" if flowable.kind == "figure" else "LOTEntry"
            self.notify(kind, (0, flowable.plain, self.page))


# --------------------------------------------------------------------------- front matter


def title_page(meta: dict) -> list:
    s = STYLES
    out = [
        Spacer(1, 1.4 * cm),
        HRFlowable(width="100%", thickness=2.4, color=INK, spaceAfter=6),
        Paragraph(meta["report_type"].upper(), ParagraphStyle(
            "rt", fontName="Sans", fontSize=9, leading=12, textColor=MUTED,
        )),
        Spacer(1, 2.4 * cm),
        Paragraph(esc(meta["title"]), s["title"]),
        Spacer(1, 10),
        Paragraph(esc(meta["subtitle"]), s["subtitle"]),
        Spacer(1, 2.2 * cm),
    ]
    rows = [[Paragraph("<b>Submitted by</b>", s["cell"])] + [
        Paragraph(esc(meta["team"][0]), s["cell"])]]
    for m in meta["team"][1:]:
        rows.append([Paragraph("", s["cell"]), Paragraph(esc(m), s["cell"])])
    rows.append([Paragraph("<b>Under the guidance of</b>", s["cell"]),
                 Paragraph(esc(meta["guide"]), s["cell"])])
    t = Table(rows, colWidths=[5.2 * cm, CONTENT_W - 5.2 * cm], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
    ]))
    out += [t, Spacer(1, 6.2 * cm),
            HRFlowable(width="100%", thickness=0.7, color=RULE, spaceAfter=10),
            Paragraph(esc(meta["department"]), ParagraphStyle(
                "dp", fontName="Sans-Bold", fontSize=10.5, leading=14, textColor=INK)),
            Paragraph(esc(meta["institution"]), ParagraphStyle(
                "inst", fontName="Sans", fontSize=10.5, leading=14, textColor=INK)),
            Paragraph(esc(meta["place"]), ParagraphStyle(
                "pl", fontName="Sans", fontSize=9.5, leading=13, textColor=MUTED)),
            Spacer(1, 8),
            Paragraph(esc(meta["month_year"]), ParagraphStyle(
                "my", fontName="Sans", fontSize=10.5, leading=14, textColor=INK)),
            ]
    return out


def front_page(title: str, body: list) -> list:
    return [PageBreak(), Paragraph(esc(title), STYLES["front_h"]), *body]


def declaration(meta: dict) -> list:
    body = [
        Paragraph(
            "I/We declare that the project report entitled "
            f"<b>&ldquo;{esc(meta['title'])}: {esc(meta['subtitle'])}&rdquo;</b> "
            "submitted to " + esc(meta["institution"]) + " in partial fulfilment of the "
            "requirements for the award of the degree of Bachelor of Engineering is a "
            "record of original work carried out under the supervision of "
            f"{esc(meta['guide'])}. The work has not been submitted, either in part or in "
            "full, for the award of any other degree or diploma of this or any other "
            "institution.",
            STYLES["front_body"],
        ),
        Spacer(1, 12),
        Paragraph(
            "Where the work of others has been used, it has been duly acknowledged and "
            "cited in the reference list.",
            STYLES["front_body"],
        ),
        Spacer(1, 2.4 * cm),
    ]
    sig = Table(
        [[Paragraph("________________________", STYLES["cell"]),
          Paragraph("________________________", STYLES["cell"])],
         [Paragraph("Place: " + esc(meta["place"]), STYLES["cell"]),
          Paragraph("Signature of the candidate(s)", STYLES["cell"])],
         [Paragraph("Date:", STYLES["cell"]), Paragraph("", STYLES["cell"])]],
        colWidths=[CONTENT_W / 2, CONTENT_W / 2], hAlign="LEFT",
    )
    sig.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0),
                             ("TOPPADDING", (0, 0), (-1, -1), 2)]))
    return body + [sig]


def certificate(meta: dict) -> list:
    body = [
        Paragraph(
            "This is to certify that the project report entitled "
            f"<b>&ldquo;{esc(meta['title'])}: {esc(meta['subtitle'])}&rdquo;</b> is a "
            "bonafide record of the project work carried out by the candidates named below, "
            f"under my supervision, in partial fulfilment of the requirements for the award "
            f"of the degree of Bachelor of Engineering in the {esc(meta['department'])} of "
            f"{esc(meta['institution'])} during the academic year "
            f"{esc(meta['academic_year'])}.",
            STYLES["front_body"],
        ),
        Spacer(1, 14),
    ]
    rows = [[Paragraph(f"<b>{esc(m.split('—')[0].strip())}</b>", STYLES["cell"]),
             Paragraph(esc(m.split("—")[-1].strip()), STYLES["cell"])] for m in meta["team"]]
    t = Table(rows, colWidths=[7.2 * cm, CONTENT_W - 7.2 * cm], hAlign="LEFT")
    t.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("TOPPADDING", (0, 0), (-1, -1), 2),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    body.append(t)
    body += [
        Spacer(1, 2.6 * cm),
        Table([[Paragraph("________________________", STYLES["cell"]),
                Paragraph("________________________", STYLES["cell"])],
               [Paragraph("Project Guide<br/>" + esc(meta["guide"]), STYLES["cell"]),
                Paragraph("Head of the Department", STYLES["cell"])]],
              colWidths=[CONTENT_W / 2, CONTENT_W / 2],
              style=TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0)])),
        Spacer(1, 1.2 * cm),
        Table([[Paragraph("________________________", STYLES["cell"]),
                Paragraph("________________________", STYLES["cell"])],
               [Paragraph("Internal Examiner", STYLES["cell"]),
                Paragraph("External Examiner", STYLES["cell"])]],
              colWidths=[CONTENT_W / 2, CONTENT_W / 2],
              style=TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0)])),
    ]
    return body


def acknowledgement(meta: dict) -> list:
    body = [
        Paragraph(
            "We record our sincere gratitude to our project guide, "
            f"{esc(meta['guide'])}, for the direction, review and patient criticism that "
            "shaped this work from an idea into a working system. We thank the Head of the "
            f"{esc(meta['department'])}, {esc(meta['institution'])}, for the facilities and "
            "the freedom to build and test the prototype on the department premises.",
            STYLES["front_body"],
        ),
        Paragraph(
            "We thank the laboratory staff for access to the electronics bench, the "
            "measurement equipment and the network used during the hardware trials, and our "
            "classmates who acted as test drivers and whose unreadable plates, mistyped "
            "bookings and determined attempts to break the gate produced most of the defect "
            "log in Chapter 6.",
            STYLES["front_body"],
        ),
        Paragraph(
            "Finally, we thank our families for their support through the semesters in "
            "which this project competed with everything else.",
            STYLES["front_body"],
        ),
        Spacer(1, 1.6 * cm),
        Paragraph("— The Authors", ParagraphStyle(
            "sig", fontName="Sans-Oblique", fontSize=10, leading=14, textColor=MUTED,
            alignment=TA_LEFT)),
    ]
    return body


def blank_lines(n=1):
    return [Spacer(1, 7) for _ in range(n)]


# --------------------------------------------------------------------------- assembly


def chapter_spec() -> list[dict]:
    D = "d"
    X = "x"
    return [
        {
            "num": 1,
            "title": "Introduction",
            "items": [
                (D, "01-project-overview.md", "Problem statement"),
                (D, "01-project-overview.md", "Motivation"),
                (D, "01-project-overview.md", "Aim"),
                (D, "01-project-overview.md", "Objectives"),
                (D, "01-project-overview.md", "Scope"),
                (D, "01-project-overview.md", "Proposed solution"),
                (D, "01-project-overview.md", "Novelty and contribution"),
                (D, "01-project-overview.md", "Stakeholders and personas"),
                (X, "ch1-organisation.md", None),
            ],
        },
        {
            "num": 2,
            "title": "Related Work",
            "items": [
                (X, "ch2-related-work.md", None),
                (D, "09-results-and-evaluation.md", "Comparison with related approaches"),
            ],
        },
        {
            "num": 3,
            "title": "Requirements Analysis",
            "items": [(X, "ch3-requirements.md", None)],
        },
        {
            "num": 4,
            "title": "System Design",
            "items": [
                (D, "02-system-architecture.md", "Architectural style"),
                (D, "02-system-architecture.md", "Context diagram"),
                (D, "02-system-architecture.md", "Container / component view"),
                (D, "02-system-architecture.md", "End-to-end data flow"),
                (D, "02-system-architecture.md", "State machines"),
                (D, "02-system-architecture.md", "Deployment topology"),
                (D, "05-backend-design.md", "Database schema"),
                (D, "05-backend-design.md", "API reference"),
                (D, "04-anpr-pipeline.md", "Pipeline overview"),
                (D, "04-anpr-pipeline.md", "Stage 7 — Database matching"),
                (D, "04-anpr-pipeline.md", "Stage 8 — Policy layer (allocation)"),
                (D, "04-anpr-pipeline.md", "Failure taxonomy"),
                (D, "07-hardware-integration.md", "Pin map (both nodes)"),
                (D, "07-hardware-integration.md", "Wiring table — Entry node"),
                (D, "07-hardware-integration.md", "Wiring table — Exit node"),
                (D, "07-hardware-integration.md", "Barrier control contract"),
                (D, "02-system-architecture.md", "Why two cameras instead of per-bay sensors"),
                (D, "02-system-architecture.md", "Design decisions"),
                (D, "02-system-architecture.md", "Architectural invariants"),
                (D, "02-system-architecture.md", "Failure and degradation design"),
            ],
        },
        {
            "num": 5,
            "title": "Implementation",
            "items": [
                (D, "03-technology-stack.md", "Stack at a glance"),
                (D, "03-technology-stack.md", "Why these specific versions"),
                (D, "03-technology-stack.md", "Runtime topology and practical constraints"),
                (D, "05-backend-design.md", "Module map"),
                (D, "05-backend-design.md", "Entry allocation algorithm"),
                (D, "05-backend-design.md", "Exit release algorithm"),
                (D, "05-backend-design.md", "Billing"),
                (D, "05-backend-design.md", "Authentication and security"),
                (D, "05-backend-design.md", "Concurrency and consistency"),
                (D, "05-backend-design.md", "WebSocket contract"),
                (D, "05-backend-design.md", "Startup sequence"),
                (D, "04-anpr-pipeline.md", "Stage 1 — Capture (edge)"),
                (D, "04-anpr-pipeline.md", "Stage 2 — Image quality gate"),
                (D, "04-anpr-pipeline.md", "Stage 3 — Plate localisation (YOLOv11)"),
                (D, "04-anpr-pipeline.md", "Stage 4 — Preprocessing variants"),
                (D, "04-anpr-pipeline.md", "Stage 5 — OCR and candidate scoring"),
                (D, "04-anpr-pipeline.md", "Stage 6 — Multi-frame burst voting"),
                (D, "04-anpr-pipeline.md", "Complexity and performance notes"),
                (D, "06-frontend-design.md", "Purpose of the frontend"),
                (D, "06-frontend-design.md", "Route map"),
                (D, "06-frontend-design.md", "Page behaviour"),
                (D, "06-frontend-design.md", "Design system"),
                (D, "06-frontend-design.md", "Component inventory"),
                (D, "06-frontend-design.md", "Realtime behaviour"),
                (D, "06-frontend-design.md", "Responsiveness and accessibility"),
                (D, "06-frontend-design.md", "Frontend \\u2194 backend contract notes"),
                (D, "07-hardware-integration.md", "Firmware lifecycle"),
            ],
        },
        {
            "num": 6,
            "title": "Testing and Results",
            "items": [
                (D, "08-testing-and-validation.md", "Test strategy"),
                (D, "08-testing-and-validation.md", "Environment"),
                (D, "08-testing-and-validation.md", "Automated system tests (executed)"),
                (D, "08-testing-and-validation.md", "Manual / UI checks"),
                (D, "08-testing-and-validation.md", "Hardware-in-the-loop checks"),
                (D, "08-testing-and-validation.md", "Defect log"),
                (D, "08-testing-and-validation.md",
                 "Regression checklist (run before every submission/demo)"),
                (D, "09-results-and-evaluation.md", "What has actually been demonstrated"),
                (D, "09-results-and-evaluation.md", "Metrics that must still be measured"),
                (D, "09-results-and-evaluation.md",
                 "System-level evaluation (argument, not measurement)"),
                (D, "09-results-and-evaluation.md", "Threats to validity"),
            ],
        },
        {
            "num": 7,
            "title": "Conclusion and Future Work",
            "items": [
                (X, "ch7-conclusion.md", None),
                (D, "10-limitations-and-future-work.md", "Current limitations"),
                (D, "10-limitations-and-future-work.md", "Future work"),
                (X, "ch7-closing.md", None),
            ],
        },
    ]


def appendix_spec() -> list[dict]:
    D = "d"
    return [
        {
            "num": "A",
            "title": "Bill of Materials",
            "items": [(D, "07-hardware-integration.md", "Bill of materials")],
        },
        {
            "num": "B",
            "title": "Assembly, Bench Checklist and Troubleshooting",
            "items": [
                (D, "07-hardware-integration.md", "Assembly procedure"),
                (D, "07-hardware-integration.md", "Bench checklist (run before every demo)"),
                (D, "07-hardware-integration.md", "Troubleshooting"),
                (D, "07-hardware-integration.md", "Hardware limitations (state these honestly)"),
            ],
        },
        {
            "num": "C",
            "title": "References",
            "items": [(D, "15-glossary-and-references.md", "References (IEEE style)")],
        },
    ]


def build(out_path: Path, with_figures: bool = True) -> None:
    global STYLES, REPORT_META
    REPORT_META = json.loads(META_FILE.read_text(encoding="utf-8"))
    STYLES = build_styles()
    FIGS.mkdir(parents=True, exist_ok=True)

    doc = ReportDoc(str(out_path), REPORT_META)
    story: list = []
    ctx: dict = {"last_heading": ""}
    rb = ReportBuilder(ctx)

    # ---- front matter
    story += title_page(REPORT_META)
    story += front_page("Declaration", declaration(REPORT_META))
    story += front_page("Certificate", certificate(REPORT_META))
    story += front_page("Acknowledgement", acknowledgement(REPORT_META))

    tree = load_tree(DOSSIER / "01-project-overview.md")
    abstract = find_node(tree, "Abstract")
    story += [PageBreak(), Paragraph("Abstract", STYLES["front_h"])]
    have_keywords = False
    if abstract:
        for b in abstract["blocks"]:
            paras = []
            if b["t"] == "quote":
                paras = re.split(r"\n\s*\n", b["text"])
            elif b["t"] == "p":
                paras = [b["text"]]
            for para in paras:
                para = " ".join(l.strip() for l in para.splitlines() if l.strip())
                if not para:
                    continue
                if re.sub(r"[*_`]", "", para).lower().startswith("keywords"):
                    continue
                story.append(Paragraph(inline(para), STYLES["front_body"]))
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "<b>Keywords:</b> smart parking, automatic number plate recognition, YOLOv11, "
        "EasyOCR, edge IoT, ESP32-CAM, boom barrier, FastAPI, real-time systems.",
        ParagraphStyle("kw", parent=STYLES["front_body"], fontSize=9.6, textColor=MUTED),
    ))

    # ---- lists
    toc = TocProxy("TOCEntry", levelStyles=[
        ParagraphStyle("TOC0", fontName="Sans-Bold", fontSize=10, leading=14,
                       leftIndent=0, firstLineIndent=0, spaceBefore=9, textColor=INK),
        ParagraphStyle("TOC1", fontName="Sans", fontSize=9.2, leading=12.6,
                       leftIndent=18, firstLineIndent=0, spaceBefore=0.5, textColor=MUTED),
    ], dotsMinLevel=0)
    story += [PageBreak(), Paragraph("Table of Contents", STYLES["toc_h"]), toc]

    lof = TocProxy("LOFEntry", levelStyles=[
        ParagraphStyle("LOF0", fontName="Sans", fontSize=9.2, leading=13,
                       leftIndent=0, spaceBefore=2, textColor=INK,
                       firstLineIndent=0),
    ], dotsMinLevel=0)
    story += [PageBreak(), Paragraph("List of Figures", STYLES["toc_h"]), lof]

    lot = TocProxy("LOTEntry", levelStyles=[
        ParagraphStyle("LOT0", fontName="Sans", fontSize=9.2, leading=13,
                       leftIndent=0, spaceBefore=2, textColor=INK,
                       firstLineIndent=0),
    ], dotsMinLevel=0)
    story += [PageBreak(), Paragraph("List of Tables", STYLES["toc_h"]), lot]

    # ---- abbreviations
    abbr = find_node(load_tree(DOSSIER / "15-glossary-and-references.md"), "Abbreviations")
    story += [PageBreak(), Paragraph("Abbreviations", STYLES["toc_h"])]
    if abbr:
        for b in abbr["blocks"]:
            if b["t"] == "table":
                rows = b["rows"]
                half = (len(rows) + 1) // 2
                left, right = rows[:half], rows[half:]
                data = []
                for i in range(half):
                    l = left[i]
                    r = right[i] if i < len(right) else ["", ""]
                    data.append([Paragraph(inline(l[0]), STYLES["cell"]),
                                 Paragraph(inline(l[1]), STYLES["cell"]),
                                 Paragraph(inline(r[0]), STYLES["cell"]),
                                 Paragraph(inline(r[1]), STYLES["cell"])])
                t = Table(data, colWidths=[2.2 * cm, 5.7 * cm, 2.2 * cm, 5.7 * cm],
                          repeatRows=0, hAlign="LEFT")
                t.setStyle(TableStyle([
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#E6E6E6")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 2),
                    ("TOPPADDING", (0, 0), (-1, -1), 2.4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2.4),
                ]))
                story.append(t)

    # ---- body
    for ch in chapter_spec():
        rb.chapter = ch["num"]
        rb.chapter_heading(ch["num"], ch["title"])
        k = 0
        for item in ch["items"]:
            if item[0] == "x":
                node_root = load_tree(EXTRA / item[1])
                for b in node_root["blocks"]:
                    rb.render_block(b)
                for node in node_root["children"]:
                    if norm_key(node["title"]) in EXCLUDE_TITLES:
                        continue
                    k += 1
                    rb.render_node(node, f"{ch['num']}.{k}", 2, ctx)
            else:
                tree = load_tree(DOSSIER / item[1])
                node = find_node(tree, item[2])
                if node is None:
                    raise SystemExit(f"Section not found: {item[1]} :: {item[2]}")
                k += 1
                rb.render_node(node, f"{ch['num']}.{k}", 2, ctx)
        story += rb.story
        rb.story = []

    # ---- appendices
    for ap in appendix_spec():
        rb.chapter = ap["num"]
        rb.chapter_heading(ap["num"], ap["title"])
        k = 0
        for item in ap["items"]:
            tree = load_tree(DOSSIER / item[1])
            node = find_node(tree, item[2])
            if node is None:
                raise SystemExit(f"Section not found: {item[1]} :: {item[2]}")
            if norm_key(node["title"]).startswith(norm_key(ap["title"])):
                # one-section appendix: no duplicated sub-heading
                rb.ctx["last_heading"] = ap["title"]
                if norm_key(node["title"]).startswith("references"):
                    rb.ref_mode = True
                for b in node["blocks"]:
                    rb.render_block(b)
                for c in node["children"]:
                    if norm_key(c["title"]) in EXCLUDE_TITLES:
                        continue
                    k += 1
                    rb.render_node(c, f"{ap['num']}.{k}", 2, ctx)
                rb.ref_mode = False
                continue
            k += 1
            rb.render_node(node, f"{ap['num']}.{k}", 2, ctx)
        story += rb.story
        rb.story = []

    doc.multiBuild(story)
    print(f"wrote {out_path}  ({out_path.stat().st_size/1024:.0f} KB)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(REPORT / "AutoPark_Project_Report.pdf"))
    ap.add_argument("--no-figures", action="store_true", help="skip mermaid rendering")
    args = ap.parse_args()
    register_fonts()
    if args.no_figures:
        global MMDC
        MMDC = Path("/nonexistent")
    build(Path(args.out))


if __name__ == "__main__":
    main()
