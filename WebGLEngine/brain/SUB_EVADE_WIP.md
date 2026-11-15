# Submarine duel: the evade-turn follow-up to item 7 (2026-11-15; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-15: "register the evade-turn follow-up". It is the open item at the end of the Part B result of `brain/SUB_LEAGUE_WIP.md` ("a registration for the claim in (3): hold the evade numbers at the doctrine's values on generation 0 and read the edge") and of `brain/BACKLOG_2026-11-01.md` section E (`sub-tournament-runner-and-record`). This note is the registration and nothing else: **no command, no gate and no geometry of the sets below exists yet.**

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadeTurn.mjs` (the command), `tools/ship/takeEvadeTurn-selfcheck.mjs` (its gate), and the records `brain/subEvadeDev.json` and `brain/subEvadeHeld.json`. Read and imported, not edited: `brain/subTactics.mjs`, `brain/subTournament.mjs`, `brain/subDuel.mjs`, `tools/ship/takeSubLeague.mjs` (its `loadRuns`), the search-ping theta file and the twelve run files of `brain/subLeagueRuns/`.

## 1. What is known (read from the code, the files and the notes; nothing here is flown again)

* **The observation, and where it came from.** In `brain/SUB_LEAGUE_WIP.md` (Part B result) the read of fourteen runs on geometries 96001 to 96024 printed, for each, its final generation's difference from generation 0. After the read, from those columns, I noted (POST HOC, NOT TESTED, said there): **every one of the five runs that find a counter-doctrine has an evadeTurn of 2.65 or more** (the ceiling is 2.80); of the nine that do not, eight are at 1.88 or less and the ninth (exploit7202, 2.58) pings 26 s a search. This registration is the test of that observation, and nothing in it was chosen to make the observation come out.
* **What the tactician does when a torpedo is heard** (read from `brain/subTactics.mjs`, `makeTactician` and `evadeOrder`): when a contact of kind torpedo is heard, for `evadeTime` seconds the boat holds a heading `evadeTurn` radians off the torpedo's bearing (away from the side it is on), changes depth by 12 m, goes at `evadeSpeed`, and does not fire or ping. The bounds are evadeTurn 0.4 to 2.8 rad, evadeSpeed 0.5 to 4.5 m/s, evadeTime 5 to 40 s. **So an evadeTurn of 1.71 (generation 0) is a heading 98 degrees off the torpedo's bearing, and 2.65 to 2.80 (the finders) is 152 to 160 degrees: nearly straight away.**
* **The five finders and generation 0, the evade numbers and a few others** (read from the files, `loadRuns` of `tools/ship/takeSubLeague.mjs`):

| side | evadeSpeed | evadeTime | evadeTurn | searchPing | fireRange | aimTol |
|---|---|---|---|---|---|---|
| generation 0 (the search-ping champion) | 3.42 | **36.9** | 1.71 | 7.69 | 458 | 0.465 |
| league7001 (the notes' league) | 4.32 | 33.7 | 2.80 | 0.00 | 428 | 0.329 |
| league7100 | 4.50 | 30.7 | 2.70 | 0.00 | 460 | 0.371 |
| league7103 | 3.55 | 30.1 | 2.80 | 7.13 | 373 | 0.537 |
| exploit7200 | 4.42 | 29.2 | 2.80 | 0.01 | 427 | 0.484 |
| exploit7204 | 4.35 | 27.8 | 2.65 | 8.28 | 412 | 0.465 |

**Two things the table says that the Part B note's phrase "evade harder" does not.** The finders turn harder (152 to 160 degrees against 98) and run faster (3.55 to 4.50 against 3.42) but evade for a SHORTER time (27.8 to 33.7 s against 36.9), so they spend 3 to 9 s a torpedo less not firing. The three numbers do not all move "harder", and which of them carries an edge, if any does, is what the turn-alone arms below are for. And two of the five (7103, 7204) ping about as much as generation 0, so "stop pinging" is not what the five share.
* **The five finders were SELECTED by the read that found them.** They are the five of fourteen runs whose final generation beat generation 0 on 96001 to 96024 by an edge of at least 0.5 at z of at least 2. A side picked because it did well on a set will on average do less well on a fresh one (regression to the mean), so the first thing a fresh set must show is that they still find (R0 below). This is why the unmodified finders are flown too.
* **The seat question of Part A is NOT tested here.** league7001's seat A was worth -1.9 a duel in the Part A record where every other side's was worth +2.5 to +3.4; whether a nearly-straight-away evade is what profits from starting behind is a different question. The seat of each arm is PRINTED (below) and is not a rule.

## 2. The question and the arms

**The question.** Is the evade response (the three numbers evadeSpeed, evadeTime, evadeTurn, and then the turn alone) what makes the five finders beat generation 0: sufficient (put on generation 0 it finds) and necessary (taken off the finder, it stops finding)?

**The sides.** G is generation 0, the theta of `brain/subTacticsThetaSearchPingWip.json`. F is the five named finders, by their final generation's theta (named now and not re-picked on any new set): **league7001, league7100, league7103, exploit7200, exploit7204**. For a side x, E(x) is the triple (evadeSpeed, evadeTime, evadeTurn) of its theta. Every side is a tactician and the PD autopilot (no weights), as in the Part B read. Every arm is flown against G, both seats, 24 geometries (48 duels), by `subTournament.matchup(arm, G, geometries)`: the arm's paired edge over G, its standard error and z. An arm **FINDS** at an edge of at least **0.5** with z of at least **2**: Part B's bar, the same number and the same chosen number (half a net sinking and ten of the 0.05 net hits; not a measurement).

| arm, for each finder f of F | what it is (the theta) | count |
|---|---|---|
| U(f), unmodified | f's own theta | 5 |
| GT(f), triple grafted onto G | G with evadeSpeed, evadeTime, evadeTurn of f | 5 |
| LT(f), triple lesioned from f | f with evadeSpeed, evadeTime, evadeTurn of G | 5 |
| GN(f), turn grafted onto G | G with evadeTurn of f | 5 |
| LN(f), turn lesioned from f | f with evadeTurn of G | 5 |

25 arms, 1,200 duels a set. **LT(f) is also "everything of f except its evade triple, on G"**, so GT and LT are complementary: GT asks whether the evade numbers alone carry the edge, LT whether the other nine numbers carry it. (The two can both say yes, both no, or one each; that is the point.) Nothing is searched, tuned or re-fit: every number in every arm is a number already in a file.

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read: the command runs.
* **DEV**: **98001 to 98024**, both seats. Flown first, read freely, recorded once in `brain/subEvadeDev.json`. **It has one job a rule can use: it decides whether HELD is spent.**
* **HELD**: **99001 to 99024**, both seats. Flown ONCE (`held --write`; refuses without a recorded DEV that replicates, refuses if `brain/subEvadeHeld.json` exists), read once; the rules below are about HELD.
* Nothing submarine-related uses 98001 to 98024 or 99001 to 99024 (searched: no file with `sub` in its name holds them; other systems' files hold the same numbers for other things, as the seeds of different tools are not shared).
* **Amendments:** a rule, a count, a bar or an arm may change after DEV only by a dated AMENDMENT written in this note BEFORE HELD is flown, saying what DEV showed and why. Nothing moves after HELD. A wrong forecast is scored as wrong.
* **The order of work:** this note, then the command, then its gate with a sabotage log in the header (the gate never flies 98001 to 99024; it overrides the sets), then smoke, then DEV, then (if R0 holds on DEV) HELD.

## 4. The rules (MY CHOICES, said; Keith may set them differently)

Let F' be the finders whose U(f) finds on the set read, and n' = |F'| (5 if all do). **"Most"** is at least n' - 1 of F'; **"few"** is at most 1 of F'.

* **R0 REPLICATES** iff n' is at least 4 (of 5). **On DEV, if R0 fails, HELD is not flown by this registration** and the result is "the five finders do not replicate on a fresh set" (the observation was a selection effect); a new registration would be needed to look again. On HELD, if R0 fails the rules below are still read over F' and the reading says so.
* **R1 TRIPLE SUFFICIENT**: GT(f) finds for most of F'. **INSUFFICIENT**: for few. **PARTIAL**: otherwise.
* **R2 TRIPLE NECESSARY**: LT(f) does NOT find for most of F'. **UNNECESSARY**: it does not find for few (that is, it still finds for most). **PARTIAL**: otherwise.
* **R3 TURN SUFFICIENT / INSUFFICIENT / PARTIAL**: R1 with GN(f).
* **R4 TURN NECESSARY / UNNECESSARY / PARTIAL**: R2 with LN(f).
* **The readings of the four together** (what each pattern would mean, written now): triple SUFFICIENT and NECESSARY, **the evade response is where the doctrine lives** (given the finders' other numbers); SUFFICIENT and UNNECESSARY, the evade numbers are enough but the finders have other routes (redundant); INSUFFICIENT and NECESSARY, the evade numbers cannot be left out and are not enough alone (an interaction with the other nine); INSUFFICIENT and UNNECESSARY, **the evade numbers are neither, and the five share them by chance or by a bound, not by cause**. The same four-way reading for the turn alone, and **"it is the turn" iff R3 SUFFICIENT and R4 NECESSARY**; triple yes and turn no is "the triple, not the turn alone".
* **Reported with the read, not in a rule:** each arm's edge, standard error, z and wins-draws-losses; each arm's edge as a share of its finder's unmodified edge (GT/U and LT/U) and the medians of those shares; **each arm's edge in seat A and in seat B separately** (the seat question, not read); the table of the four labels against each other.
* **Checks that void the read, said and not weighed:** every arm flew the same 24 geometries (48 duels); no score is non-finite; every arm's theta is one `clampTheta` leaves unchanged; the five finders' thetas and G's equal the files' (`loadRuns` and the search-ping file); an arm in which nothing was changed (G with its own triple) has an edge of exactly 0 against G; the unmodified finders' edges on a set are the ones the same `matchup` gives when called on the finder directly.

## 5. Forecasts, written before any geometry of any set is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV (at least 4 of the 5 unmodified finders find) | **90** |
| R0 holds on HELD | **88** |
| R1: the triple is SUFFICIENT on HELD (INSUFFICIENT 15; so PARTIAL 35) | **50** |
| R2: the triple is NECESSARY on HELD (UNNECESSARY 15; so PARTIAL 30) | **55** |
| R3: the turn alone is SUFFICIENT on HELD | **40** |
| R4: the turn alone is NECESSARY on HELD | **50** |
| triple SUFFICIENT and NECESSARY together on HELD | **35** |
| the median GT edge is at least half the median U edge on HELD | **60** |

Why these and not others, so that a miss can be read: the three families found by seeds of different recipes (7001, 7100, 7200: the same numbers to the digit, 46 of 48 duels) are likely to replicate (90); selection costs a little. Part B's table has two high-evadeSpeed non-finders with a low turn (exploit7203 at evadeSpeed 4.15 and turn 1.11, exploit7205 at 4.50 and 0.82), which points at the turn rather than the speed; but a graft changes evadeTime in the other direction and sets the turn on a boat whose other numbers were tuned to the old turn, so I give sufficiency no more than a coin (50, and 40 for the turn alone). Necessity is likelier than sufficiency in a hill-climbed point: take out the number the climb ran to the bound for and the edge should fall (55 and 50). The finders' edges are about 3, which looks like a saturation (46-0-2), so a graft that carries even part of the effect may cross 0.5 at z 2 easily; that is why the median-share forecast is above a half (60).

## 6. What a result would not say

* **That the doctrine is good against anything but generation 0.** Every arm is scored against G alone, as in Part B; an evasion tuned against a pinging, torpedo-firing opponent says nothing about another one, and the Part A record's sides are not in this read.
* **That a graft that does not find means the evade numbers do not matter in the finder.** "Sufficient" and "necessary" here are about moving numbers between two particular tacticians: a graft puts a triple tuned for the finder's other nine on a different nine; the effect of a number depends on the others (there are 12 in all), and nothing here measures the interaction beyond the 2 x 2 above.
* **That "necessary" means the cause.** Reverting a number a hill climb ran to a bound is a lesion, and a lesioned boat can fail for a reason other than the one lost (it is a different boat).
* **Anything about the seat** (printed, not read), **about the tactician's other behaviours** (ping, fire), or **about a dose** (the turn alone is read at each finder's own value, 2.65 to 2.80; nothing here is read between 1.71 and 2.65, so "monotonic" is not claimed).
* **That five finders are a sample.** They are the five that found, of fourteen runs, in one league recipe; three of them are near-copies of one doctrine (7001, 7100, 7200), so the effective number of independent finders may be nearer three.

## 7. Cost

25 arms of 48 duels is 1,200 duels a set, the size of the Part A tournament without its seat passes: about a minute or two on one core for the PD sides, the same on DEV and on HELD. The command, its gate and a sabotage pass (the league gate's 205 mutants took a few tens of minutes on four cores) are the work.

## AMENDMENT A (2026-11-15; made while the command `tools/ship/takeEvadeTurn.mjs` was written and smoke-run on geometries 1 to 4, BEFORE any DEV geometry (98001 to 98024) or HELD geometry (99001 to 99024) was flown)

None of this changes a rule, a bar, a count, an arm or a forecast of sections 2 to 5; it fills in what the registration left unsaid, and it is written here so that it is dated before any data.

1. **Fewer than 3 finders.** "Most" (at least n' - 1 of n') and "few" (at most 1) overlap when n' is 2 or less, so a label there would contradict itself. **For n' below 3 the four labels are `n/a`** and the command prints them so; R0 fails at n' below 4 in any case, and the readings of the note are then not made. For n' of 3 or more nothing is different.
2. **What the command does.** `smoke` flies geometries 1 to 4 and is never recorded. `dev` flies 98001 to 98024 and prints; it may be run without `--write` (DEV is free to read) and `dev --write` records `brain/subEvadeDev.json` once (a second record is refused). `held --write` is the only way to fly 99001 to 99024: it refuses without `--write`, refuses if `brain/subEvadeHeld.json` exists, and refuses unless `brain/subEvadeDev.json` exists, is a record of the `dev` set (not of smoke) and says R0 held. The record's `set` is the set that was flown.
3. **The two extra flights of the void-checks.** Section 4 lists a check that G with its own triple has an edge of exactly 0 against G and one that an unmodified finder's edge equals the same `matchup` called on the finder directly. They are flown with the arms: one identity matchup and five direct ones a set (six more matchups, 25 percent more duels). A failed check is printed, not weighed, makes the exit code 1, and the record is still written (as in the other commands).
4. **Printed besides the rules** (all of it for reading, none of it a rule): each arm's edge in seat A and in seat B; the median share of the finder's own edge for GT, LT, GN and LN over F'; and the median edge of each kind over the five (the forecast "the median GT edge is at least half the median U edge" is read from the last line).
5. **What smoke is and is not.** Geometries 1 to 4 are among the geometries (1 to 8) on which every league and exploiter was TRAINED, so the smoke output says the command runs and says nothing about the claim; I saw it (all 25 arms flew, the checks passed) and **the forecasts of section 5 stand as written and will be scored as written.**

## DEV RESULT (2026-11-15; `node tools/ship/takeEvadeTurn.mjs dev --write`, 79 s, geometries 98001 to 98024, both seats, 48 duels an arm, 25 arms; `brain/subEvadeDev.json`; the checks passed; the gate `tools/ship/takeEvadeTurn-selfcheck.mjs` passed, its sabotage log is in its header)

The edge of each arm over generation 0 (z in brackets; **F** = the arm finds, edge >= 0.5 and z >= 2):

| finder | U unmodified | GT triple on G | LT triple off the finder | GN turn on G | LN turn off the finder |
|---|---|---|---|---|---|
| league7001 | +3.09 (23.2) F | +3.10 (23.3) F | -0.28 (-1.4) | +0.97 (3.2) F | -0.27 (-1.4) |
| league7100 | +3.10 (23.2) F | +3.11 (23.3) F | -0.28 (-1.4) | +0.84 (2.9) F | -0.27 (-1.4) |
| league7103 | +1.03 (2.8) F | +1.51 (4.5) F | -0.56 (-2.1) | +0.97 (3.2) F | -0.56 (-2.1) |
| exploit7200 | +3.10 (23.2) F | +3.10 (23.3) F | -0.28 (-1.4) | +0.97 (3.2) F | -0.27 (-1.4) |
| exploit7204 | +2.98 (16.1) F | +3.11 (23.2) F | +0.00 (0.5) | +0.70 (2.6) F | +0.00 (54.0) |

**R0 holds: 5 of 5 unmodified finders find on a fresh set** (the selection effect did not take them below the bar; league7103 is the weakest, at +1.03 where it was +1.64 on 96001 to 96024). **By the registered rules on DEV: R1 the triple is SUFFICIENT (5 of 5 grafts find), R2 NECESSARY (5 of 5 lesions stop finding), R3 the turn is SUFFICIENT (5 of 5), R4 NECESSARY (5 of 5): "it is the turn".** The command's last line: HELD may be flown. DEV is a calibration and the rules are about HELD; none of the forecasts of section 5 beyond the first is scored on it, and they stand as written.

**What the table shows that the labels do not (read from DEV, free to read; nothing here moves a rule).** (1) **The triple carries the whole edge and the turn carries a third of it.** GT is 1.00 of the finder's own edge (median share; the grafts equal the unmodified edges to 0.01 in three of five, +0.13 more for exploit7204 and +1.51 against +1.03 for league7103), LT is -0.09 (taking the triple off a finder leaves it where generation 0 is, with a little of the seat effect). **GN is 0.31 of the edge** (median; +0.70 to +0.97 against about +3.1 for the four strong finders; 0.95 only for league7103). So the registered bar (edge 0.5 at z 2) calls the turn alone SUFFICIENT and a share of 0.31 says it is a third of the doctrine; the bar is low enough for a part to cross it, and a reading that stops at "sufficient" would be too kind. **The turn is the necessary part** (LN is -0.28, the same as LT: put generation 0's turn back and the finder is generation 0's equal, to the second decimal) **and not the whole of the sufficient part** (the speed and the time are the other two thirds, on this set). (2) **The seat.** In the arms of the four strong finders (U and GT) the seat A and seat B edges are of the same size (about +3.04 and +3.15; league7103 is apart even with its own triple, +1.42 and +0.63), and with only the turn on they part (GN: +1.98 in seat A, -0.04 to -0.57 in seat B): the turn alone wins from the seat that starts with the enemy ahead and holds even from the other; with the triple the doctrine wins from both. (3) **exploit7204's lesions are a draw to the hundredth** (+0.000 and +0.005, 24-0-24 each): its two lesioned boats are indistinguishable from generation 0 on all 24 geometries, seat A +1.97 and seat B -1.96.

**DEV is not scored and HELD is next**: `node tools/ship/takeEvadeTurn.mjs held --write`, flown once on 99001 to 99024 (the command refuses without this DEV record, which exists and replicates). No amendment is made after DEV.

*(2026-11-15, a correction to the DEV result above, made after HELD was flown and not changing any number: two sentences of paragraph (1) and (2) overstated the pattern and are corrected in place: the grafts equal the unmodified edges in three of five finders, not four; and the seat edges are alike in the four strong finders' arms, not in every arm that finds.)*

## HELD RESULT (2026-11-15; `node tools/ship/takeEvadeTurn.mjs held --write`, 75 s, flown ONCE, geometries 99001 to 99024, both seats, 48 duels an arm, 25 arms; `brain/subEvadeHeld.json`; the checks passed; flown because DEV replicated, as registered and as Keith asked)

The edge of each arm over generation 0 (z in brackets; **F** = the arm finds):

| finder | U unmodified | GT triple on G | LT triple off the finder | GN turn on G | LN turn off the finder |
|---|---|---|---|---|---|
| league7001 | +3.10 (23.2) F | +3.10 (23.3) F | -0.14 (-0.6) | +1.36 (4.1) F | -0.13 (-0.6) |
| league7100 | +3.08 (23.2) F | +3.11 (23.3) F | -0.56 (-1.7) | +1.23 (3.8) F | -0.55 (-1.7) |
| league7103 | +1.36 (4.2) F | +1.37 (4.2) F | -0.28 (-1.0) | +1.36 (4.1) F | -0.28 (-1.0) |
| exploit7200 | +3.08 (23.2) F | +3.10 (23.3) F | -0.42 (-1.8) | +1.36 (4.1) F | -0.41 (-1.8) |
| exploit7204 | +2.84 (12.9) F | +3.11 (23.2) F | -0.14 (-1.0) | +1.09 (3.5) F | -0.13 (-1.0) |

**R0 holds: 5 of 5 unmodified finders find on a second fresh set. R1 the triple is SUFFICIENT (5 of 5 grafts find), R2 NECESSARY (5 of 5 lesions stop finding), R3 the turn alone is SUFFICIENT (5 of 5), R4 NECESSARY (5 of 5). By the registered rule the reading is "IT IS THE TURN".** The shares of the finders' own edges (median over the five): GT 1.01, LT -0.14, GN 0.44, LN -0.13.

**The forecasts, scored (written before any geometry was flown):**

| forecast | probability | result |
|---|---|---|
| R0 holds on DEV | 90 | **yes** (5 of 5) |
| R0 holds on HELD | 88 | **yes** (5 of 5) |
| R1: the triple is SUFFICIENT on HELD | 50 | **yes** (5 of 5; INSUFFICIENT was 15) |
| R2: the triple is NECESSARY on HELD | 55 | **yes** (5 of 5; UNNECESSARY was 15) |
| R3: the turn alone is SUFFICIENT on HELD | 40 | **yes** (5 of 5, edges +1.09 to +1.36, z 3.5 to 4.1) |
| R4: the turn alone is NECESSARY on HELD | 50 | **yes** (5 of 5) |
| triple SUFFICIENT and NECESSARY together | 35 | **yes** |
| the median GT edge is at least half the median U edge | 60 | **yes** (+3.10 against +3.08: a share of 1.01) |

Eight of eight true, said, and not a triumph: every one of the uncertain forecasts fell on the same side, the lowest ones (the turn alone sufficient at 40, both halves of the triple at 35) included. I had allowed that numbers a hill climb ran to a bound might be redundant with the other nine, or need them; on 48 duels on each of two fresh sets they are neither. The first sentence of this paragraph is a statement about my priors, not about the rules, which did what they were written to do.

**What this says.** (1) **The Part B observation holds in the strong form on two sets that no run was trained or selected on.** Putting a finder's evade triple on generation 0 gives the finder's own edge (a share of 1.00 to 1.10 in all five arms, 47 of 48 duels for the three near-copies) and taking it off removes the edge: the lesioned finders are where generation 0 is or a little below it (-0.14 to -0.56, none significant at z 2; the other nine numbers are worth nothing against generation 0 once the evade numbers are not the finder's). (2) **The turn is the necessary part of it** (LN is within 0.01 of LT in every finder: put generation 0's turn back and the finder is what the triple-lesioned one is) **and the turn alone is sufficient by the bar, at 0.39 to 0.44 of the edge in four finders and 1.00 in league7103**. The registered bar (0.5, z 2) is low enough for a part of the effect to cross it, as the DEV note said, and a reading that stops at "IT IS THE TURN" would be too kind to the turn: the triple carries the doctrine and the turn is about two fifths of what the four strong finders do with it. (3) **league7103 is a different case: its turn is all of its edge** (GN +1.364, U +1.364, GT +1.370; its evadeSpeed is 3.55 against generation 0's 3.42, close to nothing moved), and the four strong finders' extra edge over the turn alone (about +1.7: +3.10 against +1.36) sits in the speed and the time. (4) **The seat shows it, post hoc and from five finders.** With only the turn on, the boat wins from seat A (+3.06) and is even to a little behind from seat B (-0.33 to -0.60); with the triple on, the four strong finders win from both seats (about +3.06 and +3.15); league7103, with its own triple, does not win from seat B (U -0.06, GT -0.32). Of the three numbers only evadeSpeed separates it from the other four (3.55 against 4.32 to 4.50; its evadeTime of 30.1 sits inside theirs, 27.8 to 33.7), so the evade speed is the best candidate for the part the turn does not carry. That is a pattern across five finders with one exception, not a result: nothing here held the speed fixed.

**Independence, said.** The five GN arms are three different boats: three finders have the same evadeTurn, 2.80, the ceiling, so their GN arms are one arm flown three times (+1.364, 34-0-14, in all three); the other two turns are 2.70 and 2.65. "5 of 5" is 3 different turns all finding. The same is partly true of the other arms: league7001, league7100 and exploit7200 are near-copies (their triples differ in the second decimal).

**Not claimed:** that the evade doctrine is good against anything but generation 0 (every arm is scored against it, as in Part B; the Part A record shows league7001 beating the other sides of the page, and that is the only other evidence there is); that the turn "causes" the edge through any mechanism (a torpedo is evaded better by running nearly straight away than by running across its path: that was not asked, and the tactician's order does only what `evadeOrder` says); that evadeSpeed carries the rest (one finder in five, nothing held fixed); a dose (nothing was read between a turn of 1.71 and 2.65); that these five finders are a sample (they are the five of fourteen runs that found, in one league recipe).

**Open, not started** (each would be its own registration): split the triple (the speed alone, the time alone, the turn with the speed); a dose of the turn between 1.71 and 2.80 on generation 0; the same grafts against an opponent that is not generation 0 (the other sides of the Part A record); the seat.

