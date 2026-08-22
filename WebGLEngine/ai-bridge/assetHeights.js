"use strict";
// v1376 — asset HEIGHT NORMALISATION store.
//
// Two numbers per asset:
//   native  — the model's real AABB height (max.y - min.y), measured ONCE by the
//             engine at load (the gpuAssetLoader already computes bounds). Intrinsic
//             to the .glb file: identical for anyone with that exact file. The engine
//             reports these via POST /assets/heights/measured.
//   target  — desired in-world height. OUR design choice. Resolved per role, with
//             optional per-asset and per-asset+role overrides (so the SAME model can
//             be a 40u kaiju, a 4u defender, or a 0.3u insect/aquarium shrimp).
//
// spawn scale = target / native.
//
// Storage: ~/.voxelbridge/asset-heights.json (shareable across the user's PCs +
// exportable). A shipped asset-heights.seed.json provides baseline role targets and
// any pre-delivered natives; disk values (measured + user overrides) win on merge.

const fs   = require("fs");
const os   = require("os");
const path = require("path");

const DEFAULT_ROLE_TARGETS = { terrainNPC: 3, dungeonMonster: 4, civDefender: 4, seaCreature: 1.5 };
// NOTE: kaiju intentionally omitted -> not normalised (keeps its tuned config.scale).

let _cfgPath  = null;
let _seedPath = null;
let _cfg      = null;   // { roleTargets:{role:h}, assets:{ bareName:{ native, target, byRole:{role:h} } } }

function _bare(name) { return String(name || "").replace(/\.(glb|gltf|vrm|fbx|obj)$/i, ""); }
function _norm(name) { return _bare(name).toLowerCase().replace(/[\s_\-]+/g, ""); }

function _readJson(p) {
    try { if (p && fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")) || {}; } catch {}
    return {};
}

function _mergeAssets(into, src) {
    for (const k in (src || {})) {
        const bare = _bare(k);
        const cur = into[bare] || { native: null, target: null, byRole: {} };
        const s = src[k] || {};
        into[bare] = {
            native: (s.native != null ? s.native : cur.native),
            target: (s.target != null ? s.target : cur.target),
            byRole: Object.assign({}, cur.byRole, s.byRole || {}),
        };
    }
    return into;
}

function _load() {
    const seed = _readJson(_seedPath);
    const disk = _readJson(_cfgPath);
    const roleTargets = Object.assign({}, DEFAULT_ROLE_TARGETS, seed.roleTargets || {}, disk.roleTargets || {});
    const assets = {};
    _mergeAssets(assets, seed.assets || {});   // baseline (pre-delivered) first
    _mergeAssets(assets, disk.assets || {});   // measured + user overrides win
    _cfg = { roleTargets, assets };
    return _cfg;
}

function _save() {
    if (!_cfg) return;
    try { fs.mkdirSync(path.dirname(_cfgPath), { recursive: true }); } catch {}
    try { fs.writeFileSync(_cfgPath, JSON.stringify({ roleTargets: _cfg.roleTargets, assets: _cfg.assets }, null, 2)); } catch (e) {}
}

function init(opts = {}) {
    _cfgPath  = opts.configPath || path.join(os.homedir(), ".voxelbridge", "asset-heights.json");
    _seedPath = opts.seedPath   || path.join(__dirname, "asset-heights.seed.json");
    _load();
}

function _findAsset(name) {
    if (!_cfg) _load();
    const bare = _bare(name);
    if (_cfg.assets[bare]) return _cfg.assets[bare];
    const want = _norm(name);
    for (const k in _cfg.assets) if (_norm(k) === want) return _cfg.assets[k];
    return null;
}

function getConfig() { if (!_cfg) _load(); return _cfg; }

function setRoleTarget(role, h) {
    if (!_cfg) _load();
    const v = Number(h);
    if (!role || !isFinite(v) || v <= 0) return false;
    _cfg.roleTargets[role] = v; _save(); return true;
}

// engine reports measured native heights: { name: nativeHeight, ... }
function setMeasured(map) {
    if (!_cfg) _load();
    let n = 0;
    for (const name in (map || {})) {
        const h = Number(map[name]);
        if (!(h > 0)) continue;
        const bare = _bare(name);
        const a = _cfg.assets[bare] || { native: null, target: null, byRole: {} };
        a.native = h; _cfg.assets[bare] = a; n++;
    }
    if (n) _save();
    return n;
}

// per-asset target (role omitted) OR per-asset+role override. target null/"" clears it.
function setAssetTarget(name, target, role) {
    if (!_cfg) _load();
    const bare = _bare(name);
    if (!bare) return false;
    const a = _cfg.assets[bare] || { native: null, target: null, byRole: {} };
    const v = (target == null || target === "") ? null : Number(target);
    if (v != null && !(v > 0)) return false;
    if (role) { if (v == null) delete a.byRole[role]; else a.byRole[role] = v; }
    else      { a.target = v; }
    _cfg.assets[bare] = a; _save(); return true;
}

function targetFor(name, role) {
    if (!_cfg) _load();
    const a = _findAsset(name);
    if (a) {
        if (role && a.byRole && a.byRole[role] != null) return a.byRole[role];
        if (a.target != null) return a.target;
    }
    if (role && _cfg.roleTargets[role] != null) return _cfg.roleTargets[role];
    return null;
}

function nativeFor(name) { const a = _findAsset(name); return (a && a.native != null) ? a.native : null; }

// scale = target / native. null means "no opinion" (caller keeps its own default).
function scaleFor(name, role, nativeOverride) {
    const native = (nativeOverride != null && nativeOverride > 0) ? nativeOverride : nativeFor(name);
    const target = targetFor(name, role);
    if (!(native > 0) || !(target > 0)) return null;
    const s = target / native;
    if (!isFinite(s) || s <= 0) return null;
    return Math.max(0.001, Math.min(1000, s));
}

function exportJson() { if (!_cfg) _load(); return JSON.stringify(_cfg, null, 2); }

function status() {
    if (!_cfg) _load();
    const names = Object.keys(_cfg.assets);
    const measured = names.filter(k => _cfg.assets[k].native != null).length;
    const overrides = names.filter(k => _cfg.assets[k].target != null || Object.keys(_cfg.assets[k].byRole || {}).length).length;
    return { ok: true, roleTargets: _cfg.roleTargets, assetCount: names.length, measured, overrides };
}

module.exports = {
    init, getConfig, status,
    setRoleTarget, setMeasured, setAssetTarget,
    targetFor, nativeFor, scaleFor, exportJson,
};
