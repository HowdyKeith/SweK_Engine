# vendor/male-cns/ — provenance

**Source**: Janelia FlyEM's male-cns connectome, served via Neuprint (https://neuprint.janelia.org).
**Dataset**: `male-cns:v1.0`
**License**: CC-BY-4.0 as declared by the Neuprint server for this dataset. The exact license version
was not independently re-confirmed against Janelia's own publication terms beyond what the server states —
verify before any redistribution wider than this repo's demo use.
**Fetched**: 2026-09-21T13:46:26Z, via a one-time local run of a Neuprint API fetch script
(`POST /api/custom/custom` for a Cypher search + connectivity query, `GET /api/skeletons/skeleton/...
?format=swc` per matched neuron), by the repo maintainer using their own personal Neuprint auth token.
The token was never stored in this repo, committed, or used from within any Claude session — the fetch
ran on the maintainer's own machine, outside the sandboxed environment that requested it, because that
environment's network policy blocks `neuprint.janelia.org` outright.

## Circuit: Giant Fiber Circuit (GFC)

The **Giant Fiber Circuit** (cell types `GFC1`–`GFC4`) — the fly's fast visual/mechanosensory
escape-response pathway. 34 neurons, 313 within-circuit synaptic edges (`:ConnectsTo`, aggregated
`.weight`). Chosen as a small, well-known, visually legible circuit rather than an exhaustive slice
of the ~150k-neuron male-cns connectome.

| type | count |
|---|---|
| GFC1 | 3 |
| GFC2 | 10 |
| GFC3 | 13 |
| GFC4 | 8 |

`giant-fiber-circuit.json` — baked from the raw Neuprint fetch by `tools/maleCnsBake.mjs`. Per neuron:
`bodyId`, `type`, `instance`, `pre`/`post` synapse counts, and its SWC skeleton as parallel flat arrays
(`xyz`, `radius`, `kind` — the SWC structure-identifier column, `parent` — a 0-based index into that
same neuron's own arrays, `-1` for a root point). `edges` is a flat list of `[from, to, weight]` triples
over the same 34 `bodyId`s. Coordinates are in the dataset's native (nm-scale) voxel space, uncentered —
the loader is responsible for centering/scaling for display.

## Circuit: Ellipsoid Body Compass (EPG)

The **E-PG ("compass") neurons** of the central complex — the fly's heading/ring-attractor circuit
(Seelig & Jayaraman 2015 and follow-ups). Each EPG neuron innervates one protocerebral-bridge (PB)
glomerulus and a corresponding ellipsoid-body wedge; as a population they tile the full ring. Fetched
uncapped (`--max-neurons 60` against 50 real matches, so nothing was truncated) after an earlier
40-neuron capped fetch looked anatomically incomplete — that looked like a single-glomerulus slice from
the `instance` labels alone (`EPG(PB08)_*` for every neuron), but checking real skeleton centroids
per `_L1`–`_L8`/`_R1`–`_R8` position on the uncapped fetch shows `(PB08)` is a fixed dataset/schema tag
shared by every core EPG instance, not a literal glomerulus id — the position varies smoothly and
systematically with the `_L#`/`_R#` suffix (a clean arc in x/y across all 16 positions), confirming this
is genuine full-ring coverage, not a truncation artifact.

50 neurons fetched: 46 `EPG` (the core ring, 16 PB-glomerulus positions × 2–4 neurons each, 8 per
hemisphere) + 4 `EPGt` (a distinct tangential subtype at a 9th, anatomically separate PB position —
confirmed by z-centroid, ~26000 vs ~22000 for the core ring). 893 within-fetch synaptic edges.

| type | instance positions | count |
|---|---|---|
| EPG | `(PB08)_L1`–`_L8`, `_R1`–`_R8` | 46 |
| EPGt | `(PB09)_L9`, `_R9` | 4 |

`epg-compass-circuit.json` — baked the same way as the GFC file, same shape, over all 50 fetched
neurons (core ring + tangential). A consumer wiring this circuit's topology into a policy decides for
itself whether to include the 4 `EPGt` neurons or restrict to the 46-neuron core ring.

## Circuit: Mushroom Body (MB)

The **mushroom body** -- where the fly learns associations: Kenyon cells (KC) carry what is sensed, mushroom-body output
neurons (MBON) read them, dopamine neurons (DAN) teach the KC-to-MBON connections, and the APL and DPM neurons feed back
onto the Kenyon cells. Added 2026-11-17 for the backlog's `fly-mushroom-body-data` (a fly brain that learns while it lives).

**This file was NOT fetched the way the two above were.** Its source is the **public release bucket** of the same dataset,
with no token and no Neuprint query: Janelia FlyEM's flat connectome tables at
`gs://flyem-male-cns/v1.0/connectome-data/flat-connectome/`, read over HTTPS from inside a Claude Code session on
2026-11-17 (Neuprint and the bucket were both reachable from that sandbox by then; the bucket needs no credential):

| table | bytes | sha256 |
|---|---|---|
| `body-annotations-male-cns-v1.0-minconf-0.5.feather` | 14,483,314 | `2177e246113e4cfbf1e7772ec37c6da1955ff22e8063d0b1f833101f99a9a3b2` |
| `connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather` | 508,025,642 | `9b3beab17bad5f618be3f2c02d3139a8d07b822565919c013f1e5506d93e604b` |

The tables are not in this repo (half a gigabyte). `tools/maleCnsMushroomBody.py` bakes them into
`mushroom-body-circuit.json`; run twice it gives the same bytes. Which cells: every body whose `class` is `Kenyon_Cell`,
`MBON` or `DAN`, and the bodies typed `APL` and `DPM` -- all `Traced`.

| group | count |
|---|---|
| KC | 4,064 (KCg-m 1,342; KCab-s 657; KCab-m 536; KCab-c 488; KCa'b'-ap2 291; KCg-d 206; KCa'b'-m 205; KCa'b'-ap1 199; KCab-p 129; 11 more) |
| MBON | 97 |
| DAN | 340 (PAM 316, PPL1 16, others 8) |
| APL | 2 |
| DPM | 2 |
4,505 cells, 2,266 with the soma on the right and 2,239 on the left.

**What is kept and what is not.** Topology only: no skeletons, no coordinates (the bucket has skeletons for every body if a
page ever wants them). Between these cells there are 1,018,725 connections carrying 2,794,887 synapses; **the file keeps the
101,392 of at least 5 synapses**, the threshold most connectome work uses for a reliable connection. The file's `totals`
holds every pair of groups at every weight and as kept, so what the threshold drops is in the data. It keeps 87 percent of
the KC-to-MBON synapses, 92 percent of DAN-to-MBON, over 99 percent of the APL and DPM loops -- and only 16 to 22 percent of
DAN-to-KC, KC-to-DAN and KC-to-KC, which are mostly many weak connections. A dopamine neuron's teaching role is read from
which MBON compartment it reaches, which is kept.

The licence: the bucket's README states none. The Neuprint server declares CC-BY-4.0 for `male-cns:v1.0`, as recorded at
the top of this file; this is the same dataset version, and the same caution applies -- not re-confirmed against Janelia's
own terms beyond that.

## Contents

- `giant-fiber-circuit.json`, `epg-compass-circuit.json` — see the circuit sections above.
- `mushroom-body-circuit.json` — see the mushroom body section above (from the public release tables, not Neuprint).
- `PROVENANCE.md` — this file.

Re-running the fetch (e.g. for a different circuit, or a refreshed dataset version) uses the same fetch
script and `tools/maleCnsBake.mjs`; neither embeds a token, and both must keep it that way.

## Citation

Janelia FlyEM male-cns connectome, via Neuprint (neuprint.janelia.org), dataset `male-cns:v1.0`.
