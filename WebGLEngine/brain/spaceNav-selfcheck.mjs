// WebGLEngine/brain/spaceNav-selfcheck.mjs -- the gate of brain/spaceNav.mjs (the navigation layer for the rock field; brain/ROCK_NAV_WIP.md)
//
// SABOTAGED 2026-11-25, each on a backup copy, restored after (red rows by name):
//   N1 32-bit distances: 11 red (1, then every row on a field: not built, and a 32-bit search may never finish). FIRST PASS: 0 red and NO VERDICT --
//      the gate hung building its fixture. Fixed twice: row 1 reads a 2-cell field first and later fields are built only if it passed, and
//      buildField throws once it pops more than 27 per cell (a correct search cannot).
//   N2 margin ignored: 3 red (2, 6, 6b).  N3 6-neighbour moves: 1 red (4).  N4 goal radius / 4: 6 red (3, 6, 6b, 7, 9, 11).
//   N5 line sampled every 3 cells: 1 red (6b).  N6 the aim is the first descent cell: 2 red (6, 7).  N7 the near amendment undone: 2 red (6b, 11).
//   N8 the hand-back steers too: 2 red (8, 10).  N9 the range measured to the field origin: 2 red (9, 11).  N10 the cache never expires: 1 red (11).
//   N11 the aim flown with the target's velocity: 1 red (9). FIRST PASS: 0 red -- AP.decide reads the target's velocity only with a weapon speed,
//      and row 9 flew without one; it now flies with weaponSpeed 60 and a moving target, and says the fixture tells the velocities apart.
//   N12 the heap pops out of order: 10 red. FIRST PASS: 0 red and NO VERDICT (hung), fixed by the pop bound above.
"use strict";

import fs from "node:fs";
import * as NV from "./spaceNav.mjs";
import * as SA from "./spaceArena.mjs";
import * as AP from "./autopilot6dof.mjs";
import * as BF from "./battleshipFight.mjs";
import * as SR from "./spaceRocks.mjs";

const rows = [];
const row = (name, fn) => { let ok = false, detail = ""; try { const r = fn(); ok = r === true || (r && r.ok === true); detail = r && r.detail ? r.detail : ""; } catch (e) { ok = false; detail = "threw: " + e.message; } rows.push({ name, ok, detail }); };
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// a small world: cells of 16, half-width 160 (20 a side), one rock between a fighter and the goal
const SMALL = { cell: 16, half: 160, margin: 20 };
const ROCK = { pos: [100, 0, 0], radius: 12 };
// Row 1 is read on a 2-cell field FIRST: a 32-bit store makes the search run without end on any real grid, which would hang this gate before it
// printed a verdict (the first mutation pass's N1 did exactly that). Every later field is built only if row 1 passed; otherwise those rows fail by name.
let is64 = false;
row("1 THE DISTANCES ARE 64-BIT (32-bit made the stale-entry skip fail and the search run without end)", () => (is64 = NV.buildField([], [0, 0, 0], 8, { cell: 16, half: 16 }).dist instanceof Float64Array));
const build = (...a) => { if (!is64) throw new Error("not built: row 1 failed, and a 32-bit field may never finish"); return NV.buildField(...a); };
let F = null; try { F = build([ROCK], [0, 0, 0], 40, SMALL); } catch { /* the rows that read F fail by name */ }
const reach = ROCK.radius + SA.FIGHTER.radius + SMALL.margin + 0.87 * SMALL.cell;
row("2 THE ROCK BLOCKS ITS REACH, AND NO FURTHER (rock radius + fighter radius + margin + 0.87 cell)", () => {
    let wrongIn = 0, wrongOut = 0;
    for (let i = 0; i < F.n; i++) for (let j = 0; j < F.n; j++) for (let k = 0; k < F.n; k++) {
        const c = NV.centreOf(F, i, j, k), b = F.blocked[(i * F.n + j) * F.n + k], d = dist3(c, ROCK.pos);
        if (d <= reach && !b) wrongIn++; if (d > reach && b) wrongOut++;
    }
    return { ok: wrongIn === 0 && wrongOut === 0, detail: `${wrongIn} cells inside the reach free, ${wrongOut} outside it blocked` };
});
row("3 THE GOAL IS EVERY FREE CELL WITHIN goalR OF THE ORIGIN, AT DISTANCE 0", () => {
    let bad = 0, zeros = 0;
    for (let v = 0; v < F.dist.length; v++) {
        const i = Math.floor(v / (F.n * F.n)), j = Math.floor(v / F.n) % F.n, k = v % F.n, inGoal = !F.blocked[v] && dist3(NV.centreOf(F, i, j, k), [0, 0, 0]) <= 40;
        if (inGoal) zeros++; if (inGoal !== (F.dist[v] === 0)) bad++;
    }
    return { ok: bad === 0 && zeros > 0, detail: `${zeros} goal cells, ${bad} wrong` };
});
row("4 THE DISTANCES ARE THE 26-NEIGHBOUR SHORTEST PATHS (against a plain O(n^2) Dijkstra here)", () => {
    const n = F.n, n3 = n * n * n, ref = new Float64Array(n3).fill(Infinity), done = new Uint8Array(n3);
    for (let v = 0; v < n3; v++) if (F.dist[v] === 0) ref[v] = 0;   // the goal set is row 3's
    for (;;) {
        let v = -1, best = Infinity; for (let u = 0; u < n3; u++) if (!done[u] && ref[u] < best) { best = ref[u]; v = u; }
        if (v < 0) break; done[v] = 1;
        const i = Math.floor(v / (n * n)), j = Math.floor(v / n) % n, k = v % n;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
            if (!a && !b && !c) continue; const ii = i + a, jj = j + b, kk = k + c; if (ii < 0 || jj < 0 || kk < 0 || ii >= n || jj >= n || kk >= n) continue;
            const u = (ii * n + jj) * n + kk; if (F.blocked[u]) continue; const nd = best + Math.hypot(a, b, c); if (nd < ref[u]) ref[u] = nd;
        }
    }
    let worst = 0; for (let v = 0; v < n3; v++) { const e = ref[v] === F.dist[v] ? 0 : Math.abs(ref[v] - F.dist[v]); if (!(e <= 1e-9)) worst = Math.max(worst, Number.isFinite(e) ? e : 1e9); }
    return { ok: worst <= 1e-9, detail: `worst difference ${worst}` };
});
row("5 A SEGMENT THROUGH A ROCK IS NOT CLEAR; ONE WIDE OF IT IS", () => {
    const tiny = build([{ pos: [64, 8, 8], radius: 1 }], [0, 0, 0], 20, { cell: 16, half: 160, margin: 0 });
    return NV.lineClear(tiny, [-120, 8, 8], [150, 8, 8]) === false && NV.lineClear(F, [0, 120, 0], [150, 120, 0]) === true;
});
row("6 BESIDE THE ROCK, WITH THE WAY HOME HIDDEN, THE AIM IS IN CLEAR SIGHT, FREE, AND BEYOND THE FIRST STEP", () => {
    const p = [150, 60, 0], info = {}, a = NV.aimOf(F, p, info), here = F.dist[NV.indexOf(F, p)];
    return { ok: !!a && !info.near && !F.blocked[NV.indexOf(F, a)] && NV.lineClear(F, p, a) && !NV.lineClear(F, p, [0, 0, 0]) && F.dist[NV.indexOf(F, a)] < here - 1.75, detail: `aim ${a && a.map((x) => x.toFixed(0)).join(",")}` };
});
row("6b DIRECTLY BEHIND IT, WHERE EVERY LINE CLIPS THE BLOCKED CORNER, THE AIM IS THE ADJACENT DESCENT CELL, MARKED NEAR -- NEVER NULL (the 2026-11-25 amendment)", () => {
    const p = [150, 0, 0], info = {}, a = NV.aimOf(F, p, info), c = NV.indexOf(F, p);
    const adjacent = !!a && Math.max(...[0, 1, 2].map((ax) => Math.abs(NV.cellOf(F, a[ax], ax) - NV.cellOf(F, p[ax], ax)))) === 1;
    return { ok: !!a && info.near === true && adjacent && !F.blocked[NV.indexOf(F, a)] && F.dist[NV.indexOf(F, a)] < F.dist[c], detail: `aim ${a && a.map((x) => x.toFixed(0)).join(",")}, near ${info.near}` };
});
row("7 IN OPEN SPACE THE AIM IS THE FARTHEST CELL IN SIGHT: A GOAL CELL", () => {
    const open = build([], [0, 0, 0], 40, SMALL), a = NV.aimOf(open, [150, 150, 150]);
    return { ok: !!a && open.dist[NV.indexOf(open, a)] === 0, detail: `aim ${a && a.map((x) => x.toFixed(0)).join(",")}` };
});

// the pilot, on a fake arena holding a real fighter body
const real = BF.build(41, "bow", { rocks: 0 }).arena.crafts.find((c) => c.kind === "fighter").body;
const at = (pos) => ({ ...real, pos, vel: [0, 0, 0] });
const fakeArena = (shipPos, fighterBody) => ({ i: 0, crafts: [{ id: 1, kind: "capital", body: { pos: shipPos } }, { id: 7, kind: "fighter", body: fighterBody }] });
const target = { pos: [0, 30, 0], vel: [1, 0, 0] }, opts = {};
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
row("8 THE HAND-BACK: INSIDE THE STRAFE RANGE THE PILOT IS AP.decide(body, target, opts), EXACTLY", () => {
    const body = at([150, 0, 0]), A = fakeArena([0, 0, 0], body), pilot = NV.navPilot(() => A, F);
    return same(pilot(body, target, opts), AP.decide(body, target, opts));
});
row("9 OUTSIDE IT THE PILOT FLIES AP.decide TOWARD THE AIM, AT REST (with a weapon speed and a moving target, so the aim's velocity is read)", () => {
    const body = at([150, 60, 0]), A = fakeArena([-300, 0, 0], body), pilot = NV.navPilot(() => A, F), aim = NV.aimOf(F, body.pos);
    const moving = { pos: [0, 30, 0], vel: [0, 0, 40] }, lead = { weaponSpeed: 60 };
    const at0 = AP.decide(body, { pos: aim, vel: [0, 0, 0] }, lead), atV = AP.decide(body, { pos: aim, vel: moving.vel }, lead);
    return { ok: !!aim && !same(at0, atV) && same(pilot(body, moving, lead), at0) && !same(pilot(body, moving, lead), AP.decide(body, moving, lead)), detail: `the fixture tells the velocities apart: ${!same(at0, atV)}` };
});
row("10 THE STRAFE RANGE IS MEASURED TO THE SHIP'S CURRENT CENTRE, NOT THE FIELD'S ORIGIN", () => {
    const body = at([150, 0, 0]), A = fakeArena([150, 100, 0], body), pilot = NV.navPilot(() => A, F);
    return same(pilot(body, target, opts), AP.decide(body, target, opts));
});
row("11 THE AIM IS CACHED FOR `every` TICKS, THEN RECOMPUTED", () => {
    const G = build([ROCK], [0, 0, 0], 40, SMALL), body = at([150, 0, 0]), A = fakeArena([-300, 0, 0], body), probe = { calls: 0, aimed: 0, fallback: 0, handBack: 0, last: null };
    const pilot = NV.navPilot(() => A, G, { every: 15, probe });
    pilot(body, target, opts); const first = probe.last.aim;
    G.dist.fill(Infinity);   // a field with no way home: a recomputed aim is null
    A.i = 14; pilot(body, target, opts); const cached = probe.last.aim;
    A.i = 15; pilot(body, target, opts); const fresh = probe.last.aim;
    return { ok: !!first && same(cached, first) && fresh === null && probe.fallback === 1, detail: `cached ${!!cached}, fresh ${fresh}` };
});
row("12 ON A REAL FIELD EVERY ROCK'S CENTRE CELL IS BLOCKED AND THE SHIP'S IS A GOAL CELL", () => {
    const rocks = SR.rockField(41, "beam"), R = build(rocks, [0, 0, 0], SA.STRAFE_RANGE);
    return rocks.length === SR.ROCK_DEFAULTS.count && rocks.every((q) => R.blocked[NV.indexOf(R, q.pos)] === 1) && R.dist[NV.indexOf(R, [0, 0, 0])] === 0;
});
row("13 PURE: NO Math.random, NO CLOCK, NO I/O IN THE MODULE", () => {
    const src = fs.readFileSync(new URL("./spaceNav.mjs", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
    return !/Math\.random|Date\.now|performance\.now|new Date|from "node:/.test(src);
});

for (const r of rows) console.log(`  ${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " -- " + r.detail : ""}`);
const red = rows.filter((r) => !r.ok).length;
console.log(`[spaceNav-selfcheck] ${red ? red + " of " + rows.length + " checks FAIL" : "all " + rows.length + " checks pass"}`);
process.exit(red ? 1 : 0);
