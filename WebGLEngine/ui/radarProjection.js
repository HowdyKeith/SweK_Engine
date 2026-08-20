// ui/radarProjection.js
//
// The two ways the radar can place a blip on its disc. Both take a world position and return a point on the unit disc
// (px,py in [-1,1], plus the polar angle/ring the existing scope already speaks), so the manager can swap between them
// per source without the renderer caring which was used.
//
//   projectFlat  — top-down. angle = atan2(z,x), ring = distance / range. What the scope has always drawn.
//   projectGlobe — the globe look. An orthographic azimuthal projection centred on the viewer: the world is a sphere and
//                  you are looking straight down at your own position, so things near you sit centre, things toward the
//                  horizon compress toward the rim the way they do on a curved surface, and anything past the horizon
//                  falls off the BACK of the globe and is not drawn. That last part -- visible:false for the far
//                  hemisphere -- is what sells it as a globe rather than a flat disc with curved lines painted on.
//
// Pure functions, no state, no DOM. Deterministic: same inputs -> same point, every run.

export function projectFlat(x, z, range) {
    const d = Math.hypot(x || 0, z || 0);
    const angle = Math.atan2(z || 0, x || 0);
    const ring = range > 0 ? Math.min(0.98, d / range) : 0;
    return { px: ring * Math.cos(angle), py: ring * Math.sin(angle), angle, ring, visible: true };
}

// lat/lon and the viewer centre lat0/lon0 are in RADIANS. Returns a point on the unit disc; visible=false when the
// point is on the far side of the globe (below the horizon from the viewer).
export function projectGlobe(lat, lon, lat0, lon0) {
    const dLon = (lon || 0) - (lon0 || 0);
    const sinLat = Math.sin(lat || 0), cosLat = Math.cos(lat || 0);
    const sinLat0 = Math.sin(lat0 || 0), cosLat0 = Math.cos(lat0 || 0);
    const cosC = sinLat0 * sinLat + cosLat0 * cosLat * Math.cos(dLon);   // cosine of angular distance from centre
    const px = cosLat * Math.sin(dLon);
    const py = cosLat0 * sinLat - sinLat0 * cosLat * Math.cos(dLon);
    return { px, py, angle: Math.atan2(py, px), ring: Math.min(1, Math.hypot(px, py)), visible: cosC >= 0 };
}

// Convenience: pick a projection by mode name. Unknown modes fall back to flat.
export function project(mode, o) {
    if (mode === "globe") return projectGlobe(o.lat, o.lon, o.lat0 || 0, o.lon0 || 0);
    return projectFlat(o.x, o.z, o.range || 1);
}
