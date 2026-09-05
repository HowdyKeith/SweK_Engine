// FILE: tools/ship/orreryFleetScan.mjs -- v4329
//
// The git and filesystem half of world/orreryFleet.mjs, kept here for tools/ship/orreryScan.mjs's stated
// reason: "world/orrery.mjs stays pure so a browser can import it". This file shells to git and reads sizes;
// the model it feeds does neither.
//
// *** ONE `git log --name-only` PASS, NOT ONE CALL PER FILE. *** A satellite is an engine file that imports a
// vendored body, and it carries the commit that LAST touched it. There are 128 such files at v4329 and the
// obvious implementation is `git log -1 --format=%H -- <path>` for each: MEASURED at 947 ms for ten, so
// ~12 seconds for the set, and it grows with every importer added. A single `git log --format=%H --name-only`
// over all 858 commits takes 4.0 s once and yields the last-touching commit for all 5,434 tracked paths.
// Verified against the per-file form on three paths, which agreed exactly.
//
// The pass reads NEWEST FIRST, which is git's default order and the whole trick: the first time a path
// appears is by construction its most recent commit, so the map is built in one forward scan with no dates
// to compare and no sorting to get wrong.
"use strict";

import fs from "node:fs";
import { guardWrite } from "./bakeShrinkGuard.mjs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
// v4410: dependantsOf, not ejectaOf -- the substring rule counted 12 records as importers and missed 17
// files that reach the body through path.join("vendor", name, ...). See tools/ship/importPosition.mjs.
import { dependantsOf } from "../../world/orreryEjecta.mjs";

/**
 * *** THE COMMENT-STRIPPER IS THE SAME ONE tools/ship/orreryEjecta-selfcheck.mjs USES, AND IT HAS TO BE. ***
 * That gate's header records the trap at length: a check about CODE strips comments first, or a round's own
 * changelog note quoting `vendor/box3d/box3d.js` makes main.js an importer of box3d. If this scanner stripped
 * differently from the gate, the fleet's size and the ejecta baseline would describe different trees, and the
 * gate below asserts they do not.
 */
export const codeOnly = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/**
 * Files that name a `vendor/<name>/` path in CODE for a reason other than importing it, and must not be
 * counted as satellites.
 *
 * *** THIS LIST IS THE EJECTA GATE'S OWN SELF-EXCLUSION, RESTATED BECAUSE THE SAME FILE IS STILL THERE. ***
 * tools/ship/orreryEjecta-selfcheck.mjs holds "../vendor/box3d/box3d.js" inside a control fixture -- a string
 * literal, so stripping comments does not remove it -- and that gate excludes itself by path for exactly this
 * reason. A scanner that did not would measure box3d at 22 against the gate's 21 and one of the two would be
 * wrong. Measured both ways while writing this: 22 with the file in, 21 with it out.
 */
// *** THE SCANNER COUNTING ITSELF IS THIS RECORD'S OLDEST MISTAKE, AND v4410 MADE IT AGAIN. ***
// orreryEjecta.mjs's header logs it twice: the gate's control fixture names vendor/box3d/box3d.js, and then
// main.js counted because a version note quoted the path while explaining the problem. v4410's new gate holds
// ten fixtures for exactly that reason and walked straight into the third instance -- it classified as `path`
// and joined box3d's fleet, taking it 26 -> 27. A file whose subject is the scanner is not a dependant of what
// it scans, and the exclusion is BY PATH rather than by hope.
export const NOT_IMPORTERS = Object.freeze([
    "tools/ship/orreryEjecta-selfcheck.mjs",
    "tools/ship/importPosition-selfcheck.mjs",
    // v4416: FOURTH instance. This gate names vendor/keyhunt and vendor/three while measuring what a URL scrape
    // would conclude, so it joined keyhunt's fleet the moment it existed. The name-frozen ratchet said WHICH
    // file within the minute, which is the whole reason v4412 made the baseline a list instead of a count.
    "tools/ship/provenanceRecord-selfcheck.mjs",
    // v4472: FIFTH instance, and the first to join FOUR fleets at once. tools/ship/orreryUniverse-selfcheck.mjs
    // is a census OF the vendor directories: it readdirSync's vendor/box3d, vendor/jolt, vendor/slug and
    // vendor/wasm/quickjs to assert facts about what is inside them, and imports none of them -- its only
    // imports are node builtins and three world/ modules. So box3d, jolt, slug and wasm each gained a
    // "dependant" that depends on nothing.
    //
    // *** IT ARRIVED IN THE SAME REPORT AS TWO GATES THAT BELONG IN THE BASELINE, AND THE REPORT CANNOT TELL
    // THEM APART. *** carveGpu-selfcheck and tslIsing-selfcheck showed up under three-webgpu on the same run,
    // and they really do `await import("/vendor/three-webgpu/three.webgpu.js")` -- genuine importers, recorded
    // in DEPENDANTS_AT_V4410 as this ratchet instructs. Two arrivals, identical in the output ("ARRIVED: <file>"),
    // opposite fixes: one goes in this list and one goes in the baseline. The name-frozen ratchet says WHICH
    // FILE, which v4412 bought and is worth having; it does not say WHICH KIND, and the kinds are decided by
    // whether the path is imported or merely named -- which is exactly the distinction the substring rule
    // cannot draw.
    "tools/ship/orreryUniverse-selfcheck.mjs",
]);

/** Every engine source outside vendor/, comment-stripped, in the shape ejectaOf wants. */
export function engineSources(engineRoot) {
    const files = [];
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (/node_modules|^\.git$|^vendor$|GPU_Assets|demos_code/.test(e.name)) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(mjs|js|html)$/.test(e.name)) continue;
            const rel = path.relative(engineRoot, p).split(path.sep).join("/");
            if (NOT_IMPORTERS.includes(rel)) continue;
            files.push({ path: rel, source: codeOnly(fs.readFileSync(p, "utf8")) });
        }
    };
    walk(engineRoot);
    return files;
}

/**
 * Every tracked path's most recent commit, from one log pass. Keys are repo-relative (so `WebGLEngine/...`).
 *
 * A path git has never heard of is simply absent, which is a real answer: an untracked working file has no
 * commit, and world/orreryFleet.mjs's satSourced reports that rather than substituting a zero. The NUL
 * prefix on the format is what separates a commit line from a filename -- a filename can look like anything,
 * including a hex string, and splitting on shape rather than on a delimiter is how that goes wrong.
 *
 * *** v4472 -- "ABSENT" WAS DOING THE WORK OF TWO ANSWERS, AND ONE OF THEM WAS FALSE. ***
 *
 * `git log --name-only` PRINTS NO FILENAMES FOR A MERGE COMMIT. That is git's default and it is not a bug in
 * git: a merge's diff is ambiguous, so the file list is suppressed unless -m or --first-parent asks for one.
 * The consequence here is that a file whose most recent touch is a merge is INVISIBLE to the bulk pass, and
 * the paragraph above then reads that absence as "untracked, and that is a real answer". It is not. The file
 * is tracked, it has a commit, and the bake records `sha: null` for it.
 *
 * Found by adding tools/ship/tslIsing-selfcheck.mjs to a fleet: orreryFleet-selfcheck went red on "every
 * satellite's commit is a full 40-character hash git actually gave us", naming that file, while
 * `git log -1 -- <path>` answered 59c6046 immediately. That commit has two parents.
 *
 * FOUR TRACKED ENGINE FILES ARE IN THIS STATE out of 4410 -- microfacetWgsl-selfcheck, isingTsl,
 * carveJudged-selfcheck and tslIsing-selfcheck -- which is why it went unnoticed until one of them became a
 * satellite. THE FIX IS NOT -m. A merge shows its changes against EACH parent, so -m attributes a file to
 * whichever parent diff prints first, which is a different question from "when was this last touched".
 * Instead the bulk pass keeps its speed and anything it missed is ASKED DIRECTLY, one call per path. After
 * that, absent means untracked -- the answer the paragraph above always claimed it meant.
 *
 * @param repoRoot   the git root
 * @param resolve    repo-relative paths that MUST get a definite answer; any the bulk pass missed are queried
 *                   individually. Pass none and the behaviour is the old bulk pass exactly.
 */
export function lastCommits(repoRoot, resolve = []) {
    let out = "";
    try {
        out = execFileSync("git", ["log", "--format=%x00%H", "--name-only"],
                           { cwd: repoRoot, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
    } catch { return new Map(); }
    const map = new Map();
    let sha = null;
    for (const line of out.split("\n")) {
        if (line.charCodeAt(0) === 0) { sha = line.slice(1).trim(); continue; }
        const p = line.trim();
        if (!p) continue;
        if (!map.has(p)) map.set(p, sha);      // newest first, so the first sighting is the latest commit
    }
    // The merge-blind remainder, asked one at a time. `git log -1 -- <path>` follows merges, so a path that
    // is still absent after this really has no commit.
    for (const p of resolve) {
        if (map.has(p)) continue;
        let sha1 = "";
        try {
            sha1 = execFileSync("git", ["log", "-1", "--format=%H", "--", p],
                                { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
        } catch { sha1 = ""; }
        if (/^[0-9a-f]{40}$/.test(sha1)) map.set(p, sha1);
    }
    return map;
}

/**
 * The importers of every body, with each one's size and last commit attached.
 *
 * @returns { [bodyName]: [{ path, bytes, sha }] }
 */
export function scanFleets(engineRoot, repoRoot, bodyNames) {
    const files = engineSources(engineRoot);
    const engineRel = path.relative(repoRoot, engineRoot).split(path.sep).join("/");
    const keyOf = (rel) => (engineRel ? engineRel + "/" + rel : rel);
    // Only the paths that will actually be RECORDED are resolved individually -- the satellites, not the
    // whole tree -- so the merge-blind fallback costs one git call per satellite the bulk pass missed and
    // nothing at all when it missed none.
    const satellites = new Set();
    for (const name of bodyNames) for (const rel of dependantsOf(name, files)) satellites.add(keyOf(rel));
    const commits = lastCommits(repoRoot, [...satellites]);
    const out = {};
    for (const name of bodyNames) {
        out[name] = dependantsOf(name, files).sort().map((rel) => {
            let bytes = 0;
            try { bytes = fs.statSync(path.join(engineRoot, rel)).size; } catch {}
            return { path: rel, bytes, sha: commits.get(keyOf(rel)) || null };
        });
    }
    return out;
}

/** The vendored body names, the same way tools/ship/orreryScan.mjs finds them. */
export function bodyNames(engineRoot) {
    try {
        return fs.readdirSync(path.join(engineRoot, "vendor"), { withFileTypes: true })
                 .filter((e) => e.isDirectory()).map((e) => e.name).sort();
    } catch { return []; }
}

/** The vendored body names, in the order the bake holds them, so the fleet file and orrery.json line up. */
export function bakedNames(engineRoot) {
    try { return JSON.parse(fs.readFileSync(path.join(engineRoot, "orrery.json"), "utf8")).bodies.map((b) => b.name); }
    catch { return bodyNames(engineRoot); }
}

/**
 * The baked payload: importers per body, each with its size and last commit.
 *
 * *** BAKED FOR THE SAME REASON orrery.json IS: A BROWSER CANNOT RUN git. *** And baked SEPARATELY from
 * orrery.json rather than folded into it, because fourteen gates read that file and its shape is load-bearing
 * for all of them -- v4329 learned what a change to it costs by re-baking it after forty-five rounds and
 * turning four gates red. A new fact goes in a new file.
 *
 * What is NOT baked is any position: those are a pure function of (seed, t) in world/orreryFleet.mjs, computed
 * in the browser against the browser's own clock. Baking positions would freeze the universe at bake time,
 * which is the mistake tools/ship/orreryBake.mjs's header talks itself out of for ages.
 */
export function fleetPayload(engineRoot = ENG_DEFAULT, repoRoot = REPO_DEFAULT) {
    const names = bakedNames(engineRoot);
    const ejecta = scanFleets(engineRoot, repoRoot, names);
    const bodies = {};
    for (const n of names) bodies[n] = ejecta[n].map((f) => ({ path: f.path, bytes: f.bytes, sha: f.sha }));
    return { built: "deterministic", source: "importers of WebGLEngine/vendor/<name>/, with each one's last commit",
             head: headCommit(repoRoot), bodies };
}

/** The commit this bake was taken at, so the snapshot carries its own date rather than implying it is now. */
export function headCommit(repoRoot) {
    try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null; }
    catch { return null; }
}

export const FLEET_BAKE = "orrery-fleet.json";
const ENG_DEFAULT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO_DEFAULT = path.resolve(ENG_DEFAULT, "..");

/** What is on disk, or null. */
export function readFleetBake(engineRoot = ENG_DEFAULT) {
    try { return JSON.parse(fs.readFileSync(path.join(engineRoot, FLEET_BAKE), "utf8")); } catch { return null; }
}

/**
 * *** TWO KINDS OF DRIFT, AND ONLY ONE OF THEM IS A DEFECT. ***
 *
 * tools/ship/orreryBake.mjs bakes each body's FIRST commit, which never changes once the body is in, so its
 * drift check can demand the file be exactly current. This file bakes each importer's LAST commit, which
 * changes every time anybody edits that file -- including the very commit that ships a round. Demanding
 * instantaneous currency of it is not a stricter check, it is an impossible one: the round that edits main.js
 * cannot know main.js's next commit hash before making it, so the bake is one commit behind by construction
 * the moment it ships, and the gate would be red on arrival every single round.
 *
 * So the two are separated. POPULATION drift -- a body appearing, an importer added or removed, a size
 * changing -- is a defect and fails: those are facts about the tree that a re-bake was supposed to capture.
 * COMMIT drift is REPORTED with the bake's own head, because a snapshot of a moving quantity is honest
 * exactly as long as it says when it was taken. This is orreryBake's own reasoning about positions ("the file
 * would begin lying the next morning") applied one level up: do not assert currency of something that cannot
 * be current.
 */
export function fleetDrift(engineRoot = ENG_DEFAULT, repoRoot = REPO_DEFAULT) {
    const baked = readFleetBake(engineRoot);
    if (!baked) return [FLEET_BAKE + " is missing -- run: node tools/ship/orreryFleetScan.mjs --write"];
    const live = fleetPayload(engineRoot, repoRoot);
    const out = [];
    for (const n of Object.keys(live.bodies)) {
        const b = baked.bodies[n];
        if (!b) { out.push(`${n} is in the tree but not in ${FLEET_BAKE}`); continue; }
        if (b.length !== live.bodies[n].length) { out.push(`${n}: baked ${b.length} importers, tree has ${live.bodies[n].length}`); continue; }
        for (let i = 0; i < b.length; i++) {
            if (b[i].path !== live.bodies[n][i].path) out.push(`${n}[${i}]: baked ${b[i].path}, tree has ${live.bodies[n][i].path}`);
            else if (b[i].bytes !== live.bodies[n][i].bytes) out.push(`${n}/${b[i].path}: baked ${b[i].bytes} bytes, tree has ${live.bodies[n][i].bytes}`);
        }
    }
    for (const n of Object.keys(baked.bodies)) if (!live.bodies[n]) out.push(`${FLEET_BAKE} still carries ${n}`);
    return out;
}

/** How many satellites carry a commit the log has since moved past. Reported, never failed -- see above. */
export function commitDrift(engineRoot = ENG_DEFAULT, repoRoot = REPO_DEFAULT) {
    const baked = readFleetBake(engineRoot);
    if (!baked) return { behind: [], head: null, bakedHead: null };
    const live = fleetPayload(engineRoot, repoRoot);
    const behind = [];
    for (const n of Object.keys(live.bodies)) {
        const b = baked.bodies[n] || [];
        for (let i = 0; i < Math.min(b.length, live.bodies[n].length); i++) {
            if (b[i].path === live.bodies[n][i].path && b[i].sha !== live.bodies[n][i].sha) behind.push(n + "/" + b[i].path);
        }
    }
    return { behind, head: headCommit(repoRoot), bakedHead: baked.head || null };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const payload = fleetPayload();
    const text = JSON.stringify(payload, null, 1) + "\n";
    const file = path.join(ENG_DEFAULT, FLEET_BAKE);
    const before = (() => { try { return fs.readFileSync(file, "utf8"); } catch { return null; } })();
    const n = Object.values(payload.bodies).reduce((a, v) => a + v.length, 0);
    if (before === text) console.log(`${FLEET_BAKE} is current (${n} satellites across ${Object.keys(payload.bodies).length} bodies)`);
    else if (process.argv.includes("--write")) {
        // v4336 -- same guard as orreryBake: this scan reads the tree, so an incomplete tree would quietly
        // drop importers. See tools/ship/bakeShrinkGuard.mjs.
        const g = guardWrite(before, payload, process.argv);
        if (!g.ok) { console.log(`${FLEET_BAKE} NOT written (${n} satellites)`); process.exit(1); }
        fs.writeFileSync(file, text); console.log(`${FLEET_BAKE} written: ${n} satellites, ${text.length} bytes`);
    }
    else { console.log(`${FLEET_BAKE} would change (${n} satellites). Re-run with --write.`);
           for (const d of fleetDrift()) console.log("  " + d); }
}
