// ai-bridge/tunnelVerdict-selfcheck.mjs -- v3819
//
// Run: node ai-bridge/tunnelVerdict-selfcheck.mjs
//
// *** v3815 MADE THE FAILURE SPEAK. v3819 MAKES IT MEASURE. ***
//
// Keith came back with the panel working exactly as built -- "could not start -- Cloudflare refused the
// quick-tunnel request at the TLS layer... THIS IS CLOUDFLARE'S SIDE OR THE BINARY'S, NOT YOUR SERVER" -- and
// the tunnel still down. The message was right about where the fault was NOT. It was a guess about where it
// WAS:
//
//     "Most often an out-of-date cloudflared... update it (macOS: brew upgrade cloudflared) and retry."
//
//   1. "MOST OFTEN X" IS A STATISTIC ABOUT OTHER PEOPLE'S MACHINES offered to somebody standing in front of
//      theirs -- and hostingBridge's detect() has returned cloudflared.version and process.platform since
//      v1911. The message could have said WHICH version and did not.
//   2. IT HARD-CODED A macOS COMMAND. `brew upgrade cloudflared` on Windows is not bad advice, it is an
//      instruction that cannot be typed. The platform was in the same object as the version.
//
// AND THERE WAS A DECISIVE TEST NOBODY WAS RUNNING. Node has its own TLS stack -- different implementation,
// different ciphers, different version policy -- so a handshake from Node to the same host separates the two
// hypotheses the old message could only list. They have OPPOSITE FIXES, which is why guessing was expensive:
// upgrade the binary, or stop something intercepting TLS.
//
// *** THE BRANCH ORDER WAS WRONG FIRST, AND A REAL PROXY IS WHAT SHOWED IT. *** The interception check was
// written inside the "node failed too" branch, on the reasoning that a blocked path fails. Then tlsProbe was
// run for real and came back ok = true with issuer "Anthropic" for every host including
// api.trycloudflare.com -- the sandbox this was written in sits behind an inspecting proxy. THAT IS THE SHAPE
// INTERCEPTION ACTUALLY HAS: Node accepts the substituted certificate and shakes hands happily while
// cloudflared validates and refuses. A branch that only examined failures would have called it "the binary"
// and sent Keith to upgrade something that was never the problem.

import { tunnelVerdict, upgradeCommand, compareVersions, versionAgeMonths, STALE_AFTER_MONTHS } from "./tunnelVerdict.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const CF = "api.trycloudflare.com";
const clean = { ok: true, protocol: "TLSv1.3", issuer: "Google Trust Services" };

console.log("1. THE TWO HYPOTHESES ARE SEPARATED, AND THEY HAVE OPPOSITE FIXES");
{
    const binary = tunnelVerdict({ platform: "win32", cloudflared: { installed: true, version: "2023.5.0" }, tls: clean, host: CF });
    ok("!! *** node HANDSHAKES AND cloudflared DOES NOT -> THE BINARY ***", binary.verdict === "binary-stale",
        "two different clients, one host, one answer each -- so the difference is the client");
    ok("...and it names the version rather than a statistic", /2023\.5\.0/.test(binary.headline),
        "\"most often an out-of-date cloudflared\" was a claim about other people's machines");
    ok("...and it says how old that is", /months old/.test(binary.detail));

    const proxied = tunnelVerdict({ platform: "win32", cloudflared: { installed: true, version: "2026.7.0" },
        tls: { ok: true, protocol: "TLSv1.3", issuer: "Kaspersky Anti-Virus Personal Root" }, host: CF });
    ok("!! *** A FOREIGN ISSUER ON A SUCCESSFUL HANDSHAKE -> INTERCEPTION ***", proxied.verdict === "intercepted",
        "the middlebox is NAMED BY ITS OWN CERTIFICATE -- it has to present one -- rather than by asking " +
        "somebody to go and look for a proxy");
    ok("!! ...and it says plainly that upgrading will NOT help", /WILL NOT FIX THIS/.test(proxied.detail),
        "*** THIS IS THE WHOLE POINT OF MEASURING. *** The v3815 message's advice was to upgrade, and on an " +
        "intercepted machine that is an afternoon spent on the wrong thing");
    ok("!! ...and the issuer is printed so the reader can overrule it",
        /Kaspersky Anti-Virus Personal Root/.test(proxied.headline) && /may be a Cloudflare issuer rotation/.test(proxied.detail),
        "if Cloudflare rotates to a CA this check has not heard of, the name is on screen and the hedge is " +
        "stated -- A CLASSIFIER THAT CANNOT BE OVERRULED IS A CLASSIFIER THAT HAS TO BE RIGHT FOREVER");

    ok("the two verdicts really do differ", binary.verdict !== proxied.verdict &&
        binary.actions[0] !== proxied.actions[0],
        "\"" + binary.actions[0] + "\" against \"" + proxied.actions[0] + "\"");
}

console.log("\n2. THE ADVICE CAN BE TYPED ON THE MACHINE IT IS GIVEN TO");
{
    ok("!! Windows gets winget, not brew", /winget/.test(upgradeCommand("win32")) && !/brew/.test(upgradeCommand("win32")),
        upgradeCommand("win32") + " -- v3815 said \"brew upgrade cloudflared\" TO EVERY PLATFORM, which on " +
        "Windows is not bad advice but an instruction that cannot be typed");
    ok("macOS gets brew", /brew/.test(upgradeCommand("darwin")));
    ok("Linux gets something honest rather than a guessed package manager",
        /package manager|releases/.test(upgradeCommand("linux")));
    ok("an unknown platform still gets a real route", /releases/.test(upgradeCommand("plan9")),
        "the download page works everywhere, so there is no branch that ends in silence");
    for (const p of ["win32", "darwin", "linux"]) {
        const v = tunnelVerdict({ platform: p, cloudflared: { installed: true, version: "2023.1.0" }, tls: clean, host: CF });
        if (!v.actions.some((a) => a.includes(upgradeCommand(p)))) fails++;
    }
    ok("!! and every verdict's action list carries ITS OWN platform's command", true,
        "checked for win32, darwin and linux -- the command is derived from the measured platform rather than " +
        "written into the sentence");
}

console.log("\n3. THE CASES THAT ARE NOT EITHER HYPOTHESIS");
{
    const none = tunnelVerdict({ platform: "win32", cloudflared: { installed: false }, tls: clean, host: CF });
    ok("!! not installed beats everything else", none.verdict === "not-installed",
        "\"Nothing was refused: there was nothing to refuse it.\" A version-and-handshake diagnosis for a " +
        "binary that is not there would be theatre");
    const blocked = tunnelVerdict({ platform: "linux", cloudflared: { installed: true, version: "2026.7.0" },
        tls: { ok: false, error: "ECONNRESET" }, host: CF });
    ok("!! node cannot reach it either -> the path, and upgrading will not help", blocked.verdict === "path-blocked" &&
        /WILL NOT FIX THIS/.test(blocked.detail), blocked.headline.slice(0, 70));
    const noprobe = tunnelVerdict({ platform: "win32", cloudflared: { installed: true, version: "2026.7.0" }, tls: {}, host: CF });
    ok("!! *** IF THE PROBE DID NOT RUN, IT SAYS SO RATHER THAN FALLING BACK TO THE OLD GUESS ***",
        noprobe.verdict === "unknown" && /did not run/.test(noprobe.headline) && /OPPOSITE FIXES/.test(noprobe.detail),
        "the tempting fallback is \"probably the binary\", which is exactly the sentence this round exists to " +
        "delete. Saying the measurement is missing is worth more than repeating the guess");
}

console.log("\n4. THE VERSION ARITHMETIC");
{
    ok("compareVersions orders calendar versions",
        compareVersions("2024.6.1", "2025.1.0") === -1 && compareVersions("2025.1.0", "2024.6.1") === 1 &&
        compareVersions("2025.1", "2025.1.0") === 0,
        "missing pieces count as zero, so 2025.1 and 2025.1.0 are the same release");
    const now = new Date(Date.UTC(2026, 7, 16));
    ok("versionAgeMonths reads a calendar version", versionAgeMonths("2025.8.1", now) === 12);
    ok("!! and returns null for anything that is not one", versionAgeMonths("wibble", now) === null &&
        versionAgeMonths("1.2.3", now) === null,
        "cloudflared uses YYYY.M.P; a semver-looking string is NOT one and guessing an age from it would put a " +
        "fabricated number in front of somebody");
    ok("the stale threshold is a named constant", STALE_AFTER_MONTHS === 12,
        STALE_AFTER_MONTHS + " months -- used for TONE, not for a verdict: an old binary makes the upgrade the " +
        "FIRST thing to try, and the handshake test is what actually decides");
}

console.log("\n5. SABOTAGE");
{
    const sandbox = tunnelVerdict({ platform: "linux", cloudflared: { installed: true, version: "2026.7.0" },
        tls: { ok: true, protocol: "TLSv1.3", issuer: "Anthropic" }, host: CF });
    ok("!! SABOTAGE: the REAL measurement from this sandbox's proxy IS caught as interception",
        sandbox.verdict === "intercepted",
        "issuer \"Anthropic\" on api.trycloudflare.com with ok = true -- not a mock, that is what tlsProbe " +
        "actually returned here, and it is the case my first branch order got wrong");

    // The mistake, restored: interception only checked when the handshake FAILED.
    const oldWay = (tls) => (tls.ok === false && tls.issuer && !/cloudflare/i.test(tls.issuer)) ? "intercepted" : "binary";
    ok("!! SABOTAGE: the pre-v3819 branch order calls that SAME input \"binary\"",
        oldWay({ ok: true, issuer: "Anthropic" }) === "binary",
        "*** AND IT WOULD HAVE TOLD KEITH TO UPGRADE cloudflared ON A MACHINE WHERE THAT CANNOT POSSIBLY " +
        "HELP. *** The branch was wrong in the direction that produces confident, actionable, useless advice");
    ok("...and the shipped order gets it right", sandbox.verdict !== oldWay({ ok: true, issuer: "Anthropic" }));
}

say("\nWHAT THIS DOES NOT DO: it cannot reach Cloudflare. The sandbox this was written in is itself behind an " +
    "inspecting proxy, so tlsProbe was exercised against reachable hosts and against a deliberately " +
    "unresolvable one, and the ISSUER path was verified on a real interceptor -- but NOT against a clean route " +
    "to api.trycloudflare.com, which nothing here has. *** SO THE VERDICT THIS PRODUCES ON KEITH'S RIG IS THE " +
    "MEASUREMENT THAT MATTERS AND I HAVE NOT SEEN IT. If it says INTERCEPTED, the antivirus or proxy is the " +
    "answer and no amount of upgrading will move it. If it says the network path is fine and names an old " +
    "version, the upgrade is the answer. If it says path-blocked, neither is. ***");

console.log("\ntunnelVerdict-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
