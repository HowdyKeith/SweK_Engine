// FILE: ui/chatCrypto.js
// VERSION: v1 - end-to-end encryption glue for the SweK peer chat (build step #3)
//
// Ties swekCrypto (seal/open) to peerIdentity (my keypair + a peer's published key) for the chat in server.html:
//   * sealForRecipient(peerUrl, text) -> seal the text to THAT peer's public key. The plaintext never leaves this box;
//     only the envelope is handed to the relay. Returns null if the peer hasn't published a key yet (caller falls back).
//   * openIncoming(msg)              -> open an envelope addressed to me with my private key. Returns null if it isn't
//     mine to open (no key / sealed to someone else / tampered - GCM rejects it).
//
// The recipient resolution is just "the selector value is the peer's base URL", and peerPublicJwk fetches their /net/info.

import { seal, open, fingerprint } from "./swekCrypto.js";
import { initIdentity, myIdentity, myFingerprint, peerPublicJwk } from "./peerIdentity.js";

let _ready = null;
function ready() { if (!_ready) _ready = initIdentity().catch(() => null); return _ready; }   // load my identity once

// Pure: does this polled message carry an envelope we must open before showing/speaking it?
export function isEncryptedMsg(m) {
    return !!(m && m.enc && typeof m.enc === "object" && m.enc.ct && m.enc.epk && m.enc.iv);
}

// Seal text to a specific peer (by base URL). Envelope, or null if that peer has published no key.
export async function sealForRecipient(peerUrl, text) {
    await ready();
    let pub = null; try { pub = await peerPublicJwk(peerUrl); } catch {}
    if (!pub) return null;
    try { return await seal(pub, String(text)); } catch { return null; }
}

// Open an incoming encrypted message with my private key. Plaintext, or null if I can't open it.
export async function openIncoming(m) {
    if (!isEncryptedMsg(m)) return null;
    await ready();
    const id = myIdentity(); if (!id || !id.privateKey) return null;
    try { return await open(id.privateKey, m.enc); } catch { return null; }
}

// Open a RAW sealed envelope addressed to me (used by the encrypted key move). Plaintext, or null if it isn't mine to open.
export async function openEnvelope(envelope) {
    if (!envelope || !envelope.ct || !envelope.epk || !envelope.iv) return null;
    await ready();
    const id = myIdentity(); if (!id || !id.privateKey) return null;
    try { return await open(id.privateKey, envelope); } catch { return null; }
}

// --- trust-on-first-use verification: compare fingerprints out-of-band to confirm a peer is who you think ---
// My own key's fingerprint (read it aloud / paste it to a peer to confirm they see the same one).
export async function myFp() { await ready(); return myFingerprint() || null; }

// A peer's published-key fingerprint (fetched from their /net/info), or null if they haven't published a key.
export async function peerFingerprint(peerUrl) {
    let pub = null; try { pub = await peerPublicJwk(peerUrl); } catch {}
    if (!pub) return null;
    try { return await fingerprint(pub); } catch { return null; }
}
