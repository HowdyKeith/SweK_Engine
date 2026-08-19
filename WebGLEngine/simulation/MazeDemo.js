// FILE: simulation/MazeDemo.js
// VERSION: v1360 — a small generated maze with a mouse that auto-solves its way
// to the cheese, then a fresh maze spawns. Camera follows the mouse with a
// toggle between a TOP-DOWN chase and an OVER-THE-SHOULDER 3rd-person view.
//
// Built entirely from voxels (reuses world.setVoxel — the proven sandbox path):
// a floating floor slab + white walls, an orange mouse marker, a yellow cheese.
// Maze = recursive-backtracker; pathfinding = BFS over the cell graph. The demo
// exposes tick(dt) (called by the main loop while active), like CruiseDemo, and
// owns the camera by writing position/yaw/pitch each frame.
//
// Voxel ids: AIR 0, Stone 1 (floor), Snow 5 (walls), Sand 4 (cheese), Lava 12 (mouse).

const AIR = 0, FLOOR_ID = 1, WALL_ID = 5, CHEESE_ID = 4, MOUSE_ID = 12;
const FY = 48;            // floor height (floats above terrain — self-contained)
const WALL_H = 3;
const STEP_S = 0.34;      // seconds per node hop
const NIBBLE_S = 0.7;     // pause on the cheese before a new maze

// heading yaw for a grid step (engine forward = (sin yaw, , -cos yaw)):
//   N(-Z)=0, E(+X)=π/2, S(+Z)=π, W(-X)=-π/2
function headingYaw(dgx, dgz) {
    if (dgx > 0) return Math.PI / 2;
    if (dgx < 0) return -Math.PI / 2;
    if (dgz > 0) return Math.PI;
    return 0;
}
function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return a + d * t;
}

export class MazeDemo {
    constructor({ router, world, camera }) {
        this.router = router; this.world = world; this.camera = camera;
        this.active = false;
        this.W = 6; this.H = 6;               // cells — SMALL
        this.ox = -((2 * this.W + 1) >> 1);   // centre the maze near origin
        this.oz = -((2 * this.H + 1) >> 1);
        this.mode = "td";                     // "td" (top-down) | "shoulder"
        this._btn = null; this._key = null;
        this._lastT = 0;
    }

    // ---- maze generation (recursive backtracker) --------------------------
    _genMaze() {
        const W = this.W, H = this.H;
        const cell = (x, z) => z * W + x;
        const walls = Array.from({ length: W * H }, () => [true, true, true, true]); // N,E,S,W
        const seen = new Uint8Array(W * H);
        const stack = [[0, 0]]; seen[0] = 1;
        const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];
        while (stack.length) {
            const [cx, cz] = stack[stack.length - 1];
            const opts = [];
            for (let d = 0; d < 4; d++) {
                const nx = cx + DX[d], nz = cz + DZ[d];
                if (nx >= 0 && nx < W && nz >= 0 && nz < H && !seen[cell(nx, nz)]) opts.push(d);
            }
            if (!opts.length) { stack.pop(); continue; }
            const d = opts[(Math.random() * opts.length) | 0];
            const nx = cx + DX[d], nz = cz + DZ[d];
            walls[cell(cx, cz)][d] = false;
            walls[cell(nx, nz)][(d + 2) % 4] = false;
            seen[cell(nx, nz)] = 1;
            stack.push([nx, nz]);
        }
        this.walls = walls;
    }

    // ---- BFS shortest path (cell coords) ----------------------------------
    _solve(sx, sz, gx, gz) {
        const W = this.W, H = this.H, cell = (x, z) => z * W + x;
        const prev = new Int32Array(W * H).fill(-1);
        const seen = new Uint8Array(W * H);
        const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];
        const q = [[sx, sz]]; seen[cell(sx, sz)] = 1;
        while (q.length) {
            const [cx, cz] = q.shift();
            if (cx === gx && cz === gz) break;
            const w = this.walls[cell(cx, cz)];
            for (let d = 0; d < 4; d++) {
                if (w[d]) continue;
                const nx = cx + DX[d], nz = cz + DZ[d];
                if (nx < 0 || nx >= W || nz < 0 || nz >= H || seen[cell(nx, nz)]) continue;
                seen[cell(nx, nz)] = 1; prev[cell(nx, nz)] = cell(cx, cz); q.push([nx, nz]);
            }
        }
        // reconstruct cell path
        const cells = []; let cur = cell(gx, gz);
        while (cur !== -1) { cells.unshift([cur % W, (cur / W) | 0]); cur = prev[cur]; }
        // expand to wall-grid nodes (cell centre, midpoint, cell centre, …)
        const node = (cx, cz) => [2 * cx + 1, 2 * cz + 1];
        const nodes = [node(cells[0][0], cells[0][1])];
        for (let i = 1; i < cells.length; i++) {
            const a = node(cells[i - 1][0], cells[i - 1][1]);
            const b = node(cells[i][0], cells[i][1]);
            nodes.push([(a[0] + b[0]) >> 1, (a[1] + b[1]) >> 1]); // wall midpoint (open)
            nodes.push(b);
        }
        return nodes;
    }

    // ---- voxel build ------------------------------------------------------
    _wx(gx) { return this.ox + gx; }
    _wz(gz) { return this.oz + gz; }
    _set(gx, gz, y, id) { try { this.world.setVoxel(this._wx(gx), y, this._wz(gz), id); } catch {} }

    _build() {
        const GW = 2 * this.W + 1, GH = 2 * this.H + 1;
        // wallGrid: true = wall column. Cell centres + carved midpoints are open.
        const wall = Array.from({ length: GW * GH }, () => true);
        const open = (gx, gz) => { wall[gz * GW + gx] = false; };
        for (let cz = 0; cz < this.H; cz++) for (let cx = 0; cx < this.W; cx++) {
            open(2 * cx + 1, 2 * cz + 1);
            const w = this.walls[cz * this.W + cx];
            if (!w[0]) open(2 * cx + 1, 2 * cz);       // N
            if (!w[1]) open(2 * cx + 2, 2 * cz + 1);   // E
            if (!w[2]) open(2 * cx + 1, 2 * cz + 2);   // S
            if (!w[3]) open(2 * cx, 2 * cz + 1);       // W
        }
        for (let gz = 0; gz < GH; gz++) for (let gx = 0; gx < GW; gx++) {
            this._set(gx, gz, FY, FLOOR_ID);                      // floor slab
            if (wall[gz * GW + gx]) for (let h = 1; h <= WALL_H; h++) this._set(gx, gz, FY + h, WALL_ID);
        }
    }

    _clearRegion() {
        const GW = 2 * this.W + 1, GH = 2 * this.H + 1;
        for (let gz = 0; gz < GH; gz++) for (let gx = 0; gx < GW; gx++)
            for (let h = 0; h <= WALL_H + 1; h++) this._set(gx, gz, FY + h, AIR);
    }

    _nodeWorld(n) { return [this._wx(n[0]) + 0.5, FY + 1, this._wz(n[1]) + 0.5]; }

    _newRun() {
        this._genMaze();
        this._build();
        this.path = this._solve(0, 0, this.W - 1, this.H - 1);
        this.idx = 0; this.t = 0;
        this.heading = 0;
        // mouse marker + cheese
        this._set(this.path[0][0], this.path[0][1], FY + 1, MOUSE_ID);
        const goal = [2 * (this.W - 1) + 1, 2 * (this.H - 1) + 1];
        this._cheese = goal;
        this._set(goal[0], goal[1], FY + 1, CHEESE_ID);
        const w0 = this._nodeWorld(this.path[0]);
        this.smooth = { x: w0[0], y: w0[1], z: w0[2] };
        this._nibble = 0;
    }

    // v1414 — remote/pad action: rebuild a fresh maze.
    regen() { try { this._clearRegion(); } catch (e) {} this._newRun(); }   // _newRun re-gens + rebuilds + re-solves

    start() {
        this.stop();
        this._newRun();
        this.active = true;
        this._lastT = (typeof performance !== "undefined" ? performance.now() : Date.now());
        // place camera up at the maze immediately
        const w = this.smooth;
        try { this.camera.position.x = w.x; this.camera.position.y = FY + 16; this.camera.position.z = w.z + 4; this.camera.yaw = 0; this.camera.pitch = -1.25; } catch {}
        this._mountToggle();
        try { window.maze = { start: () => this.start(), stop: () => this.stop(), mode: (m) => { this.mode = (m === "shoulder" ? "shoulder" : "td"); } }; } catch {}
    }

    stop() {
        if (this.active) { try { this._clearRegion(); } catch {} }
        this.active = false;
        if (this._btn) { try { this._btn.remove(); } catch {} this._btn = null; }
        if (this._key) { try { window.removeEventListener("keydown", this._key); } catch {} this._key = null; }
    }

    _mountToggle() {
        if (this._btn || typeof document === "undefined") return;
        const b = document.createElement("button");
        b.id = "mazeCamBtn";
        const label = () => "\uD83D\uDC01 Cam: " + (this.mode === "td" ? "Top-down" : "Over-shoulder") + "  (V)";
        b.textContent = label();
        b.style.cssText = "position:fixed; left:50%; bottom:14px; transform:translateX(-50%); z-index:40; " +
            "padding:7px 14px; border-radius:9px; border:1px solid #2a4038; background:rgba(8,16,16,0.9); " +
            "color:#8af0c8; font:12px ui-monospace, monospace; cursor:pointer; pointer-events:auto;";
        const toggle = () => { this.mode = this.mode === "td" ? "shoulder" : "td"; b.textContent = label(); };
        b.addEventListener("click", toggle);
        this._key = (e) => { if ((e.key === "v" || e.key === "V") && this.active) toggle(); };
        window.addEventListener("keydown", this._key);
        document.body.appendChild(b);
        this._btn = b;
    }

    tick() {
        if (!this.active || !this.path) return;
        const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
        let dt = (now - this._lastT) / 1000; this._lastT = now;
        if (!(dt > 0) || dt > 0.25) dt = 0.016;

        if (this._nibble > 0) {
            this._nibble -= dt;
            if (this._nibble <= 0) this._newRun();
        } else if (this.idx < this.path.length - 1) {
            this.t += dt / STEP_S;
            while (this.t >= 1 && this.idx < this.path.length - 1) {
                this.t -= 1;
                const from = this.path[this.idx], to = this.path[this.idx + 1];
                this._set(from[0], from[1], FY + 1, AIR);          // clear old marker
                this.idx++;
                this.heading = headingYaw(to[0] - from[0], to[1] - from[1]);
                const at = this.path[this.idx];
                if (this.idx >= this.path.length - 1) {            // reached cheese
                    this._set(at[0], at[1], FY + 1, MOUSE_ID);
                    this._nibble = NIBBLE_S; this.t = 0;
                } else {
                    this._set(at[0], at[1], FY + 1, MOUSE_ID);
                }
            }
            // smooth camera target between current node and the next
            const a = this._nodeWorld(this.path[this.idx]);
            const b = this._nodeWorld(this.path[Math.min(this.idx + 1, this.path.length - 1)]);
            const tt = Math.min(1, this.t);
            this.smooth.x = a[0] + (b[0] - a[0]) * tt;
            this.smooth.z = a[2] + (b[2] - a[2]) * tt;
            this.smooth.y = FY + 1;
        }

        this._driveCamera(dt);
    }

    _driveCamera(dt) {
        const cam = this.camera; if (!cam || !cam.position) return;
        const yaw = this.heading;
        const fx = Math.sin(yaw), fz = -Math.cos(yaw);     // forward XZ
        let tx, ty, tz, pitch;
        if (this.mode === "shoulder") {
            tx = this.smooth.x - fx * 5; tz = this.smooth.z - fz * 5; ty = FY + 4; pitch = -0.28;
        } else { // top-down chase
            tx = this.smooth.x - fx * 3; tz = this.smooth.z - fz * 3; ty = FY + 16; pitch = -1.25;
        }
        const k = Math.min(1, dt * 6);   // position smoothing
        cam.position.x += (tx - cam.position.x) * k;
        cam.position.y += (ty - cam.position.y) * k;
        cam.position.z += (tz - cam.position.z) * k;
        try { cam.yaw = lerpAngle(cam.yaw || 0, yaw, Math.min(1, dt * 5)); cam.pitch = pitch; } catch {}
    }
}

export default MazeDemo;
