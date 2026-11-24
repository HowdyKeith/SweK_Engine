// WebGLEngine/tools/ship/takeEvadeSpeed.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_SPEED_WIP.md, the gate tools/ship/takeEvadeSpeed-selfcheck.mjs)
//   node tools/ship/takeEvadeSpeed.mjs smoke                 the 24 arms, 21 steps and 6 spans on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeSpeed.mjs dev  [--write]        the DEV read on geometries 108001 to 108024; --write records brain/subEvadeSpeedDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeSpeed.mjs held --write          the HELD read on geometries 109001 to 109024, flown ONCE: refuses without a recorded DEV that replicates, refuses without --write, refuses if brain/subEvadeSpeedHeld.json exists
// THE QUESTION (brain/SUB_EVADE_SPEED_WIP.md): with the evade turn held at one value, how does the edge over generation 0 depend on the evade speed from 2.0 to the bound 4.5: does the speed ever work without the turn (the gate), where does it start to pay, is it monotone, and does it stop paying before the bound?
// THREE CURVES of arms flown against generation 0 (G): T0 (G with evadeSpeed = the speed, the turn G's own), T25 (the turn 2.5) and T28 (the turn 2.8), at eight speeds each: 2.0, 2.7, G's own, league7103's, 3.8, 4.1, league7001's, 4.5 (the three named ones are read from the files). Every other number, the time included, is G's. 24 arms.
// A STEP is the arm of a speed against the arm of the next speed down on its curve (21): UP at paired z of 2 or more and an edge of 0.05 (T.DECISIVE) or more, DOWN at the mirror image, FLAT otherwise. A SPAN is the arm of 4.5 against the arm of G's speed (SPAN-LOW, UP only at an edge of 0.5) or against the arm of 4.1 (SPAN-TOP, labelled as a step): 6. R0 to R6 and the readings are rulesOf.
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns, signed, FIND_EDGE, FIND_Z } from "./takeSubLeague.mjs";
import { graft, rowOf, armsOf as turnArmsOf } from "./takeEvadeTurn.mjs";
import { armsOf as splitArmsOf } from "./takeEvadeSplit.mjs";
import { stepLabel, slopeOf, MIN_Z, MIN_EDGE } from "./takeEvadeDose.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEvadeSpeedDev.json", HELD_FILE = "brain/subEvadeSpeedHeld.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 108001, count: 24 }), held: Object.freeze({ first: 109001, count: 24 }) });
export const CURVES = Object.freeze(["T0", "T25", "T28"]), TURNS = Object.freeze({ T25: 2.5, T28: 2.8 });   // T0 has G's own turn
export const FIXED = Object.freeze({ low: Object.freeze([2.0, 2.7]), mid: Object.freeze([3.8, 4.1]), bound: 4.5 });
export const DONORS = Object.freeze({ low: "league7103", high: "league7001" });
export const THRESHOLD_NAMES = Object.freeze(["BELOW G", "BELOW G", "AT G", "AT G", "MID", "MID", "HIGH", "HIGH"]);
export { MIN_Z, MIN_EDGE, stepLabel };
export const MIN_SPAN = 0.5;

const f3 = (v) => signed(v, 3), d2 = (d) => d.toFixed(2);

/** The eight speeds in order from G (a theta) and the finders ([{ id, final }] with league7103 and league7001): 2.0, 2.7, G's own, league7103's, 3.8, 4.1, league7001's, 4.5. */
export function speedsOf(G, finders) {
    const pick = (id) => finders.find((f) => f.id === id).final.evadeSpeed;
    return [...FIXED.low, G.evadeSpeed, pick(DONORS.low), ...FIXED.mid, pick(DONORS.high), FIXED.bound];
}

/** The 24 arms: { id: "CURVE@speed", kind: "arm", curve, dose (the speed), index (0 to 7), theta }, curve T0 then T25 then T28, each from the lowest speed up. Each is G with the speed and the curve's turn (G's own for T0); nothing else moves. */
export function armsOf(G, finders) {
    const arms = [], speeds = speedsOf(G, finders);
    for (const curve of CURVES) {
        const turn = curve === "T0" ? G.evadeTurn : TURNS[curve];
        speeds.forEach((d, index) => arms.push({ id: `${curve}@${d2(d)}`, kind: "arm", curve, dose: d, index, theta: graft(G, { evadeSpeed: d, evadeTurn: turn }, ["evadeSpeed", "evadeTurn"]) }));
    }
    return arms;
}

const byDose = (arms, curve) => arms.filter((x) => x.curve === curve).sort((x, y) => x.dose - y.dose);

/** The 21 steps from the arms: for each curve, each arm against the arm of the next speed down (the higher speed is the first side): { id: "CURVE:hi>lo", curve, dose (the higher), lowerDose, hi, lo }. */
export function stepsOf(arms) {
    const steps = [];
    for (const curve of CURVES) {
        const a = byDose(arms, curve);
        for (let i = 1; i < a.length; i++) steps.push({ id: `${curve}:${d2(a[i].dose)}>${d2(a[i - 1].dose)}`, curve, dose: a[i].dose, lowerDose: a[i - 1].dose, hi: a[i], lo: a[i - 1] });
    }
    return steps;
}

/** The 6 spans: for each curve, the arm of the top speed (4.5) against the arm of G's own speed (span "low", the third arm) and against the arm of 4.1 (span "top", the sixth): { id: "CURVE:span-low" or "CURVE:span-top", curve, span, dose (the top), lowerDose, hi, lo }. */
export function spansOf(arms) {
    const spans = [];
    for (const curve of CURVES) {
        const a = byDose(arms, curve), hi = a[a.length - 1];
        for (const [span, i] of [["low", 2], ["top", 5]]) spans.push({ id: `${curve}:span-${span}`, curve, span, dose: hi.dose, lowerDose: a[i].dose, hi, lo: a[i] });
    }
    return spans;
}

/** Flies the arms against G, and the steps and spans against each other, on a set ("smoke", "dev" or "held"), plus what the checks need: the top arm of T28 against a copy of itself (`equal`). Returns { rows, steps, spans, equal: { edge } }. */
export function fly(arms, steps, spans, G, setName, opts = {}) {
    const geos = T.geometries(SETS[setName].count, SETS[setName].first), side = (id, theta) => T.makeSide(id, { theta }), g = side("G", G);
    const rows = arms.map((a) => ({ ...rowOf({ id: a.id, kind: "arm", finder: a.curve }, T.matchup(side(a.id, a.theta), g, geos, opts), geos), curve: a.curve, dose: a.dose }));
    const head = (kind, s) => ({ ...rowOf({ id: s.id, kind, finder: s.curve }, T.matchup(side(s.hi.id, s.hi.theta), side(s.lo.id, s.lo.theta), geos, opts), geos), curve: s.curve, dose: s.dose, lowerDose: s.lowerDose });
    const top = arms.find((a) => a.id === `T28@${d2(FIXED.bound)}`).theta;
    return { rows, steps: steps.map((s) => head("step", s)), spans: spans.map((s) => ({ ...head("span", s), span: s.span })), equal: { edge: T.matchup(side("equal1", top), side("equal2", top), geos, opts).summary.edge } };
}

/** The checks that VOID the read, by name and not weighed; every one is an identity or a file's own number. ctx { rows, steps, spans, arms, equal, G, runs, count, finders }. */
export function checksOf({ rows, steps, spans, arms, equal, G, runs, count, finders }) {
    const c = [], all = [...rows, ...steps, ...spans], low = finders.find((f) => f.id === DONORS.low).final, high = finders.find((f) => f.id === DONORS.high).final;
    if (all.some((r) => r.flew !== 2 * count || !r.seedsOk)) c.push("an arm, a step or a span did not fly the same geometries");
    if (all.some((r) => !Number.isFinite(r.edge) || !Number.isFinite(r.z))) c.push("a score is non-finite");
    if (arms.some((a) => TA.THETA_NAMES.some((k) => TA.clampTheta(a.theta)[k] !== a.theta[k]))) c.push("an arm has a theta that clampTheta changes");
    if (runs.some((r) => JSON.stringify(r.gen0) !== JSON.stringify(G))) c.push("a run's generation 0 is not G");
    const own = rows.find((r) => r.id === `T0@${d2(G.evadeSpeed)}`);
    if (!own || own.edge !== 0) c.push(`the arm of G's own speed and turn has an edge of ${own && own.edge} against G, not exactly 0`);
    if (equal.edge !== 0) c.push(`two equal thetas have an edge of ${equal.edge} against each other, not exactly 0`);
    const same = (id, tid, from) => { const a = arms.find((x) => x.id === id), b = from.find((x) => x.id === tid); return !!a && !!b && JSON.stringify(a.theta) === JSON.stringify(b.theta); };
    const sn = splitArmsOf(G, finders), gn = turnArmsOf(G, finders);
    if (!(same(`T28@${d2(high.evadeSpeed)}`, `SN:${DONORS.high}`, sn) && same(`T28@${d2(low.evadeSpeed)}`, `SN:${DONORS.low}`, sn) && same(`T28@${d2(G.evadeSpeed)}`, `GN:${DONORS.high}`, gn))) c.push("a T28 arm is not the split or the evade-turn command's arm");
    const speeds = byDose(arms, "T0").map((a) => a.dose);
    if (!(speeds.length === 8 && speeds[2] === G.evadeSpeed && speeds[3] === low.evadeSpeed && speeds[6] === high.evadeSpeed && speeds[7] === FIXED.bound)) c.push("a named speed is not the file's");
    if (!speeds.every((d, i) => i === 0 || d > speeds[i - 1])) c.push("the speeds are not strictly increasing");
    if (arms.some((a) => TA.THETA_NAMES.some((k) => k !== "evadeSpeed" && k !== "evadeTurn" && a.theta[k] !== G[k]))) c.push("an arm has a number besides the speed and the turn that is not G's");
    return c;
}

/** A SPAN's label: "low" is UP at a z of MIN_Z or more AND an edge of MIN_SPAN (0.5) or more, DOWN at the mirror image, FLAT otherwise; "top" is labelled as a step. */
export const spanLabel = (z, edge, span) => (span === "top" ? stepLabel(z, edge) : z >= MIN_Z && edge >= MIN_SPAN ? "UP" : z <= -MIN_Z && edge <= -MIN_SPAN ? "DOWN" : "FLAT");
/** An arm that LOSES to G: an edge of at most -FIND_EDGE with z of at most -FIND_Z. */
export const loses = (r) => r.edge <= -FIND_EDGE && r.z <= -FIND_Z;
/** The name of a threshold by the arm's place (0 to 7) in the speeds. */
export const thresholdName = (index) => THRESHOLD_NAMES[index];

/** R0 to R6 per curve, the gate, T minus T0, the slope and the forecast quantities, from the arm rows, the step rows and the span rows. */
export function rulesOf(rows, steps, spans) {
    const arm = (curve) => rows.filter((r) => r.curve === curve).sort((x, y) => x.dose - y.dose), stp = (curve) => steps.filter((r) => r.curve === curve).sort((x, y) => x.dose - y.dose);
    const out = { curves: {} };
    for (const curve of CURVES) {
        const a = arm(curve), s = stp(curve), first = a.find((r) => r.finds), idx = first ? a.indexOf(first) : null, down = s.find((r) => stepLabel(r.z, r.edge) === "DOWN"), upIdx = s.map((r, i) => (stepLabel(r.z, r.edge) === "UP" ? i : -1)).filter((i) => i >= 0), lastUp = upIdx.length ? upIdx[upIdx.length - 1] : -1;
        const sp = (kind) => { const r = spans.find((x) => x.curve === curve && x.span === kind); return spanLabel(r.z, r.edge, kind); };
        out.curves[curve] = {
            threshold: first ? { dose: first.dose, name: thresholdName(idx), index: idx } : { dose: null, name: "NONE", index: null },
            monotone: !down, reversal: down ? down.dose : null,
            saturation: lastUp === s.length - 1 ? null : lastUp < 0 ? a[0].dose : s[lastUp].dose,
            steps: s.map((r) => stepLabel(r.z, r.edge)), spanLow: sp("low"), spanTop: sp("top"),
        };
    }
    const t0 = arm("T0"), t25 = arm("T25"), t28 = arm("T28");
    out.replicates = !!t28[6] && !!t28[2] && t28[6].finds && t28[2].finds;
    const findT0 = t0.filter((r, i) => i !== 2 && r.finds);
    out.gate = { holds: findT0.length === 0, count: findT0.length, finding: findT0.map((r) => r.id), loses: rows.filter(loses).map((r) => r.id) };
    out.diff = { T25: t25.map((r, i) => r.edge - t0[i].edge), T28: t28.map((r, i) => r.edge - t0[i].edge) };
    out.slope = (t28[6].edge - t28[2].edge) / (t28[6].dose - t28[2].dose);
    const thr = (c) => (out.curves[c].threshold.index === null ? Infinity : out.curves[c].threshold.index);
    out.forecast = {
        gate: out.gate.holds, spanLowT28: out.curves.T28.spanLow === "UP", spanLowT25: out.curves.T25.spanLow === "UP", spanLowT0NotUp: out.curves.T0.spanLow !== "UP",
        t28ThresholdAtG: out.curves.T28.threshold.index === 2, t25ThresholdAboveT28: thr("T25") > thr("T28"), t28Monotone: out.curves.T28.monotone, allMonotone: CURVES.every((c) => out.curves[c].monotone),
        boundBindsT28: out.curves.T28.spanTop === "UP", l7103WithinHalf: Math.abs(t28[3].edge - t28[2].edge) <= 0.5,
    };
    return out;
}

/** The report of a read, one string a line. */
export function reportLines(rows, steps, spans, rules, name) {
    const S = SETS[name], L = [], what = { T0: "G with evadeSpeed = the speed (the turn G's own)", T25: "G with evadeSpeed = the speed and evadeTurn 2.5", T28: "G with evadeSpeed = the speed and evadeTurn 2.8" };
    L.push(`[takeEvadeSpeed] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, both seats (${2 * S.count} duels an arm); ${rows.length} arms against G, generation 0 (the search-ping champion), ${steps.length} steps (a speed against the next speed down), ${spans.length} spans (the arm of 4.5 against the arm of G's speed and against the arm of 4.1); an arm FINDS at edge >= ${FIND_EDGE} and z >= ${FIND_Z}, a step is UP at z >= ${MIN_Z} and edge >= ${MIN_EDGE}, DOWN at z <= -${MIN_Z} and edge <= -${MIN_EDGE}, a SPAN-LOW is UP at z >= ${MIN_Z} and edge >= ${MIN_SPAN}`);
    const line = (a) => `    ${a.id.padEnd(9)} edge ${f3(a.edge)} +- ${a.se.toFixed(3)} (z ${a.z.toFixed(1)}), ${a.winsX}-${a.draws}-${a.winsY}  ${a.finds ? "FINDS" : "does not"}   seat A ${f3(a.seatA)}, seat B ${f3(a.seatB)}`;
    for (const curve of CURVES) {
        L.push(`  ${curve.padEnd(3)} ${what[curve]}`);
        for (const a of rows.filter((r) => r.curve === curve).sort((x, y) => x.dose - y.dose)) L.push(line(a));
        for (const s of steps.filter((r) => r.curve === curve).sort((x, y) => x.dose - y.dose)) L.push(`    step ${d2(s.dose)} over ${d2(s.lowerDose)}   edge ${f3(s.edge)} +- ${s.se.toFixed(3)} (z ${s.z.toFixed(1)})  ${stepLabel(s.z, s.edge)}`);
        for (const s of spans.filter((r) => r.curve === curve)) L.push(`    span ${d2(s.dose)} over ${d2(s.lowerDose)}   edge ${f3(s.edge)} +- ${s.se.toFixed(3)} (z ${s.z.toFixed(1)})  ${spanLabel(s.z, s.edge, s.span)}`);
    }
    const c = rules.curves, nm = (x) => (x === null ? "none" : d2(x)), g = rules.gate, t28 = rows.filter((r) => r.curve === "T28").sort((x, y) => x.dose - y.dose);
    L.push(`  R0 REPLICATES: the arms of T28 at ${DONORS.high}'s speed and at G's own find: ${rules.replicates ? "yes" : "NO"}`);
    L.push(`  R1 THRESHOLD: ${CURVES.map((k) => `${k} ${c[k].threshold.dose === null ? "NONE" : `${c[k].threshold.name} (${d2(c[k].threshold.dose)})`}`).join(", ")}`);
    L.push(`  R2 MONOTONE: ${CURVES.map((k) => `${k} ${c[k].monotone ? "yes" : `no (reversal at ${d2(c[k].reversal)})`}`).join(", ")}`);
    L.push(`  R3 SATURATION: ${CURVES.map((k) => `${k} ${nm(c[k].saturation)}`).join(", ")}`);
    L.push(`  R4 THE TURN IS THE GATE: no arm of T0 finds: ${g.holds ? "yes" : "NO"} (${g.count} of 7 non-G arms find${g.count ? ": " + g.finding.join(" ") : ""})`);
    L.push(`  R5 THE SPEED MATTERS (4.5 over G's speed): ${CURVES.map((k) => `${k} ${c[k].spanLow}`).join(", ")}`);
    L.push(`  R6 THE BOUND BINDS (4.5 over 4.1): ${CURVES.map((k) => `${k} ${c[k].spanTop}`).join(", ")}`);
    L.push(`  LOSES (an arm at an edge of at most -${FIND_EDGE} and z of at most -${FIND_Z}): ${g.loses.length ? g.loses.join(" ") : "none"}`);
    L.push(`  T MINUS T0 at each speed (${t28.map((r) => d2(r.dose)).join(", ")}): T25 ${rules.diff.T25.map(f3).join(" ")}; T28 ${rules.diff.T28.map(f3).join(" ")}`);
    L.push(`  T28 SLOPE between G's speed and ${DONORS.high}'s (${d2(t28[2].dose)} and ${d2(t28[6].dose)}): ${signed(rules.slope, 2)} edge points an m/s`);
    const q = rules.forecast, yn = (b) => (b ? "yes" : "no");
    L.push(`  FORECAST QUANTITIES: the turn is the gate ${yn(q.gate)}, T28 speed matters ${yn(q.spanLowT28)}, T25 speed matters ${yn(q.spanLowT25)}, T0 speed matters not ${yn(q.spanLowT0NotUp)}, T28 threshold is G's speed ${yn(q.t28ThresholdAtG)}, T25 threshold above T28's ${yn(q.t25ThresholdAboveT28)}, T28 monotone ${yn(q.t28Monotone)}, all monotone ${yn(q.allMonotone)}, T28 bound binds ${yn(q.boundBindsT28)}, ${DONORS.low}'s speed within 0.5 of G's ${yn(q.l7103WithinHalf)}`);
    return L;
}

const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

/** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies 108001 to 109024). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
    const mode = argv[0];
    if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log("usage: takeEvadeSpeed.mjs smoke | dev [--write] | held --write"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--write") { log(`takeEvadeSpeed: unknown argument ${a}`); return 2; }
    const wr = argv.includes("--write");
    if (mode === "smoke" && wr) { log("takeEvadeSpeed: smoke is never recorded"); return 2; }
    if (mode === "dev" && wr && exists(DEV_FILE)) { log(`takeEvadeSpeed: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
    if (mode === "held" && !wr && !io.heldSet) { log("takeEvadeSpeed: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
    if (mode === "held" && wr && exists(HELD_FILE)) { log(`takeEvadeSpeed: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (mode === "held") {
        const dev = read(DEV_FILE);
        if (!dev) { log(`takeEvadeSpeed: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
        if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log("takeEvadeSpeed: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration"); return 2; }
        if (!Array.isArray(dev.checks) || dev.checks.length) { log("takeEvadeSpeed: DEV has a failed check (or records none), so its read is void; HELD is not flown by this registration"); return 2; }
    }
    const L = loadRuns(io.read); if (L.error) { log("takeEvadeSpeed: " + L.error); return 2; }
    const finders = [DONORS.low, DONORS.high].map((id) => L.runs.find((r) => r.id === id));   // loadRuns refuses unless every one of the twelve runs exists
    const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), arms = armsOf(G, finders), steps = stepsOf(arms), spans = spansOf(arms);
    const flown = flyIt(arms, steps, spans, G, name), rules = rulesOf(flown.rows, flown.steps, flown.spans), checks = checksOf({ rows: flown.rows, steps: flown.steps, spans: flown.spans, arms, equal: flown.equal, G, runs: L.runs, count: SETS[name].count, finders });
    for (const l of reportLines(flown.rows, flown.steps, flown.spans, rules, name)) log(l);
    if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
    if (mode === "dev") log(checks.length ? "  DEV: a check FAILED, the read is void; HELD is NOT flown by this registration" : rules.replicates ? "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadeSpeed.mjs held --write)" : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
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
