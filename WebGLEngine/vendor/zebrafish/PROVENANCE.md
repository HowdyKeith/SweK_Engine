# vendor/zebrafish/ -- provenance

**Source**: the Fish1 larval-zebrafish whole-brain EM connectome (Janelia Research Campus / Google Research / Harvard),
Petkova, M. D., Januszewski, M., et al. (2025). *A connectomic resource for neural cataloguing and circuit dissection of the
larval zebrafish brain.* bioRxiv. Release pages: https://fish1-release.storage.googleapis.com/
**Dataset**: `fish1_v250915` (the segmentation named in the release's own notebook).
**Licence**: the release is open access under its data policy (https://fish1-release.storage.googleapis.com/data_policy.html):
independent publication is welcome, co-authorship is not required, and work using the data must cite the resource paper above.
The page states no licence text and none is claimed here.

## What was fetched, and from where (read-only, from this repository's sandbox)

`https://storage.googleapis.com/fish1-release/paper_data/TEN_analysis.zip` -- 3,487,626 bytes, sha256
`fa18e512cdf4eaceb195ae0ee4b9812ec0c85b3a0a20969a085ac38b2da4fe92`, object generation 1777086199106112 (last modified
2026-04-25). It is one of the two analysis packages the release keeps in its open bucket (`paper_data/`); the other,
`HMI_analysis.zip`, was read later and is used for the second circuit below. Files used from it:

| file | bytes | sha256 |
|---|---|---|
| `synapse_sizes.csv` | 2,711,012 | `1ecb28d33addf70d0949802dc5de86f6c4d47e6adcf605c1a0f6da76bb141c72` |
| `TEN_cats.csv` | 1,505 | `bd7c22fd00e0021a56017ac7424ee57f63614dc0cb3476246723fa6d14c40287` |
| `DMVIDs.csv` | 5,339 | `0352765665ebd3ed9d7b8906548a4ddae93960def7e79cef78d12567f34780eb` |
| `DMV_InputsIDs.csv` | 1,606 | `5d206a120b53785f3f07ea15c2747b46fbe59ca63da2709e5f54550e0294729b` |

`synapse_sizes.csv` has 83,426 rows (`pre_neuron_id, bbx, bby, bbz, post_id`: one row per synapse, the bounding box in voxels of
8 x 8 x 30 nm); 83,323 have all five fields, and 103 were dropped by the tool and counted in the JSON's `selection`.
**The fetch needed no token.** The CAVE server the release also runs (`global.brain-wire-test.org`, datastack `fish1_full`,
30 million synapses) needs a personal token and is blocked from this sandbox; nothing here came from it.

## The circuit: `fish1-ten-core.json`

Made by `tools/fishCircuit.mjs` (gated by `tools/fishCircuit-selfcheck.mjs`), one rule with one knob (its size, 34, the Giant Fiber
Circuit's): the neurons are the 1,105 presynaptic sides of the table; an edge is a directed pair of them with the number of
synapses over 5,000,000 nm^3 (the release notebook's first non-zero size threshold) as its weight; the **core** is what is left after
peeling the neuron with the least total synaptic weight until 34 remain. Result: 34 neurons, 153 edges, 308 synapses (26 of the
directed edges are reciprocal); `brain/zebrafishTopology.mjs` is baked from it by `tools/bakeConnectomeTopology.mjs` (with
`--source-label`, so that its header does not claim the fly) and a gate re-bakes it and compares.

**What these neurons are, said plainly**: the package's own lists label 22 of the 34 as inputs to the dorsal motor nucleus of the
vagus (DMV inputs), 7 as DMV neurons (visceral motor neurons), 1 as a TEN class II and 1 as a TEN class IV neuron; 3 carry no
label in the package. It is the densest core of what the paper analysed, not a circuit anyone has shown to steer a body.
It is the fish counterpart of the tree's use of the fly's Giant Fiber Circuit: a real connectome's wiring as the sparsity pattern
of a recurrent core. **The Mauthner (escape) circuit, the fish's true counterpart of the giant fiber, is in the CAVE tables and
is not here.**

## The second circuit: `fish1-hmi-spn.json` (the hindbrain motion integrator's route to the spinal projection neurons)

**Fetched** (read-only, no token): `https://storage.googleapis.com/fish1-release/paper_data/HMI_analysis.zip` -- 1,467,376 bytes, sha256
`5507d2d32e0a111faf8a07ab69edb33f8325f4a1bbc3c74ddd5fb33f6383feca`, object generation 1778524806228774 (last modified 2026-05-11). HMI is the
paper's case study of a hindbrain integrator with recurrent excitation and contralateral inhibition whose outputs are spinal projection neurons
(SPNs) for turning and for forward swimming. Files used from it (the source files are NOT committed; the zip is fetched the same way as the TEN one):

| file | bytes | sha256 |
|---|---|---|
| `data/em_zfish1_dataframe.xlsx` | 86,872 | `ecfd38c4d9acb9b161cde2da031f137e3e713e0b504994c7324d394c787cf588` |
| `data/cave_somas_in_big_box.csv` | 4,200,331 | `94b5c46eed84bd04f46381d52f13f7d7d91e32d4e8af16193ea475291af84638` |

The dataframe has 999 cells, one row each, with `Cell ID` (the SOMA id of the CAVE somas table, not a root id), a class, a neurotransmitter label
(Gad1B, VGluT2, unlabeled, unclear), a network level, and two Python-literal lists, `inputs` and `outputs`, of the synapses a person traced (partner
cell or '-', x, y, z, size): 3,013 tuples, 1,755 to an identified cell, 1,254 to an unidentified one, 4 malformed; 1,401 distinct cell pairs.

**Made by** `tools/fishHmi.mjs` (gated by `tools/fishHmi-selfcheck.mjs`; the xlsx is read with nothing but `zlib`): the targets are the SPNs (a classifier
containing `spn`, as the package's own `is_spn_cell` reads it; the 22 proximal ones, `_prox`, are kept and labelled `SPN_prox` -- the package's own figure
leaves them out); layer 1 is every cell with a transmitter label (VGluT2 +1, Gad1B -1) that has an identified synapse onto a target; layer 2 is every labelled
cell with one onto layer 1. Edges are the identified cell pairs among those 99 neurons whose presynaptic cell has a label, the weight the number of tuples
(a synapse listed in both cells' rows is counted twice, as the package counts it). Sides come from the soma y position against the midline at 259.208 um
(the median of the volume's 179,930 somas), 8 nm voxels. Result: **99 neurons** (50 SPNs: 31 turning and 19 forward groups; layers 18 and 31), **148 edges**
(127 excitatory, 21 inhibitory), **189 synapses**; 23 cell pairs (28 synapses) onto these neurons from a cell with no transmitter label are left out and
counted. Sides: 12 neurons unknown, 75 left, 12 right -- **46 of the 50 SPNs are on the left** (27 turning and 19 forward), 1 turning on the right, 3 unknown.

**What it is, said plainly**: real, human-traced wiring of a hindbrain circuit that the paper links to turning and forward swimming. It is a curated and
partial tracing (the tuples are what a person marked, 1,254 of 3,013 end on a cell nobody identified), so its weights are tuple counts and not synapse
sizes, and the closure is one rule with one knob. No claim is made that it can steer a body: that is what `brain/SUBMARINE_WIP.md` tests.

## What this record could not establish

NOT ESTABLISHED: any licence. The release states a data policy that asks for citation and no licence text; the terms have not been confirmed with the Fish1 team (the register row says so). NOT ESTABLISHED: that either circuit steers a body. RECORDED AS: the bucket, the two package names and their sha256 values, and the extraction rules above.
