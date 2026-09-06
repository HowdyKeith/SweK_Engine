// tools/roundhouse/submit-selfcheck.mjs
//
// v2949 -- THE PHONE CAN NOW SEND ITS OWN RESULTS, AND THE ENDPOINT THAT LETS IT IS THE NARROWEST IN THE TREE.
//
// Considered adopting a Quick Share implementation to move files phone -> hub. Checked the tree first: the phone
// already loads these pages FROM the hub over HTTP, so the transport existed and only the endpoint was missing.
// A same-origin POST needs no pairing, no BLE, no protobuf, no new dependency and no licence question -- and it
// works through the Cloudflare tunnel for remote volunteers, which a proximity protocol cannot.
//
// This is the one endpoint in the tree that WRITES what a device sends, so this gate pins its narrowness.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(here, "..", "..", "ai-bridge", "androidPeerBridge.js"), "utf8");

// ---- 1. THE FILENAME IS NEVER TAKEN FROM THE REQUEST -----------------------------------------------------------------
{
    ok("!! the stored filename comes from a fixed allow-list of kinds, never from the request",
        /const KINDS = \{/.test(src) && /const name = KINDS\[j && j\.kind\]/.test(src) && !/j\.(filename|name|path)/.test(src),
        "a device supplies CONTENT, never a destination. The SEVEN recognised kinds map to seven fixed names -- three when this was written at v2949, and the prose was never re-counted; " +
        "anything else is refused. A device cannot choose a path, traverse out of the directory, or overwrite an " +
        "arbitrary file -- the classic upload vulnerability, closed by construction");
}

// ---- 2. UNRECOGNISED KINDS ARE REFUSED, NOT STORED --------------------------------------------------------------------
{
    ok("!! an unrecognised kind is a 400, not a write",
        /if \(!name\) return sendJson\(res, \{ ok: false/.test(src),
        "the endpoint stores seven known artefact kinds and rejects everything else, so it cannot become a " +
        "general-purpose file drop on the hub");
}

// ---- 3. A SIZE CAP, ENFORCED BY DESTROYING THE CONNECTION --------------------------------------------------------------
{
    ok("a body over the cap destroys the connection rather than buffering",
        /req\.destroy\(\)/.test(src) && /8 \* 1024 \* 1024/.test(src),
        "8MB cap; the socket is destroyed rather than accumulating, so a device cannot exhaust hub memory by " +
        "streaming forever");
}

// ---- 4. A SUBMISSION CANNOT ERASE AN EARLIER ONE -----------------------------------------------------------------------
{
    ok("!! every submission is also archived under a timestamp, so a second device cannot erase the first",
        /submissions/.test(src) && /stamp \+ "-" \+ name/.test(src),
        "the canonical filename is what the graders read, but an immutable timestamped copy lands in " +
        "submissions/ as well. This is the v2945 lesson applied to transport: the overwrite that would have " +
        "destroyed the Mali evidence must not come back in through the upload path");
}

// ---- 5. THE DEVICE STILL DOES NOT WRITE ITS OWN VERDICT ----------------------------------------------------------------
{
    ok("!! a magmap submission is folded through gradeMagmapReport, not trusted",
        /foldMagmapReport/.test(src) && !/j\.verdict/.test(src) && !/j\.graded/.test(src),
        "the report's numbers are folded into the device ledger, where the DESKTOP computes the verdict. Nothing " +
        "in the submitted JSON is accepted as a grade -- the phone-measures/desktop-adjudicates split survives " +
        "the phone gaining the ability to push data");
}

console.log();
if (fails) { console.log("submit-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("submit-selfcheck: all checks pass");
