// WebGLEngine/tools/ship/flyCxPilotFile.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is tools/ship/flyCxPilotFile-selfcheck.mjs)
//
// THE WEIGHTS FILE OF THE STATEFUL FLY PILOT FOR THE SUB AQUARIUM (brain/TANK_PILOTS_WIP.md, design point 1): brain/pilotSubFlyCxWip.json, written from the `cx` record of rung 4a stage A (brain/flyCxStageA.jsonl) and from nothing else, and only if that record is what the
// tank can fly: it QUALIFIES against the autopilot, it has a champion, its weights are exactly the number brain/pilotSubCircuitState.mjs asks of the fly's heading loop (15 x 88 + 148 + 1 + 4 x 64 + 4 = 1,729), every weight is finite and no bigger than the wire allows (|w| <= 1000, ai-bridge/subAquariumCore.js),
// and its memory gain (sigma) is in [0, 1]. The file carries where it came from (the source file, the spec, the champion's seed, a sha256 of the weights) and the scores it earned, so nobody has to take the tank's word for what the pilot is.
//   node tools/ship/flyCxPilotFile.mjs            what it would write (a dry run)
//   node tools/ship/flyCxPilotFile.mjs --write    writes brain/pilotSubFlyCxWip.json
//   node tools/ship/flyCxPilotFile.mjs --check    exit 1 unless the committed file is exactly what the source record gives (the gate runs this: a changed source makes the file stale and red)
// Pure apart from the files it reads and writes. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as CS from "../../brain/pilotSubCircuitState.mjs";
import { readRecords } from "./trainSubCircuits.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const SOURCE = "brain/flyCxStageA.jsonl", CIRCUIT = "vendor/hemibrain/hemibrain-cx-heading-loop.json", OUT = "brain/pilotSubFlyCxWip.json";
export const CIRCUIT_NAME = "flycx", SPEC = "cx", MAX_W = 1000, AUDITS = Object.freeze(["audit", "safetyAudit", "reserve"]);
export const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");
const f4 = (v) => (Number.isFinite(v) ? v.toFixed(4) : "n/a");

/**
 * The file for the `cx` record among `records`, with the circuit the weights are for: { ok, problems: [why not], file (only when ok) }. Every reason it cannot be written is listed, not just the first.
 */
export function buildFile(records, circuit) {
    const problems = [], rec = (records || []).find((r) => r && r.spec === SPEC);
    if (!rec) return { ok: false, problems: [`no "${SPEC}" record in ${SOURCE}`] };
    if (rec.smoke) problems.push("the cx record is from a smoke run (a throwaway recipe on a few dives)");
    if (rec.qualifies !== true) problems.push(`the cx record does not qualify against the autopilot${Array.isArray(rec.reasons) && rec.reasons.length ? ` (${rec.reasons.join("; ")})` : ""}`);
    if (rec.champion === null || rec.champion === undefined) problems.push("the cx record has no champion (it was scored as its start)");
    let policy = null; try { policy = CS.createStatePolicy(circuit, CIRCUIT_NAME); } catch (e) { problems.push(`the circuit is not one the stateful pilot can be built on: ${String(e.message || e).slice(0, 160)}`); }
    const w = rec.weights;
    if (!Array.isArray(w)) problems.push("the cx record has no weights"); else {
        if (policy && w.length !== policy.WEIGHT_COUNT) problems.push(`the cx record has ${w.length} weights and the stateful pilot on this circuit takes ${policy.WEIGHT_COUNT}`);
        if (rec.weightCount !== w.length) problems.push(`the cx record says ${rec.weightCount} weights and holds ${w.length}`);
        const bad = w.findIndex((v) => !Number.isFinite(v) || Math.abs(v) > MAX_W);
        if (bad >= 0) problems.push(`weight ${bad} is not a finite number of at most ${MAX_W} in size`);
        if (policy && w.length === policy.WEIGHT_COUNT) { const s = w[policy.SIGMA_INDEX]; if (!(s >= 0 && s <= 1)) problems.push(`the memory gain (weight ${policy.SIGMA_INDEX}) is ${s}, outside [0, 1]`); }
    }
    const sc = rec.scores || {}, ch = sc.champion || {}, ap = sc.autopilot || {};
    for (const a of AUDITS) if (!Number.isFinite(ch[a] && ch[a].score) || !Number.isFinite(ap[a] && ap[a].score)) problems.push(`the ${a} score of the champion or of the autopilot is missing`);
    if (problems.length) return { ok: false, problems };
    const mech = rec.mechanism || {}, dark = mech.champion && mech.champion.dark, darkAp = mech.autopilot && mech.autopilot.dark;
    const file = {
        format: "swek-brain-v1", policy: "pilotSubCircuitState", circuit: CIRCUIT_NAME, features: policy.FEATURES, hidden: policy.HIDDEN, outputs: policy.OUTPUTS, weightCount: w.length, sigma: w[policy.SIGMA_INDEX],
        weights: w.slice(), weightsSha256: sha256(JSON.stringify(w)),
        source: { file: SOURCE, spec: rec.spec, family: rec.family, champion: rec.champion, recipe: rec.recipe, qualifies: true },
        audit: { champion: Object.fromEntries(AUDITS.map((a) => [a, ch[a].score])), autopilot: Object.fromEntries(AUDITS.map((a) => [a, ap[a].score])), darkHeadingError: Number.isFinite(dark) && Number.isFinite(darkAp) ? { champion: dark, autopilot: darkAp } : null },
        by: `the cx champion of rung 4a stage A (${SOURCE}): the real fly heading loop (${policy.HIDDEN} cells, ${policy.REC_EDGES} synapses, hemibrain central complex) as a RESERVOIR with a memory -- the recurrent weights are the count matrix scaled to singular value 1 and are NOT trained; training moved the ${policy.FEATURES} x ${policy.INPUT_CELLS} input weights, the cells' bias, the memory gain sigma, the readout and its bias -- found by a sparse (1+1)-ES from the autopilot's laws, champion seed ${rec.champion}; scores through the compass dropout: audit ${f4(ch.audit.score)}, safety audit ${f4(ch.safetyAudit.score)}, reserve ${f4(ch.reserve.score)} against the plain autopilot's ${f4(ap.audit.score)}, ${f4(ap.safetyAudit.score)}, ${f4(ap.reserve.score)}.`,
        limits: "KNOWN LIMITS, SAID PLAINLY: the gain over the autopilot is the recipe's generic gain (every circuit of the study gained about as much, random wirings included) and NOT a compass skill: this pilot does not integrate -- its heading error inside the dark windows is about the autopilot's (brain/SUBMARINE_WIP.md, rung 4a RESULT and the estimator studies). It is the autopilot's laws plus a learned residual with a short memory, flown in a tank that is not its task.",
    };
    return { ok: true, problems: [], file };
}
/** The text written to disk for a file object: one line of JSON and a newline (the weights make it long; a diff of two such files is a diff of the weights). */
export const serialize = (file) => JSON.stringify(file) + "\n";

function loadInputs(io) {
    const read = io.readFile || ((f) => fs.readFileSync(f, "utf8")), root = io.root || ENG;
    return { records: readRecords(read(path.join(root, SOURCE))), circuit: (() => { const j = JSON.parse(read(path.join(root, CIRCUIT))); return { neurons: j.neurons, edges: j.edges, io: j.io }; })(), read, root };
}
/** The command as a function: returns the exit code (0 fine, 1 a refusal or a stale file, 2 a bad argument). `io` is for the gate: { out, err, readFile, writeFile, root }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const flags = argv.filter((a) => a.startsWith("--")), stray = argv.filter((a) => !a.startsWith("--")), unknown = flags.filter((a) => a !== "--write" && a !== "--check");
    if (stray.length || unknown.length || (flags.includes("--write") && flags.includes("--check"))) { err(`flyCxPilotFile: ${stray.length ? `unexpected argument ${JSON.stringify(stray[0])}` : unknown.length ? `unknown option ${JSON.stringify(unknown[0])}` : "--write and --check do not go together"} (use --write or --check, or neither for a dry run)`); return 2; }
    let inp; try { inp = loadInputs(io); } catch (e) { err("flyCxPilotFile: cannot read the inputs: " + String(e.message || e).slice(0, 200)); return 1; }
    const built = buildFile(inp.records, inp.circuit);
    if (!built.ok) { for (const p of built.problems) err("flyCxPilotFile: " + p); return 1; }
    const text = serialize(built.file), target = path.join(inp.root, OUT);
    if (flags.includes("--check")) {
        let have = null; try { have = inp.read(target); } catch (e) { /* missing */ }
        if (have === null) { err(`flyCxPilotFile: ${OUT} does not exist (run with --write)`); return 1; }
        if (have !== text) { err(`flyCxPilotFile: ${OUT} is not what ${SOURCE} gives (run with --write)`); return 1; }
        out(`flyCxPilotFile: ${OUT} is current (${built.file.weightCount} weights, champion seed ${built.file.source.champion}, sha256 ${built.file.weightsSha256.slice(0, 12)})`); return 0;
    }
    if (flags.includes("--write")) { writeFile(target, text); out(`flyCxPilotFile: wrote ${OUT} (${built.file.weightCount} weights, champion seed ${built.file.source.champion}, sha256 ${built.file.weightsSha256.slice(0, 12)})`); return 0; }
    out(`flyCxPilotFile: dry run -- would write ${OUT}: ${built.file.weightCount} weights, champion seed ${built.file.source.champion}, memory gain ${built.file.sigma.toFixed(3)}, audit ${f4(built.file.audit.champion.audit)} against the autopilot's ${f4(built.file.audit.autopilot.audit)}; nothing written`);
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
