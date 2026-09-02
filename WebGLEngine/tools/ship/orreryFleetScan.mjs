// FILE: tools/ship/orreryFleetScan.mjs -- v4325
//
// The git and filesystem half of world/orreryFleet.mjs, kept here for tools/ship/orreryScan.mjs's stated
// reason: "world/orrery.mjs stays pure so a browser can import it". This file shells to git and reads sizes;
// the model it feeds does neither.
//
// *** ONE `git log --name-only` PASS, NOT ONE CALL PER FILE. *** A satellite is an engine file that imports a
// vendored body, and it carries the commit that LAST touched it. There are 128 such files at v4325 and the
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
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ejectaOf } from "../../world/orreryEjecta.mjs";

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
export const NOT_IMPORTERS = Object.freeze(["tools/ship/orreryEjecta-selfcheck.mjs"]);

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
 */
export function lastCommits(repoRoot) {
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
    return map;
}

/**
 * The importers of every body, with each one's size and last commit attached.
 *
 * @returns { [bodyName]: [{ path, bytes, sha }] }
 */
export function scanFleets(engineRoot, repoRoot, bodyNames) {
    const files = engineSources(engineRoot);
    const commits = lastCommits(repoRoot);
    const engineRel = path.relative(repoRoot, engineRoot).split(path.sep).join("/");
    const out = {};
    for (const name of bodyNames) {
        out[name] = ejectaOf(name, files).sort().map((rel) => {
            let bytes = 0;
            try { bytes = fs.statSync(path.join(engineRoot, rel)).size; } catch {}
            const key = engineRel ? engineRel + "/" + rel : rel;
            return { path: rel, bytes, sha: commits.get(key) || null };
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
 * for all of them -- v4325 learned what a change to it costs by re-baking it after forty-five rounds and
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
    return { built: "deterministic", source: "importers of WebGLEngine/vendor/<name>/, with each one's last commit", bodies };
}

export const FLEET_BAKE = "orrery-fleet.json";
const ENG_DEFAULT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO_DEFAULT = path.resolve(ENG_DEFAULT, "..");

/** What is on disk, or null. */
export function readFleetBake(engineRoot = ENG_DEFAULT) {
    try { return JSON.parse(fs.readFileSync(path.join(engineRoot, FLEET_BAKE), "utf8")); } catch { return null; }
}

/** Differences between the baked fleet and the tree, named rather than counted. */
export function fleetDrift(engineRoot = ENG_DEFAULT, repoRoot = REPO_DEFAULT) {
    const baked = readFleetBake(engineRoot);
    if (!baked) return [FLEET_BAKE + " is missing -- run: node tools/ship/orreryFleetScan.mjs --write"];
    const live = fleetPayload(engineRoot, repoRoot);
    const out = [];
    for (const n of Object.keys(live.bodies)) {
        const b = baked.bodies[n];
        if (!b) { out.push(`${n} is in the tree but not in ${FLEET_BAKE}`); continue; }
        if (b.length !== live.bodies[n].length) out.push(`${n}: baked ${b.length} importers, tree has ${live.bodies[n].length}`);
        else for (let i = 0; i < b.length; i++) {
            if (b[i].path !== live.bodies[n][i].path) out.push(`${n}[${i}]: baked ${b[i].path}, tree has ${live.bodies[n][i].path}`);
            else if (b[i].sha !== live.bodies[n][i].sha) out.push(`${n}/${b[i].path}: baked commit ${String(b[i].sha).slice(0, 12)}, git says ${String(live.bodies[n][i].sha).slice(0, 12)}`);
        }
    }
    for (const n of Object.keys(baked.bodies)) if (!live.bodies[n]) out.push(`${FLEET_BAKE} still carries ${n}`);
    return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const payload = fleetPayload();
    const text = JSON.stringify(payload, null, 1) + "\n";
    const file = path.join(ENG_DEFAULT, FLEET_BAKE);
    const before = (() => { try { return fs.readFileSync(file, "utf8"); } catch { return null; } })();
    const n = Object.values(payload.bodies).reduce((a, v) => a + v.length, 0);
    if (before === text) console.log(`${FLEET_BAKE} is current (${n} satellites across ${Object.keys(payload.bodies).length} bodies)`);
    else if (process.argv.includes("--write")) { fs.writeFileSync(file, text); console.log(`${FLEET_BAKE} written: ${n} satellites, ${text.length} bytes`); }
    else { console.log(`${FLEET_BAKE} would change (${n} satellites). Re-run with --write.`);
           for (const d of fleetDrift()) console.log("  " + d); }
}
