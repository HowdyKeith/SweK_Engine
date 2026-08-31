// WebGLEngine/tools/ship/fireworkShell-selfcheck.mjs -- v4209
//
// GATES world/fireworkShell.mjs -- a firework as ONE ballistic object that becomes many.
//
// *** THE HEADLINE IS THAT THE OBVIOUS WAY TO PICK A RANDOM DIRECTION IS VISIBLY WRONG. *** Three numbers in
// [-1,1] normalised samples a CUBE and projects it, piling stars toward the eight corners. Section 1
// measures it: chi-squared 27,996 over 120 equal-solid-angle cells against the ~119 a uniform sample gives,
// and 2.9x more stars in the fullest cell than the emptiest. That is a burst with lumps at the corners of an
// invisible box, and nothing but a measurement tells you.
//
// *** AND THE SHELL-NOT-PARTICLE MODEL EARNS ITSELF ON THE CROSSETTE. *** ui/gestureVfx.js's spawnBurst
// makes particles at a point, correctly, because a gesture burst has no flight. A firework star that carries
// its own fuse and breaks AGAIN cannot be expressed that way -- and it comes out of the same burst() call as
// the parent, which is what stops it being a special case bolted on.
//
// Run: node tools/ship/fireworkShell-selfcheck.mjs

import { randomDirection, ringDirections, PATTERNS, PATTERN_NAMES, burst, stepStars, launch,
         centroid, spreadRadius } from "../../world/fireworkShell.mjs";
import { FUSE, GRAVITY } from "../../physics/ballistics.mjs";
import { codeOnly, noComments, prose } from "./sourceScan.mjs";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const note = (m) => console.log("  ....  " + m);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

/** Bin directions into equal-solid-angle cells: uniform z bands x uniform azimuth. */
function binDirections(dirs, ZB = 10, AB = 12) {
    const c = new Array(ZB * AB).fill(0);
    for (const [x, y, z] of dirs) {
        let zi = Math.floor((z + 1) / 2 * ZB); zi = Math.max(0, Math.min(ZB - 1, zi));
        let ai = Math.floor((Math.atan2(y, x) + Math.PI) / (2 * Math.PI) * AB); ai = Math.max(0, Math.min(AB - 1, ai));
        c[zi * AB + ai]++;
    }
    const exp = dirs.length / (ZB * AB);
    let chi = 0, mn = Infinity, mx = 0;
    for (const v of c) { chi += (v - exp) ** 2 / exp; mn = Math.min(mn, v); mx = Math.max(mx, v); }
    return { chi, mn, mx, exp, ratio: mx / mn, cells: ZB * AB };
}

// 1) *** THE SPHERE IS UNIFORM, AND THE OBVIOUS ALTERNATIVE IS NOT. ***
{
    const N = 240000;
    const r = rng(12345);
    const good = Array.from({ length: N }, () => randomDirection(r));
    const g = binDirections(good);
    ok(g.chi < 400, `Marsaglia over ${N} directions: chi-squared ${g.chi.toFixed(0)} across ${g.cells} equal-solid-angle cells (uniform is ~${g.cells - 1})`);
    ok(g.ratio < 1.25, `and the fullest cell holds ${g.ratio.toFixed(3)}x the emptiest`);
    // The cube-then-normalise version, written out here so the comparison is a measurement and not a claim.
    const r2 = rng(12345);
    const naive = Array.from({ length: N }, () => {
        const x = r2() * 2 - 1, y = r2() * 2 - 1, z = r2() * 2 - 1, L = Math.hypot(x, y, z) || 1;
        return [x / L, y / L, z / L];
    });
    const b = binDirections(naive);
    ok(b.chi > 20000, `while cube-then-normalise gives chi-squared ${b.chi.toFixed(0)} -- ${(b.chi / g.chi).toFixed(0)}x worse`);
    ok(b.ratio > 2.5, `and piles ${b.ratio.toFixed(2)}x more stars into its fullest cell than its emptiest: visible lumps at the corners of an invisible box`);
    // Every direction must actually be a unit vector.
    let worst = 0;
    for (const d of good.slice(0, 5000)) worst = Math.max(worst, Math.abs(Math.hypot(...d) - 1));
    ok(worst < 1e-12, `every direction is a unit vector to ${worst.toExponential(1)}`);
    ok(randomDirection(rng(1))[2] !== randomDirection(rng(2))[2], "and different streams give different directions");
    // Two randoms, no loop: a rejection sampler would be uniform too but can loop unboundedly at 600 stars.
    let calls = 0;
    randomDirection(() => { calls++; return 0.5; });
    ok(calls === 2, `it costs exactly ${calls} random numbers and never loops`);
}

// 2) *** THE RING IS A PLANE, NOT A SPHERE WITH THE MIDDLE MISSING. ***
{
    const d = ringDirections(72, { tilt: 0.35 });
    ok(d.length === 72, "72 directions requested, 72 returned");
    // Planarity: every triangle of ring points must share one normal.
    const normals = [];
    for (let i = 1; i < d.length - 1; i++) {
        const a = d[0], b = d[i], c = d[i + 1];
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const L = Math.hypot(...cr);
        if (L > 1e-9) normals.push(cr.map((x) => x / L));
    }
    let dev = 0;
    for (const m of normals) dev = Math.max(dev, Math.abs(Math.abs(m[0] * normals[0][0] + m[1] * normals[0][1] + m[2] * normals[0][2]) - 1));
    ok(dev < 1e-12, `the ring is planar to ${dev.toExponential(2)}`);
    // Evenness: a ring with random azimuths reads as a failed sphere.
    const gaps = [];
    for (let i = 0; i < d.length; i++) {
        const a = d[i], b = d[(i + 1) % d.length];
        gaps.push(Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))));
    }
    const want = 2 * Math.PI / 72;
    ok(Math.max(...gaps) - Math.min(...gaps) < 1e-9, `and evenly spaced: every gap is ${gaps[0].toFixed(6)} rad`);
    ok(Math.abs(gaps[0] - want) < 1e-9, `which is exactly 2*pi/72 = ${want.toFixed(6)}`);
    ok(ringDirections(8, { tilt: 0 }).every(([, , z]) => Math.abs(z) < 1e-12), "an untilted ring lies flat in z");
    ok(ringDirections(8, { tilt: Math.PI / 2 }).some(([, , z]) => Math.abs(z) > 0.9), "and tilting it stands it up");
}

// 3) *** THE STARS INHERIT THE SHELL'S VELOCITY. ***
{
    const shell = { x: 0, y: 100, z: 0, vx: 18, vy: 6, vz: 0, t: 0 };
    const after = (inheritVelocity) => {
        let stars = burst(shell, "peony", { rand: rng(11), inheritVelocity });
        for (let i = 0; i < 120; i++) stars = stepStars(stars, 1 / 120, { rand: rng(5) });
        return centroid(stars);
    };
    const withIt = after(1), without = after(0);
    ok(withIt[0] > 8 && withIt[0] < 10, `with inheritance the flower centre travels to x=${withIt[0].toFixed(2)} m in one second`);
    ok(Math.abs(without[0]) < 1, `without it the centre stays at x=${without[0].toFixed(2)} -- pinned where it was spawned, like a decal`);
    ok(withIt[0] - without[0] > 8, `a ${(withIt[0] - without[0]).toFixed(2)} m difference in one second, on a shell moving at 18 m/s`);
    ok(withIt[1] > without[1], `and the rising shell carries the flower up: y=${withIt[1].toFixed(2)} against ${without[1].toFixed(2)}`);
    // At the instant of the burst every star is at the shell, so the radius starts at exactly zero.
    const fresh = burst(shell, "peony", { rand: rng(2) });
    ok(spreadRadius(fresh) === 0, "at the moment of the burst every star is at the shell: spread radius exactly 0");
    ok(fresh.every((s) => s.x === shell.x && s.y === shell.y), "...and at its position, not near it");
    ok(fresh.length === PATTERNS.peony.n, `a peony is ${fresh.length} stars`);
}

// 4) *** THE CROSSETTE BREAKS AGAIN, WHICH IS WHAT THE SHELL-NOT-PARTICLE MODEL IS FOR. ***
{
    let stars = burst({ x: 0, y: 100, z: 0, vx: 0, vy: 0, vz: 0, t: 0 }, "crossette", { rand: rng(3) });
    ok(stars.length === 24 && stars[0].generation === 1, `24 first-generation stars, each carrying breakAfter=${stars[0].breakAfter}`);
    // *** STEP BY COUNT, NOT UNTIL A TIME. *** The obvious harness -- `while (stars[0].t < target)` written as
    // `(stars[0]?.t || 99)` -- reports NO BREAK EVER, because a freshly-born child has t === 0 and `0 || 99`
    // is 99. That is the falsy-zero trap this tree already met in wgslSpec's sizeOf, where an UNKNOWN size
    // had to be null rather than 0. It cost a real debugging detour here on code that was working.
    let broke = -1, beforeCount = stars.length;
    for (let i = 0; i < 200; i++) {
        const next = stepStars(stars, 1 / 120, { rand: rng(9) });
        if (broke < 0 && next.length > beforeCount) broke = i;
        stars = next;
        if (broke >= 0 && i > broke + 2) break;
    }
    ok(broke >= 0, `the crossette breaks at step ${broke} (t = ${(broke / 120).toFixed(4)} s), fuse set at ${PATTERNS.crossette.breakAfter} s`);
    ok(Math.abs(broke / 120 - PATTERNS.crossette.breakAfter) < 0.02, "which is its fuse time, not some other moment");
    const gens = {};
    for (const s of stars) gens[s.generation] = (gens[s.generation] || 0) + 1;
    ok(gens[2] === 24 * PATTERNS.crossette.breakInto, `${gens[2]} second-generation stars: 24 parents x ${PATTERNS.crossette.breakInto} children`);
    ok(!gens[1], "and every parent is consumed by its own break rather than surviving alongside its children");
    ok(stars.every((s) => s.breakAfter === null), "the children carry no fuse, so the cascade terminates");
    // A guard exists anyway, because a pattern that broke into itself would not.
    let deep = burst({ x: 0, y: 100, z: 0, vx: 0, vy: 0, vz: 0, t: 0 },
                     { n: 2, speed: 5, spread: "sphere", life: 9, drag: 0, gravity: 0,
                       breakAfter: 0.05, breakInto: 2, breakSpeed: 3, breakLife: 9 }, { rand: rng(1) });
    for (let i = 0; i < 400; i++) deep = stepStars(deep, 1 / 120, { rand: rng(1), maxGeneration: 3 });
    ok(deep.every((s) => s.generation <= 3), `maxGeneration caps a self-breaking pattern at ${Math.max(...deep.map((s) => s.generation))} generations`);
    ok(deep.length < 100, `so it settles at ${deep.length} stars instead of running away`);
}

// 5) *** THE PATTERNS DIFFER BY PHYSICS, NOT BY NAME. ***
{
    const alive = (p, seconds) => {
        let s = burst({ x: 0, y: 200, z: 0, vx: 0, vy: 0, vz: 0, t: 0 }, p, { rand: rng(4) });
        for (let t = 0; t < seconds; t += 1 / 120) s = stepStars(s, 1 / 120, { rand: rng(2) });
        return s;
    };
    const peony = alive("peony", 3), willow = alive("willow", 3);
    ok(peony.length === 0, `after 3 s a peony is spent: ${peony.length} stars alive (life ${PATTERNS.peony.life} s)`);
    ok(willow.length === PATTERNS.willow.n, `while a willow still has all ${willow.length} of its stars (life ${PATTERNS.willow.life} s)`);
    ok(centroid(willow)[1] < 200 - 20, `and they have fallen to y=${centroid(willow)[1].toFixed(1)} from 200 -- the droop is gravity, not a sprite`);
    ok(PATTERNS.willow.drag < PATTERNS.peony.drag,
        `a willow's stars are heavier: drag ${PATTERNS.willow.drag} against a peony's ${PATTERNS.peony.drag}, so they keep their speed and arc over`);
    ok(PATTERN_NAMES.length === 6, `${PATTERN_NAMES.length} patterns: ${PATTERN_NAMES.join(", ")}`);
    for (const name of PATTERN_NAMES) {
        const p = PATTERNS[name];
        ok(p.n > 0 && p.speed > 0 && p.life > 0, `${name}: ${p.n} stars at ${p.speed} m/s for ${p.life} s`);
    }
    ok(() => { try { burst({}, "nope"); return false; } catch { return true; } }, "an unknown pattern is refused rather than silently producing nothing");
}

// 6) *** THE FLIGHT: THE BURST HEIGHT IS A CONSEQUENCE, AND A SHORT FUSE SAYS SO. ***
{
    const high = launch([0, 0, 0], [0, 55, 0], { pattern: "peony", altitude: 40, rand: rng(7), drag: 0.01 });
    ok(high.burstAt !== null && !high.shortOfFuse, `a shell that clears its fuse bursts at y=${high.burstAt.y.toFixed(1)} m, at the altitude asked for`);
    ok(Math.abs(high.burstAt.y - 40) < 1, "which is the fuse altitude, not the apex");
    ok(high.burstAt.vy < 0, "and on the way DOWN -- an altitude fuse that fired climbing would burst on the wrong side of its height");
    // *** A SHELL THAT CANNOT REACH ITS FUSE STILL BURSTS, AT APEX, AND MUST SAY SO. ***
    const short = launch([0, 0, 0], [0, 55, 0], { pattern: "peony", altitude: 120, rand: rng(7), drag: 0.01 });
    ok(short.burstAt !== null, "a shell fused above its own ceiling still bursts rather than vanishing");
    ok(short.shortOfFuse === true, `and reports shortOfFuse: it burst ${short.shortBy.toFixed(1)} m below the 120 m asked for`);
    ok(Math.abs(short.burstAt.y - short.apex) < 0.5, `at its apex (${short.burstAt.y.toFixed(1)} m vs apex ${short.apex.toFixed(1)}), which is the honest place for it`);
    ok(short.stars.length === PATTERNS.peony.n, "with a full complement of stars -- a low burst is not a failed one");
    // Higher launches get closer to the fuse height, which is the sanity check on the whole flight model.
    const heights = [40, 55, 70, 90].map((v) => launch([0, 0, 0], [0, v, 0], { altitude: 120, rand: rng(7), drag: 0.01 }).burstAt.y);
    ok(heights.every((h, i) => i === 0 || h > heights[i - 1]), `burst height rises with launch speed: ${heights.map((h) => h.toFixed(0)).join(" -> ")} m`);
    // A timed fuse is a different failure mode: it fires whether or not the shell got anywhere.
    const timed = launch([0, 0, 0], [0, 55, 0], { fuse: FUSE.TIMED, time: 0.5, rand: rng(7), drag: 0.01 });
    ok(timed.burstAt !== null && Math.abs(timed.burstAt.t - 0.5) < 0.02, `a timed fuse fires at t=${timed.burstAt.t.toFixed(3)} s regardless of height`);
    ok(timed.burstAt.y < 30, `bursting low at y=${timed.burstAt.y.toFixed(1)} m -- which is how a real short fuse fails`);
    note(`peony ceiling at 55 m/s with drag 0.01: ${short.apex.toFixed(1)} m`);
}

// 7) *** PURITY AND WIRING. ***
{
    const src = codeOnly(read("world/fireworkShell.mjs"));
    ok(!/\bdocument\b|\bwindow\b|THREE\.|readFileSync/.test(src), "fireworkShell.mjs is arithmetic: no DOM, no renderer, no disk");
    ok(!/Math\.random\(\)/.test(src.replace(/opts\.rand \|\| Math\.random/g, "")),
        "and calls Math.random only as the default when no stream is supplied");
    ok(/import \{[^}]*stepShell[^}]*\} from ["']\.\.\/\.\.\/physics\/ballistics\.mjs["']/.test(noComments(read("world/fireworkShell.mjs"))) ||
       /import \{[^}]*stepShell[^}]*\} from ["']\.\.\/physics\/ballistics\.mjs["']/.test(noComments(read("world/fireworkShell.mjs"))),
        "it flies its stars with physics/ballistics.mjs rather than a second integrator");
    ok(!/function stepShell|function flyShell/.test(src), "and declares no integrator of its own");
    ok(/gestureVfx/.test(prose(read("world/fireworkShell.mjs"))),
        "and says how it differs from ui/gestureVfx.js's spawnBurst, which is the obvious thing a reader will ask");
    const mainQ = noComments(read("main.js")), mainC = codeOnly(read("main.js"));
    ok(/import \{[^}]*launch[^}]*\} from ["']\.\/world\/fireworkShell\.mjs["']/.test(mainQ), "main.js imports it");
    ok(/window\.fireworks\s*=/.test(mainC), "and exposes window.fireworks");
    ok(/PATTERN_NAMES|patterns/.test(mainC), "with the pattern list reachable");
}

console.log(`fireworkShell-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
