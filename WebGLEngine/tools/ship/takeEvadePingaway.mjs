// WebGLEngine/tools/ship/takeEvadePingaway.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_PINGAWAY_WIP.md, the gates tools/ship/takeEvadePingReach-selfcheck.mjs (the generic command) and tools/ship/takeEvadePingaway-selfcheck.mjs (this spec))
//   node tools/ship/takeEvadePingaway.mjs smoke                 the 88 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadePingaway.mjs dev  [--write]        the DEV read on geometries 136001 to 136096 (96); --write records brain/subEvadePingawayDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadePingaway.mjs held --write          the HELD read on geometries 137001 to 137096 (96), flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadePingawayHeld.json exists
// THE QUESTION (brain/SUB_EVADE_PINGAWAY_WIP.md): does league7001 with pingEvery 16.0 or 30.0 do better or worse than league7001 as it is, and exploit7204 with 16.0 or 30.0 than exploit7204 as it is, against each of the fourteen boats that are not itself? (The generic command is takeEvadePingReach.mjs; this file is the spec: the hunters, the values, the sets, the premise R0 and the forecasts.)
"use strict";
import { build, runIfMain } from "./takeEvadePingReach.mjs";

export const SPEC = Object.freeze({
    tool: "takeEvadePingaway", devFile: "brain/subEvadePingawayDev.json", heldFile: "brain/subEvadePingawayHeld.json",
    sets: Object.freeze({ dev: Object.freeze({ first: 136001, count: 96 }), held: Object.freeze({ first: 137001, count: 96 }) }),
    hunters: Object.freeze(["league7001", "exploit7204"]), values: Object.freeze([16.0, 30.0]), r0: Object.freeze({ kind: "own", value: 30.0 }), common: Object.freeze([16.0, 30.0]), across: 30.0, head: "PINGAWAY", prefix: "RP",
    forecast: (out) => { const l = out.hunters.league7001, e = out.hunters.exploit7204; return { narrow30L: l.reach[1].label === "NARROW", general30L: l.reach[1].label === "GENERAL", narrow30E: e.reach[1].label === "NARROW", narrow16L: l.reach[0].label === "NARROW", narrow16E: e.reach[0].label === "NARROW", hurtsSomewhere: out.hurtsSomewhere, helpsL7100: l.reach[1].helps.includes("league7100") || e.reach[1].helps.includes("league7100"), acrossEmpty: out.across.length === 0 }; },
    forecastLine: (q, v2) => { const yn = (b) => (b ? "yes" : "no"); return `league7001 NARROW at ${v2(30)} ${yn(q.narrow30L)}, GENERAL ${yn(q.general30L)}, exploit7204 NARROW at ${v2(30)} ${yn(q.narrow30E)}, league7001 NARROW at ${v2(16)} ${yn(q.narrow16L)}, exploit7204 NARROW at ${v2(16)} ${yn(q.narrow16E)}, hurts somewhere ${yn(q.hurtsSomewhere)}, the effect of ${v2(30)} HELPS against league7100 for some hunter ${yn(q.helpsL7100)}, no opponent helped at ${v2(30)} by both hunters ${yn(q.acrossEmpty)}`; },
});
const R = build(SPEC);
export const { SETS, DEV_FILE, HELD_FILE, HUNTERS, VALUES, matchupsOf, equalPair, fly, checksOf, rulesOf, reportLines, command } = R;
await runIfMain(import.meta.url, command);
