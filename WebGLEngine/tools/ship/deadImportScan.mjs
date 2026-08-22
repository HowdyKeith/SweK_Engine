// tools/ship/deadImportScan.mjs
//
// v3126 -- AN IMPORT THAT NAMES A FILE THAT IS NOT THERE.
//
// Found by accident while checking whether engine/'s 41 orphaned modules were safe to delete: engine/index.js
// re-exports World from ./world.js and Renderer from ./renderer.js, and NEITHER FILE EXISTS. It is a three-line
// barrel that would throw on its first import. Nothing imports it, so the breakage is latent -- which is exactly
// why nothing found it. A module that is never loaded never gets to fail.
//
// This is the same family as boundaryLint's rules: a claim about the outside world with no check behind it. The
// claim here is "these four modules exist", and resolving a relative specifier against the filesystem is the
// check. It cannot live in boundaryLint itself, because scanBoundaries() gets source text with no path context
// and a relative import cannot be resolved without knowing where the file is.
//
// SCOPE, deliberately narrow: STATIC relative specifiers only. A bare specifier is a package and belongs to npm;
// a dynamic import with a computed path cannot be resolved without running the program; a URL import is a
// network question. Each of those is a different check, and pretending one scan covers them all is how a lint
// starts lying.

import fs from "node:fs";
import path from "node:path";
import { noComments, codeOnly } from "./sourceScan.mjs";

const SKIP = /node_modules|(^|[\\/])vendor[\\/]|\.git|render-qa[\\/]out|[\\/]dist[\\/]|\.min\./;
const CODE = /\.(js|mjs)$/;

// import x from "./y"  |  export { x } from "./y"  |  import "./y"
//
// v3203 -- THE CHARACTER BEFORE `from` IS NOT ALWAYS WHITESPACE. This pattern required `\sfrom\s`, and main.js
// ALIGNS `from` IN A COLUMN: `import { VoxelMemoryGPU }      from "./gpu/VoxelMemoryGPU.js";`. When the exported
// name is long enough to consume every space of padding you get `import { MemoryHeatmapOverlay }from "..."`,
// which is valid JavaScript and was INVISIBLE to this scan. Exactly two imports in the tree are written that way
// and BOTH pointed at files that do not exist, so this pattern's blind spot was the whole reason nobody knew
// main.js could not link. removeCluster.mjs carried a COPY of this regex and built its reachability set with it,
// so a module reached only by such an import was deletable -- render/entityDebugRenderer.js was deleted that way.
// It is not a rare accident: it recurs the next time anybody adds a long name to an aligned import block.
// Now the character before `from` may be whitespace OR a closing brace, which is the only other thing that can
// legally sit there. Widened rather than parsed, because a parser is a dependency this tree does not carry --
// stated as a limit, not hidden: see specifiersIn's header for what a regex still cannot answer.
const SPEC = /(?:^|[\s;])(?:import|export)\s(?:[^"'`;]*?[\s}]from\s)?["'](\.[^"']+)["']/gm;
const REQ = /require\(\s*["'](\.[^"']+)["']\s*\)/g;
// A LITERAL dynamic import -- import("./y.js"). DISTINCT from a computed one, and the distinction is the point.
const DYN_LITERAL = /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g;
// EVERY import( call, literal or not. The COMPUTED count is this minus the literal ones.
//
// v3203 -- MY FIRST VERSION OF THIS WAS /import\(\s*[^"']/ -- "a paren not followed by a quote" -- and its own
// gate caught it: `import("./a/" + name + ".js")` BEGINS WITH A QUOTE, so it matched neither pattern and was
// counted as nothing at all. A concatenation whose first term is a literal looks literal, which is the same
// mistake in miniature as the hole this whole round is repairing. Counting by SUBTRACTION cannot have that gap:
// anything that is not an exactly-literal specifier is computed, whatever it starts with.
const DYN_ANY = /\bimport\s*\(/g;

export function walkCode(root, acc = []) {
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
        const p = path.join(root, e.name);
        if (SKIP.test(p)) continue;
        if (e.isDirectory()) walkCode(p, acc);
        else if (CODE.test(e.name)) acc.push(p);
    }
    return acc;
}

/** Resolve a relative specifier the way the browser and node ESM both would: exact path, then +.js/.mjs. */
export function resolves(fromFile, spec) {
    const base = path.resolve(path.dirname(fromFile), spec);
    for (const cand of [base, base + ".js", base + ".mjs", path.join(base, "index.js"), path.join(base, "index.mjs")]) {
        try { if (fs.statSync(cand).isFile()) return cand; } catch {}
    }
    return null;
}

/**
 * v3203 -- THE ONE DEFINITION OF "WHAT DOES THIS FILE REACH". Exported so removeCluster.mjs can IMPORT it
 * instead of keeping the second copy it kept until now. Two copies of this question is how the reporter and
 * the deleter came to have DIFFERENT BLIND SPOTS, which is how the tree could lose 65 modules and report clean
 * at the same time -- and this file's own v3126 header already says a lint with two definitions starts lying.
 *
 * Returns { statics, requires, dynamicLiteral, computed } where computed is a COUNT, not a list of targets,
 * because there are no targets to list: import(expr) cannot be resolved without running the program. THAT IS
 * THE HONEST LIMIT AND IT MUST TRAVEL WITH THE ANSWER -- a caller deleting files needs to know its reachability
 * picture is incomplete, and the previous version of this idea collected exactly that fact and then dropped it.
 *
 * WHAT A REGEX STILL CANNOT DO, said out loud so nobody reads this as complete: it cannot see a specifier built
 * from a variable, cannot tell an import inside dead code from a live one, and trusts noComments() to have
 * removed commentary. It is a strict improvement on three earlier holes, not a parser.
 */
export function specifiersIn(src) {
    // v3203 -- USE THE TREE'S OWN STRIPPER. The hand-rolled one here was
    // src.replace(/\/\*[\s\S]*?\*\//g," ") -- NOT STRING-AWARE, so a `/*` inside a string literal opened a
    // comment that ran to the next `*/`. MEASURED on main.js: it blanked 47.0% of the file in 61 matches, the
    // largest eating 248,013 bytes and opening with `/*</code>;` -- a fragment of an HTML string. THIRTEEN
    // perfectly ordinary imports were invisible because of it, and this is the SAME failure v3126 found in
    // server.js ("a naive block-comment stripper had eaten 71.7%") and fixed THERE. A fix applied to one tool
    // is not a fix to the class; sourceScan.mjs exists to be the single definition, so this now uses it.
    // noComments and NOT codeOnly: codeOnly blanks string literals too, and a specifier IS a string literal.
    const code = noComments(src);
    const out = { statics: [], requires: [], dynamicLiteral: [], computed: 0 };
    for (const [re, key] of [[SPEC, "statics"], [REQ, "requires"], [DYN_LITERAL, "dynamicLiteral"]]) {
        re.lastIndex = 0;
        for (const m of code.matchAll(re)) out[key].push(m[1]);
    }
    DYN_ANY.lastIndex = 0;
    let anyCount = 0;
    for (const _ of code.matchAll(DYN_ANY)) anyCount++;
    // Subtraction, not a second pattern. A negative would mean the two patterns disagree about what an
    // import( even is, which is a bug in this file rather than a fact about the source, so it is clamped and
    // would show up as a computed count of zero beside a non-zero literal count.
    out.computed = Math.max(0, anyCount - out.dynamicLiteral.length);
    return out;
}

/**
 * v3215 -- A FOURTH FORM OF "THIS FILE NEEDS THAT FILE", AND IT HAS ALREADY COST ONE.
 *
 * *** `new Worker(new URL("./x.js", import.meta.url))` IS NOT AN IMPORT, AND EVERY REACHABILITY INSTRUMENT IN
 * THIS TREE MISSES IT BY CONSTRUCTION. *** Not SPEC (no `import`/`export` keyword), not REQ, not DYN_LITERAL
 * (no `import(`), and orphanScan's substring match only sees it by luck. It is the v3202 hole one level out:
 * the target of a worker construction is invisible to the derivation.
 *
 * IT IS NOT HYPOTHETICAL. world/terrainWorkerClient.js line 40 spawns ./terrainGenWorker.js, THAT FILE DOES NOT
 * EXIST -- not in the tree and not in the v3211 zip -- and rleRegionVolume-selfcheck has been CRASHING with
 * ENOENT on it rather than reporting anything. The client demotes a dead worker, so the world still draws and
 * the failure is silent: the 61 try-guarded modules again, in a different syntax.
 *
 * FIVE SPAWN SITES IN THE TREE, ONE BROKEN. *** MY FIRST CENSUS SAID TWO AND THE SECOND WAS PROSE: *** a comment
 * in worker/chunkMesher.worker.js documents how its CALLER spawns it, and I matched the documentation. Stripped
 * through noComments() the count is five and the defect is one. THE PROSE-AS-CODE TRAP, twenty-somethingth
 * instance, committed while adding a scanner for a form that had escaped scanning.
 */
// *** v3679 -- PAGES, AND THEY ARE SCANNED BESIDE THE MODULES RATHER THAN THROUGH THEM. *** deadImportScan was
// one of the TWENTY tools v3614 found scanning a corpus that omits every HTML file, and the omission mattered
// here more than most: the claim this file makes is "these imports name files that exist", and 216 OF 379 PAGES
// CARRY MODULE IMPORTS -- 620 SITES. v3126's own story was a barrel that would throw on first import and never
// did because nothing loaded it; A PAGE IS THE CASE WHERE SOMETHING DOES LOAD IT.
//
// TWO THINGS DIFFER ON A PAGE AND BOTH ARE WHY THIS IS A SEPARATE FUNCTION RATHER THAN A WIDER SPEC:
//   1. THE SPECIFIERS ARE ABSOLUTE. SPEC only admits ones beginning with `.` and resolves() resolves relative to
//      the importing file, which for "/physics/livePanel.js" would reach the FILESYSTEM ROOT. A page's absolute
//      specifier is rooted at the SERVED DIRECTORY, which is WebGLEngine.
//   2. ONLY <script> BODIES ARE CODE. Scanning the markup would read prose as imports.
// WIDENING SPEC AND resolves INSTEAD WOULD HAVE MOVED EVERY OTHER CONSUMER OF THEM -- exportResolve,
// markerSingleSource, moduleRefs -- for a reason that has nothing to do with those tools. Kept separate so this
// round CANNOT move a verdict it is not about, and that separation is checked rather than asserted: the .js/.mjs
// readings are re-run and identical.
//
// AND THE SPECIFIER SHAPE IS THE DISCRIMINATOR, MEASURED THE HARD WAY: my first extractor matched `import` after
// any non-word character and accepted a specifier starting with `[./]`, which pulled `...VoxelWorld.js` out of a
// PROSE STRING in predictions.html and reported it as a broken import. A REAL SPECIFIER BEGINS `/`, `./` OR
// `../` -- three dots is not a path -- and that alone removes it. Prose-as-code, caught before it was believed.
const PAGE_SPEC = /(?:^|[\s;{])(?:import|export)\s(?:[^"'`;]*?[\s}]from\s)?["'](\.{0,2}\/[^"']+)["']/gm;

/** The <script> bodies of a page, joined. The markup is not code and must not be read as any. */
export function scriptBodies(src) {
    return [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
}

/** Resolve a page's specifier: absolute ones are rooted at the SERVED directory, relative ones at the page. */
export function resolvesFromPage(engineRoot, pageFile, spec) {
    const base = spec.startsWith("/") ? path.join(engineRoot, spec) : path.resolve(path.dirname(pageFile), spec);
    for (const cand of [base, base + ".js", base + ".mjs", path.join(base, "index.js"), path.join(base, "index.mjs")]) {
        try { if (fs.statSync(cand).isFile()) return cand; } catch {}
    }
    return null;
}

/** Every page whose inline scripts import a specifier that resolves to nothing. */
export function deadPageImports(engineRoot) {
    const out = [];
    for (const f of fs.readdirSync(engineRoot)) {
        if (!/\.html$/.test(f)) continue;
        const file = path.join(engineRoot, f);
        let code = "";
        try { code = noComments(scriptBodies(fs.readFileSync(file, "utf8"))); } catch { continue; }
        PAGE_SPEC.lastIndex = 0;
        for (const m of code.matchAll(PAGE_SPEC)) {
            if (!resolvesFromPage(engineRoot, file, m[1])) out.push({ page: f, spec: m[1] });
        }
    }
    return out;
}

export function workerSpecifiers(src) {
    // *** v3680 -- A SPAWN WRITTEN INSIDE A STRING IS A FIXTURE, NOT A SPAWN. *** This scan reads noComments and
    // NOT codeOnly, deliberately and correctly: a specifier IS a string literal, so blanking strings would blank
    // the thing being looked for. The cost is that it cannot tell a real `new Worker("./x.js")` from THE SAME
    // TEXT QUOTED INSIDE ANOTHER STRING -- and moduleRefs-selfcheck.mjs builds exactly that as the fixture for
    // its own resolver test. THE DETECTOR WAS COUNTING A TEST'S PROP AS A BROKEN SPAWN, and reported it as the
    // one UNEXPLAINED worker in the tree for many rounds. THE DEFECT LANDING ON THE FILE STUDYING IT -- the
    // same shape v3677 found when gateQuality counted its own sabotage fixture.
    //
    // THE DISCRIMINATOR IS MECHANICAL AND NEEDS NO LIST: codeOnly blanks string CONTENTS but keeps the code
    // around them, so a REAL spawn survives it as `new Worker("")` while a spawn nested inside a string
    // DISAPPEARS WITH ITS HOST. If a file contains no surviving spawn call, every specifier the looser scan
    // found in it is a fixture.
    //
    // KNOWN LIMIT, MEASURED RATHER THAN ASSUMED: this is FILE-scoped, so a file holding BOTH a real spawn and a
    // fixture would keep both. NO SUCH FILE EXISTS TODAY -- all six spawn sites were checked, five are real and
    // one is all-fixture, none is mixed -- and if one ever appears this under-reports rather than inventing a
    // spawn, which is the safe direction for a check whose whole subject is a claim about the outside world.
    if (!/new\s+Worker\s*\(/.test(codeOnly(src))) return [];
    const out = [];
    for (const m of noComments(src).matchAll(/new\s+Worker\s*\(\s*(?:new\s+URL\s*\(\s*)?["'](\.[^"']+)["']/g)) out.push(m[1]);
    return out;
}

/**
 * v3211 -- THE SECOND HALF OF THE SAME QUESTION, AND NOTHING HAS EVER ASKED IT.
 *
 * specifiersIn answers "what does this file reach". IT DOES NOT ASK WHETHER THE THING IT REACHES HAS THE NAMES
 * IT ASKED FOR -- and step 6 found the cost: nine files write `import { MODES } from "./deviceModes.mjs"`,
 * deviceModes.mjs exports CANDIDATE_MODES / modesOf / modeCensus and has NEVER exported MODES, and SEVENTEEN
 * gates die on import. deadImportScan reported the specifier as resolving, which it does. The FILE is there.
 * The NAME is not.
 *
 * *** THE IDEA IS BORROWED AND THE SOURCE IS WORTH NAMING: microsoft/dynwinrt's thesis is "regenerate, don't
 * rebuild" -- generate the binding from the metadata so a hand-authored wrapper CANNOT DRIFT from what it
 * wraps. SweK cannot adopt codegen, but A HAND-WRITTEN IMPORT IS A HAND-AUTHORED WRAPPER, and the cheap version
 * of that idea is to check it against the export list instead of generating it. ***
 *
 * Returns [{ specifier, names }] for the NAMED bindings only. `default` and namespace imports are deliberately
 * excluded: a default import binds whatever the module default-exports under a local name of the importer's
 * choosing, so there is no name to check, and `import * as ns` cannot be checked without following every
 * property access. CHECKING ONLY WHAT CAN BE CHECKED is the difference between a gate people keep and one they
 * switch off.
 */
export function namedImportsIn(src) {
    const code = noComments(src);
    const out = [];
    const take = (clause, spec) => {
        const m = clause.match(/\{([^}]*)\}/);
        if (!m) return;
        const names = m[1].split(",").map((x) => x.trim()).filter(Boolean)
            .map((x) => x.split(/\s+as\s+/)[0].trim())
            .filter((x) => x && x !== "default" && /^[A-Za-z_$][\w$]*$/.test(x));
        if (names.length) out.push({ specifier: spec, names });
    };
    for (const m of code.matchAll(/import\s+([^;'"]*?)\s+from\s+["'](\.[^"']+)["']/g)) take(m[1], m[2]);
    // A RE-EXPORT IS AN IMPORT FOR THIS PURPOSE: `export { a } from "./x"` fails at load exactly as an import
    // does, and leaving it out would have made the gate blind to a whole form of the same defect.
    for (const m of code.matchAll(/export\s*\{([^}]*)\}\s*from\s+["'](\.[^"']+)["']/g)) take("{" + m[1] + "}", m[2]);
    // *** AND THE DESTRUCTURED DYNAMIC IMPORT, WHICH IS THE FORM WITH THE WORST CONSEQUENCE. ***
    //     const { MODES } = await import("../tools/roundhouse/deviceModes.mjs");
    // A STATIC missing name is a SyntaxError at load -- loud, immediate, seventeen gates screaming. A DYNAMIC
    // one binds `undefined` and carries on, so ai-bridge/fingerprintBridge.js has been handing `undefined` to
    // the job-spec validator on every POST /jobs/add and saying nothing. THE LOUDER FAILURE WAS THE SAFER ONE,
    // and the quiet one is on the live server rather than in a gate. My first version of this scan read only
    // the two static forms and missed it; it was found by reading the code around the defect, not by the tool.
    for (const m of code.matchAll(/(?:const|let|var)\s*(\{[^}]*\})\s*=\s*await\s+import\s*\(\s*["'](\.[^"']+)["']\s*\)/g)) take(m[1], m[2]);
    return out;
}

/**
 * Every name a module makes importable, following `export * from` transitively.
 *
 * *** MY FIRST VERSION OF THIS REPORTED THIRTY MISSING IMPORTS AND TWENTY-ONE OF THEM WERE MINE. *** It matched
 * `export\s+(const|let|var)\s+(NAME)` and stopped, so
 *     export const RLE_SX = 32, RLE_SY = 256, RLE_SZ = 32, RLE_N = RLE_SX * RLE_SY * RLE_SZ;
 * declared ONE export instead of FOUR, and voxel/rleSurface.js and voxel/rleSideFaces.js -- which have been
 * importing those names correctly forever -- came back as defects. A 70% FALSE-POSITIVE RATE FROM ONE MISSING
 * CASE, and a gate that shipped with it would have been switched off within a day. The declarator list is now
 * split on TOP-LEVEL commas, because the initialisers contain commas of their own inside (), [] and {}.
 *
 * RETURNS null WHEN THE ANSWER CANNOT BE KNOWN rather than an empty set: a CommonJS module assigning
 * module.exports cannot be enumerated by reading it, and an empty set would make every importer of it look
 * broken. THE REFUSAL IS THE ANSWER -- an unknown export list means the caller must skip, not fail.
 */
export function exportedNames(file, seen = new Set()) {
    if (seen.has(file)) return new Set();
    seen.add(file);
    let src;
    try { src = noComments(fs.readFileSync(file, "utf8")); } catch { return null; }
    if (/module\.exports\s*=/.test(src) || /\bexports\.[A-Za-z_$]/.test(src)) return null;   // CJS: unknowable here
    const names = new Set();
    for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([\s\S]*?);/g)) {
        let depth = 0, cur = "";
        const parts = [];
        for (const ch of m[1]) {
            if ("([{".includes(ch)) depth++;
            else if (")]}".includes(ch)) depth--;
            if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
            cur += ch;
        }
        parts.push(cur);
        for (const part of parts) {
            const t = part.trim();
            const id = t.match(/^([A-Za-z_$][\w$]*)/);
            if (id) { names.add(id[1]); continue; }
            const d = t.match(/^[{[]([^}\]]*)[}\]]/);          // export const { a, b } = ... / [a, b] = ...
            if (d) for (const n of d[1].split(",")) {
                const nm = n.trim().split(/\s*:\s*/).pop().trim();
                if (/^[A-Za-z_$][\w$]*$/.test(nm)) names.add(nm);
            }
        }
    }
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
        for (const part of m[1].split(",")) {
            const t = part.trim(); if (!t) continue;
            const as = t.split(/\s+as\s+/);
            names.add((as[1] || as[0]).trim());
        }
    }
    if (/export\s+default/.test(src)) names.add("default");
    for (const m of src.matchAll(/export\s*\*\s*from\s+["'](\.[^"']+)["']/g)) {
        const t = resolves(file, m[1]);
        if (!t) continue;
        const sub = exportedNames(t, seen);
        if (sub === null) return null;                       // an unknowable re-export makes the whole list unknowable
        for (const n of sub) names.add(n);
    }
    return names;
}

/**
 * Every named import in the tree whose target resolves but does not export that name.
 *
 * Reports the three SKIP reasons separately instead of folding them into the total, because "checked and
 * clean", "could not resolve the file" and "target is CommonJS" are three different states and a single number
 * would hide which one grew.
 */
export function unresolvedNamedImports(root) {
    const files = walkCode(root);
    const missing = [];
    let checked = 0, cjs = 0, unresolved = 0;
    const cache = new Map();
    for (const f of files) {
        let src;
        try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
        for (const { specifier, names } of namedImportsIn(src)) {
            const target = resolves(f, specifier);
            if (!target) { unresolved += names.length; continue; }
            if (!cache.has(target)) cache.set(target, exportedNames(target));
            const ex = cache.get(target);
            if (ex === null) { cjs += names.length; continue; }
            for (const n of names) {
                checked++;
                if (!ex.has(n)) missing.push({ file: path.relative(root, f), specifier, name: n, target: path.relative(root, target) });
            }
        }
    }
    return { files: files.length, checked, cjs, unresolved, missing };
}

/** Every relative specifier in a file, whichever of the three forms it took. Order is not meaningful. */
export function allSpecifiers(src) {
    const s = specifiersIn(src);
    return [...s.statics, ...s.requires, ...s.dynamicLiteral];
}

export function deadImportScan(root) {
    const files = walkCode(root);
    const dead = [];
    for (const f of files) {
        let src; try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
        const code = noComments(src);
        for (const m of code.matchAll(SPEC)) {
            const spec = m[1];
            if (resolves(f, spec)) continue;
            dead.push({ file: path.relative(root, f).replace(/\\/g, "/"), spec });
        }
    }
    return { dead, scanned: files.length };
}
