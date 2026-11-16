# The fly's escape circuit as a 6-DOF craft's collision reflex -- registered before any code (WIP note, UNNUMBERED)

Keith, 2026-11-16: "Let's do the 6-DOF collision reflex" (`fly-pilots-6dof` in `brain/BACKLOG_2026-11-12_BRAIN_PROJECTS.md`).
This note is committed before `brain/rl/ramEnv.mjs`, `tools/ship/flyRam.mjs`, `tools/ship/takeFlyRam.mjs` and
`tools/ship/flyRam-selfcheck.mjs` exist. It edits no file another chat owns: `brain/pilot6dofPolicy.mjs`, the duel, the
collision resolver, the PD autopilot and the Close pilot's weights are imported and used as they are.

> **Given a break-away manoeuvre and the fly's escape circuit to say WHEN, does the tree's best 6-DOF pilot fly better than
> it does alone -- at the fight's own price of a hit point lost to a ram?**

## 1. A correction first
The backlog entry I wrote said "no helm with a fly circuit has ever been trained". That is true of `brain/helmPolicy.mjs`,
the capital ship's helm, which belongs to the ship-against-ship work of another chat. It is NOT true of the 6-DOF duel: the
fly's descending Giant Fiber circuit (34 cells, 313 synapses) already holds three trained pilots there (Default, League,
Close; `docs/BRAIN-CAPABILITY-MAP.md`). What the map says is missing is this: the duel's job is "turn, thrust, fire, and not
ram", and **"nothing learned to ram less"**. `tools/ship/train6dofLeague.mjs` holds a `careful` profile (0.05 of score a hit
point lost to a ram; ram damage to be at most half the shipped pilot's) and the tree holds no pilot that met it.

## 2. What was measured before this note, and on what
With code that exists (`pilot6dofPolicy.duel`) and a scratch copy of the manoeuvre of section 3, on 60 scoping seeds
(1000001 + 37 k, k 0 to 59) that no part of the round uses again; the Close pilot against the PD autopilot, the joust start,
collisions on:

| break when the time to contact is under | fight score | W / L | games with a ram | hit points lost to rams a game |
|---|---|---|---|---|
| never (the pilot alone) | 17.94 | 47 / 6 | 30 of 60 | 8.3 |
| 1.5 s | 17.18 | 49 / 5 | 32 | 8.1 |
| 2 s | 15.74 | 39 / 10 | 25 | 5.5 |
| 3 s | 14.90 | 40 / 6 | 20 | 4.6 |
| always, while closing | 6.10 | 15 / 14 | 20 | 4.7 |

* **Two thirds of these rams cannot be avoided by this ship.** With the break on at 3 s, every game that still rams began
  with under 2 s to contact (0.7 to 1.9 s), and no game that began with more rams. The joust start's median is 1.8 s. The
  ship turns by torque and has one engine at 2 m/s^2: a break needs about 2 s.
* So the hand rule already avoids every ram that could be avoided here (10 of the 30 games), and it costs the pilot fight:
  3 points of score at 3 s. **The `careful` profile's bar (half the ram damage) is out of reach of this manoeuvre on this
  start: breaking always leaves 55 percent.** That is said now so it is not discovered later.
* In the duel's own score a ram is nearly free: a hit point of one's own costs 0.01, and the foe loses as many. That is
  why nothing learned to ram less. A price has to be put on it, and section 3 says which.
* The pilot alone on the round's 200 audit seeds (existing code; reward at the price of section 3): **reward 16.5092**,
  fight 18.0060, 8.981 hit points lost to rams a game, 100 games of 200 with a ram, W150 / L21. A duel is about 18 ms.

## 3. The task (`brain/rl/ramEnv.mjs`, to be built)
* **The fight:** `pilot6dofPolicy.duel(craft, "autopilot", { seed, collisions: true, scenario: "joust", ramPenalty: 1/6 })`,
  30 s, the craft on side A. Nothing of the duel is restated: the craft is handed to it as a pilot function.
* **The craft** is the Close pilot (`brain/pilot6dofWeightsClose.json`) with a reflex over it. Every tick the reflex is
  given two numbers of the foe, and they are the escape rounds' two (`brain/rl/escapeEnv.mjs`, the same scales): its
  **angular size** (2 atan(R / range) x 2, R the hull's bounding radius) and its **looming rate** (the size's change a tick,
  x 20), exact, from the range and the closing speed. When the reflex's one output is above 0 the craft BREAKS this tick;
  otherwise the pilot flies.
* **The break is written by hand; the circuit only says when** -- as a fly's Giant Fibers trigger a take-off and do not
  steer it. Break: turn the nose (the PD autopilot's own attitude law) to the direction straight away from the line the foe
  is coming down, thrust when facing it, hold fire. If the foe is dead on, the direction is world +y.
* **The reward of a fight** is the duel's score less 1/6 a hit point lost to a ram: `REWARD.hit / SHOT_DAMAGE`, what a hit
  point taken off the foe by a shot earns. **The fight's own price of a hit point, and not a number tuned here** (the
  scoping table was read at 0.1; at 1/6 its order is the same).
* **For the trainer** (`brain/rl/dockPolicy.js` `trainDockES`, unchanged) an episode is one step: the environment is handed
  the fly and flies the whole duel with it. The trainer keeps the weights of its best battery reward.

## 4. The arms, the start, the recipe
* **GF**: round 5's real visual circuit, exactly (`tools/ship/flyEscapeVision.mjs` `ARMS_OF.GF`: 42 cells, 369 connections
  started at 0.01 x their synapse counts, the looming rate into the LC4 cells, the size into the LPLC2 cells, the two Giant
  Fibers read). **GSHUF**: its free shuffle (`ARMS_OF.GSHUF`). **FREE**: the free net of 113 units on the same two numbers.
* **The start is the pilot alone.** Each arm's output weights and bias start at zero, so the reflex says nothing and the
  craft is the Close pilot to the bit (a gate row: the same duel fingerprints). No hand reflex is mixed in.
* **Draws 1 to 12 an arm: 36 trainings.** Recipe: `{ maxSteps: 1, iters: 60, pop: 32, sigma: 0.14, lr: 0.05, trainEps: 12,
  fresh: true, battery: 100 }` -- the escape rounds' sigma, lr and fresh episodes; fewer iterations and flies because a duel
  costs 18 ms and the box has four processors. About 29,000 duels a training.
* **Audit:** the 200 seeds 900001 + 7919 k, flown once a record. The trainer's seeds (5000 + 17 k, and + 104729 (it + 1))
  meet none of them, nor the scoping seeds.

## 5. The readings (alpha 0.01, exact, ties against; the checks first, and a failed check means nothing is weighed)
* **P, the question: the 12 GF craft against the pilot alone** (sign test on the audit reward against 16.5092). BETTER /
  WORSE / CANNOT BE TOLD APART. A craft whose reflex never fires scores the pilot's number and counts against.
* **H: the 12 GF craft against the hand reflex** (break under 3 s; its audit reward is measured by the round's code and
  stands in the floors record).
* **T1: GF against GSHUF**, **T2: GF against FREE** (rank sums). T1 asks whether rounds 5 and 6's result -- the real
  circuit trains more surely than a free shuffle -- is there on a second task.
* **Described, not tested:** each arm's fight score, W / L, games with a ram, hit points lost to rams (and their share of
  the pilot's own, beside the `careful` bar of a half), ticks spent breaking, and how many craft never break at all.
* Floors in the record: the pilot alone, the hand reflex, breaking always while closing, and each arm's untrained craft.

## 6. Expectations, written before the code
P: **CANNOT about 60 percent, WORSE about 25, BETTER about 15.** H: BETTER about 80. T1: CANNOT about 75, BETTER about 15.
T2: CANNOT about 70. At least half of the 36 craft never break on the audit: about 45. Some arm's ram damage at or under
half the pilot's: about 3.

## 7. What a reading would and would not mean
BETTER on P would be the first thing in this tree to make a 6-DOF pilot ram less and fly no worse for it. CANNOT or WORSE
would say what section 2 leans to: for the best pilot, on this start, the reflex costs more fight than the rams are worth
at the fight's own price -- and most of the rams were never avoidable. None of it is about the animal, and a craft is not a
fly: the manoeuvre is mine, the price is the duel's, the cells are rectified sums given one number each.

## 8. The cost
36 trainings of about 9 minutes, four at a time: about an hour and a half. Resumable.

## 9. The run (to be written; the gate never runs it and never gives the command the word `run`)
`node tools/ship/takeFlyRam.mjs run` -> `brain/flyRamRound.jsonl`, committed byte for byte, whole, before it is read;
`node tools/ship/takeFlyRam.mjs read` prints the checks and the reading.
