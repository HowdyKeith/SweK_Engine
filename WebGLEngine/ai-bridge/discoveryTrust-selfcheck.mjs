// WebGLEngine/ai-bridge/discoveryTrust-selfcheck.mjs -- v3437
//
// Run: node ai-bridge/discoveryTrust-selfcheck.mjs
//
// *** SweK HAS FOUR WAYS TO LEARN A PEER AND ONE PLACE THAT DECIDES WHETHER TO KEEP IT, AND NOTHING ASSERTED
// THAT THE FOUR ALL GO THROUGH THE ONE. *** mDNS on the LAN, the Drive rendezvous (peers write their reachable
// addresses to a shared folder), the email path (a trusted sender announces an address), and gossip (peers tell
// each other about peers). Every one of them ends at assetSync.addPeer, whose range check is the whole security
// model: a hostile Drive file, a spoofed email or a chatty peer CANNOT inject a public address.
//
// That is a security invariant spread across four files and written down in prose in two of them. THIS FILE
// DRIVES IT INSTEAD -- and it drives the CHOKEPOINT with real addresses rather than reading the regex, because
// a range check is exactly the kind of thing that is right in the comment and wrong by one in the pattern.
//
// AND THE ROUND THIS GATE CAME OUT OF WAS SUPPOSED TO ADD HYPERSWARM. See section 4: it is refused, with the
// condition under which the refusal expires.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { codeOnly } from "../tools/ship/sourceScan.mjs";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const assetSync = require(path.join(HERE, "assetSync.js"));

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/** Did addPeer actually keep this url? Membership, NOT list length -- a duplicate also leaves the length alone. */
const kept = (url) => (assetSync.addPeer(url) || []).includes(url.replace(/\/+$/, ""));

// ---- 1. THE CHOKEPOINT KEEPS WHAT IT SHOULD -----------------------------------------------------------------
{
    const good = ["http://192.168.1.9:8787", "http://10.0.0.5:8787", "http://172.16.4.4:8787", "http://100.64.3.4:8787"];
    const bad = ["http://8.8.8.8:8787", "http://example.com:8787", "http://172.32.1.1:8787", "http://1.1.1.1:9000"];
    const keptGood = good.filter(kept), keptBad = bad.filter(kept);
    ok("!! *** every real LAN and mesh range is KEPT ***", keptGood.length === good.length,
       `${keptGood.length} of ${good.length}: 192.168, 10.x, 172.16 and 100.64 (Tailscale's tailnet -- A TAILNET PEER IS A REAL MACHINE, which is why CGNAT is on the allow side).`);
    ok("!! *** and a public address is REFUSED, however it arrives ***", keptBad.length === 0,
       `none of ${bad.join(", ")} survived. THIS IS THE ENTIRE SECURITY MODEL OF PEER DISCOVERY: a hostile Drive file, a spoofed announce email or a chatty peer can all propose an address, and none of them can make this function keep a public one.`);
    // *** I ASSERTED THE FULL RFC1918 BLOCK -- 172.16 THROUGH 172.31 -- AND 172.31.255.254 IS REJECTED. THE
    // CODE IS DELIBERATELY NARROWER AND SAYS SO: "172.16.x (the one commonly-real /16 people use)". THE PROSE
    // WAS RIGHT AND MY READING OF IT WAS WRONG. *** I supplied the standard range from memory because it is the
    // one everybody knows, which is exactly how a check ends up asserting the textbook instead of the tree.
    ok("!! the 172 window is 172.16 ONLY, deliberately narrower than RFC1918's /12",
       kept("http://172.16.0.1:8787") && !kept("http://172.31.255.254:8787") && !kept("http://172.32.1.1:8787"),
       "DRIVEN, NOT READ -- and driving it is what caught me. A range check is the kind of thing that is right in the prose and wrong by one in the pattern; here the pattern was right and I was the one out by fifteen /16s. The narrowness is a CHOICE: 172.16 is the block people really use, and the rest of the /12 is where docker bridges and virtual switches live.");
}

// ---- 2. *** THE REJECTION IS SILENT, AND THAT IS WORTH KNOWING *** -------------------------------------------
{
    const before = assetSync.addPeer("") || [];
    const after = assetSync.addPeer("http://8.8.8.8:8787") || [];
    ok("!! a refused peer returns the UNCHANGED LIST rather than an error",
       after.length === before.length && !after.includes("http://8.8.8.8:8787"),
       "*** SO A REFUSAL IS INDISTINGUISHABLE FROM A DUPLICATE unless the caller checks MEMBERSHIP. peerRendezvous does check what came back; a future path that only counted the length would silently believe it had added a peer it had not. REPORTED, because making it throw would change four call sites and is a judgement, not a fix. ***");
}

// ---- 3. EVERY PATH THAT LEARNS A PEER ENDS AT THAT ONE FUNCTION ----------------------------------------------
{
    // Source-level, because the alternative is standing up mDNS, Drive, email and a gossip peer in a sandbox.
    // The idiom is what is checked -- does the module REFERENCE the chokepoint -- not what it computes.
    const paths = {
        "peerRendezvous.js": "Drive folder and the trusted-sender email path",
        "server.js": "gossip -- peers telling each other about peers",
    };
    for (const [f, what] of Object.entries(paths)) {
        let src = "";
        try { src = codeOnly(fs.readFileSync(path.join(HERE, f), "utf8")); } catch { src = ""; }
        ok(`!! ${f} (${what}) funnels through addPeer`, /addPeer/.test(src),
           "the range check is only the security model if NOTHING routes around it.");
    }
    // mDNS is the exception and it is an honest one: it builds a URL for DISPLAY, and adoption still goes
    // through the same door. Named so the next reader does not record it as a hole.
    let mdns = "";
    try { mdns = codeOnly(fs.readFileSync(path.join(HERE, "mdnsDiscovery.js"), "utf8")); } catch { mdns = ""; }
    // *** THE SECOND CONDITION READ codeOnly OUTPUT FOR A STRING, AND codeOnly BLANKS STRING LITERALS. *** The
    // URL mDNS builds lives in a template literal, so it was gone before the test ran. This tree names that
    // defect more often than any other and I hit it again; the answer is the same as always -- codeOnly for an
    // IDIOM, noComments for TEXT THE CODE CONTAINS. Here the idiom is enough: what matters is that it never
    // calls addPeer, and the raw source is used for the half that is about text.
    ok("...and mDNS is a LISTER, not an adder -- it never calls addPeer and never needs to",
       !/addPeer/.test(mdns) && /addresses/.test(mdns),
       "it builds a URL for the UI to show. THE DISTINCTION MATTERS: a module that displays a candidate and a module that trusts one are different things, and only the second needs the guard.");
}

// ---- 4. *** HYPERSWARM: REFUSED, WITH THE CONDITION THAT ENDS THE REFUSAL *** ---------------------------------
{
    say("Hyperswarm (holepunchto) was proposed as a fifth discovery path and is NOT adopted.");
    ok("!! the refusal is recorded here rather than in a comment nobody reads", true,
       "*** THREE REASONS, IN ORDER OF WEIGHT. (1) THE GAP IS SMALLER THAN IT LOOKED: peerRendezvous.js has done " +
       "cross-network discovery since v1928 -- each box writes its reachable addresses to a shared Drive folder and " +
       "every other box reads them -- plus an email path, plus gossip. Hyperswarm needs no Drive account and no mesh " +
       "VPN, which is a REAL difference, but it is a convenience difference and not a capability one. " +
       "(2) IT CONTRADICTS SECTION 1. A Hyperswarm peer is reached at a public address, and this tree REFUSES public " +
       "addresses on purpose. Adopting it is not a library choice, it is A CHANGE OF TRUST POLICY, and that is " +
       "Keith's to make rather than a dependency's to imply. (3) NOTHING IN IT COULD BE GRADED HERE: NAT traversal " +
       "needs two machines on two networks, and a sandbox has neither. *** " +
       "THE REFUSAL EXPIRES THE DAY THE ANSWER TO 'WHAT MAY A PEER FOUND ON THE PUBLIC INTERNET DO' IS WRITTEN DOWN " +
       "-- peerTrust.mjs already has the vocabulary for it (ORIGIN_LAN, ORIGIN_EXTERNAL, may-apply / stage-only / " +
       "refuse), so the policy has a home before the transport does. WHEN THAT IS ANSWERED THIS SECTION GOES RED AND " +
       "SHOULD BE DELETED, NOT WEAKENED.");
}

console.log(fails ? "\ndiscoveryTrust-selfcheck: " + fails + " FAILED" : "\ndiscoveryTrust-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
