// FILE: data/assetLibraryClient.js
// VERSION: v1 (v799 — Universal Asset Library)
//
// Engine-side client for the bridge's /assets/* endpoints. Exposes
// window.assetLibrary. Any engine running (phone, PC, Shield) that
// points at the same bridge sees the same library.

const DEFAULT_BRIDGE_URL = "http://localhost:8765";

class AssetLibraryClient {
    constructor(bridgeUrl = DEFAULT_BRIDGE_URL) {
        this.bridgeUrl = bridgeUrl;
    }

    async status() {
        try {
            const r = await fetch(`${this.bridgeUrl}/assets/status`);
            return await r.json();
        } catch (e) { return { error: `bridge unreachable: ${e.message}` }; }
    }

    async list(filter = {}) {
        const qs = new URLSearchParams();
        if (filter.source) qs.set("source", filter.source);
        if (filter.type)   qs.set("type", filter.type);
        if (filter.tag)    qs.set("tag", filter.tag);
        const url = `${this.bridgeUrl}/assets/list${qs.toString() ? "?" + qs : ""}`;
        const r = await fetch(url);
        return await r.json();
    }

    async get(id) {
        if (!id) throw new Error("assetLibrary.get: missing id");
        const r = await fetch(`${this.bridgeUrl}/assets/get?id=${encodeURIComponent(id)}`);
        return await r.json();
    }

    // v811 — fetch sampled geometry only (lighter than full get())
    async getGeom(id) {
        if (!id) throw new Error("assetLibrary.getGeom: missing id");
        const r = await fetch(`${this.bridgeUrl}/assets/geom?id=${encodeURIComponent(id)}`);
        return await r.json();
    }

    async add(input) {
        if (!input?.type)   throw new Error("assetLibrary.add: missing type");
        if (!input?.source) throw new Error("assetLibrary.add: missing source");
        const r = await fetch(`${this.bridgeUrl}/assets/add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });
        return await r.json();
    }

    async remove(id) {
        if (!id) throw new Error("assetLibrary.remove: missing id");
        const r = await fetch(`${this.bridgeUrl}/assets/remove`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        return await r.json();
    }

    async rename(id, newName) {
        if (!id || !newName) throw new Error("assetLibrary.rename: missing id or name");
        const r = await fetch(`${this.bridgeUrl}/assets/rename`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, name: newName }),
        });
        return await r.json();
    }

    async orient(id, orientation) {
        if (!id) throw new Error("assetLibrary.orient: missing id");
        const r = await fetch(`${this.bridgeUrl}/assets/orient`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, orientation }),
        });
        return await r.json();
    }

    // v802 — retroactively scan the kaggle output dir and ingest new files
    async scanKaggle(dir) {
        const r = await fetch(`${this.bridgeUrl}/assets/scan-kaggle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dir: dir || null }),
        });
        return await r.json();
    }

    // v804 — add or remove a tag on a single asset
    async tag(id, tag, op = "add") {
        if (!id || !tag) throw new Error("assetLibrary.tag: missing id or tag");
        const r = await fetch(`${this.bridgeUrl}/assets/tag`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, tag, op }),
        });
        return await r.json();
    }

    // v807 — set the free-text notes/description on an asset
    async note(id, notes) {
        if (!id) throw new Error("assetLibrary.note: missing id");
        const r = await fetch(`${this.bridgeUrl}/assets/note`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, notes: String(notes || "") }),
        });
        return await r.json();
    }

    // v816 — bind a rig asset to a splat asset (rigId=null to clear)
    async bindRig(splatId, rigId) {
        if (!splatId) throw new Error("assetLibrary.bindRig: missing splatId");
        const r = await fetch(`${this.bridgeUrl}/assets/bind-rig`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ splatId, rigId: rigId ?? null }),
        });
        return await r.json();
    }

    // v818 — bind an animation clip to a splat (requires rig already bound)
    async bindClip(splatId, clipId) {
        if (!splatId) throw new Error("assetLibrary.bindClip: missing splatId");
        const r = await fetch(`${this.bridgeUrl}/assets/bind-clip`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ splatId, clipId: clipId ?? null }),
        });
        return await r.json();
    }

    // v807 — duplicate an asset (deep clone with new id)
    async duplicate(id, newName) {
        if (!id) throw new Error("assetLibrary.duplicate: missing id");
        const r = await fetch(`${this.bridgeUrl}/assets/duplicate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, newName: newName || null }),
        });
        return await r.json();
    }

    // v807 — fetch URL + ingest as new asset
    async importFromUrl(url, opts) {
        if (!url) throw new Error("assetLibrary.importFromUrl: missing url");
        const r = await fetch(`${this.bridgeUrl}/assets/import-url`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, opts: opts || {} }),
        });
        return await r.json();
    }

    // v808 — cache a rendered thumbnail in the manifest (silent — no SSE)
    async setThumb(id, thumbBase64) {
        if (!id) throw new Error("assetLibrary.setThumb: missing id");
        const r = await fetch(`${this.bridgeUrl}/assets/thumb`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, thumbBase64 }),
        });
        return await r.json();
    }

    // v810 — bulk export selected assets as a ZIP blob. Returns
    // { ok, blob, count } on success, { error } on failure.
    async exportZip(ids) {
        if (!Array.isArray(ids) || ids.length === 0) throw new Error("assetLibrary.exportZip: provide at least one id");
        const r = await fetch(`${this.bridgeUrl}/assets/export-zip`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
        });
        if (!r.ok) {
            try { return await r.json(); }
            catch { return { error: `HTTP ${r.status}` }; }
        }
        const blob = await r.blob();
        const count = parseInt(r.headers.get("X-Asset-Count") || "0", 10);
        return { ok: true, blob, count };
    }

    // v813 — re-run geomSample extraction on existing assets (one-time migration)
    async regenerateGeom(opts = {}) {
        const r = await fetch(`${this.bridgeUrl}/assets/regenerate-geom`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(opts),
        });
        return await r.json();
    }
}

export function installAssetLibraryGlobal(bridgeUrl) {
    if (typeof window === "undefined") return null;
    const client = new AssetLibraryClient(bridgeUrl);
    window.assetLibrary = {
        status:  ()                => client.status(),
        list:    (filter)          => client.list(filter),
        get:     (id)              => client.get(id),
        getGeom: (id)              => client.getGeom(id),              // v811 — sampled geometry only
        add:     (input)           => client.add(input),
        remove:  (id)              => client.remove(id),
        rename:  (id, newName)     => client.rename(id, newName),
        orient:  (id, orientation) => client.orient(id, orientation),
        scanKaggle: (dir)          => client.scanKaggle(dir),
        tag:     (id, tag, op)     => client.tag(id, tag, op),       // v804 — add/remove tag
        note:    (id, notes)       => client.note(id, notes),         // v807 — set notes/description
        bindRig: (splatId, rigId)  => client.bindRig(splatId, rigId), // v816 — bind a rig to a splat
        bindClip: (splatId, clipId) => client.bindClip(splatId, clipId), // v818 — bind an animation clip
        duplicate: (id, newName)   => client.duplicate(id, newName),  // v807 — clone
        importFromUrl: (url, opts) => client.importFromUrl(url, opts),// v807 — fetch + ingest from URL
        setThumb: (id, thumbBase64) => client.setThumb(id, thumbBase64), // v808 — cache rendered thumb
        exportZip: (ids)           => client.exportZip(ids),              // v810 — bulk zip export
        regenerateGeom: (opts)     => client.regenerateGeom(opts),         // v813 — re-extract geom for existing assets
        // v803 — spawn an asset into the scene. Delegates to a global
        // helper that has the rig + router context (defined in main.js).
        spawn:   (id, opts)        => {
            if (typeof window.spawnAssetFromLibrary !== "function") {
                return Promise.resolve({ ok: false, error: "spawn helper not ready (engine still initializing?)" });
            }
            return window.spawnAssetFromLibrary(id, opts || {});
        },
        _ref: client,
    };
    console.log("[AssetLibrary] ready — window.assetLibrary.{status, list, get, add, remove, rename, orient}");
    return client;
}

export { AssetLibraryClient };
