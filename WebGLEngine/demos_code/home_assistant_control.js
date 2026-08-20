// demos_code/home_assistant_control.js — Home Assistant CONTROL panel + Blink
// motion alarm + one-tap actions + an in-world robot reaction. v2.
//
// Talks to the bridge's /ha/* proxy (token stays server-side):
//   GET  /ha/status            is HA reachable?
//   GET  /ha/states[?domain=]  browse entities
//   POST /ha/call              call any service (lights, media_player, scenes…)
//   GET  /ha/stream            SSE motion events (Blink "someone detected")
//
// On a motion event this flashes the panel, panics the robot avatar, fires an
// in-engine toast, and dispatches a global hook so YOUR in-world robot reacts:
//     window.onHaMotion = (ev) => myWorldRobot.setState("alarmed");
//     window.addEventListener("ha-motion", (e) => myWorldRobot.alarm(e.detail));
//
// UNTESTED against a live HA — verify on your box.

let wrap = null, es = null, robotDot = null, robotAvatar = null, alarmTimer = null;

function el(tag, style, text) {
    const e = document.createElement(tag);
    if (style) Object.assign(e.style, style);
    if (text != null) e.textContent = text;
    return e;
}
async function jget(url) { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }
async function jpost(url, body) { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return r.json(); }

function ensureStyles() {
    if (document.getElementById("ha-robot-style")) return;
    const st = document.createElement("style");
    st.id = "ha-robot-style";
    st.textContent =
        "@keyframes haRobotShake{0%,100%{transform:translateX(0) rotate(0)}20%{transform:translateX(-5px) rotate(-7deg)}40%{transform:translateX(5px) rotate(7deg)}60%{transform:translateX(-4px) rotate(-5deg)}80%{transform:translateX(4px) rotate(5deg)}}" +
        "@keyframes haRobotFlash{0%,100%{filter:none}50%{filter:drop-shadow(0 0 14px #f33) brightness(1.5)}}";
    document.head.appendChild(st);
}

function setAlarm(on, label) {
    if (wrap) wrap.style.boxShadow = on ? "0 0 0 2px #f33, 0 0 24px #f33" : "none";
    if (robotDot) {
        robotDot.style.background = on ? "#f33" : "#163";
        robotDot.style.color = on ? "#fff" : "#9f8";
        robotDot.textContent = on ? "🤖 ALARMED" : "🤖 calm";
    }
    if (robotAvatar) {
        const face = robotAvatar.querySelector(".ha-robot-face");
        const lbl = robotAvatar.querySelector(".ha-robot-label");
        if (on) {
            face.textContent = "🤖";
            face.style.animation = "haRobotShake 0.35s linear infinite, haRobotFlash 0.7s ease-in-out infinite";
            lbl.textContent = "⚠ INTRUDER DETECTED" + (label ? " — " + label : "");
            lbl.style.color = "#f55";
            robotAvatar.style.transform = "translateX(-50%) scale(1.15)";
        } else {
            face.style.animation = "none";
            lbl.textContent = "robot: idle";
            lbl.style.color = "#9f8";
            robotAvatar.style.transform = "translateX(-50%) scale(1)";
        }
    }
    if (on) { clearTimeout(alarmTimer); alarmTimer = setTimeout(() => setAlarm(false), 8000); }
}

function onMotion(ev) {
    setAlarm(true, ev.name || ev.entity_id);
    try { window.kpop?.info?.("⚠ MOTION", (ev.name || ev.entity_id) + " — someone detected"); } catch (e) {}
    try { window.onHaMotion?.(ev); } catch (e) {}                                  // <- wire YOUR world robot here
    try { window.dispatchEvent(new CustomEvent("ha-motion", { detail: ev })); } catch (e) {}
}

export default {
    id: "home_assistant_control",
    label: "HOME ASSISTANT — CONTROL + MOTION",
    category: "Home Assistant",
    hint: "Browse HA, one-tap actions, alarm the robot on Blink motion",
    autoplay: false,
    controls: [
        "Status line: whether the bridge can reach HA (needs HA_URL + HA_TOKEN on the bridge)",
        "Set your TV + Blink entity ids once; the action buttons then fire one-tap",
        "Open Blink on TV / Arm / Disarm / Trigger camera — or call any service by hand",
        "Blink motion (binary_sensor *_motion_detected → on) panics the robot + fires 'ha-motion'",
        "Wire your world robot:  window.onHaMotion = (ev) => yourRobot.setState('alarmed')",
    ],

    start() {
        ensureStyles();
        wrap = el("div", {
            position: "absolute", top: "60px", right: "16px", width: "330px",
            maxHeight: "74vh", overflowY: "auto", zIndex: "9300",
            background: "rgba(6,12,24,0.92)", border: "1px solid rgba(120,180,255,0.4)",
            borderRadius: "8px", padding: "10px 12px", color: "#cde",
            font: "11px ui-monospace, monospace", pointerEvents: "auto",
        });
        const title = el("div", { fontWeight: "700", color: "#6cf", marginBottom: "4px" }, "HOME ASSISTANT");
        const statusLine = el("div", { fontSize: "10px", opacity: "0.85", marginBottom: "6px" }, "checking…");
        robotDot = el("div", { display: "inline-block", padding: "2px 8px", borderRadius: "10px", background: "#163", color: "#9f8", fontSize: "10px", marginBottom: "8px" }, "🤖 calm");

        // --- one-tap action config + buttons ---
        const cfgLbl = el("div", { fontSize: "9px", opacity: "0.6", margin: "2px 0" }, "your entities (for the buttons):");
        const tvInput = el("input", { width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: "1px solid #356", color: "#cde", padding: "3px 5px", marginBottom: "3px", fontFamily: "monospace", fontSize: "10px" });
        tvInput.placeholder = "TV: media_player.living_room_tv";
        const blinkInput = el("input", { width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: "1px solid #356", color: "#cde", padding: "3px 5px", marginBottom: "5px", fontFamily: "monospace", fontSize: "10px" });
        blinkInput.placeholder = "Blink: alarm_control_panel.blink_home";

        const presetRow = el("div", { display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px" });
        const actionOut = el("div", { fontSize: "9px", opacity: "0.75", marginBottom: "8px", minHeight: "11px" }, "");

        const fire = async (domain, service, data) => {
            actionOut.textContent = "calling " + domain + "." + service + "…";
            try {
                const r = await jpost("/ha/call", { domain, service, data });
                actionOut.textContent = r.ok ? ("✓ " + domain + "." + service) : ("✗ " + (r.error || "failed"));
            } catch (e) { actionOut.textContent = "✗ " + e.message; }
        };
        const needs = (val, what) => { if (!val) { actionOut.textContent = "set your " + what + " entity above first"; return false; } return true; };

        const mkPreset = (label, fn) => {
            const b = el("div", { flex: "1 1 46%", textAlign: "center", padding: "5px 4px", border: "1px solid #6cf", borderRadius: "3px", cursor: "pointer", background: "rgba(100,200,255,0.1)", fontSize: "10px" }, label);
            b.addEventListener("mouseenter", () => b.style.background = "rgba(100,200,255,0.25)");
            b.addEventListener("mouseleave", () => b.style.background = "rgba(100,200,255,0.1)");
            b.addEventListener("click", fn);
            return b;
        };
        presetRow.appendChild(mkPreset("📺 Blink on TV", () => {
            const tv = tvInput.value.trim(); if (!needs(tv, "TV")) return;
            fire("media_player", "play_media", { entity_id: tv, media_content_type: "app", media_content_id: "com.immediasemi.android.blink" });
        }));
        presetRow.appendChild(mkPreset("📸 Trigger cam", () => {
            const b = blinkInput.value.trim(); if (!needs(b, "Blink")) return;
            fire("blink", "trigger_camera", { entity_id: b });
        }));
        presetRow.appendChild(mkPreset("🔔 Arm", () => {
            const b = blinkInput.value.trim(); if (!needs(b, "Blink")) return;
            fire("alarm_control_panel", "alarm_arm_away", { entity_id: b });
        }));
        presetRow.appendChild(mkPreset("🔕 Disarm", () => {
            const b = blinkInput.value.trim(); if (!needs(b, "Blink")) return;
            fire("alarm_control_panel", "alarm_disarm", { entity_id: b });
        }));

        // --- entity browser ---
        const filter = el("input", { width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: "1px solid #356", color: "#cde", padding: "3px 5px", marginBottom: "6px", fontFamily: "monospace", fontSize: "10px" });
        filter.placeholder = "filter entities…";
        const listBox = el("div", { maxHeight: "180px", overflowY: "auto", marginBottom: "8px", borderTop: "1px solid rgba(120,180,255,0.15)" });

        // --- generic service caller ---
        const svcInput = el("input", { width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: "1px solid #356", color: "#cde", padding: "3px 5px", marginBottom: "4px", fontFamily: "monospace", fontSize: "10px" });
        svcInput.placeholder = "domain.service   e.g. light.toggle";
        const dataInput = el("input", { width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: "1px solid #356", color: "#cde", padding: "3px 5px", marginBottom: "4px", fontFamily: "monospace", fontSize: "10px" });
        dataInput.placeholder = '{"entity_id":"light.lamp"}';
        const callBtn = el("div", { textAlign: "center", padding: "4px", border: "1px solid #6cf", borderRadius: "3px", cursor: "pointer", background: "rgba(100,200,255,0.1)" }, "CALL SERVICE");
        const callOut = el("div", { fontSize: "9px", opacity: "0.75", marginTop: "4px", minHeight: "11px" }, "");
        callBtn.addEventListener("click", async () => {
            const ds = svcInput.value.trim();
            const dot = ds.indexOf(".");
            if (dot < 1) { callOut.textContent = "service must be domain.service"; return; }
            let data = {};
            try { data = dataInput.value.trim() ? JSON.parse(dataInput.value) : {}; }
            catch { callOut.textContent = "data is not valid JSON"; return; }
            callOut.textContent = "calling…";
            try {
                const r = await jpost("/ha/call", { domain: ds.slice(0, dot), service: ds.slice(dot + 1), data });
                callOut.textContent = r.ok ? ("✓ called " + ds) : ("✗ " + (r.error || "failed"));
            } catch (e) { callOut.textContent = "✗ " + e.message; }
        });

        wrap.appendChild(title); wrap.appendChild(statusLine); wrap.appendChild(robotDot);
        wrap.appendChild(cfgLbl); wrap.appendChild(tvInput); wrap.appendChild(blinkInput);
        wrap.appendChild(presetRow); wrap.appendChild(actionOut);
        wrap.appendChild(filter); wrap.appendChild(listBox);
        wrap.appendChild(svcInput); wrap.appendChild(dataInput); wrap.appendChild(callBtn); wrap.appendChild(callOut);
        document.body.appendChild(wrap);

        // --- the in-world robot avatar (concrete reaction; also fires the hook) ---
        robotAvatar = el("div", { position: "absolute", bottom: "22px", left: "50%", transform: "translateX(-50%)", zIndex: "9290", textAlign: "center", pointerEvents: "none", transition: "transform 0.2s" });
        robotAvatar.innerHTML = '<div class="ha-robot-face" style="font-size:48px;line-height:1;">🤖</div>' +
                                '<div class="ha-robot-label" style="font:11px ui-monospace,monospace;color:#9f8;margin-top:2px;">robot: idle</div>';
        document.body.appendChild(robotAvatar);

        jget("/ha/status").then(s => {
            statusLine.textContent = s.available ? ("✓ HA reachable" + (s.version ? " v" + s.version : ""))
                : s.configured ? "✗ HA set but unreachable" : "✗ bridge has no HA_URL/HA_TOKEN";
            statusLine.style.color = s.available ? "#9f8" : "#f88";
        }).catch(() => { statusLine.textContent = "✗ bridge not responding"; statusLine.style.color = "#f88"; });

        let all = [];
        const renderList = () => {
            const q = filter.value.trim().toLowerCase();
            listBox.innerHTML = "";
            const shown = all.filter(e => !q || e.entity_id.toLowerCase().includes(q) || (e.name || "").toLowerCase().includes(q)).slice(0, 200);
            for (const e of shown) {
                const row = el("div", { display: "flex", justifyContent: "space-between", gap: "8px", padding: "2px 3px", cursor: "pointer", borderBottom: "1px solid rgba(120,180,255,0.07)" });
                row.appendChild(el("span", { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, e.name || e.entity_id));
                row.appendChild(el("span", { color: "#9bd", flexShrink: "0" }, String(e.state) + (e.unit || "")));
                row.addEventListener("mouseenter", () => row.style.background = "rgba(100,200,255,0.12)");
                row.addEventListener("mouseleave", () => row.style.background = "transparent");
                row.addEventListener("click", () => {
                    dataInput.value = JSON.stringify({ entity_id: e.entity_id });
                    if (e.domain === "media_player") tvInput.value = e.entity_id;
                    if (e.entity_id.includes("blink") || e.domain === "alarm_control_panel") blinkInput.value = e.entity_id;
                    svcInput.focus();
                });
                listBox.appendChild(row);
            }
            if (!shown.length) listBox.appendChild(el("div", { opacity: "0.5", fontStyle: "italic", padding: "4px" }, "(no entities)"));
        };
        jget("/ha/states").then(list => { all = Array.isArray(list) ? list : []; renderList(); })
            .catch(e => { listBox.appendChild(el("div", { color: "#f88", padding: "4px" }, "states error: " + e.message)); });
        filter.addEventListener("input", renderList);

        try {
            es = new EventSource("/ha/stream");
            es.onmessage = (m) => { let ev; try { ev = JSON.parse(m.data); } catch { return; } if (ev && ev.type === "motion") onMotion(ev); };
            es.onerror = () => { /* EventSource auto-reconnects */ };
        } catch (e) { /* SSE unavailable */ }
    },

    stop() {
        try { es && es.close(); } catch (e) {}
        es = null;
        clearTimeout(alarmTimer);
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
        if (robotAvatar && robotAvatar.parentNode) robotAvatar.parentNode.removeChild(robotAvatar);
        wrap = null; robotDot = null; robotAvatar = null;
    },
};
