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

