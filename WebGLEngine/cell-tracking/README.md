# 3D+Time Cell Tracking — baseline pipeline

A standalone Python pipeline for the Kaggle cell-tracking competition
(royerlab/kaggle-cell-tracking-competition): detect cells in 3D+time zebrafish
embryo microscopy, link them across frames, identify divisions, and write a
submission CSV in the required format. Built and validated end-to-end against
synthetic data that mimics the real zarr v3 + geff format exactly.

## What's actually here

This is a classical-CV baseline, not a learned model. It will get you a real,
working, scoreable submission today. It is *not* tuned on real competition
data (none was available in this environment) — it's tuned and validated on
synthetic data designed to match the real format and physical scale exactly.
Expect to re-tune `sigma` / `min_distance` / `threshold` once you run it
against actual samples, since real microscopy noise, cell density, and SNR
will differ from the synthetic generator.

## Two trackers, and which one to use (v2210)

`--tracker hungarian` (default) is the classical baseline: an assignment made frame by frame, with a rule for
divisions. `--tracker ilp` links with **`royerlab/tracksdata`** — the people who wrote the competition — and
turns the whole movie into one integer program: which detections to keep, which edges to take, where tracks
appear, disappear and divide, all decided at once, and solved to global optimality by **SCIP** through `ilpy`.
Gurobi is supported and **not required**.

Measured on six synthetic movies with the competition's own metric (`tools/tracker_bench.py`):

|                            | perfect detections | jittered + 8% dropped |
|----------------------------|-------------------:|----------------------:|
| hungarian (`tracker.py`)   |         **1.1000** |                0.8451 |
| tracksdata NN              |             1.0800 |                0.8635 |
| tracksdata ILP (SCIP)      |             1.0929 |            **0.8795** |

**Read that table carefully.** The Hungarian baseline is *perfect* on perfect input and the ILP is not — a
global optimum of the wrong objective is not the right answer. On the input a real detector actually produces
— jittered, with detections dropped — the ILP wins, and by a margin worth having.

### The costs are the model, and three of them are counter-intuitive

1. **`node_weight` must be negative.** It is a *reward* for using a detection. At zero, the optimal tracking is
   the **empty** one: it costs exactly nothing. The solver is not broken; it answered the question asked.
2. **Appearance must be expensive relative to a plausible link — and cheap relative to the node reward.** Price
   it too low and, at a division, the second daughter simply *starts a new track*: two cheap appearances beat
   one division plus two edges. Price it near the node reward and the division is dropped to dodge a
   disappearance elsewhere. **It is a ratio, not a number.**
3. **A division must be slightly rewarded** (`-2.0`, measured). Not because divisions are good, but because
   the metric pays `+0.1 × division_jaccard` and a cost-minimising solver cannot know that unless it is told.
   And a rewarded division makes the solver **robust to the appearance price**, which closes the band in (2).

### What this is not

It is **not `ultrack`**. Ultrack's contribution is that it does not commit to one segmentation: it carries
*multiple candidate segmentations per cell per timepoint* and lets the tracker choose. Our detector emits one
centroid per cell per frame, so there is nothing to choose between, and putting ultrack in front of a
single-hypothesis detector buys a dependency and nothing else. **That work belongs in the detector.**

### And it has never seen real data

Everything above is synthetic. The competition's zarr volumes are not in this environment. **Every number in
that table will move**, and the appearance-to-node-reward ratio is the first thing to re-measure.

## Pipeline

```
zarr volume (T,Z,Y,X) ─┬─> detector.py    (per-frame 3D blob detection, Gaussian
                        │                  smoothing + local-maxima peak finding)
                        └─> tracker.py     (Hungarian frame-to-frame linking on
                                            physically-scaled distance, division
                                            detection via unmatched-detection
                                            nearest-parent heuristic)
                                  │
                                  v
                         io_utils.py  (writes submission CSV in exact format)
```

| File | Purpose |
|---|---|
| `src/io_utils.py` | Zarr v3 image reader, geff ground-truth reader, submission CSV writer |
| `src/detector.py` | Per-frame 3D blob detection (Gaussian smoothing + `peak_local_max`) |
| `src/tracker.py` | Frame-to-frame linking (Hungarian algorithm) + division detection |
| `src/metric.py` | Exact reimplementation of the competition's edge Jaccard + division Jaccard scoring, for local validation before submitting |
| `src/run_pipeline.py` | End-to-end CLI: zarr in, submission.csv out |
| `src/evaluate.py` | Runs the pipeline on samples *with* ground truth and reports the actual competition score, for tuning |
| `src/make_synthetic_data.py` | Generates synthetic zarr+geff samples for development/testing |

## Quickstart

```bash
cd src

# 1. Generate synthetic data to sanity-check everything works (optional —
#    skip this once you have real competition data)
python make_synthetic_data.py

# 2. Run the pipeline on the train split (or test split once real data is in place)
python run_pipeline.py --data_dir ../test_data --split train --out ../submission.csv

# 3. Validate the score locally against ground truth (train split only)
python evaluate.py --data_dir ../test_data --split train
```

To run against the **real competition data**, just point `--data_dir` at
wherever `train/` and `test/` live (e.g. the Kaggle input directory) — the
zarr/geff readers expect the exact directory layout described in the
competition's dataset description, so no changes should be needed there.

## Tuned parameters (on synthetic data — re-tune on real data)

```
sigma = 1.5              # Gaussian smoothing sigma, ~ expected cell radius in voxels
min_distance = 4          # min voxel separation between detected peaks
max_link_distance = 7.0   # um, matches the competition's own node-matching radius
division_distance = 10.0  # um, max distance from parent to either daughter at split
```

Run a quick sweep (see `evaluate.py`) on real train data to re-tune these —
the synthetic generator's cell size/density/noise won't exactly match real
zebrafish embryo imaging.

## Current local score (synthetic data)

```
Adjusted edge Jaccard (weight-avg): 0.697
Division Jaccard (micro-avg):       0.750
FINAL SCORE:                        0.772
```

### v1878 — realistic synthetic generator + visualizer

The earlier generator placed nuclei with unconstrained sampling + random-walk
drift, which let cells land *on top of each other* (ground-truth nearest-neighbour
spacing hit 0.00 um). Overlapping cells cannot be separated by any centroid
detector, so detection recall was capped artificially (~0.81 on the dense sample)
and the local score (~0.648) was a poor proxy for real algorithm quality — it was
penalising the pipeline for a physically impossible task.

`make_synthetic_data.py` was rewritten to be realistic:
- **Non-overlapping placement** via rejection sampling against a minimum physical
  separation (`min_sep_um`), enforced on both seeding and per-frame drift, so no
  two nuclei ever share a voxel.
- **Anisotropic blobs** — a physical radius (um) converted to per-axis voxel sigma,
  matching the ~4x coarser z sampling (1.625 vs 0.406 um/voxel).
- **Poisson shot noise** + Gaussian read noise + a slow background gradient, like
  real fluorescence microscopy.
- **Plausible divisions/motion** — daughters pushed apart along a random axis with
  smoothly-varying velocity; parents stop.

On this realistic data the *same* pipeline scores **0.772** (detection recall
recovers to 0.94-1.00). This is now a meaningful proxy to tune against before real
competition data is available. NOTE: this is still synthetic — re-validate on real
royerlab samples, which is where the numbers that matter come from.

`visualize.py` renders the pipeline visually (headless PNGs to `../viz/`):
- `<sample>_detections_tXX.png` — Z-projection of a frame with GT centroids
  (green o, red if missed) and predicted detections (magenta x, yellow if false).
- `<sample>_tracks_xy.png` — predicted tracks as XY polylines (o=start, square=end,
  white-diamond+star=division fork).
- `<sample>_tracks_zt.png` — Z-vs-time per track (depth motion + track lifespans).
The server-mode Cell Tracking panel has a **Visualize** button that runs this and
shows the images inline.

### v1879 — WebGL2 3D viewer + parallel detection

- **3D track viewer** (`celltrack-viewer.html`, opened by the panel's **3D Viewer**
  button). Reads the latest run's `submission.csv` via `/celltrack/tracks` (parsed to
  JSON by the bridge) and renders it in WebGL2 (vendored three.js): cells as 3D points
  colored by lineage, track trails drawn up to the current frame, division forks marked
  red, with a **time scrubber + play/pause**, drag-to-orbit, wheel-zoom, and auto-spin.
  This is the "see the tracks in 3D and scrub time" view. (Currently renders the
  centroid point-cloud + tracks; overlaying the raw zarr volume is a later add.)
- **Parallel detection** (`--workers N`, `0` = all cores). Detection is ~100% of the
  runtime and each frame is independent, so on a many-core CPU box this scales
  near-linearly. `--workers 1` (default) keeps the low-overhead sequential loop for
  small volumes; on real competition-sized stacks, set `--workers 0` to use every core.
  Verified to produce byte-identical output to the sequential path.

  ```bash
  python run_pipeline.py --data_dir <real> --split test --out submission.csv --workers 0
  ```

### v1886 — remote peers over a mesh VPN + peer roster via Drive

Peers are still gated to private/VPN address ranges (no raw public IPs), but the filter now
accepts **Tailscale** (`100.64.0.0/10`) alongside the existing `192.168.x`, `10.x`, `172.16.x`
(which covers **ZeroTier** if its managed range is 10.x or 172.16). So a box on another network
— e.g. a family member's machine — can be a full peer by joining the same mesh VPN:

- **Tailscale:** install on each box (Windows/macOS/Linux all supported), sign in to the same
  tailnet; each box gets a `100.x` address. Simplest cross-household setup — no range config.
- **ZeroTier:** create a network, join each box, set the managed range to `10.x` or `172.16.x`
  so SweK accepts it out of the box (free for up to 25 devices).

Once on the VPN, the remote box is a first-class peer: it appears in the "run on" picker,
Cluster checkboxes, and Watch, and can pull the dataset from Drive itself (read-only) — nothing
about cell tracking is LAN-specific beyond the peer filter.

**Peer roster via Drive** (shared address book): instead of hand-entering each box's VPN IP
everywhere, one box **Publishes** its known peers + own URL to `swek-peers.json` in the Drive
folder (write scope), and every box **Pulls** it to add those peers (read-only; each URL still
passes the LAN/VPN filter before being added — arbitrary hosts are skipped). Buttons are in the
panel's Dataset-via-Drive section.

### v1885 — dataset via Google Drive (no Kaggle token on peers)

The pipeline reads local files and never talks to Kaggle. To get the data onto every box
(each cluster node reads its own `test_data/`), the data is shipped through Drive:

1. **One box (Galaxina) ingests.** It has the Kaggle token (`~/.kaggle/kaggle.json`).
   `dataset_tool.py fetch` downloads + unzips the competition data; `pack` tars each sample
   (`<split>__<sample>.tar`) — a zarr is thousands of tiny chunk files, so one tar per sample
   moves through the Drive API vastly faster than the raw folders.
2. **Upload to Drive.** `dataset-upload` pushes the tars to your Drive folder. This needs a
   **write-scoped** Drive consent on Galaxina (`drive.file` — the app only touches files it
   created). The default auto-update consent is read-only, so re-connect Drive with write access.
3. **Each peer pulls.** `dataset-pull` lists the folder, downloads the tars (optionally just a
   cluster node's assigned samples), and unpacks them into local `test_data/<split>/`. Pulling
   only needs **read-only** Drive — so peers need no Kaggle token and no write access.

Panel: a "Dataset via Drive" section with Fetch / Pack / Upload (ingest box) and Pull (every
box). Bridge: `driveSync` gained `listFolder` / `downloadBytes` / `uploadBytes`;
`dataset_tool.py` handles fetch/pack/unpack; routes `/celltrack/dataset-upload|dataset-list|
dataset-pull` (pull peer-forwardable). Pack↔unpack verified byte-identical (pipeline scores
the same on restored data).

### v1884 — watch a peer's run (read-only monitoring)

Any box can now monitor another node's run in real time without having started it. The panel's
**Watch** row picks any node (this box or a peer); it then polls that node's status + log
(read-only) and its cluster fan-out, all peer-forwarded. So if PurtyGF is running the tracker,
Galaxina and the Mac can both open Watch → PurtyGF and see the live log + per-node cluster
progress at once — unlimited watchers, near-real-time (~1.5s poll). The run's log/status is a
shared server-side ring buffer on the running box, so every watcher sees the same stream.
`/celltrack/cluster-status` gained `?peer=` forwarding so a watcher can see a cluster that a
*different* box launched (previously the fan-out was only visible on the initiator).

### v1883 — on-demand frame streaming (WebGPU viewer)

The v1882 viewer downloaded the whole density volume up front — fine for the 64³ synthetic
set, but real embryo stacks have hundreds of frames. The viewer now **streams per-timepoint**:
it fetches only the current frame (`/celltrack/volume?sample=X&t=N`), caches a rolling window
(~24 frames, LRU-evicted so browser memory stays bounded), and prefetches the next couple of
frames so scrubbing/playback stays smooth. A load-token guard drops stale frames if you scrub
faster than fetches complete. Bridge-side, `readVolumeFrame` does a *positioned* read (seek to
`t * D*H*W`), so a multi-GB `.vol` is never loaded whole into memory. Peer-forwarded too, so
streaming works against a peer's exported volume. The whole-file route still works (no `?t=`).

### v1882 — WebGPU volume viewer + dep auto-install

- **WebGPU volume viewer** (`celltrack-viewer-gpu.html`, "WebGPU Viewer" button). Unlike the
  WebGL2 viewer (abstract points), this ray-marches the *raw intensity* so you see the nuclei
  as glowing 3D density with the predicted tracks threading through them — the view where the
  renderer choice actually changes the picture. WebGPU needs NO install (built into Chrome/Edge
  113+, Pascal GPUs supported); the viewer feature-detects `navigator.gpu` and, if absent,
  links back to the WebGL2 viewer. Controls: density + threshold sliders, tracks toggle, time
  scrubber/play, orbit/zoom.
  - Because the zarr is zstd/blosc-compressed (Node can't decode it), a Python exporter
    `export_volume.py` reads each sample's zarr, downsamples every timepoint to a small uint8
    density grid (default max 64 vox/axis), and writes `volumes/<sample>.vol` (+ `.json`
    header with dims + physical extent so the shader keeps real proportions). Run it via the
    **Export volume** button. Bridge serves `/celltrack/volume-list|volume-meta|volume`
    (peer-forwarded, so the GPU viewer works on a peer's results too).
- **Dependency auto-install before a run.** `run()` now checks the Python imports first and, if
  this box's global "auto-install as needed" toggle is on (Settings → Auto-Install) or the
  caller asks, pip-installs anything missing *before* spawning. This makes a dispatched/cluster
  run self-heal on a peer (e.g. PurtyGF) that's never had the Cell Tracking deps installed by
  hand — nobody has to watch that peer's panel to click Install. matplotlib was added to the
  dep check so the visualizer is covered too.

### v1880-1881 — peer dispatch + cluster

Runs can be handed to other SweK boxes over the LAN from the server-mode panel:
- **Single dispatch** ("run on" picker): send a whole run to one chosen peer (e.g. a
  powerful CPU box). It runs, streams its log back, and the 3D Viewer / download pull
  from that peer.
- **Cluster run**: check this box + any peers, and the initiator splits the split's
  samples round-robin across them (`run_pipeline.py --samples a,b,c` per node, each with
  `--workers 0`), runs all nodes in parallel, then gathers every node's `submission.csv`
  and merges into one combined submission. Failed nodes are skipped. Granularity is
  whole-sample-per-box (not frame-level), so only the small result CSVs cross the LAN.
  Each peer must be a running SweK bridge with Python + the same data split locally.

### Older baseline (previous overlapping-cell generator, for reference)

```
Adjusted edge Jaccard (weight-avg): 0.573
Division Jaccard (micro-avg):       0.750
FINAL SCORE:                        0.648
```

This number means nothing on its own for the real leaderboard — it only
confirms the pipeline and metric implementation are internally consistent.
The real test data will have different density, noise characteristics, and
possibly different cell sizes; expect the score to move once you run this
for real.

## Known limitations / next steps, in priority order

1. **Detector is the weakest link.** `peak_local_max` on a Gaussian-smoothed
   volume works for well-separated, roughly spherical blobs but will
   under-count touching/dense cells and over-count noisy bright spots. A
   learned 3D detector (StarDist3D, a small 3D U-Net, or Cellpose-style
   flow fields) would likely improve recall substantially in dense regions —
   this is the highest-leverage upgrade.
2. **Tracker is greedy frame-to-frame, not a global solver.** Hungarian
   matching per consecutive frame pair is fast and reasonable but can't
   recover from a missed detection two frames in a row (track breaks
   permanently). A proper tracker (e.g. a min-cost flow / linear assignment
   over a sliding window of several frames, or `trackpy`/`laptrack`-style
   gap-closing) would meaningfully improve the edge Jaccard, especially FN.
3. **Division detection is a distance heuristic**, not learned. It works for
   clean, well-separated divisions but will miss tight/fast divisions and
   may false-positive on cells that happen to be near another track when a
   detection is briefly missed. This is the most fragile part of the
   pipeline and the most likely source of FP/FN division errors.
4. **No segmentation, only centroids.** The competition only scores
   centroids + links, so this is fine for the metric, but a real
   segmentation step (watershed seeded by the detected peaks) would make
   detection more robust in dense/touching-cell regions even without
   changing the output format.
5. **`metric.py` is a careful-but-unverified reimplementation** of the
   spec in `metrics.md`. It hasn't been checked against the competition's
   own reference implementation or test cases — treat it as a useful
   *relative* signal for comparing parameter choices locally, not as a
   guaranteed match to the actual leaderboard score. If the real repo
   ships example ground truth + a reference score, validate `metric.py`
   against that before trusting it for final tuning decisions.

## Why this isn't part of SweK Engine

This is a from-scratch Python/numpy/scikit-image pipeline with no
relationship to SweK Engine's WebGL2/Node.js LAN-bridge architecture — folding
it into that codebase would only add confusion. The one place SweK's
strengths (3D point-cloud/volumetric rendering, time scrubbing) could
genuinely help is as an optional visualizer for debugging predicted tracks
against the raw zarr volume — that would be a separate follow-up, not a
prerequisite for getting a working submission.

## GPU-accelerated detection (optional)

Pass `--gpu` to `run_pipeline.py` (or tick **GPU smoothing** in the engine's
Cell Tracking panel) to run the Gaussian smoothing on the GPU via the bundled
Deno WebGPU service (`gpu_smooth.mjs`). Smoothing is the detector's dominant
cost and is a large GPU win. Requires Deno (the engine auto-installs it); if
Deno or a usable GPU is absent, the pipeline falls back to the CPU path
automatically — GPU is a speedup, never a dependency. Detections are numerically
identical to the CPU path (verified: peaks land on the same voxels).
