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

The JSON's `sources.*.file` are the names the files had on the disk that read them
(`body-annotations-v1.0.feather`, `connectome-weights-v1.0-significant-only.feather`,
`body-neurotransmitters-v1.0.feather`); the names above are the bucket's. The sha256 is the same file.

### Transmitter predictions, and two more circuits (same day, same route)

- `body-neurotransmitters-male-cns-v1.0.feather`
  sha256 `95c9289220663abeb3409f3ad9e5a7f8a53f8093f5139d15502cd08da8879621`

With `--neurotransmitters`, each neuron also carries `nt` (the release's `consensus_nt`: a classifier's
PREDICTION from the EM images, pooled over the cell type -- not a measurement) and `ntConfidence`.
`cx-steering-circuit.json` was re-extracted with them; its neurons and edges are unchanged.

`cx-steering-inputs-circuit.json` -- the steering output WITH ITS INPUTS: `EPG` 46, `Delta7` 42
(predicted glutamate), `FC2A` 18, `FC2B` 27, `FC2C` 47, and the 40 neurons above. 220 neurons, 7,981
edges. The 40-neuron file is exactly its sub-circuit.

`lc10-tracking-circuit.json` -- a visual target-tracking pathway: `LC10a` 275, `AOTU019` 2 (predicted
GABA), `AOTU025` 2, `DNa02` 2. 281 neurons, 6,589 edges.

Both are DATA ONLY so far (nothing runs on them). `brain/maleCnsCircuits-selfcheck.mjs` pins all three.

### Where the tracking cells' dendrites are (2026-11-16, same route)

- `syn-partners-male-cns-v1.0-minconf-0.5-significant-only.feather` (2,965,702,122 bytes)
  sha256 `43748c76db13e339e9eeb6f4d56e98aab704a4f7fa8bf3cb916b323000070d04` (124,039,080 rows)

`tools/maleCnsDendritePositions.py` reads every synapse's coordinates from it and writes
`lc10-positions.json`: for each of the 275 `LC10a` cells, the median place of its dendrite's input sites
(the inputs far from the type's output region; 158,922 of 251,485 sites). Units are the dataset's voxels.
The body annotations give these cells no place in the eye (`assignedOlHex*` is empty for them); this is
the only position the tree has for them. **Which way the sheet maps onto the visual field is not in
this file.** `brain/maleCnsCircuits-selfcheck.mjs` (section 5) pins the file and what it shows.

**Licence, said plainly:** the bucket's own README states no licence. CC-BY-4.0 is what this file
records for the dataset as served by Neuprint; it was NOT re-confirmed for the bucket route.

**Not here:** the eye's own input to LC10a, the other LC10 subtypes, and anything upstream of FC2.

### A small-object pathway: LC11 (2026-11-21, same route; the choice checked against Neuprint)

`lc11-object-circuit.json` -- `LC11` 143 (68 left, 75 right), `AVLP079`, `AVLP080`, `AVLP086` (each predicted
GABA, one a side) and `DNp35` (one a side). 151 neurons, 7,936 edges. Made by `tools/maleCnsFlatExtract.py
--types LC11,AVLP079,AVLP080,AVLP086,DNp35` from the same three flat files as the circuits above.

**How the types were chosen (one rule, stated before anything was built or flown on them):** LC11 is the
small-moving-object cell type (Keith's pick, after `brain/STEALTH_ROUNDS_WIP.md`'s reading of Klapoetke et al.
2017's LC11 imaging). The descending neuron is the one that takes the most of LC11's output, directly and
through one relay: **DNp35**, 2,027 synapses directly (5.8% of its 35,016 input synapses) and the most of any
descending type through a relay. **LC11 barely reaches DNa02**, the tracking circuit's steering neuron (its best
relay, PVLP048, takes 421 synapses from LC11). The relays are the central-brain types taking at least 2,000
synapses from LC11 and giving at least 400 to DNp35: AVLP079, AVLP080, AVLP086. (LC17, LC31a, LPLC1 and LC21 also
relay to DNp35 but are visual projection neurons, other eye cells, and were left out by the rule.) The query
that found them was read through Neuprint's `/api/custom/custom` at `male-cns:v1.0` with the maintainer's token
supplied by the session's network proxy (it never appeared in a file or command line); the numbers were then
re-counted from the flat files, and those are the ones pinned. `brain/maleCnsCircuits-selfcheck.mjs` (section 6)
pins the file. Baked for a policy as `brain/lc11Topology.mjs` (tools/bakeConnectomeTopology.mjs).

**What the wiring shows:** every LC11 cell reaches DNp35 directly, on its own side only; the three GABA relays
feed back onto LC11 (AVLP079 1,792 synapses, AVLP086 595), a loop the LC10a circuit does not have. The body
annotations give LC11 no place in the eye (`assignedOlHex*` empty), as for LC10a.

**Where the LC11 dendrites are:** `lc11-positions.json`, by `tools/maleCnsDendritePositions.py` from the same
per-synapse file as LC10a's (343,904 input sites, 316,652 dendrite). The places of a side lie on a sheet
(spreads about 6,000, 2,900 and 840 voxels), and **DNp35 draws from one end of the sheet's second axis**: with the
axis pointed toward the midline, a cell's synapses onto DNp35 fall along it (correlation -0.71 left, -0.56
right). Which part of the visual field that end is, is not in this data. Pinned by section 7 of the gate.

**Not here:** what DNp35 does in behaviour (not read; this file says nothing about it), the eye's input to LC11,
and the other descending neurons LC11 reaches more weakly (DNp103, DNp09, DNp06 through relays).

### The dark-looming cells LC6 and LC16 (2026-11-22, same route; the routes found through Neuprint first)

`lc6-loom-circuit.json` -- `LC6` 124 (59 left, 65 right), `PVLP151` 4, `DNp103` 2: 130 neurons, 3,407 edges. `lc16-loom-circuit.json` -- `LC16` 182 (88 left,
94 right), `pIP1` 2: 184 neurons, 8,324 edges. Every cell predicted acetylcholine. Made by `tools/maleCnsFlatExtract.py` from the same three flat files.

**Chosen by LC11's rule**, stated before anything flies on them: the descending neuron taking the most of the type's output directly and through one relay -- DNp103
for LC6, pIP1 for LC16 -- and the central-brain relays taking at least 2,000 synapses from the type and giving at least 400 to that neuron: PVLP151 for LC6, none for LC16.

**What the data says, plainly (Keith asked about these as an escape or evade input):** in this release LC6 and LC16 are NOT a second route to the Giant Fiber. Their
direct output onto descending neurons is small -- LC6 2,215 synapses of 77,898, LC16 1,542 of 116,249 -- beside LC4's 33,190 of 144,613 and LPLC2's 24,519 of 186,652,
whose largest descending targets are DNp04 and DNp01 (the Giant Fiber) and DNp103 and DNp01. LC6 is 1.6% of DNp103's input, LC16 3.2% of pIP1's. Neither DNp01 nor the
other Giant Fiber partners appear among their top descending targets. PVLP151's synapses onto DNp103 mostly cross the midline (389 of 406), the first crossing relay in these files.
What DNp103 and pIP1 do in behaviour is not read here and not claimed. Pinned by `brain/maleCnsCircuits-selfcheck.mjs` section 8.

**The loom-response bench (registered, read once, 2026-11-22; `tools/ship/takeLoomBench.mjs`, `brain/loomBench.reading.json`):** over the LC10a/LC11 pathway model (a loom
at a bearing drives one eye's cells at their places; the connectome's signed weights, three steps), BOTH pathways tell the side of a loom IPSILATERALLY in both orientations
of the sheet (LC6 onto DNp103 +0.15 to +0.24, LC16 onto pIP1 +0.37 to +0.49 on the registered index), which the Giant Fiber input model (one bilateral potential) cannot.
PVLP151 does not decide LC6's side: cutting it makes LC6 more ipsilateral (+0.26 to +0.32) -- its crossing synapses pull the other way and lose. The side comes from which
eye a cell is in, not its place (flat arms tell it too); shuffling connections within type flips LC6 contralateral and leaves LC16 no side. A model, hand-set where the
fly's numbers are missing (the drive, sigma, three steps); not a behaviour. The baked modules: `brain/lc6Topology.mjs`, `lc6Synapses.mjs`, `lc6Places.mjs` and LC16's,
re-derived by `brain/maleCnsCircuits-selfcheck.mjs` section 10.

## Contents

- `giant-fiber-circuit.json`, `epg-compass-circuit.json`, `cx-steering-circuit.json`,
  `cx-steering-inputs-circuit.json`, `lc10-tracking-circuit.json`, `lc10-positions.json` — see the circuit sections above.
- `PROVENANCE.md` — this file.

Re-running the fetch (e.g. for a different circuit, or a refreshed dataset version) uses the same fetch
script and `tools/maleCnsBake.mjs`; neither embeds a token, and both must keep it that way.

## Citation

Janelia FlyEM male-cns connectome, via Neuprint (neuprint.janelia.org), dataset `male-cns:v1.0`.
