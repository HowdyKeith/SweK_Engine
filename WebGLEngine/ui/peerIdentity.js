// FILE: ui/peerIdentity.js
// VERSION: v1 - per-box cryptographic identity (build step #1 on swekCrypto)
//
// Each box has ONE long-term keypair (swekCrypto, ECDH P-256). On load we load it from localStorage or create it once;
// the PRIVATE key stays in localStorage and never leaves the browser. We publish only the PUBLIC key to our own server
// (POST /self/pubkey), which serves it via /net/info - so any peer can fetch our public key and SEAL a chat message or an
// API key to us that only our private key can open. This is the foundation the E2E chat (#3) and the encrypted key move
// (#5) build on.

import { generateIdentity, exportIdentity, importIdentity, fingerprint } from "./swekCrypto.js";

const LS_KEY = "voxelengine.identity";   // { publicJwk, privateJwk } - privateJwk NEVER published

let _identity = null;   // { publicJwk, privateKey } - privateKey is a live CryptoKey, non-extractable use
let _fp = "";

// Load-or-create the persistent identity, then publish the PUBLIC half. Injectable deps for headless tests.
export async function initIdentity(deps) {
    const d = deps || {};
    const getLocal = d.getLocal || ((k) => { try { return localStorage.getItem(k); } catch { return null; } });
    const setLocal = d.setLocal || ((k, v) => { try { localStorage.setItem(k, v); } catch {} });
    const postJson = d.postJson || ((u, b) => fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => null));

    let stored = null;
    try { const raw = getLocal(LS_KEY); if (raw) stored = JSON.parse(raw); } catch {}
    let loaded = null;
    if (stored && stored.publicJwk && stored.privateJwk) {
        try { loaded = await importIdentity(stored); } catch { loaded = null; }   // corrupt/old -> regenerate
    }
    let created = false;
    if (loaded) {
        _identity = loaded;
    } else {
        _identity = await generateIdentity();
        created = true;
        try { setLocal(LS_KEY, JSON.stringify(await exportIdentity(_identity))); } catch {}
    }
    try { _fp = await fingerprint(_identity.publicJwk); } catch { _fp = ""; }

    // publish ONLY the public key so peers can seal to us; the private key stays here
    try { await postJson("/self/pubkey", { publicJwk: _identity.publicJwk, fp: _fp }); } catch {}
    return { ok: true, created, fingerprint: _fp };
}

export function myIdentity() { return _identity; }                 // holds privateKey - use locally, never send
export function myPublicJwk() { return _identity && _identity.publicJwk; }
export function myFingerprint() { return _fp; }

// Fetch a peer's published public key (so we can seal a message / key to them).
export async function peerPublicJwk(peerUrl, deps) {
    const fetchJson = (deps && deps.fetchJson) || ((u) => fetch(u, { cache: "no-store" }).then((r) => r.json()).catch(() => null));
    try {
        const ni = await fetchJson(String(peerUrl).replace(/\/+$/, "") + "/net/info");
        const pk = ni && ni.pubkey;
        return (pk && pk.publicJwk) ? pk.publicJwk : (pk && pk.kty ? pk : null);   // tolerate {publicJwk,fp} or a bare JWK
    } catch { return null; }
}
