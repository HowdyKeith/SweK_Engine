# Prompt for a new session: are the retinal and tectal inputs to the Mauthner (escape) circuit in the Fish1 CAVE data, and can the Escape task use them?

(Written 2026-11-15 to be pasted as the first message of a fresh session on the repository `HowdyKeith/SweK_Engine`, branch `claude/fish-vestibular-helper`, folder `WebGLEngine/`. It stands alone.)

---

## The task

The Escape task (the larval zebrafish's Mauthner-cell escape circuit, being built in another chat) wants three things: a trainer test set that changes or is larger (the fix for the "luck" problem), memory between ticks, and **the visual inputs the real circuit has**. This session answers one question about the third, from the real connectome: **can the Escape model use BOTH retinal and tectal inputs, as wired cells from the Fish1 data, and if so which cells, how many synapses, with what sign?** If one of the two is not in the data as wired cells, say so and say what it would have to be instead (for example a stimulus channel). Read-only: nothing is written to the server.

## Access (read this first)

* The Fish1 CAVE server is `https://global.brain-wire-test.org`, datastack `fish1_full` (the repo tools say so). The host has been added to this environment's network allow-list. A personal CAVE token has been stored by Keith in the environment's settings (a network secret for that host, or the environment variable `CAVE_TOKEN`). **Never ask for the token in chat, never put it on a command line, never write it into a file or a commit.** `tools/fishCaveExport.py` refuses a `--token` option for that reason. If the proxy injects the credential, `CAVE_TOKEN=dummy` is what the client needs to start; if the variable holds the real token, use it as it is. A 401 or 403 means the token is not there: tell Keith and stop, do not work around it. A 404 on the root page is normal (the server is up).
* The system `pip` fails here on a Debian packaging conflict. Use a venv: `python3 -m venv /tmp/venv && /tmp/venv/bin/pip install caveclient` (it brings pandas).
* Reachable without a token: `storage.googleapis.com` (the public release bucket `fish1-release`, which holds `paper_data/HMI_analysis.zip`, `TEN_analysis.zip`, `ProgrammaticInteractionWithFish1Cave.ipynb`, the VAST volumes and Neuroglancer states under `assets/neuroglancer_states/202504/`: none of those is visual), `zf.hms.harvard.edu` (the vestibular CATMAID project), `github.com`, `zenodo.org`, `osf.io`.
* Data terms: open access; any use must cite Petkova, Januszewski et al. (2025), the Fish1 resource paper. The CAVE account is a separate agreement with whoever runs the server. **Do not post exports anywhere public.**

## What is already in the repository (read before querying)

* `tools/fishCaveExport.py` (run on a machine that has the token; here the token is in the environment). Read its header first: `discover` (which datastacks and tables you can reach; writes a small `./fish1_discover/`), `export --datastack fish1_full` (finds cells by a regexp over the cell-type tables, `--match`, or by `--root-ids`; then their synapses, top partners and the circuit among them; `--hops 1|2`, `--max-partners`, `--tables`, `--version` to pin a materialization version, `--signs` for the excitatory/inhibitory tag, `--boxes`), and `giants` (**a pass over ~30 million rows, about an hour: do not run it without asking Keith**).
* `tools/fetchFish1Circuit.py` writes one small circuit in the shape of `vendor/male-cns/giant-fiber-circuit.json`. **The branch `origin/fish1-fetch-fix` (commit 844cbdbb0) fixes it**: the synapses must be read from the base table `synapses_axde` and tagged from `synapses_axde_label` by `target_id`, because the root-id filter on `synapses_axde_label` is a server 500 (KeyError), measured at snapshot v733. Check whether the tool you use already has that fix; if not, take it from that branch.
* `vendor/zebrafish/PROVENANCE.md` and `brain/FISH_VESTIBULAR_HELPER_WIP.md`: what the fish work found so far. The Fish1 cells in `vendor/zebrafish/` came from the OPEN package and are the wrong circuit (inputs to the dorsal motor nucleus of the vagus, not the escape circuit). An earlier upload of a Mauthner-candidate export (from the fish chat) is NOT in git; it holds no afferent or vestibular cell. Ask Keith for it if you want its root ids, or search again.
* `tools/fishCircuit.mjs` turns a circuit into the tree's format (gated by `tools/fishCircuit-selfcheck.mjs`). The repository's habit, which you should keep: every number comes from a query and is recorded with the materialization version it was read at; an inference is labelled as an inference and not as an annotation; a "NOT CHECKED" line says what was not looked at.

## What to do, in this order

1. **Confirm access, read-only.** Run `discover`. Record: the datastacks, the tables of `fish1_full`, the materialization versions, and the timestamp of the one you pin (ROOT IDS CHANGE WITH PROOFREADING, so every query uses one version). Look at the cell-type and soma tables' columns and distinct cell-type values: which classes exist, and **which names look visual** (retinal, retinal ganglion cell, RGC, optic, arborization field, tectal, periventricular, PVPN, PVIN, superficial interneuron, pretectal, isthmi, and whatever else the labels say).
2. **Find the Mauthner cells** (two giant reticulospinal somata in rhombomere 4, one a side): by the default regexp or by root ids. Check that the two found are the two (soma size, position near the midline pair, many synapses). If the search finds the wrong cells or none, say so and use `--root-ids`.
3. **Their inputs.** All presynaptic partners of the two cells (hop 1) with synapse counts, split into (a) neurons with a soma and a cell-type label, and (b) **fragments or axons with no soma**, which is where retinal ganglion cell axons (the retina is outside the volume) would show up. Keep the excitatory/inhibitory tag where the stack has it, and say how much of the input is untagged.
4. **Retinal.** Are retinal ganglion cell axons annotated in any table? If yes: how many, where they terminate, how many synapses onto the Mauthner circuit at hop 1 and at hop 2. If no annotation exists, test the structural hypothesis and LABEL IT AS INFERENCE: soma-less presynaptic fragments whose synapses lie in the tectal neuropil or the arborization fields (positions are in the synapse tables), and say how sure that makes you and what would settle it. Say whether the optic nerve and the arborization fields are inside the volume at all.
5. **Tectal.** Which tectal cell classes are labelled, and how many of those cells have a synaptic path to the Mauthner cells at hop 1 and at hop 2 (for example through reticulospinal or nMLF neurons)? Counts, synapses, sign.
6. **Both together.** Is there a connected path retina to tectum to the Mauthner circuit in the data, or are the two reaching it separately? What is the smallest set of cells that would carry both into a model, in the size of `vendor/male-cns/giant-fiber-circuit.json` (a few dozen neurons)?

## What to hand back

* A note `brain/FISH_VISUAL_INPUTS_WIP.md`: what was queried, the version, the counts, the answer to the question for the retinal and for the tectal inputs separately (**YES as wired cells / only as an inference / NO, only as a stimulus channel**), and the NOT CHECKED lines. If the data answer is "not as wired cells", say what the Escape model should use instead.
* Only a **compact** summary in git (counts, table names, cell-type names, root ids, versions). Keep raw synapse CSVs in a scratch folder and do not commit them unless Keith says so. If Keith asks for a circuit file, produce `vendor/zebrafish/fish1-escape-visual.json` in the `giant-fiber-circuit.json` shape with `tools/fishCircuit.mjs` or `fetchFish1Circuit.py`.
* Commit and push to `claude/fish-vestibular-helper` (a plain push; no pull request, nothing to `main`). Tell Keith in the end what each of the two visual inputs gives the Escape model and what it does not.

## Do not

* Invent a cell, a count or a sign. A query that failed is reported as failed.
* Run the 30-million-row pass, or a query that pages through millions of rows, without asking.
* Treat the earlier fish chat's findings as verified: they are in the notes above, with what was and was not checked.
