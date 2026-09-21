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

## Circuit

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

## Contents

- `giant-fiber-circuit.json` — baked from the raw Neuprint fetch by `tools/maleCnsBake.mjs`. Per neuron:
  `bodyId`, `type`, `instance`, `pre`/`post` synapse counts, and its SWC skeleton as parallel flat arrays
  (`xyz`, `radius`, `kind` — the SWC structure-identifier column, `parent` — a 0-based index into that
  same neuron's own arrays, `-1` for a root point). `edges` is a flat list of `[from, to, weight]` triples
  over the same 34 `bodyId`s. Coordinates are in the dataset's native (nm-scale) voxel space, uncentered —
  the loader is responsible for centering/scaling for display.
- `PROVENANCE.md` — this file.

Re-running the fetch (e.g. for a different circuit, or a refreshed dataset version) uses the same fetch
script and `tools/maleCnsBake.mjs`; neither embeds a token, and both must keep it that way.

## Citation

Janelia FlyEM male-cns connectome, via Neuprint (neuprint.janelia.org), dataset `male-cns:v1.0`.
