# Danske verber – flip-card PWA

Flip-card trainer for 461 Danish verbs (14 meaning groups + a lookup for irregular forms), with Leitner spaced repetition. Plain HTML/CSS/JS, no build step, no backend. Progress is stored on the phone (localStorage).

## Using it
- **Study**: tap the card to flip (Danish → English + IMP/NU/DATID/PERF). Then *Knew it* / *Didn't know it*, or swipe right / left. The 🔊 button reads the Danish aloud (needs a Danish voice: iOS Settings › Accessibility › Spoken Content › Voices › Danish).
- **Leitner boxes**: 5 boxes, review after 1 / 2 / 4 / 8 / 16 days. New cards that you know go to box 2; a miss sends a card back to box 1 and it returns later in the same session (max twice). Due cards come first, then new ones.
- **Settings**: filter by meaning group, conjugation group (green 1 / blue 2 / red 3), "Base verbs only" (hides prefixed verbs), reverse mode (English → Danish), shuffle.
- **Progress**: cards per box, due today, streak, per-group mastery (mastered = box 4–5).
- **Lookup**: type an irregular form (e.g. `fandt`) to find its verb.
- **Back up your progress**: Settings › *Export progress* (on iPhone: share sheet › Save to Files / Google Drive). *Import progress* restores it. iOS may erase web storage after long inactivity, so export now and then.

## Deploy to GitHub Pages (free; needs a public repo)
1. On github.com: **New repository** → name e.g. `danske-verber` → **Public** → Create.
2. From this folder (Git must be installed):
   ```bash
   git init -b main
   git add .
   git commit -m "Danske verber PWA"
   git remote add origin https://github.com/<your-username>/danske-verber.git
   git push -u origin main
   ```
3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. After ~1 minute the site is live at `https://<your-username>.github.io/danske-verber/`.

`.gitignore` keeps the source PDF and exported progress files out of the public repo.

## Add to the iPhone Home Screen
1. Open the HTTPS URL above **in Safari** (not inside another app's browser).
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open it from the new icon. It runs full-screen and works offline after the first load (the service worker caches everything).

## Updating the deck (cache busting)
Offline caching means the phone keeps the old files until the service worker version changes. After you change `deck.json` or any app file:
```bash
node tools/bump_version.js     # rewrites CACHE_VERSION in sw.js from a hash of all cached files
git add . && git commit -m "Update deck" && git push
```
On the phone: open the app (online) – the new version installs in the background and the app reloads itself once it takes over. If it ever looks stale, fully close the app (swipe it away) and open it again, or in Safari: Settings › Safari › Advanced › Website Data for the site. Your progress is **not** affected (it lives in localStorage, not the cache).

## Regenerating the deck from the PDF
`tools/extract_deck.py` reads `source/Danske_Verber_efter_betydning_iPhone.pdf` (verb cards, English glosses, conjugation colour, prefix marker, irregular-form index) and writes `deck.json` + `forms.json`, then prints a per-group summary and flags problems.
```bash
python -m venv venv && venv/Scripts/pip install pymupdf      # Windows; use venv/bin/ on macOS/Linux
venv/Scripts/python tools/extract_deck.py source/Danske_Verber_efter_betydning_iPhone.pdf .
node tools/bump_version.js
```

## Tests and local run
```bash
node tools/test_srs.js     # Leitner logic, streak, filters, import validation
node tools/test_sw.js      # service worker install / cache-first / old-cache cleanup (fake Cache API)
python -m http.server 8765 # then open http://localhost:8765 (localhost counts as secure for service workers)
```
Icons: `python tools/make_icons.py` (needs Pillow).

## Files
`index.html` `style.css` `app.js` (UI, storage, speech) · `srs.js` (spaced-repetition rules) · `deck.json` `forms.json` (data) · `sw.js` `manifest.json` `icons/` (PWA) · `tools/` (extraction, tests, version bump, icons)
