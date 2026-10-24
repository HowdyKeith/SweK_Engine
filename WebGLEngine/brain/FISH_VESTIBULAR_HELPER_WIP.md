# Fish vestibular circuit (rung 4b) -- helper branch note (UNNUMBERED; facts only -- no root ids, no rows, per the data terms)

Branch `claude/fish-vestibular-helper`, made from `main` at v4896 as `brain/HANDOFF_NEXT_CHAT.md` (on `claude/sweet-lovelace-8leivh`) asks of a helper:
it never pushes to `main` or to that branch, opens no pull request unless Keith asks in so many words, writes its own note (this one), and leaves
the files that chat owns alone (`brain/SUBMARINE_WIP.md`, `brain/DOGFIGHT_LEAGUE_WIP.md`, `tools/ship/gateSweep.mjs`, `tools/ship/assertionShape.mjs`,
everything under `tools/fish*`, `brain/pilotSub*`, `tools/ship/trainSub*`) and the census records (that chat registers new gates when it merges them).
The fish work is on that branch and not on `main`: `tools/fishCircuit.mjs`, `tools/fishHmi.mjs`, `tools/fishCaveExport.py`, `brain/pilotSubFish.mjs`,
`brain/pilotSubCircuit.mjs`, the fish weights file and `vendor/zebrafish/` (checked 2026-10-24 against `main` at v4896; an older `brain/SUBMARINE_WIP.md` and the
non-fish `brain/pilotSub*` files are on `main`). Nothing here builds on the fish files yet. That branch was still moving when this was written (newest commit
2026-10-24 22:01 UTC, on the fly central-complex rung 4a); `vendor/zebrafish/` there holds only the two circuits already recorded (`fish1-ten-core.json`,
`fish1-hmi-spn.json`) and no vestibular data, and the only files there naming the vestibular leads are its two notes.

## State, 2026-10-24: BLOCKED ON DATA, and what was uploaded is not the data

**The uploaded export is the Mauthner-candidate export that `SUBMARINE_WIP.md` already records, and it holds no tilt-sensor data.**
* Ten files were uploaded (`tools/fishCaveExport.py export`, datastack `fish1_full`, materialization 737, written 2026-10-24 00:25 UTC, four root ids). All nine
  files the manifest lists match its sha256, byte count and row count.
* It is the same export, not a new one: 354 synapses out and 15,847 in, 41 edges, 40 partners, 1,071 circuit rows; shared presynaptic partners 104 (ranks 1
  and 2), 60 (ranks 3 and 8), 9 and 1 (rank 8 with ranks 1 and 2), 0 for the other pairs; no synapse between any two of the four cells. Those are the numbers
  the fish chat wrote down for ranks 1, 2, 3 and 8 ("The identification Keith brought back").
* The four somas make two mirror pairs (front-back 562.7 / 563.7 um and 512.0 / 504.4 um; top-bottom 157.7 / 159.3 and 190.3 / 201.4 um), the ranks-1-and-2
  and ranks-3-and-8 pairs of that note.
* **What it cannot give rung 4b.** Rung 4b is the pitch-hold circuit cut from the tilt sensors (utricular afferents) through the central vestibular and
  vestibulospinal cells to the cells that drive movement. This export names none of them: `labels.csv` has 15 rows, all from `somas`, whose `cell_type` is only
  `exc`, `inh` or `na` (`na` for all four cells; one `inh` among the partners); 39 of the 40 strongest partners send to the cells and the 40th only receives
  (18 synapses from one cell), and every one of the 41 edges has a cell at one end, so the hops-2 circuit is a fan of 39 inputs into the cells with no loop; the
  cells' own identification is the relayed Mauthner one, which this chat did not see in a viewer. Nothing in it marks a cell as a utricular afferent, a
  tangential-nucleus neuron or a vestibulospinal neuron.

**The sources the brief names cannot be reached from this sandbox.** The environment's network policy answers 403 to the CONNECT for `zenodo.org`,
`zebrafish.link`, `www.nature.com` and `www.biorxiv.org`; `github.com` and `api.github.com` answer 403; `osf.io`, `pmc.ncbi.nlm.nih.gov`, `doi.org` and
`www.frontiersin.org` did not connect (not confirmed to be the same denial). So the leads in the brief (Liu et al. 2022, Jia & Bagnall 2022, the Bagnall lab's
analysis code, a `zebrafish.link` path) are STILL UNVERIFIED: no data-availability statement, file name, size or licence has been read.

## What rung 4b needs before anything is built (from `SUBMARINE_WIP.md` rung 4b and Brief 1; nothing here changes them)
1. The files exactly as downloaded, each with its URL, the date, its sha256, the licence or terms text copied word for word, and the citation; one README
   saying which paper each came from. No interpretation, filtering or conversion at this step.
2. A paragraph saying the smallest circuit the files give from the tilt sensors to something that drives movement: how many neurons, which have a known
   transmitter, and where the files stop.
3. Then, and only then, the extraction rule, the cell counts and the input and output cells, written into the rung 4b section BEFORE any pilot is trained;
   the pilot, the five controls and the verdict rule are rung 3's.

## Ways forward (Keith's choice; none taken yet)
* **A.** Allow the hosts above in this environment's Network access settings; this chat then fetches and records them under rule 1, and reads the data-availability statements first.
* **B.** Download on Keith's machine and upload the folder (the way the CAVE exports came): this chat checks hashes, writes the provenance, and reads the files.
* **C.** The Fish1 stack itself might hold the pitch circuit, but no table labels afferents or vestibular cells (the stack's cell types are `exc`, `inh`, `na`), so
  cells would have to be picked by position and morphology in the viewer, as the Mauthner candidates were. Not examined.

NOT CHECKED: whether any of the leads holds what rung 4b needs; whether the Fish1 data terms (unread) allow what A and B would commit; the Mauthner identification.
