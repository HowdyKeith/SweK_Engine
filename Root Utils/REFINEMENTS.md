# REFINEMENTS — potential improvements (menu, not a commitment)

A running list of refinements we could make, grouped by area. Each line notes the
gist and a rough size (S/M/L). Pick what's worth doing; many are independent.
Last assembled: v1026.

---

## PetFBI pipeline
- **Align Admins/Rules to your real schema** — the `Admins`/`Rules` sheets are my
  design (R_clean.xls had no admin/email data). If your Transmitter or a contacts
  workbook already encodes routing, match those exact columns instead. **S**
- **Full auto-chain** URL → grab → assemble → route → draft email, one button,
  for a pasted report link. Pieces all exist; this wires them end-to-end. **M**
- **Outlook unread auto-poll → status ticker** — periodic `/outlook/unread` into the
  demo-chrome ticker so new replies surface without checking. **S**
- **SMTP 587 / STARTTLS + OAuth2** — current Gmail path is 465 implicit-TLS + app
  password. Add 587/STARTTLS and (bigger) OAuth2 so no app password is needed. **M/L**
- **PetFBI widget feed** — the official `<petfbi-widget data-file=uuid>` structured
  feed is the no-scraping upgrade (email them for partner access). Removes the
  Camoufox scrape + placeholder field-extraction fragility. **M** (gated on access)
- **Editor onboarding flow** — "confirm email/text and boom" for volunteers who
  can't follow step lists; ties into the Admin-vs-Editor posting split. **M**

## New tool panels (browser-accessible)
- **Maigret + TTS panels** — DONE v1026 (`maigret.html`, `tts.html`). **✓**
- **TradingAgents panel** — members list + per-member analysis as a real page
  (sortable table, click a name → buys/sells/tickers/recent). Endpoints exist
  (`/trader/members`, `/trader/member-analysis`); just needs the page. **S/M**
- **Panel launcher entry** — make sure the new panels show in the demo/launcher
  index (they auto-serve by URL; confirm they're listed). **S**

## TradingAgents depth
- **Live data source** — the free senate-watcher fork is historical (~2020).
  Wire the FMP source (`trader.config source:fmp + key`) for current disclosures;
  surface a source toggle in the panel. **S**
- **Run the actual TradingAgents LLM** — `taDetect`/`taInstall` already exist; add a
  "run full analysis on member/ticker X" through the local Ollama engine. **M/L**
- **House chamber** — current free data is Senate only; add a House source. **M**

## TTS / avatar
- **Piper** — DONE v1026 (engine select + config + render-to-WAV). Rig setup:
  piper binary + a voice `.onnx`. **✓**
- **Avatar speaks via local TTS** — have PipAvatar call `/tts/speak {wav:true}` and
  play the returned WAV instead of browser SpeechSynthesis, for a consistent local
  voice across clients. **M**
- **Voice cache** — dedupe identical phrases to one WAV; prune `tts-out`. **S**

## Asset pipeline
- **Trellis 2 CPU worker-pool integration** — the WorkerPool/MeshPostProcessor set
  was built; still pending wire-in to `gpuAssetLoader.js` / `glbParser.js`. **M**
- **Sparc3D / ComfyUI-3D-Pack** — Pascal (sm_61) risk notes stand; revisit if a
  Pascal-friendly path appears. **L** (external)

## VoxelEngine game arc
- **Biomes** — far along already (world-gen biomes + earth/moon/mars/sea/hell envs
  in OgreScenario, WeatherSystem, VoiceCommander biomeMap). Refinement: per-biome
  kaiju spawn weighting + visual polish, not new scaffolding. **S/M**
- **Kaiju ranged-attack types** — lasers/plasma/hell-magic/ice/radiation/lightning
  per kind (space=plasma, hell=fireball/magic, tech=laser, ice=ice ray); beam vs
  projectile vs AoE, distinct from tree-hurl. **M/L**
- **First-person control + recharge** — drive a kaiju in first person with an
  ability-recharge mechanic. **M**
- **Set pieces** — hellspawn portal sculptures (hell queens); tech alien race +
  metal trees; water/weather spell attacks (deluge/tidal/typhoon/plague). **L**
- **Deferred large-scope** — audio (music+SFX), save/restore state, day-night cycle,
  civ personalities, procedural caves + dwellers, ruins at world-gen, sandbox mode,
  Ollama narration, replay/recap reels, perf dashboard. **L each**

## Bridge / infra
- **Bun** — opt-in launcher DONE v1025; if you adopt it, smoke-test the native deps
  (openrgb-sdk, mqtt, aedes) under Bun and note any fallbacks. **S**
- **Endpoint index / health page** — one page listing every bridge route + a ping,
  handy as the surface grows. **S**
- **Config consolidation** — several bridges keep their own `~/.voxelbridge/*.json`
  (trader, petfbi, tts). A combined settings panel would centralize them. **M**

## Tooling (next rounds)
- **Scrapling** — fast/adaptive fetcher as a scraper option alongside Camoufox.
  Good for sites where Camoufox is overkill. **M**
- **Doc skills (docx/pptx/pdf/xlsx)** — document-generation skills, useful for the
  Mercor Excel contract work. **M** (a few rounds)
