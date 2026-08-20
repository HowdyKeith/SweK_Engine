---
type: doc
title: "Round 334 — AI MODELS panel: pipeline tools section"
tags: ["swek-engine", "round-doc"]
---

# Round 334 — AI MODELS panel: pipeline tools section

Answers the question from earlier — "where do I see all the AI
tools I installed in one place?" The AI MODELS panel
(`ui/ollamaPanel.js`) now has a third section below Ollama and
Diffuser that surfaces server-side asset-pipeline tools at a
glance.

---

## What's surfaced

Polls `GET /asset-pipeline/status` and renders one row per tool.
Each row shows:

- **Tool name** (left, white, fixed-width)
- **Detail** (middle, gray, truncated with ellipsis on overflow):
  binary path with version, or repo dir, or failure reason
- **Status pill** (right): green ✓ when found, red ✗ when missing

The full path + version shows on hover (HTML `title` attribute).

Tools covered:

- `cuda_voxelizer` — GPU mesh→voxel
- `mesh_to_vox` — CPU mesh→voxel fallback
- Each entry under `meshGenerators` from the bridge — Trellis,
  Hunyuan3D, Shap-E, anything else the bridge knows about
- `ultrashape` — UltraShape refinement
- `comfyUrl` — just the base URL, marked "set" if present

A section-level status pill in the header summarizes:
- `all ready` (green) — everything found
- `N/M ready` (amber) — partial
- `0/M ready` (red) — nothing found
- `bridge offline` — `/asset-pipeline/status` unreachable

---

## When it polls

- On panel open (first hover) — fresh data immediately
- On the existing 30s auto-refresh interval (same one that
  refreshes Ollama and Diffuser)
- On click of the ↻ refresh button next to the section header
- Programmatic: `panel._refresh("pipeline")`

When the panel is closed AND Ollama/Diffuser are both happy, the
30s poll is skipped. (Pipeline tools polling rides along with the
existing skip rule — when the panel is closed, no fetches.)

---

## Bridge offline state

If `/asset-pipeline/status` returns non-200 or throws, the section
renders a friendly message:

> Asset-pipeline bridge unreachable. Start the bridge
> (`node server.js` in the asset-pipeline directory) and click ↻
> to retry.

So you know exactly what to do without digging through the README.

---

## What's still in the bench

The pipeline tools section is **status-only**. It doesn't trigger
any work — for actual test runs (voxelize a mesh, generate a
kaiju, refine geometry), the bench panel (`demos_code/
ai_pipeline_bench.js`) is still the place. Same as before.

Why split: the bench panel is heavyweight (~2100 lines, sets up
its own pipeline manager + result table + cold-start tracking).
The AI MODELS panel is meant for glance + pick. They serve
different workflows.

The natural next step (not v334) would be a small "→ Bench"
button per row in the pipeline section that opens the bench
focused on that tool. Nice-to-have, not blocking.

---

## Tests — 758/758 cumulative

`test_pipeline_panel_v334.mjs` adds 39 tests across three
sections:

**Path shortening (T1-T3, 7 tests):**
- Short paths pass through unchanged
- Long paths trim with `.../` prefix + last 2 segments
- Windows backslash paths handled

**State aggregation (T4-T7, 11 tests):**
- All-online → `online` (green pill, "all ready")
- All-offline → `offline` (red pill, "0/N ready")
- Mixed → `partial` (amber pill, "M/N ready")
- Missing `meshGenerators` key handled gracefully

**Row rendering (T8-T12, 21 tests):**
- Null info → "missing" pill
- Found tool → version + path shown, green ✓
- Missing tool with reason → reason shown, red ✗
- Python-tool with repoDir but no version
- HTML escaping — script tags / img tags get entity-encoded
  (defense against malicious or accidentally-included markup in
  paths or reasons)

T12's escaping check is important: the panel renders unsanitized
strings from the bridge, which could potentially include path
characters or reasons containing HTML. Using `escapeHTML` on all
fields prevents an injected `<script>` from executing.

---

## Try it

After updating to v334:

1. Open the AI MODELS panel (hover the `▼ AI MODELS` tab at top)
2. Scroll past Ollama + Diffuser to the new "PIPELINE TOOLS" section
3. Status pill in the header tells you everything's state at a glance
4. Each row shows the tool path + version

If you just installed DINOv3 for Trellis 2, the Trellis row should
now show ✓ green instead of red. If a tool is showing red, hover
the row to see the reason ("missing model", "path not found", etc.)
— same info the bench would surface, just visible without digging.

---

## What's next

v334 closes the docket pivot block:
- v331 — worker pool tier 1 ✓
- v332 — chunk streaming + ruinPlacer fix ✓
- v333 — reset + dumpChunkGrid stagger ✓
- **v334 — AI tools panel ✓**

Genuine open questions / follow-ups:

1. **Wire MeshPostProcessor into the asset loader** — the
   surgical-vs-shim architectural question from v331. Now that
   the kernels work, decide the integration approach.
2. **OBJ floating preview canvas** — the second item from the
   original docket. Above the bench, draggable handle. Pure UI.
3. **Boundary walls follow camera when streaming** — known
   limitation noted in v332's doc. Cosmetic.
4. **Per-tool quick-test buttons in pipeline section** — could
   add a small "→ Bench" jump or in-place mini-test. Optional.
5. **Test the CS arc** (v323-v330) — still on you. Eight rounds
   shipped without real-play validation.

Or pivot back to gameplay if any of the recent fixes felt good
and you want to ride the momentum.
