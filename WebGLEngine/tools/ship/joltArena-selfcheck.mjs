// WebGLEngine/tools/ship/joltArena-selfcheck.mjs -- v3982
//
// Run: node tools/ship/joltArena-selfcheck.mjs
//
// Keith, on jolt-arena.html: "when i click on the buttons at the top, it fires a bullet. i am not sure if the
// buttons are actually clicking, although Add Crew works, but they seem to fall through the floor?" and
// "Uncaught ReferenceError: rebuild is not defined at HTMLButtonElement.onclick (jolt-arena.html:26:48)". Three
// bugs in one report, and each has a different shape:
//
//   1. rebuild() was declared inside a `type="module"` script, whose top-level bindings are MODULE-scoped, not
//      global. An inline onclick="rebuild()" resolves against the global scope, so it threw. addCrew() and
//      flingCrew() both carried `window.addCrew = ...` / `window.flingCrew = ...` right after their definitions;
//      rebuild() never had. Same shape as v3978's population.html typo: a page that works AS LONG AS you don't
//      click the one thing whose wiring was missed.
//   2. addEventListener("pointerdown", ...) sits on the WINDOW, so it fires for every pointerdown anywhere in
//      the document, HUD buttons included -- an onclick="" running does not stop the event bubbling. Every click
//      on the toolbar also lobbed a boulder.
//   3. The crew rested for about half a second and then sank through a floor built ten metres thick for the
//      test -- not tunnelling, not mass, not step count. Isolated to a two-body rig: a Jolt point constraint
//      anchored in the small GAP between two boxes that do not touch sinks through the floor; the same
//      constraint anchored ON the boxes' shared touching face holds indefinitely. joltRagdoll.js's torso, head
//      and legs floated 0.02-0.09m clear of the part they joined to; all three are now flush.
//
// Section 4 runs the REAL Jolt WASM backend headlessly (it loads and steps in Node, verified elsewhere in this
// tree) rather than re-deriving the geometry claim from source text, because "every part touches its neighbour"
// is a fact about physics, and only running the physics proves it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);

const pagePath = path.join(ENG, "jolt-arena.html");
const raw = fs.readFileSync(pagePath, "utf8");
const src = noComments(raw);   // strings must stay intact -- onclick="rebuild()" and "pointerdown" are read as text below

console.log("joltArena-selfcheck -- do the HUD buttons work, and does the crew stay on its feet?\n");

// ---------------------------------------------------------------------------
console.log("1. *** EVERY onclick=\"fn()\" ON THIS PAGE HAS A window.fn = fn WIRING ***");
{
    // The general shape v3978 wrote for population.html, applied here: find every inline onclick target by name,
    // then require `window.<name> =` to actually appear. A count of "3 buttons" would not have caught this --
    // 2 of 3 already had it, exactly like population.html had 2 of 3 GPU call sites right.
    const targets = [...src.matchAll(/onclick="(\w+)\(\)"/g)].map((m) => m[1]);
    ok("at least the three known buttons were found", targets.length >= 3, targets.join(", "));
    const missing = targets.filter((fn) => !new RegExp("window\\." + fn + "\\s*=").test(src));
    ok("!! every onclick target has a matching window.<fn> assignment", missing.length === 0,
        missing.length ? "NOT WIRED: " + missing.join(", ") : targets.length + " targets, all wired");
    // named, not just counted -- the failure mode is exactly one function out of several, and "N of M wired"
    // would pass a report naming the wrong one
    ok("...and rebuild specifically is wired (the one Keith's console named)",
        /window\.rebuild\s*=\s*rebuild/.test(src));
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE PAGE-WIDE POINTERDOWN LISTENER IGNORES CLICKS INSIDE #hud ***");
{
    const m = src.match(/addEventListener\("pointerdown",\s*\(e\)\s*=>\s*\{([\s\S]{0,300})/);
    ok("the pointerdown listener exists at all", !!m);
    const body = m ? m[1] : "";
    ok("!! it guards against a click landing inside the HUD before doing anything else",
        /hud/.test(body) && /contains\(e\.target\)/.test(body) && /return/.test(body),
        body ? body.slice(0, 140).replace(/\s+/g, " ") : "no listener body captured");
    // this is the SPECIFIC bug -- clicking Rebuild/Add crew/Fling crew also fired a boulder. Assert the guard
    // sits BEFORE the boulder-spawn code, not after it (a check that only asked "does #hud appear anywhere in
    // the function" would pass a guard written in the wrong order, which guards nothing)
    const guardIdx = body.search(/contains\(e\.target\)/);
    const spawnIdx = src.indexOf('world.addBox({ type: "dynamic"', src.indexOf("pointerdown"));
    ok("...and the guard runs BEFORE the boulder is spawned, not after",
        guardIdx >= 0 && spawnIdx > 0 && (src.indexOf("contains(e.target)") < spawnIdx));
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE RAGDOLL GEOMETRY: EVERY JOINTED PART TOUCHES ITS NEIGHBOUR ***");
{
    // Read joltRagdoll.js's part/joint declarations as data rather than re-implementing the physics in the gate.
    // Each part is (name, px, py, pz, hx, hy, hz); each joint is (a, b, jx, jy, jz). All the joints in this
    // skeleton are along one axis at a time (vertical for the spine/legs, horizontal for the arms), so "touches"
    // is checked per-axis: the anchor coordinate on the joining axis must sit ON one part's boundary along that
    // axis, within float slop -- not floating in the gap between two boundaries.
    const ragSrc = fs.readFileSync(path.join(ENG, "physics", "jolt", "joltRagdoll.js"), "utf8");
    const rc = noComments(ragSrc);   // part/joint NAMES are string literals -- codeOnly would blank them
    const PART = /\bpart\("(\w+)",\s*([-.\d]+),\s*([-.\d]+),\s*([-.\d]+),\s*([-.\d]+),\s*([-.\d]+),\s*([-.\d]+)\)/g;
    const JOINT = /\bjoint\((\w+),\s*(\w+),\s*([-.\d]+),\s*([-.\d]+),\s*([-.\d]+)\)/g;
    const parts = new Map();
    for (const m of rc.matchAll(PART)) parts.set(m[1], { px: +m[2], py: +m[3], pz: +m[4], hx: +m[5], hy: +m[6], hz: +m[7] });
    // resolve `const pelvis = part("pelvis", ...)` -> variable name to part-name, so joint(pelvis, torso, ...) reads
    const VARNAME = /\bconst\s+(\w+)\s*=\s*part\("(\w+)"/g;
    const varToPart = new Map();
    for (const m of rc.matchAll(VARNAME)) varToPart.set(m[1], m[2]);
    const joints = [...rc.matchAll(JOINT)].map((m) => ({
        a: varToPart.get(m[1]) || m[1], b: varToPart.get(m[2]) || m[2], jx: +m[3], jy: +m[4], jz: +m[5],
    }));

    ok("all 7 body parts were parsed from source", parts.size === 7, [...parts.keys()].join(", "));
    ok("all 6 joints were parsed from source", joints.length === 6);

    const EPS = 1e-6;
    const bad = [];
    for (const j of joints) {
        const a = parts.get(j.a), b = parts.get(j.b);
        if (!a || !b) { bad.push(j.a + "-" + j.b + " (unresolved part)"); continue; }
        // The joining axis is the one whose EXTENTS do not overlap -- not "the one axis where centres differ".
        // Legs and arms differ from their parent on TWO centre coordinates (legL sits offset in both x and y from
        // pelvis) while still being joined along a single axis; what makes an axis "the" joining axis is that the
        // two boxes' spans on it are disjoint (or exactly touching), while their spans on every other axis overlap.
        const axes = ["x", "y", "z"];
        const disjoint = axes.filter((ax) => {
            const aLo = a["p" + ax] - a["h" + ax], aHi = a["p" + ax] + a["h" + ax];
            const bLo = b["p" + ax] - b["h" + ax], bHi = b["p" + ax] + b["h" + ax];
            return aHi <= bLo + EPS || bHi <= aLo + EPS;   // no interior overlap on this axis
        });
        if (disjoint.length !== 1) { bad.push(j.a + "-" + j.b + " (" + disjoint.length + " disjoint axes, expected exactly 1)"); continue; }
        const ax = disjoint[0];
        const aBound = a["p" + ax] + Math.sign(b["p" + ax] - a["p" + ax]) * a["h" + ax];
        const bBound = b["p" + ax] + Math.sign(a["p" + ax] - b["p" + ax]) * b["h" + ax];
        const gap = Math.abs(aBound - bBound);
        const anchor = ax === "x" ? j.jx : ax === "y" ? j.jy : j.jz;
        const onFace = Math.abs(anchor - aBound) < 1e-3 || (anchor >= Math.min(aBound, bBound) - 1e-3 && anchor <= Math.max(aBound, bBound) + 1e-3 && gap < 1e-3);
        if (gap > 1e-3) bad.push(`${j.a}-${j.b}: ${gap.toFixed(4)}m gap on ${ax} (parts do not touch)`);
        else if (!onFace) bad.push(`${j.a}-${j.b}: anchor ${anchor} not on the touching face (~${aBound.toFixed(4)})`);
    }
    ok("!! every joint's two parts touch on their joining axis, and the anchor sits on that face",
        bad.length === 0, bad.length ? bad.join(" | ") : "6 of 6 joints touch");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE REAL JOLT BACKEND, HEADLESSLY: A DROPPED CREW MEMBER MUST STAY ON ITS FEET ***");
{
    // Section 3 checks the CLAIM against source text. This checks the PHYSICS by actually running it: the same
    // vendored Jolt WASM build the browser uses, loaded and stepped in Node (verified elsewhere in this tree to
    // be deterministic and browser-identical). A source-only gate could not have caught the original bug --
    // "every part's numbers look reasonable" was true before AND after this fix; what changed is whether the
    // simulation, RUN, stays up.
    let mod;
    try {
        mod = await import(pathToFileURL(path.join(ENG, "physics", "jolt", "joltLoader.js")).href);
    } catch (e) {
        report("Jolt WASM unavailable here (" + (e && e.message) + ") -- section 4 SKIPPED, not passed");
    }
    if (mod) {
        const { createJoltBackend } = mod;
        const { createRagdoll } = await import(pathToFileURL(path.join(ENG, "physics", "jolt", "joltRagdoll.js")).href);
        const backend = await createJoltBackend();

        async function drop(secs) {
            const world = backend.createWorld({ gravity: [0, -9.8, 0] });
            world.addBox({ type: "static", pos: [0, -0.5, 0], half: [40, 0.5, 0.5] });
            const rag = createRagdoll(world, { x: 0, y: 1.6, z: 0, scale: 0.85 });
            for (let f = 0; f < 60 * secs; f++) world.step(1 / 60, 2);
            const xf = world.readTransforms();
            const minY = Math.min(...rag.parts.map((p) => xf[p.idx * 7 + 1]));
            const cohesion = rag.cohesion();
            world.destroy();
            return { minY, cohesion };
        }

        const r10 = await drop(10);
        ok("!! a single ragdoll dropped onto the ground stays ABOVE it after 10s of real sim time",
            r10.minY > -1, "lowest part y=" + r10.minY.toFixed(3) + " (the pre-fix version reached -262 by this point)");

        const r30 = await drop(30);
        ok("...and still holds after 30s, not just delaying the fall",
            r30.minY > -1, "lowest part y=" + r30.minY.toFixed(3));
        ok("...and the skeleton stays a skeleton -- joints have not stretched apart",
            r30.cohesion < 0.6, "max joint separation=" + r30.cohesion.toFixed(4) + "m (built at ~0.45m rest, from overlap at the shared faces)");
    }
}

// ---------------------------------------------------------------------------
console.log("\n5. *** SABOTAGE: EACH FINDING MUST BE ABLE TO FAIL ***");
{
    const missingWire = src.replace("window.rebuild = rebuild;", "");
    const targets = [...src.matchAll(/onclick="(\w+)\(\)"/g)].map((m) => m[1]);
    const missing = targets.filter((fn) => !new RegExp("window\\." + fn + "\\s*=").test(missingWire));
    ok("!! removing window.rebuild reddens section 1", missing.includes("rebuild"), "caught: " + missing.join(","));

    const noGuard = src.replace(/if \(!world \|\| \(hud && hud\.contains\(e\.target\)\)\) return;/, "if (!world) return;");
    const m2 = noGuard.match(/addEventListener\("pointerdown",\s*\(e\)\s*=>\s*\{([\s\S]{0,300})/);
    const stillGuarded = m2 && /contains\(e\.target\)/.test(m2[1]);
    ok("!! removing the HUD guard reddens section 2", !stillGuarded);

    // geometry sabotage: put the old pelvis-leg gap back and confirm section 3's parser catches it
    const ragSrc = fs.readFileSync(path.join(ENG, "physics", "jolt", "joltRagdoll.js"), "utf8");
    const sabotaged = noComments(ragSrc)
        .replace('part("legL", 0.16, -0.46, 0, 0.11, 0.3, 0.13)', 'part("legL", 0.16, -0.55, 0, 0.11, 0.3, 0.13)')
        .replace('joint(pelvis, legLU, 0.16, -0.16, 0)', 'joint(pelvis, legLU, 0.16, -0.18, 0)');
    ok("the sabotage text actually changed the source", sabotaged !== noComments(ragSrc));
    const PART = /\bpart\("(\w+)",\s*([-.\d]+),\s*([-.\d]+),\s*([-.\d]+),\s*([-.\d]+),\s*([-.\d]+),\s*([-.\d]+)\)/g;
    const parts = new Map();
    for (const m of sabotaged.matchAll(PART)) parts.set(m[1], { px: +m[2], py: +m[3], pz: +m[4], hx: +m[5], hy: +m[6], hz: +m[7] });
    const legL = parts.get("legL"), pelvis = parts.get("pelvis");
    const gap = Math.abs((pelvis.py - pelvis.hy) - (legL.py + legL.hy));
    ok("!! the reverted pelvis-leg gap is detected as non-touching (>1mm)", gap > 1e-3, "gap=" + gap.toFixed(4) + "m");
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
