# vendor/hemibrain/ -- provenance

**Source**: the hemibrain connectome of the adult *Drosophila* central brain (Janelia FlyEM and Google), release v1.2.
Scheffer, L. K., Xu, C. S., Januszewski, M., et al. (2020). *A connectome and analysis of the adult Drosophila central brain.* eLife 9:e57443.
**Dataset**: `hemibrain:v1.2`, as exported by the release's own adjacency tables.
**Licence**: CC-BY 4.0 as the hemibrain release states it. THIS WAS NOT RE-READ FROM THE RELEASE'S OWN TEXT in this sandbox (the neuprint server and the
publication are not reachable from it); the export's own README does not state a licence. Verify against Janelia's terms before any redistribution wider
than this repository's demo use. CC-BY asks for attribution, which this file and the JSON's `meta.citation` carry.

## What was fetched, and from where (read-only, from this repository's sandbox; no token)

`https://storage.googleapis.com/hemibrain/v1.2/exported-traced-adjacencies-v1.2.tar.gz` -- 45,872,577 bytes, sha256
`07d8946eb0c4e3a5cb23d5769c9817847494f9fcadbc0ca239eed7bbd5555cf7`, object generation 1608664696223156 (last modified 2020-12-22). Files used from it
(the source files are NOT committed; the tarball is fetched the same way):

| file | bytes | sha256 |
|---|---|---|
| `traced-neurons.csv` | 582,598 | `d07c1cac648c12d8135786996ac55de5a2b63d605cd6a24c5ce366224172c825` |
| `traced-total-connections.csv` | 82,191,321 | `1b954eb5b73e8ca8a650323e2a41a079b12d6fb2e92e3b5127f727785741742e` |

`traced-neurons.csv` has 21,739 traced neurons (`bodyId, type, instance`); `traced-total-connections.csv` has 3,550,403 neuron pairs with the total synapse count
between them (`bodyId_pre, bodyId_post, weight`). The export has no neurotransmitter, no synapse position and no cell size.

## The circuit: `hemibrain-cx-heading-loop.json`

Made by `tools/flyCx.mjs` (gated by `tools/flyCx-selfcheck.mjs`): the cells of five central-complex types -- E-PG (the compass cells), P-EN_a and P-EN_b (which move the
compass bump when the animal turns), Delta7 and P-EG (which hold it steady) -- and every ordered pair among them with at least 3 synapses (the usual floor in the
central-complex papers; fixed, not tuned). Result: **148 neurons** (EPG 46, Delta7 42, PEN_b 22, PEN_a 20, PEG 18; 74 left, 74 right), **7,080 edges** (4,332 excitatory,
2,748 inhibitory), **123,676 synapses**; 2,407 pairs (3,250 synapses) between these cells below the floor are left out and counted. The file also names the input cells
(E-PG and P-EN: 88) and the output cells (E-PG and P-EG: 64) the pilot of `brain/SUBMARINE_WIP.md` rung 4a uses, and gives each cell its type as its `layer`.

**THE SIGNS ARE NOT FROM THE DATA.** The export has none. They are assigned by cell type from the central-complex literature as the author remembers it (E-PG, P-EN and
P-EG excitatory -- cholinergic; Delta7 inhibitory -- glutamatergic, acting as inhibition), and the JSON says so in `meta.signs`. They are to be checked against the
papers before the file is trusted for anything but the experiment it was made for.

**What it is, said plainly**: the wiring of the five cell types that are known to keep and move a heading, at the level of neuron-to-neuron synapse counts. It is not the
whole heading system (the cells that read the heading out to the steering cells are not in it), it carries no dynamics, and it is not a claim that a trained pilot uses
it the way the fly does.

## Citation

Scheffer et al. 2020 (above); Janelia FlyEM and Google, hemibrain v1.2.
