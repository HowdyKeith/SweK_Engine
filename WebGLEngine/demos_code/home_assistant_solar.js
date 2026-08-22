// demos_code/home_assistant_solar.js — Home Assistant "Solar 3D" card in the DEMO menu
// VERSION: v1
//
// Surfaces the HA Lovelace card from tools/ha-panel-lab/panels/solar-3d-card.js
// inside the engine's DEMO pulldown. The card is a self-contained custom element
// (<solar-3d-card>) that loads its own Three.js from a CDN and renders into its
// own shadow DOM — so this demo just mounts it as a floating panel and feeds it
// a mock `hass` (the engine has no real HA connection), animating a day cycle so
// the sun arcs and the battery/clouds drift. This is the same "demo mounts its
// own DOM overlay" pattern the MediaPipe hand/face demos use.
//
// Only one panel exists today (solar-3d-card). To add more HA panes: drop the
// card .js in tools/ha-panel-lab/panels/, then add a PANELS entry below.

const PANELS = [
    {
        file: "../tools/ha-panel-lab/panels/solar-3d-card.js",
        tag:  "solar-3d-card",
        config: { battery_entity: "sensor.solar_battery_level", sun_entity: "sun.sun",
                  weather_entity: "weather.home", title: "Solar (mock data)", height: 340 },
    },
];

let wrap = null;       // floating container in document.body
let el = null;         // the mounted custom element
let t = 0;
let mounted = false;

function weatherFromCloud(c) {
    if (c < 10) return "sunny";
    if (c < 50) return "partlycloudy";
    if (c < 90) return "cloudy";
    return "rainy";
}

// Time-varying mock hass — same shape HA passes to a card. A ~20s day loop so
// the sun visibly arcs; battery + cloud cover drift on their own slow cycles.
function mockHass(time) {
    const dayPhase = (time * 0.05) % 1;                 // 0..1 over ~20s
    const elevation = Math.sin(dayPhase * Math.PI * 2) * 60;
    const azimuth   = (dayPhase * 360) % 360;
    const battery   = 50 + Math.sin(time * 0.10) * 40;  // 10..90
    const cloud     = Math.max(0, 30 + Math.sin(time * 0.07 + 1) * 28);
    return {
        states: {
            "sensor.solar_battery_level": { entity_id: "sensor.solar_battery_level",
                state: String(Math.round(battery)),
                attributes: { unit_of_measurement: "%", friendly_name: "Solar Battery" } },
            "sun.sun": { entity_id: "sun.sun",
                state: elevation > 0 ? "above_horizon" : "below_horizon",
                attributes: { elevation, azimuth, friendly_name: "Sun" } },
            "weather.home": { entity_id: "weather.home",
                state: weatherFromCloud(cloud),
                attributes: { cloud_coverage: Math.round(cloud), temperature: 18, friendly_name: "Home" } },
        },
        themes: { darkMode: true }, language: "en", locale: { language: "en" },
        callService: async () => {}, formatEntityState: (s) => `${s.state}`,
    };
}

// Build the floating, draggable container + header.
function makeWrap(doc) {
    const w = doc.createElement("div");
    w.style.cssText = [
        "position:fixed", "top:70px", "right:20px", "width:380px", "z-index:9999",
        "background:rgba(8,18,30,0.92)", "border:1px solid #1f4a6b", "border-radius:8px",
        "box-shadow:0 6px 24px rgba(0,0,0,0.5)", "overflow:hidden",
        "font:13px ui-sans-serif,system-ui,sans-serif", "color:#cfe6f7",
    ].join(";");
    const bar = doc.createElement("div");
    bar.textContent = "⌂ HOME ASSISTANT — Solar 3D (drag · mock telemetry)";
    bar.style.cssText = [
        "padding:7px 10px", "background:#0b2545", "cursor:move", "user-select:none",
        "font-weight:600", "letter-spacing:0.02em",
    ].join(";");
    // minimal drag
    let dragging = false, ox = 0, oy = 0;
    bar.addEventListener("mousedown", (e) => {
        dragging = true; ox = e.clientX - w.offsetLeft; oy = e.clientY - w.offsetTop;
        e.preventDefault();
    });
    doc.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        w.style.left = (e.clientX - ox) + "px"; w.style.top = (e.clientY - oy) + "px";
        w.style.right = "auto";
    });
    doc.addEventListener("mouseup", () => { dragging = false; });
    w.appendChild(bar);
    return w;
}

async function mount() {
    if (mounted || typeof document === "undefined") return;
    mounted = true;
    const doc = document;
    wrap = makeWrap(doc);
    doc.body.appendChild(wrap);
    const panel = PANELS[0];
    try {
        await import(panel.file);   // self-registers the custom element
        if (!customElements.get(panel.tag)) throw new Error(`custom element "${panel.tag}" not defined`);
        el = doc.createElement(panel.tag);
        if (typeof el.setConfig === "function") el.setConfig(panel.config);
        wrap.appendChild(el);
        el.hass = mockHass(0);      // the card lazy-loads Three.js from CDN on mount
        console.log("[home_assistant_solar] mounted solar-3d-card (mock hass; needs internet for Three.js CDN)");
    } catch (e) {
        const err = doc.createElement("div");
        err.style.cssText = "padding:14px;color:#f99;font:12px monospace";
        err.textContent = "Failed to load HA card: " + (e?.message ?? e) +
            " — needs the bridge serving /tools/ and internet for the Three.js CDN.";
        wrap.appendChild(err);
        console.warn("[home_assistant_solar] mount failed:", e);
    }
}

export default {
    id:    "home_assistant_solar",
    label:    "HOME ASSISTANT — SOLAR 3D PANEL",
    category: "Home Assistant",   // menu can group HA demos under their own section (optional field)
    hint:  "Mounts the HA solar-3d-card as a floating panel with an animated mock day cycle",
    controls: [
        "Auto — a floating Home Assistant Solar card appears (drag its title bar)",
        "Telemetry is mock: a ~20s sun arc, drifting battery % and cloud cover",
        "The real card lives in tools/ha-panel-lab/panels/solar-3d-card.js",
        "Needs the bridge serving /tools/; card uses local Three.js if vendored, else CDN",
    ],

    start(ctx) {
        t = 0;
        mount();   // async; the panel appears once Three.js loads
        ctx.kpop?.info?.("Home Assistant", "Solar 3D panel (mock telemetry)");
    },

    tick(ctx, dt) {
        if (dt > 0.1) dt = 0.1;
        t += dt;
        // Push fresh mock hass ~4x/sec so the sun arcs and battery/clouds drift.
        if (el && (t % 0.25) < dt) {
            try { el.hass = mockHass(t); } catch {}
        }
    },

    stop(ctx) {
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);  // disconnectedCallback disposes Three.js
        wrap = null; el = null; mounted = false; t = 0;
        console.log("[home_assistant_solar] stopped");
    },
};
