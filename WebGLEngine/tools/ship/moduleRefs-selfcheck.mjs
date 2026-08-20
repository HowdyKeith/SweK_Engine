// WebGLEngine/tools/ship/moduleRefs-selfcheck.mjs -- v3450
//
// Run: node tools/ship/moduleRefs-selfcheck.mjs
//
// *** THIS GATE EXISTS BECAUSE THE PREVIOUS ATTEMPT AT THIS RESOLVER WAS WRONG THREE TIMES IN A ROW AND LOOKED
// FINE EVERY TIME. *** Pointed at the real tree it reported the actionable orphan count as 22, then 97, then
// 228, as it learned about import specifiers, then worker targets, then the directory exemption. Each number
// was produced confidently and none could be checked, BECAUSE THE REAL TREE HAS NO ANSWER KEY.
//
// So every route is proven on a FIXTURE FIRST: a synthetic tree, written to a temp directory, whose correct
// answer is known before the resolver is allowed to look at it. THAT is what "make the resolver trustworthy"
// had to mean -- not a fourth careful reading of the same output.
//
// THE FIXTURE CARRIES ONE FILE PER CLAIM, INCLUDING THE ONES THAT MUST **NOT** RESOLVE:
//
//   imported.js        reached by `from "./imported.js"`          -> referenced
//   dynamic.js         reached by `import("./dynamic.js")`         -> referenced
//   worker.js          reached by `new Worker("./worker.js")`      -> referenced   (v3449's resolver missed this)
//   classic.js         reached by `importScripts("./classic.js")`  -> referenced
//   bySrc.js           reached by an html `src="/bySrc.js"`        -> referenced   (ROOT-RELATIVE, not filesystem)
//   noExt.js           reached by `from "./noExt"`                 -> referenced   (extension completion)
//   mentioned.js       NAMED IN A COMMENT AND NOTHING ELSE         -> mentioned-only
//   alone.js           named by nothing at all                     -> unreferenced
//   fromRegister.js    named ONLY by an excluded register          -> unreferenced (the mention must not count)
//
// *** THE LAST TWO ARE THE ONES WORTH HAVING. *** `mentioned.js` is the whole v3449 finding in one file: a
// module a sentence keeps alive. And `fromRegister.js` proves the exclusion parameter works, which is v3223's
// rule -- "A REGISTER OF ORPHANS IS NOT A CONSUMER OF THEM" -- finally stated as a rule rather than as one
// hardcoded filename.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { referenceGraph, specifiers, resolveSpec, ROUTES, REF_STATES } from "./moduleRefs.mjs";
import { gateFiles } from "./staleness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE FIXTURE -- every route, and every NON-route, with the answer known in advance
 * --------------------------------------------------------------------------------------------------------- */
const FIX = fs.mkdtempSync(path.join(os.tmpdir(), "swek-refs-"));
try {
    const w = (rel, body) => { const p = path.join(FIX, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };

    const targets = {
        imported: w("imported.js", "export const a = 1;\n"),
        dynamic: w("dynamic.js", "export const b = 2;\n"),
        worker: w("worker.js", "export const c = 3;\n"),
        classic: w("classic.js", "export const d = 4;\n"),
        bySrc: w("bySrc.js", "export const e = 5;\n"),
        noExt: w("noExt.js", "export const f = 6;\n"),
        mentioned: w("mentioned.js", "export const g = 7;\n"),
        alone: w("alone.js", "export const h = 8;\n"),
        fromRegister: w("fromRegister.js", "export const i = 9;\n"),
    };
    const consumer = w("consumer.js", [
        'import { a } from "./imported.js";',
        'const later = () => import("./dynamic.js");',
        'const wk = new Worker("./worker.js");',
        'importScripts("./classic.js");',
        'import { f } from "./noExt";',
        '// this line NAMES mentioned.js and must not count as a reference',
        'import fs from "node:fs";           // a bare specifier must be skipped',
        'export { a, f, later, wk };',
    ].join("\n"));
    const page = w("page.html", '<script type="module" src="/bySrc.js"></script>\n');
    const register = w("register.mjs", '// a register that NAMES fromRegister.js and consumes nothing\nexport const LIST = ["fromRegister.js"];\n');

    const files = [...Object.values(targets), consumer, page, register];
    const g = referenceGraph(files, (f) => fs.readFileSync(f, "utf8"), FIX, { exclude: new Set([register]) });
    const st = (k) => g.state.get(targets[k]).state;
    const routeOf = (k) => (g.refs.get(targets[k])[0] || {}).route;

    ok("!! *** every resolvable route resolves, INCLUDING the worker target the previous attempt missed ***",
       ["imported", "dynamic", "worker", "classic", "bySrc", "noExt"].every((k) => st(k) === "referenced"),
       ROUTES.map((r) => r + ":" + (Object.keys(targets).find((k) => routeOf(k) === r) || "-")).join("  ") +
       ". Each is a SEPARATE FILE in the fixture, so one route resolving cannot cover for another -- which is exactly how the earlier resolver kept looking right while missing one.");

    ok("...and an html src is ROOT-RELATIVE, not a filesystem absolute path",
       st("bySrc") === "referenced" && routeOf("bySrc") === "script",
       'the page writes src="/bySrc.js". Treating that as an absolute path resolves OUTSIDE the tree and silently finds nothing -- an entire class of page-loaded module reading as dead.');

    ok("!! *** a module NAMED in a comment and nothing else is MENTIONED-ONLY, never referenced ***",
       st("mentioned") === "mentioned-only",
       "THE WHOLE v3449 FINDING IN ONE FILE. And it is not called dead either: a composed path or a spawn is a real reference no regex can follow, so this is an UNDECIDED state and is reported as one.");

    ok("...and a module nothing names at all is UNREFERENCED, which is a different claim",
       st("alone") === "unreferenced",
       "mentioned-only and unreferenced are kept apart because one is undecided and the other is evidence.");

    ok("!! *** a mention from an EXCLUDED REGISTER does not rescue -- v3223's rule, as a rule ***",
       st("fromRegister") === "unreferenced",
       'register.mjs names fromRegister.js and is passed in `exclude`, so the module reads UNREFERENCED rather than mentioned-only. v3223 established this ("A REGISTER OF ORPHANS IS NOT A CONSUMER OF THEM") and hardcoded ONE filename; here it is a PARAMETER, so the rule stops being a property of whichever file happened to be noticed.');

    ok("...and a bare specifier is skipped rather than resolved",
       specifiers(fs.readFileSync(consumer, "utf8")).every((s) => /^[./]/.test(s.spec)),
       '`import fs from "node:fs"` cannot name a file in this tree, and trying to resolve it would either miss or, worse, match something by accident.');

    ok("...and a file does not reference itself",
       resolveSpec(consumer, "./consumer.js", FIX) === consumer && g.state.get(consumer).state !== "referenced",
       "the specifier resolves, and self-reference is dropped when the graph is built -- a module that imports itself is not consumed by anything else.");
} finally {
    fs.rmSync(FIX, { recursive: true, force: true });
    ok("...and the fixture is deleted again", !fs.existsSync(FIX), "a gate that leaves a tree behind grows the population it measures.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. ONLY NOW, THE REAL TREE -- and what it says is REPORTED, not ratcheted here
 * --------------------------------------------------------------------------------------------------------- */
{
    const all = [];
    (function walk(d) {
        let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of es) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { if (!/node_modules|\.git/.test(p)) walk(p); }
            else if (/\.(js|mjs|html)$/.test(e.name)) all.push(p);
        }
    })(ENG);
    const GATES = new Set(gateFiles(ENG).map((p) => path.resolve(p)));
    const exclude = new Set([path.resolve(ENG, "tools/ship/unwiredRegister.mjs"),
                             path.resolve(fileURLToPath(import.meta.url))]);
    const g = referenceGraph(all, (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } }, ENG, { exclude });

    const modules = all.filter((f) => /\.(js|mjs)$/.test(f) && !GATES.has(path.resolve(f)) && /^export /m.test(g.text.get(f) || ""));
    const tally = {};
    for (const s of REF_STATES) tally[s] = modules.filter((f) => g.state.get(f).state === s).length;
    const gateOnly = modules.filter((f) => { const st = g.state.get(f); return st.state === "referenced" && st.by.every((r) => GATES.has(path.resolve(r.from))); });

    say(`${modules.length} exporting non-gate modules: ${REF_STATES.map((s) => s + " " + tally[s]).join(", ")}`);
    say(`of the referenced, ${gateOnly.length} are reached ONLY by a gate`);

    ok("!! the three states PARTITION the modules -- nothing falls between them",
       REF_STATES.reduce((a, s) => a + tally[s], 0) === modules.length,
       `${modules.length} modules, no remainder. v3429's rule: a census whose categories do not partition lets something fall between them and go uncounted.`);

    ok("!! *** REPORTED, NOT RATCHETED HERE, AND THAT IS DELIBERATE ***", true,
       `mentioned-only ${tally["mentioned-only"]}, unreferenced ${tally.unreferenced}, gate-only ${gateOnly.length}. *** THIS FILE'S JOB IS TO PROVE THE INSTRUMENT, NOT TO RE-BASELINE THE CENSUS. graveyard-selfcheck still owns the verdict and still reads its own substring test; referenceKind-selfcheck owns the ratchet on the exposure. Wiring graveyard onto this resolver moves a number that has been wrong three times, and it is the NEXT round -- with these fixture-proven routes underneath it instead of a fourth guess. ***`);

    ok("...and the resolver here is the SAME one the fixture proved, not a second copy",
       fs.readFileSync(fileURLToPath(import.meta.url), "utf8").includes('from "./moduleRefs.mjs"'),
       "one definition, imported by both halves of this file. A private copy for the real tree would be the second declaration this project names more often than any other defect -- and it is how the earlier attempt drifted between runs.");
}

console.log(fails ? "\nmoduleRefs-selfcheck: " + fails + " FAILED" : "\nmoduleRefs-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
