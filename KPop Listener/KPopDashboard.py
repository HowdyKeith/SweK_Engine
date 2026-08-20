#!/usr/bin/env python3
# KPopDashboard.py — v752 — cross-platform Tkinter dashboard for the
# Python KPopListener. Mirrors the PS dashboard layout: status header,
# uptime + toast counters, scrolling log feed, Engine Quick Launch
# panel (when the bridge is detected), Discord webhook help button.
#
# Tkinter ships with Python on:
#   * macOS  — both /usr/bin/python3 and python.org installer
#   * Windows — python.org installer
#   * Linux  — usually NOT included; install via your package manager:
#                 sudo apt install python3-tk          (Debian/Ubuntu)
#                 sudo dnf install python3-tkinter     (Fedora)
#                 sudo pacman -S tk                    (Arch)
#
# Run standalone:
#   python3 KPopDashboard.py
#
# Or auto-launched alongside the listener:
#   python3 KPopListener.py --dashboard
#
# Detection: this dashboard reads $TMPDIR/KPopStatus.json every 1s
# (the same file the PS dashboard polls). It does not directly talk
# to the listener — so the listener and dashboard can run in separate
# processes or even on the same machine without coordination beyond
# that JSON file.

import json
import os
import platform
import socket
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
from datetime import datetime

# Try to import Tkinter. If it's missing, print a clear install hint
# and exit with a recognizable exit code so the parent launcher can
# fall back to console-only mode.
try:
    import tkinter as tk
    from tkinter import ttk, scrolledtext, messagebox
except ImportError:
    sysname = platform.system()
    hints = {
        "Darwin":  "On macOS, reinstall Python from python.org — Apple's /usr/bin/python3 normally includes Tkinter via Tk.framework. If you're using Homebrew Python, run: brew install python-tk",
        "Linux":   "On Linux, install via your package manager:\n  Ubuntu/Debian: sudo apt install python3-tk\n  Fedora:        sudo dnf install python3-tkinter\n  Arch:          sudo pacman -S tk",
        "Windows": "On Windows, Tkinter is bundled with Python from python.org. Reinstall Python and check the Tcl/Tk option during install.",
    }
    print("ERROR: Tkinter is not available in this Python install.", file=sys.stderr)
    print("  " + hints.get(sysname, "Consult your platform's docs on installing Tkinter."), file=sys.stderr)
    print("\nFalling back to web-served dashboard would be possible — pass --web-dashboard to the listener instead.", file=sys.stderr)
    sys.exit(2)


# --- shared paths (must match KPopListener.py) ---
_TMP_ROOT   = os.environ.get("TEMP") or os.environ.get("TMP") or tempfile.gettempdir()
TEMP_DIR    = os.path.join(_TMP_ROOT, "KPopListener")
STATUS_FILE = os.path.join(_TMP_ROOT, "KPopStatus.json")
EVENTS_LOG  = os.path.join(TEMP_DIR, "events.log")
APP_DISPLAY = "KPop Pop!"
VERSION     = "py-dash-1.0 (v752)"

# Engine bridge detection — TCP probe to localhost:8787
BRIDGE_PORT = int(os.environ.get("KPOP_BRIDGE_PORT", "8787"))


# ============================================================
# Engine detection — TCP socket probe with hard 150ms cap
# ============================================================
def probe_engine_bridge(port=BRIDGE_PORT, timeout=0.15):
    """Returns True if something is listening on 127.0.0.1:<port>."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        result = s.connect_ex(("127.0.0.1", port))
        s.close()
        return result == 0
    except Exception:
        return False


# ============================================================
# Standalone-mode detection — look for WebGLEngine folder
# ============================================================
def find_engine_folder():
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(here, "..", "WebGLEngine"),
        os.path.join(here, "..", "..", "WebGLEngine"),
        os.path.join(os.path.expanduser("~"), "EngineProject", "WebGLEngine"),
    ]
    if platform.system() == "Windows":
        candidates.append(r"C:\EngineProject\WebGLEngine")
    for c in candidates:
        if os.path.isfile(os.path.join(c, "index.html")):
            return os.path.abspath(c)
    return None


# ============================================================
# Dashboard
# ============================================================
class KPopDashboardWindow:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title(f"KPopListener Dashboard · {VERSION}")
        self.engine_folder = find_engine_folder()
        self.is_standalone = self.engine_folder is None
        h = 540 if self.is_standalone else 760
        self.root.geometry(f"560x{h}")
        self.root.minsize(560, h)

        # Track engine state to flip button enablement
        self._engine_online_last = None
        self._ql_buttons = []
        self._last_log_size = 0

        self._build_ui()
        self._schedule_poll()
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self):
        # Header row: status checkboxes (Use Raw Stream, Raise Event Mode,
        # Mirror to MQTT). Read-only — all three are listener-startup flags.
        hdr = ttk.Frame(self.root, padding=(14, 10))
        hdr.pack(fill="x")
        self.var_raw = tk.BooleanVar(value=False)
        self.var_event = tk.BooleanVar(value=False)
        self.var_mqtt = tk.BooleanVar(value=False)
        ttk.Checkbutton(hdr, text="Use Raw Stream (set at listener launch)",
                        variable=self.var_raw, state="disabled").grid(row=0, column=0, sticky="w")
        ttk.Checkbutton(hdr, text="Raise Event Mode (set at listener launch)",
                        variable=self.var_event, state="disabled").grid(row=1, column=0, sticky="w")
        # v753 — Mirror to MQTT checkbox parallel to the PS dashboard
        ttk.Checkbutton(hdr, text="Mirror to MQTT (set at listener launch)",
                        variable=self.var_mqtt, state="disabled").grid(row=0, column=1, sticky="w", padx=(20, 0))
        self.lbl_mqtt_status = ttk.Label(hdr, text="MQTT: not enabled", foreground="#888")
        self.lbl_mqtt_status.grid(row=1, column=1, sticky="w", padx=(20, 0))

        # Buttons row
        btn_row = ttk.Frame(self.root, padding=(14, 4))
        btn_row.pack(fill="x")
        ttk.Button(btn_row, text="Refresh Status",
                   command=self._refresh_now).pack(side="left", padx=(0, 6))
        ttk.Button(btn_row, text="Test Discord",
                   command=self._test_discord).pack(side="left", padx=6)
        ttk.Button(btn_row, text="?  Discord setup",
                   command=self._show_discord_help).pack(side="left", padx=6)
        # v753 — MQTT setup help button parallel to Discord one
        ttk.Button(btn_row, text="?  MQTT setup",
                   command=self._show_mqtt_help).pack(side="left", padx=6)

        # Status + uptime labels
        sl = ttk.Frame(self.root, padding=(14, 4))
        sl.pack(fill="x")
        self.lbl_status = ttk.Label(sl, text="Status: starting…",
                                     foreground="#666")
        self.lbl_status.pack(side="left")
        self.lbl_uptime = ttk.Label(sl, text="Uptime: --:--:--",
                                     foreground="#369")
        self.lbl_uptime.pack(side="left", padx=(20, 0))

        # Log feed
        log_frame = ttk.Frame(self.root, padding=(14, 4))
        log_frame.pack(fill="both", expand=True)
        self.log_box = scrolledtext.ScrolledText(
            log_frame, wrap="word", height=14,
            font=("Menlo" if platform.system() == "Darwin" else "Consolas", 9),
            bg="#101018", fg="#9f9", insertbackground="#9f9",
        )
        self.log_box.pack(fill="both", expand=True)
        self.log_box.insert("1.0", "(waiting for events...)\n")
        self.log_box.configure(state="disabled")

        # Engine Quick Launch — only if engine folder detected
        if not self.is_standalone:
            self._build_quick_launch()
        else:
            ttk.Label(self.root, text="No engine folder detected nearby — standalone listener mode.",
                      foreground="#888", padding=(14, 6)).pack(fill="x")

    def _build_quick_launch(self):
        qlf = ttk.LabelFrame(self.root, text="Engine Quick Launch", padding=8)
        qlf.pack(fill="x", padx=14, pady=(0, 14))

        # Engine status line + Refresh button
        srow = ttk.Frame(qlf)
        srow.pack(fill="x")
        self.lbl_engine = ttk.Label(srow, text="Engine: detecting…", foreground="#666")
        self.lbl_engine.pack(side="left")
        ttk.Button(srow, text="🔄 Refresh",
                   command=self._refresh_engine_now).pack(side="right")

        # Buttons grid (2 rows × 4 cols)
        grid = ttk.Frame(qlf)
        grid.pack(fill="x", pady=(8, 0))
        buttons = [
            ("🌐 Open Engine",   "/index.html",        "Open the main 3D engine (heavy — best on a desktop)."),
            ("📱 Phone Control", "/control.html",      "Same URL you'd visit on your phone."),
            ("🧊 Voxel Viewer",  "/voxel-viewer.html", "Phone Gemini voxel viewer + image gen + gallery."),
            ("📺 TV Remote",     "/control.html#tab-shield", "Shield/Roku tab of the phone control panel."),
            ("🐛 Debug Console", "/debug.html",        "Unified debug viewer with ANSI colors (v751+)."),
            ("♟ RPS Multi",     "/rps.html",          "Rock-Paper-Scissors May-Leonard multiplayer."),
            ("📊 Benchmark",     "/benchmark.html",    "WebGL benchmark page."),
        ]
        for i, (label, path, tt) in enumerate(buttons):
            r, c = divmod(i, 4)
            url = f"http://localhost:{BRIDGE_PORT}{path}"
            btn = ttk.Button(grid, text=label,
                             command=lambda u=url: self._open_url(u))
            btn.grid(row=r, column=c, padx=2, pady=2, sticky="ew")
            self._ql_buttons.append(btn)
        for c in range(4):
            grid.columnconfigure(c, weight=1)

        ttk.Label(qlf, text="Buttons disable when the engine bridge isn't reachable. Status updates every 2s.",
                  foreground="#789", font=("TkDefaultFont", 8)).pack(anchor="w", pady=(6, 0))

    # --- actions ---
    def _open_url(self, url):
        try:
            webbrowser.open(url)
            self._set_status(f"Status: opened {url}")
        except Exception as e:
            self._set_status(f"Status: launch failed: {e}")

    def _set_status(self, txt):
        self.lbl_status.configure(text=txt)

    def _refresh_now(self):
        self._poll_status()
        self._set_status("Status: refreshed")

    def _refresh_engine_now(self):
        self._poll_engine()

    def _test_discord(self):
        # Invoke the listener's --discord-test mode in a sub-process so
        # we don't import the listener inline (avoids initializing a 2nd
        # toast backend).
        here = os.path.dirname(os.path.abspath(__file__))
        listener = os.path.join(here, "KPopListener.py")
        if not os.path.isfile(listener):
            messagebox.showerror("Test Discord", f"Can't find KPopListener.py at {listener}")
            return
        try:
            result = subprocess.run(
                [sys.executable, listener, "--discord-test"],
                capture_output=True, text=True, timeout=10,
            )
            ok = "✓" in (result.stdout or "")
            msg = (result.stdout or "").strip() + ("\n" + (result.stderr or "").strip() if result.stderr else "")
            messagebox.showinfo("Test Discord", msg or "no output")
            self._set_status("Status: " + ("Discord test ✓" if ok else "Discord test ✗"))
        except subprocess.TimeoutExpired:
            messagebox.showerror("Test Discord", "Discord test timed out")
        except Exception as e:
            messagebox.showerror("Test Discord", f"Test failed: {e}")

    def _show_discord_help(self):
        msg = (
            "Discord integration posts events to a Discord channel via a webhook URL.\n"
            "Works STANDALONE — no engine required.\n\n"
            "To set it up:\n\n"
            "  1. In Discord: Server Settings → Integrations → Webhooks → New Webhook.\n"
            "     Pick the channel you want events to land in. Copy the webhook URL.\n\n"
            "  2. Tell the listener about it. Two options:\n\n"
            "     A) Environment variable (works for this session only):\n"
            "        export KPOP_DISCORD_WEBHOOK=\"https://discord.com/api/webhooks/...\"\n\n"
            "     B) Persistent file:\n"
            "        echo \"https://discord.com/api/webhooks/...\" > ~/.kpop_discord_webhook\n"
            "        chmod 600 ~/.kpop_discord_webhook\n\n"
            "  3. Restart the listener (or run --discord-test to verify).\n\n"
            "Notes:\n"
            "  - Don't share the URL — anyone with it can post to your channel.\n"
            "  - On engine-attached mode, the engine bridge can also POST to /discord/post\n"
            "    for structured stat embeds (UFO kills, round scores, etc.).\n"
        )
        messagebox.showinfo("Set up Discord for KPopListener", msg)

    def _show_mqtt_help(self):
        # v753 — MQTT setup help dialog parallel to Discord one
        msg = (
            "MQTT is enabled at LISTENER STARTUP, not from the dashboard.\n"
            "The listener has to know the broker before it boots so it can subscribe.\n\n"
            "To enable MQTT mirroring:\n\n"
            "  1. Install paho-mqtt if you haven't:\n"
            "       pip install paho-mqtt\n\n"
            "  2. Stop the running listener.\n\n"
            "  3. Re-launch with these arguments:\n\n"
            "       python3 KPopListener.py --enable-mqtt \\\n"
            "         --mqtt-broker homeassistant.local \\\n"
            "         --mqtt-port 1883 \\\n"
            "         --mqtt-sub-topic kpop/in\n\n"
            "  4. Once it's running, the listener subscribes to the topic and\n"
            "     converts incoming MQTT messages into local toasts. Useful for\n"
            "     Home Assistant + Node-RED integration.\n\n"
            "Notes:\n"
            "  - Authentication: add --mqtt-user and --mqtt-pass if your broker needs it.\n"
            "  - The dashboard's MQTT checkbox above is read-only — it reflects current state.\n"
            "  - When MQTT events flow in, they appear in the green log feed below.\n"
        )
        messagebox.showinfo("Set up MQTT for KPopListener", msg)

    def _on_close(self):
        try:
            self.root.destroy()
        except Exception:
            pass

    # --- polling ---
    def _schedule_poll(self):
        self._poll_status()
        self._poll_engine()
        self._poll_events()
        # 2-second loop for status + engine, 0.5s for events tail
        self.root.after(2000, self._schedule_poll)

    def _poll_status(self):
        try:
            with open(STATUS_FILE, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            self.lbl_status.configure(text="Status: listener not running", foreground="#a44")
            self.lbl_uptime.configure(text="Uptime: --:--:--")
            return
        status = data.get("Status", "unknown")
        uptime = data.get("Uptime", "--:--:--")
        toasts = data.get("TotalToasts", 0)
        self.lbl_status.configure(text=f"Status: {status}", foreground="#383")
        self.lbl_uptime.configure(text=f"Uptime: {uptime} · toasts={toasts}")
        # Update read-only checkboxes from listener state
        try: self.var_raw.set(bool(data.get("UseRawStream", False)))
        except Exception: pass
        try: self.var_event.set(bool(data.get("RaiseEventMode", False)))
        except Exception: pass
        # v753 — MQTT mirror state. Looks at MqttToasts > 0 OR an explicit
        # MqttEnabled key if the listener sets one. Best-effort indicator.
        try:
            mqtt_active = bool(data.get("MqttEnabled", False) or (data.get("MqttToasts", 0) > 0))
            self.var_mqtt.set(mqtt_active)
            self.lbl_mqtt_status.configure(
                text=f"MQTT: {'mirroring' if mqtt_active else 'not enabled'}",
                foreground="#383" if mqtt_active else "#888",
            )
        except Exception: pass

    def _poll_engine(self):
        if self.is_standalone:
            return
        online = probe_engine_bridge()
        if online == self._engine_online_last:
            return
        self._engine_online_last = online
        if online:
            self.lbl_engine.configure(
                text=f"Engine: ✓ detected at http://localhost:{BRIDGE_PORT}",
                foreground="#383",
            )
            for b in self._ql_buttons:
                b.state(["!disabled"])
        else:
            self.lbl_engine.configure(
                text=f"Engine: ✗ offline — start the bridge (port {BRIDGE_PORT}) to enable these buttons",
                foreground="#a44",
            )
            for b in self._ql_buttons:
                b.state(["disabled"])

    def _poll_events(self):
        # Tail events log for live feed
        try:
            if not os.path.isfile(EVENTS_LOG):
                return
            size = os.path.getsize(EVENTS_LOG)
            if size == self._last_log_size:
                return
            # Read just the last 200 lines max
            with open(EVENTS_LOG, "r", encoding="utf-8", errors="replace") as fh:
                lines = fh.readlines()[-200:]
            content = "".join(lines) or "(waiting for events...)"
            self.log_box.configure(state="normal")
            self.log_box.delete("1.0", "end")
            self.log_box.insert("1.0", content)
            self.log_box.see("end")
            self.log_box.configure(state="disabled")
            self._last_log_size = size
        except Exception:
            pass

    def run(self):
        self.root.mainloop()


def main():
    KPopDashboardWindow().run()


if __name__ == "__main__":
    main()
