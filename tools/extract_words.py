"""Add adjective and adverb cards to deck.json from the two study-sheet PDFs.

Usage: python extract_words.py <adjectives.pdf> <adverbs.pdf> <out_dir>
Run AFTER extract_deck.py (it keeps the verbs already in deck.json and replaces any
previous adjective/adverb cards, so it is safe to re-run). Needs PyMuPDF.

The sheets are grids of tables with a coloured header bar. Rows are found from the text itself (the white rows have no background shape):
every line in the first column starts a row, and the other cells are attached to the
nearest first-column line by vertical position and to a column by x-position.
Only plain word lists (header: Adjective/Adverb/Particle | Meaning | Example) become cards,
and only the word + English meaning are kept (no examples, categories or opposite pairs).
"""
import sys, re, json, collections, unicodedata
import pymupdf

sys.stdout.reconfigure(encoding="utf-8")
adj_pdf, adv_pdf, out = sys.argv[1:4]

GREEN, PURPLE = (0.06, 0.43, 0.34), (0.15, 0.13, 0.36)
close = lambda c, ref, t=0.03: c and all(abs(a - b) < t for a, b in zip(c, ref))
n = lambda s: re.sub(r"\s+", " ", s).strip()

# header text of the first column -> what the table is
# Only plain word lists. Pair tables (opposites, ud/ude), fixed "adjective + preposition"
# expressions, grammar tables and abbreviations are skipped on purpose.
FIRST_COL = {"Adjective": "adjective", "Adverb": "adverb", "Particle": "adverb"}

def lines_of(page):
    res = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            t = n(" ".join(s["text"] for s in l["spans"]))
            if t: res.append((pymupdf.Rect(l["bbox"]), t))
    return res

def tables(page):
    """Yield (core, columns[(x0, name)], rows[list of cell strings]) for each header bar."""
    lines = lines_of(page)
    heads = sorted([d["rect"] for d in page.get_drawings()
                    if d.get("fill") and d["rect"].width > 480 and 14 < d["rect"].height < 26
                    and (close(d["fill"], GREEN) or close(d["fill"], PURPLE))], key=lambda r: r.y0)
    for i, h in enumerate(heads):
        core = close([d for d in page.get_drawings() if d["rect"] == h][0]["fill"], GREEN)
        cols = sorted((r.x0, t) for r, t in lines if h.y0 - 1 <= r.y0 and r.y1 <= h.y1 + 1)
        nxt = heads[i + 1].y0 if i + 1 < len(heads) else 795
        body = sorted([(r, t) for r, t in lines if r.y0 >= h.y1 - 1 and r.y1 <= nxt + 1], key=lambda x: x[0].y0)
        cut = next((k for k, (r, t) in enumerate(body) if r.x0 < 55), len(body))   # first heading/note line ends the table
        body = body[:cut]
        if not cols or not body: continue
        x1 = cols[0][0]
        anchors = []                                    # rows = first-column lines (merge ones <12pt apart: wrapped cell)
        for r, t in body:
            if abs(r.x0 - x1) < 4:
                if anchors and r.y0 - anchors[-1]["y1"] < 6: anchors[-1]["text"] += " " + t; anchors[-1]["y1"] = r.y1
                else: anchors.append({"text": t, "y0": r.y0, "y1": r.y1, "cells": collections.defaultdict(list)})
        for r, t in body:
            if abs(r.x0 - x1) < 4: continue
            col = max(k for k, (cx, _) in enumerate(cols) if cx <= r.x0 + 3)
            mid = (r.y0 + r.y1) / 2
            a = min(anchors, key=lambda a: abs((a["y0"] + a["y1"]) / 2 - mid))
            a["cells"][col].append(t)
        rows = [[a["text"]] + [n(" ".join(a["cells"][k])) for k in range(1, len(cols))] for a in anchors]
        yield core, [c[1] for c in cols], rows

def slug(s):
    s = unicodedata.normalize("NFKD", s.replace("æ", "ae").replace("ø", "oe").replace("å", "aa"))
    return re.sub(r"[^a-z0-9]+", "-", s.encode("ascii", "ignore").decode().lower()).strip("-")

cards, flags, per_table = [], [], []
for path in (adj_pdf, adv_pdf):
    doc = pymupdf.open(path)
    for pno, page in enumerate(doc):
        for core, cols, rows in tables(page):
            kind = FIRST_COL.get(cols[0])
            if kind and cols[1:] == ["Meaning", "Example"]:
                for r in rows:
                    cards.append({"type": kind, "danish": r[0], "english": r[1], "src": f"{path.split('/')[-1].split(chr(92))[-1]} p{pno+1}"})
                per_table.append((f"p{pno+1} {cols[0]}", core, len(rows)))
            else:
                per_table.append((f"p{pno+1} skipped: {' | '.join(cols)[:50]}", core, len(rows)))

# A row like "lovlig / ulovlig" = "legal / illegal" holds several words: split it into one
# card per word when Danish and English have the same number of parts. Rows whose English
# is a single meaning ("specielt / særligt" = "particularly") are synonyms and stay as one card.
split = []
for c in cards:
    da, en = c["danish"].split(" / "), c["english"].split(" / ")
    if len(da) > 1 and len(da) == len(en) and "X-" not in c["danish"]:
        split += [{**c, "danish": d, "english": e} for d, e in zip(da, en)]
    else: split.append(c)
cards = split

# merge duplicates (same type + headword): keep the first
merged, seen = [], {}
for c in cards:
    key = (c["type"], c["danish"].lower())
    if key in seen:
        k = seen[key]
        flags.append(f"duplicate {c['type']} '{c['danish']}' ({c['src']}) merged into {k['src']}")
    else: seen[key] = c; merged.append(c)
for c in merged:
    c["english"] = re.sub(r",(?=\S)", ", ", c["english"])     # source has "tall,high"
    if not c["english"]: flags.append(f"empty English: {c['danish']} ({c['src']})")
    if not c["danish"] or len(c["danish"]) > 40: flags.append(f"suspicious headword: {c['danish']!r} ({c['src']})")
    if len(c["english"]) > 60: flags.append(f"long English (check wrap): {c['danish']}: {c['english']}")

deck = [c for c in json.load(open(f"{out}/deck.json", encoding="utf-8")) if c.get("type", "verb") == "verb"]
for c in deck: c.setdefault("type", "verb"); c.pop("core", None)
ids = collections.Counter()
for c in merged:
    base = {"adjective": "adj-", "adverb": "adv-"}[c["type"]] + slug(c["danish"]); ids[base] += 1
    deck.append({"id": base if ids[base] == 1 else f"{base}-{ids[base]}", "type": c["type"],
                 "danish": c["danish"], "english": c["english"]})
json.dump(deck, open(f"{out}/deck.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

print("tables found:")
for name, core, k in per_table: print(f"  {name:70} {'CORE' if core else '    '} {k}")
print("\ncards by type:", dict(collections.Counter(c["type"] for c in deck)))
for t in ("adjective", "adverb"):
    cs = [c for c in merged if c["type"] == t]
    print(f"  {t}: {len(cs)} cards")
print("flags:", *(flags or ["none"]), sep="\n  ")
