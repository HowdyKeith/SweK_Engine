// FILE: ui/updateChecker.js
// v923 — checks the bridge's /updates/check for newer versions of the integrated
// tools/models (Aholo Viewer, three.js, ComfyUI + nodes, mesh-gen repos). Runs
// silently on load at most once a week (localStorage timestamp gate), caches the
// result, and exposes window.updates for the SETTINGS panel + console.
//
// "Update available" logic lives here (server is stateless):
//   • npm entries carry a pinned `current` → flag when latest is semver-newer.
//   • github entries have no baseline → seed the last-seen value on first check
//     (no flag), then flag when a later check returns something different.

const LS_CACHE = "voxelengine.updates.cache";
const LS_TS    = "voxelengine.updates.lastCheck";
const LS_SEEN  = "voxelengine.updates.lastSeen";
const WEEK_MS  = 7 * 24 * 60 * 60 * 1000;

const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// crude semver "a > b" (numeric dotted parts; ignores pre-release tags)
function verGt(a, b) {
    if (!a || !b) return false;
    const pa = String(a).replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0);
    const pb = String(b).replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] || 0, y = pb[i] || 0;
        if (x !== y) return x > y;
    }
    return false;
}

function computeFlags(items) {
    const seen = lsGet(LS_SEEN, {});
    const out = items.map(it => {
        const r = { ...it, updateAvailable: false };
        if (it.error || !it.latest) return r;
        if (it.type === "npm" && it.current) {
            r.updateAvailable = verGt(it.latest, it.current);
            r.baseline = it.current;
        } else {
            const prev = seen[it.id];
            r.baseline = prev || null;
            r.updateAvailable = !!(prev && prev !== it.latest);
        }
        seen[it.id] = it.latest;   // remember for next time
        return r;
    });
    lsSet(LS_SEEN, seen);
    return out;
}

let _results = lsGet(LS_CACHE, []);

async function check(force = false) {
    try {
        const r = await fetch("/updates/check" + (force ? "?force=1" : ""), { cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        if (!j || !Array.isArray(j.items)) throw new Error("bad response");
        _results = computeFlags(j.items);
        lsSet(LS_CACHE, _results);
        lsSet(LS_TS, Date.now());
        try { window.dispatchEvent(new CustomEvent("updates:checked", { detail: { items: _results } })); } catch {}
        return _results;
    } catch (e) {
        // bridge down / offline — keep the last cached result, don't throw
        return _results;
    }
}

// v1500 — apply a vendored-npm tool update (Aholo) + an on-entry confirm toast.
async function applyOne(id) {
    try { return await fetch("/updates/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).then(r => r.json()); }
    catch (e) { return { ok: false, error: e.message }; }
}
function _toolSkips() { try { return JSON.parse(localStorage.getItem("voxelengine.toolUpdateSkip") || "{}"); } catch { return {}; } }
function _toolSkip(id, ver) { const s = _toolSkips(); s[id] = ver; try { localStorage.setItem("voxelengine.toolUpdateSkip", JSON.stringify(s)); } catch {} }

// On entry: if an auto-appliable tool update exists (e.g. Aholo Viewer), confirm-toast it and apply.
async function maybePromptToolUpdates() {
    await check(false);
    const skips = _toolSkips();
    const appliable = _results.filter(x => x.updateAvailable && x.canApply && skips[x.id] !== x.latest);
    if (!appliable.length) return;
    const it = appliable[0];
    let sec = 0; try { sec = (window.swekEngineUpdate && window.swekEngineUpdate.fleetCfg && window.swekEngineUpdate.fleetCfg().autoConfirmSec) || 0; } catch {}
    const doApply = () => {
        try { window.tvNotify && window.tvNotify("Updating " + it.name, "Downloading v" + it.latest + "\u2026", { corner: "top_end", duration: 6 }); } catch {}
        applyOne(it.id).then(r => {
            if (r && r.ok) { try { window.tvNotify && window.tvNotify("\u2713 " + it.name + " updated", "Now v" + r.to + " \u00b7 reopen the splat viewer to use it.", { corner: "top_end", duration: 8 }); } catch {} }
            else { try { window.tvNotify && window.tvNotify("Update failed", (r && r.error) || "?", { corner: "top_end", duration: 8 }); } catch {} }
        });
    };
    const fn = window.swekConfirm;
    if (!fn) { doApply(); return; }
    fn({ id: "tool-update", title: "Tool update available", message: "<b>" + it.name + "</b> " + it.current + " \u2192 <b>" + it.latest + "</b>. Update now?", yesLabel: "Update", noLabel: "Later", autoYesSec: sec,
         onYes: doApply, onNo: () => _toolSkip(it.id, it.latest) });
}

window.updates = {
    check,
    get:        () => _results,
    available:  () => _results.filter(x => x.updateAvailable),
    count:      () => _results.filter(x => x.updateAvailable).length,
    lastChecked:() => lsGet(LS_TS, 0),
    applyOne, maybePromptToolUpdates,
};

// v1513 — AUTO-CHECK DISABLED per user request. No weekly check, no on-entry
// apply-prompt. Updates are manual only: the Settings -> AI Models "Check now"
// button calls window.updates.check(true). window.updates.check /
// maybePromptToolUpdates remain available to call by hand.

export { check };
