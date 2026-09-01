// WebGLEngine/tools/ship/duplicateFiles.mjs -- v3506
//
// *** FOUND BY ACCIDENT AND WORTH A GATE: SIX GROUPS OF BYTE-IDENTICAL SOURCE FILES SIT IN TWO OR THREE PLACES
// IN THIS TREE WITH NOTHING CHECKING THEY STAY IN STEP. *** v3500 hashed every file to answer a different
// question (whether airllm's hardlink trick had anything to reclaim here -- it does not, 0.13%) and turned up
// strictTrig.mjs and strictMath.mjs THREE TIMES EACH, plus solar-3d-card.js, haDiscovery.js, CATALOG.md and
// strict-libm-pkg/test.mjs twice. IDENTICAL TODAY BY COINCIDENCE OF MAINTENANCE.
//
// THIS IS THE SHAPE THIS TREE NAMES MORE THAN ANY OTHER -- A SECOND DECLARATION NOBODY EVER COMPARED -- and the
// handoff already records it happening in somebody else's repo (diluuuu10/triggered-discharge says IN A COMMENT
// that its two Heidler copies "MUST stay in step", with nothing checking it). SweK has been doing it six times
// over while writing that sentence down.
//
// ================================================================================================
// THE THREE DESIGN DECISIONS, EACH OF WHICH COULD HAVE GONE THE LAZY WAY
// ================================================================================================
//
// (1) *** THE SET IS DERIVED BY HASHING, NEVER TYPED. *** A hand-written list is a second declaration about
//     second declarations, and it would go stale the first time somebody added a seventh copy. A NEW COPY JOINS
//     AUTOMATICALLY because it simply shows up in the hash groups.
//
// (2) *** THE BASELINE STORES THE **PATHS**, NOT THE HASH. *** Storing the hash would fire every time somebody
//     correctly updated both copies together, which is the one behaviour this is trying to ENCOURAGE. Storing
//     the paths asks the only question that matters: DO THESE FILES STILL MATCH EACH OTHER.
//
// (3) *** DRIFT AND DELETION ARE DIFFERENT NEWS AND ARE REPORTED APART. *** A group that lost a member because
//     somebody edited one copy is a defect. A group that lost a member because somebody DELETED it is a
//     decision. Merging them into one count would make the second look like the first.
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
// *** WHAT IS SKIPPED, AND WHY .claude/worktrees JOINED THE LIST AT v4279. ***
// This walk reads the FILESYSTEM, not git's index, and the two disagree about what is in the repository. An
// agent worktree under .claude/worktrees/ is a whole second copy of the tree, git-ignored (.git/info/exclude
// carries `**/.claude/worktrees/`) and present only on a machine where such an agent has run. With two of
// them on disk this gate reported HUNDREDS of new duplicate groups -- every file in the tree "duplicated"
// two or three times -- and went red on a repository that had not changed at all.
//
// It looked, from a clean checkout, exactly like a defect introduced during this session. It was not: the
// v4279 sweep compared HEAD against a worktree at v4266 and read that as "these three gates were broken by
// recent rounds", and this was one of them. A CLEAN CHECKOUT HAS NO SCRATCH DIRECTORIES, so any gate that
// scans the filesystem is comparing two different worlds. That is a fact about the measuring method, and it
// is recorded here because the next person to attribute a red by checking out an old commit will hit it too.
const SKIP = new Set([".git", "node_modules", "__pycache__", ".DS_Store", ".claude"]);
// Text-ish and code-ish only. A duplicated BINARY ASSET (an icon, a wasm blob, a font) is normal and carries no
// obligation to stay in step, so counting it would bury the six that matter under noise nobody would read.
const WATCHED = /\.(mjs|js|jsx|ts|py|sh|bat|json|md|html|css|glsl|vert|frag)$/i;

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

export function walk(root = ROOT) {
    const out = [];
    (function rec(dir) {
        let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (SKIP.has(e.name)) continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) rec(p);
            else if (e.isFile() && WATCHED.test(e.name) && !/^SweK_Engine_v\d+\.zip$/.test(e.name)) out.push(p);
        }
    })(root);
    return out;
}

/** Groups of two or more files with identical bytes, as ROOT-RELATIVE paths, sorted for a stable baseline. */
export function findDuplicateGroups(root = ROOT) {
    const by = new Map();
    for (const p of walk(root)) {
        let b; try { b = fs.readFileSync(p); } catch { continue; }
        if (!b.length) continue;                       // an empty file matches every other empty file
        const k = b.length + ":" + sha(b);
        (by.get(k) || by.set(k, []).get(k)).push(path.relative(root, p).split(path.sep).join("/"));
    }
    return [...by.values()].filter((g) => g.length > 1).map((g) => g.sort()).sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * Re-check a baselined set of groups. PURE over an injected reader, so the gate can prove it on a fixture whose
 * answer is known BEFORE pointing it at the real tree -- v3450's rule, and v3494 used the same shape for the
 * GLSL extractor. A checker nobody checked makes every verdict below it meaningless.
 *
 * Returns { drifted, missing, intact }: DRIFTED means the surviving members no longer match each other;
 * MISSING names files that are gone. THEY ARE NEVER ADDED TOGETHER.
 */
export function checkGroups(groups, read) {
    const drifted = [], missing = [], intact = [];
    for (const g of groups) {
        const present = [], gone = [];
        for (const rel of g) { const b = read(rel); if (b === null) gone.push(rel); else present.push([rel, sha(b)]); }
        if (gone.length) missing.push({ group: g, gone });
        if (present.length > 1) {
            const h = present[0][1];
            const odd = present.filter(([, x]) => x !== h).map(([rel]) => rel);
            if (odd.length) drifted.push({ group: g, odd }); else intact.push(g);
        }
    }
    return { drifted, missing, intact };
}

export const readFrom = (root) => (rel) => {
    try { return fs.readFileSync(path.join(root, rel.split("/").join(path.sep))); } catch { return null; }
};

export function reportLines(root = ROOT) {
    const found = findDuplicateGroups(root);
    const out = [`${found.length} group(s) of byte-identical watched files`];
    for (const g of found) out.push(`  x${g.length}  ${g.join("  =  ")}`);
    out.push("", "A duplicate is not automatically a defect -- a vendored copy or a published package folder is a",
             "reasonable reason to have two. WHAT IS A DEFECT IS TWO COPIES THAT ARE MEANT TO STAY IN STEP AND",
             "NOTHING CHECKING THAT THEY DO. duplicateFiles-selfcheck holds the baseline that turns this list into",
             "a ratchet; this report exists so the list can be READ rather than only asserted.");
    return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    // *** THE NAME GOES IN BRACKETS BECAUSE toolFrontDoor DEMANDS IT IN THAT FORM, and it is right to: a report
    // with no name on it is unattributable the moment two of them share a terminal. My first version printed a
    // bare title and the front-door gate FAILED IT CORRECTLY -- the check was read rather than guessed at.
    console.log("[duplicateFiles] byte-identical copies in the SweK tree");
    for (const l of reportLines()) console.log(l);
}
