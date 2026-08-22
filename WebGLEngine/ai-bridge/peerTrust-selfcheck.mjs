// WebGLEngine/ai-bridge/peerTrust-selfcheck.mjs — v3284
//
// Run: node ai-bridge/peerTrust-selfcheck.mjs   (~0.1s — MEASURED; real ed25519, no mocks)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// The decision under test: LAN keeps trust-on-pair, external requires a signature verifying against the locally
// pinned key, and an unsigned external build is STAGED WITH ITS SOURCE NAMED rather than auto-applied.
//
// The signatures here are REAL -- a keypair is generated and manifests are genuinely signed with it -- because a
// gate that mocked the crypto would prove only that the branches exist. The attacks below are the ones that
// actually get tried: claim to be local, sign with the wrong key, sign a different version than you ship, and
// swap the bytes after signing.

import crypto from "node:crypto";
import { peerOrigin, decidePeerUpdate, peerUpdateLine, ORIGIN_LAN, ORIGIN_EXTERNAL,
         ACTION_APPLY, ACTION_STAGE, ACTION_REFUSE } from "./peerTrust.mjs";
import { sha256 } from "../tools/roundhouse/updatePolicy.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// a real keypair, and a second one to play the attacker
const mine = crypto.generateKeyPairSync("ed25519");
const theirs = crypto.generateKeyPairSync("ed25519");
const pinnedPem = mine.publicKey.export({ type: "spki", format: "pem" });
const policy = { tier: "verified", publicKeyPem: pinnedPem };

const bytes = Buffer.from("PK\u0003\u0004" + "x".repeat(4096));
const manifestFor = (version, buf) => ({ version, sha256: sha256(buf), size: buf.length });
const signOffer = (offer, key) => ({ ...offer,
    signature: crypto.sign(null, Buffer.from(JSON.stringify({ version: offer.version, sha256: offer.sha256, size: offer.size })), key).toString("base64") });

// ---- 1. CLASSIFICATION IS FROM THE URL, AND IT FAILS CLOSED ------------------------------------------------------
{
    // v3316 -- THE MAPPED FORMS ARE HERE BECAUSE THEY ARE WHAT A REAL LAN PRODUCES. A dual-stack Node server
    // reports a LAN machine's remoteAddress as ::ffff:192.168.11.50, the lighthouse records exactly that, and
    // new URL() normalises the bracketed form to hex (::ffff:c0a8:132). The first version handled only the
    // dotted spelling and classified wireless LAN peers as EXTERNAL, staging their updates instead of applying
    // them -- a security rule doing its job on machines it was never meant to cover.
    const lan = ["http://192.168.11.42:8080", "http://10.0.0.5", "http://172.16.3.9", "http://127.0.0.1:3000",
                 "http://localhost:8080", "http://swek-box.local", "http://[::1]:8080", "http://[fd12:3456::1]",
                 "http://169.254.10.10", "http://100.64.0.7",
                 "http://[::ffff:192.168.11.50]:8080", "http://[::ffff:c0a8:132]:8080", "http://[::ffff:10.0.0.7]",
                 "http://[fe80::1a2b:3c4d]:8080"];
    const ext = ["https://abc-def-ghi.trycloudflare.com", "http://203.0.113.9", "https://example.com",
                 "http://swek-box", "http://172.32.0.1", "http://192.169.1.1", "http://11.0.0.1", "not a url",
                 // a PUBLIC address in mapped form must still read external -- the fix must not turn ::ffff: into a skeleton key
                 "http://[::ffff:8.8.8.8]:8080"];
    const badLan = lan.filter((u) => peerOrigin(u).origin !== ORIGIN_LAN);
    const badExt = ext.filter((u) => peerOrigin(u).origin !== ORIGIN_EXTERNAL);
    ok("!! every provably-private address classifies LAN (RFC1918, loopback, link-local, CGNAT, ULA, .local)",
       badLan.length === 0, badLan.length ? "MISCLASSIFIED: " + badLan.join(", ") : lan.length + " addresses");
    ok("!! and everything else classifies EXTERNAL — including a BARE HOSTNAME and 172.32/192.169, which look private and are not",
       badExt.length === 0, badExt.length ? "MISCLASSIFIED: " + badExt.join(", ") : ext.length + " addresses, unparseable input included");
}

// ---- 2. THE PEER DOES NOT GET A VOTE ON ITS OWN ORIGIN -------------------------------------------------------------
{
    const hostile = { ...manifestFor(9999, bytes), origin: "lan", trusted: true, local: true, lan: true, skipVerification: true };
    const d = decidePeerUpdate({ peerUrl: "https://evil.trycloudflare.com", offer: hostile, bytes, policy });
    ok("!! an offer DECLARING itself local changes nothing — origin comes from the URL we dialled, never from the peer",
       d.origin === ORIGIN_EXTERNAL && d.action !== ACTION_APPLY,
       "claimed origin:lan trusted:true — decided " + d.action + " (" + d.origin + "): " + d.why);
}

// ---- 3. LAN: TRUST-ON-PAIR KEPT, BY DECISION ------------------------------------------------------------------------
{
    const d = decidePeerUpdate({ peerUrl: "http://192.168.11.50:8080", offer: manifestFor(3300, bytes), bytes, policy });
    ok("!! a LAN peer may still auto-apply with no signature (the ordinary two-machines-at-home workflow survives)",
       d.action === ACTION_APPLY && d.origin === ORIGIN_LAN, d.why);
}

// ---- 4. EXTERNAL + VALID SIGNATURE -> AUTHORISED ---------------------------------------------------------------------
{
    const signed = signOffer(manifestFor(3300, bytes), mine.privateKey);
    const d = decidePeerUpdate({ peerUrl: "https://peer.trycloudflare.com", offer: signed, bytes, policy });
    ok("!! an external peer with a signature verifying against the PINNED key is authorised",
       d.action === ACTION_APPLY && d.signature === "valid", d.why);
}

// ---- 5. EXTERNAL + UNSIGNED -> STAGED, SOURCE NAMED, NEVER APPLIED ----------------------------------------------------
{
    const d = decidePeerUpdate({ peerUrl: "https://peer.trycloudflare.com", offer: manifestFor(3300, bytes), bytes, policy });
    ok("!! an UNSIGNED external build is STAGED, never auto-applied",
       d.action === ACTION_STAGE && d.signature === "unsigned", d.why);
    const line = peerUpdateLine(d);
    ok("!! ...and the operator line NAMES THE SOURCE ('a new version is available' is an anonymous instruction to run someone's code)",
       line.includes("peer.trycloudflare.com") && /STAGED, NOT APPLIED/.test(line), line);
}

// ---- 6. THE ATTACKS ---------------------------------------------------------------------------------------------------
{
    const wrongKey = signOffer(manifestFor(3300, bytes), theirs.privateKey);
    const d1 = decidePeerUpdate({ peerUrl: "https://peer.trycloudflare.com", offer: wrongKey, bytes, policy });
    ok("!! signed with the WRONG key: staged, not applied", d1.action === ACTION_STAGE && d1.signature === "INVALID", d1.why);

    // sign one manifest, ship different bytes -- the signature covers the manifest, the checksum binds it to bytes
    const swapped = signOffer(manifestFor(3300, bytes), mine.privateKey);
    const otherBytes = Buffer.from("PK\u0003\u0004" + "y".repeat(4096));
    const d2 = decidePeerUpdate({ peerUrl: "https://peer.trycloudflare.com", offer: swapped, bytes: otherBytes, policy });
    ok("!! validly signed manifest, DIFFERENT BYTES: refused outright (not staged — those are not the offered build)",
       d2.action === ACTION_REFUSE, d2.why);

    // signature valid over a manifest whose version was altered after signing
    const tampered = { ...signOffer(manifestFor(3300, bytes), mine.privateKey), version: 9999 };
    const d3 = decidePeerUpdate({ peerUrl: "https://peer.trycloudflare.com", offer: tampered, bytes, policy });
    ok("!! version altered after signing: the manifest no longer verifies, so it is staged rather than applied",
       d3.action === ACTION_STAGE && d3.signature === "INVALID", d3.why);

    // no pinned key locally -> an external build can never be authorised, only staged
    const d4 = decidePeerUpdate({ peerUrl: "https://peer.trycloudflare.com",
        offer: signOffer(manifestFor(3300, bytes), mine.privateKey), bytes, policy: { tier: "verified" } });
    ok("!! with NO pinned key, even a genuinely signed external build only stages (no key means nothing to trust)",
       d4.action === ACTION_STAGE, d4.why);
}

// ---- 7. THE LOCAL POLICY TIER CANNOT WEAKEN THE EXTERNAL PATH ----------------------------------------------------------
{
    // a machine set to the permissive "download" tier must still not auto-apply an unsigned EXTERNAL build
    const d = decidePeerUpdate({ peerUrl: "https://peer.trycloudflare.com", offer: manifestFor(3300, bytes), bytes,
                                 policy: { tier: "download", autoDownload: true } });
    ok("!! a permissive local tier does NOT buy an external peer auto-apply (verification is forced for external)",
       d.action === ACTION_STAGE,
       "policy tier 'download' — decided " + d.action + ": " + d.why);
}

// ---- 8. PRE-DOWNLOAD DECISION -------------------------------------------------------------------------------------------
{
    const unsigned = decidePeerUpdate({ peerUrl: "https://peer.trycloudflare.com", offer: manifestFor(3300, bytes), policy });
    const lan = decidePeerUpdate({ peerUrl: "http://10.0.0.4", offer: manifestFor(3300, bytes), policy });
    ok("before downloading, an unsigned external offer is already marked stage-only, and a LAN one is not",
       unsigned.action === ACTION_STAGE && lan.action === ACTION_APPLY);
    const nothing = decidePeerUpdate({ peerUrl: "http://10.0.0.4", offer: null, policy });
    ok("an empty offer is refused rather than defaulting to anything", nothing.action === ACTION_REFUSE);
}

// ---- 9. THE DECISION IS WIRED, NOT DECORATIVE -----------------------------------------------------------------------
// A trust module nothing consults is worse than none: it reads as a fix in the changelog and changes nothing on
// the machine. These check the SHIPPING call site rather than this module's own behaviour.
{
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("./sysadminBridge.js", import.meta.url), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! the desktop peer-pull path IMPORTS peerTrust (not a second policy engine)",
       /import\(\s*["']\.\/peerTrust\.mjs["']\s*\)/.test(code) && /decidePeerUpdate/.test(code));
    ok("!! auto-apply after a peer pull is GATED on the trust verdict",
       /autoApply[\s\S]{0,120}?r\.applicable/.test(code),
       "autoApply is consent to install without the browser open, never consent to install what any peer claims is newer");
    ok("!! a refused pull DELETES the zip rather than leaving it as the newest thing in Downloads",
       /action === "refuse"[\s\S]{0,200}?unlinkSync\(dest\)/.test(code),
       "scanDownloads offers the newest zip to the apply flow, so leaving a refused build on disk would re-offer it");
    ok("!! the trust check FAILS CLOSED if the module cannot load",
       /catch[\s\S]{0,300}?stage-only[\s\S]{0,200}?failing closed/.test(code),
       "a trust module that throws must not mean 'trusted'");
}

console.log(fails ? ("[peerTrust-selfcheck] FAILED " + fails) : "[peerTrust-selfcheck] all passed");
process.exit(fails ? 1 : 0);
