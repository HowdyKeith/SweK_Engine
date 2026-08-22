// ai-bridge/peerContentVerify-selfcheck.mjs
//
// Run: node ai-bridge/peerContentVerify-selfcheck.mjs   (~0.1s)
//
// v3147 -- THE OTHER END OF v3143. The peer Grab now verifies CONTENT, not just length.
//
// v3104 taught it to compare the size the walk reported against the bytes received -- a real fix that catches
// TRUNCATION. It cannot catch CORRUPTION: a proxy serving a same-length error body, a padded partial write or a
// flipped bit all arrive at exactly the expected length and are written to the destination under the right
// name. v3143 built the verification and DELIBERATELY DID NOT WIRE IT, because the sending side reported only
// { rel, size } and a receiver shipped alone would refuse every transfer for want of a hash nobody sends.
//
// BOTH ENDS MOVED TOGETHER, WHICH IS WHY THIS COULD SHIP: walkUnder takes { hash: true }, the /peer/dl/walk
// route honours ?hash=1, the Grab ASKS for it, and the Grab refuses on a mismatch BEFORE the rename.
//
// OPT-IN, AND MEASURED: whole-file SHA-256 over this tree is 3193 files and 62 MB in 1.8 SECONDS -- negligible
// against transferring the same bytes, and pure waste for somebody browsing a directory. The Grab asks; the
// browser does not.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const B = createRequire(import.meta.url)(path.join(HERE, "peerFilesBridge.js"));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-pv-"));
fs.writeFileSync(path.join(dir, "a.bin"), Buffer.from("abcdefghij".repeat(200)));
fs.mkdirSync(path.join(dir, "sub"));
fs.writeFileSync(path.join(dir, "sub", "b.bin"), Buffer.from("zzz"));

// ---- 1. THE WALK CARRIES A DIGEST, AND ONLY WHEN ASKED -------------------------------------------------------
{
    const plain = B.walkUnder(dir, "");
    const hashed = B.walkUnder(dir, "", { hash: true });
    ok("!! a plain listing carries NO hash",
        plain.length === 2 && plain.every((f) => !("hash" in f)),
        "a BROWSE should not pay for it -- measured 1.8s over 3193 files and 62 MB on this tree. Negligible " +
        "against a transfer of the same bytes; pure waste for somebody clicking through a directory");

    ok("!! and ?hash=1 makes every entry carry one",
        hashed.length === 2 && hashed.every((f) => typeof f.hash === "string" && f.hash.length === 64),
        "sha256 per file, alongside the size the walk already reported");

    ok("...and the digest is the real thing, DERIVED here rather than trusted",
        hashed.find((f) => f.rel.endsWith("a.bin")).hash ===
        crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, "a.bin"))).digest("hex"),
        "if the walk hashed something else -- a path, a stat, an empty buffer -- this is the check that notices");
}

// ---- 2. THE CASE THE SIZE CHECK CANNOT SEE ---------------------------------------------------------------------------
{
    const real = fs.readFileSync(path.join(dir, "a.bin"));
    const corrupt = Buffer.from(real); corrupt[500] ^= 0xff;
    const entry = B.walkUnder(dir, "", { hash: true }).find((f) => f.rel.endsWith("a.bin"));

    ok("!! a same-size CORRUPT file still passes the LENGTH check",
        corrupt.length === entry.size,
        "asserted as PASSING because it is what v3104's check does and this round does not change it. One " +
        "flipped bit is still " + corrupt.length + " bytes. Stating it green stops the content check being " +
        "read as redundant by whoever finds this in a year");

    const got = crypto.createHash("sha256").update(corrupt).digest("hex");
    ok("!! and the CONTENT check catches it",
        got !== entry.hash,
        "which is the whole round. 'errors: 3' sends somebody to the network; 'size matched and content did " +
        "not' sends them to the proxy or the disk -- two hunts, two afternoons");

    ok("...and an honest file still passes",
        crypto.createHash("sha256").update(real).digest("hex") === entry.hash,
        "a check that refused everything would be indistinguishable from one that worked, on a transfer nobody " +
        "completed");
}

// ---- 3. AN ABSENT HASH IS NOT A PASSING HASH ---------------------------------------------------------------------------
{
    const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    // v3104: codeOnly DESYNCS on server.js and keeps only ~61% POSITIONALLY, so these match against RAW.
    ok("!! the Grab REFUSES an entry the peer could not hash",
        /if \(f\.hash === null\)/.test(srv) && /the peer could not hash it/.test(srv),
        "the walk sends hash:null with hashError when the read throws. Treating that as 'nothing to check' " +
        "would accept unverified bytes because nobody supplied a way to check them -- v3089's law from assetSync");

    ok("!! it refuses on a mismatch BEFORE the rename",
        (() => { const a = srv.indexOf("SIZE MATCHED AND CONTENT DID NOT"), b = srv.indexOf("const tmp = dst + \".part\""); return a > 0 && b > a; })(),
        "verifying after the rename would leave a corrupt file at the real path under a plausible name, which " +
        "is the exact failure temp+rename exists to prevent");

    ok("!! and the Grab actually ASKS for hashes",
        /\/peer\/dl\/walk\?path=" \+ encodeURIComponent\(rel\) \+ "&hash=1/.test(srv),
        "both ends moved together -- a receiver that verified without a sender that hashes would refuse every " +
        "transfer, which is why v3143 shipped the module unwired and said so");
}

fs.rmSync(dir, { recursive: true, force: true });
console.log();
if (fails) { console.log("peerContentVerify-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("peerContentVerify-selfcheck: all checks pass");
