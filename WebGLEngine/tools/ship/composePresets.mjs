// WebGLEngine/tools/ship/composePresets.mjs -- v3702
// ---------------------------------------------------------------------------------------------------------------
// NAMED STARTING POINTS FOR THE DIORAMA -- AND THIS FILE SHIPS NONE OF THEM.
//
// The composer starts every session from whatever is in localStorage, so building a stage means picking six
// slots cold. A named group you can start from and then adjust is plainly better. THE PART WORTH BEING CAREFUL
// ABOUT IS WHERE THE GROUPS COME FROM.
//
// *** A PRESET IS TASTE, AND TASTE IS THE ONE THING I CANNOT DERIVE. *** If I write "Cosy Study" and "Lab Bench"
// out of my head, that is invented content nobody has read -- the same class as writing a summary for a page
// that has never been opened here, which these notes forbid by name. Six invented presets would look like
// curation and would be my guesses wearing this project's clothes. SO THE MECHANISM SHIPS EMPTY: presets come
// from layouts Keith has actually made and saved, and an empty list that says "save one" is honest where a
// seeded list is not.
//
// EVERY PRESET IS A FULL COMPOSITION AND IS VALIDATED BOTH WAYS. On save, because storing a broken layout just
// moves the failure later; ON APPLY, because a preset saved last month can name a mesh deleted since -- and the
// symptom of applying it would be something quietly missing from a picture, which is exactly the failure v3701
// was built to stop.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { validateComposition } from "./composeValidate.mjs";

/** Presets live beside the composition the bridge already writes, in the same directory, for the same reason. */
export const PRESETS_FILE = (dir) => path.join(dir, "diorama-presets.json");

/** A preset name has to survive a round trip through a file and a select. Deliberately narrow. */
export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/;

export function readPresets(dir) {
    try {
        const j = JSON.parse(fs.readFileSync(PRESETS_FILE(dir), "utf8"));
        return Array.isArray(j && j.presets) ? j.presets : [];
    } catch { return []; }          // ABSENT IS EMPTY HERE, and that is safe: no presets is the shipped state
}

function writePresets(dir, presets) {
    fs.writeFileSync(PRESETS_FILE(dir), JSON.stringify({ presets }, null, 2));
    return presets;
}

/**
 * Save (or replace) a preset.
 * @returns {{ok:boolean, error?:string, validation?:object, presets?:Array}}
 *
 * *** A BROKEN LAYOUT IS REFUSED HERE, WHICH IS THE OPPOSITE OF THE AUTOSAVE ROUTE, AND THE DIFFERENCE IS
 * DELIBERATE. *** v3701's POST /diorama/composition validates and still writes, because it fires on every
 * keystroke and refusing a half-edited layout would lose the edit. A PRESET IS NOT A KEYSTROKE -- it is a
 * deliberate act of saying "this one is good, start from it later", and storing a broken one just moves the
 * failure to whoever applies it.
 */
export function savePreset(dir, name, composition, opts = {}) {
    if (!NAME_RE.test(String(name || ""))) {
        return { ok: false, error: "a preset name must be 1-40 characters of letters, numbers, spaces, - or _" };
    }
    const v = validateComposition(composition, opts);
    if (!v.ok) return { ok: false, error: "that layout is not buildable, so it is not worth saving", validation: v };
    const presets = readPresets(dir).filter((p) => p && p.name !== name);
    presets.push({ name: String(name), savedAt: new Date().toISOString(), composition });
    presets.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return { ok: true, presets: writePresets(dir, presets) };
}

export function deletePreset(dir, name) {
    const before = readPresets(dir);
    const after = before.filter((p) => p && p.name !== name);
    if (after.length === before.length) return { ok: false, error: "no preset called '" + name + "'" };
    return { ok: true, presets: writePresets(dir, after) };
}

/**
 * Fetch a preset for applying, RE-VALIDATED AGAINST THIS BOX AS IT IS NOW.
 * @returns {{ok:boolean, error?:string, composition?:object, validation?:object, stale?:boolean}}
 *
 * A preset that was buildable when saved can rot: a mesh gets deleted, an avatar gets renamed. IT IS STILL
 * RETURNED when that happens -- marked `stale` with the problems attached -- because the person may well want
 * to load it and fix one slot, and silently refusing would lose work they can see on screen. WHAT MUST NOT
 * HAPPEN IS APPLYING IT WITHOUT SAYING SO.
 */
export function getPreset(dir, name, opts = {}) {
    const p = readPresets(dir).find((x) => x && x.name === name);
    if (!p) return { ok: false, error: "no preset called '" + name + "'" };
    const v = validateComposition(p.composition, opts);
    return { ok: true, composition: p.composition, validation: v, stale: !v.ok };
}
