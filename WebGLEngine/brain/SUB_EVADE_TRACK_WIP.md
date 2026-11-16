# Submarine duel: the dose of trackSpeed (REGISTRATION 10 of the evade reads; 2026-11-16; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-16: "lets do the next suggested round, and then the next 2 suggested rounds after that". This is the second of the three. `brain/SUB_EVADE_MOVE_WIP.md` (DEV only; its HELD is not flown) found that league7100's lead over league7001 and exploit7204 is carried by its **trackSpeed** alone (3.15; the comparators' are 4.07 and 4.50): grafted alone it recovers 0.94 and 0.71 of the lead, taken out of league7100 it costs -0.87 and -1.04. **Only one value of that number has ever been grafted: league7100's own.** This note asks what the number does across its range: where slower tracking starts to pay, and what happens at the slow end.

**Said first, the premise of this round:** the claim that trackSpeed alone carries the lead rests on the DEV read of the move round (and the movement set's two sets in `SUB_EVADE_LADDER_WIP.md`), **not on a HELD read**; the move round's HELD is waiting for Keith's word. This round is registered on that premise and **its replication rule (RD1) re-tests the single-number graft on its own sets**; if the move round's HELD later disagrees, this note's premise is weakened and its read is read in that light.

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadeTrack.mjs` (the command), `tools/ship/takeEvadeTrack-selfcheck.mjs` (its gate), `brain/subEvadeTrackDev.json` and `brain/subEvadeTrackHeld.json`. It imports, and does not edit, `tools/ship/takeEvadeTurn.mjs` (`rowOf`), `tools/ship/takeSubLeague.mjs` (`loadRuns`, `decided`, `signed`) and `brain/subTournament.mjs`. The bar and the method are those of the move note: a head-to-head is **decided** at an edge of 0.5 in size with z of 2 in size; both seats, 48 geometries a set (96 duels a matchup).

## 1. What is known (read from the records; nothing here is flown again)

* **The lead and the carrier** (`SUB_EVADE_MOVE_WIP.md`, DEV 116001): league7100 beats league7001 by +1.047 and exploit7204 by +1.058; **GRAFT(trackSpeed) +0.984 and +0.752, LESION(trackSpeed) -0.873 and -1.043**; searchSpeed alone nothing (|edge| of 0.07 or less in four arms). The ladder (`SUB_EVADE_LADDER_WIP.md`, both sets) had the pair (searchSpeed, trackSpeed) carry 0.61 to 0.87 of the lead.
* **The numbers** (from the files): trackSpeed league7100 **3.1507**, league7001 **4.0711**, exploit7204 **4.5 exactly** (the bound; the bounds are 0.5 to 4.5). Of the 14 finders in the files, league7100's is the only one under 4.07.
* **What an evade-side dose looked like** (earlier notes): the evade turn is a gate with a steep middle and a flat top; evade speed has a gate of its own, a ramp of about +1.3 per m/s from 2.7 to the bar at 3.1 to 3.2, and a plateau above about 4.1. **Nothing is known of the shape of trackSpeed's curve.**

## 2. The question and the arms

**The question, two parts.** **Part A, the ONSET:** where does lowering trackSpeed start to pay for a boat that tracks at 4.07 or 4.5: at league7100's own value, or already above it? **Part B, the SLOW END:** does a slower tracker keep paying to the bottom of the range (1.0), flatten, or cost?

**The grid (MY CHOICE, fixed now):** nine values of trackSpeed, **V = 1.0, 1.5, 2.0, 2.5, 3.0, D, 3.5, 4.0, 4.5**, where **D is league7100's own trackSpeed of the files (3.1507...)**, so that the value is its own value to the digit. Every arm is a base theta with its trackSpeed set to a value of V and **nothing else moved**, flown against its base:

| bases | what the arm is |
|---|---|
| **league7001** and **exploit7204** (the comparator bases) | U(c) with trackSpeed v, against U(c): 9 arms each |
| **league7100** (the donor base; read, not ruled) | U(league7100) with trackSpeed v, against U(league7100): 9 arms |
| LEAD | U(league7100) against U(c), for each comparator (2 matchups: the replication of the lead) |

**29 matchups a set.** An arm whose value is the base's own is identical to its base (an edge of exactly 0, printed `identical`, never decided): **by the files' numbers that is D on the donor base and 4.5 on exploit7204**, and no other arm.

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read.
* **DEV**: **118001 to 118048**, both seats; flown first, read freely, recorded once in `brain/subEvadeTrackDev.json`; it decides whether HELD is spent (R0).
* **HELD**: **119001 to 119048**, both seats; flown ONCE (`held --write`; refuses without a recorded DEV that replicates and lists no failed check, without `--write`, or if its record exists); the rules are about HELD.
* No submarine file uses 118001 to 119048 as a geometry (searched as whole numbers in the `.mjs` and `.md` files under `brain` and `tools`; the only hits for the nearby numbers are timeouts of 120000 milliseconds). The sets 98001 to 117048 are spent or reserved.
* **Amendments:** as in the other notes: only dated, only before this note's HELD. **Every void-check is an identity or a file's own number, and the command's HELD gate refuses a DEV with a failed check.** **If a smoke report is read, its headline is said in Amendment A before any DEV geometry.**
* **The order of work:** this note, the command, its gate with a sabotage log (never flying 118001 to 119048), smoke, DEV; HELD only on Keith's word.

## 4. The rules (MY CHOICES, said; Keith may set them differently)

* **An arm PAYS** for its base iff it beats its base decided (an edge of 0.5 and z of 2, in the arm's favour); **COSTS** iff its base beats it decided; else NEUTRAL (or IDENTICAL).
* **R0 REPLICATES** iff LEAD is decided for league7100 over both comparators. On DEV, if R0 fails HELD is not flown by this registration.
* **RD1 THE GRAFT REPLICATES:** the arm at D PAYS on **both** comparator bases (the move round's GRAFT(trackSpeed), on new geometries).
* **RD2 THE ONSET:** the grid values at which the arm PAYS on **both** comparator bases are the COMMON PAYING VALUES; the **ONSET is the highest of them** (none if there are none).
* **RD3 THE SLOW END:** the status of the arm at **1.0** on each comparator base; **SLOW END PAYS** iff it PAYS on both, **SLOW END COSTS** iff it COSTS on both, else **SLOW END MIXED**.
* **RD4 THE HEADLINE**, the first that holds: **"NOT REPLICATED"** iff RD1 fails; else **"ONSET ABOVE D"** iff the ONSET is above D (3.5 or 4.0), else **"ONSET AT D"**; followed, when it is not NOT REPLICATED, by **" / SLOW END PAYS"**, **" / SLOW END COSTS"** or **" / SLOW END MIXED"**.
* **Reported with the read, not in a rule:** each arm's edge (se, z, wins-draws-losses, seat edges, status); **the PEAK of each comparator base** (the value of its greatest arm edge; the lowest value on a tie); **the donor base's arms** (the values at which league7100 with that trackSpeed is decided against its own); **the forecast quantities of section 5 as yes/no**.
* **Checks that void the read, said and not weighed. Every one is an identity or a file's own number:** every matchup flew the set's geometries (each seed twice); no non-finite score; every theta one `clampTheta` leaves unchanged; every run's generation 0 is G; **U(league7100) against a copy of itself has an edge of exactly 0**; **every lower side is the finder's final theta of the files, and the leader of a LEAD matchup is league7100's**; **every arm is exactly its base with its trackSpeed set to its value of the grid and nothing else moved**; **D is league7100's trackSpeed of the files, and the grid is strictly increasing**; **an arm identical to its base has an edge of exactly 0**.

## 5. Forecasts, written before any geometry of any of the two sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **92** |
| R0 holds on HELD | **90** |
| RD1: the graft at D replicates (PAYS on both comparator bases) | **85** |
| the headline's onset is "ONSET ABOVE D" | **55** |
| the headline's onset is "ONSET AT D" | **30** |
| the headline is "NOT REPLICATED" | **15** |
| SLOW END PAYS | **40** |
| SLOW END COSTS | **30** |
| SLOW END MIXED | **30** |
| the arm at 2.0 PAYS on both comparator bases | **60** |
| both comparator bases' PEAKS are at 3.0 or below | **45** |
| the donor base's arm at 4.5 COSTS (league7100 with a 4.5 tracker is decided against league7100) | **90** |

Why these: the lead over both comparators is large (about +1.05 on DEV), so R0 is near certain (92 and 90). The graft at D was +0.98 and +0.75, well over the bar, so RD1 is 85. The effect per m/s of trackSpeed under D, if it were a straight line from the comparators' value to D, would be about 1.1 per m/s for league7001 (0.98 over 0.92) and 0.56 for exploit7204 (0.75 over 1.35); at 3.5 that gives about +0.6 and +0.56, just over the bar, so the onset above D is the likeliest single case (55) and the weaker comparator's slope is why it is not likelier. The slow end I do not know: a slow tracker could keep paying (quieter), flatten, or lose contact: three nearly equal numbers, PAYS the largest (40) because speed's evade curve was monotone to its bound. 2.0 paying (60) and a peak at 3.0 or below (45) are the same bet, made lower. The donor's own arm at 4.5 is the move round's lesion over again (-0.87 and -1.04 at 4.07 and 4.5), so 90.

## 6. What a result would not say

* **A mechanism.** A slower tracker could be quieter, lose contact less, or its opposite: no event is read.
* **Anything about a boat's trackSpeed and its other numbers together** beyond the three bases' own: the arms move one number of a finder whose other numbers are its own (so the curve is the curve of that finder, not of "a boat").
* **The shape between grid values:** a nine-point grid reads an onset only to within its spacing (the values are 0.5 apart except 0.15 below D, 0.35 above it) and cannot see a narrow peak.
* **The effect against another opponent** (every arm is flown against its own base, as in the earlier rounds) **or in another seat arrangement.**
* **That the two comparator bases are independent:** league7100 is on both LEAD matchups, and the effective number of independent strong finders is nearer three than four.

## 7. Cost

29 matchups of 96 duels a set, about three minutes of one core; the command, its gate and a sabotage pass are the work.
