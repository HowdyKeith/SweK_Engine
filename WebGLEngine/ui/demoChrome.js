import { backoffDelay, onConnectivityRegained } from "../net/wsReconnect.js";
// FILE: ui/demoChrome.js
// VERSION: v883 — "Demo Chrome" arc R1 — unified status chrome scaffold.
//
// A single floating status panel injected into EVERY demo's view. It is
// dependency-free on purpose: it reads localStorage stores directly and
// opens its own bridge WebSocket, so it works whether it is (a) imported
// by a full-engine page, (b) self-mounted by a standalone demo .html, or
// (c) injected into an iframe's document by universal-viewer.html. The
// module auto-mounts on load and guards against double-mount.
//
// Layout (top-right column, mirrors PipAvatar.js / the PC KPop LISTENER
// panel that the user already knows):
//
//   ┌───────────────────────────────┐
//   │ ● DEMO NAME            (pill)  │   orange status pill
//   ├───────────────────────────────┤
//   │ [stamp] ( g1 ) ( g2 ) ( g3 )   │   avatar stamp + up to 3 gauges
//   │ ‹ ticker scrolls here ………… ›  │   ticker (global engine log)
//   └───────────────────────────────┘
//
// R1 SCOPE (this round): the scaffold only.
//   - Avatar stamp = a tinted placeholder tile (live GLB is a later round).
//   - Gauges = SVG rings with STATIC placeholder values (no providers yet;
//     R2 wires battery / CPU / RAM / email). The chosen `source` is stored
//     and shown as the gauge label, but the % is a placeholder.
//   - Ticker = REAL global engine log via the bridge `debug:line` stream
//     (server.js debug fanout, with backlog replay), blended with the
//     occasional "Keith needs a job" line. tickerSource local/global/both
//     selects which streams feed it.
//
// Settings live in localStorage "voxelEngine.demoChrome" and are edited
// from the Settings → "Avatar Settings" tab (registered in main.js).

(function mountDemoChrome() {
    "use strict";

    // ── Idempotent guard ────────────────────────────────────────────
    // Choice C means the same page can be reached by self-mount AND by a
    // viewer injection. Only the first mount wins.
    try {
        if (window.__demoChromeMounted) return;
        window.__demoChromeMounted = true;
    } catch { /* no window? bail */ return; }

    // ── Setting keys (shared with the rest of the engine) ────────────
    const LS_SETTINGS    = "voxelEngine.demoChrome";
    const LS_FAVORITES   = "voxelEngine.kpopFavorites";
    const LS_COSTUMES    = "voxelEngine.avatarCostumes";

    // Named ring colors offered in the settings select → hex.
    const RING_COLORS = {
        cyan:   "#5ac8ff",
        amber:  "#ffa84c",
        green:  "#5fd886",
        red:    "#ff6b6b",
        violet: "#b07bff",
        white:  "#e8eefc",
    };

    // v886 — sources that render as a raw COUNT (mapped onto the ring),
    // not a 0-100 percent. Everything else is a percent.
    const COUNT_SOURCES = new Set(["email"]);   // render as N, not N%
    const COUNT_RING_SCALE = 12;                // count → ring%: min(100, n*scale)

    // ── Defaults ─────────────────────────────────────────────────────
    function defaultSettings() {
        return {
            enabled: true,
            liveStamp: true,              // v885 — render a live mini GLB in the stamp
            stage: true,                  // v891 — single-canvas 3D stage (avatar + 3D gauges)
            stageHeight: 84,              // v891 — stage canvas height px (adjustable per device)
            stageScene: "diorama",        // v895 — "diorama" | "wave" | "cradle" | "bird" | "screen" | "carrier"
            stageCarrier: "boat",         // v898 — which OGRE carrier in the "carrier" scene
            stageAvatar2: "RobotWoman",    // v928 — second avatar for the "duo" scene
            // v1529 — worn/held GLB accessories: tag a GLB "accessory" in the library, then attach it to a bone here.
            accessories: {
                head: { on: false, url: "", scale: 1, lift: 0,    fwd: 0               },
                hand: { on: false, url: "", scale: 1, lift: 0,    fwd: 0, side: "right" },
                foot: { on: false, url: "", scale: 1, lift: 0.02, fwd: 0, side: "right" },
            },
            avatar: null,                 // null → first favorite, else built-in
            gauges: [
                { source: "battery", color: "cyan",  showPct: true,  stageStyle: "ring"   },
                { source: "cpu",     color: "amber", showPct: true,  stageStyle: "gyro"   },
                { source: "ram",     color: "green", showPct: false, stageStyle: "barrel" },
            ],
            tickerSpeed: 40,              // px/sec
            tickerSource: "global",       // "local" | "global" | "both"
        };
    }

    function readSettings() {
        const d = defaultSettings();
        try {
            const raw = JSON.parse(localStorage.getItem(LS_SETTINGS) || "null");
            if (raw && typeof raw === "object") {
                if (typeof raw.enabled === "boolean") d.enabled = raw.enabled;
                if (typeof raw.liveStamp === "boolean") d.liveStamp = raw.liveStamp;
                if (typeof raw.stage === "boolean") d.stage = raw.stage;
                if (Number.isFinite(raw.stageHeight)) d.stageHeight = Math.max(40, Math.min(560, raw.stageHeight));
                if (["diorama","studio","wave","cradle","bird","screen","carrier","sinkingship","duo","guest","boids","pendulum","gears","asteroids"].includes(raw.stageScene)) d.stageScene = raw.stageScene;
                if (["boat","sub","flying"].includes(raw.stageCarrier)) d.stageCarrier = raw.stageCarrier;
                if (typeof raw.stageAvatar2 === "string" && raw.stageAvatar2) d.stageAvatar2 = raw.stageAvatar2;
                if (raw.accessories && typeof raw.accessories === "object") {   // v1529
                    for (const slot of ["head", "hand", "foot"]) {
                        const rs = raw.accessories[slot];
                        if (rs && typeof rs === "object") {
                            d.accessories[slot] = {
                                on:    typeof rs.on === "boolean" ? rs.on : d.accessories[slot].on,
                                url:   typeof rs.url === "string" ? rs.url : d.accessories[slot].url,
                                scale: Number.isFinite(rs.scale) ? rs.scale : d.accessories[slot].scale,
                                lift:  Number.isFinite(rs.lift)  ? rs.lift  : d.accessories[slot].lift,
                                fwd:   Number.isFinite(rs.fwd)   ? rs.fwd   : d.accessories[slot].fwd,
                                side:  (rs.side === "left" || rs.side === "right") ? rs.side : (d.accessories[slot].side || "right"),
                            };
                        }
                    }
                }
                if (typeof raw.avatar === "string" || raw.avatar === null) d.avatar = raw.avatar;
                if (Array.isArray(raw.gauges)) {
                    for (let i = 0; i < 3; i++) {
                        if (raw.gauges[i] && typeof raw.gauges[i] === "object") {
                            d.gauges[i] = {
                                source:  raw.gauges[i].source  ?? d.gauges[i].source,
                                color:   raw.gauges[i].color   ?? d.gauges[i].color,
                                showPct: raw.gauges[i].showPct ?? d.gauges[i].showPct,
                                stageStyle: raw.gauges[i].stageStyle ?? d.gauges[i].stageStyle,
                            };
                        }
                    }
                }
                if (Number.isFinite(raw.tickerSpeed)) d.tickerSpeed = raw.tickerSpeed;
                if (["local", "global", "both"].includes(raw.tickerSource)) d.tickerSource = raw.tickerSource;
            }
        } catch { /* defaults */ }
        return d;
    }

    // Resolve which avatar the stamp should represent: the configured one,
    // else the first favorite, else a built-in fallback. Returns {label, tint}.
    function resolveAvatar(settings) {
        let url = settings.avatar;
        let label = "AVATAR";
        try {
            const favs = JSON.parse(localStorage.getItem(LS_FAVORITES) || "[]");
            if (!url && Array.isArray(favs) && favs.length) url = favs[0].url;
            if (url && Array.isArray(favs)) {
                const f = favs.find(x => x && x.url === url);
                if (f) label = f.label || url;
            }
        } catch { /* ignore */ }
        if (url && label === "AVATAR") {
            label = (url.split("/").pop() || url).replace(/\.(glb|gltf)$/i, "");
        }
        if (!url) { url = "RobotExpressive"; label = "RobotExpressive"; }

        // Costume tint gives the placeholder tile a per-avatar color so the
        // stamp at least reflects the chosen costume until live GLB lands.
        let tint = [0.45, 0.6, 0.95];
        try {
            const costumes = JSON.parse(localStorage.getItem(LS_COSTUMES) || "{}");
            const key = costumes[url];
            // We only have the costume KEY here, not its RGB (that lives in
            // avatarCostumes.js). Map the common keys to a representative hue
            // so the scaffold reads correctly; the live-GLB round will use
            // the real tinted render instead.
            const KEY_HUE = {
                native: [0.45, 0.6, 0.95], blue: [0.30, 0.55, 1.0], red: [0.85, 0.30, 0.32],
                gold: [0.95, 0.78, 0.30], green: [0.35, 0.80, 0.45], violet: [0.70, 0.45, 1.0],
                pink: [1.0, 0.55, 0.78], shadow: [0.30, 0.32, 0.40], emerald: [0.20, 0.75, 0.55],
                sunset: [1.0, 0.55, 0.30],
            };
            if (key && KEY_HUE[key]) tint = KEY_HUE[key];
        } catch { /* ignore */ }

        const short = (label || "AV").trim().slice(0, 2).toUpperCase();
        const css = `rgb(${Math.round(tint[0]*255)},${Math.round(tint[1]*255)},${Math.round(tint[2]*255)})`;
        return { url, label, short, tintCss: css };
    }

    // Demo name for the pill: viewer can set window.__demoChromeName before
    // injecting; otherwise fall back to the page title.
    function demoName() {
        try {
            if (typeof window.__demoChromeName === "string" && window.__demoChromeName.trim())
                return window.__demoChromeName.trim();
        } catch { /* ignore */ }
        const t = (document.title || "DEMO").replace(/—.*$/, "").trim();
        return t || "DEMO";
    }

    // ─────────────────────────────────────────────────────────────────
    //  DOM
    // ─────────────────────────────────────────────────────────────────
    const settings = readSettings();
    if (!settings.enabled) return;   // master toggle off → no chrome at all

    const root = document.createElement("div");
    root.id = "demoChrome";
    Object.assign(root.style, {
        position: "fixed", top: "8px", right: "8px",
        width: "286px", zIndex: "29000",
        display: "flex", flexDirection: "column", gap: "4px",
        fontFamily: "ui-monospace, Consolas, 'Segoe UI', monospace",
        pointerEvents: "none",      // overlay; only interactive bits opt in
        userSelect: "none",
    });

    // Orange status pill ----------------------------------------------------
    const pill = document.createElement("div");
    Object.assign(pill.style, {
        display: "flex", alignItems: "center", gap: "7px",
        background: "linear-gradient(180deg,#f6a821,#e08a12)",
        color: "#1a1206", fontWeight: "700", fontSize: "12px",
        letterSpacing: "0.04em", borderRadius: "11px",
        padding: "3px 11px", height: "22px", boxSizing: "border-box",
        boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
    });
    const pillDot = document.createElement("span");
    Object.assign(pillDot.style, {
        width: "8px", height: "8px", borderRadius: "50%",
        background: "#2faa55", flex: "0 0 auto",
        boxShadow: "0 0 5px rgba(60,200,90,0.8)",
    });
    const pillText = document.createElement("span");
    pillText.textContent = demoName().toUpperCase();
    Object.assign(pillText.style, { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
    pill.appendChild(pillDot); pill.appendChild(pillText);

    // Body: stamp + gauges -------------------------------------------------
    const body = document.createElement("div");
    Object.assign(body.style, {
        display: "flex", alignItems: "stretch", gap: "8px",
        background: "rgba(12,16,26,0.92)",
        border: "1px solid rgba(90,200,255,0.22)",
        borderRadius: "10px", padding: "7px 9px",
        backdropFilter: "blur(2px)",
    });

    // Avatar postage-stamp (placeholder tile for R1).
    const av = resolveAvatar(settings);
    const stamp = document.createElement("div");
    Object.assign(stamp.style, {
        flex: "0 0 auto", width: "44px", height: "60px",
        borderRadius: "7px", position: "relative",
        background: `linear-gradient(160deg, ${av.tintCss}, rgba(0,0,0,0.35))`,
        border: "1px solid rgba(255,255,255,0.18)",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
    });
    const stampInitials = document.createElement("div");
    stampInitials.textContent = av.short;
    Object.assign(stampInitials.style, {
        fontSize: "18px", fontWeight: "800", color: "rgba(255,255,255,0.92)",
        textShadow: "0 1px 3px rgba(0,0,0,0.6)",
    });
    const stampCaption = document.createElement("div");
    stampCaption.textContent = av.label;
    stampCaption.title = av.label;
    Object.assign(stampCaption.style, {
        position: "absolute", bottom: "0", left: "0", right: "0",
        fontSize: "7px", lineHeight: "9px", textAlign: "center",
        color: "rgba(255,255,255,0.85)", background: "rgba(0,0,0,0.45)",
        padding: "1px 2px", overflow: "hidden", whiteSpace: "nowrap",
        textOverflow: "ellipsis",
    });
    stamp.appendChild(stampInitials); stamp.appendChild(stampCaption);

    // v885 — live mini GLB. The initials tile stays as the background +
    // fallback; on top we mount a tiny WebGL2 avatar via the stripped-down
    // miniAvatar renderer (reuses GLBParser/SkeletalAnimator + the v884
    // orientation override + costume tint, so the stamp matches the viewer).
    // Lazy-imported so demos with the live stamp disabled pay nothing.
    let _mini = null;
    if (settings.liveStamp && !settings.stage) {
        const miniCanvas = document.createElement("canvas");
        Object.assign(miniCanvas.style, {
            position: "absolute", inset: "0", width: "100%", height: "100%",
            display: "block",
        });
        stamp.appendChild(miniCanvas);
        // re-stack the caption above the canvas
        stamp.appendChild(stampCaption);
        import("/face/miniAvatar.js").then((mod) => {
            try {
                _mini = mod.mountMiniAvatar(miniCanvas, { url: av.url });
                if (_mini && _mini.ok) {
                    stampInitials.style.display = "none";   // live view took over
                } else {
                    miniCanvas.remove();                    // no WebGL2 → keep tile
                }
            } catch (e) { try { miniCanvas.remove(); } catch {} }
        }).catch(() => { try { miniCanvas.remove(); } catch {} });
        // Tidy up the GL context if the page is torn down.
        window.addEventListener("pagehide", () => { try { _mini && _mini.destroy(); } catch {} }, { once: true });
    }

    // Gauges (SVG rings). Up to 3, each independently configurable.
    const gaugesWrap = document.createElement("div");
    Object.assign(gaugesWrap.style, {
        flex: "1 1 auto", display: "flex", alignItems: "center",
        justifyContent: "space-around", gap: "4px",
    });

    // v886 — gauges are now LIVE. makeGauge returns an updater so the poll
    // loop can refresh the ring + number from real provider values.
    const _gaugeHandles = [];
    const _stageVals = [0, 0, 0];   // v891/892 — each gauge's fill (0..1), fed to its stage actor
    // v890 — 2.5D gauge treatment. Each ring becomes a physical-looking dial:
    // recessed well (radial gradient face) + metallic bezel rim + a lit arc
    // with a depth drop-shadow + a glass specular highlight, set on a subtle
    // forward tilt with a ground shadow. Pure SVG/CSS — no extra GL context,
    // safe in every demo iframe. (C, later: fold rings into the avatar canvas.)
    function _lighten(hex, amt) {
        const h = String(hex).replace("#", "");
        const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
        const f = (c) => Math.round(c + (255 - c) * amt);
        return `rgb(${f(r)},${f(g)},${f(b)})`;
    }
    let _gaugeUid = 0;

    function makeGauge(cfg, gIdx) {
        const color = RING_COLORS[cfg.color] || RING_COLORS.cyan;
        const R = 16, C = 2 * Math.PI * R;
        const uid = "gx" + (_gaugeUid++);
        const NS = "http://www.w3.org/2000/svg";
        const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };

        const cell = document.createElement("div");
        Object.assign(cell.style, { display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", minWidth: "0" });

        const svg = el("svg", { width: "42", height: "46", viewBox: "-2 -2 46 50" });
        svg.style.overflow = "visible";
        // Forward tilt + ground shadow so the dial reads as a physical object.
        svg.style.transform = "perspective(150px) rotateX(17deg)";
        svg.style.transformOrigin = "center 62%";
        svg.style.filter = "drop-shadow(0 2px 2.5px rgba(0,0,0,0.55))";

        // ---- defs: face well, bezel rim, lit arc sheen, depth shadow ----
        const defs = el("defs", {});
        const face = el("radialGradient", { id: `face-${uid}`, cx: "50%", cy: "42%", r: "60%" });
        face.appendChild(el("stop", { offset: "0%",  "stop-color": "#070b12" }));
        face.appendChild(el("stop", { offset: "100%", "stop-color": "#1a2331" }));
        const bezel = el("linearGradient", { id: `bezel-${uid}`, x1: "0", y1: "0", x2: "0", y2: "1" });
        bezel.appendChild(el("stop", { offset: "0%",  "stop-color": "#46556e" }));
        bezel.appendChild(el("stop", { offset: "55%", "stop-color": "#1b2230" }));
        bezel.appendChild(el("stop", { offset: "100%","stop-color": "#0a0e16" }));
        const sheen = el("linearGradient", { id: `sheen-${uid}`, x1: "0", y1: "0", x2: "0", y2: "1" });
        sheen.appendChild(el("stop", { offset: "0%",  "stop-color": _lighten(color, 0.45) }));
        sheen.appendChild(el("stop", { offset: "55%", "stop-color": color }));
        sheen.appendChild(el("stop", { offset: "100%","stop-color": color }));
        const shadow = el("filter", { id: `depth-${uid}`, x: "-40%", y: "-40%", width: "180%", height: "180%" });
        shadow.appendChild(el("feDropShadow", { dx: "0", dy: "0.6", stdDeviation: "0.8", "flood-color": "#000", "flood-opacity": "0.7" }));
        defs.appendChild(face); defs.appendChild(bezel); defs.appendChild(sheen); defs.appendChild(shadow);
        svg.appendChild(defs);

        // ---- bezel rim (metallic ring just outside the track) ----
        svg.appendChild(el("circle", { cx: "21", cy: "21", r: String(R + 2.4), fill: "none", stroke: `url(#bezel-${uid})`, "stroke-width": "2.4" }));
        // ---- recessed face well ----
        svg.appendChild(el("circle", { cx: "21", cy: "21", r: String(R + 0.4), fill: `url(#face-${uid})` }));
        // ---- track groove ----
        svg.appendChild(el("circle", { cx: "21", cy: "21", r: String(R), fill: "none", stroke: "rgba(0,0,0,0.45)", "stroke-width": "4" }));

        // ---- lit value arc ----
        const fg = el("circle", {
            cx: "21", cy: "21", r: String(R), fill: "none",
            stroke: `url(#sheen-${uid})`, "stroke-width": "4", "stroke-linecap": "round",
            "stroke-dasharray": String(C), "stroke-dashoffset": String(C),
            transform: "rotate(-90 21 21)", filter: `url(#depth-${uid})`,
        });
        svg.appendChild(fg);

        // ---- glass specular highlight (short bright arc, upper-left) ----
        const hi = el("circle", {
            cx: "21", cy: "21", r: String(R), fill: "none",
            stroke: "rgba(255,255,255,0.30)", "stroke-width": "1.4", "stroke-linecap": "round",
            "stroke-dasharray": `${C * 0.16} ${C}`, transform: "rotate(-128 21 21)",
        });
        svg.appendChild(hi);

        let txt = null;
        if (cfg.showPct && cfg.source !== "none") {
            txt = el("text", { x: "21", y: "25", "text-anchor": "middle", "font-size": "11", "font-weight": "700", fill: "#eef3ff" });
            txt.style.textShadow = "0 1px 1px rgba(0,0,0,0.8)";
            txt.textContent = "–";
            svg.appendChild(txt);
        }
        cell.appendChild(svg);

        const lbl = document.createElement("div");
        lbl.textContent = cfg.source === "none" ? "—" : cfg.source.toUpperCase();
        Object.assign(lbl.style, { fontSize: "7px", color: color, letterSpacing: "0.05em", textShadow: "0 1px 1px rgba(0,0,0,0.6)" });
        cell.appendChild(lbl);

        const onlineStroke = `url(#sheen-${uid})`;
        _gaugeHandles.push({
            source: cfg.source,
            update(pct, displayText, online) {
                const clamped = Math.max(0, Math.min(100, pct || 0));
                if (online !== false && gIdx >= 0 && gIdx < _stageVals.length) _stageVals[gIdx] = clamped / 100;   // v892
                fg.setAttribute("stroke-dashoffset", String(C * (1 - clamped / 100)));
                fg.setAttribute("stroke", online === false ? "rgba(150,160,175,0.35)" : onlineStroke);
                hi.style.opacity = online === false ? "0.15" : "1";
                if (txt) txt.textContent = (displayText == null) ? "–" : String(displayText);
            },
        });
        return cell;
    }

    for (let gi = 0; gi < settings.gauges.length; gi++) gaugesWrap.appendChild(makeGauge(settings.gauges[gi], gi));


    if (!settings.stage) body.appendChild(stamp);
    body.appendChild(gaugesWrap);

    // v891 — Live 3D stage (option C R1): one WebGL2 canvas above the gauges,
    // rendering the avatar beside a real 3D ring-dial bound to gauge 1. Height
    // is user-adjustable (Avatar Settings) so the whole panel still fits with
    // the gauges + ticker below on phone/Shield/desktop. Lazy-imported.
    let _stage = null, stageWrap = null, stageRail = null, stageHost = null;   // v1358 — refs for dock toggle
    if (settings.stage) {
        // v895 — LCARS framing: a colored left rail of stacked blocks + a big
        // top-left elbow radius, the canvas inset to the right of the rail.
        stageWrap = document.createElement("div");
        Object.assign(stageWrap.style, {
            position: "relative", width: "100%", display: "flex", gap: "3px",
            height: Math.max(40, Math.min(300, settings.stageHeight || 84)) + "px",
            borderRadius: "16px 10px 10px 16px", overflow: "hidden", marginBottom: "6px",
            background: "linear-gradient(180deg, rgba(14,20,34,0.65), rgba(6,9,16,0.92))",
            border: "1px solid rgba(90,200,255,0.20)", padding: "3px",
        });
        const rail = document.createElement("div");
        Object.assign(rail.style, { flex: "0 0 13px", display: "flex", flexDirection: "column", gap: "3px" });
        const LCARS = ["#f6a821", "#cc88aa", "#5a9bd4", "#ff9966"];   // amber/mauve/blue/orange
        [[2.4, 0], [1, 1], [1.6, 2], [1, 3]].forEach(([fl, ci], k) => {
            const blk = document.createElement("div");
            Object.assign(blk.style, {
                flex: String(fl), background: LCARS[ci % LCARS.length],
                borderRadius: k === 0 ? "9px 9px 3px 3px" : (k === 3 ? "3px 3px 9px 9px" : "3px"),
            });
            rail.appendChild(blk);
        });
        const canvasHost = document.createElement("div");
        Object.assign(canvasHost.style, { position: "relative", flex: "1 1 auto", borderRadius: "7px", overflow: "hidden" });
        const stageCanvas = document.createElement("canvas");
        Object.assign(stageCanvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" });
        canvasHost.appendChild(stageCanvas);
        stageWrap.appendChild(rail); stageWrap.appendChild(canvasHost);
        stageRail = rail; stageHost = canvasHost;   // v1358
        const av2 = resolveAvatar(settings);
        const hexToRgb = (hex) => { const h = (hex || "#5ac8ff").replace("#", ""); return [parseInt(h.substr(0,2),16)/255, parseInt(h.substr(2,2),16)/255, parseInt(h.substr(4,2),16)/255]; };
        const STYLE_MAP = { voxel: "voxelbarrel" };   // UI label -> internal style
        // v2433 -- "wormhole" and "blackhole" pass straight through as stage styles (fx/gauge/gaugeShaders.js).
        const stageGauges = settings.gauges
            .map((g, i) => ({ g, i }))
            .filter(({ g }) => g.source !== "none")
            .map(({ g, i }) => ({ style: STYLE_MAP[g.stageStyle] || g.stageStyle || ["ring","gyro","barrel"][i] || "ring", getValue: () => _stageVals[i], color: hexToRgb(RING_COLORS[g.color]) }));
        // v1605 — defer the heavy 3D avatar stage (GLB loads + WebGL + a per-frame loop that polls
        // /avatar/mood) until the grid has drawn, so the empty sandbox shows first. Runs immediately if the
        // grid is already up; a fallback timer inside onSwekGridReady guarantees it still mounts otherwise.
        const _mountAvatarStage = () => {
        import("/face/avatarStage.js").then((mod) => {
            try {
                const getScreenCanvas = () => {
                    const sim = document.getElementById("sim");
                    if (sim && sim.tagName === "CANVAS" && sim !== stageCanvas) return sim;
                    let best = null, area = 0;
                    document.querySelectorAll("canvas").forEach(c => { if (c === stageCanvas) return; const a = (c.width || 0) * (c.height || 0); if (a > area) { area = a; best = c; } });
                    return best;
                };
                _stage = mod.mountStage(stageCanvas, { url: av2.url, gauges: stageGauges, scene: settings.stageScene || "diorama", carrier: settings.stageCarrier || "boat", url2: settings.stageAvatar2 || "RobotWoman", accessories: settings.accessories, getScreenCanvas, selfQuip: true, pet: true });   // v1505 — pet:true brings the wandering llama into the docked/undocked stage, matching the phone view; v1529 — accessories: worn/held GLB props on head/hand/foot bones
                if (!_stage || !_stage.ok) { stageWrap.remove(); if (settings.liveStamp) body.insertBefore(stamp, gaugesWrap); }
            } catch (e) { try { stageWrap.remove(); } catch {} }
        }).catch(() => { try { stageWrap.remove(); } catch {} });
        };
        if (window.onSwekGridReady) window.onSwekGridReady(_mountAvatarStage); else _mountAvatarStage();
        window.addEventListener("pagehide", () => { try { _stage && _stage.destroy(); } catch {} }, { once: true });
    }

    // Ticker --------------------------------------------------------------
    const tickerOuter = document.createElement("div");
    Object.assign(tickerOuter.style, {
        background: "rgba(8,11,18,0.92)",
        border: "1px solid rgba(90,200,255,0.18)",
        borderRadius: "8px", height: "18px", overflow: "hidden",
        position: "relative",
    });
    const tickerText = document.createElement("div");
    Object.assign(tickerText.style, {
        position: "absolute", whiteSpace: "nowrap",
        fontSize: "10px", lineHeight: "18px", color: "#9fd0a8",
        left: "0", top: "0", willChange: "transform",
    });
    tickerOuter.appendChild(tickerText);

    root.appendChild(pill);
    if (stageWrap) root.appendChild(stageWrap);
    root.appendChild(body);
    root.appendChild(tickerOuter);

    // ── v1358 — dock / undock the avatar chrome ──────────────────────────
    // Docked (default): JUST the long rectangular fidget view — the live stage
    // canvas, no LCARS rail, no pill / gauges / ticker, no distractions. Click
    // the strip (or the ⤢ badge) to UNDOCK → the full avatar / pip-boy / voxel /
    // spaceship chrome comes back on screen; the ⤡ badge docks it again.
    // ── v1519 — SVG-only tier (third minimization level): no avatar, no GL. ──
    const svgTierWrap = document.createElement("div");
    Object.assign(svgTierWrap.style, { display: "none", alignItems: "flex-end", gap: "12px", padding: "8px 10px", minHeight: "64px", background: "rgba(8,11,18,0.85)", border: "1px solid rgba(90,200,255,0.30)", borderRadius: "10px", cursor: "pointer", position: "relative" });
    svgTierWrap.title = "SVG dials (no avatar) — click to expand to the full view";
    const svgTierBadge = document.createElement("div");
    Object.assign(svgTierBadge.style, { position: "absolute", top: "4px", right: "4px", width: "20px", height: "20px", zIndex: "3", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(6,10,18,0.55)", color: "#bfe6ff", fontSize: "12px", lineHeight: "1", cursor: "pointer", border: "1px solid rgba(120,200,255,0.35)" });
    svgTierBadge.textContent = "\u2922"; svgTierBadge.title = "Cycle view (full / mini / head / svg)";
    svgTierWrap.appendChild(svgTierBadge);
    root.appendChild(svgTierWrap);
    // v1612 — SVG dials moved to the dedicated top-center dock (under the compass, dockedGauges.js), so the
    // right-side chrome reverts to its avatar by default. The svg tier still exists in the cycle if you want it
    // here too. (v1610 briefly defaulted this true; superseded by the top-center dock.)
    let _svgMode = false; try { _svgMode = localStorage.getItem("voxelengine.demoChromeSvg") === "1"; } catch {}
    let _svgSet = null, _heavyAuto = false, _heavyPrevSvg = false, _lastIso = "active";
    function _ensureSvgSet() {
        if (_svgSet) { try { _svgSet.start(); } catch {} return; }
        import("./svgGaugeSet.js").then((m) => { try { _svgSet = m.mountSvgGaugeSet(svgTierWrap, { gauges: settings.gauges, pollMs: 2000 }); _svgSet.start(); } catch {} }).catch(() => {});
    }
    let _docked = true;
    try { _docked = localStorage.getItem("voxelengine.demoChromeDocked") !== "0"; } catch {}
    let dockBtn = null;
    function _nudgeStage() { try { _stage && _stage.resize && _stage.resize(); } catch {} try { window.dispatchEvent(new Event("resize")); } catch {} }
    function setDocked(v) { _leaveHead(); _headMode = false; _docked = !!v; try { localStorage.setItem("voxelengine.demoChromeDocked", _docked ? "1" : "0"); } catch {} applyDockState(); }
    // v4106 -- Keith: "empty top-right box never loads." IT WAS NEVER LOADING BECAUSE IT WAS NEVER FLEX. pill,
    // body and stageWrap are all built with `display: "flex"` (lines 213/234/427) -- their children rely on it:
    // stageWrap's canvas-host div is `flex: 1 1 auto` with NO in-flow content of its own (the canvas inside it
    // is `position: absolute`), so its height comes ENTIRELY from the flex layout sizing it against the row's
    // siblings. "Restore" here set `.style.display = ""`, which does not restore the flex the element was
    // BUILT with -- it REMOVES the inline override, and a bare <div> with no override falls back to `block`.
    // Once stageWrap is `block`, `flex: 1 1 auto` on its children is inert (flex-basis/grow/shrink only mean
    // anything inside a flex container), so canvasHost keeps its natural block height for absolutely-positioned
    // content: ZERO. `inset: 0` on the canvas then gives it that same zero height. MEASURED, not assumed: a
    // real headless run of webgpu-llm.html found stageWrap.style.display === "" (computed: block) and the
    // canvas-host child's getBoundingClientRect().height === 0, on the FIRST load -- docked is the default
    // state (_docked = true), and applyDockState() runs unconditionally at mount (line 655), so this fired on
    // every page that mounts this chrome, every time, not intermittently -- exactly "never loads" rather than
    // "loads late". Fixed by restoring the value each element actually needs, not the empty string.
    function applyDockState() {
        const d = _docked;
        svgTierWrap.style.display = "none";   // v1519 — full/mini never show the svg-only tier
        pill.style.display = d ? "none" : "flex";
        body.style.display = d ? "none" : "flex";
        tickerOuter.style.display = d ? "none" : "";
        if (stageWrap) {
            stageWrap.style.display = "flex";   // v1519 — restore after the svg-only tier hid it; v4106 -- "flex", not "" (see header)
            try { _stage && _stage.setPaused && _stage.setPaused(false); } catch {}
            if (stageRail) stageRail.style.display = d ? "none" : "";
            if (d) {
                Object.assign(stageWrap.style, { height: "64px", borderRadius: "10px", border: "1px solid rgba(90,200,255,0.30)", marginBottom: "0", cursor: "pointer" });
            } else {
                Object.assign(stageWrap.style, {
                    height: Math.max(40, Math.min(300, settings.stageHeight || 84)) + "px",
                    borderRadius: "16px 10px 10px 16px", border: "1px solid rgba(90,200,255,0.20)", marginBottom: "6px", cursor: "default",
                });
            }
        }
        if (dockBtn) { dockBtn.textContent = d ? "\u2922" : "\u2921"; dockBtn.title = d ? "Expand to the full avatar view" : "Dock — minimize to the fidget strip"; }
        setTimeout(_nudgeStage, 30);
    }
    function applySvg() {
        if (_svgMode) {
            pill.style.display = "none"; body.style.display = "none"; tickerOuter.style.display = "none";
            if (stageWrap) stageWrap.style.display = "none";
            svgTierWrap.style.display = "flex";
            try { _stage && _stage.setPaused && _stage.setPaused(true); } catch {}   // free the GPU
            _ensureSvgSet();
        } else {
            svgTierWrap.style.display = "none";
            if (_svgSet) { try { _svgSet.stop(); } catch {} }
            applyDockState();   // restores stage (+ un-pause) and the full/mini layout
        }
    }
    function setSvg(v, fromUser) { _leaveHead(); _headMode = false; _svgMode = !!v; try { localStorage.setItem("voxelengine.demoChromeSvg", _svgMode ? "1" : "0"); } catch {} if (fromUser) _heavyAuto = false; applySvg(); }
    // --- v1520: head/torso presentation tier (separate Sketchfab models in GPU_Assets/THeads) ---
    let _headMode = false;   // runtime-only tier (not restored at boot)
    let _theads = null, _theadIdx = 0, _primaryUrl = "", _theadActive = false, _headActive = false;
    function _loadTHeads(cb) {
        if (Array.isArray(_theads)) { cb && cb(); return; }
        const urls = [];
        // 1. models dropped into the GPU_Assets/THeads folder (served as files)
        const pFolder = fetch("/GPU_Assets/list/THeads", { cache: "no-store" }).then((r) => r.json())
            .then((j) => { if (j && j.ok && Array.isArray(j.files)) for (const f of j.files) if (/\.(glb|gltf)$/i.test(f)) urls.push("/GPU_Assets/THeads/" + f); })
            .catch(() => {});
        // 2. v1522 — library assets tagged "head" via the Roles matrix, loaded by id through the
        //    raw-GLB route (/assets/glb?id=) so setAvatar can fetch them like any other URL.
        const pTagged = (window.assetLibrary && window.assetLibrary.list)
            ? Promise.resolve(window.assetLibrary.list({ type: "mesh" })).then((r) => {
                const arr = Array.isArray(r) ? r : (r && (r.items || r.assets)) || [];
                for (const a of arr) { const id = a && (a.id || a.assetId); if (id && Array.isArray(a.tags) && a.tags.includes("head")) urls.push("/assets/glb?id=" + encodeURIComponent(id)); }
              }).catch(() => {})
            : Promise.resolve();
        Promise.all([pFolder, pTagged]).then(() => { _theads = urls; cb && cb(); });
    }
    function _applyThead() {
        if (!_theads || !_theads.length) return;   // nothing dropped/tagged -> just head-zoom the current rig
        const url = _theads[((_theadIdx % _theads.length) + _theads.length) % _theads.length];   // v1522 — full URL (folder file OR /assets/glb?id=)
        try {
            const p = _stage && _stage.setAvatar && _stage.setAvatar(url);
            if (p && p.then) p.then((ok) => { if (ok) _theadActive = true; });
        } catch {}
    }
    function _leaveHead() {
        if (!_headActive) return;
        _headActive = false;
        try { _stage && _stage.setHeadView && _stage.setHeadView(false); } catch {}
        if (_theadActive && _primaryUrl) { try { _stage && _stage.setAvatar && _stage.setAvatar(_primaryUrl); } catch {} }
        _theadActive = false;
    }
    function applyHead() {
        _headActive = true;
        pill.style.display = "none"; body.style.display = "none"; tickerOuter.style.display = "none";
        svgTierWrap.style.display = "none"; if (_svgSet) { try { _svgSet.stop(); } catch {} }
        if (stageRail) stageRail.style.display = "none";
        if (stageWrap) {
            stageWrap.style.display = "flex";   // v4106 -- "flex", not "" (see applyDockState's header comment)
            Object.assign(stageWrap.style, { height: "96px", borderRadius: "10px", border: "1px solid rgba(140,210,255,0.45)", marginBottom: "0", cursor: "pointer" });
            try { _stage && _stage.setPaused && _stage.setPaused(false); } catch {}
        }
        try { _stage && _stage.setHeadView && _stage.setHeadView(true); } catch {}
        if (!_primaryUrl) { try { _primaryUrl = resolveAvatar(settings).url; } catch {} }
        _loadTHeads(() => { if (_headMode) { _applyThead(); _theadIdx++; } });   // v1520 — advance so each head-tier entry cycles the next Sketchfab head/torso model
        if (dockBtn) { dockBtn.textContent = "\u25C9"; dockBtn.title = "Cycle view (full / mini / head / svg)"; }
        setTimeout(_nudgeStage, 30);
    }
    function setHead(v, fromUser) {
        if (v) { _leaveHead(); _headMode = true; _svgMode = false; if (fromUser) _heavyAuto = false; applyHead(); }
        else { _headMode = false; _leaveHead(); }
    }
    // Minimization cycle: full (undocked) → mini (docked diorama) → head (head/torso) → svg (dials) → full.
    function cycleTier() {
        if (_svgMode) { setSvg(false, true); setDocked(false); }           // svg → full
        else if (_headMode) { setHead(false, true); setSvg(true, true); }   // head → svg
        else if (_docked) { setHead(true, true); }                         // mini → head
        else { setDocked(true); }                                          // full → mini
    }
    svgTierBadge.addEventListener("click", (e) => { e.stopPropagation(); cycleTier(); });
    svgTierWrap.addEventListener("click", () => { setSvg(false, true); setDocked(false); });
    // v1519 (C) — auto-drop to the SVG tier on CPU/GPU-heavy demos (isolation "exclusive"),
    // restoring the prior view when the demo ends. Skips if the user is already in svg.
    setInterval(() => {
        let iso = "active"; try { iso = window._demoIsolation || (window.getDemoIsolation && window.getDemoIsolation()) || "active"; } catch {}
        if (iso === _lastIso) return;
        const wasHeavy = _lastIso === "exclusive", nowHeavy = iso === "exclusive";
        _lastIso = iso;
        if (nowHeavy && !wasHeavy) { if (!_svgMode) { _heavyPrevSvg = false; _heavyAuto = true; setSvg(true, false); } }
        else if (!nowHeavy && wasHeavy) { if (_heavyAuto) { _heavyAuto = false; setSvg(_heavyPrevSvg, false); } }
    }, 1500);
    if (stageWrap && stageHost) {
        stageWrap.style.pointerEvents = "auto";   // root is overlay-only; this strip opts in
        dockBtn = document.createElement("div");
        Object.assign(dockBtn.style, {
            position: "absolute", top: "4px", right: "4px", width: "20px", height: "20px", zIndex: "3",
            borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(6,10,18,0.55)", color: "#bfe6ff", fontSize: "12px", lineHeight: "1",
            cursor: "pointer", border: "1px solid rgba(120,200,255,0.35)", opacity: "0", transition: "opacity .15s",
        });
        stageHost.appendChild(dockBtn);
        stageHost.addEventListener("mouseenter", () => { if (dockBtn) dockBtn.style.opacity = "1"; if (_docked) stageWrap.style.boxShadow = "0 0 0 1px rgba(120,200,255,0.6), 0 6px 20px rgba(0,0,0,0.5)"; });
        stageHost.addEventListener("mouseleave", () => { if (dockBtn) dockBtn.style.opacity = "0"; stageWrap.style.boxShadow = ""; });
        stageHost.addEventListener("click", () => { if (_docked) setDocked(false); });
        dockBtn.addEventListener("click", (e) => { e.stopPropagation(); cycleTier(); });
    }
    if (_svgMode) applySvg(); else applyDockState();

    // Mount once the DOM is ready.
    function attach() {
        if (!document.body) { requestAnimationFrame(attach); return; }
        document.body.appendChild(root);
        startTicker();
        startGaugeProviders();
        try { if (_svgMode) applySvg(); else applyDockState(); } catch {}   // v1358/1519 — settle dock/svg state once mounted
        // v889 — let system load drive the avatar stamp's color indicator too.
        // Lazy import keeps demoChrome dependency-free if the module is absent.
        try { import("./gaugeColorProvider.js").catch(() => {}); } catch (e) {}
    }

    // ─────────────────────────────────────────────────────────────────
    //  Ticker engine — sources the real bridge debug stream.
    // ─────────────────────────────────────────────────────────────────
    // v1192 — segment-based so inline rich graphics (animated health dots,
    // sprites) ride along with the text. No 3D needed: the dots are CSS-animated
    // inline-blocks inside the same scrolling line. Plain text is HTML-escaped.
    const MAX_TICKER_SEGS = 140;
    let tickerSegs = [];           // array of HTML segment strings
    let scrollX = 0;
    let lastT = 0;

    // One-time stylesheet for the inline ticker sprites (pulse + spin).
    try {
        if (!document.getElementById("dc-ticker-style")) {
            const st = document.createElement("style"); st.id = "dc-ticker-style";
            st.textContent = "@keyframes dcPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.65)}}@keyframes dcSpin{to{transform:rotate(360deg)}}.dc-dot{display:inline-block;width:7px;height:7px;border-radius:50%;vertical-align:middle;margin:0 3px 0 7px;box-shadow:0 0 4px currentColor}.dc-dot.up{background:#3ad17a;color:#3ad17a}.dc-dot.down{background:#f4685f;color:#f4685f;animation:dcPulse 1s infinite}.dc-health{color:#bcd8e6}.dc-spin{display:inline-block;animation:dcSpin 2.2s linear infinite}.dc-sep{color:#5aa0c8}";
            (document.head || document.documentElement).appendChild(st);
        }
    } catch (e) {}

    const JOB_LINE = "  \u2605  Keith needs a job — please help.  howdykeith@gmail.com  \u2605  ";
    let jobTimer = 0, healthTimer = 0;
    const _esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const _SEP = '<span class="dc-sep">   \u2022   </span>';
    function _render() { tickerText.innerHTML = tickerSegs.join(""); }
    function _push(seg) { if (!seg) return; tickerSegs.push(_SEP + seg); if (tickerSegs.length > MAX_TICKER_SEGS) tickerSegs.shift(); _render(); }

    function pushLine(text) {
        if (!text) return;
        const clean = String(text).replace(/\s+/g, " ").trim();
        if (!clean) return;
        _push(_esc(clean));
    }
    // Inject raw HTML (trusted callers only) — used for the health segment.
    function pushRich(html) { _push(html); }

    // Build a live service-health segment with animated dots from the v1191
    // serviceStatus registry (green = up, pulsing red = down).
    function healthSegment() {
        const all = (window.serviceStatus && window.serviceStatus.all && window.serviceStatus.all()) || {};
        const order = ["kpop", "go2rtc", "ollama", "ha", "assetServer", "comfyui", "ollamadiffuser", "mosquitto"];
        const labels = { kpop: "KPop", go2rtc: "go2rtc", ollama: "Ollama", ha: "HA", assetServer: "Assets", comfyui: "ComfyUI", ollamadiffuser: "Diffuser", mosquitto: "MQTT" };
        const seen = order.filter(k => all[k]);
        if (!seen.length) return "";
        let html = '<span class="dc-health"><span class="dc-spin">\u25D0</span> services:';
        for (const k of seen) { const ok = !!all[k].ok; html += '<span class="dc-dot ' + (ok ? "up" : "down") + '"></span>' + _esc(labels[k] || k); }
        return html + '</span>';
    }

    // Exposed so the local stream / other engine code can inject lines + so server.html can boot into a tier.
    try {
        window.demoChrome = window.demoChrome || {};
        window.demoChrome.tick = pushLine;
        window.demoChrome.tickRich = pushRich;
        window.demoChrome.setHead = setHead;          // v1681 — enter/leave the head/torso (THeads) presentation tier
        window.demoChrome.cycleTier = cycleTier;
        window.demoChrome.setSvg = setSvg;
        window.demoChrome.setDocked = setDocked;
        // v1681 — server.html "HEAD mode" opens /index.html?forceEngine=1&head=1; drop straight into the head/torso
        // tier once the avatar stage is ready to accept the THeads model swap (retry briefly until it is).
        try {
            if (new URLSearchParams(location.search).get("head") === "1") {
                let _ht = 0;
                const _enterHead = () => {
                    _ht++;
                    if (_stage && _stage.setAvatar && _stage.setHeadView) { try { setHead(true, false); } catch {} return; }
                    if (_ht < 30) setTimeout(_enterHead, 400);
                };
                setTimeout(_enterHead, 1200);
            }
        } catch {}
    } catch { /* ignore */ }

    // ─────────────────────────────────────────────────────────────────
    //  Gauge providers (v886) — real, multi-source.
    //   - battery : local browser navigator.getBattery()
    //   - cpu/ram/gpu : the PC bridge GET /system/stats (this machine)
    //   - email/custom/<any> : the bridge GET /gauge/state bag, which any
    //     source pushes to (VBA bridge, PowerShell/Python listener, a Discord
    //     sync, a Google-Sheets poller — all POST /gauge/set {key,value,...}).
    //  Values are merged into `providerValues`; refreshGauges() maps each
    //  gauge's configured source onto its ring.
    // ─────────────────────────────────────────────────────────────────
    const providerValues = {
        battery: null,   // 0..100
        cpu:     null,   // 0..100
        ram:     null,   // 0..100
        gpu:     null,   // 0..100
    };
    const gaugeBag = {};   // bridge /gauge/state — {key:{value,max,label,isCount}}

    function refreshGauges() {
        for (const h of _gaugeHandles) {
            const s = h.source;
            if (s === "none") { h.update(0, "–", true); continue; }
            if (s === "battery" || s === "cpu" || s === "ram" || s === "gpu") {
                const v = providerValues[s];
                if (v == null) { h.update(0, "–", false); }
                else { h.update(v, Math.round(v), true); }
                continue;
            }
            // email / custom / any other key → from the bridge gauge bag
            const g = gaugeBag[s];
            if (!g) { h.update(0, "–", false); continue; }
            const isCount = g.isCount || COUNT_SOURCES.has(s);
            if (isCount) {
                h.update(Math.min(100, (g.value || 0) * COUNT_RING_SCALE), g.value || 0, true);
            } else {
                const max = g.max > 0 ? g.max : 100;
                const pct = Math.max(0, Math.min(100, (g.value / max) * 100));
                h.update(pct, Math.round(pct), true);
            }
        }
    }

    function startGaugeProviders() {
        // Local battery (PC laptop / phone). Subscribes to live changes.
        if (navigator.getBattery) {
            navigator.getBattery().then((bat) => {
                const read = () => { providerValues.battery = Math.round(bat.level * 100); refreshGauges(); };
                read();
                bat.addEventListener("levelchange", read);
                bat.addEventListener("chargingchange", read);
            }).catch(() => { /* unsupported — gauge shows offline */ });
        }
        const needsSystem = _gaugeHandles.some(h => ["cpu","ram","gpu"].includes(h.source));
        const needsBag    = _gaugeHandles.some(h => !["battery","cpu","ram","gpu","none"].includes(h.source));

        async function poll() {
            if (typeof window !== "undefined" && window.__swekPollsPaused) return;   // v1641 — hold while Settings is open
            if (needsSystem) {
                try {
                    const r = await fetch("/system/stats", { cache: "no-store" });
                    const j = await r.json();
                    if (j) {
                        if (j.cpu && Number.isFinite(j.cpu.utilPct)) providerValues.cpu = j.cpu.utilPct;
                        if (j.mem && Number.isFinite(j.mem.usedPct)) providerValues.ram = j.mem.usedPct;
                        if (j.gpu && Number.isFinite(j.gpu.utilPct)) providerValues.gpu = j.gpu.utilPct;
                    }
                } catch { /* bridge offline → gauges show offline */ }
            }
            if (needsBag) {
                try {
                    const r = await fetch("/gauge/state", { cache: "no-store" });
                    const j = await r.json();
                    if (j && j.ok && j.gauges) { for (const k of Object.keys(j.gauges)) gaugeBag[k] = j.gauges[k]; }
                } catch { /* offline */ }
            }
            refreshGauges();
        }
        refreshGauges();   // initial (shows offline until first poll lands)
        poll();
        setInterval(poll, 3000);
    }

    function startTicker() {
        pushLine(JOB_LINE.trim());
        if (settings.tickerSource === "global" || settings.tickerSource === "both") {
            connectBridge();
        }
        if (settings.tickerSource === "local" || settings.tickerSource === "both") {
            // Local source for R1: the job line on a timer + anything pushed
            // through window.demoChrome.tick(). Real per-demo local logs can
            // route here later.
        }
        requestAnimationFrame(loop);
    }

    function loop(t) {
        if (!lastT) lastT = t;
        const dt = (t - lastT) / 1000;
        lastT = t;

        // Periodic job-line nudge (every ~22s) so it "tickers occasionally".
        jobTimer += dt;
        if (jobTimer > 22) { jobTimer = 0; pushLine(JOB_LINE.trim()); }

        // v1192 — periodic live service-health segment (animated dots).
        healthTimer += dt;
        if (healthTimer > 16) { healthTimer = 0; const h = healthSegment(); if (h) pushRich(h); }

        scrollX -= settings.tickerSpeed * dt;
        const w = tickerText.scrollWidth;
        if (w > 0 && -scrollX > w) scrollX = tickerOuter.clientWidth;   // wrap
        tickerText.style.transform = `translateX(${scrollX}px)`;
        requestAnimationFrame(loop);
    }

    // Bridge WebSocket — subscribe to the global debug fanout. URL is built
    // from the page location so it works on localhost AND the LAN IP the
    // Shield uses. Reconnects on drop.
    let ws = null, wsRetry = null, _wsAttempt = 0;
    function connectBridge() {
        let url;
        try {
            const proto = (location.protocol === "https:") ? "wss://" : "ws://";
            url = proto + location.host;
        } catch { return; }
        try { ws = new WebSocket(url); } catch { scheduleReconnect(); return; }

        ws.onopen = () => {
            _wsAttempt = 0;
            try { ws.send(JSON.stringify({ type: "debug:subscribe" })); } catch {}
        };
        ws.onmessage = (ev) => {
            let m; try { m = JSON.parse(ev.data); } catch { return; }
            if (!m || typeof m !== "object") return;
            if (m.type === "debug:line" && m.line) {
                pushLine(tagLine(m));
            } else if (m.type === "debug:backlog" && Array.isArray(m.lines)) {
                // Seed with the most recent slice of history so the ticker
                // is not empty on first connect.
                for (const l of m.lines.slice(-12)) pushLine(tagLine(l));
            }
        };
        ws.onclose = () => scheduleReconnect();
        ws.onerror = () => { try { ws.close(); } catch {} };
    }
    function tagLine(m) {
        const src = m.src ? `[${m.src}] ` : "";
        return src + (m.line || "");
    }
    function scheduleReconnect() {
        if (wsRetry) return;
        wsRetry = setTimeout(() => { wsRetry = null; connectBridge(); }, backoffDelay(_wsAttempt++));
    }
    // v1345 — recover instantly when the laptop wakes / network returns, instead of waiting out the backoff
    onConnectivityRegained(() => { if (wsRetry) { clearTimeout(wsRetry); wsRetry = null; } _wsAttempt = 0; connectBridge(); }, () => !ws || ws.readyState >= 2);

    attach();
})();
