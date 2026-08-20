// FILE: ui/avatarOrientation.js
// VERSION: v884 — per-avatar orientation override (front-view realign).
//
// Many imported glb/gltf models are authored Z-up or lying on their back
// (the BrainStem / CesiumMan "overhead" case), and some voxel assets arrive
// "sitting on their butt." This store lets the user rotate a model in 90°
// snaps (plus a fine yaw nudge) to stand it up + face front, and persists
// that choice PER URL so it travels with the avatar everywhere it loads —
// including the favorites list (favorites are also keyed by url).
//
// Deliberately generic + dependency-free: keyed by the same url string the
// favorites / costume / accessory stores use, so the voxel render path can
// read the same override later without touching the avatar renderer.
//
// LocalStorage shape:
//   voxelEngine.avatarOrientation = { [url]: { yaw, pitch, roll } }   (degrees)
//
// API (window.avatarOrientation):
//   get(url)                  → { yaw, pitch, roll }  (defaults 0,0,0)
//   set(url, {yaw,pitch,roll})→ stores (normalizes to [0,360))
//   rotate(url, axis, deg)    → axis ∈ "yaw"|"pitch"|"roll"; adds deg
//   reset(url)                → clears the override for url
//   buildMatrix(o)            → Float32Array(16) column-major Ry·Rx·Rz
//   onChange(fn)              → subscribe; fn({url, orientation}); returns unsub
//
// Angles are applied as world-space rotations after skinning in
// robotFaceAvatar.js's uModelRot uniform: P' = Ry·Rx·Rz · P.

const STORAGE_KEY = "voxelEngine.avatarOrientation";

function _norm(deg) {
    let d = deg % 360;
    if (d < 0) d += 360;
    return d;
}

class AvatarOrientationStore {
    constructor() {
        this._map = {};
        this._listeners = new Set();
        this._load();
    }

    _load() {
        try {
            const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            if (raw && typeof raw === "object") this._map = raw;
        } catch { this._map = {}; }
    }
    _save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._map)); } catch {}
    }
    _notify(url) {
        const o = this.get(url);
        for (const fn of this._listeners) { try { fn({ url, orientation: o }); } catch {} }
    }

    get(url) {
        const o = (url && this._map[url]) || null;
        return {
            yaw:   o && Number.isFinite(o.yaw)   ? o.yaw   : 0,
            pitch: o && Number.isFinite(o.pitch) ? o.pitch : 0,
            roll:  o && Number.isFinite(o.roll)  ? o.roll  : 0,
        };
    }

    set(url, { yaw = 0, pitch = 0, roll = 0 } = {}) {
        if (!url) return;
        const o = { yaw: _norm(yaw), pitch: _norm(pitch), roll: _norm(roll) };
        // If everything is zero, drop the key entirely (keeps storage clean
        // and means "no override" is indistinguishable from "reset to front").
        if (o.yaw === 0 && o.pitch === 0 && o.roll === 0) delete this._map[url];
        else this._map[url] = o;
        this._save();
        this._notify(url);
    }

    rotate(url, axis, deg) {
        const cur = this.get(url);
        if (axis === "yaw")   cur.yaw   = _norm(cur.yaw   + deg);
        if (axis === "pitch") cur.pitch = _norm(cur.pitch + deg);
        if (axis === "roll")  cur.roll  = _norm(cur.roll  + deg);
        this.set(url, cur);
    }

    reset(url) {
        if (url && this._map[url]) { delete this._map[url]; this._save(); }
        this._notify(url);
    }

    // Column-major Ry·Rx·Rz (matches the engine's WebGL mat4 layout). Yaw
    // about Y, pitch about X, roll about Z. Returns Float32Array(16).
    buildMatrix(o) {
        const d2r = Math.PI / 180;
        const y = (o?.yaw   || 0) * d2r;
        const x = (o?.pitch || 0) * d2r;
        const z = (o?.roll  || 0) * d2r;
        const cy = Math.cos(y), sy = Math.sin(y);
        const cx = Math.cos(x), sx = Math.sin(x);
        const cz = Math.cos(z), sz = Math.sin(z);

        // Rz, Rx, Ry as column-major 3x3 (index = col*3 + row)
        const Rz = [ cz, sz, 0,  -sz, cz, 0,  0, 0, 1 ];
        const Rx = [ 1, 0, 0,  0, cx, sx,  0, -sx, cx ];
        const Ry = [ cy, 0, -sy,  0, 1, 0,  sy, 0, cy ];

        // M3 = Ry * Rx * Rz  (column-major 3x3 multiply helper)
        const mul3 = (a, b) => {
            const o3 = new Array(9);
            for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) {
                o3[c * 3 + r] = a[0 * 3 + r] * b[c * 3 + 0]
                              + a[1 * 3 + r] * b[c * 3 + 1]
                              + a[2 * 3 + r] * b[c * 3 + 2];
            }
            return o3;
        };
        const m3 = mul3(mul3(Ry, Rx), Rz);

        // Expand to column-major 4x4
        const m = new Float32Array(16);
        m[0]=m3[0]; m[1]=m3[1]; m[2]=m3[2];  m[3]=0;
        m[4]=m3[3]; m[5]=m3[4]; m[6]=m3[5];  m[7]=0;
        m[8]=m3[6]; m[9]=m3[7]; m[10]=m3[8]; m[11]=0;
        m[12]=0;    m[13]=0;    m[14]=0;     m[15]=1;
        return m;
    }

    onChange(fn) {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }
}

const store = new AvatarOrientationStore();

if (typeof window !== "undefined") {
    window.avatarOrientation = store;
}

export default store;
export { AvatarOrientationStore };
