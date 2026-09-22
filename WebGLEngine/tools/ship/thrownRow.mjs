// tools/ship/thrownRow.mjs -- A GATE THAT THROWS REPORTS NOTHING, AND A GATE THAT THROWS AN OBJECT REPORTS
// NOTHING TWICE OVER.
//
// v4651 -- the rig's clone-verify has filed gates in this shape for three generations:
//
//     CRASHED   exit 1   3516 ms   0F   tools/roundhouse/magmapDefault-selfcheck.mjs   lines: []
//     CRASHED   exit 1   3684 ms   0F   tools/ship/atmosphere-selfcheck.mjs            lines: []
//
// Exit 1 with ZERO FAIL ROWS. failLines calls that CRASHED rather than RED and is right to, because there is
// no finding to read: the gate printed its passing rows, threw, and died. Reproduced here on a three-line
// fixture, which is the whole mechanism:
//
//     PASS  the source half is fine
//     PASS  and so is the second row
//     <node's uncaught handler, on stderr>
//     exit 1, and `grep -c '^  FAIL'` reads 0
//
// *** AND THE SECOND HALF IS WHY THIS FILE EXISTS RATHER THAN A try/catch IN FOUR GATES. *** Node prints a
// STACK for a thrown Error and prints NO STACK AT ALL for a thrown object. A page.evaluate that rejects with
// a bare `{ code, detail }` -- which is what a browser hands back across the Playwright boundary -- produces
//
//     { code: 'ERR_X', detail: { port: 8787 } }
//
// and nothing else. Not a line number, not a file, not a frame. So the honest repair is not only "catch it":
// it is to turn whatever was thrown into ONE LINE A READER CAN ACT ON, and to make that line a FAIL row so
// the ship's own counting instrument sees it.
//
// WHAT THIS DOES NOT DO: diagnose the rig's throw. This box cannot reproduce it -- every one of these gates
// is green here -- so what ships is the instrument that will name it on the next clone-verify, which is the
// same split v4650's wasm teardown was recorded under. A crash that becomes a finding is not a fix; it is
// the thing that makes a fix possible.
"use strict";

/**
 * One line naming what was thrown, for anything at all.
 *
 * *** THE NON-ERROR BRANCH IS THE POINT AND IS NOT A FALLBACK. *** `String({})` is "[object Object]", which
 * is worse than nothing because it looks like an answer. A thrown object carries no stack, so its OWN KEYS
 * are the only evidence there is and they are printed.
 */
export function describeThrow(e) {
    if (e instanceof Error) {
        const frame = String(e.stack || "").split("\n").find((l) => /^\s+at /.test(l));
        return `THREW ${e.name}: ${e.message}` + (frame ? " " + frame.trim() : " (no stack)") +
               (e.code ? "  [code " + e.code + "]" : "");
    }
    const kind = e === null ? "null" : e === undefined ? "undefined"
        : (e && e.constructor && e.constructor.name) || typeof e;
    let body = "";
    try { body = JSON.stringify(e); } catch { body = "(not serialisable)"; }
    if (body === undefined) body = String(e);
    const article = /^[AEIOU]/i.test(kind) ? "an" : "a";
    return `THREW ${article} ${kind}, NOT AN ERROR, so there is NO STACK -- only what it carries: ` + body.slice(0, 400);
}

// *** asRow() WAS HERE AND IS DELETED, WHICH IS WORTH ONE PARAGRAPH RATHER THAN A SILENT REMOVAL. ***
// It wrapped a single SECTION so a throw became a FAIL row and the gate carried on to the next section, and
// it was written in the same hour as reportThrows because it seemed obviously useful. Nothing called it. An
// exported capability with no consumer is the thing this tree makes a point of not shipping -- find the
// consumer before taking the solver -- and a gate naming it would have been a gate written to give an
// export a mention rather than a use. When a gate genuinely wants to survive its own failing section, it
// comes back with that gate as its reason.

/**
 * *** THE NET UNDER THE WHOLE GATE, because a wrapped section only covers what somebody remembered to wrap. ***
 *
 * Installs handlers for both shapes node has -- a synchronous throw and a rejected promise nobody awaited --
 * and emits the SAME two lines either way: a FAIL row, and a verdict line, so a gate that dies still looks
 * like a gate that reported.
 *
 * It sets process.exitCode and RETURNS rather than calling process.exit(), for v4650's reason: this process
 * may have a wasm module behind it, and exiting while V8's compiler pool is still working is what aborts on
 * Windows. Returning from an uncaughtException handler lets the loop drain and the code stand.
 *
 * @param name     the gate's own name, for the verdict line
 * @param cleanup  optional, and worth passing whenever a browser or a server is open
 */
export function reportThrows(name, { cleanup = null, log = console.log } = {}) {
    let fired = false;
    const emit = (kind) => (e) => {
        if (fired) return;                       // a cleanup that throws must not print a second verdict
        fired = true;
        log(`  FAIL  !! *** ${name} DIED RATHER THAN REPORTING (${kind}) ***   ${describeThrow(e)}`);
        if (cleanup) { try { cleanup(); } catch { /* as above */ } }
        log(`\n${name}: 1 FAILED -- the gate did not finish, so the rows above it are all that ran`);
        process.exitCode = 1;
    };
    process.on("uncaughtException", emit("uncaught throw"));
    process.on("unhandledRejection", emit("unhandled rejection"));
}
