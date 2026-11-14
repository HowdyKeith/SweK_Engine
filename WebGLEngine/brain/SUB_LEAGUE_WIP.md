# Submarine duel, item 7: the tournament's runner and record, and a league replicated (2026-11-13; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-13: "let's do 1, then 2, then 7" -- item 7 is `sub-tournament-runner-and-record` of `brain/BACKLOG_2026-11-01.md` section E. Item 1 is `brain/SUB_ECCM_WIP.md`, item 2 `brain/SUB_ENERGY_WIP.md`.

**What this changes in shared files, said first: nothing.** `brain/subDuel.mjs`, `brain/subTournament.mjs`, `brain/subTactics.mjs`, `tools/selfPlaySubTactics.mjs` and the page are read and imported, not edited. New files only: `tools/ship/takeSubTournament.mjs` (the runner `brain/subTournament.mjs`'s header names and nothing provides), `tools/ship/takeSubLeague.mjs` (the read of the replicated leagues), a gate for each, and the records they write.

## 1. What is known (read from the code and the notes)

* **There is a tournament and no runner.** `brain/subTournament.mjs` flies every pair of sides from both seats and rates them with `dogfightTournament`'s statistics; its header says "`tools/ship/takeSubTournament.mjs` and `sub-tournament.html` load the JSON and hand it in". The page exists; the tool is on neither `main` nor any pushed branch; there is no recorded tournament (the flight side has `tools/ship/dogfightTournament-record.json`, with `set`, `pilots`, `pairs`, `ratings`, `fieldEdge`, `seat`, `cycles`, `upsets`, `stability`). The page's roster is seven sides (`render/subTournamentView.mjs roster()`): hand, hand+net, champ, champ+net, ping, league7001, league7000.
* **The leagues are probes, said so in the note** (`brain/SUBMARINE_WIP.md`, "Search-pinging and self-play"): two leagues of 3 generations x 60 iterations on 8 geometries, from the search-ping champion; league 7001 found a counter-doctrine (generations 2 and 3 beat generation 0 by 1.4 to 1.7 in cross-play: stop pinging blind, aim tighter, evade harder), league 7000 found nothing (its generations lose to generation 0 by 0.0 to 0.1). "A larger league, a mixed-strategy opponent pool and a significance test over seeds are needed."
* **The recipe, from `tools/selfPlaySubTactics.mjs league`:** generation 0 is the `--from` theta; generation g is a (1+1)-ES (1 to 3 numbers moved by 10 percent of their range) scored against the default and the last three generations, in both seats, on training geometries 1 to 8, started from generation g-1's champion. Output: every generation's theta. Deterministic for a seed.

## 2. Part A -- the runner and the record

`node tools/ship/takeSubTournament.mjs [--only id,id] [--geometries N] [--first SEED] [--smoke] [--record FILE]`: loads the four files the page loads (`brain/pilotSubWeightsWip.json`, `subTacticsThetaWip.json`, `subTacticsThetaSearchPingWip.json`, `subTacticsLeagueWip.json`), builds the roster with `roster()`, flies `subTournament.roundRobin` on `T.geometries(N, first)` and prints `subTournament.reportLines`, then the seat bias of each side (a side against itself, 8 geometries), the transitivity (cycles) and the upsets. `--smoke` is geometries 1 to 4, never recorded. `--record` writes the record once (a second write to the same file is refused) in the dogfight record's keys: `set`, `sides`, `pairs` (each pair's summary), `ratings`, `fieldEdge`, `seat`, `cycles`, `upsets`.

* **The recorded set:** geometries **97001 to 97024**, all seven sides, both seats (21 pairs, 48 duels a pair). Nothing else uses them.
* **Read, printed and not a rule:** the order of the seven; whether the ranking is transitive; the seat bias of each side.
* **Forecasts, written before the set is flown:** league7001 is rated first: **80**. The ranking has no cycle: **80**. Seat A is worth at least 0.5 points a duel to every side: **70**. The two network sides rate below their PD-autopilot twins: **60**. The 4-geometry impression the page gives (it defaults to 4) has the same top side as the 24-geometry record: **85**.

## 3. Part B -- the league replicated, and an exploiter

**The question.** League 7001 found a counter-doctrine and league 7000 did not. With the same recipe and eight seeds, how often does a league find one, and how exploitable is the champion that all of them start from?

* **Leagues.** Six new leagues, **seeds 7100 to 7105**, `league --gens 3 --iters 60 --from brain/subTacticsThetaSearchPingWip.json`, output `brain/subLeagueRuns/league<seed>.json`; the two of the notes (7000 and 7001, in `brain/subTacticsLeagueWip.json`) are counted with them: **eight leagues**, one recipe. (A league's generation 0 is the search-ping champion; its training geometries are 1 to 8.)
* **Exploiters.** Six runs, **seeds 7200 to 7205**, `league --gens 1 --iters 180 --from the same champion`, output `brain/subLeagueRuns/exploit<seed>.json`: generation 1 of such a run is a best response, by the same (1+1)-ES, to a pool of the default and generation 0, with three times the iterations of one generation of a league.
* **The fresh set of the read:** geometries **96001 to 96024** (24, both seats, so 48 duels a matchup). The leagues' own cross-play matrix uses geometries 1001 to 1024 and is NOT the read. Nothing else uses 96001 to 96024.
* **The read (`node tools/ship/takeSubLeague.mjs read --write`, flown ONCE):** for every league the final generation against generation 0, and for every exploiter its generation 1 against generation 0, on the fresh set: the paired edge, its standard error, z (`subTournament.matchup` with `makeSide`, so the statistics are the tournament's own).
* **A league FINDS a counter-doctrine iff its final generation beats generation 0 by an edge of at least 0.5 with z at least 2** (0.5 is half a net sinking and ten of the 0.05 net hits; a number I chose, not a measurement). **The recipe is ROBUST iff at least 6 of the 8 leagues find one, FRAGILE iff at most 2 do, MIXED otherwise.** The exploiters are read the same way: their edge over generation 0 and how many find one by the same bar, and the median of their edges against the median of the leagues'.
* **Reported with the read, not in a rule:** each theta's direction (searchPing, aimTol, evadeTurn, echoWindow, the speeds) against generation 0's, so that "a counter-doctrine" can be told apart from "a different one" across seeds; the 28 pairs' cross-play among the final generations if the leagues number 8 (are they the SAME doctrine?): printed as the edge matrix of the final generations, and whether a cycle appears.
* **Forecasts, written before any league is run:** ROBUST **25**, FRAGILE **35**, MIXED **40**. At least 4 of the 6 exploiters find a counter-doctrine **65**; the median exploiter edge is at least the median league edge **55**. The six new leagues' final generations are NOT all the same doctrine (some pair of them beats the other by 0.5 with z at least 2): **70**.
* **Checks that void the read, said and not weighed:** every run of the matchups flew the same geometries; no score is non-finite; a theta is checked against its bounds (`clampTheta` leaves it unchanged); a final generation against itself has an edge of exactly 0; all 12 run files exist and each has the recipe's shape (3 generations and 4 thetas after the default, or 1 and 2).

## 4. Cost

Part A: 1,008 duels, about a minute for the PD sides and several for the network sides. Part B: a league is 3 x 60 x 64 duels (about 10 minutes of one core), an exploiter 180 x 32 duels (about 5); twelve runs on four cores, under half an hour; the read is 14 matchups of 48 duels.

## 5. What a result would not say

That any of these doctrines is good against a real adversary: the opponents are the default and earlier generations of the same 12-number family, flown by the PD autopilot, and the family's counter-doctrine against an unmodelled opponent says nothing about it. That eight leagues of one recipe say what other recipes (a mixed-strategy pool, a larger training set, a longer league) would find: they do not, and they are named in the backlog as the next step. Nothing is tuned after the read; `AUDIT_SET` of the duel is NOT read by this note.

## PART A RESULT (2026-11-14; `node tools/ship/takeSubTournament.mjs --record brain/subTournamentRecord.json`, 45 s, flown ONCE, geometries 97001 to 97024, seven sides, both seats, 48 duels a pair, 21 pairs; `brain/subTournamentRecord.json`; the gate `tools/ship/takeSubTournament-selfcheck.mjs` passed and its sabotage log is in its header)

The order, by the rating (Bradley-Terry on the Elo scale; read DIFFERENCES) and the mean edge:

| rank | side (the page's label) | rating | mean edge | seat A is worth (a duel, 8 geometries) |
|---|---|---|---|---|
| 1 | league7001 ("league A (found a counter-doctrine), generation 4") | 599 | +3.109 | **-1.873** (se 0.830) |
| 2 | champ+net | 53 | +0.469 | +3.331 (se 0.011) |
| 3 | champ | 52 | +0.457 | +3.330 (se 0.011) |
| 4 | ping | 52 | +0.441 | +3.368 (se 0.008) |
| 5 | league7000 ("league B (did not)") | 6 | +0.047 | +3.405 (se 0.006) |
| 6 | hand+net | -292 | -2.202 | +2.521 (se 0.844) |
| 7 | hand | -312 | -2.321 | +3.350 (se 0.016) |

**The shape is three tiers and one side above them.** league7001 beats every other side in nearly every duel: 48-0-0 over league7000, 0-0-48 against it for the search-ping tactician (edge +3.238, paired se 0.008), 0-2-46 for the tuned tactician with the PD autopilot, 1-4-43 for the hand tactician; its edge over each is 2.95 to 3.28, which is about the size of the seat bias the other sides show (+3.3 a duel). The middle three (champ+net, champ, ping) are within 1 rating point of each other; league7000 is 46 below them (each of them beats it 28 to 20, edge about +0.6, z 2.2 to 2.3); against the hand tactician the four win 42 to 44 of 48. The hand tactician with and without the network ties itself (24-0-24, edge +0.000 +- 0.286), and the two tuned sides tie (24-0-24, edge -0.001 +- 0.001). **No cycle** (the significant leads are transitive) and **no upset** (no significant lead runs against the rating).

**The forecasts, scored (written before the set was flown):**

| forecast | probability | result |
|---|---|---|
| league7001 is rated first | 80 | **yes** (599; the next is 53) |
| the ranking has no cycle | 80 | **yes** |
| seat A is worth at least 0.5 a duel to every side | 70 | **NO**: six sides are worth +2.5 to +3.4; **league7001's seat A is worth -1.873** (se 0.830), a side that does better from the seat that starts BEHIND |
| the two network sides rate below their PD twins | 60 | **NO**: hand+net is 20 points ABOVE hand and champ+net 1 above champ; neither pair is a difference (24-0-24, z 0.0 and -0.7), so "below" was a forecast about the sign of a tie |
| the 4-geometry impression (the page's default) has the same top side as the 24-geometry record | 85 | **yes** (`--smoke`, geometries 1 to 4, all seven sides: league7001 first at 573; the second to fourth sides are the same three, in the same order, 40, 32, 32) |

Three right and two wrong, said. The first wrong forecast is the more interesting one: I wrote "to every side" and one side is the exception, and it is the one that wins everything.

**What this says.** The record exists, to the digit, on a set nothing else used: the order of the seven, that it is transitive, and each side's seat bias. The doctrine that league 7001 found (stop pinging blind, aim tighter, evade harder, in the notes) does not just beat generation 0 by 1.4 to 1.7 as in the 8-geometry probe: on fresh geometries it beats every other side of the page by about 3 points a duel. A side that is worth MORE from the seat that starts with the enemy outside its forward arc suggests the doctrine uses the opening differently from the others, and that the +3.3 seat bias of the table is partly an effect of how the OTHER sides play the opening, not of the geometry alone. **Not claimed:** that the doctrine is a good submarine, only that against these six opponents on these 24 geometries it wins; that a different seed's league would find it (that is Part B); that the seat bias of -1.873 is a seat effect and not one or two geometries (its se is 0.83 on 8 geometries, and which geometries was not looked at).

## PART B RESULT (2026-11-14; twelve runs flown first, `league --gens 3 --iters 60` for 7100 to 7105 and `--gens 1 --iters 180` for 7200 to 7205, 135 to 567 s each, four at a time; then `node tools/ship/takeSubLeague.mjs read --write`, 72 s, flown ONCE, geometries 96001 to 96024, both seats, 48 duels a run; `brain/subLeagueRuns/`, `brain/subLeagueRead.json`; the checks that void the read: none failed; the gate `tools/ship/takeSubLeague-selfcheck.mjs` passed and its sabotage log is in its header)

Each run's final generation against generation 0 (the search-ping champion), the paired edge, its standard error, z, and wins-draws-losses:

| run | kind | edge +- se (z) | W-D-L | finds (edge >= 0.5, z >= 2) | final evadeTurn / searchPing |
|---|---|---|---|---|---|
| league7000 | old | -0.301 +- 0.195 (-1.5) | 22-0-26 | no | 0.55 / 7.4 |
| league7001 | old | +2.964 +- 0.274 (10.8) | 46-0-2 | **yes** | 2.80 / 0.0 |
| league7100 | new | +2.981 +- 0.275 (10.9) | 46-0-2 | **yes** | 2.70 / 0.0 |
| league7101 | new | +0.397 +- 0.369 (1.1) | 27-0-21 | no | 0.40 / 3.1 |
| league7102 | new | +0.415 +- 0.231 (1.8) | 27-0-21 | no (near: z) | 1.78 / 1.2 |
| league7103 | new | +1.643 +- 0.340 (4.8) | 36-0-12 | **yes** | 2.80 / 7.1 |
| league7104 | new | -0.276 +- 0.193 (-1.4) | 22-0-26 | no | 1.88 / 1.0 |
| league7105 | new | -0.295 +- 0.194 (-1.5) | 22-0-26 | no | 1.06 / 9.0 |
| exploit7200 | exploiter | +2.965 +- 0.274 (10.8) | 46-0-2 | **yes** | 2.80 / 0.0 |
| exploit7201 | exploiter | -0.295 +- 0.194 (-1.5) | 22-0-26 | no | 0.62 / 2.3 |
| exploit7202 | exploiter | +0.008 +- 0.201 (0.0) | 24-0-24 | no | 2.58 / 26.4 |
| exploit7203 | exploiter | -0.156 +- 0.318 (-0.5) | 23-0-25 | no | 1.11 / 3.3 |
| exploit7204 | exploiter | +2.843 +- 0.221 (12.9) | 45-0-3 | **yes** | 2.65 / 8.3 |
| exploit7205 | exploiter | -0.301 +- 0.281 (-1.1) | 22-0-26 | no | 0.82 / 4.2 |

(generation 0: evadeTurn 1.71 of a ceiling of 2.80, searchPing 7.7 s.) **LEAGUES: 3 of 8 find one (the median edge +0.406), so by the rule the recipe is MIXED** (at least 6 of 8 is ROBUST, at most 2 FRAGILE). **EXPLOITERS: 2 of 6 find one, the median edge -0.074, against the leagues' +0.406.** CROSS-PLAY of the eight final generations on the same geometries: 23 of 28 pairs are decided by at least 0.5 at z 2, and there is no cycle. Among the six new leagues alone, 12 of the 15 pairs are decided.

**The forecasts, scored (written before any league was run):**

| forecast | probability | result |
|---|---|---|
| the verdict: ROBUST / FRAGILE / MIXED | 25 / 35 / 40 | **MIXED** (3 of 8); the most probable of the three came true |
| at least 4 of the 6 exploiters find a counter-doctrine | 65 | **NO**: 2 of 6 |
| the median exploiter edge is at least the median league edge | 55 | **NO**: -0.074 against +0.406 |
| the six new leagues' final generations are not all the same doctrine (some pair decided by 0.5 at z 2) | 70 | **yes**: 12 of 15 pairs |

Two right and two wrong, said. The exploiter forecasts were both wrong in the same direction: I expected a search with three times the iterations on one generation to find a best response to generation 0 more often than a three-generation league, and it found one in 2 of 6 (7200 and 7204), the same as the six NEW leagues (7100 and 7103), with a lower median edge (-0.074 against +0.406). **With eight leagues the rule cannot tell a recipe that works one time in four from one that works one time in two:** 3 of 8 has a 95 percent Wilson interval of 14 to 69 percent, and the verdict is the rule's, not a measurement of the recipe's rate.

**What the read shows beyond the rule (POST HOC: read from the printed columns after the read, over fourteen runs, NOT tested and not registered).** (1) **The notes' league 7001 replicates on fresh geometries** (+2.964, 46-0-2; in the notes it beat generation 0 by 1.4 to 1.7 on training geometries) **and league 7000's null replicates too** (-0.301, z -1.5). (2) **Three runs of different seeds and different recipes, 7001, 7100 and the exploiter 7200, land on nearly the same numbers**: search-ping 0.00, 0.00 and 0.01 s (the lower bound is 0; generation 0 is 7.7), evadeTurn 2.80, 2.70 and 2.80 (the ceiling is 2.80), evadeSpeed 4.32, 4.50 and 4.42 (the ceiling is 4.50), and each beats generation 0 in 46 of 48 duels with an edge of 2.96 to 2.98. (3) **Every one of the five runs that find has an evadeTurn of 2.65 or more**; of the nine that do not, eight are at 1.88 or less, and the ninth (exploit7202, 2.58) pings for 26 s a search, 19 s more than generation 0. So of the three phrases the notes use for the doctrine ("stop pinging blind, aim tighter, evade harder"), **only "evade harder" is in all five**: 7103 pings as much as generation 0 (7.1 s) and 7204 pings a little more (8.3 s), and aimTol moved by -0.14, -0.09, +0.02, +0.07 and 0.00 among the five. (4) The bar is not on a cliff: the nearest misses are +0.415 (z 1.8) and +0.397 (z 1.1); the five finders are at +1.64 or more. (5) In the Part A record league7001 beat every other side of the page by about 3 points a duel, and its seat A was worth -1.9; a doctrine that turns as hard as the bounds allow may be one that profits from starting behind, which is a question for the replay and not something this read tested.

**What this says and does not say.** The recipe finds a doctrine that beats the search-ping champion by about 3 points a duel in 3 of 8 leagues and 2 of 6 exploiters, and the doctrine that three of the five finders share is mostly a maximum evade turn. **Not claimed:** that it is a good doctrine against anything but generation 0 and the sides of the Part A record (league7001 is first there; nothing else was asked); that 3 of 8 is the recipe's rate (the interval is 14 to 69 percent); that "evade harder" is the cause (an evadeTurn at or near its ceiling in the 5 runs that find is what was read, and nothing was held fixed); that 180 iterations on one generation are worse than three generations of 60 (six runs against six, the bar crossed 2 times against 2 and the medians are -0.074 against +0.406: that is not a test). **Open, not started:** a registration for the claim in (3): hold the evade numbers at the doctrine's values on generation 0 and read the edge; a bigger league sample (the bar sits where 8 runs cannot separate p = 0.25 from p = 0.5).

