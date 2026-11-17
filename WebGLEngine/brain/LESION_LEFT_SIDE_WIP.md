# The left-side lesion round -- REGISTERED 2026-11-17 BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY FLIGHT ON ITS IDS (UNNUMBERED; branch `ccr-ca830954-770ho4`)

Keith, 2026-11-17: "let's also take a registered round as per: One pattern, not a finding: all four classes at the floor are left-side cells ... It would take a registered round on fresh seeds before that means anything."

## 1. Where the question comes from (exploratory, not registered: `brain/LESION_TOGGLE_WIP.md` section 6a)

The stateful fly (`flycx-stateful`, `brain/pilotSubFlyCxWip.json`, 1,729 weights), the switchboard's dropout task, ids sb-0 to sb-19, 120 s, 6 role-matched random sets per class (draw seed 1). Of 33 classes read (5 types unmatched, 10 type-and-side, 18 glomeruli), four sat at the floor of six draws (rank p = 1/7 = 0.143): **EPG_L** (+0.0114), **PEG_L** (+0.0047), glomerulus **L5** (+0.0055) and glomerulus **L7** (+0.0052). All four are left-side cells, and none of their right mirrors was at the floor. 28 tests at a floor of 1/7 would give about 4 at the floor by chance. The four were picked BECAUSE they were at the floor, so their exploratory p values mean nothing. This round asks the question again on data that did not pick them.

## 2. THE QUESTION

On fresh ids and fresh random draws, does silencing each of the four named left-side classes cost the stateful fly more than silencing role-matched random sets of the same size?

## 3. THE DESIGN, ALL OF IT

* **Pilot.** `flycx-stateful` exactly as `brain/lesionFlyCx.mjs` `flyCxArms` builds it from `vendor/hemibrain/hemibrain-cx-heading-loop.json` and `brain/pilotSubFlyCxWip.json`. The weights file's sha256 is recorded in the results file and checked by the reader.
* **Silencing.** `brain/lesion.mjs` `lesionWeights` (the bias clamp, -1e30), unchanged since commit `8b116178`.
* **Task.** The switchboard dropout task (`brain/switchboard.mjs` `dropoutTask`), 120 s, the default settle (12 s) and the dropout event. Score = 1 - (mean settled heading error in the dark)/pi.
* **Ids (fresh).** sb-6001 to sb-6020: 20 ids. No file in the tree flies these: the exploratory reading used sb-0 to sb-19, and the switchboard's defaults are 0-3 and 0-5.
* **The four PRIMARY classes**, with the exploratory reading's groupings: `EPG_L` (side, 23 cells), `PEG_L` (side, 9), `L5` (glomerulus, 6), `L7` (glomerulus, 6).
* **Random draws (fresh).** 79 role-matched random sets per primary class (`randomSets`, `matched: true`), draw seed **20261117** (the exploratory reading used seed 1). The smallest rank p 79 draws can give is 1/80 = 0.0125.
* **The four SECONDARY classes (the right mirrors; reported, not weighed).** `EPG_R` (side), `PEG_R` (side), `R4` (the mirror of L5: L_k and R_(9-k) are the same heading, from the Delta7 names) and `R2` (the mirror of L7). 19 role-matched draws each (smallest p 0.05), the same draw seed.
* **The intact arm** is flown on the same ids, once.

## 4. THE STATISTIC AND THE VERDICT RULE

* **Cost** of a lesion = the mean over the 20 ids of (intact score - lesioned score).
* **Rank p** of a class = (1 + the number of its random sets whose cost is AT LEAST the class's) / (1 + the number of random sets). A tie counts against the class (`brain/lesion.mjs` `lesionReading`, within 1e-12).
* **Primary verdict: Holm-Bonferroni over the four primary classes at a family-wise 0.05.** Sort the four p values ascending: p(1) <= 0.0125, p(2) <= 0.05/3, p(3) <= 0.025, p(4) <= 0.05. Stop at the first that fails. A class that passes is CONFIRMED; every other class is NOT CONFIRMED.
* **The bottom line, by the number of confirmed primary classes:** 0 -> **NOT REPLICATED** ("the exploratory floor was chance, as far as 20 fresh ids and 79 fresh draws can tell"); 1 -> **ONE CLASS CONFIRMED** (named; "not a left-side pattern"); 2 or 3 -> **PARTLY REPLICATED** (named); 4 -> **REPLICATED** ("the left-side classes cost more than random sets of their size and role").
* **A size line, said whatever the verdict:** each primary class's cost as a share of the intact score. A CONFIRMED cost under 1 percent of the score is said to be under 1 percent.

## 5. SECONDARY READINGS (reported, never weighed)

(a) Each mirror's rank p at 19 draws. (b) The left-minus-right paired cost difference for the four pairs (EPG_L/EPG_R, PEG_L/PEG_R, L5/R4, L7/R2): the mean over ids of (right-lesion score - left-lesion score), with its se and the board's 2-se word. (c) The board's paired reading of each primary lesion against the intact arm (BEATS / TIES / IS BELOW at 2 se). (d) The intact arm's mean score.

## 6. CHECKS, run first. A failure is the report's first line, and the verdict is then NOT WEIGHED.

IDS (exactly sb-6001 to sb-6020, every arm on the same ids in the same order); WEIGHTS (the sha256 of the weights file the results file names is the file's); DRAWS (79 per primary class and 19 per mirror, all role-matched, all distinct from their class and from each other, regenerated from the seed by the reader and equal to the recorded ones); COMPLETE (every registered arm present exactly once); NO-OP (a lesion of the empty set, flown on two of the ids, equals the intact arm exactly).

## 7. EXPECTATION, recorded before the run

NOT REPLICATED, at about four chances in five. The four classes were chosen as the extremes of 28 tests, and extremes regress. The exploratory costs were 0.5 to 1 percent of the score, close to the spread of the random sets. I would put PARTLY REPLICATED or better at about one in seven, and REPLICATED (all four) under one in twenty.

## 8. WHAT THIS ROUND DOES NOT SAY

It is about the stateful fly's learned residual on the tank's compass dropout, not about the fly's brain: the pilot is the autopilot plus a readout of a reservoir, and its gain is the recipe's generic gain (its weights file's limits). A CONFIRMED class says that silencing those cells costs this trained readout more than silencing random cells of the same roles; it does not say the cells hold a heading. A NOT REPLICATED says nothing about classes that were not tested.

## 9. WHAT WILL BE BUILT, gated and sabotaged before the run

`tools/ship/lesionLeftSide.mjs` (the plan of arms from section 3, the Holm rule, the checks and the report, all pure), `tools/ship/lesionLeftSideCmd.mjs` (`run --part i/n --out brain/lesionLeftSide.jsonl`, resumable; `report --in`), gate `tools/ship/lesionLeftSide-selfcheck.mjs`. Gate rows owed: the plan's arms and counts (1 intact, 4 + 316 primary, 4 + 76 secondary, 1 no-op), the ids, the seed, Holm on hand-made p values on every branch (each step's threshold, the stop at the first failure), the bottom-line words for 0 to 4, the checks each going red on a broken file, and the report reading p and cost from synthetic records exactly as `lesionReading` does. The results file is committed unread, then read once.

## 10. BUILT AND GATED (2026-11-17, before any flight on the registered ids)

`tools/ship/lesionLeftSide.mjs`, `tools/ship/lesionLeftSideCmd.mjs`, gate `tools/ship/lesionLeftSide-selfcheck.mjs` (about 30 rows, under 1 s; the only real flights are the no-op check, 20 s on sb-6001 and sb-6002). The gate's first run had three rows red, all three my own expectations, not the library: a Holm case I wrote by hand actually confirms three classes, a p printed with three decimals, and a floating-point equality. Each row was corrected to what the registration says. **SABOTAGE:** 32 mutants of `lesionLeftSide.mjs`, each alone in a scratch copy, **32 of 32 red** on the first pass: the seed, ids, draw counts, alpha, matching, a class's grouping, a mirror, the no-op's ids and cells, Holm (flat Bonferroni, no stop, strict, rank), the bottom line, the cost's sign, the tie rule, the +1, every check, NOT WEIGHED, the 1 percent line, the mirror difference's sign and the board's word.

The run: `node tools/ship/lesionLeftSideCmd.mjs run --out brain/lesionLeftSide.part<i>.jsonl --part <i>/3` for i = 0, 1, 2 (402 arms; about 6,400 flight-seconds). The three part files are committed UNREAD, then read once with `report --in` over the three.
