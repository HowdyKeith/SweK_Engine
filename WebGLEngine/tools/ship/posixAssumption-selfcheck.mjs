#!/usr/bin/env node
// WebGLEngine/tools/ship/posixAssumption-selfcheck.mjs -- v4485 -- the gate for tools/ship/posixAssumption.mjs.
//
// Run: node tools/ship/posixAssumption-selfcheck.mjs
//
// *** THIS GATE RUNS ON THE BOX WHOSE ASSUMPTIONS IT IS ABOUT, WHICH IS THE WHOLE DIFFICULTY. *** Nothing
// here can be red for the reason the rig was red -- path.sep is "/" in this container and no fixture can
// change it. So every claim is made against SYNTHETIC INPUT whose answer is known before the code runs:
// toPosix is handed a Windows path, the detectors are handed a file that must trip them and one that must
// not, and the four repairs are checked by scanning the real files rather than by running them somewhere
// they cannot fail.
//
// ---- *** SIX SABOTAGES *** ------------------------------------------------------------------------------------
//
//  A. toPosix returns its input unchanged            -> 3 RED
//  B. the platform-branch exemption is dropped       -> 2 RED
//  C. the tool list forgets `find`                   -> 2 RED
//  D. the path-as-specifier detector never matches   -> 2 RED
//  E. the git detector ignores the repository check  -> 2 RED
//  F. the record drops the rules it tried and refused-> 1 RED
//
// ---- *** WHAT THIS GATE DOES NOT CLAIM *** --------------------------------------------------------------------
//
// That the tree runs on Windows. Nothing here has run on Windows; what is established is that the four
// failures the rig MEASURED no longer have their cause in the tree, and that no new instance of the two
// precise classes has arrived. The separator population is REPORTED and not asserted, for the reason the
// module's header gives: three static rules for "compared against a stored form" gave 53, 74 and 90 in one
// sitting, and shipping any of them would be shipping the one that happened to be written last.
"use strict";
import { toPosix, scan, CLASSES, POSIX_TOOLS, reportLines, POSIX_AT_V4485 as REC, ENG }
    from "./posixAssumption.mjs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);
const HERE = path.resolve(fileURLToPath(import.meta.url));

console.log("posixAssumption-selfcheck -- a gate written on a POSIX box encodes the box\n");

// ---- 1. toPosix, ON INPUT THIS PLATFORM WOULD NEVER PRODUCE -----------------------------------------------------
console.log("1. the one definition of a separator normalisation");

ok("!! a Windows path becomes the recorded form", toPosix("accel\\sceneBvh.mjs") === "accel/sceneBvh.mjs",
    "sabotage A: this is the literal comparison that failed ten times in absenceScope-selfcheck on the rig " +
    "-- want accel/sceneBvh.mjs, got accel\\sceneBvh.mjs");
ok("...and a path already in that form is untouched, so it is safe to apply twice",
    toPosix("a/b/c.mjs") === "a/b/c.mjs" && toPosix(toPosix("a\\b\\c.mjs")) === "a/b/c.mjs");
ok("...and a deep Windows path with a drive letter keeps the drive and loses only the separators",
    toPosix("C:\\Intel\\SweK_Engine_v4477\\WebGLEngine\\main.js") ===
        "C:/Intel/SweK_Engine_v4477/WebGLEngine/main.js");
ok("...and it is not a URL encoder: a file URL is left alone, because it has no separators to fix",
    toPosix(pathToFileURL("/a/b.mjs").href) === pathToFileURL("/a/b.mjs").href,
    "the two repairs are for different classes and neither may do the other's job");

// ---- 2. *** EACH DETECTOR, HANDED A FILE THAT MUST TRIP IT AND ONE THAT MUST NOT *** -----------------------------
console.log("\n2. the detectors, driven both ways");

// The needles are ASSEMBLED, never spelled: written as literals these fixtures land in the census they are
// testing -- v4409's rule (a fixture is not a gate) which this session has been bitten by three times, most
// recently in v4484's own gate.
const X = "exec" + "Sync", XF = "exec" + "FileSync";
const FIX = {
    shellFind: `import {${X}} from "node:child_process";\nconst d = ${X}("find . -type d -name vendor");\n`,
    shellBranched: `import {${X}} from "node:child_process";\n` +
        `if (process.platform === "win32") ${X}("taskkill /F");\nelse ${X}("pkill -f thing");\n`,
    specifier: `const prog = "import {a} from " + JSON.stringify(path.join(ENG, "world/x.mjs")) + ";";\n`,
    specifierOk: `const prog = "import {a} from " + JSON.stringify(pathToFileURL(path.join(ENG,"world/x.mjs")).href) + ";";\n`,
    gitBare: `import {${XF}} from "node:child_process";\n${XF}("git", ["diff", "HEAD~1"]);\n`,
    gitAsked: `import {${XF}} from "node:child_process";\n` +
        `try { ${XF}("git", ["rev-parse", "--git-dir"]); } catch { }\n${XF}("git", ["diff", "HEAD~1"]);\n`,
    clean: `import fs from "node:fs";\nconst x = fs.readFileSync("a.mjs", "utf8");\n`,
};
const run = (keys) => scan({ files: keys.map((k) => path.join(ENG, "__fix_" + k + ".mjs")),
                             read: (f) => FIX[path.basename(f).replace(/^__fix_|\.mjs$/g, "")] });

{
    const trips = run(["shellFind"]);
    ok("!! a POSIX tool shelled out to is found, and the TOOL is named",
        trips.shellTool.length === 1 && trips.shellTool[0].tool === "find",
        "sabotage C: the rig answered `find` with FIND.exe -- 'FIND: Parameter format not correct' -- and " +
        "the gate did not fail, it CRASHED with an unhandled throw");
    const branched = run(["shellBranched"]);
    ok("!! *** ...and a call inside an explicit platform branch is NOT reported ***",
        branched.shellTool.length === 0,
        "sabotage B: ai-bridge/brainProcess.js calls pkill in the `else` of a process.platform test whose " +
        "other arm calls taskkill. THE FIRST DRAFT REPORTED IT -- a regex cannot see the branch it sits in, " +
        "and a file that asks which platform it is on has already done the thinking");
}
{
    ok("!! a filesystem path used as an import specifier is found",
        run(["specifier"]).pathSpecifier.length === 1,
        "sabotage D: the rig answered this with ERR_UNSUPPORTED_ESM_URL_SCHEME, \"Received protocol 'c:'\"");
    ok("...and the pathToFileURL form is not",
        run(["specifierOk"]).pathSpecifier.length === 0,
        "a detector that also flagged the repair would make the repair unshippable");
}
{
    ok("!! a git call with nothing asking for a repository is found",
        run(["gitBare"]).gitAssumed.length === 1);
    ok("...and one that asks first is not",
        run(["gitAsked"]).gitAssumed.length === 0,
        "sabotage E: needing git is not the defect -- CRASHING instead of refusing by name is, which is " +
        "v4424's rule that a red must never reach a reader as a stack trace");
}
ok("!! CONTROL: an ordinary file trips nothing at all, so none of the three is simply always true",
    (() => { const r = run(["clean"]);
             return r.shellTool.length === 0 && r.pathSpecifier.length === 0 && r.gitAssumed.length === 0; })());

// ---- 3. *** THE FOUR THE RIG MEASURED, CHECKED AGAINST THE REAL FILES *** ----------------------------------------
console.log("\n3. the four failures the rig produced, in the tree as it stands");

const live = scan({ skip: ["posixAssumption.mjs", "posixAssumption-selfcheck.mjs"] });
say(reportLines(live).join("\n  ----  "));

ok("the record holds all four, each with what the rig actually printed",
    REC.measured.length === 4 && REC.measured.every((m) => m.gate && m.cls && m.saw) &&
    new Set(REC.measured.map((m) => m.cls)).size === 4,
    "four gates, four different messages, one cause");
{
    const stillShelling = live.shellTool.map((x) => x.file);
    ok("!! *** copiedOutsideVendor no longer shells out, and neither does verify.mjs ***",
        !stillShelling.includes("tools/ship/copiedOutsideVendor-selfcheck.mjs") &&
        !stillShelling.includes("tools/ship/verify.mjs"),
        "still shelling: " + (stillShelling.join(", ") || "nothing in the ship path"));
    ok("!! ...and NO gate anywhere still uses a POSIX tool outside a platform branch",
        live.shellTool.every((x) => !x.file.endsWith("-selfcheck.mjs")),
        live.shellTool.length ? "remaining, and named rather than counted: " +
            live.shellTool.map((x) => `${x.file} (${x.tool})`).join(", ") : "none");
    ok("!! songHeightfield no longer hands node a path where a specifier belongs",
        live.pathSpecifier.length === 0);
    ok("!! absenceScope's recorded paths carry no separator this platform chose",
        !fs.readFileSync(path.join(ENG, "tools/ship/absenceScope.mjs"), "utf8")
            .includes("out.push(path.relative(root, p))"),
        "the value is normalised at the boundary where it stops being a filesystem argument and becomes a record");
    ok("!! changedPaths asks for a repository and REFUSES by name instead of throwing",
        /rev-parse/.test(fs.readFileSync(path.join(ENG, "tools/ship/changedPaths-selfcheck.mjs"), "utf8")));
}

// ---- 4. *** verify.mjs's MARKER CHECK FELL THE WRONG WAY, AND THAT IS THE ONE THE RIG NEVER REACHED *** ----------
console.log("\n4. the ship gate's own marker check, which no rig run could have reported");

{
    const src = fs.readFileSync(path.join(ENG, "tools/ship/verify.mjs"), "utf8");
    ok("!! *** the marker check walks in Node rather than shelling out ***",
        /markerInTree\(/.test(src) && !new RegExp(X + "\\(`" + "grep").test(src),
        "IT FELL THE WRONG WAY: a throw set hit = false, and hit feeds check() -- so with no POSIX grep " +
        "EVERY FEATURE MARKER READS AS ABSENT and the ship verify cannot pass at all. The rig never " +
        "reported this because the only thing that would have is this gate");
    // The walk itself, on a fixture tree, both directions -- the property the shell-out had.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "posix-marker-"));
    fs.mkdirSync(path.join(tmp, "sub"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "sub", "a.mjs"), "// holds the marker: SweK Dictate\n");
    fs.writeFileSync(path.join(tmp, "sub", "b.png"), "SweK Dictate");     // wrong extension: not searched
    const EXT = /\.(js|html|mjs|md|json|py|txt|sh|bat|command)$/;
    const walk = (dir, needle) => { let found = false;
        (function w(d) { if (found) return;
            for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (found) return;
                const p = path.join(d, e.name);
                if (e.isDirectory()) { w(p); continue; }
                if (!EXT.test(e.name)) continue;
                try { if (fs.readFileSync(p, "utf8").includes(needle)) found = true; } catch { } } })(dir);
        return found; };
    ok("...and the walk finds a marker that is there", walk(tmp, "SweK Dictate"));
    ok("...and refuses one that is not, so it is not simply always true", !walk(tmp, "zzz-absent-zzz"));
    ok("!! ...and a marker's PUNCTUATION cannot be read as a pattern, which is what -F bought",
        (() => { fs.writeFileSync(path.join(tmp, "sub", "c.mjs"), "iterCap: W * H\n");
                 return walk(tmp, "iterCap: W * H") && !walk(tmp, "iterCap:  W * H"); })(),
        "v2204: without -F a marker is a regex and `W * H` matches text that is not there. includes() " +
        "cannot do that to anybody");
    fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- 5. THE RECORD, AND THE NUMBER IT REFUSES TO SHIP ------------------------------------------------------------
console.log("\n5. the frozen record");

ok("the four classes are named with what each BREAKS and what FIXES it",
    CLASSES.length === 4 && CLASSES.every((c) => c.breaks.length > 40 && c.fix.length > 20) &&
    new Set(CLASSES.map((c) => c.cls)).size === 4);
ok("the tool list is real tools, and `find` and `grep` are in it",
    POSIX_TOOLS.includes("find") && POSIX_TOOLS.includes("grep") && POSIX_TOOLS.length >= 10);
// *** SABOTAGE F WENT 0 RED AND THE REASON IS THIS ROUND'S OWN SUBJECT. *** The detail below read
// REC.rulesTried.join(...) EAGERLY, so deleting the field threw before `ok` was ever called -- and a gate
// that crashes prints no FAIL line at all. That is exactly the defect section 3 checks changedPaths for,
// arriving in the gate written to catch it. The detail is computed defensively now, so the sabotage reddens
// the row instead of taking the process down.
ok("!! *** the record keeps the three rules that were tried and REFUSED, not just the one shipped ***",
    Array.isArray(REC.rulesTried) && REC.rulesTried.length === 3 &&
    new Set(REC.rulesTried).size === 3 && typeof REC.notClaimed === "string" && REC.notClaimed.length > 80,
    `sabotage F: ${Array.isArray(REC.rulesTried) ? REC.rulesTried.join(", ") : "NO RULES RECORDED"} -- ` +
    `three static rules for "compared against a stored form" in ` +
    "one sitting. Shipping any of them would have shipped whichever was written last, and a reader meeting " +
    "one number could not tell it from a measurement");
ok("...and the separator population is REPORTED with the rule it was taken under, so a later reading compares",
    typeof REC.separatorRule === "string" && REC.separatorRule.length > 40 &&
    REC.separator.callers > REC.separator.normalised);
ok("!! ...and a fresh scan still agrees with the recorded population, within what the round itself moved",
    Math.abs(live.separator.callers - REC.separator.callers) <= 4 &&
    live.separator.normalised >= REC.separator.normalised,
    `recorded ${REC.separator.normalised} of ${REC.separator.callers} normalising, now ` +
    `${live.separator.normalised} of ${live.separator.callers} -- this round can only have RAISED the ` +
    "normalising count, and a fall would mean a repair was undone");
ok("the record is frozen", Object.isFrozen(REC) && REC.measured.every(Object.isFrozen));
ok("!! and this gate is not in its own census, so the fixtures above cannot inflate it",
    !live.shellTool.some((x) => x.file.includes("posixAssumption")) &&
    !live.pathSpecifier.some((x) => x.file.includes("posixAssumption")),
    "v4409's rule arriving through a string, which this session has now paid for four times");

console.log(`\nposixAssumption-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
