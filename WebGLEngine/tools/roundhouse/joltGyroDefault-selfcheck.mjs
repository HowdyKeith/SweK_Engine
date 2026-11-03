// WebGLEngine/tools/roundhouse/joltGyroDefault-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/roundhouse/joltGyroDefault-selfcheck.mjs      (~1 s)
//
// THE GATE OF tools/roundhouse/joltGyroDefault.mjs (and its command, joltGyroDefaultRun.mjs): Jolt's gyroscopic force on
// by default, as physics/mechanics/SPINNING_BODY_WIP.md registers its second round -- and of the default itself, in
// physics/jolt/joltLoader.js.
// *** NOTHING HERE FLIES A REGISTERED SPIN, AND NOTHING HERE STARTS THE COMMAND. *** The miniature spins at 1 rad/s, a
// rate nobody registered, for a tenth of a second, and M1 about a STABLE axis. The command's guards are held as library
// functions and as the order of its source; were a sabotage to remove one, an execution would fall through to the round.
//
//   1  THE REGISTRATION, AS CODE: the rates, the axes, the window and the reading's two lines; Euler's bound in closed form;
//      the cube; the four configurations; M1 the spinning body's own spin; what makes a run the registered one
//   2  THE RULE ON MADE-UP TRACES: the growth and the time it passes 10%; the reading at each of its edges
//   3  THE PLUMBING: the default is on, in the loader's source and on Jolt's body; the spinner passes no key for the
//      default and the flag otherwise; the substeps reach the world; the cube's moments; the body frame; the own physics
//   4  THE ROUND ON A MINIATURE: every control and measurement in order; the readings the rule's; C-flag, C-key and
//      C-determinism able to fail; the results file's format
//   5  THE COMMAND: it never overwrites, refuses an option it does not know, and prints no score
//
// SABOTAGE LOG (2026-11-03) -- each applied with the byte-safe runner against this gate and spinningBody-selfcheck, every file restored
// byte-identical (sha256); the number is the rows that went red, by name:
//   G1 a rate moved (20 -> 15) 1 | G2 the wobble at 1e-4 1 | G3 lost at 20% of the spin 3 | G4 kept within three times the bound 2 | G5 Euler's bound
//   without its floor of 1 5 | G6 its ratio inverted 5 | G7 the intermediate axis given a bound 1 | G8 lost on reaching 10%, not passing it 1 | G9 lost a
//   step early 2 | G10 the reading ignoring a lost spin 1 | G11 the kept edge strict 1 | G12 the default spinner passing a flag 1 | G13 the substeps
//   dropped 1 | G14 the world frame read as the body's 1 | G15 the damping left on 4 | G16 the ship made with the force off 2 | G17 C-flag's default body
//   passed true 1 | G18 C-flag's static body made dynamic 4 | G19 C-key's tolerance at 0.5 1 | G20 C-key over 2 s, not the window 4 (0 first) | G21 M3's
//   twin the same spin 1 | G22 M1 against a C3 with the force off 2 | G23 M2's change measured from the last reading 1 | G24 the registered flag without
//   M1's axis 1 | G25 the command never refusing an existing file 1 | G26 the command printing the result 1 | G27 the command accepting any option 1
//   G28 the loader's default off again 8 | G29 a static body taking the force 5 | G30 addShip passing the force off 3 | G31 the spinning body's default
//   row put back as it was 1 (in spinningBody-selfcheck: the row M4 could not watch go red, because it was restated before M4 ran)
//   FOUND BY THE SABOTAGES: (1) G20 went 0 red. About the smallest axis the wobble reaches its bound a quarter-turn in (1.42 s), so C-key flown for 2 s
//   read the same bound as over the window; it now counts its steps and fails short of 1,800. (2) G28 and G29 threw section 4 at its second row -- a
//   stopped round has no measurements -- hiding the rows after it; the rows now read through defaults, so each fails by name. The whole series was run
//   again after both fixes, and the counts above are that second run's.
//   FOUND BEFORE THEM, while designing them: three rows that could not have gone red -- M3's twin, M1's comparison with C3, M2's two measures (see the note).
// SABOTAGE LOG, SECTION 6 (2026-11-03, after the verdict) -- the same runner against this gate and spinningBody-selfcheck, with the committed results
// file, the note, the library, the loader or the spinning body's committed results edited; every file restored byte-identical:
//   V1 the file's bytes moved in the last digit of the cube's drift 2 (the file's sha256 and the note's: the digit is past double precision, so the number
//   itself never moved, and the hash is the only thing that sees it) | V2 the file not flagged as the registered run 3 | V3 the file reading M1 as
//   something else 5 | V4 the file's 10 rad/s spin about the largest axis not lost 7 | V5 the file's cube drift within 1e-5 (P2 then right) 5 | V6 the
//   file's C-key failed 4 | V7 the file's own physics drifting at 20 rad/s 5 | V8 the file's M1 fit off the spinning body's C3 in its last digit 3 | V9 the
//   file's last spin not flown twice alike 4 | V10 the file's four-substep loss a second early 5 | V11 the file's four-substep growth at 10 rad/s 10% off
//   the explicit step 4 | V12 the file's gap between the cubes not the drift 4 | V13 the note saying P4 wrong 1 | V14 the note's table cell mistyped 1
//   V15 the note's verdict heading renamed 1 | V16 the note's loss time rounded 1 | V17 the note's model loss times rounded 1 | V18 the library's kept line
//   at three times the bound 3 | V19 the loader's default off again 9 | V20 the spinning body's committed C3 fit moved in its last digit 3 (this gate's M1
//   row, and that file's own hash in spinningBody-selfcheck)
//   Every row of section 6 went red under at least one design, and none went 0 red.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as L from "./joltGyroDefault.mjs";
import * as SB from "./spinningBody.mjs";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now(), J = JSON.stringify;
const guard = (n, e) => ok(`section ${n} ran without throwing`, false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const lib = fs.readFileSync(path.join(HERE, "joltGyroDefault.mjs"), "utf8"), loader = fs.readFileSync(path.join(ENG, "physics/jolt/joltLoader.js"), "utf8");

console.log("1. THE REGISTRATION, AS CODE");
try {
    ok("!! the rates and the axes: 2, 5, 10 and 20 rad/s, about the largest axis (x, 6.5) and the smallest (z, 2.5), frozen",
        J(L.RATES) === J([2, 5, 10, 20]) && J(L.AXES) === J([0, 2]) && Object.isFrozen(L.RATES) && Object.isFrozen(L.AXES) && J(SB.fixtureBody().I) === J([6.5, 5, 2.5]));
    ok("!! the window and the reading's lines: 30 s at 1/60 s, the spinning body's wobble of 1e-5, lost past 10% of the spin, kept within twice Euler's bound, frozen",
        J(L.STABLE) === J({ T: 30, dt: 1 / 60, eps: 1e-5, lost: 0.10, kept: 2 }) && L.STABLE.eps === SB.SPIN.eps && Object.isFrozen(L.STABLE));
    // Euler's bound, written out again here from the ellipse: about axis a with the wobble started on b, the other axis c reaches
    // sqrt(|I_a - I_b| I_b / (|I_c - I_a| I_c)) of it, and the wobble never shrinks below its start
    const own = (I, a) => { const b = (a + 1) % 3, c = (a + 2) % 3; return Math.max(1, Math.sqrt((Math.abs(I[a] - I[b]) * I[b]) / (Math.abs(I[c] - I[a]) * I[c]))); };
    const F = [6.5, 5, 2.5], M = [3, 2, 1];
    ok("!! Euler's bound in closed form: the fixture's wobble reaches 1 of its start about the largest axis and 1.4422 about the smallest, and the intermediate axis has none; a made-up body's too",
        L.eulerBound(F, 0) === 1 && L.eulerBound(F, 2).toFixed(4) === "1.4422" && near(L.eulerBound(F, 2), own(F, 2), 1e-12) && L.eulerBound(F, 1) === Infinity &&
        L.eulerBound(M, 0) === 1 && near(L.eulerBound(M, 2), Math.sqrt(3), 1e-12) && near(L.eulerBound(M, 2), own(M, 2), 1e-12) && L.eulerBound(M, 1) === Infinity, `${L.eulerBound(F, 2)}`);
    const shipLine = (loader.match(/^\s*addShip\(.*$/m) || [""])[0];
    ok("!! the cube: half-size 0.5, density 1, 2 rad/s about (1, 2, 3), frozen -- and addShip() hands addBox no gyroscopic key, so a ship takes the default",
        J(L.CUBE) === J({ half: 0.5, density: 1, W: 2, axis: [1, 2, 3] }) && Object.isFrozen(L.CUBE) && /this\.addBox\(/.test(shipLine) && !/gyroscopic/.test(shipLine));
    ok("!! the four configurations, in order: Jolt with the default at one substep; the engine's own physics; reported, Jolt with the default at four and with the force passed off",
        J(L.CONFIGS.map((c) => [c.id, c.engine, c.flag, c.substeps])) === J([["J", "jolt", "default", 1], ["OWN", "own", null, null], ["J4", "jolt", "default", 4], ["J0", "jolt", false, 1]]) && Object.isFrozen(L.CONFIGS));
    ok("!! M1 is the spinning body's own spin: about the intermediate axis by default, for its 30 s at its 1/60 s, read by its rule against C3 (the flag passed true)",
        /export async function defaultBody\(\{ axis = 1, T = SB\.SPIN\.T, dt = SB\.SPIN\.dt \} = \{\}\)/.test(lib) && /SB\.readingOf\(fit\)/.test(lib) && /flag: true, substeps: 1 \}/.test(lib));
    ok("!! a run is the registered one only with the registered rates, the 30 s window and M1 about the intermediate axis",
        /registered: JSON\.stringify\(rates\) === JSON\.stringify\(RATES\) && T === STABLE\.T && m1Axis === 1/.test(lib));
} catch (e) { guard(1, e); }

console.log("\n2. THE RULE ON MADE-UP TRACES");
try {
    // a wobble on y growing as 1e-4 e^t on a 10 rad/s spin about x, sampled every 0.1 s for 12 s: it passes 10% of the spin (1 rad/s) at ln(1e4) = 9.21 s
    const grow = Array.from({ length: 121 }, (_, n) => ({ w: [10, 1e-4 * Math.exp(n * 0.1), 0] }));
    const g = L.growthOf(grow, { axis: 0, W: 10, dt: 0.1 });
    ok("!! the growth and the time it passes 10%: an exponential from 1e-4 reaches e^12 of its start, and passes 1 rad/s at the first sample after 9.21 s",
        near(g.factor, Math.exp(12), 1e-6 * Math.exp(12)) && near(g.lostAt, 9.3, 1e-9) && g.p0 === 1e-4, `${g.factor.toExponential(3)}, lost at ${g.lostAt}`);
    const flat = (top) => [{ w: [10, 1e-4, 0] }, { w: [10, top, 0] }, { w: [10, 1e-4, 0] }];
    ok("!! 'lost' is strictly PAST 10%: a wobble that reaches exactly 1 rad/s on a 10 rad/s spin is not lost, and a hair over it is",
        L.growthOf(flat(1), { axis: 0, W: 10, dt: 1 }).lostAt === null && L.growthOf(flat(1.0000001), { axis: 0, W: 10, dt: 1 }).lostAt === 1);
    const R = (factor, bound, lostAt = null) => L.stableReading({ factor, lostAt }, bound);
    ok("!! the reading at its edges: twice the bound is kept and a hair more drifts, about either axis; a wobble past 10% is lost whatever its growth",
        R(2, 1) === "kept" && R(2.000001, 1) === "drifting" && R(2 * 1.4422, 1.4422) === "kept" && R(2 * 1.4422 + 1e-6, 1.4422) === "drifting" && R(1, 1, 5) === "lost" && R(1e9, 1, null) === "drifting");
    // M2's two measures, on made-up traces (found while designing the sabotages: the miniature could only ask that they were numbers)
    const tr = (...ws) => ws.map((wWorld) => ({ wWorld })), A = tr([1, 0, 0], [1, 0.3, 0], [1, 0, 0.4]), B = tr([1, 0, 0], [1, 0, 0], [1, 0, 0]);
    ok("!! M2's measures on made-up traces: the change is from the trace's OWN first reading (a start that is itself off counts nothing), and the gap is step by step, each over the spin",
        near(L.changeOf(A, 2), 0.2, 1e-12) && L.changeOf(tr([1.0000001, 0, 0], [1.0000001, 0, 0]), 2) === 0 && near(L.apartOf(A, B, 2), 0.2, 1e-12) && L.apartOf(B, B, 2) === 0 &&
        near(L.apartOf(tr([0, 0, 0], [0, 0, 0]), tr([0, 0, 0], [3, 4, 0]), 5), 1, 1e-12));
} catch (e) { guard(2, e); }

console.log("\n3. THE PLUMBING");
try {
    const sig = (loader.match(/^\s*addBox\(\{[^)]*\}\s*=\s*\{\}\)\s*\{/m) || [""])[0];
    ok("!! THE DEFAULT IS ON, in the loader's own source: addBox's `gyroscopic` defaults to true, and only a dynamic body takes it",
        /gyroscopic = true \}/.test(sig) && /if \(dyn && gyroscopic\) cs\.mApplyGyroscopicForce = true;/.test(loader), sig.trim().slice(0, 120));
    const flag = await L.flagControl();
    ok("!! ...and on Jolt's own body (C-flag): a body made with no flag has the force, false turns it off, true on, and a static body never has it", flag.ok, J(flag.got));
    const real = (await L.jolt()).createWorld({ gravity: [0, 0, 0] }), seen = [], subs = [];
    const spy = new Proxy(real, { get(t, k) {
        if (k === "addBox") return (o) => { seen.push({ ...o }); return t.addBox(o); };
        if (k === "step") return (dt, s) => { subs.push(s); return t.step(dt, s); };
        const v = t[k]; return typeof v === "function" ? v.bind(t) : v; } });
    const a = await L.joltSpinner({ w0: [1, 0, 0], makeWorld: () => spy }), b = await L.joltSpinner({ w0: [1, 0, 0], flag: false, makeWorld: () => spy }), c = await L.joltSpinner({ w0: [1, 0, 0], flag: true, substeps: 4, makeWorld: () => spy });
    c.step();
    ok("!! the spinner passes NO gyroscopic key for the default -- so the wrapper's own default is what is measured -- and the flag itself otherwise; and the substeps reach the world's step",
        seen.length === 3 && !("gyroscopic" in seen[0]) && seen[1].gyroscopic === false && seen[2].gyroscopic === true && a.flag === true && b.flag === false && c.flag === true && J(subs) === J([4]), J(seen.map((s) => s.gyroscopic)));
    real.destroy();
    const ship = await L.joltSpinner({ w0: [0, 0, 1], ship: true }), m = ship.inertia.diag; ship.destroy();
    ok("!! addShip()'s cube has the force on, and its three moments are equal -- so its gyroscopic torque is exactly zero", ship.flag === true && near(m[0], m[1], 1e-6) && near(m[1], m[2], 1e-6) && near(m[0], 1 / 6, 1e-6), J(m));
    const sp = await L.joltSpinner({ w0: [0.4, 1e-3, 0] }); for (let k = 0; k < 30; k++) sp.step(); const r = sp.read(); sp.destroy();
    ok("!! the spinner reads the BODY frame: Jolt's world-frame angular velocity turned by the body's own quaternion, exactly, and after a turn the two differ",
        J(r.w) === J(RB.worldToBody(r.q, r.wWorld)) && J(r.w) !== J(r.wWorld) && near(r.w[0], 0.4, 1e-4));
    const o = await L.ownSpinner({ w0: [0.4, 1e-3, 0] }), s = await SB.spinner(SB.CONFIGS[3], { w0: [0.4, 1e-3, 0], dt: 1 / 60 });
    for (let k = 0; k < 30; k++) { o.step(); s.step(); }
    ok("!! ...and the engine's own physics is the spinning body's C4, rigidBody6dof.step(), to the bit", J(o.read().w) === J(s.read().w) && J(o.read().q) === J(s.read().q));
} catch (e) { guard(3, e); }

console.log("\n4. THE ROUND ON A MINIATURE (1 rad/s for a tenth of a second, M1 about the stable largest axis)");
try {
    // every row below reads through these, so a round a sabotage STOPPED fails each row by name instead of throwing at the first and hiding the
    // rest (G28 and G29 found section 4 throwing on a stopped round's missing measurements)
    const r = await L.run({ rates: [1], T: 0.1, m1Axis: 0 }), m1 = r.m1 || {}, m2 = r.m2 || {}, m3 = r.m3 || [], jc = r.joltControls || [];
    ok("!! the round runs C-flag and C-key, then C-inertia and C-undamped on every Jolt configuration, then M1, M2 and M3 -- and says it is not the registered run",
        r.registered === false && !r.stopped && r.flag.ok && !!r.key && r.key.ok && J(jc.map((x) => x.config)) === J(["J", "J4", "J0"]) && jc.every((x) => x.inertia.ok && x.undamped.ok) && !!r.m1 && !!r.m2 && Array.isArray(r.m3), r.stopped || "");
    ok("!! M3 covers every configuration at the rate, about both stable axes, each flown twice to the bit, each reading the rule's",
        m3.length === 8 && J(m3.map((x) => x.config + x.axis)) === J(["J0", "J2", "OWN0", "OWN2", "J40", "J42", "J00", "J02"]) && m3.every((x) => x.twin && x.reading === L.stableReading(x, x.bound) && x.bound === L.eulerBound(SB.fixtureBody().I, x.axis)));
    // (both found while designing the sabotages: the twin was compared but never shown to be a SECOND spin, and M1's comparison with C3
    // was asked only to be a boolean -- the default and the flag passed true make the same body, so on any spin their traces are one trace)
    ok("!! M3 flies every spin TWICE -- two separate spinOf() calls, compared by sameTrace() -- not one spin compared with itself",
        /a = await spinOf\(c, \{ w0, T, dt \}\), b = await spinOf\(c, \{ w0, T, dt \}\)/.test(lib) && /twin: SB\.sameTrace\(a\.trace, b\.trace\)/.test(lib));
    ok("!! M1 reports the default body's flag and reads it by the spinning body's rule, and its trace is C3's to the bit on this stable spin; M2 reports the cube's flags -- on from addShip, off when passed off",
        m1.flag === true && m1.c3Flag === true && m1.axis === 0 && !!m1.fit && m1.reading === SB.readingOf(m1.fit) && m1.sameAsC3 === true &&
        m2.flagOn === true && m2.flagOff === false && m2.steps === 6 && ["changeOn", "changeOff", "apart"].every((k) => Number.isFinite(m2[k])));
    // C-FLAG CAN FAIL: a world whose body made with no flag comes back without the force -- the wrapper as it was -- stops the round before anything is read
    const offWorld = async () => { const w = (await L.jolt()).createWorld({ gravity: [0, 0, 0] }); return new Proxy(w, { get(t, k) {
        if (k === "addBox") return (o) => t.addBox("gyroscopic" in o ? o : { ...o, gyroscopic: false });
        const v = t[k]; return typeof v === "function" ? v.bind(t) : v; } }); };
    const ow = await offWorld(), stopped = await L.run({ rates: [1], T: 0.1, m1Axis: 0, flagWorld: () => ow });
    ok("!! C-flag can fail: handed a world whose default body comes back off, the round says so and stops before any measurement",
        stopped.flag.ok === false && stopped.flag.got.default === false && /C-flag failed/.test(stopped.stopped || "") && !stopped.m1 && !stopped.m2 && !stopped.m3);
    const bad = await L.keyControl({ bounds: { 0: 1.1, 2: 1.1 * L.eulerBound(SB.fixtureBody().I, 2) } }), good = await L.keyControl();
    ok("!! C-key can fail: handed bounds a tenth too large it refuses, and with Euler's own the engine's physics meets them to 1e-3 -- over the whole window, 1,800 steps (G20 found a 2 s window passing)",
        !bad.ok && good.ok && good.got.every((x) => near(x.factor, x.bound, 1e-3 * x.bound) && x.steps === 1800), good.got.map((x) => `axis ${x.axis}: ${x.factor.toFixed(5)} of ${x.bound.toFixed(5)} over ${x.steps} steps`).join(", "));
    const x = await L.spinOf(L.CONFIGS[0], { w0: [1, 1e-5, 0], T: 0.1 }), y = await L.spinOf(L.CONFIGS[0], { w0: [1.001, 1e-5, 0], T: 0.1 }), z = await L.spinOf(L.CONFIGS[0], { w0: [1, 1e-5, 0], T: 0.1 });
    ok("!! C-determinism can tell: two spins a thousandth apart in rate are refused, and two of the same pass", !SB.sameTrace(x.trace, y.trace) && SB.sameTrace(x.trace, z.trace));
    const text = L.serialize(r);
    ok("  the results file's text: JSON.parse gives back the result exactly, and every array of numbers sits on one line",
        J(JSON.parse(text)) === J(r) && /"rates": \[[^\n\]]*\]/.test(text) && /"axis": \[[^\n\]]*\]/.test(text) && !/"rates": \[\n/.test(text));
} catch (e) { guard(4, e); }

console.log("\n5. THE COMMAND (never executed)");
try {
    const cmd = fs.readFileSync(path.join(HERE, "joltGyroDefaultRun.mjs"), "utf8"), code = cmd.replace(/\/\/.*$/gm, "");
    const atOpt = code.indexOf("unknown option"), atRefuse = code.indexOf("refuseExisting(results)"), atRun = code.indexOf("await run()");
    ok("!! the command refuses an option it does not know, then a results file that exists, before it runs the round, exiting 2 on either -- and refuseExisting() is the library's",
        atOpt > 0 && atRefuse > atOpt && atRun > atRefuse && /unknown option[^\n]*\); process\.exit\(2\);/.test(code) && /refuseExisting\(results\); if \(refused\) \{ console\.error\([^)]*\); process\.exit\(2\); \}/.test(code) &&
        /never overwritten/.test(L.refuseExisting("/any/r.json", () => true) || "") && L.refuseExisting("/any/r.json", () => false) === null && /from "\.\/joltGyroDefault\.mjs"/.test(code));
    ok("  ...and it prints no score: the result goes to the file through serialize(), and the console says only where",
        !/\.reading|\.factor|\.m1\b|\.m2\b|\.m3\b|\.key\b|\.flag\b/.test(code) && /fs\.writeFileSync\(results, serialize\(result\)\)/.test(code) && /commit it before reading it/.test(code) && (code.match(/console\.log\(/g) || []).length === 1);
} catch (e) { guard(5, e); }

console.log("\n6. THE VERDICT, AS CODE, FROM THE COMMITTED FILE (physics/mechanics/joltGyroDefaultResults.json, committed unread at e661c0b7)");
try {
    // Written AFTER the file was committed and read. Every number the note's verdict states is re-derived here from the file, every reading by
    // this gate's own statement of the rules; the whole registered round is flown again through the library (never the command) and held
    // against the file; and the explicit step's growth -- where the predictions came from -- is held against every Jolt reading.
    const text = fs.readFileSync(L.DEFAULT_RESULTS, "utf8"), R = JSON.parse(text), M3 = R.m3 || [], { I } = SB.fixtureBody();
    const sha = createHash("sha256").update(text).digest("hex"), th = (x) => x.toLocaleString("en-US"), e1 = (x) => x.toExponential(1);
    const at = (c, W, a) => M3.find((e) => e.config === c && e.W === W && e.axis === a) || {};
    ok("!! the file is the registered run, committed unread at e661c0b7 (sha256 eec1d252, written at 13:52:32): the rates, axes, window, lines, cube and configurations the library's, flagged registered and not stopped, M1 about the intermediate axis, and its text serialize()'s",
        sha === "eec1d2527c4421874685fed634faa1dfa399caf4fd19de5a12d6b20e5855dd84" && R.at.startsWith("2026-11-03T13:52:32") && R.registration === L.REGISTRATION && J(R.rates) === J(L.RATES) &&
        J(R.axes) === J(L.AXES) && J(R.stable) === J(L.STABLE) && J(R.cube) === J({ ...L.CUBE, axis: [...L.CUBE.axis] }) && J(R.configs) === J(L.CONFIGS.map((c) => ({ ...c }))) && R.registered === true &&
        R.T === 30 && R.dt === 1 / 60 && R.m1Axis === 1 && !("stopped" in R) && L.serialize(R) === text, sha.slice(0, 8) + " " + R.at);
    const key = await L.keyControl(), jc = R.joltControls || [], off = (d) => d.map((v, k) => Math.abs(v / I[k] - 1));
    ok("!! the controls held, as the file records them and re-derived here: C-flag (default on, false off, true on, static off); C-key 1.0000 and 1.4422 against Euler's bounds over 1,800 steps, the same when measured again; C-inertia to 1e-7 and C-undamped exact on J, J4 and J0; all 32 spins twice to the bit",
        R.flag.ok === true && J(R.flag.got) === J({ default: true, false: false, true: true, static: false }) && R.key.ok === true && J(R.key.got.map((x) => [x.axis, x.steps])) === J([[0, 1800], [2, 1800]]) &&
        R.key.got.every((x) => x.bound === L.eulerBound(I, x.axis) && Math.abs(x.factor / x.bound - 1) <= 1e-3) && key.ok &&
        key.got.every((x, k) => near(x.factor, R.key.got[k].factor, 1e-12) && x.steps === R.key.got[k].steps && x.bound === R.key.got[k].bound && x.ok === R.key.got[k].ok) &&
        J(jc.map((x) => x.config)) === J(["J", "J4", "J0"]) && jc.every((x) => x.inertia.ok && Math.max(...off(x.inertia.diag)) < 1e-7 && x.inertia.off.every((v) => v === 0) && x.undamped.ok && x.undamped.worst === 0) &&
        M3.length === 32 && M3.every((e) => e.twin === true), `Jolt's moments off by ${e1(Math.max(...off(jc[0].inertia.diag)))}`);
    // the spinning body's rule, written out again from its registration, and that round's committed C3 fit
    const P = 2 * Math.sqrt(((5 - 2.5) * (6.5 - 5)) / (2.5 * 6.5)), m1 = R.m1 || {}, euler = (f) => f.crossed !== null && f.points >= 20 && f.r2 >= 0.999 && Math.abs(f.sigma / P - 1) <= 0.10;
    const sbR = JSON.parse(fs.readFileSync(SB.DEFAULT_RESULTS, "utf8")), c3 = sbR.configs.find((c) => c.id === "C3");
    ok("!! M1: the default body has the force on, reads Euler's equations by the spinning body's rule (written out here) and by readingOf(), flew C3's trace to the bit, and its fit IS the spinning body's committed C3 fit",
        m1.axis === 1 && m1.flag === true && m1.c3Flag === true && m1.sameAsC3 === true && euler(m1.fit) && m1.reading === "Euler's equations" && SB.readingOf(m1.fit) === m1.reading && J(m1.fit) === J(c3.fit),
        `${m1.fit.sigma.toFixed(6)} (${((m1.fit.sigma / P - 1) * 100).toFixed(3)}%)`);
    const m2 = R.m2 || {};
    ok("!! M2: the cube from addShip() has the force on and three equal moments (1/6); with it on its angular velocity moved by 2.6e-5 of its spin over 1,800 steps, with it passed off not at all -- so the gap between the two is the first exactly",
        m2.flagOn === true && m2.flagOff === false && m2.moments.every((v) => near(v, 1 / 6, 1e-6)) && m2.changeOff === 0 && m2.changeOn > 0 && m2.changeOn < 1e-4 && e1(m2.changeOn) === "2.6e-5" &&
        m2.apart === m2.changeOn && m2.steps === 1800, `${e1(m2.changeOn)}, ${e1(m2.changeOn / m2.steps)} a step`);
    // M3's rule written out again: past 10% of the spin inside the window is lost; otherwise within twice Euler's bound is kept; otherwise drifting
    const rule = (e) => (e.lostAt !== null && e.lostAt <= 30 ? "lost" : e.factor <= 2 * e.bound ? "kept" : "drifting");
    const order = []; for (const c of ["J", "OWN", "J4", "J0"]) for (const W of [2, 5, 10, 20]) for (const a of [0, 2]) order.push(c + W + "/" + a);
    const pat = (c) => M3.filter((e) => e.config === c).map((e) => e.reading).join(",");
    ok("!! M3's readings, re-derived by this gate's own statement of the rule and by stableReading(), are the file's, each against Euler's bound in closed form: J kept, kept, drifting, drifting, LOST, drifting, LOST, LOST; the engine's own physics kept all eight; J0 kept all eight with no growth",
        J(M3.map((e) => e.config + e.W + "/" + e.axis)) === J(order) && M3.every((e) => e.bound === L.eulerBound(I, e.axis) && rule(e) === e.reading && L.stableReading(e, e.bound) === e.reading) &&
        pat("J") === "kept,kept,drifting,drifting,lost,drifting,lost,lost" && pat("OWN") === Array(8).fill("kept").join() && pat("J4") === "kept,kept,drifting,kept,drifting,drifting,lost,drifting" &&
        M3.filter((e) => e.config === "J0").every((e) => e.reading === "kept" && e.factor < 1.0001), ["J", "J4"].map((c) => c + ": " + pat(c)).join(" | "));
    ok("!! the losses, from the file: J at 10 rad/s about the largest axis after 23.22 s, at 20 rad/s after 5.95 s (largest) and 8.97 s (smallest); J4 at 20 rad/s about the largest after 23.13 s",
        J(M3.filter((e) => e.lostAt !== null).map((e) => [e.config, e.W, e.axis, e.lostAt.toFixed(2)])) === J([["J", 10, 0, "23.22"], ["J", 20, 0, "5.95"], ["J", 20, 2, "8.97"], ["J4", 20, 0, "23.13"]]));
    // THE EXPLICIT STEP'S GROWTH, where the predictions came from: sqrt(1 + (Omega h)^2) a step, Omega the wobble's own frequency
    const omega = (a, W) => { const b = (a + 1) % 3, c = (a + 2) % 3; return W * Math.sqrt(Math.abs(((I[c] - I[a]) / I[b]) * ((I[a] - I[b]) / I[c]))); };
    const model = (e, sub) => { const h = 1 / 60 / sub, perS = (0.5 * Math.log(1 + (omega(e.axis, e.W) * h) ** 2)) / h, growth = e.bound * Math.exp(perS * 30), tLost = Math.log(0.1 / (1e-5 * e.bound)) / perS;
        return { growth, tLost, reading: tLost <= 30 ? "lost" : growth <= 2 * e.bound ? "kept" : "drifting" }; };
    const js = M3.filter((e) => e.config === "J" || e.config === "J4").map((e) => ({ e, m: model(e, e.config === "J4" ? 4 : 1) }));
    const lostT = js.filter((x) => x.e.lostAt !== null).map((x) => x.m.tLost.toFixed(2));
    ok("  the explicit step's growth predicted every Jolt reading with the force on, at one substep and four; its loss times within 0.25 s of the measured (23.18, 5.91, 8.77 and 23.06 s), and its growth within 5% wherever nothing was lost",
        js.length === 16 && js.every(({ e, m }) => m.reading === e.reading && (e.lostAt !== null ? Math.abs(m.tLost - e.lostAt) <= 0.25 : Math.abs(e.factor / m.growth - 1) <= 0.05)) &&
        J(lostT) === J(["23.18", "5.91", "8.77", "23.06"]), lostT.join(", "));
    const J_ = (W, a) => at("J", W, a).reading, pred = { P1: m1.reading === "Euler's equations" && m1.sameAsC3 === true, P2on: m2.changeOn <= 1e-5, P2off: m2.changeOff === 0,
        P3: [2, 5, 10, 20].map((W) => J_(W, 0)).join() === "kept,drifting,lost,lost", P4: [2, 5, 10, 20].map((W) => J_(W, 2)).join() === "kept,drifting,drifting,lost", P5: pat("OWN") === Array(8).fill("kept").join() };
    ok("!! the predictions, read off the file: P1, P3, P4 and P5 right; P2 half wrong -- with the force on the cube moved by 2.6e-5, past the 1e-5 I gave, and with it off not at all (P6 is the build record's, not the file's)",
        pred.P1 && !pred.P2on && pred.P2off && pred.P3 && pred.P4 && pred.P5, J(pred));
    let worst = 0, where = "";
    const same = (a, b, p) => {
        if (typeof a === "number" && typeof b === "number") {
            if (Number.isInteger(a) && Number.isInteger(b)) return a === b;
            const d = Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b)); if (d > worst) { worst = d; where = p; } return d <= 1e-9;
        }
        if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, k) => same(x, b[k], `${p}[${k}]`));
        if (a && b && typeof a === "object" && typeof b === "object") { const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); return J(ka) === J(kb) && ka.every((k) => same(a[k], b[k], `${p}.${k}`)); }
        return a === b;
    };
    const again = await L.run(), { at: atA, ...flown } = again, { at: atR, ...filed } = R;
    ok("!! the registered round flown again at this head, through the library: run() gives back the file -- every reading, flag and count exactly, every number to 1e-9 (only the time it was written differs)",
        again.registered === true && typeof atA === "string" && typeof atR === "string" && same(flown, filed, "R"), `worst ${worst.toExponential(1)}${where ? " at " + where : ""}`);
    const note = fs.readFileSync(path.join(ENG, "physics/mechanics/SPINNING_BODY_WIP.md"), "utf8"), vAt = note.indexOf("\n### The verdict, 2026-11-03"), rest = vAt >= 0 ? note.slice(vAt + 1) : "";
    const nextHead = rest.search(/\n#{2,3} /), vt = vAt >= 0 ? (nextHead > 0 ? rest.slice(0, nextHead) : rest).replace(/\s+/g, " ") : "";   // that section alone, its line breaks read as spaces
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), stands = (x) => new RegExp("(?<![0-9])" + esc(x) + "(?![0-9])").test(vt);
    const fmt = (f) => (f >= 100 ? th(Math.round(f)) : f.toFixed(4)), cell = (e) => (e.lostAt !== null ? `lost at ${e.lostAt.toFixed(2)} s` : `${fmt(e.factor)}, ${e.reading}`);
    const rows = [2, 5, 10, 20].map((W) => `| ${W} rad/s | ${["J", "OWN", "J4", "J0"].map((c) => [0, 2].map((a) => cell(at(c, W, a))).join(" | ")).join(" | ")} |`);
    const lost = M3.filter((e) => e.config === "J" && e.lostAt !== null).map((e) => e.lostAt.toFixed(2));
    const frags = [...rows, `(${th(text.length)} bytes, sha256 ${sha.slice(0, 8)})`, `at ${R.key.got[0].factor.toFixed(4)} and ${R.key.got[1].factor.toFixed(4)} of their start`, `over all ${th(R.key.got[0].steps)} steps`,
                   `all ${M3.length} spins flew twice`, `grew at ${m1.fit.sigma.toFixed(6)}/s (${((m1.fit.sigma / P - 1) * 100).toFixed(3)}%)`, `moved by ${e1(m2.changeOn)} of its spin over the 30 s, about ${e1(m2.changeOn / m2.steps)} a step`,
                   `after ${lost[0]} s`, `after ${lost[1]} s about the largest axis and ${lost[2]} s about the smallest`, `Its three loss times were ${lostT[0]}, ${lostT[1]} and ${lostT[2]} s, against the ${lost[0]}, ${lost[1]} and ${lost[2]} s measured`,
                   `it is lost at ${at("J4", 20, 0).lostAt.toFixed(2)} s`, `reached ${th(Math.round(at("J", 10, 2).factor))} of its start, ${(at("J", 10, 2).factor * 1e-5 * 100).toFixed(1)}% of the spin`,
                   ...["P1", "P3", "P4", "P5"].map((k) => `**${k}: ${pred[k] ? "right" : "wrong"}.**`), `**P2: ${pred.P2on ? "right" : "half wrong"}.**`];
    const missing = frags.filter((x) => !stands(x));
    ok("!! the note's verdict carries the file's numbers, its table row by row, the explicit step's loss times as this section computes them, and each prediction's outcome as the file decides it (no digit may touch a fragment's ends; read from that section alone)",
        vAt > 0 && missing.length === 0, missing.length ? "missing: " + missing.join(" || ").slice(0, 300) : `${frags.length} fragments`);
} catch (e) { guard(6, e); }

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: how soon a larger wobble tumbles, what damping and contact do to the cost, and what four substeps cost in time -- none of it registered; whether to substep is Keith's.");
process.exitCode = fails ? 1 : 0;
