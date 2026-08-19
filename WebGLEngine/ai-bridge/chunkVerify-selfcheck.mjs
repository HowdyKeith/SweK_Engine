// ai-bridge/chunkVerify-selfcheck.mjs
//
// Run: node ai-bridge/chunkVerify-selfcheck.mjs   (instant)
//
// v3143 -- THE PEER GRAB CHECKS SIZE, NOT CONTENT.
//
// v3104 fixed it to compare the size the walk reported against the bytes received, which catches a TRUNCATED
// transfer and was a real fix. IT CANNOT CATCH A CORRUPT ONE. A proxy serving a same-length error body, a
// partial write later padded, a flipped bit in flight -- all arrive at exactly the expected length and are
// written to the destination under the right name. THE SIZE CHECK ANSWERS "DID IT ALL ARRIVE", NOT "IS IT THE
// SAME FILE", and those are different questions with the same failure count.
//
// *** AND THE RESUME POINT IS THE LAST VERIFIED CHUNK, NEVER THE FILE LENGTH. *** A partial file on disk has a
// length, and trusting it means resuming after bytes nobody checked -- which is how a corrupt prefix becomes a
// permanent corrupt file that every later transfer "resumes" past. The first failing chunk truncates the
// answer: everything after it is discarded EVEN IF IT HAPPENS TO BE RIGHT, because a gap cannot be verified.

import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import crypto from "node:crypto";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const C = await import(pathToFileURL(path.join(HERE, "chunkVerify.mjs")).href);

const src = Buffer.from("abcdefghij".repeat(500));         // 5000 bytes
const man = C.chunkManifest(src, 1024);

// ---- 1. THE GAP THIS CLOSES, DEMONSTRATED AGAINST THE CURRENT LOGIC ----------------------------------------------
{
    const corrupt = Buffer.from(src); corrupt[1500] ^= 0xff;    // same length, one bit different
    // This is EXACTLY what ai-bridge/server.js does today at the Grab: compare lengths, then write.
    const sizeOnlyAccepts = corrupt.length === man.size;
    ok("!! a same-size CORRUPT file passes the size check that exists today",
        sizeOnlyAccepts === true,
        "the current Grab compares buf.length against the size the walk reported and writes on a match. One " +
        "flipped bit is still " + corrupt.length + " bytes, so it is written to the destination under the " +
        "right name. THIS IS THE CASE THE ROUND EXISTS FOR, and it is asserted as PASSING so nobody reads the " +
        "fix below as redundant");

    ok("!! and the content check refuses it, naming corruption rather than truncation",
        C.acceptOrRefuse(man, corrupt).ok === false &&
        /SIZE MATCHES AND CONTENT DOES NOT/.test(C.acceptOrRefuse(man, corrupt).reason),
        "\"" + C.acceptOrRefuse(man, corrupt).reason.slice(0, 88) + "\". 'errors: 3' sends somebody to the " +
        "network; 'size matches and content does not' sends them to the proxy or the disk");

    ok("!! an ABSENT manifest hash is REFUSED, not accepted",
        C.acceptOrRefuse({ size: src.length }, src).ok === false,
        "v3089's law from assetSync: an absent hash is not a passing hash. Accepting unverified bytes because " +
        "nobody supplied a way to check them is the failure that law exists to name");
}

// ---- 2. THE RESUME POINT IS THE LAST VERIFIED CHUNK ------------------------------------------------------------------
{
    const short = src.subarray(0, 2500);                    // two whole chunks plus 452 unverifiable bytes
    const r = C.resumeRequest(man, short);
    ok("!! a short file resumes from the last VERIFIED chunk, not from its length",
        r.need === true && r.from === 2048 && r.kind === "short",
        "2500 bytes on disk, resume from " + r.from + " -- THE 452 BYTES AFTER THE LAST COMPLETE CHUNK ARE " +
        "DISCARDED because nothing has checked them. Resuming from 2500 would append after unverified bytes, " +
        "which is how a corrupt prefix becomes permanent");

    const corrupt = Buffer.from(src); corrupt[1500] ^= 0xff;
    const rc = C.resumeRequest(man, corrupt);
    ok("!! a corrupt file discards EVERYTHING after the first bad chunk",
        rc.kind === "corrupt" && rc.from === 1024 && rc.discardAfter === 1024,
        "the bit is flipped in chunk 1, so chunks 2-4 are thrown away even though they are byte-perfect. A GAP " +
        "CANNOT BE VERIFIED -- keeping them would mean trusting an offset nothing had validated");

    ok("!! CORRUPT and SHORT are different kinds, because they want different requests",
        rc.kind !== r.kind,
        "a short file needs the TAIL; a corrupt one needs a REWRITE from the first bad chunk. Reporting both " +
        "as 'incomplete' would have the caller append to a file whose prefix is already wrong");

    ok("...and a complete file asks for nothing",
        C.resumeRequest(man, src).need === false);
}

// ---- 3. THE MANIFEST'S OWN EDGES ---------------------------------------------------------------------------------------
{
    ok("!! a zero-length file has NO chunks and is still a legitimate file",
        C.chunkManifest(Buffer.alloc(0)).chunks.length === 0 && C.chunkManifest(Buffer.alloc(0)).size === 0 &&
        C.resumeRequest(C.chunkManifest(Buffer.alloc(0)), Buffer.alloc(0)).need === false,
        "'nothing to verify' and 'verification found nothing wrong' are different states, and a manifest that " +
        "threw on an empty file would make an ordinary case look like a fault");

    ok("...the last chunk is SHORT and that is not an error",
        man.chunks.at(-1).len === 5000 - 4 * 1024 && man.chunks.length === 5,
        "5000 bytes at 1024 gives four full chunks and a 904-byte tail");

    ok("...and the whole-file hash is the real thing, not a chunk hash",
        man.whole === crypto.createHash("sha256").update(src).digest("hex"),
        "DERIVED here rather than copied from the module -- if it computed the hash of something else, this " +
        "is the check that notices");
    console.log("  ----  NOT WIRED YET, and the reason is structural: verification needs a manifest from the");
    console.log("        SENDING side, and the peer walk currently reports only { rel, size }. Both ends move");
    console.log("        together or not at all, and half of it shipped alone would be a receiver refusing every");
    console.log("        transfer for want of a hash nobody sends.");
}

console.log();
if (fails) { console.log("chunkVerify-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("chunkVerify-selfcheck: all checks pass");
