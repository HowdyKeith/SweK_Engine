// ai-bridge/tunnelVerdict.mjs -- v3819
//
// *** THE v3815 MESSAGE NAMED A CAUSE IT HAD NOT MEASURED, AND KEITH'S SECOND REPORT IS WHAT SHOWED IT. ***
//
// The panel now says the right kind of thing -- "Cloudflare refused the quick-tunnel request at the TLS
// layer... THIS IS CLOUDFLARE'S SIDE OR THE BINARY'S, NOT YOUR SERVER" -- and that was the fix that mattered,
// because before it the same failure read as "no tunnel running". But then it GUESSED:
//
//     "Most often an out-of-date cloudflared whose handshake the edge no longer accepts:
//      update it (macOS: brew upgrade cloudflared) and retry."
//
// Two things wrong with that sentence, and neither is the physics of TLS:
//
//   1. *** IT ASSERTS THE MOST LIKELY CAUSE WITHOUT CHECKING THE ONE THING THE BRIDGE ALREADY KNOWS. ***
//      hostingBridge's detect() has returned `cloudflared.version` and `process.platform` since v1911. The
//      message could have said WHICH version and did not. "Most often X" is a statistic about other people's
//      machines offered to somebody standing in front of theirs.
//
//   2. *** IT HARD-CODES A macOS COMMAND. *** `brew upgrade cloudflared` on Windows is not bad advice, it is
//      an instruction that cannot be typed. The platform was in the same object as the version.
//
// AND THERE IS A DECISIVE TEST THAT NOBODY WAS RUNNING. `remote error: tls: internal error` is an alert from
// the far end during a handshake with api.trycloudflare.com. Node has its own TLS stack -- a completely
// different client, different cipher list, different version policy. So:
//
//     node handshakes with that host and cloudflared cannot  ->  IT IS THE BINARY
//     node cannot either                                     ->  IT IS THE PATH, not cloudflared
//
// That is one socket and it separates the two hypotheses the old message could only list. And when the path
// is the problem it usually SIGNS ITSELF: a TLS-inspecting proxy or antivirus must present its own
// certificate, so the issuer comes back as something that is not Cloudflare. THE MIDDLEBOX IS NAMED BY ITS
// OWN CERTIFICATE, which is a great deal better than telling somebody to go and look for one.
//
// This file holds only the REASONING, so it can be graded without a socket or a cloudflared. The socket lives
// in hostingBridge.

/** Upgrade instructions that can actually be typed on the machine in question. */
export function upgradeCommand(platform) {
    if (platform === "win32") return "winget upgrade --id Cloudflare.cloudflared";
    if (platform === "darwin") return "brew upgrade cloudflared";
    if (platform === "linux") return "re-run your package manager's install, or fetch the latest binary from github.com/cloudflare/cloudflared/releases";
    return "fetch the latest binary from github.com/cloudflare/cloudflared/releases";
}

/** Compare dotted versions. Returns -1, 0, 1. Missing pieces count as 0, so "2025.8" < "2025.8.1". */
export function compareVersions(a, b) {
    const pa = String(a || "").split(".").map((n) => parseInt(n, 10) || 0);
    const pb = String(b || "").split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] || 0, y = pb[i] || 0;
        if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
}

// cloudflared versions are CALENDAR versions, YYYY.M.P. There is no "known bad" list here on purpose: one
// would be a guess about somebody else's release history that rots the moment it is written, and the
// handshake test below answers the question directly anyway. What the age is used for is TONE -- an old
// binary makes the upgrade the FIRST thing to try rather than the only thing offered.
export const STALE_AFTER_MONTHS = 12;

/** Rough age in months from a calendar version like "2024.6.1". null when it does not look like one. */
export function versionAgeMonths(version, now = new Date()) {
    const m = String(version || "").match(/^(\d{4})\.(\d{1,2})/);
    if (!m) return null;
    const y = +m[1], mo = +m[2];
    if (y < 2018 || y > 2100 || mo < 1 || mo > 12) return null;
    return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - mo);
}

/**
 * Turn what was measured into what to do.
 *
 * @param {object} f
 * @param {string} f.platform            process.platform on the rig
 * @param {object} f.cloudflared         { installed, version } from detect()
 * @param {object} f.tls                 { ok, error, code, issuer, protocol } from the handshake probe
 * @param {string} f.host                the host that was probed
 * @returns {{verdict:string, headline:string, detail:string, actions:string[]}}
 */
export function tunnelVerdict({ platform, cloudflared = {}, tls = {}, host = "api.trycloudflare.com" } = {}) {
    const cmd = upgradeCommand(platform);
    const age = versionAgeMonths(cloudflared.version);
    const vs = cloudflared.version ? "cloudflared " + cloudflared.version : "cloudflared (version unreadable)";

    if (!cloudflared.installed) {
        return {
            verdict: "not-installed",
            headline: "cloudflared is not on this machine's PATH.",
            detail: "Nothing was refused: there was nothing to refuse it.",
            actions: ["Install it: " + cmd],
        };
    }

    // *** WHO SIGNED THE CERTIFICATE IS CHECKED BEFORE WHETHER THE HANDSHAKE SUCCEEDED, AND THE FIRST
    // VERSION OF THIS FILE HAD IT THE OTHER WAY ROUND. ***
    // I put the interception check inside the "node failed too" branch, reasoning that a blocked path fails.
    // Then the probe was run in a sandbox that turned out to be behind an inspecting proxy, and it came back
    // ok = true with issuer "Anthropic" for EVERY host including api.trycloudflare.com. That is the shape
    // interception actually has: Node accepts the proxy's certificate and shakes hands happily, while
    // cloudflared -- which validates against what it expects Cloudflare to present -- refuses. SO THE
    // INTERCEPTED CASE LOOKS LIKE SUCCESS FROM NODE'S SIDE, and a branch that only looked at failures would
    // have called it "the binary" and sent Keith to upgrade something that was never the problem.
    const known = /cloudflare|google trust|digicert|baltimore|lets encrypt|let's encrypt|isrg|sectigo|amazon/i;
    const foreign = !!tls.issuer && !known.test(tls.issuer);
    if (foreign) {
        return {
            verdict: "intercepted",
            headline: "TLS to " + host + " from this machine is being INTERCEPTED by “" + tls.issuer + "”.",
            detail: "The certificate presented for " + host + " was issued by “" + tls.issuer + "”, which is " +
                "not a CA Cloudflare is known to use. Something between this machine and the internet is " +
                "terminating TLS and re-signing it — a corporate proxy, or an antivirus with HTTPS scanning " +
                "switched on. Node accepted it because it was asked not to verify; CLOUDFLARED VALIDATES AND " +
                "REFUSES, and the edge alert you saw is the visible end of that. *** UPGRADING cloudflared " +
                "WILL NOT FIX THIS. *** (If “" + tls.issuer + "” is a public CA you recognise, this may be " +
                "a Cloudflare issuer rotation rather than a proxy — the name is printed so you can judge, " +
                "rather than the check quietly deciding for you.)",
            actions: ["Turn off HTTPS/SSL scanning in the antivirus, or exempt " + host,
                      "On a managed network, the proxy's root CA is the thing cloudflared is refusing",
                      "A pre-created NAMED tunnel authenticates differently and may still work"],
        };
    }

    // Node's own TLS stack could not reach the host either. Node is not cloudflared -- different
    // implementation, different ciphers -- so upgrading cloudflared cannot fix a handshake that a second,
    // unrelated client also cannot complete.
    if (tls.ok === false) {
        return {
            verdict: "path-blocked",
            headline: "This machine cannot complete a TLS handshake with " + host + " at all.",
            detail: "Node's own TLS stack was tried as a second opinion and failed too" +
                (tls.error ? " (" + tls.error + ")" : "") + ". Node is not cloudflared — different " +
                "implementation, different ciphers — so this is the NETWORK PATH rather than the binary. " +
                "*** UPGRADING cloudflared WILL NOT FIX THIS. ***",
            actions: ["Check whether anything else here can reach https://" + host,
                      "If nothing can, it is DNS, a firewall or an outage rather than this engine",
                      "A pre-created NAMED tunnel does not use this endpoint at all"],
        };
    }

    // Node got through, on a certificate signed by a CA Cloudflare is known to use, and cloudflared did not.
    // TWO DIFFERENT CLIENTS, ONE HOST, ONE ANSWER EACH -- so the difference is the client.
    if (tls.ok === true) {
        return {
            verdict: age !== null && age >= STALE_AFTER_MONTHS ? "binary-stale" : "binary",
            headline: "The network path is fine \u2014 it is " + vs + " that the edge refused.",
            detail: "Node's TLS stack completed a handshake with " + host +
                (tls.protocol ? " over " + tls.protocol : "") +
                (tls.issuer ? ", on a certificate from " + tls.issuer : "") +
                ", moments after cloudflared was refused by the same host. TWO CLIENTS, ONE HOST, ONE ANSWER " +
                "EACH \u2014 so the difference is the client." +
                (age !== null
                    ? " That binary is about " + age + " months old" +
                      (age >= STALE_AFTER_MONTHS ? ", which is old enough to be the whole story." : ".")
                    : " Its version string could not be read, which is itself worth a look."),
            actions: ["Upgrade it: " + cmd,
                      "Then retry the tunnel \u2014 no restart of this engine is needed",
                      "If it still fails after upgrading, a pre-created NAMED tunnel does not use this endpoint"],
        };
    }

    // The probe did not run or did not report. Say so rather than fall back to the old guess.
    return {
        verdict: "unknown",
        headline: "cloudflared was refused, and the handshake test did not run.",
        detail: "Without it there is no way from here to tell a stale binary from an intercepted network path, " +
            "AND THOSE HAVE OPPOSITE FIXES. " + vs + " on " + (platform || "this platform") + ".",
        actions: ["Try the upgrade first, it is cheap: " + cmd,
                  "If that changes nothing, suspect TLS interception rather than the binary"],
    };
}
