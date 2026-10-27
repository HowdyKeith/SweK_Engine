# vendor/zebrafish-vestibular/ -- provenance (UNNUMBERED; written 2026-10-24)

Three files, **byte for byte as downloaded** (not opened for editing, converted, filtered or re-zipped), from one open-access paper. Nothing in this folder is
derived. The extraction rule, the cell counts and the input and output cells of the pitch circuit are NOT here: they are written into the rung 4b section of the
fish note BEFORE any pilot is trained on them (`brain/FISH_VESTIBULAR_HELPER_WIP.md`, and `brain/SUBMARINE_WIP.md` on `claude/sweet-lovelace-8leivh`).

## The paper these files come from

**Liu Z, Hildebrand DGC, Morgan JL, Jia Y, Slimmon N, Bagnall MW. Organization of the gravity-sensing system in zebrafish. *Nature Communications* 2022 Aug 27;13:5060.
doi:10.1038/s41467-022-32824-w. PMID 36030280. PMCID PMC9420129.** The data are serial-section EM of a larval zebrafish at 5.5 days post
fertilization (the paper: "an ultrathin section library of the larval zebrafish at 5.5 days post fertilization (dpf)", of which "the peripheral and central areas of the right utricular circuit" were re-imaged
at higher resolution); every neuron name in the two sheets ends `_R`.

**Cite** this paper wherever these files or anything computed from them is used. Credit and a link to the licence are what the licence below asks for.

## Licence -- copied word for word from the article's own `<license>` element (PMC Open Access Subset XML, `PMC9420129.1.xml`)

> https://creativecommons.org/licenses/by/4.0/ Open Access This article is licensed under a Creative Commons Attribution 4.0 International License, which permits use, sharing, adaptation, distribution and reproduction in any medium or format, as long as you give appropriate credit to the original author(s) and the source, provide a link to the Creative Commons license, and indicate if changes were made. The images or other third party material in this article are included in the article’s Creative Commons license, unless indicated otherwise in a credit line to the material. If material is not included in the article’s Creative Commons license and your intended use is not permitted by statutory regulation or exceeds the permitted use, you will need to obtain permission directly from the copyright holder. To view a copy of this license, visit http://creativecommons.org/licenses/by/4.0/ .

The article's metadata in the same bucket (`PMC9420129.1.json`) says `"is_pmc_openaccess": true` and `"license_code": "CC BY"`. NOT SETTLED BY THE ARTICLE: its licence text speaks of "images
or other third party material in this article"; it does not say in so many words that the Supplementary Data and the Source Data files are under it. They are published with the article,
and the Data availability statement below calls them "provided with this paper". Read that way they are covered; this folder says that is a reading, not a quotation.

## Where the files were fetched from, when, and how

- **From:** the PubMed Central Open Access Subset on AWS, `https://pmc-oa-opendata.s3.amazonaws.com/PMC9420129.1/<file>` (bucket `pmc-oa-opendata`, key prefix `PMC9420129.1/`).
- **When:** 2026-10-24, about 22:25 UTC.
- **How:** plain HTTPS `GET`, from the build sandbox, after the environment's network policy was widened to allow the host. The md5 of each of these three files was compared with the md5 the bucket's own
  metadata file lists for it, and all matched; the sha256 below were taken on receipt and again after copying into this folder (`cmp` identical).
- **What did not work, for the record:** the same files at `https://pmc.ncbi.nlm.nih.gov/articles/instance/9420129/bin/<file>` answered with a 1,817-byte HTML page (a proof-of-work
  challenge, "Preparing to download ...") instead of the file. That challenge was not solved; the files came from the bucket instead. Springer Nature's own site (`www.nature.com`),
  `zebrafish.link`, `zf.hms.harvard.edu`, `github.com`, `api.github.com`, `biorxiv.org` and Zenodo's search were not reachable or were refused from the sandbox that day.

## The files

| file here | the article's name for it | bytes | sha256 |
|---|---|---:|---|
| `41467_2022_32824_MOESM4_ESM.xlsx` | Supplementary Data 1 -- "tabular quantification of hair cell to afferent ... connectivity" | 45452 | `716943404a4989e22dbedb9f667452187d275f295c6058f0f4a2e8db774e84c4` |
| `41467_2022_32824_MOESM5_ESM.xlsx` | Supplementary Data 2 -- "... afferent to central target connectivity" | 32249 | `380918fd05bccf874b7a20c50c36d4127d94897447f247a26a2d7a0179614e4c` |
| `41467_2022_32824_MOESM11_ESM.zip` | Source Data (the PMC page lists it as "Source Data (2.3MB, zip)"; the article's own supplementary-material list does not carry it) | 2401174 | `bf7832d17b12ebd2f5d62b9141677b7e047a1144e9cc0e78a694a4d90234aa41` |

`41467_2022_32824_MOESM4_ESM.xlsx` -- one sheet, `Matrix`: one row per hair cell (`AM_haircell_R_NN`), one column per afferent (`Ear_AnteriorMacula_R_NN`, `ear_anteriormacula_R`, `ear_anteriormacula_R_unmyelinatedNN`), each cell a synapse count; two summary
rows (`SUM ribbons`, `Distinct HCs`) and one non-afferent column (`Hair cell tuning`).
`41467_2022_32824_MOESM5_ESM.xlsx` -- one sheet, `Sheet1`: one row per afferent (the same 106 names), one column per right-side central neuron (`Mauthner_R`, `SuperiorVN_R_NN`, `VS_R_NN`, `tangential_nucleus_R_NN`, `vestibular_commissural_R_NN`), each cell a synapse count; two summary rows
(`Total afferent synapses`, `Distinct afferent inputs`) and five summary/tuning columns.
`41467_2022_32824_MOESM11_ESM.zip` -- 122 members: `Source Data for figures.xlsx`; `JSON files/` (ten figure JSON files plus "JSON file instructions" as .docx and .pdf; none of these was opened here);
`Reconstruction files/` (43 `.swc` skeletons -- 19 `VS_R_NN`, 1 `VSl_R`, 12 `SuperiorVN_R_NN`, 11 `tangential_nucleus_R_NN` -- and `Reconstruction files.pdf`); and macOS `__MACOSX/` and `.DS_Store` entries, left in because the zip is as downloaded.

## What the paper says about where its data are -- copied word for word

**Data availability:** The electron micrograph image data generated in this study is hosted online and publicly available at http://zebrafish.link/hildebrand16/data/vestibular_right . Source Data are provided with this paper. Within the Source Data, one folder contains the .json files needed to generate all 3D reconstructions plus instructions for use; an Excel (.xlsx) file contains data for most of the figure panels, as well as links to the online source of example images, and another folder contains central neuron reconstructions used in dendritic analyses in Fig. 5 . Tabular quantification of hair cell to afferent and afferent to central target connectivity are provided (Supplementary Data 1 , 2 ). Source data are provided with this paper.

**Code availability:** Code used in generating the Monte Carlo analyses and sensory tuning analyses are available at https://github.com/bagnall-lab/EM_analysis

NOT FETCHED, and why: the electron-micrograph image data (`zebrafish.link`, refused by the network policy); the analysis code (`github.com/bagnall-lab/EM_analysis`, refused); the paper's PDF and its four movies (11-71 MB each; not needed for the connectivity); the Supplementary Information, Peer Review File, Description of
Additional Supplementary Files and Reporting Summary (four PDFs) were downloaded to the scratch area for the integrity check and are neither read nor committed; the Source Data's contents were listed, not unpacked.

## The second paper the brief names (Jia & Bagnall 2022): its data statement, and what that means for this folder

**Jia Y, Bagnall MW. Monosynaptic targets of utricular afferents in the larval zebrafish. *Frontiers in Neurology* 2022; doi:10.3389/fneur.2022.937054.** Read from the article page at
`https://www.frontiersin.org/journals/neurology/articles/10.3389/fneur.2022.937054/full` on 2026-10-24.

**Data availability statement, word for word:** The datasets presented in this study can be found in online repositories. The name of the repository and accession number can be found below: CATMAID, https://zf.hms.harvard.edu/hildebrand16/data/vestibular_right .

**Licence line, word for word:** Copyright © 2022 Jia and Bagnall. This is an open-access article distributed under the terms of the Creative Commons Attribution License (CC BY) . The use, distribution or reproduction in other forums is permitted, provided the original author(s) and the copyright owner(s) are credited and that the original publication in this journal is cited, in accordance with accepted academic practice. No use, distribution or reproduction is permitted which does not comply with these terms.

That paper's reconstructions are in a CATMAID server (`zf.hms.harvard.edu`), not in a file that could be downloaded, and the server was not reachable from the sandbox. NOTHING from that paper is in this folder.

## The smallest circuit these files give, from the tilt sensors toward the movement (counts taken 2026-10-24 by throwaway scripts that are NOT gated -- unchecked against any second reader)

- **Layer 1 -- hair cells to afferents (`41467_2022_32824_MOESM4_ESM.xlsx`):** 91 hair-cell rows (90 with at least one synapse), 106 afferent columns (16 myelinated, 90 unmyelinated; every afferent has at least one synapse from a hair cell), 930 synapses summed over
  the individual cells, 312 hair-cell/afferent pairs with at least one synapse. The sheet's own summary rows give 929 and 311: the cell for `ear_anteriormacula_R_unmyelinated20` is blank in both summary rows where the recount finds one synapse from one hair cell.
- **Layer 2 -- afferents to central neurons (`41467_2022_32824_MOESM5_ESM.xlsx`):** the same 106 afferents (all 106 names match the first sheet's, none missing from either) onto 47 central neurons: 1 Mauthner, 12 superior vestibular nucleus, 19 vestibulospinal, 11 tangential nucleus, 4 vestibular commissural.
  580 synapses summed over the individual cells; 84 of the 106 afferents (all 16 myelinated) synapse onto at least one of the 47. By class, synapses and afferent-target pairs: vestibulospinal 307 / 186, tangential 104 / 66, superior vestibular nucleus 88 / 49, Mauthner 52 / 18, vestibular commissural 29 / 13.
  The sheet's summary rows agree with the recount for all 47 target columns.
- **Two layers, no loop.** Both sheets are feed-forward counts. Neither holds a connection between two central neurons, or from a central neuron to anything.
- **Signs and transmitters (CORRECTED 2026-10-24 -- this bullet first said the article gives no sign for any central cell, which was wrong).** No transmitter is NAMED for any central class in the files or in the article (no occurrence of "glutamat", "GABA", "glycin"
  or "transmitter"). But the article does state the SIGN of two classes by their effect on their targets, citing earlier work: *"We reconstructed 12 neurons in the SVN, which inhibits the ipsilateral trochlear and oculomotor nuclei 9 , and 11 neurons of the tangential
  nucleus 12 , which excites contralateral trochlear and oculomotor neurons"* (superior vestibular nucleus: inhibitory; tangential nucleus: excitatory; the numerals are its reference numbers). For the other classes: the vestibulospinal neurons' sign is not stated; the Mauthner
  cell's is not stated; the commissural cells' identity "is not known" and the article "speculate[s]" they are excitatory while noting goldfish vestibular commissural neurons "have previously been interpreted as inhibitory". The afferent layer's sign is stated:
  afferents "excite a variety of central targets". There are no central-to-central edges in either table, so none of these central-cell signs enters a circuit built from the two tables alone.
- **What drives movement is not in the files as a connection.** The paper says central vestibular neurons "project directly to oculomotor and spinal neurons to drive behaviors"; the files stop at the central neurons. The nearest output readouts are cells, not circuits: the vestibulospinal neurons (their `.swc` skeletons are here) and the Mauthner cell.

NOT CHECKED: that the 106 afferents are all of the right ear's utricular afferents (the paper's own statement of completeness was not read against these counts); that the `.swc` and JSON files agree with the matrices (they were listed, not opened); whether a left-right pairing exists (every name is `_R`); whether 5 dpf wiring is what a pitch-hold task should be modelled on.

## What this record could not establish

NOT ESTABLISHED: that the article's CC BY 4.0 licence covers the Supplementary Data and Source Data files (its text speaks of "images or other third party material"; reading it as covering them is a reading, not a quotation). NOT ESTABLISHED: that the proof-of-work-gated PMC copies are byte-identical to these files; the md5 comparison was against the bucket's own metadata only. RECORDED AS: the paper's DOI and PMCID above, the AWS bucket and keys, the fetch date, and the per-file sha256 taken on receipt and again after copying.
