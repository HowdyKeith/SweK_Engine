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

## State, 2026-10-24 (later): DATA IN HAND for the first two layers; the output end and the signs are not

**Step 1 of the brief is done: `vendor/zebrafish-vestibular/` holds three files from Liu et al. 2022 (*Nat Commun* 13:5060, doi:10.1038/s41467-022-32824-w, CC BY 4.0), byte for byte, with
`PROVENANCE.md` (URL, date, sha256, the licence and both availability statements word for word, the citation).** The environment's network policy was widened and the hosts below answered; the files came
from the PubMed Central Open Access Subset on AWS (`pmc-oa-opendata`), md5-checked against the bucket's own metadata. The PMC site itself answered the same URLs with a proof-of-work challenge page
instead of files; it was not solved.

**Step 2 (the smallest circuit, in a paragraph) is in `vendor/zebrafish-vestibular/PROVENANCE.md`, last section.** In one line: 91 hair cells -> 106 utricular afferents (930 synapses) -> 47 right-side central neurons
(1 Mauthner, 12 superior vestibular nucleus, 19 vestibulospinal, 11 tangential, 4 vestibular commissural; 580 synapses), two feed-forward layers and no loop, from the two Supplementary Data tables, which join on all
106 afferent names. **No central cell has a transmitter in the files or in the article's text.** The files stop at the central neurons: no connection from them to anything.

**Reached and not reached from this sandbox on 2026-10-24 (the second look, after the policy change):** reached: `zenodo.org` (the site; its search and API answered 403), `osf.io`, `www.frontiersin.org`, `pmc.ncbi.nlm.nih.gov` (pages; not its
file downloads), `doi.org`, `pmc-oa-opendata.s3.amazonaws.com`. Not reached: `zebrafish.link` and `zf.hms.harvard.edu` (the EM image and CATMAID hosts both papers name), `www.nature.com`, `github.com` and `api.github.com` (403; the
analysis code, `bagnall-lab/EM_analysis`, is there), `eutils.ncbi.nlm.nih.gov`, `europepmc.org`, `api.crossref.org`. `www.biorxiv.org` answered 429.

**What the exported Fish1 folder (the earlier upload) is, again:** the Mauthner-candidate export of the fish chat. It holds no afferent or vestibular cell, and the two data sets are not linked here: the Fish1 cells are in the larval-fish stack's own
coordinates, and these are the Bagnall lab's own cells, with their own names.

## What this branch changed outside its own files, and what a merge with the fish branch will meet (UNNUMBERED; no gate was added, so no census record moved)
* `vendor/zebrafish-vestibular/` (three data files and `PROVENANCE.md`), and three one-line register edits the tree's own gates demanded: an entry in `world/vendoredLicences.mjs`, the pinned count of folders a filename census
  gets wrong in `tools/ship/vendoredLicences-selfcheck.mjs` (6 -> 7), and an entry in `NOT_A_LICENCE_BODY` in `world/licenceBodies.mjs`. Each went red BY NAME before its edit (`MISSING: vendor/zebrafish-vestibular`; the
  licenceBodies row naming `vendor/zebrafish-vestibular` among the folders it could not confirm) and is green after. `withheldFromMirror` treats the folder as it treats `vendor/male-cns`, 4.2 MB against this one's 2.4 MB.
* **A merge with `claude/sweet-lovelace-8leivh` will conflict in exactly those three places**, because it adds `vendor/zebrafish` and `vendor/hemibrain` to the same lists and takes the same count 6 -> 8. Keep every entry; the count becomes 9.
* **NOT GATED:** the sha256 values in `PROVENANCE.md` are not checked by any gate, and the counts in its last section come from throwaway scripts. A small tool that re-derives the counts from the two tables, and a gate that holds the files to their hashes, are the next step; the fish chat registers new gates
  (`tools/ship/gateSweep.mjs`, `assertionShape.mjs`, the census records) when it merges them, so this branch has not added one.

## What rung 4b needs before anything is built (from `SUBMARINE_WIP.md` rung 4b and Brief 1; nothing here changes them)
1. The files exactly as downloaded, each with its URL, the date, its sha256, the licence or terms text copied word for word, and the citation; one README
   saying which paper each came from. No interpretation, filtering or conversion at this step.
2. A paragraph saying the smallest circuit the files give from the tilt sensors to something that drives movement: how many neurons, which have a known
   transmitter, and where the files stop.
3. Then, and only then, the extraction rule, the cell counts and the input and output cells, written into the rung 4b section BEFORE any pilot is trained;
   the pilot, the five controls and the verdict rule are rung 3's.

## What is needed next, and what is Keith's to decide (nothing here is taken)
* **The extraction rule for rung 4b** (cell counts, input and output cells) has to be written into the fish note's rung 4b section before any pilot is trained. The data supports at least two cuts, and the choice is not made here:
  all 47 central neurons, or only the vestibulospinal and tangential classes; with or without the Mauthner and commissural cells; afferents with synapses onto a target only (84 of 106) or all 106.
* **Signs.** The files and the article give none for the central layer. Dale's-law signs would have to come from a paper this chat has not read (Bianco et al. 2012 or the Schoppik lab's papers are the brief's pointers); an open-access paper in the PubMed Central Open Access Subset can be fetched from the same bucket, as this one was. Without them a signed circuit cannot be built honestly.
* **The output end.** No file here connects a central neuron to a motor neuron. A pitch task would need a readout rule that is stated as an assumption, or a second dataset (the Fish1 stack could hold the downstream cells, but no table labels them).
* **The code and the image data** (`github.com/bagnall-lab/EM_analysis`, `zebrafish.link`) are still blocked; the matrices and skeletons do not need them, but the Monte Carlo and tuning analyses the paper describes do.

NOT CHECKED: that the matrices agree with the skeletons and JSON files in the Source Data zip (listed, not opened); whether 5.5 dpf wiring is the right thing to model a pitch-hold task on; the Fish1 data terms (unread); the Mauthner identification.
