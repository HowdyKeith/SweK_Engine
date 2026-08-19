// WebGLEngine/ai-bridge/tunnelUrlScan-selfcheck.mjs -- v3815
//
// Run: node ai-bridge/tunnelUrlScan-selfcheck.mjs
//
// *** WHAT HAPPENED, ON KEITH'S RIG, IN HIS WORDS: the tunnel "goes to starting, but then it changes to ... no
// tunnel running". And the answer was in cloudflared's own output the whole time: ***
//
//     failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": remote error: tls: internal error
//
// THE SCANNER READ THAT SENTENCE AS AN ADDRESS. The old pattern was
// /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i and `api` matches [a-z0-9-]+, so the host cloudflared talks TO
// was harvested out of the message saying it could not be reached. REPRODUCED against the real bridge with a
// stub cloudflared: url came back "https://api.trycloudflare.com", reason came back NULL.
//
// *** AND THE NULL REASON IS THE PART THAT MATTERS, BECAUSE TWO PREVIOUS ROUNDS ALREADY FIXED THIS SYMPTOM. ***
// v2856 added the reason so a failed start would stop looking like an idle panel. v3809 widened the guard
// because exit code 0 and a signal kill both slipped through it. Both were correct. Both were defeated by the
// SAME LINE, because the guard is `if (!_tunnel.url ...)` and a URL had been set -- a wrong one, scraped from
// the error. A GUARD IS ONLY AS GOOD AS THE FACT IT GUARDS ON.
//
// AND THE THIRD CONSEQUENCE IS THE ONE THAT WOULD HAVE TRAVELLED: verifyUrl() was pointed at Cloudflare's
// control plane, and tunnelEmail.notify() sends the URL once it verifies. *** A FAILED TUNNEL THAT EMAILS YOU
// A WORKING-LOOKING LINK TO api.trycloudflare.com IS WORSE THAN ONE THAT EMAILS NOTHING. ***
//
// WHAT IS GRADED HERE: the extractor is a pure function of cloudflared's log text, so the whole thing is
// testable with no process, no network and no cloudflared. The happy path is graded FIRST and hardest, because
// the dangerous direction of this fix is the other one -- a scanner tightened until it misses a real address
// turns a working tunnel into a silent one, and nobody would suspect the scanner.

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { extractTunnelUrl, classifyTunnelFailure } = require(path.join(HERE, "hostingBridge.js"));

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const REAL = "https://driver-madison-carrier-holy.trycloudflare.com";
const BANNER = [
    "2026-08-16T00:42:58Z INF Thank you for trying Cloudflare Tunnel.",
    "2026-08-16T00:42:58Z INF Requesting new quick Tunnel on trycloudflare.com...",
    "2026-08-16T00:42:59Z INF +---------------------------------------------------------+",
    "2026-08-16T00:42:59Z INF |  Your quick Tunnel has been created! Visit it at:        |",
    "2026-08-16T00:42:59Z INF |  " + REAL + "  |",
    "2026-08-16T00:42:59Z INF +---------------------------------------------------------+",
].join("\n");

// Keith's actual failure, pasted from the rig.
const KEITHS = [
    "2026-08-16T00:42:58Z INF Thank you for trying Cloudflare Tunnel. Doing so, without a Cloudflare account, is a quick way to experiment and try it out. However, be aware that these account-less Tunnels have no uptime guarantee, are subject to the Cloudflare Online Services Terms of Use (https://www.cloudflare.com/website-terms/), and Cloudflare reserves the right to investigate your use of Tunnels for violations of such terms. If you intend to use Tunnels in production you should use a pre-created named tunnel by following: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps",
    "2026-08-16T00:42:58Z INF Requesting new quick Tunnel on trycloudflare.com...",
    'failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": remote error: tls: internal error',
].join("\n");

console.log("1. THE HAPPY PATH FIRST, BECAUSE THAT IS THE EXPENSIVE DIRECTION TO BREAK");
{
    ok("!! *** A REAL BANNER URL IS STILL FOUND ***", extractTunnelUrl(BANNER) === REAL,
        "got " + extractTunnelUrl(BANNER) + ". A SCANNER TIGHTENED UNTIL IT MISSES THE REAL ADDRESS TURNS A " +
        "WORKING TUNNEL INTO A SILENT ONE, and the panel would say 'starting...' forever with nothing wrong");
    ok("...found even when the failure banner precedes it in the same log",
        extractTunnelUrl(KEITHS + "\n" + BANNER) === REAL,
        "cloudflared retries, so a log can hold a failed attempt AND a successful one. The success must win");
    ok("...and the pipes and padding of the box do not interfere", extractTunnelUrl("INF |  " + REAL + "  |") === REAL);
    ok("...nor does a trailing slash", extractTunnelUrl("INF |  " + REAL + "/  |") === REAL,
        "the banner does not print one today, but a scanner that depended on that would be pinned to somebody " +
        "else's formatting");
}

console.log("\n2. KEITH'S LOG, WHICH IS THE WHOLE REASON THIS FILE EXISTS");
{
    const got = extractTunnelUrl(KEITHS);
    ok("!! *** NO URL IS HARVESTED FROM THE FAILURE ***", got === null,
        "got " + JSON.stringify(got) + ". Before v3815 this returned \"https://api.trycloudflare.com\" -- THE " +
        "HOST CLOUDFLARED TALKS TO, TAKEN FROM THE SENTENCE SAYING IT COULD NOT BE REACHED");
    ok("!! ...so the close handler's `!_tunnel.url` guard can fire and v3809's reason survives", got === null,
        "*** THIS IS WHY TWO EARLIER FIXES DID NOT HOLD. *** v2856 and v3809 both made a failed start explain " +
        "itself, and both were defeated by this one line, because a guard is only as good as the fact it " +
        "guards on");
    ok("!! ...and verifyUrl is never pointed at Cloudflare's control plane", got === null,
        "which is what would have EMAILED KEITH https://api.trycloudflare.com AS HIS TUNNEL had it answered 200");
    ok("the ToS and docs links in the banner are not mistaken for tunnels either",
        extractTunnelUrl("see https://www.cloudflare.com/website-terms/ and https://developers.cloudflare.com/x") === null,
        "different domain, so the pattern never matched them -- checked so the claim is measured, not assumed");
}

console.log("\n3. THE TWO RULES, EACH SHOWN TO BE DOING WORK");
{
    // If either rule alone were enough, the other would be decoration. Both are checked in isolation.
    ok("!! rule (a): a URL on a line REPORTING A FAILURE is not an address",
        extractTunnelUrl('failed: Post "https://random-words-here.trycloudflare.com/tunnel"') === null,
        "a hostname that is NOT on the deny list, on an error line, is still refused -- so the line rule is " +
        "load-bearing and not covered by the deny list");
    ok("!! rule (b): `api` is Cloudflare's control plane and is never a tunnel",
        extractTunnelUrl("INF |  https://api.trycloudflare.com  |") === null,
        "a deny-listed host on a CLEAN line is still refused -- so the deny list is load-bearing and not " +
        "covered by the line rule");
    say("DELIBERATELY NOT A RULE: \"a real quick tunnel hostname contains a hyphen\". It is true of every one I " +
        "have seen and it is A GUESS ABOUT SOMEBODY ELSE'S NAMING SCHEME. The failure mode of guessing wrong " +
        "is the worst available here -- a live tunnel the panel refuses to show -- so the scanner does not " +
        "depend on it. " + (extractTunnelUrl("INF |  https://tunnel.trycloudflare.com  |") === "https://tunnel.trycloudflare.com"
        ? "A single-word hostname on a clean line IS accepted, which is that decision being kept."
        : "*** BUT A SINGLE-WORD HOSTNAME IS BEING REJECTED, WHICH MEANS THE GUESS CREPT IN. ***"));
    if (extractTunnelUrl("INF |  https://tunnel.trycloudflare.com  |") !== "https://tunnel.trycloudflare.com") fails++;
}

console.log("\n4. THE PANEL IS TOLD WHAT TO DO, NOT JUST WHAT HAPPENED");
{
    const c = classifyTunnelFailure(KEITHS);
    ok("!! the TLS alert is classified", !!c && /TLS layer/i.test(c), (c || "").slice(0, 90) + "...");
    ok("!! *** AND IT SAYS THE FAILURE IS NOT THE USER'S SERVER ***", !!c && /NOT\s+YOUR SERVER/i.test(c),
        "the alert came from api.trycloudflare.com and THE LOCAL PORT WAS NEVER TRIED. Without that sentence " +
        "the obvious next move is to go and debug a local server that was never involved");
    // v3819 -- THIS CHECK USED TO REQUIRE THE STRING "brew upgrade cloudflared" AND WENT RED WHEN THAT ADVICE
    // WAS CORRECTLY REMOVED. It was pinned to a WORDING where the property is "the reader is left with
    // somewhere to go". The advice moved into tunnelPreflight, which MEASURES which of the two causes it is
    // instead of naming the more common one -- and a gate that forbids its own fix is a gate that gets edited
    // to agree with whatever shipped.
    ok("!! ...and it still leaves the reader somewhere to go rather than just relabelling the error",
        !!c && /measures which|opposite fixes/i.test(c),
        "it now says the two causes have OPPOSITE FIXES and that the panel measures which -- a classifier that " +
        "ends in neither an action nor a measurement is a relabelled error");
    ok("!! ...and it no longer hands a macOS command to every platform", !/brew/i.test(c),
        "the platform was in the same object as the version the whole time; upgradeCommand() now derives it");
    ok("a healthy log is classified as nothing", classifyTunnelFailure(BANNER) === null,
        "a classifier that always has an opinion is noise");
    ok("an unrecognised failure returns null rather than guessing",
        classifyTunnelFailure("2026 INF something nobody has seen before") === null,
        "the close handler then falls back to the exit code and the log tail, which is EVIDENCE rather than a " +
        "confident wrong cause");
}

console.log("\n5. SABOTAGE");
{
    // The old pattern, restored exactly, must fail the check that caught it. Otherwise this file is asserting
    // that a bug it never saw is absent.
    const oldWay = (log) => { const m = String(log).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i); return m ? m[0] : null; };
    ok("!! SABOTAGE: the pre-v3815 pattern DOES harvest the error", oldWay(KEITHS) === "https://api.trycloudflare.com",
        "it returns " + oldWay(KEITHS) + " -- so the check above is watching a bug that was really there, on a " +
        "log pasted off the rig rather than invented here");
    ok("...and the old pattern also passes the happy path, which is why nobody caught it for so long",
        oldWay(BANNER) === REAL,
        "*** IT WAS RIGHT EVERY TIME A TUNNEL WORKED. A pattern that is only wrong on the failure path is " +
        "invisible until the day you need it, and that day it removes the explanation as well. ***");
}

say("\nWHAT THIS DOES NOT DO: it does not make the tunnel work. Keith's cloudflared was refused BY CLOUDFLARE " +
    "at the TLS layer and nothing in this tree can change that -- the fix here is that the panel now SAYS so " +
    "instead of showing an idle-looking 'no tunnel running'. *** THE REMAINING QUESTION IS HIS, AND IT IS " +
    "WHETHER `brew upgrade cloudflared` CLEARS IT: an out-of-date binary whose handshake the edge no longer " +
    "accepts is the most common cause of this exact alert, and the alternative -- trycloudflare having a bad " +
    "hour -- is indistinguishable from here and fixes itself. ***");

console.log("\ntunnelUrlScan-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
