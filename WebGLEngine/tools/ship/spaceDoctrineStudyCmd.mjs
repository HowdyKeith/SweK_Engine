#!/usr/bin/env node
// WebGLEngine/tools/ship/spaceDoctrineStudyCmd.mjs -- flies the space approach doctrine round (brain/SPACE_DOCTRINE_WIP.md).
// Export-free on purpose: the library is tools/ship/spaceDoctrineStudy.mjs, held by its gate.
//
//   node tools/ship/spaceDoctrineStudyCmd.mjs dev --preset regular        DEV: arm D and every grid cap, one preset (writes dev-<preset>.json once)
//   node tools/ship/spaceDoctrineStudyCmd.mjs dev-read                    merge DEV, choose CAP, run checks 1-3 and 6 (writes dev-report.json)
//   node tools/ship/spaceDoctrineStudyCmd.mjs held --preset regular       HELD89 at CAP_CHOSEN, one preset (writes held-<preset>.json ONCE)
//   node tools/ship/spaceDoctrineStudyCmd.mjs held --network              HELD89, green sight + the shipped MLP (reported; held-green-mlp.json)
//   node tools/ship/spaceDoctrineStudyCmd.mjs held-read                   the verdict (writes held-report.json)
// --dir DIR overrides brain/rig-results/space-doctrine. Every flight file is written the moment it exists, and an existing one
// is never flown again.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "./spaceDoctrineStudy.mjs";
import * as MLP from "../../brain/seatGunnerMlp.mjs";
import { parseOrExit } from "./cliArgs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
// v4930: through cliArgs.parseOrExit -- an option the command does not know is refused (exit 2) before anything is flown, never ignored on the way past
const cli = parseOrExit("space-doctrine", { values: { "--preset": "string", "--dir": "path" }, flags: ["--network"], positional: true });
const mode = cli.rest[0], arg = (k) => cli.values[k] ?? null;
const DIR = path.resolve(arg("--dir") || path.join(ENG, "brain", "rig-results", "space-doctrine"));
const out = (name) => path.join(DIR, name);
const readJson = (name) => JSON.parse(fs.readFileSync(out(name), "utf8"));
const write = (name, obj) => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(out(name), JSON.stringify(obj, null, 1) + "\n"); console.log(`[space-doctrine] wrote ${path.relative(ENG, out(name))}`); };
const refuse = (name) => { if (fs.existsSync(out(name))) { console.error(`[space-doctrine] REFUSED: ${path.relative(ENG, out(name))} exists -- a registered set is flown once`); process.exit(2); } };
const fmt = (x, d = 3) => (x === null || x === undefined ? "-" : typeof x === "number" ? (Number.isFinite(x) ? x.toFixed(d) : String(x)) : String(x));

function presetArg() {
    const p = arg("--preset");
    if (!S.PRESETS.includes(p)) { console.error(`[space-doctrine] --preset must be one of ${S.PRESETS.join(", ")}`); process.exit(2); }
    return p;
}

if (mode === "dev") {
    const preset = presetArg(), name = `dev-${preset}.json`; refuse(name);
    const t0 = Date.now(), rows = [];
    for (const { seed, kind } of S.scenariosOf(S.DEV_SEEDS)) {
        rows.push(S.flyOne({ seed, kind, preset }));
        for (const cap of S.CAP_GRID) rows.push(S.flyOne({ seed, kind, preset, cap, probe: true }));
    }
    const identity = S.scenariosOf(S.IDENTITY_SEEDS).map(({ seed, kind }) => ({ seed, kind, same: S.tallyOf({ seed, kind, preset }) === S.tallyOf({ seed, kind, preset, cap: Infinity }) }));
    write(name, { round: "space-approach-doctrine", set: "DEV", preset, seeds: [S.DEV_SEEDS[0], S.DEV_SEEDS.at(-1)], grid: S.CAP_GRID, seconds: (Date.now() - t0) / 1000, identity, rows });
} else if (mode === "dev-read") {
    const files = S.PRESETS.map((p) => `dev-${p}.json`), missing = files.filter((f) => !fs.existsSync(out(f)));
    if (missing.length) { console.error(`[space-doctrine] DEV is incomplete: ${missing.join(", ")}`); process.exit(2); }
    const all = files.map(readJson), rows = all.flatMap((f) => f.rows);
    const { cap, means } = S.chooseCap(rows), checks = S.devChecks(rows, cap);
    const identity = all.flatMap((f) => f.identity.map((x) => ({ ...x, preset: f.preset })));
    const identityOk = identity.length === S.IDENTITY_SEEDS.length * S.KINDS.length * S.PRESETS.length && identity.every((x) => x.same);
    console.log("[space-doctrine] DEV: mean R by cap over " + rows.filter((r) => r.cap === "D").length + " scenario-presets (arm D mean R " + fmt(rows.filter((r) => r.cap === "D").reduce((a, r) => a + r.R, 0) / rows.filter((r) => r.cap === "D").length, 1) + ")");
    for (const m of means) console.log(`  cap ${String(m.cap).padStart(2)}  n ${m.n}  mean R ${fmt(m.meanR, 1)}${m.cap === cap ? "   <- CHOSEN" : ""}`);
    console.log(`  check 1 IDENTITY (cap Infinity == no pilot, ${identity.length} tallies): ${identityOk ? "PASS" : "FAIL"}`);
    console.log(`  check 2 SAME FOE (${checks.sameFoe.probed} probed fights, ${checks.sameFoe.calls} decisions): ${checks.sameFoe.ok ? "PASS" : "FAIL"}`);
    console.log(`  check 3 THE CAP HOLDS at ${cap}: C peak ${fmt(checks.capHolds.cPeak, 2)} <= ${cap + S.CAP_SLACK}, doctrine peak ${fmt(checks.capHolds.doctrinePeak, 2)} > ${cap + S.DOCTRINE_MARGIN}: ${checks.capHolds.ok ? "PASS" : "FAIL"}`);
    console.log(`  check 6 EVERY FIGHT ENDS by 120 s (${checks.allEnd.n} fights): ${checks.allEnd.ok ? "PASS" : "FAIL"}`);
    write("dev-report.json", { cap, means, identity: { ok: identityOk, n: identity.length }, checks, cpuSeconds: all.reduce((a, f) => a + f.seconds, 0) });
} else if (mode === "held") {
    if (S.CAP_CHOSEN === null) { console.error("[space-doctrine] REFUSED: CAP_CHOSEN is null -- fly and read DEV, then commit the cap in spaceDoctrineStudy.mjs and the note, before any HELD89 seed"); process.exit(2); }
    const net = cli.flags.has("--network"), preset = net ? "green" : presetArg(), name = net ? "held-green-mlp.json" : `held-${preset}.json`; refuse(name);
    const network = net ? S.networkOf(MLP, JSON.parse(fs.readFileSync(path.join(ENG, S.MLP_WEIGHTS), "utf8"))) : null;
    const t0 = Date.now(), rows = [];
    for (const { seed, kind } of S.scenariosOf(S.HELD89_SEEDS)) {
        rows.push(S.flyOne({ seed, kind, preset, network }));
        rows.push(S.flyOne({ seed, kind, preset, cap: S.CAP_CHOSEN, network }));
    }
    write(name, { round: "space-approach-doctrine", set: "HELD89", preset, network: net, cap: S.CAP_CHOSEN, seeds: [S.HELD89_SEEDS[0], S.HELD89_SEEDS.at(-1)], seconds: (Date.now() - t0) / 1000, rows });
} else if (mode === "held-read") {
    const files = S.PRESETS.map((p) => `held-${p}.json`), missing = files.filter((f) => !fs.existsSync(out(f)));
    if (missing.length) { console.error(`[space-doctrine] HELD89 is incomplete: ${missing.join(", ")}`); process.exit(2); }
    const all = files.map(readJson), net = fs.existsSync(out("held-green-mlp.json")) ? readJson("held-green-mlp.json") : null;
    const caps = new Set([...all, ...(net ? [net] : [])].map((f) => f.cap));
    if (caps.size !== 1 || !caps.has(S.CAP_CHOSEN)) { console.error(`[space-doctrine] REFUSED: the files were flown at caps ${[...caps].join(", ")}, the library says ${S.CAP_CHOSEN}`); process.exit(2); }
    const rows = [...all.flatMap((f) => f.rows), ...(net ? net.rows : [])];
    const sameScenarios = all.every((f) => { const want = JSON.stringify(S.scenariosOf(S.HELD89_SEEDS)); const pick = (a) => JSON.stringify(f.rows.filter((r) => r.cap === a).map((r) => ({ seed: r.seed, kind: r.kind }))); return pick("D") === want && pick(S.CAP_CHOSEN) === want; });
    const allEnd = rows.every((r) => r.over && r.t <= S.SECONDS + 1e-9);
    const H = S.readHeld(rows, S.CAP_CHOSEN);
    console.log(`[space-doctrine] HELD89 at CAP ${S.CAP_CHOSEN}: check 5 SAME SCENARIOS ${sameScenarios ? "PASS" : "FAIL"}; check 6 EVERY FIGHT ENDS ${allEnd ? "PASS" : "FAIL"}`);
    for (const p of S.PRESETS) {
        const v = H.byPreset[p], r = v.readings;
        console.log(`  ${p.padEnd(8)} ${v.verdict.padEnd(19)} C wins ${v.wins}, loses ${v.losses}, ties ${v.ties}; p ${fmt(v.p, 4)}; median R_C - R_D ${fmt(v.median, 1)}`);
        console.log(`           ship destroyed C ${r.C.shipDestroyed}/240, D ${r.D.shipDestroyed}/240; losses C ${r.C.losses}, D ${r.D.losses} (C fewer in ${r.fewerLosses.gained}, more in ${r.fewerLosses.lost}, p ${fmt(r.fewerLosses.p, 4)}); DPSS median C ${fmt(r.dpss.medianC, 2)} D ${fmt(r.dpss.medianD, 2)} over ${r.dpss.n}; peak closing C ${fmt(r.C.peakClosing, 1)} D ${fmt(r.D.peakClosing, 1)}`);
    }
    if (H.network) console.log(`  green+MLP (reported) ${H.network.verdict}; C kills the ship in ${(100 * H.network.shipKilledByC).toFixed(1)}% of scenarios`);
    const notWeighed = !sameScenarios || !allEnd;
    console.log(`[space-doctrine] OVERALL: ${notWeighed ? "NOT WEIGHED (a check failed)" : H.overall}${H.harmful ? "   HARMFUL" : ""}`);
    write("held-report.json", { ...H, checks: { sameScenarios, allEnd }, notWeighed });
} else {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 12).join("\n"));
    process.exit(mode ? 2 : 0);
}
