// FILE: tools/ship/orreryBake.mjs -- v4189
//
// Bakes orrery.json, because orrery.html cannot run the scanner: reading vendor/ and asking git when each
// directory arrived are fs and child_process, and a browser has neither. Same reason knowledge-index.json and
// launch-index.json exist in this tree.
//
// *** THE RAW SCAN IS BAKED, NOT THE BUILT SYSTEM. *** The obvious thing to write out is the finished orrery
// -- axes, periods, radii, ready to draw. That would be wrong in a specific way: every age in it is measured
// against the day the bake ran, so the file would begin lying the next morning, and it would keep the drawn
// picture correct only until someone noticed the orbits had stopped widening. What is baked instead is what
// the scanner FOUND -- names, files and their sizes, arrival dates -- and world/orrery.mjs builds the system
// in the browser against the browser's own today. The file then only changes when vendor/ changes, which is
// exactly what the staleness gate wants to compare.
//
// Run: node tools/ship/orreryBake.mjs [--write]   (default is a dry run that prints what would change)
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanVendor } from "./orreryScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(ENG, "..");
export const BAKE_PATH = path.join(ENG, "orrery.json");

/**
 * The baked payload. Sorted and with fixed key order so two bakes of an unchanged tree are byte-identical --
 * a snapshot that churns on every run cannot be used to detect that something changed.
 */
export function bakePayload(engineRoot = ENG, repoRoot = REPO) {
    const bodies = scanVendor(engineRoot, repoRoot)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((b) => ({
            name: b.name,
            arrived: b.arrived || null,
            sha: b.sha || null,          // baked, because a browser cannot run git and the seed is the point
            bytes: b.bytes,
            // sorted so filesystem enumeration order cannot make the file churn
            files: b.files.slice().sort((x, y) => x.path.localeCompare(y.path))
                          .map((f) => ({ path: f.path, bytes: f.bytes })),
        }));
    return { built: "deterministic", source: "WebGLEngine/vendor", bodies };
}

export function serialise(payload) { return JSON.stringify(payload, null, 1) + "\n"; }

/** What is on disk, or null. */
export function readBaked(file = BAKE_PATH) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

/**
 * Is the baked file still what the tree says? Returns the differences rather than a boolean, so a gate can
 * tell the reader WHICH body drifted instead of "something changed".
 */
export function drift(engineRoot = ENG, repoRoot = REPO, file = BAKE_PATH) {
    const baked = readBaked(file);
    if (!baked) return ["orrery.json is missing -- run: node tools/ship/orreryBake.mjs --write"];
    const live = bakePayload(engineRoot, repoRoot);
    const out = [];
    const byName = (p) => new Map((p.bodies || []).map((b) => [b.name, b]));
    const B = byName(baked), L = byName(live);
    for (const n of L.keys()) if (!B.has(n)) out.push(`vendor/${n} is in the tree but not in orrery.json`);
    for (const n of B.keys()) if (!L.has(n)) out.push(`orrery.json still carries ${n}, which is no longer in vendor/`);
    for (const [n, l] of L) {
        const b = B.get(n);
        if (!b) continue;
        if (b.bytes !== l.bytes) out.push(`${n}: baked ${b.bytes} bytes, tree has ${l.bytes}`);
        if ((b.arrived || null) !== (l.arrived || null)) out.push(`${n}: baked arrival ${b.arrived}, git says ${l.arrived}`);
        // a changed first-commit sha is a DIFFERENT PLANET, so the staleness check has to see it
        if ((b.sha || null) !== (l.sha || null)) out.push(`${n}: baked sha ${String(b.sha).slice(0, 12)}, git says ${String(l.sha).slice(0, 12)}`);
        if ((b.files || []).length !== l.files.length) out.push(`${n}: baked ${(b.files || []).length} files, tree has ${l.files.length}`);
    }
    return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const write = process.argv.includes("--write");
    const payload = bakePayload();
    const text = serialise(payload);
    const before = (() => { try { return fs.readFileSync(BAKE_PATH, "utf8"); } catch { return null; } })();
    if (before === text) { console.log(`orrery.json is current (${payload.bodies.length} bodies)`); }
    else if (write) { fs.writeFileSync(BAKE_PATH, text); console.log(`orrery.json written: ${payload.bodies.length} bodies, ${text.length} bytes`); }
    else {
        console.log(`orrery.json would change (${payload.bodies.length} bodies, ${text.length} bytes). Re-run with --write.`);
        for (const d of drift()) console.log("  " + d);
    }
}
