// tools/ship/removeCluster.mjs
//
// v3126 -- DELETE A VERIFIED-UNREACHABLE CLUSTER, AND VERIFY IT AGAIN FIRST.
//
//   node tools/ship/removeCluster.mjs engine          # DRY RUN -- lists what would go, deletes nothing
//   node tools/ship/removeCluster.mjs engine --apply  # actually delete
//
// WHY THIS DOES NOT TRUST orphan-baseline.json. The baseline is a text-match result, and text matching is the
// wrong instrument for an irreversible action -- it has been wrong six times while this scanner was being built,
// most recently flagging 24 MOUNTED bridges because a comment stripper ate server.js. Worse in the other
// direction: engine/index.js is genuinely unreachable AND has two broken imports, and the baseline does NOT list
// it, because the basename "index" appears in hundreds of files and matched everywhere.
//
// So this re-derives reachability by RESOLUTION: every static relative import in the tree is resolved to an
// absolute file, and a candidate is deletable only if no resolved import lands on it. That is the same question
// the module loader asks, which is the question that actually matters when the file stops existing.
//
// It still refuses to be clever. Dynamic imports with computed paths cannot be resolved without running the
// program.
//
// v3203 -- THE SENTENCE THAT USED TO SIT HERE WAS FALSE, AND IT IS THE MOST INSTRUCTIVE THING IN THIS FILE.
// It claimed that "any file whose name appears inside a template literal or a variable specifier is REFUSED
// rather than deleted, and says so". Nothing refused. The computed-import scan produced a printed NOTE and the
// delete loop never read it. A DOCUMENTED CLAIM WITH NO CHECK BEHIND IT -- which is the exact category
// boundaryLint exists to hunt, sitting unexamined in boundaryLint's sibling for 77 versions, and it read as a
// safety guarantee to everybody who ran this tool including me. Now --apply genuinely refuses while any
// computed import is unaccounted for, and the refusal names the flag that overrides it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkCode, resolves, specifiersIn } from "./deadImportScan.mjs";
import { archiveBeforeDelete } from "./deletionArchive.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
/**
 * Every file that any import in the tree actually resolves to -- static, require, OR literal dynamic.
 *
 * v3203 -- THIS FUNCTION DELETED 66 LIVE MODULES AND THE CAUSE WAS A MISSING CASE, NOT A WHITESPACE ACCIDENT.
 *
 * It used to build `reached` from a LOCAL COPY of two regexes: static import/export statements, and require.
 * `import("./ui/PerfHUD.js")` matches NEITHER -- the static pattern needs `(?:import|export)\s` and `import(`
 * has a paren where the space should be. So THE TARGET OF EVERY LITERAL DYNAMIC IMPORT WAS INVISIBLE TO THE
 * REACHABILITY ANSWER, BY CONSTRUCTION. There was a third regex for computed specifiers, and all it did was push
 * the IMPORTING file onto a `dynamicSuspects` list that plan() returned and NEVER CONSULTED -- a report that
 * protected nothing, and the wrong quantity anyway, since it named the importer rather than the imported.
 * MEASURED: 98 modules in the v3158 tree were reached only that way; 66 of them are absent by v3202, including
 * fireSystem, kaijuAttackFx, PerfHUD, CascadedShadowPass and the whole optional-feature layer. brain/blobAutoTrain
 * (restored at v3201) and ui/knownState.js (noticed at v3176) were the SAME HOLE, so those were never three
 * separate incidents.
 *
 * AND THE GUARD IS WHY IT WAS SILENT: 61 of those call sites sit inside try{}, because loading an optional
 * feature behind a guard is CORRECT. The correctness is what made 66 features vanish without a console line.
 * A guarded optional import is indistinguishable from a feature that was never built.
 *
 * THE INVERSION WORTH REMEMBERING: this file re-derives by RESOLUTION rather than trusting the text-match
 * baseline BECAUSE resolution is the stronger instrument for an irreversible action. Here the stronger
 * instrument was the one with the hole -- orphanScan's crude t.includes(base) would have seen every one of them.
 * A stronger method with a missing case is weaker than a crude method with none, and the confidence it buys is
 * exactly what makes it dangerous.
 *
 * It now imports specifiersIn from deadImportScan rather than keeping a second copy. TWO DEFINITIONS OF ONE
 * QUESTION IS HOW THE DELETER AND THE REPORTER CAME TO HAVE DIFFERENT BLIND SPOTS.
 */
export function reachableSet(root) {
    const reached = new Set();
    // WHICH FORM reached it, because "a static import resolves to it" was printed for files reached ONLY by a
    // dynamic import -- a wrong explanation of a correct decision, and the next person to audit a keep list
    // would have gone looking for a static import that was never there.
    const reachedBy = new Map();
    const computedFiles = [];
    let computedCount = 0;
    for (const f of walkCode(root)) {
        let src; try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
        const s = specifiersIn(src);
        for (const [form, list] of [["static", s.statics], ["require", s.requires], ["dynamic import()", s.dynamicLiteral]]) {
            for (const spec of list) {
                const t = resolves(f, spec);
                if (!t) continue;
                const abs = path.resolve(t);
                reached.add(abs);
                if (!reachedBy.has(abs)) reachedBy.set(abs, new Set());
                reachedBy.get(abs).add(form);
            }
        }
        if (s.computed > 0) { computedCount += s.computed; computedFiles.push(path.relative(root, f).replace(/\\/g, "/")); }
    }
    // dynamicSuspects is KEPT UNDER ITS OLD NAME so existing callers and gates do not silently read undefined,
    // but it is no longer the only thing said about computed imports -- see plan()'s `incomplete` flag.
    return { reached, reachedBy, dynamicSuspects: computedFiles, computedCount };
}

/** Also treat any file NAMED in an HTML/JSON/script string as untouchable -- a page may load it by URL. */
function namedInMarkup(root, rel) {
    const base = path.basename(rel);
    for (const f of walkCode(root, [])) { /* code handled by resolution */ }
    const stack = [root];
    while (stack.length) {
        const d = stack.pop();
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            // v3126 -- A FILE THAT RECORDS REFERENCES DOES NOT MAKE THEM. orphan-baseline.json lists every
            // orphan path, so including it here marked all 41 engine/ candidates "named in markup" and the two
            // methods disagreed 41-to-14 for no real reason. Seventh time in this work that something DESCRIBING
            // the code was mistaken for something USING it -- the scanner's own header, prose docs, its output,
            // its gate's message strings, and now this.
            if (/node_modules|\.git|[\\/]vendor[\\/]|orphan-baseline\.json/.test(p)) continue;
            if (e.isDirectory()) { stack.push(p); continue; }
            if (!/\.(html|json|sh|bat|command)$/.test(e.name)) continue;
            let t; try { t = fs.readFileSync(p, "utf8"); } catch { continue; }
            if (t.includes(rel) || t.includes(base)) return path.relative(root, p).replace(/\\/g, "/");
        }
    }
    return null;
}

export function plan(root, dir) {
    const { reached, reachedBy, dynamicSuspects, computedCount } = reachableSet(root);
    const prefix = path.join(root, dir) + path.sep;
    const inDir = walkCode(root).filter((f) => f.startsWith(prefix));

    const del = [], keep = [];
    for (const f of inDir) {
        const rel = path.relative(root, f).replace(/\\/g, "/");
        if (reached.has(path.resolve(f))) {
            const forms = [...(reachedBy.get(path.resolve(f)) || ["an import"])].join(" + ");
            keep.push({ rel, why: forms + " resolves to it" });
            continue;
        }
        const markup = namedInMarkup(root, rel);
        if (markup) { keep.push({ rel, why: "named in " + markup }); continue; }
        del.push(rel);
    }
    // INCOMPLETE IS NOT THE SAME AS EMPTY. While any computed import() exists anywhere in the tree, the
    // reachability picture cannot be complete, and a caller about to delete files irreversibly is entitled to
    // that fact as a FLAG rather than as a line of prose it may or may not print.
    return { del, keep, dynamicSuspects, computedCount, incomplete: computedCount > 0, scanned: inDir.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const dir = process.argv[2];
    const apply = process.argv.includes("--apply");
    if (!dir) { console.error("usage: removeCluster.mjs <dir-under-WebGLEngine> [--apply]"); process.exit(2); }
    const p = plan(ENG, dir);
    console.log(`${dir}/ -- ${p.scanned} modules scanned`);
    console.log(`  KEEP ${p.keep.length}:`);
    for (const k of p.keep.slice(0, 12)) console.log(`    ${k.rel}  (${k.why})`);
    if (p.keep.length > 12) console.log(`    ...and ${p.keep.length - 12} more`);
    console.log(`  DELETE ${p.del.length}:`);
    for (const d of p.del) console.log(`    ${d}`);
    if (p.incomplete) {
        console.log(`  INCOMPLETE: ${p.computedCount} computed import() call(s) across ${p.dynamicSuspects.length} file(s).`);
        console.log(`  A name built at run time cannot be resolved here, so this DELETE list is an UPPER BOUND, not a verdict.`);
    }
    if (!apply) { console.log("\nDRY RUN -- nothing deleted. Re-run with --apply."); process.exit(0); }
    // THE REFUSAL THE HEADER USED TO ONLY CLAIM. A dry run always prints; an irreversible delete stops.
    if (p.incomplete && !process.argv.includes("--accept-incomplete-reachability")) {
        console.error("\nREFUSED: reachability is incomplete -- see INCOMPLETE above.");
        console.error("Any of those computed specifiers could name a file in this DELETE list, and nothing here can tell.");
        console.error("Read the listed files, then re-run with --accept-incomplete-reachability to proceed anyway.");
        process.exit(3);
    }
    // v3207 -- THE WAY BACK IS WRITTEN BEFORE ANYTHING IS REMOVED, AND IF IT CANNOT BE WRITTEN NOTHING IS.
    // Keith: "i should have made sure when we deleted files before, that they exported and zipped up, just in
    // case." This tool deleted 66 live modules and the bug was bad -- BUT THE BUG BEING UNRECOVERABLE IS WHAT
    // MADE IT A MONTH. Recovery cost 43 versions of not noticing, two zip diffs, three convergence passes and
    // a 203-archive sweep across two drives. A zip written HERE would have made it one unzip.
    // archiveBeforeDelete THROWS rather than warning, on purpose: "the archive failed" must not be something a
    // caller prints and steps past, which is the exact shape of every near-miss in this tree.
    const saved = archiveBeforeDelete(ENG, p.del, {
        reason: "removeCluster " + dir + (p.incomplete ? " (reachability INCOMPLETE: " + p.computedCount + " computed import() call(s))" : ""),
        tag: "removeCluster",
    });
    if (saved) console.log(`  recovery archive: ${path.relative(ENG, saved.path)}  (${saved.count} file(s))`);
    for (const d of p.del) fs.rmSync(path.join(ENG, d), { force: true });
    console.log(`\ndeleted ${p.del.length} files.`);
}
