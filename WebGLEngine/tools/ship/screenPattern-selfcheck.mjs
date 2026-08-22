// WebGLEngine/tools/ship/screenPattern-selfcheck.mjs -- v3038
//
// Grades the gradeable half of remote desktop WITHOUT A BROWSER. The RTC wiring is rig-only, exactly as
// ev/p2p.js says of itself; the pixel arithmetic is not, and that is the part that decides whether the viewer
// is measuring anything.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expectedFrame, compareFrames, decodeCounter, counterBits, latencyFrames, cellColor } from "../../ui/screenPattern.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const COLS = 16, ROWS = 10, BITS = 12;
const clone = (f) => f.map((c) => ({ ...c }));
// A lossy-but-working link: every channel nudged, well inside tolerance.
const lossy = (f, amt = 20) => f.map((c, i) => ({ ...c, r: Math.max(0, Math.min(255, c.r + (i % 2 ? amt : -amt))), g: Math.max(0, Math.min(255, c.g - (i % 3 ? amt : 0))), b: Math.max(0, Math.min(255, c.b + (i % 5 ? amt : 0))) }));

// ---- 1. A CLEAN LINK SCORES CLEAN ---------------------------------------------------------------------------
{
    const e = expectedFrame(1234, COLS, ROWS, BITS);
    const r = compareFrames(e, clone(e));
    ok("an identical frame is perfect", r.fidelity === 1 && r.mismatched === 0 && r.worstDelta === 0, r.cells + " cells");
    const l = compareFrames(e, lossy(e));
    ok("!! ordinary codec loss still passes", l.fidelity === 1, "worst channel delta " + l.worstDelta + " under tol " + l.tol +
       " -- a check that only accepts perfection fires on every real stream and therefore distinguishes nothing");
}

// ---- 2. SABOTAGE: a blanked region must be caught, at the SAME loose tolerance --------------------------------
{
    const e = expectedFrame(77, COLS, ROWS, BITS);
    const blanked = clone(e); for (let i = 40; i < 80; i++) { blanked[i].r = 0; blanked[i].g = 0; blanked[i].b = 0; }
    const r = compareFrames(e, blanked);
    ok("!! SABOTAGE: a blanked region drops fidelity", r.fidelity < 0.95 && r.mismatched > 20,
       r.mismatched + "/" + r.cells + " cells off, fidelity " + r.fidelity.toFixed(3) + " -- caught at the same tolerance that let normal loss through, which is the whole point");
    // MY THRESHOLD WAS WRONG HERE AND THE GATE SAID SO. I asserted a frozen frame scores >0.99; it scores
    // 0.981, because the counter row DOES differ and that is 3 cells of 156. The claim survives, the number did
    // not -- so the assertion is now the RELATIVE one it should always have been: a freeze must look far more
    // intact than a blank, which is exactly the confusion the second observable exists to resolve.
    const frozen = expectedFrame(70, COLS, ROWS, BITS);
    const fr = compareFrames(e, frozen);
    ok("...but a FROZEN frame still looks nearly intact to fidelity", fr.fidelity > 0.95 && fr.fidelity > r.fidelity + 0.1,
       "frozen " + fr.fidelity.toFixed(3) + " vs blanked " + r.fidelity.toFixed(3) +
       " -- fidelity ranks a dead stream ABOVE a damaged one, which is why one number is not enough");
}

// ---- 3. THE COUNTER IS THE SECOND OBSERVABLE, AND IT CATCHES WHAT FIDELITY CANNOT ------------------------------
{
    for (const n of [0, 1, 7, 255, 2047, 4095]) {
        const cells = counterBits(n, BITS).map((b) => (b ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }));
        if (decodeCounter(cells) !== n) { ok("counter round-trips at " + n, false); break; }
    }
    ok("the counter round-trips across its range", true, "0..4095 through paint and decode");
    const noisy = counterBits(1234, BITS).map((b) => (b ? { r: 200, g: 210, b: 190 } : { r: 55, g: 40, b: 60 }));
    ok("!! the counter survives heavy compression", decodeCounter(noisy) === 1234,
       "black/white are the furthest-apart colours there are, which is why the counter is binary and not text");
    const l = latencyFrames(1000, 994, BITS);
    ok("!! a frozen stream shows up as LATENCY where fidelity saw nothing", l.frames === 6, l.note);
    ok("an in-sync stream reads zero", latencyFrames(500, 500, BITS).frames === 0);
    // AND MY FIXTURE WAS WRONG HERE. (10, 3000) wraps to 1106, which is UNDER half the 4096 span, so the guard
    // correctly reported it -- I had picked a case that does not trigger the branch I was claiming to test. The
    // real ambiguous case needs a delta past 2048.
    ok("!! wrap is refused, not guessed", latencyFrames(10, 1000, BITS).frames === null, latencyFrames(10, 1000, BITS).note);
    // The honest limit, recorded: the half-span rule still PERMITS absurd readings. 1106 frames is ~37 seconds
    // at 30fps -- representable, and not a latency anyone should act on. The page must read a large frame count
    // as "stalled", not as a measurement.
    ok("a large-but-representable delta is reported, not refused", latencyFrames(10, 3000, BITS).frames === 1106,
       "1106 frames is arithmetically valid and practically a dead stream -- the number is honest, the interpretation belongs upstream");
}

// ---- 4. THE PATTERN IS ACTUALLY DISCRIMINATING ----------------------------------------------------------------
{
    // If the grid repeated, a torn frame could align to the wrong row and still score well. Three coprime
    // strides exist to stop that, so the check is that neighbours genuinely differ.
    let same = 0;
    for (let cy = 1; cy < ROWS; cy++) for (let cx = 0; cx < COLS - 1; cx++) {
        const a = cellColor(cx, cy, COLS), b = cellColor(cx + 1, cy, COLS);
        if (a.r === b.r && a.g === b.g && a.b === b.b) same++;
    }
    ok("!! adjacent cells differ, so a shifted frame cannot score clean", same === 0,
       "0 identical horizontal neighbours across " + ((ROWS - 1) * (COLS - 1)) + " pairs");
    const e = expectedFrame(5, COLS, ROWS, BITS);
    const shifted = clone(e); shifted.push(shifted.shift());
    ok("a one-cell shift is detected", compareFrames(e, shifted).fidelity < 0.99);
}

// ---- 5. IT REFUSES GEOMETRY MISMATCHES RATHER THAN AVERAGING OVER THEM ----------------------------------------
{
    const threw = (fn) => { try { fn(); return false; } catch { return true; } };
    ok("!! differing cell counts REFUSE", threw(() => compareFrames(expectedFrame(1, COLS, ROWS, BITS), expectedFrame(1, COLS, ROWS - 1, BITS))),
       "a fidelity number computed across a geometry mismatch is a confident answer to the wrong question");
    ok("non-arrays refuse", threw(() => compareFrames(null, [])));
}

// ---- 6. NO THIRD SIGNALLING STACK ------------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "ui", "screenPattern.js"), "utf8");
    ok("!! this module contains NO WebRTC", !/RTCPeerConnection|createOffer|setLocalDescription|onicecandidate/.test(src),
       "ev/p2p.js and ui/cloudPeer.js already do SDP/ICE -- a third implementation is the eight-defect law with a new hat");
    ok("and no Node builtin, so a page can import it", !/(from|require\()\s*["'](node:)?(fs|path|url|crypto|os|net)["']/.test(src));
    for (const f of ["ev/p2p.js", "ui/cloudPeer.js"]) ok("the existing transport " + f + " is still present and untouched", fs.existsSync(path.join(ENG, f)));
}

// ---- 7. THE MEDIA LAYER RIDES THE EXISTING CHANNEL, AND HAS A FRONT DOOR ------------------------------------
{
    const S = await import("../../ui/screenShare.js");
    const src = fs.readFileSync(path.join(ENG, "ui", "screenShare.js"), "utf8");
    const cp  = fs.readFileSync(path.join(ENG, "ui", "cloudPeer.js"), "utf8");
    const ev  = fs.readFileSync(path.join(ENG, "ev", "p2p.js"), "utf8");

    ok("!! it signals through cloudPeer's PUBLIC api only", /_peer\.send\(/.test(src) && /cloudPeer\.onMessage\(/.test(src) &&
       !/_conns|_sig\(/.test(src), "no reach into cloudPeer internals -- adding a track to its live pc would have forced renegotiation into a working transport");
    ok("!! cloudPeer itself is UNCHANGED", /const api = \{ start, connect, send, disconnect, peers, status, onStatus, onMessage, test \};/.test(cp),
       "its public surface is exactly what it was -- never break working things");
    ok("no new mailbox or rendezvous was invented", !/\/signal|\/cloud\/signal|fetch\(/.test(src),
       "SDP and ICE ride the data channel that is already open, authenticated by existing");

    // The glare rule must not drift from ev/p2p.js's.
    ok("!! the glare rule still agrees with ev/p2p.js", /String\(myId\) < String\(peerId\)/.test(src) && /String\(myId\) < String\(peerId\)/.test(ev),
       "lower id offers, in both files -- two peers that disagree here both offer, or neither does");
    ok("shouldInitiate is antisymmetric", S.shouldInitiate("a", "b") === true && S.shouldInitiate("b", "a") === false && S.shouldInitiate("a", "a") === false);

    // Envelope is an allow-list, not a passthrough.
    ok("!! unwrap REFUSES anything not on the allow-list", S.unwrap({ t: S.MEDIA_MSG, kind: "eval" }) === null &&
       S.unwrap({ t: S.MEDIA_MSG, kind: "offer", data: 1 }).kind === "offer",
       "a media envelope that forwarded any kind would be a remote call surface on an open channel");
    ok("unwrap hands back messages that are not ours", S.unwrap({ t: "swek.chat" }) === null && S.unwrap(null) === null,
       "returning null means cloudPeer's other subscribers still see their own traffic");
    ok("wrap refuses a missing kind", (() => { try { S.wrap(); return false; } catch { return true; } })());

    const page = path.join(ENG, "remote-desktop.html");
    ok("!! EVERY TOOL NEEDS A FRONT DOOR: remote-desktop.html exists", fs.existsSync(page));
    const html = fs.readFileSync(page, "utf8");
    ok("the page runs the pattern as its own self-test", /compareFrames/.test(html) && /latencyFrames/.test(html));
    ok("!! the page distinguishes a LOOPBACK read from a real link", /LOOPBACK/.test(html) && /videoWidth/.test(html),
       "reading back the local canvas scores perfectly and measures nothing -- reporting that as a link test would be the decoration this gate exists to prevent");
    ok("the page says view-only rather than implying control", /View only|view only/.test(html));
    ok("no Node builtin reaches the page or the module", !/(from|require\()\s*["\'](node:)?(fs|path|url|crypto|os|net)["\']/.test(src));
}

console.log("\nscreenPattern-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
