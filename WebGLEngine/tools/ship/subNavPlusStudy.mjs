// WebGLEngine/tools/ship/subNavPlusStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/NAV_PLUS_WIP.md, the gate is tools/ship/subNavPlusStudy-selfcheck.mjs)
//
// THE STUDIES OF THE THREE OPEN NAVIGATION ITEMS (brain/subNavPlus.mjs): the margin sweep (--study margin), the field that knows the current (--study current) and reacting traffic (--study reactive), each with its registered verdict and predictions.
//   node tools/ship/subNavPlusStudy.mjs --study margin   --set dev|held70 [--seeds N] [--write]    (held70 flies DEV first: the choice is the registered rule applied to DEV's flights)
//   node tools/ship/subNavPlusStudy.mjs --study current  --set dev|held71 [--seeds N] [--write]
//   node tools/ship/subNavPlusStudy.mjs --study reactive --set dev|held72 [--seeds N] [--write]
// A HELD set is flown ONCE; --write puts every flight in brain/subNavPlus<Study><Set>.jsonl. Pure apart from that file. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as H from "../../brain/subHardNav.mjs";
import * as P from "../../brain/subNavPlus.mjs";
import * as AP from "../../brain/autopilotSub.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const STUDIES = Object.freeze({ margin: "held70", current: "held71", reactive: "held72" });
export const OUT = Object.freeze({ margin: "brain/subNavPlusMarginHeld70.jsonl", current: "brain/subNavPlusCurrentHeld71.jsonl", reactive: "brain/subNavPlusReactiveHeld72.jsonl" });
export const THRESH = Object.freeze({ gain: 5, partlyGain: 3, p: 0.10, harmful: -5 });
export const MARGIN_KINDS = Object.freeze(["hard-islands", "hard-gaps", "hard-current", "hard-traffic"]), STATIC_KINDS = Object.freeze(["hard-islands", "hard-gaps", "hard-current"]);
export const MARGIN_ARM = Object.freeze({ "hard-islands": "any", "hard-gaps": "any", "hard-current": "any", "hard-traffic": "any+predict+edge+yield" });
export const CURRENT_KINDS = Object.freeze(["hard-current", "hard-current-gap"]), REACTIVE_REFERENCE = "any+predict+edge+yield";
export const pilot = (s, t, c) => AP.decide(s, t, c);

/** The median of a list (the mean of the two middle values when the count is even); NaN for an empty list. */
export function median(xs) {
    if (!xs.length) return NaN;
    const a = xs.slice().sort((p, q) => p - q), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
/** The exact two-sided sign test: the probability, under a fair coin, of a split at least as uneven as a against b (1 when there are no discordant pairs). */
export function signP(a, b) {
    const n = a + b, k = Math.min(a, b);
    if (n === 0) return 1;
    let c = Math.pow(0.5, n), tail = 0;   // c = C(n, i) / 2^n, built by the ratio
    for (let i = 0; i <= k; i++) { tail += c; c = c * (n - i) / (i + 1); }
    return Math.min(1, 2 * tail);
}
/** The numbers of one list of flights: { n, reached, collided, left, timeout, other, medianChord (path over chord of the arrivals) }. */
export function cell(rs) {
    const count = (s) => rs.filter((r) => r.status === s).length, done = rs.filter((r) => r.reached);
    return { n: rs.length, reached: done.length, rate: rs.length ? done.length / rs.length : NaN, collided: count("collided"), left: count("left"), timeout: count("timeout"), other: rs.filter((r) => !["reached", "collided", "left", "timeout"].includes(r.status)).length, medianChord: median(done.map((r) => r.path / r.chord)) };
}
const key = (r) => `${r.kind}|${r.seed}`;
/** Two lists of flights of the same scenarios, paired: { both, aOnly, bOnly, neither, p (the sign test on the discordant ones) }. A scenario in only one list is not paired. */
export function paired(as, bs) {
    const bm = new Map(bs.map((r) => [key(r), r]));
    let both = 0, aOnly = 0, bOnly = 0, neither = 0;
    for (const a of as) { const b = bm.get(key(a)); if (!b) continue; if (a.reached && b.reached) both++; else if (a.reached) aOnly++; else if (b.reached) bOnly++; else neither++; }
    return { both, aOnly, bOnly, neither, gain: aOnly - bOnly, p: signP(aOnly, bOnly) };
}

// ---- item 1: the margin sweep ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The DEV choice (registered): the variant with the most scenarios reached in total; ties go to the incumbent, then to the top rung nearest 12 m, then to the lower vertical margin. `byVariant`: { variant: [flights] }. */
export function chooseMargin(byVariant) {
    const names = Object.keys(byVariant), reached = (v) => byVariant[v].filter((r) => r.reached).length, V = P.MARGIN_VARIANTS;
    return names.slice().sort((a, b) => reached(b) - reached(a) || (b === P.INCUMBENT) - (a === P.INCUMBENT) || Math.abs(V[a].ladder[0] - 12) - Math.abs(V[b].ladder[0] - 12) || V[a].vmargin - V[b].vmargin || (a < b ? -1 : 1))[0];
}
/** The margin verdict (registered): A DIFFERENT MARGIN HELPS iff CHOSEN is not the incumbent, its gain over the incumbent is at least THRESH.gain and p <= THRESH.p; else THE INCUMBENT MARGIN STANDS; harmful iff the gain is THRESH.harmful or worse. */
export function judgeMargin(chosen, byVariant) {
    const inc = byVariant[P.INCUMBENT], ch = byVariant[chosen], pr = paired(ch, inc);
    const helps = chosen !== P.INCUMBENT && pr.gain >= THRESH.gain && pr.p <= THRESH.p, harmful = chosen !== P.INCUMBENT && pr.gain <= THRESH.harmful;
    const rate = (v, kinds) => { const rs = byVariant[v].filter((r) => kinds.includes(r.kind)); return rs.length ? rs.filter((r) => r.reached).length / rs.length : NaN; };
    const best = Object.keys(byVariant).sort((a, b) => byVariant[b].filter((r) => r.reached).length - byVariant[a].filter((r) => r.reached).length || (a < b ? -1 : 1))[0];
    const on = (v, k) => cell(byVariant[v].filter((r) => r.kind === k));
    return {
        chosen, pr, helps, harmful, verdict: helps ? "A DIFFERENT MARGIN HELPS" : "THE INCUMBENT MARGIN STANDS", best,
        m1: chosen === P.INCUMBENT, m2: !helps, m3: !!byVariant.m16 && on("m16", "hard-gaps").reached <= on("m12", "hard-gaps").reached, m4: !!byVariant.m6 && on("m6", "hard-islands").collided > on("m12", "hard-islands").collided,
        m5: !!byVariant.v0 && !!byVariant.v10 && on("v0", "hard-islands").collided - on("v10", "hard-islands").collided >= 1, m6: Object.keys(byVariant).every((v) => rate(v, STATIC_KINDS) >= 0.9),
    };
}

// ---- item 2: the current -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The current verdict (registered). `runs`: all flights (arms of ARMS_OF_PLUS on the two kinds). Designated vs `any`, pooled: SUPPORTED iff gain >= THRESH.gain, p <= THRESH.p and no more collisions; PARTLY SUPPORTED iff gain >= THRESH.partlyGain otherwise; else NOT SUPPORTED (HARMFUL at THRESH.harmful or worse). */
export function judgeCurrent(runs) {
    const of = (arm, kind) => runs.filter((r) => r.arm === arm && (!kind || r.kind === kind)), D = P.DESIGNATED_PLUS.current, pr = paired(of(D), of("any")), dc = cell(of(D)), ac = cell(of("any"));
    const supported = pr.gain >= THRESH.gain && pr.p <= THRESH.p && dc.collided <= ac.collided, partly = !supported && pr.gain >= THRESH.partlyGain, harmful = pr.gain <= THRESH.harmful;
    const crabPr = paired(of("any+crab"), of("any")), est = of("any+crab").filter((r) => r.cEst60), near = est.filter((r) => Math.hypot(r.cEst60[0] - r.cMean[0], r.cEst60[1] - r.cMean[1]) <= 0.25).length;
    return {
        pr, supported, partly, harmful, verdict: supported ? "SUPPORTED" : partly ? "PARTLY SUPPORTED" : "NOT SUPPORTED", crabPr,
        c1: crabPr.gain < THRESH.gain, c2: cell(of("any+crab-mean")).reached >= cell(of("any+crab")).reached, c3: cell(of("any", "hard-current-gap")).reached < cell(of("any", "hard-current")).reached,
        c4: dc.medianChord >= ac.medianChord, c5: est.length > 0 && near / est.length >= 0.75, c5n: est.length ? near / est.length : NaN, c6: supported, c6b: partly,
    };
}

// ---- item 3: reacting traffic ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The reactive verdict (registered). `runs`: flights of ARMS_OF_PLUS["hard-reactive"] on hard-reactive plus the reference arm on hard-traffic (the same seeds). `scenarios`: the hard-reactive scenarios (for the ships by behaviour). */
export function judgeReactive(runs, scenarios = []) {
    const of = (arm, kind) => runs.filter((r) => r.arm === arm && r.kind === kind), D = P.DESIGNATED_PLUS.reactive, des = of(D, "hard-reactive"), ref = of(REACTIVE_REFERENCE, "hard-reactive"), pr = paired(des, ref);
    const supported = pr.gain >= THRESH.gain && pr.p <= THRESH.p && des.every((r) => r.status !== "left"), partly = !supported && pr.gain >= THRESH.partlyGain, harmful = pr.gain <= THRESH.harmful;
    const nonReactive = of(REACTIVE_REFERENCE, "hard-traffic"), react = cell(ref).reached, plain = cell(nonReactive).reached, shipsBy = {};
    for (const b of P.BEHAVIOURS) shipsBy[b] = scenarios.reduce((n, sc) => n + sc.obstacles.filter((o) => o.type === "ship" && o.behaviour === b).length, 0);
    const hitsBy = (b) => des.filter((r) => r.hit === b).length, rateBy = (b) => (shipsBy[b] ? hitsBy(b) / shipsBy[b] : NaN);
    return {
        pr, supported, partly, harmful, verdict: supported ? "SUPPORTED" : partly ? "PARTLY SUPPORTED" : "NOT SUPPORTED", react, plain, shipsBy, hitsBy: Object.fromEntries(P.BEHAVIOURS.map((b) => [b, hitsBy(b)])),
        r1: Math.abs(react - plain) >= 5, r2: react > plain, r3: cell(des).reached >= cell(of("any+replan", "hard-reactive")).reached, r4: supported, r4b: !supported && !partly, r5: Number.isFinite(rateBy("stops")) && Number.isFinite(rateBy("holds")) && rateBy("stops") < rateBy("holds"), r6: des.every((r) => r.status !== "timeout"),
    };
}

// ---- running and printing ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const pct = (v) => (Number.isFinite(v) ? (100 * v).toFixed(0) + "%" : "n/a");
const f2s = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
const yn = (v) => (v ? "HELD" : "MISSED");
const row = (name, c) => `${name.padEnd(30)} | ${(`${c.reached}/${c.n} ${pct(c.rate)}`).padEnd(12)} | ${String(c.collided).padStart(8)} ${String(c.left).padStart(4)} ${String(c.timeout).padStart(7)} ${String(c.other).padStart(5)} | ${f2s(c.medianChord)}`;
const HEAD = "arm / variant                  | reached      | collided left timeout other | median path/chord";
export function marginRuns(seeds, o = {}) {
    const by = Object.fromEntries(Object.keys(P.MARGIN_VARIANTS).map((v) => [v, []])), scs = MARGIN_KINDS.flatMap((k) => seeds.map((s) => P.plusScenario(s, k)));
    for (const sc of scs) for (const v of Object.keys(P.MARGIN_VARIANTS)) by[v].push({ variant: v, ...P.flyPlus(o.pilot || pilot, sc, MARGIN_ARM[sc.kind], { ladder: P.MARGIN_VARIANTS[v].ladder, vmargin: P.MARGIN_VARIANTS[v].vmargin }) });
    return by;
}
export function marginLines(by, title) {
    const L = [title, HEAD];
    for (const v of Object.keys(by)) L.push(row(v + (v === P.INCUMBENT ? " (incumbent)" : ""), cell(by[v])));
    for (const k of MARGIN_KINDS) { L.push(`  ${k}: ` + Object.keys(by).map((v) => `${v} ${cell(by[v].filter((r) => r.kind === k)).reached}/${cell(by[v].filter((r) => r.kind === k)).n}`).join(", ")); }
    return L;
}
export function marginVerdictLines(j) {
    return [`DEV CHOICE (most reached; ties to the incumbent): ${j.chosen}`, `${j.chosen} against ${P.INCUMBENT} (paired, ${j.pr.both + j.pr.aOnly + j.pr.bOnly + j.pr.neither} scenarios): ${j.pr.aOnly} only ${j.chosen}, ${j.pr.bOnly} only ${P.INCUMBENT}, both ${j.pr.both}, neither ${j.pr.neither}; gain ${j.pr.gain}, sign-test p ${j.pr.p.toFixed(4)}${j.harmful ? "   THE DEV CHOICE WAS HARMFUL" : ""}`,
        `M1 the DEV choice is the incumbent: ${yn(j.m1)}`, `M2 the verdict is THE INCUMBENT MARGIN STANDS: ${yn(j.m2)}`, `M3 m16 reaches no more than m12 on hard-gaps: ${yn(j.m3)}`, `M4 m6 has more collisions than m12 on hard-islands: ${yn(j.m4)}`, `M5 v0 has at least one more collision than v10 on hard-islands: ${yn(j.m5)}`,
        `M6 every variant reaches at least 90 percent on the three static kinds together: ${yn(j.m6)}`, `POST HOC, moves nothing: the variant that reached the most on this set is ${j.best}`, `VERDICT: ${j.verdict}`];
}
export function currentRuns(seeds, o = {}) { return CURRENT_KINDS.flatMap((k) => seeds.flatMap((s) => { const sc = P.plusScenario(s, k); return P.ARMS_OF_PLUS[k].map((arm) => P.flyPlus(o.pilot || pilot, sc, arm)); })); }
export function currentLines(runs, title) {
    const L = [title, HEAD];
    for (const k of CURRENT_KINDS) for (const arm of P.ARMS_OF_PLUS[k]) L.push(row(`${k} ${arm}`, cell(runs.filter((r) => r.kind === k && r.arm === arm))));
    return L;
}
export function currentVerdictLines(j) {
    return [`${P.DESIGNATED_PLUS.current} against any (pooled, paired): ${j.pr.aOnly} only the designated arm, ${j.pr.bOnly} only any, both ${j.pr.both}, neither ${j.pr.neither}; gain ${j.pr.gain}, sign-test p ${j.pr.p.toFixed(4)}${j.harmful ? "   HARMFUL" : ""}`,
        `C1 any+crab alone does not beat any by ${THRESH.gain}: ${yn(j.c1)} (gain ${j.crabPr.gain})`, `C2 any+crab-mean reaches at least as many as any+crab: ${yn(j.c2)}`, `C3 any reaches fewer on hard-current-gap than on hard-current: ${yn(j.c3)}`, `C4 the designated arm's median path over the chord is at least any's: ${yn(j.c4)}`,
        `C5 the estimate is within 0.25 m/s of the true mean at 60 s on at least 75 percent of the scenarios: ${yn(j.c5)} (${pct(j.c5n)})`, `C6 SUPPORTED: ${yn(j.c6)}; PARTLY SUPPORTED: ${yn(j.c6b)}`, `VERDICT: ${j.verdict}`];
}
export function reactiveRuns(seeds, o = {}) {
    const runs = [];
    for (const s of seeds) {
        const sc = P.plusScenario(s, "hard-reactive");
        for (const arm of P.ARMS_OF_PLUS["hard-reactive"]) runs.push(P.flyPlus(o.pilot || pilot, sc, arm));
        runs.push(P.flyPlus(o.pilot || pilot, P.plusScenario(s, "hard-traffic"), REACTIVE_REFERENCE));
    }
    return runs;
}
export function reactiveLines(runs, title) {
    const L = [title, HEAD];
    for (const arm of P.ARMS_OF_PLUS["hard-reactive"]) L.push(row(`hard-reactive ${arm}`, cell(runs.filter((r) => r.kind === "hard-reactive" && r.arm === arm))));
    L.push(row(`hard-traffic ${REACTIVE_REFERENCE}`, cell(runs.filter((r) => r.kind === "hard-traffic"))));
    return L;
}
export function reactiveVerdictLines(j) {
    return [`${P.DESIGNATED_PLUS.reactive} against ${REACTIVE_REFERENCE} (paired): ${j.pr.aOnly} only the designated arm, ${j.pr.bOnly} only the assumed-velocity arm, both ${j.pr.both}, neither ${j.pr.neither}; gain ${j.pr.gain}, sign-test p ${j.pr.p.toFixed(4)}${j.harmful ? "   HARMFUL" : ""}`,
        `ships by behaviour in these scenarios: ${P.BEHAVIOURS.map((b) => `${b} ${j.shipsBy[b]}`).join(", ")}; collisions of the designated arm by the ship hit: ${P.BEHAVIOURS.map((b) => `${b} ${j.hitsBy[b]}`).join(", ")}`,
        `R1 the reaction changes the assumed-velocity arm's reach by at least 5 on the same seeds: ${yn(j.r1)} (reactive ${j.react}, not reactive ${j.plain})`, `R2 the reaction RAISES that arm's reach: ${yn(j.r2)}`, `R3 the designated arm reaches at least as many as any+replan: ${yn(j.r3)}`,
        `R4 SUPPORTED: ${yn(j.r4)}; NOT SUPPORTED: ${yn(j.r4b)}`, `R5 a stops ship is hit less often than a holds ship, per ship: ${yn(j.r5)}`, `R6 no flight of the designated arm times out: ${yn(j.r6)}`, `VERDICT: ${j.verdict}`];
}
/** The command as a function: returns the exit code (0 fine, 2 a bad argument). `io` is for the gate: { out, err, writeFile, flights } (flights replaces the flying: { margin(seeds), current(seeds), reactive(seeds) }). */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const o = { study: null, set: "dev", seeds: null, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--study") { o.study = argv[++i]; if (!STUDIES[o.study]) { err(`subNavPlusStudy: --study needs one of ${Object.keys(STUDIES).join(", ")}`); return 2; } }
        else if (a === "--set") { o.set = argv[++i]; if (o.set !== "dev" && !Object.values(STUDIES).includes(o.set)) { err(`subNavPlusStudy: --set needs dev or one of ${Object.values(STUDIES).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("subNavPlusStudy: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else { err(`subNavPlusStudy: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (!o.study) { err(`subNavPlusStudy: --study needs one of ${Object.keys(STUDIES).join(", ")}`); return 2; }
    if (o.set !== "dev" && o.set !== STUDIES[o.study]) { err(`subNavPlusStudy: the ${o.study} study reads ${STUDIES[o.study]} only`); return 2; }
    if (o.write && o.set === "dev") { err(`subNavPlusStudy: --write goes with --set ${STUDIES[o.study]} only`); return 2; }
    const pick = (n) => (o.seeds ? P.PLUS_SETS[n].slice(0, o.seeds) : P.PLUS_SETS[n]), fly = io.flights || { margin: marginRuns, current: currentRuns, reactive: reactiveRuns };
    let flights;
    if (o.study === "margin") {
        const dev = fly.margin(pick("dev")), choice = chooseMargin(dev);
        out(`DEV set: ${pick("dev").length} seeds of each of ${MARGIN_KINDS.length} kinds, ${Object.keys(dev).length} variants`); out(marginLines(dev, "DEV (sanity and the choice; not a result)").join("\n")); out(`DEV choice: ${choice}`);
        if (o.set !== "dev") {
            const held = fly.margin(pick(o.set)); out(""); out(`${o.set.toUpperCase()} set: ${pick(o.set).length} seeds of each kind`); out(marginLines(held, `${o.set.toUpperCase()}`).join("\n")); out(marginVerdictLines(judgeMargin(choice, held)).join("\n"));
            flights = Object.values(held).flat();
        }
    } else if (o.study === "current") {
        const runs = fly.current(pick(o.set)); out(`${o.set.toUpperCase()} set: ${pick(o.set).length} seeds of each of ${CURRENT_KINDS.length} kinds`); out(currentLines(runs, `tau ${P.TAU_C} s, K ${P.CUR_K} s, ${H.SECONDS_HARD} s a flight`).join("\n"));
        const j = judgeCurrent(runs); out(currentVerdictLines(j).join("\n")); if (o.set !== "dev") flights = runs;
    } else {
        const seeds = pick(o.set), runs = fly.reactive(seeds); out(`${o.set.toUpperCase()} set: ${seeds.length} seeds of hard-reactive (and the reference on hard-traffic)`); out(reactiveLines(runs, `reaction: sense ${P.SENSE} m, clear ${P.SHIP_CLEAR} m, turn ${P.SHIP_TURN_RATE} rad/s to ${(P.SHIP_MAX_TURN * 180 / Math.PI).toFixed(0)} deg, decel ${P.SHIP_DECEL} m/s^2; filter tau ${P.TAU_V} s`).join("\n"));
        const scs = seeds.map((s) => P.plusScenario(s, "hard-reactive")), j = judgeReactive(runs, scs); out(reactiveVerdictLines(j).join("\n"));
        if (o.set === "dev") { const reacting = scs.filter((sc, i) => runs.some((r) => r.kind === "hard-reactive" && r.seed === sc.seed && r.arm === P.DESIGNATED_PLUS.reactive && r.reacted > 0)).length; out(`DEV: ${reacting} of ${scs.length} scenarios had a ship that answered the designated arm`); } else flights = runs;
    }
    if (o.write && flights) { writeFile(path.join(ENG, OUT[o.study]), flights.map((r) => JSON.stringify({ set: o.set, ...r })).join("\n") + "\n"); out(`wrote ${flights.length} flights to ${OUT[o.study]}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
