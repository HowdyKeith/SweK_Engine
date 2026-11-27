// WebGLEngine/tools/ship/lightingCost-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/lightingCost-selfcheck.mjs      (about a minute: two pages' variants on SwiftShader, small)
//
// THE RIG'S LIGHTING-COST REPORT, HELD (tools/lightingCost.mjs; Keith, 2026-11-27: "lets do 1 through 6", 3 being "time the new lighting on your rig"). What it measures can
// only be read on the rig's graphics card; what is held here is that it measures the right thing and says what it measured on:
//
//   1  THE ARITHMETIC   costOf: a variant's cost is its card total less its base's; a base-less row costs its total; a row with no card times costs nothing claimed
//   2  THE VARIANTS     every page and query the tool names is one the page understands (each page's flags are in its source), each base is a variant timed before it
//   3  ON SWIFTSHADER   the WebGL2 lights page and the lit sea, small: refused without --allow-software (nothing written); with it, a report that says SOFTWARE first, every
//                       row timed by the page's own GPU timer with its passes labelled (shadows, lit or water, fog where there is fog), fog rows costing more than their base
//                       -- 2026-11-27 (the publish merge): THAT LAST CLAUSE IS NOW REPORTED, NOT ASSERTED. It compares two page loads' totals, and on SwiftShader
//                       one pass reads 131 ms in one load and 243 ms in the next (gl.lit's and gl.soft's lit pass), while the sea's water pass runs 40-50 ms CHEAPER
//                       with the haze on than without: a fog row came out below its base on two runs of three, red on this branch as it arrived. What the haze adds on
//                       a card is the rig's reading (the tool's own header says it can only be read there); held here is that the fog pass is timed, above zero.
//                       tools/lightingCost.mjs now averages each label over every frame the settle publishes (it read one frame) and waits for a page that has none.
//                       SABOTAGED, restored byte for byte: L1 the tool dropping the fog label -> 2 red; L2 the tool reading nothing it sampled -> 2 red.
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as LC from "../lightingCost.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
console.log("lightingCost-selfcheck -- the rig's report of what the new lighting costs on the card\n");

console.log("1. THE ARITHMETIC");
await section(async () => {
    const rows = [{ id: "a", base: null, feature: "A", gpu: { shadows: 1, lit: 2 }, frameMs: 16 }, { id: "b", base: "a", feature: "B", gpu: { shadows: 1, lit: 2, fog: 1.5 }, frameMs: 17 }, { id: "c", base: "b", feature: "C", gpu: null, frameMs: 20 }];
    const c = LC.costOf(rows);
    ok("!! a base-less row costs its total; a row costs its total less its base's, and the ratio; a row with no card times claims no cost", c[0].totalMs === 3 && c[0].addsMs === 3 && c[1].addsMs === 1.5 && c[1].overBase === 1.5 && c[2].totalMs === null && c[2].addsMs === null, JSON.stringify(c.map((x) => [x.totalMs, x.addsMs, x.overBase])));
    const t = LC.tableLines({ software: true, adapters: ["SwiftShader"], rows, costs: c });
    ok("!! a software report says so on its first line, and a row with no card times says why", /SOFTWARE RENDERER/.test(t[0]) && t.some((l) => /no card times/.test(l)), t[0].slice(0, 80));
});

console.log("2. THE VARIANTS");
await section(async () => {
    const ids = LC.CONFIGS.map((c) => c.id), seen = new Set(); let badBase = [], badFlag = [], badPage = [];
    for (const c of LC.CONFIGS) {
        if (c.base && !seen.has(c.base)) badBase.push(c.id); seen.add(c.id);
        const f = path.join(ENG, c.page); if (!fs.existsSync(f) || !LC.STATE_VAR[c.page]) { badPage.push(c.id); continue; }
        const src = fs.readFileSync(f, "utf8");
        for (const [k] of [...c.query.matchAll(/&([a-z]+)=/g)].map((m) => [m[1]])) if (!new RegExp(`get\\(\\s*"${k}"\\s*\\)`).test(src)) badFlag.push(`${c.id}:${k}`);
        if (!src.includes(LC.STATE_VAR[c.page])) badPage.push(c.id);
    }
    ok("!! every variant's page exists and reports under the state the tool reads; every flag in its query is one the page reads; every base is timed before it", !badBase.length && !badFlag.length && !badPage.length && new Set(ids).size === ids.length, `${ids.length} variants${badBase.length ? "; bases after: " + badBase : ""}${badFlag.length ? "; flags unread: " + badFlag : ""}${badPage.length ? "; pages: " + badPage : ""}`);
});

console.log("3. ON SWIFTSHADER");
await section(async () => {
    const env = process.env.SWEK_LAUNCH_ARGS; process.env.SWEK_LAUNCH_ARGS = "--use-angle=swiftshader --enable-unsafe-swiftshader --enable-unsafe-webgpu";
    const out = path.join(os.tmpdir(), `lightingCost-selfcheck-${process.pid}.json`), quiet = { log: () => {} };
    try {
        const refused = await LC.run(["--only", "gl.lit", "--size", "320x200", "--seconds", "0.6", "--out", out], quiet);
        ok("!! WITHOUT --allow-software A SOFTWARE RUN IS REFUSED AND WRITES NOTHING", refused.code === 2 && refused.written === null && !fs.existsSync(out) && refused.report.software === true, `code ${refused.code}`);
        const lights = await LC.run(["--only", "lights-demo", "--size", "320x200", "--seconds", "0.8", "--allow-software", "--out", out], quiet), r = JSON.parse(fs.readFileSync(out, "utf8")); fs.unlinkSync(out);
        const labelled = r.rows.every((x) => x.gpu && x.gpu.shadows > 0 && x.gpu.lit > 0 && (!/fog=1/.test(x.query) || x.gpu.fog > 0) && !x.error);
        const fogDear = r.costs.filter((c) => c.id === "gl.fog")[0];
        ok("!! THE WEBGL2 LIGHTS PAGE: five variants, the report SOFTWARE first, each timed by the page's own GPU timer under shadows, lit and (with fog) fog; the fog pass timed above zero (what it adds over its base is REPORTED: see section 3's note)", lights.code === 0 && r.software === true && r.rows.length === 5 && labelled && fogDear && Number.isFinite(fogDear.addsMs) && /SOFTWARE/.test(LC.tableLines(r)[0]), `gl.fog adds ${fogDear && fogDear.addsMs?.toFixed(1)} ms over gl.lit (reported); ${r.rows.map((x) => `${x.id} ${JSON.stringify(x.gpu)}`).join("; ").slice(0, 300)}`);
        const sea = await LC.run(["--only", "ocean-default", "--size", "320x200", "--seconds", "0.8", "--allow-software", "--out", out], quiet), s = JSON.parse(fs.readFileSync(out, "utf8")); fs.unlinkSync(out);
        const plain = s.rows.find((x) => x.id === "sea.plain"), litRows = s.rows.filter((x) => x.id !== "sea.plain");
        ok("!! THE SEA: the plain page timed as water and buoys alone; lit, the shadows too; with the haze, the fog -- the haze pass timed above zero (what it adds over the lit sea is REPORTED: see section 3's note)", sea.code === 0 && plain && plain.gpu && plain.gpu.water > 0 && !("shadows" in plain.gpu) && litRows.every((x) => x.gpu && x.gpu.shadows > 0 && (!/fog=1/.test(x.query) || x.gpu.fog > 0)) && Number.isFinite(s.costs.find((c) => c.id === "sea.fog").addsMs), `sea.fog adds ${s.costs.find((c) => c.id === "sea.fog").addsMs?.toFixed(1)} ms over sea.lit (reported); ` + s.rows.map((x) => `${x.id} ${JSON.stringify(x.gpu)}`).join("; ").slice(0, 300));
    } finally { if (env === undefined) delete process.env.SWEK_LAUNCH_ARGS; else process.env.SWEK_LAUNCH_ARGS = env; if (fs.existsSync(out)) fs.unlinkSync(out); }
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG (2026-11-27): 5 mutants of tools/lightingCost.mjs. ALL 5 RED -- a cost not less its base, software never refused, software never detected, the WebGL2
// timer's labels not read, a variant's query not applied.
