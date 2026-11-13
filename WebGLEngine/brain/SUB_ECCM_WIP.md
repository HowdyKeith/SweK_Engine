# Submarine duel, item 1: a seeker that can see through a decoy, so that a kit on both boats is still a game (2026-11-13; UNNUMBERED; REGISTERED BEFORE ANY CODE FOR IT IS WRITTEN AND BEFORE ANY GEOMETRY OF ITS SETS IS FLOWN)

Keith, 2026-11-13: "let's do 1, then 2, then 7" -- items `sub-duel-seeker-eccm`, `sub-duel-energy-cost` and `sub-tournament-runner-and-record` of `brain/BACKLOG_2026-11-01.md` section E. This is item 1. Items 2 and 7 will have notes of their own.

**What this changes in shared files, said first.** `physics/mechanics/subTorpedo.mjs` gets one more option on `stepTorpedo` (`eccm`), and `brain/subDuel.mjs` gets one more option on `duel()` (`seeker`) that passes it on. **Both are additive and default OFF: with no `seeker` every flight in the tree is the one it was**, to the fingerprint, and a gate row holds that. Another chat is training sub-vs-sub as this is written; which tree it trains in is not known here, so the change is kept to a few lines in case the files meet at a merge.

## 1. What is known (measured or read, not guessed)

* **The collapse (probe, `brain/BACKLOG_2026-11-01.md` appendix; seeds 90001 to 90024, now SPENT for any registered use):** the default tactician and the PD autopilot on both sides, 24 duels. No kit: a boat is sunk in 24 of 24, in 66 s on average of 240, 95 torpedoes fired, 24 hit. A decoy kit on BOTH boats: 142 fired, **0 hit, 24 of 24 time out**. All three kits on both: 136 fired, 0 hit, 24 of 24 time out.
* **A kit on one boat decides the duel** (`brain/SUB_COUNTERMEASURES_WIP.md`, the registered read, geometries 901 to 924): the decoy boat sunk in 0 of 48, the other in 31 of 48, edge +2.11.
* **Why, from the code:** `stepTorpedo` takes, at every look (5 Hz), the LOUDEST source inside its 35-degree cone and above the threshold. A decoy is 130 dB (`CM.decoy.sl`, a choice) against 112 dB for a boat at 2 m/s and 119 at the top speed, so it wins the cone the moment it is in it; the boat's tactician releases it when a heard torpedo reaches 22 dB (about 330 m), before the torpedo's seeker hears the boat at all (259 m for a 2 m/s boat). The torpedo has no memory of what it locked first and no way to tell a drifting noisemaker from a boat (the countermeasures note says so). A torpedo that detonates on a decoy damages nothing and is spent.
* **NOT known, and this is not a claim about it:** whether a real seeker of this size can classify a decoy; the numbers are chosen, as the countermeasures' are.

## 2. What is added (the seeker's two counter-countermeasures; every number a CHOICE, said)

`stepTorpedo(t, targets, { ..., eccm })`, `eccm` null by default, otherwise `{ lockMemory, classifyReject, stats }`:

* **`lockMemory` (bool).** The seeker remembers the id of the source it homed on at its last look. At a look, if that source is still heard (inside the cone and above the threshold), it is chosen even if a louder one is in the cone; otherwise the old rule (the loudest). The lock is forgotten when the seeker loses it (the existing 3 s). The torpedo state gains a `lockId` field ONLY when `eccm` is given.
* **`classifyReject` (0 to 1).** A source that declares a source level of its own (`sl` finite: the arena's noisemakers; a boat's level is computed from its speed, never declared) is recognised as a decoy by a given torpedo with this probability, **once, for good**: the draw is a pure function of the arena's seed, the torpedo's id and the decoy's id (not of the tick, so a decoy is not re-rolled five times a second). A recognised decoy is skipped by that torpedo's seeker: it cannot be chosen and does not count as loudest. A boat is never rejected.
* **`stats` (optional object).** `rejected` (looks on which a recognised decoy was skipped) and `held` (looks on which lock memory chose a source other than the loudest) are added to it, for the gate's and the command's checks that the mechanisms FIRE. They are never read by the seeker.
* **`seeker` on `duel()`** is the same object, handed to every torpedo of the duel (a property of the weapon, both sides alike); the interceptors of `brain/subCountermeasures.mjs` and the OGRE's torpedoes do not get it. The result gains `seeker: { ...stats }` only when `seeker.stats` is given.
* **NOT touched:** the tactician and its wrapper (its 22 dB release is untuned, and stays), the decoy's numbers, the screen, the interceptor, the torpedo's numbers, the duel's scoring.

## 3. The ladder, and what makes a rung "playable" (the second is MY CHOICE of what a game is, said; Keith may set it differently)

| rung | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| `lockMemory` | off | on | off | off | off | on |
| `classifyReject` | 0 | 0 | 0.25 | 0.5 | 0.75 | 0.5 |

Rung 0 IS the old seeker (the collapse's reference). The rungs are in order of how much was given to the seeker; **the task is the first rung, in this order, that is PLAYABLE:**

* **(a) a kit on both boats is still a fight:** with the decoy kit on both boats, a boat is sunk in at least **30 percent** of the duels (the no-kit game is 100 percent);
* **(b) a kit is still worth carrying:** with the decoy kit on ONE boat (in both seats), the boat that does not carry it is sunk in at least **25 percent of the duels more** than the one that does (the old seeker: 65 percent more).

If no rung of the ladder is playable, **the result is that none is, the read is not flown, and the ladder is not extended in this note.**

## 4. The sets and the reading

* **DEV (the calibration; read freely, it is not a result):** geometries **91001 to 91024** (`subTournament.geometries(24, 91001)`), each flown twice (a boat in each seat), 48 duels an arm. Smoke tests use seeds 1 to 4 only.
* **HELD (the read, flown ONCE for the chosen rung):** geometries **93001 to 93024** (moved by Amendment A below; it was 92001 to 92024), same shape. Seeds 90001 to 90024 are spent by the probe, 92001 to 92024 by the mistake of Amendment A, and used by nothing else.
* **Arms on DEV, every rung:** both boats with the decoy kit; the decoy kit on one boat (X) and not the other (Y), X in both seats. The tactician is the default's with the countermeasure wrapper at its registered thresholds (22, 22, 24 dB), the motion pilot the PD autopilot, instant actuators, 240 s, as the registered read had them. **Reference arms on DEV:** no kit at all, at rung 0 and at the chosen rung (the options should leave a kitless duel almost alone; any difference is printed).
* **Arms on HELD, the chosen rung:** no kit; decoy kit on both; decoy kit on one; all three kits on both (reported); and the old seeker (rung 0) with the decoy kit on both, as the collapse's reference on the same geometries. Printed for every arm: boats sunk, timeouts, torpedoes fired and hit, decoys released and torpedoes spent on one, torpedoes that recognised a decoy, looks on which lock memory held, the mean score of each side, and the seat's win count.
* **Checks that void a read, said and not weighed:** every arm flew the same geometries; no score is non-finite; at rung 0 and with no `seeker` the duel is byte-identical (fingerprints); at the chosen rung the mechanisms FIRE (at least one decoy recognised when `classifyReject` is above 0; at least one held look when `lockMemory` is on) in the arms that have a decoy; a side flown against itself with the same kit has an edge of exactly 0.

## 5. Forecasts, written before any geometry is flown

* The collapse reproduces on DEV at rung 0 (both-kit duels with a boat sunk: under 5 percent): **95**.
* Lock memory alone (rung 1) is NOT playable (the decoy is out before the seeker hears the boat, so there is nothing to hold): **85**.
* Some rung of 2 to 5 is playable by the rule: **75**. The first playable rung is 2 or 3: **60**.
* With the chosen rung on HELD, the both-kit sunk share is within 15 points of its DEV value: **70**; the one-kit advantage is at least 25 percent: **65**.
* Rung 4 (a 0.75 classifier) leaves decoys nearly worthless (condition b fails): **70**.
* The kitless duel at the chosen rung differs from rung 0 by at most 2 sunk of 48: **90**.

## 6. What a result would not say

That a real seeker can tell a decoy from a boat at any rate, or that a real decoy works against one that cannot (the numbers are mine). That the tactician's 22 dB release is a good rule (it is untuned; a late release changes the whole picture, as the sensitivity run of the countermeasures read showed, and is NOT swept here). That the game found is balanced beyond the two conditions of section 3: it is "playable" by a rule I wrote, not "fair". Anything about the screen or the interceptor, which this does not touch. Nothing is tuned after the HELD read.

## AMENDMENT A (2026-11-13; made after the command was written and BEFORE any DEV geometry was flown)

**What happened, said plainly.** While checking an edit to `tools/ship/takeSeekerEccm.mjs` I ran its `held` command to see that it started; it flew the whole HELD set (92001 to 92024) at rung 3 and printed to the terminal, and I read the first lines, cut at 80 characters: the kitless arm 48 of 48 duels with a boat sunk, the both-kit arm at rung 3 30 of 48 sunk (63 percent), then a line cut off after "torpedoes 216". Nothing was written (no `--write`), nothing else was read, and no DEV set had been flown. **A set that has had a seed read is not fresh, so HELD is now geometries 93001 to 93024 and 92001 to 92024 are never read again.** The forecasts of section 5 were written before any of this and STAND as written; what the mistake leaks is that at rung 3 the both-kit share on a set like HELD is about 63 percent, which the forecasts did not use. It does not touch the choice of the rung, which is DEV's. **The fix in the command:** `held` now refuses to run on the HELD set without `--write`, so a run is always a recorded one; the gate flies the smoke geometries through an override and never the HELD set.

## DEV RESULT (2026-11-13; `node tools/ship/takeSeekerEccm.mjs dev --write`, 48 s, geometries 91001 to 91024, both seats, 48 duels an arm; `brain/subEccmDev.json`; the gate `brain/subEccm-selfcheck.mjs` green and sabotaged before it was flown; the HELD set not flown yet)

| rung | lock memory | classifyReject | both-kit: a boat sunk | one-kit: carrier sunk / other sunk | rule |
|---|---|---|---|---|---|
| 0 (the old seeker) | off | 0 | **0 of 48** (48 timed out; 262 torpedoes fired, **0 hit**; 126 spent on a decoy) | 0 / 36 (+75 percent) | not playable (a) |
| **1** | **on** | 0 | **18 of 48 (38 percent)** (30 timed out; 18 hit; 58 spent on a decoy) | 0 / 37 (+77 percent) | **PLAYABLE** |
| 2 | off | 0.25 | 8 of 48 (17 percent) | 4 / 34 (+63 percent) | not playable (a) |
| 3 | off | 0.5 | 30 of 48 (63 percent) | 13 / 29 (+33 percent) | PLAYABLE |
| 4 | off | 0.75 | 44 of 48 (92 percent) | 21 / 25 (+8 percent) | not playable (b) |
| 5 | on | 0.5 | 40 of 48 (83 percent) | 15 / 29 (+29 percent) | PLAYABLE |

**By the registered rule the task is rung 1: lock memory alone.** The kitless arm is identical at every rung (a boat sunk in 48 of 48, 192 torpedoes, 48 hits, seat A winning 40 of 48): the options leave a duel with no decoy alone, as they should. At rung 1 the mechanism fired (held looks: 15,946 in the both-kit arm, 6,811 in the one-kit arm) and nothing was recognised (the classifier is off). The checks passed.

**The forecasts, scored (all written before any geometry was flown):** the collapse reproduces on DEV, under 5 percent sunk at rung 0 (95): **yes**, 0 percent. **Lock memory alone is NOT playable (85): NO, it is** (38 percent sunk, +77 percent). Some rung of 2 to 5 is playable (75): yes, rungs 3 and 5; the first playable rung is 2 or 3 (60): **no, it is 1** (the registration put the first playable rung beyond the one that ended up chosen). Rung 4 leaves decoys nearly worthless, condition (b) failing (70): yes, +8 percent. The kitless duel differs from rung 0 by at most 2 sunk of 48 (90): yes, by none. The two I got wrong are the two that bear on the mechanism: **I thought a decoy released before the seeker hears the boat leaves nothing for a lock to hold, and the held-look counts say the seeker does hold something**: with decoys of 40 s of life drifting at 1.2 m/s, a torpedo that locked on a decoy keeps it until it expires or leaves the cone, and then runs on straight (the existing 3 s lock loss) instead of going to a louder decoy released later, so a second and third decoy are worth less than before. That reading is from the counts, not from a trace of a torpedo.

**What the rule does NOT say about rung 1 (and the HELD read cannot say either):** rungs 3 and 5, with a classifier, are also playable and make the game more lethal (63 and 83 percent sunk) while keeping a decoy worth carrying (+33 and +29); the rule picks the weakest option, not the best game. Whether lock memory is a plausible model of a seeker is not shown: it is one sentence of rules. Nothing is changed after this result; HELD is flown once at rung 1 next.

