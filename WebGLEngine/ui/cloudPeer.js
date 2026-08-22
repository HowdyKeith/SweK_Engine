// v1617 — cloud peer (WebRTC P2P). Establishes a DIRECT browser-to-browser data channel to a remote SweK box
// or user, using the cloud rendezvous ONLY for signaling (SDP/ICE), proxied through the bridge so the token
// never reaches the browser. Once connected the data flows peer-to-peer (no cloud egress). The channel carries
// small JSON: a hello/ping for presence, and "announce" events so a remote box's disk alert can fire the local
// avatar cameo across networks. Public STUN handles most NATs; symmetric NAT would need a TURN relay (not free).
//
// API (also on window.cloudPeer): start(), connect(remoteId), send(obj[, toId]), disconnect(id), peers(),
// status(), onStatus(fn), onMessage(fn), test(). myId = this box's cloud id (from /cloud/config).

let _myId = "";
let _started = false;
let _polling = false;
const _conns = new Map();              // remoteId -> { pc, ch, state }
const _statusSubs = [];
const _msgSubs = [];
// STUN gets most NATs through for free; a TURN relay (configured in the Cloud panel) is the fallback for
// symmetric NAT, where it relays the media (so it costs bandwidth — not free). Rebuilt from /cloud/config.
let ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

function _emitStatus() { const s = status(); for (const fn of _statusSubs) { try { fn(s); } catch {} } }
function onStatus(fn) { if (typeof fn === "function") _statusSubs.push(fn); }
function onMessage(fn) { if (typeof fn === "function") _msgSubs.push(fn); }
function peers() { return [..._conns.entries()].map(([id, c]) => ({ id, state: c.state })); }
function status() { return { myId: _myId, started: _started, peers: peers() }; }

async function _sig(to, kind, data) {
    try { await fetch("/cloud/signal/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, from: _myId, kind, data }) }); } catch {}
}

function _newConn(remoteId) {
    const pc = new RTCPeerConnection(ICE);
    const rec = { pc, ch: null, state: "connecting" };
    _conns.set(remoteId, rec);
    pc.onicecandidate = (e) => { if (e.candidate) _sig(remoteId, "ice", e.candidate); };
    pc.onconnectionstatechange = () => { rec.state = pc.connectionState; if (/(failed|disconnected|closed)/.test(pc.connectionState)) { } _emitStatus(); };
    pc.ondatachannel = (e) => _wireChannel(remoteId, rec, e.channel);
    return rec;
}
function _wireChannel(remoteId, rec, ch) {
    rec.ch = ch;
    ch.onopen = () => { rec.state = "open"; _emitStatus(); try { ch.send(JSON.stringify({ t: "hello", from: _myId })); } catch {} };
    ch.onclose = () => { rec.state = "closed"; _emitStatus(); };
    ch.onmessage = (ev) => {
        let m = null; try { m = JSON.parse(ev.data); } catch { return; }
        if (!m) return;
        // ties into the cameo: a remote box's announce fires the local visiting-avatar cameo across networks.
        if (m.t === "announce" && window.peerCameo && typeof window.peerCameo.inject === "function") { try { window.peerCameo.inject(m.ann || m); } catch {} }
        for (const fn of _msgSubs) { try { fn(remoteId, m); } catch {} }
    };
}

async function connect(remoteId) {
    if (!remoteId || remoteId === _myId) return false;
    await start();
    const rec = _newConn(remoteId);
    const ch = rec.pc.createDataChannel("swek");
    _wireChannel(remoteId, rec, ch);
    const offer = await rec.pc.createOffer();
    await rec.pc.setLocalDescription(offer);
    await _sig(remoteId, "offer", offer);
    _emitStatus();
    return true;
}

async function _onSignal(m) {
    const from = m.from; if (!from) return;
    if (m.kind === "offer") {
        const rec = _conns.get(from) || _newConn(from);
        await rec.pc.setRemoteDescription(new RTCSessionDescription(m.data));
        const ans = await rec.pc.createAnswer();
        await rec.pc.setLocalDescription(ans);
        await _sig(from, "answer", ans);
    } else if (m.kind === "answer") {
        const rec = _conns.get(from); if (rec) await rec.pc.setRemoteDescription(new RTCSessionDescription(m.data));
    } else if (m.kind === "ice") {
        const rec = _conns.get(from); if (rec && m.data) { try { await rec.pc.addIceCandidate(new RTCIceCandidate(m.data)); } catch {} }
    }
}

async function _pollLoop() {
    if (_polling) return; _polling = true;
    while (_started) {
        if (typeof window !== "undefined" && window.__swekPollsPaused) { await new Promise((res) => setTimeout(res, 2000)); continue; }   // v1870 — hold the signal fetch while Settings is open
        try {
            const r = await fetch("/cloud/signal/poll?id=" + encodeURIComponent(_myId), { cache: "no-store" }).then((x) => x.json());
            if (r && r.ok && Array.isArray(r.msgs)) for (const m of r.msgs) { try { await _onSignal(m); } catch {} }
        } catch {}
        await new Promise((res) => setTimeout(res, 2000));
    }
    _polling = false;
}

async function start() {
    if (_started) return true;
    try {
        const c = await fetch("/cloud/config", { cache: "no-store" }).then((r) => r.json());
        _myId = (c && c.id) || "";
        if (c && c.turnUrl) { const ice = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }]; ice.push({ urls: c.turnUrl, username: c.turnUser || "", credential: c.turnCred || "" }); ICE = { iceServers: ice }; }
    } catch {}
    if (!_myId) return false;
    _started = true; _pollLoop(); _emitStatus();
    return true;
}

function send(obj, toId) {
    let n = 0;
    for (const [id, c] of _conns) { if (toId && id !== toId) continue; if (c.ch && c.ch.readyState === "open") { try { c.ch.send(JSON.stringify(obj)); n++; } catch {} } }
    return n;
}
function disconnect(id) { const c = _conns.get(id); if (c) { try { c.ch && c.ch.close(); } catch {} try { c.pc.close(); } catch {} _conns.delete(id); _emitStatus(); } }
function test() { return send({ t: "ping", ts: Date.now() }); }

const api = { start, connect, send, disconnect, peers, status, onStatus, onMessage, test };
if (typeof window !== "undefined") window.cloudPeer = api;
export default api;
