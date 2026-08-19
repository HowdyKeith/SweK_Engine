// =============================================================================
// FILE: /simulation/CanvasFilter.js
// ROUND: 238
// =============================================================================
//
// Small registry that composes CSS canvas filter contributions from
// multiple systems without them stomping each other. Before this,
// VisionModes (v235), KaijuMode (v237), and now DayNightCycle (v238)
// all wrote directly to canvas.style.filter — last write wins, so
// activating kaiju-mode then switching to night-vision would silently
// drop the kaiju saturation, and the day/night cycle would have been
// completely incompatible with the vision modes.
//
// API:
//   setSlot(slotName, filterStr | null)  — register or clear a slot
//   getSlot(slotName)                    — read current contribution
//   apply()                              — write composed string to canvas
//   clear()                              — wipe all slots (for tests)
//
// Slots are composed in SLOT_ORDER. Order matters in CSS filter chains:
// brightness/contrast on a hue-rotated source gives a different look
// than the reverse. We apply lighting first (darken/tint the world for
// time of day), then vision (greenify for NVG etc.), then buff (kaiju-
// mode saturation kick). That order keeps each system's intended look
// readable on top of the others.
// =============================================================================

// Slots are composed in SLOT_ORDER. Order matters in CSS filter chains:
// brightness/contrast on a hue-rotated source gives a different look
// than the reverse. We apply submerged tint first (so day/night still
// reads through the blue), then weather (mist/snow desaturation), then
// lighting (darken for time of day), then vision (greenify for NVG etc),
// then buff (kaiju saturation).
//
// Round 245 — added "weather" slot ordered between submerged and lighting
// so mist/snow read above the underwater tint but below night-darkening.
const SLOT_ORDER = ["submerged", "weather", "lighting", "vision", "buff"];

const slots = new Map();
let canvasIdHint = "glCanvas";

export function setCanvasIdHint(id) { canvasIdHint = id; }

export function setSlot(slotName, filterStr) {
    if (filterStr == null || filterStr === "" || filterStr === "none") {
        slots.delete(slotName);
    } else {
        slots.set(slotName, filterStr);
    }
    apply();
}

export function getSlot(slotName) { return slots.get(slotName) || null; }
export function listSlots() { return Object.fromEntries(slots); }

export function apply() {
    if (typeof document === "undefined") return;
    const canvas = document.getElementById(canvasIdHint);
    if (!canvas) return;
    const parts = [];
    for (const k of SLOT_ORDER) {
        if (slots.has(k)) parts.push(slots.get(k));
    }
    canvas.style.filter = parts.length ? parts.join(" ") : "none";
}

export function clear() {
    slots.clear();
    apply();
}

export const CanvasFilter = { setSlot, getSlot, listSlots, apply, clear, setCanvasIdHint };
