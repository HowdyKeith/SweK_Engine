// WebGLEngine/tools/ship/composePresets-selfcheck.mjs -- v3702
//
// Run: node tools/ship/composePresets-selfcheck.mjs   (<1s)
//
// *** THE FIRST CHECK IS THAT NOTHING SHIPS. *** A preset is TASTE, and this tree forbids inventing content
// nobody has read. Six presets I made up would look like curation and be my guesses wearing somebody else's
// project's clothes -- so the mechanism ships empty and the emptiness is asserted, because "we shipped a few to
// get you started" is exactly the kind of helpfulness that turns into fabricated provenance.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPresets, savePreset, getPreset, deletePreset, PRESETS_FILE, NAME_RE } from "./composePresets.mjs";
import { VITALS } from "./composeValidate.mjs";
import { codeOnly } from "./sourceScan.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "presets-"));
const OPTS = { avatars: ["Xbot", "Soldier"], meshes: ["chair", "lamp"], maxProps: 3 };
const GOOD = { avatar: "Xbot", scene: "diorama", pet: true, room: true,
               gauges: VITALS.map(() => ({ show: true, style: "ring", color: [1, 0.5, 0] })), props: [{ glb: "chair" }] };

console.log("composePresets-selfcheck -- named starting points, none of them mine\n");

// ---- 1. NOTHING SHIPS ------------------------------------------------------------------------------------------
{
    ok("!! *** the mechanism ships EMPTY -- no preset was invented here ***",
        readPresets(tmp()).length === 0 && !fs.existsSync(PRESETS_FILE(path.join(ENG, "ai-bridge"))),
        "no presets file in the shipped tree and an absent file reads as []. A PRESET IS TASTE AND TASTE CANNOT " +
        "BE DERIVED -- writing 'Cosy Study' and 'Lab Bench' would be invented content nobody has read, the same " +
        "class as summarising a page that was never opened. An empty list that says 'save one' is honest.");

    const src = codeOnly(fs.readFileSync(path.join(HERE, "composePresets.mjs"), "utf8"));
    ok("...and no composition literal hides in the module",
        !/avatar\s*:\s*"/.test(src) && !/glb\s*:\s*"/.test(src),
        "checked through codeOnly so the header explaining why none ship cannot satisfy it -- the prose says " +
        "'Cosy Study' out loud and must not count as shipping one");
}

// ---- 2. SAVE REFUSES WHAT AUTOSAVE ACCEPTS, AND THAT ASYMMETRY IS THE POINT ------------------------------------
{
    const d = tmp();
    ok("!! a buildable layout saves", savePreset(d, "Study", GOOD, OPTS).ok);

    const broken = savePreset(d, "Broken", { ...GOOD, avatar: "Ghost" }, OPTS);
    ok("!! *** an unbuildable layout is REFUSED, unlike the autosave route ***",
        !broken.ok && !!broken.validation && broken.validation.problems.some((p) => p.field === "avatar"),
        "POST /diorama/composition validates AND STILL WRITES, because it fires on every keystroke and refusing " +
        "would lose a half-finished edit. A PRESET IS NOT A KEYSTROKE -- it is somebody saying 'this one is " +
        "good, start from it later', and storing a broken one MOVES THE FAILURE TO WHOEVER APPLIES IT.");

    ok("...and a refused save does not appear in the list",
        readPresets(d).length === 1 && readPresets(d)[0].name === "Study",
        "a refusal that still wrote would be the worst of both");

    ok("!! a name that cannot survive a file and a select is refused",
        !savePreset(d, "../etc/passwd", GOOD, OPTS).ok && !savePreset(d, "", GOOD, OPTS).ok && NAME_RE.test("Lab Bench 2"),
        "narrow on purpose: these names become file content and option values");

    ok("...and saving the same name REPLACES rather than duplicating",
        savePreset(d, "Study", GOOD, OPTS).ok && readPresets(d).filter((p) => p.name === "Study").length === 1,
        "two presets with one name is a select where the second is unreachable");
}

// ---- 3. *** A PRESET ROTS, AND APPLYING ONE MUST SAY SO. *** ---------------------------------------------------
{
    const d = tmp();
    savePreset(d, "Study", GOOD, OPTS);

    const fine = getPreset(d, "Study", OPTS);
    ok("!! a still-buildable preset applies clean", fine.ok && !fine.stale);

    // The mesh was deleted since. This is the whole reason apply re-validates.
    const rotted = getPreset(d, "Study", { avatars: ["Xbot"], meshes: ["lamp"], maxProps: 3 });
    ok("!! *** a preset naming a deleted mesh is returned STALE, not silently applied ***",
        rotted.ok && rotted.stale && !!rotted.composition,
        "it is STILL RETURNED so the person can load it and fix one slot -- refusing would lose work they can " +
        "see on screen. WHAT MUST NOT HAPPEN IS APPLYING IT WITHOUT SAYING SO: the symptom otherwise is " +
        "something quietly missing from a picture, which is the exact failure v3701 was built to stop.");

    ok("...and the problems come with it, so the message can name the slot",
        rotted.validation.problems.some((p) => /props/.test(p.field)),
        JSON.stringify(rotted.validation.problems.map((p) => p.field)));

    ok("!! a preset that was never saved is an error, not an empty composition",
        !getPreset(d, "Nope", OPTS).ok,
        "returning {} would apply a blank stage and look like the preset did that");

    ok("...and delete removes exactly one", deletePreset(d, "Study").ok && readPresets(d).length === 0 &&
        !deletePreset(d, "Study").ok, "deleting twice is an error, not a silent success");
}

if (fails) { console.log("\ncomposePresets-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("\ncomposePresets-selfcheck: all checks pass");
