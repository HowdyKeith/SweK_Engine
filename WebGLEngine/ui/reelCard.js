// WebGLEngine/ui/reelCard.js -- a "make it look like a video" overlay for demo capture. swekRecord grabs the canvas
// pixels only, so a title card or lower-third drawn in the DOM would never appear in that clip. This records the whole
// TAB (via getDisplayMedia) so the intro card and captions are baked in, and gives a clean one-click -> downloadable
// .webm. Opt-in: a page calls startReel({...}) behind ?reel, nothing changes for normal viewing.
//
// Pieces: a fade-in title card that holds a couple seconds then clears; rotating lower-third captions along the
// bottom; and a REC button that captures the tab to webm (falling back to window.swekRecord's canvas capture if the
// browser has no getDisplayMedia). All DOM/CSS -- no canvas hooks, no per-page render changes, works over anything.
"use strict";

function el(tag, css, txt) { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }

export function startReel(opts = {}) {
    if (typeof document === "undefined") return;
    const title = opts.title || "SweK Engine", subtitle = opts.subtitle || "", captions = opts.captions || [];
    const AMBER = "#f6a623", CYAN = "#59d1ff";
    const layer = el("div", "position:fixed;inset:0;z-index:99999;pointer-events:none;font:600 16px ui-monospace,Menlo,monospace;");
    document.body.appendChild(layer);

    // --- intro title card: fade in, hold, clear ---
    const card = el("div", "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 45%,rgba(6,10,20,.55),rgba(2,4,9,.92));opacity:0;transition:opacity .5s ease;");
    const t1 = el("div", `color:${AMBER};font-size:min(9vw,64px);letter-spacing:.18em;text-transform:uppercase;text-shadow:0 0 24px ${AMBER}66;`, title);
    const t2 = el("div", `color:${CYAN};font-size:min(4vw,22px);letter-spacing:.35em;text-transform:uppercase;margin-top:14px;opacity:.9;`, subtitle);
    const rule = el("div", `width:min(60vw,420px);height:2px;margin-top:20px;background:linear-gradient(90deg,transparent,${AMBER},transparent);`);
    card.append(t1, t2, rule); layer.appendChild(card);
    requestAnimationFrame(() => { card.style.opacity = "1"; });
    setTimeout(() => { card.style.opacity = "0"; setTimeout(() => card.remove(), 600); }, opts.cardMs || 2800);

    // --- narration: if a spoken script is given, the SweK avatar reads it aloud (captions come from the narrator);
    // otherwise fall back to silent rotating lower-thirds. ---
    if (opts.narrate && opts.narrate.length) {
        import("./narrator.js").then(({ startNarration }) => startNarration(opts.narrate, { delay: (opts.cardMs || 2800) + 400, rate: opts.rate, voiceName: opts.voiceName })).catch(e => console.warn("[reel] narrator: " + (e && e.message || e)));
    } else if (captions.length) {
        const lt = el("div", `position:absolute;left:5%;bottom:7%;padding:10px 16px;background:rgba(4,8,16,.62);border-left:3px solid ${CYAN};border-radius:4px;color:#eaf3ff;opacity:0;transition:opacity .4s ease;max-width:80vw;`);
        layer.appendChild(lt); let i = 0;
        const show = () => { lt.textContent = captions[i % captions.length]; lt.style.opacity = "1"; setTimeout(() => { lt.style.opacity = "0"; }, (opts.captionMs || 3600) - 500); i++; };
        setTimeout(() => { show(); setInterval(show, opts.captionMs || 3600); }, (opts.cardMs || 2800) + 400);
    }

    // --- REC button + timer (the only interactive bit) ---
    const bar = el("div", "position:absolute;right:16px;top:14px;display:flex;align-items:center;gap:10px;pointer-events:auto;");
    const dot = el("div", `width:12px;height:12px;border-radius:50%;background:#ff5d6c;box-shadow:0 0 10px #ff5d6c;opacity:.25;`);
    const clock = el("div", "color:#dbe7ff;font-size:13px;min-width:44px;", "0:00");
    const btn = el("div", `pointer-events:auto;cursor:pointer;color:${CYAN};border:1px solid ${CYAN};border-radius:8px;padding:6px 12px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;background:rgba(8,14,26,.7);`, "Record tab");
    bar.append(dot, clock, btn); layer.appendChild(bar);

    let rec = null, t0 = 0, tick = null;
    function fmt(s) { s = Math.floor(s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
    async function toggle() {
        if (rec) { rec.stop(); return; }
        let stream;
        try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60 }, audio: false }); }
        catch (e) {
            if (window.swekRecord) { window.swekRecord.start(opts.seconds || 0); dot.style.opacity = "1"; btn.textContent = "Canvas rec"; return; }
            console.warn("[reel] no screen capture; " + (e && e.message || e)); return;
        }
        const chunks = [], mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm" });
        mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        mr.onstop = () => { const url = URL.createObjectURL(new Blob(chunks, { type: "video/webm" })); const a = el("a"); a.href = url; a.download = (opts.file || "swek-box3d") + ".webm"; a.click(); stream.getTracks().forEach(t => t.stop()); rec = null; clearInterval(tick); dot.style.opacity = ".25"; btn.textContent = "Record tab"; clock.textContent = "0:00"; };
        stream.getVideoTracks()[0].addEventListener("ended", () => { if (rec) rec.stop(); });   // user hit browser "Stop sharing"
        mr.start(); rec = mr; t0 = performance.now(); dot.style.opacity = "1"; btn.textContent = "Stop";
        tick = setInterval(() => { clock.textContent = fmt((performance.now() - t0) / 1000); }, 250);
        if (opts.seconds > 0) setTimeout(() => { if (rec) rec.stop(); }, opts.seconds * 1000);
    }
    btn.addEventListener("click", toggle);
    return { stop: () => rec && rec.stop() };
}

if (typeof module !== "undefined" && module.exports) module.exports = { startReel };
