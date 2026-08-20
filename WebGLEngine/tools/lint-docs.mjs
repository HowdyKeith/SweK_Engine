// tools/lint-docs.mjs -- v64: documentation contracts, the v38 lint-
// table pattern applied to prose. Docs rot exactly like log calls did;
// these are the contracts a grep can hold:
//
//   CONTRACT 1 (runbook steps): the FPS runbook's numbered steps must
//     run contiguous 1..N -- a deleted step leaves a gap nobody counts.
//     Section absent entirely is FINE if marked CONSUMED (its designed
//     end state); absent without the mark is a failure.
//   CONTRACT 2 (linked decisions): the LINKED DECISION markers in
//     brain/report.js are a PAIR -- "(1/2)" and "(2/2)", exactly one
//     each. The cross-reference itself can rot; this holds it.
//   CONTRACT 3 (phase headers): "## vNN -- " headers in NOTES.md must
//     be strictly increasing -- a pasted-in section can land out of
//     order (v65).
//   CONTRACT 4 (rig checks): every phase section must contain a rig-
//     checks block -- a deliverable without its handle is unfinished
//     (v66; strict, no grandfather -- all 64 sections complied at
//     adoption).
//   CONTRACT 5 (hooks tail): exactly ONE "Phase NN hooks (not built)"
//     section, NN = max phase + 1, as the FINAL header -- the living
//     tail that feeds the next phase (v67; the invariant surveyed,
//     then encoded sharper than the hook phrased it).
//   CONTRACT 6 (validation): every phase section from v14 onward must
//     contain a validation block; v11 and v13 predate the habit and
//     are grandfathered BY NAME (v68 -- surveyed, boundary stated).
//   CONTRACT 7 (runbook consumption): once FPS_DOMAIN_SPLIT reads
//     true, the flip-day runbook must be marked CONSUMED -- gated on
//     the boolean, asleep before flip day (v71).
//   CONTRACT 8 (pulse anchor pair): the console strip's href
//     "#pulse72" and the report's id="pulse72" are a CROSS-FILE pair
//     -- exactly one each, held like the LINKED DECISION pair (v73).
//
// Wire into verify.mjs:
//     execSync("node tools/lint-docs.mjs", {stdio:"inherit"});
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const here = dirname(fileURLToPath(import.meta.url));
// v69 -- --survey: every contract in REPORT-ONLY mode. Contracts 4 and
// 6 both began as hand surveys before adoption; this makes the next
// survey a flag instead of a scratch script. Findings print as
// "would-RED", exit stays 0 -- a survey informs, it does not gate.
const survey = process.argv.includes("--survey");
let red = false;
let wouldReds = 0;
const findings = [];   // v70 -- collected for --save / --diff
const fail = (m) => {
    findings.push(m);
    if (survey) { console.log("[lint-docs] [survey] would-RED: " + m); wouldReds++; }
    else { console.error("[lint-docs] RED: " + m); red = true; }
};

// -- contract 1: runbook step contiguity
const notes = fs.readFileSync(join(here, "../NOTES.md"), "utf-8");
const rbStart = notes.indexOf("## FPS FLIP-DAY RUNBOOK");
if (rbStart === -1) {
  if (!/RUNBOOK.*CONSUMED/i.test(notes)) fail("runbook section missing and not marked CONSUMED");
  else console.log("[lint-docs] runbook: CONSUMED (its designed end state)");
} else {
  const rbEnd = notes.indexOf("\n## ", rbStart + 5);
  const section = notes.slice(rbStart, rbEnd === -1 ? undefined : rbEnd);
  const steps = [...section.matchAll(/^(\d+)\. /gm)].map(m => Number(m[1]));
  const contiguous = steps.length > 0 && steps.every((v, i) => v === i + 1);
  console.log(`[lint-docs] runbook steps: [${steps.join(",")}] | contiguous 1..${steps.length}: ${contiguous}`);
  if (!contiguous) fail("runbook steps are not contiguous from 1 -- a step was added or removed without renumbering");
}

// -- contract 2: linked-decision pair
const report = fs.readFileSync(join(here, "../brain/report.js"), "utf-8");
const n1 = (report.match(/LINKED DECISION \(1\/2\)/g) || []).length;
const n2 = (report.match(/LINKED DECISION \(2\/2\)/g) || []).length;
console.log(`[lint-docs] linked decisions: (1/2) x${n1}, (2/2) x${n2} | pair intact: ${n1 === 1 && n2 === 1}`);
if (n1 !== 1 || n2 !== 1) fail("LINKED DECISION pair broken -- one side moved or vanished (change one, visit the other)");

// -- contract 3 (v65): phase headers monotonic. Sections append
// chronologically; a pasted-in section can land out of order and
// nobody re-reads 40 headers to notice. The ledger trick again.
// -- contract 4 (v66): every phase section carries a rig-checks
// block -- the checks are the deliverable's HANDLE; a section without
// them is unfinished. Surveyed before adoption: all 64 existing
// sections already comply, so the contract ships STRICT -- no
// grandfather clause needed, which is itself worth recording.
const heads66 = [...notes.matchAll(/^## v(\d+) -- /gm)].map(m => ({ v: Number(m[1]), at: m.index }));
const noChecks = [];
for (let i = 0; i < heads66.length; i++) {
    const end = i + 1 < heads66.length ? heads66[i + 1].at : notes.length;
    if (!/rig check/i.test(notes.slice(heads66[i].at, end))) noChecks.push(heads66[i].v);
}
console.log(`[lint-docs] rig-checks blocks: ${heads66.length - noChecks.length}/${heads66.length} sections${noChecks.length ? " -- missing in v" + noChecks.join(", v") : ""}`);
if (noChecks.length) fail("phase section(s) without rig checks: v" + noChecks.join(", v") + " -- the checks are the deliverable's handle");

const vers = heads66.map(h => h.v);
const mono = vers.every((v, i) => i === 0 || v > vers[i - 1]);
console.log(`[lint-docs] phase headers: ${vers.length} found, ${vers[0]}..${vers[vers.length - 1]} | strictly increasing: ${mono}`);
if (!mono) fail("phase headers out of order -- a section was pasted into the wrong place");

// v74 -- generalization SURVEYED, REFUSED (the v72 frame rule applied
// to this contract's own shape): five anchor pairs exist in the
// console but all are SAME-FILE (href and id in one served page -- a
// rename fails visibly in one diff). This contract's jurisdiction is
// the CROSS-FILE seam, where renames fail silently; exactly one such
// pair exists. The frame gets built at the second cross-file pair.
// -- contract 8 (v73): the pulse anchor pair. The console strip links
// "#pulse72"; the report carries id="pulse72". A refactor that renames
// either side strands the click on the page top -- the linked-decision
// pattern, applied to a cross-FILE pair: one grep each side.
try {
    // v77 -- MERGE fix: the console (and its #pulse72 href) lives in the
    // engine-bridge MODULE now, not in server.js
    const srv = fs.readFileSync(join(here, "../ai-bridge/gpuBrainBridge.js"), "utf-8");
    const hrefN = (srv.match(/#pulse72/g) || []).length;
    const idN = (report.match(/id="pulse72"/g) || []).length;
    console.log(`[lint-docs] pulse anchor pair: href x${hrefN}, id x${idN} | pair intact: ${hrefN === 1 && idN === 1}`);
    if (hrefN !== 1 || idN !== 1) fail("pulse anchor pair broken -- the strip's click would strand on the page top");
} catch {}

// -- contract 5 (v67): the LIVING hooks tail. The hook's phrasing was
// "hooks end every phase entry" -- surveyed, the TRUE invariant is
// sharper: consumed hooks become the next section, so exactly ONE
// "## Phase NN hooks (not built)" exists, NN = max phase + 1, and it
// is the FINAL header. A missing tail starves the ritual; a stale NN
// means a phase shipped without sketching its successor.
const hooksHeads = [...notes.matchAll(/^## Phase (\d+) hooks \(not built\)/gm)].map(m => ({ n: Number(m[1]), at: m.index }));
const lastHead = [...notes.matchAll(/^## /gm)].pop();
const maxV = Math.max(...vers);
const tailOk = hooksHeads.length === 1 && hooksHeads[0].n === maxV + 1 && hooksHeads[0].at === lastHead.index;
console.log(`[lint-docs] hooks tail: ${hooksHeads.length} section(s), Phase ${hooksHeads[0]?.n ?? "?"} vs expected ${maxV + 1}, final header: ${hooksHeads[0]?.at === lastHead.index} | living: ${tailOk}`);
if (!tailOk) fail("the hooks tail is broken -- exactly one 'Phase " + (maxV + 1) + " hooks (not built)' must be the final header");

// -- ring size note (v69): informational, never a fail. 200 entries x
// 3 steps is nothing; the day steps number 10 the ring deserves a
// glance. Threshold for the nudge: 100KB.
try {
    const ringP = join(here, "verify_timing.json");
    const st = fs.statSync(ringP);
    const ring = JSON.parse(fs.readFileSync(ringP, "utf-8"));
    const stepN = new Set(ring.flatMap(e => Object.keys(e.steps || {}))).size;
    const note = st.size > 100 * 1024 ? " -- NUDGE: past 100KB, consider a smaller ring or fewer decimals" : "";
    console.log(`[lint-docs] timing ring: ${ring.length} entries x ${stepN} steps, ${(st.size / 1024).toFixed(1)}KB${note}`);
    // v72 -- red-streak note: three reds in the last five ships is a
    // louder finding than any timing. A NOTE, not a fail -- each red
    // already failed its own ship; this lint gates PROSE, and a streak
    // is a signal about the rig, not the ledger.
    const last5 = ring.slice(-5);
    const redN = last5.filter(e => e.green === false).length;
    // v73 -- 3-of-5 DECIDED a constant, not a knob: the warn knobs
    // existed to kill a two-place duplication; this lives in ONE place
    // and its value has a REASON (3 = majority of the window), not a
    // preference. A knob here would invite tuning a smoke alarm.
    if (redN >= 3) console.log(`[lint-docs] RED STREAK: ${redN} of the last ${last5.length} ships were red -- louder than any timing warn; look at the rig before the next phase`);
    // v73 -- the green streak DECIDED a CLAUSE, not a line: a permanent
    // "all good" line trains eyes to skip lines; carried on the ring
    // line it costs nothing and still says "how long has it been".
    let gStreak = 0;
    for (let i = ring.length - 1; i >= 0 && ring[i].green !== false; i--) gStreak++;
    console.log(`[lint-docs] ship streak: ${gStreak} green${gStreak === ring.length ? " (the whole ring)" : gStreak === 0 ? " (last ship was red)" : ""}`);
} catch {}

// -- config schema note (v71): informational, like the ring note. One
// key today; the day it grows to FIVE, the config deserves its own
// contract line (keys documented, unknowns caught). The nudge fires
// at that boundary so the contract gets written when it earns itself.
try {
    const cfg = JSON.parse(fs.readFileSync(join(here, "verify_config.json"), "utf-8"));
    const keys = Object.keys(cfg);
    const note = keys.length >= 5 ? " -- NUDGE: five keys; time for a schema contract in this lint" : "";
    console.log(`[lint-docs] verify_config: ${keys.length} key(s) [${keys.join(", ")}]${note}`);
} catch {}

// v72 -- SURVEYED, then REFUSED: a gated-contract registry frame.
// Contract 7 is the ONLY gated contract in existence; a registry with
// one member is a pattern claim, not a pattern. The frame gets built
// at the SECOND gated contract, not before -- the v71 refusal's logic,
// one phase later, still holding: machinery with no new information
// is weight.
// -- contract 7 (v71): the runbook's CONSUMED promise, LIVENESS-GATED
// on the flip itself. The runbook's own step 7 says mark it CONSUMED;
// while FPS_DOMAIN_SPLIT is false the contract sleeps (an unconsumed
// runbook before flip day is just a runbook). The moment the boolean
// reads true, a still-living runbook is a broken promise and fails.
try {
    const dd = fs.readFileSync(join(here, "../simulation/DungeonDemo.js"), "utf-8");
    const flipped = /const FPS_DOMAIN_SPLIT = true;/.test(dd);
    const rbAlive = notes.indexOf("## FPS FLIP-DAY RUNBOOK") !== -1 && !/RUNBOOK[\s\S]{0,200}CONSUMED/.test(notes);
    console.log(`[lint-docs] runbook consumption: flip=${flipped}, runbook ${rbAlive ? "living" : "consumed/absent"}${flipped ? "" : " (contract sleeping until flip day)"}`);
    if (flipped && rbAlive) fail("flip day has passed (FPS_DOMAIN_SPLIT=true) but the runbook is not marked CONSUMED -- its own step 7");
} catch {}

// -- contract 6 (v68): validation blocks -- same handle logic as rig
// checks, DIFFERENT survey outcome: v11 and v13 predate the habit, so
// the contract is grandfathered AT THE BOUNDARY (v14 onward strict;
// the two exceptions named, not waved at). Contract 4 needed no
// grandfather; this one does -- the contrast is the record of when
// each ritual habit actually began.
const GRANDFATHERED6 = [11, 13];
const noVal = [];
for (let i = 0; i < heads66.length; i++) {
    const end = i + 1 < heads66.length ? heads66[i + 1].at : notes.length;
    if (!/validation/i.test(notes.slice(heads66[i].at, end)) && !GRANDFATHERED6.includes(heads66[i].v)) noVal.push(heads66[i].v);
}
console.log(`[lint-docs] validation blocks: ${heads66.length - noVal.length - GRANDFATHERED6.filter(g => heads66.some(h => h.v === g)).length}/${heads66.length} strict (v11, v13 grandfathered)${noVal.length ? " -- missing in v" + noVal.join(", v") : ""}`);
if (noVal.length) fail("phase section(s) without a validation block: v" + noVal.join(", v"));

if (survey) {
    // v70 -- the "what did my change break" loop: --save FILE snapshots
    // the findings; --diff FILE compares a fresh survey against the
    // snapshot -- NEW findings are what the edit broke, FIXED are what
    // it healed. Both stay exit 0: surveys inform, they do not gate.
    const argAfter = (flag) => { const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i + 1] : null; };
    const saveP = argAfter("--save"), diffP = argAfter("--diff");
    if (saveP) { fs.writeFileSync(saveP, JSON.stringify(findings, null, 2)); console.log(`[lint-docs] [survey] saved ${findings.length} finding(s) to ${saveP}`); }
    if (diffP) {
        let base = []; try { base = JSON.parse(fs.readFileSync(diffP, "utf-8")); } catch {}
        const fresh = new Set(findings), old = new Set(base);
        const added = findings.filter(f => !old.has(f)), fixed = base.filter(f => !fresh.has(f));
        for (const a of added) console.log("[lint-docs] [survey] NEW (your change broke this): " + a);
        for (const x of fixed) console.log("[lint-docs] [survey] FIXED (your change healed this): " + x);
        console.log(`[lint-docs] [survey] diff vs ${diffP}: +${added.length} new, -${fixed.length} fixed`);
    }
    console.log(`[lint-docs] [survey] complete: ${wouldReds} would-be red(s), exit 0`); process.exit(0);
}
if (red) process.exit(1);
console.log("[lint-docs] GREEN: the prose still keeps its promises");
