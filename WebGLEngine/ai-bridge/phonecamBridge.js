// FILE: ai-bridge/phonecamBridge.js
//
// v1404 — pull an Android phone's camera into the engine. Point it at the "IP Webcam"
// app (free, Android), which serves an MJPEG stream + JPEG snapshots over the LAN:
//   stream:   http://PHONE_IP:8080/video
//   snapshot: http://PHONE_IP:8080/shot.jpg
// Set the base URL once (POST /phonecam/config { url:"http://192.168.50.123:8080" }),
// then the engine uses /phonecam/stream (MJPEG in an <img>) or /phonecam/snapshot.
// This proxies through the bridge so the page can show it without CORS/secure-context
// issues. Off until a URL is set; nothing auto-connects.

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const CFG = path.join(__dirname, "phonecam.json");

function getConfig() { try { return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch { return { url: "" }; } }
function setConfig(patch) {
  const c = Object.assign(getConfig(), patch || {});
  try { fs.writeFileSync(CFG, JSON.stringify(c)); } catch {}
  return c;
}
function _base() { return String(getConfig().url || "").trim().replace(/\/+$/, ""); }
function _client(u) { return u.startsWith("https:") ? https : http; }

// Proxy a path under the phone's base URL straight to the response (works for both a
// single JPEG and a continuous MJPEG stream — we just pipe the upstream body through).
function _proxy(suffix, res) {
  const base = _base();
  if (!base) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: false, error: "no phonecam url set (POST /phonecam/config { url })" })); }
  const url = base + suffix;
  let done = false;
  const upReq = _client(url).get(url, (up) => {
    res.writeHead(up.statusCode || 200, { "Content-Type": up.headers["content-type"] || "application/octet-stream", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
    up.pipe(res);
    up.on("error", () => { try { res.end(); } catch {} });
  });
  upReq.on("error", (e) => { if (done) return; done = true; try { res.writeHead(502, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: false, error: String(e && e.message || e), tried: url })); } catch {} });
  upReq.setTimeout(20000, () => { try { upReq.destroy(); } catch {} });
  res.on("close", () => { try { upReq.destroy(); } catch {} });   // stop pulling if the client leaves
}

function snapshot(res) { _proxy("/shot.jpg", res); }
function stream(res)   { _proxy("/video", res); }
function status()      { const u = getConfig().url || ""; return { ok: true, url: u, configured: !!_base(), snapshot: "/phonecam/snapshot", stream: "/phonecam/stream" }; }

module.exports = { getConfig, setConfig, snapshot, stream, status };
