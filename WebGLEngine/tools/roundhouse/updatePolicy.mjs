// tools/roundhouse/updatePolicy.mjs
//
// v2958 -- THREE TIERS, BECAUSE THE RIGHT ANSWER DEPENDS ON WHO IS AT THE OTHER END.
//
//   notify    Tell the peer a newer build exists. Nothing is fetched, nothing is written. The safe default for
//             any machine whose operator has not said otherwise.
//
//   download  Fetch the new build into a STAGING folder so it is ready when the person wants it, verify its
//             checksum, and stop. Nothing is unzipped, nothing is executed, the running install is untouched.
//             This is the cousin case: the download is the slow part and doing it in advance is a kindness, but
//             the decision to run it stays with him -- and he can turn even this off.
//
//   verified  Download, verify the checksum, AND verify an ed25519 signature against a public key that was
//             placed on this machine by its operator, out of band. Only a build that passes all three may be
//             applied. This is the case for a machine whose owner should not have to make security decisions --
//             the key is the operator saying "I vouch for this source", once, in person.
//
// THE RULE THAT MAKES THE WHOLE THING SAFE, and it is the one an obvious implementation gets wrong:
//
//     THE TIER IS SET LOCALLY ON THE PEER. THE HUB CAN NEVER RAISE IT.
//
// If the hub could tell a peer "you are on verified tier now, here is an update", then compromising the hub --
// or merely impersonating one of a dozen rotating tunnel URLs -- would be enough to install code everywhere. The
// peer reads its tier from its own config file and the hub's opinion of it is not consulted. A hub can offer; it
// can never promote.
//
// AND: no key, no install. The verified tier without a pinned public key does not degrade to "install anyway",
// it degrades to `download`. A missing key is a missing authorisation, not a formality to skip.

import crypto from "node:crypto";

export const TIERS = ["notify", "download", "verified"];
export const DEFAULT_TIER = "notify";

/** Parse a peer's local policy. Unknown or absent values fall back to the SAFE end, never the permissive one. */
export function readPolicy(raw) {
    const cfg = (raw && typeof raw === "object") ? raw : {};
    const wanted = String(cfg.tier || DEFAULT_TIER).toLowerCase();
    const tier = TIERS.includes(wanted) ? wanted : DEFAULT_TIER;
    return {
        tier,
        autoDownload: cfg.autoDownload !== false,        // on by default, and explicitly switchable off
        publicKeyPem: cfg.publicKeyPem || null,
        stagingDir: cfg.stagingDir || "swek-updates",
        maxBytes: Number.isFinite(cfg.maxBytes) ? cfg.maxBytes : 128 * 1024 * 1024,
    };
}

/**
 * Decide what to do about an offered build. Pure -- no I/O -- so the decision can be tested exhaustively and the
 * caller does the fetching.
 */
export function decide(policy, offer, { current = null } = {}) {
    const p = readPolicy(policy);
    const n = (v) => (v ? parseInt(String(v).replace(/^v/, ""), 10) : NaN);
    if (!offer || !offer.version) return { action: "none", why: "the hub offered no build" };
    if (Number.isFinite(n(current)) && Number.isFinite(n(offer.version)) && n(offer.version) <= n(current)) {
        return { action: "none", why: `already on ${current}; offered ${offer.version}` };
    }
    if (p.tier === "notify") return { action: "notify", why: "policy tier is notify -- nothing is fetched" };
    if (!p.autoDownload) return { action: "notify", why: "a newer build exists but autoDownload is switched off" };
    if (!offer.sha256 || !Number.isFinite(offer.size)) {
        return { action: "notify", why: "the offer carries no checksum or size, so a download could not be verified -- refusing to fetch blind" };
    }
    if (offer.size > p.maxBytes) return { action: "notify", why: `offered build is ${offer.size} bytes, over the ${p.maxBytes} cap` };
    if (p.tier === "download") return { action: "download", why: "staging the build; it will NOT be unzipped or run" };
    // verified tier
    if (!p.publicKeyPem) return { action: "download", why: "verified tier but NO PUBLIC KEY is pinned on this machine -- downgrading to staged download. A missing key is a missing authorisation, not a formality" };
    if (!offer.signature) return { action: "download", why: "verified tier but the offer is unsigned -- staged, not applicable" };
    return { action: "download-and-verify", why: "will verify the signature against the locally pinned key before the build is applicable" };
}

/** sha256 of a buffer, hex. */
export function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

/**
 * Verify a downloaded build. Returns a verdict; NOTHING is applied by this module -- it reports whether applying
 * would be authorised, and the caller (a human, or a supervised installer) acts.
 */
export function verifyBuild({ bytes, offer, policy }) {
    const p = readPolicy(policy);
    const problems = [];
    if (!bytes || !bytes.length) problems.push("no bytes");
    const digest = bytes && bytes.length ? sha256(bytes) : null;
    if (offer && offer.sha256 && digest !== offer.sha256) problems.push(`checksum mismatch: got ${String(digest).slice(0, 16)}..., offered ${String(offer.sha256).slice(0, 16)}...`);
    if (offer && Number.isFinite(offer.size) && bytes && bytes.length !== offer.size) problems.push(`size mismatch: got ${bytes.length}, offered ${offer.size}`);

    let signature = "not-checked";
    if (p.tier === "verified") {
        if (!p.publicKeyPem) { problems.push("verified tier with no pinned public key"); signature = "no-key"; }
        else if (!offer || !offer.signature) { problems.push("verified tier and the build is unsigned"); signature = "unsigned"; }
        else {
            // the signature covers the MANIFEST -- version, checksum, size -- not the bytes directly, so a
            // signed manifest plus a matching checksum is what binds the signature to these exact bytes.
            const manifest = JSON.stringify({ version: offer.version, sha256: offer.sha256, size: offer.size });
            let okSig = false;
            try { okSig = crypto.verify(null, Buffer.from(manifest), p.publicKeyPem, Buffer.from(offer.signature, "base64")); } catch { okSig = false; }
            signature = okSig ? "valid" : "INVALID";
            if (!okSig) problems.push("signature does not verify against the pinned key");
        }
    }
    return {
        ok: problems.length === 0,
        applicable: problems.length === 0 && (p.tier === "verified" ? signature === "valid" : false),
        tier: p.tier, signature, digest, problems,
        why: problems.length === 0
            ? (p.tier === "verified" ? "checksum and signature both verify -- applying is authorised" : "checksum verifies; staged only, applying is a human decision")
            : problems.join("; "),
    };
}
