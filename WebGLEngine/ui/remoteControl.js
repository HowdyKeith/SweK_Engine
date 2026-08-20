// ui/remoteControl.js — v520 — 3-way remote control bridge for the phone panel.
//
//   phone  --(control / sensor)-->  relay server  --(broadcast)-->  engine
//   engine --(engineState 2Hz)  -->  relay server  --(broadcast)-->  phone
//
// Receives {type:"control", cmd, args} / {type:"sensor", ...} from the panel and
// dispatches to the engine's window.* actions (demo, weather, water/storms,
// camera movement, kaiju summon). Publishes window.engineSnapshot() back so the
// panel can show live status, the demo list, and a minimap. Auto-reconnects;
// safe no-op outside a browser.
export function initRemoteControl() {
    if (typeof WebSocket === "undefined" || typeof location === "undefined") return;
    let ws = null, retry = 0, alive = false, pubTimer = null;
    let _lastPhone = 0, _badge = null, _presenceTimer = null;   // v522 — phone link indicator
    const _roster = new Map();   // v527 — id → { role, name, last } across connected phones

    // v522 — a "phone linked" status badge on the engine screen. Shown while a
    // phone control panel has pinged within the last 8s.
    function ensureBadge() {
        if (_badge || typeof document === "undefined") return _badge;
        _badge = document.createElement("div");
        _badge.id = "phone-link-badge";
        Object.assign(_badge.style, {
            position: "fixed", top: "8px", left: "50%", transform: "translateX(-50%)", zIndex: "10040",
            display: "none", alignItems: "center", gap: "6px", font: "12px system-ui,sans-serif",
            color: "#dffced", background: "rgba(28,94,58,0.85)", border: "1px solid #2c8c57",
            borderRadius: "13px", padding: "4px 11px", pointerEvents: "none", boxShadow: "0 2px 10px rgba(0,0,0,.4)",
        });
        _badge.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#5ef0a0;box-shadow:0 0 8px #5ef0a0;display:inline-block"></span><span class="pl-text" style="color:#dffced">📱 phone linked</span>';
        try { document.body.appendChild(_badge); } catch {}
        return _badge;
    }
    // v527 — multi-phone roster (id → {role,name,last}) drives the badge text.
    const _roleLabel = { commander: "🎥 Commander", builder: "🏗 Builder", kaiju: "🦖 Kaiju", observer: "👁 Observer" };
    function updateBadge() {
        const b = ensureBadge(); if (!b) return;
        const now = Date.now();
        const parts = [];
        for (const [id, r] of _roster) {
            if (now - r.last > 8000) { _roster.delete(id); continue; }
            parts.push((_roleLabel[r.role] || r.role) + (r.name ? " · " + r.name : ""));
        }
        let any = parts.length > 0;
        if (!any && (now - _lastPhone) < 8000) { any = true; parts.push("phone linked"); }
        b.style.display = any ? "inline-flex" : "none";
        if (any) { const t = b.querySelector(".pl-text"); if (t) t.textContent = "📱 " + parts.join("   "); }
    }

    // Role gating: only a commander pilots the camera; builder/kaiju affect the
    // world but can't fight over the view; observer just watches.
    const _PILOT = new Set(["move", "look", "movevec", "orient", "freelook", "lookvec", "fire", "jump"]);   // v1410 — phone gamepad cmds
    const _UNIVERSAL = new Set(["ping", "role", "cast:start", "cast:stop", "cast:shot", "cheer"]);
    function _roleAllows(role, cmd) {
        if (_UNIVERSAL.has(cmd)) return true;
        role = role || "commander";
        if (role === "observer") return false;
        if (role === "commander") return true;
        return !_PILOT.has(cmd);   // builder / kaiju: world-affecting yes, piloting no
    }
    if (typeof window !== "undefined") window.phoneRoster = () => Array.from(_roster.entries()).map(([id, r]) => ({ id, role: r.role, name: r.name, agoMs: Date.now() - r.last }));

    // camera nudges (work in free-look / observer modes; a demo's scripted
    // camera may override them each frame)
    function applyMove(dir, amt) {
        const c = window.camera; if (!c?.position) return;
        const yaw = c.yaw || 0;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);   // forward (yaw 0 = -Z)
        const rx =  Math.cos(yaw), rz = -Math.sin(yaw);   // strafe right
        if      (dir === "forward") { c.position.x += fx * amt; c.position.z += fz * amt; }
        else if (dir === "back")    { c.position.x -= fx * amt; c.position.z -= fz * amt; }
        else if (dir === "left")    { c.position.x -= rx * amt; c.position.z -= rz * amt; }
        else if (dir === "right")   { c.position.x += rx * amt; c.position.z += rz * amt; }
        else if (dir === "up")      { c.position.y += amt; }
        else if (dir === "down")    { c.position.y -= amt; }
    }
    // v525 — analog joystick: move in the camera's facing plane by a 2D vector
    // (fwd/strafe each -1..1), so diagonals and variable speed work smoothly.
    function applyMoveVec(fwd, strafe) {
        const c = window.camera; if (!c?.position) return;
        const yaw = c.yaw || 0;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const rx =  Math.cos(yaw), rz = -Math.sin(yaw);
        c.position.x += fx * fwd + rx * strafe;
        c.position.z += fz * fwd + rz * strafe;
    }
    function applyLook(dir, amt) {
        const c = window.camera; if (!c) return;
        if      (dir === "left")  c.yaw = (c.yaw || 0) + amt;
        else if (dir === "right") c.yaw = (c.yaw || 0) - amt;
        else if (dir === "up")    c.pitch = Math.max(-1.5, Math.min(1.5, (c.pitch || 0) + amt));
        else if (dir === "down")  c.pitch = Math.max(-1.5, Math.min(1.5, (c.pitch || 0) - amt));
    }

    const dispatch = (cmd, a = {}) => {
        switch (cmd) {
            case "demo:next":    window.demoManager?.cycle?.(); break;
            case "demo:random":  window.demoManager?.setById?.("dealer_choice"); break;
            case "demo:set":     if (a.id) window.demoManager?.setById?.(a.id); break;
            case "demo:action":  try { window.demoManager?.fireAction?.(a.id, a); } catch (e) {} break;   // v1411 — per-demo remote control button
            case "demo:pause":   window.demoManager?.pause?.(); break;
            case "demo:resume":  window.demoManager?.resume?.(); break;
            case "demo:stop":    window.demoManager?.stopDemo?.(); break;
            case "demo:close":   window.demoManager?.close?.(); break;
            // v765 — execute a console line on the PC engine. Used by the
            // phone's PHONE_DEMOS list to fire console-only features that
            // aren't proper demos (asteroids, missileCommand, etc). Runs
            // the line as an expression in window scope. Keep this OFF
            // for production deployments — anyone on the WS bridge gets
            // arbitrary engine API access. For our LAN-only use it's fine.
            case "console:exec": {
                if (!a.line || typeof a.line !== "string") break;
                try {
                    // eslint-disable-next-line no-new-func
                    const result = new Function(`return (${a.line});`)();
                    console.log(`[remoteControl] console:exec "${a.line}" →`, result);
                } catch (e) {
                    console.warn(`[remoteControl] console:exec failed "${a.line}":`, e.message);
                }
                break;
            }
            // v754 — kaiju attacks city demo phone hooks. The demo's API
            // (window.cityAttack) is only present when the demo is the
            // active one; commands no-op otherwise so the phone can fire
            // them blindly without checking state.
            case "city:fly":     try { window.cityAttack?.flyThrough?.(); } catch {} break;
            case "city:flystop": try { window.cityAttack?.flyStop?.();    } catch {} break;
            case "city:reset":   try { window.cityAttack?.reset?.();      } catch {} break;
            case "city:tank":    try { window.cityAttack?.spawnTank?.();  } catch {} break;
            case "city:plane":   try { window.cityAttack?.spawnPlane?.(); } catch {} break;
            case "city:hunt":    try { window.cityAttack?.toggleHuntMode?.(); } catch {} break;
            // v704 — phone Launch Mode "PC background". Phone sends
            // {cmd:"engine:bgmode", args:{on:true|false}} alongside demo:set.
            // When on, PC hides its canvas + shows a centered "Background
            // Rendering Mode" overlay so the demo can run without monopolizing
            // the screen — useful if the user is using the PC for other work
            // or wants to view the demo only via cast/spectator. The engine
            // RAF loop, demoManager, and spectatorCast all keep running.
            case "engine:bgmode": {
                const on = a.on === true;
                if (!window._engineBgOverlay) {
                    const ov = document.createElement("div");
                    ov.id = "ve-bgmode-overlay";
                    Object.assign(ov.style, {
                        position: "fixed", inset: "0", zIndex: "99500",
                        background: "#0a0e16", color: "#9bf",
                        display: "none", alignItems: "center", justifyContent: "center",
                        fontFamily: "ui-monospace, Menlo, monospace", flexDirection: "column",
                        pointerEvents: "none",
                    });
                    ov.innerHTML =
                        '<div style="font-size:28px; letter-spacing:0.2em; opacity:0.85;">⌁ BACKGROUND RENDERING MODE ⌁</div>' +
                        '<div style="font-size:13px; color:#789; margin-top:14px;">Engine, demos, and casting are running.</div>' +
                        '<div style="font-size:13px; color:#789; margin-top:4px;">Phone can toggle back via the Demos tab.</div>' +
                        '<div style="font-size:11px; color:#456; margin-top:12px;">spectator: /spectator.html · cast available · Ctrl+Shift+B exits</div>';
                    document.body.appendChild(ov);
                    window._engineBgOverlay = ov;
                    // Keyboard escape hatch (PC-side, in case phone disconnects)
                    window.addEventListener("keydown", (e) => {
                        if (e.ctrlKey && e.shiftKey && (e.key === "B" || e.key === "b")) {
                            window._engineBgOverlay.style.display = "none";
                            const cv = document.querySelector("canvas");
                            if (cv) cv.style.visibility = "";
                        }
                    });
                }
                const cv = document.querySelector("canvas");
                if (on) {
                    if (cv) cv.style.visibility = "hidden";
                    window._engineBgOverlay.style.display = "flex";
                } else {
                    if (cv) cv.style.visibility = "";
                    window._engineBgOverlay.style.display = "none";
                }
                break;
            }
            case "weather":      if (window.weatherSystem) { window.weatherSystem.state = a.state || "clear"; window.weatherSystem._stateAge = 0; } break;
            case "flashflood":   window.flashFlood?.(); break;
            case "vortex":       window.vortex?.[a.kind || "tornado"]?.(); break;
            case "buoy:drop":    window.buoy?.raftHere?.(6, a.kind || "log"); break;
            case "waterfalls":   window.waterfall?.(a.on !== false); break;
            case "summon":       window.summon?.(a.kind || "sky"); break;
            case "freelook":     window.camera?.setMode?.("observer"); break;   // v521 — detach scripted camera
            case "ping":         break;   // v522 — phone presence heartbeat (tracked in the message handler)
            case "screenwall":   window.screenWall?.placeWall?.(); break;   // v523 — build an in-world video wall
            case "cast:start":   window.spectatorCast?.start?.({ fps: a.fps || 6, quality: a.quality || 0.5 }); break;   // v524 — stream engine view to the phone
            case "cast:stop":    window.spectatorCast?.stop?.(); break;
            case "cast:shot":    try { window.spectatorCast?.shot?.(a || {}); } catch (e) {} break;   // v1219 — full-res grab -> bridge
            case "cheer":        try { if (a && a.on === false) window.cheerleader?.stop?.(); else if (a && a.on === true) window.cheerleader?.start?.(); else window.cheerleader?.toggle?.(); } catch (e) {} break;   // v1222 — remote cheerleader toggle
            case "build":        window.builder?.place?.(a.voxel, a.mode, a.at); break;   // v528 — build palette
            case "irl":          window.irl?.sync?.(); break;   // v532 — match real-world daylight + weather
            case "kaijuweather": window.kaijuWeather?.strike?.(); break;   // v533/534 — kaiju matched to real weather + fires its attack
            case "caves:populate": window.caves?.populate?.(); break;   // v534 — spawn cave-dwellers
            case "caves:goto":     window.caves?.goto?.(); break;
            case "move":         applyMove(a.dir, a.amt || 2); break;
            case "movevec":      applyMoveVec((a.fwd || 0) * (a.amt || 1.2), (a.strafe || 0) * (a.amt || 1.2)); break;   // v525 — analog stick
            case "look":         applyLook(a.dir, a.amt || 0.12); break;
            case "orient":       if (window.camera && a.yaw != null) { window.camera.yaw = a.yaw; if (a.pitch != null) window.camera.pitch = Math.max(-1.5, Math.min(1.5, a.pitch)); } break;
            case "lookvec":      if (window.camera) { var _aim = (a.amt != null ? a.amt : (window._phoneAimAmt || 0.05)); window.camera.yaw -= (a.dx || 0) * _aim; window.camera.pitch = Math.max(-1.5, Math.min(1.5, (window.camera.pitch || 0) - (a.dy || 0) * _aim)); } break;   // v1410 — analog look stick
            case "fire":         try { if (window.fpsShooter && window.fpsShooter.active && window.fpsShooter.fire) window.fpsShooter.fire(); } catch (e) {} break;   // v1410 — phone fire -> FPS
            case "jump":         try { if (window.camera && window.camera.keys) { window.camera.keys.add("Space"); setTimeout(function () { try { window.camera.keys.delete("Space"); } catch (e) {} }, 130); } } catch (e) {} break;   // v1410 — phone jump
            case "voice":        handleVoice(a.text); break;   // v529 — phone mic → command grammar / AI
            // v719 — phone tama meter clicks now actually mutate the PC
            // tamagotchi sim. The stats flow back to the phone via
            // state.tama on the next engineSnapshot tick, so the donut
            // gauges sync automatically — the visual heart burst on the
            // phone is the local immediate-feedback layer; the gauge
            // change comes from PC->phone state sync.
            case "tama:feed":  window._tamagotchi?._action?.("feed");  break;
            case "tama:play":  window._tamagotchi?._action?.("play");  break;
            case "tama:sleep": window._tamagotchi?._action?.("sleep"); break;
            case "tama:pet":   window._tamagotchi?._action?.("pet");   break;
            // v720 — phone 🔇 left-dock icon. Single tap toggles PC audio.
            // Implementation: check current state via window._audioMuted
            // (set by muteAllAudio), call the appropriate function.
            case "audio:mute":   window.muteAllAudio?.();   break;
            case "audio:unmute": window.unmuteAllAudio?.(); break;
            case "audio:toggle": window.toggleMuteAll?.();  break;
            default: return;
        }
        if (cmd !== "move" && cmd !== "look" && cmd !== "orient" && cmd !== "movevec") { try { window.kpop?.info?.("Remote", a.label || cmd); } catch {} }
    };

    // v529 — voice grammar: a transcript from the phone mic maps to existing
    // commands; anything unmatched is sent to the AI (window.ai.chat) and the
    // reply is spoken via the avatar. Reuses dispatch so role gating already
    // applied (voice is a non-pilot command).
    function handleVoice(text) {
        const t = String(text || "").toLowerCase().trim();
        if (!t) return;
        const say = (m) => { try { window.kpop?.info?.("🎙 voice", m); } catch {} };
        if (/\bsnow\b/.test(t))                         { dispatch("weather", { state: "snow" }); return say("snow"); }
        if (/\bstorm\b/.test(t))                        { dispatch("weather", { state: "storm" }); return say("storm"); }
        if (/\brain\b/.test(t))                         { dispatch("weather", { state: "rain" }); return say("rain"); }
        if (/\b(clear|sunny|stop the rain|stop rain)\b/.test(t)) { dispatch("weather", { state: "clear" }); return say("clear skies"); }
        if (/\b(tornado|twister)\b/.test(t))            { dispatch("vortex", { kind: "tornado" }); return say("tornado"); }
        if (/\bwhirlpool\b/.test(t))                    { dispatch("vortex", { kind: "whirlpool" }); return say("whirlpool"); }
        if (/\bwaterspout\b/.test(t))                   { dispatch("vortex", { kind: "waterspout" }); return say("waterspout"); }
        if (/\b(cyclone|hurricane)\b/.test(t))          { dispatch("vortex", { kind: "cyclone" }); return say("cyclone"); }
        if (/\bflood\b/.test(t))                        { dispatch("flashflood", {}); return say("flash flood"); }
        if (/\b(kaiju|monster|godzilla)\b/.test(t)) {
            const kind = /\bspace\b/.test(t) ? "space" : /\bwater\b/.test(t) ? "water" : /\b(hell|demon)\b/.test(t) ? "hell" : /\b(tech|robot)\b/.test(t) ? "tech" : "sky";
            dispatch("summon", { kind }); return say("summon " + kind + " kaiju");
        }
        if (/\bnext demo\b/.test(t))                    { dispatch("demo:next", {}); return say("next demo"); }
        if (/\b(pause|stop) demo\b/.test(t))            { dispatch("demo:pause", {}); return say("pause demo"); }
        if (/\bresume demo\b/.test(t))                  { dispatch("demo:resume", {}); return say("resume demo"); }
        if (/\bfree ?look\b/.test(t))                   { dispatch("freelook", {}); return say("free-look"); }
        if (/\bscreen wall\b/.test(t))                  { dispatch("screenwall", {}); return say("screen wall"); }
        if (/\bwaterfall/.test(t))                      { dispatch("waterfalls", { on: true }); return say("waterfalls on"); }
        if (/\b(place|build)\b/.test(t)) {
            const v = /\bstone\b/.test(t) ? 1 : /\bdirt\b/.test(t) ? 2 : /\bgrass\b/.test(t) ? 3 : /\bsand\b/.test(t) ? 4 : /\bsnow\b/.test(t) ? 5 : /\bwater\b/.test(t) ? 10 : /\blava\b/.test(t) ? 12 : 1;
            const mode = /\b(pillar|tower)\b/.test(t) ? "pillar" : /\b(platform|floor)\b/.test(t) ? "platform" : /\bwall\b/.test(t) ? "wall" : "block";
            dispatch("build", { voxel: v, mode }); return say("build " + mode);
        }
        speakToAI(t);   // no command matched → ask the AI
    }
    function speakToAI(text) {
        try {
            if (window.ai?.chat) {
                try { window.kpop?.info?.("🎙 → AI", text); } catch {}
                Promise.resolve(window.ai.chat("gemini", text)).then((resp) => {
                    const reply = typeof resp === "string" ? resp : (resp?.text || resp?.reply || "");
                    if (reply) {
                        try { window._faceAvatar?.speak?.(reply); } catch {}
                        try { window.voice?.speak?.(reply); } catch {}
                        try { window.kpop?.info?.("🤖", reply.slice(0, 140)); } catch {}
                    } else { try { window.kpop?.info?.("🤖", "(no reply — set a key: ai.keyStatus())"); } catch {} }
                }).catch((e) => { try { window.kpop?.info?.("🤖", "AI error: " + (e?.message || "no key?")); } catch {} });
            } else {
                try { window.kpop?.info?.("🎙 heard", text + "  (no AI bridge — ai.setKey to enable replies)"); } catch {}
            }
        } catch (e) { console.warn("[voice→AI]", e?.message); }
    }

    const publish = () => {
        if (!alive || ws?.readyState !== 1 || typeof window.engineSnapshot !== "function") return;
        try { ws.send(JSON.stringify({ type: "engineState", state: window.engineSnapshot() })); } catch {}
    };

    const connect = () => {
        const wsUrl = (location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host;   // v521 — WSS over HTTPS
        try { ws = new WebSocket(wsUrl); }
        catch (e) { console.warn("[remoteControl] ws failed:", e?.message); return; }
        ws.addEventListener("open", () => {
            alive = true; retry = 0;
            console.log("[remoteControl] connected — phone panel can drive + observe this engine");
            clearInterval(pubTimer); pubTimer = setInterval(publish, 500);   // 2 Hz state
            clearInterval(_presenceTimer); _presenceTimer = setInterval(updateBadge, 1500);   // v522 — link badge
        });
        ws.addEventListener("close", () => { alive = false; clearInterval(pubTimer); clearInterval(_presenceTimer); _lastPhone = 0; updateBadge(); retry = Math.min(retry + 1, 6); setTimeout(connect, 800 * retry); });
        ws.addEventListener("error", () => { try { ws.close(); } catch {} });
        ws.addEventListener("message", (e) => {
            let m; try { m = JSON.parse(e.data); } catch { return; }
            if (!m) return;
            // any message from a phone (commands / sensors / cam) marks it present
            if (m.type === "control" || m.type === "sensor" || m.type === "phoneCam") {
                _lastPhone = Date.now();
                if (m.id) _roster.set(m.id, { role: m.role || "commander", name: m.name || "", last: Date.now() });
                updateBadge();
            }
            if (m.type === "control" && m.cmd) {
                if (_roleAllows(m.role, m.cmd)) { try { dispatch(m.cmd, m.args || {}); } catch (err) { console.warn("[remoteControl]", err?.message); } }
            }
            else if (m.type === "sensor" && m.kind === "orient") {
                if (_roleAllows(m.role, "orient")) dispatch("orient", { yaw: m.yaw, pitch: m.pitch });
            }
            else if (m.type === "phoneCam" && m.data) { showPhoneCam(m.data); }
            // v647 — viewer:spawn message from the standalone GLB viewer's
            // "Send to engine" button. Registers the mesh in assetLoader
            // under the supplied kind (or auto-named from the URL) and
            // spawns it at the camera. Broadcast to ALL clients by the
            // bridge — the engine page reacts, phones silently ignore.
            else if (m.type === "viewer:spawn" && m.url) {
                try {
                    const url = String(m.url);
                    let kind = m.kind || ("viewer_" + (url.split("/").pop() || "asset").replace(/\.glb$/i, "").replace(/[^\w]+/g, "_"));
                    if (window.assetLoader?.swapMesh) {
                        window.assetLoader.swapMesh(kind, url).then(() => {
                            const id = window.anim?.spawn?.(0, 0, 1.6, kind);
                            console.log(`[viewer:spawn] ${kind} from ${url} → entity ${id}`);
                            try { if (window._kpAnnounceAssetLoaded) window._kpAnnounceAssetLoaded(kind + " (viewer)"); } catch {}
                        }).catch(err => console.warn("[viewer:spawn] swapMesh failed:", err?.message));
                    }
                } catch (err) { console.warn("[viewer:spawn] dispatch failed:", err?.message); }
            }
        });
    };
    connect();
    window.remoteControl = { connected: () => alive, publish };
}

// v521 — show the phone camera feed in a small draggable HUD <img> on the
// engine. Created lazily on the first frame; click the × to dismiss.
let _camHud = null, _camImg = null;
function showPhoneCam(dataUrl) {
    if (typeof document === "undefined") return;
    if (!_camHud) {
        _camHud = document.createElement("div");
        Object.assign(_camHud.style, { position: "fixed", right: "12px", bottom: "12px", zIndex: "10050",
            width: "200px", border: "2px solid #2f628f", borderRadius: "8px", overflow: "hidden",
            background: "#000", boxShadow: "0 4px 18px rgba(0,0,0,.5)", cursor: "move" });
        const bar = document.createElement("div");
        bar.textContent = "📷 phone cam ×";
        Object.assign(bar.style, { font: "12px system-ui", color: "#cde", background: "#173656", padding: "3px 7px", display: "flex", justifyContent: "space-between" });
        bar.addEventListener("click", (e) => { if (e.offsetX > bar.clientWidth - 24) { _camHud.remove(); _camHud = null; } });
        _camImg = document.createElement("img");
        Object.assign(_camImg.style, { display: "block", width: "100%" });
        _camHud.appendChild(bar); _camHud.appendChild(_camImg);
        document.body.appendChild(_camHud);
        // simple drag
        let dx = 0, dy = 0, drag = false;
        bar.addEventListener("pointerdown", (e) => { drag = true; dx = e.clientX; dy = e.clientY; _camHud.style.right = "auto"; _camHud.style.bottom = "auto"; const r = _camHud.getBoundingClientRect(); _camHud.style.left = r.left + "px"; _camHud.style.top = r.top + "px"; });
        window.addEventListener("pointermove", (e) => { if (!drag) return; _camHud.style.left = (_camHud.offsetLeft + (e.clientX - dx)) + "px"; _camHud.style.top = (_camHud.offsetTop + (e.clientY - dy)) + "px"; dx = e.clientX; dy = e.clientY; });
        window.addEventListener("pointerup", () => { drag = false; });
    }
    _camImg.src = dataUrl;
    try { window.screenWall?.setSource?.(dataUrl); } catch {}   // v523 — also drive the in-world video wall
}
