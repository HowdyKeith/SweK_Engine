// FILE: tools/ship/orreryReachedScan.mjs -- v4332
//
// The fs half of world/orreryReached.mjs. That module is pure so a browser and a gate see the same numbers;
// this walks the tree to answer the one question the model cannot ask for itself: WHICH Khronos sample models
// does this repository actually reach for?
//
// ---- *** TWO WRONG ANSWERS BEFORE THE RIGHT ONE, AND BOTH ARE WORTH KEEPING *** ---------------------------
// Asked as "which model names appear in the engine's source", over 4,116 files, the first answer was 148 OF
// 150 -- and it was nonsense for a reason this tree has now hit eight times: THE SCAN INCLUDED THE CATALOGUE.
// gpu/khronosSamples.mjs holds all 150 names, so a search for them across a tree containing it finds all 150.
// The catalogue counted its own catalogue. Excluding it drops the answer to 13:
//
//     DirectionalLight 63   Fox 37   Box 30   Cameras 26   Cube 21   BrainStem 17   CesiumMan 13
//     Triangle 12   Duck 11   ABeautifulGame 7   Sponza 5   DamagedHelmet 1   Lantern 1
//
// That is the SECOND wrong answer. Almost none of those are the model: DirectionalLight is three.js's light
// class, Cameras is a UI panel label, Box is a BZFlag map primitive, and Cube and Triangle are the vocabulary
// of every 3D engine ever written. THE KHRONOS CATALOGUE IS LARGELY A LIST OF ORDINARY WORDS, so a name
// search over a 3D engine cannot tell a request for a model from a coincidence of English -- and
// world/orreryReached.mjs would have placed thirteen planets by that coincidence.
//
// ---- *** SO THE MEASUREMENT IS NARROW, AND THE NARROWNESS IS THE POINT *** ---------------------------------
// A model counts as REACHED when a file that IMPORTS gpu/khronosSamples.mjs names it as a COMPLETE QUOTED
// STRING -- which is what asking the catalogue for a model looks like. Measured across this tree: ONE caller,
// glb_viewer.html, and ONE model, the Fox, whose URL that page builds through urlFor() rather than pasting.
// The other 149 are reachable -- the page fills its <select> from models() -- and have never been asked for.
//
// GATES ARE NOT CONSUMERS, and that exclusion is a rule rather than a convenience. gpu/khronosSamples-
// selfcheck.mjs names seven models in its fixtures; it is exercising the catalogue's API, not reaching for a
// model, and counting it would make every model a test mentions into a thing this tree uses. The rule applies
// to every *-selfcheck.mjs equally -- including this round's own -- which is what keeps it from being the
// self-exclusion trap seven earlier gates here fell into. This FILE dodges it the way v4329 did: it builds no
// model name as a literal at all, so it cannot be its own subject.
"use strict";

import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { models, mayVendor, licenceCoverage } from "../../gpu/khronosSamples.mjs";
import { codeOnly } from "./orreryFleetScan.mjs";       // comments blanked, string bodies kept -- v4329's
import { REACHED_SOURCES, severityOf } from "../../world/reachedLicences.mjs";
import { fromKhronos, fromReachedRegister, reachedBodies, reachedDigest } from "../../world/orreryReached.mjs";

/** The catalogue module's own path, relative to the engine root -- the needle every consumer imports. */
export const CATALOGUE = "gpu/" + "khronosSamples" + ".mjs";

const SKIP_DIRS = new Set(["vendor", "node_modules", ".git", "dist", "build"]);

/** Every engine source file, as engine-relative posix paths. */
export function engineSources(engineRoot) {
    const out = [];
    (function walk(dir) {
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (SKIP_DIRS.has(e.name)) continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) walk(full);
            else if (/\.(mjs|js|html)$/.test(e.name)) {
                out.push(path.relative(engineRoot, full).split(path.sep).join("/"));
            }
        }
    })(engineRoot);
    return out.sort();
}

/** A gate. Not a consumer -- see the header. */
export function isGate(rel) { return /-selfcheck\.(mjs|js)$/.test(String(rel || "")); }

/**
 * *** A MENTION IS NOT AN IMPORT, AND THE FIRST DRAFT OF THIS COUNTED MENTIONS. *** Asking only "does the
 * file contain the catalogue's path" returned four callers, and three of them were PROSE: world/orrery.mjs
 * names the module in its header, world/reachedLicences.mjs cites it as the precedent it copied, and
 * world/orreryReached.mjs -- this round's own model -- discusses it at length. Any of the three could have
 * become a phantom visitor the moment somebody quoted a model name in a comment.
 *
 * So a caller has an IMPORT of it, matched after comments are blanked by orreryFleetScan's own stripper
 * (comments only, string bodies kept -- the string bodies are exactly what is being looked for here, and
 * sourceScan's codeOnly would have blanked the import path along with them).
 */
const IMPORTS_CATALOGUE = /from\s*["'`][^"'`]*khronosSamples\.mjs["'`]/;

export function catalogueCallers(engineRoot, files = null) {
    const list = files || engineSources(engineRoot);
    const self = "tools/ship/" + "orreryReachedScan" + ".mjs";
    return list.filter((rel) => {
        if (rel === CATALOGUE || rel === self || isGate(rel)) return false;
        let src = "";
        try { src = fs.readFileSync(path.join(engineRoot, rel), "utf8"); } catch { return false; }
        return IMPORTS_CATALOGUE.test(codeOnly(src));
    });
}

/**
 * Which models those callers name, as complete quoted strings. Returns [{ name, by: [paths] }], sorted.
 * The quote characters are matched as a backreference so `"Fox"` counts and `"Foxtrot"` does not -- the
 * whole point of demanding the complete literal.
 */
export function visitedModels(engineRoot, files = null) {
    const callers = catalogueCallers(engineRoot, files);
    const hits = new Map();
    for (const rel of callers) {
        let src = "";
        try { src = fs.readFileSync(path.join(engineRoot, rel), "utf8"); } catch { continue; }
        for (const n of models()) {
            const re = new RegExp(`(["'\`])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1`);
            if (re.test(src)) {
                if (!hits.has(n)) hits.set(n, []);
                hits.get(n).push(rel);
            }
        }
    }
    return [...hits.entries()].map(([name, by]) => ({ name, by: by.sort() }))
                              .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The WIDE count, kept and reported rather than discarded. A measurement that was rejected is evidence, and
 * the gap between 148 and 1 is the whole argument for the narrow rule -- so the bake carries both and a
 * reader can see what the loose question would have answered.
 */
export function namedAnywhere(engineRoot, files = null) {
    const list = (files || engineSources(engineRoot)).filter((r) => r !== CATALOGUE);
    let blob = "";
    for (const rel of list) {
        try { blob += fs.readFileSync(path.join(engineRoot, rel), "utf8") + "\n"; } catch {}
    }
    const out = [];
    for (const n of models()) {
        const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
        const hits = (blob.match(re) || []).length;
        if (hits) out.push({ name: n, hits });
    }
    return out.sort((a, b) => b.hits - a.hits || a.name.localeCompare(b.name));
}

/** The current commit, so the bake can say what it is a snapshot OF. */
export function headCommit(repoRoot) {
    try {
        return execFileSync("git", ["rev-parse", "HEAD"],
                            { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch { return null; }
}

export const REACHED_BAKE = "orrery-reached.json";

/** The whole population: both registers, as bodies. */
export function scanReached(engineRoot, opts = {}) {
    const visited = visitedModels(engineRoot).map((v) => v.name);
    const khronos = fromKhronos(models(), visited, mayVendor);
    const register = fromReachedRegister(REACHED_SOURCES, severityOf);
    return reachedBodies([...register, ...khronos], opts);
}

/** What gets written. No positions -- orreryBake.mjs's rule: a file of positions begins lying the next morning. */
export function reachedPayload(engineRoot, repoRoot) {
    const visited = visitedModels(engineRoot);
    const wide = namedAnywhere(engineRoot);
    return {
        built: "deterministic",
        source: "models named as whole string literals by non-gate files that import " + CATALOGUE,
        head: headCommit(repoRoot),
        catalogue: models().length,
        coverage: licenceCoverage(),
        visited,
        // the rejected measurement, kept as evidence -- see namedAnywhere's note
        wideCount: wide.length,
        wideTop: wide.slice(0, 8),
        registerSources: REACHED_SOURCES.length,
    };
}

export function readReachedBake(engineRoot) {
    try { return JSON.parse(fs.readFileSync(path.join(engineRoot, REACHED_BAKE), "utf8")); }
    catch { return null; }
}

/**
 * POPULATION drift: what the bake says against what the tree says. Freshness is demanded of the population
 * for v4329's reason -- orrery.json sat forty-five rounds stale and two gates said so the whole time -- and
 * the head commit is REPORTED rather than demanded, because the commit that ships a round cannot know its
 * own hash.
 */
export function reachedDrift(engineRoot, repoRoot) {
    const baked = readReachedBake(engineRoot);
    if (!baked) return ["orrery-reached.json is missing"];
    const live = reachedPayload(engineRoot, repoRoot);
    const out = [];
    if (baked.catalogue !== live.catalogue) out.push(`catalogue: baked ${baked.catalogue}, tree has ${live.catalogue}`);
    if (baked.registerSources !== live.registerSources) {
        out.push(`register: baked ${baked.registerSources}, tree has ${live.registerSources}`);
    }
    const b = (baked.visited || []).map((v) => v.name).sort().join(",");
    const l = live.visited.map((v) => v.name).sort().join(",");
    if (b !== l) out.push(`visited: baked [${b}], tree has [${l}]`);
    if (baked.wideCount !== live.wideCount) out.push(`wide count: baked ${baked.wideCount}, tree has ${live.wideCount}`);
    return out;
}

if (process.argv[2] === "--write") {
    const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const repoRoot = path.resolve(engineRoot, "..");
    const payload = reachedPayload(engineRoot, repoRoot);
    fs.writeFileSync(path.join(engineRoot, REACHED_BAKE), JSON.stringify(payload, null, 1) + "\n");
    const bodies = scanReached(engineRoot);
    const d = reachedDigest(bodies);
    console.log(`${REACHED_BAKE} written: ${payload.visited.length} of ${payload.catalogue} models reached by name, ` +
                `${payload.registerSources} register sources, ${d.total} bodies, ` +
                `${payload.wideCount} models a wide name search would have claimed`);
}
