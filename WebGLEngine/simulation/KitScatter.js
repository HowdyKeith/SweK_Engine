// FILE: simulation/KitScatter.js
//
// v1403 — drop GLB props from a GPU_Assets folder onto the world. Lists a folder via
// /assets/folder, preloads the models, and places `count` of them in a ring/disc around
// a centre, each dropped onto the terrain via heightAt(). Falls back to a visible
// placeholder when the folder is empty (so the demo still reads before you import a kit).
//
//   const ks = makeKitScatter({ router, assetLoader, heightAt });
//   await ks.scatter({ folder: "Space", cx, cz, count: 24, radius: 60, minR: 12 });
//   ks.clear();

export function makeKitScatter({ router, assetLoader, heightAt }) {
    let _ids = [];
    const _bare = (n) => String(n || "").replace(/\.(glb|gltf|vrm|fbx|obj)$/i, "");

    async function _models(folder) {
        try {
            const j = await fetch("/assets/folder?name=" + encodeURIComponent(folder)).then(r => r.json());
            return (j && j.ok && Array.isArray(j.models)) ? j.models.map(m => _bare(m.name)) : [];
        } catch { return []; }
    }

    async function scatter(o = {}) {
        const folder = o.folder || "";
        const count = o.count ?? 24;
        const cx = o.cx ?? 0, cz = o.cz ?? 0;
        const radius = o.radius ?? 50, minR = o.minR ?? 0;
        const scale = o.scale ?? 1, yOff = o.yOffset ?? 0;
        const placeholder = o.placeholder || "wad_plate";
        if (!o.append) clear();

        const uniq = [...new Set(await _models(folder))];
        for (const n of uniq) { try { await assetLoader.loadAsset(n); } catch {} }
        const usable = uniq.filter(n => assetLoader.cache?.get(n));
        const pick = () => usable.length ? usable[(Math.random() * usable.length) | 0] : placeholder;

        let placed = 0;
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const r = minR + Math.random() * Math.max(0.01, radius - minR);
            const x = Math.round(cx + Math.cos(ang) * r), z = Math.round(cz + Math.sin(ang) * r);
            let y = o.y;
            if (y == null) { try { y = heightAt ? (heightAt(x, z) | 0) + 1 : 1; } catch { y = 1; } }
            y += yOff;
            const yaw = (o.yaw == null || o.yaw === "random") ? Math.random() * Math.PI * 2 : o.yaw;
            try {
                const res = router.exec({ type: "entity:spawnMesh", assetId: pick(), kind: "kit_" + (folder || "misc"), x, y, z, scaleX: scale, scaleY: scale, scaleZ: scale });
                if (res && res.id != null) { _ids.push(res.id); placed++; try { router.exec({ type: "entity:move", id: res.id, x, y, z, yaw }); } catch {} }
            } catch {}
        }
        console.log(`[kitScatter] placed ${placed} from "${folder}" ${usable.length ? "(" + usable.length + " model(s))" : "as PLACEHOLDERS \u2014 import the kit, then re-run"}.`);
        return { ok: true, placed, folder, models: usable.length };
    }

    function clear() { for (const id of _ids) { try { router.exec({ type: "entity:despawn", id }); } catch {} } const n = _ids.length; _ids = []; return n; }
    return { scatter, clear, get count() { return _ids.length; }, _models };
}
