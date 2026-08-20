// Self-check: a mission active at save time reloads verbatim and still completes. Mirrors es-missions-selfcheck's fixture.
import { parseES } from "../esParse.js";
import { createConditionStore } from "../esConditions.js";
import { createEsMissionRunner } from "../esMissions.js";
let pass = 0, fail = 0; const ok = (n, c) => c ? (pass++, console.log("  ok:", n)) : (fail++, console.log("  FAIL:", n));

const uni = { source: "endless-sky", govts: {}, systems: [
  { id: 1, name: "Aye", x: 0, y: 0, links: [2], spobs: [] },
  { id: 2, name: "Bee", x: 10, y: 0, links: [1], spobs: [] } ], systemById: {}, spobs: {}, ships: [] };
uni.systemById = { 1: uni.systems[0], 2: uni.systems[1] };
const pA = { id: 101, name: "Aleph", govt: 0, landable: true, attributes: [], _systemId: 1, _systemName: "Aye" };
const pB = { id: 102, name: "Beth", govt: 0, landable: true, attributes: [], _systemId: 2, _systemName: "Bee" };
uni.systems[0].spobs = [pA]; uni.systems[1].spobs = [pB]; uni.spobs = { 101: pA, 102: pB };
const root = parseES([
  'mission "Run"', '\tjob', '\tsource "Aleph"', '\tdestination "Beth"', '\tcargo "Food" 5',
  '\tto offer', '\t\thas "ready"',
  '\ton accept', '\t\t"Run: took" = 1',
  '\ton complete', '\t\tpayment 1000',
].join("\n"));
uni.esMissions = root.children.filter((c) => c.tokens[0] === "mission");

// --- session 1: accept the mission, then "save" ---
const store1 = createConditionStore({ conditions: {}, credits: 0, system: 1 }, uni);
const run1 = createEsMissionRunner(uni, store1, {});
store1.set("ready", 1);
const m = run1.available("Aleph", "Aye", pA, { board: "job" }).find((x) => x.tokens[1] === "Run");
run1.offer(m); run1.accept(m);
ok("session1: mission active + cargo booked", store1.get("Run: active") === 1 && store1.get("cargo: Food") === 5 && run1.active().length === 1);
const activeSnap = run1.snapshotActive();
const condSnap = store1.snapshot();
ok("snapshotActive captured dest + cargo", activeSnap.length === 1 && activeSnap[0].name === "Run" && activeSnap[0].dest && activeSnap[0].dest.systemId === 2 && activeSnap[0].cargo === 5);

// --- session 2: fresh runner from the saved conditions, then restoreActive (the reload) ---
const store2 = createConditionStore({ conditions: { ...condSnap }, credits: store1.get("credits"), system: 1 }, uni);
const run2 = createEsMissionRunner(uni, store2, {});
ok("before restore: fresh runner has NO in-flight mission (the bug)", run2.active().length === 0);
const n = run2.restoreActive(activeSnap);
ok("restoreActive rebuilt the in-flight mission", n === 1 && run2.active().length === 1 && run2.active()[0].name === "Run" && run2.active()[0].dest.systemId === 2);
// the bulletproof proof: arriving at the saved destination completes the reloaded mission
ok("no complete at wrong planet after reload", run2.onArrive(101, 1).length === 0 && store2.get("Run: done") === 0);
run2.onArrive(102, 2);
ok("RELOADED mission completes at its destination + pays", store2.get("Run: done") === 1 && store2.get("credits") === 1000);

console.log(fail === 0 ? `\nPASS (${pass}/${pass}) — mid-mission save is bulletproof` : `\nFAIL (${fail} failed)`);
process.exit(fail ? 1 : 0);
