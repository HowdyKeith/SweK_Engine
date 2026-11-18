# SPACE ITEMS, 2026-11-18: space-needs-and-limits and nav-match-consumes-layer (Keith: "Let's do all 6 items", item 6)

**What was done.** No round was registered and nothing registered was flown. A map of the code, three round drafts and two adversarial judges (one judge pass was first cut off by a usage limit and re-run). **SAID PLAINLY, prototypes were flown on space seeds 1601 to 1800 only (battleshipFight scenarios, in no set): the map's probe on 1601-1610, the drafts' prototypes on 1611-1650 and 1701-1740, and the judges' re-runs on 1741-1752 and 1761-1800.** Those seeds should not be used as a registered set for these questions.

## What exists (the map)

* **The arena records no propellant, impulse or energy.** Mass is constant (physics/mechanics/rigidBody6dof.mjs: "no fuel-burn mass loss modelled"). Hull damage is hit points only, with no structural or acceleration load. A needs layer would hook the arena's move loop, where each craft's thrust and torque are applied, on the template of physics/mechanics/subNeeds.mjs.
* **The fighters have no braking.** Thrust is 0 or 16, forward only, and there is no RCS or translation thrust anywhere. The approach doctrine is a hand rule: steer for a point 60 units to one side of the ship, then strafe within 220 units with the thrust cut.
* **There is nothing to route around in space.** No arena or page has static obstacles. brain/fieldSpace.mjs is a 2-D Newtonian potential demo with no obstacles and no aim point, and its gate says so. The navigation layer that works (the submarine's) is plan-view 2-D.
* **Measured on the probe seeds:** the ship won 40 of 40 fights. Fighters spent their whole approach at full thrust (impulse about 248, a delta-v of about 31 u/s), and 381 of 384 reached the strafe gate in another sample.

## Why no round was registered

* **A RENDEZVOUS-AND-HOLD task with a delta-v budget (judged 3 of 10): foregone.** Today's rule cannot brake, so it captures 0 percent by construction. A fixed-speed flip-and-burn rule captures everything above a budget of about 35 u/s and nothing below it, deterministically. The "budget-aware" rule is the same rule at a slower speed, fitted at the one point it is read. The judge re-flew it on seeds 1761-1800 and every prototype number reproduced to the decimal.
* **A FUEL BUDGET IN THE BATTLE, with speed-capped controls (judged 4 of 10): the needs half is inert.** A budget of about half today's approach impulse flipped the fight: the ship won 48 of 48 at full throttle, the fighters won 47 of 48 under the budget. But a speed cap with unlimited fuel did the same (the ship destroyed in 46 of 48 under the cap, against 47 of 48 under the budget). The fights are decided in ONE PASS (0.96 to 0.99 strafe passes per fighter), so fuel left after arrival never acts, and the damage endpoint tops out at the ship's 1,500 hit points.
* **nav-match-consumes-layer: PARKED.** The approach has nothing to route around. A round would need an invented obstacle field (a rock field was prototyped: rocks killed 22.5 percent of approaching fighters under the doctrine and 9.1 percent with a grid planner) and edits to two heavily gated files. It is the right shape only once a space scene has obstacles of its own.

## What was found instead (a lead, from prototypes, not a result)

**THE FIGHTERS' FULL-THROTTLE, NO-BRAKE APPROACH IS DOMINATED BY A SLOW ARRIVAL.** Capping the closing speed (no budget at all) turned a ship that wins every fight into one that is destroyed in almost every fight. Either the doctrine is poor, or the ship's hand gunners are tuned against fast fighters (which is how they were built and gated), or both. This is a DOCTRINE and balance question, not a needs question. It is entered in the backlog as `space-approach-doctrine`. A round on it must:
* use an endpoint that does not top out (time until the ship dies, or damage per strafe-second);
* define the speed cap exactly (closing speed to the nearest foe's centre, in every mode, thrust cut at the cap);
* register the gunner presets it is read under, since the existing gunner training and gates assume today's doctrine.
