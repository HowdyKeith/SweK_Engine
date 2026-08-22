// FILE: simulation/FpsStateSaver.js
// VERSION: v1 — round 270b
//
// Minimal save/restore of player state to localStorage. Saves:
//   - camera position (x, y, z)
//   - camera yaw + pitch
//   - camera mode (fp / observer / kaiju_drive / etc.)
//   - playerEnergy.current + max
//   - day/night hour
//
// Console:
//   fps.save("name")    — checkpoint to localStorage under `name`
//                          (defaults to "default")
//   fps.load("name")    — restore from a saved slot
//   fps.list()          — list saved slots
//   fps.clear("name")   — delete a saved slot (or all if "*")
//
// Does NOT persist: world state (chunks regenerate from seed),
// kaiju roster, civ state, demo progress. This is a "go back to my
// vantage point" feature, not a full save game.

const KEY_PREFIX = "voxelengine.fpsSave.";

export class FpsStateSaver {
    constructor({ camera, playerEnergy, dayNightCycle } = {}) {
        this.camera = camera;
        this.playerEnergy = playerEnergy;
        this.dayNightCycle = dayNightCycle;
    }

    save(slot = "default") {
        const data = {
            ts: Date.now(),
            slot,
            camera: this.camera ? {
                x: this.camera.position?.x ?? 0,
                y: this.camera.position?.y ?? 0,
                z: this.camera.position?.z ?? 0,
                yaw:   this.camera.yaw   ?? 0,
                pitch: this.camera.pitch ?? 0,
                mode:  this.camera.mode  ?? "fp",
            } : null,
            energy: this.playerEnergy ? {
                current: this.playerEnergy.current,
                max:     this.playerEnergy.max,
            } : null,
            hour: this.dayNightCycle?.getHour?.() ?? null,
        };
        try {
            localStorage.setItem(KEY_PREFIX + slot, JSON.stringify(data));
            console.log(`[fpsSave] checkpoint "${slot}" stored:`,
                `pos=(${data.camera?.x.toFixed(1)}, ${data.camera?.y.toFixed(1)}, ${data.camera?.z.toFixed(1)}),`,
                `hour=${data.hour?.toFixed(1)}`);
            return true;
        } catch (e) {
            console.warn("[fpsSave] save failed:", e);
            return false;
        }
    }

    load(slot = "default") {
        let data;
        try {
            const raw = localStorage.getItem(KEY_PREFIX + slot);
            if (!raw) {
                console.warn(`[fpsSave] no save in slot "${slot}"`);
                return false;
            }
            data = JSON.parse(raw);
        } catch (e) {
            console.warn("[fpsSave] load failed:", e);
            return false;
        }
        if (data.camera && this.camera) {
            this.camera.position.x = data.camera.x;
            this.camera.position.y = data.camera.y;
            this.camera.position.z = data.camera.z;
            this.camera.yaw   = data.camera.yaw;
            this.camera.pitch = data.camera.pitch;
            // Don't force mode change — that has side effects in
            // pointerLock & cursor handling. If the user wants to
            // change modes, they can do that separately.
        }
        if (data.energy && this.playerEnergy) {
            this.playerEnergy.current = data.energy.current;
            this.playerEnergy.max     = data.energy.max;
        }
        if (data.hour != null && this.dayNightCycle?.setHour) {
            this.dayNightCycle.setHour(data.hour);
        }
        console.log(`[fpsSave] restored "${slot}" from ${new Date(data.ts).toLocaleTimeString()}`);
        return true;
    }

    list() {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith(KEY_PREFIX)) {
                try {
                    const data = JSON.parse(localStorage.getItem(k));
                    out.push({
                        slot: k.slice(KEY_PREFIX.length),
                        ts: new Date(data.ts).toLocaleString(),
                        pos: data.camera
                            ? `(${data.camera.x.toFixed(0)}, ${data.camera.y.toFixed(0)}, ${data.camera.z.toFixed(0)})`
                            : "—",
                    });
                } catch {}
            }
        }
        if (out.length === 0) {
            console.log("[fpsSave] no saves");
        } else {
            console.log("[fpsSave] slots:");
            for (const s of out) console.log(`  ${s.slot.padEnd(20)} ${s.pos}  ${s.ts}`);
        }
        return out;
    }

    clear(slot = "default") {
        if (slot === "*") {
            let n = 0;
            const toRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k?.startsWith(KEY_PREFIX)) toRemove.push(k);
            }
            for (const k of toRemove) { localStorage.removeItem(k); n++; }
            console.log(`[fpsSave] cleared ${n} slots`);
            return n;
        }
        try {
            localStorage.removeItem(KEY_PREFIX + slot);
            console.log(`[fpsSave] cleared "${slot}"`);
            return true;
        } catch (e) {
            return false;
        }
    }
}

export function installFpsSaveConsoleAPI(saver) {
    if (typeof window === "undefined") return;
    window.fps = window.fps || {};
    window.fps.save  = (slot) => saver.save(slot);
    window.fps.load  = (slot) => saver.load(slot);
    window.fps.list  = ()     => saver.list();
    window.fps.clear = (slot) => saver.clear(slot);
    console.log("[fpsSave] try `fps.save()`, `fps.load()`, `fps.list()`");
}
