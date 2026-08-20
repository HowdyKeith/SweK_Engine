// tools/ship/copypartyRegistry-selfcheck.mjs
//
// Run: node tools/ship/copypartyRegistry-selfcheck.mjs   (instant)
//
// v3166 -- copyparty REGISTERED WITH THE EXISTING PRIMITIVE, and the protocol comparison that came first.
//
// I said I would compare the resume protocols BEFORE wiring anything, so we would know whether theirs is better
// than ours or merely older. It is better in one specific way, and the finding is about OUR code:
//
// *** up2k's HANDSHAKE SENDS THE CLIENT'S HASHLIST AND THE SERVER REPLIES WITH WHICH CHUNKS TO RESEND. *** A
// transfer with a hole in the middle re-sends exactly those chunks. OURS RESUMES FROM THE FIRST BAD CHUNK AND
// DISCARDS EVERYTHING AFTER IT -- gated at v3143 with the reason "a gap cannot be verified", WHICH IS ONLY TRUE
// WITHOUT A CHUNK LIST. v3160 added /peer/dl/manifest, which is exactly a chunk list. We have had the means to
// verify each chunk independently since then AND HAVE NOT USED IT.
//
// That improvement needs no adoption of anything. It is recorded here rather than built, because it changes
// verifiedPrefix's contract and wants its own round.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const A = createRequire(import.meta.url)(path.join(ENG, "ai-bridge", "autoInstall.js"));
const doc = fs.readFileSync(path.join(ENG, "docs", "upstream", "copyparty-vs-peer-transfer.md"), "utf8");

// ---- 1. REGISTERED WITH THE PRIMITIVE, NOT BESIDE IT -----------------------------------------------------------
{
    const e = A.REGISTRY.find((x) => x.id === "copyparty");
    ok("!! copyparty is in the EXISTING registry, not given a second launcher",
        !!e && e.tier === "app" && e.install && e.install.kind === "pip",
        "autoInstall has been the per-panel dependency registry since v1199, with four pip entries already. " +
        "v3154 spent a round collapsing SIX copies of one predicate into one -- A SECOND INSTALL PATH FOR THE " +
        "SAME KIND OF THING IS HOW THE SIXTH COPY HAPPENS");

    ok("!! and it surfaces through list(), so the panel can show it",
        A.list().items.some((x) => x.id === "copyparty"),
        "registered but invisible would be a module with no caller in registry form");

    ok("!! detect() reports it MISSING on a box without it, rather than assuming",
        A.detect("copyparty") === "missing",
        "this box has no copyparty. An ABSENT dependency reported as present is the failure v3089 named for " +
        "hashes and this session has now met in a walk entry, a manifest and a registry");

    ok("!! *** autoRun is OFF, deliberately ***",
        !A.REGISTRY.find((x) => x.id === "copyparty").autoRun && !!A.REGISTRY.find((x) => x.id === "go2rtc").autoRun,
        "go2rtc sets it because a camera server with nothing to serve is harmless. A FILE SERVER THAT STARTS " +
        "ITSELF is a decision about what is exposed and to whom -- and copyparty's own README warns that " +
        "running it bare gives everyone read/write access to the current folder. Keith's choice, not a " +
        "registry's, and the asymmetry with go2rtc is asserted so nobody 'fixes' the inconsistency");
}

// ---- 2. THE COMPARISON EXISTS AND SAYS WHERE THEIRS WINS ---------------------------------------------------------
{
    ok("!! the comparison names where THEIRS is better, not just where ours is",
        /server replies with a list of chunks to reupload/i.test(doc) && /DISCARDS EVERYTHING AFTER IT/.test(doc),
        "a comparison that found our own work superior in every respect would be a comparison I wrote to " +
        "confirm something. Theirs re-sends exactly the bad chunks; ours throws away the tail");

    ok("!! and it names the reason OUR limitation is no longer necessary",
        /only true without a chunk list/i.test(doc) && /v3160 added/.test(doc),
        "v3143's 'a gap cannot be verified' was correct WHEN WRITTEN and stopped being correct at v3160, when " +
        "the manifest route landed. A REASON CAN EXPIRE WITHOUT THE CODE CHANGING, and nothing re-reads the " +
        "reasons");

    ok("...and it states THEIR drawback too",
        /hash\s+the\s+ENTIRE\s+file\s+before\s+an\s+upload\s+can\s+begin/i.test(doc),
        "up2k cannot start until the client has hashed everything; a Grab starts immediately. Leaving that out " +
        "would make the comparison an argument");

    ok("!! the scope is written down: phone peers YES, engine-to-engine Grab NO",
        /android-peer\.html.*ios-peer\.html.*ZERO times/s.test(doc) && /TWO\s+AUTH\s+SYSTEMS\s+FOR\s+ONE\s+MESH/.test(doc),
        "the phone peers cannot move a file at all, and copyparty runs in Termux and a-Shell. But putting it " +
        "under _isTrustedReq and the PIN gate would mean two auth systems for one mesh -- the " +
        "two-things-one-label shape in the place where it is worst");
}

console.log();
console.log("  ----  NOT DONE, AND EACH FOR A STATED REASON: the phone-peer front door (needs a page design and");
console.log("  ----  a port decision -- 3923 by default, against swek_free_port); and the per-chunk resume this");
console.log("  ----  comparison uncovered, which changes verifiedPrefix's contract and wants its own round.");
if (fails) { console.log("copypartyRegistry-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("copypartyRegistry-selfcheck: all checks pass");
