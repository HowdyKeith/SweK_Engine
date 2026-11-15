# Fish1 CAVE: are the retinal and tectal inputs to the Mauthner candidates in the data? (2026-11-15; read-only; compact summary, no synapse rows)

Source: CAVE server `global.brain-wire-test.org`, datastack `fish1_full`, **materialization version 759** (timestamp 2026-11-14 08:10:01 UTC; it expires 2026-11-16 07:10 UTC, so re-pin a later version to repeat this). Every number below was queried at that one version with `caveclient`, from `somas`, `synapses_axde` and `synapses_axde_label`. Cite Petkova, Januszewski et al. (2025) for any use; nothing here is for public posting beyond this compact note. The raw tables stay in the scratch folder and are not committed.

## The answer

| input | answer | what it means for the Escape model |
|---|---|---|
| **Retinal** | **NO as wired cells** (not annotated). Only an inference is possible, and the test run here does not support it. | Use a stimulus channel. |
| **Tectal** | **NO as wired cells** (no cell-type table names any tectal class). Only an inference is possible, and it was not reachable: no anatomical landmark in the tables. | Use a stimulus channel. |
| Path retina to tectum to Mauthner | **Not demonstrable** from this data. | Do not claim one. |

## What was queried

1. **Access and tables.** `discover` works with the stored token (the data hosts `pcgv3local.` and `local.brain-wire-test.org` also had to be allowed; the server answers 503 for a few minutes at a time, then recovers). `fish1_full` has 9 tables: `somas` (187,052 rows), `somas_distance_to_landmark`, `synapses_axde` (29,474,316), `synapses_axax` (9,539,284), `synapses_axde_label` (tag 1 = inhibitory, 2 = excitatory), `synapses_axde_pre_synapse_id`, `synapses_axde_post_synapse_id`, `synapses_axon_to_dendrite_size`, and relaxin lists (`relaxin_177172_output_080426` and four `rel3a27_output_111326*`, 60 to 105 cells). The `datastackInfo` fields `cell_identification_table`, `proofreading_status_table` and `soma_table` are all null. **The only cell-type column is `somas.cell_type` with values `exc` (26,915), `inh` (14,510) and `na` (145,627), `classification_system` `na` throughout. There is no value that looks retinal, RGC, optic, arborization-field, tectal, periventricular, PVPN, PVIN, pretectal or isthmi.** 6,001 soma rows have root id 0.
2. **Mauthner cells: NOT labelled in the data; identified by position only (an inference, the same one the earlier fish notes made).** The earlier notes (`brain/SUBMARINE_WIP.md`) give the soma positions of the two top-ranked, mirror-paired large cells of the 30-million-row pass at v737 (562.7 / 563.7 um front-back, 157.7 / 159.3 um top-bottom, 304.6 / 222.7 um across). At v759 the `somas` rows at those positions (0.04 um off, soma ids 187053 and 187052) are root ids **864691128610327387 (A)** and **864691128634739649 (B)**, both `cell_type` na. They receive **5,845 and 4,163** synapses (10,008 in all, the same total as the v737 export). Unchanged from the notes: they are CANDIDATES, no table or morphology here confirms them as Mauthner cells, and the 30-million-row pass was NOT re-run.
3. **Inputs at hop 1** (all 10,008 input synapses carry a sign: **8,080 excitatory, 1,928 inhibitory, 0 untagged**):
   * A: 2,039 presynaptic partners; 223 with a soma (1,119 synapses) and 1,816 without (4,726 synapses). B: 1,677 partners; 143 with a soma (516 synapses), 1,534 without (3,647). **81% of the input synapses come from fragments with no soma.** 106 partners feed both candidates (59 with a soma).
   * Soma-bearing partners: 307 distinct cells, 1,635 synapses (1,405 excitatory, 230 inhibitory). Their `cell_type`: 263 `na`, 39 `exc`, 5 `inh`. All lie in the local hindbrain: median 67 um from the candidates' soma, none further than 250 um.
   * No synapse runs between A and B; neither is its own partner.
4. **Retinal, structural test (inference only).** The 300 soma-less partners with the most synapses onto A and B (3,000 of the 8,373 soma-less input synapses; 3,303 soma-less partners in all) were examined through all their own synapses: 19,095 output and 577 input synapses. **85% of their output synapses lie within 100 um of the candidates' soma, none beyond 300 um; 211 of the 300 receive no synapse at all; for the median fragment 90% of its output synapses lie within 21 um of its own centre.** They are short axon pieces around the candidates' dendrites, not long tracts. That does not look like retinal ganglion cell axons arriving by an optic nerve, but it does not exclude them: 5,373 of the 8,373 soma-less input synapses were not examined, and a retinal axon that is cut into pieces by the segmentation would look like this too. Whether the optic nerve or the arborization fields are inside the volume at all was NOT checked.
5. **Tectal.** No table has tectal labels. The anatomical frame was not recoverable: the unit of `somas_distance_to_landmark.tag` and the landmark it measures are undocumented, and no table tells which end is anterior. So no count of tectal cells at hop 1 or hop 2 is given. What was counted: the inputs of the 307 soma-bearing hop-1 partners (hop 2): 88,184 synapses from 43,376 distinct sources, **95% of the synapses from soma-less fragments**, 1,003 distinct sources with a soma (779 of them new, 15 more than 250 um from the candidates, 5 synapses from a candidate itself).
6. **Both together.** Nothing in the data links a retinal class to a tectal class to the candidates, because neither class exists as a label.

## What the Escape model can use from this

* **Wired, from the data:** the two candidates plus their strongest soma-bearing partners with sign. The smallest useful set in the `giant-fiber-circuit.json` size: the 2 candidates plus the top 30 soma-bearing partners by synapses onto them (13 to 52 synapses each, 591 synapses together, signs from `synapses_axde_label`), about 32 cells. The 51 soma partners with at least 10 synapses would be the next size (not built; `vendor/zebrafish/fish1-escape-visual.json` was not written because no circuit file was asked for).
* **Not from the data:** retinal and tectal input. They enter the model as a stimulus channel, not as cells, with nothing in the data to set their number, strength or sign.

## NOT CHECKED

* That A and B are Mauthner cells (position and size only). The pass over all 29,474,316 rows was not repeated.
* Soma-less fragments beyond the top 300; the optic nerve or arborization fields in the volume; any landmark orientation (`somas_distance_to_landmark`); proofreading status (no table names it); the 6,001 soma rows with root id 0; `synapses_axax` (axon-to-axon, not queried); hop 2 signs and per-cell classes; the public Neuroglancer states and the vestibular CATMAID project (not reachable from this environment's network).
* The `fetchFish1Circuit.py` fix on `origin/fish1-fetch-fix` was not needed: the queries above went to `synapses_axde` and looked up the labels by `target_id`, so the server error on the label table's root-id filter was not hit.

Scratch folder (not in git): the `somas`, input, output and hop-2 tables at v759, with the two scripts that made the counts.
