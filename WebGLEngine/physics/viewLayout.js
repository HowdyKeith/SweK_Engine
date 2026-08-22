// physics/viewLayout.js
//
// The multi-window model. A workspace is one primary view shown large and a few insets shown small; each view is a
// scene with its own parameters and camera, or a behind-the-scenes math panel. Promoting an inset swaps it with the
// primary, so any of the small views can become the main one with a click. The whole layout serialises to a short
// string and back -- so a multi-window arrangement is shareable and save-able exactly like a single scene through the
// preset codec -- and validates, so a layout can never point at a view that does not exist. The rendering into several
// canvases is the rig-side piece; this is the model underneath it, which is the part that must be correct.

// A view: a scene id with params and camera, or a panel id ("spectrum", "zeta-line").
export function makeView(id, { kind = "scene", params = {}, yaw = 20, pitch = 20 } = {}) {
    return { id, kind, params, yaw, pitch };
}

// A layout: a primary view and an ordered list of insets.
export function makeLayout(primary, insets = []) {
    return { primary, insets: [...insets] };
}

// Promote inset at index i to primary; the old primary becomes an inset in its place. Returns a new layout.
export function promote(layout, i) {
    if (i < 0 || i >= layout.insets.length) return layout;
    const insets = [...layout.insets], old = layout.primary, next = insets[i];
    insets[i] = old;
    return { primary: next, insets };
}

// Validate: every view's kind is known and every scene view names a real scene from the provided set.
export function validate(layout, knownScenes, knownPanels = ["spectrum", "zeta-line"]) {
    const all = [layout.primary, ...layout.insets];
    for (const v of all) {
        if (v.kind === "scene") { if (!knownScenes.includes(v.id)) return { ok: false, bad: v.id, why: "unknown scene" }; }
        else if (v.kind === "panel") { if (!knownPanels.includes(v.id)) return { ok: false, bad: v.id, why: "unknown panel" }; }
        else return { ok: false, bad: v.id, why: "unknown kind " + v.kind };
    }
    return { ok: true, count: all.length };
}

// Serialise a layout to a compact string: primary and insets as kind:id:yaw:pitch:k=v,k=v segments, joined by |.
export function encodeLayout(layout) {
    const seg = (v) => { const p = Object.entries(v.params).map(([k, val]) => k + "=" + val).join(","); return [v.kind, v.id, v.yaw, v.pitch, p].join(":"); };
    return [seg(layout.primary), ...layout.insets.map(seg)].join("|");
}

export function decodeLayout(str) {
    const parse = (s) => {
        const [kind, id, yaw, pitch, p] = s.split(":");
        const params = {}; if (p) for (const kv of p.split(",")) { const [k, val] = kv.split("="); if (k) params[k] = Number(val); }
        return { id, kind, params, yaw: Number(yaw), pitch: Number(pitch) };
    };
    const parts = str.split("|"); if (!parts[0]) return null;
    return { primary: parse(parts[0]), insets: parts.slice(1).filter(Boolean).map(parse) };
}
