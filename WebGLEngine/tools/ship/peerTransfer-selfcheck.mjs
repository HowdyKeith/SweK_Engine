// tools/ship/peerTransfer-selfcheck.mjs
//
// Run: node tools/ship/peerTransfer-selfcheck.mjs   (instant)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3104 -- THE PEER ALREADY TOLD US WHAT IT STORED, AND THE CALLER SUBSTITUTED ITS OWN NUMBER.
//
// v3089 gave assetSync a content check: verify the arriving bytes before the rename, because a 404 body is a
// complete, well-formed response that statSync calls present. It left peer Grab/Send untouched and said so.
// v3103's boundaryLint then named the general shape -- A LOCAL OBSERVATION STANDING IN FOR A FACT ABOUT
// SOMEWHERE ELSE -- and this is that shape in the one path whose entire job is moving bytes to another machine.
//
// SEND was the worse of the two, and it is worse than "no check". /peer/dl/put replies { ok, bytes:
// ws.bytesWritten } -- the receiving peer REPORTS WHAT IT WROTE -- and the caller already parses that body to
// read rr.ok. It then counted body.length: THE BYTES IT HANDED TO fetch. The answer was in the variable and the
// line reached past it. A truncated write on the far side returned ok:true and a byte total that agreed with
// itself perfectly.
//
// GRAB had two omissions. The walk response carries {rel, SIZE} for every file and nothing compared it, so a
// short read arrived with rr.ok true and was written as if complete. And it wrote DIRECTLY to the destination --
// no .part, no rename -- so an interrupted write left a corrupt file at the real path under a plausible name.
// assetSync has done temp+rename since v3054; this path never did, and both are the same tree.
//
// WHY A GATE ON SOURCE RATHER THAN A LIVE TRANSFER: two peers cannot be stood up in this sandbox, so the checks
// below assert the SHAPE of the code and exercise the ARITHMETIC on fixtures. That is stated rather than
// implied -- a gate that cannot run the thing it guards should say which half it is checking.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const raw = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
// codeOnly blanks comments AND strings, which this file needs because its own header discusses every idiom it
// checks. BUT ON server.js IT DESYNCS -- the documented limitation (a regex literal containing a quote) -- and
// the desync is POSITIONAL: it finds the Grab patch and loses the Send patch forty lines later, keeping 61% of
// the file. A GATE USING IT WOULD SILENTLY CHECK THE FIRST PART AND PASS ON THE REST, which is a partial scan
// reporting as a full one. So unambiguous CODE TOKENS are matched against RAW, per the tree's own rule, and the
// truncation is asserted below rather than left to be rediscovered.
const code = codeOnly(raw);

// ---- 1. SEND USES THE PEER'S NUMBER ---------------------------------------------------------------------------
{
    ok("!! Send reads what the PEER stored, not what it sent",
        /const stored = Number\(rr\.bytes\)/.test(raw),
        "/peer/dl/put replies { ok, bytes: ws.bytesWritten } and rr IS that parsed body. The old line counted " +
        "body.length -- the bytes handed to fetch -- so a truncated write on the far side reported ok:true with " +
        "a byte total that agreed with itself");
    ok("...and a disagreement is an ERROR, not a rounding",
        /stored !== body\.length/.test(raw) && /peer stored/.test(raw),
        "sent-versus-stored is reported with BOTH numbers. 'errors: 3' sends somebody to the network; 'sent " +
        "4096, peer stored 3712' sends them to the far side's disk");
    ok("...and body.length is only a FALLBACK when the peer says nothing",
        /Number\.isFinite\(stored\) \? stored : body\.length/.test(raw),
        "an older peer that does not report bytes still works -- absent is not the same as wrong, the same " +
        "distinction v3089 drew for an absent hash");
}

// ---- 2. GRAB CHECKS THE SIZE IT WAS ALREADY GIVEN ----------------------------------------------------------------
{
    ok("!! Grab compares the received length against the walk's size",
        /const want = Number\(f\.size\)/.test(raw) && /buf\.length !== want/.test(raw),
        "walkUnder has returned {rel, size} all along and nothing consulted it. A short read arrived with " +
        "rr.ok true and was written as if complete");
    ok("!! ...and writes .part THEN renames",
        /const tmp = dst \+ "\.part"/.test(raw) && /renameSync\(tmp, dst\)/.test(raw),
        "it wrote DIRECTLY to the destination, so an interrupted write left a corrupt file at the real path " +
        "under a plausible name. assetSync has done temp+rename since v3054; this path never did");
    ok("...and a mismatched file is NOT written",
        /errors\+\+; _grabNote\.push[\s\S]{0,120}?continue;/.test(raw),
        "the continue comes before the write, so a wrong-length file never reaches the destination at all -- " +
        "checking after the write would leave it installed for the length of one if-statement");
}

// ---- 3. THE ARITHMETIC, ON FIXTURES ------------------------------------------------------------------------------
// The transport cannot be exercised here, so the DECISION is -- both directions, because a rule that only ever
// sees matching numbers proves nothing.
{
    const grabVerdict = (want, got) => (Number.isFinite(want) && want >= 0 && got !== want) ? "REFUSE" : "WRITE";
    ok("SABOTAGE: a short read is refused", grabVerdict(4096, 3712) === "REFUSE", "expected 4096, got 3712");
    ok("...a byte-exact read is written", grabVerdict(4096, 4096) === "WRITE");
    ok("...and an ABSENT size still writes", grabVerdict(NaN, 3712) === "WRITE",
        "a peer that reports no size is unverified, not failed -- refusing it would break transfers for a " +
        "reason the operator cannot act on");

    const sendVerdict = (sent, stored) => (Number.isFinite(stored) && stored !== sent) ? "ERROR" : "OK";
    ok("SABOTAGE: a truncated far-side write is caught", sendVerdict(4096, 3712) === "ERROR");
    ok("...and a peer that reports nothing is not failed", sendVerdict(4096, NaN) === "OK");
}

// ---- 4. THE SCANNER'S OWN LIMIT, RECORDED SO IT IS NOT REDISCOVERED -------------------------------------------------
{
    const kept = code.length / raw.length;
    ok("!! codeOnly TRUNCATES server.js, and this file says so rather than trusting it",
        kept < 0.9 && raw.includes("const stored = Number(rr.bytes)") && !code.includes("const stored = Number(rr.bytes)"),
        "codeOnly keeps " + (100 * kept).toFixed(1) + "% of the file and the desync is POSITIONAL -- it finds the " +
        "Grab patch and loses the Send patch forty lines later. A gate matching code tokens against it would " +
        "check the first part and PASS ON THE REST: a partial scan reporting as a full one, which is why every " +
        "code-token assertion above is against RAW");
}

console.log();
if (fails) { console.log("peerTransfer-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("peerTransfer-selfcheck: all checks pass");
