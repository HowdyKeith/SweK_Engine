# Submarine duel: does the pingEvery effect follow the opponent? (REGISTRATION 19 of the evade reads; 2026-11-17; UNNUMBERED; A READ OF RECORDS, NO GEOMETRY IS FLOWN; REGISTERED BEFORE THE RECORDS OF ROUNDS 9 AND 10 EXIST)

Keith, 2026-11-17: "lets work through all 3" (the three candidates the HELD RESULT of `brain/SUB_EVADE_ABROAD_WIP.md` left). **This is the third: a pingEvery by opponent-type interaction.** The abroad note found the effect of league7100's value 25 following the base edge (-0.92 on DEV, -0.83 on HELD, over fourteen opponents); this note asks, **before the records of the next two rounds exist**, whether the effects of the three rounds follow a property of the opponent, in the one way a read of fourteen opponents can: a rank correlation per cell.

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadeType.mjs` (the command), `tools/ship/takeEvadeType-selfcheck.mjs` (its gate), `brain/subEvadeTypeDev.json` and `brain/subEvadeTypeHeld.json`. It imports, and does not edit, `tools/ship/takeSubLeague.mjs` (`loadRuns`, `decided`, `signed`). **It flies nothing**: its data are the records of `SUB_EVADE_ABROAD_WIP.md` (`brain/subEvadeAbroadDev.json`, `brain/subEvadeAbroadHeld.json`), `SUB_EVADE_SHORT_WIP.md` (`brain/subEvadeShortDev.json`, `...Held.json`) and `SUB_EVADE_PINGAWAY_WIP.md` (`brain/subEvadePingawayDev.json`, `...Held.json`), and the boats' thetas of the files.

## 1. What is known

* **The abroad records have been read** (their numbers are in `SUB_EVADE_ABROAD_WIP.md`): league7100 with 25 and with 40 against the fourteen other boats; **the effect at 25 correlates with the base edge (the edge of the unchanged league7100 against that boat) at -0.92 (DEV) and -0.83 (HELD); at 40 at -0.60 and -0.45.** **They are the SEEN cells of this note**: their correlations are reported and labelled post-hoc and are not counted in the headline.
* **The records of rounds 9 and 10 do not exist.** Their cells are the **REGISTERED cells**: league7100 at 4.0, 6.0 and 12.0 (round 9); league7001 and exploit7204 at 16.0 and 30.0 (round 10): **7 cells**.
* **The opponents' own numbers** (the finals of the files; G's generation 0): pingEvery, trackSpeed, evadeSpeed and evadeTurn.

## 2. The question and the cells

**The question:** across the fourteen opponents of a hunter, does the effect of a pingEvery arm rise or fall with a property of the opponent: **the base edge** (how much the unchanged hunter beats it), **its pingEvery, its trackSpeed, its evadeSpeed or its evadeTurn**?

**A CELL** is one (hunter, value) of the three rounds; in a cell each of the hunter's fourteen opponents has an **effect** (the paired difference of the arm over the hunter against that opponent, the edge) and the five **features**. **The statistic:** the **Spearman rank correlation rho** (Pearson on the ranks, ties given the mean rank) of the effect with a feature over the fourteen opponents. **A feature FOLLOWS in a cell, with the sign of rho,** iff |rho| is **0.6 or more** (for fourteen points a rho of 0.54 is the two-sided 5% point and 0.65 the 1% point: 0.6 is between).

## 3. The reads and the order

* **The DEV read** reads the DEV records of rounds 8, 9 and 10; **the HELD read** (the rules are about it) reads their HELD records. **Neither flies a geometry; no set of geometries belongs to this note.** `node tools/ship/takeEvadeType.mjs dev [--write]` (free to read; `--write` records `brain/subEvadeTypeDev.json` once) and `node tools/ship/takeEvadeType.mjs held --write` (reads the HELD records once; refuses without a recorded DEV that has R0 and no failed check, without `--write`, or if its record exists).
* **The order of work:** this note (now); the command and its gate **when the DEV records of rounds 9 and 10 exist** (it can be written earlier on made-up records); the DEV read after them; **the HELD read only on Keith's word, and only after the HELD records of rounds 9 and 10 exist** (which are flown only on his word).
* **Amendments:** as in the other notes: only dated, only before the HELD read.

## 4. The rules (MY CHOICES, said; Keith may set them differently)

* **R0 (the premise):** the six records of the read (the DEV or the HELD of rounds 8, 9 and 10) exist, list **no failed check**, and have the cells (abroad: league7100 at 25 and 40; short: league7100 at 4, 6, 12; pingaway: league7001 and exploit7204 at 16 and 30), **each with 14 finite effects**. On DEV, if R0 fails the HELD read is not made by this registration.
* **RT1 THE FOLLOWING:** for each feature, over the **7 registered cells**: k+ = the cells in which it FOLLOWS with a positive rho, k- = with a negative rho.
* **RT2 THE TYPE:** a feature is **"A TYPE"** iff **k+ or k- is 6 or more of the 7 and the other is 0**. **THE HEADLINE:** **"TYPE: <the features that are a TYPE, in the order baseEdge, pingEvery, trackSpeed, evadeSpeed, evadeTurn>"** or **"NO TYPE"**.
* **What the bar costs, said before the read:** one correlation of this size is decided by chance in about 2.5% of the cases (two-sided). **But the seven cells are not seven independent draws**: they share their opponents and features, the three cells of one hunter (and the two values of the others) have nearly the same effects, and the features are correlated with each other (the base edge itself depends on the opponent's evade numbers). **"A TYPE" is therefore a weaker statement than 6 of 7 correlations would be, and I read it as a pattern across cells, not as seven tests.** A feature that follows is read with its own correlation with the base edge (reported for each hunter).
* **Reported with the read, not in a rule:** every rho (7 registered cells and the 2 seen cells, five features); k+ and k- for the registered cells and **also with the two seen cells**; **each feature's rank correlation with the base edge for each hunter**; the opponents' features; the forecast quantities as yes/no. **Any reading of why is post-hoc and labelled.**
* **Checks that void the read, said and not weighed. Every one is an identity or a file's own number:** each record's `checks` is empty; each record's `set` is the one read (`dev` or `held`); each cell has the 14 opponents of its hunter (the fifteen boats but the hunter) in the order of `BOATS`, each once; every rho is in [-1, 1]; **the features are the finals' numbers of the files** (an opponent's pingEvery of league7001 is 4, of league7100 8.3 ...: read from the thetas, G from generation 0).

## 5. Forecasts, written before any record of rounds 9 and 10 exists (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **88** |
| R0 holds on HELD | **88** |
| the HELD headline is "NO TYPE" | **45** |
| "TYPE" includes baseEdge | **38** |
| "TYPE" includes pingEvery | **12** |
| "TYPE" includes trackSpeed | **12** |
| "TYPE" includes evadeSpeed | **8** |
| "TYPE" includes evadeTurn | **8** |
| the base edge FOLLOWS (|rho| 0.6 or more) in at least 4 of the 7 registered cells | **55** |

Why these: **the abroad cells are the only data**: the base edge followed strongly at 25 and moderately at 40 for league7100; the base edge is itself a result of how well the opponent evades and tracks, so it carries most of the opponent's properties at once, which is why I put it ahead of the single numbers (38 against 8 to 12); but **seven cells of three kinds of hunter and values on both sides of the hunter's own (round 9 is below and above league7100's 8.30) is a harder test than the one seen cell**, and the sign of the base-edge correlation need not be the same for a shorter interval and for a longer one, which a headline of "NO TYPE" would show (45). R0 is a failure of a file's existence or a failed check, not of an effect: 88 allows for a round whose DEV record is void.

## 6. What a result would not say

* **A mechanism, or that the property is what drives the effect** (fourteen opponents, five correlated features, seven dependent cells); **anything about a boat other than the fifteen**; **anything about a hunter other than league7100, league7001 and exploit7204** or a value other than those of the three rounds.
* **A TYPE that is the base edge alone:** the base edge is the unchanged hunter's own result against the opponent, so it is a reading of the pair and not of the opponent.

## 7. Cost

No flights: the command reads six records and the thetas; its gate and a sabotage pass are the work.
