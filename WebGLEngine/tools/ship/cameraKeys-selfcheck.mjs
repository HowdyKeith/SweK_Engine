// WebGLEngine/tools/ship/cameraKeys-selfcheck.mjs -- v3911
// ---------------------------------------------------------------------------------------------------------------
// TWO THINGS OWNED W, AND THE ONE THAT TRIED TO STAND ASIDE NAMED THE WRONG MODES.
//
// Keith, on index.html: pressing W moved the camera forward AND tipped it toward the sky. Both were true at once.
// Camera consumes KeyW in _moveObserver, _moveFP and _moveKaijuDrive. main.js's navPad ALSO bound KeyW to
// "rotUp" -- and its guard read `camera.mode === "fp" || camera.mode === "kaiju_drive"`. THAT NAMES TWO OF THE
// THREE MOVERS. It misses "observer", which is what the Camera constructor sets, so the collision was live in the
// default mode and invisible in the two the guard did name.
//
// *** THE GUARD WAS A SECOND DECLARATION OF THE DISPATCH IN update(), AND IT DRIFTED THE MOMENT A THIRD MOVER
// EXISTED. *** The fix is not a longer list in the pad. camera.consumesKey(code) answers per mode and per key,
// lives beside the dispatch it must agree with, and the pad asks instead of guessing.
//
// MEASURED IN CHROMIUM ON index.html, BEFORE AND AFTER, because a camera claim that is not driven is a guess:
//     old guard:  mode observer, navPad fired "rotUp", pitch -0.32 -> -0.22   (tipped ~5.7 degrees)
//     fixed:      mode observer, navPad fired nothing,  pitch -0.32 -> -0.32   (and camera.keys still has KeyW)
// The second line is the whole fix: FORWARD STILL WORKS, THE TIP IS GONE.
//
// PER KEY AND NOT PER MODE, which is the part worth keeping. A blanket "the camera owns WASD" set would have been
// wrong in the other direction: KeyE is read ONLY by _moveKaijuDrive, so blocking it everywhere would take the
// pad's rotRight away in observer for nothing. And the pad is now BETTER in fp/kaiju than the old guard left it
// -- that guard killed the whole pad in those modes; only the keys the camera actually reads are yielded now.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { codeOnly } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const camSrc = fs.readFileSync(path.join(ENG, "camera", "camera.js"), "utf8");
const mainSrc = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
const { Camera } = await import(pathToFileURL(path.join(ENG, "camera", "camera.js")).href);

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);
const at = (mode) => { const c = Object.create(Camera.prototype); c.mode = mode; return c; };

console.log("cameraKeys-selfcheck -- one owner per key, asked rather than listed\n");

console.log("1. THE DECLARED SET IS CHECKED AGAINST THE CODE THAT READS THE KEYS");
{
    // Every key camera.js actually tests, taken from the file rather than from a list written here. A list here
    // would be a THIRD declaration of the same fact, and this whole bug is what a second one costs.
    const literals = new Set([...camSrc.matchAll(/keys\.has\("([A-Za-z0-9]+)"\)/g)].map((m) => m[1]));
    const declared = new Set([...Camera.MOVEMENT_KEYS, "KeyE"]);
    const unread = [...declared].filter((k) => !literals.has(k));
    const unclaimed = [...literals].filter((k) => !declared.has(k));
    ok("*** every key the camera READS is one consumesKey() can claim ***", unclaimed.length === 0,
       unclaimed.length ? "READ BUT NEVER CLAIMED: " + unclaimed.join(", ") + " -- a pad could still steal these"
                        : [...literals].sort().join(", "));
    ok("...and nothing is claimed that the camera never reads", unread.length === 0,
       unread.length ? "CLAIMED BUT UNREAD: " + unread.join(", ") : "no dead claims -- the pad keeps every key the camera does not use");
}

console.log("\n2. THE ANSWER IS PER MODE, AND observer IS IN IT");
{
    ok("*** observer -- THE DEFAULT, AND THE MODE THE OLD GUARD MISSED -- owns WASD ***",
       ["KeyW", "KeyA", "KeyS", "KeyD"].every((k) => at("observer").consumesKey(k)),
       "this is the one that was broken: the constructor sets mode = observer");
    ok("...and the constructor really does default to observer", /this\.mode = "observer"/.test(camSrc));
    ok("...fp and kaiju_drive own it too, which the old guard did get right",
       at("fp").consumesKey("KeyW") && at("kaiju_drive").consumesKey("KeyW"));
    ok("*** and the two modes that read NO keys claim nothing ***",
       !at("ogre_orbit").consumesKey("KeyW") && !at("missile_cam").consumesKey("KeyW"),
       "missile_cam returns before any _move* runs; ogre_orbit goes to _moveOrbit, which reads no keys at all");
    ok("!! KeyE is claimed ONLY by kaiju_drive, so the pad keeps rotRight everywhere else",
       at("kaiju_drive").consumesKey("KeyE") && !at("observer").consumesKey("KeyE") && !at("fp").consumesKey("KeyE"),
       "a blanket set would have been wrong in the other direction");
    ok("...and a key the camera never reads is never claimed, in any mode",
       ["observer", "fp", "kaiju_drive", "ogre_orbit", "missile_cam"].every((m) => !at(m).consumesKey("KeyR")),
       "KeyR is the pad's 'up' -- it must keep working while the camera moves");
}

console.log("\n3. THE PAD ASKS, AND DOES NOT KEEP ITS OWN LIST OF MODES");
{
    ok("*** the navPad handler calls camera.consumesKey ***", /camera\.consumesKey && camera\.consumesKey\(e\.code\)/.test(mainSrc));
    // THROUGH codeOnly, AND THIS CHECK CAUGHT ITSELF FIRST: the replacement's own comment QUOTES the guard it
    // removed, to say what was wrong with it, and a raw text search matched that prose and went red. A COMMENT
    // THAT DESCRIBES A BUG IS NOT THE BUG. Reusing sourceScan's stripper rather than writing a fifth one -- this
    // tree already carries four spellings of "remove the comments", which is its own small warning.
    ok("*** and the hand-listed mode guard is GONE FROM THE CODE, not merely extended ***",
       !/camera\.mode === "fp" \|\| camera\.mode === "kaiju_drive"/.test(codeOnly(mainSrc)),
       "adding \"observer\" to that list would have fixed today and drifted again at the fourth mover");
}

console.log("\n4. WHAT WAS DRIVEN IN A BROWSER RATHER THAN REASONED ABOUT");
report("BEFORE (old guard restored)", "index.html, mode observer, one KeyW: navPad fired rotUp, pitch -0.32 -> -0.22");
report("AFTER", "same fixture, same key: navPad fired nothing, pitch -0.32 -> -0.32, and camera.keys still holds KeyW");
report("THE SECOND HALF IS THE POINT", "a fix that stopped the tip by taking W away from the camera would have " +
       "shown the same pitch numbers and broken the thing Keith actually wanted. FORWARD STILL WORKS.");

console.log(fails ? `\ncameraKeys-selfcheck: ${fails} FAILED` : "\ncameraKeys-selfcheck: all checks pass");
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(fails ? 1 : 0);
