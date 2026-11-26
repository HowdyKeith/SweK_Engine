// WebGLEngine/ui/tvOut.js -- UNNUMBERED (the version is chosen at ship time)
//
// THIS PAGE ON A TV. Keith: "7" (a "To TV" button in the record controls) and "8" (the engine's canvas live, WebCodecs H.264 into tvpipe's stream()). The dock's
// sixth row (ui/svgGaugeSet.js) has three buttons that import this file on their first click:
//   TO TV    pick a TV, then the bridge has tvpipe open THIS PAGE in a browser of its own and mirror it (POST /tv/share). Everything on the page goes.
//   LIVE TV  pick a TV, then THIS PAGE encodes its largest <canvas> itself (WebCodecs, H.264, Annex B) and sends each frame over the /tv/live socket; the
//            bridge hands it to tvpipe, which sends it on without re-encoding. Only the canvas goes, with less delay than TO TV.
//   TV OFF   stop whatever this bridge is sending to a TV (POST /tv/stop).
// An Apple TV that shows a PIN is answered with a prompt here (GET /tv/status lists it, POST /tv/pin answers it). Every failure is a message on the button,
// never a silent no-op. The bridge's side, and what it refuses: ai-bridge/tvpipeBridge.js. Held by tools/ship/tvOut-selfcheck.mjs.
//
// THE WIRE (the bridge's parseLiveFrame reads it): one flags byte (1 = keyframe, 2 = sound), the timestamp in microseconds as a little-endian u64, then the
// access unit, or for sound interleaved s16 little-endian PCM.
//
// SOUND TOO: LIVE TV's picker has "with this tab's sound". SweK pages each make their own AudioContext, so there is no one mixer to tap; the tab's own audio
// is what Chrome can hand over (getDisplayMedia, "share tab audio" -- one browser prompt, this tab offered first). Its track is read as AudioData, mixed to
// two channels at 48 kHz, and sent beside the frames. No sound shared (the box unticked): the canvas goes on alone, and the button says so.
//
// THE TV TALKS BACK: watch() polls /tv/status while something plays and describe() turns it into what TV OFF shows -- who is connected, who dropped out or
// came back, and the TV's own user ending it -- coloured green, amber or red; a stream that ends tells the page why.

/** One live frame as the bridge reads it. Pure. */
export function encodeLiveFrame(keyframe, ptsUs, au, audio = false) {
    const out = new Uint8Array(9 + au.byteLength), dv = new DataView(out.buffer);
    out[0] = (keyframe ? 1 : 0) | (audio ? 2 : 0); dv.setBigUint64(1, BigInt(Math.max(0, Math.round(ptsUs))), true); out.set(au instanceof Uint8Array ? au : new Uint8Array(au), 9);
    return out;
}
/** The size to encode a w x h canvas at: even, and no larger than max (default 1920 x 1080), keeping its shape. Pure. */
export function liveSize(w, h, maxW = 1920, maxH = 1080) {
    const k = Math.min(1, maxW / w, maxH / h), even = (x) => Math.max(2, 2 * Math.floor((x * k) / 2));
    return { width: even(w), height: even(h) };
}
export const AUDIO = Object.freeze({ sampleRate: 48000, channels: 2 });
/** Planar float channels (one Float32Array each, `frames` long) at `fromRate`, as interleaved s16 stereo at AUDIO.sampleRate: mono is doubled, more than two
 *  channels keep the first two, other rates are resampled linearly. Pure. */
export function toStereoS16(planes, frames, fromRate) {
    const L = planes[0], R = planes[1] || planes[0], ratio = fromRate / AUDIO.sampleRate, n = Math.max(0, Math.floor(frames / ratio)), out = new Int16Array(n * 2);
    const at = (ch, x) => { const i = Math.floor(x), f = x - i, a = ch[Math.min(i, frames - 1)], b = ch[Math.min(i + 1, frames - 1)]; return a + (b - a) * f; };
    const s16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
    for (let k = 0; k < n; k++) { const x = k * ratio; out[k * 2] = s16(at(L, x)); out[k * 2 + 1] = s16(at(R, x)); }
    return out;
}
/** What the dock's TV OFF shows, from GET /tv/status: { state: "off" | "on" | "trouble", caption, title, color }. Pure. */
export function describe(status, now = Date.now()) {
    const live = ((status && status.sessions) || []).filter((x) => x.state === "playing" || x.state === "starting");
    if (!live.length) {
        const last = ((status && status.sessions) || []).slice(-1)[0], ev = last && (last.events || []).slice(-1)[0];
        return { state: "off", caption: "TV OFF", color: null, title: "Nothing is on a TV" + (last && ev ? ` -- the last ${last.kind} to ${last.to.join(", ")} ${last.state}${last.error ? ": " + last.error.message : ""}` : "") };
    }
    const BAD = ["lost", "failed", "gave-up"], recs = live.flatMap((x) => Object.entries(x.receivers || {}).map(([name, r]) => ({ name, ...r, kind: x.kind })));
    const bad = recs.find((r) => BAD.includes(r.state)), on = recs.filter((r) => r.state === "connected" || r.state === "reconnected");
    const ago = (t) => { const s2 = Math.max(0, Math.round((now - Date.parse(t)) / 1000)); return s2 < 60 ? `${s2}s ago` : `${Math.round(s2 / 60)}m ago`; };
    const lines = live.map((x) => `${x.kind === "live" ? "LIVE canvas" : x.kind === "share" ? "this page" : x.kind} -> ${x.to.join(", ")}: ` + (Object.entries(x.receivers || {}).map(([n, r]) => `${n} ${r.state}${r.protocol ? " (" + r.protocol + ")" : ""}${r.error ? " -- " + r.error : ""}`).join("; ") || "connecting"));
    const evs = live.flatMap((x) => (x.events || []).filter((e) => e.receiver)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-4).map((e) => `${e.receiver} ${e.state} ${ago(e.at)}`);
    const short = (n) => String(n).toUpperCase().slice(0, 8);
    if (bad) return { state: "trouble", caption: `${bad.state === "lost" ? "LOST" : "FAILED"}: ${short(bad.name)}`, color: "#ff6b6b", title: [...lines, ...(evs.length ? ["", ...evs] : []), "", "Click to stop"].join("\n") };
    return { state: "on", caption: on.length ? `ON: ${short(on[0].name)}${on.length > 1 ? " +" + (on.length - 1) : ""}` : "CONNECTING", color: on.length ? "#5fd886" : "#ffa84c", title: [...lines, ...(evs.length ? ["", ...evs] : []), "", "Click to stop"].join("\n") };
}
/** Poll /tv/status while something plays (and once more after it stops), handing describe() to `onChange`. Returns a stop function. */
export function watch(onChange, { intervalMs = 3000, fetchStatus = () => json("/tv/status") } = {}) {
    let on = true, quiet = 0, timer = 0;
    const tick = async () => { if (!on) return; let st = null; try { st = await fetchStatus(); } catch { /* the bridge will say */ }
        if (st) { const d = describe(st); onChange(d, st); quiet = d.state === "off" ? quiet + 1 : 0; }
        if (on && quiet < 2) timer = setTimeout(tick, intervalMs); else on = false; };
    tick();
    return () => { on = false; clearTimeout(timer); };
}

/** The H.264 profiles to ask the encoder for, in order: high, main, baseline. */
export const CODECS = Object.freeze(["avc1.640028", "avc1.4D4028", "avc1.42E01F"]);
/** The canvas a page means: the largest one on it. */
export function pickCanvas(doc = document) {
    let best = null, area = 0;
    for (const c of doc.querySelectorAll("canvas")) { const a = (c.width || 0) * (c.height || 0); if (a > area) { area = a; best = c; } }
    return best;
}

const json = async (url, body) => { const r = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return r.json(); };

/** While a session starts, answer an Apple TV's PIN with a prompt. Returns a stop function. */
export function watchPins(ask = (name) => window.prompt(`Enter the PIN shown on ${name}`)) {
    const seen = new Set(); let on = true;
    (async () => { while (on) { try { const s = await json("/tv/status"); for (const p of s.pins || []) if (!seen.has(p.id)) { seen.add(p.id); const pin = ask(p.name); if (pin) await json("/tv/pin", { id: p.id, pin: String(pin).trim() }); } } catch { /* the bridge will say */ } await new Promise((r) => setTimeout(r, 1000)); } })();
    return () => { on = false; };
}

/** A small list of the TVs tvpipe can see, under `anchor`; resolves to the name picked, or null. */
export async function pickTv(anchor, { audioOption = false } = {}) {
    const d = await json("/tv/devices");   // tvpipe's discovery; not installed, or no SDK, comes back as { ok: false, error } naming how to install it
    if (!d.ok) throw new Error(d.error || "tvpipe could not look for TVs");
    const list = [...(d.devices || []).filter((x) => x.video), { name: "browser", protocols: ["browser"], model: "a player page on this computer" }];
    return new Promise((resolve) => {
        const box = document.createElement("div"), r = anchor.getBoundingClientRect();
        Object.assign(box.style, { position: "fixed", left: Math.max(8, Math.min(window.innerWidth - 248, r.left)) + "px", top: Math.min(window.innerHeight - 40, r.bottom + 6) + "px", width: "240px", zIndex: 99999,
            background: "rgba(10,14,22,0.96)", border: "1px solid #2a3a52", borderRadius: "8px", padding: "6px", font: "12px system-ui, sans-serif", color: "#e8eefc" });
        let cb = null;
        const close = (v) => { box.remove(); removeEventListener("keydown", esc); resolve(v == null ? null : audioOption ? { to: v, audio: !!(cb && cb.checked) } : v); }, esc = (e) => { if (e.key === "Escape") close(null); };
        const head = document.createElement("div"); head.textContent = list.length > 1 ? "Send to which TV?" : "No TVs found -- only this computer's player page:"; head.style.cssText = "padding:4px 6px;color:#8c98ad";
        box.appendChild(head);
        for (const dev of list) {
            const b = document.createElement("button"); b.type = "button";
            b.textContent = `${dev.name}${dev.protocols.length ? "  (" + dev.protocols.join(", ") + (dev.pin && !dev.paired ? ", asks for a PIN" : "") + ")" : ""}`;
            b.style.cssText = "display:block;width:100%;text-align:left;padding:6px;margin:2px 0;background:#141c28;color:inherit;border:1px solid #24304a;border-radius:6px;cursor:pointer";
            b.onclick = () => close(dev.name); box.appendChild(b);
        }
        if (audioOption) { const lab = document.createElement("label"); lab.style.cssText = "display:flex;gap:6px;align-items:center;padding:4px 6px;color:#c8d2e2;cursor:pointer"; cb = document.createElement("input"); cb.type = "checkbox"; lab.appendChild(cb); lab.appendChild(document.createTextNode("with this tab's sound (the browser asks once)")); box.appendChild(lab); }
        const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel"; cancel.style.cssText = "margin-top:4px;padding:4px 8px;background:none;color:#8c98ad;border:none;cursor:pointer"; cancel.onclick = () => close(null);
        box.appendChild(cancel); document.body.appendChild(box); addEventListener("keydown", esc);
    });
}

/** Mirror this page to `to` (tvpipe's own browser renders it). */
export async function sharePage(to, url = location.href) {
    const stop = watchPins();
    try { const r = await json("/tv/share", { to, url }); if (!r.ok) throw new Error(r.error || "the TV did not start"); return r.session; } finally { stop(); }
}

/** Stop everything this bridge sends to a TV, and any live stream from this page. */
export async function stopTv() { if (_live) { _live.stop(); _live = null; } const r = await json("/tv/stop", {}); return r.stopped || []; }

let _live = null;
/** Stream `canvas` live to `to`. Resolves to a controller { stop(), stats() } once the TV is connected. */
export async function startLive(to, { canvas = pickCanvas(), fps = 30, bitrate = 6e6, socketUrl = null, audio = false, audioStream = null } = {}) {
    if (!canvas) throw new Error("this page has no <canvas> to send");
    if (typeof VideoEncoder === "undefined") throw new Error("this browser has no WebCodecs encoder (it needs a secure page: localhost or https)");
    if (_live) _live.stop();
    const { width, height } = liveSize(canvas.width, canvas.height);
    let config = null;
    for (const codec of CODECS) { const c = { codec, width, height, bitrate, framerate: fps, latencyMode: "realtime", avc: { format: "annexb" } }; try { if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break; } } catch { /* next */ } }
    if (!config) throw new Error("this browser cannot encode H.264");
    // SOUND: asked for FIRST, while the click that started this still counts as a user gesture (the browser requires one for getDisplayMedia)
    let audioTrack = null, audioWhy = null;
    if (audio) {
        try {
            const ms = audioStream || await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, preferCurrentTab: true, selfBrowserSurface: "include", systemAudio: "exclude" });
            for (const t of ms.getVideoTracks()) t.stop();   // only the sound is wanted; the picture comes from the canvas
            audioTrack = ms.getAudioTracks()[0] || null;
            if (!audioTrack) audioWhy = "no sound was shared (tick 'share tab audio' in the browser's prompt)";
            else if (typeof MediaStreamTrackProcessor === "undefined") { audioTrack.stop(); audioTrack = null; audioWhy = "this browser cannot read a sound track (no MediaStreamTrackProcessor)"; }
        } catch (e) { audioWhy = "the sound was not shared: " + (e.message || e); }
    }
    const ws = new WebSocket(socketUrl || `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/tv/live`); ws.binaryType = "arraybuffer";
    const stopPins = watchPins();
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("the bridge's /tv/live socket did not open")); });
    const started = new Promise((res, rej) => { ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === "started") res(m.session); else if (m.type === "error") rej(new Error(m.error)); }; ws.onclose = () => rej(new Error("the bridge closed the stream")); });
    ws.send(JSON.stringify({ type: "start", to, width, height, fps, ...(audioTrack ? { audio: AUDIO } : {}) }));
    let session; try { session = await started; } finally { stopPins(); }
    // the frame is drawn into an even-sized canvas of the encoder's size, so any page canvas works
    const scratch = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height }), g = scratch.getContext("2d");
    const st = { audio: !!audioTrack, audioWhy, audioSent: 0, endedWhy: null, frames: 0, sent: 0, keys: 0, skipped: 0, bytes: 0, ended: false, error: null, codec: config.codec, width, height, session };
    let wantKey = true, timer = 0;
    const enc = new VideoEncoder({ output: (chunk) => { const au = new Uint8Array(chunk.byteLength); chunk.copyTo(au); if (ws.readyState === 1) { ws.send(encodeLiveFrame(chunk.type === "key", chunk.timestamp, au)); st.sent++; if (chunk.type === "key") st.keys++; st.bytes += au.byteLength; } }, error: (e) => { st.error = String(e.message || e); stop(); } });
    enc.configure(config);
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === "keyframe") wantKey = true; else if (m.type === "ended" || m.type === "error") { st.error = m.error || null; st.endedWhy = m.why || m.error || null; stop(); } };
    const t0 = performance.now();   // one clock for the frames and the sound
    // the sound: AudioData from the track, mixed to AUDIO (48 kHz stereo s16) and sent with flag 2, timed on the same clock as the frames
    let audioReader = null;
    if (audioTrack) {
        audioReader = new MediaStreamTrackProcessor({ track: audioTrack }).readable.getReader();
        (async () => { while (!st.ended) { const { value: ad, done } = await audioReader.read(); if (done || !ad) break;
            try { const n = ad.numberOfFrames, planes = []; for (let c = 0; c < Math.min(2, ad.numberOfChannels); c++) { const p = new Float32Array(n); ad.copyTo(p, { planeIndex: c, format: "f32-planar" }); planes.push(p); }
                const pcm = toStereoS16(planes, n, ad.sampleRate); if (ws.readyState === 1 && pcm.length) { ws.send(encodeLiveFrame(false, Math.round((performance.now() - t0) * 1000), new Uint8Array(pcm.buffer), true)); st.audioSent++; } } finally { ad.close(); } } })().catch(() => {});
    }
    ws.onclose = () => stop();
    const tick = () => {
        if (st.ended) return;
        if (enc.encodeQueueSize > 2) { st.skipped++; return; }   // realtime: drop a frame rather than fall behind
        g.drawImage(canvas, 0, 0, width, height);
        const frame = new VideoFrame(scratch, { timestamp: Math.round((performance.now() - t0) * 1000) });
        enc.encode(frame, { keyFrame: wantKey || st.frames % (fps * 2) === 0 }); frame.close(); wantKey = false; st.frames++;
    };
    timer = setInterval(tick, 1000 / fps);
    function stop() { if (st.ended) return; st.ended = true; clearInterval(timer); try { if (audioReader) audioReader.cancel(); if (audioTrack) audioTrack.stop(); } catch { /* gone */ } try { enc.close(); } catch { /* closed */ } try { ws.close(); } catch { /* closed */ } if (_live === ctl) _live = null; }
    const ctl = { stop, stats: () => ({ ...st }) };
    _live = ctl; window.__tvLive = ctl;
    return ctl;
}
