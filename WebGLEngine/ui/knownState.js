// WebGLEngine/ui/knownState.js -- v3113
//
// ONE PLACE THAT KNOWS HOW TO SAY "I COULD NOT READ THIS".
//
// v3093 settled the law for the avatar: A LOST BRIDGE READS UNKNOWN, NOT IDLE. v3112 found the law being broken
// in two places at once and fixed both BY HAND -- which immediately made two copies of one judgement, the thing
// v3097 spent a round extracting for the launchers. This is that extraction, done before a third copy exists.
//
// AND THE CENSUS SAYS A THIRD IS COMING. 206 controls in this tree are populated from a fetched value. Narrowing
// to the ones that ROUND-TRIP -- loaded from the server AND read back into a request body -- gives FORTY-FIVE,
// of which exactly two are guarded, and those two are the ones v3112 fixed. A round-trip control is the
// dangerous kind: if the load fails and the control keeps a browser default, THE NEXT SAVE WRITES THAT DEFAULT
// BACK AS THOUGH THE USER HAD CHOSEN IT. That is how a failed fetch silently disabled a PIN gate.
//
// FORTY-FIVE INSTANCES OF ONE SHAPE IS A MISSING PRIMITIVE, NOT FORTY-FIVE MISTAKES. Hand-patching the rest
// would be forty-three chances to write the guard slightly differently. What survives the next person in a hurry
// is making the correct thing the EASY thing to write.
//
// WHAT IT DELIBERATELY DOES NOT DO: it does not retry, and it does not cache the last good value and show that
// instead. A stale value shown as current is the same lie with a longer fuse -- the whole point is that the
// surface says it does not know.

/**
 * Load JSON state and apply it to controls, or mark them UNKNOWN and refuse to pretend.
 *
 * @param {string}   url       endpoint to read
 * @param {function} apply     (json) => void -- runs ONLY on a clean read
 * @param {object}   opts
 *   controls  {Element[]}  disabled on failure, re-enabled on success
 *   save      {Element}    the write path -- disabled on failure, because a save is what turns a
 *                          wrong-looking control into wrong stored state
 *   message   {Element}    where the reason goes. A status with no reason sends nobody anywhere.
 *   label     {string}     what this state IS, for the message ("gate state", "OpenRGB state")
 * @returns {Promise<boolean>} true only if the state was actually read
 */
export async function loadKnownState(url, apply, opts = {}) {
    const { controls = [], save = null, message = null, label = "state" } = opts;
    const all = save ? controls.concat([save]) : controls;
    try {
        const r = await fetch(url, { cache: "no-store" });
        // .ok FIRST. An HTML error body parses as nothing useful, and on a .text() endpoint it would parse as
        // content -- boundaryLint's UNCHECKED_ERROR_BODY, which v3103 made a hard failure.
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        apply(j);
        for (const el of all) { if (el) { el.disabled = false; el.title = ""; } }
        if (message) { message.textContent = ""; message.removeAttribute("data-unknown"); }
        return true;
    } catch (e) {
        const why = String((e && e.message) || e);
        for (const el of all) { if (el) { el.disabled = true; el.title = label + " unknown -- could not read " + url; } }
        if (message) {
            // THE REASON, NOT JUST THE FACT. "UNKNOWN (HTTP 503)" sends somebody to the server; a blank
            // control sends them nowhere, and a cleared one sends them somewhere wrong.
            message.textContent = label + " UNKNOWN (" + why + ") -- not showing a value nobody read";
            message.style.color = "#fc6";
            message.setAttribute("data-unknown", "1");
        }
        return false;
    }
}

/**
 * Guard a write path. Returns true if the save may proceed.
 *
 * SEPARATE FROM THE LOADER ON PURPOSE: disabling a button is a UI affordance and can be defeated by anything
 * that re-enables it, so the refusal has to exist at the moment of writing too. The button is the courtesy;
 * this is the rule.
 */
export function saveAllowed(known, message, label = "state") {
    if (known) return true;
    if (message) {
        message.textContent = "refusing to save: " + label + " was never read";
        message.style.color = "#f88";
    }
    return false;
}
