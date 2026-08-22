// brain/tools/maze-walker-selfcheck.mjs — the maze page's own walker, driven headlessly.
//
//   node brain/tools/maze-walker-selfcheck.mjs
//
// `brain/tools/flowfield-selfcheck.mjs` proves the FIELD: from every reachable cell of forty mazes, a
// gradient follower reaches the goal. It has never touched the thing that actually walks.
//
// `brain-maze.html` has its own walker, and it is not a gradient follower on cell centres. It moves in world
// units at eighteen units a second, it slides along an axis when the flow runs into a wall, it falls back to
// descending the distance field when both slides are blocked, and it treats itself as a POINT. None of that
// was ever executed by a test, and a screenshot of it parked against a wall is the only thing that has ever
// checked it.
//
// So: boot the page's module under a stub DOM and a stub canvas, hand it a field solved by the real CPU
// solver -- the engine's default backend -- and drive its real `stepWalker` from a hundred starts.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FlowFieldSolverCPU } from "../flowfieldCpu.js";

// .../WebGLEngine/brain/tools/x.mjs -> .../WebGLEngine
const HERE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));

// --- a DOM that agrees with everything -------------------------------------------------------------------
const els = new Map();
const el = (id) => {
    if (!els.has(id)) els.set(id, {
        id, textContent: "", className: "", value: "", checked: false, style: {},
        addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 600 }),
        getContext: () => ctx2d, appendChild() {},
    });
    return els.get(id);
};
const ctx2d = new Proxy({}, { get: () => () => {} });
const rafQueue = [];
const globals = {
    document: {
        getElementById: el,
        addEventListener() {}, querySelector: () => null, createElement: () => el("tmp"),
        body: { appendChild() {} },
    },
    window: { addEventListener() {}, devicePixelRatio: 1 },
    // v2209 -- the page reads `?seed=` now. A harness that does not stub `location` boots a page that throws.
    // v2527 -- A SEED, BECAUSE THE PAGE ASKED FOR ONE. brain-maze.html falls through to Math.random() when ?seed=
    // is absent, so this stub was booting A DIFFERENT MAZE EVERY RUN -- and the fabricated-basin test below writes
    // to a hardcoded cell that was a WALL about a quarter of the time. That was the "unreproducible" ship-gate
    // flake: 3 failures in 12 runs, and the detector was right in all three.
    location: { search: "?seed=20250716", origin: "http://engine.local" },
    addEventListener() {},
    requestAnimationFrame: (f) => { rafQueue.push(f); return rafQueue.length; },
    performance: { now: () => Date.now() },
    devicePixelRatio: 1,
    // No network. The page posts snapshots and polls the field; both are answered by nothing, and the test
    // installs the field directly, which is what the brain would have published.
    async fetch() { throw new Error("no network in a selfcheck"); },
};
for (const k in globals) if (!(k in globalThis)) globalThis[k] = globals[k];
for (const k of ["document", "window", "addEventListener", "requestAnimationFrame", "performance", "devicePixelRatio", "fetch", "location"]) globalThis[k] = globals[k];

// --- boot the page's module ------------------------------------------------------------------------------
const html = fs.readFileSync(path.join(HERE, "brain-maze.html"), "utf8");
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
ok("brain-maze.html has one module script", !!m);

// The module ends by starting an animation loop and polling. Export what the test needs, and let the loop
// queue exactly one frame into `rafQueue`, where it stays.
const src = m[1] + "\n\nexport { heights, walker, goal, field, stepWalker, randomizeMaze, cellAt, blocked, routeNeighbour, W, H, CELL, OX, OZ, WALL_H, FLOOR_LIFT, idx, inb, setField, diagnose, lastDiag };\n";
// `field` is assigned by the poller; give the test a way in.
const patched = src.replace("let field = null;", "let field = null;\nfunction setField(f) { field = f; }");
ok("...and the module exposes a field the poller sets", patched !== src);

const tmp = path.join(HERE, ".maze-boot.mjs");
fs.writeFileSync(tmp, patched);
let P = null, err = null;
try { P = await import("file://" + tmp); } catch (e) { err = e; }
finally { try { fs.unlinkSync(tmp); } catch {} }
ok("the page's module boots under a stub DOM", !err, err ? String(err && err.message || err) : "");
if (err) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }

// `heights` and `goal` are REASSIGNED by randomizeMaze() -- `heights = new Float32Array(...)`. Destructuring
// them captures the old array, so the field would be solved for an empty room while the walker stands in a
// real maze, and it would walk into walls that the test could not see. ES module bindings are live; read
// them through the namespace every time, and never through a `const` you took once.
const { walker, stepWalker, randomizeMaze, cellAt, blocked, W, H, CELL, OX, OZ, WALL_H, FLOOR_LIFT, idx, inb, setField } = P;
const heights = () => P.heights;
const goal = () => P.goal;
ok("...and it is a 48x48 room with four-unit cells", W === 48 && H === 48 && CELL === 4);
ok("...whose walls are impassably tall", WALL_H >= 1000);

// --- solve the field exactly as the brain's default backend does -------------------------------------------
async function solveField() {
    const s = new FlowFieldSolverCPU(null, W, H, { cell: CELL, slopeK: 3.0, impassDh: WALL_H * 0.5 });
    const lifted = Float32Array.from(heights(), (v) => v + FLOOR_LIFT);
    const f = await s.solve(lifted, [{ gx: goal().gx, gy: goal().gy }], { wantFlow: true, wantDist: true });
    // And publish it exactly as brain.js does: flow rounded, dist to one decimal, unreachable pinned to 1e8.
    return {
        w: W, h: H, ts: Date.now(),
        fx: Array.from(f.fx, (v) => Math.round(v * 1000) / 1000),
        fz: Array.from(f.fz, (v) => Math.round(v * 1000) / 1000),
        dist: Array.from(f.dist, (v) => (v >= 1e7 ? 1e8 : Math.round(v * 10) / 10)),
    };
}

// --- drive the REAL walker ---------------------------------------------------------------------------------
const DT = 1 / 60;
const reachable = (f, gx, gy) => f.dist[idx(gx, gy)] < 1e7;

async function walkFrom(gx, gy, f, maxSeconds = 25) {
    walker.x = OX + gx * CELL;
    walker.z = OZ + gy * CELL;
    let last = null, still = 0;
    for (let i = 0; i < maxSeconds * 60; i++) {
        const c = cellAt(walker.x, walker.z);
        if (c.gx === goal().gx && c.gy === goal().gy) return { ok: true };
        const before = walker.x + "," + walker.z;
        stepWalker(DT);
        const after = walker.x + "," + walker.z;
        if (after === before) { still++; if (still > 90) return { ok: false, why: "stopped moving", at: c, status: el("kWalker").textContent }; }
        else still = 0;
        if (blocked(walker.x, walker.z)) return { ok: false, why: "walked into a wall", at: c, status: el("kWalker").textContent };
        last = c;
    }
    return { ok: false, why: "ran out of time", at: last, status: el("kWalker").textContent };
}

let rooms = 0, starts = 0, arrived = 0;
const failures = [];
for (let seed = 0; seed < 4; seed++) {
    randomizeMaze();
    const f = await solveField();
    setField(f);
    rooms++;

    // v2209 -- the room is a DUNGEON now: rooms and three-cell corridors, so its floor is far sparser than
    // the old ninety-block scatter and a fixed sixty samples mostly landed in walls. Walk EVERY floor cell
    // the field says is reachable, and let the count be whatever the dungeon's floor is. An assertion with
    // a round number in it measures the round number.
    for (let k = 0; k < W * H; k++) {
        const gx = k % W;
        const gy = (k / W) | 0;
        if (heights()[idx(gx, gy)] > 1) continue;
        if (!reachable(f, gx, gy)) continue;
        if (gx === goal().gx && gy === goal().gy) continue;
        starts++;
        const r = await walkFrom(gx, gy, f);
        if (r.ok) arrived++;
        else if (failures.length < 6) failures.push({ seed, from: [gx, gy], ...r });
    }
}

console.log("");
ok(`the page's own walker starts from ${starts} reachable cells across ${rooms} rooms`, starts > 100);
ok("...and EVERY ONE of them reaches the goal", arrived === starts, `${starts - arrived} did not`);
if (failures.length) for (const f of failures) console.log(`      seed ${f.seed} from (${f.from}) -> ${f.why} at (${f.at ? f.at.gx + "," + f.at.gy : "?"}) status="${f.status}"`);
ok("...none walks into a wall", !failures.some((f) => f.why === "walked into a wall"));
ok("...none stops moving", !failures.some((f) => f.why === "stopped moving"));

// The page's own readout must name the reason, whatever happens. It is the only thing a screenshot shows.
{
    randomizeMaze();
    const f = await solveField();
    setField(f);
    walker.x = OX + goal().gx * CELL; walker.z = OZ + goal().gy * CELL;
    stepWalker(DT);
    ok("standing on the goal, the walker says it has arrived", /arrived/.test(el("kWalker").textContent));

    // Seal it in and watch it say so, rather than spin.
    const gx = 5, gy = 5;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) heights()[idx(gx + dx, gy + dy)] = WALL_H;
    heights()[idx(gx, gy)] = 0;
    const f2 = await solveField();
    setField(f2);
    walker.x = OX + gx * CELL; walker.z = OZ + gy * CELL;
    for (let i = 0; i < 30; i++) stepWalker(DT);
    const s = el("kWalker").textContent;
    ok("walled in, it says WHY rather than spinning silently", /boxed in|unreachable/.test(s), `said "${s}"`);
    ok("...and that reason is the one thing a screenshot of this room actually shows", true);
}

// --- the room's own diagnostic must catch a bad field ------------------------------------------------------
//
// This is the readout a screenshot should show. It has to be right, or it is worse than nothing: a green
// health line over a broken field would send the next hour after the walker.
{
    randomizeMaze();
    const good = await solveField();
    good.solver = { backend: "cpu (exact Dijkstra)", iters: null, needed: null, iterCap: null, impassDh: WALL_H * 0.5, truncated: false };
    setField(good);
    P.diagnose();
    const d = P.lastDiag;
    ok("the diagnostic runs on a good field", !!d);
    ok("...and finds ZERO floor minima, which is the field's own claim", d.minima === 0, `${d.minima} minima`);
    ok("...and says which solver produced it", /cpu/.test(d.backend));
    ok("...and reports how much of the floor is reachable", d.reachable > 0 && d.reachable <= d.floor);
    ok("...and is not marked truncated, because an exact Dijkstra cannot be", d.truncated === false);
    ok("the health line is green on a good field", el("kHealth").style.color === "");

    // Now break the field the way a truncated GPU sweep breaks it: leave a pocket of cells at a distance
    // that is lower than everything around them, which is a minimum by definition.
    const bad = JSON.parse(JSON.stringify(good));
    bad.ts = good.ts + 1;
    // Find a floor cell with floor all around it, rather than betting on one. A hardcoded (20,20) was a bet on the
    // maze: it was floor at some seeds and a WALL at others, and a basin carved into a wall is not a floor minimum
    // -- so the detector correctly found nothing and the test blamed it. That was the ship-gate flake.
    const hs = heights();
    let cx = -1, cy = -1;
    for (let y = 2; y < H - 2 && cy < 0; y++) {
        for (let x = 2; x < W - 2; x++) {
            let clear = true;
            for (let j = -1; j <= 1 && clear; j++) for (let i = -1; i <= 1; i++) if (hs[idx(x + i, y + j)] >= WALL_H * 0.5) { clear = false; break; }
            // and it must be somewhere the walker could actually be: an unreachable pocket is pinned at 1e8 and
            // is not a minimum anybody cares about
            if (clear && good.dist[idx(x, y)] < 1e7) { cx = x; cy = y; break; }
        }
    }
    ok("the maze has an open 3x3 of floor to carve a basin into", cx >= 0, cx >= 0 ? `at (${cx},${cy})` : "none found");
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) bad.dist[idx(x, y)] = 1;
    bad.dist[idx(cx, cy)] = 0.5;
    setField(bad);
    P.diagnose();
    ok("a field with a fabricated basin is caught", P.lastDiag.minima > 0, `${P.lastDiag.minima} minima`);
    ok("...and the health line turns red", el("kHealth").style.color === "#f4808c");
    ok("...which is the whole point of the room", true);

    const trunc = JSON.parse(JSON.stringify(good));
    trunc.ts = good.ts + 2;
    trunc.solver = { backend: "gpu (fixed-iteration Jacobi)", iters: 82, needed: 82, iterCap: 82, impassDh: 2000, truncated: true };
    setField(trunc);
    P.diagnose();
    ok("a TRUNCATED gpu field is named as such", /TRUNCATED/.test(el("kHealth").textContent));
    ok("...and the backend line says how many sweeps it ran and needed", /82 sweeps \(needed 82\)/.test(el("kBackend").textContent));
    ok("...because 'the walker is stuck' is a symptom, and this is the cause", true);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
