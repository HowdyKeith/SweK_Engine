// ai-bridge/assetIngest.js — v1366
// Files dropped model assets in the GPU_Assets root into template subfolders, and
// (opt-in) watches the OS Downloads folder for new model files and imports them.
// Images and archives are never imported. Unknown models stay in the root for the
// asset library / viewer to triage. Config lives in ~/.voxelbridge/assets-ingest.json.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const MODEL_EXTS = [".glb", ".gltf", ".vrm", ".fbx", ".obj"];
// never imported by the Downloads watcher (images, archives, junk)
const SKIP_EXTS = [".zip", ".7z", ".rar", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tga", ".tif", ".tiff", ".mp4", ".mov", ".txt", ".pdf"];

// default name-pattern -> subfolder templates ("*" = any run of chars, case-insensitive)
const DEFAULT_TEMPLATES = [
  // order matters: first match wins, so put specific creature/demon names ahead of generic vehicle words
  { match: "pip*boy*",     folder: "PipBoy" },
  { match: "*helmet*",     folder: "Helmets" },
  { match: "*battlemech*", folder: "Mechs" },
  { match: "*mech*",       folder: "Mechs" },
  { match: "*dragon*",     folder: "Creatures" },
  { match: "*worm*",       folder: "Creatures" },
  { match: "*arachnid*",   folder: "Creatures" },
  { match: "*beelzebub*",  folder: "Demons" },
  { match: "*ifrit*",      folder: "Demons" },
  { match: "*demon*",      folder: "Demons" },
  { match: "*skull*",      folder: "Skulls" },
  { match: "*void*core*",  folder: "Cores" },
  { match: "*core*",       folder: "Cores" },
  { match: "*ring*",       folder: "Cores" },
  { match: "*character*",  folder: "Characters" },
  { match: "*pixel*",      folder: "Characters" },
  { match: "*_npc*",       folder: "Characters" },
  { match: "*hero*",       folder: "Characters" },
  { match: "*dungeon*",    folder: "Dungeon" },
  { match: "*truck*",      folder: "Vehicles" },
  { match: "*vehicle*",    folder: "Vehicles" },
  { match: "*_car*",       folder: "Vehicles" },
  { match: "*tank*",       folder: "Vehicles" },
  { match: "*bird*",       folder: "Birds" },
  { match: "*eagle*",      folder: "Birds" },
  { match: "*hawk*",       folder: "Birds" },
  { match: "*owl*",        folder: "Birds" },
  { match: "*raven*",      folder: "Birds" },
  { match: "*parrot*",     folder: "Birds" },
  { match: "*phoenix*",    folder: "Birds" },
  { match: "*shark*",      folder: "Fish" },
  { match: "*crab*",       folder: "Fish" },
  { match: "*lobster*",    folder: "Fish" },
  { match: "*shrimp*",     folder: "Fish" },
  { match: "*jelly*",      folder: "Fish" },
  { match: "*octopus*",    folder: "Fish" },
  { match: "*turtle*",     folder: "Fish" },
  { match: "*stingray*",   folder: "Fish" },
  { match: "*seahorse*",   folder: "Fish" },
  { match: "*eel*",        folder: "Fish" },
  { match: "*fish*",       folder: "Fish" },
];

// v1371 — game ROLES: which ingest folders feed which spawn system. A consumer
// (kaiju spawner, dungeon, civ defence, terrain NPCs) asks pickForRole(role) and
// gets a library model name to spawn. Editable; folders reference the template subfolders.
const DEFAULT_ROLES = {
  kaiju:          ["Creatures", "Demons", "Mechs"],
  dungeonMonster: ["Demons", "Skulls", "Creatures", "Skeletons"],   // v1402 — KayKit Skeletons
  civDefender:    ["Mechs", "Characters"],
  terrainNPC:     ["Creatures", "Characters"],
  seaCreature:    ["Creatures", "Characters", "Fish"],   // v1378/1384 — aquarium / sea demo
};

let _root = () => "";                 // injected getter for the active GPU_Assets root
let _cfgPath = "";
let _timer = null;
let _log = [];                        // recent actions (newest first)

function _downloadsDefault() { return path.join(os.homedir(), "Downloads"); }
function defaultConfig() {
  return {
    watchDownloads: false,
    downloadsPath: _downloadsDefault(),
    moveOnImport: true,   // v1440 — move loose models out of Downloads (dupes stay put)
    pollSec: 30,
    modelExts: MODEL_EXTS.slice(),
    templates: DEFAULT_TEMPLATES.slice(),
    roles: JSON.parse(JSON.stringify(DEFAULT_ROLES)),
  };
}
function readCfg() {
  try { return Object.assign(defaultConfig(), JSON.parse(fs.readFileSync(_cfgPath, "utf8"))); }
  catch { return defaultConfig(); }
}
function writeCfg(c) {
  try { fs.mkdirSync(path.dirname(_cfgPath), { recursive: true }); fs.writeFileSync(_cfgPath, JSON.stringify(c, null, 2)); return true; }
  catch { return false; }
}
function _log_push(s) { _log.unshift({ t: Date.now(), msg: String(s) }); if (_log.length > 120) _log.length = 120; }

function _glob(name, pat) {           // full-string * glob, case-insensitive
  const parts = String(pat).toLowerCase().split("*").map(s => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp("^" + parts.join(".*") + "$").test(String(name).toLowerCase());
}
function _ext(name) { return path.extname(name).toLowerCase(); }
function _isModel(name, exts) { return (exts || MODEL_EXTS).includes(_ext(name)); }
function _isSkip(name) { return SKIP_EXTS.includes(_ext(name)); }

// v1384 — default procedural MOTION per folder. The engine can auto-rig a
// downloaded model by its folder (wheels spin, wings flap, bodies undulate).
// Editable via /assets/motions; per-model override via rig.animate(name, type).
const DEFAULT_MOTIONS = { Vehicles: "wheels", Birds: "wings", Fish: "tail", Creatures: "tail", Characters: "walk" };
function getMotions() { const m = readCfg().motions; return (m && typeof m === "object") ? m : DEFAULT_MOTIONS; }
function motionFor(folder) { const m = getMotions(); return (folder && m[folder]) ? m[folder] : null; }

function folderFor(name, templates) {
  const ts = templates || DEFAULT_TEMPLATES;
  for (const t of ts) { if (t && t.match && t.folder && _glob(name, t.match)) return t.folder; }
  return "";                          // unknown -> leave in root for review
}
function mergeFolders() {             // distinct subfolders the by-name loader should also search
  try { return Array.from(new Set((readCfg().templates || []).map(t => t && t.folder).filter(Boolean))); }
  catch { return []; }
}

// is `name` already somewhere in the assets tree (root or one level down)?
function _existsInTree(name) {
  const root = _root(); if (!root) return false;
  try { if (fs.existsSync(path.join(root, name))) return true; } catch {}
  let subs = [];
  try { subs = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch {}
  for (const s of subs) { try { if (fs.existsSync(path.join(root, s, name))) return true; } catch {} }
  return false;
}

// Move model files sitting in the assets ROOT into their template subfolder.
// Unknown models are reported but left where they are.
function scanAndSort() {
  const root = _root(); const cfg = readCfg();
  const out = { ok: false, root, moved: [], unknown: [], errors: [] };
  if (!root) { out.error = "no assets root set"; return out; }
  let names = [];
  try { names = fs.readdirSync(root); } catch (e) { out.error = String(e && e.message || e); return out; }
  for (const name of names) {
    const full = path.join(root, name);
    let st; try { st = fs.statSync(full); } catch { continue; }
    if (!st.isFile() || !_isModel(name, cfg.modelExts)) continue;
    const folder = folderFor(name, cfg.templates);
    if (!folder) { out.unknown.push(name); continue; }
    const dir = path.join(root, folder);
    const dest = path.join(dir, name);
    try {
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(dest)) { out.errors.push(name + ": already in " + folder + "/"); continue; }
      fs.renameSync(full, dest);
      // move a same-stem .bin sidecar for .gltf (common multi-file case)
      if (_ext(name) === ".gltf") {
        const bin = name.replace(/\.gltf$/i, ".bin");
        try { if (fs.existsSync(path.join(root, bin))) fs.renameSync(path.join(root, bin), path.join(dir, bin)); } catch {}
      }
      out.moved.push({ name, folder });
      _log_push("sorted " + name + " -> " + folder + "/");
    } catch (e) { out.errors.push(name + ": " + (e && e.message || e)); }
  }
  out.ok = true; return out;
}

// v1402 — ZIP KIT importer. The loose-file watcher skips archives; this one DETECTS
// .zip kits in Downloads, EXTRACTS them, and SORTS the .glb/.gltf inside into the
// right GPU_Assets folder. A kit-name classifier routes a whole kit to one folder
// (dungeon pieces rarely have folder-keyword names), falling back to the per-file
// folderFor for unknown kits / single models.
const KIT_FOLDERS = [
  { re: /dungeon/i,                          folder: "Dungeon" },
  { re: /skeleton/i,                         folder: "Skeletons" },
  { re: /adventurer|character/i,             folder: "Characters" },
  { re: /city[\s_.-]?builder|downtown|\bcity\b/i, folder: "city" },
  { re: /space[\s_.-]?base|\bspace\b/i,      folder: "Space" },
  { re: /resource|rpg[\s_.-]?tool/i,          folder: "Props" },
  { re: /nature|forest|\btrees?\b/i,          folder: "Nature" },
];
function kitFolderFor(zipName) {
  const n = String(zipName || "");
  for (const k of KIT_FOLDERS) if (k.re.test(n)) return k.folder;
  try { const f = folderFor(n, readCfg().templates); if (f) return f; } catch {}   // v1457 — user name->folder rules route whole kits too
  return null;   // unknown kit -> sort piece-by-piece
}
// v1492 — ZIP INGRESS RULES (pre-delivered, filename-matched). The Downloads watcher only
// ACTS on a zip whose NAME matches one of these rules; unmatched zips are left to the legacy
// GLB-kit sorter and never content-sniffed. Extend this list (or, later, a user-facing file-
// monitor rules panel) to teach the watcher about new packs. Actions so far:
//   "skirmish-mod" -> install the whole pack into <root>/mods/<modName||zipname>/.
const ZIP_RULES = [
  { id: "testfire", match: "*testfire*", action: "skirmish-mod", modName: "testfire_initiative", note: "Testfire Initiative skirmish pack" },
];
function zipRuleFor(name) { for (const r of ZIP_RULES) { try { if (_glob(name, r.match)) return r; } catch {} } return null; }
function getZipRules() { return ZIP_RULES.map(r => ({ ...r })); }
function _extractZip(zipPath, destDir) {
  const cp = require("child_process");
  try { fs.mkdirSync(destDir, { recursive: true }); } catch {}
  // tar (bsdtar) handles .zip on Win10+, mac, and most linux
  try { cp.execFileSync("tar", ["-xf", zipPath, "-C", destDir], { stdio: "ignore", timeout: 180000 }); return true; } catch {}
  // Windows PowerShell fallback
  try { cp.execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command",
        "Expand-Archive -LiteralPath '" + zipPath.replace(/'/g, "''") + "' -DestinationPath '" + destDir.replace(/'/g, "''") + "' -Force"],
        { stdio: "ignore", timeout: 240000 }); return true; } catch {}
  // unzip (mac/linux)
  try { cp.execFileSync("unzip", ["-o", "-q", zipPath, "-d", destDir], { stdio: "ignore", timeout: 180000 }); return true; } catch {}
  return false;
}
function _walkModels(dir, out) {
  out = out || [];
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) _walkModels(full, out);
    else if (MODEL_EXTS.includes(_ext(e.name))) out.push(full);
  }
  return out;
}
// v1492 — generic recursive walk (collect files whose name passes `test`) + a tree copy,
// used to detect + install skirmish .stl mod packs whole (the GLB sorter ignores .stl).
function _walkBy(dir, test, out) {
  out = out || [];
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) { const full = path.join(dir, e.name); if (e.isDirectory()) _walkBy(full, test, out); else if (test(e.name)) out.push(full); }
  return out;
}
function _copyTree(src, dest) {
  let n = 0, ents = []; try { ents = fs.readdirSync(src, { withFileTypes: true }); } catch { return 0; }
  try { fs.mkdirSync(dest, { recursive: true }); } catch {}
  for (const e of ents) { const s = path.join(src, e.name), d = path.join(dest, e.name); if (e.isDirectory()) n += _copyTree(s, d); else { try { fs.copyFileSync(s, d); n++; } catch {} } }
  return n;
}
function importZipsFromDownloads(opts = {}) {
  const cfg = readCfg(); const root = _root();
  const out = { ok: false, zips: [], imported: [], skipped: 0, errors: [] };
  if (!root) { out.error = "no assets root set"; return out; }
  const dl = (cfg.downloadsPath || _downloadsDefault());
  let names = []; try { names = fs.readdirSync(dl); } catch (e) { out.error = "downloads: " + (e && e.message || e); return out; }
  const seen = (cfg.importedZips && typeof cfg.importedZips === "object") ? cfg.importedZips : {};
  const stageRoot = path.join(root, ".zipstage");
  for (const name of names) {
    if (_ext(name) !== ".zip") continue;
    const src = path.join(dl, name);
    let st; try { st = fs.statSync(src); } catch { continue; }
    if (!st.isFile()) continue;
    const sig = st.size + ":" + Math.round(st.mtimeMs);
    // v1497 — a zip already in the "seen" cache is normally skipped without force. BUT if it
    // matches an ingress RULE whose target doesn't exist yet (e.g. the rule was added AFTER the
    // zip was first seen, like the v1492 testfire rule on a zip seen pre-rule), re-process it so
    // the new rule actually fires. Without this, the watcher skips it forever.
    const _ruleEarly = zipRuleFor(name);
    const _ruleTargetMissing = !!(_ruleEarly && _ruleEarly.action === "skirmish-mod" &&
        !fs.existsSync(path.join(root, "mods", (_ruleEarly.modName || name.replace(/\.zip$/i, "")).replace(/[^a-z0-9_-]+/gi, "_").toLowerCase())));
    if (!opts.force && seen[name] === sig && !_ruleTargetMissing) { out.skipped++; continue; }   // v1457 — force bypasses the "already imported" memory
    const target = kitFolderFor(name);
    const stage = path.join(stageRoot, name.replace(/\.zip$/i, ""));
    try { fs.rmSync(stage, { recursive: true, force: true }); } catch {}
    if (!_extractZip(src, stage)) { out.errors.push(name + ": could not extract (no tar/powershell/unzip found)"); continue; }
    // v1492 — ZIP INGRESS RULES: a zip is acted on by NAME (a pre-delivered rule), not by
    // sniffing its contents. The only rule kind so far is "skirmish-mod" (install the pack
    // into <root>/mods/<name>/ so /skirmish/mod/list finds it). Unmatched zips fall through
    // to the legacy GLB-kit sorter below.
    const rule = zipRuleFor(name);
    if (rule && rule.action === "skirmish-mod") {
      const modName = (rule.modName || name.replace(/\.zip$/i, "")).replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
      const modDest = path.join(root, "mods", modName);
      let copied = 0; try { copied = _copyTree(stage, modDest); } catch (e) { out.errors.push(name + " (mod): " + (e && e.message || e)); }
      try { fs.rmSync(stage, { recursive: true, force: true }); } catch {}
      seen[name] = sig;
      out.zips.push({ zip: name, target: "mods/" + modName, rule: rule.id, kind: "mod", files: copied });
      _log_push("ingress rule '" + rule.id + "' \u2192 installed mod " + name + " \u2192 mods/" + modName + " (" + copied + " files)");
      continue;
    }
    const models = _walkModels(stage); let n = 0;
    for (const m of models) {
      const base = path.basename(m);
      if (_ext(base) === ".gltf" && fs.existsSync(m.replace(/\.gltf$/i, ".glb"))) continue;   // prefer the .glb sibling
      const folder = target || folderFor(base, cfg.templates) || "";
      const dir = folder ? path.join(root, folder) : root;
      try { fs.mkdirSync(dir, { recursive: true }); } catch {}
      const dest = path.join(dir, base);
      if (fs.existsSync(dest) || _existsInTree(base)) continue;
      try {
        fs.copyFileSync(m, dest);
        if (_ext(base) === ".gltf") { const bin = m.replace(/\.gltf$/i, ".bin"); if (fs.existsSync(bin)) { try { fs.copyFileSync(bin, path.join(dir, base.replace(/\.gltf$/i, ".bin"))); } catch {} } }
        n++; out.imported.push({ name: base, folder: folder || "(root)", from: name });
      } catch (e) { out.errors.push(base + ": " + (e && e.message || e)); }
    }
    try { fs.rmSync(stage, { recursive: true, force: true }); } catch {}
    seen[name] = sig;
    out.zips.push({ zip: name, target: target || "(by-name)", models: n });
    _log_push("unzipped " + name + " -> " + n + " model(s)" + (target ? " in " + target + "/" : ""));
  }
  try { fs.rmSync(stageRoot, { recursive: true, force: true }); } catch {}
  try { setConfig({ importedZips: seen }); } catch {}
  out.ok = true; return out;
}

// Copy NEW model files from the Downloads folder into the assets root (leaving the
// originals in Downloads), then sort. Skips archives/images and anything already in
// the tree. Returns a report.
function importFromDownloads() {
  const cfg = readCfg(); const root = _root();
  const out = { ok: false, imported: [], moved: [], copied: [], dupesLeft: 0, skipped: 0, errors: [] };
  if (!root) { out.error = "no assets root set"; return out; }
  const dl = (cfg.downloadsPath || _downloadsDefault());
  let names = [];
  try { names = fs.readdirSync(dl); } catch (e) { out.error = "downloads: " + (e && e.message || e); return out; }
  try { fs.mkdirSync(root, { recursive: true }); } catch {}
  for (const name of names) {
    if (_isSkip(name)) { out.skipped++; continue; }
    if (!_isModel(name, cfg.modelExts)) continue;
    if (_existsInTree(name)) { out.dupesLeft++; continue; }   // already in assets -> leave the Downloads copy alone
    const src = path.join(dl, name);
    let st; try { st = fs.statSync(src); } catch { continue; }
    if (!st.isFile()) continue;
    try {
      fs.copyFileSync(src, path.join(root, name));
      let didBin = false;
      // bring a same-stem .bin along for .gltf
      if (_ext(name) === ".gltf") {
        const bin = name.replace(/\.gltf$/i, ".bin");
        try { if (fs.existsSync(path.join(dl, bin)) && !fs.existsSync(path.join(root, bin))) { fs.copyFileSync(path.join(dl, bin), path.join(root, bin)); didBin = true; } } catch {}
      }
      if (cfg.moveOnImport) {
        try { fs.unlinkSync(src); } catch {}
        if (didBin) { try { fs.unlinkSync(path.join(dl, name.replace(/\.gltf$/i, ".bin"))); } catch {} }
        out.moved.push(name);
      } else out.copied.push(name);
      out.imported.push(name);
      _log_push((cfg.moveOnImport ? "moved " : "copied ") + name + " from Downloads");
    } catch (e) { out.errors.push(name + ": " + (e && e.message || e)); }
  }
  out.ok = true;
  if (out.imported.length) { try { out.sort = scanAndSort(); } catch {} }
  return out;
}

function _tick() { try { if (readCfg().watchDownloads) { importFromDownloads(); importZipsFromDownloads(); } } catch (e) { _log_push("watch error: " + (e && e.message || e)); } }
function _arm() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  const cfg = readCfg();
  if (cfg.watchDownloads) {
    _timer = setInterval(_tick, Math.max(10, cfg.pollSec || 30) * 1000);
    if (_timer.unref) _timer.unref();
    _log_push("Downloads watch ON (" + (cfg.pollSec || 30) + "s, " + (cfg.downloadsPath || _downloadsDefault()) + ")");
    // v1492 — also run one pass shortly after arming so a zip/model already sitting in
    // Downloads at startup gets picked up at launch, not only after the first poll interval.
    const t0 = setTimeout(_tick, 2500); if (t0.unref) t0.unref();
  }
}

function init(opts) {
  opts = opts || {};
  if (typeof opts.getRoot === "function") _root = opts.getRoot;
  _cfgPath = opts.configPath || path.join(os.homedir(), ".voxelbridge", "assets-ingest.json");
  _arm();
}
function getConfig() { return readCfg(); }
function setConfig(patch) {
  const c = Object.assign(readCfg(), patch || {});
  if (Array.isArray(patch && patch.templates)) c.templates = patch.templates;
  if (patch && patch.roles && typeof patch.roles === "object") c.roles = patch.roles;
  writeCfg(c); _arm(); return c;
}
function status() {
  const c = readCfg();
  return { ok: true, watchDownloads: !!c.watchDownloads, moveOnImport: c.moveOnImport !== false, downloadsPath: c.downloadsPath, pollSec: c.pollSec,
           root: _root(), folders: mergeFolders(), templates: c.templates, log: _log.slice(0, 40) };
}

// v1371 — list model files directly inside one subfolder of the assets root.
function _listModelsIn(folder) {
  const root = _root(); if (!root) return [];
  const dir = folder ? path.join(root, folder) : root;
  const out = [];
  try { for (const n of fs.readdirSync(dir)) { if (!_isModel(n, MODEL_EXTS)) continue; try { if (fs.statSync(path.join(dir, n)).isFile()) out.push(n); } catch {} } } catch {}
  return out;
}
function getRoles() { const r = readCfg().roles; return (r && typeof r === "object") ? r : DEFAULT_ROLES; }
function listByRole(role) {
  const folders = (getRoles()[role] || []);
  const models = [];
  for (const f of folders) for (const n of _listModelsIn(f)) models.push({ name: n, folder: f });
  return { ok: true, role, folders, models };
}
function listByFolder(folder) { return { ok: true, folder, models: _listModelsIn(folder).map(n => ({ name: n, folder })) }; }
function rolesSummary() {
  const roles = getRoles(), out = {};
  for (const role in roles) { let c = 0; for (const f of roles[role]) c += _listModelsIn(f).length; out[role] = { folders: roles[role], count: c }; }
  return out;
}
function pickForRole(role) {
  const m = listByRole(role).models;
  if (!m.length) return { ok: false, role, error: "no models in role folders" };
  const pick = m[(Math.random() * m.length) | 0];
  return { ok: true, role, model: pick.name, folder: pick.folder };
}

// --- v2378: whole-MOD listing + delete, for the Tinder-style Mods swipe view. A mod is a folder under
// <root>/mods/<name>/ (installed by the skirmish-mod ingress rule). listMods summarises each as one card; deleteMod
// removes the entire set at once. Mod names are sanitised to [a-z0-9_-] at install, so we reject anything else to
// block path traversal -- a delete can never escape the mods/ directory.
function _modsRoot() { return path.join(_root() || "", "mods"); }
function _safeMod(name) { return /^[a-z0-9_-]+$/i.test(String(name || "")) ? String(name) : null; }
function listMods() {
    const dir = _modsRoot(); const mods = [];
    try {
        if (!_root() || !fs.existsSync(dir)) return { ok: true, mods: [] };
        for (const name of fs.readdirSync(dir)) {
            const full = path.join(dir, name); let s; try { s = fs.statSync(full); } catch { continue; } if (!s.isDirectory()) continue;
            let models = 0, files = 0, thumb = null; const stack = [full];
            while (stack.length) { const d = stack.pop(); let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
                for (const e of ents) { const p = path.join(d, e.name); if (e.isDirectory()) { stack.push(p); continue; } files++;
                    if (_isModel(e.name)) models++;
                    if (!thumb && /\.(png|jpe?g|webp|gif)$/i.test(e.name)) thumb = "/GPU_Assets/" + path.relative(_root(), p).replace(/\\/g, "/"); } }
            mods.push({ name, models, files, thumb });
        }
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    return { ok: true, mods };
}
function deleteMod(name) {
    const safe = _safeMod(name); if (!safe) return { ok: false, error: "bad mod name" };
    const dir = path.join(_modsRoot(), safe);
    try { if (!fs.existsSync(dir)) return { ok: false, error: "not found" }; fs.rmSync(dir, { recursive: true, force: true }); return { ok: true, deleted: safe }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

module.exports = { init, scanAndSort, importFromDownloads, importZipsFromDownloads, kitFolderFor, getZipRules, getConfig, setConfig, status, mergeFolders, folderFor, defaultConfig, MODEL_EXTS, SKIP_EXTS, getRoles, listByRole, rolesSummary, pickForRole, getMotions, motionFor, DEFAULT_MOTIONS, listByFolder, listMods, deleteMod };
