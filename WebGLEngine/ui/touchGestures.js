// ui/touchGestures.js -- a tiny native multi-touch gesture layer (the AlloyFinger idea, kept in-house so SweK stays
// self-contained). It turns raw touch events into pan / pinch / rotate / tap, which any SweK view can consume -- e.g.
// the raycaster (drag to turn + walk, pinch for FOV). The gesture MATH is a pure function (verified); attachGestures
// is the DOM wiring on top of it.
"use strict";

// Pure: given the touch points before and after a move, return { pan:{dx,dy}, pinch, rotate, fingers }.
function gestureDelta(prev, cur) {
    if (!prev || !cur || !prev.length || !cur.length) return null;
    if (prev.length >= 2 && cur.length >= 2) {
        const pc = { x: (prev[0].x + prev[1].x) / 2, y: (prev[0].y + prev[1].y) / 2 }, cc = { x: (cur[0].x + cur[1].x) / 2, y: (cur[0].y + cur[1].y) / 2 };
        const pd = Math.hypot(prev[1].x - prev[0].x, prev[1].y - prev[0].y), cd = Math.hypot(cur[1].x - cur[0].x, cur[1].y - cur[0].y);
        const pa = Math.atan2(prev[1].y - prev[0].y, prev[1].x - prev[0].x), ca = Math.atan2(cur[1].y - cur[0].y, cur[1].x - cur[0].x);
        let rot = ca - pa; while (rot > Math.PI) rot -= 2 * Math.PI; while (rot < -Math.PI) rot += 2 * Math.PI;
        return { pan: { dx: cc.x - pc.x, dy: cc.y - pc.y }, pinch: pd > 1e-3 ? cd / pd : 1, rotate: rot, fingers: 2 };
    }
    return { pan: { dx: cur[0].x - prev[0].x, dy: cur[0].y - prev[0].y }, pinch: 1, rotate: 0, fingers: 1 };
}

function attachGestures(el, h = {}) {
    let prev = null, startPt = null, startT = 0, moved = 0;
    const pts = (e) => Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
    function start(e) { prev = pts(e); startPt = prev[0]; startT = performance.now(); moved = 0; }
    function move(e) { const cur = pts(e); const d = gestureDelta(prev, cur); if (d) { moved += Math.abs(d.pan.dx) + Math.abs(d.pan.dy); if (d.fingers === 2) { if (h.onPinch && Math.abs(d.pinch - 1) > 1e-3) h.onPinch(d.pinch); if (h.onRotate && d.rotate) h.onRotate(d.rotate); } if (h.onPan) h.onPan(d.pan, d.fingers); } prev = cur; if (e.cancelable) e.preventDefault(); }
    function end(e) { if (startPt && moved < 10 && performance.now() - startT < 300 && h.onTap) h.onTap(startPt); prev = e.touches.length ? pts(e) : null; }
    el.addEventListener("touchstart", start, { passive: false }); el.addEventListener("touchmove", move, { passive: false }); el.addEventListener("touchend", end); el.addEventListener("touchcancel", end);
    return () => { el.removeEventListener("touchstart", start); el.removeEventListener("touchmove", move); el.removeEventListener("touchend", end); el.removeEventListener("touchcancel", end); };
}
export { gestureDelta, attachGestures };
if (typeof module !== "undefined" && module.exports) module.exports = { gestureDelta, attachGestures };
