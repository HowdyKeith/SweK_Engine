// WebGLEngine/tools/ship/takeEvadeSpeedFine.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_SPEEDFINE_WIP.md, the gate tools/ship/takeEvadeSpeedFine-selfcheck.mjs)
//   node tools/ship/takeEvadeSpeedFine.mjs smoke                 the 24 arms, 19 steps and 4 spans on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeSpeedFine.mjs dev  [--write]        the DEV read on geometries 110001 to 110048; --write records brain/subEvadeSpeedFineDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeSpeedFine.mjs held --write          the HELD read on geometries 111001 to 111048, flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeSpeedFineHeld.json exists
// THE QUESTION, in two parts (brain/SUB_EVADE_SPEEDFINE_WIP.md). A, the ONSET: at the ceiling turn (2.8), where between 2.7 and generation 0's own evade speed does the speed start to pay, and is the start a JUMP or a RAMP? B, the TOP: at turns below the ceiling (2.3, 2.5, 2.65) does a faster evade than 4.1 still pay up to the bound 4.5, and does the turn set the speed at which a boat starts to find?
// FIVE CURVES of arms flown against generation 0 (G), every number G's but the speed and the turn: ON (turn 2.8; speeds 2.7, 2.8 ... 3.3 and G's own) and T23, T25, T265, T28 (turns 2.3, 2.5, 2.65, 2.8; speeds 3.8, 4.1, league7001's, the bound 4.5): 24 arms.
// A STEP is the arm of a speed against the arm of the next speed down on its curve (19): UP at paired z of 2 or more and an edge of 0.05 (T.DECISIVE) or more, DOWN at the mirror image, FLAT otherwise. A SPAN is the arm of 4.5 against the arm of 4.1 on each B curve (4), labelled as a step. R0 to RB5 and the readings are rulesOf.
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns, signed, FIND_EDGE, FIND_Z } from "./takeSubLeague.mjs";
import { graft, rowOf, armsOf as turnArmsOf } from "./takeEvadeTurn.mjs";
import { armsOf as splitArmsOf } from "./takeEvadeSplit.mjs";
import { stepLabel, MIN_Z, MIN_EDGE } from "./takeEvadeDose.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEvadeSpeedFineDev.json", HELD_FILE = "brain/subEvadeSpeedFineHeld.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 110001, count: 48 }), held: Object.freeze({ first: 111001, count: 48 }) });
export const CURVES = Object.freeze(["ON", "T23", "T25", "T265", "T28"]), B_CURVES = Object.freeze(["T23", "T25", "T265", "T28"]), LOWER = Object.freeze(["T23", "T25", "T265"]);
export const TURNS = Object.freeze({ ON: 2.8, T23: 2.3, T25: 2.5, T265: 2.65, T28: 2.8 });
export const ON_FIXED = Object.freeze([2.7, 2.8, 2.9, 3.0, 3.1, 3.2, 3.3]), TOP_FIXED = Object.freeze({ foot: 3.8, mid: 4.1, bound: 4.5 });
export const DONOR = "league7001";
export const ONSET_NAMES = Object.freeze(["LOW", "LOW", "LOW", "MID", "MID", "MID", "HIGH", "HIGH"]);
export const MIN_RISE = 0.5, JUMP_SHARE = 0.6, LOWER_NEEDED = 2;
export { MIN_Z, MIN_EDGE, stepLabel };

const f3 = (v) => signed(v, 3), d2 = (d) => d.toFixed(2);

/** The eight speeds of the ONSET curve from G (a theta): 2.7 to 3.3 in steps of 0.1, then G's own. */
export const onSpeedsOf = (G) => [...ON_FIXED, G.evadeSpeed];
/** The four speeds of each B curve from the finders ([{ id, final }] with league7001): 3.8, 4.1, league7001's, the bound 4.5. */
export const topSpeedsOf = (finders) => [TOP_FIXED.foot, TOP_FIXED.mid, finders.find((f) => f.id === DONOR).final.evadeSpeed, TOP_FIXED.bound];

/** The 24 arms: { id: "CURVE@speed", kind: "arm", curve, dose (the speed), index, theta }, ON then T23, T25, T265, T28, each from the lowest speed up. Each is G with the speed and the curve's turn; nothing else moves. */
export function armsOf(G, finders) {
    const arms = [];
    for (const curve of CURVES) {
        const speeds = curve === "ON" ? onSpeedsOf(G) : topSpeedsOf(finders);
        speeds.forEach((d, index) => arms.push({ id: `${curve}@${d2(d)}`, kind: "arm", curve, dose: d, index, theta: graft(G, { evadeSpeed: d, evadeTurn: TURNS[curve] }, ["evadeSpeed", "evadeTurn"]) }));
    }
    return arms;
}

const byDose = (arms, curve) => arms.filter((x) => x.curve === curve).sort((x, y) => x.dose - y.dose);

/** The 19 steps from the arms: for each curve, each arm against the arm of the next speed down (the higher speed is the first side): { id: "CURVE:hi>lo", curve, dose (the higher), lowerDose, hi, lo }. */
export function stepsOf(arms) {
    const steps = [];
    for (const curve of CURVES) {
        const a = byDose(arms, curve);
        for (let i = 1; i < a.length; i++) steps.push({ id: `${curve}:${d2(a[i].dose)}>${d2(a[i - 1].dose)}`, curve, dose: a[i].dose, lowerDose: a[i - 1].dose, hi: a[i], lo: a[i - 1] });
    }
    return steps;
}

/** The 4 spans: for each B curve, the arm of 4.5 (the highest speed) against the arm of 4.1 (the second): { id: "CURVE:span-top", curve, span: "top", dose, lowerDose, hi, lo }. */
export function spansOf(arms) {
    const spans = [];
    for (const curve of B_CURVES) {
        const a = byDose(arms, curve), hi = a[a.length - 1], lo = a[1];
        spans.push({ id: `${curve}:span-top`, curve, span: "top", dose: hi.dose, lowerDose: lo.dose, hi, lo });
    }
    return spans;
}

/** Flies the arms against G, and the steps and spans against each other, on a set ("smoke", "dev" or "held"), plus what the checks need: G with its own speed and turn against G (`identity`) and the top arm of T28 against a copy of itself (`equal`). Returns { rows, steps, spans, identity: { edge }, equal: { edge } }. */
export function fly(arms, steps, spans, G, setName, opts = {}) {
    const geos = T.geometries(SETS[setName].count, SETS[setName].first), side = (id, theta) => T.makeSide(id, { theta }), g = side("G", G);
    const rows = arms.map((a) => ({ ...rowOf({ id: a.id, kind: "arm", finder: a.curve }, T.matchup(side(a.id, a.theta), g, geos, opts), geos), curve: a.curve, dose: a.dose }));
    const head = (kind, s) => ({ ...rowOf({ id: s.id, kind, finder: s.curve }, T.matchup(side(s.hi.id, s.hi.theta), side(s.lo.id, s.lo.theta), geos, opts), geos), curve: s.curve, dose: s.dose, lowerDose: s.lowerDose });
    const top = arms.find((a) => a.id === `T28@${d2(TOP_FIXED.bound)}`).theta;
    return { rows, steps: steps.map((s) => head("step", s)), spans: spans.map((s) => ({ ...head("span", s), span: s.span })), identity: { edge: T.matchup(side("identity", graft(G, G, ["evadeSpeed", "evadeTurn"])), g, geos, opts).summary.edge }, equal: { edge: T.matchup(side("equal1", top), side("equal2", top), geos, opts).summary.edge } };
}

/** The checks that VOID the read, by name and not weighed; every one is an identity or a file's own number. ctx { rows, steps, spans, arms, identity, equal, G, runs, count, finders }. */
export function checksOf({ rows, steps, spans, arms, identity, equal, G, runs, count, finders }) {
    const c = [], all = [...rows, ...steps, ...spans], high = finders.find((f) => f.id === DONOR).final;
    if (all.some((r) => r.flew !== 2 * count || !r.seedsOk)) c.push("an arm, a step or a span did not fly the same geometries");
    if (all.some((r) => !Number.isFinite(r.edge) || !Number.isFinite(r.z))) c.push("a score is non-finite");
    if (arms.some((a) => TA.THETA_NAMES.some((k) => TA.clampTheta(a.theta)[k] !== a.theta[k]))) c.push("an arm has a theta that clampTheta changes");
    if (runs.some((r) => JSON.stringify(r.gen0) !== JSON.stringify(G))) c.push("a run's generation 0 is not G");
    if (identity.edge !== 0) c.push(`G with its own speed and turn has an edge of ${identity.edge} against G, not exactly 0`);
    if (equal.edge !== 0) c.push(`two equal thetas have an edge of ${equal.edge} against each other, not exactly 0`);
    const same = (id, tid, from) => { const a = arms.find((x) => x.id === id), b = from.find((x) => x.id === tid); return !!a && !!b && JSON.stringify(a.theta) === JSON.stringify(b.theta); };
    if (!(same(`T28@${d2(high.evadeSpeed)}`, `SN:${DONOR}`, splitArmsOf(G, finders)) && same(`ON@${d2(G.evadeSpeed)}`, `GN:${DONOR}`, turnArmsOf(G, finders)))) c.push("a T28 or ON arm is not the split or the evade-turn command's arm");
    const on = byDose(arms, "ON").map((a) => a.dose), tops = B_CURVES.map((k) => byDose(arms, k).map((a) => a.dose));
    if (!(on.length === 8 && on[7] === G.evadeSpeed && ON_FIXED.every((d, i) => on[i] === d) && tops.every((s) => s.length === 4 && s[0] === TOP_FIXED.foot && s[1] === TOP_FIXED.mid && s[2] === high.evadeSpeed && s[3] === TOP_FIXED.bound))) c.push("a named speed is not the file's");
    if (arms.some((a) => a.theta.evadeTurn !== TURNS[a.curve])) c.push("an arm's turn is not its curve's");
    if (arms.some((a) => TA.THETA_NAMES.some((k) => k !== "evadeSpeed" && k !== "evadeTurn" && a.theta[k] !== G[k]))) c.push("an arm has a number besides the speed and the turn that is not G's");
    return c;
}

/** The name of an onset by the arm's place (0 to 7) on the ONSET curve. */
export const onsetName = (index) => ONSET_NAMES[index];

/** R0 to RB5 per curve, the B curves less T28, the slope and the forecast quantities, from the arm rows, the step rows and the span rows. */
export function rulesOf(rows, steps, spans) {
    const arm = (curve) => rows.filter((r) => r.curve === curve).sort((x, y) => x.dose - y.dose), stp = (curve) => steps.filter((r) => r.curve === curve).sort((x, y) => x.dose - y.dose);
    const out = { curves: {} }, on = arm("ON"), s = stp("ON");
    const first = on.find((r) => r.finds), idx = first ? on.indexOf(first) : null, down = s.find((r) => stepLabel(r.z, r.edge) === "DOWN");
    const rise = on[7].edge - on[0].edge, rises = on.map((r, i) => (i === 0 ? -Infinity : r.edge - on[i - 1].edge)), maxRise = Math.max(...rises);
    out.on = {
        onset: first ? { dose: first.dose, name: onsetName(idx), index: idx } : { dose: null, name: "NONE", index: null },
        monotone: !down, reversal: down ? down.dose : null, steps: s.map((r) => stepLabel(r.z, r.edge)),
        rise, maxRise, shape: rise < MIN_RISE ? "NO RISE" : maxRise >= JUMP_SHARE * rise ? "JUMP" : "RAMP", belowG: idx !== null && idx < 7,
    };
    const thr = {};
    for (const curve of B_CURVES) {
        const a = arm(curve), f = a.find((r) => r.finds), spanRow = spans.find((x) => x.curve === curve && x.span === "top");
        thr[curve] = f ? a.indexOf(f) : Infinity;
        out.curves[curve] = { threshold: f ? { dose: f.dose, index: a.indexOf(f) } : { dose: null, index: null }, steps: stp(curve).map((r) => stepLabel(r.z, r.edge)), spanTop: stepLabel(spanRow.z, spanRow.edge) };
    }
    const t28 = arm("T28"), lowerUp = LOWER.filter((c) => out.curves[c].spanTop === "UP").length;
    out.replicates = !!t28[2] && !!on[7] && t28[2].finds && on[7].finds;
    out.turnSetsThreshold = thr.T23 >= thr.T25 && thr.T25 >= thr.T265 && thr.T265 >= thr.T28 && thr.T23 > thr.T28;
    out.lowerUp = lowerUp; out.boundBindsLower = lowerUp >= LOWER_NEEDED; out.plateau = out.curves.T28.spanTop !== "UP";
    out.diff = Object.fromEntries(LOWER.map((c) => [c, arm(c).map((r, i) => r.edge - t28[i].edge)]));
    out.slopeOn = (on[7].edge - on[0].edge) / (on[7].dose - on[0].dose);
    out.forecast = {
        onsetMid: out.on.onset.name === "MID", onsetLow: out.on.onset.name === "LOW", onsetHigh: out.on.onset.name === "HIGH", onMonotone: out.on.monotone, onRamp: out.on.shape === "RAMP",
        turnSetsThreshold: out.turnSetsThreshold, boundBindsLower: out.boundBindsLower, plateau: out.plateau, t23BoundFinds: arm("T23")[3].finds,
    };
    return out;
}

/** The report of a read, one string a line. */
export function reportLines(rows, steps, spans, rules, name) {
    const S = SETS[name], L = [], what = { ON: "G with evadeSpeed = the speed and evadeTurn 2.8 (the onset grid)", T23: "G with evadeSpeed = the speed and evadeTurn 2.3", T25: "G with evadeSpeed = the speed and evadeTurn 2.5", T265: "G with evadeSpeed = the speed and evadeTurn 2.65", T28: "G with evadeSpeed = the speed and evadeTurn 2.8" };
    L.push(`[takeEvadeSpeedFine] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, both seats (${2 * S.count} duels an arm); ${rows.length} arms against G, generation 0 (the search-ping champion), ${steps.length} steps (a speed against the next speed down), ${spans.length} spans (the arm of 4.5 against the arm of 4.1 on each B curve); an arm FINDS at edge >= ${FIND_EDGE} and z >= ${FIND_Z}, a step is UP at z >= ${MIN_Z} and edge >= ${MIN_EDGE}, DOWN at z <= -${MIN_Z} and edge <= -${MIN_EDGE}`);
    const line = (a) => `    ${a.id.padEnd(10)} edge ${f3(a.edge)} +- ${a.se.toFixed(3)} (z ${a.z.toFixed(1)}), ${a.winsX}-${a.draws}-${a.winsY}  ${a.finds ? "FINDS" : "does not"}   seat A ${f3(a.seatA)}, seat B ${f3(a.seatB)}`;
    for (const curve of CURVES) {
        L.push(`  ${curve.padEnd(4)} ${what[curve]}`);
        for (const a of rows.filter((r) => r.curve === curve).sort((x, y) => x.dose - y.dose)) L.push(line(a));
        for (const x of steps.filter((r) => r.curve === curve).sort((p, q) => p.dose - q.dose)) L.push(`    step ${d2(x.dose)} over ${d2(x.lowerDose)}   edge ${f3(x.edge)} +- ${x.se.toFixed(3)} (z ${x.z.toFixed(1)})  ${stepLabel(x.z, x.edge)}`);
        for (const x of spans.filter((r) => r.curve === curve)) L.push(`    span ${d2(x.dose)} over ${d2(x.lowerDose)}   edge ${f3(x.edge)} +- ${x.se.toFixed(3)} (z ${x.z.toFixed(1)})  ${stepLabel(x.z, x.edge)}`);
    }
    const o = rules.on, c = rules.curves, nm = (x) => (x === null ? "NONE" : d2(x));
    L.push(`  R0 REPLICATES: the arms of T28 at ${DONOR}'s speed and of ON at G's own find: ${rules.replicates ? "yes" : "NO"}`);
    L.push(`  RA1 ONSET: ${o.onset.dose === null ? "NONE" : `${o.onset.name} (${d2(o.onset.dose)})`}`);
    L.push(`  RA2 MONOTONE: ${o.monotone ? "yes" : `no (reversal at ${d2(o.reversal)})`}`);
    L.push(`  RA3 SHAPE: ${o.shape} (the rise from 2.7 to G's speed ${f3(o.rise)}, the largest step's rise ${f3(o.maxRise)})`);
    L.push(`  RA4 BELOW G: the onset is below G's own speed: ${o.belowG ? "yes" : "NO"}`);
    L.push(`  RB1 THRESHOLD: ${B_CURVES.map((k) => `${k} ${nm(c[k].threshold.dose)}`).join(", ")}`);
    L.push(`  RB2 THE TURN SETS THE THRESHOLD: ${rules.turnSetsThreshold ? "yes" : "NO"}`);
    L.push(`  RB3 THE BOUND BINDS (4.5 over 4.1): ${B_CURVES.map((k) => `${k} ${c[k].spanTop}`).join(", ")}`);
    L.push(`  RB4 THE BOUND BINDS AT LOWER TURNS: ${rules.boundBindsLower ? "YES" : "NO"} (${rules.lowerUp} of ${LOWER.length} lower turns UP)`);
    L.push(`  RB5 THE PLATEAU AT THE CEILING TURN: ${rules.plateau ? "yes" : "NO"}`);
    const t28 = rows.filter((r) => r.curve === "T28").sort((x, y) => x.dose - y.dose);
    L.push(`  B MINUS T28 at each speed (${t28.map((r) => d2(r.dose)).join(", ")}): ${LOWER.map((k) => `${k} ${rules.diff[k].map(f3).join(" ")}`).join("; ")}`);
    L.push(`  ON SLOPE between 2.70 and G's speed: ${signed(rules.slopeOn, 2)} edge points an m/s`);
    const q = rules.forecast, yn = (b) => (b ? "yes" : "no");
    L.push(`  FORECAST QUANTITIES: onset MID ${yn(q.onsetMid)}, onset LOW ${yn(q.onsetLow)}, onset HIGH ${yn(q.onsetHigh)}, ON monotone ${yn(q.onMonotone)}, shape a RAMP ${yn(q.onRamp)}, the turn sets the threshold ${yn(q.turnSetsThreshold)}, the bound binds at lower turns ${yn(q.boundBindsLower)}, plateau at the ceiling turn ${yn(q.plateau)}, T23 at the bound finds ${yn(q.t23BoundFinds)}`);
    return L;
}

const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

/** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies 110001 to 111048). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
    const mode = argv[0];
    if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log("usage: takeEvadeSpeedFine.mjs smoke | dev [--write] | held --write"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--write") { log(`takeEvadeSpeedFine: unknown argument ${a}`); return 2; }
    const wr = argv.includes("--write");
    if (mode === "smoke" && wr) { log("takeEvadeSpeedFine: smoke is never recorded"); return 2; }
    if (mode === "dev" && wr && exists(DEV_FILE)) { log(`takeEvadeSpeedFine: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
    if (mode === "held" && !wr && !io.heldSet) { log("takeEvadeSpeedFine: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
    if (mode === "held" && wr && exists(HELD_FILE)) { log(`takeEvadeSpeedFine: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (mode === "held") {
        const dev = read(DEV_FILE);
        if (!dev) { log(`takeEvadeSpeedFine: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
        if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log("takeEvadeSpeedFine: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration"); return 2; }
        if (!Array.isArray(dev.checks) || dev.checks.length) { log("takeEvadeSpeedFine: DEV has a failed check (or records none), so its read is void; HELD is not flown by this registration"); return 2; }
    }
    const L = loadRuns(io.read); if (L.error) { log("takeEvadeSpeedFine: " + L.error); return 2; }
    const finders = [L.runs.find((r) => r.id === DONOR)];   // loadRuns refuses unless every one of the twelve runs exists
    const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), arms = armsOf(G, finders), steps = stepsOf(arms), spans = spansOf(arms);
    const flown = flyIt(arms, steps, spans, G, name), rules = rulesOf(flown.rows, flown.steps, flown.spans), checks = checksOf({ rows: flown.rows, steps: flown.steps, spans: flown.spans, arms, identity: flown.identity, equal: flown.equal, G, runs: L.runs, count: SETS[name].count, finders });
    for (const l of reportLines(flown.rows, flown.steps, flown.spans, rules, name)) log(l);
    if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
    if (mode === "dev") log(checks.length ? "  DEV: a check FAILED, the read is void; HELD is NOT flown by this registration" : rules.replicates ? "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadeSpeedFine.mjs held --write)" : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
    if (wr) {
        const file = mode === "dev" ? DEV_FILE : HELD_FILE;
        write(file, JSON.stringify({ mode, set: name, first: SETS[name].first, count: SETS[name].count, rules, rows: flown.rows, steps: flown.steps, spans: flown.spans, checks }, null, 1) + "\n"); log(`  written ${file}`);
    }
    return checks.length ? 1 : 0;
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(command(process.argv.slice(2)));
}
