---
type: doc
title: "Round 338 — Install Panel: every local-pipeline dependency in one place"
tags: ["swek-engine", "round-doc"]
---

# Round 338 — Install Panel: every local-pipeline dependency in one place

You spent hours yesterday tracking down the install steps for ComfyUI +
Trellis 2 on Windows. The mistakes, the workarounds, the "fake-triton"
backfires, the Xet-pointer trap, the dual-folder requirement. v338 takes
that whole knowledge dump and turns it into a panel inside the engine.

## What it is

A new dock entry called **"Install"** on the left side. Click it; you
get a single scrollable panel listing every piece of the pipeline grouped
by category:

- **🟢 Servers** — ComfyUI, Ollama, the Node bridge. Each row has a ↻
  Verify button that pings the actual URL and flips the pill green
  (online) or red (offline).
- **🧩 ComfyUI Custom Nodes** — Manager, Trellis2, Essentials,
  LayerDiffuse, GGUF, Flowty-CRM. Filesystem items; mark them installed
  with the checkbox and the state persists per browser.
- **🐍 Python Packages** — trimesh, pymeshlab, meshlib, nvdiffrast
  (pre-compiled wheel path), kiui, open-clip-torch, plus the fake-triton
  bypass note.
- **💾 Model Weights** — Juggernaut XL, SDXL Base, DINOv3, Trellis FP8
  pack. Includes the dual-folder requirement (`trellis-2.0` AND
  `TRELLIS.2-4B-FP8`) and the Xet-pointer download trap warning.
- **🔧 Code Patches** — the seven try/except wraps for cumesh, o_voxel,
  nvdiffrast, flex_gemm (twice — once in nodes.py, once in the deeper
  pipeline file), triton comment-out, and the Trellis2LoadModel default
  swap (sdpa + spconv + xformers + FP8).
- **⚙️ Launch Flags** — the full `--lowvram --force-fp16
  --enable-cors-header *` incantation.

## How each row works

Click the item name to expand details. You'll see:
- **Path** — destination directory for files
- **File** — exact path for patches
- **Source** — HuggingFace page or GitHub repo URL
- **Command block** — PowerShell commands, color-coded blue
- **Patch block** — exact code snippet to paste, color-coded green
- **⚠ Notes** — landmines specific to that item

Each row's controls:
- **📋** — copies the command or patch to clipboard
- **↻** — pings the URL (servers only)
- **☑** — marks installed (filesystem items only). Persists to
  `voxelengine.installPanel.v1`.

Top right of the panel:
- **↻ Verify All** — pings every server at once
- **📋 Export** — copies a full setup script (every command, every
  patch, every note, in dependency order) to your clipboard. Paste into
  a fresh PowerShell or save as setup.ps1 for a clean rebuild.

## The hard-won knowledge captured

Every item in the catalog encodes a specific problem you hit:

- **ComfyUI launch**: `--enable-cors-header *` flag (NOT
  `--allow-cors-origin *` — that string doesn't exist in argparse).
  Without it, every generated asset 403s when the engine tries to fetch
  it across ports.
- **nvdiffrast install**: the universal wheel from
  `huggingface.co/spaces/Surn/HexaGrid/...` skips the `CUDA_HOME` source-
  build trap.
- **Civitai downloads**: `--ssl-no-revoke` flag needed on Windows or you
  hit `CRYPT_E_NO_REVOCATION_CHECK`.
- **DINOv3 folder name**: must be exactly
  `dinov3-vitl16-pretrain-lvd1689m`. Trellis2 hard-checks the string.
- **Trellis FP8 weights**: the dual-folder requirement
  (`trellis-2.0` + `TRELLIS.2-4B-FP8`), the Xet-pointer download trap
  (use the download arrow icon, NOT the filename link), the
  `pipeline_fp8.json` → `config.json` rename, and the
  "skip the _1024_ files on 8GB" rule.
- **flex_gemm**: TWO patches needed — one in `nodes.py`, one in
  `trellis2/pipelines/trellis2_image_to_3d.py`. Pipeline file's wrap
  needs exact 4-space indentation, not tabs.
- **Fake-triton folder**: explicitly warned against. Earlier guidance
  suggested it; torch._dynamo then probes `triton.language.dtype` and
  crashes. The right answer is comment-out, not stub-out.

## Tests — 966/966 cumulative

`test_v338.mjs` adds 38 tests:
- Catalog integrity (≥25 items, 6 categories, unique IDs, all required
  fields)
- Runtime pingability
- Critical-piece presence (every item from the install steps must be
  catalogued)
- Patches have both code + target file path
- Models specify destination paths
- State persistence round-trip
- No dangerous commands (rm -rf, format c:, del /s)
- Launch-flag content (lowvram, force-fp16, enable-cors-header *)
- Trellis dual-folder warning + Xet-pointer note preserved

## How to use it

After updating to v338:

```
engineVersion()
;;installPanel.show()
```

Or click "Install" in the left dock.

1. Hit **↻ Verify All** first to see what's already running. ComfyUI
   should ping if you're running it; Ollama if you have it up.
2. Walk down the panel. Anything green-online or marked-installed is
   done. Anything red or unmarked needs your attention.
3. For unfinished items, click the name to expand, click **📋** to
   copy the command, paste into PowerShell, run.
4. When the actual filesystem item exists, tick the checkbox.

If you're setting up a fresh box from scratch, hit **📋 Export** at the
top, paste the result into a setup.ps1, and you have a single executable
script that walks the entire pipeline.

## What's next

You said you still have "the very last step to get Trellis to work."
Whatever that is, it should be one of these rows. Once it works:

- v339: robot face-lock + body dimensions sizing in LISTENER panel
- v340: Ollama panel — rocking/walking/sprinting tiers, EKG removed
- v341: voice translation (Chrome lang + LibreTranslate)
- v342: Snake demo
- v343: Tron demo
- OBJ preview canvas slots in wherever
