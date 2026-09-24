#!/usr/bin/env node
// WebGLEngine/tools/ship/genGateVerdicts-selfcheck.mjs -- v4704: the page's verdict table, graded against the records
// it summarises, and the page proven to READ it.
//
// *** A SUMMARY IS A CLAIM, SO EVERY LINE OF THIS ONE IS GRADED. *** render/genGateVerdicts.mjs says what six
// hypotheses came to. Each entry's numbers must appear in the closing it names; H4, H5 and H6 are re-derived from
// their committed result files through the same statistic that decided them; and the page is driven -- its option
// labels read, and a learned arm actually RUN -- so "the page tells the user" is observed rather than grepped.
// Run: node tools/ship/genGateVerdicts-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin } from "./webgpuHarness.mjs";
import { SWEEP_SINCE_V4297 as CLOSINGS } from "./gateSweep.mjs";
import { VERDICTS, ARM_HYPOTHESIS, ARC, verdictFor, armWeights, optionSuffix, readoutNote } from "../../render/genGateVerdicts.mjs";
import { declared, readDoc, RULE_KEYS, PREREG_H5, h4, h5 } from "./foldStats.mjs";
import { PREREG_H6, h6 } from "./genGateRule.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };
const J = (x) => JSON.stringify(x);
const res = (rel) => JSON.parse(fs.readFileSync(path.join(ENG, rel), "utf8"));

console.log("genGateVerdicts-selfcheck -- six hypotheses, what the page now says about them, and whether it is true\n");

console.log("1. *** EVERY ENTRY AGAINST THE CLOSING IT NAMES ***");
{
    ok("*** six hypotheses, H1 to H6, in the order they were measured ***",
       J(VERDICTS.map((v) => v.id)) === J(["H1", "H2", "H3", "H4", "H5", "H6"]) &&
       VERDICTS.every((v, i) => i === 0 || Number(v.round.slice(1)) > Number(VERDICTS[i - 1].round.slice(1))),
       VERDICTS.map((v) => `${v.id}@${v.round}`).join(" "));
    const bad = [];
    for (const v of VERDICTS) {
        const c = CLOSINGS[v.closing];
        if (!c) { bad.push(`${v.id}: no closing ${v.closing}`); continue; }
        if (c.at !== v.round) bad.push(`${v.id}: ${v.closing} is ${c.at}, not ${v.round}`);
        for (const n of v.numbers) { if (!c.verdict.includes(n)) bad.push(`${v.id}: ${n} not in ${v.closing}`); if (!v.evidence.includes(n)) bad.push(`${v.id}: ${n} not in its own evidence`); }
        if (!new RegExp(v.verdict.replace(" ", "\\s+"), "i").test(c.verdict)) bad.push(`${v.id}: "${v.verdict}" not in ${v.closing}`);
        if (!fs.existsSync(path.join(ENG, v.doc))) bad.push(`${v.id}: ${v.doc} missing`);
    }
    ok("*** each verdict, each number and each document is in the record it names -- the table cannot say more than the closings did ***",
       !bad.length, bad.length ? bad.join("; ") : `${VERDICTS.reduce((s, v) => s + v.numbers.length, 0)} numbers across six closings, six verdict words, six documents.`);
    const last = CLOSINGS[ARC.closing];
    ok("*** ARC names the closing that closed the arc, and that closing says the same thing ***",
       !!last && last.at === ARC.closedAt && /fitted or not/.test(last.verdict) && /transfer/.test(last.verdict) && /fitted or not/.test(ARC.finding),
       `${ARC.closing} @ ${ARC.closedAt}`);
}

console.log("\n2. *** H4, H5 AND H6 RE-DERIVED FROM THEIR RESULT FILES -- NOT COPIED ***");
{
    const R4 = res("tools/ship/genGate-folds7-result.json"), a = h4(R4.results, R4.meta, declared());
    ok("*** H4: not supported, 6 of 7 at 8/128, and the absolute set ahead on 5 of 7 -- recomputed ***",
       a.reportable && !a.supported && a.a.test.sign.up === 6 && a.a.test.sign.p === 8 / 128 && a.b.diffs.filter((x) => x < 0).length === 5,
       `sign ${a.a.test.sign.up}/7 p ${a.a.test.sign.p}; V2 behind V1 on ${a.b.diffs.filter((x) => x < 0).length} folds`);
    const R5 = res("tools/ship/genGate-absolute4-result.json"), b = h5(R5.results, R5.meta, declared(readDoc(PREREG_H5)));
    ok("*** H5: not supported, 4 of 7, mean -0.0386 -- recomputed ***",
       b.reportable && !b.supported && b.a.test.sign.up === 4 && b.a.test.t.mean.toFixed(4) === "-0.0386", `mean ${b.a.test.t.mean.toFixed(4)}`);
    const R6 = res("tools/ship/genGate-rule-result.json"), c = h6(R6.per, declared(readDoc(PREREG_H6), RULE_KEYS));
    const below = ["2", "4"].map((sp) => Object.values(R6.per[sp]).filter((x) => x.auc < 0.5).length);
    ok("*** H6: not supported, below chance on 5 of 7 at BOTH speeds, x2 mean -0.0797 -- recomputed ***",
       c.reportable && !c.supported && c.cells["2"].test.t.mean.toFixed(4) === "-0.0797" && J(below) === J([5, 5]),
       `x2 mean ${c.cells["2"].test.t.mean.toFixed(4)}; below chance ${below.join(" and ")}`);
}

console.log("\n3. *** THE ARMS, THE WEIGHTS, AND THE WORDS ***");
{
    const html = fs.readFileSync(path.join(ENG, "fsr.html"), "utf8");
    const m = /<select id="gengate">([\s\S]*?)<\/select>/.exec(html);
    const opts = m ? [...m[1].matchAll(/<option value="(\w+)">/g)].map((x) => x[1]) : [];
    const controls = ["off", "oracle", "never"];
    ok("*** every learned arm on the page has a hypothesis, and nothing else does -- both directions ***",
       J(opts.filter((o) => !controls.includes(o)).sort()) === J(Object.keys(ARM_HYPOTHESIS).sort()) && controls.every((c2) => opts.includes(c2)),
       `learned: ${Object.keys(ARM_HYPOTHESIS).join(", ")}; controls without one: ${controls.join(", ")}`);
    ok("*** each arm's weights file exists, and the controls load none ***",
       Object.keys(ARM_HYPOTHESIS).every((a2) => fs.existsSync(path.join(ENG, armWeights(a2)))) &&
       controls.every((c2) => throws(() => armWeights(c2), /not an arm that loads weights/)) && armWeights("device") === armWeights("cpu"),
       Object.keys(ARM_HYPOTHESIS).map((a2) => `${a2} -> ${armWeights(a2)}`).join(", "));
    // v4704 -- A WEIGHTS FILE IS GRADED BY ITS OWN PROVENANCE. The first draft checked only that each file existed,
    // and a sabotage giving H2 the H1 file passed: both exist. Each file's note cites the document that fixed its
    // training, and H2 -- which was about the threshold -- is the only one that carries a validation-chosen tau.
    const prov = VERDICTS.filter((v) => v.weights).map((v) => { const j = res(v.weights);
        return { id: v.id, cites: (j.note || "").includes(v.doc), tau: typeof j.tau === "number" }; });
    ok("*** each entry's weights file cites THAT entry's document, and only H2's carries the threshold H2 was about ***",
       prov.every((q) => q.cites) && prov.find((q) => q.id === "H2").tau && !prov.find((q) => q.id === "H1").tau,
       prov.map((q) => `${q.id}: cites its document ${q.cites}, tau ${q.tau}`).join("; "));
    const n = readoutNote("cpu2");
    ok("*** the readout sentence names the hypothesis, its verdict, its round, its evidence and its document -- and is EMPTY for off and the controls ***",
       n.includes("H2") && n.includes("REFUTED") && n.includes("v4693") && n.includes("0.4214") && n.includes("learned-calibration-preregistration.md") &&
       n.includes(ARC.finding) && controls.every((c2) => readoutNote(c2) === "" && optionSuffix(c2) === ""),
       "a control is not a hypothesis and must not be labelled as a refuted one.");
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
    await until(() => fno() === 0 && /engine:/.test(($("engine") || {}).textContent || ""), 180000);
    const labels = Object.fromEntries([...$("gengate").options].map((o) => [o.value, o.textContent]));
    // Which weights the arm ACTUALLY fetches: the page calls the global fetch at run time, so a spy on its window sees it.
    const W = ifr.contentWindow, fetched = [], f0 = W.fetch.bind(W);
    W.fetch = (u, ...rest) => { fetched.push(String(u)); return f0(u, ...rest); };
    for (const [id, v] of [["scene", "zone"], ["shading", "off"], ["reactive", "off"], ["camera", "objects"], ["slabspeed", "2"],
                           ["genfield", "block"], ["gensource", "presented"], ["genengine", "cpu"], ["gengate", "cpu"], ["genframe", "on"]]) { const e = $(id); if (e) e.value = v; }
    $("genframe").dispatchEvent(new Event("change"));
    await until(() => fno() === 0, 60000);
    $("run").click();
    await until(() => /GATE/.test(($("genstat") || {}).textContent || ""), 120000);
    $("run").click();
    return { labels, stat: ($("genstat") || {}).textContent || "", fetched: fetched.filter((u) => /genGate-weights/.test(u)) };
}` });
if (!r.ok) ok("the page ran", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 300)}`);
else {
    const { labels, stat, fetched } = r.result;
    ok("*** in the RUNNING page, every learned arm's label carries its verdict, and the controls carry none ***",
       Object.keys(ARM_HYPOTHESIS).every((a2) => labels[a2] && labels[a2].endsWith(optionSuffix(a2))) &&
       ["off", "oracle", "never"].every((c2) => labels[c2] && !/REFUTED|NOT SUPPORTED/.test(labels[c2])),
       `cpu: "...${(labels.cpu || "").slice(-40)}"`);
    ok("*** and with the cpu arm RUNNING, the readout the user sees says the arm is a refuted hypothesis kept as a record ***",
       stat.includes(readoutNote("cpu").trim()) && /GATE the CPU kept \d+ of \d+ blocks/.test(stat),
       stat.length ? `readout ends "...${stat.slice(-90)}"` : "no readout");
    ok("*** and the weights the running cpu arm FETCHED are the file its verdict names -- observed on the page's own fetch ***",
       fetched.length > 0 && fetched.every((u) => u.replace(/^\.\//, "") === armWeights("cpu")),
       `fetched ${fetched.join(", ") || "nothing"}; H1 names ${armWeights("cpu")}. A label and a load that disagreed would put one hypothesis's verdict on another's weights.`);
}

console.log(`\ngenGateVerdicts-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: whether any arm's verdict is RIGHT -- that is each measurement gate's job, and this one checks only " +
            "that the page repeats what they found and nothing more.");
process.exit(fails ? 1 : 0);
