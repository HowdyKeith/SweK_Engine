// FILE: ui/swekCrypto.js
// VERSION: v1 - end-to-end crypto foundation for SweK peers
//
// ECIES-style: an ephemeral ECDH P-256 key agreement derives a one-time AES-256-GCM key, so each message/secret is sealed
// to the recipient's PUBLIC key and only their PRIVATE key can open it. The server (or any relay) only ever sees ciphertext.
// This is the shared basis for two features:
//   * encrypted API-key transfer (the deliberate, password-gated key MOVE) - seal the key to the requesting peer;
//   * end-to-end encrypted peer chat - seal each message to the recipient.
//
// Each peer holds ONE long-term identity keypair; it publishes its public JWK and keeps the private key (persisted locally,
// never sent). Senders use a fresh EPHEMERAL keypair per message (forward secrecy for past messages if the ephemeral is
// discarded). Runs on browser WebCrypto and Node's global webcrypto, so the logic unit-tests headless.

function _subtle() { const c = globalThis.crypto; if (!c || !c.subtle) throw new Error("WebCrypto unavailable"); return c.subtle; }
const EC = { name: "ECDH", namedCurve: "P-256" };

function _b64(buf) { const b = new Uint8Array(buf); let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return globalThis.btoa(s); }
function _unb64(str) { const s = globalThis.atob(str); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }

// --- identity (long-term keypair) ---
export async function generateIdentity() {
    const kp = await _subtle().generateKey(EC, true, ["deriveKey", "deriveBits"]);
    const publicJwk = await _subtle().exportKey("jwk", kp.publicKey);
    return { publicJwk, privateKey: kp.privateKey };
}
// persist/restore so a peer keeps the SAME identity across reloads (privateJwk stays local, never published)
export async function exportIdentity(identity) {
    const privateJwk = await _subtle().exportKey("jwk", identity.privateKey);
    return { publicJwk: identity.publicJwk, privateJwk };
}
export async function importIdentity(stored) {
    const privateKey = await _subtle().importKey("jwk", stored.privateJwk, EC, true, ["deriveKey", "deriveBits"]);
    return { publicJwk: stored.publicJwk, privateKey };
}

async function _importPub(jwk) { return _subtle().importKey("jwk", jwk, EC, true, []); }
async function _deriveAes(privateKey, publicKey) {
    return _subtle().deriveKey({ name: "ECDH", public: publicKey }, privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// --- seal / open ---
// Seal a string to a recipient's published public JWK. Returns a self-describing envelope (safe to send over the wire).
export async function seal(recipientPublicJwk, plaintext) {
    const recipPub = await _importPub(recipientPublicJwk);
    const eph = await _subtle().generateKey(EC, true, ["deriveKey", "deriveBits"]);
    const key = await _deriveAes(eph.privateKey, recipPub);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ct = await _subtle().encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(String(plaintext)));
    const epk = await _subtle().exportKey("jwk", eph.publicKey);
    return { v: 1, alg: "ECDH-P256+A256GCM", epk, iv: _b64(iv), ct: _b64(ct) };
}
// Open an envelope with my private key. Throws if tampered (GCM auth) or wrong recipient.
export async function open(myPrivateKey, envelope) {
    if (!envelope || envelope.v !== 1 || !envelope.epk || !envelope.iv || !envelope.ct) throw new Error("bad envelope");
    const ephPub = await _importPub(envelope.epk);
    const key = await _deriveAes(myPrivateKey, ephPub);
    const pt = await _subtle().decrypt({ name: "AES-GCM", iv: _unb64(envelope.iv) }, key, _unb64(envelope.ct));
    return new TextDecoder().decode(pt);
}

// short fingerprint of a public JWK, for "is this the box I think it is?" UI (NOT a security boundary on its own)
export async function fingerprint(publicJwk) {
    const data = new TextEncoder().encode((publicJwk && publicJwk.x || "") + "." + (publicJwk && publicJwk.y || ""));
    const h = await _subtle().digest("SHA-256", data);
    const b = new Uint8Array(h); let hex = "";
    for (let i = 0; i < 8; i++) hex += b[i].toString(16).padStart(2, "0");
    return hex.replace(/(.{4})/g, "$1 ").trim();
}
