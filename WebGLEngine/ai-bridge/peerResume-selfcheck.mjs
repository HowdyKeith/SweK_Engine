// ai-bridge/peerResume-selfcheck.mjs
//
// Run: node ai-bridge/peerResume-selfcheck.mjs   (~0.1s)
//
// v3160 -- /peer/dl/get NOW HONOURS A RANGE, AND THERE IS A MANIFEST TO RESUME AGAINST.
//
// It wrote 200 and streamed the whole file, in a server that has had an RFC 7233 implementation since v2208 and
// uses it for video seeking and CBZ pages. FIFTH TIME THIS SESSION A CAPABILITY EXISTED AND NOTHING REACHED FOR
// IT -- after rr.bytes, the blendshapes, sinoDivergence and thermal's Rayleigh number.
//
// *** httpRange IS REUSED, NOT REIMPLEMENTED. *** v3154 found six copies of one predicate, and the cost was a
// world where the geometry you can SEE and the geometry a ray can HIT were different sets. A second range
// parser here is the same mistake with 416 responses instead of walls -- and one that disagreed with the parser
// serving video would be worse than none, because both would look right in isolation.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const httpRange = createRequire(import.meta.url)(path.join(HERE, "httpRange.js"));
const CV = await import(pathToFileURL(path.join(HERE, "chunkVerify.mjs")).href);
const srv = fs.readFileSync(path.join(HERE, "server.js"), "utf8");

// ---- 1. THE SHAPE OF parseRange, WHICH I GOT WRONG FIRST ------------------------------------------------------
{
    ok("!! parseRange returns a KIND, not null and not a bare string",
        httpRange.parseRange(undefined, 1000).kind === "none" &&
        httpRange.parseRange("bytes=0-99", 1000).kind === "range" &&
        httpRange.parseRange("bytes=5000-", 1000).kind === "unsatisfiable",
        "MY FIRST VERSION tested _pr === the STRING unsatisfiable, and a bare if (_pr). An object is TRUTHY, so a request " +
        "carrying NO Range header would have been served a 206 WITH UNDEFINED BOUNDS -- and the API was one " +
        "command away");

    // v3104: codeOnly DESYNCS on server.js keeping ~61% positionally, so these match against RAW.
    ok("!! the route tests .kind, both branches",
        /_pr && _pr\.kind === "unsatisfiable"/.test(srv) && /_pr && _pr\.kind === "range"/.test(srv),
        "and an ABSENT header falls through to the 200 path -- no Range is not a degenerate range, it is the " +
        "whole file, and answering 206 would break every client that does not read Content-Range");

    ok("!! and it REUSES httpRange rather than parsing ranges again",
        /httpRange\.parseRange\(req\.headers/.test(srv) && /httpRange\.rangeHeaders\(_pr/.test(srv) &&
        /httpRange\.unsatisfiableHeaders\(st\.size\)/.test(srv),
        "all three helpers, from the module that already serves video seeks. A SECOND PARSER THAT DISAGREED " +
        "WITH THE FIRST would be worse than none, because both look right in isolation");

    ok("...and it answers 416 for an unsatisfiable range, not 200 with the whole file",
        /res\.writeHead\(416, httpRange\.unsatisfiableHeaders/.test(srv),
        "silently returning everything when somebody asked for byte 5000 of a 1000-byte file is the wrong " +
        "answer arriving with a success code -- a resuming client would append the whole file to its .part");
}

// ---- 2. THE MANIFEST, AND WHY IT IS PER FILE ------------------------------------------------------------------------
{
    ok("!! there is a manifest route, and it is PER FILE",
        /_psp === "\/peer\/dl\/manifest"/.test(srv) && /_q\(\)\.get\("path"\)/.test(srv),
        "chunkVerify has computed per-chunk digests since v3143 with no way to ask a peer for them: the walk " +
        "carries ONE whole-file hash (v3147), which answers 'is this the same file' and CANNOT answer 'from " +
        "which byte do I continue'");

    ok("!! and it is NOT in the walk, deliberately",
        !/chunkManifest/.test(fs.readFileSync(path.join(HERE, "peerFilesBridge.js"), "utf8")),
        "a manifest for every file in a listing would hash the whole tree to BROWSE A DIRECTORY -- 1.8s over " +
        "62 MB measured at v3147, paid for nothing. On demand, per file");

    ok("!! an absent manifest is an ERROR, never an empty one",
        /manifest failed: /.test(srv) && !/manifest: \{ chunks: \[\] \}/.test(srv),
        "returning { chunks: [] } would read to a receiver as 'this file has no content to verify' and accept " +
        "anything -- v3089's law, which this session has now applied to a hash, a walk entry and a manifest");

    ok("...and the route does not reimplement chunking",
        /import\("\.\/chunkVerify\.mjs"\)/.test(srv) && !/createHash\("sha256"\)[\s\S]{0,200}chunkBytes/.test(srv),
        "chunkVerify is ESM and server.js is CJS, so the import is a promise and the handler is not async -- " +
        ".then rather than await. Computing digests inline would be a SECOND implementation of chunking");
}

// ---- 3. THE RESUME ARITHMETIC IS ALREADY PROVEN, AND THIS IS WHAT IT NEEDED ------------------------------------------
{
    const src = Buffer.from("abcdefghij".repeat(500));
    const man = CV.chunkManifest(src, 1024);
    const partial = src.subarray(0, 2500);
    const r = CV.resumeRequest(man, partial);
    ok("!! resumeRequest names the byte a ranged GET should start at",
        r.need === true && r.from === 2048 && r.kind === "short",
        "2500 bytes on disk, resume from " + r.from + " -- the end of the last VERIFIED chunk, discarding 452 " +
        "bytes nothing has checked. THAT NUMBER IS WHAT THE RANGE HEADER IS FOR, and until this round there " +
        "was no way to send it");

    ok("...and a ranged read of the remainder reconstructs the file exactly",
        Buffer.concat([partial.subarray(0, r.from), src.subarray(r.from)]).equals(src),
        "prefix up to the verified point plus bytes " + r.from + "- from the peer. The arithmetic was gated at " +
        "v3143; the transport for it did not exist until now");
    console.log("  ----  NOT YET WIRED INTO THE GRAB: the routes and the arithmetic both exist and the Grab still");
    console.log("        fetches whole files. That is a smaller claim than 'resumable' and it is the honest one --");
    console.log("        v3143 shipped a module with no caller and SAID SO, and this is the same discipline.");
}

// ---- 4. v3161: THE GRAB NOW JOINS THE TWO HALVES ----------------------------------------------------------------
// v3143 built the arithmetic and shipped it with no caller, SAYING SO. v3160 built the transport and left it
// unjoined, SAYING SO. This joins them -- and the reason the .part file could never help before is worth more
// than the wiring: *** arrayBuffer() BUFFERS THE WHOLE FILE BEFORE A SINGLE BYTE IS WRITTEN, so an interrupted
// DOWNLOAD -- the part that takes ten minutes -- left NOTHING on disk. Only an interrupted WRITE left a .part,
// and that is the fast part. *** temp+rename protected the destination and could never shorten a retry.
{
    ok("!! the Grab asks for the MANIFEST before deciding what to keep",
        /\/peer\/dl\/manifest\?path=/.test(srv) && /cv\.resumeRequest\(mres\.manifest, _have\)/.test(srv),
        "a .part has a LENGTH and that is not the same as a trustworthy prefix -- resumeRequest returns the end " +
        "of the last VERIFIED chunk, and trusting the length instead is how a corrupt prefix becomes permanent");

    ok("!! and it DISCARDS everything past the last verified chunk",
        /_resumeFrom < _have\.length\) _have = _have\.subarray\(0, _resumeFrom\)/.test(srv),
        "bytes that happen to be right but sit after a gap are still bytes nothing validated -- keeping them " +
        "means trusting an offset no check ever reached");

    ok("!! no manifest means NO RESUME, not a guessed one",
        /else \{ _have = null; \}/.test(srv) && /catch \{ _have = null; \}/.test(srv),
        "if the peer cannot produce a manifest there is no basis to keep any prefix, so the transfer starts " +
        "over. SLOWER IS NOT WRONG; resuming on a guess is");

    ok("!! a Range is sent ONLY when there is something to keep",
        /_have && _resumeFrom > 0\) \? \{ Range: "bytes=" \+ _resumeFrom \+ "-" \}/.test(srv),
        "asking for bytes 0- would be a whole-file fetch wearing a 206, and the extra header buys nothing");

    ok("!! the SPLICE is decided by the STATUS, never by the request",
        /rr\.status === 206 && _have && _resumeFrom > 0/.test(srv),
        "a peer that ignored the Range answers 200 WITH THE WHOLE FILE. Splicing that onto a kept prefix would " +
        "DOUBLE ITS FRONT and produce a file that is the right length only by accident -- and the whole-file " +
        "hash would then be the only thing standing between that and the destination");

    ok("...and the outcome is NAMED either way",
        /": RESUMED from byte "/.test(srv) && /resume offered and the peer answered/.test(srv),
        "'resumed from byte 2048' and 'offered and the peer answered 200 -- refetched whole' are different " +
        "situations: one is the feature working, the other is a peer too old to have it, and a silent refetch " +
        "would look identical to both");

    // The arithmetic this depends on, re-asserted here because the Grab is not testable from one box.
    const src = Buffer.from("xyzzy-".repeat(900));
    const man = CV.chunkManifest(src, 1024);
    const corrupt = Buffer.from(src.subarray(0, 3000)); corrupt[1500] ^= 0xff;
    const rc = CV.resumeRequest(man, corrupt);
    ok("!! a CORRUPT prefix resumes from before the damage, not from its length",
        rc.kind === "corrupt" && rc.from === 1024 && rc.from < 1500,
        "3000 bytes on disk with a flipped bit at 1500: resume from " + rc.from + ", discarding everything " +
        "after the last good chunk. THE FILE LENGTH WOULD HAVE SAID 3000 and appended a tail to damage");
    console.log("  ----  WHAT THIS GATE CANNOT DO: run a transfer. It needs two peers, and one box has one.");
    console.log("        The ARITHMETIC is exercised here and the WIRING is asserted against the source; whether");
    console.log("        a real interrupted 70 MB Grab resumes is Keith's to see, and the note lines above are");
    console.log("        what he should look for in the report.");
}

// ---- 5. v3167: AUDIT EVERY CHUNK, BECAUSE THE MANIFEST MAKES IT POSSIBLE ---------------------------------------
// v3143 discarded everything after the first bad chunk, with the reason "A GAP CANNOT BE VERIFIED". *** THAT
// REASON IS ONLY TRUE WITHOUT A CHUNK LIST, AND v3160 ADDED ONE. *** Six rounds with the means to check each
// chunk independently and nothing using it -- surfaced only by comparing our protocol against copyparty's up2k,
// whose server replies with WHICH CHUNKS TO RESEND.
//
// A REASON CAN EXPIRE WITHOUT THE CODE CHANGING, AND NOTHING RE-READS THE REASONS.
{
    const src = Buffer.from("abcdefghij".repeat(700));      // 7000 bytes, 7 chunks at 1024
    const man = CV.chunkManifest(src, 1024);

    const one = Buffer.from(src); one[1500] ^= 0xff;
    const r1 = CV.resumeRanges(man, one);
    ok("!! ONE corrupt chunk refetches ONE chunk, not the whole tail",
        r1.bad.join() === "1" && r1.bytes === 1024 && r1.prefixOnlyBytes === 5976,
        "1024 bytes against 5976 -- 5.8x. On a 70 MB build with one bad chunk in the middle that is one " +
        "megabyte instead of half the file");

    ok("!! ADJACENT damage coalesces into a SINGLE range",
        (() => { const b = Buffer.from(src); b[1500] ^= 0xff; b[2500] ^= 0xff;
                 const r = CV.resumeRanges(man, b);
                 return r.bad.join() === "1,2" && r.ranges.length === 1 && r.ranges[0].start === 1024 && r.ranges[0].end === 3071; })(),
        "ONE CONTIGUOUS RANGE IS ALL A SINGLE Range HEADER CAN EXPRESS. A range per chunk would be correct and " +
        "chatty -- a 70 MB file with a missing tail would be seventy requests where one does");

    ok("!! SCATTERED damage stays as separate ranges, and is NOT silently merged",
        (() => { const b = Buffer.from(src); b[1500] ^= 0xff; b[5500] ^= 0xff;
                 const r = CV.resumeRanges(man, b); return r.ranges.length === 2; })(),
        "merging across a GOOD chunk would refetch bytes that are already correct and call it an optimisation");

    ok("!! MISSING and CORRUPT are kept apart",
        (() => { const r = CV.resumeRanges(man, src.subarray(0, 2500));
                 return r.missing.join() === "2,3,4,5,6" && r.bad.length === 0; })(),
        "a chunk past the local length was NEVER RECEIVED; a chunk that hashes wrong was RECEIVED WRONG. Both " +
        "need refetching and only the second means something went wrong on the wire");

    ok("!! *** and the saving is NOT claimed where it does not exist ***",
        (() => { const r = CV.resumeRanges(man, src.subarray(0, 2500)); return r.bytes === r.prefixOnlyBytes; })(),
        "for a SHORT file the two rules are IDENTICAL -- everything after the last whole chunk is missing " +
        "either way. THE SAVING IS FOR CORRUPT PREFIXES ONLY, and a general claim would be true in one case " +
        "out of two");

    ok("...and prefixOnlyBytes is computed by CALLING verifiedPrefix, not re-deriving it",
        /prefixOnlyBytes: manifest\.size - verifiedPrefix\(manifest, have\)\.verifiedBytes/.test(
            fs.readFileSync(path.join(HERE, "chunkVerify.mjs"), "utf8")),
        "a second implementation of 'where does the good prefix end' would be v3154's six-copies mistake IN THE " +
        "SAME FILE as the original");

    ok("!! the Grab takes the audit only when it is BOTH contiguous AND cheaper",
        /audit\.ranges\.length === 1 && audit\.bytes < plan\.prefixOnlyBytes/.test(srv),
        "scattered damage falls back to the prefix rule rather than inventing a multi-request protocol in a " +
        "round that has not designed one. DOING LESS THAN IS POSSIBLE BEATS SHIPPING A PROTOCOL BY ACCIDENT");
}

// ---- 6. v3175: SCATTERED DAMAGE IS FETCHABLE TOO -----------------------------------------------------------
// v3167 used the chunk audit ONLY when the damage was one contiguous range, and fell back to the prefix rule
// otherwise because "several ranges need multipart responses or several requests and neither has been
// designed". This designs it.
//
// *** SEVERAL ORDINARY REQUESTS, NOT MULTIPART. *** A multi-range reply arrives as multipart/byteranges and
// needs a PARSER -- boundaries, per-part headers, per-part Content-Range. THAT IS A SECOND IMPLEMENTATION OF
// SOMETHING SUBTLE, which v3143 refused for Merkle trees and v3154 spent a whole round undoing for a solidity
// predicate. On a LAN the round trips are free and every reply is an ordinary 206 the existing code handles.
{
    const src = Buffer.from("abcdefghij".repeat(700));
    const man = CV.chunkManifest(src, 1024);
    const dmg = Buffer.from(src); dmg[1500] ^= 0xff; dmg[5500] ^= 0xff;   // chunks 1 and 5

    const plan = CV.resumePlan(man, dmg);
    ok("!! scattered damage now yields a PLAN, not a fallback",
        plan.kind === "RANGES" && plan.ranges.length === 2 && plan.bytes === 2048,
        "two runs, 2048 bytes against a 7000-byte file. v3167 would have refetched from the first bad chunk " +
        "and thrown away everything after it");

    ok("!! the request count is BOUNDED and the fallback is NAMED",
        (() => {
            // A BIGGER FILE, BECAUSE MY FIRST FIXTURE WAS WRONG AND THE PLAN WAS RIGHT. Damaging one byte in
            // each of a 7-chunk file damages EVERY chunk, so they coalesce into one whole-file range and the
            // "nothing to keep" branch fires first -- correctly. 40 chunks leaves good ones between the bad.
            const big = Buffer.from("0123456789".repeat(4200));      // 42000 bytes, 41 chunks
            const bigMan = CV.chunkManifest(big, 1024);
            const wide = Buffer.from(big);
            for (const c of [2, 6, 10, 14, 18, 22, 26]) wide[c * 1024 + 5] ^= 0xff;   // 7 separated runs
            const p2 = CV.resumePlan(bigMan, wide, { maxRequests: 3 });
            return p2.kind === "WHOLE" && /over the 3-request budget/.test(p2.why); })(),
        "damage across forty chunks would be forty requests to save a fraction of a file. Past the budget the " +
        "honest answer is REFETCH WHOLE -- slower in bytes, simpler in failure modes, and STATED rather than " +
        "discovered");

    ok("!! nothing kept is NOT the same as scattered damage",
        (() => { const b = Buffer.from(src); b[10] ^= 0xff;
                 const all = Buffer.alloc(src.length);          // every chunk wrong
                 return CV.resumePlan(man, all).kind === "WHOLE" &&
                        /nothing to keep/.test(CV.resumePlan(man, all).why); })(),
        "a .part whose chunks ALL fail has no usable prefix, and asking for 'everything from byte 0' as a range " +
        "would be a whole-file fetch wearing a 206");

    // *** THE SPLICE VERIFIES EACH RANGE RATHER THAN THE ASSEMBLY. ***
    const honest = plan.ranges.map((r) => ({ start: r.start, end: r.end, body: src.subarray(r.start, r.end + 1) }));
    ok("!! honest ranges splice to a byte-identical file",
        (() => { const a = CV.spliceRanges(man, dmg, honest); return a.ok && a.buf.equals(src); })(),
        "and ok is true only when EVERY chunk passes the manifest afterwards -- not when the copy succeeded");

    ok("!! a SHORT body is refused by name, never copied",
        (() => { const bad = honest.map((p, i) => i === 0 ? { ...p, body: p.body.subarray(0, 10) } : p);
                 const r = CV.spliceRanges(man, dmg, bad);
                 return !r.ok && r.rejected.length === 1 && /expected 1024/.test(r.rejected[0].why); })(),
        "copying a short body anyway would SHIFT EVERYTHING AFTER IT, and the whole-file hash would then fail " +
        "for a reason nobody could locate");

    ok("!! *** a CORRUPT range names WHICH CHUNK is still wrong ***",
        (() => { const bad = honest.map((p, i) => { if (i !== 1) return p;
                     const x = Buffer.from(p.body); x[5] ^= 0xff; return { ...p, body: x }; });
                 const r = CV.spliceRanges(man, dmg, bad);
                 return !r.ok && r.stillBad.length === 1 && r.stillBad[0] === 5; })(),
        "stillBad [5]. A range that ARRIVED is not a range that is RIGHT -- v3161's law one level deeper. " +
        "Verifying after assembly would say the file is wrong; verifying per range says WHICH REQUEST TO REPEAT");

    ok("!! the Grab checks the status PER REQUEST",
        /if \(rr2\.status !== 206\) \{ allOk = false; break; \}/.test(srv),
        "a peer that ignored ONE Range header sends the WHOLE file for that request, and splicing it at " +
        "rg.start would overwrite everything after it");

    ok("...and a completed splice SKIPS the whole-file fetch",
        /const rr = _spliced \? null/.test(srv) && /const buf = _spliced \? _spliced/.test(srv),
        "spliceRanges reports ok only when every chunk passes, so there is nothing left to ask for -- fetching " +
        "anyway would download the whole file to arrive at bytes we already hold AND HAVE VERIFIED");
}

console.log();
if (fails) { console.log("peerResume-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("peerResume-selfcheck: all checks pass");
