from pathlib import Path
import re
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "TZ_Martian_Map_SpaceApps2026.md"
OUT = ROOT / "TZ_Martian_Map_SpaceApps2026_v4_1.docx"

def shade(cell, fill):
    tcpr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tcpr.append(shd)

def set_cell_border(cell):
    tcpr = cell._tc.get_or_add_tcPr()
    borders = tcpr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tcpr.append(borders)
    for side in ("top", "left", "bottom", "right"):
        tag = OxmlElement(f"w:{side}")
        tag.set(qn("w:val"), "single")
        tag.set(qn("w:sz"), "4")
        tag.set(qn("w:color"), "D9D9D9")
        borders.append(tag)

def cell_margins(cell, top=90, start=100, bottom=90, end=100):
    tc = cell._tc
    tcpr = tc.get_or_add_tcPr()
    mar = tcpr.first_child_found_in("w:tcMar")
    if mar is None:
        mar = OxmlElement("w:tcMar")
        tcpr.append(mar)
    for side, val in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        e = OxmlElement(f"w:{side}")
        e.set(qn("w:w"), str(val))
        e.set(qn("w:type"), "dxa")
        mar.append(e)

def hyperlink(paragraph, label, url):
    part = paragraph.part
    rid = part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    el = OxmlElement("w:hyperlink")
    el.set(qn("r:id"), rid)
    run = OxmlElement("w:r")
    rpr = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "1D4E89")
    rpr.append(color)
    run.append(rpr)
    t = OxmlElement("w:t")
    t.text = label
    run.append(t)
    el.append(run)
    paragraph._p.append(el)

TOKENS = re.compile(r"(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`)")
def add_inline(paragraph, value):
    pos = 0
    for m in TOKENS.finditer(value):
        if m.start() > pos:
            paragraph.add_run(value[pos:m.start()])
        if m.group(2) is not None:
            hyperlink(paragraph, m.group(2), m.group(3))
        elif m.group(4) is not None:
            r = paragraph.add_run(m.group(4))
            r.bold = True
        elif m.group(5) is not None:
            r = paragraph.add_run(m.group(5))
            r.font.name = "Consolas"
            r.font.size = Pt(8.6)
        pos = m.end()
    if pos < len(value):
        paragraph.add_run(value[pos:])

doc = Document()
sec = doc.sections[0]
sec.page_height, sec.page_width = Cm(29.7), Cm(21)
sec.top_margin, sec.bottom_margin = Cm(1.8), Cm(1.7)
sec.left_margin, sec.right_margin = Cm(1.9), Cm(1.9)

normal = doc.styles["Normal"]
normal.font.name = "Aptos"
normal.font.size = Pt(9.5)
normal.font.color.rgb = RGBColor(0, 0, 0)
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.line_spacing = 1.13

for name, size, before, after in (("Title", 19, 0, 14), ("Heading 1", 13, 15, 7), ("Heading 2", 10.5, 10, 5)):
    s = doc.styles[name]
    s.font.name = "Aptos Display" if name == "Title" else "Aptos"
    s.font.size = Pt(size)
    s.font.bold = True
    s.font.color.rgb = RGBColor(0, 0, 0)
    s.paragraph_format.space_before = Pt(before)
    s.paragraph_format.space_after = Pt(after)
    s.paragraph_format.keep_with_next = True
    ppr = s.element.get_or_add_pPr()
    for border in ppr.findall(qn("w:pBdr")):
        ppr.remove(border)

for name in ("List Bullet", "List Number"):
    s = doc.styles[name]
    s.font.name = "Aptos"
    s.font.size = Pt(9.5)
    s.paragraph_format.space_after = Pt(3)

lines = SRC.read_text(encoding="utf-8").splitlines()
i = 0
in_code = False
while i < len(lines):
    line = lines[i].strip()
    if line.startswith("```"):
        in_code = not in_code
        i += 1
        continue
    if in_code:
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(lines[i])
        r.font.name = "Consolas"
        r.font.size = Pt(8)
        i += 1
        continue
    if not line:
        i += 1
        continue
    if line.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s:-]+\|", lines[i+1]):
        rows = []
        while i < len(lines) and lines[i].strip().startswith("|"):
            cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
            if not all(re.fullmatch(r"[:\s-]+", c or " ") for c in cells):
                rows.append(cells)
            i += 1
        if not rows:
            continue
        n = len(rows[0])
        table = doc.add_table(rows=0, cols=n)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = False
        available = 17.2
        if n == 3:
            widths = [3.5, 7.7, 6.0]
        elif n == 4:
            widths = [2.4, 5.4, 6.1, 3.3]
        else:
            widths = [available/n]*n
        for ridx, cells in enumerate(rows):
            row = table.add_row()
            trpr = row._tr.get_or_add_trPr()
            no_split = OxmlElement("w:cantSplit")
            trpr.append(no_split)
            for j in range(n):
                cell = row.cells[j]
                cell.width = Cm(widths[j])
                cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
                cell_margins(cell)
                set_cell_border(cell)
                if ridx == 0:
                    shade(cell, "DDE8F3")
                elif ridx % 2 == 0:
                    shade(cell, "F7F9FC")
                p = cell.paragraphs[0]
                p.paragraph_format.space_after = Pt(0)
                p.paragraph_format.line_spacing = 1.08
                add_inline(p, cells[j] if j < len(cells) else "")
                for run in p.runs:
                    run.font.size = Pt(8.2 if n >= 3 else 9)
                    if ridx == 0:
                        run.bold = True
            if ridx == 0:
                hdr = OxmlElement("w:tblHeader")
                hdr.set(qn("w:val"), "true")
                trpr.append(hdr)
        doc.add_paragraph().paragraph_format.space_after = Pt(1)
        continue
    if line.startswith("# "):
        p = doc.add_paragraph(style="Title")
        add_inline(p, line[2:])
    elif line.startswith("## "):
        p = doc.add_paragraph(style="Heading 1")
        add_inline(p, line[3:])
    elif line.startswith("### "):
        p = doc.add_paragraph(style="Heading 2")
        add_inline(p, line[4:])
    elif line.startswith("- [ ] "):
        p = doc.add_paragraph(style="List Bullet")
        add_inline(p, "□ " + line[6:])
    elif line.startswith("- "):
        p = doc.add_paragraph(style="List Bullet")
        add_inline(p, line[2:])
    elif re.match(r"^\d+\. ", line):
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Cm(0.65)
        p.paragraph_format.first_line_indent = Cm(-0.55)
        p.paragraph_format.space_after = Pt(3)
        add_inline(p, line)
    else:
        p = doc.add_paragraph()
        add_inline(p, line)
    i += 1

doc.core_properties.title = "Martian Map техническое задание на веб сервис"
doc.core_properties.subject = "NASA Space Apps Marswalk"
doc.save(OUT)
print(OUT)
