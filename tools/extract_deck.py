"""Extract deck.json + forms.json from the verbs PDF.

Usage: python extract_deck.py <pdf> <out_dir>
Needs PyMuPDF (pip install pymupdf).

How it works: every verb card in the PDF is a wide light-grey rectangle.
Inside it: the headword line ("at ..."), an IMP/NU line, a DATID/PERF line,
and the English gloss in the right margin. A thin bar on the card's left edge
gives the conjugation group (green=1, blue=2, red=3); an extra grey bar next
to it marks a prefixed verb. Colours are read from the vector fills, not guessed.
"""
import sys, re, json, collections, unicodedata
sys.stdout.reconfigure(encoding="utf-8")
import pymupdf

pdf, out = sys.argv[1], sys.argv[2]
doc = pymupdf.open(pdf)

def close(c, ref, tol=0.03):
    return c and all(abs(a - b) < tol for a, b in zip(c, ref))

CARD = (0.96, 0.96, 0.97)
CONJ = {1: (0.12, 0.44, 0.26), 2: (0.11, 0.31, 0.54), 3: (0.64, 0.20, 0.12)}
PREFIX = (0.81, 0.83, 0.85)
n = lambda s: re.sub(r"\s+", " ", s).strip()

def lines_of(page):
    res = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            t = n(" ".join(s["text"] for s in l["spans"]))
            if t: res.append((pymupdf.Rect(l["bbox"]), t))
    return res

def slug(s):
    s = unicodedata.normalize("NFKD", s.replace("æ", "ae").replace("ø", "oe").replace("å", "aa"))
    return re.sub(r"[^a-z0-9]+", "-", s.encode("ascii", "ignore").decode().lower()).strip("-")

deck, flags, printed_counts = [], [], {}
group = None
last_card_page = 0
for pno, page in enumerate(doc):
    dr = page.get_drawings()
    cards = [d["rect"] for d in dr if d.get("fill") and close(d["fill"], CARD) and d["rect"].width > 300]
    if not cards: continue
    last_card_page = pno
    lines = lines_of(page)
    # Group name: big title line (above first card) if present, else running header "... · Group"
    first_y = min(c.y0 for c in cards)
    title = [t for r, t in lines if r.y0 < first_y and r.y0 > 20 and not re.match(r"^\d+ verber$", t)]
    cnt = [t for r, t in lines if re.match(r"^\d+ verber$", t)]
    head = next((t for r, t in lines if r.y0 < 20 and "·" in t), "")
    if title:
        group = title[0]
        if cnt: printed_counts[group] = int(cnt[0].split()[0])
    elif head:
        group = n(head.split("·", 1)[1])
    for c in sorted(cards, key=lambda r: r.y0):
        inside = [(r, t) for r, t in lines if r.y0 >= c.y0 - 1 and r.y1 <= c.y1 + 1]
        bar = [d for d in dr if d.get("fill") and d["rect"].y0 >= c.y0 - 1 and d["rect"].y1 <= c.y1 + 1 and d["rect"].width < 10]
        conj = next((k for k, col in CONJ.items() for d in bar if close(d["fill"], col)), None)
        prefixed = any(close(d["fill"], PREFIX) for d in bar)
        word = next((t for r, t in inside if t.startswith("at ") and r.x0 < 40), None)
        imp = re.match(r"^IMP (.+?) NU (.+)$", next((t for r, t in inside if t.startswith("IMP ")), ""))
        dat = re.match(r"^DATID (.+?) PERF (.+)$", next((t for r, t in inside if t.startswith("DATID ")), ""))
        eng = n(" ".join(t for r, t in inside if r.x0 > 200 and not t.startswith(("IMP ", "DATID ", "at "))))
        if not (word and imp and dat and conj): flags.append(f"p{pno+1}: incomplete card {word!r} imp={bool(imp)} dat={bool(dat)} conj={conj}")
        if not eng: flags.append(f"p{pno+1}: empty English for {word!r}")
        deck.append({
            "id": "", "group": group, "danish": word, "english": eng or None,
            "imp": imp and imp.group(1), "nu": imp and imp.group(2),
            "datid": dat and dat.group(1), "perf": dat and dat.group(2),
            "conjugation": conj, "prefixed": prefixed, "example": None, "collocation": None,
        })

# ids: slug of headword, de-duplicated with a counter
seen = collections.Counter()
for c in deck:
    base = slug(c["danish"] or "x"); seen[base] += 1
    c["id"] = base if seen[base] == 1 else f"{base}-{seen[base]}"
dups = [k for k, v in seen.items() if v > 1]

# Formindeks: lines like "fandt → at finde (find) / at ..." after the last card page
forms = []
for pno in range(last_card_page + 1, len(doc)):
    for r, t in lines_of(doc[pno]):
        if "→" in t:
            f, rest = [x.strip() for x in t.split("→", 1)]
            if f.startswith("Uregelm"): continue  # section heading
            for alt in re.split(r" / (?=at )", rest):
                m = re.match(r"^(at .+?) \((.+)\)$", alt.strip())
                if m: forms.append({"form": f, "verb": m.group(1), "english": m.group(2)})
                else: flags.append(f"index: unparsed {t!r}")
verbs = {c["danish"] for c in deck}
for f in forms:
    if f["verb"] not in verbs: flags.append(f"index: {f['form']} -> unknown verb {f['verb']!r}")

json.dump(deck, open(f"{out}/deck.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(forms, open(f"{out}/forms.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ---- summary
print(f"cards: {len(deck)}   index forms: {len(forms)}")
print(f"\n{'group':38} {'got':>4} {'printed':>7}")
per = collections.Counter(c["group"] for c in deck)
for g, k in per.items(): print(f"{g:38} {k:>4} {printed_counts.get(g,'?'):>7}{'  <-- MISMATCH' if printed_counts.get(g) != k else ''}")
print("\nconjugation:", dict(collections.Counter(c["conjugation"] for c in deck)))
print("prefixed:", sum(c["prefixed"] for c in deck))
print("duplicate headwords:", dups or "none")
print("flags:", *(flags or ["none"]), sep="\n  ")
