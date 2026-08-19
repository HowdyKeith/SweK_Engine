// FILE: ui/LCARSMiniTab.js
// VERSION: v1 — round 79
//
// Shared minitab component. Auto-slot positioning, edge-aware arrow
// glyphs (always point INWARD toward the screen center), unified hover/
// click behavior. Created tabs use the existing .lcars-minitab CSS so
// they sit visually with older hand-rolled tabs.
//
// Usage:
//
//   import { createMiniTab } from "./LCARSMiniTab.js";
//
//   // Click-only (open a window, fire an action)
//   createMiniTab({
//       edge:    "right",
//       label:   "AVATAR",
//       color:   "voyager",
//       onClick: () => window.open("/RobotExpressive.html", "_blank", "width=520,height=520"),
//   });
//
//   // Hover-panel (shows an existing DOM element on hover)
//   createMiniTab({
//       edge:        "right",
//       label:       "OLLAMA",
//       color:       "gold",
//       hoverPanel:  ollamaPanelElement,  // pre-built DOM with `display:none`
//   });
//
//   // Custom slot override (skip auto-slotting; pin to a specific index)
//   createMiniTab({ edge: "right", slot: 4, label: "DEBUG", ... });
//
// The CSS in ui/lcars.css owns the visual styling. This module just
// places elements and wires events.

// Module-level slot counters per edge. Bumped each time createMiniTab
// is called without an explicit slot. Reset only via resetSlots().
const slots = { left: 0, right: 0, top: 0, bottom: 0 };

// Map edge → unicode arrow character (in source). The CSS uses
// `writing-mode: vertical-rl` for left/right edges, which rotates the
// glyph 90° CW visually:
//   ▲ source → ▶ visual
//   ▼ source → ◀ visual
// So for inward-pointing arrows:
//   right edge → ▼ source (visually ◀, points left toward center)
//   left edge  → ▲ source (visually ▶, points right toward center)
//   top edge   → ▼ (already points down, toward center)
//   bottom edge → ▲ (already points up, toward center)
const ARROW_FOR_EDGE = {
    right:  "▼",
    left:   "▲",
    top:    "▼",
    bottom: "▲",
};

/**
 * Create and mount a minitab.
 * @param {object} opts
 * @param {"left"|"right"|"top"|"bottom"} opts.edge — which screen edge
 * @param {string} opts.label — uppercase text, e.g. "AVATAR"
 * @param {string} [opts.color="voyager"] — color variant (voyager, gold,
 *   cyan, pink, green, red, yellow — see lcars.css for the full set)
 * @param {number} [opts.slot] — override auto-slot (0..5 for predefined positions)
 * @param {() => void} [opts.onClick] — fired on click
 * @param {HTMLElement} [opts.hoverPanel] — existing DOM element to
 *   show/hide on hover (caller owns the element + its content)
 * @param {number} [opts.hoverOpenDelay=250] — ms before opening on enter
 * @param {number} [opts.hoverCloseDelay=400] — ms before closing on leave
 * @param {{color?:string}} [opts.statusDot] — adds a status pip
 *   inside the tab. caller can later mutate via tab.setStatus(color)
 * @returns {HTMLElement} the tab element (also extended with
 *   `setStatus(color)` and `remove()` methods).
 */
export function createMiniTab(opts) {
    if (!opts || !opts.edge) throw new Error("createMiniTab: edge is required");
    const edge = opts.edge;
    if (!ARROW_FOR_EDGE[edge]) throw new Error(`createMiniTab: bad edge "${edge}"`);

    const slot = (typeof opts.slot === "number") ? opts.slot : slots[edge]++;
    const color = opts.color || "voyager";

    const tab = document.createElement("div");
    tab.className = `lcars-minitab edge-${edge} color-${color}`;
    tab.dataset.slot = String(slot);

    // Build label content. If a status dot was requested, we put it
    // before the arrow + label so it sits at the inside-edge end of the
    // tab (top for vertical writing-mode).
    let statusDot = null;
    if (opts.statusDot) {
        statusDot = document.createElement("span");
        statusDot.className = "lcars-minitab-dot";
        if (opts.statusDot.color) statusDot.style.background = opts.statusDot.color;
        tab.appendChild(statusDot);
    }
    const labelSpan = document.createElement("span");
    labelSpan.textContent = `${ARROW_FOR_EDGE[edge]} ${opts.label || ""}`;
    tab.appendChild(labelSpan);

    // Click behavior
    if (opts.onClick) {
        tab.addEventListener("click", (ev) => {
            // If we also have a hover panel, click toggles its visibility.
            // For pure click-action tabs, just fire.
            opts.onClick(ev, tab);
        });
        tab.style.cursor = "pointer";
    }

    // Hover panel behavior — show/hide an existing DOM element. The
    // panel must already be in the document; we just toggle display.
    // Two timers (open + close) give the user a grace period to slide
    // the mouse between tab and panel without it snapping shut.
    if (opts.hoverPanel) {
        const panel = opts.hoverPanel;
        const openDelay = opts.hoverOpenDelay ?? 250;
        const closeDelay = opts.hoverCloseDelay ?? 400;
        let openTimer = null;
        let closeTimer = null;

        const open = () => {
            clearTimeout(closeTimer); closeTimer = null;
            panel.style.display = "block";
        };
        const closeSoon = () => {
            clearTimeout(openTimer); openTimer = null;
            closeTimer = setTimeout(() => {
                panel.style.display = "none";
                closeTimer = null;
            }, closeDelay);
        };

        tab.addEventListener("mouseenter", () => {
            clearTimeout(closeTimer); closeTimer = null;
            openTimer = setTimeout(open, openDelay);
        });
        tab.addEventListener("mouseleave", closeSoon);
        // Allow the cursor to traverse into the panel without closing.
        // The caller's panel should also wire its own mouseleave to closeSoon
        // if it's positioned away from the tab edge.
        panel.addEventListener("mouseenter", () => {
            clearTimeout(closeTimer); closeTimer = null;
        });
        panel.addEventListener("mouseleave", closeSoon);
    }

    // Convenience methods on the returned element
    tab.setStatus = (color) => {
        if (statusDot && color) statusDot.style.background = color;
    };
    tab.setLabel = (newLabel) => {
        labelSpan.textContent = `${ARROW_FOR_EDGE[edge]} ${newLabel || ""}`;
    };
    const originalRemove = tab.remove.bind(tab);
    tab.remove = () => {
        // If this tab was auto-slotted at the current top of its edge's
        // stack, free the slot so the next call reclaims it. (Removing
        // a middle tab leaves a gap — caller's responsibility to
        // resetSlots + recreate if they care.)
        const e = tab.dataset.slot != null ? Number(tab.dataset.slot) : -1;
        if (e === slots[edge] - 1) slots[edge] -= 1;
        originalRemove();
    };

    document.body.appendChild(tab);
    return tab;
}

/** Reset all auto-slot counters. Useful for unit tests / hot reload. */
export function resetSlots() {
    slots.left = slots.right = slots.top = slots.bottom = 0;
}

/** How many auto-slotted tabs currently exist on an edge. */
export function slotCount(edge) {
    return slots[edge] || 0;
}
