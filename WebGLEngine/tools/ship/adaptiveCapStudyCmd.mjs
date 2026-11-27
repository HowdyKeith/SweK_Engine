#!/usr/bin/env node
// WebGLEngine/tools/ship/adaptiveCapStudyCmd.mjs -- flies the space doctrine's ROUND 4 (brain/SPACE_DOCTRINE_WIP.md). Export-free on purpose: the library is tools/ship/adaptiveCapStudy.mjs, held by its gate.
//
//   node tools/ship/adaptiveCapStudyCmd.mjs dev --part 1/4      DEV, a quarter of the scenarios: the three arms under the four presets (writes dev-1of4.json once)
//   node tools/ship/adaptiveCapStudyCmd.mjs dev-read            DEV's three checks (writes dev-report.json); nothing is chosen
//   node tools/ship/adaptiveCapStudyCmd.mjs held --part 1/4     HELD, a quarter (writes held-1of4.json ONCE); refused until DEV passed
//   node tools/ship/adaptiveCapStudyCmd.mjs held-read           the verdict (writes held-report.json)
// --dir DIR overrides brain/rig-results/adaptive-cap. A part file is written the moment it exists and is never flown again.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "./adaptiveCapStudy.mjs";
import { parseOrExit } from "./cliArgs.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = parseOrExit("adaptive-cap", { values: { "--part": "string", "--dir": "path" }, flags: [], positional: true });
const mode = cli.rest[0], arg = (k) => cli.values[k] ?? null;
const DIR = path.resolve(arg("--dir") || path.join(ENG, "brain", "rig-results", "adaptive-cap"));
const out = (n) => path.join(DIR, n), readJson = (n) => JSON.parse(fs.readFileSync(out(n), "utf8"));
const write = (n, o) => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(out(n), JSON.stringify(o, null, 1) + "\n"); console.log(`[adaptive-cap] wrote ${path.relative(ENG, out(n)).replace(/\\/g, "/")}`); };
const refuse = (n) => { if (fs.existsSync(out(n))) { console.error(`[adaptive-cap] REFUSED: ${path.relative(ENG, out(n)).replace(/\\/g, "/")} exists -- a registered set is flown once`); process.exit(2); } };
const fmt = (x, d = 3) => (x === null || x === undefined ? "-" : typeof x === "number" ? (Number.isFinite(x) ? x.toFixed(d) : String(x)) : String(x));
function partArg() {
    const m = /^(\d+)\/(\d+)$/.exec(arg("--part") || "1/1"), k = m ? +m[1] : 0, K = m ? +m[2] : 0;
    if (!m || K < 1 || k < 1 || k > K) { console.error("[adaptive-cap] --part must be k/K with 1 <= k <= K"); process.exit(2); }
    return { k, K };
}
function fly(set, seeds) {
    const { k, K } = partArg(), name = `${set}-${k}of${K}.json`; refuse(name);
    const t0 = Date.now(), rows = [];
    A.scenariosOf(seeds).forEach(({ seed, kind }, i) => { if (i % K !== k - 1) return; for (const preset of A.PRESETS) for (const arm of A.ARMS) rows.push(A.flyOne({ seed, kind, preset, arm })); });
    write(name, { round: "space doctrine ROUND 4", set, part: [k, K], seeds: [seeds[0], seeds.at(-1)], seconds: (Date.now() - t0) / 1000, rows });
}
function gather(set) {
    const names = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => new RegExp(`^${set}-\\d+of\\d+\\.json$`).test(f)) : [];
    const Ks = new Set(names.map((f) => +/of(\d+)/.exec(f)[1]));
    if (Ks.size !== 1) { console.error(`[adaptive-cap] ${set} is missing or mixes part counts (${names.join(", ") || "none"})`); process.exit(2); }
    const K = [...Ks][0], want = Array.from({ length: K }, (_, i) => `${set}-${i + 1}of${K}.json`), missing = want.filter((f) => !names.includes(f));
    if (missing.length) { console.error(`[adaptive-cap] ${set} is incomplete: ${missing.join(", ")}`); process.exit(2); }
    const order = new Map(A.scenariosOf(set === "dev" ? A.DEV_SEEDS : A.HELD_SEEDS).map((s, i) => [`${s.seed}/${s.kind}`, i]));
    return want.flatMap((f) => readJson(f).rows).sort((a, b) => order.get(`${a.seed}/${a.kind}`) - order.get(`${b.seed}/${b.kind}`));
}

if (mode === "dev") fly("dev", A.DEV_SEEDS);
else if (mode === "dev-read") {
    const rows = gather("dev"), c = A.devChecks(rows);
    console.log(`[adaptive-cap] DEV ${A.DEV_SEEDS[0]}-${A.DEV_SEEDS.at(-1)}: ${rows.length} fights; checks only`);
    console.log(`  check 1 THE LATCH FIRES (latched fights ${JSON.stringify(c.latchFires.byPreset)}; ${c.latchFires.badLatch} latched against the rule): ${c.latchFires.ok ? "PASS" : "FAIL"}`);
    console.log(`  check 2 THE CAP IS APPLIED (${c.capApplied.overCap} decisions at or over the cap in force, ${c.capApplied.notCut} with thrust; ${c.capApplied.unlatched} unlatched ADAPT fights equal FIXED12's: ${c.capApplied.sameAsFixed}): ${c.capApplied.ok ? "PASS" : "FAIL"}`);
    console.log(`  check 3 EVERY FIGHT ENDS (${c.allEnd.n} fights): ${c.allEnd.ok ? "PASS" : "FAIL"}`);
    const H = A.readHeld(rows);
    for (const p of A.PRESETS) console.log(`  reported, moving nothing: ${p.padEnd(7)} mean R FIXED12 ${fmt(H.means[`${p} FIXED12`].R, 1)}, FIXED20 ${fmt(H.means[`${p} FIXED20`].R, 1)}, ADAPT ${fmt(H.means[`${p} ADAPT`].R, 1)} (latched in ${H.means[`${p} ADAPT`].latched})`);
    const allOk = Object.values(c).every((x) => x.ok);
    console.log(`[adaptive-cap] DEV: ${allOk ? "ALL CHECKS PASS -- commit the DEV files and this report, then fly HELD once" : "A CHECK FAILED -- HELD stays unflown"}`);
    write("dev-report.json", { checks: c, allOk });
} else if (mode === "held") {
    if (!fs.existsSync(out("dev-report.json")) || !readJson("dev-report.json").allOk) { console.error("[adaptive-cap] REFUSED: DEV has not passed its checks (dev-report.json)"); process.exit(2); }
    fly("held", A.HELD_SEEDS);
} else if (mode === "held-read") {
    const rows = gather("held"), H = A.readHeld(rows), allEnd = rows.every((r) => r.over && r.t <= 120 + 1e-9);
    const want = JSON.stringify(A.scenariosOf(A.HELD_SEEDS)), same = A.PRESETS.every((p) => A.ARMS.every((a) => JSON.stringify(rows.filter((r) => r.preset === p && r.arm === a).map((r) => ({ seed: r.seed, kind: r.kind }))) === want));
    const v = (x) => `${x.verdict} (${x.wins} to ${x.losses}, tied ${x.ties}; p ${fmt(x.p, 4)}; median ${fmt(x.median, 1)})`;
    console.log(`[adaptive-cap] HELD ${A.HELD_SEEDS[0]}-${A.HELD_SEEDS.at(-1)}: SAME SCENARIOS ${same ? "PASS" : "FAIL"}; EVERY FIGHT ENDS ${allEnd ? "PASS" : "FAIL"}`);
    for (const p of A.PRESETS) {
        const m = (a) => H.means[`${p} ${a}`];
        console.log(`  ${p.padEnd(7)} ADAPT vs FIXED12 ${v(H.pairs[p].vs12)}; ADAPT vs FIXED20 ${v(H.pairs[p].vs20)}; FIXED20 vs FIXED12 ${v(H.pairs[p].f20vs12)}`);
        console.log(`          mean R FIXED12 ${fmt(m("FIXED12").R, 1)}, FIXED20 ${fmt(m("FIXED20").R, 1)}, ADAPT ${fmt(m("ADAPT").R, 1)}; ships destroyed ${m("FIXED12").shipDead}/${m("FIXED20").shipDead}/${m("ADAPT").shipDead}; ADAPT latched in ${m("ADAPT").latched} of ${m("ADAPT").n} (mean ${fmt(m("ADAPT").latchT, 1)} s, ${fmt(m("ADAPT").latchLost, 2)} lost)`);
    }
    const notWeighed = !same || !allEnd;
    console.log(`[adaptive-cap] BOTTOM LINE: ${notWeighed ? "NOT WEIGHED (a check failed)" : H.bottom}`);
    write("held-report.json", { ...H, checks: { sameScenarios: same, allEnd }, notWeighed });
} else {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 8).join("\n"));
    process.exit(mode ? 2 : 0);
}
