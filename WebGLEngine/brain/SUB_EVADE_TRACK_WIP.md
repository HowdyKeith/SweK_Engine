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

## AMENDMENT A (2026-11-16; written after the command and its gate and after the smoke run, BEFORE any geometry of the DEV set 118001 to 118048 or of HELD is flown)

**1. The smoke headline, said before any DEV geometry (the rule of section 3).** The command's `smoke` was run on geometries 1 to 4 (8 duels a matchup; never recorded; free to read). Its headline was **"ONSET AT D / SLOW END MIXED"**: R0 holds on it (league7100 over league7001 +1.902, over exploit7204 +1.548); **RD1 holds** (the arm at D pays on both comparator bases, +1.517 and +1.181); the values that pay on both are **2.5, 3.0 and D**; **3.5 does not pay on both** (+1.140 on league7001, which is decided, and +0.794 on exploit7204, which is not); the arm at 1.0 is NEUTRAL on both bases (-0.413 and exactly 0, 0-8-0), so the slow end is MIXED; the peaks are 2.00 (+1.525) on league7001 and 2.50 (+1.561) on exploit7204. **Of the donor base's arms, every one from 1.0 to 3.5 is exactly 0.000, 0-8-0 (eight draws), and only 4.0 and 4.5 are decided against league7100 (-1.522 and -1.546):** on these four geometries league7100 with any trackSpeed from 1.0 to 3.5 plays out the same eight draws as league7100 itself. Eight duels on four geometries are a smoke test and not a reading, and **the forecasts of section 5 stand as written before it was seen and are scored as written; but I have seen this headline, and the 30 given to "ONSET AT D" and the 40 given to PAYS are no longer blind numbers**: the DEV read and HELD are the evidence, and the smoke is not counted in them.

**2. One clause of the grid check is stated here, which section 4 says in fewer words (an identity, said before data):** the check "D is league7100's trackSpeed of the files and the grid is strictly increasing" in the command also requires that **each of the three bases carries exactly the nine values of the grid** (no arm dropped or changed). It is in the command and its gate.

**3. What is not changed:** the grid, the arms, the sets, the rules R0 and RD1 to RD4, the forecasts, the geometries, the order of work.

## AMENDMENT B (2026-11-16; written after the mutation pass of the command's gate, BEFORE any geometry of the DEV set 118001 to 118048 or of HELD is flown)

**One void-check was rewritten, because the mutation pass showed the first version could not fail (an identity, said before data).** Section 4 and Amendment A say the grid check is that "D is league7100's trackSpeed of the files and the grid is strictly increasing". In the first command the first half compared the grid's sixth value with league7100's trackSpeed, but the grid is built from that very number, so the comparison was an identity of the code with itself and could never fire (two hand mutants that removed it survived the pass; they were the same mutant). **The check now reads: every arm is marked D (`isD`) if and only if its value is league7100's own trackSpeed of the files, and exactly one arm per base is marked D (three in all); the grid is nine strictly increasing values on every base** (the two clauses of Amendment A item 2 are unchanged). Its message now ends "marked D on every base". Nothing else is changed: the arms, the rules, the forecasts and the geometries are as registered; the smoke report is byte for byte the same, since the message prints only when the check fails (the gate's pinned sha256 of the smoke report is unchanged).

## DEV RESULT (2026-11-16; `node tools/ship/takeEvadeTrack.mjs dev --write`, geometries 118001 to 118048 (96 duels a matchup), exit 0; record `brain/subEvadeTrackDev.json`: 29 matchups, no check failed)

DEV is free to read. **HELD (119001 to 119048) is NOT flown by this note's work so far**: Keith's message for these rounds does not say "fly HELD", so I am waiting for his word. R0 held on DEV and no check failed (none printed), so the command's HELD gate would accept this record. Forecasts are scored on DEV only for "R0 holds on DEV" (92): **TRUE**. The others stand as written for HELD. **I flew DEV on my own reading of "do the round"**, as free-to-read data that gates HELD; it spent the DEV set 118001 to 118048, which is recorded once.

**R0 holds.** league7100 beats league7001 by **+1.047** (z 8.6, 38-53-5) and exploit7204 by **+1.248** (z 7.0, 50-35-11), both decided.

**The arms** (an arm's edge over its own base: the base with that trackSpeed against the base; the base's own trackSpeed is 4.07 for league7001, 4.5 for exploit7204 and D = 3.15 for league7100):

| trackSpeed | league7001 | exploit7204 | league7100 (read, not ruled) |
|---|---|---|---|
| 1.0 | -0.070 (4-86-6) | -0.171 (3-85-8) | -0.114 |
| 1.5 | **+0.674** (z 4.4) | +0.045 (7-84-5) | -0.014 |
| 2.0 | **+1.302** (z 11.8) | **+0.692** (z 6.3) | +0.065 |
| 2.5 | **+1.173** (z 10.4) | **+1.060** (z 8.5) | +0.034 |
| 3.0 | **+0.951** (z 8.9) | **+1.262** (z 14.3) | +0.000 |
| **D (3.15)** | **+0.919** (z 8.5) | **+1.200** (z 11.5) | identical |
| 3.5 | **+0.699** (z 6.4) | +0.471 (z 4.3) | -0.251 (z -3.1) |
| 4.0 | +0.096 (z 1.8) | +0.205 (z 1.9) | **-0.790** (z -6.6) |
| 4.5 | -0.295 (z -2.5) | identical | **-1.060** (z -10.2) |

**RD1 THE GRAFT REPLICATES: yes** (D pays on both: +0.919 and +1.200). **RD2 THE ONSET:** the values that pay on both comparator bases are **2.0, 2.5, 3.0 and D**; the highest is D. **RD3 THE SLOW END:** the arm at 1.0 is NEUTRAL on both (-0.070 and -0.171): **SLOW END MIXED**. **RD4 THE HEADLINE: ONSET AT D / SLOW END MIXED.** The peaks (reported): league7001 at 2.0 (+1.302), exploit7204 at 3.0 (+1.262). The donor base is decided against league7100 at 4.0 and 4.5.

**The forecast quantities as printed** (scored on HELD, not here): RD1 yes; onset above D no; onset at D yes; not replicated no; slow end pays no; slow end costs no; slow end mixed yes; the arm at 2.0 pays on both yes; both peaks at 3.0 or below yes; the donor's arm at 4.5 costs yes.

**Said plainly about this read:** the smoke report (Amendment A item 1) had the same headline, "ONSET AT D / SLOW END MIXED", on four training geometries at 8 duels a matchup, with league7100's own arms from 1.0 to 3.5 drawing all eight duels (0-8-0). That is not independent evidence, and DEV is a different set of 48 geometries, but **I saw the smoke headline before writing any DEV rule down as read**: the forecasts for it (30 for "onset at D", 40 for PAYS, which did not come true) are scored on HELD as written.

**Observations (DEV, for reading, not rules):**

1. **The onset reading depends on a margin of 0.03.** 3.5 pays on league7001 (+0.699) and is **+0.471 (z 4.3) on exploit7204**, 0.029 under the 0.5 bar, so the rule reads "ONSET AT D". With a bar of 0.45 it would read "ABOVE D". The bar is the registered one and the reading stands as printed; the honest statement is that the paying range reaches about 3.5 and its upper edge is where the two comparators' numbers differ (their own trackSpeeds are 4.07 and 4.5), and that it is not a sharp edge.
2. **The curve is a hump, not a slope, and its slow end is made of draws, not of losses.** The gain on league7001 rises from 0 at 4.0 to **+1.30 at 2.0**; on exploit7204 from +0.2 at 4.0 to **+1.26 at 3.0**; both fall to about 0 at 1.0 and 1.5, where **84 to 86 of the 96 duels are draws** (4-86-6, 3-85-8, 7-84-5): a boat that tracks that slowly neither kills nor is killed, so the "no effect" at the slow end is a stalemate and not parity. The peaks (2.0 and 3.0) and the paying range (1.5 or 2.0 up to 3.15 to 3.5) are about league7001 and exploit7204 as bases.
3. **The donor base shows no gain from going slower than league7100's own value, and a cost above it:** 1.0 to 3.0 are all within 0.114 of 0 (NEUTRAL); 3.5 is -0.251 (under the bar, z -3.1), 4.0 and 4.5 are **-0.790 and -1.060**. The comparators gain +0.9 to +1.3 from slowing to 2.0 to 3.15; league7100 itself gains nothing from slowing further. **Edges against different bases are not comparable with one another** (each is against its own base), so this is not "league7100's curve is flat while theirs rises": it says that the benefit of a slow tracker over a fast one is large, and that further slowing over league7100's own is not measured to pay.
4. **Faster than the base costs a little on league7001:** 4.5 against its own 4.07 is -0.295 (z -2.5, under the bar), 4.0 +0.096.
5. **Seat edges are large and mostly cancel.** e.g. exploit7204 at 4.0 is 44-14-38 with seat A -0.807 and seat B +1.218; the two-seat edge (+0.205) is a small difference of two large numbers, as in every earlier read.

**What is NOT shown:** any HELD read; a graded dose of league7100's other numbers; the effect against any opponent but the boat's own base; the shape between grid values (a peak inside the 0.5 steps); a mechanism for the stalemate at the slow end.

## PREMISE UPDATE (2026-11-16, after the move round's HELD; not an amendment: no rule, forecast, set or arm of this note changes)

The premise of this note said the move round's HELD was waiting for Keith's word. **It has been flown** (`SUB_EVADE_MOVE_WIP.md`, HELD RESULT, geometries 117001 to 117048, flown once): R0 held and the headline was **TRACKSPEED** again: trackSpeed alone grafted onto league7001 and exploit7204 is **+0.820 and +0.908**, taken out of league7100 **-0.863 and -0.871**, searchSpeed nothing. So the single-number claim that this round rests on now stands on **two sets of its own round (DEV and HELD)** and the ladder's two sets; **this note's own HELD is still not flown.**

## HELD RESULT (2026-11-16; `node tools/ship/takeEvadeTrack.mjs held --write`, geometries 119001 to 119048 (96 duels a matchup), flown ONCE, exit 0; record `brain/subEvadeTrackHeld.json`: 29 matchups, no check failed)

Flown on Keith's word ("Rounds 2 and 3 HELD can fly when ready"), after the DEV read above; the registration and the command's HELD gate allowed it (R0 held on DEV and no check failed). **The rules are about this set.**

**R0 holds.** league7100 beats league7001 by **+1.328** (z 7.5, 48-42-6) and exploit7204 by **+1.415** (z 6.8, 52-36-8), both decided.

**The arms** (HELD edge over the arm's own base; DEV beside it in the last two columns):

| trackSpeed | league7001 | exploit7204 | league7100 (read, not ruled) | DEV: league7001, exploit7204 |
|---|---|---|---|---|
| 1.0 | -0.241 (z -2.2; 2-85-9) | -0.204 (z -2.6; 6-78-12) | +0.221 | -0.070, -0.171 |
| 1.5 | **+0.655** (z 4.8) | +0.009 (11-75-10) | +0.220 (z 2.8) | +0.674, +0.045 |
| 2.0 | **+1.178** (z 9.0) | **+0.555** (z 3.4) | +0.094 | +1.302, +0.692 |
| 2.5 | **+1.113** (z 8.8) | **+1.018** (z 6.3) | +0.094 | +1.173, +1.060 |
| 3.0 | **+1.075** (z 8.9) | **+0.843** (z 5.1) | +0.094 | +0.951, +1.262 |
| **D (3.15)** | **+1.075** (z 8.3) | **+0.714** (z 4.0) | identical | +0.919, +1.200 |
| 3.5 | **+0.672** (z 5.7) | +0.398 (z 2.7) | -0.347 (z -3.4) | +0.699, +0.471 |
| 4.0 | +0.096 (z 1.4) | -0.026 | **-0.987** (z -8.5) | +0.096, +0.205 |
| 4.5 | +0.019 | identical | **-1.196** (z -11.4) | -0.295, identical |

**RD1 THE GRAFT REPLICATES: yes** (D pays on both: +1.075 and +0.714). **RD2 THE ONSET:** the values that pay on both comparator bases are **2.0, 2.5, 3.0 and D**; the highest is D. **RD3 THE SLOW END:** the arm at 1.0 is NEUTRAL on both (-0.241 and -0.204): **SLOW END MIXED**. **RD4 THE HEADLINE: ONSET AT D / SLOW END MIXED** (the same as DEV). The peaks (reported): league7001 at 2.0 (+1.178), exploit7204 at 2.5 (+1.018). The donor base is decided against league7100 at 4.0 and 4.5.

**The forecasts, scored** (as the larger side of each probability; none is at 50):

| forecast | probability | outcome |
|---|---|---|
| R0 holds on DEV | 92 | **true** |
| R0 holds on HELD | 90 | **true** |
| RD1: the graft at D replicates | 85 | **true** |
| onset ABOVE D | 55 | false (**a miss**: the larger side was "yes") |
| onset AT D | 30 | **true (a miss**: the larger side was "no") |
| NOT REPLICATED | 15 | false (right) |
| SLOW END PAYS | 40 | false (right) |
| SLOW END COSTS | 30 | false (right) |
| SLOW END MIXED | 30 | **true (a miss)** |
| the arm at 2.0 PAYS on both | 60 | **true** |
| both peaks at 3.0 or below | 45 | **true (a miss)** |
| the donor's arm at 4.5 COSTS | 90 | **true** |

**8 of 12 as the larger side.** The four misses are four outcomes I gave 55, 30, 30 and 45: the onset is at D, not above it; the slow end is mixed; the peaks are low. **Said plainly:** two of those (onset at D, slow end mixed) were the smoke report's headline (Amendment A item 1) and the DEV read's, which I had seen before HELD; the registered forecasts are scored as written.

**Observations (HELD, for reading, not rules; the DEV read's observations stand):**

1. **HELD replicates DEV in every rule and in the shape.** The hump is the same: on league7001 the gain climbs from -0.24 at 1.0 through +0.655 at 1.5 to **+1.18 at 2.0**, holds +1.08 to +1.11 from 2.5 to D, falls to +0.67 at 3.5 and is about 0 at 4.0 and 4.5; on exploit7204 it peaks at **+1.02 at 2.5**, +0.84 at 3.0, +0.71 at D, +0.40 at 3.5, and is about 0 at 4.0. Both pay at 2.0, 2.5, 3.0 and D on both sets.
2. **The onset reading is firmer than on DEV.** 3.5 is **+0.398** on exploit7204 here, 0.102 under the bar (on DEV +0.471, 0.029 under), while it pays on league7001 on both sets (+0.672, +0.699): the paying range ends between 3.15 and 3.5 for exploit7204 and between 3.5 and 4.0 for league7001, and "ONSET AT D" is the reading on both sets.
3. **The slow end is a stalemate with a small cost.** The arms at 1.0 draw 85 and 78 of 96 duels and are **slightly negative on both bases on both sets** (-0.241 and -0.204 on HELD, z -2.2 and -2.6; -0.070 and -0.171 on DEV): sub-bar, the same sign four times. The arm at 1.5 on exploit7204 is 11-75-10 (+0.009) on HELD and 7-84-5 on DEV. Post-hoc: very slow tracking neither kills nor is killed, and loses a little.
4. **The donor base repeats its cost above D and its nothing below.** League7100 with 4.0 and 4.5 is -0.987 and -1.196 (DEV -0.790, -1.060), 3.5 is -0.347 (z -3.4; DEV -0.251); with 1.0 to 3.0 it is +0.094 to +0.221 on HELD (decided on none; z up to 2.8 at 1.5) after -0.114 to +0.065 on DEV: the sign is not the same on the two sets at 1.0 and 1.5, so I read **no effect of slowing league7100 below its own value** and not the HELD signs.
5. **Edges against different bases are not comparable with one another**, as on DEV; the table is nine arms of each base against that base.

**What is NOT shown:** the effect against an opponent that is not the boat's own base (the reach round has the same limit); a graded dose of any other number; the shape between grid values; a mechanism for the stalemate.
