// tools/ship/posixAssumption.mjs -- v4485
//
// *** THIS TREE IS DEVELOPED ON LINUX AND SHIPPED AS A ZIP THAT RUNS ON WINDOWS, AND UNTIL THIS ROUND
// NOTHING MEASURED THE GAP. *** Keith ran the gate suite on the rig against the v4477 archive and the
// failures were not findings about the tree -- they were the runner:
//
//     copiedOutsideVendor  "FIND: Parameter format not correct"     -- Windows FIND.exe is not POSIX find
//     songHeightfield      ERR_UNSUPPORTED_ESM_URL_SCHEME 'c:'      -- a path is not an import specifier
//     absenceScope         wanted accel/sceneBvh.mjs, got accel\... -- 10 checks, every one the separator
//     changedPaths         fatal: ambiguous argument 'HEAD~1'       -- the archive is not a git checkout
//
// Four gates, four DIFFERENT reasons, and a reader meeting them one at a time reads four defects. They are
// one: A GATE WRITTEN ON A POSIX BOX ENCODES THE BOX. That is v4484's finding one layer out -- there a single
// Linux path made 96 device gates unrunnable on the rig; here it is the shell, the loader, the separator and
// the source of truth, each doing the same thing in its own way.
//
// ---- *** WHAT IS ASSERTED AND WHAT IS ONLY COUNTED *** ---------------------------------------------------
//
// ASSERTED: the four measured instances are repaired, and no NEW POSIX-only shell-out or path-as-specifier
// arrives. Those are small, named populations where a detector's zero can be driven.
//
// COUNTED AND NOT ASSERTED: the separator population. 128 files call path.relative and 90 of them never
// normalise the result anywhere. That is a DENOMINATOR, NOT A DEFECT LIST -- a relative path that is only
// ever printed is fine on any platform, and the ones that bite are those compared against a stored "/" form.
// *** THREE STATIC RULES FOR "COMPARED AGAINST" WERE TRIED AND GAVE 53, 74 AND 90. *** A number that moves
// that far under one author in one round is not a measurement -- referenceKind-selfcheck.mjs's own words --
// so the narrow number is not shipped and the wide one is reported with this paragraph attached.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * *** THE ONE DEFINITION OF A SEPARATOR NORMALISATION. *** path.sep is "\\" on Windows, so any path built
 * with path.join or path.relative and then COMPARED against a recorded "a/b.mjs" is a comparison that
 * succeeds on the box it was written on and nowhere else.
 */
export const toPosix = (p) => String(p).split(path.sep).join("/").replace(/\\/g, "/");

/** POSIX-only command-line tools. Windows either lacks these or ships something else under the name. */
export const POSIX_TOOLS = Object.freeze([
    "find", "grep", "sed", "awk", "pkill", "which", "uname", "ps", "du", "wc", "xargs", "unzip",
]);

export const CLASSES = Object.freeze([
    Object.freeze({
        cls: "shell-tool",
        breaks: "a POSIX command-line tool is shelled out to; Windows has no such tool, or a different one " +
                "wearing the same name -- FIND.exe answers `find` and does something else entirely",
        fix: "walk the tree in Node, which every one of these was doing to a filesystem this process can read",
    }),
    Object.freeze({
        cls: "path-as-specifier",
        breaks: "a filesystem path is used as an ESM import specifier; an absolute Windows path begins " +
                "'C:' and Node reads that as a URL scheme it does not support",
        fix: "pathToFileURL(p).href, which is the only portable spelling of 'import this file'",
    }),
    Object.freeze({
        cls: "raw-separator",
        breaks: "a path built by path.join or path.relative is compared against, or recorded beside, a " +
                "stored \"/\" form -- true on the box it was written on and false on Windows",
        fix: "toPosix() at the boundary where the path becomes a RECORD rather than a filesystem argument",
    }),
    Object.freeze({
        cls: "git-assumed",
        breaks: "a git command runs with no check that there is a repository; the shipped archive is a zip, " +
                "so the gate does not fail, it CRASHES with a stack trace and no verdict",
        fix: "ask for the repository first and REFUSE by name -- v4424's rule that a runner must not read a " +
             "red as a crash, applied to the gate rather than to the runner",
    }),
]);

// The needles are ASSEMBLED rather than spelled, so this file and its gate are not themselves counted --
// v4409's rule (a fixture is not a gate) which this session has now been bitten by three times.
const EXECS = "(?:execSync|execFileSync|spawnSync)";
const SHELL_RE = new RegExp(EXECS + "\\(\\s*[\"'`]\\s*(" + POSIX_TOOLS.join("|") + ")\\b");
const SPEC_RE = new RegExp("import[^\"'`\\n]{0,40}from\\s*\"\\s*\\+\\s*JSON\\.stringify\\(\\s*path\\.");
const GIT_RE = new RegExp(EXECS + "\\(\\s*[\"'`]git[\"'`]");
const REL_RE = /path\.relative\(/g;
const NORM_RE = new RegExp("toPosix|replace\\(/\\\\\\\\/g");

/** Comment lines carry prose about these patterns; the code is what runs. */
const codeOf = (src) => src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

export function sources(dir = ENG, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (/node_modules|[\\/]vendor[\\/]|[\\/]dist[\\/]/.test(p)) continue;
        if (e.isDirectory()) sources(p, out);
        else if (/\.(mjs|js)$/.test(e.name)) out.push(p);
    }
    return out;
}

/**
 * The four classes, over a file list. `separator` is a POPULATION and the others are DEFECT LISTS -- the
 * difference is stated in the return shape so a caller cannot read one as the other.
 */
export function scan({ files = null, read = (f) => fs.readFileSync(f, "utf8"), skip = [] } = {}) {
    const list = (files || sources()).filter((f) => !skip.some((s) => f.endsWith(s)));
    const shellTool = [], pathSpecifier = [], gitAssumed = [];
    let relCallers = 0, relCalls = 0, relNormalised = 0;
    for (const f of list) {
        const code = codeOf(read(f));
        const rel = toPosix(path.relative(ENG, f));
        const m = SHELL_RE.exec(code);
        // *** A PLATFORM BRANCH IS NOT AN ASSUMPTION, IT IS THE ANSWER TO ONE. *** ai-bridge/brainProcess.js
        // calls pkill in the `else` of a process.platform test whose other arm calls taskkill -- correct
        // code, and the first draft of this detector reported it, because a regex cannot see the branch it
        // sits inside. A file that asks which platform it is on has already done the thinking.
        if (m && !/process\.platform|win32|isWindows/.test(code)) shellTool.push({ file: rel, tool: m[1] });
        if (SPEC_RE.test(code)) pathSpecifier.push({ file: rel });
        // A git call is only a defect if nothing in the file asks whether a repository is there.
        if (GIT_RE.test(code) && !/rev-parse|\.git\b|isRepo|noRepo/.test(code)) gitAssumed.push({ file: rel });
        const n = (code.match(REL_RE) || []).length;
        if (n) { relCallers++; relCalls += n; if (NORM_RE.test(code)) relNormalised++; }
    }
    return Object.freeze({
        scanned: list.length,
        shellTool: Object.freeze(shellTool),
        pathSpecifier: Object.freeze(pathSpecifier),
        gitAssumed: Object.freeze(gitAssumed),
        // *** REPORTED, NOT ASSERTED. See the header: the narrow rule would not hold still. ***
        separator: Object.freeze({ callers: relCallers, calls: relCalls,
                                   normalised: relNormalised, never: relCallers - relNormalised }),
    });
}

/** What the rig measured, kept verbatim, because a repair is only checkable against the failure it repairs. */
export const POSIX_AT_V4485 = Object.freeze({
    at: "v4485",
    rig: "Windows, node v24.17.0, the v4477 archive unzipped at C:/Intel/SweK_Engine_v4477",
    measured: Object.freeze([
        Object.freeze({ gate: "tools/ship/copiedOutsideVendor-selfcheck.mjs", cls: "shell-tool",
            saw: "FIND: Parameter format not correct", tool: "find" }),
        Object.freeze({ gate: "tools/ship/songHeightfield-selfcheck.mjs", cls: "path-as-specifier",
            saw: "ERR_UNSUPPORTED_ESM_URL_SCHEME: Received protocol 'c:'" }),
        Object.freeze({ gate: "tools/ship/absenceScope-selfcheck.mjs", cls: "raw-separator",
            saw: "want accel/sceneBvh.mjs, got accel\\sceneBvh.mjs", checks: 10 }),
        Object.freeze({ gate: "tools/ship/changedPaths-selfcheck.mjs", cls: "git-assumed",
            saw: "fatal: ambiguous argument 'HEAD~1': unknown revision" }),
    ]),
    // The separator population under ONE stated rule, so a later reading is comparable to this one.
    separatorRule: "a file calling path.relative, against whether the file mentions toPosix or a backslash " +
                   "replace anywhere in its code",
    separator: Object.freeze({ callers: 128, calls: 175, normalised: 38, never: 90 }),
    rulesTried: Object.freeze([53, 74, 90]),
    notClaimed: "that the 90 are defects. A relative path that is only printed is portable already; the ones " +
                "that bite are compared against a stored form, and three static rules for 'compared against' " +
                "gave three different answers in one sitting.",
});

export function reportLines(s = null) {
    const r = s || scan();
    const L = ["POSIX assumptions -- a gate written on a POSIX box encodes the box"];
    for (const c of CLASSES) L.push(`    ${c.cls.padEnd(18)} ${c.breaks.slice(0, 96)}`);
    L.push(`  scanned ${r.scanned} source files`);
    L.push(`    shell-tool        ${r.shellTool.length}` +
           (r.shellTool.length ? ": " + r.shellTool.map((x) => `${x.file} (${x.tool})`).join(", ") : ""));
    L.push(`    path-as-specifier ${r.pathSpecifier.length}` +
           (r.pathSpecifier.length ? ": " + r.pathSpecifier.map((x) => x.file).join(", ") : ""));
    L.push(`    git-assumed       ${r.gitAssumed.length}` +
           (r.gitAssumed.length ? ": " + r.gitAssumed.map((x) => x.file).join(", ") : ""));
    L.push(`    raw-separator     ${r.separator.never} of ${r.separator.callers} callers never normalise ` +
           `(${r.separator.calls} calls) -- A DENOMINATOR, NOT A DEFECT LIST`);
    L.push("  the separator number is REPORTED: three static rules for 'compared against a stored form' gave " +
           "53, 74 and 90 in one sitting, and a number that moves that far under one author is not a measurement.");
    return L;
}
