// WebGLEngine/tools/ship/joystickCore-selfcheck.mjs
//
// Run: node tools/ship/joystickCore-selfcheck.mjs   (~0.1s -- MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3263 -- THE PHONE REMOTE'S STICK, AS ARITHMETIC RATHER THAN AS DOM.
//
// Keith: "the phone remote control for the tv is a better interface, and the full render view in SweK Engine has
// the old remote with just buttons... the old button view should be left as a panel view choice, but it doesn't
// have the smooth virtual joystick pad that the phone version does."
//
// *** THE STICK LIVED INLINE IN control.html AND COULD NOT BE MOUNTED ANYWHERE ELSE. *** Sixty lines of pointer
// handling with the geometry braided through: element rect, knob transform, pointer capture, a 10Hz emit loop,
// and -- in the middle -- the actual decision, which is four lines of vector arithmetic.
//
// SO THE ARITHMETIC MOVED AND THE DOM STAYED. ui/joystickCore.js has no document, no element and no listener:
// it takes a point and a box and returns where the knob goes and which way that counts as. THAT IS THE PART THE
// RENDER WINDOW NEEDS, AND IT IS ALSO THE ONLY PART A GATE CAN DRIVE -- pointer capture and a 10Hz timer are not
// things this suite can check, and pretending otherwise is how a "tested" widget ships broken.
//
// SAME SHAPE AS v3239's WIREFRAME HEAD, and the same reason: THE SHAPE IS WHAT WOULD DIVERGE IF COPIED.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { codeOnly, noComments, prose } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const { joystickSample, knobTransform, DEADZONE, KNOB_R } =
    await import(pathToFileURL(path.join(ROOT, "ui", "joystickCore.js")).href);
const modRaw = fs.readFileSync(path.join(ROOT, "ui", "joystickCore.js"), "utf8");
const pageRaw = fs.readFileSync(path.join(ROOT, "control.html"), "utf8");

const box = { left: 0, top: 0, width: 200, height: 200 };   // maxR = 100 - 33 = 67
const at = (x, y) => joystickSample({ x, y }, box);

// ---- 1. IT BEHAVES AS THE INLINE VERSION DID ------------------------------------------------------------------------------
{
    ok("!! *** centre is null, not a direction ***",
        at(100, 100).dir === null && at(100, 100).dist === 0,
        "dir is null INSIDE THE DEADZONE, NOT 'centre'. A caller that treats a missing direction as a direction " +
        "will emit something; a caller that gets null has to decide, WHICH IS THE HONEST ARRANGEMENT");

    const nudge = at(112, 100);
    ok("!! ...and a nudge inside the deadzone emits nothing",
        nudge.dir === null && nudge.t < DEADZONE,
        "t=" + nudge.t.toFixed(3) + " against a deadzone of " + DEADZONE + ". Without this the stick fires " +
        "cardinals from a thumb resting on the pad");

    ok("!! *** the clamp happens BEFORE the direction, and that order is not cosmetic ***",
        at(9999, 100).dist === 67 && at(9999, 100).dir === "DPAD_RIGHT" &&
        // SEVENTH gateQuality CATCH THIS SESSION, and by now the rule is reflex rather than a lesson: prose() is
        // the instrument for "does this file explain itself", and a long phrase matched against RAW source is
        // wrapping debt -- re-flow the comment and the check stops matching text that never changed meaning.
        /CLAMP HAPPENS BEFORE/.test(prose(modRaw)),
        "reading the direction from an UNCLAMPED vector would make a fast flick past the edge report a cardinal " +
        "the knob never visibly reached -- THE CONTROL AND THE PICTURE OF THE CONTROL DISAGREEING, which is this " +
        "project's defect in other clothes");

    ok("!! ...and a diagonal resolves to ONE cardinal, never a diagonal keycode",
        at(150, 50).dir === "DPAD_UP" && at(160, 100).dir === "DPAD_RIGHT" && at(100, 20).dir === "DPAD_UP",
        "axis-dominant, not octant. The TV expects a cardinal keycode, and INVENTING DIAGONALS WOULD SEND A KEY " +
        "THE DEVICE DOES NOT HAVE -- a failure that looks like a dead stick rather than a bad mapping");

    ok("...and the knob transform is shared, so both surfaces draw the same offset",
        knobTransform(at(160, 100)) === "translate(60px,0px)" && KNOB_R === 33,
        "the original had 33 as a bare number in the middle of the arithmetic; it is named now because the base " +
        "and the knob have to agree about it and they are declared in different files");
}

// ---- 2. THE PAGE ASKS FOR IT, AND THE SEAM IS STATED ------------------------------------------------------------------------
{
    const code = codeOnly(pageRaw);
    ok("!! *** control.html calls the module instead of carrying its own copy ***",
        /__swekJoy\.sample/.test(code) && /joystickCore\.js/.test(pageRaw) &&
        !/Math\.abs\(dx\) > Math\.abs\(dy\)/.test(code),
        "THE EXTRACTION IS PROVEN BY THE PAGE STILL WORKING. An extraction nobody consumes is a copy with a " +
        "better address, and the old arithmetic is gone from the page rather than left beside the call");

    ok("...and the window seam is named rather than hidden",
        /PARKED ON window/.test(prose(pageRaw)),
        "the handler is a classic script and the module is an ES module, so they meet on window. REWRITING THAT " +
        "WHOLE BLOCK AS A MODULE IS A LARGER EDIT THAN THIS ROUND, and an unexplained global is how the next " +
        "reader concludes somebody was careless");
}

// ---- 3. THE RENDER WINDOW MOUNTS IT, AND THE BUTTONS STAY (v3264) ----------------------------------------------------------
{
    const panel = fs.readFileSync(path.join(ROOT, "ui", "shieldDebugPanel.js"), "utf8");
    const code = codeOnly(panel);

    ok("!! *** the full render window MOUNTS the stick rather than carrying a second copy ***",
        /from "\.\/joystickCore\.js"/.test(panel) && /joystickSample\(/.test(code) &&
        !/Math\.abs\(dx\) > Math\.abs\(dy\)/.test(code),
        "NOT A PORT -- A MOUNT. v3263 pulled the geometry out of control.html precisely so this could be four " +
        "lines of DOM and one function call. A SECOND COPY OF THAT ARITHMETIC HERE would be the defect this " +
        "project has spent its life removing, arriving in the round that was supposed to prevent it");

    ok("!! ...and it sends through the SAME path as the buttons beside it",
        // FOURTH TIME THIS SESSION I REACHED FOR codeOnly WHERE THE ASSERTION NEEDS THE STRINGS. "key" and
        // "pointercancel" are TEXT THE CODE CONTAINS, and codeOnly blanks string literals along with comments.
        // The rule has been written down since v3239 and I keep having to re-derive it from a red check:
        // codeOnly for an IDIOM, noComments for TEXT, prose for whether a file explains itself.
        /shieldExec\("key", \{ keycode: lastDir \}\)/.test(noComments(panel)) &&
        /shieldExec\("key", \{ keycode: key \}\)/.test(noComments(panel)),
        "same endpoint, same payload, same failure handling as mkKey -- ONLY THE WAY YOU POINT AT A DIRECTION " +
        "CHANGES. A stick with its own send path would be a second thing to keep working");

    ok("!! *** the buttons STAY, and the stick sits above them ***",
        /root\.appendChild\(stickWrap\);[\s\S]{0,80}root\.appendChild\(inputRow1\)/.test(code),
        "Keith asked for the old view as a CHOICE. It is not a mode to find -- the buttons are still right " +
        "there, underneath, and A STICK IS WORSE THAN A BUTTON for a single deliberate press");

    ok("!! ...and releasing the stick stops the emit loop",
        /clearInterval\(loop\); loop = null/.test(code) && /pointercancel/.test(noComments(panel)),
        "A LOOP LEFT RUNNING WOULD KEEP SENDING THE LAST KEY FOREVER. pointercancel is handled as well as " +
        "pointerup, because a pointer taken away by the browser never sends the tidy one");

    ok("...and the 10Hz rate matches the phone rather than being chosen again",
        /TICK_MS = 100/.test(code),
        "a key per pointermove would flood the ADB path and a single key on release would feel dead. The phone " +
        "settled on this, and DISAGREEING HERE WOULD GIVE THE TWO REMOTES DIFFERENT HANDLING OF ONE GESTURE");
}

console.log();
console.log("  ----  NOT DONE, AND IT IS THE POINT OF THE EXTRACTION: the full render window does not mount this");
console.log("  ----  yet. Keith wants the phone stick as the DEFAULT TV control there with the old button panel");
console.log("  ----  kept as a view choice -- that is a UI round on a surface this box cannot see, and it now");
console.log("  ----  needs a mount rather than a port.");
if (fails) { console.log("joystickCore-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("joystickCore-selfcheck: all checks pass");
