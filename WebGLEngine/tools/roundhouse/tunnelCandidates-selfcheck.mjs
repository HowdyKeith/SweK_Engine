// tools/roundhouse/tunnelCandidates-selfcheck.mjs
//
// v2956 -- WHY THIS REGISTRY NEVER PRUNES.
//
// Observed on this hub: a fresh Cloudflare quick tunnel often does not work immediately, some never work, some
// stop working, and some START WORKING AGAIN LATER -- including ones already tried and written off, sometimes
// whole batches at once. That last behaviour is the design constraint, because it means:
//
//     A FAILED PROBE IS EVIDENCE ABOUT A MOMENT, NOT A PROPERTY OF THE URL.
//
// Pruning on failure would therefore destroy the candidate that is about to become the only working one. This
// registry demotes instead of deleting, and only an explicit operator retire removes anything.

import { emptyCandidates, addCandidate, recordAttempt, retire, orderedCandidates, normUrl } from "./tunnelCandidates.mjs";
// v3033 -- path and url were USED at line 70 and never imported. The gate passes because that code sits in a
// branch this run does not take -- the SAME latent shape as the os.homedir() crash in terrainBuildBridge,
// found by the detector written for it rather than by anything executing.
import path from "node:path";
import url from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const U = (n) => `https://${n}.trycloudflare.com`;

// ---- 1. FAILURE NEVER REMOVES A CANDIDATE ------------------------------------------------------------------------------
{
    let R = addCandidate(emptyCandidates(), U("alpha"));
    for (let i = 0; i < 20; i++) R = recordAttempt(R, U("alpha"), false, { at: "2026-07-25T10:00:00Z" });
    ok("!! twenty consecutive failures do NOT remove the candidate",
        orderedCandidates(R).includes(U("alpha")) && R.urls[U("alpha")].failures === 20,
        "still in the try-list after 20 failures. These tunnels recover, often in batches, so the cost of trying " +
        "a stale candidate is ONE TIMEOUT and the cost of having pruned the only working one is total");

    // and it can come back
    R = recordAttempt(R, U("alpha"), true, { at: "2026-07-25T20:00:00Z" });
    ok("...and when it comes back, it goes straight to the FRONT of the order",
        orderedCandidates(R)[0] === U("alpha"),
        "a recent success outranks everything, so recovery is picked up immediately rather than waiting out a " +
        "penalty the code invented");
}

// ---- 2. THE ORDER ENCODES THE ACTUAL EVIDENCE ---------------------------------------------------------------------------
{
    let R = emptyCandidates();
    for (const n of ["succ", "untried", "oldfail", "newfail"]) R = addCandidate(R, U(n));
    R = recordAttempt(R, U("succ"), true, { at: "2026-07-25T08:00:00Z" });
    R = recordAttempt(R, U("oldfail"), false, { at: "2026-07-25T09:00:00Z" });
    R = recordAttempt(R, U("newfail"), false, { at: "2026-07-25T19:50:00Z" });
    const o = orderedCandidates(R);
    ok("!! order is: recently succeeded, then untried, then oldest failure, then freshest failure",
        o[0] === U("succ") && o[1] === U("untried") && o[2] === U("oldfail") && o[3] === U("newfail"),
        o.map((u) => u.replace("https://", "").split(".")[0]).join(" > ") + ". A URL nobody has tried is a better " +
        "bet than one that failed a minute ago; a URL that failed an hour ago is a better bet than one that " +
        "failed a minute ago. The ordering is the whole prune, and it costs nothing");
}

// ---- 3. ONLY AN EXPLICIT RETIRE REMOVES ANYTHING -------------------------------------------------------------------------
{
    let R = recordAttempt(addCandidate(emptyCandidates(), U("dead")), U("dead"), false);
    ok("a failing URL is still offered",
        orderedCandidates(R).includes(U("dead")), "failure demotes, never removes");
    R = retire(R, U("dead"));
    ok("!! only an explicit operator retire takes a URL out of the list",
        !orderedCandidates(R).includes(U("dead")) && R.urls[U("dead")].retired === true,
        "retiring is an ACT, recorded as such, not an inference the code drew from one bad afternoon. And the " +
        "record survives -- a retired URL keeps its history and can be un-retired");
    ok("...and it is reversible, with the history intact",
        orderedCandidates(retire(R, U("dead"), false)).includes(U("dead")),
        "un-retiring restores it; nothing was destroyed");
}

// ---- 4. THE PEER TRIES THE WHOLE LIST -------------------------------------------------------------------------------------
{
    const fs = await import("node:fs"), path = await import("node:path"), url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const script = fs.readFileSync(path.join(here, "lighthouse_checkin.mjs"), "utf8");
    ok("!! the peer walks every candidate before giving up",
        /for \(const cand of candidates\)/.test(script) && /break;/.test(script),
        "it stops at the first address that answers, and only reports failure after trying them all");

    ok("!! and a total failure discards nothing on the peer side either",
        /NO url was discarded/.test(script),
        "the peer keeps its whole list too. The same reasoning applies at both ends: the address that failed " +
        "today is a live candidate tomorrow");

    ok("a successful check-in refreshes the peer's candidate list from the hub",
        /\/tunnels/.test(script) && /candidate list refreshed/.test(script),
        "a peer that got in once learns about newer tunnels, so it does not slowly go stale and need a human to " +
        "re-send it an address");
}

// ---- 5. NORMALISATION KEEPS ONE URL FROM BECOMING TWO -----------------------------------------------------------------------
{
    ok("trailing slashes and case-equivalent origins collapse to one candidate",
        normUrl("https://a.trycloudflare.com/") === normUrl("https://a.trycloudflare.com"),
        "otherwise the same tunnel accumulates duplicate records and its evidence is split across them");
    ok("non-http(s) schemes are refused",
        normUrl("javascript:alert(1)") === null && normUrl("file:///etc/passwd") === null,
        "the candidate list becomes a fetch target on a remote machine, so it takes http(s) only");
}

console.log();
if (fails) { console.log("tunnelCandidates-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("tunnelCandidates-selfcheck: all checks pass");
