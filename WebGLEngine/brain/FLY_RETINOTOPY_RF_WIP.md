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

**What is NOT derived here:** (a) lattice units to degrees of visual angle (no eye calibration of the lattice was found or derived; if one lattice step is about one ommatidium and an ommatidium is about 5 degrees, a figure from memory that was NOT verified here, the LPLC2 lobula footprint would have an RMS radius near 11 degrees, but nothing in this note rests on that); (b) which axis of the lattice is azimuth and which is elevation, and which end is front or up (the diagonals' physical meaning); (c) whether the lattice is mirrored in visual space between the two sides (the same lattice offsets appear on both sides, which says the lattice is indexed the same way, not what that means in space); (d) which layer prefers which direction of motion (the papers' figure legends carry it; see Part 2 and NOT CHECKED). What Part 2 does add: the paper puts the motion axes at 45 degrees to the horizontal, which matches the diagonal axes found in the data.

## Part 2. What they respond to: published behaviour, READ FROM THE PRIMARY PAPERS (2026-11-15)

Keith supplied the full texts, so the earlier search-summary version of this section is replaced. Read: **Klapoetke et al. 2017**, "Ultra-selective looming detection from radial motion opponency", Nature 551:237 to 241 (HHMI author manuscript, 32 pages: text, methods, Extended Data 1 to 6 legends; the main-figure pages and Extended Data 7 to 10 were not read); **Ache et al. 2019**, "Neural basis for looming size and velocity encoding in the Drosophila giant fiber escape pathway", Current Biology 29:1073 to 1081, doi 10.1016/j.cub.2019.01.079 (the full paper and the STAR Methods, pages 1 to 15 of the 19; the supplement's figures were not read); and, for context, **Morimoto et al. 2020** (eLife 9:e57685, about LC6, not LC4 or LPLC2: used only for the stimulus convention and the eye-map idea). Two PubMed records (31691093, a review of fly motion-direction computation; 28029094, Wu et al. 2016 on the LC types) were supplied as citations only.

**LPLC2 (Klapoetke 2017).**
* About **80 LPLC2 cells** in a population ("a population of ~80 visual projection neurons"), dendrites in the lobula plate, axons onto the lateral dendrite of the Giant Fiber; optogenetic LPLC2 activation depolarises the Giant Fiber rapidly (direct excitatory input), and blocking LPLC2 output reduces the looming jump escape.
* **Anatomy:** each LPLC2 cell's dendrite forms four fields, one in each of the four lobula plate layers, as a **cross of two orthogonal axes with opposite layers' branches opposite each other**; "the direction of maximum outward dendritic spread in each layer is aligned with the directional preference of the T4 and T5 cells terminating in that layer". Cells vary in detail (some bifurcate in the lobula; the layer-3 branches of some cells are much smaller than layer 4).
* **Receptive field:** mapped on a **5 degree grid** with local disk expansions (5 to 20 degrees at 10 degrees/s); neighbouring cells tile visual space with overlap; "**60 degrees as the upper bound for an individual LPLC2's receptive field size**" (it is the D = 60 used in the luminance-matched control equation; dashed circle in Extended Data 4). The responses of the axon-terminal population start within the **first 5 degrees of expansion** (Extended Data 3c to e), and the population peak for 2.5 to 10 degrees/s edge speeds is at disk diameters of roughly 35 to 50 degrees (Extended Data 3e, read off the plot).
* **Tuning:** strong response to **dark looming** (outward dark-edge motion), weak to bright looming, none to receding (contracting) looming, to luminance-matched darkening without motion, or to wide-field translation; population speed tuning is broad from 2.5 up to about 100 degrees/s edge speed and falls at 200 degrees/s (Extended Data 3d). A 10 degree bar expanding gives a uniform response to outward motion at every orientation; a 60 degree bar gives a four-leaf (clover) orientation tuning aligned to the cardinal directions.
* **Mechanism (radial motion opponency):** each arm is excited by outward motion in its layer's direction (the T4/T5 input; T4/T5 are tuned to a broad range of about 90 degrees) and is **inhibited by inward motion** (shown with combined outward and inward stimuli; lobula plate intrinsic cells, tested with LPi4-3, provide directionally selective inhibition); the integration across arms is **nonlinear**: expansion along two arms gives more than the sum of the two arms alone. Wide stimuli reduce the response through motion at the periphery of the field.
* **Directions:** the four cardinal directions measured from LPLC2 cells lie "consistently at **45 degrees offset from the horizontal**" on the stimulus screen; for the layer-4 interneuron LPi4-3 the measured preferred direction was 315 degrees and the null 135 degrees (in the paper's screen convention, which is not defined in the pages read). **This agrees with Part 1:** the two motion axes run along the diagonals of the lattice's own (x, y) axes, so the lattice's x and y are aligned with horizontal and vertical in visual space (up to sign and swap), an inference this note makes and the paper does not.
* **Stimulus geometry in those experiments:** right eye only, 90 degrees of azimuth and elevation coverage; axon-terminal population looming centred at 35 degrees azimuth and 0 elevation; the eye's equator 55 degrees below horizontal (head pitch); r/v looming as in Ache 2019 (below).

**LC4 and the Giant Fiber (Ache 2019).**
* **Synapses (EM, right hemisphere of the FAFB volume):** **55 LC4 and 108 LPLC2 cells** synapse directly onto the Giant Fiber, exclusively on its lateral dendrite, **2,442 LC4 and 1,366 LPLC2 synapses**; LPLC2 synapses lie more distal on that dendrite, LC4 more proximal; only six other visual projection neurons touch the Giant Fiber (1, 3, 4, 6 and 8 synapses); **LPLC2 and LC4 are 99.4% of its direct optic-lobe input**; more than 175 LPLC2-to-LC4 synapses were seen.
* **Cross-check with the male-CNS data of this repository (same questions, different volume):** the right Giant Fiber has **55 LC4 cells (the same 55)**, 2,580 synapses (paper 2,442), 91 LPLC2 cells (paper 108), 2,220 synapses (paper 1,366); the left Giant Fiber 71 LC4 cells (3,782 synapses) and 94 LPLC2 (2,642); the five other visual projection types total 28 synapses, so LC4 and LPLC2 are **99.75%** of the visual projection input (paper 99.4%); LPLC2 onto the LC4 cells that feed the same Giant Fiber is 1,535 synapses (right) and 1,367 (left), far above the paper's lower bound of 175 (which came from a partial reconstruction). Two independent connectomes agree on the structure; the male-CNS counts of LPLC2 synapses are higher than the FAFB ones.
* **Coding:** LC4 is a **velocity (rho-like) encoder** and LPLC2 a **size (eta-like) encoder**. Silencing LPLC2 leaves a Giant Fiber response proportional to angular velocity (a line through the origin, R^2 = 0.66 pooled) and silencing LC4 leaves a size-tuned, non-monotonic response; summed with the right weights they reproduce the control response (R^2 = 0.93 plus or minus 0.03 over r/v; weights 1.1 for LPLC2 and 1.5 for LC4 in the first fit).
* **THE MODEL, with its constants (STAR Methods, "GF Model"):** the Giant Fiber's membrane potential is a weighted sum of four components of the looming disk's angular size theta(t) in degrees (a disk of radius r approaching at speed v: theta = 2 atan(r/(v t)), t < 0 before contact; r/v is the half size to speed ratio, tested at 10, 20, 40 and 80 ms, disk expanding from 10 to 90 degrees, centred at 11 degrees elevation and 50 degrees azimuth):

| component | form | constants |
|---|---|---|
| LC4 (rho, velocity) | V_LC4 = C1 x dtheta/dt(t - d1) | C1 = 0.0002567 (mV per degree/s), d1 = 0.019 s |
| LPLC2 (eta, size) | V_LPLC2 = C2 exp( -(ln theta(t - d2) - ln C3)^2 / (2 C4^2) ) | C2 = 1.7, C3 = 42 (degrees: the size at which it peaks), C4 = 0.52, d2 = 0.019 s |
| inhibition 1 (tonic, size) | V_i1 = C5 + C6 / (1 + exp(-(theta(t - d3) - C7) / C8)) | C5 = -0.53, C6 = 0.59, C7 = 66, C8 = -11, d3 = 0.0375 s |
| inhibition 2 (LC4-dependent) | V_i2 = C9 exp( -(theta(t - d4) - C10)^2 / (2 C11^2) ) | C9 = -0.52, C10 = 26, C11 = 7.8, d4 = 0.011 s |
| sum | V_GF = W_LPLC2 V_LPLC2 + W_LC4 V_LC4 + W_i1 V_i1 + W_i2 V_i2, smoothed over 2.5 ms | W_LPLC2 = 1.45, W_LC4 = 1.62, W_i1 = 2.27, W_i2 = 1 |

  The model peaks at a consistent angular size (42 degrees for the size term), so the Giant Fiber's peak time relative to contact is linear in r/v with a steeper slope for the size term than for the velocity term; both terms together fit the control peak times (Figure 4B) and the Giant Fiber time course (Figure 4C, R^2 0.78 to 0.86 across r/v). The paper deposits the model code in ModelDB (Yale SenseLab model 230400). The two inhibitory components do not come from LC4 or LPLC2 (the first) or only partly (the second); their source cells are not identified.
* **No receptive-field size, position or shape for LC4 was found in the pages read** (LC4's description is in Wu et al. 2016, which was supplied only as a citation record).

## Part 3. The figure pages, read (2026-11-15): what they add

Read in full now: all of Klapoetke's main figures (1 to 5) and Extended Data 1 to 10, and Ache's supplementary figures S1 to S4.

* **The layer-to-direction assignment (Klapoetke Figure 1d,f legend and Figure 5j):** lobula plate **layer 1 prefers front-to-back (FTB), layer 2 back-to-front (BTF), layer 3 up, layer 4 down**; "lateral (L) in the LP corresponds to frontal in the visual field, dorsal (D) to upwards". Each LPLC2 arm extends along its layer's preferred direction. **Joined to the measured offsets of Part 1** (layer 1 toward (-,+), layer 2 toward (+,-), layer 3 toward (+,+), layer 4 toward (-,-) in the lattice's own x and y, the same on both sides): in the lattice, **toward the back is (-1,+1), toward the front (+1,-1), up (+1,+1), down (-1,-1)**, all up to the 45 degree rotation the paper reports (the cardinal axes it measured lie at 45 degrees to the screen horizontal, so these four names are nominal and the real axes are the diagonals of the screen as well as of the lattice). Whether the lattice x axis is closer to the horizontal or to the vertical of the screen, and the handedness on each side, are NOT resolved by this: the paper's layer 4 value (preferred 315 degrees, null 135, in a screen convention not defined in the pages) does not fix it.
* **Position selectivity (Extended Data 10b,c):** a disk expanding from 60 to 80 degrees centred more than 5 degrees from a cell's receptive-field centre gives a small response (raw peaks mostly under 20 against 40 to 120 for centred 5 to 20 degree expansions, paired test p under 0.0001, n = 40 neurons); the response falls to near zero beyond about 30 degrees of offset. An LPLC2 cell is a local looming detector with a sharp centre, much narrower than its 60 degree field bound.
* **Single-cell speed tuning (Extended Data 10d,e, read off the plot):** the peak response grows slowly with r/v: about 45% of the maximum at r/v = 10 ms, 70% at 40, 85% at 80, 95% at 160, 100% at 320 ms. The population (Figure 2e) rises from about 30% at r/v = 10 ms to about 80% from 40 ms on for dark looms, bright looms about 25 to 30% at the slow end.
* **Receptive-field mapping (Figure 3b to d):** neighbouring cells' fields at 50% contours span roughly 20 to 50 degrees azimuth and -10 to +10 elevation in the imaged patch, overlapping; dashed circle 60 degrees in every stimulus diagram.
* **Radial opponency in numbers (Figure 4):** outward cross-motion 100%, the same cross with inward motion about 0%, an outward and an inward arm together about 45%; for bars, 10 degrees about 30%, 20 degrees about 45%, 40 degrees about 25%, 60 degrees about 5% of the looming response (peak ΔF/F, read off the plots): the response falls for wide bars because motion at the field's periphery recruits inhibition (the inhibitory surround is broader than the excitatory field, Figure 5k).
* **Inhibition (Figure 5, Extended Data 6 to 9):** LPi4-3 (lobula plate layers 3 and 4, input from T5d and T4d, directionally selective with preferred 315 and null 135 degrees) depolarised optogenetically reduces LPLC2 responses to weak stimuli (a 10 degree bar) but not to full looming; the controls are clean (Extended Data 8).
* **Ache supplement:** Figure S3B: for disks that appear instantly, the Giant Fiber's peak depolarisation grows with size (about 1.3 mV at 5 degrees to 5 mV at 90 in control), LC4 silencing abolishes this "pop-on" almost completely and LPLC2 silencing reduces it above 20 degrees; Figure S3C: the tonic hyperpolarisation is about 0 to +0.1 mV up to 30 degrees and about -0.55 mV at 90 (exponential fit, R^2 = 0.99). Figure S4B: the best weights are W_LPLC2 = 1.45 and W_LC4 = 1.62 (the optimum on a 100 by 100 grid), and the R^2 curve over W_LPLC2 is broad (peak about 0.8 for r/v 10 to 80). Figure S1: silencing LPLC2 lowers takeoff for TNT at all r/v (p under 0.04) and for Kir only at r/v = 80 (the Kir control flies had unusually low takeoff).
* **A tension in the published model constants (found while implementing it):** V_i1 is about -0.47 mV at 90 degrees, consistent with the measured -0.55; the printed weight W_i1 = 2.27 would make the modelled tonic hyperpolarisation about -1.07 mV, twice that. Implemented as printed; the header of `brain/flyGfLoomModel.mjs` records it; the original ModelDB code would settle it.

### The model as code

`brain/flyGfLoomModel.mjs` (pure) with its gate `brain/flyGfLoomModel-selfcheck.mjs` (about 2 s): the four components, the sum, the smoothing, the looming and constant-velocity stimuli, peak times. The gate checks every constant against the paper, the stimulus geometry (theta = 90 degrees at t = -r/v, 42 at -r/v / tan 21; the angular velocity against a finite difference), LC4's linearity, LPLC2's peak (C2 at 42 degrees), symmetry and width in ln theta, the sigmoid's three anchor values, the delays, the weighted sum and silencing, and the Figure 4B logic: pure size input peaks at -r/v / tan(21) + d2 and pure velocity input at -r/v + d1 (less the half smoothing window), the size input's slope against r/v (-2.605) steeper than the velocity input's (-1), and **the full model's peak between the two predictions at r/v 10, 20, 40, 80 ms (-2, -30, -81, -184 ms of contact), close to the size prediction at the slow end, which is what the weights give**. 44 mutants: 41 red, 3 equivalent and argued, one real survivor closed (the Gaussian's width). NOT compared with the paper's plotted traces or the ModelDB code.

## What a model can take from this today

* **Position:** every LC4 and LPLC2 cell has a lattice position and footprint; the two populations tile the lattice about fourfold; a stimulus given in lattice coordinates maps onto the cells with no assumption about angles. The paper's 60 degree upper bound on an LPLC2 receptive field and the footprints here (about 7 to 14 columns across) are compatible with a scale of roughly 4 to 9 degrees per column, which brackets the ommatidial spacing of about 5 degrees (from memory, not verified) but is not a calibration.
* **LPLC2 as four displaced subunits** (centre plus four sub-fields at the measured offsets, 1.6 to 2.4 lattice units, in two opposite pairs at right angles) with the published rule: excited by outward motion along each arm's direction, inhibited by inward motion, nonlinearly summed. The layer-to-direction assignment is still open (see NOT CHECKED).
* **The Giant Fiber as the published sum** of an LPLC2 size term and an LC4 velocity term plus two inhibitory terms, with every constant above. This is a fitted description of the Giant Fiber's input in the paper's stimulus regime (one looming centre, 90 degree range), not a mechanism of the cells.

## NOT CHECKED

* LC4's receptive field and tuning (not in Klapoetke or Ache; Wu et al. 2016, eLife 5:e21022, PMC5293491, describes the 22 LC types and is the source; supplied only as a citation record).
* The lattice's calibration to visual angle (only a compatibility range) and which lattice axis is closer to azimuth (see Part 3); the left-right handedness.
* Klapoetke's Supplementary Videos and Supplementary Tables, and the main-text claims about Figure 5k's receptive-field images (the pixel data); the values quoted from plots in Part 3 are read off the figures, not tabulated, and are approximate.
* The original MATLAB model (ModelDB, Yale SenseLab 230400) and the W_i1 tension; whether the model carries to other loom positions (it has no spatial term: the Giant Fiber was recorded for a disk centred at 11 degrees elevation and 50 degrees azimuth).
* Layer sub-field offsets for all 185 LPLC2 cells (measured for 61); proofreading status; the sources of the two inhibitory components.

## Part 4. Klapoetke et al. 2017's stimulus definitions, read from the text (2026-11-26)

Read: the HHMI author manuscript, https://pmc.ncbi.nlm.nih.gov/articles/PMC7457385 (PubMed 29120418, doi 10.1038/nature24626): the Results, the Figure 3 and 4 legends, and the Methods ("Visual stimulation", "Directional tuning", "Calculation of fluorescence", "Statistics"). Quoted where the text gives the value; everything else is ONLY in the figure images and is marked as this round's assumption below.

**From the text (quoted):**
* Bars: "Bar stimuli have 10° fixed width and 20°/s edge speed unless otherwise specified" (Figure 4 legend). Figure 3e,f: "Directional tuning with 10° (e) or 60° (f) 1D bar expansion".
* The cross: "LPLC2 neurons responded to the outward motion of expanding bars in a cross formation and did not respond to inward bar motion (Fig. 4a,b)"; "Single-cell cross stimuli contained a static 10° square at the receptive field center throughout the entire stimulus duration" (Methods).
* Single arms and two arms: "Outward edge motion along single arms generated detectable, but small responses (Fig. 4c i,ii,d), whereas expansion along two arms (Fig. 4c iii) produced responses greater than the summed responses to motion along two individual arms (Fig. 4d and Extended Data Fig. 5a,b)".
* Inhibition: "We combined outward motion along one cardinal axis with inward motion along the orthogonal axis" (Figure 4c v).
* Orientation: "The measured cardinal axis directions (consistently at 45° offset from the horizontal) were used to orient single-cell visual stimuli"; directional tuning by "symmetric bar expansions (edge speed 20°/s) centered on each neuron's receptive field, rotating the axis in 15° increments". Figure 4e,f: "Effects of bar width on expansion between cardinal axes".
* Contrast and timing: background 50 %, foreground dark 0 % or bright 100 %; "All stimuli included a 2 second pre- and post-motion holding window"; the right eye only, 180 Hz, a coverage of 90°.
* The reference: single axons were normalized "by the peak response of the axon to a dark disc expansion" (5° to 60° at 10°/s); a peak is "a 300 ms window around the maximum fluorescence response". n = 10 neurons, N = 7 flies.

**Only in the figure images (not quotable, so NOT used as numbers):** the length the arms reach, the wide bar's width in Figure 4e,f, every response percentage (the values in Part 2 were read off the plots and are not a test), and the sizes of the nonlinear-summation effect.

**Correction to Part 2:** its "one outward and one inward arm together about 45 %" was read off Figure 4c-d without the panel's normalization, which the text does not give; it is not used as a number anywhere below.

## Part 5. THE LPLC2 SUBUNIT ROUND, REGISTERED (2026-11-26, before its code and before any stimulus is run)

Keith, 2026-11-26: "Let's do ... item 7" -- backlog `fly-lplc2-subunit-model`.

**THE MODEL (FIXED NOW).** One LPLC2 cell on a 90 x 90 frame at 1 degree a pixel (the paper's 90 degree coverage), its receptive field centred, the frame's axes taken as the cell's cardinal axes (the paper rotates its stimuli to the cell's axes; the model is drawn in them).
* **Layer 1:** `brain/flyEmdLplc2Gf.mjs`'s motion detectors, unchanged (its `createModel` with `keepMaps`: Zhao et al. 2023's high-pass, ON/OFF rectifiers and low-pass delays, 10 ms steps), giving each frame's horizontal and vertical local motion.
* **Four subunits:** disks of radius 15 degrees centred 10 degrees from the cell's centre along +x, -x, +y and -y (two lattice units at the 5 degrees a column the code already assumes, the middle of Part 1's measured 1.6 to 2.4; 10 + 15 = 25 degrees, inside the paper's 60 degree upper bound). Each subunit's drive is the motion OUTWARD along its own axis summed over its disk, LESS the motion inward along it (the published opponency: one weight for both signs).
* **The cell:** R(t) = [ sum of the four drives ]+ squared -- the drives summed BEFORE the rectification (so inward motion on one axis can cut what another axis gives), then squared (the published "nonlinear integration"; squaring is the simplest form that makes two arms more than the sum of each). No threshold, nothing fitted. A stimulus's response is the largest 300 ms mean of R (the paper's peak window).

**THE STIMULI (FIXED NOW; dark 0 on a 0.5 background, each with a 2 s hold before and after the motion, edges drawn with fractional coverage).** The text's values where it has them; ASSUMED where only the figure does: the arms and bars run from the centre square's edge (5 degrees) to 30 degrees from the centre (the 60 degree bound).
* S1 the outward cross (the static 10 degree centre square, four 10 degree wide arms growing at 20 degrees/s); S2 the inward cross (S1 in reverse);
* S3r, S3l one arm outward (+x alone, -x alone, the centre square kept); S4 one axis outward (+x and -x together);
* S5 S4 with the orthogonal axis's two arms moving INWARD at the same time;
* S6 wide-field translation: 10 degree dark bars every 20 degrees over the whole frame moving +x at 20 degrees/s;
* S7 the reference, a dark disc growing from 5 to 60 degrees across at 10 degrees/s edge speed; S8 the same receding;
* S9 a 10 degree wide bar expanding symmetrically along the DIAGONAL (between the cardinal axes) at 20 degrees/s; S10 the same 60 degrees wide.

**THE PREDICTIONS (registered; each passes or fails, the model is deterministic and run ONCE).**
* P1: S1 > 0 and S2 below 10 % of S1 (outward cross, not inward).
* P2: S3r > 0 and S3l > 0 (single arms "detectable"), each below S4.
* P3: S4 > S3r + S3l (two arms more than the sum of each alone).
* P4: S5 < S4 (inward motion on the orthogonal axis cuts the response).
* P5: S6 below 10 % of S1 (no response to wide-field translation).
* P6: S7 > 0 and S8 below 10 % of S7 (looming, not receding).
* P7: S10 < S9 (between the cardinal axes a 60 degree bar is below a 10 degree bar).

**THE VERDICT.** SUPPORTED iff all seven hold; otherwise NOT SUPPORTED, naming each failure. Reported beside it, not in the verdict: the same ten stimuli through `flyEmdLplc2Gf.mjs`'s own multiplicative cross unit (Zhao et al.), whose product of four arms gives zero for any single arm -- the case the text calls "detectable".

**EXPECTATION.** P1, P3, P5 and P6 hold by the model's construction about 85 percent each (the opponent sum cancels uniform motion; the square makes two arms more than one); P2 is the riskiest -- one arm's 15 degree disk sees the moving edge only near its centre, about 65 percent; P7 about 60 percent (a wide bar's long edges move across the subunits, inhibiting). SUPPORTED overall about 35 percent.

## Part 6. THE LPLC2 SUBUNIT ROUND, RESULT (2026-11-26; `brain/lplc2SubunitsRun.json`, run once, committed unread at `555ee3dd7`, then read ONCE)

**THE VERDICT (registered): NOT SUPPORTED (P7).** Six of the seven predictions hold; the wide-bar prediction fails, and not by a hair.

| | response, % of the outward cross S1 | holds? |
|---|---|---|
| P1 outward cross S1 / inward cross S2 | 100 / 0.0 | yes |
| P2 one arm S3r, S3l (each below S4) | 6.3, 6.2 | yes |
| P3 one axis S4 against S3r + S3l | 25.0 against 12.5 | yes |
| P4 S4 with the orthogonal axis inward (S5) | 15.1 (below 25.0) | yes |
| P5 wide-field translation S6 | 0.0 | yes |
| P6 looming disc S7 / receding S8 | 406 / 0.0 | yes |
| **P7 diagonal bar: 60 degrees wide (S10) against 10 (S9)** | **510 against 56** | **no** |

**Reported beside it (not in the verdict):** Zhao et al.'s multiplicative cross unit (`flyEmdLplc2Gf.mjs`, its own rule, a 60 degree field) on the same frames is active on 152 frames of the outward cross and 250 of the looming disc, and on NONE of the single-arm, one-axis or mixed stimuli (S3r, S3l, S4, S5: 0 frames) -- where the paper says single arms give "detectable, but small responses". The subunit model gets that part right and the product of four arms cannot.

**What it says.**
* Radial opponency summed before a squaring nonlinearity reproduces every qualitative claim the text makes about the cross: outward not inward, single arms small but there, two arms more than the sum, inward motion on the other axis subtracting, no response to translation, looming not receding.
* It does NOT reproduce the orientation tuning: a 60 degree bar expanding between the cardinal axes drives it nine times harder than a 10 degree one, where the paper shows the wide bar's response falling there (the clover of Figure 3f and Figure 4e,f). The reason is visible in the construction: a wide bar's expanding ends move diagonally outward, which has an outward component along BOTH axes in all four of these large, round, overlapping subunits, so everything it shows excites. Nothing in this model is narrow or oriented enough to tell a diagonal expansion from a radial one.
* The disc (S7) driving the cell four times the cross is not a prediction and not compared with the paper (the text normalizes single cells to the disc, so the paper's cross is below 100 % of it, which matches in direction only).

**What it does not say.** Nothing about the numbers in Figure 4 (only in the images); nothing about speed tuning or the population; a single cell drawn in its own cardinal axes, not the retinotopic population of Part 1.

**Status: round CLOSED.** The backlog entry `fly-lplc2-subunit-model` is closed; the next question (an oriented subunit) is entered as `fly-lplc2-oriented-arms`, to be registered before it is built.

## Part 7. THE ORIENTED-ARMS ROUND, REGISTERED (2026-11-26, before its code and before any stimulus is run)

Keith, 2026-11-26: "Yes, let's work through those items" -- backlog `fly-lplc2-oriented-arms`.

**WHY THIS CHANGE.** Part 6's failure is in the arms' DIRECTION tuning, not their shape: a 60 degree bar expanding along the diagonal has ends moving at 45 degrees to every arm, and each arm takes the plain x or y component of the local motion -- cos 45 = 0.71 of it -- on all four arms; the same bar along a cardinal axis drives two arms at full strength. Narrower arms would not change that (the bar's ends cross all four). Part 2 records T4/T5 as tuned over "a broad range of about 90 degrees"; read as a half maximum at 45 degrees off the preferred direction, that is a squared cosine, not a cosine.

**THE MODEL (FIXED NOW): Part 5's, with ONE change.** At each pixel the local motion m = (dh, dv) drives an arm along its outward axis u by |m| times s(cos theta), theta the angle between m and u, s(c) = c |c| (a SIGNED squared cosine: half the drive at 45 degrees, none at 90, the same inhibition mirrored for inward motion), in place of Part 5's plain component (|m| cos theta). Everything else is Part 5's: the four 15 degree disks at 10 degrees, the sum before the rectification, the square, the 300 ms peak, layer 1 unchanged.

**THE STIMULI.** Part 5's S1 to S10, unchanged, and ONE new one: **S11**, Part 5's S10 (the 60 degree wide bar, expanding symmetrically at 20 degrees/s from a half-length of 5 to 30) laid along the cell's +x axis (a cardinal axis) instead of the diagonal.

**THE PREDICTIONS (registered; the model is deterministic and run ONCE).** P1 to P7 as Part 5 wrote them, and:
* **P8 (the clover):** S11 > S10 -- the wide bar drives the cell more along a cardinal axis than between them.

**THE VERDICT.** SUPPORTED iff all eight hold; otherwise NOT SUPPORTED, naming each failure. Reported, not in the verdict: Part 5's model on S11 (whether it had the clover at all), and Zhao et al.'s unit on S11.

**EXPECTATION.** P7 and P8 are the question: four arms at half drive against two at full is a near tie by the arithmetic above, and layer 1's detectors are separable x and y, so a diagonal edge's local vector is not exactly diagonal -- P7 and P8 hold about 40 percent; P1 to P6 should still hold (the change only weakens off-axis drive) about 85 percent; SUPPORTED about 35.

## Part 8. THE ORIENTED-ARMS ROUND, RESULT (2026-11-26; `brain/lplc2OrientedRun.json`, run once, committed unread at `507de50a8`, then read ONCE)

**THE VERDICT (registered): NOT SUPPORTED (P7, P8).** P1 to P6 hold as in Part 6 (the cross results are unchanged to a tenth of a percent: they are motion along the axes, which both tunings read the same).

| | Part 5 (component) | Part 7 (signed cos^2) |
|---|---|---|
| S9, the 10 degree bar on the diagonal | 56 % of S1 | 29 % |
| S10, the 60 degree bar on the diagonal | 510 % | 255 % |
| S11, the 60 degree bar on a cardinal axis | 221.5 % (reported) | 221.5 % |
| P7 (S10 < S9) / P8 (S11 > S10) | fails / fails | fails / fails |

**Reported:** Zhao et al.'s unit is active on no frame of S11.

**What it says.**
* The squared cosine does what Part 7 said it would to the diagonal: it halves the wide bar's drive there (510 to 255 %), and leaves axis-aligned motion alone. It is not enough for the clover -- four arms at half drive still edge out two at full (255 against 221.5 %), the near tie Part 7's arithmetic named.
* The larger miss is the one both rounds share: **a 60 degree bar drives this cell 7 to 9 times harder than a 10 degree bar, in either orientation**, where the paper's wide bars give LESS (Figure 3f's clover is a fall between the axes; Part 2 records "wide stimuli reduce the response through motion at the periphery of the field"). The model has no periphery: its four subunits reach 25 degrees and nothing outside them inhibits. The direction tuning was not the missing piece; a suppressive surround is the next candidate.

**Status: round CLOSED.** Backlog `fly-lplc2-oriented-arms` is closed; the next question is entered as `fly-lplc2-wide-suppression`. The population round (`fly-lplc2-population`) waits on it: the single cell is not yet settled, which that entry required.

## Part 9. THE WIDE-SUPPRESSION ROUND, REGISTERED (2026-11-26, before its code and before any stimulus is run)

Keith, 2026-11-26: "Yes, let's work through those items" -- the LPLC2 population (`fly-lplc2-population`) was to wait until the single cell is settled, and Part 8 says it is not; this round is the step that entry's condition asks for (backlog `fly-lplc2-wide-suppression`).

**WHY THIS CHANGE.** Parts 6 and 8: a 60 degree bar drives the cell 7 to 9 times a 10 degree bar in either orientation, where the paper's wide bars give less; Part 2 records "wide stimuli reduce the response through motion at the periphery of the field". A wide bar's expanding ends reach far off the cell's axes, where none of the four subunit disks lies; a narrow bar's ends stay near the axes, inside them.

**THE MODEL (FIXED NOW): Part 7's (the signed squared cosine), with ONE change.** A **surround**: every pixel within 30 degrees of the cell's centre (the paper's 60 degree field) that lies in NONE of the four subunit disks. The cell is R = [ sum of the four drives - w x E ]+ squared, E the surround's motion energy (the sum of |m| = hypot(dh, dv) over its pixels, of any direction), **w = 1** (the surround's motion counts as much as an arm's; one weight, fixed here). Everything else is Part 7's.

**THE STIMULI AND PREDICTIONS.** Part 7's S1 to S11 and P1 to P8, unchanged, and run ONCE. Reported, not in the verdict: each stimulus's surround energy at the response's peak window, and the Part 7 model's numbers beside them.

**THE VERDICT.** SUPPORTED iff all eight hold; otherwise NOT SUPPORTED, naming each failure.

**EXPECTATION.** P7 and P8 are the question and the surround acts on both: a wide bar's off-axis ends land in it. The risk is the rest: the cross's arm tips (25 to 30 degrees) and the looming disc's edge past about 21 degrees on the diagonals also land in it, so P1 and P6 could fall, and with w = 1 the surround may silence the wide bars entirely (S10 and S11 both 0, which fails P8). P7 holds about 70 percent, P8 about 35, P1 to P6 about 70 together; SUPPORTED about 25 percent.
