"""
Plain-ASCII PDF writer for the corpus.

cupsfilter subsets and embeds a Monaco font into every PDF, and that binary font
program contains NUL bytes. Text extractors that scan the raw file pick them up,
and Postgres rejects NUL in a text column -- which is the upload error.

Base-14 fonts (Courier here) need no embedded font program at all, and with
uncompressed content streams the finished file is 100% ASCII. No binary, no NUL.
"""
import json, os, textwrap

WIDTH, HEIGHT = 612, 792
MARGIN, LEADING, FONT_SIZE = 40, 11.5, 8.5
LINES_PER_PAGE = int((HEIGHT - 2 * MARGIN) / LEADING)
WRAP = 108


def clean(s: str) -> str:
    """Latin-1 representable, no control characters, PDF string escapes applied."""
    out = []
    for ch in s:
        o = ord(ch)
        if o == 9:
            out.append("    ")
        elif o < 32 or o == 127:
            continue                      # drop control chars, NUL included
        elif o < 256:
            out.append(ch)
        else:
            out.append({0x2018: "'", 0x2019: "'", 0x201c: '"', 0x201d: '"',
                        0x2013: "-", 0x2014: "-", 0x2026: "...", 0xa0: " "}.get(o, "?"))
    return "".join(out).replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def layout(title, folder, body):
    lines = [title, f"Source folder: {folder}", "=" * 78, ""]
    for raw in body.split("\n"):
        raw = raw.rstrip()
        if not raw.strip():
            lines.append("")
            continue
        lines.extend(textwrap.wrap(raw, WRAP) or [""])
    return [lines[i:i + LINES_PER_PAGE] for i in range(0, len(lines), LINES_PER_PAGE)] or [[""]]


def build(title, folder, body) -> bytes:
    pages = layout(title, folder, body)
    objs, n_pages = {}, len(pages)
    font_id = 3 + 2 * n_pages

    objs[1] = b"<< /Type /Catalog /Pages 2 0 R >>"
    kids = " ".join(f"{3 + 2 * i} 0 R" for i in range(n_pages))
    objs[2] = f"<< /Type /Pages /Kids [{kids}] /Count {n_pages} >>".encode("latin-1")

    for i, page_lines in enumerate(pages):
        pid, cid = 3 + 2 * i, 4 + 2 * i
        objs[pid] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {WIDTH} {HEIGHT}] "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {cid} 0 R >>"
        ).encode("latin-1")
        parts = [f"BT /F1 {FONT_SIZE} Tf {LEADING} TL {MARGIN} {HEIGHT - MARGIN} Td"]
        for ln in page_lines:
            parts.append(f"({clean(ln)}) Tj T*")
        parts.append("ET")
        stream = "\n".join(parts).encode("latin-1")
        objs[cid] = b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream)

    objs[font_id] = (b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier "
                     b"/Encoding /WinAnsiEncoding >>")

    out = bytearray(b"%PDF-1.4\n")
    offsets = {}
    for num in sorted(objs):
        offsets[num] = len(out)
        out += b"%d 0 obj\n" % num + objs[num] + b"\nendobj\n"

    xref_at = len(out)
    total = max(objs) + 1
    out += b"xref\n0 %d\n" % total
    out += b"0000000000 65535 f \n"
    for num in range(1, total):
        out += b"%010d 00000 n \n" % offsets.get(num, 0)
    out += (b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n"
            % (total, xref_at))
    return bytes(out)


docs = json.load(open("data/corpus.json"))
os.makedirs("data/pdf", exist_ok=True)
for f in os.listdir("data/pdf"):
    os.remove(os.path.join("data/pdf", f))

bad = 0
for d in docs:
    pdf = build(d["docName"], d["folder"], d["text"])
    if b"\x00" in pdf:
        bad += 1
    open(f"data/pdf/{d['docId']}.pdf", "wb").write(pdf)

total = sum(os.path.getsize(f"data/pdf/{f}") for f in os.listdir("data/pdf"))
print(f"{len(docs)} PDFs written, {total/1e6:.2f} MB, files containing NUL: {bad}")
