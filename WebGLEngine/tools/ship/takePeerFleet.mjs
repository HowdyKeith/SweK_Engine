// WebGLEngine/tools/ship/takePeerFleet.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE COMMAND for brain/peerFleet.mjs: two folders of brain files peers exported, taken in and set against each other in a fleet action. Prints what was seated and what was refused, file by file, then the action. Writes nothing.
//
//     node tools/ship/takePeerFleet.mjs --a <folder> --b <folder>            # two fleets, each from the .json files of its folder (sorted by name)
//     node tools/ship/takePeerFleet.mjs --a <folder> --b rule                # one fleet against the hand rules' side (no network anywhere)
//       [--seeds 1-5]  [--ships 1]  [--escorts 0]                            # 20 pairs by default (four geometries x five seeds, each from both seats: 40 fights, about 20 s); pilots' brains fly only if there are escorts
//       [--helm-a face|broadside]  [--helm-b ...]                            # the helm RULE a side's helm brain corrects (or that stands alone)
//       [--gunners-a regular]  [--gunners-b ...]  [--no-cannon-a]  [--no-cannon-b]
//
// A file is refused, never fatal: text that is not JSON, a brain for another game, a wrong weight count, a duplicate. A folder with nothing a fleet can seat gives the hand rules' side and the report says so.
// *** NO EXPORTS ON PURPOSE: a command-line entry point. The library is what the gate holds (brain/peerFleet-selfcheck.mjs). ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import * as PF from "../../brain/peerFleet.mjs";

const argv = process.argv.slice(2), known = ["a", "b", "seeds", "ships", "escorts", "helm-a", "helm-b", "gunners-a", "gunners-b", "no-cannon-a", "no-cannon-b"], flags = ["no-cannon-a", "no-cannon-b"];
const bad = argv.filter((x) => x.startsWith("--") && !known.includes(x.slice(2))), val = (k, d = null) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; }, has = (k) => argv.includes("--" + k);
const die = (m) => { console.error("takePeerFleet: " + m); process.exit(2); };
if (bad.length) die(`unknown option ${bad.join(", ")} (known: ${known.map((k) => "--" + k).join(", ")})`);
if (!val("a") || !val("b")) die("it needs --a <folder> and --b <folder | rule>");
const seedsArg = val("seeds", "1-5"), m = /^(\d+)-(\d+)$/.exec(seedsArg), seeds = m ? Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, i) => Number(m[1]) + i) : seedsArg.split(",").map(Number);
if (!seeds.length || seeds.some((s) => !Number.isInteger(s) || s < 1)) die(`--seeds is a range (1-5) or a list (1,2,3) of whole numbers from 1 (got ${seedsArg})`);
const read = (dir) => {
    if (dir === "rule") return [];
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) die(`${dir} is not a folder`);
    return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json")).sort().map((f) => { try { return { name: f, text: fs.readFileSync(path.join(dir, f), "utf8") }; } catch (e) { return { name: f, text: null }; } });
};
const base = (s) => ({ helmRule: val("helm-" + s, "face"), gunners: val("gunners-" + s, "regular"), cannon: !has("no-cannon-" + s) });
let A, B;
try { A = PF.fleet(val("a") === "rule" ? "rule" : path.basename(path.resolve(val("a"))) || "A", read(val("a")), base("a")); B = PF.fleet(val("b") === "rule" ? "rule" : path.basename(path.resolve(val("b"))) || "B", read(val("b")), base("b")); } catch (e) { die(e.message); }
if (A.id === B.id) { A = { ...A, id: A.id + " (a)" }; B = { ...B, id: B.id + " (b)" }; }
const t0 = Date.now(), R = PF.action(A, B, { seeds, ships: Number(val("ships", 1)), escorts: Number(val("escorts", 0)) });
for (const l of PF.reportLines(A, B, R)) console.log(l);
console.log(`  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
