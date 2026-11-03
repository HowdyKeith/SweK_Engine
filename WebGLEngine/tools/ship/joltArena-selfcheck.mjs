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
// SABOTAGE LOG, THE PAGE FIXES (2026-11-03) -- the byte-safe runner against this gate, fx/fracture/debrisPhysics-selfcheck.mjs and
// tools/roundhouse/joltScenes-selfcheck.mjs, every file restored byte-identical (sha256); the number is the rows that went red across the three:
//   A1 the crew spawned at the old place (x = 3.5) 1 | A2 the free-spot test never finding a body 1 | A3 the crew back at density 1 2 | A4 the crew thrown
//   with the old impulse 1 | A5 the panes left out 2 | A6 the ground back at 1 m deep 2 | A7 the wall's face without its gap 1 | A8 launch() throwing only
//   the first part 2 | A9 createRagdoll ignoring density 2 | A10 the page back to its own crew 2 | A11 the page throwing with the old fling 3 | C1 an old
//   line put back into the arena page 3 | C2 the herd page's fracture bias moved 5 | C3 the arena page's step without the wall's update 5 | D1 the crew
//   spawned below the ground top (y = -0.2) 2
//   D1 was added after the series, for the one row no design had turned red (the nine at rest); it went red with the fling row.
//   Every row of section 6 went red under at least one design.
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

// 2026-11-03 (unnumbered) -- THE PAGE FIXES. The spinning body's fourth round (physics/mechanics/SPINNING_BODY_WIP.md) flew this page's
// scene headless and found three faults: Add Crew spawned its first crew member inside the wall, Fling Crew threw the crew at hundreds of
// metres a second, and the arena -- 1 m deep -- dropped anything that drifted in z. The scene is now physics/jolt/joltArena.js, which the
// page and this section both build, so what is checked here is what the page runs.
console.log("\n6. *** THE PAGE FIXES: THE CREW SPAWN CLEAR, ARE THROWN AT 30 M/S, AND STAY IN THE ARENA ***");
{
    const near = (a, b, tol) => Math.abs(a - b) <= tol, code = noComments(raw);
    ok("!! the page builds its scene from physics/jolt/joltArena.js -- the arena, Add Crew and Fling Crew -- and no longer makes or throws a ragdoll itself",
        /import \{ buildArena, addCrew as addCrewTo, flingCrew as flingCrewAt \} from "\.\/physics\/jolt\/joltArena\.js";/.test(code) && /const arena = buildArena\(world\), wall = arena\.wall;/.test(code) &&
        /addCrewTo\(world, ragdolls\);/.test(code) && /flingCrewAt\(ragdolls\);/.test(code) && !/createRagdoll\(|\.fling\(|createStructures\(/.test(code));
    let mod;
    try { mod = await import(pathToFileURL(path.join(ENG, "physics", "jolt", "joltLoader.js")).href); } catch (e) { report("Jolt WASM unavailable here -- section 6 SKIPPED, not passed"); }
    if (mod) {
        const backend = await mod.createJoltBackend(), A = await import(pathToFileURL(path.join(ENG, "physics", "jolt", "joltArena.js")).href);
        const { createRagdoll } = await import(pathToFileURL(path.join(ENG, "physics", "jolt", "joltRagdoll.js")).href);
        const bounds = (w, i) => { const bb = w.raw().bodyOf(i).GetWorldSpaceBounds(); return [[bb.mMin.GetX(), bb.mMin.GetY(), bb.mMin.GetZ()], [bb.mMax.GetX(), bb.mMax.GetY(), bb.mMax.GetZ()]]; };
        const overlap = (p, q) => [0, 1, 2].every((k) => p[0][k] < q[1][k] && p[1][k] > q[0][k]);
        const world = () => backend.createWorld({ gravity: [0, -9.8, 0] });
        // THE ARENA
        const w0 = world(), a0 = A.buildArena(w0), statics = w0.bodies.filter((b) => !b.dynamic).length, wallMaxX = Math.max(...a0.wall.idxs.map((i) => bounds(w0, i)[1][0]));
        const pane = bounds(w0, 1), ground = bounds(w0, 0); w0.destroy();
        ok("!! the arena is a slab 1.5 m deep: a ground as deep, two panes at its faces and two end caps; and the wall's face, from addWall's own spacing, is where Jolt holds it (3.56)",
            statics === 5 && ground[0][2] === -A.ARENA.slab && ground[1][2] === A.ARENA.slab && near(pane[0][2], A.ARENA.slab, 1e-6) && near(A.wallFace(), wallMaxX, 1e-5) && A.wallFace().toFixed(2) === "3.56",
            `wall face ${A.wallFace().toFixed(3)}, Jolt ${wallMaxX.toFixed(3)}`);
        // ADD CREW, three presses, each trio after the last has settled for 2 s
        const w1 = world(), a1 = A.buildArena(w1), crew = []; let hits = 0;
        for (let p = 0; p < 3; p++) {
            const before = w1.bodies.length; A.addCrew(w1, crew);
            for (let i = before; i < w1.bodies.length; i++) for (let j = 0; j < before; j++) if (w1.bodies[j].dynamic && overlap(bounds(w1, i), bounds(w1, j))) hits++;
            for (let n = 0; n < 120; n++) { w1.step(1 / 60, 2); a1.S.update(); }
        }
        const firstMinX = Math.min(...crew[0].idxs().map((i) => bounds(w1, i)[0][0])), xf1 = w1.readTransforms();
        const restY = Math.min(...crew.flatMap((g) => g.idxs()).map((i) => xf1[i * 7 + 1])), broken1 = a1.S.brokenCount(); w1.destroy();
        ok("!! Add Crew, pressed three times: no part of a new crew member starts inside any body already there -- the wall or the crew before -- and the first stands clear of the wall's face",
            hits === 0 && crew.length === 9 && firstMinX > A.wallFace() && near(A.crewSpot(0) - A.CREW_HALF - A.wallFace(), A.ARENA.crew.clear, 1e-9), `${hits} overlaps; first crew member from x = ${firstMinX.toFixed(3)}`);
        ok("...and the nine come to rest on the ground without touching the wall", restY > 0 && broken1 === 0, `lowest part y = ${restY.toFixed(3)}, ${broken1} joints broken`);
        const wa = world(), wb = world(), ra = createRagdoll(wa, { x: 0, y: 2 }), rb = createRagdoll(wb, { x: 0, y: 2, density: A.ARENA.crew.density });
        const ratio = wb.inertia(rb.parts[0].idx).diag[0] / wa.inertia(ra.parts[0].idx).diag[0]; wa.destroy(); wb.destroy();
        ok("!! the crew weigh 25 times what a ragdoll did: createRagdoll honours `density`, and passing none builds the ragdoll it always built", near(ratio, 25, 1e-4) && A.ARENA.crew.density === 25, `inertia ratio ${ratio.toFixed(5)}`);
        // FLING CREW, three flights: flung after 1, 3 and 5 s of standing, then 8 s
        const flights = [1, 3, 5].map((wait) => {
            const w = world(), a = A.buildArena(w), c = []; A.addCrew(w, c);
            for (let n = 0; n < wait * 60; n++) { w.step(1 / 60, 2); a.S.update(); }
            const parts = c.flatMap((g) => g.idxs()); A.flingCrew(c); let peak = 0, coh = 0;
            for (let n = 0; n < 480; n++) { w.step(1 / 60, 2); a.S.update(); const v = w.readVelocities(); for (const i of parts) peak = Math.max(peak, Math.hypot(v[i * 3], v[i * 3 + 1], v[i * 3 + 2])); coh = Math.max(coh, ...c.map((g) => g.cohesion())); }
            const xf = w.readTransforms(), out = parts.filter((i) => xf[i * 7 + 1] < -1 || Math.abs(xf[i * 7 + 2]) > A.ARENA.slab).length, broken = a.S.brokenCount(); w.destroy();
            return { broken, out, peak, coh };
        });
        ok("!! Fling Crew: every throw craters the wall, no part leaves the arena, the fastest part stays under 40 m/s, and the joints hold",
            flights.every((f) => f.broken > 0 && f.out === 0 && f.peak < 40 && f.coh < 2), flights.map((f) => `${f.broken} joints, ${f.out} out, ${f.peak.toFixed(1)} m/s, cohesion ${f.coh.toFixed(2)}`).join(" | "));
        // EACH FIX CAN FAIL: the old spawn, the old throw, the old 1 m-deep arena
        const w2 = world(), a2 = A.buildArena(w2), before2 = w2.bodies.length, old = createRagdoll(w2, { x: 3.5, y: 1.6, z: 0, scale: 0.85 }); let inWall = 0;
        for (const p of old.parts) if (a2.wall.idxs.some((j) => overlap(bounds(w2, p.idx), bounds(w2, j)))) inWall++; w2.destroy();
        const w3 = world(); w3.addBox({ type: "static", pos: [0, -0.5, 0], half: [40, 0.5, 0.5] }); const r3 = createRagdoll(w3, { x: 6, y: 1.6, z: 0, scale: 0.85 }); r3.fling(-30, 7, 0, 5);
        let peak3 = 0; for (let n = 0; n < 30; n++) { w3.step(1 / 60, 2); const v = w3.readVelocities(); for (const i of r3.idxs()) peak3 = Math.max(peak3, Math.hypot(v[i * 3], v[i * 3 + 1], v[i * 3 + 2])); } w3.destroy();
        const w4 = world(); w4.addBox({ type: "static", pos: [0, -0.5, 0], half: [40, 0.5, 0.5] }); const S4 = (await import(pathToFileURL(path.join(ENG, "physics", "jolt", "joltStructures.js")).href)).createStructures(w4);
        S4.addWall({ ...A.ARENA.wall }); const c4 = []; A.addCrew(w4, c4); for (let n = 0; n < 60; n++) { w4.step(1 / 60, 2); S4.update(); } A.flingCrew(c4);
        for (let n = 0; n < 480; n++) { w4.step(1 / 60, 2); S4.update(); } const x4 = w4.readTransforms(), out4 = c4.flatMap((g) => g.idxs()).filter((i) => x4[i * 7 + 1] < -1).length; w4.destroy();
        ok("!! each fix can fail: the old spawn (x = 3.5) puts the first crew member inside the wall; the old throw (fling, an impulse, at density 1) sends parts past 100 m/s; and the old 1 m-deep arena loses flung crew",
            inWall >= 5 && before2 > 0 && peak3 > 100 && out4 > 0, `${inWall} parts in the wall, ${peak3.toFixed(0)} m/s, ${out4} parts lost`);
    }
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
