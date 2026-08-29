// WebGLEngine/tools/ship/shadowedHelper.mjs -- v4148
//
// *** A SCOPED `const` THAT SHADOWS A MODULE-LEVEL FUNCTION THE SAME SCOPE ALREADY CALLED. ***
//
// Keith pressed Clone and got "Cannot access '_run' before initialization". githubBridge.js declares
// `function _run(cmd, args, opts)` at module level -- the thing that actually runs git -- and v4133 later added
// `const _run = engineVersion()` near the BOTTOM of cloneEngineSource, meaning the running version.
//
// A `const` shadows its outer name for the WHOLE enclosing scope, not from its own line down. So the first
// `await _run("git", ...)` -- a hundred lines ABOVE the declaration -- resolved to the const, hit its temporal
// dead zone and threw. *** THE FUNCTION COULD NEVER REACH THE TOOL THAT DOES ITS JOB, AND THE ERROR POINTED AT
// A LINE THAT WAS FINE. *** Nothing about cloning was broken; the name was.
//
// WHY THIS IS A MODULE AND NOT A REGEX IN ONE GATE: shadowing ALONE is legal and common -- this tree has
// thirteen instances and twelve of them are harmless, because they declare before they use. The defect is the
// CONJUNCTION: shadowed AND called earlier in the same enclosing function. Reporting the shadowings would be
// twelve false positives and a habit of ignoring the list; reporting the conjunction found exactly one, and it
// was the live bug. A CENSUS THAT CRIES WOLF IS A CENSUS NOBODY READS.
// *** AND THE FIRST DRAFT OF THIS FILE REPORTED A SECOND "BUG" THAT WAS NOT ONE, WHICH IS THE REASON THE SCOPE
// IS COUNTED IN BRACES RATHER THAN GUESSED FROM INDENTATION. *** It approximated the enclosing scope as "the
// nearest column-zero function", and flagged deviceBridge.js: makeCaller called at line 161, shadowed at 270.
// Both sit inside handle(), so by that rule it was a crash. IT IS NOT: 161 is inside `if (route === "/start")`
// and 270 inside `if (route === "/bench/start")` -- SIBLING BLOCKS. `const` is BLOCK-scoped, not
// function-scoped, so a declaration in one branch shadows nothing in another.
//
// The header below already said a census that cries wolf is a census nobody reads, and the draft was one hit
// away from being that. The enclosing block is now found by counting braces back from the declaration, over
// codeOnly() source so a brace inside a string or a comment cannot move the boundary.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { codeOnly } from "./sourceScan.mjs";

export const ROOTS = ["ai-bridge", "tools", "ui", "brain", "render", "simulation", "physics", "ev", "world", "mesh", "lib"];

function jsFiles(dir, out = []) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { jsFiles(p, out); continue; }
        if (/\.(js|mjs)$/.test(e.name)) out.push(p);
    }
    return out;
}

/**
 * Every place a scoped const/let shadows a module-level function AND that name is CALLED earlier inside the
 * same top-level function -- i.e. every guaranteed temporal-dead-zone throw of this shape.
 *
 * The enclosing scope is approximated by the nearest preceding COLUMN-ZERO function declaration, which is how
 * this tree writes its module-level functions. That is deliberately conservative: a nested helper would push
 * the boundary earlier and can only ever make this report FEWER hits, never invent one.
 */
export function shadowedHelpers(root = ".") {
    const hits = [];
    for (const r of ROOTS) {
        for (const file of jsFiles(path.join(root, r))) {
            const src = fs.readFileSync(file, "utf8");
            const lines = src.split("\n");
            const fnNames = new Set([...src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
            if (!fnNames.size) continue;
            // Brace counting happens on codeOnly() source -- strings blanked, comments stripped -- so a `{` in
            // a message or an example cannot be mistaken for a scope. Line NUMBERS are preserved by codeOnly,
            // which is why the two arrays can be indexed together.
            const codeLines = codeOnly(src).split("\n");
            for (let i = 0; i < lines.length; i++) {
                const m = /^[ \t]+(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/.exec(lines[i]);
                if (!m || !fnNames.has(m[1])) continue;
                const name = m[1];
                // *** THE ENCLOSING BLOCK, NOT THE ENCLOSING FUNCTION. *** Walk back counting braces; the scope
                // opens at the first UNMATCHED `{`. A const in one if-branch cannot shadow anything in a
                // sibling branch, and that distinction is the whole difference between this file and a
                // false-positive generator.
                let depth = 0, start = 0;
                for (let j = i - 1; j >= 0; j--) {
                    const L = codeLines[j] || "";
                    for (let k = L.length - 1; k >= 0; k--) {
                        if (L[k] === "}") depth++;
                        else if (L[k] === "{") { if (depth === 0) { start = j; k = -1; j = -1; break; } depth--; }
                    }
                }
                // is the shadowed name CALLED between that scope's start and the shadowing declaration?
                const callRe = new RegExp("(?:^|[^\\w$.])" + name.replace(/\$/g, "\\$") + "\\s*\\(");
                let calledEarlier = -1;
                for (let j = start + 1; j < i; j++) {
                    if (/^\s*(\/\/|\*)/.test(lines[j])) continue;              // a comment is not a call
                    if (callRe.test(lines[j])) { calledEarlier = j + 1; break; }
                }
                if (calledEarlier > 0) {
                    hits.push({
                        file, name,
                        declaredAt: i + 1,
                        calledAt: calledEarlier,
                        scopeAt: start + 1,
                        scope: (lines[start].match(/function\s+([A-Za-z_$][\w$]*)/) || [, "(module)"])[1],
                    });
                }
            }
        }
    }
    return hits;
}
