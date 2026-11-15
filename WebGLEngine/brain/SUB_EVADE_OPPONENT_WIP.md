# Submarine duel: the evade doctrine against opponents other than generation 0 (REGISTRATION 3 OF 4 of the evade follow-ups; 2026-11-15; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-15: "lets register each of those in the order that you suggest". Third of four, written before the result of any of them (`brain/SUB_EVADE_SPLIT_WIP.md` is the first and gives the order and its reasons, `brain/SUB_EVADE_DOSE_WIP.md` the second, `brain/SUB_EVADE_SEAT_WIP.md` the fourth). A registration and nothing else: **no command, no gate and no geometry of its sets exists yet.**

**What this changes in shared files, said first: nothing.** New files only: this note, `tools/ship/takeEvadeOpponent.mjs` (the command), `tools/ship/takeEvadeOpponent-selfcheck.mjs` (its gate), `brain/subEvadeOpponentDev.json` and `brain/subEvadeOpponentHeld.json`. It imports, and does not edit, `tools/ship/takeEvadeTurn.mjs` (`armsOf`, `graft`, `rowOf`, `labelOf`), `tools/ship/takeSubLeague.mjs` (`loadRuns`, `finds`, `decided`, `median`, `signed`), `brain/subTactics.mjs` and `brain/subTournament.mjs`. The bar and the method are those of `brain/SUB_EVADE_WIP.md`: an edge of at least 0.5 with z of at least 2 is a FIND; "most" is at least n' - 1 of the n' finders whose unmodified arm finds against generation 0 (G), "few" at most 1; fewer than 3 finders and the label is n/a.

## 1. What is known (read from the notes and records; nothing here is flown again)

* **Every edge so far is against G.** `brain/SUB_EVADE_WIP.md` and Part B of `brain/SUB_LEAGUE_WIP.md` score every arm and every run against generation 0, the search-ping champion. The only other evidence about opponents is the Part A record (`brain/subTournamentRecord.json`, geometries 97001 to 97024), in which **league7001 beat every other side of the page by 2.95 to 3.28 a duel**: the hand tactician +2.95 (43 duels of 48), the tuned tactician +3.08, G +3.24, league7000 +3.28. No other finder was flown there, and no graft (G with the evade numbers) was.
* **The edge has a ceiling near 3.3.** Part A's largest edge is +3.28 and the finders' +3.1 against G sits just under it; a score is damage dealt less damage taken plus a kill bonus, and the seat bias of identical sides is about +3.3 a duel. **An edge of 3.0 cannot be added to by 0.5.**
* **G's own edges, from Part A** (the baseline for "adds over G"): over the hand tactician +2.81, over the tuned tactician -0.02 (a tie), over league7000 +0.58.
* **The opponents' evade numbers** (evadeSpeed, evadeTime, evadeTurn): the hand tactician (`THETA_DEFAULT`) 4.0, 20, 1.40; the tuned tactician (`brain/subTacticsThetaWip.json`) 3.62, 30.7, 2.19; league7000's final generation 3.02, 28.6, 0.55; G 3.42, 36.9, 1.71. The tuned tactician already turns further than G.
* **The finders against each other have not been flown.** Three finders are near-copies (7001, 7100, 7200), league7103 is not, and what the doctrine does against itself is unread.

## 2. The question and the arms

**The question.** Is the doctrine's edge about G, or does it beat other tacticians as well? Is it the evade numbers (the grafts) that do it against them too? And what happens when the doctrine meets itself?

**The sides.** G, and for each of the five named finders f (**league7001, league7100, league7103, exploit7200, exploit7204**, by their final generation's theta): **U(f)** the finder unmodified, **GT(f)** G with f's evade triple, **GN(f)** G with f's evadeTurn only. **The opponents O:** **hand** (the default theta), **champ** (the tuned theta of `brain/subTacticsThetaWip.json`) and **league7000** (its final generation, from `loadRuns`), all with the PD autopilot and no weights, as every side here.

**The matchups** (each the arm against the opponent, both seats, 24 geometries, 48 duels, by `subTournament.matchup`; the arm is the first side, so the edge is the arm's over the opponent): 15 arms (U, GT, GN for five finders) against 3 opponents = **45**; G against each opponent = **3** (the baseline); the five U arms against G = **5** (R0); and the **mirror**, the ten pairs of the five U finders against each other = **10**. **63 matchups.** Nothing is searched, tuned or re-fit.

**ADDS.** The edge of an arm over an opponent MINUS G's edge over the same opponent, paired by geometry: for each geometry the mean of the arm's two seats' score differences less G's, then the mean over the 24 geometries, its standard error and z. **An arm ADDS over G against an opponent at a paired mean of at least 0.5 with z of at least 2.**

## 3. The sets and the order

* **smoke**: geometries 1 to 4, never recorded, free to read.
* **DEV**: **104001 to 104024**, both seats; flown first, read freely, recorded once in `brain/subEvadeOpponentDev.json`; it decides whether HELD is spent (R0).
* **HELD**: **105001 to 105024**, both seats; flown ONCE (`held --write`; refuses without a recorded DEV that replicates, without `--write`, or if its record exists); the rules are about HELD.
* No submarine file uses 104001 to 105024 (searched; the digits appear in sub-named files only as the number 100000 for a range).
* **Amendments:** only dated, only before this note's HELD, said why; this note is written before the results of the other three and a result of theirs that should change it is an amendment dated before this note's DEV, or it is not used.
* **The order of work:** this note, the command, its gate with a sabotage log (never flying 104001 to 105024), smoke, DEV, then HELD if R0 holds.

## 4. The rules (MY CHOICES, said; Keith may set them differently)

Let F' be the finders whose U arm finds against G on the set read, n' = |F'|.

* **R0 REPLICATES** iff n' is at least 4 of 5. On DEV, if R0 fails HELD is not flown by this registration.
* **For each kind K (U, GT, GN) and each opponent o (hand, champ, league7000), two labels over F', each YES (most), NO (few) or PARTIAL:** **K BEATS o** (the arm's edge over o finds: at least 0.5, z at least 2) and **K ADDS over G against o** (the paired difference from G's edge, as above). **18 labels.**
* **A summary line a kind:** how many of the three opponents it BEATS (label YES) and how many it ADDS against.
* **R-M1 THE STRONG FOUR ARE ALIKE:** among the six pairs of league7001, league7100, exploit7200 and exploit7204 no pair is decided (an edge of at least 0.5 in size with z of at least 2 in size). **R-M2 league7103 LOSES TO THE STRONG FOUR:** it is decided against, by the strong finder, in at least 3 of the 4 pairs.
* **Reported with the read, not in a rule:** every arm's edge over each opponent, se, z, wins-draws-losses and per-seat edges; every ADDS mean, se and z; the ten mirror edges with their seat edges; the five U arms' edge over G next to their edges over each opponent.
* **Checks that void the read, said and not weighed:** every matchup flew the same geometries; no non-finite score; every arm's theta one `clampTheta` leaves unchanged; the five finders' thetas and G's are the files'; the G arm against G has an edge of exactly 0; each finder against itself has an edge of exactly 0; a matchup's flip equals the reverse matchup (the edge of x over y is minus the edge of y over x, checked on one mirror pair flown both ways).

## 5. Forecasts, written before any geometry of any of the four sets is flown (probabilities, mine)

| forecast | probability |
|---|---|
| R0 holds on DEV | **92** |
| R0 holds on HELD | **90** |
| U BEATS hand (YES) | **95** |
| U BEATS champ (YES) | **90** |
| U BEATS league7000 (YES) | **88** |
| U ADDS over G against hand (YES) | **10** |
| U ADDS over G against champ (YES) | **82** |
| U ADDS over G against league7000 (YES) | **82** |
| the strong four's edge over each opponent is within 0.5 of their edge over G (the median U edge over hand, champ and league7000 each within 0.5 of the median U edge over G) | **75** |
| GT BEATS champ (YES) | **85** |
| GN BEATS champ (YES) | **60** |
| GN ADDS over G against champ (YES) | **55** |
| R-M1: the strong four are alike (no decided pair among them) | **55** |
| R-M2: league7103 loses to the strong four | **75** |

Why these: league7001's Part A edges (2.95 to 3.28 over the three sides of the same kind) are the reason U BEATS is high and ADDS over G is high where G itself is weak (champ, league7000) and low where G is already near the ceiling (hand, 2.81: adding 0.5 would need an edge above the largest ever seen, 3.28); the tuned tactician turns further than G, which is why the turn alone beating it (GN) is nearer a coin; the strong four are near-copies whose edges over G differ in the second decimal, but exploit7204 is not identical to the others and a mirror pair decided by 0.5 at z of 2 needs only a difference of the size seat effects produce.

## 6. What a result would not say

* **That the doctrine is good against an opponent that has learned to beat it.** Every opponent is a scripted tactician or a finder; none was trained against the finders. A league seeded from a finder would be another registration.
* **That an edge near the ceiling can be told apart.** Against all three opponents the finders may sit at 2.9 to 3.3; BEAT is a floor and ADDS over a strong baseline is bounded, so a NO on ADDS against hand is the ceiling and not a finding about the doctrine (said in the forecast).
* **Anything about the PD autopilot's part** (every side uses it), **the three numbers apart** (registration 1), **a dose** (2) **or the seat** (4).
* **That the mirror is a ranking.** Ten pairs of five finders, three of them near-copies, give the doctrine's behaviour against itself and not a league table.
* **That five finders are a sample** (as in the other notes: three of the five are one family, three of the five GN arms are one boat).

## 7. Cost

63 matchups of 48 duels is about 3,000 duels a set, three to four minutes of one core on each of DEV and HELD; the command, its gate and a sabotage pass are the work.
