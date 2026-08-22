// FILE: ai-bridge/meshyBridge.js
// v1349 — Meshy 6 cloud connector: image -> textured 3D GLB via Meshy's OpenAPI v1.
// Runs entirely server-side over HTTPS — no local GPU, which makes it a good
// offload path for the GTX 1070/1080 rig. Flow: POST a create task with the
// source image as a base64 data URI, poll the task until SUCCEEDED, then
// download model_urls.glb. The caller ingests the GLB into the asset library.
//
// API (https://docs.meshy.ai/en/api/image-to-3d):
//   POST /openapi/v1/image-to-3d      { image_url, ai_model, target_formats }  -> { result: <taskId> }
//   GET  /openapi/v1/image-to-3d/:id  -> { status, progress, model_urls:{glb}, task_error }
//   Auth: Authorization: Bearer <key>
const fs    = require("fs");
const path  = require("path");
const https = require("https");

const CFG = path.join(__dirname, "meshy.json");
const API = "https://api.meshy.ai/openapi/v1";

function _cfg()    { try { return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch { return {}; } }
function _save(c)  { try { fs.writeFileSync(CFG, JSON.stringify(c, null, 2)); } catch {} }
function getKey()  { return String(process.env.MESHY_API_KEY || _cfg().key || "").trim(); }
function setKey(k) { const c = _cfg(); c.key = String(k || "").trim(); _save(c); return { ok: true, set: !!c.key }; }
function keyStatus(){ const k = getKey(); return { set: !!k, len: k.length, tail: k ? k.slice(-4) : "" }; }

function _req(method, url, body, cb) {
    let u; try { u = new URL(url); } catch (e) { return cb(e); }
    const key = getKey();
    if (!key) return cb(new Error("no Meshy API key set"));
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const opts = { method, hostname: u.hostname, path: u.pathname + u.search,
        headers: { "Authorization": "Bearer " + key, "Accept": "application/json" } };
    if (data) { opts.headers["Content-Type"] = "application/json"; opts.headers["Content-Length"] = data.length; }
    const req = https.request(opts, (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            let j = null; try { j = raw ? JSON.parse(raw) : null; } catch {}
            if (res.statusCode >= 400) return cb(new Error("HTTP " + res.statusCode + (j && j.message ? " " + j.message : (raw ? " " + raw.slice(0, 160) : ""))));
            cb(null, j);
        });
    });
    req.on("error", cb);
    if (data) req.write(data);
    req.end();
}

function _download(url, cb) {
    let u; try { u = new URL(url); } catch (e) { return cb(e); }
    https.get(u, (res) => {
        if (res.statusCode >= 400) { res.resume(); return cb(new Error("download HTTP " + res.statusCode)); }
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
    }).on("error", cb);
}

// imageDataUri: "data:image/png;base64,...". opts: { model, polycount, texture, onProgress }
// cb(errString | null, glbBuffer)
function imageToMesh(imageDataUri, opts, cb) {
    opts = opts || {};
    const body = {
        image_url:      imageDataUri,
        ai_model:       opts.model || "meshy-6",
        target_formats: ["glb"],
        should_texture: opts.texture !== false,
        topology:       "triangle",
    };
    if (opts.polycount) body.target_polycount = opts.polycount | 0;
    _req("POST", API + "/image-to-3d", body, (err, j) => {
        if (err) return cb(err.message || String(err));
        const id = j && j.result;
        if (!id) return cb("Meshy create returned no task id");
        const start = Date.now(), MAX = 12 * 60 * 1000;   // 12 min ceiling
        (function poll() {
            _req("GET", API + "/image-to-3d/" + id, null, (e2, t) => {
                if (e2) return cb(e2.message || String(e2));
                const st = t && t.status;
                if (typeof opts.onProgress === "function") { try { opts.onProgress(t && t.progress || 0, st); } catch {} }
                if (st === "SUCCEEDED") {
                    const glb = t.model_urls && t.model_urls.glb;
                    if (!glb) return cb("Meshy succeeded but returned no GLB url");
                    return _download(glb, (e3, buf) => e3 ? cb(e3.message || String(e3)) : cb(null, buf));
                }
                if (st === "FAILED" || st === "CANCELED") return cb("Meshy task " + st + (t.task_error && t.task_error.message ? ": " + t.task_error.message : ""));
                if (Date.now() - start > MAX) return cb("Meshy task timed out (last status " + st + ")");
                setTimeout(poll, 5000);
            });
        })();
    });
}

module.exports = { getKey, setKey, keyStatus, imageToMesh };
