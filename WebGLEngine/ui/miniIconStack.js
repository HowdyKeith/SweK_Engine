// FILE: ui/miniIconStack.js
// VERSION: v1 — round 208 (v703)
//
// Reusable mini-icon stack on the LEFT edge of the screen. 34×34 icons by
// default; mouse-hover smoothly expands them to ~150px wide and fades in
// a label. Tools register via mountMiniIcon({...}) and the stack
// auto-positions them vertically with a consistent 48px gap from the
// bottom edge upward.
//
// Designed as the foundation for a future "TOOLS dock" — a single rail
// that holds Picker/Examiner, Reset World, Link Phone, Cast, and any
// new utility buttons. Once enough tools live here it's a small step to
// promote to a proper dockSystem-edge attachment with collapse-as-a-unit
// and drag-to-reorder. Until then, this is the cleanest way to keep the
// floating button code from duplicating itself.
//
// Positions are computed left-to-bottom-up: the FIRST tool added sits at
// bottom:60 (clearing the bottom-row minitabs), the second at bottom:108,
// and so on. If a tool unmounts, later tools shift down to fill its slot.
//
// Usage:
//   import { mountMiniIcon } from "./ui/miniIconStack.js";
//   const btn = mountMiniIcon({
//       id: "ve-inspect-btn",
//       icon: "🔍",
//       label: "Picker/Examiner",
//       color: "cyan",                  // "cyan" | "red" | "green" | "blue"
//       title: "Identify the voxel/object under your crosshair",
//       onClick: () => window.inspect(),
//       getActive: () => window._inspectOn === true,   // optional, drives bg color
//   });
//   // later: btn.remove() — cleans up + reflows the stack

const STACK_BASE_BOTTOM = 60;     // px from screen bottom to first tool
const STACK_GAP         = 48;     // vertical px between adjacent tools
const ICON_W            = 34;
const EXPAND_W_DEFAULT  = 150;    // collapsed → expanded width on hover

// Palette presets so each tool just picks a name
const PALETTE = {
    cyan:  { border: "rgba(120,200,255,0.55)", bg: "rgba(10,16,30,0.85)",  bgActive: "rgba(60,120,200,0.95)",  fg: "#dff" },
    red:   { border: "rgba(220,90,90,0.55)",   bg: "rgba(140,30,30,0.85)", bgActive: "rgba(200,60,60,0.95)",   fg: "#ffe7e7" },
    green: { border: "rgba(120,220,140,0.55)", bg: "rgba(20,80,40,0.85)",  bgActive: "rgba(60,180,90,0.95)",   fg: "#dfffe7" },
    blue:  { border: "rgba(100,140,220,0.55)", bg: "rgba(20,40,90,0.85)",  bgActive: "rgba(60,100,200,0.95)",  fg: "#dde7ff" },
    pink:  { border: "rgba(220,140,200,0.55)", bg: "rgba(120,30,80,0.85)", bgActive: "rgba(200,80,150,0.95)",  fg: "#ffe7f5" },
};

const _stack = [];

function _reflow() {
    // v1974 — order-aware: tools with a numeric `order` sort by it (low = bottom); the rest keep mount
    // order after them. Lets specific tools (e.g. SETTINGS at the very bottom, AUDIO just above) pin a slot.
    const ordered = _stack.map((t, i) => ({ t, i })).sort((a, b) => {
        const ao = (typeof a.t.order === "number") ? a.t.order : (1000 + a.i);
        const bo = (typeof b.t.order === "number") ? b.t.order : (1000 + b.i);
        return ao - bo;
    });
    for (let i = 0; i < ordered.length; i++) {
        const tool = ordered[i].t;
        if (!tool || !tool.btn) continue;
        tool.btn.style.bottom = (STACK_BASE_BOTTOM + i * STACK_GAP) + "px";
    }
}

export function mountMiniIcon(opts = {}) {
    if (typeof document === "undefined") return null;
    const {
        id, icon = "?", label = "",
        color = "cyan", title = "",
        onClick = () => {}, getActive = null,
        expandWidth = EXPAND_W_DEFAULT,
        position = "left",                  // "left" | "right" (future: edges)
    } = opts;

    const pal = PALETTE[color] || PALETTE.cyan;
    const btn = document.createElement("button");
    if (id) btn.id = id;
    btn.innerHTML = `<span class="mi-ico">${icon}</span><span class="mi-lbl"> ${label}</span>`;
    btn.title = title || label;
    Object.assign(btn.style, {
        position:    "fixed",
        // v1967 — the LEFT rail sits at 44px (was 12px) so its icons clear the left-edge lcars-minitabs
        // (ONS/CAMERAS/ROKU/SHIELD), which are ~30px-wide vertical tabs pinned at the very left edge and
        // were being covered by the icon column. The RIGHT rail is unaffected (still 12px from the right).
        [position]:  (position === "left" ? "44px" : "12px"),
        // bottom set in _reflow()
        zIndex:      "10050",
        height:      ICON_W + "px",
        width:       ICON_W + "px",
        borderRadius:"8px",
        cursor:      "pointer",
        border:      `1px solid ${pal.border}`,
        background:  pal.bg,
        color:       pal.fg,
        fontSize:    "16px",
        lineHeight:  "1",
        padding:     "0",
        display:     "inline-flex",
        alignItems:  "center",
        justifyContent: position === "right" ? "flex-end" : "flex-start",
        overflow:    "hidden",
        whiteSpace:  "nowrap",
        transition:  "width 0.15s ease, background 0.15s ease",
        fontWeight:  "600",
    });
    const ico = btn.querySelector(".mi-ico");
    const lbl = btn.querySelector(".mi-lbl");
    Object.assign(ico.style, {
        display:   "inline-block",
        width:     ICON_W + "px",
        textAlign: "center",
        fontSize:  "16px",
        flex:      "0 0 auto",
    });
    Object.assign(lbl.style, {
        fontSize:    "11px",
        letterSpacing: "0.04em",
        paddingRight: position === "right" ? "0" : "10px",
        paddingLeft:  position === "right" ? "10px" : "0",
        opacity:     "0",
        transition:  "opacity 0.12s ease",
        textTransform: "uppercase",
    });

    // Hover expand/collapse
    btn.addEventListener("mouseenter", () => {
        btn.style.width = expandWidth + "px";
        lbl.style.opacity = "1";
    });
    btn.addEventListener("mouseleave", () => {
        btn.style.width = ICON_W + "px";
        lbl.style.opacity = "0";
    });

    // Click + active state
    const applyActiveStyle = () => {
        try {
            const active = getActive && getActive();
            btn.style.background = active ? pal.bgActive : pal.bg;
        } catch {}
    };
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        try { onClick(e); } catch (err) { console.warn("[miniIcon]", id, "click failed:", err?.message); }
        applyActiveStyle();
    });
    btn.addEventListener("pointerdown", (e) => e.stopPropagation());

    document.body.appendChild(btn);

    // Register in the stack + assign a bottom position
    const tool = { id, btn, applyActiveStyle, order: (typeof opts.order === "number" ? opts.order : null) };
    _stack.push(tool);
    _reflow();

    // Augment the returned element with stack helpers
    btn.removeFromStack = () => {
        const i = _stack.indexOf(tool);
        if (i >= 0) _stack.splice(i, 1);
        btn.remove();
        _reflow();
    };
    btn.refreshActive = applyActiveStyle;
    applyActiveStyle();
    return btn;
}

export function listMiniIcons() { return _stack.map(t => t.id); }

// Force a stack reflow — useful if the screen height changes or a tool
// was added/removed by some other path.
export function reflowMiniIcons() { _reflow(); }
