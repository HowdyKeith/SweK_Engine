// WebGLEngine/tools/ship/typecheck-selfcheck.mjs -- v4123
//
// Run: node tools/ship/typecheck-selfcheck.mjs   (a few seconds; skips cleanly if tsc is not installed)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// THE GATE FOR THE "// @ts-check" OPT-IN. Keith: "would we want any typescript coding?" -- the answer landed on
// not a TS conversion (there is no build step anywhere in this tree; a-Shell's `jsc` runs portableSuite.mjs
// directly on iOS with no Node at all, so a compiled-output workflow is a non-starter) but TYPE-CHECKING the
// JSDoc this tree already writes, file by file, via the standard `// @ts-check` pragma and `tsc --noEmit`.
//
// *** WHY THIS DOES NOT JUST RUN `tsc -p tsconfig.json`. *** Measured: with no "include"/"files" restriction,
// project mode auto-DISCOVERS every .js under the root and tries to PARSE all of them regardless of "checkJs" --
// and this tree ships files that are not standard JS at all, e.g. shaders/voxel.frag.glsl.js, which hard-fails
// with TS1005/TS1434 on the very first pass. Those files were never opted in and have nothing to do with type-
// checking. So this gate builds an EXPLICIT file list itself -- every file under the root whose first non-empty
// line is literally "// @ts-check" -- and passes that list to tsc directly, which needs "--ignoreConfig" (else
// TS5112: a tsconfig.json present in the CWD conflicts with an explicit file list) and every compiler option as
// a CLI flag (TS5042: "--project" cannot be mixed with source files on the command line).
//
// *** THE FLAGS ARE READ FROM tsconfig.json, NOT RETYPED. *** tsconfig.json's own header says it is the one
// declaration of the compiler options; a second hardcoded flag list here is exactly the kind of copy v3527's
// rule says never gets updated when the first one changes.
//
// *** THE SKIP LIST IS THE PACKAGER'S, IMPORTED RATHER THAN RE-TYPED -- same reasoning as artifactCensus.mjs. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolveTsc, tscSkipReason } from "./tscResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PB = require_("../../ai-bridge/packagerBridge.js");
const SKIP_DIRS = PB.SKIP_DIRS;

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("typecheck-selfcheck -- tsc --noEmit over the files that opted in with // @ts-check\n");

/** First non-empty line of a file, or "" -- JSDoc's own convention: the pragma must be the file's opening line. */
function firstNonEmptyLine(file) {
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split("\n")) { const t = line.trim(); if (t) return t; }
    return "";
}

/** Walk the tree for .js/.mjs files (not .html -- tsc needs a real file, not an inline <script>) tagged
 * "// @ts-check" as their opening line, skipping the packager's own SKIP_DIRS. */
function findTsCheckFiles(root) {
    /** @type {string[]} */
    const out = [];
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name.startsWith(".")) continue;
            if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name)); continue; }
            if (!/\.(js|mjs)$/.test(e.name)) continue;
            const full = path.join(dir, e.name);
            if (firstNonEmptyLine(full) === "// @ts-check") out.push(full);
        }
    })(root);
    return out.sort();
}

/** Strip "// ..." line comments from tsconfig.json's JSONC so it can be JSON.parse'd -- real comments, not a
 * fake-duplicate-key workaround; only "//" needs handling since this tree's tsconfig.json uses no "/* *\/". */
function stripJsonComments(text) {
    return text.split("\n").map((line) => {
        let inStr = false;
        for (let i = 0; i < line.length - 1; i++) {
            if (line[i] === '"' && line[i - 1] !== "\\") inStr = !inStr;
            if (!inStr && line[i] === "/" && line[i + 1] === "/") return line.slice(0, i);
        }
        return line;
    }).join("\n");
}

/** tsconfig.json's compilerOptions, translated into tsc CLI flags -- the ONE place that reads the ONE
 * declaration, so a future change to tsconfig.json does not have to be echoed here by hand. */
function flagsFromTsconfig(tsconfigPath) {
    const co = JSON.parse(stripJsonComments(fs.readFileSync(tsconfigPath, "utf8"))).compilerOptions;
    // "--noEmit" is not hardcoded here -- tsconfig.json's own compilerOptions already carries "noEmit": true,
    // and duplicating it would be the exact second copy this file's header exists to avoid.
    /** @type {string[]} */
    const flags = ["--ignoreConfig"];
    for (const [k, v] of Object.entries(co)) {
        if (v === true) flags.push("--" + k);
        else if (v === false) flags.push("--" + k, "false");
        else if (Array.isArray(v)) flags.push("--" + k, v.join(","));
        else flags.push("--" + k, String(v));
    }
    return flags;
}

const { bin: tsc, from: tscFrom } = resolveTsc();
const skipReason = tscSkipReason(tsc);

// ---- 1. THE FILE LIST -------------------------------------------------------------------------------------
let files = [];
{
    console.log("1. WHICH FILES OPTED IN");
    files = findTsCheckFiles(ENG);
    report(files.length + " file(s) tagged // @ts-check: " + files.map((f) => path.relative(ENG, f)).join(", "));
    ok("!! *** at least one file has opted in -- an empty list would mean this gate checks nothing ***",
        files.length > 0);
}

// ---- 2. *** THE REAL RUN: tsc AGAINST THE EXPLICIT LIST *** -----------------------------------------------
{
    console.log("\n2. *** tsc --noEmit AGAINST THE OPTED-IN FILES ***");
    if (skipReason) {
        report("SKIPPED (host has no tsc): " + skipReason);
    } else {
        const flags = flagsFromTsconfig(path.join(ENG, "tsconfig.json"));
        report("tsc from " + tscFrom + "; flags: " + flags.join(" "));
        let out = "", code = 0;
        try {
            out = execFileSync(tsc, [...flags, ...files.map((f) => path.relative(ENG, f))],
                { cwd: ENG, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        } catch (e) {
            code = 1;
            out = (e.stdout || "") + (e.stderr || "");
        }
        ok("!! *** tsc reports no errors across " + files.length + " opted-in file(s) ***", code === 0, out.trim());
    }
}

// ---- 3. *** SABOTAGE: A DELIBERATE TYPE ERROR MUST ACTUALLY FAIL *** --------------------------------------
// A gate that always exits 0 is not a gate -- this proves tsc is really checking, not silently no-opping.
{
    console.log("\n3. *** PROOF THE GATE CAN FAIL: A DELIBERATE TYPE ERROR ***");
    if (skipReason) {
        report("SKIPPED (host has no tsc): " + skipReason);
    } else {
        const scratch = path.join(ENG, "tools", "ship", "__typecheck_sabotage_scratch.js");
        fs.writeFileSync(scratch,
            '// @ts-check\n"use strict";\n/** @param {number} n @returns {number} */\n' +
            'export function wantsNumber(n) { return n + 1; }\nwantsNumber("not a number");\n');
        try {
            const flags = flagsFromTsconfig(path.join(ENG, "tsconfig.json"));
            let code = 0, out = "";
            try {
                out = execFileSync(tsc, [...flags, path.relative(ENG, scratch)],
                    { cwd: ENG, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
            } catch (e) { code = 1; out = (e.stdout || "") + (e.stderr || ""); }
            ok("!! *** a string passed where wantsNumber(n: number) is declared IS caught (exit " + code + ") ***",
                code !== 0 && /TS2345/.test(out), out.trim());
        } finally {
            fs.rmSync(scratch, { force: true });
        }
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
