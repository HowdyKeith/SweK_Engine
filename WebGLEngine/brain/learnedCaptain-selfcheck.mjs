// WebGLEngine/brain/learnedCaptain-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). Run: node brain/learnedCaptain-selfcheck.mjs
//
// THE GATE OF brain/learnedCaptain.mjs (round 8 of the submarine stations, brain/SUB_STATIONS_WIP.md section 21) and of stationsTask.fly's `make`.
//   1  the features a captain senses, and the constants as registered; 2 the captain's two choices on hand-made ticks; 3 ALL-ZERO WEIGHTS ARE ROUND 2's DAMAGE CREW, BIT FOR BIT (neither choice fires)
//   4 the ES and the choice, on a stub fitness (seeded, mu best kept, sigma halving, the best on SELECTION chosen); 5 the frozen file, once training has written it
// Flies no HELD seed.
// SABOTAGED -- 17 mutants, each alone in place and restored; 16 red by name and 1 EQUIVALENT (final pass): brain/learnedCaptain.mjs L01 depth over 50 | L02 the depth error unsigned | L03 breached never read | L04 the air as litres |
//   L05 a unit that fires at zero | L06 DROP read from the SURFACE weights | L07 a drop after the weight has gone | L09 breached never latched | L10 sigma never halving | L11 the worst kept | L12 the choice by training fitness |
//   L13 every child from one parent | L14 the fitness ignoring time | L15 HELD from 195002 | L16 no theta check; brain/stationsTask.mjs T01 `make` ignored.
// FIVE WENT 0 RED ON THE FIRST PASS. FOUR GOT ROWS: L02 (every fixture had the boat below its mission), L09 (no row had damage act and then a calm tick), L13 and L14 (the stub ES and the fitness were only checked for direction;
//   the ES is now pinned by three generations' fingerprint, and the fitness by a lost dive's seconds), T01 (the bit-for-bit row used the one theta under which the learned crew IS the DAMAGE crew; a surface-always theta must differ).
//   ONE IS EQUIVALENT: L08, the SURFACE claim at the mission's priority instead of energy's -- the captain's only other station is damage control, a COMMAND station, so no claim ever competes with it.
//   AND A ROW OF MINE WAS WRONG: it said a surface-always captain reaches the surface on DEV 160004; on that leak it does not (crushed at 145 s, DAMAGE at 183 s). The row now says what it means: the record differs.
"use strict";
import fs from "node:fs";
import * as L from "./learnedCaptain.mjs";
import * as T from "./stationsTask.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as NT from "./needsTask.mjs";

let fails = 0, finished = false;
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const guarded = (name, f) => { try { f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.stack) || e).split("\n").slice(0, 2).join(" | ").slice(0, 300)); } };
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify;
console.log("learnedCaptain-selfcheck -- round 8: a learned captain on a breached boat with a low battery\n");
const MODEL = NT.model();

sec("1. the features and the constants");
guarded("section 1", () => {
    const st = S.createState({ depth: 30, speed: 2, model: MODEL }); st.vel[2] = -0.4; st.tank = { ...(st.tank || {}), air: 3, airMax: 6, released: true };
    const x = L.featuresOf({ frac: 0.25, depth: 30 }, st, { depth: 20 }, true);
    ok("the eight features: charge 0.25, depth/60 0.5, vz -0.4, (depth - mission)/10 1, breached 1, air 3/6, dropped 1, and a constant 1", J(x) === J([0.25, 0.5, -0.4, 1, 1, 0.5, 1, 1]), J(x));
    const st2 = S.createState({ depth: 30, speed: 2, model: MODEL }); st2.tank = undefined; const x2 = L.featuresOf({ frac: 1, depth: 0 }, st2, { depth: 0 }, false);
    const up = L.featuresOf({ frac: 0.5, depth: 10 }, S.createState({ depth: 10, speed: 2, model: MODEL }), { depth: 25 }, false);
    ok("the depth error is SIGNED: a boat 15 m above its mission reads -1.5", up[3] === -1.5, String(up[3]));
    ok("with no tank, the air reads full and nothing dropped; not breached reads 0", x2[4] === 0 && x2[5] === 1 && x2[6] === 0);
    ok("the registered constants: 8 features, 16 weights; ES mu 4, lambda 12, sigma 0.5 halving every 10, 40 generations, seed 8008; TRAIN 193001-193032, SELECTION 193501-193524, HELD 195001-195096",
        L.NF === 8 && L.NW === 16 && J(L.ES) === '{"mu":4,"lambda":12,"sigma0":0.5,"halveEvery":10,"generations":40,"seed":8008}' && L.TRAIN_SET.length === 32 && L.TRAIN_SET[0] === 193001 && L.SELECTION_SET.length === 24 && L.SELECTION_SET[0] === 193501 &&
        L.HELD_SET.length === 96 && L.HELD_SET[0] === 195001 && L.HELD_SET[95] === 195096 && L.FEATURES.length === 8 && Object.isFrozen(L.ES));
});

sec("2. the two choices on hand-made ticks");
guarded("section 2", () => {
    const read = () => ({ cls: "battery", frac: 0.9, depth: 20, refills: true, refillDepth: 0.7, flood: 0, damage: 0 }), st = S.createState({ depth: 20, speed: 2, model: MODEL }), mission = { depth: 20, heading: 0, speed: 2 };
    const th = (surf, drop) => { const t = new Array(16).fill(0); t[7] = surf; t[15] = drop; return t; };   // the constant feature's weight decides
    const a = L.learnedCaptain({ model: MODEL, read, theta: th(1, -1) }), ca = a(st, mission);
    ok("a SURFACE unit that fires claims the surface at the energy priority (the con is 'learned'); a DROP unit that does not, drops nothing", a.log.con === "learned" && a.log.flown.surface === true && ca.release === undefined && J(a.fired) === '{"surface":1,"drop":0}', J([a.log.con, a.fired]));
    const b = L.learnedCaptain({ model: MODEL, read, theta: th(-1, 1) }), cb = b(st, mission);
    ok("a DROP unit that fires carries release = 1 while the weight is aboard; the mission flies", cb.release === 1 && b.log.con === "mission" && J(b.fired) === '{"surface":0,"drop":1}');
    const gone = S.createState({ depth: 20, speed: 2, model: MODEL }); gone.tank = { ...(gone.tank || {}), released: true }; const cg = b(gone, mission);
    ok("...and once the weight has gone it asks for nothing more", cg.release === undefined && b.fired.drop === 1);
    const latch = new Array(16).fill(0); latch[4] = 1; latch[7] = -0.5;   // SURFACE fires only when breached
    const c = L.learnedCaptain({ model: MODEL, read, theta: latch }), sink = S.createState({ depth: 40, speed: 2, model: MODEL }); sink.vel[2] = -0.5;
    c(sink, mission); const before = c.log.con; c(st, mission); c(st, mission);
    ok("BREACHED LATCHES: once damage control has acted, a SURFACE unit that reads only 'breached' fires on every later calm tick", c.log.overrides.length === 0 && c.log.con === "learned" && before === "mission" && c.fired.surface === 2, J([before, c.log.con, c.fired]));
    ok("a theta of the wrong length or with a NaN, or no read(), is refused by name", /theta must be 16 finite numbers/.test(throws(() => L.learnedCaptain({ model: MODEL, read, theta: [1] })) || "") &&
        /theta must be 16/.test(throws(() => L.learnedCaptain({ model: MODEL, read, theta: new Array(16).fill(NaN) })) || "") && /a read\(\) function is needed/.test(throws(() => L.learnedCaptain({ model: MODEL, theta: new Array(16).fill(0) })) || ""));
});

sec("3. all-zero weights are round 2's DAMAGE crew, bit for bit");
guarded("section 3", () => {
    // neither unit fires at zeros (the argument is 0, not positive), so the learned captain is the helm and damage control -- round 2's DAMAGE crew. Compared on a DEV seed of round 2 (not a TRAIN, SELECTION or HELD seed)
    const z = L.flyLearned(160004, new Array(16).fill(0)), d = T.fly(T.scenario(160004), "DAMAGE");
    const strip = (r) => { const { crew, triage, ...rest } = r; return rest; };
    ok("the whole flight's record is DAMAGE's (status, the time of the crush, the depth, the charge, the weight), and the learned flight goes through stationsTask's own loop (make)", J(strip(z)) === J(strip(d)) && z.crew === "LEARNED", J([strip(z), strip(d)]).slice(0, 300));
});

guarded("section 3b", () => {
    const up = new Array(16).fill(0); up[7] = 1;   // SURFACE always
    const a = L.flyLearned(160004, up), d = T.fly(T.scenario(160004), "DAMAGE");
    ok("...and a learned captain that is NOT all zeros flies its own dive (surface always: its record differs from DAMAGE's), so the flight is the captain's and not the named crew's", a.crushedAt !== d.crushedAt || a.status !== d.status || a.minDepth !== d.minDepth, J([[a.status, a.crushedAt, a.minDepth], [d.status, d.crushedAt, d.minDepth]]));
    const f = L.fitness(new Array(16).fill(0), [160004]);
    ok("the fitness counts the seconds a lost dive lived (0.001 a second): DAMAGE's dive on 160004 is crushed at " + d.crushedAt.toFixed(1) + " s", Math.abs(f - 0.001 * d.crushedAt) < 1e-9 && d.survived === false, String(f));
});

sec("4. the ES and the choice, on a stub fitness");
guarded("section 4", () => {
    // fitness = -(distance of theta from a target): the ES must climb toward it; deterministic for the seed
    const target = Array.from({ length: 16 }, (_, i) => (i % 3) - 1), fit = (th) => -th.reduce((a, w, i) => a + (w - target[i]) ** 2, 0);
    const es = { ...L.ES, generations: 20 }, a = L.train({ seeds: [], es, fit }), b = L.train({ seeds: [], es, fit });
    ok("the ES is deterministic for its seed (the same parents twice)", J(a.parents) === J(b.parents));
    ok("it keeps mu parents, best first, and the best climbs (generation 20 better than generation 1)", a.parents.length === 4 && a.parents.every((p, i) => i === 0 || p.fit <= a.parents[i - 1].fit) && a.history[19].best > a.history[0].best, `${a.history[0].best.toFixed(2)} -> ${a.history[19].best.toFixed(2)}`);
    const fp = L.train({ seeds: [], es: { ...L.ES, generations: 3 }, fit }).parents.map((p) => p.fit.toFixed(6)).join(",");
    ok("THE ES AS REGISTERED, pinned: three generations on the stub from seed 8008 give the parents' fitness -11.656824, -12.122026, -15.127267, -16.310898 (each child from parent k mod mu, mu best kept, sigma 0.5)", fp === "-11.656824,-12.122026,-15.127267,-16.310898", fp);
    ok("sigma halves every 10 generations: 0.5, 0.25", a.history[0].sigma === 0.5 && a.history[9].sigma === 0.5 && a.history[10].sigma === 0.25);
    const ch = L.select([{ theta: target, fit: 0 }, { theta: new Array(16).fill(0), fit: 5 }], { seeds: [], fit });
    ok("the choice is the parent best on SELECTION, whatever its training fitness", J(ch.theta) === J(target) && ch.selFit === 0 && ch.trainFit === 0);
});

sec("5. the frozen file");
guarded("section 5", () => {
    const f = new URL("./learnedCaptain.json", import.meta.url);
    if (!fs.existsSync(f)) { console.log("  NOT YET  brain/learnedCaptain.json is written by the training (tools/ship/trainLearnedCaptain.mjs --write) and committed before HELD is flown"); return; }
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    ok("the frozen captain is 16 finite weights, the registered ES and sets, its training and selection fitness and the history of 40 generations", j.theta.length === 16 && j.theta.every(Number.isFinite) && J(j.es) === J(L.ES) && j.train === 32 && j.selection === 24 && j.history.length === 40 && Number.isFinite(j.selFit));
});

finished = true;
console.log(fails ? `\nlearnedCaptain-selfcheck: ${fails} FAILED` : "\nlearnedCaptain-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
