// physics/presetCodec.js
//
// One encoding for a saved scene, used three ways: the URL hash (Copy scene link), the curated preset shelf, and the
// user's own saved presets. A scene state -- which scene, its slider values, the camera, the skin toggle -- goes to
// and from a compact & delimited string, so a shared link, a built-in preset, and a preset a user pins to their shelf
// are all the same kind of thing and all restore through the same path. Pure functions over plain data, so the
// round-trip is gated: whatever you encode you get back, and a malformed string is rejected rather than half-applied.

const RESERVED = new Set(["scene", "yaw", "pitch", "skin", "spin"]);

// Encode a scene-state object { scene, params:{...}, yaw, pitch, skin, spin } into "scene=..&k=v&.." form.
export function encodeScene(st) {
    if (!st || !st.scene) return "";
    const parts = ["scene=" + st.scene];
    const params = st.params || {};
    for (const k of Object.keys(params)) if (!RESERVED.has(k)) parts.push(k + "=" + params[k]);
    if (st.yaw !== undefined && st.yaw !== null) parts.push("yaw=" + st.yaw);
    if (st.pitch !== undefined && st.pitch !== null) parts.push("pitch=" + st.pitch);
    parts.push("skin=" + (st.skin ? 1 : 0));
    if (st.spin !== undefined && st.spin !== null) parts.push("spin=" + (st.spin ? 1 : 0));
    return parts.join("&");
}

// Parse an encoded string back to a scene-state object, or null if it names no scene. Non-reserved keys are params.
export function decodeScene(str) {
    if (!str || typeof str !== "string") return null;
    const q = {};
    for (const pair of str.replace(/^#/, "").split("&")) { const eq = pair.indexOf("="); if (eq < 0) continue; q[pair.slice(0, eq)] = pair.slice(eq + 1); }
    if (!q.scene) return null;
    const params = {};
    for (const k of Object.keys(q)) if (!RESERVED.has(k)) { const v = parseFloat(q[k]); if (Number.isFinite(v)) params[k] = v; }
    return {
        scene: q.scene,
        params,
        yaw: q.yaw !== undefined ? parseFloat(q.yaw) : undefined,
        pitch: q.pitch !== undefined ? parseFloat(q.pitch) : undefined,
        skin: q.skin === "1",
        spin: q.spin === undefined ? undefined : q.spin === "1",
    };
}
