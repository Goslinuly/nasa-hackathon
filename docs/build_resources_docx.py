import re
from pathlib import Path
from urllib.parse import urlparse

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor


base = Path(__file__).resolve().parent
src = base / "RESOURCES.md"
dst = base / "RESOURCES.docx"
lines = src.read_text(encoding="utf-8").splitlines()
doc = Document()
section = doc.sections[0]
section.orientation = WD_ORIENT.LANDSCAPE
section.page_width = Cm(29.7)
section.page_height = Cm(21)
section.top_margin = Cm(1.35)
section.bottom_margin = Cm(1.25)
section.left_margin = Cm(1.55)
section.right_margin = Cm(1.55)

for name in ("Normal", "Title", "Heading 1", "Heading 2", "Heading 3"):
    s = doc.styles[name]
    s.font.name = "Aptos"
    s.font.color.rgb = RGBColor(0, 0, 0)
doc.styles["Normal"].font.size = Pt(9)
doc.styles["Normal"].paragraph_format.space_after = Pt(4)
doc.styles["Normal"].paragraph_format.line_spacing = 1.08
doc.styles["Title"].font.size = Pt(17)
doc.styles["Title"].font.bold = True
doc.styles["Title"].paragraph_format.space_after = Pt(9)
doc.styles["Heading 1"].font.size = Pt(12)
doc.styles["Heading 1"].font.bold = True
doc.styles["Heading 1"].paragraph_format.space_before = Pt(10)
doc.styles["Heading 1"].paragraph_format.space_after = Pt(5)
doc.styles["Heading 2"].font.size = Pt(10)
doc.styles["Heading 2"].font.bold = True
doc.styles["Heading 2"].paragraph_format.space_before = Pt(8)
doc.styles["Heading 2"].paragraph_format.space_after = Pt(4)
doc.styles["Heading 3"].font.size = Pt(9)
doc.styles["Heading 3"].font.bold = True

title_ppr = doc.styles["Title"]._element.get_or_add_pPr()
border = OxmlElement("w:pBdr")
bottom = OxmlElement("w:bottom")
bottom.set(qn("w:val"), "nil")
border.append(bottom)
title_ppr.append(border)

token_re = re.compile(r"\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*")


def add_link(p, label, target):
    if target.startswith("http"):
        relationship = p.part.relate_to(target, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    else:
        relationship = p.part.relate_to(target, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    h = OxmlElement("w:hyperlink")
    h.set(qn("r:id"), relationship)
    run = OxmlElement("w:r")
    rpr = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "164B75")
    rpr.append(color)
    run.append(rpr)
    node = OxmlElement("w:t")
    node.text = label
    run.append(node)
    h.append(run)
    p._p.append(h)


def add_inline(p, value):
    pos = 0
    for m in token_re.finditer(value):
        if m.start() > pos:
            p.add_run(value[pos:m.start()])
        if m.group(1) is not None:
            add_link(p, m.group(1), m.group(2))
        elif m.group(3) is not None:
            p.add_run(m.group(3)).bold = True
        elif m.group(4) is not None:
            r = p.add_run(m.group(4))
            r.font.name = "Consolas"
            r.font.size = Pt(8)
        elif m.group(5) is not None:
            p.add_run(m.group(5)).italic = True
        pos = m.end()
    if pos < len(value):
        tail = value[pos:]
        if tail.startswith("https://") or tail.startswith("http://"):
            add_link(p, urlparse(tail).netloc, tail)
        else:
            p.add_run(tail)


def set_borders(cell):
    pr = cell._tc.get_or_add_tcPr()
    box = OxmlElement("w:tcBorders")
    for side in ("top", "left", "bottom", "right"):
        edge = OxmlElement(f"w:{side}")
        edge.set(qn("w:val"), "single")
        edge.set(qn("w:sz"), "4")
        edge.set(qn("w:color"), "D9D9D9")
        box.append(edge)
    pr.append(box)


def set_pad(cell):
    pr = cell._tc.get_or_add_tcPr()
    mar = OxmlElement("w:tcMar")
    for side, amount in (("top", 70), ("left", 85), ("bottom", 70), ("right", 85)):
        el = OxmlElement(f"w:{side}")
        el.set(qn("w:w"), str(amount))
        el.set(qn("w:type"), "dxa")
        mar.append(el)
    pr.append(mar)


def set_shade(cell, color):
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), color)
    cell._tc.get_or_add_tcPr().append(shd)


def add_table(rows):
    cells = [[x.strip() for x in row.strip().strip("|").split("|")] for row in rows]
    cells = [row for row in cells if not all(re.fullmatch(r":?-{2,}:?", x) for x in row)]
    if not cells:
        return
    cols = max(len(row) for row in cells)
    weights = {2: [0.28, 0.72], 3: [0.21, 0.27, 0.52], 4: [0.18, 0.23, 0.25, 0.34]}.get(cols, [1 / cols] * cols)
    total = 26.5
    table = doc.add_table(rows=0, cols=cols)
    table.autofit = False
    for j, weight in enumerate(weights):
        table.columns[j].width = Cm(total * weight)
    for i, data in enumerate(cells):
        row = table.add_row()
        for j in range(cols):
            cell = row.cells[j]
            cell.width = Cm(total * weights[j])
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            cell.text = ""
            p = cell.paragraphs[0]
            if j < len(data):
                value = data[j]
                if re.fullmatch(r"https?://\S+", value):
                    add_link(p, value, value)
                else:
                    add_inline(p, value)
            for run in p.runs:
                run.font.size = Pt(8)
                if i == 0:
                    run.bold = True
            set_borders(cell)
            set_pad(cell)
            if i == 0:
                set_shade(cell, "DCE8F2")
            elif i % 2 == 0:
                set_shade(cell, "F6F8FA")
        if i == 0:
            trPr = row._tr.get_or_add_trPr()
            repeat = OxmlElement("w:tblHeader")
            repeat.set(qn("w:val"), "true")
            trPr.append(repeat)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)


i = 0
code = False
while i < len(lines):
    line = lines[i].strip()
    if not line:
        i += 1
        continue
    if line.startswith("```"):
        code = not code
        i += 1
        continue
    if code:
        p = doc.add_paragraph(line)
        p.style = "Normal"
        for r in p.runs:
            r.font.name = "Consolas"
            r.font.size = Pt(8)
        i += 1
        continue
    if line.startswith("|"):
        rows = []
        while i < len(lines) and lines[i].strip().startswith("|"):
            rows.append(lines[i])
            i += 1
        add_table(rows)
        continue
    if line.startswith("# "):
        add_inline(doc.add_paragraph(style="Title"), line[2:])
    elif line.startswith("## "):
        add_inline(doc.add_paragraph(style="Heading 1"), line[3:])
    elif line.startswith("### "):
        add_inline(doc.add_paragraph(style="Heading 2"), line[4:])
    elif line.startswith("#### "):
        add_inline(doc.add_paragraph(style="Heading 3"), line[5:])
    elif line.startswith("- "):
        add_inline(doc.add_paragraph(style="List Bullet"), line[2:])
    elif re.match(r"^\d+\. ", line):
        add_inline(doc.add_paragraph(style="List Number"), re.sub(r"^\d+\. ", "", line))
    else:
        add_inline(doc.add_paragraph(style="Normal"), line)
    i += 1

footer = section.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
footer.add_run("Martian Map · каталог ресурсов · актуально на 4 октября 2026 года").font.size = Pt(8)
doc.save(dst)
print(dst)
