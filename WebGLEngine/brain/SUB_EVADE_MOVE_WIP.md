# Submarine duel: which movement number carries league7100's lead, and is pinging a second piece? (REGISTRATION 9 of the evade reads; 2026-11-16; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-16: "lets do the next suggested round, and then the next 2 suggested rounds after that". This is the next one: the split that `brain/SUB_EVADE_LADDER_WIP.md` (its HELD RESULT) named: **searchSpeed against trackSpeed** inside the movement group that carried league7100's lead, and **the three pinging numbers** (pingAfter, pingEvery, searchPing), whose group came out undecided at +0.41 and +0.48 on HELD. A registration and nothing else: **no command, no gate and no geometry of its sets exists yet.**

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadeMove.mjs` (the command), `tools/ship/takeEvadeMove-selfcheck.mjs` (its gate), `brain/subEvadeMoveDev.json` and `brain/subEvadeMoveHeld.json`. It imports, and does not edit, `tools/ship/takeEvadeTurn.mjs` (`graft`, `rowOf`), `tools/ship/takeSubLeague.mjs` (`loadRuns`, `decided`, `signed`) and `brain/subTournament.mjs`. The bar and the method are those of the ladder note, which this is a split of: a head-to-head is **decided** at an edge of 0.5 in size with z of 2 in size; both seats, 48 geometries a set (96 duels a matchup).

## 1. What is known (read from the records; nothing here is flown again)

* **The lead and the ladder** (`SUB_EVADE_LADDER_WIP.md`, DEV 114001 and HELD 115001): league7100 beats league7001 and exploit7204 by +1.02 and +0.90 (DEV) and +1.11 and +1.28 (HELD). Its movement numbers (searchSpeed, trackSpeed), grafted onto either comparator, recover **0.87 and 0.84 (DEV) and 0.80 and 0.61 (HELD)** of the lead, decided every time; taken out of league7100 they cost it **-0.76, -0.64, -0.70 and -0.81**. Weapon, listening and time carry nothing. **Pinging** (pingAfter, pingEvery, searchPing) is undecided: +0.16 and -0.08 on DEV, **+0.41 (z 2.5) and +0.48 (z 3.0) on HELD**, with the ten together recovering 0.97 and 0.90 where movement alone recovers 0.80 and 0.61.
* **The numbers** (from the files): searchSpeed league7100 4.09, league7001 3.83, exploit7204 3.31; **trackSpeed league7100 3.15** (the slowest of the five finders), league7001 4.07, exploit7204 4.50; pingAfter league7100 2, both comparators 1; pingEvery league7100 8.30, league7001 4 (the lower bound), exploit7204 4 (G 4); **searchPing league7100 0 exactly, league7001 0 exactly, exploit7204 8.28**. So **the searchPing (Q) graft onto league7001, and the Q lesion against league7001, are identical to their bases (an edge of exactly 0, printed `identical`, never decided)**: Q can be decided against exploit7204 only, and so is at most ONE, never BOTH (see section 4).
* **Nothing has been flown with one of these five numbers alone.**

## 2. The question and the arms

**The question, two parts.** **Part A:** of league7100's two movement numbers, which carries the lead: searchSpeed, trackSpeed, or both only together? **Part B:** is pinging a second piece, and if so which of its three numbers?

**The units (MY CHOICE, fixed now):** the five single numbers **S** searchSpeed, **K** trackSpeed, **A** pingAfter, **E** pingEvery, **Q** searchPing, and three sets of them: **M** (S and K), **P** (A, E and Q), **MP** (all five). For each comparator c (league7001, exploit7204), every arm against its own base, both seats, 48 geometries, the arm or the leader first:

| arm | what it is | flown against |
|---|---|---|
| LEAD | U(league7100) | U(c) |
| GRAFT(u) for u in S, K, A, E, Q | U(c) with league7100's number u | U(c) |
| LESION(u) | U(league7100) with c's number u | U(league7100) |
| GRAFT(M), GRAFT(P), GRAFT(MP) | U(c) with league7100's numbers of the set | U(c) |

**14 matchups a comparator, 28 a set.** Every other number, and each side's (speed, turn) pair, stays the side's own. An arm whose number is the same in the two finders is identical to its base (an edge of exactly 0), printed as such and never decided: **by the files' own numbers that is the two Q arms against league7001** (both are searchPing 0), and no other single-number arm (S, K, A and E differ in both pairs); the set arms differ as long as one number in the set does.

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read.
* **DEV**: **116001 to 116048**, both seats; flown first, read freely, recorded once in `brain/subEvadeMoveDev.json`; it decides whether HELD is spent (R0).
* **HELD**: **117001 to 117048**, both seats; flown ONCE (`held --write`; refuses without a recorded DEV that replicates and lists no failed check, without `--write`, or if its record exists); the rules are about HELD.
* No submarine file uses 116001 to 117048 as a geometry (searched as whole numbers in the `.mjs` and `.md` files under `brain` and `tools`). The sets 98001 to 115048 are spent.
* **Amendments:** as in the other notes: only dated, only before this note's HELD. **Every void-check is an identity or a file's own number, and the command's HELD gate refuses a DEV with a failed check.** **If a smoke report is read, its headline is said in Amendment A before any DEV geometry.**
* **The order of work:** this note, the command, its gate with a sabotage log (never flying 116001 to 117048), smoke, DEV, then HELD if R0 holds and Keith asks.

## 4. The rules (MY CHOICES, said; Keith may set them differently)

* **A unit u is SUFFICIENT** iff GRAFT(u, c) beats U(c) decided (an edge of 0.5 and z of 2, in the graft's favour) for **both** comparators; **NECESSARY** iff U(league7100) beats LESION(u, c) decided for both. A unit decided for one comparator only is ONE, for none NONE (as in the ladder). **Because Q's two arms against league7001 are identical, Q is at most ONE by construction: it cannot be SUFFICIENT or NECESSARY in the sense above, and is reported as `Q: ONE (exploit7204 only)` or `Q: NONE`; the other four single numbers can be BOTH.**
* **R0 REPLICATES** iff LEAD is decided for league7100 over both comparators. On DEV, if R0 fails HELD is not flown by this registration.
* **RM1 THE MOVEMENT SET REPLICATES:** GRAFT(M) is SUFFICIENT (both comparators): the ladder's finding on new geometries.
* **RM2 THE HEADLINE OF PART A**, in this order, the first that holds: **"MOVEMENT DOES NOT REPLICATE"** iff RM1 fails; **"TRACKSPEED"** iff K is SUFFICIENT and S is not; **"SEARCHSPEED"** iff S is SUFFICIENT and K is not; **"BOTH"** iff both are; **"NEITHER ALONE"** iff neither is (the pair carries it only together).
* **RM3 THE NECESSARY UNITS:** the units NECESSARY for both comparators, listed (S, K, A, E, Q order).
* **RP1 PINGING IS A SECOND PIECE** iff GRAFT(P) is SUFFICIENT (decided in the graft's favour for both comparators); **RP2 THE PINGING UNITS** lists A and E that are SUFFICIENT (both comparators) and says whether Q's graft onto exploit7204 is decided (the only comparator where it differs).
* **Reported with the read, not in a rule:** each arm's edge (se, z, wins-draws-losses, seat edges, status, the share of the lead a graft recovers); **the share of GRAFT(MP) against GRAFT(M)** (what pinging adds to movement); **the forecast quantities of section 5 as yes/no**.
* **Checks that void the read, said and not weighed. Every one is an identity or a file's own number:** every matchup flew the set's geometries (each seed twice); no non-finite score; every theta one `clampTheta` leaves unchanged; every run's generation 0 is G; **U(league7100) against a copy of itself has an edge of exactly 0**; **every lower side is the finder's final theta of the files, and the leader of the LEAD matchup is league7100's**; **every arm is exactly its base with the donor's numbers of the unit or set and nothing else moved.**

## 5. Forecasts, written before any geometry of any of the two sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **90** |
| R0 holds on HELD | **88** |
| RM1: the movement set replicates (GRAFT(M) sufficient) | **85** |
| the headline is "TRACKSPEED" | **40** |
| the headline is "SEARCHSPEED" | **10** |
| the headline is "BOTH" | **20** |
| the headline is "NEITHER ALONE" | **15** |
| the headline is "MOVEMENT DOES NOT REPLICATE" | **15** |
| K (trackSpeed) is NECESSARY for both comparators | **50** |
| RP1: pinging is a second piece (GRAFT(P) sufficient) | **20** |
| E (pingEvery) is SUFFICIENT | **10** |
| A (pingAfter) is SUFFICIENT | **3** |
| Q's graft onto exploit7204 is decided in its favour (Q cannot be BOTH) | **10** |

Why these: the movement group carried the lead on both sets by large margins (0.6 to 0.9 of it, and the whole lead when removed), so I give it 85 to replicate; league7100's trackSpeed is the one number that is unlike every other finder's (3.15 against 4.07 to 4.50), so it is the likeliest single carrier (K sufficient is the sum of the TRACKSPEED and BOTH headlines, 60), while searchSpeed (league7100's 4.09; the five finders' run from 3.31 to 4.30) is nearer the middle of what the finders chose; pinging is undecided with a graft of +0.4 to +0.5 on one set and about 0 on the other, so a decided GRAFT(P) for both comparators on HELD is not likely (20), and of its three numbers only pingEvery differs by a lot (8.30 against 4); a unit that is necessary is a stronger claim than one that is sufficient, and a lesion of league7100 loses less when more than one number carries it (50).

## 6. What a result would not say

* **A mechanism.** A slower tracker could be quieter, lose contact less, or its opposite: no event is read.
* **That a unit's sufficiency is its only role:** a graft onto league7001 or exploit7204 puts league7100's number into a side whose other numbers are not league7100's; "SUFFICIENT" says it is enough there.
* **An interaction of two units beyond the sets M, P and MP** (the pair S and K is flown as M; no other pair), **a dose of a number** (each is league7100's own value, not a graded one), **or the lead over exploit7200 or over G or against another opponent.**
* **That the two comparators are independent:** league7100 is on every arm; the effective number of independent strong finders is nearer three than four.

## 7. Cost

28 matchups of 96 duels a set, about three minutes of one core; the command, its gate and a sabotage pass are the work.

## AMENDMENT A (2026-11-16; written after the command and its gate and after the smoke run, BEFORE any geometry of the DEV set 116001 to 116048 or of HELD is flown)

**1. The smoke headline, said before any DEV geometry (the rule of section 3).** The command's `smoke` was run on geometries 1 to 4 (8 duels a matchup; never recorded; free to read). Its headline was **"TRACKSPEED"**: R0 holds on it (league7100 over league7001 +1.902, over exploit7204 +1.548); the movement set M is sufficient for both comparators (RM1 yes); **K (trackSpeed) is sufficient for both (+1.517 and +1.181) and necessary for both (-1.525 and -1.546)**; S (searchSpeed) is not sufficient and not necessary (its lesions against league7100 are exactly 0, 0-8-0, on these four geometries); A and E are not sufficient (+0.754 and +0.381 against league7001, z 1.0; about 0 against exploit7204); P is not sufficient (RP1 no); Q's graft onto exploit7204 is not decided (-0.002). Eight duels on four geometries are a smoke test and not a reading (the z values of a deterministic 4-4-0 are not evidence), and **the forecasts of section 5 stand as written before it was seen, and are scored as written; but I have seen this headline, and the 40 given to TRACKSPEED is no longer a blind number: the DEV read and HELD are the evidence, and the smoke is not counted in them.**

**2. One void-check added to section 4's list (an identity, said before data):** *an arm identical to its base has an edge of exactly 0* (a row flagged `identical` with any other edge voids the read; the two Q arms against league7001 are such rows by the files' own numbers). It is the 8th check, after the arm check, and is in the command and its gate.

**3. The report's column of set keys is padded to 53 characters** (the length of the set of five), so the three sets align; the first printing padded to 40 and misaligned MP. A formatting change, made after the first gate run and before the smoke report was pinned.

**4. What is not changed:** the units, the arms, the sets, the rules R0, RM1 to RM3, RP1 and RP2, the forecasts, the geometries, the order of work.
