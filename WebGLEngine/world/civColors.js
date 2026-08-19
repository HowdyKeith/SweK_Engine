// FILE: world/civColors.js
// VERSION: v1
//
// Shared color helper for civilization identity. The civ marker
// renderer, civ panel, and (round 10) kaiju allegiance system all
// derive RGB from civ.id via the same golden-angle hue distribution
// — keeping the math here ensures they stay in lockstep visually.
//
// civId * 137.5° produces well-separated hues across small civ
// counts because the golden angle is incommensurate with 360°.

export function civHueRGB(civId) {
    const h = ((civId * 137.5) % 360) / 360;
    return _hslToRgb(h, 0.7, 0.6);
}

function _hslToRgb(h, s, l) {
    if (s === 0) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
        _hue2rgb(p, q, h + 1 / 3),
        _hue2rgb(p, q, h),
        _hue2rgb(p, q, h - 1 / 3),
    ];
}

function _hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}
