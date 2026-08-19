// fx/raycast/flowField.js -- flow-field navigation for the raycast world. This is the CPU form of the exact primitive
// the GPU Brain's QuadrantScheduler packs (brain/quadrants.js): a distance field over the grid from a goal, plus a
// steepest-descent direction per cell, so an agent routes OPTIMALLY around walls instead of greedily bumping them. The
// quadrant scheduler packs four of these into one GPU solve (the 4-grid); here we solve one on the CPU for the pilot,
// verifiable headless. Same idea, small scale.
"use strict";
import { castRay } from "./raycaster.js";

// BFS distance field from (goalX,goalY) over the grid (4-connected, unit cost -> exact), then a per-cell flow direction
// pointing down the gradient toward the goal. Walls are impassable (Infinity).
function computeFlowField(map, goalX, goalY) {
    const H = map.length, W = map[0].length, N = W * H;
    const dist = new Float64Array(N).fill(Infinity), dirX = new Float32Array(N), dirY = new Float32Array(N);
    const solid = (x, y) => (y < 0 || x < 0 || y >= H || x >= W || map[y][x]);
    const gx = goalX | 0, gy = goalY | 0;
    if (!solid(gx, gy)) {
        dist[gy * W + gx] = 0; const q = [[gx, gy]]; let head = 0;
        while (head < q.length) { const c = q[head++], cx = c[0], cy = c[1], cd = dist[cy * W + cx];
            for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + d[0], ny = cy + d[1]; if (solid(nx, ny)) continue; const ni = ny * W + nx; if (cd + 1 < dist[ni]) { dist[ni] = cd + 1; q.push([nx, ny]); } } }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!isFinite(dist[i])) continue; let bx = 0, by = 0, best = dist[i];
        for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const nx = x + d[0], ny = y + d[1]; if (solid(nx, ny)) continue; const nd = dist[ny * W + nx]; if (nd < best) { best = nd; bx = d[0]; by = d[1]; } }
        const m = Math.hypot(bx, by) || 1; dirX[i] = bx / m; dirY[i] = by / m; }
    return { dist, dirX, dirY, W, H };
}
function fieldDir(field, x, y) { const xi = x | 0, yi = y | 0; if (xi < 0 || yi < 0 || xi >= field.W || yi >= field.H) return null; const i = yi * field.W + xi; if (!isFinite(field.dist[i])) return null; return { x: field.dirX[i], y: field.dirY[i], dist: field.dist[i] }; }

// A pilot brain (for pilotStep opts.brain) that FOLLOWS a precomputed flow field -- turn toward the field direction at
// the current cell, slow only if a wall is close (the field already routes around walls, so this is a safety belt).
function makeFieldPilot(getField, opts = {}) {
    return function (cam, map) {
        const field = getField(cam); const fd = field && fieldDir(field, cam.px, cam.py);
        let forward = opts.speed || 0.045, turn = 0;
        if (fd) { const ang = Math.atan2(fd.y, fd.x), cur = Math.atan2(cam.dirY, cam.dirX); let da = ang - cur; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; turn = Math.max(-(opts.turn || 0.12), Math.min(opts.turn || 0.12, da)); }
        if (castRay(map, cam, 0).perp < 0.5) forward *= 0.3;
        return { turn, forward };
    };
}

// The TRUE 4-grid, applied: pack a flow field for EACH goal (salvage). On the GPU this is one QuadrantScheduler solve --
// N independent fields in a single atlas dispatch; on the CPU we solve each, same N-fields result. Then the pilot reads
// its own distance in every field and picks the goal that is nearest BY PATH (not by straight-line), so it never chases
// a salvage that is close as the crow flies but walled off.
function packFields(map, goals) { return (goals || []).map(g => computeFlowField(map, g.x, g.y)); }
function pickNearestField(fields, x, y) {
    let best = -1, bd = Infinity; const xi = x | 0, yi = y | 0;
    for (let i = 0; i < fields.length; i++) { const f = fields[i]; if (xi < 0 || yi < 0 || xi >= f.W || yi >= f.H) continue; const d = f.dist[yi * f.W + xi]; if (isFinite(d) && d < bd) { bd = d; best = i; } }
    return best;
}

export { computeFlowField, fieldDir, makeFieldPilot, packFields, pickNearestField };
if (typeof module !== "undefined" && module.exports) module.exports = { computeFlowField, fieldDir, makeFieldPilot, packFields, pickNearestField };
