"""Render the fake candidate pool into PDF / Word CVs plus an answer key.

Usage:  python3 scripts/generate_cvs.py
Output: data/cvs/*.pdf|*.docx and data/answer_key.json
"""
import json
import random
import shutil
import subprocess
import tempfile
from pathlib import Path

from docx import Document
from docx.shared import Pt
from PIL import Image, ImageFilter
from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from candidates import CANDIDATES

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "cvs"
TODAY = "2026-10"  # "Present" in a current CV means this month

pdfmetrics.registerFont(TTFont("Sans", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Sans-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]


# ---------- helpers ----------

def fmt_date(ym, style):
    if ym is None:
        return "Present"
    y, m = ym.split("-")
    m = int(m)
    return {"mon": f"{MONTHS[m-1][:3]} {y}", "num": f"{m:02d}/{y}",
            "full": f"{MONTHS[m-1]} {y}", "year": y}[style]


def months_between(start, end):
    sy, sm = map(int, start.split("-"))
    ey, em = map(int, end.split("-"))
    return (ey - sy) * 12 + (em - sm) + 1


def skill_years(c):
    """Years per tag, merging overlapping jobs so nothing is double-counted."""
    covered = {}
    for _, _, start, end, tags, _ in c["jobs"]:
        sy, sm = map(int, start.split("-"))
        for i in range(months_between(start, end or TODAY)):
            month = (sy, sm + i)
            for t in tags:
                covered.setdefault(t, set()).add(((month[0] * 12 + month[1] - 1)))
    return {t: round(len(ms) / 12, 1) for t, ms in sorted(covered.items())}


# ---------- PDF layouts ----------

def styles():
    base = dict(fontName="Sans", fontSize=9.5, leading=13)
    return {
        "name": ParagraphStyle("name", fontName="Sans-Bold", fontSize=20, leading=24),
        "headline": ParagraphStyle("headline", fontName="Sans", fontSize=11.5, leading=15, textColor=colors.HexColor("#444444")),
        "h": ParagraphStyle("h", fontName="Sans-Bold", fontSize=11, leading=14, spaceBefore=10, spaceAfter=4,
                            textColor=colors.HexColor("#1f3a5f")),
        "job": ParagraphStyle("job", fontName="Sans-Bold", fontSize=10, leading=13, spaceBefore=4),
        "body": ParagraphStyle("body", **base),
        "bullet": ParagraphStyle("bullet", leftIndent=12, bulletIndent=2, **base),
        "small": ParagraphStyle("small", fontName="Sans", fontSize=8, leading=10, textColor=colors.grey),
    }


def experience_flow(c, s):
    out = []
    for title, company, start, end, _, bullets in c["jobs"]:
        dates = f"{fmt_date(start, c['datefmt'])} – {fmt_date(end, c['datefmt'])}"
        out.append(Paragraph(f"{title} | {company}", s["job"]))
        out.append(Paragraph(dates, s["small"]))
        out += [Paragraph(b, s["bullet"], bulletText="•") for b in bullets]
    return out


def render_pdf_classic(c, path):
    s = styles()
    flow = [Paragraph(c["name"], s["name"]), Paragraph(c["headline"], s["headline"]),
            Paragraph(f"{c['location']}  ·  {c['email']}  ·  {c['phone']}", s["body"]),
            Paragraph("Professional Summary", s["h"]), Paragraph(c["summary"], s["body"]),
            Paragraph("Experience", s["h"]), *experience_flow(c, s),
            Paragraph("Skills", s["h"]), Paragraph(", ".join(c["skills"]), s["body"]),
            Paragraph("Languages", s["h"]), Paragraph(" · ".join(c["languages"]), s["body"]),
            Paragraph("Education", s["h"]), Paragraph(c["education"], s["body"])]
    if c["certs"]:
        flow += [Paragraph("Certifications", s["h"])] + [Paragraph(x, s["bullet"], bulletText="•") for x in c["certs"]]
    flow += [Spacer(1, 14), Paragraph(f"Last updated: {fmt_date(c['updated'], 'full')}", s["small"])]
    SimpleDocTemplate(str(path), pagesize=LETTER, leftMargin=0.8*inch, rightMargin=0.8*inch,
                      topMargin=0.7*inch, bottomMargin=0.7*inch, title=f"{c['name']} CV").build(flow)


def render_pdf_sidebar(c, path):
    s = styles()
    side = [Paragraph("CONTACT", s["h"]), Paragraph(c["location"], s["body"]),
            Paragraph(c["email"], s["body"]), Paragraph(c["phone"], s["body"]),
            Paragraph("SKILLS", s["h"])] + [Paragraph(x, s["bullet"], bulletText="–") for x in c["skills"]]
    side += [Paragraph("LANGUAGES", s["h"])] + [Paragraph(x, s["body"]) for x in c["languages"]]
    if c["certs"]:
        side += [Paragraph("CERTIFICATES", s["h"])] + [Paragraph(x, s["body"]) for x in c["certs"]]
    main = [Paragraph(c["name"], s["name"]), Paragraph(c["headline"], s["headline"]),
            Paragraph("ABOUT ME", s["h"]), Paragraph(c["summary"], s["body"]),
            Paragraph("WORK HISTORY", s["h"]), *experience_flow(c, s),
            Paragraph("EDUCATION", s["h"]), Paragraph(c["education"], s["body"]),
            Spacer(1, 10), Paragraph(f"Updated {fmt_date(c['updated'], 'mon')}", s["small"])]
    t = Table([[side, main]], colWidths=[2.1*inch, 4.9*inch])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#eef2f7")),
                           ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8)]))
    SimpleDocTemplate(str(path), pagesize=LETTER, leftMargin=0.5*inch, rightMargin=0.5*inch,
                      topMargin=0.5*inch, bottomMargin=0.5*inch, title=f"{c['name']} Resume").build([t])


def render_scanned(c, path):
    """Image-only PDF: render normally, rasterise, make it look photocopied."""
    with tempfile.TemporaryDirectory() as tmp:
        clean = Path(tmp) / "clean.pdf"
        render_pdf_classic(c, clean)
        subprocess.run(["pdftoppm", "-r", "100", "-png", str(clean), str(Path(tmp) / "page")], check=True)
        rng = random.Random(c["id"])
        pages = []
        for png in sorted(Path(tmp).glob("page*.png")):
            img = Image.open(png).convert("L").rotate(rng.uniform(-1.4, 1.4), expand=True, fillcolor=235)
            noise = Image.effect_noise(img.size, 22)
            img = Image.blend(img, noise, 0.10).filter(ImageFilter.GaussianBlur(0.6))
            pages.append(img.convert("RGB"))
        pages[0].save(path, save_all=True, append_images=pages[1:], resolution=100)


# ---------- Word layouts ----------

def render_docx_classic(c, path):
    d = Document()
    d.styles["Normal"].font.name = "Calibri"
    d.styles["Normal"].font.size = Pt(10.5)
    d.add_heading(c["name"], level=0)
    d.add_paragraph(c["headline"]).runs[0].italic = True
    d.add_paragraph(f"{c['email']} | {c['phone']} | {c['location']}")
    d.add_heading("Profile", level=1)
    d.add_paragraph(c["summary"])
    d.add_heading("Professional Experience", level=1)
    for title, company, start, end, _, bullets in c["jobs"]:
        p = d.add_paragraph()
        p.add_run(f"{title}, {company}").bold = True
        p.add_run(f"   ({fmt_date(start, c['datefmt'])} - {fmt_date(end, c['datefmt'])})")
        for b in bullets:
            d.add_paragraph(b, style="List Bullet")
    d.add_heading("Skills & Tools", level=1)
    d.add_paragraph(", ".join(c["skills"]))
    d.add_heading("Languages", level=1)
    d.add_paragraph(", ".join(c["languages"]))
    d.add_heading("Education", level=1)
    d.add_paragraph(c["education"])
    if c["certs"]:
        d.add_heading("Certifications", level=1)
        for x in c["certs"]:
            d.add_paragraph(x, style="List Bullet")
    d.add_paragraph(f"CV last updated {fmt_date(c['updated'], 'full')}")
    d.core_properties.title = f"{c['name']} CV"
    d.save(path)


def render_docx_table(c, path):
    """Everything inside a table: a common real-world layout that trips up naive parsers."""
    d = Document()
    t = d.add_table(rows=0, cols=2)
    t.style = "Table Grid"

    def row(label, text):
        cells = t.add_row().cells
        cells[0].text = label
        cells[0].paragraphs[0].runs[0].bold = True
        cells[1].text = text

    row("Name", c["name"])
    row("Position", c["headline"])
    row("Contact", f"{c['email']}\n{c['phone']}\n{c['location']}")
    row("Summary", c["summary"])
    for title, company, start, end, _, bullets in c["jobs"]:
        row(f"{fmt_date(start, c['datefmt'])} – {fmt_date(end, c['datefmt'])}",
            f"{title} – {company}\n" + "\n".join(f"• {b}" for b in bullets))
    row("Skills", ", ".join(c["skills"]))
    row("Languages", ", ".join(c["languages"]))
    row("Education", c["education"])
    if c["certs"]:
        row("Certificates", "\n".join(c["certs"]))
    row("Updated", fmt_date(c["updated"], "num"))
    d.save(path)


RENDERERS = {"pdf_classic": render_pdf_classic, "pdf_sidebar": render_pdf_sidebar,
             "docx_classic": render_docx_classic, "docx_table": render_docx_table,
             "scanned": render_scanned}


# ---------- main ----------

def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    files, people = [], {}
    for c in CANDIDATES:
        RENDERERS[c["layout"]](c, OUT / c["file"])
        kind = "scanned_image_only" if c["layout"] == "scanned" else "normal"
        if "version" in c:
            kind = f"version_{c['version']}"
        files.append(dict(file=c["file"], candidate_id=c["id"], kind=kind, cv_updated=c["updated"]))

        if "duplicate" in c:
            dup = {**c, **{k: v for k, v in c["duplicate"].items() if k != "layout"}, "layout": c["duplicate"]["layout"]}
            RENDERERS[dup["layout"]](dup, OUT / dup["file"])
            files.append(dict(file=dup["file"], candidate_id=c["id"], kind="duplicate_submission", cv_updated=c["updated"]))

        # The latest version wins, so later entries overwrite earlier ones here.
        people[c["id"]] = dict(id=c["id"], name=c["name"], email=c["email"], location=c["location"],
                               headline=c["headline"], current_file=c["file"],
                               languages=c["languages"], certs=c["certs"], skill_years=skill_years(c))

    for p in people.values():
        p["all_files"] = [f["file"] for f in files if f["candidate_id"] == p["id"]]

    key = dict(
        generated_for="AI Recruiting Copilot test data",
        reference_month=TODAY,
        totals=dict(files=len(files), unique_people=len(people)),
        messy_cases=dict(
            scanned_image_only=[f["file"] for f in files if f["kind"] == "scanned_image_only"],
            duplicate_submissions=[f["file"] for f in files if f["kind"] == "duplicate_submission"],
            superseded_old_versions=[f["file"] for f in files if f["kind"] == "version_1"],
        ),
        files=files,
        candidates=list(people.values()),
    )
    (ROOT / "data" / "answer_key.json").write_text(json.dumps(key, indent=2, ensure_ascii=False))
    print(f"{len(files)} files for {len(people)} people -> {OUT}")


if __name__ == "__main__":
    main()
