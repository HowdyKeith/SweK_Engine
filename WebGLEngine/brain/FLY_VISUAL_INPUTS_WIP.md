# Fly: are the visual inputs to the Giant Fiber in the male-cns data as wired cells? (2026-11-15; read-only; compact summary, no raw tables)

Source: Neuprint `https://neuprint.janelia.org`, dataset **`male-cns:v1.0`** (a fixed release; the server reports no timestamp for it), read with Cypher through `/api/custom/custom`. The token never appeared in chat, a command line or a file: it is a network secret of the environment and the session's proxy supplies it. License as the server declares it, CC-BY-4.0 (not independently re-confirmed); cite Janelia FlyEM, male-cns, via Neuprint. This is the sequel to `brain/FISH_VISUAL_INPUTS_WIP.md`, which found the zebrafish retinal and tectal inputs NOT to be wired cells.

## The answer

| question | answer |
|---|---|
| Are the Giant Fibers identified in the data? | **YES, by annotation:** type `DNp01`, instances `DNp01(GF)_R` (body 10001) and `DNp01(GF)_L` (body 10010). Their status is "Traced, Roughly traced". (The fish Mauthner cells were found by position only.) |
| Is there visual input to them as wired cells? | **YES.** Visual projection neurons give **11,252 of the 36,781 input synapses (31%)** of the two Giant Fibers, through 321 cells: **LC4 (126 cells, 6,362 synapses, 17.3%)** and **LPLC2 (185 cells, 4,862 synapses, 13.2%)**, plus five types of 1 to 20 synapses. |
| Sign? | **All 11,252 are from cells the server's predictions call cholinergic** (`celltypePredictedNt` acetylcholine, every one of the 321 cells; none gabaergic or glutamatergic). Acetylcholine as excitatory is the usual reading and is an **inference**, not a measurement of the synapse. |
| Does the chain run back to the photoreceptors as cells? | **YES in the data**, stage by stage (below). The optic lobes and the photoreceptors are inside the dataset as annotated cells. |
| What does the model take from this? | A real, signed, ipsilateral looming input: use the LC4 and LPLC2 population (or a subset, see below) as the visual layer, not a stimulus channel. What stays an assumption is the mapping from a stimulus to what an LC4 or LPLC2 cell sees (its receptive field), which this note does not derive. |

## What was queried (all at `male-cns:v1.0`)

1. **The Giant Fiber input, hop 1** (1,465 edges, 1,271 presynaptic cells, 36,781 synapses; right Giant Fiber 16,054 from 697 cells, left 20,727 from 768): by superclass `cb_intrinsic` 18,914 (the largest, mixed neurotransmitters: acetylcholine 7,850, gaba 9,232, glutamate 1,706), `visual_projection` 11,252, `descending_neuron` 2,829, `ascending_neuron` 1,578, `vnc_intrinsic` 1,274, `cb_sensory` 709, the rest under 100. 26 edges (164 synapses) come from cells with no type. Every cell has a `predictedNt` and a `consensusNt`, so no input is unsigned.
2. **Laterality.** Every LC4 and LPLC2 synapse onto a Giant Fiber is ipsilateral: the right Giant Fiber receives only from right-side cells (LC4 2,580, LPLC2 2,220 synapses), the left only from left-side cells (LC4 3,782, LPLC2 2,642).
3. **The population, not a few cells.** LC4 cells give a median 51 synapses each onto their Giant Fiber (maximum 86), LPLC2 a median 27 (maximum 64): the Giant Fiber pools nearly all of its 311 looming cells. **The 20 strongest of each type (40 cells) carry only 21% of the LC4/LPLC2 input (6.5% of all the Giant Fiber's input); the strongest 50 of each (100 cells) carry 47%.** A few-dozen cell model is a thin sample of the pooling and needs its weights scaled for that.
4. **Hop 2: what feeds the 311 LC4 and LPLC2 cells** (166,663 edges, 659,966 synapses, 41,636 presynaptic cells): optic-lobe intrinsic cells 522,714 (79%), visual projection neurons 87,488 (13%; LPLC2 onto LPLC2 is the largest single type, 49,080), central-brain intrinsic 23,184, visual centrifugal 23,108. The strongest optic-lobe types: T2 (46,366), TmY3 (45,917), Tm4 (38,892), Tm5Y (29,372), the motion cells T5a to d and T4a to d (about 120,000 together), Tm2, Tm3, Tm20, Tm37.
5. **Hop 3, aggregated by type on the server** (28,198,329 synapses into the 41,636 hop-2 cells): the lamina cells **L1 to L5, C2, C3 and Lawf1/2 are present** (L2 420,473, L5 277,320, L4 174,926, L1 146,801, L3 134,533 synapses); the photoreceptors **R7 and R8 (all subtypes) appear at this hop** (43,824 synapses, 0.16%: they reach the medulla's Tm and Dm cells directly). R1 to R6 are the next stage out: on a sample of 200 R1-R6 cells their strongest targets are lamina L1 (5,306 synapses from 190 of the 200), L2 (5,255 from 184) and L3 (943 from 168), as expected.
6. So **the chain photoreceptor (R1-R8) to lamina (L1-L5) to medulla (Mi, Tm, TmY) and motion cells (T4/T5) to lobula columnar cells (LC4, LPLC2) to the Giant Fiber exists in the data as annotated, signed-by-prediction cells.** Counts at each stage above; the cell counts at hop 3 are not stated because the batch aggregation counts a presynaptic cell once per batch.

## The circuit file

`vendor/male-cns/giant-fiber-visual-circuit.json`, built by `tools/maleCnsVisualCircuit.py` (read-only, no token handling, not gated): **42 neurons** (the two Giant Fibers and, per Giant Fiber, its 10 strongest LC4 and 10 strongest LPLC2 cells), **369 edges, 3,894 synapses** (2,357 onto the Giant Fibers, 1,537 among the LC cells, 12 from a Giant Fiber), every cell cholinergic by prediction, every LC to Giant Fiber edge ipsilateral. The shape follows `giant-fiber-circuit.json` (`neurons`, `edges` as `[from, to, weight]`) with side, superclass and the predicted neurotransmitters on each neuron; **no skeletons** (`--skeletons` fetches them; not run: it makes the file megabytes). The LC to LC edges are real and matter: LC4 to LC4 (119 edges) and LPLC2 to LPLC2 (176 edges) are lateral connections inside each population. The rule is the 10 strongest by synapses with the lower body id first on a tie; to use the whole population run it with `--per-side-type 100` (311 LC cells).

## What this gives the Escape model, and what it does not

* **Gives:** a wired, ipsilateral, cholinergic looming input of two cell types with real synapse counts onto a Giant Fiber that the data itself labels; the lateral wiring inside each type; and the stages behind them if the model ever wants the optic lobe.
* **Does not give:** (a) what stimulus makes an LC4 or LPLC2 cell fire (looming selectivity is from the literature, not checked here) and where each cell looks (its position in the visual field: retinotopy was not derived, only the cells and counts); (b) the sign of the synapse, only the predicted neurotransmitter of the cell; (c) the Giant Fiber's output side, which the existing `giant-fiber-circuit.json` (GFC1 to 4) covers; (d) an escape behaviour.

## NOT CHECKED

* Looming selectivity and receptive fields of LC4 and LPLC2 (what the model's input should be); retinotopic position of each cell (the skeletons were not fetched).
* Whether the Giant Fiber's input synapses are excitatory (neurotransmitter prediction only); how confident the predictions are (`predictedNtConfidence` was not read).
* Proofreading status beyond the server's own `status` (the Giant Fibers are "Roughly traced"; the LC cells' status was not tabulated).
* Hop 3 per-cell counts; R1 to R6 beyond the 200-cell sample; the 1,271 hop-1 partners other than the visual projection neurons (cb_intrinsic is 51% of the input and was not typed in detail).
* The token's scope beyond this dataset; the `neuprint.janelia.org` host stays on the environment's allow-list until removed.
