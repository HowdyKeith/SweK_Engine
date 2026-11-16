# Submarine duel: the reach of a slower trackSpeed (REGISTRATION 11 of the evade reads; 2026-11-16; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-16: "lets do the next suggested round, and then the next 2 suggested rounds after that". This is the third of the three. `brain/SUB_EVADE_MOVE_WIP.md` and `brain/SUB_EVADE_TRACK_WIP.md` (both DEV only; neither HELD is flown) found that a slower trackSpeed pays on **league7001 and exploit7204**, the two boats that league7100 was compared with: grafting league7100's 3.15 gives +0.92 and +1.20 (DEV 118001), and the gain peaks at 2.0 to 3.0. **Both reads used the same two bases.** This note asks whether the gain is a property of those two boats or reaches the rest of the finders and the generation 0 boat G.

**Said first, the premise of this round:** the claim that a slower trackSpeed pays rests on the DEV reads of the move and the track rounds (and the movement set's two sets in `SUB_EVADE_LADDER_WIP.md`), **not on a HELD read of either**; their HELD sets are waiting for Keith's word. This round is registered on that premise and **its replication rule (R0) re-tests the graft on league7001 and exploit7204 on its own sets**; if the HELD reads of the earlier rounds later disagree, this note's premise is weakened and its read is read in that light.

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadeReach.mjs` (the command), `tools/ship/takeEvadeReach-selfcheck.mjs` (its gate), `brain/subEvadeReachDev.json` and `brain/subEvadeReachHeld.json`. It imports, and does not edit, `tools/ship/takeEvadeTurn.mjs` (`rowOf`), `tools/ship/takeSubLeague.mjs` (`loadRuns`, `decided`, `signed`) and `brain/subTournament.mjs`. The bar and the method are those of the move and track notes: a head-to-head is **decided** at an edge of 0.5 in size with z of 2 in size; both seats, 48 geometries a set (96 duels a matchup).

## 1. What is known (read from the records; nothing here is flown again)

* **The two bases and the graft** (`SUB_EVADE_TRACK_WIP.md`, DEV): trackSpeed D (league7100's own, 3.1507) set on league7001 (4.07) pays **+0.919**, on exploit7204 (4.5) **+1.200**; 2.5 pays **+1.173** and **+1.060**; both pay at 2.0 and 3.0. (The move round's graft of D: +0.984 and +0.752.)
* **The other finders** (from the files): every other finder's trackSpeed is **4.23 to 4.5** (league7000 4.50, league7101 4.41, league7102 4.23, league7103 4.50, league7104 4.50, league7105 4.50, exploit7200 to 7203 4.50, exploit7205 4.25); **G's is 4.43**. None has been flown with a slower one.
* **What differs among them** (from the files): the finders' evade pairs (evadeSpeed, evadeTurn) range from league7103's (3.55, 2.80) to the strong four's (4.3 to 4.5, 2.65 to 2.8); G's pair is (3.42, 1.71), the weak one that the earlier evade reads found; their other numbers differ in many ways (the ladder reads covered five of them).
* **Nothing is known** of whether a boat whose other numbers differ from league7001's and exploit7204's gains from a slower tracker.

## 2. The question and the arms

**The question, two parts.** **Part A, the REACH:** on how many of 14 bases does league7100's trackSpeed (D) pay when set on the base? **Part B, the COST:** does it cost any base? And the same for **2.5**, a value inside the paying range of both known bases.

**The bases (MY CHOICE, fixed now):** the **thirteen finders other than league7100** of the files, in this order: **league7000, league7001, league7101, league7102, league7103, league7104, league7105, exploit7200, exploit7201, exploit7202, exploit7203, exploit7204, exploit7205**; then **G** (generation 0). (league7001 and exploit7204 are the two known bases and are among them.) **The arms:** for each base b, two arms flown against b, both seats, 48 geometries: **U(b) with trackSpeed D** and **U(b) with trackSpeed 2.5**, where D is league7100's trackSpeed of the files and **nothing else moves**. **28 matchups a set.** No arm is identical to its base (every base's trackSpeed is 4.23 or more).

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read.
* **DEV**: **122001 to 122048**, both seats; flown first, read freely, recorded once in `brain/subEvadeReachDev.json`; it decides whether HELD is spent (R0).
* **HELD**: **123001 to 123048**, both seats; flown ONCE (`held --write`; refuses without a recorded DEV that replicates and lists no failed check, without `--write`, or if its record exists); the rules are about HELD.
* No file under `brain` or `tools` uses 122001 to 123048 (searched as whole numbers in the `.mjs`, `.md` and `.json` files). The numbers 120001 to 121000, which the first plan for this round would have taken, are seeds of an unrelated experiment (the deep and plain read in `DEEP_PLAIN_WIP.md`, a different world), and were avoided so that no number is read twice. The sets 98001 to 119048 are spent or reserved.
* **Amendments:** as in the other notes: only dated, only before this note's HELD. **Every void-check is an identity or a file's own number, and the command's HELD gate refuses a DEV with a failed check.** **If a smoke report is read, its headline is said in Amendment A before any DEV geometry.**
* **The order of work:** this note, the command, its gate with a sabotage log (never flying 122001 to 123048), smoke, DEV; HELD only on Keith's word.

## 4. The rules (MY CHOICES, said; Keith may set them differently)

* **An arm PAYS** for its base iff it beats its base decided (an edge of 0.5 and z of 2, in the arm's favour); **COSTS** iff its base beats it decided; else NEUTRAL.
* **R0 REPLICATES** iff the arm at **D PAYS on both league7001 and exploit7204** (the track round's finding on new geometries). On DEV, if R0 fails HELD is not flown by this registration.
* **RR1 THE REACH AT D:** n is the number of the 14 bases on which the arm at D PAYS. **GENERAL** iff n is 12 or more; **COMMON** iff n is 7 to 11; **NARROW** iff n is 6 or less.
* **RR2 THE COST AT D:** the bases on which the arm at D COSTS, listed; **COSTS SOMEWHERE** iff there is one.
* **RR3 THE REACH AT 2.5:** the same count and label for the arm at 2.5.
* **RR4 THE HEADLINE:** `REACH <label at D>`, then `, COSTS SOMEWHERE` when RR2 lists a base, then ` / 2.5 <label at 2.5>`.
* **Reported with the read, not in a rule:** each arm's edge (se, z, wins-draws-losses, seat edges, status) with the base's own trackSpeed, evadeSpeed and evadeTurn beside it; **the bases on which D does not pay**; the bases on which 2.5 pays and D does not, and the reverse; **the forecast quantities of section 5 as yes/no**. **Any reading of why a base does or does not gain (its evade pair, its kind) is post-hoc and labelled so.**
* **Checks that void the read, said and not weighed. Every one is an identity or a file's own number:** every matchup flew the set's geometries (each seed twice); no non-finite score; every theta one `clampTheta` leaves unchanged; every run's generation 0 is G; **U(league7100) against a copy of itself has an edge of exactly 0**; **every lower side is its base's theta of the files (G for G)**; **every arm is exactly its base with its trackSpeed set to D or 2.5 and nothing else moved**; **D is league7100's trackSpeed of the files, marked D on exactly one arm of each base, the other arm's value being 2.5**; **the bases are exactly the thirteen finders other than league7100 and G, in the order above, two arms each**; **an arm identical to its base has an edge of exactly 0**.

## 5. Forecasts, written before any geometry of any of the two sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **90** |
| R0 holds on HELD | **88** |
| the reach at D is GENERAL (12 or more of 14) | **35** |
| the reach at D is COMMON (7 to 11) | **45** |
| the reach at D is NARROW (6 or less) | **20** |
| COSTS SOMEWHERE at D (some base is decided against) | **25** |
| the reach at 2.5 is GENERAL | **30** |
| 2.5 pays on at least as many bases as D | **50** |
| the arm at D PAYS on G | **55** |
| the arm at D PAYS on league7103 (the finder with the slower evade speed, 3.55) | **50** |

Why these: the 13 finders share most of their doctrine with the two known bases (all but one track at 4.23 to 4.5 and evade at speeds of 3.5 to 4.5 and turns of 2.65 to 2.8), and the gain on the two known bases is large (+0.9 to +1.2, well over the bar), so most bases should gain: COMMON is the likeliest label (45), GENERAL (35) needs 12 of 14 including the old league7000, the boats whose other numbers are unlike the strong four's and G. A cost is possible where a boat's tracking speed was part of a balanced doctrine (25). 2.5 is inside the paying range of both known bases at about the same edge as D, so it is a coin on whether it pays more widely (50). G has the weak evade pair (3.42, 1.71): a slower tracker may or may not still find it (55); league7103's evade speed is slower than the others' (50). R0 is near certain (90 and 88): it repeats a graft that paid +0.9 and +1.2 twice.

## 6. What a result would not say

* **A mechanism.** A slower tracker could be quieter, lose contact less, or its opposite: no event is read.
* **Any dose beyond the two values flown (D and 2.5)** or any curve; the track round has the curve on two bases.
* **The effect against an opponent that is not the boat's own base** (every arm is flown against its base, as in the earlier rounds): a boat that gains against its own twin might not against another doctrine.
* **That the 14 bases are independent:** the finders were bred from the same generation 0 in twelve runs with correlated search; the effective number of independent boats is smaller than 14.
* **Anything about the finders' other numbers**: only trackSpeed moves.

## 7. Cost

28 matchups of 96 duels a set, about three minutes of one core; the command, its gate and a sabotage pass are the work.

## AMENDMENT A (2026-11-16; written after the command was written and smoke-run on geometries 1 to 4, BEFORE any geometry of the DEV set 122001 to 122048 or of HELD is flown)

**1. A statement of this note is wrong, and is corrected here (the text above is left as committed).** Section 1 says the finders' evade pairs "range from league7103's (3.55, 2.80) to the strong four's (4.3 to 4.5, 2.65 to 2.8)", and the "Why these" paragraph of section 5 says the 13 finders "evade at speeds of 3.5 to 4.5 and turns of 2.65 to 2.8". **That is false.** The smoke report prints every base's own numbers, and they are: league7000 (evadeSpeed 3.02, evadeTurn 0.55), league7001 (4.32, 2.80), league7101 (3.04, 0.40), league7102 (2.14, 1.78), league7103 (3.55, 2.80), league7104 (3.02, 1.88), league7105 (3.65, 1.06), exploit7200 (4.42, 2.80), exploit7201 (1.66, 0.62), exploit7202 (2.18, 2.58), exploit7203 (4.15, 1.11), exploit7204 (4.35, 2.65), exploit7205 (4.50, 0.82), G (3.42, 1.71). **Only league7001, exploit7200 and exploit7204 (the strong four without league7100) have both a speed of 4.3 or more and a turn of 2.65 or more**; the earlier evade reads (`SUB_EVADE_TURN_WIP.md` and the dose reads) found the turn to be the gate. I had the finders' numbers in the files when I wrote the note and did not look at them for this paragraph. **The forecasts of section 5 stand as written and are scored as written**; with the true numbers I would have given NARROW more than 20, and I say so here so that a miss on the likeliest label is read as what it is.

**2. The smoke headline, said before any DEV geometry (the rule of section 3).** The command's `smoke` was run on geometries 1 to 4 (8 duels a matchup; never recorded; free to read). Its headline was **"REACH NARROW / 2.5 NARROW"**: R0 holds on it (the arm at D pays on league7001, +1.517, and on exploit7204, +1.181); **the arm at D pays on 3 of 14 bases: league7001, exploit7200 (+1.913) and exploit7204**; on the other eleven it is NEUTRAL, and on nine of them every duel is a draw or a seat-decided win with an edge of 0.000 to the third decimal (4-0-4 with seat A +3.4 and seat B -3.4: the same boat wins from one seat whichever trackSpeed it has); the arm at 2.5 pays on the same three; nothing costs anywhere. Eight duels on four geometries are a smoke test and not a reading, and **the forecasts stand as written before it was seen; but I have seen this headline, and the 20 given to NARROW is no longer a blind number**: the DEV read and HELD are the evidence, and the smoke is not counted in them.

**3. What the smoke shows about the design, said and not acted on:** the rules are about how many of the 14 bases gain, and an arm against its own base can gain only if the boat's tracking decides the game, which on this evidence is a property of the boats with a strong evade pair. The report prints each base's own evadeSpeed and evadeTurn beside it, so that reading is available **post-hoc and labelled**; it is not a rule, and the registered count and labels (GENERAL, COMMON, NARROW) are unchanged.

**4. A second statement of this note is imprecise, and is corrected here.** Section 2 says "every base's trackSpeed is 4.23 or more" and section 1 gives the other finders' trackSpeeds as 4.23 to 4.5. **league7001's is 4.07** (it is one of the two known bases, so section 1 named it separately); the lowest of the fourteen bases is league7001's 4.07, then league7102's 4.23. The conclusion drawn, that no arm is identical to its base, stands (every base's trackSpeed is above D, 3.15); the gate asserts it with the true bound (above 4.0).

**5. What is not changed:** the bases, the arms, the sets, the rules R0 and RR1 to RR4, the forecasts, the geometries, the order of work.

## PREMISE UPDATE (2026-11-16, after the move round's HELD; not an amendment: no rule, forecast, set or arm of this note changes)

The premise of this note said the move round's HELD was waiting for Keith's word. **It has been flown** (`SUB_EVADE_MOVE_WIP.md`, HELD RESULT, geometries 117001 to 117048, flown once): R0 held and the headline was **TRACKSPEED** again: trackSpeed alone grafted onto league7001 and exploit7204 is **+0.820 and +0.908**, taken out of league7100 **-0.863 and -0.871**, searchSpeed nothing. So the single-number claim that this round rests on now stands on **two sets of its own round (DEV and HELD)** and the ladder's two sets; **this note's own HELD is still not flown.**
