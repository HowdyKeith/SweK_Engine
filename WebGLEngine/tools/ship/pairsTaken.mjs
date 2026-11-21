// WebGLEngine/tools/ship/pairsTaken.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// EVERY SEED THE FLY-WIRED LINE'S STUDIES HAVE REGISTERED, for a new study's gate to show its pairs are fresh. It imports each study runFlyWiredGates lists (its gates' modules: never a selfcheck, and only this line's -- other lines' modules run
// their commands on import) and collects every pair's seed from what it exports: SETS, ROUNDS, FLEET_PAIRS, FIGHTER_ATTACKS, ATTACKS, TOGETHER, TRAIN_PAIRS, at any depth. A module that will not import is named, not skipped.
"use strict";
import { GATES } from "./runFlyWiredGates.mjs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const KEYS = Object.freeze(["SETS", "ROUNDS", "FLEET_PAIRS", "FIGHTER_ATTACKS", "ATTACKS", "TOGETHER", "TRAIN_PAIRS"]);
/** Every `seed` number in `x`, at any depth. Pure. */
export const deepSeeds = (x, seen = new Set()) => { if (!x || typeof x !== "object" || seen.has(x)) return []; seen.add(x); if (Array.isArray(x)) return x.flatMap((y) => deepSeeds(y, seen)); return typeof x.seed === "number" ? [x.seed] : Object.values(x).flatMap((y) => deepSeeds(y, seen)); };
/** The line's studies' modules, by file name: each listed study gate's module. */
export const studyFiles = () => GATES.filter((g) => g.startsWith("tools/ship/") && /^tools\/ship\/(take|train)/.test(g)).map((g) => path.basename(g).replace(/-selfcheck\.mjs$/, ".mjs"));
/** { file: [seeds] } for every study but those named in `except` (file names). */
export async function taken(except = []) {
    const out = {};
    for (const f of studyFiles()) { if (except.includes(f)) continue; let M; try { M = await import(pathToFileURL(path.join(HERE, f)).href); } catch (e) { throw new Error(`pairsTaken: ${f} will not import: ${e.message}`); } out[f] = KEYS.flatMap((k) => deepSeeds(M[k])); }
    return out;
}
