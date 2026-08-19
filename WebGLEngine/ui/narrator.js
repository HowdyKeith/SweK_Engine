// WebGLEngine/ui/narrator.js -- the SweK avatar narrates a demo out loud, so nobody has to hold a mic. A small corner
// box shows the avatar (the amber core + cyan rings from gauges3000, in portable Canvas2D), it speaks each scripted
// line via the browser's Speech Synthesis voice, pulses a waveform while it talks, and shows the matching caption.
// It advances on each utterance's end, so the captions stay in lockstep with the voice. No TTS in the browser? It
// falls back to timed captions so the on-screen read still works (just silent). All DOM/Canvas2D, no deps.
//
// Capturing the VOICE into a recording: getDisplayMedia records the tab's video; to also catch the spoken audio,
// tick "share tab/system audio" in the browser's capture prompt (or record with OBS and system audio). The avatar
// and captions are on-screen either way.
"use strict";

function el(tag, css, txt) { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }

export function startNarration(lines, opts = {}) {
    if (typeof document === "undefined" || !Array.isArray(lines) || !lines.length) return { start() {}, stop() {} };
    const AMBER = "#f6a623", CYAN = "#59d1ff";
    const box = el("div", "position:fixed;left:4%;bottom:6%;z-index:100000;width:min(340px,42vw);background:rgba(4,8,16,.72);border:1px solid #16233c;border-left:3px solid " + AMBER + ";border-radius:10px;padding:10px;display:flex;gap:11px;align-items:center;font:600 13px ui-monospace,Menlo,monospace;backdrop-filter:blur(3px);");
    const cv = el("canvas", "width:64px;height:64px;flex:0 0 64px;"); cv.width = 128; cv.height = 128;
    const txtWrap = el("div", "min-width:0;flex:1;");
    const who = el("div", "color:" + AMBER + ";font-size:10px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:3px;", "SweK \u00b7 ship's computer");
    const cap = el("div", "color:#eaf3ff;line-height:1.35;font-weight:600;", "");
    txtWrap.append(who, cap); box.append(cv, txtWrap); document.body.appendChild(box);

    const ctx = cv.getContext("2d"); let speaking = false, T = 0, amp = 0;
    function draw() {
        T += 0.05; amp += ((speaking ? 1 : 0) - amp) * 0.15;
        ctx.clearRect(0, 0, 128, 128); const cx = 64, cy = 64;
        for (let r = 0; r < 3; r++) { ctx.strokeStyle = "rgba(89,209,255," + (0.16 + 0.05 * Math.sin(T + r)) + ")"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 30 + r * 8 + Math.sin(T * 1.3 + r) * 1.5, 0, 6.283); ctx.stroke(); }
        const core = 16 + amp * 3 * (1 + 0.4 * Math.sin(T * 6)); const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, core + 8);
        g.addColorStop(0, "#fff2d6"); g.addColorStop(0.4, AMBER); g.addColorStop(1, "rgba(246,166,35,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, core + 8, 0, 6.283); ctx.fill();
        // speaking waveform across the core
        if (amp > 0.02) { ctx.strokeStyle = "rgba(255,242,214," + amp + ")"; ctx.lineWidth = 2; ctx.beginPath(); for (let x = -18; x <= 18; x += 3) { const y = Math.sin(x * 0.5 + T * 8) * 6 * amp * (0.5 + 0.5 * Math.sin(x + T * 5)); (x === -18 ? ctx.moveTo : ctx.lineTo).call(ctx, cx + x, cy + y); } ctx.stroke(); }
        requestAnimationFrame(draw);
    }
    draw();

    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    function pickVoice() { if (!synth) return null; const vs = synth.getVoices() || []; if (opts.voiceName) { const m = vs.find(v => v.name === opts.voiceName); if (m) return m; } return vs.find(v => /^en/i.test(v.lang) && /(Google|Samantha|Daniel|Microsoft|Natural)/i.test(v.name)) || vs.find(v => /^en/i.test(v.lang)) || vs[0] || null; }
    let stopped = false;
    function speak(i) {
        if (stopped) return;
        if (i >= lines.length) { cap.textContent = opts.endText || ""; speaking = false; if (opts.onDone) opts.onDone(); return; }
        const line = typeof lines[i] === "string" ? { text: lines[i] } : lines[i]; cap.textContent = line.text;
        if (opts.onLine) { try { opts.onLine(i, line); } catch (e) {} }   // lets callers sync visuals to what's being said
        if (synth && typeof SpeechSynthesisUtterance !== "undefined") {
            const u = new SpeechSynthesisUtterance(line.text); u.rate = opts.rate || 0.98; u.pitch = opts.pitch != null ? opts.pitch : 1; const v = pickVoice(); if (v) u.voice = v;
            u.onstart = () => { speaking = true; }; u.onend = () => { speaking = false; setTimeout(() => speak(i + 1), line.gap || 350); };
            u.onerror = () => { speaking = false; setTimeout(() => speak(i + 1), line.ms || 3200); };
            synth.speak(u);
        } else { speaking = true; setTimeout(() => { speaking = false; speak(i + 1); }, line.ms || 3200); }   // silent fallback
    }
    function begin() { if (synth && !synth.getVoices().length) { synth.onvoiceschanged = () => { synth.onvoiceschanged = null; speak(0); }; setTimeout(() => speak(0), 700); } else speak(0); }
    const startAt = opts.delay != null ? opts.delay : 2900;
    if (opts.autostart !== false) setTimeout(begin, startAt);
    return { start: begin, stop: () => { stopped = true; if (synth) synth.cancel(); box.remove(); } };
}

if (typeof module !== "undefined" && module.exports) module.exports = { startNarration };
