#!/usr/bin/env python3
# KPopDashboard_web.py — v753 — web-served fallback dashboard.
#
# Use when Tkinter isn't available (some Linux installs without
# python3-tk, some Homebrew Python installs on Mac without python-tk).
# Pure stdlib — only requires Python 3.7+.
#
# Run standalone:
#   python3 KPopDashboard_web.py [--port 8788]
#
# Or auto-launched alongside the listener:
#   python3 KPopListener.py --web-dashboard
#
# Then visit http://localhost:8788/ in your browser. The page polls
# /status (KPopStatus.json) and /probe (engine bridge detection)
# every 1s. No external libs needed; no compilation; works on Mac/Win/Linux.

import argparse
import json
import os
import socket
import sys
import tempfile
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

_TMP_ROOT   = os.environ.get("TEMP") or os.environ.get("TMP") or tempfile.gettempdir()
TEMP_DIR    = os.path.join(_TMP_ROOT, "KPopListener")
STATUS_FILE = os.path.join(_TMP_ROOT, "KPopStatus.json")
EVENTS_LOG  = os.path.join(TEMP_DIR, "events.log")
BRIDGE_PORT = int(os.environ.get("KPOP_BRIDGE_PORT", "8787"))
DASH_VERSION = "py-webdash-1.0 (v753)"


HTML = """<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<title>KPopListener Dashboard (web)</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #f3f3f5; margin: 0; padding: 14px; }
  .card { background: #fff; border: 1px solid #d4d4d8; border-radius: 8px; padding: 14px; margin-bottom: 12px; }
  h1 { font-size: 16px; margin: 0 0 12px; color: #2a3a4a; }
  .row { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
  .stat { font-size: 13px; color: #2a3a4a; }
  .stat b { color: #1a2a3a; }
  .ok { color: #16a34a; font-weight: 700; }
  .bad { color: #dc2626; font-weight: 700; }
  .dim { color: #888; font-size: 11px; }
  button { padding: 7px 12px; border-radius: 6px; border: 1px solid #94a3b8; background: #f8fafc; cursor: pointer; font-size: 12px; font-weight: 600; color: #1a2a3a; }
  button:hover { background: #e2e8f0; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  button.danger { border-color: #ef4444; color: #b91c1c; }
  .grid4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px; }
  pre.log { background: #101018; color: #9f9; padding: 10px; border-radius: 6px; overflow-x: auto; max-height: 280px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; line-height: 1.4; margin: 0; white-space: pre-wrap; }
  .modal-bg { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 99; }
  .modal { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); background: #fff; padding: 20px; border-radius: 10px; max-width: 600px; width: 88vw; max-height: 80vh; overflow-y: auto; z-index: 100; box-shadow: 0 10px 40px rgba(0,0,0,0.4); }
  .modal h2 { margin: 0 0 12px; font-size: 15px; }
  .modal pre { background: #f5f5f7; padding: 10px; border-radius: 4px; font-size: 11px; overflow-x: auto; }
  .modal .close { float: right; cursor: pointer; font-size: 18px; color: #888; padding: 0 6px; }
</style>
</head><body>

<div class="card">
  <h1>KPopListener Dashboard <span class="dim" id="dashVer"></span></h1>
  <div class="row" style="gap:24px;">
    <span class="stat">Status: <b id="statusVal">…</b></span>
    <span class="stat">Uptime: <b id="uptimeVal">--:--:--</b></span>
    <span class="stat">Toasts: <b id="toastsVal">0</b></span>
    <span class="stat" id="discordChip" style="margin-left:auto;"></span>
  </div>
  <div class="row" style="margin-top:10px;">
    <button onclick="refresh()">Refresh</button>
    <button onclick="testDiscord()">Test Discord</button>
    <button onclick="showHelp('discord')">? Discord setup</button>
    <button onclick="showHelp('mqtt')">? MQTT setup</button>
  </div>
</div>

<div class="card">
  <div class="row" style="justify-content: space-between;">
    <span class="stat">Engine: <span id="engineVal" class="dim">detecting…</span></span>
    <button onclick="probeEngine()">🔄 Refresh</button>
  </div>
  <div class="grid4" id="qlGrid" style="margin-top:10px;"></div>
  <div class="dim" style="margin-top:8px;">Buttons disable when the engine bridge isn't reachable. Status updates every 2s.</div>
</div>

<div class="card">
  <h1>Events log</h1>
  <pre class="log" id="logBox">(waiting for events...)</pre>
</div>

<div class="modal-bg" id="modalBg" onclick="hideModal()"></div>
<div class="modal" id="modal" style="display:none;">
  <span class="close" onclick="hideModal()">×</span>
  <h2 id="modalTitle"></h2>
  <div id="modalBody"></div>
</div>

<script>
"use strict";
const BRIDGE_PORT = __BRIDGE_PORT__;
const QL = [
  ["🌐 Open Engine",   "/index.html"],
  ["📱 Phone Control", "/control.html"],
  ["🧊 Voxel Viewer",  "/voxel-viewer.html"],
  ["📺 TV Remote",     "/control.html#tab-shield"],
  ["🐛 Debug Console", "/debug.html"],
  ["♟ RPS Multi",      "/rps.html"],
  ["📊 Benchmark",     "/benchmark.html"],
];
const grid = document.getElementById("qlGrid");
const buttons = [];
for (const [label, path] of QL) {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = () => window.open(`http://localhost:${BRIDGE_PORT}${path}`, "_blank");
  b.disabled = true;
  grid.appendChild(b);
  buttons.push(b);
}
document.getElementById("dashVer").textContent = "__VERSION__";

async function refresh() {
  try {
    const r = await fetch("/status");
    if (!r.ok) throw new Error("status fetch failed");
    const j = await r.json();
    document.getElementById("statusVal").textContent = j.Status || "unknown";
    document.getElementById("uptimeVal").textContent = j.Uptime || "--:--:--";
    document.getElementById("toastsVal").textContent = j.TotalToasts || 0;
    const dc = document.getElementById("discordChip");
    dc.textContent = j.DiscordConfigured ? "Discord ✓ configured" : "Discord ✗ not set";
    dc.className = j.DiscordConfigured ? "stat ok" : "stat dim";
  } catch (e) {
    document.getElementById("statusVal").textContent = "listener offline";
    document.getElementById("statusVal").className = "bad";
  }
}
async function probeEngine() {
  try {
    const r = await fetch("/probe");
    const j = await r.json();
    const el = document.getElementById("engineVal");
    if (j.online) {
      el.textContent = `✓ detected at http://localhost:${BRIDGE_PORT}`;
      el.className = "ok";
      buttons.forEach(b => b.disabled = false);
    } else {
      el.textContent = `✗ offline — start the bridge (port ${BRIDGE_PORT}) to enable these buttons`;
      el.className = "bad";
      buttons.forEach(b => b.disabled = true);
    }
  } catch (e) { /* ignore */ }
}
async function pollLog() {
  try {
    const r = await fetch("/events");
    if (!r.ok) return;
    const text = await r.text();
    if (text) document.getElementById("logBox").textContent = text;
  } catch (e) { /* ignore */ }
}
async function testDiscord() {
  try {
    const r = await fetch("/test-discord", { method: "POST" });
    const j = await r.json();
    alert((j.ok ? "✓ Discord test posted" : "✗ Discord test failed") + (j.detail ? "\\n" + j.detail : ""));
  } catch (e) { alert("Test failed: " + e.message); }
}
function showModal(title, body) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = body;
  document.getElementById("modalBg").style.display = "block";
  document.getElementById("modal").style.display = "block";
}
function hideModal() {
  document.getElementById("modalBg").style.display = "none";
  document.getElementById("modal").style.display = "none";
}
function showHelp(which) {
  if (which === "discord") {
    showModal("Set up Discord for KPopListener", `
      <p>Discord integration posts events to a Discord channel via a webhook URL. Works STANDALONE — no engine required.</p>
      <p><b>1.</b> In Discord: <i>Server Settings → Integrations → Webhooks → New Webhook</i>. Pick the channel. Copy the URL.</p>
      <p><b>2.</b> Tell the listener about it (two options):</p>
      <pre>export KPOP_DISCORD_WEBHOOK="https://discord.com/api/webhooks/..."

# OR (persistent):
echo "https://discord.com/api/webhooks/..." > ~/.kpop_discord_webhook
chmod 600 ~/.kpop_discord_webhook</pre>
      <p><b>3.</b> Restart the listener (or click "Test Discord" to verify).</p>
      <p><b>Notes:</b> Don't share the URL. On engine-attached mode, the engine bridge can also POST to <code>/discord/post</code> for structured stat embeds.</p>
    `);
  } else if (which === "mqtt") {
    showModal("Set up MQTT for KPopListener", `
      <p>MQTT is enabled at LISTENER STARTUP, not from the dashboard. The listener has to know the broker before it boots so it can subscribe.</p>
      <p><b>To enable MQTT:</b></p>
      <p>1. Stop the running listener (close its window or Ctrl+C).</p>
      <p>2. Re-launch with these arguments:</p>
      <pre>python3 KPopListener.py --enable-mqtt --mqtt-broker homeassistant.local --mqtt-port 1883 --mqtt-sub-topic kpop/in</pre>
      <p>3. Once it's running, the listener will subscribe to the topic and process toast events from any MQTT publisher (Home Assistant, Node-RED, etc.).</p>
      <p><b>Requires:</b> <code>pip install paho-mqtt</code></p>
    `);
  }
}

refresh(); probeEngine(); pollLog();
setInterval(refresh, 2000);
setInterval(probeEngine, 2000);
setInterval(pollLog, 1500);
</script>
</body></html>
"""


def _discord_webhook_url():
    url = os.environ.get("KPOP_DISCORD_WEBHOOK", "").strip()
    if url: return url
    home = os.path.expanduser("~")
    cred = os.path.join(home, ".kpop_discord_webhook")
    try:
        if os.path.isfile(cred):
            with open(cred, "r", encoding="utf-8") as f:
                v = f.read().strip()
                if v.startswith("https://"): return v
    except Exception:
        pass
    return None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args, **kwargs): pass   # silence stdout

    def _json(self, payload, code=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            html = HTML.replace("__BRIDGE_PORT__", str(BRIDGE_PORT)).replace("__VERSION__", DASH_VERSION)
            html_bytes = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html_bytes)))
            self.end_headers()
            self.wfile.write(html_bytes)
            return
        if self.path == "/status":
            try:
                with open(STATUS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                # Ensure DiscordConfigured is present even if old listener
                if "DiscordConfigured" not in data:
                    data["DiscordConfigured"] = bool(_discord_webhook_url())
                self._json(data)
            except Exception:
                self._json({"Status": "listener offline", "Uptime": "--:--:--", "TotalToasts": 0,
                            "DiscordConfigured": bool(_discord_webhook_url())})
            return
        if self.path == "/probe":
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(0.15)
                ok = s.connect_ex(("127.0.0.1", BRIDGE_PORT)) == 0
                s.close()
                self._json({"online": ok})
            except Exception:
                self._json({"online": False})
            return
        if self.path == "/events":
            try:
                with open(EVENTS_LOG, "r", encoding="utf-8", errors="replace") as f:
                    lines = f.readlines()[-200:]
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                self.wfile.write("".join(lines).encode("utf-8"))
            except Exception:
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.end_headers()
                self.wfile.write(b"(no events yet)")
            return
        self.send_response(404); self.end_headers()

    def do_POST(self):
        if self.path == "/test-discord":
            url = _discord_webhook_url()
            if not url:
                self._json({"ok": False, "detail": "no webhook configured"})
                return
            import urllib.request
            try:
                payload = json.dumps({"content": "🔵 **KPopListener test** — Discord webhook verified from web dashboard"}).encode()
                req = urllib.request.Request(url, data=payload,
                                              headers={"Content-Type": "application/json"},
                                              method="POST")
                with urllib.request.urlopen(req, timeout=5) as resp:
                    ok = 200 <= resp.status < 300
                self._json({"ok": ok, "detail": f"HTTP {resp.status}"})
            except Exception as e:
                self._json({"ok": False, "detail": str(e)})
            return
        self.send_response(404); self.end_headers()


def main():
    ap = argparse.ArgumentParser(description="KPopListener web dashboard (Tkinter fallback)")
    ap.add_argument("--port", type=int, default=8788)
    ap.add_argument("--no-open", action="store_true", help="don't open browser")
    args = ap.parse_args()

    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    url = f"http://localhost:{args.port}/"
    print(f"[web-dashboard] serving at {url}")
    print(f"[web-dashboard] polls KPopStatus.json + TCP probe on :{BRIDGE_PORT}")
    if not args.no_open:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n[web-dashboard] stopping")
        srv.shutdown()


if __name__ == "__main__":
    main()
