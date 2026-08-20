// WebGLEngine/ui/screenShare.js -- v3038
//
// Screen sharing over a SECOND, media-only RTCPeerConnection whose SIGNALLING RIDES THE DATA CHANNEL that
// ui/cloudPeer.js has already established.
//
// WHY NOT JUST ADD A TRACK TO cloudPeer's CONNECTION. That was the first design and it is worse. Adding a track
// to a live pc fires negotiationneeded and needs a re-offer, so cloudPeer would have to grow renegotiation --
// a change to a working transport that carries the disk-alert announce path across networks. NEVER BREAK
// WORKING THINGS. This file touches cloudPeer through its public api only (send / onMessage) and adds nothing
// to it.
//
// AND IT IS STILL NOT A THIRD SIGNALLING STACK. The SDP and ICE go over the channel cloudPeer already opened,
// so there is no new mailbox, no new rendezvous, no new token path, and nothing new to secure. An established
// data channel is a better signalling transport than the HTTP mailbox that bootstrapped it: ordered, reliable,
// already authenticated by the fact that it exists, and free of polling.
//
// RIG-ONLY, exactly as ev/p2p.js says of itself: RTCPeerConnection and getDisplayMedia need a browser. The pure
// decision helpers below are unit-tested by tools/ship/screenPattern-selfcheck.mjs.
"use strict";

export const MEDIA_MSG = "swek.media";        // one envelope tag, declared once, asserted by the gate

/**
 * Glare rule, IDENTICAL to ev/p2p.js's: of any two peers the lexicographically lower id offers. Copied as a
 * one-line pure function rather than imported because ev/p2p.js is the EV presence transport and dragging its
 * module in for one comparison would couple two unrelated subsystems -- but the RULE must not diverge, so the
 * gate asserts both files still agree.
 */
export function shouldInitiate(myId, peerId) { return String(myId) < String(peerId); }

/** Envelope in/out. Pure, so the gate can prove a malformed message is rejected without a browser. */
export function wrap(kind, data) {
    if (!kind || typeof kind !== "string") throw new Error("media envelope needs a kind");
    return { t: MEDIA_MSG, kind, data };
}
export function unwrap(msg) {
    if (!msg || msg.t !== MEDIA_MSG) return null;              // not ours -- hand it back, do not consume
    if (!msg.kind || typeof msg.kind !== "string") return null;
    if (["offer", "answer", "ice", "stop"].indexOf(msg.kind) < 0) return null;   // allow-list, not a passthrough
    return { kind: msg.kind, data: msg.data };
}

// ---- browser half ------------------------------------------------------------------------------------------
const _media = new Map();                      // peerId -> { pc, stream }
const _trackSubs = [];
let _peer = null;

export function onRemoteStream(fn) { if (typeof fn === "function") _trackSubs.push(fn); }

/** Wire to an already-started cloudPeer. Idempotent. */
export function attach(cloudPeer) {
    if (_peer || !cloudPeer) return;
    _peer = cloudPeer;
    cloudPeer.onMessage(async (msg, from) => {
        const m = unwrap(msg);
        if (!m) return;
        const rec = _ensure(from);
        try {
            if (m.kind === "offer") {
                await rec.pc.setRemoteDescription(m.data);
                const ans = await rec.pc.createAnswer();
                await rec.pc.setLocalDescription(ans);
                _peer.send(wrap("answer", rec.pc.localDescription), from);
            } else if (m.kind === "answer") {
                await rec.pc.setRemoteDescription(m.data);
            } else if (m.kind === "ice" && m.data) {
                try { await rec.pc.addIceCandidate(m.data); } catch {}
            } else if (m.kind === "stop") {
                stop(from);
            }
        } catch (e) { console.warn("[screenShare]", m.kind, e && e.message); }
    });
}

function _ensure(peerId) {
    let rec = _media.get(peerId);
    if (rec) return rec;
    // Same free public STUN cloudPeer uses. No TURN: on a LAN, ICE resolves a direct host candidate and the
    // stream never leaves the wire. Symmetric NAT across the internet will fail to connect, which is the P2P
    // trade-off stated plainly rather than papered over with a paid relay.
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    rec = { pc, stream: null };
    pc.onicecandidate = (e) => { if (e.candidate && _peer) _peer.send(wrap("ice", e.candidate), peerId); };
    pc.ontrack = (e) => {
        rec.stream = e.streams && e.streams[0];
        for (const f of _trackSubs) { try { f(rec.stream, peerId); } catch {} }
    };
    _media.set(peerId, rec);
    return rec;
}

/** Capture this screen and offer it to a peer. The OS picker is the consent gate -- we never choose for them. */
export async function share(peerId, opts = {}) {
    if (!_peer) throw new Error("screenShare.attach(cloudPeer) first -- signalling rides cloudPeer's data channel");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error("this browser has no getDisplayMedia -- screen capture is unavailable here (iOS Safari never has it), so there is nothing to send and saying so beats a black rectangle");
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: opts.video || true, audio: false });
    const rec = _ensure(peerId);
    for (const t of stream.getTracks()) rec.pc.addTrack(t, stream);
    const offer = await rec.pc.createOffer();
    await rec.pc.setLocalDescription(offer);
    _peer.send(wrap("offer", rec.pc.localDescription), peerId);
    rec.local = stream;
    // The user can stop sharing from the browser's own bar; treat that as authoritative.
    for (const t of stream.getTracks()) t.addEventListener("ended", () => stop(peerId));
    return stream;
}

export function stop(peerId) {
    const rec = _media.get(peerId);
    if (!rec) return false;
    try { if (rec.local) for (const t of rec.local.getTracks()) t.stop(); } catch {}
    try { rec.pc.close(); } catch {}
    _media.delete(peerId);
    return true;
}

export function sessions() { return [..._media.entries()].map(([id, r]) => ({ id, hasStream: !!r.stream, sending: !!r.local })); }

export default { attach, share, stop, sessions, onRemoteStream, wrap, unwrap, shouldInitiate, MEDIA_MSG };
