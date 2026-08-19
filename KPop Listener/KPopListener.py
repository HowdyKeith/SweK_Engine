#!/usr/bin/env python3
# KPopListener.py — Python listener (v751, cross-platform: Windows/macOS/Linux).
# Re-synced with the PowerShell version for feature parity.
#
# v1.2 (v26-sync) changes vs v751:
#   * v985 parity: --launch-clipsaver starts KPopupClipSaver.ps1 alongside the
#     listener (Windows only; --clipsaver-folder maps to -BaseFolder)
#   * v986 parity: speech offload — one owned synth + FIFO worker queue, so
#     callers never block on TTS (was already non-blocking; now a clean worker)
#
# v751 changes vs v1.0:
#   * macOS toast backend via osascript (no extra deps)
#   * Linux toast backend via notify-send (libnotify-bin)
#   * Cross-platform IPC: Windows named pipe; macOS/Linux Unix socket
#   * Pipe name matches the bridge: \\.\pipe\KPopListenerPipe (no PID)
#     so /kpop/toast POSTs from the engine bridge land correctly.
#     Mac/Linux: /tmp/KPopListenerPipe.sock
#   * Discord webhook integration (read from env KPOP_DISCORD_WEBHOOK or
#     a credential file at ~/.kpop_discord_webhook). Standalone-safe.
#   * --launch-bridge spawns the Node.js bridge alongside the listener
#     so you can boot the whole stack with one command on either OS.
#
# Same JSON wire as before: {"Title": "...", "Message": "...", "ToastType":
# "info|success|warn|error|system", "Duration": <ms>}. Lowercase keys are
# also accepted (title/msg/message/text/type).
#
# Deps (all optional; install what you want):
#   pip install windows-toasts      # real Windows toasts
#   pip install pywin32             # named-pipe ingestion on Windows
#   pip install websockets          # --enable-websocket
#   pip install paho-mqtt           # --enable-mqtt
#   pip install pyttsx3             # speak the optional "Text" field
#   pip install requests            # Discord webhook (also urllib OK)
#
# Run:  python3 KPopListener.py
# Or:   python3 KPopListener.py --launch-bridge --bridge-path /path/to/WebGLEngine/ai-bridge

import argparse, glob, json, os, platform, queue, socket, subprocess, sys, tempfile, threading, time
from datetime import datetime

IS_WINDOWS = sys.platform == "win32"
IS_MAC     = sys.platform == "darwin"
IS_LINUX   = sys.platform.startswith("linux")

APP_ID      = "KPop.Pop"
APP_DISPLAY = "KPop Pop!"
VERSION     = "py-1.2 (v26-sync — clipsaver launch + speech offload worker)"

_TMP_ROOT   = os.environ.get("TEMP") or os.environ.get("TMP") or tempfile.gettempdir()
TEMP_DIR    = os.path.join(_TMP_ROOT, "KPopListener")
os.makedirs(TEMP_DIR, exist_ok=True)
PID_FILE    = os.path.join(TEMP_DIR, "KPopListener.pid")
STATUS_FILE = os.path.join(TEMP_DIR, "ListenerStatus.json")
DASH_STATUS = os.path.join(_TMP_ROOT, "KPopStatus.json")   # PS dashboard polls this name
FILE_FILTER = "*Request*.json"
# v751 — match the bridge's well-known pipe path (no PID suffix). The
# bridge's /kpop/toast endpoint hard-codes \\.\pipe\KPopListenerPipe.
# On Mac/Linux we use a Unix domain socket at /tmp/KPopListenerPipe.sock.
if IS_WINDOWS:
    PIPE_NAME = r"\\.\pipe\KPopListenerPipe"
else:
    PIPE_NAME = "/tmp/KPopListenerPipe.sock"

stats = {"StartTime": datetime.now(), "TotalToasts": 0, "PipeToasts": 0,
         "FileToasts": 0, "WsToasts": 0, "MqttToasts": 0, "Failures": 0,
         "LastToastTitle": "None", "LastToastTime": None, "Version": VERSION}
msg_q   = queue.Queue()
running = True


# ----------------------------------------------------------------------------
# Toast backend — pick the first that imports; fall back to console.
# ----------------------------------------------------------------------------
def _build_toaster():
    # v751 — macOS native notification via osascript. No extra deps.
    if IS_MAC:
        def show(title, message, typ):
            try:
                # Escape double-quotes for the AppleScript string
                t = (title or "").replace('"', '\\"')
                m = (message or "").replace('"', '\\"')
                script = f'display notification "{m}" with title "{t}"'
                subprocess.run(["osascript", "-e", script], check=False, capture_output=True, timeout=5)
            except Exception:
                pass
        return ("macos-osascript", show)
    # v751 — Linux native notification via notify-send (libnotify-bin)
    if IS_LINUX:
        # Detect notify-send once
        try:
            subprocess.run(["notify-send", "--version"], check=True, capture_output=True, timeout=2)
            def show(title, message, typ):
                try:
                    args = ["notify-send", title or APP_DISPLAY]
                    if message:
                        args.append(message)
                    # Map type to urgency
                    urgency = {"error": "critical", "warn": "normal", "info": "normal", "system": "low"}.get((typ or "").lower(), "normal")
                    args.extend(["-u", urgency, "-a", APP_DISPLAY])
                    subprocess.run(args, check=False, capture_output=True, timeout=5)
                except Exception:
                    pass
            return ("linux-notify-send", show)
        except Exception:
            pass   # fall through to console
    # 1) windows-toasts (winsdk-based, maintained)
    try:
        from windows_toasts import WindowsToaster, Toast
        toaster = WindowsToaster(APP_DISPLAY)
        def show(title, message, typ):
            t = Toast()
            t.text_fields = [title, message] if message else [title]
            toaster.show_toast(t)
        return ("windows-toasts", show)
    except Exception:
        pass
    # 2) win11toast
    try:
        from win11toast import toast as _w11
        def show(title, message, typ):
            _w11(title, message, app_id=APP_ID)
        return ("win11toast", show)
    except Exception:
        pass
    # 3) win10toast
    try:
        from win10toast import ToastNotifier
        _n = ToastNotifier()
        def show(title, message, typ):
            _n.show_toast(title, message, duration=5, threaded=True)
        return ("win10toast", show)
    except Exception:
        pass
    # 4) console fallback
    def show(title, message, typ):
        print("\n[Toast/%s] %s" % (typ or "info", title))
        if message:
            print("          %s" % message)
    return ("console", show)


TOAST_BACKEND, _toast_show = _build_toaster()


def _build_tts():
    # v986 parity (speech offload): the listener owns the voice synth and speaks
    # asynchronously on a single dedicated worker reading a FIFO queue, so any
    # caller (pipe pump / Excel / VBA) returns immediately and never blocks on
    # speech, and utterances stay in order.
    try:
        import pyttsx3
        eng = pyttsx3.init()
        speech_q = queue.Queue()
        def worker():
            while True:
                text = speech_q.get()
                if not text:
                    continue
                try:
                    eng.say(text); eng.runAndWait()
                except Exception:
                    pass
        threading.Thread(target=worker, daemon=True).start()
        def speak(text):
            try: speech_q.put_nowait(text)
            except Exception: pass
        return speak
    except Exception:
        return None


_speak = _build_tts()


# ----------------------------------------------------------------------------
# Optional-dependency helpers — the "install missing libs" clip.
# ----------------------------------------------------------------------------
OPTIONAL = [
    ("windows-toasts", "windows_toasts",   "real Windows toasts (recommended)"),
    ("pywin32",        "win32pipe",        "named-pipe channel"),
    ("websockets",     "websockets",       "--enable-websocket"),
    ("paho-mqtt",      "paho.mqtt.client",  "--enable-mqtt"),
    ("pyttsx3",        "pyttsx3",          "speak the Text field"),
]


def missing_deps():
    miss = []
    for pip_name, import_name, why in OPTIONAL:
        try:
            __import__(import_name)
        except Exception:
            miss.append((pip_name, why))
    return miss


def install_deps(pkgs):
    import subprocess
    cmd = [sys.executable, "-m", "pip", "install", *pkgs]
    print("  running: " + " ".join(cmd))
    return subprocess.call(cmd)


def pip_clip(miss):
    """The copy-paste line to install whatever's missing."""
    return "%s -m pip install %s" % (sys.executable, " ".join(p for p, _ in miss))


# ----------------------------------------------------------------------------
# Message handling — parse JSON, show the toast, optional TTS, bump stats.
# ----------------------------------------------------------------------------
def _field(d, *names):
    for n in names:
        if isinstance(d, dict) and d.get(n) not in (None, ""):
            return str(d[n])
    return ""


def process_message(raw, source):
    global stats
    try:
        data = raw if isinstance(raw, dict) else json.loads(str(raw))
    except Exception:
        # not JSON — treat the whole thing as the message body
        data = {"Title": APP_DISPLAY, "Message": str(raw).strip()}
    title = _field(data, "Title", "title") or APP_DISPLAY
    message = _field(data, "Message", "message", "Msg", "msg")
    text = _field(data, "Text", "text")
    typ = _field(data, "Type", "type") or "info"
    try:
        _toast_show(title, message, typ)
        if text and _speak:
            _speak(text)
        stats["TotalToasts"] += 1
        stats[{"pipe": "PipeToasts", "file": "FileToasts",
               "ws": "WsToasts", "mqtt": "MqttToasts"}.get(source, "FileToasts")] += 1
        stats["LastToastTitle"] = title
        stats["LastToastTime"] = datetime.now().isoformat(timespec="seconds")
        print("  [%s] toast: [%s] %s" % (source, typ, title))
        # v752 — also append to events.log so the Tkinter dashboard's
        # log feed displays a live event timeline (matches what the PS
        # dashboard shows in its green console area).
        try:
            _events_log = os.path.join(TEMP_DIR, "events.log")
            ts = datetime.now().strftime("%H:%M:%S")
            line = '[%s] {"Title":"%s","Message":"%s","ToastType":"%s","Source":"%s"}\n' % (
                ts,
                str(title).replace('"', "'"),
                str(message or "").replace('"', "'")[:200],
                typ, source,
            )
            with open(_events_log, "a", encoding="utf-8") as fh:
                fh.write(line)
            # Trim to last 500 lines if file is getting big
            if os.path.getsize(_events_log) > 200_000:
                with open(_events_log, "r", encoding="utf-8", errors="replace") as fh:
                    keep = fh.readlines()[-500:]
                with open(_events_log, "w", encoding="utf-8") as fh:
                    fh.writelines(keep)
        except Exception:
            pass
    except Exception as e:
        stats["Failures"] += 1
        print("  [%s] toast FAILED: %s" % (source, e), file=sys.stderr)


def consumer_loop():
    while running:
        try:
            raw, source = msg_q.get(timeout=0.5)
        except queue.Empty:
            continue
        process_message(raw, source)


# ----------------------------------------------------------------------------
# Channel 1 — file-drop watcher (pure stdlib; the always-on fallback).
# ----------------------------------------------------------------------------
def file_watcher():
    while running:
        try:
            for f in glob.glob(os.path.join(TEMP_DIR, FILE_FILTER)):
                try:
                    with open(f, "r", encoding="utf-8-sig") as fh:
                        body = fh.read()
                    msg_q.put((body, "file"))
                finally:
                    try: os.remove(f)
                    except OSError: pass
        except Exception:
            pass
        time.sleep(0.5)


# ----------------------------------------------------------------------------
# Channel 2 — named pipe (Windows + pywin32). Byte-mode, replies "OK" (ACK).
# ----------------------------------------------------------------------------
def pipe_server():
    # v751 — cross-platform branch. Windows: named pipe via pywin32.
    # macOS/Linux: Unix domain socket at /tmp/KPopListenerPipe.sock.
    if not IS_WINDOWS:
        return _unix_socket_server()
    try:
        import win32pipe, win32file, pywintypes
    except Exception:
        print("  [pipe] pywin32 not installed — named-pipe channel disabled "
              "(file drop + ws/mqtt still work). `pip install pywin32` to enable.")
        return
    print("  [pipe] listening on %s" % PIPE_NAME)
    while running:
        try:
            h = win32pipe.CreateNamedPipe(
                PIPE_NAME,
                win32pipe.PIPE_ACCESS_DUPLEX,
                win32pipe.PIPE_TYPE_BYTE | win32pipe.PIPE_READMODE_BYTE | win32pipe.PIPE_WAIT,
                win32pipe.PIPE_UNLIMITED_INSTANCES, 65536, 65536, 0, None)
            win32pipe.ConnectNamedPipe(h, None)
            chunks = []
            while True:
                try:
                    hr, data = win32file.ReadFile(h, 65536)
                except pywintypes.error:
                    break
                if not data:
                    break
                chunks.append(data)
                if len(data) < 65536:
                    break
            raw = b"".join(chunks).decode("utf-8", "replace").strip()
            if raw:
                msg_q.put((raw, "pipe"))
                try: win32file.WriteFile(h, b"OK")   # ACK
                except Exception: pass
            try: win32file.FlushFileBuffers(h)
            except Exception: pass
            win32pipe.DisconnectNamedPipe(h)
            win32file.CloseHandle(h)
        except Exception as e:
            stats["Failures"] += 1
            time.sleep(0.5)


def _unix_socket_server():
    # v751 — Mac/Linux IPC. Unix domain socket at PIPE_NAME. Same JSON
    # wire as the Windows pipe path so the bridge's POST /kpop/toast
    # works identically once we switch the bridge to use this path on
    # non-Windows hosts.
    try:
        if os.path.exists(PIPE_NAME):
            os.remove(PIPE_NAME)
    except OSError:
        pass
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        srv.bind(PIPE_NAME)
        try: os.chmod(PIPE_NAME, 0o666)
        except OSError: pass
        srv.listen(5)
    except Exception as e:
        print("  [pipe] unix socket bind failed: %s" % e)
        return
    print("  [pipe] listening on %s (unix socket)" % PIPE_NAME)
    srv.settimeout(0.5)   # so the loop can check `running` periodically
    while running:
        try:
            conn, _ = srv.accept()
        except socket.timeout:
            continue
        except Exception:
            time.sleep(0.5); continue
        try:
            conn.settimeout(2.0)
            chunks = []
            while True:
                try:
                    data = conn.recv(65536)
                except socket.timeout:
                    break
                if not data: break
                chunks.append(data)
                if len(data) < 65536: break
            raw = b"".join(chunks).decode("utf-8", "replace").strip()
            if raw:
                msg_q.put((raw, "pipe"))
                try: conn.sendall(b"OK")
                except Exception: pass
        except Exception:
            stats["Failures"] += 1
        finally:
            try: conn.close()
            except Exception: pass
    try: srv.close()
    except Exception: pass
    try: os.remove(PIPE_NAME)
    except OSError: pass


# ----------------------------------------------------------------------------
# Channel 3 — WebSocket (optional). Receives JSON text frames.
# ----------------------------------------------------------------------------
def ws_server(port):
    try:
        import asyncio, websockets
    except Exception:
        print("  [ws] `pip install websockets` to enable the WebSocket channel.")
        return

    async def handler(ws):
        async for raw in ws:
            msg_q.put((raw, "ws"))
            try: await ws.send('{"ack":true}')
            except Exception: pass

    async def main_ws():
        async with websockets.serve(handler, "0.0.0.0", port):
            print("  [ws] listening on ws://0.0.0.0:%d" % port)
            while running:
                await asyncio.sleep(0.5)

    try:
        asyncio.run(main_ws())
    except Exception as e:
        print("  [ws] error: %s" % e)


# ----------------------------------------------------------------------------
# Channel 4 — MQTT (optional). Subscribes to a topic.
# ----------------------------------------------------------------------------
def mqtt_sub(broker, port, topic, user, pw):
    try:
        import paho.mqtt.client as mqtt
    except Exception:
        print("  [mqtt] `pip install paho-mqtt` to enable the MQTT channel.")
        return
    cli = mqtt.Client()
    if user:
        cli.username_pw_set(user, pw)
    cli.on_message = lambda c, u, m: msg_q.put((m.payload.decode("utf-8", "replace"), "mqtt"))
    try:
        cli.connect(broker, port, 30)
        cli.subscribe(topic)
        print("  [mqtt] subscribed to %s on %s:%d" % (topic, broker, port))
        cli.loop_start()
        while running:
            time.sleep(0.5)
        cli.loop_stop()
    except Exception as e:
        print("  [mqtt] error: %s" % e)


# ----------------------------------------------------------------------------
# Status / PID files (mirror the PS build for the dashboard + engine checks).
# ----------------------------------------------------------------------------
def write_status():
    # v752 — keys marked [PS] are read by the PowerShell dashboard
    # ($env:TEMP\KPopStatus.json polled every 2s). Match the PS
    # Update-ListenerStatus output shape: StartTime (ISO 8601), Uptime
    # (HH:MM:SS), Status, TotalToasts, PipeToasts, Failures,
    # UseRawStream, RaiseEventMode. Python-specific extras after.
    while running:
        up = datetime.now() - stats["StartTime"]
        uptime_str = "{:02d}:{:02d}:{:02d}".format(
            int(up.total_seconds() // 3600),
            (int(up.total_seconds()) % 3600) // 60,
            int(up.total_seconds()) % 60,
        )
        payload = {
            # PS-dashboard-compatible keys (read by Update-ListenerStatus)
            "StartTime":      stats["StartTime"].isoformat(),
            "Uptime":         uptime_str,
            "Status":         "Running",
            "TotalToasts":    stats["TotalToasts"],
            "PipeToasts":     stats["PipeToasts"],
            "Failures":       stats["Failures"],
            "UseRawStream":   bool(stats.get("UseRawStream", False)),
            "RaiseEventMode": bool(stats.get("RaiseEventMode", False)),
            # Python-specific extras (ignored by PS dashboard, used by the
            # new Tkinter dashboard + diagnostics)
            "PID":            os.getpid(),
            "PipeName":       PIPE_NAME,
            "ToastBackend":   TOAST_BACKEND,
            "FileToasts":     stats["FileToasts"],
            "WsToasts":       stats["WsToasts"],
            "MqttToasts":     stats["MqttToasts"],
            "MqttEnabled":    bool(stats.get("MqttEnabled", False)),
            "LastToastTitle": stats["LastToastTitle"],
            "LastToastTime":  stats["LastToastTime"],
            "Version":        VERSION,
            "Engine":         "python",
            "Platform":       platform.system(),
            "DiscordConfigured": bool(_discord_webhook_url()),
        }
        try:
            blob = json.dumps(payload, indent=2)
            for p in (STATUS_FILE, DASH_STATUS):
                with open(p, "w", encoding="utf-8") as fh:
                    fh.write(blob)
        except Exception:
            pass
        time.sleep(2)


# ----------------------------------------------------------------------------
# v751 — Discord webhook integration (cross-platform). Reads webhook URL
# from KPOP_DISCORD_WEBHOOK env var or ~/.kpop_discord_webhook file.
# Standalone-safe: just POSTs to discord.com, no engine bridge needed.
# ----------------------------------------------------------------------------
def _discord_webhook_url():
    url = os.environ.get("KPOP_DISCORD_WEBHOOK", "").strip()
    if url:
        return url
    home = os.path.expanduser("~")
    cred = os.path.join(home, ".kpop_discord_webhook")
    try:
        if os.path.isfile(cred):
            with open(cred, "r", encoding="utf-8") as f:
                v = f.read().strip()
                if v.startswith("https://"):
                    return v
    except Exception:
        pass
    return None

def discord_post(title, message, typ="info"):
    url = _discord_webhook_url()
    if not url:
        return False
    emoji = {"error": "🔴", "warn": "🟡", "success": "🟢", "info": "🔵", "system": "⚙️"}.get(typ.lower(), "🔵")
    content = f"{emoji} **{title}**" + (f"\n{message}" if message else "")
    payload = json.dumps({"content": content}).encode("utf-8")
    try:
        # Use urllib so we don't require the `requests` dependency
        import urllib.request
        req = urllib.request.Request(url, data=payload,
                                      headers={"Content-Type": "application/json"},
                                      method="POST")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return 200 <= resp.status < 300
    except Exception:
        return False


# ----------------------------------------------------------------------------
# v751 — Bridge auto-launch. Spawns the Node.js bridge in the background
# alongside the listener so `python KPopListener.py --launch-bridge` boots
# the whole stack with one command on either OS.
# ----------------------------------------------------------------------------
def launch_bridge(bridge_path):
    if not bridge_path:
        # Try common locations relative to this script
        here = os.path.dirname(os.path.abspath(__file__))
        candidates = [
            os.path.join(here, "..", "WebGLEngine", "ai-bridge"),
            os.path.join(here, "..", "..", "WebGLEngine", "ai-bridge"),
            os.path.join(os.path.expanduser("~"), "EngineProject", "WebGLEngine", "ai-bridge"),
        ]
        if IS_WINDOWS:
            candidates.append(r"C:\EngineProject\WebGLEngine\ai-bridge")
        for c in candidates:
            if os.path.isfile(os.path.join(c, "server.js")):
                bridge_path = os.path.abspath(c)
                break
    if not bridge_path or not os.path.isfile(os.path.join(bridge_path, "server.js")):
        print("  [bridge] could not find ai-bridge/server.js — skipping auto-launch")
        return None
    print(f"  [bridge] launching: node {bridge_path}/server.js")
    try:
        node_cmd = "node"
        # On Windows, node.exe might not be on PATH for non-interactive launches
        if IS_WINDOWS:
            for p in [r"C:\Program Files\nodejs\node.exe", r"C:\Program Files (x86)\nodejs\node.exe"]:
                if os.path.isfile(p):
                    node_cmd = p; break
        # Use Popen + DETACHED on Windows / setsid on Unix so the bridge
        # survives the listener exiting
        kwargs = {"cwd": bridge_path, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
        if IS_WINDOWS:
            kwargs["creationflags"] = 0x00000008   # DETACHED_PROCESS
        else:
            kwargs["start_new_session"] = True
        return subprocess.Popen([node_cmd, "server.js"], **kwargs)
    except Exception as e:
        print(f"  [bridge] launch failed: {e}")
        return None


def launch_clipsaver(folder=""):
    # v985 parity — start the clipboard auto-save watcher (KPopupClipSaver.ps1)
    # alongside the listener. The watcher is PowerShell, so this is Windows-only;
    # on macOS/Linux there is no PS clip-saver to launch.
    here = os.path.dirname(os.path.abspath(__file__))
    script = os.path.join(here, "KPopupClipSaver.ps1")
    if not IS_WINDOWS:
        print("  [clipsaver] Windows-only (PowerShell KPopupClipSaver.ps1) - skipping on %s" % platform.system())
        return None
    if not os.path.isfile(script):
        print("  [clipsaver] KPopupClipSaver.ps1 not found next to the listener - skipping")
        return None
    ps = "powershell.exe"
    pwsh = r"C:\Program Files\PowerShell\7\pwsh.exe"
    if os.path.isfile(pwsh):
        ps = pwsh
    cmd = [ps, "-ExecutionPolicy", "Bypass", "-NoProfile", "-File", script]
    if folder:
        cmd += ["-BaseFolder", folder]   # matches KPopupClipSaver.ps1's param
    print("  [clipsaver] launching: %s" % " ".join(cmd))
    try:
        kwargs = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL, "creationflags": 0x00000008}
        return subprocess.Popen(cmd, **kwargs)
    except Exception as e:
        print("  [clipsaver] launch failed: %s" % e)
        return None


# ----------------------------------------------------------------------------
def main():
    global running, TOAST_BACKEND, _toast_show, _speak
    ap = argparse.ArgumentParser(description="KPop toast listener (Python port of KPopListener.ps1)")
    ap.add_argument("--no-startup-toast", action="store_true")
    ap.add_argument("--install-deps", action="store_true",
                    help="pip install any missing optional libs (toasts/pipe/ws/mqtt/tts), then continue")
    ap.add_argument("--enable-websocket", action="store_true")
    ap.add_argument("--websocket-port", type=int, default=8080)
    ap.add_argument("--enable-mqtt", action="store_true")
    ap.add_argument("--mqtt-broker", default="localhost")
    ap.add_argument("--mqtt-port", type=int, default=1883)
    ap.add_argument("--mqtt-sub-topic", default="kpop/in")
    ap.add_argument("--mqtt-user", default="")
    ap.add_argument("--mqtt-pass", default="")
    # v751 — bridge auto-launch + Discord smoke-test
    ap.add_argument("--launch-bridge", action="store_true",
                    help="Spawn the Node.js ai-bridge alongside the listener (cross-platform).")
    ap.add_argument("--bridge-path", default="",
                    help="Override the path to the ai-bridge folder. Auto-detected if omitted.")
    ap.add_argument("--launch-clipsaver", action="store_true",
                    help="also start the clipboard auto-save watcher (KPopupClipSaver.ps1; Windows only)")
    ap.add_argument("--clipsaver-folder", default="",
                    help="override where the clip-saver writes versioned files (-BaseFolder)")
    ap.add_argument("--discord-test", action="store_true",
                    help="POST a test embed to the configured Discord webhook + exit.")
    # v752 — launch Tkinter dashboard alongside the listener
    ap.add_argument("--dashboard", action="store_true",
                    help="Open the Tkinter dashboard window alongside the listener.")
    # v753 — web-served dashboard fallback for systems without Tkinter
    ap.add_argument("--web-dashboard", action="store_true",
                    help="Open the web-served dashboard (port 8788). Works without Tkinter.")
    args = ap.parse_args()

    # v1576 — heartbeat sentinel so the engine's GET /kpop/status sees THIS (Python) listener as
    # running, just like the PowerShell one. Writes <tmp>/KPopListener/Listener_Alive.txt every 3s;
    # the bridge checks the same path via os.tmpdir() (10s freshness window).
    def _sentinel_heartbeat():
        beat_dir = os.path.join(_TMP_ROOT, "KPopListener")
        beat_path = os.path.join(beat_dir, "Listener_Alive.txt")
        try:
            os.makedirs(beat_dir, exist_ok=True)
        except Exception:
            pass
        while True:
            try:
                with open(beat_path, "w", encoding="utf-8") as _bf:
                    _bf.write(datetime.now().isoformat())
            except Exception:
                pass
            time.sleep(3)
    threading.Thread(target=_sentinel_heartbeat, daemon=True).start()

    if args.discord_test:
        ok = discord_post("KPopListener test", "Discord integration verified from Python listener", "success")
        print("[discord-test] " + ("✓ posted" if ok else "✗ failed (set KPOP_DISCORD_WEBHOOK env or ~/.kpop_discord_webhook)"))
        return

    # v752/v753 — launch dashboard. If --dashboard requested, try Tkinter
    # first and fall through to web-served if it's missing. If --web-dashboard
    # explicitly requested, skip Tkinter entirely.
    if args.dashboard or args.web_dashboard:
        here = os.path.dirname(os.path.abspath(__file__))
        dash_tk  = os.path.join(here, "KPopDashboard.py")
        dash_web = os.path.join(here, "KPopDashboard_web.py")
        # First choice: Tkinter (unless --web-dashboard explicit)
        if args.dashboard and not args.web_dashboard:
            try:
                # Probe Tkinter availability without importing it ourselves
                # (a failed `import tkinter` here would crash the listener).
                check = subprocess.run(
                    [sys.executable, "-c", "import tkinter; tkinter.Tk().destroy()"],
                    capture_output=True, timeout=5,
                )
                if check.returncode == 0 and os.path.isfile(dash_tk):
                    kwargs = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
                    if IS_WINDOWS:
                        kwargs["creationflags"] = 0x00000008   # DETACHED_PROCESS
                    else:
                        kwargs["start_new_session"] = True
                    subprocess.Popen([sys.executable, dash_tk], **kwargs)
                    print("  [dashboard] Tkinter dashboard launched as detached child")
                else:
                    raise RuntimeError("tkinter probe failed")
            except Exception:
                print("  [dashboard] Tkinter not available — falling back to web dashboard")
                args.web_dashboard = True   # trigger the web path below
        # Web fallback (also fires if --web-dashboard explicit)
        if args.web_dashboard:
            if os.path.isfile(dash_web):
                try:
                    kwargs = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
                    if IS_WINDOWS:
                        kwargs["creationflags"] = 0x00000008
                    else:
                        kwargs["start_new_session"] = True
                    subprocess.Popen([sys.executable, dash_web], **kwargs)
                    print("  [dashboard] web dashboard launched at http://localhost:8788/")
                except Exception as e:
                    print(f"  [dashboard] web launch failed: {e}")
            else:
                print(f"  [dashboard] KPopDashboard_web.py not found next to listener")

    if args.install_deps:
        miss = missing_deps()
        if not miss:
            print("[install-deps] all optional libs already present.")
        else:
            print("[install-deps] installing: " + ", ".join(p for p, _ in miss))
            install_deps([p for p, _ in miss])
            import importlib
            importlib.invalidate_caches()
            TOAST_BACKEND, _toast_show = _build_toaster()   # re-detect now that libs exist
            _speak = _build_tts()
            print("[install-deps] done. toast backend now: " + TOAST_BACKEND)

    with open(PID_FILE, "w", encoding="utf-8") as fh:
        fh.write(str(os.getpid()))

    print("=" * 60)
    print(" KPopListener (Python) %s" % VERSION)
    print("   platform      : %s" % platform.system())
    print("   toast backend : %s" % TOAST_BACKEND)
    print("   tts           : %s" % ("pyttsx3" if _speak else "off"))
    print("   discord       : %s" % ("configured" if _discord_webhook_url() else "off (set KPOP_DISCORD_WEBHOOK)"))
    print("   temp dir      : %s" % TEMP_DIR)
    print("   file drops    : %s/%s" % (TEMP_DIR, FILE_FILTER))
    print("   pipe / socket : %s" % PIPE_NAME)
    print("=" * 60)

    if args.launch_bridge:
        launch_bridge(args.bridge_path)
    if args.launch_clipsaver:
        launch_clipsaver(args.clipsaver_folder)

    miss = missing_deps()
    if miss:
        print("Optional libs not installed: " + ", ".join("%s (%s)" % (p, why) for p, why in miss))
        print("  install clip:  " + pip_clip(miss))
        print("  or run     :  python KPopListener.py --install-deps")
        print("-" * 60)

    threads = [
        threading.Thread(target=consumer_loop, daemon=True),
        threading.Thread(target=file_watcher, daemon=True),
        threading.Thread(target=pipe_server, daemon=True),
        threading.Thread(target=write_status, daemon=True),
    ]
    if args.enable_websocket:
        threads.append(threading.Thread(target=ws_server, args=(args.websocket_port,), daemon=True))
    if args.enable_mqtt:
        stats["MqttEnabled"] = True   # v753 — surfaced in status JSON for the dashboard
        threads.append(threading.Thread(
            target=mqtt_sub,
            args=(args.mqtt_broker, args.mqtt_port, args.mqtt_sub_topic, args.mqtt_user, args.mqtt_pass),
            daemon=True))
    for t in threads:
        t.start()

    if not args.no_startup_toast:
        msg_q.put(({"Title": APP_DISPLAY, "Message": "Listener ready (Python).", "Type": "system"}, "file"))

    spin = "|/-\\"
    i = 0
    try:
        while True:
            line = "Listening... (T:%d P:%d F:%d W:%d M:%d) %s" % (
                stats["TotalToasts"], stats["PipeToasts"], stats["FileToasts"],
                stats["WsToasts"], stats["MqttToasts"], spin[i % 4])
            sys.stdout.write("\r" + line + "   ")
            sys.stdout.flush()
            i += 1
            time.sleep(0.25)
    except KeyboardInterrupt:
        running = False
        print("\nstopping…")
        try: os.remove(PID_FILE)
        except OSError: pass


if __name__ == "__main__":
    main()
