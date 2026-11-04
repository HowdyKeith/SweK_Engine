// WebGLEngine/brain/switchboard.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/takeSwitchboard.mjs; the gate is brain/switchboard-selfcheck.mjs)
//
// THE SWITCHBOARD CORE (brain/BACKLOG_2026-11-04_BRAINS.md, `switchboard-core`): ARMS flown on the SAME seeds of a TASK, read as PAIRED differences, with an honest line for every arm that has a CONTROL it must beat.
// No page, no picture. The page, the lesion toggle and the other brains are later items; this file is what they stand on.
//   A TASK is { name, layer: "decision" | "flying", run(arm, range, opts) -> [{ key, score, bad }] } -- one run per scenario, the SAME keys in the SAME order for every arm (a mismatch is refused, not paired).
//   AN ARM is { id, layer, controls: [arm ids it must beat], note } plus whatever its task's `run` needs (`pilot()` for the survey, `entry()` for the tank).
//   TWO LAYERS, because the notes say they are two: the DECISION layer (which station next, when to surface: the needs rule, the twin planner, a needs circuit) and the FLYING layer (a heading or a pitch toward a target:
//   the autopilot, a network, the stateful fly). They are NOT interchangeable seats in one task, and the board refuses to put a flying arm on a decision task.
//   THE READING (the series' convention, brain/NEEDS_AND_LIMITS.md): a pooled paired difference a - b, BETTER iff mean > 2 se and positive, WORSE iff mean < -2 se, otherwise TIES. A control is named in the line either way:
//   "X BEATS its control Y", "X TIES its control Y" ("the plain net does as well" is the line this page exists to be able to say), "X IS BELOW its control Y".
// BUILT IN: the SURVEY (decision layer: the tuned rule at the Round 8 constants, the rule at low -0.06, the twin planner in each profile; `brain/surveySeat.mjs`) and the DROPOUT (flying layer: the tank's compass dropout, heading
// error in the dark, `render/subAquariumSim.mjs`; arms: the PD autopilot and any 963-weight network handed in). Other brains register through `board.addArm` / `board.addTask` and need no change here.
// Pure apart from what the flights do: no clock, no Math.random, no file (the command reads the weight files and hands them in).
"use strict";
import * as T from "./needsTask.mjs";
import * as U from "./tunedRule.mjs";
import * as S from "./surveySeat.mjs";
import * as A from "../render/subAquariumSim.mjs";

export const SE_FACTOR = 2, LAYERS = Object.freeze(["decision", "flying"]);
const TWO_PI = 2 * Math.PI;
const wrap = (a) => { let x = a % TWO_PI; if (x > Math.PI) x -= TWO_PI; if (x <= -Math.PI) x += TWO_PI; return x; };
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const seOf = (a) => { if (a.length < 2) return 0; const m = meanOf(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1) / a.length); };

/** The pooled paired difference a - b of two run lists (same keys in the same order, else it throws): { n, mean, se, better, worse, same, badA, badB }. */
export function paired(ra, rb) {
    if (ra.length !== rb.length) throw new Error(`switchboard.paired: the two arms flew ${ra.length} and ${rb.length} scenarios`);
    ra.forEach((r, i) => { if (r.key !== rb[i].key) throw new Error(`switchboard.paired: scenario ${i} is ${JSON.stringify(r.key)} for one arm and ${JSON.stringify(rb[i].key)} for the other`); });
    const d = ra.map((r, i) => r.score - rb[i].score);
    return { n: d.length, mean: meanOf(d), se: seOf(d), better: d.filter((x) => x > 1e-9).length, worse: d.filter((x) => x < -1e-9).length, same: d.filter((x) => Math.abs(x) <= 1e-9).length, badA: ra.reduce((s, r) => s + (r.bad ? 1 : 0), 0), badB: rb.reduce((s, r) => s + (r.bad ? 1 : 0), 0) };
}
/** "BETTER" iff the mean is positive and above SE_FACTOR se, "WORSE" iff negative and below -SE_FACTOR se, else "TIES" (a one-scenario or a zero-spread list that is not exactly equal reads by its sign alone: se 0 and mean not 0 is decisive). */
export const readingOf = (p) => (p.mean > 0 && p.mean > SE_FACTOR * p.se ? "BETTER" : p.mean < 0 && -p.mean > SE_FACTOR * p.se ? "WORSE" : "TIES");
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4);

/** The board: tasks and arms by name. */
export function createBoard() {
    const tasks = new Map(), arms = new Map();
    const board = {
        tasks, arms,
        addTask(t) {
            if (!t || typeof t.name !== "string" || !t.name) throw new Error("switchboard.addTask: a task needs a name");
            if (!LAYERS.includes(t.layer)) throw new Error(`switchboard.addTask: layer ${JSON.stringify(t.layer)} is not one of ${LAYERS.join(", ")}`);
            if (typeof t.run !== "function") throw new Error(`switchboard.addTask: task ${t.name} has no run()`);
            if (tasks.has(t.name)) throw new Error(`switchboard.addTask: task ${t.name} is already registered`);
            tasks.set(t.name, t); return board;
        },
        addArm(a) {
            if (!a || typeof a.id !== "string" || !a.id) throw new Error("switchboard.addArm: an arm needs an id");
            if (!LAYERS.includes(a.layer)) throw new Error(`switchboard.addArm: arm ${a.id} has layer ${JSON.stringify(a.layer)}, not one of ${LAYERS.join(", ")}`);
            if (arms.has(a.id)) throw new Error(`switchboard.addArm: arm ${a.id} is already registered`);
            arms.set(a.id, { controls: [], note: "", ...a }); return board;
        },
        /** Fly the named arms on the named task over `range` ({ from, to } seeds, or whatever the task reads); returns { task, layer, range, opts, runs: { armId: [...] } }. A flying arm on a decision task (or the reverse) and an unknown name are refused before flying. */
        run(taskName, armIds, range, opts = {}) {
            const t = tasks.get(taskName); if (!t) throw new Error(`switchboard.run: unknown task ${JSON.stringify(taskName)} (${[...tasks.keys()].join(", ")})`);
            if (!Array.isArray(armIds) || !armIds.length) throw new Error("switchboard.run: name at least one arm");
            for (const id of armIds) {
                const a = arms.get(id); if (!a) throw new Error(`switchboard.run: unknown arm ${JSON.stringify(id)} (${[...arms.keys()].join(", ")})`);
                if (a.layer !== t.layer) throw new Error(`switchboard.run: arm ${id} is a ${a.layer}-layer arm and task ${taskName} is a ${t.layer}-layer task`);
            }
            if (new Set(armIds).size !== armIds.length) throw new Error("switchboard.run: an arm is named twice");
            const runs = {}; for (const id of armIds) runs[id] = t.run(arms.get(id), range, opts);
            const n = runs[armIds[0]].length; for (const id of armIds) if (runs[id].length !== n) throw new Error(`switchboard.run: arm ${id} flew ${runs[id].length} scenarios and ${armIds[0]} ${n}`);
            return { task: taskName, layer: t.layer, range, opts, runs };
        },
        /** The board's reading of a result: per arm its mean and bad count; per ordered pair that is a control relation its paired difference and reading; and the lines. */
        read(res) { return readBoard(board, res); },
    };
    return board;
}
function readBoard(board, res) {
    const ids = Object.keys(res.runs), per = ids.map((id) => ({ id, n: res.runs[id].length, mean: meanOf(res.runs[id].map((r) => r.score)), bad: res.runs[id].reduce((s, r) => s + (r.bad ? 1 : 0), 0) }));
    const pairs = [];
    for (const id of ids) for (const c of board.arms.get(id).controls) {
        if (!res.runs[c]) { pairs.push({ arm: id, control: c, missing: true }); continue; }
        const p = paired(res.runs[id], res.runs[c]); pairs.push({ arm: id, control: c, ...p, reading: readingOf(p) });
    }
    const lines = [`${res.task} (${res.layer} layer), ${per[0].n} scenarios, ${ids.length} arms; paired on the same scenarios, BETTER/WORSE at ${SE_FACTOR} se`];
    for (const r of per) lines.push(`  ${r.id.padEnd(20)} mean ${r.mean.toFixed(4)}  bad ${r.bad}`);
    for (const p of pairs) {
        if (p.missing) { lines.push(`${p.arm}: its control ${p.control} was not flown, so no line`); continue; }
        const word = p.reading === "BETTER" ? "BEATS" : p.reading === "WORSE" ? "IS BELOW" : "TIES";
        lines.push(`${p.arm} ${word} its control ${p.control} (${sgn(p.mean)}, se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}; bad ${p.badA} against ${p.badB})`);
    }
    return { per, pairs, lines };
}

// ---- the SURVEY task (decision layer): the needs task of brain/needsTask.mjs, scenarios kind-major ------------------------------------------------------------------------------------------------
/** The survey task: range { from, to } seeds of each of `opts.kinds` (default far and both); opts { seconds (a shorter dive for the gate), sd (the gauge noise, default the task's) }. bad = a crushed or stranded dive. */
export const surveyTask = Object.freeze({
    name: "survey", layer: "decision",
    run(arm, range, opts = {}) {
        if (typeof arm.pilot !== "function") throw new Error(`switchboard.survey: arm ${arm.id} has no pilot()`);
        const kinds = opts.kinds || ["far", "both"], set = T.setOf(kinds, range.from, range.to);
        const r = T.evaluate(arm.pilot({ seconds: opts.seconds }), set, { gauge: { sd: opts.sd ?? T.GAUGE.sd, hz: T.GAUGE.hz }, ...(opts.seconds ? { seconds: opts.seconds } : {}) });
        return r.runs.map((x, i) => ({ key: `${set[i].kind}:${set[i].seed}`, score: x.score, bad: !!(x.crushed || x.stranded || x.status === "crushed" || x.status === "stranded") }));
    },
});
/** The survey arms: the tuned rule at the Round 8 constants (the baseline), the rule at the seat's constants (low -0.06), and the twin planner in each profile (each must beat the rule at the same constants). */
export function surveyArms() {
    const rule = (consts) => () => T.flyDecision(U.tunedSeat(consts, U.WIDE_BOUNDS));
    const arms = [
        { id: "rule-r8", layer: "decision", controls: [], pilot: rule(S.SURVEY_R8), note: "the tuned rule, Round 8 constants" },
        { id: "rule-low06", layer: "decision", controls: ["rule-r8"], pilot: rule(S.SURVEY_CONSTANTS), note: "the tuned rule, low -0.06 (Round 33)" },
    ];
    for (const profile of S.PROFILE_NAMES) arms.push({ id: "twin-" + profile, layer: "decision", controls: ["rule-low06"], pilot: ({ seconds } = {}) => S.surveyPilot({ profile, overrides: seconds ? { seconds } : {} }), note: `the twin planner, ${profile} profile` });
    return arms;
}

// ---- the DROPOUT task (flying layer): the tank's compass dropout, heading error in the dark ------------------------------------------------------------------------------------------------------
export const TICK = 1 / 30, SETTLE = 12;
/** The dropout task: range { from, to } is a list of integer ids "sb-<n>" (each a one-sub tank, the same spawn for every arm); opts { seconds (default 160), event ("dropout", or null for the lit control) }. Score = 1 - (mean SETTLED dark heading error)/pi (the lit error when the event is null); bad = a lost sub. */
export const dropoutTask = Object.freeze({
    name: "dropout", layer: "flying",
    run(arm, range, opts = {}) {
        if (typeof arm.entry !== "function") throw new Error(`switchboard.dropout: arm ${arm.id} has no entry()`);
        const seconds = opts.seconds ?? 160, event = opts.event === undefined ? "dropout" : opts.event, out = [];
        for (let n = range.from; n <= range.to; n++) {
            const id = "sb-" + n, q = A.createTank();
            if (arm.register) arm.register(q);
            q.sync([{ id, name: "Board " + arm.id, hue: 100, from: "board", local: true, theta: null, ...arm.entry(id) }]);
            if (event) q.setEvent(id, event);
            let target = null, age = 0, sum = 0, cnt = 0, sumAll = 0, cntAll = 0;
            for (let i = 0, m = Math.round(seconds / TICK); i < m; i++) {
                q.step(TICK); const s = q.snapshot()[0];
                if (s.target !== target) { target = s.target; age = 0; } else age += TICK;
                const dark = !!(s.compass && s.compass.valid === false), e = Math.abs(wrap(s.target.heading - s.heading));
                if ((event ? dark : true)) { sumAll += e; cntAll++; if (age >= SETTLE) { sum += e; cnt++; } }
            }
            const last = q.snapshot()[0], err = cnt ? sum / cnt : cntAll ? sumAll / cntAll : NaN;
            if (!Number.isFinite(err)) throw new Error(`switchboard.dropout: arm ${arm.id} id ${id} has no ticks in the bucket it is scored on`);
            out.push({ key: id, score: 1 - err / Math.PI, bad: !!last.lost });
        }
        return out;
    },
});
/** The flying arms: the PD autopilot (the baseline) and one arm per network handed in as { name: weights (963) }; each network must beat the autopilot. */
export function flyingArms(networks = {}) {
    const arms = [{ id: "autopilot", layer: "flying", controls: [], entry: () => ({ pilot: "autopilot", circuit: "gfc", weights: null }), note: "the PD autopilot" }];
    for (const [name, weights] of Object.entries(networks)) arms.push({ id: "network-" + name, layer: "flying", controls: ["autopilot"], entry: () => ({ pilot: "network", circuit: "gfc", weights }), note: `the 963-weight network ${name}` });
    return arms;
}
/** A board with the two built-in tasks and their arms (networks as { name: weights }). */
export function standardBoard(networks = {}) {
    const b = createBoard().addTask(surveyTask).addTask(dropoutTask);
    for (const a of [...surveyArms(), ...flyingArms(networks)]) b.addArm(a);
    return b;
}
