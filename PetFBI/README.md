# PetFBI — Lost Pet Page Manager (project folder)

Keith's lost-pet workflow, brought into the engine archive so the bridge, the
scrape stack, and the admins can all share one home.

## The workflow (assisted — never auto-post)
1. PetFBI emails a lost/found report → fetched (Outlook/Gmail).
2. The PetFBI site is scraped for the full report data.
3. Google Maps is grabbed for the location image.
4. The data is reformatted into a ready-to-post report (+ map image).
5. The complete post is handed to an admin, who reviews and posts it by hand.

**No auto-posting, ever.** Automation stops at "complete post handed to a human."
For an org-owned Facebook *Page*, the official Graph API is the compliant path;
Facebook *Groups* have no official posting API and browser-bot posting violates
Facebook's ToS — so we only ever *assist* the human (pre-fill the composer).

## How it maps onto the engine stack we built
- VBA `ai_HttpServer*` (Winsock HTTP server)  → the Node **ai-bridge**
- VBA Edge/CDP/`ai_ChrometGetHTML` source-grab → **/scrape/** on Camoufox
- VBA `ai_ClipGoogleMap`                        → /scrape/grab (network-intercept the map image)
- VBA `OpenAI`/`ai_ChatGPT` template fill       → bridge AI calls
- New: dynamic website-parsing template (adapts when PetFBI's HTML changes) — to be rebuilt
- New: **shared posting board** (claim/posted/live status) so admins don't double-post

## Folders
- `workbook/`  — the Excel/VBA versions (.xlsb/.xlsm)
- `python/`    — the one-click Python version
- `scrapers/`  — PetFBI-specific saved scraper skills
- `docs/`      — notes, the parsing template spec, field mappings

## Status
- Coordination board + PetFBI panel: live in the engine (petfbi.html, /petfbi/*).
- Next: Google Sheets backing for the board (true multi-admin shared state),
  PetFBI-grab + Maps-grab as saved scraper skills, assisted pre-filled composer.
