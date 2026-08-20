// ai-bridge/typeBridge.js — v1975
// Types text into whatever window currently has focus (the missing half of a FluidVoice-style
// dictation flow: whisper.cpp already turns mic audio into text; this puts that text into the app
// you're actually working in). No native module to compile — each OS gets a built-in tool:
//
//   Windows : PowerShell + System.Windows.Forms.SendKeys.SendWait  (ships with Windows)
//   macOS   : osascript -> System Events `keystroke`               (needs Accessibility permission)
//   Linux   : xdotool type                                          (apt install xdotool)
//
// SendKeys/keystroke can't emit arbitrary Unicode reliably, so for anything beyond plain ASCII we
// fall back to the CLIPBOARD route: stash the text on the clipboard and paste (Ctrl/Cmd+V). That's
// also faster for long dictations. Caller can force either mode. All paths shell out with the text
// passed via stdin/temp file (never interpolated into the command line) so quotes/newlines are safe.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const WIN = process.platform === "win32";
const MAC = process.platform === "darwin";
const LINUX = process.platform === "linux";

function _run(cmd, args, stdin) {
    return new Promise((resolve) => {
        let out = "", err = "";
        let p;
        try { p = spawn(cmd, args, { windowsHide: true }); }
        catch (e) { resolve({ ok: false, error: String(e && e.message || e) }); return; }
        p.stdout && p.stdout.on("data", (d) => { out += d; });
        p.stderr && p.stderr.on("data", (d) => { err += d; });
        p.on("error", (e) => resolve({ ok: false, error: String(e && e.message || e) }));
        p.on("close", (code) => resolve({ ok: code === 0, code, out: out.trim(), err: err.trim() }));
        if (stdin != null && p.stdin) { try { p.stdin.write(stdin); p.stdin.end(); } catch {} }
    });
}

// Is the clipboard-paste tool available (used by the "paste" mode)?
function _clipboardCmd() {
    if (WIN) return { set: ["powershell", ["-NoProfile", "-Command", "$in=[Console]::In.ReadToEnd(); Set-Clipboard -Value $in"]] };
    if (MAC) return { set: ["pbcopy", []] };
    if (LINUX) return { set: ["xclip", ["-selection", "clipboard"]] };
    return null;
}

async function _setClipboard(text) {
    const c = _clipboardCmd();
    if (!c) return { ok: false, error: "no clipboard tool for this OS" };
    return _run(c.set[0], c.set[1], text);
}

// Paste: put text on the clipboard, then send the paste chord to the focused app.
async function _pasteInto(text) {
    const clip = await _setClipboard(text);
    if (!clip.ok) return { ok: false, error: "clipboard set failed: " + (clip.error || clip.err || "?") };
    // small delay so the target app registers the clipboard before we paste
    await new Promise(r => setTimeout(r, 60));
    if (WIN) {
        // SendKeys ^v = Ctrl+V
        return _run("powershell", ["-NoProfile", "-Command",
            "Add-Type -AssemblyName System.Windows.Forms; Start-Sleep -Milliseconds 40; [System.Windows.Forms.SendKeys]::SendWait('^v')"]);
    }
    if (MAC) {
        return _run("osascript", ["-e", 'tell application "System Events" to keystroke "v" using command down']);
    }
    if (LINUX) {
        return _run("xdotool", ["key", "--clearmodifiers", "ctrl+v"]);
    }
    return { ok: false, error: "unsupported platform" };
}

// Direct type: emit the characters as keystrokes (ASCII-reliable; Unicode may drop on Win/Mac).
async function _typeDirect(text) {
    if (WIN) {
        // SendKeys treats + ^ % ~ ( ) { } [ ] as special — escape by wrapping each in {}.
        const esc = text.replace(/[+^%~(){}\[\]]/g, (m) => "{" + m + "}").replace(/\r?\n/g, "{ENTER}");
        // pass the (escaped) text through a temp file to avoid any command-line quoting limits
        const tmp = path.join(os.tmpdir(), "swek-type-" + Date.now() + ".txt");
        try { fs.writeFileSync(tmp, esc, "utf8"); } catch (e) { return { ok: false, error: "temp write: " + e.message }; }
        const ps = "Add-Type -AssemblyName System.Windows.Forms; $t=[IO.File]::ReadAllText('" + tmp.replace(/'/g, "''") + "'); [System.Windows.Forms.SendKeys]::SendWait($t)";
        const r = await _run("powershell", ["-NoProfile", "-Command", ps]);
        try { fs.unlinkSync(tmp); } catch {}
        return r;
    }
    if (MAC) {
        // osascript keystroke handles the text arg safely when passed as a separate -e param value.
        return _run("osascript", ["-e", "on run argv", "-e", 'tell application "System Events" to keystroke (item 1 of argv)', "-e", "end run", "--", text]);
    }
    if (LINUX) {
        return _run("xdotool", ["type", "--clearmodifiers", "--", text]);
    }
    return { ok: false, error: "unsupported platform" };
}

// Public: type `text` into the focused app. mode = "auto" | "paste" | "direct".
// auto -> paste for non-ASCII or long text (reliable + fast), direct for short ASCII.
async function typeText(text, opts) {
    text = String(text == null ? "" : text);
    if (!text) return { ok: false, error: "empty text" };
    const mode = (opts && opts.mode) || "auto";
    const nonAscii = /[^\x00-\x7F]/.test(text);
    let use = mode;
    if (mode === "auto") use = (nonAscii || text.length > 120) ? "paste" : "direct";
    const r = use === "paste" ? await _pasteInto(text) : await _typeDirect(text);
    return Object.assign({ mode: use, platform: process.platform, chars: text.length }, r);
}

// Report which mechanism is available on this box (for the UI to show honest capability).
async function status() {
    let tool = WIN ? "SendKeys (built-in)" : MAC ? "osascript keystroke" : LINUX ? "xdotool" : "unsupported";
    let available = WIN || MAC;   // Win/Mac use built-ins; Linux needs xdotool
    let note = "";
    if (LINUX) {
        const r = await _run("which", ["xdotool"]);
        available = r.ok && !!r.out;
        if (!available) note = "install xdotool: sudo apt install xdotool";
    }
    if (MAC) note = "needs Accessibility permission (System Settings -> Privacy -> Accessibility) for the bridge's runtime (Terminal/node)";
    return { ok: true, platform: process.platform, tool, available, note };
}

module.exports = { typeText, status };
