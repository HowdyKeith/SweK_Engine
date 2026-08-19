// ui/shieldDebugPanel.js — remote-debug panel for the Nvidia Shield Pro (or any
// Android device on the LAN with wireless ADB enabled).
//
// What this panel can do (all via ADB-over-network through the bridge):
//   - Open the engine URL in the Shield's default browser
//   - Pull a tail of `logcat` so we can see browser/renderer errors
//   - Send an Android intent to open the Blink app on a specific camera
//   - Send keyevents (DPAD nav, BACK, HOME) for headless control
//
// Setup required ONCE on the Shield (the PC's `adb` must be on PATH too):
//   1. Settings → Device Preferences → Developer Options → "Network debugging" ON
//   2. On the PC: `adb connect 192.168.10.114:5555`
//      (Shield runs Android 11; if it prompts for an RSA fingerprint, accept
//      on the TV.) For Android 11 wireless-debug-with-pairing flow, see the
//      "Copy adb pair cmd" button.
//
// Honest framing for the user: if adb isn't installed on the PC or the Shield
// hasn't been paired, every button returns an error. We surface that error
// rather than pretending it worked.

import { joystickSample, knobTransform } from "./joystickCore.js";

function el(t, s, x) {
    const e = document.createElement(t);
    if (s) Object.assign(e.style, s);
    if (x != null) e.textContent = x;
    return e;
}
async function jpost(u, b) {
    const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    return r.json().catch(() => ({ ok: false, error: "non-JSON response" }));
}

const H = { fontWeight: "700", color: "#9f8", fontSize: "11px", margin: "8px 0 3px" };
const DIM = { opacity: "0.7", fontSize: "10px" };
const BTN = {
    padding: "4px 8px",
    border: "1px solid #9f8",
    borderRadius: "3px",
    cursor: "pointer",
    textAlign: "center",
    fontSize: "10px",
    background: "rgba(150,255,150,0.08)",
    margin: "2px 0",
    color: "#cde",
};

export function mountShieldDebugPanel() {
    const root = el("div", {
        width: "280px",
        color: "#cde",
        font: "11px ui-monospace, monospace",
        padding: "4px 4px 8px",
    });

    root.appendChild(el("div", H, "NVIDIA SHIELD DEBUG"));
    root.appendChild(el("div", DIM, "Wireless ADB to the Shield Pro (or any Android on LAN). Setup steps in panel source comments."));

    // IP input — default from your LAN
    const ipRow = el("div", { display: "flex", gap: "4px", marginTop: "6px", alignItems: "center" });
    ipRow.appendChild(el("span", DIM, "IP:"));
    const ip = el("input", {
        flex: "1",
        padding: "3px 4px",
        background: "#0b1422",
        border: "1px solid #356",
        color: "#cde",
        fontSize: "11px",
        fontFamily: "ui-monospace, monospace",
    });
    ip.type = "text";
    ip.value = localStorage.getItem("shieldDebug.ip") || "192.168.10.114";
    ip.placeholder = "192.168.10.114";
    ip.addEventListener("change", () => localStorage.setItem("shieldDebug.ip", ip.value.trim()));
    ipRow.appendChild(ip);
    root.appendChild(ipRow);

    // v734 — saved/named device list. Shares the localStorage key
    // `voxelengine.devices.shield` with the phone control.html so
    // devices saved on the phone show up here too and vice versa.
    const devKey = "voxelengine.devices.shield";
    const devRow = el("div", { display: "flex", gap: "4px", marginTop: "4px", alignItems: "center" });
    devRow.appendChild(el("span", DIM, "Saved:"));
    const devSel = el("select", {
        flex: "1", padding: "2px 4px", background: "#0b1422",
        border: "1px solid #356", color: "#cde", fontSize: "11px",
    });
    devRow.appendChild(devSel);
    const devSaveBtn = el("div", { ...DIM, padding: "2px 6px", cursor: "pointer",
        border: "1px solid #356", borderRadius: "3px", fontSize: "11px" }, "💾");
    devSaveBtn.title = "Save current IP with a name";
    const devDelBtn = el("div", { ...DIM, padding: "2px 6px", cursor: "pointer",
        border: "1px solid #356", borderRadius: "3px", fontSize: "11px" }, "🗑");
    devDelBtn.title = "Delete the selected saved device";
    devRow.appendChild(devSaveBtn);
    devRow.appendChild(devDelBtn);
    root.appendChild(devRow);

    function devLoad(){ try { return JSON.parse(localStorage.getItem(devKey) || "[]"); } catch { return []; } }
    function devSave(list){ try { localStorage.setItem(devKey, JSON.stringify(list)); } catch {} }
    function devRender(){
        const list = devLoad();
        devSel.innerHTML = "";
        const none = el("option"); none.value = ""; none.textContent = "(custom)";
        devSel.appendChild(none);
        list.forEach(d => {
            const o = el("option"); o.value = d.ip; o.textContent = d.name + "  ·  " + d.ip;
            devSel.appendChild(o);
        });
        // Restore selection if current ip matches a saved entry
        const match = list.find(d => d.ip === ip.value.trim());
        devSel.value = match ? ip.value.trim() : "";
    }
    devSel.addEventListener("change", () => {
        if (devSel.value) {
            ip.value = devSel.value;
            localStorage.setItem("shieldDebug.ip", ip.value);
        }
    });
    devSaveBtn.addEventListener("click", () => {
        const v = ip.value.trim();
        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) { setStatus("type a valid IP first", "#f88"); return; }
        const name = prompt("Name for this device:", "Device " + v);
        if (!name) return;
        const list = devLoad();
        const idx = list.findIndex(d => d.ip === v);
        if (idx >= 0) list[idx] = { name, ip: v }; else list.push({ name, ip: v });
        devSave(list); devRender(); devSel.value = v;
        setStatus("saved as " + name, "#9f8");
    });
    devDelBtn.addEventListener("click", () => {
        if (!devSel.value) { setStatus("pick a saved device first", "#fa8"); return; }
        const list = devLoad().filter(d => d.ip !== devSel.value);
        devSave(list); devRender();
        setStatus("deleted", "#9af");
    });
    devRender();

    // Status line
    const status = el("div", { ...DIM, marginTop: "6px", minHeight: "13px" }, "");
    const setStatus = (msg, color) => {
        status.textContent = msg;
        status.style.color = color || "#cde";
    };

    // Output area (for logcat tails etc)
    const out = el("pre", {
        marginTop: "6px",
        maxHeight: "220px",
        overflow: "auto",
        background: "#0a0e15",
        border: "1px solid #356",
        padding: "4px",
        fontSize: "10px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        color: "#bdf",
        display: "none",
    });

    // Helper: send command, wait for response
    async function shieldExec(action, args = {}) {
        const target = (ip.value || "").trim();
        if (!target) { setStatus("enter an IP first", "#f88"); return null; }
        setStatus(`${action}…`, "#9f8");
        try {
            const r = await jpost("/shield/exec", { action, ip: target, ...args });
            if (r?.ok) {
                setStatus(`${action} ✓`, "#9f8");
                return r;
            } else if (r?.adbMissing) {
                // v688 — special-case: adb isn't installed. Surface the install
                // button + the install command in the output pane so the user
                // can either click "Install ADB" or copy/paste themselves.
                setStatus("adb not installed — click 'Install ADB' below", "#fb6");
                out.style.display = "block";
                out.textContent = (r.hint || "") + "\n\nCommand:  " + (r.installCmd || "") +
                    "\nManual:   " + (r.manualDownload || "");
                return r;
            } else {
                setStatus(`✗ ${r?.error || "failed"}`, "#f88");
                return r;
            }
        } catch (e) {
            setStatus(`✗ ${e.message}`, "#f88");
            return null;
        }
    }

    // Helper for the install-adb endpoint (no IP needed since it's a local action)
    async function installAdb() {
        setStatus("installing ADB via winget — may take 30-90s…", "#9f8");
        out.style.display = "block";
        out.textContent = "Running: winget install -e --id Google.PlatformTools\n(takes 30-90 seconds)\n";
        try {
            const r = await jpost("/shield/install-adb", {});
            if (r?.ok) {
                setStatus("ADB installed — RESTART the AI bridge!", "#9f8");
                out.textContent = (r.note || "") + "\n\n--- winget output ---\n" + (r.output || "");
            } else {
                setStatus(`✗ ${r?.error || "install failed"}`, "#f88");
                out.textContent = (r?.hint || r?.error || "") +
                    (r?.manualDownload ? "\n\nManual download:\n" + r.manualDownload : "") +
                    (r?.output ? "\n\n--- output ---\n" + r.output : "");
            }
        } catch (e) {
            setStatus(`✗ ${e.message}`, "#f88");
        }
    }

    // --- Buttons ---
    root.appendChild(el("div", H, "CONNECTION"));

    // v688 — Install ADB button. Hidden until needed in theory but harmless
    // to leave visible; if adb is already installed, winget just no-ops.
    const installAdbBtn = el("div", BTN, "⬇ Install ADB (winget)");
    installAdbBtn.title = "Runs `winget install Google.PlatformTools` on the PC to install Android Platform Tools. After install, restart the AI bridge.";
    installAdbBtn.style.background = "#3a4d2a";
    installAdbBtn.addEventListener("click", () => installAdb());
    root.appendChild(installAdbBtn);

    const connectBtn = el("div", BTN, "🔌 adb connect");
    connectBtn.addEventListener("click", () => shieldExec("connect"));
    root.appendChild(connectBtn);

    const pairBtn = el("div", BTN, "📋 Copy adb pair cmd");
    pairBtn.title = "Android 11+ wireless debugging uses a pair-then-connect flow. Run this in a PC terminal, then enter the pairing code.";
    pairBtn.addEventListener("click", () => {
        const target = (ip.value || "").trim();
        const cmd = `adb pair ${target}:PORT  # find PORT in Shield → Wireless debugging → Pair device with pairing code`;
        navigator.clipboard?.writeText(cmd).then(
            () => setStatus("copied — paste in PC terminal", "#9f8"),
            () => setStatus("clipboard blocked — see cmd above", "#fb6"),
        );
    });
    root.appendChild(pairBtn);

    root.appendChild(el("div", H, "ENGINE → SHIELD"));

    const openEngineBtn = el("div", BTN, "🌐 Open engine on Shield");
    openEngineBtn.title = "Sends an intent to open the engine URL in the Shield's default browser (JioPages if installed).";
    openEngineBtn.addEventListener("click", async () => {
        // Build a LAN URL from the current page so the Shield hits the PC, not localhost.
        const port = location.port || "8787";
        const host = location.hostname === "localhost" ? "" : location.hostname;
        const url = host ? `http://${host}:${port}/` : `http://PC-LAN-IP:${port}/`;
        if (!host) {
            setStatus("open this page via a LAN URL first (see Home Assistant tab → 'open engine here')", "#fb6");
            return;
        }
        await shieldExec("openUrl", { url });
    });
    root.appendChild(openEngineBtn);

    const blinkBtn = el("div", BTN, "📷 Blink → Camera 1");
    blinkBtn.title = "Launches the Blink app on the Shield (camera selection inside the app — Blink doesn't accept deep-link camera args).";
    blinkBtn.addEventListener("click", () => shieldExec("blinkApp"));
    root.appendChild(blinkBtn);

    root.appendChild(el("div", H, "DEBUG"));

    const logcatBtn = el("div", BTN, "🪵 Get logcat tail (browser)");
    logcatBtn.title = "Tail the Android browser/Chromium logcat lines for clues why the engine isn't rendering.";
    logcatBtn.addEventListener("click", async () => {
        const r = await shieldExec("logcat", { lines: 200 });
        if (r?.output) {
            out.style.display = "block";
            out.textContent = r.output.slice(-12000);
        }
    });
    root.appendChild(logcatBtn);

    // v735 — live-streaming logcat via WS. Toggle button: green when
    // streaming, gray when stopped. Lines append + auto-scroll the
    // output area. Cap retained text at ~500 lines so memory doesn't
    // grow unbounded.
    // v737 — filter input above the button.
    const filterRow = el("div", { display: "flex", gap: "4px", marginTop: "4px", alignItems: "center" });
    filterRow.appendChild(el("span", DIM, "Filter:"));
    const filterIn = el("input", {
        flex: "1", padding: "3px 5px", background: "#0b1422",
        border: "1px solid #356", color: "#cde", fontSize: "11px",
        fontFamily: "ui-monospace, monospace",
    });
    filterIn.type = "text";
    filterIn.value = localStorage.getItem("shieldDebug.logcatFilter") || "chromium:V *:S";
    filterIn.placeholder = "chromium:V *:S";
    filterIn.addEventListener("change", () => localStorage.setItem("shieldDebug.logcatFilter", filterIn.value.trim()));
    filterRow.appendChild(filterIn);
    root.appendChild(filterRow);

    const streamBtn = el("div", BTN, "📡 Stream logcat (live)");
    streamBtn.title = "Live-tail the Shield's Chromium logcat over WS. Click again to stop.";
    let streaming = false;
    let streamLines = [];
    const MAX_RETAINED = 500;
    function appendStreamLine(line) {
        streamLines.push(line);
        if (streamLines.length > MAX_RETAINED) streamLines.splice(0, streamLines.length - MAX_RETAINED);
        out.style.display = "block";
        out.textContent = streamLines.join("\n");
        out.scrollTop = out.scrollHeight;
    }
    function getBridge() { return window._wsBridge || null; }
    function sendWs(obj) {
        const br = getBridge();
        if (!br || !br.ws || br.ws.readyState !== 1) { setStatus("WS not connected", "#f88"); return false; }
        try { br.ws.send(JSON.stringify(obj)); return true; } catch { return false; }
    }
    function updateStreamBtn() {
        streamBtn.textContent = streaming ? "⏹ Stop stream" : "📡 Stream logcat (live)";
        streamBtn.style.background = streaming ? "#1a3a1a" : "";
    }
    // Subscribe via WSBridge's typed on() API.
    let _subscribed = false;
    function subscribe() {
        if (_subscribed) return;
        const br = getBridge();
        if (!br) return;
        br.on("shield:logcat:line", (m) => appendStreamLine(m.line));
        br.on("shield:logcat:status", (m) => {
            if (m.ended)        { streaming = false; updateStreamBtn(); setStatus("stream ended (code " + m.code + ")", "#fa8"); }
            else if (m.stopped) { streaming = false; updateStreamBtn(); setStatus("stream stopped", "#9af"); }
            else if (m.ok && m.pid) { setStatus("streaming pid " + m.pid, "#9f8"); }
            else if (m.error)   { streaming = false; updateStreamBtn(); setStatus("stream err: " + m.error, "#f88"); }
        });
        _subscribed = true;
    }
    streamBtn.addEventListener("click", () => {
        const target = (ip.value || "").trim();
        if (!target) { setStatus("enter an IP first", "#f88"); return; }
        subscribe();
        if (streaming) {
            sendWs({ type: "shield:logcat:stop" });
            streaming = false;
        } else {
            streamLines = [];
            out.style.display = "block";
            out.textContent = "(starting stream — first lines will appear shortly)";
            const ok = sendWs({ type: "shield:logcat:start", ip: target, filter: (filterIn.value || "chromium:V *:S").trim() });
            if (ok) streaming = true;
        }
        updateStreamBtn();
    });
    root.appendChild(streamBtn);

    const dumpBtn = el("div", BTN, "📋 Current activity");
    dumpBtn.title = "Which app + activity is on screen right now on the Shield.";
    dumpBtn.addEventListener("click", async () => {
        const r = await shieldExec("currentActivity");
        if (r?.output) {
            out.style.display = "block";
            out.textContent = r.output;
        }
    });
    root.appendChild(dumpBtn);

    const nowPlayingBtn = el("div", BTN, "\uD83C\uDFB5 Now playing");
    nowPlayingBtn.title = "Title from the active media session (works for apps that publish one; YouTube's TV app often doesn't).";
    nowPlayingBtn.addEventListener("click", async () => {
        const r = await shieldExec("mediaSession");
        out.style.display = "block";
        if (r && r.title) out.textContent = "\u25B6 " + r.title;
        else if (r && r.output && r.output.trim()) out.textContent = r.output.trim();
        else out.textContent = "No active media session (the app isn't publishing one).";
    });
    root.appendChild(nowPlayingBtn);

    const ccBtn = el("div", BTN, "\uD83D\uDCAC CC (captions)");
    ccBtn.title = "Sends KEYCODE_CAPTIONS to toggle closed captions. Players that honor the system key will toggle; YouTube's TV app manages CC in its own menu and may ignore this.";
    ccBtn.addEventListener("click", () => shieldExec("key", { keycode: "CAPTIONS" }));
    root.appendChild(ccBtn);

    root.appendChild(el("div", H, "INPUT (headless control)"));

    const inputRow1 = el("div", { display: "flex", gap: "3px", flexWrap: "wrap" });
    const mkKey = (label, key) => {
        const b = el("div", { ...BTN, flex: "1", minWidth: "44px" }, label);
        b.addEventListener("click", () => shieldExec("key", { keycode: key }));
        return b;
    };
    // v3264 -- *** THE PHONE'S STICK, MOUNTED HERE, AND IT IS THE DEFAULT. ***
    // Keith: "the phone remote control for the tv is a better interface, and the full render view in SweK Engine
    // has the old remote with just buttons... the old button view should be left as a panel view choice, but it
    // doesn't have the smooth virtual joystick pad that the phone version does."
    //
    // NOT A PORT -- A MOUNT. v3263 pulled the geometry out of control.html into ui/joystickCore.js precisely so
    // this could be four lines of DOM plus one function call, with ONE definition of what a stick does. A second
    // copy of that arithmetic here would be the defect this project has spent its life removing.
    //
    // *** IT SENDS THROUGH mkKey's OWN PATH -- shieldExec("key", {keycode}) -- NOT A NEW ONE. *** Same endpoint,
    // same payload, same failure handling as the buttons beside it; only the way you point at a direction
    // changes. And the buttons STAY: Keith asked for the old view as a choice, and a stick is worse than a
    // button for a single deliberate press.
    const stickWrap = el("div", { display: "flex", flexDirection: "column", gap: "4px", marginBottom: "6px" });
    const stickTog = el("div", { ...BTN, fontSize: "11px", textAlign: "center", cursor: "pointer" }, "\u25cf Stick \u00b7 on");
    const base = el("div", { position: "relative", width: "132px", height: "132px", margin: "0 auto",
                             borderRadius: "50%", border: "1px solid #2c463a", background: "#0e1512", touchAction: "none" });
    const knob = el("div", { position: "absolute", left: "33px", top: "33px", width: "66px", height: "66px",
                             borderRadius: "50%", background: "#1c3a2a", border: "1px solid #4c8f6a", pointerEvents: "none" });
    base.appendChild(knob);
    stickWrap.appendChild(stickTog); stickWrap.appendChild(base);

    let stickOn = true, pid = null, lastDir = null, loop = null;
    // 10Hz WHILE HELD, MATCHING THE PHONE. A key per pointermove would flood the ADB path; a single key on
    // release would make the stick feel dead. The phone settled on this and disagreeing here would give the two
    // remotes different handling of the same gesture.
    const TICK_MS = 100;
    const sample = (e) => {
        const r = base.getBoundingClientRect();
        const s = joystickSample({ x: e.clientX, y: e.clientY }, r);
        knob.style.transform = knobTransform(s);
        lastDir = s.dir;
    };
    base.addEventListener("pointerdown", (e) => {
        if (!stickOn) return;
        pid = e.pointerId; try { base.setPointerCapture(pid); } catch {}
        sample(e);
        if (!loop) loop = setInterval(() => { if (lastDir) shieldExec("key", { keycode: lastDir }); }, TICK_MS);
    });
    base.addEventListener("pointermove", (e) => { if (pid === e.pointerId && stickOn) sample(e); });
    const release = () => {
        pid = null; lastDir = null; knob.style.transform = "translate(0px,0px)";
        if (loop) { clearInterval(loop); loop = null; }   // A LOOP LEFT RUNNING WOULD KEEP SENDING THE LAST KEY FOREVER
    };
    base.addEventListener("pointerup", release);
    base.addEventListener("pointercancel", release);
    stickTog.addEventListener("click", () => {
        stickOn = !stickOn;
        if (!stickOn) release();
        base.style.opacity = stickOn ? "1" : "0.35";
        stickTog.textContent = stickOn ? "\u25cf Stick \u00b7 on" : "\u25cb Stick \u00b7 off (buttons only)";
    });
    inputRow1.appendChild(mkKey("◀", "DPAD_LEFT"));
    inputRow1.appendChild(mkKey("▲", "DPAD_UP"));
    inputRow1.appendChild(mkKey("▼", "DPAD_DOWN"));
    inputRow1.appendChild(mkKey("▶", "DPAD_RIGHT"));
    inputRow1.appendChild(mkKey("OK", "DPAD_CENTER"));
    inputRow1.appendChild(mkKey("⏎", "ENTER"));
    inputRow1.appendChild(mkKey("←", "BACK"));
    inputRow1.appendChild(mkKey("⌂", "HOME"));
    // THE STICK GOES IN ABOVE THE BUTTON ROW, AND IT IS THE DEFAULT -- which is what Keith asked for. The
    // buttons remain directly beneath it, so the 'old view' is not a mode to find, it is simply still there.
    root.appendChild(stickWrap);
    root.appendChild(inputRow1);

    root.appendChild(status);
    root.appendChild(out);

    root.appendChild(el("div", { ...DIM, marginTop: "8px", fontStyle: "italic" },
        "If buttons fail, adb may not be on the PC's PATH or the Shield isn't paired. Install Android Platform Tools and try 'adb connect' once from a terminal."));

    return { root };
}
