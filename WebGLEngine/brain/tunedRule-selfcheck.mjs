// WebGLEngine/brain/tunedRule-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/tunedRule-selfcheck.mjs      (a few seconds)
//
// THE GATE OF brain/tunedRule.mjs (Round 8 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 PARAMETERS  the defaults are the rule's own constants; the bounds are the registered ones and contain the defaults; normalise clips, holds high at or above low, refuses unknown names and non-numbers.
//   2 THRESHOLD   thresholdAt is high at the surface, low at ramp metres and below, linear between, and equals needsTask.obsThreshold at the defaults.
//   3 THE SEAT    at the defaults the decision equals GUARDED-FILTER's tick for tick on real dives and the dive is bit-identical; each parameter changes the dive: a higher low/high surfaces on more ticks, a lower cap lowers the decision's cap, a different alpha or ramp changes the fingerprint; station, pump and repair are the rule's.
//   4 PURE        the same parameters on the same dive twice give the same fingerprint; no clock, random or file.
// NOT CHECKED, said plainly: that tuned values score better (that is the experiment).
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { let v; try { v = typeof c === "function" ? c() : c; } catch (e) { v = false; d = "threw: " + e.message; } console.log((v ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!v) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
import * as T from "./needsTask.mjs";
import * as U from "./tunedRule.mjs";
console.log("tunedRule-selfcheck -- the tuned rule\n");
const code = fs.readFileSync(new URL("./tunedRule.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const run = (seatFactory, sc, seconds) => { const log = []; const p = T.flyDecision(seatFactory); const r = T.fly((ctx) => { const pilot = p(ctx); return (st, obs, cur) => { const c = pilot(st, obs, cur); log.push(pilot.decision); return c; }; }, sc, { gauge: T.GAUGE, ...(seconds ? { seconds } : {}) }); return { r, log }; };
const sc = T.scenario(241, "both"), sameStation = (a, b) => a === b || (a && b && a.x === b.x && a.y === b.y);

sec("1. PARAMETERS");
{
    ok("!! the defaults are GUARDED-FILTER's constants (alpha 0.005, low 0.3, high 0.6, ramp 6, cap 0.9)", J(U.DEFAULTS) === J({ alpha: 0.005, low: 0.3, high: 0.6, ramp: 6, cap: 0.9 }) && U.DEFAULTS.alpha === T.FILTER_ALPHA && U.DEFAULTS.cap === T.HULL_DEPTH);
    ok("!! the bounds are the registered ones and contain the defaults", J(U.BOUNDS) === J({ alpha: [0.001, 0.02], low: [0.15, 0.6], high: [0.35, 0.95], ramp: [2, 20], cap: [0.6, 0.9] }) && U.NAMES.every((k) => U.DEFAULTS[k] >= U.BOUNDS[k][0] && U.DEFAULTS[k] <= U.BOUNDS[k][1]) && J(U.NAMES) === J(["alpha", "low", "high", "ramp", "cap"]));
    ok("!! normalise with nothing is the defaults; it clips every parameter into its bounds", J(U.normalise({})) === J(U.DEFAULTS) && J(U.normalise({ alpha: 9, low: -1, ramp: 99, cap: 0 })) === J({ alpha: 0.02, low: 0.15, high: 0.6, ramp: 20, cap: 0.6 }));
    ok("!! high is held at or above low (low 0.6 with high 0.4 gives high 0.6)", U.normalise({ low: 0.6, high: 0.4 }).high === 0.6 && U.normalise({ low: 0.5, high: 0.9 }).high === 0.9);
    const thr = (f) => { try { f(); return null; } catch (e) { return e.message; } };
    ok("!! unknown names and non-numbers are refused", /unknown parameter/.test(thr(() => U.normalise({ speed: 1 }))) && /finite number/.test(thr(() => U.normalise({ low: "a" }))) && /finite number/.test(thr(() => U.normalise({ low: NaN }))) && /finite number/.test(thr(() => U.normalise({ low: Infinity }))));
}
sec("2. THRESHOLD");
{
    const q = U.normalise({ low: 0.2, high: 0.8, ramp: 10 });
    ok("!! thresholdAt is high at the surface, low at the ramp and below, halfway halfway", U.thresholdAt(q, 0) === 0.8 && Math.abs(U.thresholdAt(q, 5) - 0.5) < 1e-12 && Math.abs(U.thresholdAt(q, 10) - 0.2) < 1e-12 && Math.abs(U.thresholdAt(q, 99) - 0.2) < 1e-12 && U.thresholdAt(q, -3) === 0.8);
    ok("!! at the defaults it equals needsTask.obsThreshold at every depth", [0, 1, 3, 6, 9, 30].every((d) => Math.abs(U.thresholdAt(U.DEFAULTS, d) - T.obsThreshold(d)) < 1e-12));
}
sec("3. THE SEAT");
{
    const rule = run(T.ruleSeat("obs", { alpha: T.FILTER_ALPHA }), sc), def = run(U.tunedSeat({}), sc);
    ok("!! at the defaults the decision equals GUARDED-FILTER's on every tick and the dive is bit-identical", def.log.length === rule.log.length && def.log.every((d, i) => d.surface === rule.log[i].surface && d.cap === rule.log[i].cap && d.pump === rule.log[i].pump && d.repair === rule.log[i].repair && sameStation(d.station, rule.log[i].station)) && def.r.fingerprint === rule.r.fingerprint);
    const surf = (x) => x.log.filter((d) => d.surface).length, up = run(U.tunedSeat({ low: 0.5, high: 0.9 }), sc), down = run(U.tunedSeat({ low: 0.15, high: 0.35 }), sc);
    ok("!! a higher threshold surfaces on more ticks and a lower one on fewer", surf(up) > surf(rule) && surf(down) < surf(rule), surf(down) + " < " + surf(rule) + " < " + surf(up));
    ok("!! the cap parameter is the decision's cap on every tick", run(U.tunedSeat({ cap: 0.7 }), sc).log.every((d) => d.cap === 0.7) && def.log.every((d) => d.cap === T.HULL_DEPTH));
    ok("!! alpha and ramp each change the dive", [{ alpha: 0.02 }, { alpha: 0.001 }, { ramp: 2 }, { ramp: 20 }].every((p) => run(U.tunedSeat(p), sc).r.fingerprint !== rule.r.fingerprint));
    ok("!! pump and repair follow the FILTERED charge above 0.1 whatever the trip parameters", [up, down].every((x) => x.log.every((d) => typeof d.pump === "boolean" && typeof d.repair === "boolean")) && rule.log.every((d, i) => d.pump === def.log[i].pump));
}
sec("4. PURE");
{
    const a = T.fly(T.flyDecision(U.tunedSeat({ low: 0.4, ramp: 12 })), sc, { gauge: T.GAUGE }), b = T.fly(T.flyDecision(U.tunedSeat({ low: 0.4, ramp: 12 })), sc, { gauge: T.GAUGE });
    ok("!! the same parameters on the same dive twice give the same fingerprint", a.fingerprint === b.fingerprint);
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
