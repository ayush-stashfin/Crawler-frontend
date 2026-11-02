# Outlier (frontend)

Dashboard for the reel-trend POC, built to the approved static design (originally drafted as "Prism", `DESIGN.md` in the
prototype). The API lives in `../reel-trend-poc`; this app only talks to it
over HTTP.

## Run

```bash
# 1. API (in ../reel-trend-poc)
.venv/bin/uvicorn app.main:app --port 8000

# 2. Frontend (here)
npm install
npm run dev        # http://localhost:5173
```

`/api/*` requests are forwarded to `API_PROXY_TARGET` (default `http://127.0.0.1:8000`).

## Build

```bash
npm run build      # type-checks, writes dist/
npm run preview    # serves dist/ on http://localhost:4173, still forwarding /api
```

To host `dist/` on its own, build with `VITE_API_BASE=<API address>` and add this app's address
to the API's `CORS_ORIGINS`.

## What's in it

- **Landing and sign-in**: what Outlier does, with the sign-in card beside it. Sign-in is Google,
  limited to @stashfin.com accounts, and is switched on by the API (`GOOGLE_CLIENT_ID`; see the
  API README). While it's off, the card has an "Open the workspace" button instead, and links
  straight to a page (`#trending`, `#scripts`…) skip the landing page. If a session expires
  mid-use the app returns here with a note; signing in again brings you back to the page you were on.
- **Trending**: the day's breakout count and summary, metrics, a competitor breakout board, the
  five breakout cards (with thumbnails), the signal matrix (best post per competitor per day over
  3 weeks) and rising posts. The selected post's details sit in a panel on the right: growth vs a
  typical post, the engine's reasons, links, and how far it got through teardown → match → script.
- **All posts**: search, brand / type / result filters, sorting, CSV export; a row opens the post.
- **Competitors**: account cards with profile pictures; pause, resume and add accounts.
- **Scripts**: every generated script with its teardown, product match (and runners-up), the
  scene-by-scene script labelled kept / tweaked / new, the automatic checks and version history.
  Approve, reject (with a note) or regenerate with a note; a new version takes a minute or two
  and the page updates when it lands.
- ⌘K search across views, competitors, posts, scripts and days; ↑/↓ steps through posts while a
  post is open; light and dark themes; the day picker and recent pipeline runs in the top bar.

Thumbnails come from the API (`/api/media/...`), which caches them at scrape time because
Instagram's image links expire. Posts whose link had already expired show a placeholder.

`src/components/` holds one file per page plus the shell, the post detail panel, dialogs and
shared pieces (`common.tsx`). The styles in `src/styles.css` are the prototype's, with additions
for live data at the end.
