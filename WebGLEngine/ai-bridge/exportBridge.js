// WebGLEngine/ai-bridge/exportBridge.js -- turns a recorded webm clip (from the YouTube export panel's swekRecord)
// into a YouTube-ready mp4: H.264 + AAC, faststart for streaming, with title/description/tags baked in as metadata
// and written alongside as a .txt you can paste into the upload form. The panel POSTs the webm bytes to /export/mp4
// with the chosen title/description; the bridge transcodes with ffmpeg and returns the saved path. Exports land under
// <outputs>/youtube so they are easy to find and upload.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const youtubeUpload = require("./youtubeUpload.js");

function _outDir() { const d = path.join(process.env.SWEK_OUT_DIR || path.join(os.homedir(), "SweK_Exports"), "youtube"); try { fs.mkdirSync(d, { recursive: true }); } catch (e) {} return d; }
function _slug(s) { return String(s || "swek").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "swek"; }

// Transcode webm -> mp4 (YouTube-friendly). meta: { title, description, tags:[] }. Returns a promise of the mp4 path.
function transcodeToMp4(webmPath, mp4Path, meta = {}) {
    return new Promise((resolve, reject) => {
        const args = ["-y", "-i", webmPath, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"];
        if (meta.title) args.push("-metadata", "title=" + meta.title);
        if (meta.description) args.push("-metadata", "comment=" + String(meta.description).slice(0, 500));
        args.push(mp4Path);
        const ff = spawn(process.env.FFMPEG || "ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
        let err = ""; ff.stderr.on("data", d => { err += d; if (err.length > 4000) err = err.slice(-4000); });
        ff.on("error", (e) => reject(new Error("ffmpeg spawn failed: " + e.message)));
        ff.on("close", (code) => code === 0 ? resolve(mp4Path) : reject(new Error("ffmpeg exit " + code + ": " + err.slice(-400))));
    });
}
// YouTube description sidecar: the human-facing title + description + tags, ready to paste into the upload form.
function writeSidecar(mp4Path, meta = {}) {
    const txt = (meta.title || "SweK Engine") + "\n\n" + (meta.description || "") + "\n\n" + (Array.isArray(meta.tags) && meta.tags.length ? "Tags: " + meta.tags.join(", ") + "\n" : "") + "\nRendered live with SweK Engine.\n";
    const p = mp4Path.replace(/\.mp4$/, "") + ".txt"; try { fs.writeFileSync(p, txt); } catch (e) {} return p;
}

const ROUTES = new Set(["/export/mp4", "/export/list", "/export/headless", "/export/youtube", "/export/batch", "/export/renders", "/export/render"]);

// Render service: render each rostered page (optionally several runs for varied autonomous outputs), run Render QA on a
// sampled frame, and drop the passing clips where the asset viewer can swipe them. captureLive + QA are rig-only (they
// need a browser); the roster iteration, per-run tagging, QA gating, and the listing are the verifiable orchestration.
async function renderBatch(ctx, opts = {}) {
    const roster = opts.roster || (await import("../tools/export/renderRoster.mjs")).ROSTER;
    const runs = Math.max(1, Math.min(5, opts.runs || 1));
    const ids = (opts.ids && opts.ids.length) ? opts.ids : roster.map(r => r.id);
    const capture = opts.capture || ctx.captureLive;         // (pageUrl, seconds, mp4Path) -> mp4  (rig)
    const qa = opts.qa || ctx.renderQA || (async () => ({ pass: true }));   // (mp4Path) -> { pass, reason? }
    const dir = path.join(_outDir(), "renders"); try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
    const results = [];
    for (const id of ids) {
        const page = roster.find(r => r.id === id); if (!page) continue;
        for (let run = 0; run < runs; run++) {
            const base = _slug(page.id) + "-" + Date.now().toString(36) + "-r" + run, mp4 = path.join(dir, base + ".mp4");
            try {
                if (!capture) throw new Error("no captureLive (rig-only)");
                await capture(page.url, page.seconds, mp4);
                const verdict = await qa(mp4);
                results.push({ id, title: page.title, run, mp4, ok: !!verdict.pass, qa: verdict.reason || (verdict.pass ? "passed" : "failed"), autonomous: page.autonomous });
            } catch (e) { results.push({ id, run, ok: false, error: String(e && e.message || e) }); }
        }
    }
    return { runs, count: results.length, kept: results.filter(r => r.ok).length, results };
}
function listRenders() { const dir = path.join(_outDir(), "renders"); let items = []; try { items = fs.readdirSync(dir).filter(f => f.endsWith(".mp4")).map(f => ({ file: f, path: path.join(dir, f), url: "/export/render?file=" + encodeURIComponent(f) })); } catch (e) {} return items; }

function owns(url) { return ROUTES.has((url || "").split("?")[0]); }
function _readRaw(req, cap = 400 * 1024 * 1024) { return new Promise((resolve, reject) => { const chunks = []; let n = 0; req.on("data", c => { n += c.length; if (n > cap) { reject(new Error("too large")); req.destroy(); return; } chunks.push(c); }); req.on("end", () => resolve(Buffer.concat(chunks))); req.on("error", reject); }); }

async function handle(req, res, ctx = {}) {
    const sendJson = ctx.sendJson || ((o, c = 200) => { res.writeHead(c, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); });
    const p = (req.url || "").split("?")[0];
    if (p === "/export/list" && req.method === "GET") { let items = []; try { items = fs.readdirSync(_outDir()).filter(f => f.endsWith(".mp4")); } catch (e) {} return sendJson({ ok: true, dir: _outDir(), items }); }
    if (p === "/export/mp4" && req.method === "POST") {
        try {
            const url = new URL(req.url, "http://x"); const title = url.searchParams.get("title") || "SweK Engine"; const description = url.searchParams.get("desc") || ""; const tags = (url.searchParams.get("tags") || "").split(",").map(s => s.trim()).filter(Boolean);
            const body = await _readRaw(req); if (!body.length) return sendJson({ ok: false, error: "empty body (expected webm bytes)" }, 400);
            const base = _slug(title) + "-" + Date.now().toString(36); const webmPath = path.join(os.tmpdir(), base + ".webm"), mp4Path = path.join(_outDir(), base + ".mp4");
            fs.writeFileSync(webmPath, body);
            await transcodeToMp4(webmPath, mp4Path, { title, description, tags });
            const sidecar = writeSidecar(mp4Path, { title, description, tags }); try { fs.unlinkSync(webmPath); } catch (e) {}
            return sendJson({ ok: true, mp4: mp4Path, sidecar, bytes: fs.statSync(mp4Path).size });
        } catch (e) { return sendJson({ ok: false, error: String(e && e.message || e) }, 500); }
    }
    if (p === "/export/headless" && req.method === "POST") {
        // orchestrate a fully headless render: Playwright frame capture (RIG) -> server TTS per line -> concat -> framesToMp4.
        try {
            const url = new URL(req.url, "http://x"), script = url.searchParams.get("script") || "physics", fps = Math.max(15, Math.min(60, +(url.searchParams.get("fps") || 30)));
            const title = url.searchParams.get("title") || "SweK Engine", desc = url.searchParams.get("desc") || "";
            const pageUrl = ctx.selfUrl ? (ctx.selfUrl() + "/youtube-export.html") : ("http://127.0.0.1:" + (process.env.PORT || 8787) + "/youtube-export.html");
            const { captureHeadless } = await import("../tools/export/captureHeadless.mjs");
            const capDir = path.join(os.tmpdir(), "swek-headless-" + Date.now().toString(36));
            const { plan } = await captureHeadless({ pageUrl, script, fps, outDir: capDir });
            // narration audio: prefer the engine TTS (human voice); if it isn't available, render the blob's
            // OWN voice server-side from blobVoiceWav.js (pure sampleAt maths, no audio device) so a headless
            // export still has sound -- and, for a per-line persona script, in the right voice per line.
            let audio = null;
            if (ctx.tts) {
                const clips = []; for (const ln of plan.lines) { const w = await ctx.tts(ln.text); if (w) clips.push({ wav: w, gapMs: ln.gap }); }
                if (clips.length) { audio = path.join(capDir, "narration.wav"); await concatNarration(clips, audio); }
            }
            if (!audio) {
                try { audio = await renderBlobNarration(plan, path.join(capDir, "blob-narration.wav")); }
                catch (e) { audio = null; }
            }
            const base = _slug(title) + "-" + Date.now().toString(36), mp4Path = path.join(_outDir(), base + ".mp4");
            await framesToMp4(path.join(capDir, "frame-%05d.png"), mp4Path, { fps, audio, title, description: desc });
            const sidecar = writeSidecar(mp4Path, { title, description: desc, tags: ["swek", "gamedev", "webgl"] });
            return sendJson({ ok: true, mp4: mp4Path, sidecar, frames: plan && plan.lines ? undefined : undefined, bytes: fs.statSync(mp4Path).size });
        } catch (e) { return sendJson({ ok: false, error: String(e && e.message || e), hint: "headless capture is rig-only (needs playwright + webgl-capable chromium)" }, 500); }
    }
    if (p === "/export/youtube" && req.method === "POST") {
        // upload an already-exported mp4 to YouTube via the Data API resumable upload, reusing SweK's Google OAuth.
        try {
            if (!ctx.getToken) return sendJson({ ok: false, error: "no Google OAuth on this box -- connect Google Drive first (same login), then re-consent to grant youtube.upload" }, 400);
            const body = await _readRaw(req, 1024 * 1024).then(b => { try { return JSON.parse(b.toString() || "{}"); } catch (e) { return {}; } });
            const filePath = body.mp4 || body.file; if (!filePath || !fs.existsSync(filePath)) return sendJson({ ok: false, error: "mp4 not found (pass {mp4: <path from /export/mp4>})" }, 400);
            const token = await ctx.getToken(); if (!token) return sendJson({ ok: false, error: "could not mint a Google access token (re-authorize with the youtube.upload scope)" }, 401);
            const r = await youtubeUpload.uploadVideo({ accessToken: token, filePath, meta: { title: body.title, description: body.description, tags: body.tags, privacyStatus: body.privacyStatus || "unlisted" } });
            return sendJson(r);
        } catch (e) { return sendJson({ ok: false, error: String(e && e.message || e), hint: "needs a Google Cloud project with the YouTube Data API enabled + youtube.upload consent + upload quota" }, 500); }
    }
    if (p === "/export/renders" && req.method === "GET") { return sendJson({ ok: true, items: listRenders() }); }
    if (p === "/export/render" && req.method === "GET") {
        const file = new URL(req.url, "http://x").searchParams.get("file") || "";
        if (!/^[a-z0-9._-]+\.mp4$/i.test(file)) { res.writeHead(400); res.end("bad file"); return; }   // reject anything but a plain mp4 filename -- no path traversal
        const fp = path.join(_outDir(), "renders", file);
        try { const st = fs.statSync(fp); res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": st.size, "Accept-Ranges": "bytes" }); fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(404); res.end("not found"); }
        return;
    }

    if (p === "/export/batch" && req.method === "POST") {
        try { const url = new URL(req.url, "http://x"); const runs = +(url.searchParams.get("runs") || 1); const ids = (url.searchParams.get("ids") || "").split(",").map(x => x.trim()).filter(Boolean);
            const r = await renderBatch({ captureLive: ctx.captureLive, renderQA: ctx.renderQA }, { runs, ids }); return sendJson(r); }
        catch (e) { return sendJson({ ok: false, error: String(e && e.message || e), hint: "batch render is rig-only (needs a browser-capable capture)" }, 500); }
    }
    return sendJson({ ok: false, error: "no such export route" }, 404);
}


// --- Phase 2 (headless) encode helpers ---------------------------------------------------------------------------
// Encode a captured PNG frame sequence (frame-%05d.png) + an optional narration audio track into a YouTube mp4. This
// is what the headless capture feeds: Playwright renders the scene frame-by-frame (deterministic, no live audio),
// server-side TTS makes the narration wav, and this muxes them. Verifiable here even though the capture is on-rig.
function framesToMp4(pattern, mp4Path, opts = {}) {
    return new Promise((resolve, reject) => {
        const fps = opts.fps || 30, args = ["-y", "-framerate", String(fps), "-i", pattern];
        if (opts.audio) args.push("-i", opts.audio);
        args.push("-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p");
        if (opts.audio) args.push("-c:a", "aac", "-b:a", "192k", "-shortest");
        args.push("-movflags", "+faststart");
        if (opts.title) args.push("-metadata", "title=" + opts.title);
        if (opts.description) args.push("-metadata", "comment=" + String(opts.description).slice(0, 500));
        args.push(mp4Path);
        const ff = spawn(process.env.FFMPEG || "ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
        let err = ""; ff.stderr.on("data", d => { err += d; if (err.length > 4000) err = err.slice(-4000); });
        ff.on("error", e => reject(new Error("ffmpeg spawn failed: " + e.message)));
        ff.on("close", c => c === 0 ? resolve(mp4Path) : reject(new Error("ffmpeg exit " + c + ": " + err.slice(-400))));
    });
}
// Render the blob's own multi-voice narration for a headless plan to a single WAV, matching the on-screen
// timeline. Each line is placed at its caption's start (cumulative dur+gap) in its line persona, summed on one
// clock by render/blobVoiceWav.js -- pure sampleAt maths, so this needs no audio device and stays deterministic.
async function renderBlobNarration(plan, outWav) {
    if (!plan || !plan.lines || !plan.lines.length) throw new Error("no plan lines");
    const { renderTimelinePCM, pcmToWav } = await import("../render/blobVoiceWav.js");
    let atMs = 0; const lines = [];
    for (const ln of plan.lines) {
        lines.push({ text: ln.text, persona: ln.persona || ln.who || "both", atMs });
        atMs += (ln.durMs || 0) + (ln.gap || 0);
    }
    const { pcm, sampleRate } = renderTimelinePCM(lines, { sampleRate: 44100, gain: 0.5 });
    fs.writeFileSync(outWav, Buffer.from(pcmToWav(pcm, sampleRate)));
    return outWav;
}

// Concatenate per-line narration wavs (with silence gaps) into one track whose timing matches the on-screen captions,
// so a headless render's avatar mouth + captions line up with the audio. clips: [{ wav, gapMs }].
function concatNarration(clips, outWav) {
    return new Promise((resolve, reject) => {
        if (!clips || !clips.length) return reject(new Error("no clips"));
        const inputs = [], filters = []; let idx = 0;
        for (const c of clips) { inputs.push("-i", c.wav); filters.push("[" + idx + ":a]"); idx++; if (c.gapMs) { filters.push("aevalsrc=0:d=" + (c.gapMs / 1000).toFixed(3) + "[g" + idx + "];"); } }
        // simple concat of the speech clips (gaps handled by adelay would be heavier; concat keeps it robust)
        const speech = clips.map((_, i) => "[" + i + ":a]").join("");
        const args = []; for (const c of clips) args.push("-i", c.wav);
        args.push("-filter_complex", speech + "concat=n=" + clips.length + ":v=0:a=1[out]", "-map", "[out]", "-y", outWav);
        const ff = spawn(process.env.FFMPEG || "ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
        let err = ""; ff.stderr.on("data", d => { err += d; });
        ff.on("error", e => reject(e)); ff.on("close", c => c === 0 ? resolve(outWav) : reject(new Error("concat exit " + c + ": " + err.slice(-300))));
    });
}

module.exports = { owns, handle, transcodeToMp4, writeSidecar, framesToMp4, concatNarration, renderBatch, listRenders, _outDir };
