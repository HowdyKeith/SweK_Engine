// tools/roundhouse/updatePolicy-selfcheck.mjs
//
// v2958 -- WHO IS AT THE OTHER END DECIDES WHAT AN UPDATE MAY DO.
//
//   notify    tell only                      -- the default for anyone who has not said otherwise
//   download  stage it, never run it         -- the cousin: the download is the slow part, the decision is his
//   verified  stage + ed25519 signature      -- the machine whose owner should not have to make this call
//
// THE PROPERTY EVERYTHING ELSE RESTS ON: the tier is set LOCALLY on the peer, and the hub can never raise it.
// If a hub could say "you are verified tier now, here is a build", then compromising the hub -- or impersonating
// one of a dozen rotating tunnel URLs -- would install code everywhere. A hub may offer. It may never promote.

import { decide, verifyBuild, readPolicy, sha256, DEFAULT_TIER } from "./updatePolicy.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const PEM = publicKey.export({ type: "spki", format: "pem" });
const bytes = Buffer.from("PRETEND ZIP CONTENT");
const man = { version: "v2958", sha256: sha256(bytes), size: bytes.length };
const signed = { ...man, signature: crypto.sign(null, Buffer.from(JSON.stringify(man)), privateKey).toString("base64") };

// ---- 1. THE HUB CANNOT RAISE A PEER'S TIER ------------------------------------------------------------------------------
{
    // an offer that TRIES to set the tier must be ignored -- the policy comes from the peer's own config
    const hostileOffer = { ...signed, tier: "verified", policy: { tier: "verified", publicKeyPem: PEM } };
    const d = decide({ tier: "download" }, hostileOffer, { current: "v2957" });
    ok("!! an offer claiming a higher tier does NOT raise the peer's tier",
        d.action === "download",
        "the peer's local policy says download, and an offer carrying tier:'verified' and even a key changes " +
        "nothing -- decide() reads the tier from the POLICY argument only. A hub that could promote a peer would " +
        "turn one compromised tunnel into remote code execution on every machine that ever checked in");

    ok("an unknown or missing tier falls back to the SAFE end, not the permissive one",
        readPolicy({ tier: "superuser" }).tier === DEFAULT_TIER && readPolicy(null).tier === DEFAULT_TIER,
        "garbage in the config yields 'notify'. A parser that defaulted to the permissive value on bad input " +
        "would make a typo into an authorisation");
}

// ---- 2. THE COUSIN CASE: STAGED, NEVER APPLIED, AND SWITCHABLE OFF ---------------------------------------------------------
{
    const d = decide({ tier: "download" }, signed, { current: "v2957" });
    ok("!! download tier stages the build and says plainly it will not be run",
        d.action === "download" && /NOT be unzipped or run/.test(d.why),
        "the download is the slow part and doing it in advance is a kindness; running it is a decision that " +
        "stays with the person");

    const v = verifyBuild({ bytes, offer: signed, policy: { tier: "download" } });
    ok("...and even a perfectly good signed build is NOT applicable at download tier",
        v.ok === true && v.applicable === false,
        "checksum verifies, so the staged file is known-good -- but 'applicable' stays false. Being able to " +
        "verify a build is not the same as being authorised to install it");

    ok("!! autoDownload:false reduces it to notify, exactly as the operator asked",
        decide({ tier: "download", autoDownload: false }, signed, { current: "v2957" }).action === "notify",
        "the switch is real. Default on, because timely; off means off, not off-until-inconvenient");
}

// ---- 3. THE VERIFIED CASE: THREE THINGS MUST HOLD ------------------------------------------------------------------------
{
    const good = verifyBuild({ bytes, offer: signed, policy: { tier: "verified", publicKeyPem: PEM } });
    ok("!! verified tier: correct bytes + correct signature = applicable",
        good.applicable === true && good.signature === "valid",
        "checksum and ed25519 signature both verify against the key pinned on this machine");

    const tampered = verifyBuild({ bytes: Buffer.from("EVIL ZIP CONTENT!!!"), offer: signed, policy: { tier: "verified", publicKeyPem: PEM } });
    ok("!! swapped bytes are caught by the checksum even though the signature is genuine",
        tampered.applicable === false && /checksum mismatch/.test(tampered.why),
        "the signature covers the MANIFEST; the checksum binds the manifest to these exact bytes. Substituting " +
        "the payload while replaying a real signature is the classic attack, and it fails here");

    const wrongKey = crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" });
    ok("!! a build signed by someone else does not verify",
        verifyBuild({ bytes, offer: signed, policy: { tier: "verified", publicKeyPem: wrongKey } }).applicable === false,
        "trust is the specific key the operator placed there, not 'is signed'");

    ok("!! verified tier with NO pinned key degrades to staged download, never to install-anyway",
        decide({ tier: "verified" }, signed, { current: "v2957" }).action === "download" &&
        verifyBuild({ bytes, offer: signed, policy: { tier: "verified" } }).applicable === false,
        "a missing key is a missing AUTHORISATION, not a formality to skip. The failure mode of the opposite " +
        "choice is that forgetting to install a key silently means trusting everyone");

    ok("an unsigned build is never applicable at verified tier",
        verifyBuild({ bytes, offer: man, policy: { tier: "verified", publicKeyPem: PEM } }).applicable === false,
        "no signature, no install -- the tier is the whole point");
}

// ---- 4. NOTHING IS FETCHED WITHOUT A CHECKSUM TO CHECK IT AGAINST ------------------------------------------------------------
{
    ok("!! an offer with no checksum is refused rather than downloaded blind",
        decide({ tier: "download" }, { version: "v2958" }, { current: "v2957" }).action === "notify",
        "downloading something you cannot verify is worse than not downloading it: it puts an unverifiable file " +
        "on disk that a person may later assume was checked");

    ok("an oversized offer is refused",
        decide({ tier: "download", maxBytes: 1000 }, { ...man, size: 999999 }, { current: "v2957" }).action === "notify",
        "a size cap the peer sets, not one the hub proposes");
}

// ---- 5. THE MODULE ITSELF NEVER INSTALLS ANYTHING ---------------------------------------------------------------------------
{
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "updatePolicy.mjs"), "utf8")
        .replace(/^\s*\/\/.*$/gm, "").replace(/`(?:[^`\\]|\\.)*`/g, "``").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
    ok("!! updatePolicy contains no exec, spawn, unzip or extraction -- it REPORTS authorisation",
        !/child_process|\bexec\(|\bspawn\(|\bunzip\b|\bextract\b/.test(src),
        "even at verified tier this module only answers 'would applying this be authorised'. The applying is a " +
        "separate, supervised act -- so a bug here cannot install anything, it can only mis-answer a question");
}

console.log();
if (fails) { console.log("updatePolicy-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("updatePolicy-selfcheck: all checks pass");
