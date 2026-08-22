// esRoomPlugins.js -- room plugin manifests. A co-op room advertises the mod it's running (a list of
// plugin descriptors); a joining pilot diffs it against their own, and if the room uses plugins they lack,
// they're asked to consent before anything streams in. Pure + storage-free: fetching/installing and the
// consent UI live in ev.html. This module is the security-critical part -- the allowlist and the diff --
// so it's the part that's unit-tested.
//
// A descriptor is { name, imagesBase?, dataUrl? }:
//   imagesBase -> a raw image root the sprite resolver can stream art from live (no reload)
//   dataUrl    -> an ES data file/archive that changes the universe (needs a rebuild to apply)
// URLs are accepted ONLY from an allowlist, so a room can never point a pilot at an arbitrary host.

const ALLOWED_HOSTS = ["raw.githubusercontent.com", "github.com", "objects.githubusercontent.com", "codeload.github.com"];

function hostOf(url) { try { return new URL(String(url)).host.toLowerCase(); } catch { return null; } }
function isAllowedUrl(url) { const h = hostOf(url); return !!h && ALLOWED_HOSTS.some((a) => h === a || h.endsWith("." + a)); }

// Validate + normalize a manifest: drop malformed entries and any URL that isn't allowlisted, dedupe by name.
function normalizeManifest(list) {
    const out = [], seen = new Set();
    for (const p of (Array.isArray(list) ? list : [])) {
        if (!p || typeof p !== "object") continue;
        const name = String(p.name || p.imagesBase || p.dataUrl || "").slice(0, 160).trim();
        const imagesBase = (p.imagesBase && isAllowedUrl(p.imagesBase)) ? String(p.imagesBase) : null;
        const dataUrl = (p.dataUrl && isAllowedUrl(p.dataUrl)) ? String(p.dataUrl) : null;
        if (!name || (!imagesBase && !dataUrl)) continue;   // must have a name and at least one allowed URL
        if (seen.has(name)) continue; seen.add(name);
        out.push({ name, imagesBase, dataUrl });
    }
    return out;
}

// Order-independent fingerprint of a manifest (FNV-1a) -- for room matching and a short human-visible tag.
function manifestFingerprint(manifest) {
    const norm = normalizeManifest(manifest).map((p) => p.name + "|" + (p.imagesBase || "") + "|" + (p.dataUrl || "")).sort();
    const s = norm.join("\n");
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return (h >>> 0).toString(16).padStart(8, "0");
}

// What the room has that I don't (and vice-versa), matched by name.
function diffManifest(mine, room) {
    const M = normalizeManifest(mine), R = normalizeManifest(room);
    const mineNames = new Set(M.map((p) => p.name)), roomNames = new Set(R.map((p) => p.name));
    const missing = R.filter((p) => !mineNames.has(p.name));   // room has, I lack -> offered for install
    const extra = M.filter((p) => !roomNames.has(p.name));     // I have, room lacks
    return { missing, extra, match: missing.length === 0 && extra.length === 0 };
}

function imageRootsOf(manifest) { return normalizeManifest(manifest).map((p) => p.imagesBase).filter(Boolean); }
function dataUrlsOf(manifest) { return normalizeManifest(manifest).map((p) => p.dataUrl).filter(Boolean); }

// Build a manifest from what this client currently has: art roots (window.ES_PLUGIN_IMAGE_BASES) + any
// extra descriptors the caller tracks. Names default to the last path segment of the root.
function manifestFromImageBases(bases, extra) {
    const list = (Array.isArray(bases) ? bases : []).map((b) => ({ name: shortName(b), imagesBase: b }));
    return normalizeManifest(list.concat(Array.isArray(extra) ? extra : []));
}
function shortName(url) { try { const parts = new URL(String(url)).pathname.split("/").filter(Boolean); return parts.slice(0, 3).join("/") || String(url); } catch { return String(url).slice(0, 60); } }

export { ALLOWED_HOSTS, isAllowedUrl, normalizeManifest, manifestFingerprint, diffManifest, imageRootsOf, dataUrlsOf, manifestFromImageBases };
if (typeof module !== "undefined" && module.exports)
    module.exports = { ALLOWED_HOSTS, isAllowedUrl, normalizeManifest, manifestFingerprint, diffManifest, imageRootsOf, dataUrlsOf, manifestFromImageBases };
