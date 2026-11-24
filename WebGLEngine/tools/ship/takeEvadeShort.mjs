// WebGLEngine/tools/ship/takeEvadeShort.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_SHORT_WIP.md, the gates tools/ship/takeEvadePingReach-selfcheck.mjs (the generic command) and tools/ship/takeEvadeShort-selfcheck.mjs (this spec))
//   node tools/ship/takeEvadeShort.mjs smoke                 the 59 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeShort.mjs dev  [--write]        the DEV read on geometries 134001 to 134096 (96); --write records brain/subEvadeShortDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeShort.mjs held --write          the HELD read on geometries 135001 to 135096 (96), flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeShortHeld.json exists
// THE QUESTION (brain/SUB_EVADE_SHORT_WIP.md): does league7100 with a SHORTER pingEvery (4.0, 6.0) or a slightly longer one (12.0) do better or worse than league7100 as it is against each of the fourteen boats that are not league7100? (The generic command is takeEvadePingReach.mjs; this file is the spec: the hunter, the values, the sets, the premise R0 and the forecasts.)
"use strict";
import { build, runIfMain } from "./takeEvadePingReach.mjs";

export const SPEC = Object.freeze({
    tool: "takeEvadeShort", devFile: "brain/subEvadeShortDev.json", heldFile: "brain/subEvadeShortHeld.json",
    sets: Object.freeze({ dev: Object.freeze({ first: 134001, count: 96 }), held: Object.freeze({ first: 135001, count: 96 }) }),
    hunters: Object.freeze(["league7100"]), values: Object.freeze([4.0, 6.0, 12.0]), r0: Object.freeze({ kind: "lead" }), common: Object.freeze([4.0, 6.0]), across: null, head: "SHORT", prefix: "RS",
    forecast: (out) => { const h = out.hunters.league7100; return { narrow4: h.reach[0].label === "NARROW", narrow6: h.reach[1].label === "NARROW", narrow12: h.reach[2].label === "NARROW", hurtsSomewhere: out.hurtsSomewhere, helps4Some: h.reach[0].n >= 1, hurts4Some: h.reach[0].hurts.length >= 1, commonEmpty: h.common.length === 0, own4Neutral: h.own[4].status === "NEUTRAL" }; },
    forecastLine: (q, v2) => { const yn = (b) => (b ? "yes" : "no"); return `NARROW at ${v2(4)} ${yn(q.narrow4)}, at ${v2(6)} ${yn(q.narrow6)}, at ${v2(12)} ${yn(q.narrow12)}, hurts somewhere ${yn(q.hurtsSomewhere)}, the effect of ${v2(4)} HELPS against some opponent ${yn(q.helps4Some)}, HURTS against some ${yn(q.hurts4Some)}, no common opponent ${yn(q.commonEmpty)}, OWN(${v2(4)}) NEUTRAL ${yn(q.own4Neutral)}`; },
});
const R = build(SPEC);
export const { SETS, DEV_FILE, HELD_FILE, HUNTERS, VALUES, matchupsOf, equalPair, fly, checksOf, rulesOf, reportLines, command } = R;
await runIfMain(import.meta.url, command);
