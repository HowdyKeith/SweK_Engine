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

## AMENDMENT A (2026-11-15; made while the command `tools/ship/takeEvadeOpponent.mjs` was written and smoke-run on geometries 1 to 4, BEFORE any DEV geometry (104001 to 104024) or HELD geometry (105001 to 105024) was flown)

None of this changes a rule, a bar, a side or a forecast of sections 2 to 5; it fills in what the registration left unsaid, and it is dated before any data.

1. **Fewer than 3 finders**, as in Amendment A of `brain/SUB_EVADE_WIP.md`: "most" and "few" overlap, so every label is `n/a` and R0 fails at n' below 4.
2. **What the command does**, as for the other evade commands: `smoke` flies geometries 1 to 4 and is never recorded; `dev` flies 104001 to 104024 and prints (it may be run without `--write`); `dev --write` records `brain/subEvadeOpponentDev.json` once; `held --write` is the only way to fly 105001 to 105024 and refuses without `--write`, over an existing `brain/subEvadeOpponentHeld.json`, and unless the DEV record is a record of the `dev` set whose rules say R0 held. The record's `set` is the set that was flown. **R0 is: at least 4 of the 5 unmodified finders beat G on the set read.** The tuned tactician is read from `brain/subTacticsThetaWip.json` (its `theta`); the command stops (exit 2) if the file or the theta is missing.
3. **70 matchups, not 63.** The registration's 63 are the rows read (5 + 3 + 45 + 10); the command also flies the seven matchups of the checks (G against a copy of itself, each U finder against a copy of itself, and one mirror pair flown both ways): 70 a set.
4. **The mirror and M1, M2, as coded.** The ten pairs are taken in the order of the five finders (league7001, league7100, league7103, exploit7200, exploit7204), the earlier as the first side. A pair is DECIDED iff its edge is at least 0.5 in size with z at least 2 in size (either way). **M1** holds iff none of the six pairs among league7001, league7100, exploit7200 and exploit7204 is decided. **M2** holds iff at least 3 of those four finders beat league7103 by an edge of at least 0.5 at z of at least 2 (a pair flown with league7103 first is flipped: the strong finder's edge is the negative of the printed one).
5. **The forecast quantity "within 0.5 of the edge over G"** is: for each of the three opponents, the median over the five finders of U's edge over that opponent differs from the median of U's edge over G by at most 0.5, for all three.
6. **The checks that void the read, as coded:** every matchup flew the same geometries (48 fights on the set's seeds); no score is non-finite (the edge and z of every row and the ADDS mean and z; **a paired difference whose standard error is exactly 0 and whose mean is not 0 has an infinite z and would void the read: not expected, said**); every arm's and every opponent's theta is one `clampTheta` leaves unchanged; every run's generation 0 is G; G against a copy of itself, and each finder against a copy of itself, have an edge of exactly 0; and a mirror pair flown both ways has edges that are exact opposites. A failed check is printed, not weighed, makes the exit code 1, and the record is still written.
7. **Printed besides the rules** (for reading): every matchup's edge, se, z, wins-draws-losses, whether it BEATS and ADDS (with the paired mean and z), and its edge in seat A and seat B; G's baseline edges; the five finders' median edge over G and over each opponent; and the forecast quantities of section 5 as yes/no.
8. **What smoke is and is not.** Geometries 1 to 4 are among those (1 to 8) on which every league was TRAINED, so the smoke output says the command runs and says nothing about the claim. I saw it (63 rows flew, the checks passed) and **the forecasts of section 5 stand as written and will be scored as written.**


## DEV RESULT (2026-11-15; `node tools/ship/takeEvadeOpponent.mjs dev --write`, geometries 104001 to 104024, exit 0; record `brain/subEvadeOpponentDev.json`, 63 rows)

**One slip, said.** I started this DEV flight twice by mistake (a first launch whose shell wrapper looked as if it had exited, then a second), so two copies of the same read ran at the same time and each wrote the record. The flights are deterministic (the set's seeds), the record parses, its 63 rows are what the printed lines say (checked on U:league7001@G, +2.084, z 5.6, and on the rules block), and DEV is free to read; HELD is untouched.

DEV is free to read; HELD (105001 to 105024) is not flown by this entry. The void-checks passed (none printed). Forecasts are not scored on DEV except "R0 holds on DEV" (92): **TRUE**. The others stand as written for HELD.

**R0 holds:** 5 of 5 unmodified finders find against G (+2.074 to +2.351 for four; league7103 +0.978, z 2.7).

**G, the baseline:** against hand +2.255 (z 5.8, 40-0-8, BEATS); against champ +0.122 (z 0.9) and league7000 +0.157 (z 0.6), neither beaten. G is about level with the two stronger opponents; the finders are not.

**Labels over F' (all five finders), as the rules print them:**

| kind | BEATS hand | ADDS over G (hand) | BEATS champ | ADDS (champ) | BEATS league7000 | ADDS (league7000) | summary |
|---|---|---|---|---|---|---|---|
| U (the finder) | YES 5/5 | NO 1/5 | YES 5/5 | YES 4/5 | YES 5/5 | YES 5/5 | beats 3 of 3, adds against 2 |
| GT (G + the triple) | YES 5/5 | PARTIAL 3/5 | YES 5/5 | YES 5/5 | YES 5/5 | YES 5/5 | beats 3 of 3, adds against 2 |
| GN (G + the turn only) | YES 5/5 | NO 0/5 | YES 5/5 | YES 4/5 | NO 0/5 | NO 0/5 | beats 2 of 3, adds against 1 |

**Median U edge over G, hand, champ, league7000:** +2.084, +2.596, +1.997, +2.062. The finders' edge over the two opponents that G cannot beat is as large as their edge over G, and the ADDS means there are +1.0 to +2.4 (league7103's +0.979 at the low end) (the finder's edge over the opponent minus G's, geometry by geometry).

**Where it is thin:**

* **Hand:** G already wins by +2.255 and the seat-A edge is capped near +3.24 (it prints +3.241 on five arms), so there is little to add; only exploit7204's U adds (+0.550, z 2.6) and the GT arms of league7001, league7100 and exploit7204 (+0.555 to +0.618, z 2.6). One GT (exploit7200) misses by 0.007 (+0.493).
* **league7103** is the weak finder everywhere: U edge over G +0.978, over champ +1.101, over league7000 +1.420, over hand +2.117; its U arm does not add over G against hand (-0.138) or against champ (+0.979, z 1.9).
* **GN against league7000** is +0.45 to +0.59 (z 1.5 to 1.8): near the bar and under it on all five. **GN against champ** is +0.813 on four arms: the finders with turn 2.8 (three of the five, per the evade-turn note) have the same GN theta, so those four are fewer than four independent arms; the label counts them as the registration said to count.

**The mirror (finders against each other, first side's edge):** league7001 over league7100 -1.070 (z -3.9, 6-19-23: 19 draws); league7001 over league7103 +1.317; league7001 over exploit7200 -0.380; league7001 over exploit7204 +0.395; league7100 over league7103 +1.111; league7100 over exploit7200 +0.518 (not decided); league7100 over exploit7204 +1.020; league7103 over exploit7200 -1.777; league7103 over exploit7204 -0.929; exploit7200 over exploit7204 +0.648. **M1 THE STRONG FOUR ARE ALIKE: NO** (three of their six pairs are decided: league7100 over league7001 by 1.07, league7100 over exploit7204 by 1.02, exploit7200 over exploit7204 by 0.65). **M2 league7103 LOSES TO THE STRONG FOUR: YES**, and in all four pairs, not three.

**The forecast quantities as printed** (scored on HELD, not here): U BEATS hand, champ, league7000: yes, yes, yes. U ADDS hand: no; champ: yes; league7000: yes. The strong four's edges over each opponent within 0.5 of their edge over G: **no, by 0.012** (the median over hand is +2.596 against +2.084 over G, a difference of 0.512). GT BEATS champ: yes. GN BEATS champ: yes. GN ADDS champ: yes. M1: no. M2: yes.

**What is NOT shown here:** any HELD read; any opponent other than these three PD-autopilot tacticians; whether the strong four differ because of their thetas or because of the draws (19 of 48 duels between league7001 and league7100 are draws, the mirror's largest count); why the edge is capped at +3.24 in seat A (a ceiling of the score, not examined). R0 held, so HELD may be flown on Keith's word: `node tools/ship/takeEvadeOpponent.mjs held --write`.

## HELD RESULT (2026-11-15; `node tools/ship/takeEvadeOpponent.mjs held --write`, geometries 105001 to 105024, flown ONCE, exit 0; record `brain/subEvadeOpponentHeld.json`)

Keith asked for it after the DEV read; R0 held on DEV. The void-checks passed (none printed). Nothing in the rules, the arms or the forecasts was changed between DEV and HELD (the amendments are all dated before DEV).

**R0 holds on HELD:** 5 of 5 unmodified finders find against G (+1.762 for league7103, +2.827 to +2.962 for the other four).

**G, the baseline (HELD, DEV beside):** against hand +2.530 (+2.255); against champ -0.018, z -0.1 (+0.122), level; against league7000 **+0.582, z 2.2, 28-0-20, BEATS** (+0.157, which did not). G beats league7000 on this set and not on the other.

**Labels over F' (all five finders), HELD (DEV beside):**

| kind | BEATS hand | ADDS (hand) | BEATS champ | ADDS (champ) | BEATS league7000 | ADDS (league7000) | summary |
|---|---|---|---|---|---|---|---|
| U | YES 5/5 (YES) | NO 0/5 (NO 1/5) | YES 5/5 (YES) | YES 5/5 (YES 4/5) | YES 5/5 (YES) | YES 4/5 (YES 5/5) | beats 3 of 3, adds 2 of 3 (same) |
| GT | YES 5/5 (YES) | YES 4/5 (PARTIAL 3/5) | YES 5/5 (YES) | YES 5/5 (YES) | YES 5/5 (YES) | YES 5/5 (YES) | beats 3 of 3, adds **3 of 3** (2 of 3) |
| GN | YES 5/5 (YES) | NO 0/5 (NO) | YES 5/5 (YES) | YES 5/5 (YES 4/5) | **YES 5/5 (NO 0/5)** | **YES 5/5 (NO 0/5)** | beats **3 of 3** (2 of 3), adds **2 of 3** (1 of 3) |

**Median U edge over G, hand, champ, league7000:** +2.842, +2.655, +2.601, +2.865 (DEV +2.084, +2.596, +1.997, +2.062). The finders beat each opponent by about what they beat G by.

**Where HELD and DEV differ:**

* **GN (the turn alone) against league7000** is +1.41 to +1.58 (z 4.2 to 4.5) on HELD and +0.45 to +0.59 (z 1.5 to 1.8) on DEV; its ADDS over G is +0.82 to +1.00 on HELD (z 2.8 to 3.1) and +0.30 to +0.43 on DEV. The turn alone beats league7000 on one set and not on the other, and the sets have to be pooled to say how much (the pooled ADDS is about +0.6 to +0.7). GN against champ: +0.69 to +1.08 (z 2.1 to 2.9) against DEV's +0.55 to +0.81. Note the five GN arms are not five independent arms: three finders have turn 2.8, so three of them are the same theta (+1.081 and +1.584 three times each) and the other two differ by a hair.
* **Hand:** G already wins by +2.53 and the seat-A edge is capped at +3.376 on 24 of the arms against it. U adds nothing (-0.070 to +0.464, 0 of 5); GT adds +0.55 to +0.74 on four finders (league7103's GT: +0.271, z 1.5, no add); GN adds nothing.
* **league7103** is the weak finder again: U edge over G +1.762, over champ +1.402, over league7000 +1.392 (its U does not add over G against league7000, +0.809, z 1.4, nor over hand, -0.007); on DEV +0.978, +1.101, +1.420.

**The mirror (finders against each other, first side's edge, HELD):** league7001 over league7100 -1.332 (z -6.3, 4-19-25); over league7103 +0.735 (not decided, z 1.7); over exploit7200 -0.072; over exploit7204 +0.264; league7100 over league7103 +1.589; over exploit7200 +1.111; over exploit7204 +1.626; league7103 over exploit7200 -1.454; over exploit7204 -0.875; exploit7200 over exploit7204 +0.200. **M1 THE STRONG FOUR ARE ALIKE: NO** (two of their six pairs are decided: league7100 over exploit7200 and over exploit7204, and league7100 over league7001, three in all); **M2 league7103 LOSES TO THE STRONG FOUR: YES** (decided against by three of the four; league7001 over it is +0.735, z 1.7, not decided; on DEV all four).

**Forecasts, scored** (my probability; outcome on the printed quantity of HELD; "calls" is the probability I gave to what happened):

| forecast | mine | outcome | calls |
|---|---|---|---|
| R0 holds on DEV | 92 | held | 92 |
| R0 holds on HELD | 90 | held | 90 |
| U BEATS hand (YES) | 95 | yes | 95 |
| U BEATS champ (YES) | 90 | yes | 90 |
| U BEATS league7000 (YES) | 88 | yes | 88 |
| U ADDS over G against hand (YES) | 10 | no | 90 |
| U ADDS over G against champ (YES) | 82 | yes | 82 |
| U ADDS over G against league7000 (YES) | 82 | yes (4 of 5) | 82 |
| the median U edge over each opponent within 0.5 of the median over G | 75 | yes (0.19, 0.24, 0.02) | 75 |
| GT BEATS champ (YES) | 85 | yes | 85 |
| GN BEATS champ (YES) | 60 | yes | 60 |
| GN ADDS over G against champ (YES) | 55 | yes | 55 |
| R-M1: the strong four are alike | 55 | **no** | 45 |
| R-M2: league7103 loses to the strong four | 75 | yes | 75 |

**Thirteen of fourteen went as the larger side said; the one miss is M1 (55).** The forecasts that had little weight (GN BEATS champ 60, GN ADDS champ 55) came out yes on HELD and not as plainly on DEV (GN ADDS champ +0.43 to +0.69 on DEV, and not in 1 of 5), and the three of 55 to 60 together are not a showing of skill. The one that DEV said "no" to and HELD scored, "within 0.5", was 75 and came out yes on HELD (DEV: no by 0.012).

**What the two sets say together (post hoc, labelled as such: no rule reads two sets).**

1. **The finders' edge is not specific to G.** Against champ and league7000, which G cannot beat clearly (+0.12 and -0.02 against champ, +0.16 and +0.58 against league7000), the finders (U) win by +1.4 to +2.9 on HELD and +1.1 to +2.6 on DEV, league7103 lowest on every one.
2. **What the turn alone carries is also not specific to G:** GN beats champ and league7000 on HELD (+0.69 to +1.58) and champ only on DEV; it adds over G against them by +0.3 to +1.1 on the two sets together, less than the triple (GT adds +0.7 to +2.8 against champ and league7000).
3. **The strong four are not four copies.** league7100 beats league7001 on both sets (-1.07 and -1.33 for the other way round, the draws 19 of 48 each time) and beats league7103, exploit7200 and exploit7204 on HELD by +1.1 to +1.6; their edges over G (+2.07 to +2.35 DEV, +2.83 to +2.96 HELD) differ by hundredths. Equal edges against G do not make equal sides.
4. **Nothing here is about why**, and nothing about opponents other than these three PD-autopilot tacticians (the hand tactician, the tuned tactician, league7000), the 24 geometries of each set, or a play against the sides trained against.

**What is NOT shown:** a mechanism; any opponent with weights, or trained after the finders; a ranking of the finders (the mirror is not transitive on these numbers: league7001 over league7103 +0.735 not decided, while both lose to league7100); the cap of +3.376 in seat A (a ceiling of the score, not examined).
