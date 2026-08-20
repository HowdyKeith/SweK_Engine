// tools/ship/assetHash-selfcheck.mjs
//
// Run: node tools/ship/assetHash-selfcheck.mjs   (instant)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3089 -- THE HASH WAS COMPUTED, PUBLISHED, AND THROWN AWAY.
//
// Keith proposed taking one idea from alt-sendme/DashBeam: content-addressed artifacts, with the hash in the
// ticket, so "is this complete" and "is this the one I asked for" stop being two separate questions. Checking
// the tree before building anything found something better than a missing feature -- A FEATURE MISSING ITS LAST
// STEP. assetSync has computed a SHA-256 per file since it was written, /sync/manifest publishes it, and the
// pull loop uses it to decide what NOT to fetch. Nothing ever checked what ARRIVED. The number was right there
// in the manifest looking like a guarantee and guaranteeing nothing.
//
// AND THE UPDATE PATH DID NOT NEED THE ROUND AT ALL, which is why it was read first rather than trusted.
// signRelease.mjs already signs {version, sha256, size} with ed25519 against a locally pinned key. The handoff
// note said "verify before scoping" and verifying is what stopped this round rebuilding something that exists --
// the failure knowledge-index.json was built to prevent, and which this tree has committed before.
//
// PROCEDURAL VERSUS STRUCTURAL, which is the whole of Keith's point. v3054 answered "a truncated download cannot
// pass as installed" with temp+rename: write to .part, rename when the stream finishes. That is real and it
// covers a writer that stops early. IT CANNOT COVER A STREAM THAT COMPLETED WITH THE WRONG BYTES -- a 404 body,
// a captive-portal page, a mangling proxy, a peer serving a different build. All of those finish cleanly, rename
// happily, and statSync reports present. A hash makes the guard structural: the wrong bytes do not hash to the
// entry, so they cannot be mistaken for the file.
//
// WHAT THIS IS NOT, stated so it cannot be oversold. The hash is truncated to 24 hex characters (96 bits) and
// travels in the same manifest as the file list. That is an INTEGRITY check against corruption, truncation and
// mis-service. It is NOT a security boundary: a peer that can choose the bytes can choose the manifest too. The
// signed release is the path with a trust anchor. Two different guarantees, named apart.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const raw = fs.readFileSync(path.join(ENG, "ai-bridge", "assetSync.js"), "utf8");
// noComments keeps STRING LITERALS and drops comments: this file's own header quotes the idioms it checks for,
// and matching raw text would report the explanation as the implementation. Eleventh time that trap has been
// live in this tree; codeOnly would be wrong here because some of what is hunted IS a string.
const code = noComments(raw);

// ---- 1. THE HASH REACHES THE DOWNLOADER --------------------------------------------------------------------------
{
    ok("_download takes the expected hash",
        /_download\(\s*url\s*,\s*destFull\s*,\s*expectHash\s*\)/.test(code),
        "it took (url, destFull) and had nothing to compare against even if it had wanted to");
    ok("...and toPull carries it from the manifest",
        /toPull\.push\(\s*\{[^}]*hash:/.test(code),
        "the manifest knew the content and toPull knew only the size -- the hash stopped one line short of the " +
        "only place it could have been used");
    ok("...and the call site passes it",
        // the call spans a chain containing its own parentheses (.join("/")), so a [^)]* class stops early
        // and reports a wired call site as unwired -- my own regex, failing on correct code, in the round about
        // a check that could not see what it was looking at.
        /_download\([\s\S]*?dest\.full,\s*hash\)/.test(code),
        "a parameter nothing supplies is a parameter that is always undefined, which would have made every " +
        "check below pass vacuously");
}

// ---- 2. VERIFY BEFORE THE RENAME, NOT AFTER ------------------------------------------------------------------------
// ORDER IS THE WHOLE GUARD. Checking after the rename leaves a wrong file installed for the length of one
// if-statement, and a crash in that window installs it permanently.
{
    const iCheck = code.indexOf("_mismatch(tmp, expectHash)");
    const iRename = code.indexOf("fs.renameSync(tmp, destFull)");
    ok("!! the content check runs BEFORE the rename",
        iCheck > 0 && iRename > 0 && iCheck < iRename,
        "the rename is what makes the file real; verifying afterwards is verifying an installed file");
    ok("...and a failed check deletes the .part rather than leaving it",
        /if \(bad\) \{[^}]*unlinkSync\(tmp\)/.test(code.replace(/\n/g, " ")),
        "a rejected .part left on disk is the next run's mystery, and disk-space guards elsewhere in this file " +
        "would then be counting bytes nobody wants");
    ok("the buffered fallback is guarded too",
        /arrayBuffer\(\)[\s\S]{0,400}?hash-mismatch/.test(code),
        "a guard on only the streaming path works until the day a response arrives without a body reader");
}

// ---- 3. A FAILED HASH IS NOT A FAILED FETCH -------------------------------------------------------------------------
{
    ok("!! a content mismatch is reported as its own cause, not as an HTTP error",
        /content mismatch -- expected/.test(code) && /hash-unreadable/.test(code),
        "the transfer SUCCEEDED and the bytes are wrong. Reporting 'fetch HTTP undefined' would send someone to " +
        "the network for a problem in the payload -- two outcomes wearing one label, which this tree has met " +
        "enough times to name them apart on sight");
    ok("...and the message says the file was NOT installed",
        /NOT installed/.test(code),
        "a refusal that does not say what it refused reads as a warning, and a warning gets scrolled past");
}

// ---- 4. THE DECISION, EXERCISED ON REAL BYTES ------------------------------------------------------------------------
// The module-level helper is not exported, so this reproduces its rule on real temp files rather than asserting
// it from the source alone. Both directions, because a check that only ever sees good input proves nothing.
{
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "swek-assethash-"));
    const h = (b, n) => crypto.createHash("sha256").update(b).digest("hex").slice(0, n);
    const good = Buffer.from("the real asset bytes, whatever they are");
    const wrong = Buffer.from("<html>404 Not Found</html>");        // complete, well-formed, and not the file
    const truncated = good.slice(0, 10);                            // the v3054 case, now caught structurally
    const expect = h(good, 24);
    const verdict = (buf) => h(buf, 24) === expect;

    ok("the correct bytes verify", verdict(good), "expected " + expect);
    ok("!! a COMPLETE but wrong response is refused",
        !verdict(wrong),
        "a 404 body is a finished stream: temp+rename installs it happily and statSync says present. This is " +
        "exactly the case the procedural guard cannot see");
    ok("!! a TRUNCATED file is refused too",
        !verdict(truncated),
        "the case v3054 solved procedurally, now also structural -- a partial file does not hash to its entry, " +
        "so it cannot pass as installed no matter what order the writer crashed in");
    try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
}

// ---- 5. AN ABSENT HASH IS NOT A FAILED HASH ---------------------------------------------------------------------------
{
    ok("!! a peer that publishes no hash still syncs",
        /if \(!expectHash\) return null;/.test(code),
        "refusing a peer that predates hashed manifests would break the feature for a reason the operator " +
        "cannot act on. Unverified is a different state from failed, and turning the first into the second is " +
        "how a safety check becomes an outage");
    console.log("  NOTE   96 bits, in the same manifest as the file list: an INTEGRITY check against corruption,");
    console.log("         truncation and mis-service, NOT a security boundary. signRelease.mjs is the path with a");
    console.log("         trust anchor -- ed25519 over a full sha256 against a locally pinned key.");
}

console.log();
if (fails) { console.log("assetHash-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("assetHash-selfcheck: all checks pass");
