#!/usr/bin/env node
// WebGLEngine/tools/ship/frameVerdicts-selfcheck.mjs -- v4713: the page's frame-level verdict table, graded against
// the records it summarises, and the page proven to READ it.
//
// *** THE PAGE SAID FRAME GENERATION HAD NEVER RUN ON A PICTURE, THIRTY-ONE ROUNDS AFTER IT FIRST DID. *** fsr.html's
// OFF readout was written before v4681 and nothing read it against the record. render/frameVerdicts.mjs now says what
// H7-H10 came to, and this gate grades every line of it: each entry's numbers must appear in the closing it names and
// in its own evidence; each verdict is RE-DERIVED from its result file through the statistic that decided it, with
// the constants read from its document; every count and headroom figure is recomputed from the committed caches; and
// the page is DRIVEN -- both readouts and the option label read from the running page, not grepped from its source.
// Run: node tools/ship/frameVerdicts-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin } from "./webgpuHarness.mjs";
import { SWEEP_SINCE_V4297 as CLOSINGS } from "./gateSweep.mjs";
import { FRAME_VERDICTS, FRAME_MEASURED, FRAME_FIRST_RUN, FRAME_SCENE_COUNT, FRAME_ARC,
         frameVerdictFor, frameOptionSuffix, frameNote, frameOffNote } from "../../render/frameVerdicts.mjs";
import { declared, readDoc } from "./foldStats.mjs";
import { PREREG_H7, CACHE_H7, RESULT_H7, FRAME_KEYS, h7 } from "./frameGate.mjs";
import { PREREG_H8, CACHE_H8, RESULT_H8, h8 } from "./frameHoles.mjs";
import { PREREG_H9, CACHE_H9, RESULT_H9, HOLED_KEYS, h9 } from "./frameHoled.mjs";
import { PREREG_H10, CACHE_H10, RESULT_H10, VERT_KEYS, h10 } from "./frameVertical.mjs";
import { PREREG_H11, CACHE_H11, RESULT_H11, GAIN_KEYS, h11, cellOf } from "./frameGain.mjs";
import { PREREG_H12, CACHE_H12, RESULT_H12, REV_KEYS, reverse } from "./frameReverse.mjs";
import { PREREG_H14, CACHE_H14, RESULT_H14, SWAY_KEYS, h14 } from "./frameSway.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const J = (x) => JSON.stringify(x);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const res = (rel) => JSON.parse(fs.readFileSync(path.join(ENG, rel), "utf8"));
const gz = (rel) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, rel))).toString("utf8"));
const signed = (x, k = 3) => (x >= 0 ? "+" : "") + x.toFixed(k);
const rows = (o) => Array.isArray(o) ? o.length : Object.values(o).reduce((s, v) => s + rows(v), 0);
/** The verdict word a result earns: unanswerable first, then the test. */
// v4715 -- A HYPOTHESIS MISSING FROM THE TABLE IS A RED ROW, NOT A CRASH. Removing H11's entry threw on the next line
// that read its verdict; every per-hypothesis row now reads its entry through this, which cannot be undefined.
const entry = (id) => FRAME_VERDICTS.find((x) => x.id === id) || { id, verdict: "(absent from the table)", evidence: "", numbers: [] };
const word = (r) => !r.reportable ? "not reported" : r.supported ? "supported" : "not supported";

// Each hypothesis's runner, its document and its declared constants -- the table's `doc` must be the runner's own.
const RUN = {
    H7: { doc: PREREG_H7, cache: CACHE_H7, d: declared(readDoc(PREREG_H7), FRAME_KEYS) },
    H8: { doc: PREREG_H8, cache: CACHE_H8, d: declared(readDoc(PREREG_H8), FRAME_KEYS) },
    H9: { doc: PREREG_H9, cache: CACHE_H9, d: declared(readDoc(PREREG_H9), HOLED_KEYS) },
    H10: { doc: PREREG_H10, cache: CACHE_H10, d: declared(readDoc(PREREG_H10), VERT_KEYS) },
    H11: { doc: PREREG_H11, cache: CACHE_H11, d: declared(readDoc(PREREG_H11), GAIN_KEYS) },
    H12: { doc: PREREG_H12, cache: CACHE_H12, d: declared(readDoc(PREREG_H12), REV_KEYS) },
    // v4717 -- H13 is H12's document read on H12's frames: it has a runner and no cache of its own, so no frame is counted twice.
    H13: { doc: PREREG_H12, cache: null, d: declared(readDoc(PREREG_H12), REV_KEYS) },
    H14: { doc: PREREG_H14, cache: CACHE_H14, d: declared(readDoc(PREREG_H14), SWAY_KEYS) },
};

console.log(`frameVerdicts-selfcheck -- ${FRAME_VERDICTS.length} frame-level hypotheses, what the page says about them, and whether it is true\n`);

console.log("1. *** EVERY ENTRY AGAINST THE CLOSING IT NAMES ***");
{
    // v4717 -- "in the order measured" allows two hypotheses from one round (H12 and H13 share a document and a harvest).
    ok("*** H7 to H14, in the order they were measured -- and every one has a runner here ***",
       J(FRAME_VERDICTS.map((v) => v.id)) === J(["H7", "H8", "H9", "H10", "H11", "H12", "H13", "H14"]) && J(Object.keys(RUN)) === J(FRAME_VERDICTS.map((v) => v.id)) &&
       FRAME_VERDICTS.every((v, i) => i === 0 || Number(v.round.slice(1)) >= Number(FRAME_VERDICTS[i - 1].round.slice(1))),
       FRAME_VERDICTS.map((v) => `${v.id}@${v.round}`).join(" "));
    const bad = [];
    for (const v of FRAME_VERDICTS) {
        const c = CLOSINGS[v.closing];
        if (!c) { bad.push(`${v.id}: no closing ${v.closing}`); continue; }
        if (c.at !== v.round) bad.push(`${v.id}: ${v.closing} is ${c.at}, not ${v.round}`);
        for (const n of v.numbers) { if (!c.verdict.includes(n)) bad.push(`${v.id}: ${n} not in ${v.closing}`); if (!v.evidence.includes(n)) bad.push(`${v.id}: ${n} not in its own evidence`); }
        if (!new RegExp(`${v.id} IS ${v.verdict.toUpperCase().replace(" ", "\\s+")}`).test(c.verdict)) bad.push(`${v.id}: "${v.id} IS ${v.verdict.toUpperCase()}" not in ${v.closing}`);
        if (!RUN[v.id] || RUN[v.id].doc !== v.doc) bad.push(`${v.id}: ${v.doc} is not its runner's document`);
        if (!fs.existsSync(path.join(ENG, v.doc))) bad.push(`${v.id}: ${v.doc} missing`);
    }
    ok("*** each verdict, each number and each document is in the record it names -- the table cannot say more than the closings did ***",
       !bad.length, bad.length ? bad.join("; ") : `${FRAME_VERDICTS.reduce((s, v) => s + v.numbers.length, 0)} numbers across ${FRAME_VERDICTS.length} closings; each document is its runner's own PREREG constant.`);
    const arc = CLOSINGS[FRAME_ARC.closing], h = FRAME_ARC.headroom, hc = CLOSINGS[h.closing], fr = CLOSINGS[FRAME_FIRST_RUN.closing];
    // v4715 -- WIDENED from two hard-coded phrases to the table's own quotes: each must be in the closing it names and in
    // the finding, and the finding must be made of nothing else but them and the words joining them.
    const lc = (t) => t.toLowerCase(), badQ = FRAME_ARC.quotes.filter((q) => !CLOSINGS[q.closing] || !lc(CLOSINGS[q.closing].verdict).includes(lc(q.text)) || !lc(FRAME_ARC.finding).includes(lc(q.text)));
    ok("*** the arc's finding is made of quotes, each in the closing it names -- the last from the closing of the last hypothesis measured ***",
       !!arc && arc.at === FRAME_ARC.standsAt && arc.at === FRAME_VERDICTS.at(-1).round && !badQ.length &&
       FRAME_ARC.quotes.at(-1).closing === FRAME_ARC.closing && FRAME_ARC.quotes.length >= 3,
       badQ.length ? `not in their closings or the finding: ${badQ.map((q) => `"${q.text}" (${q.closing})`).join("; ")}` :
       `${FRAME_ARC.quotes.map((q) => q.closing).join(", ")}; stands at ${FRAME_ARC.closing} @ ${FRAME_ARC.standsAt}`);
    ok("*** the headroom's round, closing and numbers are v4706's, which is where the words 'HEADROOM EXISTS' were first used ***",
       !!hc && hc.at === h.round && /HEADROOM EXISTS/.test(hc.verdict) && Object.values(h.scenes).every((g) => hc.verdict.includes(g.replace("+", ""))) &&
       new RegExp(`At x${h.speed}, `).test(hc.verdict),
       `${h.closing} @ ${h.round}: ${Object.entries(h.scenes).map(([s, g]) => `${s} ${g}`).join(", ")} at x${h.speed}`);
    ok("*** 'since v4681' is the round whose closing says the page began calling the path ***",
       !!fr && fr.at === FRAME_FIRST_RUN.round && /CALLED NONE OF IT\. IT DOES NOW/.test(fr.verdict),
       `${FRAME_FIRST_RUN.closing} @ ${fr ? fr.at : "?"}`);
}

console.log("\n2. *** EACH VERDICT RE-DERIVED FROM ITS RESULT FILE, WITH ITS DOCUMENT'S CONSTANTS -- NOT COPIED ***");
const R7 = res(RESULT_H7), R8 = res(RESULT_H8), R9 = res(RESULT_H9), R10 = res(RESULT_H10);
{
    const a = h7(R7.per, RUN.H7.d), rep = { reportable: RUN.H7.d.speeds.every((sp) => a.cells[sp].within.reportable), supported: a.supported };
    const v = entry("H7");
    ok("*** H7: reading \"neither\", across rho 0.3214 (p 0.2488) at x2 and 0.0000 at x4 -- recomputed ***",
       word(rep) === v.verdict && a.reading === "neither" && a.cells["2"].across.rho.toFixed(4) === "0.3214" &&
       a.cells["2"].across.p.toFixed(4) === "0.2488" && a.cells["4"].across.rho.toFixed(4) === "0.0000" && v.evidence.includes(`"${a.reading}"`),
       `${word(rep)}, "${a.reading}", x2 rho ${a.cells["2"].across.rho.toFixed(4)} p ${a.cells["2"].across.p.toFixed(4)}, x4 rho ${a.cells["4"].across.rho.toFixed(4)}`);
    const b = h8(R8.per, RUN.H8.d), v8 = entry("H8");
    const x1 = b.cells["1"], x8 = b.cells["8"];
    ok("*** H8: not reported -- x1 has one usable scene in seven, and x8 cleared at sign p 0.0078 -- recomputed ***",
       word(b) === v8.verdict && !x1.reportable && x1.excluded.length === 6 && x8.reportable && x8.cleared && x8.test.sign.p.toFixed(4) === "0.0078",
       `${word(b)}; x1 ${x1.usable.length} usable, ${x1.excluded.length} holeless; x8 ${x8.test.sign.up}/7 p ${x8.test.sign.p.toFixed(4)}`);
    const c = h9(R9.per, RUN.H9.d), v9 = entry("H9");
    const chk = R9.per["1.5"].checker;
    ok("*** H9: not supported -- 3x clears, 1.5x misses at sign p 8/128 with checker the one against, its holed frames at +0.305 dB ***",
       word(c) === v9.verdict && c.cells["3"].cleared && !c.cells["1.5"].cleared && c.cells["1.5"].test.sign.p === 8 / 128 &&
       c.cells["1.5"].test.sign.down === 1 && chk.contrast < 0 && signed(chk.holedAdv) === "+0.305",
       `${word(c)}; 1.5x sign ${c.cells["1.5"].test.sign.up}/7, checker holed ${signed(chk.holedAdv)} vs clean ${signed(chk.cleanAdv)}`);
    const e = h10(R10.per, RUN.H10.d), v10 = entry("H10");
    ok("*** H10: not supported -- 5 of 7, t p 0.356, bars's and smooth's holed frames at +2.202 and +0.912 dB ***",
       word(e) === v10.verdict && e.cell.test.sign.up === 5 && e.cell.test.t.p.toFixed(3) === "0.356" &&
       signed(R10.per.bars.holedAdv) === "+2.202" && signed(R10.per.smooth.holedAdv) === "+0.912" && v10.evidence.includes(`${e.cell.test.sign.up} of 7`),
       `${word(e)}; sign ${e.cell.test.sign.up}/7, t p ${e.cell.test.t.p.toFixed(3)}; bars ${signed(R10.per.bars.holedAdv)}, smooth ${signed(R10.per.smooth.holedAdv)}`);
}

{
    const R11 = res(RESULT_H11), f = h11(R11.per, RUN.H11.d), v11 = entry("H11"), cs = RUN.H11.d.cells;
    const negs = cs.map((c) => RUN.H11.d.scenes.filter((s) => R11.per[c][s].rho < 0)), exc = cs.map((c) => RUN.H11.d.scenes.filter((s) => R11.per[c][s].rho > 0));
    const means = cs.map((c) => { const r = RUN.H11.d.scenes.map((s) => R11.per[c][s].rho); return r.reduce((a, b) => a + b, 0) / r.length; });
    ok("*** H11: not supported -- sign 1 of 7 in both cells, 12 of 14 scene-cells backwards, one exception shared by both geometries -- recomputed ***",
       word(f) === v11.verdict && cs.every((c) => f.cells[c].test.sign.up === 1) && negs.flat().length === 12 && J(exc[0]) === J(exc[1]) &&
       means.every((m) => v11.evidence.includes(m.toFixed(3))) && v11.evidence.includes(`${negs.flat().length} of ${cs.length * RUN.H11.d.scenes.length}`),
       `${word(f)}; ${cs.map((c, i) => `${c} sign ${f.cells[c].test.sign.up}/7, mean rho ${means[i].toFixed(3)}`).join("; ")}; the exception on both: ${exc[0].join(", ")}`);
}

{
    const R12 = res(RESULT_H12), d12 = RUN.H12.d, h = reverse(R12.per, d12), v12 = entry("H12"), v13 = entry("H13");
    const back = d12.cells.flatMap((c) => d12.scenes.filter((s) => d12.direction * R12.per[c][s].rho > 0)).length;
    const failing = d12.cells.filter((c) => !h.h12.cells[c].cleared);
    const against = failing.length === 1 ? d12.scenes.filter((s) => d12.direction * R12.per[failing[0]][s].rho < 0) : [];
    ok("*** H12: not supported -- 13 of 14 backwards, but one cell stops at 6 of 7 with zone against it, sign p 0.0625 -- recomputed ***",
       word(h.h12) === v12.verdict && back === 13 && failing.length === 1 && J(against) === J(["zone"]) &&
       h.h12.cells[failing[0]].test.sign.p === 8 / 128 && v12.evidence.includes(`${back} of ${d12.cells.length * d12.scenes.length}`),
       `${word(h.h12)}; ${back} backwards; ${failing.join("")} against: ${against.join(", ")}`);
    const share = d12.cells.map((c) => { const m = (k) => d12.scenes.reduce((a, s) => a + R12.per[c][s][k], 0) / d12.scenes.length;
        return Math.round(100 * (1 - m("partial") / m("rho"))); });
    ok("*** H13: not supported -- neither cell clears once the clock is partialled out, and the shares it took are recomputed ***",
       word(h.h13) === v13.verdict && d12.cells.every((c) => !h.h13.cells[c].cleared) && share.every((p) => v13.evidence.includes(`${p}%`)),
       `${word(h.h13)}; clock's share of the mean rho ${share.map((p) => p + "%").join(", ")}`);
}

{
    const R14 = res(RESULT_H14), d14 = RUN.H14.d, h = h14(R14.per, d14), v14 = entry("H14"), R11 = res(RESULT_H11);
    const back = d14.cells.flatMap((c) => d14.scenes.filter((s) => d14.direction * R14.per[c][s].rho > 0)).length;
    const m = (per) => d14.scenes.reduce((a, s) => a + per[s].rho, 0) / d14.scenes.length;
    const twin = (c) => R11.declared.cells.find((q) => { const a = cellOf(q), b = cellOf(c); return a.speed === b.speed && a.slabdir === b.slabdir; });
    const kept = d14.cells.map((c) => Math.round(100 * m(R14.per[c]) / m(R11.per[twin(c)])));
    const failing = d14.cells.filter((c) => !h.cells[c].cleared), against = failing.length === 1 ? d14.scenes.filter((s) => d14.direction * R14.per[failing[0]][s].rho < 0) : [];
    ok("*** H14: not supported -- 13 of 14 backwards at the recorded share of H11's strength, and bars the one scene against it -- recomputed ***",
       word(h) === v14.verdict && back === 13 && kept.every((k) => v14.evidence.includes(`${k}%`)) && J(against) === J(["bars"]) && v14.evidence.includes("bars"),
       `${word(h)}; ${back} backwards; kept ${kept.map((k) => k + "%").join(", ")} of H11; against: ${against.join(", ")}`);
}

console.log("\n3. *** EVERY COUNT AND THE HEADROOM, RECOMPUTED FROM THE CACHES ***");
{
    const counted = Object.fromEntries(Object.entries(RUN).filter(([, r]) => r.cache).map(([id, r]) => [id, rows(gz(r.cache))]));
    ok("*** the frames each hypothesis stands on are the rows in its committed cache ***",
       J(counted) === J(FRAME_MEASURED), `${Object.entries(counted).map(([id, n]) => `${id} ${n}`).join(", ")}; the page says ${Object.values(FRAME_MEASURED).reduce((s, n) => s + n, 0)}`);
    const scenes = Object.values(RUN).map((r) => r.d.scenes), union = new Set(scenes.flat());
    ok("*** every hypothesis declared the same scenes, and that many is what the page says ***",
       scenes.every((s) => s.length === FRAME_SCENE_COUNT) && union.size === FRAME_SCENE_COUNT, `${[...union].join(", ")}`);
    const h = FRAME_ARC.headroom, at = gz(CACHE_H7)[h.speed];
    const gain = Object.fromEntries(Object.entries(at).map(([s, r]) => {
        const g = mean(r.map((q) => q.genDb)), f = mean(r.map((q) => q.cfDb)), o = mean(r.map((q) => Math.max(q.genDb, q.cfDb)));
        return [s, o - Math.max(g, f)]; }));
    const top = Object.entries(gain).sort((p, q) => q[1] - p[1]).slice(0, Object.keys(h.scenes).length).map(([s]) => s);
    ok("*** the headroom is the frame oracle over the better fixed policy, recomputed -- and the scenes named are the LARGEST, not chosen ***",
       Object.entries(h.scenes).every(([s, g]) => gain[s] !== undefined && signed(gain[s]) === g) && J(top.sort()) === J(Object.keys(h.scenes).sort()),
       `x${h.speed}: ${Object.entries(gain).map(([s, g]) => `${s} ${signed(g)}`).join(", ")}`);
    // v4719 -- WIDENED FROM ONE OPTION TO EVERY ONE. Each verdict that labels a page option must label the value its own document
    // declared -- H10 the slab direction, H14 the slab path -- and each select's DEFAULT, the arm every earlier figure is, carries none.
    const DECLARED_OPT = { H10: ["slabdir", RUN.H10.d.slabdir], H14: ["slabpath", RUN.H14.d.path] };
    const withOpt = FRAME_VERDICTS.filter((v) => v.option);
    const optBad = withOpt.filter((v) => !DECLARED_OPT[v.id] || v.option.select !== DECLARED_OPT[v.id][0] || v.option.value !== DECLARED_OPT[v.id][1] ||
        frameVerdictFor(v.option.select, v.option.value) !== v);
    ok("*** every option that carries a verdict is the one that verdict's document declared, and the defaults carry none ***",
       J(withOpt.map((v) => v.id)) === J(Object.keys(DECLARED_OPT)) && !optBad.length && frameOptionSuffix("slabdir", "x") === "" && frameOptionSuffix("slabpath", "linear") === "",
       withOpt.map((v) => `${v.option.select}=${v.option.value}${frameOptionSuffix(v.option.select, v.option.value)}`).join("; "));
}

console.log("\n4. *** THE PAGE READS IT -- DRIVEN, NOT GREPPED ***");
const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 900000, args: {}, script: `async () => {
    const ifr = document.createElement("iframe");
    ifr.style.width = "1200px"; ifr.style.height = "900px"; ifr.src = "/fsr.html";
    document.body.appendChild(ifr);
    await new Promise((res) => { ifr.onload = res; });
    const d = ifr.contentDocument, $ = (id) => d.getElementById(id);
    const until = async (fn, ms) => { const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch {} await new Promise(r2 => setTimeout(r2, 40)); } return false; };
    const fno = () => { const m = /frame (\\d+)/.exec((($("metric") || {}).textContent || "")); return m ? Number(m[1]) : -1; };
    const stat = () => ($("genstat") || {}).textContent || "";
    await until(() => fno() === 0 && /engine:/.test(($("engine") || {}).textContent || ""), 180000);
    const labels = Object.fromEntries([...$("slabdir").options].map((o) => [o.value, o.textContent]));
    const pathLabels = Object.fromEntries([...$("slabpath").options].map((o) => [o.value, o.textContent]));
    for (const [id, v] of [["scene", "zone"], ["shading", "off"], ["reactive", "off"], ["camera", "objects"], ["slabspeed", "2"],
                           ["genfield", "block"], ["gensource", "presented"], ["genengine", "cpu"], ["gengate", "off"], ["genframe", "off"]]) { const e = $(id); if (e) e.value = v; }
    $("scene").dispatchEvent(new Event("change"));
    await until(() => fno() === 0, 60000);
    $("run").click();
    await until(() => /frame generation \\[OFF/.test(stat()), 120000);
    const off = stat();
    $("genframe").value = "on";
    await until(() => /frame generation \\[ON/.test(stat()), 120000);
    $("run").click();
    return { labels, pathLabels, off, on: stat() };
}` });
if (!r.ok) ok("the page ran", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 300)}`);
else {
    const { labels, pathLabels, off, on } = r.result;
    ok("*** and the sway path's label carries H14's verdict, while the linear default carries none ***",
       !!pathLabels.sway && pathLabels.sway.endsWith(frameOptionSuffix("slabpath", "sway")) && frameOptionSuffix("slabpath", "sway") !== "" &&
       !!pathLabels.linear && !/SUPPORTED|REPORTED/.test(pathLabels.linear), `sway: "...${(pathLabels.sway || "").slice(-45)}"`);
    ok("*** in the RUNNING page, the vertical slab's label carries H10's verdict and the default carries none ***",
       !!labels.z && labels.z.endsWith(frameOptionSuffix("slabdir", "z")) && !!labels.x && !/SUPPORTED|REPORTED/.test(labels.x),
       `z: "...${(labels.z || "").slice(-45)}"`);
    ok("*** with generation OFF, the readout says what the path has done -- and no longer that it never ran ***",
       off.includes(frameOffNote()) && !/never run|ever run on a picture/.test(off),
       off ? `"...${off.slice(-120)}"` : "no readout");
    ok("*** with generation ON, the readout the user sees ends its per-frame figures with what predicting them has come to ***",
       on.includes(frameNote().trim()) && /motion compensation is worth [+-]\d+\.\d\d dB here/.test(on),
       on ? `"...${on.slice(-110)}"` : "no readout");
}

console.log(`\nframeVerdicts-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: whether any verdict is RIGHT -- that is each measurement gate's job, and this one checks only " +
            "that the page repeats what they found and nothing more.");
process.exit(fails ? 1 : 0);
