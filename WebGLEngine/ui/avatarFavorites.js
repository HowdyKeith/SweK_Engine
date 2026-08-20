// WebGLEngine/ui/avatarFavorites.js — v3557
// ---------------------------------------------------------------------------------------------------------------
// THE FAVOURITES STAR — and it deliberately owns no storage of its own.
//
// A second small button under the mode switch on server.html's avatar panel. Hover says "Set Favorite"; click
// opens a picker built from the live GPU asset list, and a chosen GLB becomes a mode in the rotation like any
// other surface.
//
// *** IT REUSES ui/kpopFavorites.js RATHER THAN KEEPING ITS OWN LIST, AND THAT IS THE WHOLE DESIGN. *** The
// sandbox already has this store: keyed by URL, shared with avatarOrientation and avatarRegistry, and read by
// the phone and PC avatar cycles. A second favourites list on this page would be the two-declarations defect
// this tree names more than any other -- you would star something here, not see it there, and never find out
// why. So this file has NO localStorage key. It reads and writes the one that already exists, and a favourite
// set on server.html shows up in the sandbox cycle by construction.
//
// AND IT IS NOT THE MODE ROTATION EITHER. v3556 settled that the mode switch carries its own five-entry list and
// does not touch the sandbox's avatar cycle. Favourites are a DIFFERENT axis: the switch chooses WHICH KIND of
// surface, the star chooses WHICH GLB the rigged surface shows. Keeping them separate is why the star sits under
// the switch rather than being folded into it.
//
// TWO SLOTS, BECAUSE KEITH ASKED FOR "1, OR 2". More than two on a 22-pixel button is a menu pretending to be a
// shortcut, and the store itself holds as many as you like -- these are the two promoted to one-click.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

export const SLOTS = 2;
const SLOT_KEY = "swek.serverAvatarSlots";     // WHICH favourites are promoted, not the favourites themselves

/** Read the shared store. Absent is an empty list, never an error: the sandbox may not have loaded yet. */
export function readFavorites() {
    try {
        const f = (typeof window !== "undefined") && window.kpopFavorites;
        if (f && typeof f.list === "function") return f.list() || [];
    } catch {}
    return [];
}

export function addFavorite(url, label) {
    try {
        const f = (typeof window !== "undefined") && window.kpopFavorites;
        if (f && typeof f.add === "function") { f.add(url, label); return true; }
    } catch {}
    return false;
}

/** The two promoted slots, stored as URLs into the shared list rather than as copies of it. */
export function readSlots(store) {
    try {
        const raw = store && store.getItem(SLOT_KEY);
        const a = raw ? JSON.parse(raw) : [];
        return Array.isArray(a) ? a.slice(0, SLOTS) : [];
    } catch { return []; }
}
export function writeSlots(store, urls) {
    try { store && store.setItem(SLOT_KEY, JSON.stringify((urls || []).slice(0, SLOTS))); } catch {}
    return (urls || []).slice(0, SLOTS);
}

/**
 * Promote a URL into the slots, newest first, without duplicates. Returns the new slot list.
 * *** SETTING A THIRD EVICTS THE OLDEST RATHER THAN REFUSING. *** A button that silently declines is a button
 * the user presses twice and then distrusts.
 */
export function promote(slots, url) {
    const next = [url, ...(slots || []).filter((u) => u !== url)];
    return next.slice(0, SLOTS);
}

/** A favourite becomes a mode entry with the same shape avatarSwitch already understands. */
export const favoriteMode = (fav, i) => ({
    id: "fav" + i,
    label: i === 0 ? "\u2b50" : "\u2734\ufe0f",
    title: "Favourite: " + (fav.label || fav.url),
    kind: "frame",
    src: "/avatarstage.html?voice=M1&camdock=1&glb=" + encodeURIComponent(fav.url),
    favorite: true,
    url: fav.url,
});

/** Turn the promoted slots into mode entries, dropping any whose favourite has since been removed. */
export function slotModes(slots, favorites) {
    const byUrl = new Map((favorites || []).map((f) => [f.url, f]));
    return (slots || [])
        .map((u) => byUrl.get(u) || null)
        .filter(Boolean)
        .map(favoriteMode);
}

/** Fetch the pickable assets. Absent endpoint is an empty list AND a stated reason, never a silent blank. */
export async function listAssets(fetchImpl) {
    const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!f) return { items: [], why: "no fetch available" };
    const out = [], tried = [];
    for (const url of ["/GPU_Assets/list", "/GPU_Assets/list/Your_Avatars"]) {
        tried.push(url);
        try {
            const r = await f(url);
            if (!r.ok) continue;
            const j = await r.json();
            const arr = Array.isArray(j) ? j : (j.files || j.items || j.assets || []);
            for (const it of arr) {
                const name = typeof it === "string" ? it : (it.name || it.file || it.url || "");
                if (!name || !/\.(glb|gltf)$/i.test(name)) continue;
                const stem = name.replace(/\.(glb|gltf)$/i, "").split("/").pop();
                if (!out.some((o) => o.url === stem)) out.push({ url: stem, label: stem });
            }
        } catch { /* a dead endpoint is reported below, not thrown */ }
    }
    return out.length
        ? { items: out, why: out.length + " asset(s) from " + tried.join(" + ") }
        : { items: [], why: "no GLB found at " + tried.join(" or ") + " \u2014 drop one into GPU_Assets/Your_Avatars/ and it appears here. This is an EMPTY LIST WITH A REASON, not a broken picker." };
}
