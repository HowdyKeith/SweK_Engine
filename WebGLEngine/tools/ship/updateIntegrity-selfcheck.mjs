// WebGLEngine/tools/ship/updateIntegrity-selfcheck.mjs
//
// Run: node tools/ship/updateIntegrity-selfcheck.mjs   (~0.14s — MEASURED v3941, was ~3s)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3248 -- A TRUNCATED UPDATE DOWNLOAD AND A COMPLETE ONE RETURNED THE SAME THING.
//
// Keith, after a bad v3244 install: "Could an update have unzipped either a set of 4 files and webglengine and
// then died trying to run it, or could we have unzipped an incomplete swek zip file from a peer? Are we stv
// checking our update zip transfers between peers?"
//
// *** THE ANSWER WAS NO, AND THE MECHANISM WAS ONE MISSING COMPARISON. *** pullFrom read content-length,
// used it for a DISK-SPACE CHECK, and never looked at it again:
//
//     file.on("finish", () => { file.close(() => resolve({ ok: true, pulled: true, saved: dest, ... })); });
//
// `finish` fires when the stream ends -- INCLUDING WHEN IT ENDS EARLY. A dropped connection produced a short
// file, resolved ok:true / pulled:true, left it in Downloads with a fresh mtime, and scanDownloads offered it to
// the apply flow as the newest build available.
//
// AND A TRUNCATED ZIP OFTEN STILL OPENS, yielding its first entries before the central directory goes bad --
// WHICH IS HOW A PARTIAL TREE GETS EXTRACTED INSTEAD OF A CLEAN FAILURE. "A set of 4 files and WebGLEngine and
// then died trying to run it" is exactly the shape of that.
//
// TWO TRANSFER PATHS IN ONE TREE, ONE VERIFIED AND ONE NOT. chunkVerify computes per-chunk hashes and a resume
// manifest for the Grab path (v3143-v3167). THE UPDATE PATH USED NONE OF IT -- the session's signature defect,
// in the place where it does the most damage, because the thing it corrupts is the engine itself.
//
// WHAT THIS ROUND DOES AND DOES NOT DO: it makes a short transfer IMPOSSIBLE TO MISTAKE FOR A GOOD ONE. It does
// NOT hash the content, so a transfer that arrives complete and corrupt still passes. That is the next round,
// and it is smaller now that the plumbing exists.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const raw = fs.readFileSync(path.join(ROOT, "ai-bridge", "sysadminBridge.js"), "utf8");
const src = noComments(raw);

// ---- 1. THE LENGTH IS COMPARED, NOT JUST READ ---------------------------------------------------------------------------
{
    ok("!! *** the bytes that arrived are compared to content-length before success ***",
        /got !== need/.test(src) && /truncated engine zip/.test(raw),
        "content-length was READ and used only for the disk guard. `finish` fires when a stream ends INCLUDING " +
        "WHEN IT ENDS EARLY, so a dropped connection resolved ok:true and the apply flow took it from there. " +
        "A TRUNCATED DOWNLOAD AND A COMPLETE ONE RETURNED THE SAME THING");

    ok("!! ...and the refusal carries BOTH numbers",
        /gotBytes: got, expectedBytes: need/.test(src),
        "'truncated' alone sends nobody anywhere. 22.5 MB of 22.5 MB is a different problem from 3 MB of 22.5 MB " +
        "-- one is a header lying and the other is a network that died");

    ok("...and a peer that sends no length is REPORTED as unchecked rather than assumed good",
        /lengthChecked: !!need/.test(src),
        "no content-length means the comparison could not run. THAT IS NOT THE SAME AS PASSING IT, and a caller " +
        "that cannot tell the two apart is back where this started");
}

// ---- 2. A HALF FILE CANNOT BE SEEN AT ALL -------------------------------------------------------------------------------
{
    ok("!! *** the download lands on .part and is renamed only on success ***",
        /const part = dest \+ "\.part"/.test(src) && /fs\.renameSync\(part, dest\)/.test(src) &&
        !/createWriteStream\(dest\)/.test(src),
        "scanDownloads offers the NEWEST *.zip in the folder, so a short file with a fresh mtime was the next " +
        "thing installed. THE FAILURE MODE DOES NOT GET DETECTED HERE, IT STOPS EXISTING -- nothing but a " +
        "completed, length-checked transfer is ever named *.zip");

    ok("!! ...and .part is the tree's OWN partial vocabulary, not a new one",
        /PARTIAL_SUFFIXES = \[/.test(src) && /\\\\.part/.test(src),
        "PARTIAL_SUFFIXES already listed .part beside .crdownload, .download and .opdownload, and a separate " +
        "scanner already looks for them. A NEW SUFFIX WOULD HAVE BEEN A SECOND CONVENTION for the same idea -- " +
        "and this one is invisible to scanDownloads and correctly readable as in-flight");

    ok("...and every early exit cleans up the .part, not the .zip",
        !/fs\.unlinkSync\(dest\)/.test(src) && (src.match(/fs\.unlinkSync\(part\)/g) || []).length >= 4,
        "an error path that deleted `dest` would now delete a GOOD PREVIOUS DOWNLOAD while leaving the broken " +
        "one behind -- the exact inversion of the fix");
}

// ---- 3. THE CONTENT IS VERIFIED, NOT JUST THE LENGTH (v3249) -----------------------------------------------------------
{
    const srv = noComments(fs.readFileSync(path.join(ROOT, "ai-bridge", "server.js"), "utf8"));
    const cv = await import(pathToFileURL(path.join(ROOT, "ai-bridge", "chunkVerify.mjs")).href);

    // DRIVEN, NOT READ: the whole claim of this round is that a SAME-LENGTH corruption is caught, and the only
    // way to assert that is to corrupt something and watch it be refused.
    const buf = Buffer.from("hello swek engine zip contents, long enough to matter");
    const man = cv.chunkManifest(buf);
    const bad = Buffer.from(buf); bad[3] ^= 0xff;
    const good = cv.acceptOrRefuse(man, buf);
    const flip = cv.acceptOrRefuse(man, bad);

    ok("!! *** a single flipped bit at the SAME LENGTH is refused ***",
        good.ok === true && flip.ok === false && /content does not/i.test(String(flip.reason || "")),
        "v3248's size check answers 'DID IT ALL ARRIVE', not 'IS IT THE SAME FILE' -- chunkVerify's own words. " +
        "A proxy serving a same-length error body, a partial write later padded, a flipped bit in flight: ALL " +
        "ARRIVE AT EXACTLY THE EXPECTED LENGTH and used to be written to the destination under the right name");

    ok("!! ...and the peer SERVES a manifest for the zip it offers",
        /\/update\/zip\/manifest/.test(srv) && /chunkManifest\(buf\)/.test(srv),
        "served from THE SAME updateZipPath() the zip route uses, so the manifest cannot describe a different " +
        "file than the one the next request downloads");

    ok("!! ...and the puller compares it before renaming .part",
        /acceptOrRefuse\(man, fs\.readFileSync\(part\)\)/.test(src) &&
        /failed verification/.test(raw),
        "the check sits between the completed download and the rename, so A ZIP THAT FAILS IT IS NEVER NAMED " +
        "*.zip and scanDownloads never sees it -- the same shape as the truncation fix rather than a second one");

    ok("!! *** a peer with no manifest is REPORTED, not refused ***",
        /hashChecked = false/.test(src) && /pre-v3249 build/.test(raw) && /hashChecked, hashWhy/.test(src),
        "chunkVerify's own law is to refuse unverified bytes, and that is right for the Grab. HERE IT WOULD MEAN " +
        "A BOX CAN NEVER UPDATE FROM AN OLDER PEER, breaking the fleet on the way to making it safe. So an " +
        "absent manifest sets hashChecked:false and says why -- the caller sees the difference and nothing is hidden");

    ok("...and the manifest fetch cannot strand a good download",
        /setTimeout\(5000/.test(src),
        "this runs BETWEEN a completed download and its rename. A peer that hangs must not leave a good zip in " +
        ".part forever, so a timeout falls through to hashChecked:false with the reason");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT DO: hash the content. A transfer that arrives COMPLETE AND CORRUPT still");
console.log("  ----  passes, and chunkVerify -- which computes per-chunk digests for the Grab path -- is still");
console.log("  ----  not consulted by the updater. TWO TRANSFER PATHS, ONE VERIFIED, ONE NOT. That is the next");
console.log("  ----  round, and it is smaller now that the .part plumbing exists to hang it on.");
if (fails) { console.log("updateIntegrity-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("updateIntegrity-selfcheck: all checks pass");
