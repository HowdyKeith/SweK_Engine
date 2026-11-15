# Fly: where LC4 and LPLC2 look (retinotopy from the data) and what they respond to (published behaviour) (2026-11-15; read-only)

Sequel to `brain/FLY_VISUAL_INPUTS_WIP.md`. Data: Neuprint `male-cns:v1.0` (fixed release), CC-BY-4.0 as the server declares it. The token stayed in the environment's proxy. Files: `vendor/male-cns/giant-fiber-visual-retinotopy.json` (made by `tools/maleCnsRetinotopy.py`, read-only, not gated), 68 kB, one record per cell.

## Part 1. Position, from the data

**What the data carries.** The lobula (LO), lobula plate (LOP) and medulla are annotated with a column lattice: ROIs named `LO_R_col_x_y`, `LOP_L_col_x_y`, and so on, and every neuron's `roiInfo` gives its synapse counts per column. For each of the 311 LC4 and LPLC2 cells that synapse onto a Giant Fiber the file holds the centroid, RMS radius and column count of its postsynaptic sites in the lobula (and, for the 185 LPLC2 cells, in the lobula plate), **in lattice units**.

**The lattice is a real retinotopic frame (checked):**
* For LPLC2, the lobula centroid and the lobula-plate centroid of the same cell agree almost exactly: correlation 1.00 on both axes over 185 cells, median offset 0.8 columns. Two different neuropils, one coordinate frame.
* The 311 cells' centroids cover the whole lattice (x 4 to 36, y 3.5 to 36), the same on both sides.
* **Each lattice column is sampled by about 4 cells of each type** (median 4, 10th percentile 2, maximum 8 to 9), on both the right and the left, in LC4 (55 right cells, 71 left) and LPLC2 (91 right, 94 left): a dense, even tiling with fourfold overlap.

**Field size, in lattice units (RMS radius of the postsynaptic footprint):** LC4 2.3 (major axis 2.3, minor 1.4; 52 to 63 columns); LPLC2 in the lobula 2.2 (33 to 36 columns), in the lobula plate 3.4 (59 to 65 columns). These are dendritic footprints, not measured receptive fields.

**LPLC2's four lobula-plate sub-fields, measured per synapse (61 cells: 31 right, 30 left).** Each synapse carries its LOP layer and its column, so the centroid of the postsynaptic sites in layers 1 to 4 can be taken as an offset from the cell's own centroid. Mean offsets in lattice units (x, y), right cells then left cells:

| layer | right (31 cells) | left (27 to 30 cells) |
|---|---|---|
| 1 | (-1.38, +1.37) | (-1.28, +1.30) |
| 2 | (+0.96, -1.26) | (+0.79, -1.33) |
| 3 | (+1.48, +1.43) | (+1.10, +1.19) |
| 4 | (-1.75, -1.61) | (-1.43, -1.37) |

* **Layers 1 and 2 are opposite (cosine -0.99 right, -0.97 left), layers 3 and 4 are opposite (-1.00, -1.00), and the two axes are perpendicular (cosines between -0.29 and +0.23, mostly under 0.1).** In the lattice's own (x, y) axes the two axes run along the diagonals. Per layer, 90 to 100% of cells point within 60 degrees of the mean (one layer at 75% in the first 24-cell sample).
* Sub-field RMS radii 2.2 to 3.1 lattice units; offsets from the centre 1.6 to 2.4.
* This is the geometry the published description of LPLC2 predicts (below), seen in the data without being put in: four sub-fields in four layers, displaced from the cell's centre in four directions that form two opposite pairs at a right angle.

**What is NOT derived here:** (a) lattice units to degrees of visual angle (no eye calibration of the lattice was found or derived; if one lattice step is about one ommatidium and an ommatidium is about 5 degrees, a figure from memory that was NOT verified here, the LPLC2 lobula footprint would have an RMS radius near 11 degrees, but nothing in this note rests on that); (b) which axis of the lattice is azimuth and which is elevation, and which end is front or up (the diagonals' physical meaning); (c) whether the lattice is mirrored in visual space between the two sides (the same lattice offsets appear on both sides, which says the lattice is indexed the same way, not what that means in space); (d) which layer prefers which direction of motion (the published layer-to-direction assignment was not read).

## Part 2. What they respond to: published behaviour

**Read honestly: the primary texts could not be opened from this session.** The paper hosts (`pmc.ncbi.nlm.nih.gov`, `elifesciences.org`) were added to the environment's allow-list but the fetch tool still could not resolve them, and a direct download was refused by the safety check, which I did not work around. What follows is what several web searches returned (search-result summaries, each with its link), **not figures read from the papers**. Treat every statement as a lead to confirm in the paper before it is used as a model parameter.

* **LPLC2: Klapoetke et al. 2017, "Ultra-selective looming detection from radial motion opponency", Nature** ([PubMed 29120418](https://pubmed.ncbi.nlm.nih.gov/29120418/)). Per the abstract and the summaries: LPLC2 is an "ultra-selective" looming detector whose selectivity comes from radial motion opponency; it responds to outward motion emanating from the centre of its receptive field; each cell's dendrites form **four separate fields, one in each of the four lobula plate layers**, matching the four T4/T5 preferred directions, and the dendritic extensions align with those directions; it responds strongly to dark looming at all speeds measured, slightly to bright looming, and not to receding looming, to luminance-matched darkening without motion, or to wide-field motion that drives T4/T5; its axons go to the Giant Fibers, and silencing LPLC2 reduces the looming jump escape (the searches also return that activating it drives jumping). This matches Part 1.
* **LC4 and LPLC2 together: Ache et al. 2019, Current Biology 29(6):1073 to 1081** ("Neural basis for looming size and velocity encoding in the Drosophila giant fiber escape pathway", [Drexel record](https://researchdiscovery.drexel.edu/esploro/outputs/journalArticle/Neural-Basis-for-Looming-Size-and/991019168481004721)). Per the summaries: the Giant Fiber pathway splits looming into two components, **LC4 supplying velocity (a linear function of angular velocity) and LPLC2 supplying size (a Gaussian function of angular size)**; both synapse directly onto the Giant Fiber in an EM volume. The searches returned no LC4 receptive-field description at all.
* **Related, found and NOT read:** "Spatial readout of visual looming in the central brain of Drosophila" ([eLife 57685](https://elifesciences.org/articles/57685)); "Shallow neural networks trained to detect collisions recover features of visual loom-selective neurons" ([eLife 72067](https://elifesciences.org/articles/72067)), a modelling paper on LPLC2-like units; and the optic-lobe inventory the column lattice comes from, Nern et al. 2025, Nature 641:1225 to 1237 ([listing](https://ideas.repec.org/a/nat/nature/v641y2025i8065d10.1038_s41586-025-08746-0.html)), whose supplementary code is the Reiser lab's `male-drosophila-visual-system-connectome` repository (its public pages show per-cell-type HTML files and no column-to-visual-field file).
* **No receptive-field size in degrees was found for either type** in what was returned. Do not use a number for it from this note.

## What a model can take from this today

* **Position:** every LC4 and LPLC2 cell has a lattice position and footprint; the two populations tile the lattice about fourfold; a stimulus given in lattice coordinates can be mapped onto the cells without any assumption about angles.
* **LPLC2 as four displaced subunits:** a cell is its centre plus four sub-fields at the measured offsets (each about 1.6 to 2.4 lattice units from the centre, sub-field RMS radius 2.2 to 3.1), the pairs 1 and 2 and 3 and 4 opposite. The published rule (outward motion centred on the cell, opponent to inward) is what turns this into a looming detector; implementing it needs the T4/T5 direction signal for each layer, which is a model choice (the layer-to-direction assignment is the open item).
* **LC4 as a velocity-driven unit and LPLC2 as a size-driven unit** at the Giant Fiber, from the search summaries of Ache 2019, to be confirmed against the paper before any function shape is fitted.

## NOT CHECKED

* The papers' own numbers (receptive-field sizes, tuning curves, the Gaussian and linear function parameters). The first thing to do with access to the papers.
* The lattice's calibration to visual angle and orientation; the layer-to-direction assignment; the left-right mirroring.
* LC4's lobula layer distribution (the per-layer postsynaptic counts came back empty in this ROI table and were not pursued) and any direction or shape structure beyond its mild elongation (major 2.3, minor 1.4).
* Layer sub-field offsets for all 185 LPLC2 cells (measured for 61); proofreading status of these cells.
