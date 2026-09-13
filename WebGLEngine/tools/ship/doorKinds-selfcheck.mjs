// WebGLEngine/tools/ship/doorKinds-selfcheck.mjs -- v3608
//
// Run: node tools/ship/doorKinds-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/ship/doorKinds.mjs -- the claim that orphanTriage's cliOnly bucket is three answers wearing one
// label, and that two of its eight already-answered members answered with a PROSE DOOR.
//
// THE CHECK THIS FILE EXISTS FOR is section 2: a detector that reports "has a door" is only worth having if it
// can tell a PATH LITERAL from a PARAGRAPH and an INVOCATION from a MENTION. Both are driven on synthetic
// sources whose answers were worked out before the code ran, BEFORE the real tree is asked -- v3450's rule.
import fs from "node:fs";
import path from "node:path";
import { ENGINE, SELF, doorKind, doorCandidates, noComments, cliOnlyMembers, resolveAll, MEASURED_V3608, reportLines } from "./doorKinds.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE INSTRUMENT EXCLUDES ITSELF BY IDENTITY -------------------------------------------------------------
{
    ok("!! it excludes ITSELF, and by identity rather than by name", SELF === "tools/ship/doorKinds.mjs",
       "derived from import.meta.url -- this file names all eight modules in its own header, and a name-based " +
       "exclusion breaks the day somebody renames it");
    const src = fs.readFileSync(path.join(ENGINE, SELF), "utf8");
    ok("...and it really does name them, so the exclusion is load-bearing rather than tidy",
       (src.match(/\.mjs/g) || []).length > 20, "the defect landing on the file studying it, seventh instance");
    ok("the candidate walk skips gates", !doorCandidates().some((f) => /-selfcheck\.mjs$/.test(f)),
       doorCandidates().length + " candidates");
}

// ---- 2. THE TWO DISCRIMINATORS, DRIVEN ON FIXTURES WHOSE ANSWERS WERE WORKED OUT FIRST ---------------------------
{
    // A registry blurb naming a tool is NOT a door; a path literal handed to spawn IS.
    const tmp = path.join(ENGINE, "tools", "ship", "__doorfixture__");
    fs.mkdirSync(tmp, { recursive: true });
    const write = (n, s) => fs.writeFileSync(path.join(tmp, n), s);
    write("target.mjs", "export const x = 1;\n");
    write("blurb.mjs", 'export const R = [{ rel: "x", blurb: "this paragraph mentions target.mjs at length and spawns nothing at all" }];\n');
    write("real.mjs", 'import { spawn } from "node:child_process";\nconst P = "tools/ship/__doorfixture__/target.mjs";\nconst args = [P];\nspawn(process.execPath, args);\n');
    write("prosey.mjs", 'export const msg = "not built -- run node tools/ship/__doorfixture__/target.mjs";\n');
    const rel = "tools/ship/__doorfixture__/target.mjs";
    const only = (names) => names.map((n) => "tools/ship/__doorfixture__/" + n);
    try {
        ok("!! A PARAGRAPH THAT NAMES A TOOL IS NOT A DOOR", doorKind(rel, only(["blurb.mjs"])).kind === "none",
           "my second version read reportingTools' PROSE DESCRIPTION of a tool as a spawn -- prose-as-code in " +
           "the direction noComments cannot help with, because the operand genuinely lives in a string");
        const real = doorKind(rel, only(["real.mjs"]));
        ok("!! ...and a path literal reaching spawn THROUGH TWO BINDINGS is", real.kind === "spawn",
           "P -> args -> spawn, which is exactly rocketBridge's shape and exactly what the one-hop version missed");
        ok("!! a page that TELLS THE READER TO TYPE THE COMMAND reads as `prose`, not as a door",
           doorKind(rel, only(["prosey.mjs"])).kind === "prose",
           "v3447: worse than a missing page, because the page is right there and LOOKS FINISHED");
        ok("...and prose LOSES to a real invocation when both exist",
           doorKind(rel, only(["real.mjs", "prosey.mjs"])).kind === "spawn" &&
           doorKind(rel, only(["real.mjs", "prosey.mjs"])).hasProse === true,
           "reported at its strongest kind, with hasProse kept so the prose door is not hidden by the real one");
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    ok("the fixture directory is removed", !fs.existsSync(tmp));
}

// ---- 3. THE REAL TREE: THE WORK LIST OF EIGHT IS THREE ANSWERS ----------------------------------------------------
{
    const members = await cliOnlyMembers();
    // v3609 -- I WROTE THE ANTIDOTE ON THIS VERY LINE AND THEN PINNED THE COUNT ANYWAY. It read
    // `members.length === 8` while its own message said the count should be REPORTED and not pinned, and it
    // went red the moment v3609 gave buildKnowledgeIndex and buildPageIndex a row and they LEFT the bucket --
    // A GATE FAILING ON PROGRESS, which is this tree's most-named defect, committed one line below the
    // sentence warning against it. The count is reported now and the PROPERTY is asserted.
    ok("the list is READ from orphanTriage, never typed here", members.length > 0 && members.every((m) => /\.mjs$/.test(m)),
       members.length + " members (8 at v3608; v3609 gave two of them a row and they left the bucket)");
    const rows = resolveAll(members);
    const kinds = {};
    for (const r of rows) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
    // v3610 -- ASSERTED AS A PROPERTY AND NOT A COUNT, AGAIN. The bucket keeps shrinking BECAUSE the rounds are
    // working, so any number here goes red on success. What is true whatever the membership does: NOT ONE
    // MEMBER IS UNEXPLAINED -- every one has a door, a declared refusal, or is on the owed list by name.
    const withDoor = (kinds.spawn || 0) + (kinds["rig-job"] || 0) + (kinds.import || 0) + (kinds["page-row"] || 0);
    const unexplained = rows.filter((r) => r.kind === "none" && !Object.keys(MEASURED_V3608.genuinelyOwed).includes(r.rel));
    ok("!! EVERY MEMBER IS EXPLAINED: a door, a declared refusal, or named as owed", unexplained.length === 0,
       Object.entries(kinds).map(([k, v]) => k + " " + v).join("  ") +
       " -- v3608 read 4 doors of 8; v3609 and v3610 gave rows to three more, so the bucket is " + members.length +
       (unexplained.length ? ". UNEXPLAINED: " + unexplained.map((r) => r.rel).join(", ") : ""));
    ok("...and doors still outnumber the unexplained", withDoor >= 3, withDoor + " with a door");
    const byName = Object.fromEntries(rows.map((r) => [r.rel, r.kind]));
    ok("...including one whose bridge header SAYS it was built for exactly this",
       byName["tools/roundhouse/run-device.mjs"] === "import",
       "deviceBridge: 'v2813 - front door ... run-device.mjs was CLI-only; this lets device.html pick'");
    // v3608's ANTIDOTE FIRED EXACTLY AS WRITTEN -- "when somebody gives a `prose` member a real door, this
    // count goes RED: rewrite it to the smaller number and NAME WHO WAS FIXED". buildPageIndex was fixed at
    // v3609 and buildKnowledgeIndex left the bucket entirely. ONE REMAINS: signRelease.
    // v3608 said: when a `prose` member gets a real answer, rewrite this to the smaller number and NAME WHO WAS
    // FIXED. buildPageIndex got a row at v3609; signRelease got a DECLARED REFUSAL at v3610 after its threat
    // model was read. The property that survives both: NO PROSE DOOR STANDS UNEXPLAINED.
    // TWO MORE ARRIVED SINCE v3610, THE SAME SHAPE AS THE FIRST TWO: orrery.html and orrery-gpu.html fetch
    // orrery.json (and orrery.html fetches orrery-authors.json too) with a `.catch(() => null)` fallback --
    // worse than a printed command in one sense, because nothing even tells the reader what to type -- and
    // recordInputs.mjs was named a member of orphanTriage's cliOnly bucket the same round. orreryBake.mjs and
    // orreryAuthorScan.mjs got real rows (dry-run by default, --write to emit, on corpus.mjs's precedent);
    // recordInputs.mjs got a DECLARED REFUSAL for the reason signRelease did -- read, then refused, on evidence
    // in its own header rather than on preference.
    const bareProse = rows.filter((r) => r.hasProse && r.kind === "prose");
    ok("!! NO PROSE DOOR STANDS UNEXPLAINED (2 at v3608, buildPageIndex/signRelease; 2 more here, orreryBake/orreryAuthorScan given rows and recordInputs a refusal)",
       bareProse.length === 0,
       bareProse.length ? bareProse.map((r) => path.basename(r.rel)).join(", ")
         : "signRelease and recordInputs still SAY the command -- `all` keeps `prose` on both so the distinction " +
           "is not hidden -- but the reason is recorded, and a refusal with a reason is an answer where a bare " +
           "prose door is debt");
    ok("!! ...which v3447 already named as WORSE than no door", (MEASURED_V3608.theProseDoorIsNotProgress || "").includes("LOOKS FINISHED"),
       "so it is its own KIND and cannot be counted as progress toward a door");
    // ANTIDOTE FIRED AGAIN: the bucket grew a THIRD prose door (recordInputs.mjs, same round orreryAuthorScan
    // and the two rig-needing tools below turned up) and it was closed the same way signRelease was -- READ,
    // THEN REFUSED, on evidence in the tool's own header (runs the whole gate tree once, the cost class of
    // verify.mjs, against a 180s per-press cap). 2 at v3610 -> 3 here; rewritten to the new count rather than
    // widened to keep the old one, per this file's own rule two lines above.
    ok("the refusals carry evidence rather than preference", Object.keys(MEASURED_V3608.refusedWithAReason).length === 3 &&
       (kinds.refused || 0) === 3,
       "removeCluster: v3202's sweep deleted 61 LIVE modules, so a one-click mass deletion is the wrong shape " +
       "-- a measurement outranks a preference. recordInputs.mjs: runs the whole gate tree once, the same cost " +
       "class as verify.mjs, against a 180s per-press cap");
    // ANTIDOTE FIRED A THIRD TIME: orreryAuthorScan.mjs got a REAL DOOR (a reportingTools row, dry-run by " +
    // default like orreryBake beside it) and LEFT the owed list; verifyLicenceTexts.mjs and wgslDeviceLimits.mjs
    // ARRIVED on it, each for the reason physics/backend-qa-check.mjs is already there -- a real, stated
    // environmental need (live network egress; a WebGPU-capable browser) rather than debt. 1 at v3610 -> 3 here.
    ok("...leaving exactly THREE genuinely owed, each needing something this box does not have",
       Object.keys(MEASURED_V3608.genuinelyOwed).length === 3,
       "physics/backend-qa-check.mjs needs a rig where box3d's WASM builds; verifyLicenceTexts.mjs needs live " +
       "network egress to GitHub; wgslDeviceLimits.mjs needs a WebGPU-capable browser -- none of the three is a " +
       "door this box can build, whatever box eventually runs them can");
}

// ---- 4. THE DOOR THAT DOES NOT TERMINATE, AND WHAT IS NOT CLAIMED --------------------------------------------------
//
// ANTIDOTE: when somebody gives a `prose` member a real door, section 3's prose count goes RED. REWRITE IT TO
// THE SMALLER NUMBER AND NAME WHO WAS FIXED -- do not widen `prose` to keep the count, and do not delete the
// kind, because a prose door is the one that looks finished from outside.
{
    const shipRitual = noComments(fs.readFileSync(path.join(ENGINE, "tools", "ship", "shipRitual.mjs"), "utf8"));
    const reporting = fs.readFileSync(path.join(ENGINE, "tools", "ship", "reportingTools.mjs"), "utf8");
    // v3608'S ANTIDOTE FIRED AS WRITTEN: this line asserted the chain did NOT terminate, and v3610 terminated
    // it. Rewritten to the state that now holds -- NOT deleted, because the property worth guarding is that a
    // door onto a doorless tool is not a door, and that only stays true if somebody keeps checking the end.
    ok("!! THE CHAIN NOW TERMINATES: buildKnowledgeIndex's invoker has a door of its own",
       /shipRitual\.mjs/.test(reporting) && /execFileSync/.test(shipRitual),
       "shipRitual execFileSync's it for real AND now carries a reporting row -- possible only because its " +
       "DEFAULT is --show, a decision v3528 made for readability that turned out to be what makes it pressable");
    ok("the split is REPORTED at its strongest kind with the weaker ones kept",
       resolveAll(["tools/ship/buildKnowledgeIndex.mjs"])[0].all.length >= 1,
       "hiding a prose door behind a real one would lose exactly the thing v3447 said is hardest to notice");
    ok("NOTHING HERE WEAKENS THE LAW", (MEASURED_V3608.notClaimed || "").includes("NOTHING HERE WEAKENS THE LAW"),
       "what the register needs is a way to say ALREADY ANSWERED DIFFERENTLY and a way to say NO WITH A REASON");
    const rep = await reportLines();
    ok("the report renders and names the prose kind", rep.length > 12 && rep.join("\n").includes("PROSE DOOR"), rep.length + " lines");
}

console.log(fails ? "\ndoorKinds-selfcheck: " + fails + " FAILED" : "\ndoorKinds-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
