# Submarine duel: which part of the evade doctrine reverses the seat (REGISTRATION 4 OF 4 of the evade follow-ups; 2026-11-15; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-15: "lets register each of those in the order that you suggest". Fourth of four, written before the result of any of them (`brain/SUB_EVADE_SPLIT_WIP.md` is the first and gives the order and its reasons, `brain/SUB_EVADE_DOSE_WIP.md` the second, `brain/SUB_EVADE_OPPONENT_WIP.md` the third). It is last because it asks about the same cells as the first and is the most open-ended. A registration and nothing else: **no command, no gate and no geometry of its sets exists yet.**

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadeSeat.mjs` (the command), `tools/ship/takeEvadeSeat-selfcheck.mjs` (its gate), `brain/subEvadeSeatDev.json` and `brain/subEvadeSeatHeld.json`. It imports, and does not edit, `tools/ship/takeEvadeTurn.mjs` (`graft`), `tools/ship/takeSubLeague.mjs` (`loadRuns`, `signed`), `brain/subDuel.mjs` (`duel`, `scoreFor`) and `brain/subTournament.mjs` (`seatBias`, `makeSide`, `geometries`). The method is that of `brain/SUB_EVADE_WIP.md`.

## 1. What is known (read from the notes and records; nothing here is flown again)

* **Seat A starts with the other boat inside 60 degrees of its nose** (`brain/subDuel.mjs`), so it can shoot first; a side flown against ITSELF is worth, to seat A, about **+3.3 points a duel** (the measure is `subTournament.seatBias`: A's score less B's, averaged over geometries). In the Part A record (`brain/subTournamentRecord.json`, 8 geometries, 97001 to 97008) six of the seven sides are worth +2.5 to +3.4 to seat A and **league7001's seat A is worth -1.873 (se 0.830)**: against itself it does better from the seat that starts BEHIND, the target's.
* **Against G, by seat** (the HELD result of `brain/SUB_EVADE_WIP.md`, geometries 99001 to 99024; the edge of the arm over G in each seat): the four strong finders and their triple grafted on G win from both seats (about +3.05 and +3.15); the turn alone (GN) wins from seat A (+3.06) and is level to a little behind from seat B (-0.33 to -0.60); the lesioned finders (G's triple on the finder, LT) win from seat A (+1.7 to +2.2) and lose from seat B (-2.5 to -2.8). **league7103, with its own triple, wins from seat A (+3.06) and loses a little from seat B (-0.32).** Of its three evade numbers only the speed (3.55 against 4.3 to 4.5) differs from the four strong ones' (the note of registration 1 says this is one finder in five and a candidate, not a result).
* **That is against G, not against itself.** A side against itself is a different measure (both seats are the same side; the seat bias is whatever the opening is worth when neither boat has an advantage but the start); no evade arm has been flown against itself except league7001 (Part A, 8 geometries).
* **The duel records what happened** (`brain/subDuel.mjs`, `result.fates`, `result.damage`, `result.events`): which boat was sunk and when. The share of duels in which seat A's boat is sunk against seat B's is the plainest account of who wins a mirror.

## 2. The question and the sides

**The question.** Does the evade doctrine reverse the seat in a mirror (a side against itself does better from the seat that starts behind), and which numbers of it are what reverse it: the speed, the turn, the time, or only the triple whole?

**The sides, 17, each flown against ITSELF.** G; and for each of two finders, **league7001** (a strong one: the one whose seat bias was read in Part A) and **league7103** (the odd one: its speed is G's), the unmodified finder **U** and the seven cells of G with some of the finder's numbers: **S** (evadeSpeed), **T** (evadeTime), **N** (evadeTurn), **ST, SN, TN, STN** (the triple), as in registration 1. Every side a tactician and the PD autopilot. **For each side the measure is `subTournament.seatBias`'s: for each of 24 geometries the side flown in both seats against itself, A's score less B's; the mean, its standard error and z (the mean over the se).** And, from the same duels, **how often each seat's boat is sunk** (`fates`). 17 sides x 24 duels = **408 mirror duels a set**. Nothing is searched, tuned or re-fit.

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read.
* **DEV**: **106001 to 106024**; flown first, read freely, recorded once in `brain/subEvadeSeatDev.json`; it decides whether HELD is spent (R0).
* **HELD**: **107001 to 107024**; flown ONCE (`held --write`; refuses without a recorded DEV that holds R0, without `--write`, or if its record exists); the rules are about HELD.
* No submarine file uses 106001 to 107024 (searched; the digits appear in sub-named files only as the number 100000 for a range).
* **Amendments:** only dated, only before this note's HELD, said why. This note is written before the results of the other three; **the result of registration 1 (which cells carry the edge against G) is the reason to expect an amendment here, dated before this note's DEV: if it shows that a cell asked about here is the wrong one, the cells change by amendment, not silently.**
* **The order of work:** this note, the command, its gate with a sabotage log (never flying 106001 to 107024), smoke, DEV, then HELD if R0 holds.

## 4. The rules (MY CHOICES, said; Keith may set them differently)

* **A side is SEAT-A iff its mean seat bias is at least +0.5 with z of at least +2; REVERSED iff the mean is at most -0.5 with z of at most -2; NEUTRAL otherwise.** (The 0.5 is the bar of the other notes; I chose it, as there.) With a standard error of 0 the z is infinite in the direction of the mean, and 0 for a mean of 0.
* **R0 holds** iff, in the set read, G is SEAT-A and league7001's unmodified side U is REVERSED. **On DEV, if R0 fails HELD is not flown by this registration:** the reversal of Part A is not there to be explained. (Part A read it on 8 geometries at z of about -2.3.)
* **R1 U(league7001) REVERSED** (the Part A reading replicates on 24 fresh geometries): the R0 half, read on HELD. **R2 STN(league7001) REVERSED** (G with the finder's triple reverses). **R3 N(league7001) REVERSED** (the turn alone). **R4 SN(league7001) REVERSED** (speed with the turn). **R5 S(league7001) REVERSED** (the speed alone). **R6 league7103: neither U nor STN is REVERSED.**
* **The headline** (read in this order; the first that holds): **"THE SPEED IS WHAT REVERSES IT"** iff R4 holds, R3 does not and R6 holds; **"THE TURN ALONE REVERSES IT"** iff R3 holds; **"THE TRIPLE, AND NO PART OF IT ALONE"** iff R2 holds and R3, R4 and R5 do not; **"NOTHING OF THE TRIPLE REVERSES IT"** iff R2 does not hold; otherwise **no headline**.
* **Reported with the read, not in a rule:** every side's mean, se, z and label; for each, how many of the 24 mirror duels sink seat A's boat, seat B's boat, neither, both; the seven cells of league7103 beside league7001's; the Part A figures for league7001 beside this set's.
* **Checks that void the read, said and not weighed:** the mirror of a side is the same on a second flight (deterministic: the means are equal to the last digit); the command's seat bias equals `subTournament.seatBias`'s for the same side and geometries; no non-finite mean; every theta one `clampTheta` leaves unchanged; the two finders' thetas and G's are the files'; **G's mirror bias is within 1.0 of +3.35 (the Part A figure on 8 geometries)**, which would otherwise mean the set or the measure is not the one that was read before.

## 5. Forecasts, written before any geometry of any of the four sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV (G SEAT-A and U(league7001) REVERSED) | **70** |
| R0 holds on HELD | **72** |
| R2: STN(league7001) is REVERSED | **60** |
| R3: N(league7001) alone is REVERSED | **8** |
| R4: SN(league7001) is REVERSED | **45** |
| R5: S(league7001) alone is REVERSED | **10** |
| R6: neither of league7103's sides is REVERSED | **80** |
| the headline is "THE SPEED IS WHAT REVERSES IT" | **30** |
| the headline is "THE TRIPLE, AND NO PART OF IT ALONE" | **20** |
| in every REVERSED side seat B's boat is sunk in more of the 24 duels than seat A's | **85** |
| G's mirror bias on HELD is within 0.5 of +3.35 | **80** |

Why these: Part A read league7001 at -1.87 with a standard error of 0.83 on 8 geometries, which makes a reversal on 24 likely and not certain (the standard error should fall to about 0.5, and a true value of about -0.9 or less would fail the z-of-2 rule), hence 70; the turn alone left the boat level from seat B against G, so I do not expect it to win from it against itself (8); the speed has the best claim in the HELD data (league7103), but the data are one finder against four and the headline needs three conditions at once (30); a doctrine that wins from both seats against G need not reverse against itself, where the opponent evades as well and the first torpedo is the one that decides (hence 60 for the triple and not 80).

## 6. What a result would not say

* **That a reversed mirror is what wins against other sides.** The mirror is a side against itself; what the evade doctrine does from each seat against G is read in `brain/SUB_EVADE_WIP.md` and against other opponents in registration 3.
* **The mechanism.** "Seat B's boat is sunk less often" is read from `fates`; why (whether it survives the first torpedo, whether it shoots in the evade's gap, whether the opening is the reason) is not asked, and the events (`fire`, `hit`) are not read.
* **That a cell that does not reverse is irrelevant,** nor that the cells of one finder are the doctrine's (two finders; league7103 is one of them and is the odd one).
* **That 24 geometries decide a bias of 0.5.** The rule is a floor; a NEUTRAL side may have a small true bias in either direction.
* **A dose** (registration 2), **the numbers apart against G** (1) **or an opponent but itself** (3).

## 7. Cost

17 sides x 24 duels = 408 duels a set (a few seconds), plus a second flight for the determinism check: this is the cheapest of the four to fly; the command, its gate and a sabotage pass are the work.

*(2026-11-15, an addendum, made after the HELD result of registration 1 and before any geometry of this note's sets was flown; no rule, arm or forecast is changed: the split result (`brain/SUB_EVADE_SPLIT_WIP.md`) shows the S, T and ST cells to be G to the second decimal against G and the SN cell to carry the whole edge, so no cell asked about here is the wrong one; S, T and ST stay as the check that the mirror measure finds no seat effect where the sides play alike.)*

## AMENDMENT A (2026-11-15; made while the command `tools/ship/takeEvadeSeat.mjs` was written, BEFORE any DEV geometry (106001 to 106024) or HELD geometry (107001 to 107024) was flown)

None of this changes a rule, a bar, a side or a forecast of sections 2 to 5; it fills in what the registration left unsaid, and it is dated before any data.

1. **"In every REVERSED side" needs at least one.** The forecast "in every REVERSED side seat B's boat is sunk in more of the 24 duels than seat A's" is read as: **there is at least one REVERSED side and every one of them has more seat-B boats sunk than seat-A boats**; with no REVERSED side it is "no" (a statement about nothing is not a forecast that came true).
2. **The measure, as coded.** For each side and each geometry one duel of the side against itself, `score - scoreFor(result, "B")` (subTournament.seatBias's own measure); the mean, the standard error (the sample standard deviation over the square root of n) and z (the mean over the se; infinite in the direction of the mean when the se is 0, and 0 for a mean of 0). **SEAT-A iff mean >= +0.5 and z >= +2; REVERSED iff mean <= -0.5 and z <= -2; NEUTRAL otherwise** (a mean and a z of opposite signs are NEUTRAL). The sunk counts are from `result.fates`: seat A's boat sunk, seat B's boat sunk, neither, both.
3. **R0 and the readings, as coded.** R0 holds iff G is SEAT-A and U(league7001) is REVERSED. R1 is U(league7001) REVERSED, R2 STN(league7001), R3 N(league7001), R4 SN(league7001), R5 S(league7001); **R6 is: neither U(league7103) nor STN(league7103) is REVERSED.** The headline is the first of: "THE SPEED IS WHAT REVERSES IT" (R4 and not R3 and R6); "THE TURN ALONE REVERSES IT" (R3); "THE TRIPLE, AND NO PART OF IT ALONE" (R2 and not R3, R4 or R5); "NOTHING OF THE TRIPLE REVERSES IT" (not R2); otherwise none.
4. **The command** is that of the other notes: `smoke` (geometries 1 to 4, never recorded), `dev` (106001 to 106024; prints; `--write` records `brain/subEvadeSeatDev.json` once) and `held --write` (107001 to 107024, once; refuses without a recorded DEV of the `dev` set whose rules say R0 held, without `--write`, or over an existing `brain/subEvadeSeatHeld.json`). The record's `set` is the set that was flown.
5. **The checks that void the read, as coded**, in this order: a second flight of G gives the same mean to the last digit; the command's seat bias for G equals `subTournament.seatBias`'s; no mean or standard error is non-finite; every side's theta is one `clampTheta` leaves unchanged; every run's generation 0 is G; **G's mirror bias is within 1.0 of +3.35**. The first two cost 48 duels more than the 408 (a second flight of G and `seatBias` for G). A failed check is printed, not weighed, makes the exit code 1, and the record is still written.
6. **Printed besides the rules** (for reading): each side's mean, standard error, z, label and sunk counts; a fixed line with the Part A figures (league7001 -1.873 with se 0.830 and G +3.368, on 97001 to 97008); and the two forecast quantities as yes/no.

## AMENDMENT B (2026-11-15; BEFORE any DEV geometry (106001 to 106024) or HELD geometry (107001 to 107024) was flown; it corrects a slip in section 5 and in item 1 of Amendment A, found while the command was smoke-run on geometries 1 to 4)

**The direction of the sunk-boats forecast was written backwards.** Section 5 forecast "in every REVERSED side seat B's boat is sunk in more of the 24 duels than seat A's" (85), and item 1 of Amendment A repeated it. A REVERSED side is one whose mean seat bias, seat A's score less seat B's, is at most -0.5: **seat B does better, so it is seat A's boat that is sunk more often**, and read literally the forecast is false in every reversed side by construction. The smoke run (geometries 1 to 4, trained on, so it says nothing about the claim) showed the direction at once: in every REVERSED side seat A's boat was sunk in 4 of 4 duels and seat B's in none. **The forecast is corrected to what it was meant to say: in every REVERSED side seat A's boat is sunk in more of the duels than seat B's, and there is at least one REVERSED side (otherwise "no"). It keeps its 85 and is scored on this reading.** The code and the gate say the same (`reversedSunkMore`: seat A's sunk count above seat B's in every REVERSED side). Said plainly: this is a slip in my wording, caught by running the command, not a change made after seeing a result; no DEV or HELD geometry had been flown.


## DEV RESULT (2026-11-15; `node tools/ship/takeEvadeSeat.mjs dev --write`, geometries 106001 to 106024, exit 1; record `brain/subEvadeSeatDev.json`)

**ONE REGISTERED CHECK FAILED, and by section 4 a failed check VOIDS the read. This DEV read is void by the registration; what follows is what the command printed, and nothing in it is scored.** The check that failed: *G's mirror bias is within 1.0 of +3.35*: it is **+2.248** (se 0.523, z 4.3), 1.10 from the Part A figure. Every other check passed (a second flight of G gives the same mean to the last digit; the command's bias for G equals `subTournament.seatBias`'s; no non-finite mean; every theta is one `clampTheta` leaves unchanged; every run's generation 0 is G). The command still prints "DEV: R0 holds; HELD may be flown" because its HELD gate reads R0 and not the checks (section 4 says "printed, not weighed"); that line is not a licence.

**Said, and labelled as a reading after the data, not as a rule:** the check was written to catch "the set or the measure is not the one read before". The measure is the same (two of the other checks, the equal means and `seatBias`'s figure, pass); the set is not the same by construction (24 new geometries against Part A's 8, 97001 to 97008), and Part A's +3.368 on 8 geometries has a standard error several times larger than a 24-geometry read's 0.52, so a gap of 1.10 is within what two reads of different sets of this size can differ by. That is a reason to think the tolerance of 1.0 was set too tight; it is not a reason to weigh the read, and I have not changed the check. **What would change it is a dated amendment before any HELD geometry is flown, written as made after DEV was read, and Keith's call.**

**The 17 sides, each against itself** (seat A's score less seat B's over 24 mirror duels; SEAT-A at +0.5 or more with z of +2 or more, REVERSED at -0.5 and -2 or less; sunk = in how many of the 24 duels seat A's boat, seat B's boat, neither was sunk):

| side | mean (se) | z | label | sunk A / B / neither |
|---|---|---|---|---|
| G | +2.248 (0.523) | +4.3 | SEAT-A | 4 / 20 / 0 |
| U:league7001 | -2.280 (0.378) | -6.0 | REVERSED | 20 / 2 / 2 |
| S:league7001 (speed alone) | +2.242 (0.521) | +4.3 | SEAT-A | 4 / 20 / 0 |
| T:league7001 (time alone) | +2.248 (0.523) | +4.3 | SEAT-A | 4 / 20 / 0 |
| N:league7001 (turn alone) | +0.997 (0.629) | +1.6 | NEUTRAL | 8 / 15 / 1 |
| ST:league7001 | +2.242 (0.521) | +4.3 | SEAT-A | 4 / 20 / 0 |
| SN:league7001 | -1.782 (0.483) | -3.7 | REVERSED | 18 / 4 / 2 |
| TN:league7001 | +0.601 (0.663) | +0.9 | NEUTRAL | 10 / 14 / 0 |
| STN:league7001 | -1.920 (0.481) | -4.0 | REVERSED | 19 / 4 / 1 |
| U:league7103 | +0.325 (0.675) | +0.5 | NEUTRAL | 11 / 13 / 0 |
| S:league7103 | +2.247 (0.522) | +4.3 | SEAT-A | 4 / 20 / 0 |
| T:league7103 | +2.248 (0.523) | +4.3 | SEAT-A | 4 / 20 / 0 |
| N:league7103 | +0.997 (0.629) | +1.6 | NEUTRAL | 8 / 15 / 1 |
| ST:league7103 | +2.247 (0.522) | +4.3 | SEAT-A | 4 / 20 / 0 |
| SN:league7103 | +0.723 (0.641) | +1.1 | NEUTRAL | 9 / 14 / 1 |
| TN:league7103 | +0.602 (0.664) | +0.9 | NEUTRAL | 10 / 14 / 0 |
| STN:league7103 | +0.597 (0.661) | +0.9 | NEUTRAL | 10 / 14 / 0 |

**As printed:** R0 (G SEAT-A and U:league7001 REVERSED): yes. R1 yes; R2 STN:league7001 REVERSED yes; R3 N alone no; R4 SN yes; R5 S alone no; R6 league7103 neither U nor STN reversed yes. **HEADLINE (the registered rule): THE SPEED IS WHAT REVERSES IT** (R4 holds, R3 does not, R6 holds). **Read with the table, the label says less than it sounds:** the speed alone does not reverse the seat (S is SEAT-A, to the digit of G), the turn alone does not (N is NEUTRAL), speed with the turn does (SN, -1.78), and time adds nothing (STN -1.92 against SN -1.78, T and ST are G); that is the split note's "speed and turn" again, now on the seat. **Part A beside this set:** league7001 -1.873 (se 0.830) against -2.280 here; G +3.368 against +2.248 here. In every REVERSED side seat A's boat is sunk more often than seat B's (20 to 2, 18 to 4, 19 to 4): the forecast quantity is **yes**; in G it is the other way (4 to 20).

**The forecast quantities as printed (not scored: the read is void):** R2 yes, R3 no, R4 yes, R5 no, R6 yes; headline "THE SPEED IS WHAT REVERSES IT" yes; headline "THE TRIPLE, AND NO PART OF IT ALONE" no; every REVERSED side sinks seat A's boat more often than seat B's yes; G's mirror bias within 0.5 of +3.35 **no** (the registered check failed with it).

**What is NOT shown:** a clean DEV read (void); anything on HELD; the mechanism (who is sunk by what is from `fates`, not from events). For HELD, the same check would be applied to a set where G's bias is likely near +2.2 again, so `held --write` as registered would likely print the same failure and void that read too: an amendment to the check, if Keith wants one, has to come before HELD is flown.
