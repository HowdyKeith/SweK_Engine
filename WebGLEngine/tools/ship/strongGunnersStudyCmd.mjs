#!/usr/bin/env node
// WebGLEngine/tools/ship/strongGunnersStudyCmd.mjs -- flies the space doctrine's ROUND 3 (brain/SPACE_DOCTRINE_WIP.md). Export-free on purpose: the library is tools/ship/strongGunnersStudy.mjs, held by its gate.
//
//   node tools/ship/strongGunnersStudyCmd.mjs dev --part 1/4      DEV, a quarter of the scenarios: arm D and every grid cap, both presets (writes dev-1of4.json once)
//   node tools/ship/strongGunnersStudyCmd.mjs dev-read            choose CAP_STRONG, run DEV's checks at it (writes dev-report.json); then commit the cap in the library BY HAND with the report
//   node tools/ship/strongGunnersStudyCmd.mjs held --part 1/4     HELD, a quarter: D, C at CAP_STRONG and C at 12, both presets (writes held-1of4.json ONCE); refused until DEV passed AND the library holds its cap
//   node tools/ship/strongGunnersStudyCmd.mjs held-read           the verdict (writes held-report.json)
// --dir DIR overrides brain/rig-results/strong-gunners. A part file is written the moment it exists and is never flown again.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as G from "./strongGunnersStudy.mjs";
import * as S from "./spaceDoctrineStudy.mjs";
import { parseOrExit } from "./cliArgs.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = parseOrExit("strong-gunners", { values: { "--part": "string", "--dir": "path" }, flags: [], positional: true });
const mode = cli.rest[0], arg = (k) => cli.values[k] ?? null;
const DIR = path.resolve(arg("--dir") || path.join(ENG, "brain", "rig-results", "strong-gunners"));
const out = (n) => path.join(DIR, n), readJson = (n) => JSON.parse(fs.readFileSync(out(n), "utf8"));
const write = (n, o) => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(out(n), JSON.stringify(o, null, 1) + "\n"); console.log(`[strong-gunners] wrote ${path.relative(ENG, out(n)).replace(/\\/g, "/")}`); };
const refuse = (n) => { if (fs.existsSync(out(n))) { console.error(`[strong-gunners] REFUSED: ${path.relative(ENG, out(n)).replace(/\\/g, "/")} exists -- a registered set is flown once`); process.exit(2); } };
const fmt = (x, d = 3) => (x === null || x === undefined ? "-" : typeof x === "number" ? (Number.isFinite(x) ? x.toFixed(d) : String(x)) : String(x));
function partArg() {
    const m = /^(\d+)\/(\d+)$/.exec(arg("--part") || "1/1"), k = m ? +m[1] : 0, K = m ? +m[2] : 0;
    if (!m || K < 1 || k < 1 || k > K) { console.error("[strong-gunners] --part must be k/K with 1 <= k <= K"); process.exit(2); }
    return { k, K };
}
function fly(set, seeds, arms) {
    const { k, K } = partArg(), name = `${set}-${k}of${K}.json`; refuse(name);
    const t0 = Date.now(), rows = [];
    G.scenariosOf(seeds).forEach(({ seed, kind }, i) => { if (i % K !== k - 1) return; for (const preset of G.PRESETS) for (const cap of arms) rows.push(S.flyOne({ seed, kind, preset, cap, probe: cap !== null })); });
    write(name, { round: "space doctrine ROUND 3", set, part: [k, K], arms: arms.map((a) => (a === null ? "D" : a)), seeds: [seeds[0], seeds.at(-1)], seconds: (Date.now() - t0) / 1000, rows });
}
function gather(set) {
    const names = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => new RegExp(`^${set}-\\d+of\\d+\\.json$`).test(f)) : [];
    const Ks = new Set(names.map((f) => +/of(\d+)/.exec(f)[1]));
    if (Ks.size !== 1) { console.error(`[strong-gunners] ${set} is missing or mixes part counts (${names.join(", ") || "none"})`); process.exit(2); }
    const K = [...Ks][0], want = Array.from({ length: K }, (_, i) => `${set}-${i + 1}of${K}.json`), missing = want.filter((f) => !names.includes(f));
    if (missing.length) { console.error(`[strong-gunners] ${set} is incomplete: ${missing.join(", ")}`); process.exit(2); }
    const order = new Map(G.scenariosOf(set === "dev" ? G.DEV_SEEDS : G.HELD_SEEDS).map((s, i) => [`${s.seed}/${s.kind}`, i]));
    return want.flatMap((f) => readJson(f).rows).sort((a, b) => order.get(`${a.seed}/${a.kind}`) - order.get(`${b.seed}/${b.kind}`));
}
const heldArms = () => [null, G.CAP_STRONG, ...(G.CAP_STRONG === G.FIRST_CAP ? [] : [G.FIRST_CAP])];

if (mode === "dev") fly("dev", G.DEV_SEEDS, [null, ...G.GRID]);
else if (mode === "dev-read") {
    const rows = gather("dev"), { cap, means } = G.chooseCap(rows), c = G.devChecks(rows, cap);
    console.log(`[strong-gunners] DEV ${G.DEV_SEEDS[0]}-${G.DEV_SEEDS.at(-1)}, ace and perfect: mean R by cap (doctrine ${fmt(rows.filter((r) => r.cap === "D").reduce((a, r) => a + r.R, 0) / rows.filter((r) => r.cap === "D").length, 2)})`);
    for (const m of means) console.log(`  cap ${String(m.cap).padStart(2)}  n ${m.n}  mean R ${fmt(m.meanR, 2)}  mean strafe-seconds ${fmt(m.meanStrafeS, 2)}${m.cap === cap ? "   <- CHOSEN" : ""}`);
    console.log(`  check 2 SAME FOE (${c.sameFoe.probed} probed fights, ${c.sameFoe.calls} decisions): ${c.sameFoe.ok ? "PASS" : "FAIL"}`);
    console.log(`  check 3 THE CAP IS APPLIED at ${cap}: ${c.capApplied.overCap} decisions at or over it, ${c.capApplied.notCut} with thrust; doctrine peak ${fmt(c.capApplied.doctrinePeak, 2)} > ${cap + S.DOCTRINE_MARGIN}: ${c.capApplied.ok ? "PASS" : "FAIL"}`);
    console.log(`  check 6 EVERY FIGHT ENDS (${c.allEnd.n} fights): ${c.allEnd.ok ? "PASS" : "FAIL"}`);
    const allOk = c.sameFoe.ok && c.capApplied.ok && c.allEnd.ok;
    console.log(`[strong-gunners] DEV: ${allOk ? `ALL CHECKS PASS -- commit CAP_STRONG = ${cap} in tools/ship/strongGunnersStudy.mjs with this report, then fly HELD once` : "A CHECK FAILED -- NOT WEIGHED; HELD stays unflown"}`);
    write("dev-report.json", { cap, means, checks: c, allOk });
} else if (mode === "held") {
    if (!fs.existsSync(out("dev-report.json")) || !readJson("dev-report.json").allOk) { console.error("[strong-gunners] REFUSED: DEV has not passed its checks (dev-report.json)"); process.exit(2); }
    if (G.CAP_STRONG === null || readJson("dev-report.json").cap !== G.CAP_STRONG) { console.error(`[strong-gunners] REFUSED: the library's CAP_STRONG (${G.CAP_STRONG}) is not DEV's choice (${readJson("dev-report.json").cap}) -- commit it first`); process.exit(2); }
    fly("held", G.HELD_SEEDS, heldArms());
} else if (mode === "held-read") {
    const rows = gather("held"), cap = G.CAP_STRONG, H = G.readHeld(rows, cap), allEnd = rows.every((r) => r.over && r.t <= S.SECONDS + 1e-9);
    const want = JSON.stringify(G.scenariosOf(G.HELD_SEEDS)), same = G.PRESETS.every((p) => heldArms().every((a) => JSON.stringify(rows.filter((r) => r.preset === p && r.cap === (a === null ? "D" : a)).map((r) => ({ seed: r.seed, kind: r.kind }))) === want));
    const v = (x) => `${x.verdict}: the cap better in ${x.wins}, worse in ${x.losses}, tied ${x.ties}; p ${fmt(x.p, 4)}; median ${fmt(x.median, 2)}`;
    console.log(`[strong-gunners] HELD ${G.HELD_SEEDS[0]}-${G.HELD_SEEDS.at(-1)} at CAP_STRONG ${cap}: SAME SCENARIOS ${same ? "PASS" : "FAIL"}; EVERY FIGHT ENDS ${allEnd ? "PASS" : "FAIL"}`);
    for (const p of G.PRESETS) {
        console.log(`  ${p.padEnd(7)} V1 R  ${v(H.v1[p])}`);
        console.log(`  ${p.padEnd(7)} V2 strafe-seconds  ${v(H.v2[p])}`);
        for (const a of ["D", cap, G.FIRST_CAP]) { const m = H.means[`${p} ${a}`]; if (m) console.log(`          ${String(a).padStart(2)}: mean R ${fmt(m.R, 2)} (R > 0 in ${m.withR} of ${m.n}), strafe-seconds ${fmt(m.strafeS, 2)}, passes ${fmt(m.passes, 2)}, fight ends ${fmt(m.t, 1)} s, peak closing ${fmt(m.peakClosing, 1)}`); }
        console.log(`          the first question, cap 12: R ${v(H.first[p].R)}; strafe-seconds ${v(H.first[p].strafeS)}`);
    }
    const notWeighed = !same || !allEnd;
    console.log(`[strong-gunners] BOTTOM LINE: ${notWeighed ? "NOT WEIGHED (a check failed)" : H.bottom}`);
    console.log(`[strong-gunners] THE FIRST QUESTION: ${notWeighed ? "NOT WEIGHED" : H.firstAnswer}`);
    write("held-report.json", { ...H, checks: { sameScenarios: same, allEnd }, notWeighed });
} else {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 8).join("\n"));
    process.exit(mode ? 2 : 0);
}
