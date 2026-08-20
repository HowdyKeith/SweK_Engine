// fx/raycast/raycaster.js -- a Wolfenstein/NGRayEx-style sprite raycaster: the THIRD way SweK takes a flat sprite into
// a scene (after extrude=spriteToMesh and voxelize=the filter series). A DDA grid raycaster turns a 2D map into
// per-column wall heights; world objects are drawn as distance-scaled BILLBOARDS. Everything here is pure math -- ray
// hits, wall distance, sprite projection, wall-collision movement, and a navigation "brain" that the GPU Brain can
// replace on-rig. The Canvas2D/WebGL draw is the only rig part.
"use strict";

// Camera: { px, py, dirX, dirY, planeX, planeY }. plane length sets the FOV (~0.66 => 66deg).
function makeCamera(px, py, angle, fov) { const f = fov == null ? 0.66 : fov; return { px, py, dirX: Math.cos(angle), dirY: Math.sin(angle), planeX: -Math.sin(angle) * f, planeY: Math.cos(angle) * f }; }
function cellAt(map, x, y) { const gy = map[y | 0]; return (y < 0 || x < 0 || !gy) ? 1 : (gy[x | 0] || 0); }   // out of bounds = wall

// DDA cast for one screen column (cameraX in [-1,1]); returns the perpendicular wall distance + which cell/side/texcoord.
function castRay(map, cam, cameraX) {
    const rayX = cam.dirX + cam.planeX * cameraX, rayY = cam.dirY + cam.planeY * cameraX;
    let mapX = cam.px | 0, mapY = cam.py | 0;
    const dDistX = Math.abs(rayX) < 1e-9 ? 1e30 : Math.abs(1 / rayX), dDistY = Math.abs(rayY) < 1e-9 ? 1e30 : Math.abs(1 / rayY);
    let stepX, stepY, sideX, sideY;
    if (rayX < 0) { stepX = -1; sideX = (cam.px - mapX) * dDistX; } else { stepX = 1; sideX = (mapX + 1 - cam.px) * dDistX; }
    if (rayY < 0) { stepY = -1; sideY = (cam.py - mapY) * dDistY; } else { stepY = 1; sideY = (mapY + 1 - cam.py) * dDistY; }
    let side = 0, hit = 0, guard = 0;
    while (!hit && guard++ < 512) { if (sideX < sideY) { sideX += dDistX; mapX += stepX; side = 0; } else { sideY += dDistY; mapY += stepY; side = 1; } if (cellAt(map, mapX, mapY)) hit = cellAt(map, mapX, mapY); }
    const perp = side === 0 ? (sideX - dDistX) : (sideY - dDistY);
    const wallPos = side === 0 ? (cam.py + perp * rayY) : (cam.px + perp * rayX); const wallX = wallPos - Math.floor(wallPos);
    return { perp: Math.max(1e-4, perp), side, mapX, mapY, cell: hit, wallX };
}
function raycastColumns(map, cam, W) { const cols = new Array(W); for (let x = 0; x < W; x++) cols[x] = castRay(map, cam, 2 * x / W - 1); return cols; }

// Project world sprites to screen billboards. Returns { screenX, depth, scale, spr } sorted far->near (painter order).
function projectSprites(sprites, cam, W) {
    const det = cam.planeX * cam.dirY - cam.dirX * cam.planeY, invDet = Math.abs(det) < 1e-9 ? 0 : 1 / det, out = [];
    for (const s of sprites) {
        const rx = s.x - cam.px, ry = s.y - cam.py;
        const transformX = invDet * (cam.dirY * rx - cam.dirX * ry);
        const depth = invDet * (-cam.planeY * rx + cam.planeX * ry);   // perpendicular depth; >0 = in front
        if (depth <= 0.05) continue;
        out.push({ screenX: (W / 2) * (1 + transformX / depth), depth, scale: 1 / depth, spr: s });
    }
    out.sort((a, b) => b.depth - a.depth); return out;
}

// Move with wall collision (slides along walls). dx,dy in world units.
function moveCollide(cam, dx, dy, map, radius) {
    const r = radius == null ? 0.2 : radius;
    if (!cellAt(map, cam.px + dx + Math.sign(dx) * r, cam.py)) cam.px += dx;
    if (!cellAt(map, cam.px, cam.py + dy + Math.sign(dy) * r)) cam.py += dy;
}
function rotate(cam, a) { const c = Math.cos(a), s = Math.sin(a); const dx = cam.dirX, px = cam.planeX; cam.dirX = dx * c - cam.dirY * s; cam.dirY = dx * s + cam.dirY * c; cam.planeX = px * c - cam.planeY * s; cam.planeY = px * s + cam.planeY * c; }


// Doors: cells that slide open as the pilot approaches and close behind. doors is a Map "x,y" -> { open:0..1, target }.
// The map cell is flipped between the door type (solid) and 0 (passable) at the half-open point, so the DDA and
// movement both see the current state; openAmount is kept for the render (a receding door slice).
function registerDoors(map, doorCell) { const D = doorCell || 4, m = new Map(); for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) if (map[y][x] === D) m.set(x + "," + y, { open: 0, target: 0 }); return m; }
function updateDoors(doors, map, cam, dt, opts = {}) {
    const D = opts.doorCell || 4, reach = opts.reach || 1.7, speed = opts.speed || 2.6;
    for (const [key, dr] of doors) { const c = key.split(","), dx = +c[0], dy = +c[1]; const near = Math.hypot(dx + 0.5 - cam.px, dy + 0.5 - cam.py) < reach; dr.target = near ? 1 : 0; const step = Math.min(Math.abs(dr.target - dr.open), speed * dt); dr.open += Math.sign(dr.target - dr.open) * step; map[dy][dx] = dr.open > 0.5 ? 0 : D; }
}

// Navigation "brain": look at the three forward rays + nearest sprite, return { turn, forward }. The GPU Brain drops in
// here on-rig (same contract: world in -> a heading out). This CPU policy wanders open space and never walks into walls.
function pilotNavigate(cam, map, sprites, opts = {}) {
    const ahead = castRay(map, cam, 0).perp, left = castRay(map, cam, -0.6).perp, right = castRay(map, cam, 0.6).perp;
    let turn = 0, forward = opts.speed || 0.045;
    if (ahead < 0.9) { turn = (left > right ? -1 : 1) * (opts.turn || 0.09); forward *= 0.25; }       // wall ahead -> turn toward open side
    else { turn = (right - left) * 0.04; }                                                            // drift toward the more open side
    // optional: steer toward the nearest sprite target (seek) or away (evade)
    if (sprites && sprites.length && opts.seek) { let best = null, bd = 1e9; for (const s of sprites) { const d = Math.hypot(s.x - cam.px, s.y - cam.py); if (d < bd) { bd = d; best = s; } } if (best) { const ang = Math.atan2(best.y - cam.py, best.x - cam.px), cur = Math.atan2(cam.dirY, cam.dirX); let da = ang - cur; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; turn += Math.max(-0.08, Math.min(0.08, da)) * (opts.seek || 0); } }
    return { turn, forward };
}

// Goal-seeking navigator: steer toward a world target (tx,ty), but yield to wall-avoidance when a wall is close, so the
// agent heads for the objective without ever driving into a corridor wall. Returns { turn, forward }; this is the brain
// the away-mission uses (and the GPU Brain can replace it via pilotStep opts.brain).
function seekTarget(cam, map, tx, ty, opts = {}) {
    const maxTurn = opts.turn || 0.1; let forward = opts.speed || 0.045;
    const ahead = castRay(map, cam, 0).perp, left = castRay(map, cam, -0.55).perp, right = castRay(map, cam, 0.55).perp;
    let turn;
    if (ahead < 0.75 || left < 0.4 || right < 0.4) { turn = (left > right ? -1 : 1) * maxTurn; forward *= 0.3; }   // wall/corner close -> avoid
    else { const ang = Math.atan2(ty - cam.py, tx - cam.px), cur = Math.atan2(cam.dirY, cam.dirX); let da = ang - cur; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; turn = Math.max(-maxTurn, Math.min(maxTurn, da)); }
    return { turn, forward };
}

function pilotStep(cam, map, sprites, opts) { const brain = (opts && opts.brain) || pilotNavigate; const { turn, forward } = brain(cam, map, sprites, opts); rotate(cam, turn); moveCollide(cam, cam.dirX * forward, cam.dirY * forward, map); return { turn, forward }; }   // opts.brain injects the GPU Brain on-rig


// Floor/ceiling casting: for a screen row below the horizon, return where in the world that row's pixels land, plus
// the per-column world step, so the demo can sample a floor texture per pixel (and mirror it for the ceiling).
function floorCastRow(cam, y, RW, RH) {
    const p = y - RH / 2; if (p <= 0) return null;
    const rowDist = (0.5 * RH) / p;
    const rdx0 = cam.dirX - cam.planeX, rdy0 = cam.dirY - cam.planeY, rdx1 = cam.dirX + cam.planeX, rdy1 = cam.dirY + cam.planeY;
    return { rowDist, floorX: cam.px + rowDist * rdx0, floorY: cam.py + rowDist * rdy0, stepX: rowDist * (rdx1 - rdx0) / RW, stepY: rowDist * (rdy1 - rdy0) / RW };
}

// Per-facing sprite frame: pick which frame of an N-frame turnaround sheet to show, from the angle the camera views the
// sprite relative to the sprite's own heading. So an ES ship shows its actual facing as you circle it.
function spriteFrame(spr, cam, nFrames) {
    const view = Math.atan2(cam.py - spr.y, cam.px - spr.x); let rel = view - (spr.facing || 0);
    const step = 2 * Math.PI / nFrames; let idx = Math.round(rel / step); return ((idx % nFrames) + nFrames) % nFrames;
}

export { makeCamera, castRay, raycastColumns, projectSprites, moveCollide, rotate, pilotNavigate, pilotStep, cellAt, floorCastRow, spriteFrame, registerDoors, updateDoors, seekTarget };
if (typeof module !== "undefined" && module.exports) module.exports = { makeCamera, castRay, raycastColumns, projectSprites, moveCollide, rotate, pilotNavigate, pilotStep, cellAt, floorCastRow, spriteFrame, registerDoors, updateDoors, seekTarget };
