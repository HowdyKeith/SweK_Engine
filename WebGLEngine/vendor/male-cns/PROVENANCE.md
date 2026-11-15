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

## The steering circuit (PFL2, PFL3, DNa02, DNa03) -- fetched another way, 2026-11-15

`cx-steering-circuit.json` was NOT fetched through Neuprint (the sandbox that made it cannot reach
neuprint.janelia.org and holds no token). It was read off the dataset's public flat files:

- directory: `https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/`
  (no token, no sign-in)
- `body-annotations-male-cns-v1.0-minconf-0.5.feather`
  sha256 `2177e246113e4cfbf1e7772ec37c6da1955ff22e8063d0b1f833101f99a9a3b2`
- `connectome-weights-male-cns-v1.0-minconf-0.5-significant-only.feather`
  sha256 `5c536423a62a688e59e7b441f9c04d6272c9a1f017e35814cf561f8c275d9e9e` (25,568,639 rows)

`tools/maleCnsFlatExtract.py` (needs `pyarrow`; reads the two files, embeds nothing) takes the neurons
of the named types and every connection among them, in the shape of the two files above.

**The route was checked against what was already here.** Run with `--check`, the same script
reproduces `giant-fiber-circuit.json` (34 neurons, 313 of 313 edges, every weight the same) and
`epg-compass-circuit.json` (50 neurons, 893 of 893 edges, every weight the same) exactly. So for these
circuits "significant-only" in the flat files is the edge set Neuprint returned.

40 neurons: 12 `PFL2`, 24 `PFL3`, 2 `DNa02`, 2 `DNa03`; 523 edges. Synapses by pathway: PFL2 to DNa03
1,571; PFL3 to PFL3 853; PFL3 to DNa02 736 (every one to the DNa02 of the other `somaSide`); PFL2 to
PFL2 606; DNa03 to DNa02 552; PFL3 to DNa03 468. `brain/helmSteerPolicy-selfcheck.mjs` pins these.

**Licence, said plainly:** the bucket's own README states no licence. CC-BY-4.0 is what this file
records for the dataset as served by Neuprint; it was NOT re-confirmed for the bucket route.

**Not here:** the inputs to this circuit (the fan-shaped body's goal cells and the compass, which is
`epg-compass-circuit.json`; no E-PG to PFL connection is in either file), and neurotransmitter signs.

## Contents

- `giant-fiber-circuit.json`, `epg-compass-circuit.json`, `cx-steering-circuit.json` — see the circuit sections above.
- `PROVENANCE.md` — this file.

Re-running the fetch (e.g. for a different circuit, or a refreshed dataset version) uses the same fetch
script and `tools/maleCnsBake.mjs`; neither embeds a token, and both must keep it that way.

## Citation

Janelia FlyEM male-cns connectome, via Neuprint (neuprint.janelia.org), dataset `male-cns:v1.0`.
