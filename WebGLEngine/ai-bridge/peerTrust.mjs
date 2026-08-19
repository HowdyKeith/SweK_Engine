// WebGLEngine/ai-bridge/peerTrust.mjs — v3284
// ---------------------------------------------------------------------------------------------------------------
// WHO IS ALLOWED TO HAND THIS MACHINE A BUILD — the decision that was left open across three versions, now made.
//
// THE HOLE THIS CLOSES: pairing a peer granted it PERMANENT UPDATE-SOURCE TRUST. The desktop peer-pull path
// fetched /update/offer from any paired peer, and any peer claiming a higher version got its zip downloaded and
// auto-applied. On a LAN that is a considered trade. Over a cloudflared tunnel it is remote code execution
// granted by a single pairing click, and the fleet path had ALREADY built the machinery to prevent it
// (signRelease.mjs, applyStaged.mjs, updatePolicy.mjs) while this path did not consult it. Two implementations
// of one fact, and the weaker one was the one facing the internet.
//
// THE POLICY, as decided:
//   LAN peer                      -> trust-on-pair KEPT. Pairing on a network you control is the consent, and
//                                    requiring signatures there would break the ordinary two-machines-at-home
//                                    workflow this feature exists for.
//   EXTERNAL peer, signed         -> verify the ed25519 manifest signature against the LOCALLY PINNED key
//                                    (updatePolicy.verifyBuild, imported not reimplemented). Valid -> may apply.
//   EXTERNAL peer, unsigned/bad   -> STAGE, NAME THE SOURCE, NEVER AUTO-APPLY. The build is kept, the operator
//                                    is told exactly which peer offered it, and a human decides.
//
// TWO RULES THAT MAKE THE CLASSIFICATION MEAN ANYTHING:
//
//   1. ORIGIN IS DECIDED FROM THE URL WE DIALLED, NEVER FROM ANYTHING THE PEER SENDS. A peer that could declare
//      itself LAN in its own offer body would simply declare itself LAN. Nothing in the offer is consulted here,
//      and the gate proves a hostile offer claiming {origin:"lan", trusted:true} changes nothing.
//
//   2. FAIL CLOSED. Only addresses PROVABLY on a private network classify as LAN: loopback, RFC1918, CGNAT
//      100.64/10, link-local 169.254, IPv6 loopback/ULA/link-local, and the .local mDNS suffix. A bare hostname
//      is NOT assumed local -- it could resolve anywhere, and DNS rebinding makes "resolve it and check" a
//      weaker test than it looks. Unknown means external, which costs an operator one click and costs an
//      attacker the whole attack.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { verifyBuild, readPolicy } from "../tools/roundhouse/updatePolicy.mjs";

export const ORIGIN_LAN = "lan";
export const ORIGIN_EXTERNAL = "external";

const isPrivateV4 = (p) => {
    const m = p.split(".");
    if (m.length !== 4 || m.some((x) => !/^\d+$/.test(x))) return false;
    const [a, b] = m.map(Number);
    if (m.some((x) => Number(x) > 255)) return false;
    if (a === 10) return true;                            // 10.0.0.0/8
    if (a === 127) return true;                           // loopback
    if (a === 172 && b >= 16 && b <= 31) return true;     // 172.16.0.0/12
    if (a === 192 && b === 168) return true;              // 192.168.0.0/16
    if (a === 169 && b === 254) return true;              // link-local
    if (a === 100 && b >= 64 && b <= 127) return true;    // CGNAT 100.64.0.0/10 -- carrier-side, not the public internet
    return false;
};
// v3316 -- *** IPv4-MAPPED IPv6 WAS BEING CLASSIFIED EXTERNAL, AND THAT IS THE FORM A LAN ACTUALLY PRODUCES. ***
// A dual-stack Node server reports req.socket.remoteAddress for a LAN machine as ::ffff:192.168.1.50, and the
// lighthouse records exactly that as its remoteHint. The original check handled the DOTTED form -- but
// new URL("http://[::ffff:192.168.1.50]").hostname NORMALISES TO ::ffff:c0a8:132, hex, and .split(":").pop()
// then reads "132", which is not a private IPv4 address and not anything else either. So a wireless LAN peer
// reached by its mapped address failed the LAN test, was treated as external, and had its updates STAGED
// instead of applied -- a security rule doing its job on a machine it was never meant to apply to.
//
// Fail-closed was the right default and it is kept; what was wrong was the address parsing, not the policy.
const hexQuadToV4 = (a, b) => [(a >> 8) & 0xff, a & 0xff, (b >> 8) & 0xff, b & 0xff].join(".");
const isPrivateV6 = (h) => {
    const x = h.replace(/^\[|\]$/g, "").toLowerCase().replace(/%.*$/, "");   // strip brackets and any zone id
    if (x === "::1") return true;                                    // loopback
    if (/^f[cd][0-9a-f]{2}:/.test(x)) return true;                   // fc00::/7 unique-local
    if (/^fe[89ab][0-9a-f]:/.test(x)) return true;                   // fe80::/10 link-local
    // v4-mapped, DOTTED form: ::ffff:192.168.1.50
    const dotted = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isPrivateV4(dotted[1]);
    // v4-mapped, HEX form: ::ffff:c0a8:132 -- what new URL() hands back
    const hex = x.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) return isPrivateV4(hexQuadToV4(parseInt(hex[1], 16), parseInt(hex[2], 16)));
    return false;
};

/**
 * Classify a peer by the URL WE dialled. Never consults the peer's own claims.
 * Returns { origin, host, why } -- `why` is carried so a refusal can explain itself to an operator.
 */
export function peerOrigin(peerUrl) {
    let host = "";
    try {
        const u = new URL(String(peerUrl));
        host = u.hostname;
    } catch {
        return { origin: ORIGIN_EXTERNAL, host: String(peerUrl || ""), why: "unparseable URL -- failing closed" };
    }
    const h = host.toLowerCase();
    if (h === "localhost") return { origin: ORIGIN_LAN, host, why: "loopback name" };
    if (isPrivateV4(h)) return { origin: ORIGIN_LAN, host, why: "private IPv4 address" };
    if (isPrivateV6(h)) return { origin: ORIGIN_LAN, host, why: "private or loopback IPv6 address" };
    if (h.endsWith(".local")) return { origin: ORIGIN_LAN, host, why: "mDNS .local name" };
    // Everything else -- public IPs, tunnels, and ANY bare or dotted hostname -- is external. A hostname is not
    // assumed local: it can resolve anywhere, and it can resolve somewhere else a second later.
    return { origin: ORIGIN_EXTERNAL, host, why: "not provably on a private network -- treated as external" };
}

export const ACTION_APPLY = "may-apply";
export const ACTION_STAGE = "stage-only";
export const ACTION_REFUSE = "refuse";

/**
 * The decision. `offer` is the peer's manifest, `bytes` the downloaded zip (may be null when deciding before
 * download), `policy` the local update policy (pinned key lives there). NOTHING is applied here: this returns a
 * verdict and the caller acts, which is the same separation updatePolicy already keeps.
 */
export function decidePeerUpdate({ peerUrl, offer, bytes = null, policy = null } = {}) {
    const org = peerOrigin(peerUrl);
    const base = { peer: peerUrl, origin: org.origin, host: org.host, originWhy: org.why };

    if (!offer || !offer.version) return { ...base, action: ACTION_REFUSE, signature: "not-checked", why: "peer offered nothing usable" };

    // ---- LAN: trust-on-pair kept, deliberately and with the reason recorded --------------------------------
    if (org.origin === ORIGIN_LAN) {
        return { ...base, action: ACTION_APPLY, signature: "not-required",
                 why: "LAN peer: pairing on a network you control is the consent (trust-on-pair, kept by decision)" };
    }

    // ---- EXTERNAL: the signature decides, and it is checked with the FLEET's verifier ----------------------
    // verifyBuild only checks a signature at the "verified" tier, so the tier is forced here regardless of the
    // local policy's tier. That is the point of the decision: an external peer does not get to be graded by a
    // policy that happens to be set to "download". The pinned key still comes from the local policy, and if
    // there is no pinned key the build stages rather than applies.
    const forced = { ...readPolicy(policy), tier: "verified" };
    if (!bytes) {
        // pre-download decision: an unsigned external offer is not worth fetching automatically, but it is
        // worth TELLING the operator about, which is what stage-only means at this stage.
        return { ...base, action: offer.signature ? ACTION_APPLY : ACTION_STAGE, signature: offer.signature ? "claimed" : "unsigned",
                 why: offer.signature
                     ? "external peer offers a signed manifest -- fetch and verify against the pinned key before applying"
                     : "external peer, unsigned offer -- may be staged for a human, never auto-applied" };
    }
    const v = verifyBuild({ bytes, offer, policy: forced });
    if (v.applicable && v.signature === "valid") {
        return { ...base, action: ACTION_APPLY, signature: "valid", digest: v.digest,
                 why: "external peer, signature verifies against the locally pinned key -- applying is authorised" };
    }
    // A CHECKSUM MISMATCH IS NOT A STAGING CANDIDATE, it is a refusal: those bytes are not the build that was
    // offered, so there is nothing for a human to decide about.
    const corrupt = v.problems.some((p) => p.startsWith("checksum mismatch") || p.startsWith("size mismatch") || p === "no bytes");
    if (corrupt) return { ...base, action: ACTION_REFUSE, signature: v.signature, digest: v.digest,
                          why: "external peer: " + v.problems.join("; ") };
    return { ...base, action: ACTION_STAGE, signature: v.signature, digest: v.digest,
             why: "external peer, " + (v.signature === "unsigned" ? "unsigned build" : "signature did not verify") +
                  " -- STAGED and attributed, never auto-applied; a human decides",
             problems: v.problems };
}

/** One line an operator can act on. A staged build MUST name its source, or "a new version is available" is an anonymous instruction to run someone's code. */
export function peerUpdateLine(d) {
    if (d.action === ACTION_APPLY) return `update from ${d.host} (${d.origin}): authorised — ${d.why}`;
    if (d.action === ACTION_STAGE) return `STAGED, NOT APPLIED — offered by ${d.host} (${d.origin}, signature: ${d.signature}). Review the source before installing. ${d.why}`;
    return `refused update from ${d.host} (${d.origin}): ${d.why}`;
}
