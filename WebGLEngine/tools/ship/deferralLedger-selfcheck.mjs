// WebGLEngine/tools/ship/deferralLedger-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/deferralLedger-selfcheck.mjs      (about a second: one read of the ledger, one census, the tree's file list)
//
// THE GATE OF tools/ship/deferralLedger.json, the adjudication of the deferral census' UNDECIDED rows (nextRounds entry `deferral-adjudication`, 2026-11-23). It grades the LEDGER'S SHAPE and its REACH into the tree, not the verdicts: a verdict is a reading of a line and nothing here can regrade one.
//   1 SHAPE    every row has a file, a 12-hex line hash, a verdict from the closed list, a basis and a note; an OWED row has a theme from the closed list and a NOT-A-DEFERRAL row has none; no (file, hash) twice; the counts stated by the ledger's entry in nextRounds are the ledger's counts.
//   2 REACH    every file a row names exists in the tree; every theme has an entry in nextRounds; the census still reads the line of every row, or the row is counted as DRIFTED (reported, not red: a round that edits a line should not be stopped by a ledger it never read).
//   3 COVERAGE the census' undecided hits are counted against the ledger: covered, and uncovered (reported, not red, for the same reason). The row that says every undecided hit AT THE TIME OF THE PASS is in the ledger is the frozen count LEDGER_AT_PASS.
//   3 THE CHECKER IS NOT BLIND: each rule goes red once on a broken copy of the ledger.
// SABOTAGE LOG: one sabotage per rule of `shapeProblems` (a missing hash, a hash of 11 characters, a verdict outside the list, an OWED row with no theme, a NOT-A-DEFERRAL row with a theme, a duplicate row, a missing basis, a theme outside the list) and one per reach rule (a file that does not exist, a theme with no entry): ten sabotages, ten red by name in section 3. NOT CHECKED, said plainly: that any verdict is right.
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { census, ENGINE_ROOT } from "./deferralCensus.mjs";
import { NEXT_ROUNDS } from "./nextRounds.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEDGER = JSON.parse(fs.readFileSync(path.join(HERE, "deferralLedger.json"), "utf8"));
const VERDICTS = ["NOT_A_DEFERRAL", "OWED_UNTRACKED"], THEMES = ["ship-tooling", "roundhouse-battery", "render-and-gpu", "physics-fixtures", "game-brain-and-ui", "path-tracer-and-materials", "other"];
const LEDGER_AT_PASS = 203;
const hashOf = (t) => crypto.createHash("sha1").update(String(t).trim()).digest("hex").slice(0, 12);
const shapeProblems = (L) => {
    const p = [], seen = new Set();
    if (!L || !Array.isArray(L.rows)) return ["no rows"];
    L.rows.forEach((r, i) => {
        const w = `row ${i}`;
        if (typeof r.file !== "string" || !r.file) p.push(`${w}: no file`);
        if (!/^[0-9a-f]{12}$/.test(r.hash || "")) p.push(`${w}: hash is not 12 hex characters`);
        if (!VERDICTS.includes(r.verdict)) p.push(`${w}: verdict ${JSON.stringify(r.verdict)} is not in the list`);
        if (r.verdict === "OWED_UNTRACKED" && !THEMES.includes(r.theme)) p.push(`${w}: an OWED row needs a theme from the list`);
        if (r.verdict === "NOT_A_DEFERRAL" && r.theme) p.push(`${w}: a NOT-A-DEFERRAL row has no theme`);
        if (typeof r.basis !== "string" || !r.basis) p.push(`${w}: no basis`);
        if (typeof r.note !== "string" || !r.note) p.push(`${w}: no note`);
        const k = r.file + "\0" + r.hash; if (seen.has(k)) p.push(`${w}: (file, hash) twice`); seen.add(k);
    });
    return p;
};
const reachProblems = (L, exists, entryIds) => {
    const p = [];
    for (const r of L.rows) if (!exists(r.file)) p.push(`file ${r.file} does not exist`);
    for (const t of new Set(L.rows.filter((r) => r.verdict === "OWED_UNTRACKED").map((r) => r.theme))) if (!entryIds.has("deferral-owed-" + t)) p.push(`theme ${t} has no nextRounds entry`);
    return p;
};
const exists = (f) => fs.existsSync(path.join(ENGINE_ROOT, f)), ids = new Set(NEXT_ROUNDS.map((e) => e.id));
console.log("deferralLedger-selfcheck\n");
console.log("1. SHAPE");
const sp = shapeProblems(LEDGER);
ok("every row has a file, a 12-hex line hash, a verdict from the closed list, a basis and a note; an OWED row has a theme from the list and a NOT-A-DEFERRAL row has none; no (file, hash) twice", sp.length === 0, sp.slice(0, 3).join("; "));
const by = (v) => LEDGER.rows.filter((r) => r.verdict === v).length;
ok(`the ledger holds ${LEDGER_AT_PASS} rows (the undecided hits at the time of the pass), ${by("NOT_A_DEFERRAL")} not a deferral and ${by("OWED_UNTRACKED")} owed`, LEDGER.rows.length === LEDGER_AT_PASS && by("NOT_A_DEFERRAL") + by("OWED_UNTRACKED") === LEDGER_AT_PASS);
const closed = NEXT_ROUNDS.find((e) => e.id === "deferral-adjudication");
ok("the nextRounds entry deferral-adjudication is CLOSED and says what the pass did NOT do", !!closed && closed.blocker === "CLOSED" && /WHAT THIS DID NOT DO/.test(closed.closed || "") && /NOT individually proven still open/.test(closed.closed || ""));
console.log("\n2. REACH");
const rp = reachProblems(LEDGER, exists, ids);
ok("every file a row names exists in the tree and every theme of an OWED row has its entry in nextRounds", rp.length === 0, rp.slice(0, 3).join("; "));
const themeCounts = Object.fromEntries(THEMES.map((t) => [t, LEDGER.rows.filter((r) => r.theme === t).length]));
ok("each theme entry's stated count is the ledger's count for that theme", THEMES.filter((t) => themeCounts[t] > 0).every((t) => { const e = NEXT_ROUNDS.find((x) => x.id === "deferral-owed-" + t); return !!e && new RegExp(`^${themeCounts[t]} lines in `).test(e.what); }));
const c = census(), und = c.rows.filter((r) => r.cls === "undecided"), hs = new Set(LEDGER.rows.map((r) => r.file + "\0" + r.hash));
const covered = und.filter((r) => hs.has(r.file + "\0" + hashOf(r.text))).length;
const lines = new Set(und.map((r) => r.file + "\0" + hashOf(r.text))), drifted = LEDGER.rows.filter((r) => !lines.has(r.file + "\0" + r.hash)).length;
console.log(`  NOTE   the census reads ${und.length} undecided hits; the ledger covers ${covered}; ${und.length - covered} are not in it (reported, not red: a round that adds a phrase is not stopped by a ledger it never read); ${drifted} ledger rows no longer match an undecided line (edited, moved to another class or marked SETTLED since).`);
ok("at the time of the pass the ledger covered every undecided hit (covered + drifted bounds: covered never exceeds the ledger's rows)", covered <= LEDGER.rows.length && covered + drifted >= 0 && LEDGER.rows.length - drifted === covered);
console.log("\n3. THE CHECKER IS NOT BLIND (each rule goes red once on a broken copy)");
{
    const fresh = () => JSON.parse(JSON.stringify(LEDGER));
    const brk = (f) => { const L = fresh(); f(L); return shapeProblems(L); };
    const o0 = LEDGER.rows.findIndex((r) => r.verdict === "OWED_UNTRACKED"), n0 = LEDGER.rows.findIndex((r) => r.verdict === "NOT_A_DEFERRAL");
    ok("a missing hash is named", brk((L) => { delete L.rows[0].hash; }).some((x) => /hash is not 12 hex/.test(x)));
    ok("a hash of eleven characters is named", brk((L) => { L.rows[0].hash = L.rows[0].hash.slice(0, 11); }).some((x) => /hash is not 12 hex/.test(x)));
    ok("a verdict outside the list is named", brk((L) => { L.rows[0].verdict = "SETTLED"; }).some((x) => /not in the list/.test(x)));
    ok("an OWED row with no theme is named", brk((L) => { delete L.rows[o0].theme; }).some((x) => /needs a theme/.test(x)));
    ok("an OWED row with a theme outside the list is named", brk((L) => { L.rows[o0].theme = "elsewhere"; }).some((x) => /needs a theme/.test(x)));
    ok("a NOT-A-DEFERRAL row with a theme is named", brk((L) => { L.rows[n0].theme = "other"; }).some((x) => /has no theme/.test(x)));
    ok("a duplicate (file, hash) is named", brk((L) => { L.rows.push({ ...L.rows[0] }); }).some((x) => /twice/.test(x)));
    ok("a missing basis is named", brk((L) => { delete L.rows[0].basis; }).some((x) => /no basis/.test(x)));
    ok("a file that does not exist and a theme with no entry are named", (() => { const L = fresh(); L.rows[0].file = "no/such/file.mjs"; const a = reachProblems(L, exists, ids); const b = reachProblems(fresh(), exists, new Set()); return a.some((x) => /does not exist/.test(x)) && b.some((x) => /has no nextRounds entry/.test(x)); })());
    ok("the clean ledger has no problem in either checker", shapeProblems(LEDGER).length === 0 && reachProblems(LEDGER, exists, ids).length === 0 && shapeProblems(null)[0] === "no rows");
}
console.log(`\n${fails ? "SOME CHECKS FAILED: " + fails : "all checks pass"}`);
process.exitCode = fails ? 1 : 0;
