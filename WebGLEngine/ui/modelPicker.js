// ui/modelPicker.js -- v4049
// ---------------------------------------------------------------------------------------------------------------
// THE "LOAD A MODEL" UI, ONE COPY. Keith: "so we could have the next avatar choice after live krbn avatar, to be
// a loaded model converted to krbn" -- then, correcting himself -- "adding a button on the live krbn, to convert
// and load live, instead of the next choice" -- and then "instead of Krbn, we could also have the ascii version.
// ascii-object.html". Two avatar surfaces now want the identical load control (favourites + a shipped preset +
// a file picker), and this is exactly the shape v4046 already warned about in its own header: a second copy of
// this is not a tidiness problem, it is a WRONG-BUTTON-DOES-NOTHING problem waiting to happen twice.
//
// krbn-compare.html built this first (v4042/v4046) and is the reference this file was extracted FROM --
// byte-for-byte the same favourites key, the same dedup-against-presets logic, the same "reading is fine,
// writing is not" boundary. It is refactored to call this module too, so there is one implementation rather
// than an original and a copy that started identical and will not stay that way.
//
// *** IT IS DELIBERATELY READ-ONLY ON FAVOURITES. *** ui/avatarFavorites.js's whole argument: a second
// favourites list would mean starring something on server.html and not seeing it here, with no way to find out
// why. This module offers what was starred and never adds to it.
//
// WHAT THIS DOES NOT DO: decide what a loaded file MEANS. A picked source is handed to the caller as
// {name, text(), arrayBuffer()} -- the shape a File already has, and a fetch Response already has -- so this
// module has no opinion on Krbn conversion, three.js parsing, or anything else a mounting page wants to do with
// the bytes. Two very different consumers (a Krbn mesh, a raw three.js scene for ASCII sampling) share the
// PICKING, not the interpreting.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

const FAV_KEY = "voxelEngine.kpopFavorites";

/** Avatar favourites, filtered to GLB/glTF (the only formats the avatar star ever saves). Never writes. */
export function readAvatarFavorites() {
    try {
        const raw = localStorage.getItem(FAV_KEY);
        const a = raw ? JSON.parse(raw) : [];
        return Array.isArray(a) ? a.filter((x) => x && typeof x.url === "string" && /\.(glb|gltf)(\?|#|$)/i.test(x.url)) : [];
    } catch { return []; }
}

/**
 * Mount preset + favourite <option>s into an existing <select>, and wire a file <input> and the select's own
 * "url:..." entries to one callback. Returns nothing -- this is a side-effecting mount, matching
 * mountAvatarSwitch's own shape in ui/avatarSwitch.js.
 *
 * @param opts.select   the <select> element; presets/favourites are APPENDED after whatever options it already has
 * @param opts.file     an <input type=file>, hidden or visible
 * @param opts.presets  [{url, label}, ...] fixed entries (e.g. the shipped RobotExpressive) to offer above favourites
 * @param opts.onPick   async (src, meta) => void -- src is {name, text(), arrayBuffer()}; meta.isPreset says whether
 *                      the select (not the file input) triggered it, so a caller can decide whether to reset its
 *                      OWN "loaded file" bookkeeping the way krbn-compare.html's setScene() does
 * @param opts.onError  (message) => void, called instead of onPick when a preset fetch fails (e.g. a starred
 *                      avatar whose file has since moved) -- the favourites list is not this module's to prune,
 *                      so a dead entry stays visible and reports what happened rather than doing nothing
 */
export function mountModelPicker({ select, file, presets = [], onPick, onError = () => {} } = {}) {
    if (select) {
        const seen = new Set([...select.options].map((o) => o.value));
        const add = (url, label) => {
            const val = "url:" + url;
            if (seen.has(val)) return;
            seen.add(val);
            select.add(new Option(label, val));
        };
        for (const p of presets) add(p.url, p.label);
        for (const f of readAvatarFavorites()) add(f.url, "★ " + (f.label || f.url.split("/").pop()));

        select.addEventListener("change", async () => {
            if (!select.value.startsWith("url:")) return;   // a caller's own non-preset option -- not ours
            const url = select.value.slice(4);
            const name = url.split("/").pop() || url;
            let r;
            try { r = await fetch(url); } catch (e) { onError("Could not fetch " + url + ": " + e.message); return; }
            if (!r.ok) { onError("Could not fetch " + url + " -- HTTP " + r.status); return; }
            await onPick({ name, text: () => r.clone().text(), arrayBuffer: () => r.clone().arrayBuffer() }, { isPreset: true });
        });
    }

    if (file) {
        file.addEventListener("change", () => {
            const f = file.files && file.files[0];
            if (!f) return;
            file.value = "";   // so re-picking the SAME file fires change again
            onPick(f, { isPreset: false });   // a File already IS {name, text, arrayBuffer}
        });
    }
}
