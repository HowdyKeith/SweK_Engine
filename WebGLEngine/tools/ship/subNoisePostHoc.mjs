// WebGLEngine/tools/ship/subNoisePostHoc.mjs -- UNNUMBERED (export-free on purpose: it is a command, run after the HELD14 record exists)
//
// THE POST HOC READS OF FOLLOW-UP 14 (brain/SUB_FIELD_NAV_WIP.md, "RESULT OF FOLLOW-UP 14"): none of it registered, none of it moves the verdict. The paired gained and lost of every arm are printed by
// `node tools/ship/subNoiseStudy.mjs --set held14` itself (and are in the note); this prints what the table does not hold:
//   node tools/ship/subNoisePostHoc.mjs      reads brain/subNoiseHeld14.jsonl and prints, in react-none (the world where the schedule is right): the collisions by kind, the exits and the path over the chord
//   of the nominal arm and the filter; the scenarios where kf@3 lost to and won against the nominal arm; and the median velocity error of the difference and the filter in each behaviour.
// Pure: reads a file, prints. No clock, no Math.random.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rows = fs.readFileSync(path.join(ENG, "brain/subNoiseHeld14.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const by = (b, a) => rows.filter((r) => r.behaviour === b && r.arm === a);
// collisions by the speed of the ship struck is not recorded; collisions by kind and exits by arm in react-none, the world where the schedule is right
for (const arm of ["any+predict+edge+yield", "kf@1.5", "kf@3", "kf@6", "diff@3"]) { const g = by("react-none", arm); console.log("react-none", arm.padEnd(24), "collided ship", g.filter((r) => r.status === "collided" && r.hit === "ship").length, "berg", g.filter((r) => r.status === "collided" && r.hit === "berg").length, "left", g.filter((r) => r.status === "left").length, "median path/chord", (() => { const x = g.filter((r) => r.reached).map((r) => r.path / r.chord).sort((a, b) => a - b); return x.length ? x[x.length >> 1].toFixed(3) : "n/a"; })()); }
// where kf@3 loses to nominal in react-none: the seeds, and what the nominal arm did
const nom = new Map(by("react-none", "any+predict+edge+yield").map((r) => [r.seed, r])), kf = by("react-none", "kf@3");
const lost = kf.filter((r) => !r.reached && nom.get(r.seed).reached), won = kf.filter((r) => r.reached && !nom.get(r.seed).reached);
console.log("react-none kf@3 vs nominal: lost on", lost.length, "(", lost.map((r) => r.status + "/" + r.hit).join(","), ") gained on", won.length, "(", won.map((r) => r.status).join(","), ")");
// the median ship speed of the scenario for the lost ones
console.log("shipSpeed (the scenario's) of the lost:", lost.map((r) => r.shipSpeed).join(", "), "; of the gained:", won.map((r) => r.shipSpeed).join(", "));
// velocity error by arm and behaviour (median of medians) to compare worlds
for (const b of ["react-none", "react-turn", "react-stop"]) console.log(b, ["diff@3", "kf@3"].map((a) => a + " " + (() => { const x = by(b, a).map((r) => r.velErrMedian).sort((p, q) => p - q); return x[x.length >> 1].toFixed(2); })()).join("   "));
