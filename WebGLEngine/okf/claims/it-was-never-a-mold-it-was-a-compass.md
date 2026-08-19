---
type: claim
title: It was never a mold. It was a compass.
description: "Since v2552 this engine has claimed that a gradient-sensing biological rule (Physarum's three-sensor reflex) beats every reinforcement learner at chemotaxis: mold 652.9 vs UCB1 335"
tags: [broken, "swek-engine", v2568]
timestamp: v2568
---

# It was never a mold. It was a compass.

- **Status:** broken  
- **Since:** v2568

## Prediction

Since v2552 this engine has claimed that a gradient-sensing biological rule (Physarum's three-sensor reflex) beats every reinforcement learner at chemotaxis: mold 652.9 vs UCB1 335.9 (v2552); two sensors 654.4 vs three 657.9 (v2556); mold 201.1 vs UCB1 74.5 in real box3d (v2566). Sixteen versions of findings, all gated, all green.

## Why

The rule was supposed to sample the field ahead of it and turn toward the better reading. moldReflex has an observe(x, z) that sets the position its sensors sample from.

## Measured

NOTHING IN THIS ENGINE HAS EVER CALLED observe(). Not swim, not any page, not any test -- `grep -rn \'.observe(\'` across the whole tree finds a ResizeObserver, an IntersectionObserver, and nothing else. So `here` stayed [0, 0] from v2552 to v2567 and the mold sampled the field AT THE ORIGIN, FOREVER. INSTRUMENTED: 75 decisions, ONE DISTINCT HEADING. It picked direction 1 and swam in a straight line for six hundred steps. IT WAS NEVER A MOLD. IT WAS A COMPASS -- and it scored 200.4, beating every bandit, because the food is a single Gaussian peak and a straight line from the start position walks right into it. THE BANDIT WAS NOT LOSING TO BIOLOGY. IT WAS LOSING TO A CONSTANT. Wire the one missing line and the real mold scores 357.5 with 8 distinct headings -- 78% better than the compass. THE FINDING SURVIVES (the mold still crushes UCB1's 75.4) AND EVERY NUMBER PUBLISHED FOR SIXTEEN VERSIONS WAS A COMPASS'S.

## Kill condition

Already dead. !! AND v2569 HAD TO CORRECT THIS ENTRY. v2568 claimed v2556's two-sensors-vs-three study was invalidated too -- that it compared two policies NEITHER OF WHICH WAS SENSING. THAT WAS FALSE. moldSensors-selfcheck.mjs imports ONLY chemoField; it never touches moldReflex or swim. It has its OWN walker, and the walk re-senses at its live position every single step: `a = steer(at, x, z, a); x += cos(a)*SPEED; z += sin(a)*SPEED;` INSIDE the loop. THE STUDY IS SOUND AND ITS HEADLINE STANDS. I FOUND A REAL BUG AND THEN ASSUMED ITS BLAST RADIUS WITHOUT READING THE CODE I WAS CONDEMNING -- the 34th guess of this session, and the first one that libelled my own past work. A REAL FINDING DOES NOT LICENSE A GUESS ABOUT WHAT ELSE IT BROKE. The compass bug is real and its true blast radius is exactly what ran through swim(): v2552, v2566, v2567.

# Citations

- Code: one line in swim() (`if (typeof policy.observe === \'function\') policy.observe(...)`) + a gated check that the mold CHANGES ITS MIND. !! AND THE GATE PASSED THE COMPASS FOR SIXTEEN VERSIONS, WHICH IS THE REAL LESSON: every check asserted THE ORDERING (mold beats bandit) and A COMPASS SATISFIES THE ORDERING TOO. THE ORDERING WAS NEVER THE CLAIM -- the claim was that a SENSING rule beats a learner, and nothing checked that it sensed. A POLICY WITH A SENSOR NOBODY FEEDS IS NOT A POLICY, IT IS A CONSTANT WEARING ONE. Fourth instance this session of a capability that existed and was never requested: addBox on the loader (v2565), impulse on line 46 (v2567), the y slot in chemoField\'s peak [6,0,6] (v2568), and observe() since v2552.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
