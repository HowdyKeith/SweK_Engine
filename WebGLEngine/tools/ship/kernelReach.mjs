// WebGLEngine/tools/ship/kernelReach.mjs -- v4589
//
// *** CAN ANYTHING BUT A GATE RUN THIS KERNEL? ***
//
// v4588 found that fx/fsr's EASU and RCAS had been validated on a real adapter, held to a CPU reference to
// 2.98e-7, and could not be dispatched by anything outside their own gate -- the gate built the buffers, the
// pipeline and the dispatch inline, and that was the only code in the tree that ran them. That was written up as
// one file's story. IT IS A POPULATION, AND THIS MODULE MEASURES IT: 17 dispatchable kernels in 11 files are
// reachable only from a gate, and TEN OF THEM ARE THE TEMPORAL ARC -- five rounds of kernels (v4552-v4570) that
// nothing in the engine can run.
//
// ---- WHAT THIS IS NOT, BECAUSE TWO NEIGHBOURS ANSWER DIFFERENT QUESTIONS -----------------------------------
//
// tools/ship/wgslCorpus.mjs's census() asks "is this producer in the cross-backend corpus" -- COVERAGE, whether
// two backends are compared on it. tools/ship/shaderRefs.mjs asks "does anything LOAD this shader file" -- and
// its subject is .glsl/.wgsl FILES, which is the corpus the orphan census could not see. Neither asks whether
// production code can cause a dispatch. The POPULATION here is census()'s, imported rather than re-walked: that
// walker has been wrong three times for three different reasons (a root outside the scan, a file type with no
// export, and the `export { A, B }` spelling that hid twelve of the temporal arc's own kernels), and each fix
// lives there. A second walker would inherit none of them.
//
// ---- HOW THE NUMBER WAS ARRIVED AT, WHICH IS MOST OF WHAT THIS FILE KNOWS -----------------------------------
//
// The first measurement said 67. It was wrong five times over, and each wrong answer was a KIND of reachability
// the instrument could not see. In order, with what each cost:
//
//   67 -> 41  PROBES ARE NOT DEBT. Eighteen kernels exist to be dispatched BY a gate -- texelProbe's five,
//             cullProbeWgsl, blackbodyProbeWgsl, WGSL_HMC_PROBE. Having no runtime caller is their design.
//             Counting them made the finding a third bigger than the tree's actual problem.
//   41 -> 34  A MODULE CAN DISPATCH ITS OWN KERNEL. gpuHaul, gpuOrbits and bloomFused define the WGSL and run
//             it in the same file, so "nobody imports the symbol" says nothing.
//   34 -> 31  TWO NAMES, ONE KERNEL. render/worleyWgsl.mjs exports `worleyWgsl()` AND
//             `WORLEY_WGSL = worleyWgsl()`. orrery-gpu.html imports the function; the constant looked dead and
//             is the same shader. Producers are deduped by the TEXT THEY PRODUCE, not by symbol.
//   31 -> 17  A KERNEL CAN TRAVEL BY DATA. render/fleets.mjs never dispatches: it puts HOLO_WGSL into a
//             materials table that something else reads. A use site inside a reachable module is reachability,
//             and a dispatch-call regex cannot see one.
//
// *** THAT SEQUENCE IS THE INSTRUMENT'S REAL DOCUMENTATION. *** Each refinement made the finding smaller, which
// is the direction that costs something to publish and the only direction that argues the number is real. A
// census that shrinks by 74% under its author's own scrutiny and is reported at 67 would have been a bigger
// headline and a worse measurement.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { noComments } from "./sourceScan.mjs";   // v4637 -- see useSites
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
// *** IMPORTED, NOT SPELLED. *** The first draft walked the tree with its own `/\.(mjs|js|html)$/`, and
// tools/ship/shaderRefs.mjs counts hand-spelled copies of exactly that set: 18 of them, under the note "as
// callers import SOURCE_EXT this number FALLS -- DO NOT RAISE IT past 11". *** MY COPY DID NOT SHOW UP IN THE
// 18, WHICH IS WORSE THAN SHOWING UP: *** the detector matches the literal text /\.(js|mjs|html)$/ and I had
// written the alternatives in a different order, so the tree gained a nineteenth copy that its own counter
// could not see. corpusFilters-selfcheck already records the general form of this -- "ONE SET, TWO TEXTS, which
// is the proof that spelling is not meaning" -- and the remedy it names is this import.
import { SOURCE_EXT } from "./moduleRefs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENG = path.resolve(HERE, "..", "..");
const SKIP = /node_modules|[\\/]\.git|[\\/]vendor|GPU_Assets/;

export const isGate = (f) => /-selfcheck\.mjs$/.test(f);
export const isTool = (f) => f.startsWith("tools/ship/") || f.startsWith("tools/fingerprint/");

/**
 * A PROBE is a kernel written for a gate to dispatch; a FRAGMENT has no entry point and cannot be dispatched at
 * all (temporalCorpus says the same of LUMA_WGSL and YCOCG_WGSL: "spliced into the kernels below"). Neither owes
 * a runtime caller, and both are reported separately rather than dropped -- a class excluded silently is a class
 * nobody can argue with.
 */
export const FRAGMENTS = Object.freeze(["LUMA_WGSL", "YCOCG_WGSL", "PLANCK_FN_WGSL", "HEIDLER_FN_WGSL",
                                        "LYAPUNOV_FN_WGSL", "SNOISE2_WGSL", "CULL_FN_WGSL", "OCC_FN_WGSL"]);
export const classOf = (symbol) =>
    /probe|PROBE|_MARKS$|_KEY_WGSL$/i.test(symbol) ? "probe" : FRAGMENTS.includes(symbol) ? "fragment" : "kernel";

/**
 * References to `sym` in `src` that are neither its declaration nor a bare re-export nor a comment.
 * *** THE RE-EXPORT LINE HAD TO BE EXCLUDED BY HAND *** -- the whole temporal arc declares privately and
 * re-exports at the foot of the file, so counting `export { RESOLVE_WGSL }` as a use would have made every
 * kernel in it look used by its own module.
 */
export function useSites(src, sym) {
    const word = new RegExp("\\b" + sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
    let n = 0;
    // *** v4637 -- A LINE-ORIENTED COMMENT TEST CANNOT SEE A TRAILING ONE, AND THE BIGGEST COMMENT IN THIS
    // TREE IS A TRAILING ONE. *** The loop below skips a line whose FIRST characters are `//`, which is every
    // comment except the one that matters most: `const ENGINE_VERSION = "vNNNN";   // vNNNN -- <the round
    // note>`. That line begins with `const`, so the whole round note -- thousands of characters of prose
    // naming whatever the round was about -- counted as code in main.js.
    //
    // FOUND BY THIS ROUND DOING IT TO ITSELF. v4637's note names the five kernels it had just proved
    // unreachable, and bumping the version made all five reachable again: 27 to 22, RING_PUSH_WGSL, COMP_WGSL,
    // FRESNEL_WGSL, FURNACE_WGSL and ANISO_WGSL. A census that a round can move by DESCRIBING it.
    //
    // main.js's own line 1967 records this mechanism at v3449 -- "THE VERSION MARKER EXTENDED EVERY ROUND
    // SUPPRESSING A CENSUS, STILL WORKING, IN A FILE TYPE THAT CENSUS COULD NOT SEE" -- and names the answer
    // it reached then: "A PATH IS TEXT THE CODE CONTAINS; A CHANGELOG IS A COMMENT", solved by noComments().
    // That is the scanner used here: it tracks strings, template literals, block comments and regex literals,
    // so it strips a comment wherever it starts rather than only at a line's head.
    src = noComments(String(src));
    for (const line of src.split("\n")) {
        if (!word.test(line)) continue;
        if (new RegExp("(export\\s+)?(const|let|var|function)\\s+" + sym + "\\b").test(line)) continue;
        if (/^\s*export\s*\{/.test(line)) continue;
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        n++;
    }
    return n;
}

function treeFiles(root = ENG) {
    const out = [];
    (function walk(d) {
        let e = []; try { e = fs.readdirSync(path.join(root, d), { withFileTypes: true }); } catch { return; }
        for (const x of e) {
            const rel = path.join(d, x.name).replace(/\\/g, "/").replace(/^\.\//, "");
            if (SKIP.test(rel)) continue;
            if (x.isDirectory()) walk(rel); else if (SOURCE_EXT.test(x.name)) out.push(rel);
        }
    })(".");
    return out;
}

/**
 * Classify every WGSL producer by whether production code can cause it to be dispatched.
 *
 * Injectable end to end, because a reachability rule that can only be run against the real tree is a rule nobody
 * can show failing: the gate drives all four classes against fixtures.
 */
export async function kernelReach({ producers = null, files = null, read = null, importModule = null } = {}) {
    const census = producers || (await import("./wgslCorpus.mjs")).census();
    const all = files || treeFiles();
    const rd = read || ((f) => { try { return fs.readFileSync(path.join(ENG, f), "utf8"); } catch { return ""; } });
    const srcOf = new Map(all.map((f) => [f, rd(f)]));
    // pathToFileURL, not the bare path: Node's ESM loader rejects a raw filesystem path on Windows, where
    // C:\\... reads as a URL scheme. Caught by tools/ship/windowsImport-selfcheck.mjs at the v4645 merge --
    // main's v4642 repaired the same shape in trellisAutoRig-selfcheck and this one arrived from the other
    // line in the same window, which is what a tree-wide scan is for and a per-file fix is not.
    const imp = importModule || (async (f) => import(pathToFileURL(path.join(ENG, f)).href));

    const importersOf = (file) => {
        const b = file.split("/").pop().replace(/\.(mjs|js)$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp("[\"'][^\"']*\\b" + b + "(\\.mjs|\\.js)?[\"']");
        return all.filter((f) => f !== file && re.test(srcOf.get(f) || ""));
    };

    const rows = [];
    for (const p of census) {
        if (p.kind === "file") continue;                 // a bare .wgsl file is shaderRefs' question, not this one
        const cls = classOf(p.symbol);
        // *** v4637 -- THIS COUNTED A COMMENT AS A CALLER, AND useSites() TWENTY LINES UP ALREADY DOES NOT. ***
        // `word.test(wholeFileText)` matches the symbol anywhere, prose included. RING_PUSH_WGSL read as
        // REACHABLE on the strength of a comment in render/ringFloorWgsl.mjs naming it -- the arc's
        // unreachable-kernel count is SIX, not five, and has been since that comment was written. useSites()
        // was built for exactly this question on the defining file and skips comment, declaration and
        // re-export lines; asking it here makes the two halves of the same census agree on what a use is.
        const outside = all.filter((f) => f !== p.file && !isGate(f) && !isTool(f) &&
                                          useSites(srcOf.get(f) || "", p.symbol) > 0);
        const inside = useSites(srcOf.get(p.file) || "", p.symbol);
        const modImporters = importersOf(p.file).filter((f) => !isGate(f) && !isTool(f));
        let text = null;
        try {
            const m = await imp(p.file);
            const v = m[p.symbol];
            const s = typeof v === "function" ? (v.length === 0 ? v() : null) : v;
            if (typeof s === "string") text = crypto.createHash("md5").update(s).digest("hex");
        } catch { /* a module that will not import is reported unresolved rather than counted either way */ }
        rows.push({ symbol: p.symbol, file: p.file, cls, text, outside, inside, modImporters,
                    reach: outside.length > 0 || (inside > 0 && modImporters.length > 0), via: outside.length ? "symbol" : "module" });
    }
    // ...and a producer whose TEXT is already reachable under another name is reachable: same shader, two exports.
    const reachedText = new Set(rows.filter((r) => r.reach && r.text).map((r) => r.text));
    for (const r of rows) if (!r.reach && r.text && reachedText.has(r.text)) { r.reach = true; r.via = "alias"; }

    const kernels = rows.filter((r) => r.cls === "kernel");
    return {
        rows,
        kernels,
        unreachable: kernels.filter((r) => !r.reach),
        probes: rows.filter((r) => r.cls === "probe").length,
        fragments: rows.filter((r) => r.cls === "fragment").length,
        unresolved: rows.filter((r) => r.text === null).length,
    };
}
