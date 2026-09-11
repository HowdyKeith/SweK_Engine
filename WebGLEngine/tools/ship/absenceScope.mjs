// tools/ship/absenceScope.mjs -- v4435 -- grading a claim that says the tree does NOT have something.
//
// *** THIS FILE EXISTS BECAUSE I SHIPPED ONE OF THESE WRONG ONE ROUND AGO, AND THE WAY IT WAS WRONG IS THE
// WAY THIS SESSION HAS BEEN WRONG EIGHT TIMES: THE DETECTOR MATCHED THE SHAPE ITS AUTHOR PICTURED. ***
// docs/EXPLAIN-ITSELF.md item 10, written at v4432, says the tree has no BVH and cites `grep -li bvh` over
// physics/, render/ and world/. Every word of that grep is true and the claim built on it is false three
// separate ways, which is worth setting out because each is a different failure and only one of them is
// the one anybody expects:
//
//   1. OUT OF SCOPE. mesh/meshBVH.mjs (v4221) is a BINNED-SAH ray-triangle BVH taken from
//      gkjohnson/three-mesh-bvh, with a green gate. It lives in TOP-LEVEL mesh/, and the three directories
//      searched were physics/, render/ and world/. The search was correct. THE SCOPE WAS THE CLAIM.
//   2. IN SCOPE AND SUMMARISED AWAY. physics/sph/bvhNeighbours.mjs (v3805) is a Morton BVH with a bake-off
//      gate that already measured it against spatialGrid.js. It WAS in the searched directories. The prose
//      summary of the grep's output -- "finds mesh CSG and a spatial-agreement gate" -- dropped it.
//   3. A DENIAL COUNTED AS A PRESENCE. physics/render/rtPipeline.mjs matched `bvh` because its comment says
//      "Linear over the geometries. NO BVH". A file that matched BECAUSE IT ASSERTS THE ABSENCE is evidence
//      FOR the claim, and an enumeration that lists it as a hit has counted a record ABOUT a thing as the
//      thing -- docs/EXPLAIN-ITSELF.md item 5, in the one place nobody thought to look for it.
//
// *** SO THE UNIT GRADED HERE IS NOT "DOES THE TREE HAVE X". IT IS "IS THIS CLAIM'S SCOPE THE TREE'S SCOPE",
// WHICH IS A DIFFERENT AND ANSWERABLE QUESTION. *** A claim names the directories it searched; this module
// searches the WHOLE tree with the same term and reports what falls outside. An absence claim can only be
// as wide as where it looked, and nothing in the claim itself ever says how wide that was.
//
// ---- *** THE TWO STRIPPERS, AND WHY DENIAL IS A SUBKIND OF MENTION RATHER THAN A PEER *** ----------------
//
// The tree's rule since v4418: codeOnly for what a file DOES, noComments for what a file SAYS. Both are used
// here and the ORDER between them is the load-bearing part. A file is `code` if the term survives codeOnly --
// that settles it, and no prose can argue with it. Only if codeOnly is silent do we read the prose, and only
// then can a file be `denial`. That ordering makes a whole class of error unreachable: a file that BUILDS a
// BVH and also carries a comment saying "no BVH in the tracer" can never be scored a denial, because it never
// gets to the prose pass at all. A denial detector that ran first WOULD have made that mistake, and it is the
// mistake this file is about.
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That the denial patterns are complete. They are eight English shapes, and English has more. An unmatched
// denial is scored `mention`, which is the SAFE direction: it overstates what the tree holds and therefore
// makes an absence claim look WORSE than it is, never better. A detector whose failures all point at "go
// look again" is a different thing from one whose failures point at "nothing to see", and that asymmetry is
// deliberate rather than lucky. It also does not claim the term is the right term: `bvh` finds a BVH called
// a BVH, and would miss one called an AABB tree. THE TERM IS STILL A PERSON'S JOB.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";
import { toPosix } from "./posixAssumption.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Kinds a file can take against one term. Ordered: the first that applies wins, and the order is the point. */
export const KINDS = Object.freeze(["code", "denial", "mention"]);

const SKIP_DIRS = new Set(["node_modules", ".git", "gate-reports"]);
const SOURCE_RE = /\.(mjs|js|glsl|wgsl)$/;

// *** v4566 -- ONE READ PER FILE PER PROCESS, THE SHAPE treeRead.mjs ESTABLISHED AT v4548. ***
// gradeClaim calls scan() once per claim and scan() walks the tree and reads every source file it finds.
// The gate makes seven of those calls, so it was doing 28,507 readFileSync and 2,352 readdirSync for 390 MB
// of I/O to answer seven questions about 56 MB of source -- and at 6.5-6.9 s serially it sat OUTSIDE the
// 3,000 ms ship-time sweep, which put INSCOPE_ARRIVALS_SINCE_V4435 (added this same round) among the records
// nothing checks at ship time. recordReach's ratchet went red for it, exactly as it did for
// SWEEP_CONTENTION_V4562 the round before, and it is the same repair v4548 made to recordDrift and
// frozenRecords: the censuses are cheap, the re-reading is not.
//
// NOT treeRead.mjs itself, and the reason is the file set: treeRead's SOURCE_EXT is /\.(mjs|cjs|js)$/ and
// this module must see .glsl and .wgsl too -- a shader is exactly where an absence claim goes wrong. Sharing
// the cache would mean widening treeRead's extension list for every consumer of it, which is a bigger change
// than this round is entitled to make and would move the .cjs census v4565 just took. Same shape, own cache.
const _walkCache = new Map();
const _textCache = new Map();
export function clearScanCache() { _walkCache.clear(); _textCache.clear(); _strippedCache.clear(); }
export function scanStats() { return { walks: _walkCache.size, files: _textCache.size, stripped: _strippedCache.size }; }

function textOf(abs) {
    if (_textCache.has(abs)) return _textCache.get(abs);
    let src = null;
    try { src = fs.readFileSync(abs, "utf8"); } catch { src = null; }
    _textCache.set(abs, src);
    return src;
}

export function sourceFiles(root = ENG, { dirs = null, includeVendor = false } = {}) {
    const key = root + "\u0000" + (dirs ? dirs.join(",") : "") + "\u0000" + (includeVendor ? "1" : "0");
    if (_walkCache.has(key)) return _walkCache.get(key);
    const roots = dirs ? dirs.map((d) => path.join(root, d)) : [root];
    const out = [];
    for (const r of roots) {
        if (!fs.existsSync(r)) continue;
        (function walk(d) {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                if (SKIP_DIRS.has(e.name)) continue;
                if (!includeVendor && e.name === "vendor") continue;
                const p = path.join(d, e.name);
                if (e.isDirectory()) walk(p);
                // v4485: toPosix at the boundary where a path stops being a filesystem argument and
                // becomes a RECORD. On the rig this pushed accel\\sceneBvh.mjs and every comparison
                // against the stored "/" form failed -- ten checks in this gate, all one cause.
                else if (SOURCE_RE.test(e.name)) out.push(toPosix(path.relative(root, p)));
            }
        })(r);
    }
    out.sort();
    _walkCache.set(key, out);
    return out;
}

// ---- *** THE MATCHER, AND IT IS THE PART THAT ALREADY FAILED ONCE IN THIS FILE'S OWN LIFETIME *** --------
//
// The first draft used `\bbvh\b`, which is what anybody writes, and it MISSED mesh/meshBVH.mjs -- the exact
// file the round is about. That file's code carries the term in exactly one identifier, `MeshBVH`, and there
// is NO word boundary between `Mesh` and `BVH` because both sides are word characters. A regex word boundary
// is a rule about punctuation; a programmer's idea of a word includes the camel hump, and those two are not
// the same rule. So the round's own detector reproduced the round's own defect ONE LEVEL DOWN, on the first
// try, against the single file it was written to find.
//
// A match is a token match when both edges are boundaries, and a boundary is any of: the start/end of the
// text, a non-alphanumeric neighbour, or a CAMEL HUMP -- a lowercase-or-digit followed by the uppercase the
// match begins with (`meshBVH`), a match ending lower/digit followed by an uppercase (`bvhNode`), or an
// all-uppercase match followed by an uppercase (`BVHNode`).

const alnum = (c) => c !== undefined && /[A-Za-z0-9]/.test(c);

// *** v4566 -- THE CASE-INSENSITIVE SEARCH NO LONGER ALLOCATES A LOWERCASE COPY OF EVERY FILE. ***
// The first draft did `text.toLowerCase()` at the top of every call, and this function is called twice per
// (file, term) -- once on the comment-stripped source and once on the raw. After the codeOnly cache landed it
// was the single largest cost left in the gate at 719 ms of 2.8 s, all of it allocating and discarding ~56 MB
// of lowercased string per pass. A case-insensitive regex finds the SAME positions with no copy at all, and
// the boundary rules below still read the ORIGINAL text's characters, which is what makes the camel-hump
// rule work -- so the semantics are unchanged by construction, and were checked file-for-file besides.
const _termRe = new Map();
const termRe = (needle) => {
    let re = _termRe.get(needle);
    if (!re) { re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"); _termRe.set(needle, re); }
    return re;
};

export function tokenMatch(text, term) {
    if (!term) return false;
    const n = term.length;
    const re = termRe(term);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        const i = m.index;
        const prev = text[i - 1], next = text[i + n];
        const first = text[i], last = text[i + n - 1];
        const raw = text.slice(i, i + n);
        const beforeOk = i === 0 || !alnum(prev) || (/[a-z0-9]/.test(prev) && /[A-Z]/.test(first));
        const afterOk = next === undefined || !alnum(next) ||
            (/[A-Z]/.test(next) && (/[a-z0-9]/.test(last) || raw === raw.toUpperCase()));
        if (beforeOk && afterOk) return true;
        re.lastIndex = i + 1;   // the old scan advanced by ONE, not by the match length -- overlaps still count
    }
    return false;
}

// *** EIGHT SHAPES, AND EACH ONE IS A REAL SENTENCE SOMEBODY WROTE IN THIS TREE RATHER THAN A SHAPE I
// IMAGINED. *** `{T}` is spliced with the term. "NO BVH -- honest at four spheres" is the exact string in
// physics/render/rtPipeline.mjs that started this file.
const DENIAL_SHAPES = [
    "\\bno\\s+{T}\\b",
    "\\bnot\\s+a\\s+{T}\\b",
    "\\bwithout\\s+(?:a\\s+|any\\s+)?{T}\\b",
    "\\bthere\\s+is\\s+no\\s+{T}\\b",
    "\\b(?:has|have|had)\\s+no\\s+{T}\\b",
    "\\bnothing\\s+\\w+\\s+{T}\\b",
    "\\b{T}\\s*-?\\s*less\\b",
    "\\bnever\\s+\\w{0,12}\\s*{T}\\b",
];

export function denialRe(term) {
    const t = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(DENIAL_SHAPES.map((s) => s.replace("{T}", t)).join("|"), "i");
}

// *** v4566 -- AND THE COST WAS NEVER THE I/O, WHICH IS WHY THE FIRST FIX BARELY MOVED IT. ***
// Memoising the read took this module from 28,507 readFileSync and 390 MB to 4,075 and 55.8 MB -- a 7x cut
// in I/O that bought 1.2 s of 10.2. The seven scans are seven passes over the tree and classifyFile runs
// codeOnly() on every file on every pass: 28,504 comment-strips of 56 MB of source to answer seven questions.
// codeOnly's answer does not depend on the term, so it is computed once per file and reused.
//
// The wrong diagnosis is recorded rather than quietly replaced, because it is the same error this module
// exists to catch one level up: I read "reads the tree seven times" and concluded "the reads are the cost"
// without measuring which part of the pass was expensive. The instrument said 4,075 reads and 8,961 ms in
// the same breath, and only the second number was the answer.
const _strippedCache = new Map();
function strippedOf(src) {
    let out = _strippedCache.get(src);
    if (out === undefined) { out = codeOnly(src); _strippedCache.set(src, out); }
    return out;
}

/** The kind one file takes against one term. codeOnly runs FIRST and its answer is final -- see the header. */
export function classifyFile(src, term) {
    if (tokenMatch(strippedOf(src), term)) return "code";
    if (!tokenMatch(src, term)) return null;
    return denialRe(term).test(src) ? "denial" : "mention";
}

/** Every file in the tree that touches `term`, bucketed by kind. The PATH counts as code: a file called
 *  meshBVH.mjs is a BVH whatever it happens to name its class, and a path is not prose. */
export function scan(term, { root = ENG, dirs = null } = {}) {
    const buckets = { code: [], denial: [], mention: [] };
    for (const rel of sourceFiles(root, { dirs })) {
        const src = textOf(path.join(root, rel));
        if (src === null) continue;
        const kind = tokenMatch(rel, term) ? "code" : classifyFile(src, term);
        if (kind) buckets[kind].push(rel);
    }
    return buckets;
}

/**
 * Grade one absence claim.
 *   claim = { term, searched: ["physics", "render", "world"], said: [...], exclude: [...] }
 * Returns what the claim would have found, what the TREE holds, and the three failure modes named apart.
 *
 * *** `exclude` IS A HOLE AND IT IS LEFT OPEN ON PURPOSE, WITH THE GATE HOLDING IT SHUT. *** A register that
 * NAMES bvh files is code carrying the token and is not a BVH -- item 5's defect, and this module's own
 * BVH_AT_V4435 record is one of them. No mechanism here can tell a register from an implementation, so
 * rather than pretend to, exclusions are LISTED BY NAME in the claim and the selfcheck asserts exactly which
 * names are on that list. An exclusion can be argued with; it cannot be added quietly.
 */
export function gradeClaim(claim, { root = ENG } = {}) {
    const drop = new Set(claim.exclude || []);
    const keep = (list) => list.filter((f) => !drop.has(f));
    const wide = scan(claim.term, { root });
    const narrow = scan(claim.term, { root, dirs: claim.searched });
    const said = new Set(claim.said || []);
    const inNarrow = new Set([...narrow.code, ...narrow.denial, ...narrow.mention]);

    const outOfScope = keep(wide.code).filter((f) => !inNarrow.has(f));
    const inScopeMissed = keep(narrow.code).filter((f) => !said.has(f));
    const denialsCounted = (claim.said || []).filter((f) => wide.denial.includes(f));

    return {
        term: claim.term,
        searched: claim.searched,
        wide, narrow,
        outOfScope,
        inScopeMissed,
        denialsCounted,
        // *** THE VERDICT IS DERIVED FROM THE THREE LISTS, NOT ASSERTED BESIDE THEM -- v4406's rule. ***
        sound: outOfScope.length === 0 && inScopeMissed.length === 0 && denialsCounted.length === 0,
        realImplementations: keep(wide.code).length,
    };
}

// *** THE RECORD OF THE MOMENT THIS WAS MEASURED, FROZEN BY NAME RATHER THAN BY COUNT (v4399's rule). ***
// A count goes stale the first time anybody adds a file; names say WHICH, so a change reads as a change
// rather than as a number that moved. THE CLAIM GRADED IS MINE, WRITTEN ONE ROUND EARLIER, AND IT IS THE
// EIGHTH SIGHTING THIS SESSION OF A DETECTOR MATCHING THE SHAPE ITS AUTHOR PICTURED.
/**
 * *** ARRIVALS SINCE, NAMED, BECAUSE THE RECORD ABOVE IS A CLAIM ABOUT v4435 AND STAYS TRUE ABOUT v4435. ***
 *
 * BVH_AT_V4435 is the grade of a claim as it stood, frozen BY NAME so a change reads as a change. The tree
 * then grew two files that carry the term in CODE and sit inside the claim's own search scope, and the three
 * rows comparing the live grade against the record went red -- correctly, and invisibly, because this gate is
 * over the ship-time budget and nothing ran it until the over-budget pool was re-timed at v4565.
 *
 * The record is not rewritten. The arrivals are recorded beside it with why, which is the shape
 * gfx/frontDoor.mjs uses for its reach and world/orreryFleet.mjs for its commit belt.
 */
export const INSCOPE_ARRIVALS_SINCE_V4435 = Object.freeze([
    Object.freeze({ file: "physics/character/terrainWalk.mjs", at: "v4544",
        why: "the slope-aware ground controller. Its header names mesh/meshBVH.mjs as the query a capsule " +
             "against triangles would use -- in code, not prose, so codeOnly sees it" }),
    Object.freeze({ file: "physics/character/terrainWalk-selfcheck.mjs", at: "v4544",
        why: "its gate, which IMPORTS MeshBVH and trianglesFrom: the round's central cross-check runs a " +
             "bilinear heightfield gradient against a real meshBVH raycast and holds them to 4.8e-14" }),
    Object.freeze({ file: "physics/character/groundProbe.mjs", at: "v4539",
        why: "the fixtures that measure why terrain-controller piece (3) cannot be closed while piece (2) " +
             "is open. It IMPORTS MeshBVH and trianglesFrom to build a bridge and a pillar of the same " +
             "height and show every downward hit is identical at both -- so it carries the term in code, " +
             "and it is a USER of the structure rather than one, the same distinction the two exclusions " +
             "below draw for this module and its own gate" }),
]);

/**
 * Arrivals since v4435 that land OUTSIDE the three searched directories.
 *
 * *** v4539 -- THIS LIST EXISTS BECAUSE ONE LIST WAS DOING TWO JOBS AND A MODULE-PLUS-GATE ROUND SPLIT THEM.
 * *** INSCOPE_ARRIVALS_SINCE_V4435 fed both the in-scope membership row and the total-count arithmetic, which
 * agree only while every arrival is in scope. v4539 added physics/character/groundProbe.mjs (in scope) and
 * tools/ship/groundProbe-selfcheck.mjs (not), and there was no way to name the second one that left both rows
 * green: in the arrivals list the membership row went red on a file that is not in scope, and out of it the
 * count row went one short. That is not a wrong number, it is a field carrying two meanings, and the repair
 * is a second list rather than a fudged total.
 */
export const OUTOFSCOPE_ARRIVALS_SINCE_V4435 = Object.freeze([
    Object.freeze({ file: "tools/ship/groundProbe-selfcheck.mjs", at: "v4539",
        why: "the gate of the round that measured why terrain-controller piece (3) cannot be closed while " +
             "piece (2) is open. It reaches the ray-triangle BVH in top-level mesh/ through its module, " +
             "which none of the three searched directories can see" }),
]);

export const BVH_AT_V4435 = Object.freeze({
    at: "v4435",
    claim: "docs/EXPLAIN-ITSELF.md item 10, as written at v4432",
    term: "bvh",
    searched: Object.freeze(["physics", "render", "world"]),
    said: Object.freeze(["physics/mesh/meshCSG.mjs", "physics/spatial/agreement.mjs"]),
    // *** TWO EXCLUSIONS, AND THEY ARE THIS MODULE AND ITS OWN GATE. *** Both carry the term throughout
    // their code because they are a RECORD OF BVHs, which is not a BVH -- item 5's defect, arriving inside
    // the file written to catch it. The gate excluded itself only after it went red on itself, which is the
    // right way round: the hole was found by the check rather than anticipated by the author.
    exclude: Object.freeze(["tools/ship/absenceScope-selfcheck.mjs", "tools/ship/absenceScope.mjs"]),
    // 1. REAL BVH CODE THE SEARCHED DIRECTORIES COULD NOT REACH. The first is the one that matters: a
    //    binned-SAH ray-triangle BVH with a green gate, shipped at v4221, sitting in top-level mesh/.
    // *** v4535 -- ONE ARRIVAL, NAMED: tools/ship/splatMesh-selfcheck.mjs. *** It reaches the tree's
    // ray-triangle BVH from top-level mesh/, which none of the three searched directories can see, so it
    // lands here exactly as the eight before it did. Nothing left the list; the record grew by one and the
    // four rows that read it all went red together, which is one drift wearing four failures.
    outOfScope: Object.freeze([
        "mesh/meshBVH.mjs", "multiplayer/wadLevelHost.js", "tools/krbn/krbnCompare.js",
        "tools/roundhouse/neighbourBenchBind-selfcheck.mjs", "tools/roundhouse/neighbourBenchBind.mjs",
        "tools/ship/box3dRay-selfcheck.mjs",
        // *** v4539 -- ONE ARRIVAL, NAMED: tools/ship/groundProbe-selfcheck.mjs, IN SORTED POSITION. *** The
        // gate of the round that measured why terrain-controller piece (3) cannot be closed while piece (2)
        // is open. It reaches the ray-triangle BVH in top-level mesh/ through
        // physics/character/groundProbe.mjs, which none of the three searched directories can see, so it
        // lands here as the nine before it did. Its MODULE is in physics/ and is named in
        // INSCOPE_ARRIVALS_SINCE_V4435 instead: one file to each list is what a module-plus-gate round looks
        // like against this claim, and the two lists are compared SORTED, so position is not decoration.
        "tools/ship/groundProbe-selfcheck.mjs",
        "tools/ship/meshBVH-selfcheck.mjs",
        "tools/ship/splatMesh-selfcheck.mjs", "ui/webrtxBrowser.js",
    ]),
    // 2. IN THE SEARCHED DIRECTORIES AND SUMMARISED AWAY. bvhNeighbours is a Morton BVH; the bakeoff is the
    //    gate that already measured it against spatialGrid.js and concluded the GRID wins for per-step SPH.
    inScopeMissed: Object.freeze([
        "physics/mesh/meshCSG-selfcheck.mjs", "physics/sph/bvhNeighbours.mjs",
        "physics/sph/neighbourBakeoff-selfcheck.mjs",
    ]),
    // 3. MATCHED BECAUSE THEY ASSERT THE ABSENCE. rtPipeline.mjs says "Linear over the geometries. NO BVH";
    //    main.js and brain/brain.js carry item 10's own claim in their version notes. All three are evidence
    //    FOR the absence, and a raw grep hands them back looking exactly like evidence against it.
    // *** AND A FOURTH ARRIVED WHILE THE ROUND WAS BEING WRITTEN, WHICH IS THE SAME ORDERING TRAP v4429
    // FOUND IN budgetEvidence. *** tools/ship/gateSweep.mjs carries this round's sweep closing, and that
    // closing says the tree has no BVH -- so the record OF the finding became an instance of the finding,
    // and the gate went red on prose I had written twenty minutes earlier. A scan over the tree includes the
    // round's own note, because the note is in the tree.
    // *** AND A FIFTH AT v4485, BY THE SAME ORDERING TRAP AGAIN. *** tools/ship/krbnPaint-selfcheck.mjs
    // asserts "the connector owns no rasteriser, no ray-caster, no projection and no BVH of its own" -- a
    // gate stating an absence, which is evidence FOR the claim and reads to a raw scan exactly like evidence
    // against it. The list is RE-TAKEN, not raised: the file was read and the sentence is there at line 193.
    denial: Object.freeze([
        "brain/brain.js", "main.js", "physics/render/rtPipeline.mjs", "tools/ship/gateSweep.mjs",
        "tools/ship/krbnPaint-selfcheck.mjs",
    ]),
    // *** v4535 -- 12 -> 13, AND GOING TO LOOK FOUND THE FIELD'S NAME OVERSTATES WHAT IT HOLDS. ***
    // It is computed as keep(wide.code).length: the number of files whose CODE carries the term, which is not
    // the same as the number of BVH implementations and never was. The arrival proves it -- splatMesh-selfcheck
    // imports MeshBVH from mesh/meshBVH.mjs and calls raycastFirst on it, and builds nothing: a CONSUMER of
    // the one implementation, counted here as though it were another. Others in the thirteen are gates and
    // binds around the same two or three builders.
    //
    // *** THE NAME IS LEFT ALONE AND THE MEANING IS WRITTEN DOWN, WHICH IS THE NARROWER OF THE TWO REPAIRS. ***
    // Splitting builders from consumers needs a rule for "builds one", and the rule this round reached for --
    // a regex over class/build/morton names -- is the shape that has been wrong four times this session. What
    // is certain is the count and what it counts; a split is a separate round with a rule somebody defends.
    // The claim the number serves is unharmed either way: item 10 said the tree has no BVH, and thirteen files
    // whose code carries the term refutes that whether five build one or all thirteen do.
    realImplementations: 13,
    why: "the tracer really has no BVH and rtPipeline.mjs says so itself, so the NARROW claim survives. What " +
         "did not survive is the sentence supporting it: it named two files where the tree holds twelve, and " +
         "hid the two that change what the item should DO -- a binned-SAH ray-triangle BVH the tree already " +
         "ships with a green gate, and a bake-off that already measured a BVH against a grid and concluded " +
         "the GRID wins for per-step SPH. Item 10 said its hard part was the value key. The tree had already " +
         "built the instrument for exactly that and had already answered NO with it once.",
});
