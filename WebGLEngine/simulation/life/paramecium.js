// WebGLEngine/simulation/life/paramecium.js — v2552
//
// A PARAMECIUM IS A BANDIT WITH A BODY.
//
// The slime mold (slime-mold.html) is Physarum: sense three points, steer at the strongest, deposit, diffuse.
// That is a REFLEX WITH FIXED PARAMETERS, and it is famous because the reflex is enough -- it solves mazes and
// reproduces the Tokyo rail network with three samples and a comparison. Putting a brain on it would be Dijkstra
// versus the GPU brain again (v2137-v2170: 50x slower, 40 degrees worse). Do not.
//
// A paramecium is a different animal. Its real behaviour is the AVOIDING REACTION: swim, bump or taste something
// worse, back up, turn to a NEW heading, swim again. That is RUN-AND-TUMBLE -- the same thing E. coli does -- and
// run-and-tumble IS A BANDIT: each heading is an arm, the reward is whether things improved, and the whole
// problem is how long to keep pulling a heading that is working.
//
// That is exactly what v2547 established this brain is: a contextual bandit, {name, reset(k), pick(t),
// update(arm, reward)}. So THE POLICY INTERFACE HERE IS THE SAME ONE, DELIBERATELY. The brain plugs in on the rig
// with no adapter, and can be marked against bandit.mjs's fixed wall on the way past.
//
// ---- WHAT WORLD IS IT ACTUALLY SWIMMING IN --------------------------------------------------------------------
//
// box3d.wasm IS NOT IN THIS TREE (v2546 established that, and v2549 proved the toolchain is unreachable from the
// sandbox: storage.googleapis.com -> 403). box3dLoader.js:124 notes that the planar fallback "answers this too" --
// which means a paramecium "released into the box3d world" would SILENTLY BE SWIMMING IN planarFallbackWorld and
// nothing would say so.
//
// So this takes a world as an argument and REPORTS WHICH ONE IT GOT. Both answer the same ten calls (addShip,
// setVelocity, step, bodyCount, readTransforms, readVelocities, supportsJoints, joint*), which is what makes the
// substitution invisible and therefore dangerous. `worldName` is not decoration: it is the difference between
// "the paramecium lives in box3d" and "the paramecium lives in a stand-in that answers like box3d".
"use strict";

/** The food field: a smooth gradient with a peak. Deterministic -- an arena that changes is not a wall. */
export function chemoField(peak = [6, 0, 6], sigma = 4) {
    return {
        peak, sigma,
        /**
         * v2568 -- THE NOSE GAINS A Y.
         *
         * chemoField's peak has ALWAYS been [6, 0, 6] -- three numbers, with a y slot sitting at zero -- and
         * at(x, z) has ALWAYS thrown the third one away. THE DATA STRUCTURE KNEW ABOUT THE DIMENSION; THE SENSOR
         * NEVER ASKED. That is the fourth time this exact shape has appeared: addBox was on the loader before
         * v2565 asked for it, impulse was on line 46 before v2567 asked, nothing CALLED addBox for a version
         * after it existed, and now this.
         *
         * v2567 measured the cost: under impulse control the creature FELL 418 METRES AND SCORED EXACTLY THE
         * SAME, still reporting best taste 1.000, because its nose could not smell the axis it was falling down.
         * THE WORLD REACHED THE CREATURE; THE CREATURE'S SENSES DID NOT REACH THE WORLD.
         *
         * at3 is added; at is NOT touched. Every number from v2552 to v2567 was measured through at(x, z), and
         * this engine does not rewrite history to make a new idea look good.
         */
        at3(x, y, z) {
            const dx = x - peak[0], dy = y - peak[1], dz = z - peak[2];
            return Math.exp(-(dx * dx + dy * dy + dz * dz) / (2 * sigma * sigma));
        },
        at(x, z) {
            const dx = x - peak[0], dz = z - peak[2];
            return Math.exp(-(dx * dx + dz * dz) / (2 * sigma * sigma));
        },
    };
}

/** The headings a body may choose. These ARE the bandit's arms. */
/**
 * v2568 -- LEGS WITH A Y. N directions spread evenly over a sphere (Fibonacci lattice), so no axis is
 * privileged and no direction is a special case. headings() is untouched: a circle is the right answer for a
 * planar world, and every number v2552-v2567 was measured through it.
 *
 * v2557 measured the shape of this in freeSpaceWorld: the mold's cone-of-3 -- the direct translation of
 * left/forward/right -- SCORED ZERO in 3D. THE NUMBER THREE WAS A FACT ABOUT PLANES. Cone-of-5 worked. So a
 * creature given 3D legs also needs a wider cone, and that is not a tuning detail, it is the geometry.
 */
export function headings3(k = 26) {
    const out = [], phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < k; i++) {
        const y = k === 1 ? 0 : 1 - (i / (k - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y * y)), th = phi * i;
        out.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    return out;
}

export function headings(k = 8) {
    const out = [];
    for (let i = 0; i < k; i++) out.push((i / k) * Math.PI * 2);
    return out;
}

/**
 * Run one swimmer for T steps and report how much food it found.
 *
 * @param {object} world      anything answering addShip/setVelocity/step/readTransforms
 * @param {string} worldName  WHICH world this is. Named, not guessed -- see the header.
 * @param {object} policy     {name, reset(k), pick(t), update(arm, reward)} -- v2547's bandit interface, on purpose
 * @param {object} opts
 * @returns {{name, worldName, food, best, steps, arms, path}}
 */
export function swim(world, worldName, policy, opts = {}) {
    const steps = opts.steps ?? 600;
    const dt = opts.dt ?? 1 / 60;
    const speed = opts.speed ?? 3;
    const runLen = opts.runLen ?? 8;
    const drive = opts.drive ?? "velocity";   // v2567 -- "velocity" DECLARES motion; "impulse" ASKS for it
    const impulseScale = opts.impulseScale ?? 0.35;         // how many ticks a "run" lasts before the next decision
    const field = opts.field ?? chemoField();
    const dirs = opts.dirs ?? headings(opts.arms ?? 8);   // v2568 -- caller may hand in headings3()

    // addShip({x, z, half}) -- an OBJECT, returning an index. I guessed positional arrays first; the file
    // says otherwise, and readTransforms packs SEVEN floats per body (pos xyz + quat xyzw), not three.
    // v2566 -- ASK FOR THE RIGHT BODY.
    //
    // This line said addShip for fourteen versions, and in the flat fallback that was harmless: everything
    // there is planar anyway. Point the same creature at REAL box3d and it becomes a real bug, because
    // swk_body_ship sets motionLocks{false,TRUE,false,...} -- Y LOCKED ON PURPOSE, so Endless Sky ships fly in
    // a plane. THE PARAMECIUM WOULD HAVE BEEN FLAT IN A 3D ENGINE, AND THE ENGINE WOULD NOT HAVE BEEN AT FAULT.
    // It asked for a ship. It got a ship.
    //
    // v2565 put addBox in the contract precisely so a caller can ask for a body that is not a ship. So: ask the
    // world what it is, and take what it offers. A spatial world gets a general body; a planar one gets the
    // ship it was always going to give us.
    const spatial = typeof world.dimensionality === "function" && world.dimensionality() === "spatial";
    const id = spatial
        ? world.addBox({ pos: [opts.x0 ?? -6, opts.y0 ?? 0, opts.z0 ?? -6], half: opts.half ?? 0.5 })
        : world.addShip({ x: opts.x0 ?? -6, z: opts.z0 ?? -6, half: opts.half ?? 0.5 });
    // v2568 -- 3D iff the headings ARE 3D and the field HAS a 3D nose. Read from the data, not from a flag: a
    // flag could disagree with the dirs array, and the disagreement would look like a policy that mysteriously
    // got worse rather than like a bug.
    const spatial3 = Array.isArray(dirs[0]) && dirs[0].length === 3 && typeof field.at3 === "function";
    // ONE sensing function, used at all three sites. They must agree: a creature that smells in 3D at one moment
    // and 2D at another is not noisy, it is broken, and it would read as noise.
    const sense = (tr) => spatial3 ? field.at3(tr[id * 7], tr[id * 7 + 1], tr[id * 7 + 2])
                                   : field.at(tr[id * 7], tr[id * 7 + 2]);
    policy.reset(dirs.length);

    let food = 0, best = 0, arm = 0, last = null, t = 0;
    const path = [];
    for (let s = 0; s < steps; s++) {
        if (s % runLen === 0) {
            // A TUMBLE. The reward for the run just finished is whether the taste IMPROVED -- not how good it is.
            // Absolute concentration would reward standing still in a decent spot; the gradient is the thing a
            // real chemotactic cell can actually measure, by comparing now against a moment ago.
            if (last !== null) {
                const tr = world.readTransforms();
                const now = sense(tr);   // 7 floats per body, not 3
                policy.update(arm, now > last ? 1 : 0);
            }
            // v2568 -- TELL THE POLICY WHERE IT IS.
            //
            // moldReflex has an observe(x, z) that sets the position its sensors sample from. NOTHING IN THIS
            // ENGINE HAS EVER CALLED IT. Not swim, not any page, not any test -- `grep -rn "\.observe(" ` finds
            // a ResizeObserver and an IntersectionObserver and nothing else.
            //
            // So `here` stayed [0, 0] from v2552 to v2567, and the mold sampled the field at the origin, forever.
            // MEASURED: 75 decisions, ONE DISTINCT HEADING. It picked direction 1 and swam in a straight line for
            // six hundred steps.
            //
            // IT WAS NEVER A MOLD. IT WAS A COMPASS. And it scored 200.4 -- beating every bandit -- because the
            // food is a single Gaussian peak and a straight line from the start position walks right into it.
            // EVERY MOLD-VS-BANDIT NUMBER FROM v2552 TO v2567 IS A COMPASS BEATING A BANDIT AT A TASK A COMPASS
            // SOLVES. The bandit was not losing to biology. It was losing to a constant.
            //
            // A POLICY WITH A SENSOR NOBODY FEEDS IS NOT A POLICY, IT IS A CONSTANT WEARING ONE.
            if (typeof policy.observe === "function") {
                const p = world.readTransforms();
                if (spatial3) policy.observe(p[id * 7], p[id * 7 + 1], p[id * 7 + 2]);
                else policy.observe(p[id * 7], p[id * 7 + 2]);
            }
            arm = policy.pick(++t);
            if (!(arm >= 0 && arm < dirs.length)) throw new Error(policy.name + " picked heading " + arm + ", which does not exist");
            const th = dirs[arm];
            // v2567 -- ASK, OR DECLARE. The default still DECLARES, because changing it would move every
            // number v2552 through v2566 measured, and this engine does not rewrite history to make a new idea
            // look good.
            //
            // v2566 measured that -9.8 m/s^2 of gravity changes this creature's score by EXACTLY ZERO. Not a
            // little: 201.1 both ways. Because this line runs every runLen ticks and OVERWRITES whatever the
            // world did in between. A BODY THAT SETS ITS VELOCITY DOES NOT HAVE PHYSICS DONE TO IT -- it has
            // physics done to it eight ticks at a time, and then forgets.
            //
            // opts.drive = "impulse" makes it ASK instead: add momentum in the chosen direction and LIVE WITH
            // WHAT THE WORLD DOES TO IT. That is the difference between a creature in a world and a creature
            // with a world-shaped backdrop.
            // v2568 -- a 3D heading is a VECTOR; a 2D heading is an ANGLE. Same loop, two shapes.
            const vel = spatial3 ? [th[0] * speed, th[1] * speed, th[2] * speed]
                                 : [Math.cos(th) * speed, 0, Math.sin(th) * speed];
            if (drive === "impulse") {
                world.impulse(id, [vel[0] * impulseScale, vel[1] * impulseScale, vel[2] * impulseScale]);
            } else {
                world.setVelocity(id, vel);
            }   // setVelocity(i, v) -- two args
            const tr = world.readTransforms();
            last = sense(tr);
        }
        world.step(dt);
        const tr = world.readTransforms();
        const v = sense(tr);
        food += v;
        if (v > best) best = v;
        if (s % 20 === 0) path.push([+tr[id * 7].toFixed(2), +tr[id * 7 + 2].toFixed(2)]);
    }
    return { name: policy.name, worldName, food, best, steps, arms: dirs.length, path };
}

/**
 * THE CONTROL: Physarum's rule, wearing the bandit interface so it can race on equal terms.
 *
 * It does not learn. It samples three points ahead (left, forward, right) and turns toward the strongest. Three
 * samples and a comparison. If the brain cannot beat this, that is the finding -- and it is the same finding as
 * the GPU brain losing to CPU Dijkstra by 50x.
 *
 * NOTE THE ASYMMETRY, STATED RATHER THAN HIDDEN: the mold SENSES THE FIELD AHEAD OF IT. The bandit only ever
 * learns whether the last run improved things. The mold is being given better information, not just a better
 * rule. That makes it a HARD control on purpose -- a control you can only beat by being told less is not a
 * control, it is a lap of honour.
 */
/**
 * v2568 -- THE MOLD, IN THREE DIMENSIONS. And the reason moldReflex could not simply be handed a sphere.
 *
 * moldReflex samples `for (const d of [-1, 0, 1]) { const i = (heading + d) % k; ... }`. That carries FOUR
 * assumptions, and only the first is famous:
 *
 *   1. THREE samples is enough        -- v2557 measured cone-of-3 scoring ZERO in 3D. "Three" is a fact about
 *                                        planes: in a plane you have two neighbours, on a sphere you have many.
 *   2. ADJACENCY IN THE ARRAY IS ADJACENCY IN SPACE -- and THIS is the one that kills it. dirs[i-1] and dirs[i+1]
 *                                        are genuinely beside dirs[i] ON A CIRCLE. ON A FIBONACCI SPHERE THEY ARE
 *                                        NOWHERE NEAR IT. The mold was sampling three essentially random
 *                                        directions and taking the best of three randoms. It scored 0.0 and it
 *                                        deserved to.
 *   3. a heading is an ANGLE          -- Math.cos(th), Math.sin(th)
 *   4. the field is at(x, z)          -- no y
 *
 * So this is not "moldReflex with a bigger number". It finds neighbours BY DIRECTION -- the cone of the coneN
 * nearest headings by dot product -- because on a sphere the only honest definition of "beside me" is angular.
 * v2557 measured exactly this shape in a throwaway script (cone-of-5 scored 575.5 where cone-of-3 scored 0.0)
 * AND NEVER LANDED IT. A MEASUREMENT THAT DOES NOT REACH THE CODEBASE IS A RUMOUR.
 *
 * moldReflex is untouched. Every number v2552-v2567 was measured through it.
 */
export function moldReflex3(field, dirs, sensorDist = 1.2, coneN = 5) {
    let cur = 0, here = [0, 0, 0];
    // Precompute each heading's cone ONCE. It is a property of the sphere, not of the walk, and recomputing it
    // every step would be the same answer at 26x the cost.
    const cones = dirs.map((a, i) =>
        dirs.map((b, j) => ({ j, dot: a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }))
            .sort((p, q) => q.dot - p.dot).slice(0, coneN).map((p) => p.j));
    return {
        name: "mold reflex 3D (cone of " + coneN + ")",
        reset() { cur = 0; },
        observe(x, y, z) { here = [x, y, z]; },
        pick() {
            let best = cur, bv = -Infinity;
            for (const i of cones[cur]) {
                const d = dirs[i];
                const v = field.at3(here[0] + d[0] * sensorDist, here[1] + d[1] * sensorDist, here[2] + d[2] * sensorDist);
                if (v > bv) { bv = v; best = i; }
            }
            cur = best;
            return best;
        },
        update() {},
    };
}

export function moldReflex(field, dirs, sensorDist = 1.2) {
    let k = 0, here = [0, 0], heading = 0;
    return {
        name: "mold reflex (3 samples)",
        reset(kk) { k = kk; heading = 0; },
        observe(x, z) { here = [x, z]; },
        pick() {
            let best = heading, bv = -Infinity;
            for (const d of [-1, 0, 1]) {
                const i = ((heading + d) % k + k) % k;
                const th = dirs[i];
                const v = field.at(here[0] + Math.cos(th) * sensorDist, here[1] + Math.sin(th) * sensorDist);
                if (v > bv) { bv = v; best = i; }
            }
            heading = best;
            return best;
        },
        update() {},
    };
}
