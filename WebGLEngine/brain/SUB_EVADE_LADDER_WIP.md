# Submarine duel: the ladder over the other ten numbers: what carries league7100's lead among the strong finders? (REGISTRATION 8 of the evade reads; 2026-11-16; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-15: "after pairs, let RP1 pick the ladder". RP1 came out **PARTIAL on both sets** of `brain/SUB_EVADE_PAIRS_WIP.md`: the (speed, turn) pair carries league7103's losses (4 of 4 on each set) and none of league7100's lead over the other strong finders (0 of 6 grafted pairs decided). That note's registered reading of PARTIAL points here: **a ladder over the other ten numbers, restricted to the strong four**, in the manner of `SUB_EVADE_SPLIT_WIP.md` (grafts onto the weaker side, lesions from the stronger one, and a headline). A registration and nothing else: **no command, no gate and no geometry of its sets exists yet.**

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadeLadder.mjs` (the command), `tools/ship/takeEvadeLadder-selfcheck.mjs` (its gate), `brain/subEvadeLadderDev.json` and `brain/subEvadeLadderHeld.json`. It imports, and does not edit, `tools/ship/takeEvadeTurn.mjs` (`graft`, `rowOf`, `labelOf`), `tools/ship/takeSubLeague.mjs` (`loadRuns`, `decided`, `signed`) and `brain/subTournament.mjs`. The bar and the method are those of the earlier notes: a head-to-head is **decided** at an edge of 0.5 in size with z of 2 in size (`decided`); both seats, 48 geometries a set (96 duels a matchup, as in the two reads before this one: MY CHOICE, said).

## 1. What is known (read from the records; nothing here is flown again)

* **The lead to explain.** league7100 beats league7001 and exploit7204 as the finder on every set read: over league7001 by 1.07 and 1.33 (`SUB_EVADE_OPPONENT_WIP.md`, DEV and HELD) and 1.01 and 1.05 (`SUB_EVADE_PAIRS_WIP.md`), over exploit7204 by 1.02, 1.63, 1.02 and 1.22; over exploit7200 by +0.52 (not decided) and +1.11 in the opponent note and +0.67 and +0.43 (not decided) in the pairs note. exploit7200 over exploit7204 is +0.65 and +0.20 (opponent note) and +0.20 and +0.71 (pairs note); exploit7200 and league7001 are not stably ordered (the sign changes between sets), and league7001 and exploit7204 are level. **So the strong four's order is league7100 first.** Their edges against G differ by a few tenths.
* **The pair does not carry it** (`SUB_EVADE_PAIRS_WIP.md`): grafted onto G, the four strong finders' (evadeSpeed, evadeTurn) pairs are interchangeable (12 of 12 pairs undecided on two sets, the largest |edge| 0.13); league7100's graft is level with league7001's (+0.067 and -0.032) and with exploit7204's (+0.034 and +0.095), where the finders are 1.0 to 1.6 apart. **The 2 x 2 of the two pairs is NEITHER on both sets.** The same grafts DO carry league7103's losses (its pair is near G's speed).
* **The other ten numbers of the finders** (read from the files; the pair is in `SUB_EVADE_PAIRS_WIP.md`, the evade time is the last row):

| number | G | league7100 | league7001 | exploit7200 | exploit7204 | league7103 |
|---|---|---|---|---|---|---|
| searchSpeed | 4.50 | 4.09 | 3.83 | 4.30 | 3.31 | 4.14 |
| trackSpeed | 4.43 | 3.15 | 4.07 | 4.50 | 4.50 | 4.50 |
| fireRange | 457.7 | 460.4 | 428.2 | 426.7 | 412.2 | 373.4 |
| aimTol | 0.465 | 0.371 | 0.329 | 0.484 | 0.465 | 0.537 |
| pingAfter | 1 | 2 | 1 | 1 | 1 | 1 |
| echoWindow | 13.7 | 18.1 | 19.6 | 8.2 | 11.0 | 18.0 |
| blindSnr | 66.2 | 47.0 | 80.9 | 51.4 | 77.7 | 15.0 |
| pingEvery | 4.0 | 8.31 | 4.00 | 8.17 | 4.00 | 5.91 |
| searchPing | 7.69 | 0.00 | 0.00 | 0.01 | 8.28 | 7.13 |
| evadeTime | 36.9 | 30.7 | 33.7 | 29.2 | 27.8 | 30.1 |

* **What the table looks like, said as a hypothesis from a table and not as a result:** three numbers split the strong four the way their order does: `pingEvery` (league7100 8.31 and exploit7200 8.17 against league7001 and exploit7204 at the bound 4.00), `blindSnr` (the two leaders at 47.0 and 51.4 against 80.9 and 77.7) and, less cleanly, `searchSpeed`. **The ladder below is by groups of numbers chosen by function, written before any of its results, and tests every group; these three are not picked out.**
* **What has not been flown:** any of these ten numbers grafted or lesioned (the evade three were; the time was inert against G only), and any graft of numbers onto a finder (all grafts so far were onto G).

## 2. The question and the arms

**The question.** Among the four strong finders, **which of league7100's other ten numbers carry its lead over the finder it leads, and does the set of ten carry all of it?**

**The groups of the ten numbers (by function; MY CHOICE, fixed now):** **M** movement: searchSpeed, trackSpeed. **W** weapon: fireRange, aimTol. **P** pinging: pingAfter, pingEvery, searchPing. **L** listening: echoWindow, blindSnr. **T** time: evadeTime. (The pair, evadeSpeed and evadeTurn, is never grafted: each side keeps its own.)

**Comparators: league7001 and exploit7204** (the two the lead is decided over on every set; exploit7200 is the weaker claim and is not used). For each comparator c, with U(x) the finder x unmodified, every arm below is flown against its own base, both seats, 48 geometries:

| arm | what it is | flown against | read |
|---|---|---|---|
| LEAD | U(league7100) | U(c) | the lead to explain |
| GRAFT(g, c) for g in M, W, P, L, T | U(c) with league7100's numbers of group g | U(c) | **SUFFICIENT** iff the graft beats U(c), decided |
| LESION(g, c) | U(league7100) with c's numbers of group g | U(league7100) | **NECESSARY** iff U(league7100) beats it, decided |
| ALL(c) | U(c) with all ten of league7100's other numbers (its pair kept) | U(c) | the ten SUFFICIENT iff decided |
| LESALL(c) | U(league7100) with all ten of c's other numbers (its pair kept) | U(league7100) | the ten NECESSARY iff decided |

**13 matchups a comparator, 26 a set.** A group whose numbers are the same in the two finders gives an arm identical to its base (an edge of exactly 0): printed as such, never decided.

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read.
* **DEV**: **114001 to 114048**, both seats; flown first, read freely, recorded once in `brain/subEvadeLadderDev.json`; it decides whether HELD is spent (R0).
* **HELD**: **115001 to 115048**, both seats; flown ONCE (`held --write`; refuses without a recorded DEV that replicates and lists no failed check, without `--write`, or if its record exists); the rules are about HELD.
* No submarine file uses 114001 to 115048 as a geometry (searched as whole numbers in the `.mjs` and `.md` files under `brain` and `tools`: the hits are in files that are not about the submarine). The sets 98001 to 113048 are spent.
* **Amendments:** as in the other notes: only dated, only before this note's HELD, said why. **Every void-check below is an identity or a file's own number, and the command's HELD gate refuses a DEV with a failed check**, both said now.
* **The order of work:** this note, the command, its gate with a sabotage log (never flying 114001 to 115048), smoke, DEV, then HELD if R0 holds and Keith asks.

## 4. The rules (MY CHOICES, said; Keith may set them differently)

* **R0 REPLICATES** iff, on the set read, LEAD is decided for both comparators (league7100 over league7001 and over exploit7204, each at an edge of 0.5 and z of 2). On DEV, if R0 fails HELD is not flown by this registration. (Decided on every earlier set: 1.01 to 1.33 and 1.02 to 1.63.)
* **A group g is SUFFICIENT** iff GRAFT(g, c) is decided in the graft's favour for **both** comparators; **NECESSARY** iff LESION(g, c) is decided against the lesion (U(league7100) wins) for **both**. A group decided for one comparator only is **ONE**, for none **NONE**. The same for the ten together (ALL and LESALL).
* **RL1 THE TEN CARRY THE LEAD:** ALL is SUFFICIENT and LESALL NECESSARY (for both comparators in each).
* **RL2 THE HEADLINE**, read in this order, the first that holds: **"THE TEN ARE NOT THE LEAD"** iff ALL is not SUFFICIENT for both comparators (the lead then needs the pair, or the other finder's own numbers in a way a graft cannot show); **"ONE GROUP: g"** iff RL1 holds and exactly one group is SUFFICIENT; **"SEVERAL GROUPS: ..."** iff RL1 holds and two or more are SUFFICIENT; **"NO GROUP ALONE"** iff RL1 holds and no group is SUFFICIENT.
* **RL3 THE NECESSARY GROUPS:** the groups that are NECESSARY, listed (the lesions' own reading; not a headline).
* **The readings** (written now): "ONE GROUP: g" says league7100's lead over the finders it leads is in that group's numbers, and the next read splits the group's numbers; "NO GROUP ALONE" says the lead is spread or interacting (two groups or more together), and the next read is the pairs of groups; "THE TEN ARE NOT THE LEAD" says the pair is needed with them (an interaction the pairs note did not show) and the next read grafts the pair as well.
* **Reported with the read, not in a rule:** each arm's edge (se, z, wins-draws-losses, per-seat edges); the share of the lead each GRAFT recovers (its edge over the lead of league7100 over c); the identical arms; and **the forecast quantities of section 5 as yes/no**, so they are scored from the printed line.
* **Checks that void the read, said and not weighed. Every one is an identity or a file's own number:** every matchup flew the set's geometries (each seed twice); no non-finite score; every theta one `clampTheta` leaves unchanged; every run's generation 0 is G; **a side against a copy of itself (U(league7100)) has an edge of exactly 0**; **each U side is the finder's final theta of the files**; **each GRAFT, LESION, ALL and LESALL arm is exactly its base with the donor's numbers of the group and no other number moved** (checked against the files' thetas); the groups are the ten numbers, each once.

## 5. Forecasts, written before any geometry of any of the two sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **90** |
| R0 holds on HELD | **88** |
| RL1: the ten carry the lead (ALL sufficient and LESALL necessary, both comparators) | **60** |
| the headline is "THE TEN ARE NOT THE LEAD" | **25** |
| the headline is "ONE GROUP" (any) | **25** |
| the headline is "SEVERAL GROUPS" | **20** |
| the headline is "NO GROUP ALONE" | **30** |
| group P (pinging) is SUFFICIENT | **30** |
| group L (listening) is SUFFICIENT | **25** |
| group M (movement) is SUFFICIENT | **20** |
| group W (weapon) is SUFFICIENT | **5** |
| group T (time) is SUFFICIENT | **4** |

Why these: the lead is 1.0 to 1.6 in every read and the pair, the one thing that was grafted so far, carries none of it, so the ten (with the pair kept) carry it unless the lead is an interaction of the pair and the ten (60; 25 for the headline that says it is not); a single group carrying a lead as large as a point against a side that differs in all ten is the less likely of the outcomes (the lead is likely spread over pinging and listening, which the table splits, and movement), so "NO GROUP ALONE" is the single likeliest headline (30) and any one group's sufficiency is a third or less; weapon and time are given little because the time was inert against G and the finders' fire range and aim tolerance are alike across the strong four (fire range 412 to 460, aim tolerance 0.33 to 0.48, no tier).

## 6. What a result would not say

* **A mechanism.** Whether a group wins by pinging more or less, hearing more or less, or searching faster is not asked, and the events (`fire`, `hit`, `ping`) are not read.
* **That a group's sufficiency is the group's only role:** a graft onto league7001 or exploit7204 is the donor's numbers in a side whose other numbers (and pair) are not league7100's; "SUFFICIENT" says the group is enough there, not that it is enough on every side; "NECESSARY" is the same on league7100's side.
* **Anything about an interaction of groups:** only single groups and the whole ten are flown; "NO GROUP ALONE" is exactly the reading that more is needed, not which.
* **The finders' lead over exploit7200 or over G, or against an opponent but the finders** (the opponent note reads three tacticians), **or a set of 24 geometries.**
* **That the two comparators are independent:** they share league7100's side and the geometries; the effective number of independent strong finders is nearer three than four.

## 7. Cost

26 matchups of 96 duels a set, about three minutes of one core; the command, its gate and a sabotage pass are the work.

## AMENDMENT A (2026-11-16; made while the command `tools/ship/takeEvadeLadder.mjs` was written and smoke-run on geometries 1 to 4, BEFORE any DEV geometry (114001 to 114048) or HELD geometry (115001 to 115048) was flown)

No rule's bar, no arm, no group and no forecast is changed; item 8 says something about what I saw and the rest fill in what the registration left unsaid.

1. **What it imports, exactly:** `graft` and `rowOf` (`takeEvadeTurn.mjs`); `loadRuns`, `decided`, `signed`, `FIND_EDGE` and `FIND_Z` (`takeSubLeague.mjs`). It does not import `labelOf` (the labels here are BOTH, ONE and NONE over two comparators, not the "most" and "few" of the other notes).
2. **Names and ids.** The matchups are `LEAD:c`, `GRAFT:g:c`, `LESION:g:c`, `ALL:c` and `LESALL:c`; the sides `U:c`, `U:c+g` (a graft; `U:c+ten` for ALL), `U:league7100-g` (a lesion; `U:league7100-ten` for LESALL). **The arm (or the leader) is always the first side**, so a positive edge is the arm's, and SUFFICIENT is a decided positive edge and NECESSARY a decided negative one (the base beats the lesion).
3. **Rules as coded.** SUFFICIENT and NECESSARY are counted over the two comparators and labelled BOTH (2), ONE (1) or NONE (0); RL1 is ALL sufficient for both and LESALL necessary for both; RL2 reads in the registered order, with **one case added that the registration left unsaid: "NO HEADLINE"** when ALL is sufficient for both comparators and LESALL is not necessary for both (RL1 fails but the ten are not "not the lead"), as the seat note's "no headline"; RL3 lists the groups necessary for both, in the order M, W, P, L, T. "SEVERAL GROUPS" lists the sufficient groups in that order.
4. **Identical arms.** A matchup whose two thetas are the same (a group whose numbers are equal in donor and base) is flagged `identical` from the thetas, printed so, and never decided (its edge is exactly 0).
5. **The checks as coded, in this order** (every one an identity or a file's own number): every matchup flew the set's geometries (each seed twice); no non-finite score; every theta of both sides of every matchup one `clampTheta` leaves unchanged; every run's generation 0 is G; two equal thetas (U(league7100) against a copy) have an edge of exactly 0; **every lower side is the finder's final theta of the files, and the leader of the LEAD matchup is league7100's**; **every arm is exactly its base with the donor's numbers of the group** (which also says no other number moved). **"The groups are the ten numbers, each once" is not a check of its own:** the groups are frozen constants and the gate pins them to the letter, so a check on them could not fail on any flight. A failed check is printed, not weighed, makes the exit code 1, and the record is still written.
6. **The HELD gate** refuses a DEV record whose `checks` is not an empty list (or records none), as in the speed note's Amendment A item 1; the DEV run prints "DEV: a check FAILED, the read is void" in place of the R0 line when one failed.
7. **Printed besides the rules**, as section 4 says: each arm's edge, se, z, wins-draws-losses and seat edges, its status (decided for or against the first side, not decided, identical), the share of the lead a GRAFT or ALL recovers (its edge over the lead of league7100 over that comparator), the group table (SUFFICIENT and NECESSARY, BOTH / ONE / NONE) and the forecast quantities of section 5 as yes/no, by these names: `RL1`, `headline THE TEN ARE NOT THE LEAD`, `headline ONE GROUP`, `headline SEVERAL GROUPS`, `headline NO GROUP ALONE`, `group P sufficient`, `group L sufficient`, `group M sufficient`, `group W sufficient`, `group T sufficient` ("R0 holds" is the DEV line and the R0 line).
8. **What smoke is and is not, and what I saw.** Geometries 1 to 4 are among those (1 to 8) on which every league was TRAINED, and a smoke matchup is 8 duels, so a smoke read says nothing about the claims. **I saw the smoke report, and its headline was "ONE GROUP: M" (movement: searchSpeed and trackSpeed), with LESION:M the exact reverse of the lead over both comparators and every other group NONE.** I say so because it is a headline seen before DEV, on training geometries at 8 duels a matchup; **the forecasts of section 5 (group M sufficient at 20, "ONE GROUP" at 25) stand as written and are scored as written.** The command ran in 18 s and no check failed; a DEV read is 48 geometries, 12 times the smoke's duels: about three minutes.

## DEV RESULT (2026-11-16; `node tools/ship/takeEvadeLadder.mjs dev --write`, geometries 114001 to 114048 (96 duels a matchup), exit 0; record `brain/subEvadeLadderDev.json`: 26 matchups)

DEV is free to read; HELD (115001 to 115048) was authorised by Keith to follow this read ("fly DEV and HELD"), and the registration allows it: R0 held and no check failed (none printed; the HELD gate of Amendment A item 6 accepts this record). Forecasts are not scored on DEV except "R0 holds on DEV" (90): **TRUE**. The others stand as written for HELD.

**R0 holds.** league7100 beats league7001 by **+1.016** (z 7.3, 47-34-15) and exploit7204 by **+0.899** (z 4.1, 49-26-21), both decided.

**The ladder, against each comparator** (an arm's edge over its own base; GRAFT and ALL: the comparator with league7100's numbers, against the comparator; LESION and LESALL: league7100 with the comparator's numbers, against league7100; "share" is the graft's edge over the lead):

| arm | against league7001 | share | against exploit7204 | share |
|---|---|---|---|---|
| LEAD (league7100 over c) | **+1.016** (z 7.3) | | **+0.899** (z 4.1) | |
| GRAFT M (searchSpeed, trackSpeed) | **+0.888** (z 8.1) | **0.87** | **+0.752** (z 5.1) | **0.84** |
| GRAFT W (fireRange, aimTol) | +0.068 | 0.07 | -0.137 | -0.15 |
| GRAFT P (pingAfter, pingEvery, searchPing) | +0.159 | 0.16 | -0.077 | -0.09 |
| GRAFT L (echoWindow, blindSnr) | +0.031 | 0.03 | -0.097 | -0.11 |
| GRAFT T (evadeTime) | +0.005 | 0.01 | +0.066 | 0.07 |
| LESION M | **-0.757** (z -5.2) | | **-0.639** (z -4.0) | |
| LESION W, P, L, T | +0.000, +0.037, +0.032, -0.032 | | +0.138, +0.069, -0.028, +0.063 | |
| ALL (the ten) | **+0.926** (z 6.8) | 0.91 | **+0.670** (z 3.1) | 0.75 |
| LESALL | **-0.915** (z -6.4) | | **-0.923** (z -4.4) | |

**RL1 THE TEN CARRY THE LEAD: yes** (ALL sufficient for both, LESALL necessary for both). **RL2 THE HEADLINE: ONE GROUP: M.** **RL3 the necessary groups: M.** Groups: **M SUFFICIENT BOTH, NECESSARY BOTH**; W, P, L and T NONE and NONE (every one of their eight grafts is within 0.16 of 0 and none is decided; their lesions are within 0.14). A graft of M alone recovers 0.87 and 0.84 of the lead, the ten together 0.91 and 0.75.

**The forecast quantities as printed** (scored on HELD, not here): RL1 yes; headline THE TEN ARE NOT THE LEAD no; ONE GROUP yes; SEVERAL GROUPS no; NO GROUP ALONE no; group P sufficient no; L no; **M yes**; W no; T no.

**Said plainly about this read:** the smoke report I saw before DEV (Amendment A item 8) had the same headline, ONE GROUP: M, on four training geometries at 8 duels a matchup. That is not independent evidence of anything, and DEV is a different set of 48 geometries, but I **saw the smoke headline before writing any DEV rule down as read**, and the registered forecasts for HELD (M sufficient at 20, "ONE GROUP" at 25, "NO GROUP ALONE" the likeliest at 30) are scored on HELD as written.

**Observations (DEV, for reading, not rules):**

1. **The lead sits in two numbers, and not in pinging or listening.** The finders' table suggested `pingEvery` and `blindSnr` (the two numbers that split the strong four into tiers); on this set the pinging and listening groups carry **nothing** (their grafts are +0.16 to -0.10, undecided). The group that does is movement: league7100's **trackSpeed is 3.15 against the others' 4.07 to 4.5** (the slowest tracker of the five finders) and its searchSpeed 4.09 lies between league7001's 3.83 and exploit7200's 4.30. **The table's tier reading was wrong on this set, which is what a test is for.**
2. **The lesions say the same from the other side:** removing league7100's movement numbers (giving it league7001's or exploit7204's) costs it -0.76 and -0.64, the whole lead; removing any other group costs nothing decided.
3. **The ten together recover most but not all** (0.91 and 0.75 of the lead): the rest is spread or sits in the interaction of the pair with the ten, which this read does not look at; the movement group alone recovers 0.87 and 0.84.
4. **Lesion matchups against league7100 are mostly draws for the four groups that do not matter** (13-70-13, 14-69-13, 13-71-12, 12-71-13): the arms and league7100 play alike in 70 of 96 duels.

**What is NOT shown:** which of M's two numbers carries it (not asked: searchSpeed and trackSpeed were one group by function); any HELD read; anything against an opponent but the strong finders and a graft that is not league7100's. R0 held and no check failed, so HELD may be flown.
