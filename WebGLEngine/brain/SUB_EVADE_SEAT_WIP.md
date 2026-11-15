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

