---
type: claim
title: A curve read off one sample is a guess with a graph
description: "v2557's ORIGINAL kill condition, unrun for 25 versions: 'the mold only beats the bandits because the bandits are CONTEXT-FREE. Race it against a CONTEXTUAL learner -- one that can "
tags: [settled, "swek-engine", v2582]
timestamp: v2582
---

# A curve read off one sample is a guess with a graph

- **Status:** settled  
- **Since:** v2582

## Prediction

v2557's ORIGINAL kill condition, unrun for 25 versions: 'the mold only beats the bandits because the bandits are CONTEXT-FREE. Race it against a CONTEXTUAL learner -- one that can actually SEE the smell -- and it loses.' Marked RIG-ONLY because 'brain.js is Deno-only'.

## Why

That label is TRUE ABOUT brain.js -- it calls Deno.* at lines 49, 69, 71. IT IS NOT TRUE ABOUT THE LEARNER: brain/mlp.js has ZERO imports, zero Deno, zero GPU. THE LABEL DESCRIBED THE HOST AND I HAD BEEN USING IT TO MEAN THE THING. FOURTH EXPIRED BLOCKER THIS SESSION -- v2560 (emsdk), v2570 (box3d.wasm), v2576 (real terrain), now this. A REASON THAT EXPIRED IS A HABIT.

## Measured

THE REFLEX WINS, AND THE INTERESTING PART IS HOW. Nine independent seeds, median (min..max): contextual MLP after 0 episodes 4.1 (0.3 .. 45.7); after 10 episodes 23.0 (4.8 .. 123.7); after 200 episodes 79.9 (20.3 .. 191.5). moldReflex3: 312.4 (312.4 .. 312.4), TRAINED NEVER. SO IT LEARNS -- monotonically, 20x over 200 episodes -- AND IT IS STILL A QUARTER OF A REFLEX THAT HAS NEVER SEEN A GRADIENT. AND THE SPREAD IS THE REAL FINDING: THE LEARNER IS A LOTTERY, A TENFOLD RANGE ON IDENTICAL CODE, WHILE THE REFLEX HAS ZERO VARIANCE AND ITS WORST RUN BEATS THE LEARNER'S BEST RUN. The reflex wins because IT NEEDS NO SAMPLES -- it recomputes the answer from the smell every step and never rolls a die. THE LEARNER'S MEMORY IS NOT AN ADVANTAGE HERE; IT IS THE THING IT HAS TO OVERCOME.

## Kill condition

A learner that beats 312.4 on the median of nine seeds. The policy obeys the SAME contract the mold obeys -- reset(n)/observe(x,y,z)/pick(t)/update(arm,0|1), READ from paramecium.js:133-168 -- and gets the same binary reward, because a real chemotactic cell compares now against a moment ago and cannot read absolute concentration.

# Citations

- Code: simulation/life/contextualRace-selfcheck.mjs (9 checks, gated). THE LESSON IS MINE AND IT COST TWO HEADLINES. I ran the race ONCE and reported '0.2 -> 101.6 -> 39.5: it learns, peaks, then UNLEARNS'. MY OWN GATE FAILED ON ITS NEXT RUN: same code, different init, 0.1 -> 1.7 -> 72.7, THE OPPOSITE SHAPE. Then it killed a second one: I had written 'the contextual learner loses to the BLIND learner too, 0.1 vs 0.9' -- the next run gave 25.1 vs 0.9, because the cold-start spread is 0.3 .. 45.7 AND THAT COMPARISON IS A COIN FLIP I REPORTED AS A RESULT. BOTH ARE DELETED. A CURVE READ OFF ONE SAMPLE IS A GUESS WITH A GRAPH -- and it is the same disease as every other guess this session, wearing a lab coat. ALSO RECORDED, because it would have been the easy lie: brain/learn.js's MLPTrainer DOES run in node with no device, but its API is rememberRows([{id,name,x,p}]) and ingest(outcomes, attackDamageOf) -- IT IS COMBAT-SHAPED, the ES tactics learner. A PARAMECIUM HAS NO ATTACKS AND NO OUTCOMES. Forcing it through would have meant bending a combat-outcome trainer into a chemotaxis race and calling it 'the engine's brain'. The learner here is written honestly and labelled as mine, and the conclusion is ABOUT THE ARENA, NOT ABOUT WHOSE MLP IT IS. !! AND THE LAST ONE, WHICH IS THE WORST AND THE BEST: THIS CHECK PASSED ALONE AND FAILED UNDER ship.mjs, ON IDENTICAL CODE. Of course it did. IT MEASURES A LEARNER I HAD JUST PROVEN IS A LOTTERY, AND I LET THE LOTTERY INTO THE VERDICT -- unseeded Math.random() in a gate. A FLAKY GATE IS WORSE THAN NO GATE: IT TEACHES YOU TO RE-RUN UNTIL GREEN. It is A CONTROL THAT CANNOT FAIL WEARING THE COSTUME OF ONE THAT CAN -- the same species as v2568's compass, which passed sixteen versions because every check asserted an ordering a compass satisfies. THE RNG IS SEEDED NOW (LCG, seeded per block) AND THE GATE RETURNS 94.9 TWICE. The nine-seed table stays unseeded -- THAT IS THE SCIENCE. The tripwire is seeded -- A TRIPWIRE MUST GIVE THE SAME ANSWER TWICE. THREE HEADLINES OF MINE DIED IN THIS ONE ROUND AND MY OWN GATE KILLED ALL THREE.
- Page: `/paramecium.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
