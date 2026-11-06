// WebGLEngine/render/switchboardView.mjs -- UNNUMBERED (the version is chosen at ship time) (the page is switchboard.html; the gate is render/switchboardView-selfcheck.mjs)
//
// WHAT THE SWITCHBOARD PAGE SHOWS, AS DATA: no DOM, no canvas. `armsFor` lists the arms a task can take (its layer's), `defaultsOf` the page's starting range and options, `viewOf` turns a board reading (brain/switchboard.mjs
// read) into rows the page draws: per arm its mean (a bar), its bad dives and, for each control it is held to, a word -- BEATS, TIES, IS BELOW, or "control not flown" -- with the paired difference. A TIE is shown as a
// result, not as an absence of one: the page exists to be able to say "this brain does as well as its control and no better". `notOnBoard` names what is not on the board yet, so that the page cannot be read as a
// complete comparison of the brains.
// Pure: no clock, no Math.random, no file, no DOM.
"use strict";

/** What is NOT on the board, said on the page (brain/BACKLOG_2026-11-04_BRAINS.md): the brains whose kinds are on another branch or not built. */
export const notOnBoard = Object.freeze([
    "the fish pilot (803 weights): the tank flies only the fly's 963 until its kind is registered",
    "the stateful fly heading loop (1,729 weights) and the stateless fly: their kind and weights are on another branch",
    "the plain-net control and the single leaky unit: not built into the board yet",
    "the trained needs circuit: no champion weights file in this tree",
    "the disturbance task (fish 4b): not built into the board yet",
]);
/** The reading of the pairs, as the page prints it: what a TIE and a BEATS do and do not say. */
export const caveat = Object.freeze({
    survey: "Scores are the survey's (0.45 stations visited + 0.45 home + 0.1 hull; a crushed boat 0). A twin that TIES the rule at the same constants has not shown a gain on these dives; the series measured about +0.02 on 2,000 dives, which a handful of dives cannot see.",
    dropout: "Score is 1 - (mean settled heading error in the dark)/pi on the tank's compass dropout. A network that BEATS the autopilot here has shown that on these ids; the notes say plain nets of the same size keep 100 to 116 percent of the gain of a connectome-wired one, so a BEATS is not evidence for the wiring.",
});
export const DEFAULTS = Object.freeze({
    survey: Object.freeze({ range: Object.freeze({ from: 1344, to: 1349 }), seconds: 200, sd: 0.1, kinds: Object.freeze(["far", "both"]), arms: Object.freeze(["rule-r8", "rule-low06", "twin-standard"]) }),
    dropout: Object.freeze({ range: Object.freeze({ from: 0, to: 3 }), seconds: 120, arms: null }),
});
/** The page's starting values for a task (a copy); an unknown task is refused. */
export function defaultsOf(taskName) {
    const d = DEFAULTS[taskName]; if (!d) throw new Error(`switchboardView.defaultsOf: unknown task ${JSON.stringify(taskName)} (${Object.keys(DEFAULTS).join(", ")})`);
    return { ...d, range: { ...d.range }, ...(d.kinds ? { kinds: [...d.kinds] } : {}), ...(d.arms ? { arms: [...d.arms] } : {}) };
}
/** The arms a task can take: [{ id, note, controls, checked }] in registration order; `checked` follows the task's default list (all of them when it has none). */
export function armsFor(board, taskName) {
    const t = board.tasks.get(taskName); if (!t) throw new Error(`switchboardView.armsFor: unknown task ${JSON.stringify(taskName)}`);
    const dflt = defaultsOf(taskName).arms;
    return [...board.arms.values()].filter((a) => a.layer === t.layer).map((a) => ({ id: a.id, note: a.note, controls: [...a.controls], checked: dflt ? dflt.includes(a.id) : true }));
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4);
/** The rows the page draws from `board.read(res)` and the run's task name: { head, rows: [{ id, mean, bad, bar (0..1), verdicts: [{ control, cls ("beats"|"ties"|"below"|"missing"), word, text }] }], caveat }. */
export function viewOf(rd, taskName) {
    if (!rd || !Array.isArray(rd.per) || !Array.isArray(rd.pairs) || !Array.isArray(rd.lines)) throw new Error("switchboardView.viewOf: expected the board's reading { per, pairs, lines }");
    const rows = rd.per.map((r) => ({
        id: r.id, mean: r.mean, bad: r.bad, n: r.n, bar: clamp01(r.mean),
        verdicts: rd.pairs.filter((p) => p.arm === r.id).map((p) => {
            if (p.missing) return { control: p.control, cls: "missing", word: "control not flown", text: `${p.control} was not flown` };
            const cls = p.reading === "BETTER" ? "beats" : p.reading === "WORSE" ? "below" : "ties", word = cls === "beats" ? "BEATS" : cls === "below" ? "IS BELOW" : "TIES";
            return { control: p.control, cls, word, text: `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}; bad ${p.badA} against ${p.badB})` };
        }),
    }));
    return { head: rd.lines[0], rows, caveat: caveat[taskName] || "" };
}
/** The result as plain text (what the page's copy button puts on the clipboard): the board's own lines, the caveat and what is not on the board. */
export function textOf(rd, taskName) {
    return [...rd.lines, "", caveat[taskName] || "", "", "NOT ON THE BOARD YET:", ...notOnBoard.map((l) => "  - " + l)].join("\n");
}
