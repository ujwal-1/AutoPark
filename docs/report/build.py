#!/usr/bin/env python3
"""Build the AutoPark project report.

Pipeline:
  1. assemble front matter + five chapter files + back matter into one HTML
  2. render with headless Chrome to a PDF (print-to-pdf, A4)
  3. locate the invisible @@KEY@@ markers with PyMuPDF to learn real page numbers
  4. substitute {{P:KEY}} page references, re-render, confirm the numbers are stable
  5. stamp running header (from the table of contents page onward) and page number
     in the footer (every page except the title sheet), then remove the markers

Requires PyMuPDF (pymupdf) and Google Chrome.
"""

import os
import re
import subprocess
import sys

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
OUT = os.path.join(HERE, "AutoPark_Project_Report.pdf")
WORK = os.path.join(HERE, ".build")

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

PARTS = ["front.html", "ch01-05.html", "ch06-10.html", "ch11-15.html", "back.html"]

# in the order the reader meets them
FRONT_ORDER = ["TITLE", "CERT", "DECL", "ACK", "TOC", "LOF", "NOM", "ABS"]


def assemble(page_map=None):
    body = []
    for part in PARTS:
        with open(os.path.join(SRC, part), encoding="utf-8") as fh:
            body.append(fh.read())

    # implicit front-matter markers: the first page of each .front block
    html = "\n".join(body)
    if page_map is not None:
        html = re.sub(r"\{\{P:([A-Z0-9]+)\}\}", lambda m: str(page_map.get(m.group(1), "--")), html)
    return html, body


PAGE_TMPL = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>AutoPark - UG BE Project Report</title>
<link rel="stylesheet" href="file://{css}">
</head><body>
{body}
</body></html>
"""


def render(index_path, pdf_path):
    if os.path.exists(pdf_path):
        os.remove(pdf_path)
    cmd = [
        CHROME,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        "--allow-file-access-from-files",
        f"--print-to-pdf={pdf_path}",
        "file://" + index_path,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if not os.path.exists(pdf_path):
        sys.stderr.write(res.stdout + res.stderr)
        raise SystemExit("chrome produced no pdf")


def marker_pages(doc):
    pages = {}
    for i, page in enumerate(doc):
        for hit in re.finditer(r"@@([A-Z0-9]{2,8})@@", page.get_text()):
            pages.setdefault(hit.group(1), i + 1)
    return pages


def main():
    os.makedirs(WORK, exist_ok=True)
    index_path = os.path.join(WORK, "index.html")

    # ---- pass 1: markers only, placeholders unresolved -------------------
    html, _ = assemble(None)
    with open(index_path, "w", encoding="utf-8") as fh:
        fh.write(PAGE_TMPL.format(body=html, css=os.path.join(SRC, "report.css")))
    render(index_path, os.path.join(WORK, "pass1.pdf"))
    doc = pymupdf.open(os.path.join(WORK, "pass1.pdf"))
    pages = marker_pages(doc)
    doc.close()

    keys = set(re.findall(r"@@([A-Z0-9]{2,8})@@", html))
    missing = sorted(keys - set(pages))
    if missing:
        print("WARNING: markers not found in the pdf:", missing)

    # front matter pages are the pages that carry the front markers
    for k in FRONT_ORDER:
        if k in pages:
            pages.setdefault(k, pages[k])

    print(f"pass 1: {max(pages.values()) if pages else 0} pages, {len(pages)} markers resolved")

    # ---- pass 2..4: substitute numbers until pagination is stable --------
    for attempt in range(4):
        html, _ = assemble(pages)
        with open(index_path, "w", encoding="utf-8") as fh:
            fh.write(PAGE_TMPL.format(body=html, css=os.path.join(SRC, "report.css")))
        render(index_path, os.path.join(WORK, "pass2.pdf"))
        doc = pymupdf.open(os.path.join(WORK, "pass2.pdf"))
        new_pages = marker_pages(doc)
        total = doc.page_count
        doc.close()

        drift = {k: (pages.get(k), new_pages.get(k)) for k in new_pages if pages.get(k) != new_pages.get(k)}
        pages.update(new_pages)
        print(f"pass {attempt + 2}: {total} pages, drift {len(drift)}")
        if not drift:
            break
        for k, (a, b) in list(drift.items())[:8]:
            print(f"   {k}: {a} -> {b}")

    # ---- stamp header / footer ------------------------------------------
    doc = pymupdf.open(os.path.join(WORK, "pass2.pdf"))
    toc_page = pages.get("TOC", 5)
    body_start = pages.get("C01", toc_page)

    for i, page in enumerate(doc):
        pno = i + 1
        w, h = page.rect.width, page.rect.height

        if pno >= toc_page:
            page.insert_text((72, 40), "AutoPark \u2014 A Camera-Based Smart Parking System",
                             fontname="times-roman", fontsize=8, color=(0, 0, 0))
            right = "2026\u201327"
            tw = pymupdf.get_text_length(right, fontname="times-roman", fontsize=8)
            page.insert_text((w - 72 - tw, 40), right, fontname="times-roman", fontsize=8)
            page.draw_line(pymupdf.Point(72, 46), pymupdf.Point(w - 72, 46), color=(0, 0, 0), width=0.5)

        if pno > 1:
            num = str(pno)
            tw = pymupdf.get_text_length(num, fontname="times-roman", fontsize=9)
            page.insert_text(((w - tw) / 2, h - 34), num, fontname="times-roman", fontsize=9)

        # remove the invisible page markers: they are the only text set below
        # 1.5 pt, so delete every such span by geometry rather than by string
        # search (1 pt glyphs are too small for search_for to match reliably)
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    if span["size"] < 1.5 and span["text"].strip():
                        r = pymupdf.Rect(span["bbox"])
                        # shrink slightly: redaction removes any glyph whose box
                        # merely touches the rect, and the marker sits flush
                        # against the caption text that follows it
                        r.x0 += 0.05; r.y0 += 0.05; r.x1 -= 0.05; r.y1 -= 0.05
                        page.add_redact_annot(r, fill=False)
        page.apply_redactions()

    doc.set_metadata({
        "title": "AutoPark: A Camera-Based Smart Parking System with Automated Number Plate Recognition and Micro-Actuated Boom Barriers",
        "author": "Department of Computer Science & Engineering (IC), Rajarajeswari College of Engineering",
        "subject": "UG BE Project Report, Phase 2, 2026-27",
        "keywords": "smart parking; ANPR; YOLOv11; EasyOCR; ESP32-CAM; boom barrier; FastAPI",
    })
    doc.save(OUT, garbage=4, deflate=True)
    doc.close()

    print(f"wrote {OUT} ({total} pages)")
    print(f"header from page {toc_page}, chapters from page {body_start}")


if __name__ == "__main__":
    main()
