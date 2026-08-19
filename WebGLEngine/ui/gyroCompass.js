// ui/gyroCompass.js — v1677
//
// A 3D-looking gyroscopic compass / attitude indicator that replaces the flat 2D heading widget. A world-horizontal
// ring carrying the N/E/S/W cardinals is projected through the LIVE camera orientation onto a 2D canvas, so it tips
// as you pitch (look up/down) and its cardinals spin as you yaw (turn) — the gyro metaphor Geek described: the ship
// turns, and the world appears to rotate around you while your view stays screen-"up".
//
// Why 2D canvas + projected-3D math (not a second Three.js context): it's lighter, can't trip the browser's
// WebGL-context limit, and the engine's main render keeps the only GL context. The ring is genuine 3D (projected),
// just rasterized on a 2D canvas.
//
// Camera read: window.camera exposes yaw + pitch (engine has no roll) and usually getForwardVector(). Forward at
// pitch 0 is (-sin yaw, 0, -cos yaw); North = world -Z, East = +X. We view the level ring from a fixed downward
// bias (BASE_DOWN) so it reads as an open gyro disc at level flight, and the camera's own pitch tips it further.
//
// Parking: mounts top-center; if the top-center SVG gauge dock (#swekDockedGauges) is shown, it tucks just under it
// (and its thin blue underbar); otherwise it sits at the very top-center. Sets window._compassWidget (with ._dom) so
// the dock's compass-present check + stacking keep working exactly as before.

const RAD = Math.PI / 180;
const BASE_DOWN = 0.95;                 // ~54° downward viewing bias so the ring is an open disc, not edge-on, at level flight
const PITCH_MIN = -1.45, PITCH_MAX = -0.12;   // clamp the effective view pitch so the disc never flips or goes edge-on
const RING_STEPS = 64;

function _headingDeg(fx, fz) {
    let h = Math.atan2(fx, -fz) * 180 / Math.PI;   // N(-Z)=0, E(+X)=90, S=180, W=270
    if (h < 0) h += 360;
    return h;
}
function _cardinal(deg) { return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((((deg % 360) + 360) % 360) / 45) % 8]; }

export class GyroCompass {
    constructor(opts = {}) {
        this.camera = opts.camera || window.camera || null;
        this.size = opts.size || 150;
        this.root = null; this._dom = null; this.canvas = null; this.ctx = null; this._label = null;
        this._raf = 0; this._dpr = Math.min(2, window.devicePixelRatio || 1);
        this._lastRepos = 0;
    }

    mount(host) {
        if (this.root) return this;
        const hosted = !!host;   // v1737 - hosted (e.g. inside the peer radar's compass mode) fills the host instead of parking center
        this._hosted = hosted;
        const root = document.createElement("div");
        Object.assign(root.style, hosted ? {
            position: "absolute", inset: "0", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", pointerEvents: "none",
            fontFamily: "ui-monospace,Menlo,Consolas,monospace", userSelect: "none",
        } : {
            position: "fixed", top: "8px", left: "50%", transform: "translateX(-50%)",
            zIndex: "60", pointerEvents: "none", textAlign: "center",
            fontFamily: "ui-monospace,Menlo,Consolas,monospace", userSelect: "none",
        });
        const cv = document.createElement("canvas");
        cv.width = Math.round(this.size * this._dpr); cv.height = Math.round(this.size * this._dpr);
        if (hosted) { cv.style.width = "100%"; cv.style.height = "auto"; cv.style.maxWidth = this.size + "px"; cv.style.display = "block"; }
        else { cv.style.width = this.size + "px"; cv.style.height = this.size + "px"; cv.style.display = "block"; }
        const lbl = document.createElement("div");
        Object.assign(lbl.style, { marginTop: "-4px", fontSize: "11px", letterSpacing: "1.5px", color: "#7fe0ff", textShadow: "0 0 5px rgba(0,0,0,.85)" });
        lbl.textContent = "\u2014";
        root.appendChild(cv); root.appendChild(lbl);
        (host || document.body).appendChild(root);
        this.root = root; this._dom = root; this.canvas = cv; this._label = lbl;
        this.ctx = cv.getContext("2d");
        const loop = () => { try { this._tick(); } catch {} this._raf = requestAnimationFrame(loop); };
        this._raf = requestAnimationFrame(loop);
        return this;
    }

    unmount() {
        if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
        if (this.root) { try { this.root.remove(); } catch {} }
        this.root = this._dom = this.canvas = this.ctx = this._label = null;
    }

    // Park under the gauge dock when it's shown; otherwise sit at the top-center default.
    _reposition() {
        if (this._hosted) return;   // v1737 - hosted inside another widget; skip fixed-position parking
        const now = performance.now ? performance.now() : Date.now();
        if (now - this._lastRepos < 250) return; this._lastRepos = now;
        try {
            const dock = document.getElementById("swekDockedGauges");
            if (dock && dock.style.display !== "none") {
                const r = dock.getBoundingClientRect();
                if (r.height > 0) { this.root.style.top = Math.round(r.bottom + 8) + "px"; return; }
            }
            this.root.style.top = "8px";
        } catch {}
    }

    // Build the camera view basis (right/up/forward) from yaw + pitch, with a fixed downward viewing bias.
    _basis() {
        const cam = this.camera || window.camera; if (!cam) return null;
        let yaw = Number(cam.yaw) || 0, pitch = Number(cam.pitch) || 0;
        // true forward (for the heading readout) — prefer the camera's own vector
        let tf = null; try { tf = cam.getForwardVector && cam.getForwardVector(); } catch {}
        if (!tf) tf = { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
        const heading = _headingDeg(tf.x, tf.z);
        // effective view forward: same yaw, but pitched down so we look onto the ring; camera pitch tips it further
        const pe = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch - BASE_DOWN));
        const cp = Math.cos(pe);
        const f = { x: -Math.sin(yaw) * cp, y: Math.sin(pe), z: -Math.cos(yaw) * cp };
        // right = normalize(cross(f, worldUp)) = normalize((-f.z, 0, f.x))
        let rx = -f.z, rz = f.x; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
        const right = { x: rx, y: 0, z: rz };
        // up = cross(right, f)
        const up = { x: right.y * f.z - right.z * f.y, y: right.z * f.x - right.x * f.z, z: right.x * f.y - right.y * f.x };
        return { right, up, fwd: f, heading };
    }

    _tick() {
        this._reposition();
        const ctx = this.ctx; if (!ctx) return;
        const b = this._basis();
        const W = this.canvas.width, H = this.canvas.height, S = this._dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
        const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.36;

        // --- fixed gimbal housing (screen-locked) ---
        ctx.lineWidth = 1.5 * S;
        ctx.strokeStyle = "rgba(70,120,150,0.55)";
        ctx.beginPath(); ctx.arc(cx, cy, R * 1.28, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "rgba(110,180,220,0.35)";
        ctx.beginPath(); ctx.arc(cx, cy, R * 1.16, 0, Math.PI * 2); ctx.stroke();
        // outer bezel ticks every 30°
        ctx.strokeStyle = "rgba(120,190,230,0.5)";
        for (let a = 0; a < 360; a += 30) {
            const t = a * RAD, c0 = Math.cos(t), s0 = Math.sin(t), big = (a % 90 === 0);
            ctx.lineWidth = (big ? 2 : 1) * S;
            ctx.beginPath();
            ctx.moveTo(cx + c0 * R * 1.16, cy + s0 * R * 1.16);
            ctx.lineTo(cx + c0 * R * (big ? 1.02 : 1.08), cy + s0 * R * (big ? 1.02 : 1.08));
            ctx.stroke();
        }
        // top lubber index (the heading you're facing reads at top)
        ctx.fillStyle = "#ffd24a";
        ctx.beginPath();
        ctx.moveTo(cx, cy - R * 1.30); ctx.lineTo(cx - 5 * S, cy - R * 1.40); ctx.lineTo(cx + 5 * S, cy - R * 1.40);
        ctx.closePath(); ctx.fill();

        if (!b) { ctx.fillStyle = "#567"; ctx.font = (11 * S) + "px ui-monospace,monospace"; ctx.textAlign = "center"; ctx.fillText("no camera", cx, cy); return; }
        const { right, up, fwd } = b;
        const proj = (wx, wy, wz) => ({
            x: cx + (wx * right.x + wy * right.y + wz * right.z) * R,
            y: cy - (wx * up.x + wy * up.y + wz * up.z) * R,
            d: (wx * fwd.x + wy * fwd.y + wz * fwd.z),     // depth: + = far side (top), - = near side (bottom)
        });

        // --- the world-horizontal level ring (the tipping gyro disc) ---
        const pts = [];
        for (let i = 0; i <= RING_STEPS; i++) {
            const th = (i / RING_STEPS) * Math.PI * 2;      // th=0 -> North(-Z); +X at th=90°
            pts.push(proj(Math.sin(th), 0, -Math.cos(th)));
        }
        // faint disc fill
        ctx.beginPath();
        pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.closePath();
        ctx.fillStyle = "rgba(30,90,130,0.18)"; ctx.fill();
        // ring stroke, segment alpha by depth (near/front brighter for a 3D read)
        ctx.lineWidth = 2 * S;
        for (let i = 0; i < RING_STEPS; i++) {
            const a = pts[i], c = pts[i + 1], dm = (a.d + c.d) / 2;
            const al = 0.85 - Math.max(-1, Math.min(1, dm)) * 0.45;   // far (d>0) dimmer, near (d<0) brighter
            ctx.strokeStyle = "rgba(127,224,255," + al.toFixed(3) + ")";
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
        }

        // --- cardinals + inter-cardinal ticks on the ring ---
        const marks = [[0, "N"], [45, ""], [90, "E"], [135, ""], [180, "S"], [225, ""], [270, "W"], [315, ""]];
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        for (const [deg, name] of marks) {
            const th = deg * RAD, p = proj(Math.sin(th), 0, -Math.cos(th));
            const near = (1 - Math.max(-1, Math.min(1, p.d))) / 2;   // 0 far .. 1 near
            if (!name) { ctx.fillStyle = "rgba(150,200,230," + (0.3 + near * 0.5).toFixed(2) + ")"; ctx.beginPath(); ctx.arc(p.x, p.y, (1.2 + near * 1.6) * S, 0, Math.PI * 2); ctx.fill(); continue; }
            const fs = (8 + near * 7) * S;
            ctx.font = "bold " + fs.toFixed(1) + "px ui-monospace,monospace";
            if (name === "N") { ctx.fillStyle = "rgba(255,107,107," + (0.55 + near * 0.45).toFixed(2) + ")"; }
            else { ctx.fillStyle = "rgba(180,225,255," + (0.4 + near * 0.55).toFixed(2) + ")"; }
            ctx.fillText(name, p.x, p.y);
        }

        // --- north needle: center -> projected North, with an arrowhead ---
        const nP = proj(0, 0, -1);
        ctx.strokeStyle = "rgba(255,90,90,0.9)"; ctx.lineWidth = 2 * S;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nP.x, nP.y); ctx.stroke();
        const ang = Math.atan2(nP.y - cy, nP.x - cx), ah = 5 * S;
        ctx.fillStyle = "rgba(255,90,90,0.95)";
        ctx.beginPath();
        ctx.moveTo(nP.x, nP.y);
        ctx.lineTo(nP.x - Math.cos(ang - 0.4) * ah, nP.y - Math.sin(ang - 0.4) * ah);
        ctx.lineTo(nP.x - Math.cos(ang + 0.4) * ah, nP.y - Math.sin(ang + 0.4) * ah);
        ctx.closePath(); ctx.fill();
        // center hub
        ctx.fillStyle = "#bfeaff"; ctx.beginPath(); ctx.arc(cx, cy, 2.4 * S, 0, Math.PI * 2); ctx.fill();

        // --- heading readout ---
        const hd = Math.round(b.heading);
        if (this._label) this._label.textContent = hd.toString().padStart(3, "0") + "\u00b0 " + _cardinal(b.heading);
    }
}

export function mountGyroCompass(opts) {
    const g = new GyroCompass(opts);
    g.mount();
    return g;
}
