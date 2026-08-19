// FILE: ui/settingsHub.js
// VERSION: v433 — consolidated, Windows-control-panel-style settings.
//
// One tabbed panel that gathers the engine's scattered runtime toggles
// into categories (Graphics / World / Audio / AI / Performance) so users
// don't have to dig through console commands or remember which menubar
// owns which switch. Graphics toggles drive `gfxSettings` (the render
// loop's source of truth); everything else drives the live window.* APIs.
//
// The SCHEMA is the audit: every controllable feature is listed here with
// a default + a get/set binding. If a feature isn't in this list, it's a
// gap. buildSettingsSchema() is pure (no DOM) so it can be unit-tested.

// v1806 — reusable timeout-guarded fetch for Settings panels. Every custom panel
// in this file does its own independent fetch() to populate itself, and several
// of those calls go through to slow/sequential backend work (GitHub API lookups,
// installer status, etc). Before this helper, a single hung backend call left a
// panel stuck on "loading..." forever, because a native fetch() with no
// AbortController never resolves OR rejects until the underlying socket gives up
// (which can be minutes, or never, depending on the failure mode) — so a
// .catch() on the call site doesn't help; the promise just never settles.
// settingsFetch wraps fetch with an AbortController timeout so every panel gets
// a guaranteed settle time. Panels should prefer this over bare fetch() for any
// network call that populates a "loading..." state.
async function settingsFetchJSON(url, opts, timeoutMs) {
    timeoutMs = timeoutMs || 6000;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const r = await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
        return await r.json();
    } catch (e) {
        return { ok: false, error: e && e.name === "AbortError" ? ("timed out after " + timeoutMs + "ms") : String(e && e.message || e) };
    } finally {
        clearTimeout(t);
    }
}
try { window.settingsFetchJSON = settingsFetchJSON; } catch {}

// v1810 — short-lived GET cache for Settings reads. The panel re-fetches every
// control's stored value every time it's opened, so reopening Settings (or flipping
// between sections and back) repeats the same slow round-trips. settingsCachedGET
// memoizes a GET's parsed JSON for `ttlMs` (default 8s), so a reopen within that
// window is instant. Writes (POSTs) should call settingsCacheBust(url) so the next
// read re-fetches fresh. This is opt-in per call site — only safe-to-cache reads use it.
const _settingsGetCache = new Map();   // url -> { at, data }
async function settingsCachedGET(url, timeoutMs, ttlMs) {
    ttlMs = ttlMs == null ? 8000 : ttlMs;
    const hit = _settingsGetCache.get(url);
    if (hit && (Date.now() - hit.at) < ttlMs) return hit.data;
    const data = await settingsFetchJSON(url, {}, timeoutMs);
    // only cache successful reads, never error stubs
    if (data && data.ok !== false) _settingsGetCache.set(url, { at: Date.now(), data });
    return data;
}
function settingsCacheBust(url) {
    if (url) _settingsGetCache.delete(url);
    else _settingsGetCache.clear();
}
try { window.settingsCachedGET = settingsCachedGET; window.settingsCacheBust = settingsCacheBust; } catch {}

// v626 — reusable INLINE credential form (username + key, or any N fields).
// Renders directly into the settings panel as a `custom` control so it never
// loses focus the way a window.prompt() does (the user lost the key prompt
// every time they tabbed back to the Kaggle site to copy the token). Generic
// over `fields` so future username+key providers reuse it.
//   fields: [{ key, label, type?, placeholder?, optional? }]
//   onSave(values) -> Promise<{ ok, error?, message? }>
//   loadStatus?()  -> Promise<{ prefill?:{key:val}, ok?, note? } | null>
// v1002 — KPop Listener panel gauge visibility. Mask is a 3-char 0/1 string
// [hunger, happy, energy] in localStorage "voxelengine.pipGauges"; default all on.
function _pipGaugeMask() {
    try { const v = localStorage.getItem("voxelengine.pipGauges"); if (v && /^[01]{3}$/.test(v)) return v; } catch {}
    return "111";
}
function _pipGaugeSetBit(i, on) {
    const m = _pipGaugeMask().split(""); m[i] = on ? "1" : "0";
    try { localStorage.setItem("voxelengine.pipGauges", m.join("")); } catch {}
    try { if (window.pipAvatar?.applyGaugeVisibility) window.pipAvatar.applyGaugeVisibility(); } catch {}
}

function _credentialControl({ id, label, hint, fields, onSave, loadStatus }) {
    return {
        id, type: "custom",
        render(box /*, hub */) {
            const wrap = document.createElement("div");
            const title = document.createElement("div");
            title.textContent = label;
            Object.assign(title.style, { fontSize: "13px", marginBottom: "2px", fontWeight: "600" });
            wrap.appendChild(title);
            if (hint) {
                const h = document.createElement("div");
                h.textContent = hint;
                Object.assign(h.style, { fontSize: "11px", color: C.dim, marginBottom: "8px" });
                wrap.appendChild(h);
            }
            const inputs = {};
            for (const f of fields) {
                const r = document.createElement("div");
                Object.assign(r.style, { display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" });
                const flbl = document.createElement("label");
                flbl.textContent = f.label;
                Object.assign(flbl.style, { fontSize: "12px", color: C.dim, flex: "0 0 78px" });
                const inp = document.createElement("input");
                inp.type = f.type || "text";
                inp.placeholder = f.placeholder || "";
                inp.autocomplete = "off"; inp.spellcheck = false;
                Object.assign(inp.style, { flex: "1 1 auto", minWidth: "0", background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 8px", fontSize: "12px" });
                r.appendChild(flbl); r.appendChild(inp);
                wrap.appendChild(r);
                inputs[f.key] = inp;
            }
            const msg = document.createElement("div");
            Object.assign(msg.style, { fontSize: "11px", color: C.dim, marginTop: "4px", minHeight: "14px" });
            const save = document.createElement("button");
            save.textContent = "Save";
            Object.assign(save.style, { marginTop: "6px", background: C.tabOn, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 16px", cursor: "pointer", fontSize: "12px" });
            save.addEventListener("click", async () => {
                const values = {};
                for (const f of fields) values[f.key] = inputs[f.key].value.trim();
                const missing = fields.filter(f => !f.optional && !values[f.key]);
                if (missing.length) { msg.textContent = "Fill in: " + missing.map(f => f.label).join(", "); msg.style.color = "#fb6"; return; }
                msg.textContent = "Saving…"; msg.style.color = C.dim; save.disabled = true;
                let r = null;
                try { r = await onSave(values); } catch (e) { r = { ok: false, error: e?.message || String(e) }; }
                save.disabled = false;
                if (r?.ok) { msg.textContent = r.message || "Saved ✓"; msg.style.color = "#9f8"; }
                else { msg.textContent = "Failed: " + (r?.error || "unknown"); msg.style.color = "#f88"; }
            });
            wrap.appendChild(save);
            wrap.appendChild(msg);
            box.appendChild(wrap);
            if (loadStatus) {
                Promise.resolve(loadStatus()).then(st => {
                    if (!st) return;
                    if (st.prefill) for (const f of fields) if (st.prefill[f.key] != null && !inputs[f.key].value) inputs[f.key].value = st.prefill[f.key];
                    if (st.note) { msg.textContent = st.note; msg.style.color = st.ok ? "#9f8" : "#fb6"; }
                }).catch(() => {});
            }
        },
    };
}

// Quality presets — fold in the old GFX panel's LOW/MED/HIGH buttons.
const GFX_PRESETS = {
    low:    { shadows: false, godrays: false, particles: false, water_ssr: false, water_refraction: false, grass: false, slopes: true },
    medium: { shadows: false, godrays: false, particles: true,  water_ssr: false, water_refraction: true,  grass: true,  slopes: true },
    high:   { shadows: true,  godrays: true,  particles: true,  water_ssr: true,  water_refraction: true,  grass: true,  slopes: true },
};

export function buildSettingsSchema(ctx) {    const gfx = (key, label, hint) => ({
        id: key, label, hint, type: "toggle",
        get: () => !!ctx.gfx?.get(key),
        set: (v) => ctx.gfx?.set(key, v),
    });
    return [
        { id: "graphics", label: "Graphics", icon: "🎨", controls: [
            gfx("shadows",          "Sun shadows",       "Directional shadow map (heaviest)"),
            gfx("godrays",          "God rays",          "Volumetric sun scatter"),
            gfx("particles",        "Particles",         "Smoke, sparks, debris"),
            gfx("water_ssr",        "Water reflection",  "Screen-space reflection on water"),
            gfx("water_refraction", "Water refraction",  "See through the surface to the lakebed"),
            gfx("grass",            "Grass",             "Wind-blown grass on grassy ground"),
            gfx("slopes",           "Smooth slopes",     "Ramp over stair-stepped mountains"),
            gfx("mc_terrain",       "Smooth terrain (MC)", "Experimental — rounds the whole world via marching cubes. Heavier."),
            { id: "voxelDetail", label: "Voxel detail texture", hint: "Per-voxel surface detail (opt-in)", type: "toggle",
              get: () => !!ctx.voxelDetail?.isOn?.(),
              set: (v) => v ? ctx.voxelDetail?.on?.() : ctx.voxelDetail?.off?.() },
            // v690 — sprite-tree mode. Per-entity-kind opt-in: trees render as
            // 2D billboards (Octopath-style mixed mode); kaiju/civ/others stay
            // 3D. Uses the wadBillboardRenderer that already ships with the
            // engine for Doom WAD sprites — same crisp pixel-art draw path.
            // Setter flips the flag, preloads PNGs if turning ON, and respawns
            // the forest so the change is visible immediately.
            { id: "spriteTrees", label: "Sprite trees (2D billboards)",
              hint: "Render trees as flat camera-facing pixel-art sprites instead of 3D meshes. Other entities stay 3D — gives the Octopath Traveler / Stardew look on terrain.",
              type: "toggle",
              get: () => { try { return localStorage.getItem("voxelengine.spriteTrees") === "1"; } catch { return false; } },
              set: async (v) => {
                  try { localStorage.setItem("voxelengine.spriteTrees", v ? "1" : "0"); } catch {}
                  if (typeof window === "undefined") return;
                  window._spriteTreesEnabled = !!v;
                  if (v && typeof window._preloadTreeSprites === "function") {
                      try { await window._preloadTreeSprites(); } catch (e) { console.warn(e); }
                  }
                  // Respawn trees so the new mode shows immediately.
                  try {
                      const ts = window._treeSpawner;
                      if (ts) {
                          // Despawn existing tracked trees first — mix of
                          // mesh and sprite ids; the spawner's own regen
                          // hook does the right thing for both.
                          for (const [id, rec] of (ts._registry || new Map())) {
                              try {
                                  if (rec?.sprite && rec.bbId != null) window._spriteBillboards?.despawn?.(rec.bbId);
                                  else ts.router?.exec?.({ type: "entity:despawn", id });
                              } catch {}
                          }
                          ts._registry?.clear?.();
                          ts.spawned = [];
                          ts.spawn?.();
                      }
                  } catch (e) { console.warn("respawn failed:", e?.message); }
              } },
            // v1279 — cloud FX toggles, mirrored from the engine-page quick toggles
            // into the Graphics (Render) section. Bound to window.cloudSettings.
            { id: "cloudShadows", label: "Cloud shadows", hint: "Drifting cloud shadows dim the terrain (cheap) — matched to the cloud layer + sun direction.", type: "toggle",
              get: () => { try { return !!window.cloudSettings?.get?.().shadows; } catch { return false; } },
              set: (v) => { try { window.cloudSettings?.set?.("shadows", !!v); } catch {} } },
            { id: "cloudVolumetric", label: "Volumetric clouds", hint: "Raymarched, self-shadowed volumetric cloud layer (heavier — tune step count on your rig).", type: "toggle",
              get: () => { try { return !!window.cloudSettings?.get?.().volumetric; } catch { return false; } },
              set: (v) => { try { window.cloudSettings?.set?.("volumetric", !!v); } catch {} } },
        ]},
        { id: "controller", label: "Controller", icon: "\uD83C\uDFAE", controls: [
            { id: "padEnabled", label: "Gamepad (XInput)", hint: "Use an Xbox / standard controller \u2014 left stick move, right stick look, RT/A fire, RB/B jump, X/Y + d-pad fire the active demo's buttons.", type: "toggle",
              get: () => { try { return !!window.gamepadInput?._state?.enabled; } catch { return true; } },
              set: (v) => { try { v ? window.gamepad?.on?.() : window.gamepad?.off?.(); } catch {} } },
            { id: "padDeadzone", label: "Stick deadzone", hint: "Ignore small stick wobble near center.", type: "slider", min: 0, max: 0.5, step: 0.02,
              get: () => { try { return window.gamepadInput?._state?.deadzone ?? 0.18; } catch { return 0.18; } },
              set: (v) => { try { window.gamepad?.deadzone?.(v); } catch {} } },
            { id: "padLookSpeed", label: "Look sensitivity", hint: "Right-stick aim turn speed.", type: "slider", min: 0.5, max: 6, step: 0.1,
              get: () => { try { return window.gamepadInput?._state?.lookSpeed ?? 2.4; } catch { return 2.4; } },
              set: (v) => { try { window.gamepad?.lookSpeed?.(v); } catch {} } },
            { id: "padInvertY", label: "Invert look Y", hint: "Flip vertical aim on the right stick.", type: "toggle",
              get: () => { try { return !!window.gamepadInput?._state?.invertY; } catch { return false; } },
              set: (v) => { try { window.gamepad?.invertY?.(v); } catch {} } },
            { id: "phoneAim", label: "Phone aim speed", hint: "Sensitivity of the phone look stick (control.html).", type: "slider", min: 0.01, max: 0.2, step: 0.01,
              get: () => { try { return window._phoneAimAmt ?? 0.05; } catch { return 0.05; } },
              set: (v) => { try { window._phoneAimAmt = +v || 0.05; } catch {} } },
        ] },

        { id: "world", label: "World", icon: "🗺", controls: [
            { id: "streamer", label: "Chunk streaming", hint: "Load terrain around the camera as you move", type: "toggle",
              get: () => !!ctx.streamer?.enabled?.(), set: (v) => ctx.streamer?.setEnabled?.(v) },
            { id: "gridGrow", label: "Dynamic view distance", hint: "Grow the loaded grid over time", type: "toggle",
              get: () => !!ctx.gridGrow?.isEnabled?.(), set: (v) => ctx.gridGrow?.setEnabled?.(v) },
            { id: "drawDistance", label: "Draw distance", hint: "Chunks loaded around you. Higher = see further (more GPU). Fog fades the far edge so there's no hard wall.", type: "select",
              options: ["6", "8", "10", "12", "16", "20"],
              get: () => String(window.drawDistance?.get?.() ?? 7),
              set: (v) => window.drawDistance?.set?.(parseInt(v, 10)) },
            { id: "autoFog", label: "Fog follows draw distance", hint: "Fade distant terrain into the horizon right at the load edge (hides pop-in, and follows the grid as it grows). Off = fixed fog.", type: "toggle",
              get: () => window.autoFog?.isOn?.() ?? true,
              set: (v) => window.autoFog?.set?.(v) },
            { id: "weather", label: "Weather", hint: "Force a weather state", type: "select",
              options: ["clear", "rain", "storm", "mist", "snow"],
              get: () => ctx.weather?.current?.() ?? "clear", set: (v) => ctx.weather?.force?.(v) },
            { id: "timeOfDay", label: "Time of day", hint: "Sun position", type: "select",
              options: ["dawn", "day", "dusk", "night"],
              get: () => ctx.time?.periodName?.() ?? "day",
              set: (v) => ctx.time?.setPeriod?.(v) },
            { id: "clouds", label: "Clouds", hint: "Wind-driven cloud layer", type: "select",
              options: ["automatic", "off", "cumulus", "cumulonimbus", "stratus", "stratocumulus", "cirrus", "nimbostratus"],
              get: () => ctx.clouds?.current?.() ?? "off",
              set: (v) => v === "off" ? ctx.clouds?.off?.() : ctx.clouds?.set?.(v) },
            { id: "reset", label: "Reset to a new random world", hint: "Fresh seed + reload", type: "button",
              action: () => ctx.resetWorld?.() },
        ]},
        { id: "audio", label: "Audio", icon: "🔊", controls: [
            { id: "mute", label: "Mute all audio", hint: "Silence every sound source", type: "toggle",
              get: () => !!ctx.mute?.isMuted?.(), set: (v) => ctx.mute?.setMuted?.(v) },
            { id: "muteHidden", label: "Mute when tab hidden", hint: "Go silent when the tab loses focus", type: "toggle",
              get: () => !!ctx.visibility?.getMuteWhenHidden?.(), set: (v) => ctx.visibility?.setMuteAudioWhenHidden?.(v) },
            { id: "voiceboxVoice", type: "custom", label: "\uD83D\uDDE3\uFE0F Voicebox (engine voice)",
              render: (box) => {
                  box.style.cssText = "display:flex; flex-direction:column; gap:6px;";
                  const hint = document.createElement("div"); hint.style.cssText = "font-size:11px; color:#8b97a8; line-height:1.5;";
                  hint.innerHTML = "Use a local <a href=\"https://voicebox.sh\" target=\"_blank\" rel=\"noopener\" style=\"color:#9bd6ff\">Voicebox</a> app (voice cloning, 7 TTS engines) as the engine's voice \u2014 avatar lines, alerts and console speak through it. Install it, create a voice <b>profile</b> in the app, then pick it here. Runs on THIS machine (CUDA on your 1070/1080).";
                  const stat = document.createElement("div"); stat.style.cssText = "font-size:11px;color:#8b97a8;min-height:14px;"; stat.textContent = "checking\u2026";
                  const urlRow = document.createElement("div"); urlRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;";
                  const url = document.createElement("input"); url.placeholder = "http://127.0.0.1:17493"; url.style.cssText = "flex:1;min-width:150px;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  const test = document.createElement("button"); test.textContent = "Test"; test.style.cssText = "padding:6px 12px;background:#2a3a5a;color:#cfe;border:1px solid #4a5a8a;border-radius:6px;cursor:pointer;font-size:12px;";
                  urlRow.append(url, test);
                  const selRow = document.createElement("div"); selRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;";
                  const prof = document.createElement("select"); prof.style.cssText = "flex:1;min-width:120px;background:#0c1822;color:#cfe7f5;border:1px solid #2a3340;border-radius:6px;padding:5px 6px;font-size:11px;";
                  const eng = document.createElement("select"); eng.style.cssText = "background:#0c1822;color:#cfe7f5;border:1px solid #2a3340;border-radius:6px;padding:5px 6px;font-size:11px;";
                  ["qwen", "qwen_custom_voice", "luxtts", "chatterbox", "chatterbox_turbo", "tada", "kokoro"].forEach(e => { const o = document.createElement("option"); o.value = e; o.textContent = e; eng.appendChild(o); });
                  selRow.append(prof, eng);
                  const useRow = document.createElement("label"); useRow.style.cssText = "display:flex;gap:8px;align-items:center;font-size:12px;color:#cde;cursor:pointer;";
                  const useCb = document.createElement("input"); useCb.type = "checkbox"; useRow.append(useCb, document.createTextNode("Use Voicebox as the engine voice"));
                  const sayRow = document.createElement("div"); sayRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;";
                  const say = document.createElement("input"); say.value = "Voicebox online."; say.style.cssText = "flex:1;min-width:140px;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font-size:11px;";
                  const speak = document.createElement("button"); speak.textContent = "\u25B6 Speak"; speak.style.cssText = "padding:6px 12px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;border-radius:6px;cursor:pointer;font-size:12px;";
                  sayRow.append(say, speak);
                  box.append(hint, urlRow, stat, selRow, useRow, sayRow);
                  const loadProfiles = () => fetch("/voicebox/profiles").then(r => r.json()).then(j => { prof.innerHTML = ""; const list = (j && j.profiles) || []; if (!list.length) { const o = document.createElement("option"); o.value = ""; o.textContent = "(no profiles \u2014 make one in the Voicebox app)"; prof.appendChild(o); } list.forEach(p => { const o = document.createElement("option"); const id = p.id || p.profile_id || p.uuid || ""; o.value = id; o.textContent = (p.name || p.label || id); prof.appendChild(o); }); fetch("/voicebox/config").then(r => r.json()).then(c => { const cfg = (c && c.config) || {}; if (cfg.profileId) prof.value = cfg.profileId; if (cfg.engine) eng.value = cfg.engine; }).catch(() => {}); }).catch(() => { prof.innerHTML = "<option value=''>(bridge offline)</option>"; });
                  const refresh = () => { fetch("/voicebox/config").then(r => r.json()).then(c => { const cfg = (c && c.config) || {}; url.value = cfg.baseUrl || ""; if (cfg.engine) eng.value = cfg.engine; }).catch(() => {}); fetch("/voicebox/status").then(r => r.json()).then(s => { stat.innerHTML = (s && s.reachable) ? ("<span style='color:#9fe88f'>\u2713 reachable" + (s.title ? (" \u2014 " + s.title) : "") + "</span>") : "<span style='color:#caa05a'>not reachable \u2014 is the Voicebox app running?</span>"; if (s && s.reachable) loadProfiles(); }).catch(() => { stat.textContent = "(bridge offline)"; }); fetch("/tts/status").then(r => r.json()).then(t => { useCb.checked = (t && t.engine) === "voicebox"; }).catch(() => {}); };
                  refresh();
                  test.addEventListener("click", async () => { stat.textContent = "saving + testing\u2026"; await fetch("/voicebox/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseUrl: url.value.trim() }) }).catch(() => {}); refresh(); });
                  const saveSel = () => fetch("/voicebox/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: prof.value, engine: eng.value }) }).catch(() => {});
                  prof.onchange = saveSel; eng.onchange = saveSel;
                  useCb.onchange = () => fetch("/tts/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engine: useCb.checked ? "voicebox" : "sapi" }) }).then(r => r.json()).then(t => { useCb.checked = (t && t.engine) === "voicebox"; }).catch(() => { useCb.checked = !useCb.checked; });
                  speak.addEventListener("click", async () => { await saveSel(); stat.textContent = "speaking\u2026"; const j = await fetch("/voicebox/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: say.value || "test" }) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message })); if (j && j.ok && j.wav) { stat.innerHTML = "<span style='color:#9fe88f'>\u2713 spoke</span>"; try { new Audio(j.wav).play(); } catch {} } else { stat.innerHTML = "<span style='color:#f88'>\u2717 " + (((j && j.error) || "failed") + "").slice(0, 90) + "</span>"; } });
              } },
        ]},
        { id: "avatarGauges", label: "Avatar", icon: "🧑‍🚀", controls: [
            { id: "mesh2motion", type: "custom", label: "\uD83E\uDDB4 Mesh2Motion (auto-rigger)",
              render: (box) => {
                  box.style.cssText = "display:flex;flex-direction:column;gap:6px;";
                  const hint = document.createElement("div"); hint.style.cssText = "font-size:11px;color:#8b97a8;line-height:1.5;"; hint.innerHTML = "Free browser auto-rigger (a <a href=\"https://mesh2motion.org\" target=\"_blank\" rel=\"noopener\" style=\"color:#9bd6ff\">Mixamo</a> alternative): rig a model and export an animated GLB whose bone names line up with the engine avatar's hand-bone detection \u2014 then load it from the Avatar gallery. It's a browser app (no API), so the engine launches it and you bring the GLB back.";
                  const row = document.createElement("div"); row.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;";
                  const launch = document.createElement("button"); launch.textContent = "\u25B6 Launch (mesh2motion.org)"; launch.style.cssText = "padding:6px 12px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;border-radius:6px;cursor:pointer;font-size:12px;";
                  row.append(launch);
                  const localRow = document.createElement("div"); localRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;";
                  const local = document.createElement("input"); local.placeholder = "http://localhost:5173 (self-host)"; local.value = "http://localhost:5173"; local.style.cssText = "flex:1;min-width:150px;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  const launchLocal = document.createElement("button"); launchLocal.textContent = "Launch local"; launchLocal.style.cssText = "padding:6px 12px;background:#2a3a5a;color:#cfe;border:1px solid #4a5a8a;border-radius:6px;cursor:pointer;font-size:12px;"; localRow.append(local, launchLocal);
                  const note = document.createElement("div"); note.style.cssText = "font-size:11px;color:#8b97a8;line-height:1.5;"; note.innerHTML = "Self-host: install via the Install panel (<i>tool-mesh2motion</i> clones + builds it), then <code>npm run dev</code> (~localhost:5173). Export the rigged GLB \u2192 load it in the Avatar gallery / drop folder.";
                  box.append(hint, row, localRow, note);
                  launch.addEventListener("click", () => { try { window.open("https://mesh2motion.org", "_blank", "noopener"); } catch {} });
                  launchLocal.addEventListener("click", () => { const u = (local.value || "").trim(); if (u) { try { window.open(u, "_blank", "noopener"); } catch {} } });
              } },
            { id: "avatarPush", label: "🧑‍🚀 Push an avatar (live swap)", hint: "Open the avatar picker: pick any .glb avatar and push it live — it hot-swaps on the engine window, the standalone avatar window, and the Shield/phone with no reload. “Show on Shield” opens the avatar window on the Shield, then keeps it in sync.", type: "button",
              action: () => { try { window.open("/avatar-push.html", "_blank"); } catch { location.href = "/avatar-push.html"; } } },
            { id: "peerAvatarSynch", type: "custom",
              render: (box) => {
                  const mk = (tag, css, txt) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; };
                  box.style.cssText = "display:flex;flex-direction:column;gap:6px;border-top:1px solid #1a2c3a;padding-top:10px;margin-top:4px;";
                  box.appendChild(mk("div", "font-size:13px;font-weight:600;color:#cde;", "\uD83E\uDDCD Peer Avatar Visit Synch"));
                  box.appendChild(mk("div", "font-size:11px;color:#8b97a8;line-height:1.5;", "When a peer announces, pull its primary avatar (up to this size) into a local cache outside the engine folder, so it's ready to walk into your studio. Runs even when full asset sync is off. 0 = don't sync peer avatars."));
                  const row = mk("div", "display:flex;align-items:center;gap:10px;margin-top:4px;");
                  const slider = mk("input", "flex:1;"); slider.type = "range"; slider.min = "0"; slider.max = "300"; slider.step = "10"; slider.value = "150"; slider.style.accentColor = "#4af";
                  const val = mk("span", "min-width:92px;text-align:right;font:12px ui-monospace,monospace;color:#9fe88f;", "150 MB / avatar");
                  row.append(slider, val); box.appendChild(row);
                  const stat = mk("div", "font-size:11px;color:#8b97a8;", ""); box.appendChild(stat);
                  const paint = () => { const v = +slider.value; val.textContent = v === 0 ? "off" : (v + " MB / avatar"); val.style.color = v === 0 ? "#caa05a" : "#9fe88f"; };
                  const loadStat = async () => { try { const j = await fetch("/peer-avatar/list").then(r => r.json()); if (j && j.ok) stat.textContent = j.avatars.length ? ("cached: " + j.avatars.map(a => a.peer + " (" + a.mb + "MB)").join(", ")) : "no peer avatars cached yet"; } catch {} };
                  fetch("/sync/settings").then(r => r.json()).then(j => { const s = (j && j.settings) || {}; if (s.peerAvatarMB != null) slider.value = s.peerAvatarMB; paint(); loadStat(); }).catch(() => paint());
                  let _t = null;
                  slider.addEventListener("input", () => { paint(); clearTimeout(_t); _t = setTimeout(async () => { try { await fetch("/sync/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ peerAvatarMB: +slider.value }) }); } catch {} }, 350); });
              } },
            { id: "dioramaComposer", label: "🎬 Diorama composer", hint: "Compose the avatar's little stage: pick the avatar, choose which gauges show (style + colour), toggle the llama + room, and add props it carries. Previews live and saves automatically; export the layout to a file to share, or load one back.", type: "button",
              action: () => { try { window.open("/diorama-composer.html", "_blank"); } catch { location.href = "/diorama-composer.html"; } } },
            { id: "assetStudio", label: "🧪 Asset Studio (prompt → 3D)", hint: "Open the Asset Studio: type a prompt to generate an image (or pick a photo), then turn it into a 3D model on your chosen engine (Trellis 2 / Sparc3D / Hunyuan / ComfyUI). Finished meshes land in the asset library, where 🧑‍🚀 makes one your live avatar.", type: "button",
              action: () => { try { window.open("/asset-studio.html", "_blank"); } catch { location.href = "/asset-studio.html"; } } },
        ] },
        { id: "assets", label: "Assets", icon: "🗂️", controls: [
            // v1587 — folder picker first (Geek): set WHERE models live before the library / ingest links.
            { id: "assetsFolderSet", type: "custom", label: "\uD83D\uDCC1 GPU_Assets folder (where your models live)",
              render: (box) => {
                  box.style.cssText = "display:flex; flex-direction:column; gap:6px;";
                  const hint = document.createElement("div"); hint.style.cssText = "font-size:11px; color:#8b97a8; line-height:1.5;";
                  hint.innerHTML = "The folder the engine serves models / comics / images from. Point it at a folder OUTSIDE the engine (e.g. <code>C:\\VoxelBAK\\GPU_Assets</code>) so it survives engine updates. On a phone, tap Browse to pick it on the PC \u2014 no typing Windows paths.";
                  const cur = document.createElement("div"); cur.style.cssText = "font-size:11px; color:#7fffb0; background:#06200f; border:1px solid #1aa257; border-radius:6px; padding:6px 9px; word-break:break-all;"; cur.textContent = "checking\u2026";
                  const row = document.createElement("div"); row.style.cssText = "display:flex; gap:6px; flex-wrap:wrap; align-items:center;";
                  const inp = document.createElement("input"); inp.placeholder = "C:\\VoxelBAK\\GPU_Assets"; inp.style.cssText = "flex:1; min-width:150px; padding:6px 8px; background:#0c0f14; color:#e8eef8; border:1px solid #2a3340; border-radius:6px; font:12px ui-monospace,monospace;";
                  const browse = document.createElement("button"); browse.textContent = "Browse\u2026"; browse.style.cssText = "padding:6px 12px; background:#2a3a5a; color:#cfe; border:1px solid #4a5a8a; border-radius:6px; cursor:pointer; font-size:12px;";
                  const save = document.createElement("button"); save.textContent = "Save"; save.style.cssText = "padding:6px 12px; background:#2a4d3a; color:#cfe; border:1px solid #4a7d5a; border-radius:6px; cursor:pointer; font-size:12px;";
                  const msg = document.createElement("div"); msg.style.cssText = "font-size:11px; color:#8b97a8; min-height:14px;";
                  const moveBtn = document.createElement("button"); moveBtn.textContent = "Move existing files here"; moveBtn.title = "One-time: physically relocate your current asset files into this folder (free space is checked first)"; moveBtn.style.cssText = "padding:6px 12px; background:#4d3a2a; color:#fed; border:1px solid #7d5a3a; border-radius:6px; cursor:pointer; font-size:12px;";
                  const space = document.createElement("div"); space.style.cssText = "font-size:11px; color:#8b97a8; min-height:14px;";
                  row.append(inp, browse, save, moveBtn); box.append(hint, cur, row, space, msg);
                  const fmtB = (b) => (b == null || b < 0) ? "?" : (b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : b < 1073741824 ? (b / 1048576).toFixed(1) + " MB" : (b / 1073741824).toFixed(2) + " GB");
                  const checkSpace = () => { const dd = inp.value.trim(); fetch("/config/assets-space?dir=" + encodeURIComponent(dd)).then(r => r.json()).then(j => { if (!j || !j.ok) { space.textContent = ""; return; } let t = "current assets: " + fmtB(j.currentBytes) + " (" + j.currentFiles + " files)"; if (dd && j.destFreeBytes >= 0) t += " \u00b7 free at destination: " + fmtB(j.destFreeBytes) + (j.fits === false ? " \u2014 NOT enough to move" : (j.fits === true ? " \u2014 fits \u2713" : "")); space.style.color = (j.fits === false) ? "#f88" : "#8b97a8"; space.textContent = t; }).catch(() => { space.textContent = ""; }); };
                  inp.addEventListener("input", checkSpace); checkSpace();
                  const loadCur = () => settingsCachedGET("/config/assets-dir", 5000).then(j => { const d = j && j.assetsDir; cur.textContent = d || "(default \u2014 inside the engine folder; NOT update-safe)"; if (d && !inp.value) inp.value = d; }).catch(() => { cur.textContent = "(couldn\u2019t read \u2014 bridge offline?)"; });
                  loadCur();
                  browse.addEventListener("click", async () => { try { const p = await window.pickServerPath({ mode: "folder", title: "Pick the GPU_Assets folder", start: inp.value.trim() }); if (p) { inp.value = p; checkSpace(); } } catch (e) { msg.style.color = "#f88"; msg.textContent = "\u2717 " + ((e && e.message) || "picker unavailable"); } });
                  const doSave = async (move) => {
                      const dir = inp.value.trim();
                      if (move && !dir) { msg.style.color = "#f88"; msg.textContent = "\u2717 pick a destination folder first (type a path or Browse\u2026)"; return; }
                      if (move && !confirm("Move all current asset files into:\n" + dir + "\n\nThis physically relocates them (free space is checked first). Continue?")) return;
                      save.disabled = moveBtn.disabled = true;
                      msg.style.color = "#9fb3cc"; msg.textContent = move ? "moving files\u2026 (don\u2019t close this)" : "saving\u2026";
                      const j = await fetch("/config/assets-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dir, move }) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
                      try { settingsCacheBust("/config/assets-dir"); } catch {}   // v1810 — next read re-fetches the saved value
                      save.disabled = moveBtn.disabled = false;
                      if (j && j.ok) { msg.style.color = "#9fe88f"; msg.innerHTML = "\u2713 " + (move ? ("moved " + (j.moved || 0) + " item(s) \u00b7 " + fmtB(j.bytes)) : "saved") + (j.created && j.created.length ? (" \u00b7 created: " + j.created.join(", ")) : "") + (j.note ? (" \u00b7 " + j.note) : ""); loadCur(); checkSpace(); }
                      else if (j && j.neededBytes != null) { msg.style.color = "#f88"; msg.textContent = "\u2717 not enough space \u2014 need " + fmtB(j.neededBytes) + ", free " + fmtB(j.freeBytes); }
                      else { msg.style.color = "#f88"; msg.textContent = "\u2717 " + ((j && j.error) || "failed") + (j && j.moveErrors && j.moveErrors.length ? (" \u00b7 " + j.moveErrors.length + " item(s) failed") : ""); }
                  };
                  save.addEventListener("click", () => doSave(false));
                  moveBtn.addEventListener("click", () => doSave(true));
              } },
            { id: "assetLibrary", label: "🗂️ Asset library", hint: "Open the asset library: browse / triage generated 3D, voxel and image assets. Mesh assets have a 🧑‍🚀 button to become the live avatar, and 🚀 to spawn into the running engine.", type: "button",
              action: () => { try { window.open("/asset-library.html", "_blank"); } catch { location.href = "/asset-library.html"; } } },
            { id: "assetIngest", label: "📦 Asset ingest & Downloads watcher", hint: "File dropped .glb/.gltf models into GPU_Assets subfolders by name (helmets, mechs, vehicles…), and optionally auto-import models you download. Opens the ingest settings page.", type: "button",
              action: () => { try { window.open("/assets-ingest.html", "_blank"); } catch { location.href = "/assets-ingest.html"; } } },
            { id: "docToMarkdown", type: "custom", label: "\uD83D\uDCDD Doc \u2192 Markdown (markitdown)",
              render: (box) => {
                  box.style.cssText = "display:flex;flex-direction:column;gap:6px;";
                  const hint = document.createElement("div"); hint.style.cssText = "font-size:11px;color:#8b97a8;line-height:1.5;"; hint.innerHTML = "Convert a PDF / Word / PowerPoint / Excel / HTML / image into clean Markdown (Microsoft <b>markitdown</b>) \u2014 handy for feeding documents to the AI. Needs Python 3.10+.";
                  const stat = document.createElement("div"); stat.style.cssText = "font-size:11px;color:#8b97a8;min-height:14px;"; stat.textContent = "checking\u2026";
                  const row = document.createElement("div"); row.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;";
                  const inp = document.createElement("input"); inp.placeholder = "path to a document\u2026"; inp.style.cssText = "flex:1;min-width:150px;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  const browse = document.createElement("button"); browse.textContent = "Browse\u2026"; browse.style.cssText = "padding:6px 12px;background:#2a3a5a;color:#cfe;border:1px solid #4a5a8a;border-radius:6px;cursor:pointer;font-size:12px;";
                  const conv = document.createElement("button"); conv.textContent = "Convert"; conv.style.cssText = "padding:6px 12px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;border-radius:6px;cursor:pointer;font-size:12px;";
                  const inst = document.createElement("button"); inst.textContent = "Install"; inst.style.cssText = "padding:6px 12px;background:#3a3a5a;color:#cfe;border:1px solid #5a5a8a;border-radius:6px;cursor:pointer;font-size:12px;display:none;";
                  row.append(inp, browse, conv, inst);
                  const out = document.createElement("textarea"); out.readOnly = true; out.placeholder = "Markdown output\u2026"; out.style.cssText = "width:100%;min-height:120px;background:#0a0e14;color:#cde;border:1px solid #2a3340;border-radius:6px;padding:8px;font:11px ui-monospace,monospace;resize:vertical;display:none;";
                  const tools = document.createElement("div"); tools.style.cssText = "gap:6px;display:none;"; const copy = document.createElement("button"); copy.textContent = "Copy"; copy.style.cssText = "padding:4px 10px;background:#10293a;color:#9ed5ff;border:1px solid #245;border-radius:6px;cursor:pointer;font-size:11px;"; const dl = document.createElement("button"); dl.textContent = "Download .md"; dl.style.cssText = "padding:4px 10px;margin-left:6px;background:#10293a;color:#9ed5ff;border:1px solid #245;border-radius:6px;cursor:pointer;font-size:11px;"; tools.append(copy, dl);
                  box.append(hint, row, stat, out, tools);
                  const refresh = () => fetch("/markitdown/status").then(r => r.json()).then(s => { if (s && s.installed) { stat.innerHTML = "<span style='color:#9fe88f'>\u2713 markitdown " + (s.version || "") + " \u00b7 " + (s.py || "") + "</span>"; inst.style.display = "none"; } else { stat.innerHTML = "<span style='color:#caa05a'>not installed" + (s && s.py ? (" \u00b7 python: " + s.py) : "") + "</span>"; inst.style.display = ""; } }).catch(() => { stat.textContent = "(bridge offline)"; });
                  refresh();
                  browse.addEventListener("click", async () => { try { const p = await window.pickServerPath({ mode: "file", ext: ["pdf", "docx", "pptx", "xlsx", "xls", "html", "htm", "csv", "json", "txt", "png", "jpg", "jpeg", "epub"], title: "Pick a document", start: inp.value.trim() }); if (p) inp.value = p; } catch (e) { stat.textContent = "\u2717 " + ((e && e.message) || "picker unavailable"); } });
                  inst.addEventListener("click", async () => { inst.disabled = true; stat.innerHTML = "installing markitdown\u2026 (one-time)"; const j = await fetch("/markitdown/install", { method: "POST" }).then(r => r.json()).catch(e => ({ ok: false, error: e.message })); inst.disabled = false; if (j && j.ok) { stat.innerHTML = "<span style='color:#9fe88f'>\u2713 installed " + (j.version || "") + "</span>"; refresh(); } else { stat.innerHTML = "<span style='color:#f88'>\u2717 " + (((j && j.error) || "install failed") + "").slice(0, 120) + "</span>"; } });
                  let _md = "";
                  conv.addEventListener("click", async () => { const p = inp.value.trim(); if (!p) { stat.textContent = "pick a file first"; return; } conv.disabled = true; stat.textContent = "converting\u2026"; const j = await fetch("/markitdown/convert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: p }) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message })); conv.disabled = false; if (j && j.ok) { _md = j.markdown || ""; out.value = _md; out.style.display = ""; tools.style.display = "block"; stat.innerHTML = "<span style='color:#9fe88f'>\u2713 " + (j.chars || 0) + " chars from " + (j.file || "") + "</span>"; } else { stat.innerHTML = "<span style='color:#f88'>\u2717 " + (((j && j.error) || "failed") + "").slice(0, 140) + "</span>"; } });
                  copy.addEventListener("click", () => { try { navigator.clipboard.writeText(_md); copy.textContent = "\u2713"; setTimeout(() => copy.textContent = "Copy", 1000); } catch {} });
                  dl.addEventListener("click", () => { try { const b = new Blob([_md], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = ((inp.value.split(/[\\/]/).pop() || "doc").replace(/\.[^.]+$/, "")) + ".md"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); } catch {} });
              } },
            { id: "webToMarkdown", type: "custom", label: "\uD83D\uDD25 Web \u2192 Markdown (Firecrawl)",
              render: (box) => {
                  box.style.cssText = "display:flex;flex-direction:column;gap:6px;";
                  const hint = document.createElement("div"); hint.style.cssText = "font-size:11px;color:#8b97a8;line-height:1.5;"; hint.innerHTML = "Scrape any URL into clean Markdown (<a href=\"https://firecrawl.dev\" target=\"_blank\" rel=\"noopener\" style=\"color:#9bd6ff\">Firecrawl</a>) \u2014 the web-side companion to Doc \u2192 Markdown. Needs a free API key (firecrawl.dev).";
                  const stat = document.createElement("div"); stat.style.cssText = "font-size:11px;color:#8b97a8;min-height:14px;"; stat.textContent = "checking\u2026";
                  const keyRow = document.createElement("div"); keyRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;";
                  const key = document.createElement("input"); key.type = "password"; key.placeholder = "fc-... API key"; key.style.cssText = "flex:1;min-width:140px;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  const saveK = document.createElement("button"); saveK.textContent = "Save key"; saveK.style.cssText = "padding:6px 12px;background:#2a3a5a;color:#cfe;border:1px solid #4a5a8a;border-radius:6px;cursor:pointer;font-size:12px;"; keyRow.append(key, saveK);
                  const row = document.createElement("div"); row.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;";
                  const url = document.createElement("input"); url.placeholder = "https://example.com/article"; url.style.cssText = "flex:1;min-width:160px;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  const scrape = document.createElement("button"); scrape.textContent = "Scrape"; scrape.style.cssText = "padding:6px 12px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;border-radius:6px;cursor:pointer;font-size:12px;"; row.append(url, scrape);
                  const out = document.createElement("textarea"); out.readOnly = true; out.placeholder = "Markdown output\u2026"; out.style.cssText = "width:100%;min-height:120px;background:#0a0e14;color:#cde;border:1px solid #2a3340;border-radius:6px;padding:8px;font:11px ui-monospace,monospace;resize:vertical;display:none;";
                  const tools = document.createElement("div"); tools.style.cssText = "gap:6px;display:none;"; const copy = document.createElement("button"); copy.textContent = "Copy"; copy.style.cssText = "padding:4px 10px;background:#10293a;color:#9ed5ff;border:1px solid #245;border-radius:6px;cursor:pointer;font-size:11px;"; const dl = document.createElement("button"); dl.textContent = "Download .md"; dl.style.cssText = "padding:4px 10px;margin-left:6px;background:#10293a;color:#9ed5ff;border:1px solid #245;border-radius:6px;cursor:pointer;font-size:11px;"; tools.append(copy, dl);
                  box.append(hint, keyRow, row, stat, out, tools);
                  const refresh = () => fetch("/firecrawl/status").then(r => r.json()).then(s => { stat.innerHTML = (s && s.configured) ? "<span style='color:#9fe88f'>\u2713 API key set</span>" : "<span style='color:#caa05a'>no API key yet \u2014 paste one above</span>"; if (s && s.configured) key.placeholder = "[key saved \u2014 type to replace]"; }).catch(() => { stat.textContent = "(bridge offline)"; });
                  refresh();
                  saveK.addEventListener("click", async () => { await fetch("/firecrawl/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: key.value.trim() }) }).catch(() => {}); key.value = ""; refresh(); });
                  let _md = "";
                  scrape.addEventListener("click", async () => { const u = url.value.trim(); if (!u) { stat.textContent = "enter a URL"; return; } scrape.disabled = true; stat.textContent = "scraping\u2026"; const j = await fetch("/firecrawl/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: u }) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message })); scrape.disabled = false; if (j && j.ok) { _md = j.markdown || ""; out.value = _md; out.style.display = ""; tools.style.display = "block"; stat.innerHTML = "<span style='color:#9fe88f'>\u2713 " + (j.chars || 0) + " chars \u00b7 " + (j.title || j.url || "") + "</span>"; } else { stat.innerHTML = "<span style='color:#f88'>\u2717 " + (((j && j.error) || "failed") + "").slice(0, 140) + "</span>"; } });
                  copy.addEventListener("click", () => { try { navigator.clipboard.writeText(_md); copy.textContent = "\u2713"; setTimeout(() => copy.textContent = "Copy", 1000); } catch {} });
                  dl.addEventListener("click", () => { try { const b = new Blob([_md], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "scrape.md"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); } catch {} });
              } },
            { id: "immichPhotos", type: "custom", label: "\uD83D\uDDBC\uFE0F Immich photos",
              render: (box) => {
                  box.style.cssText = "display:flex;flex-direction:column;gap:6px;";
                  const hint = document.createElement("div"); hint.style.cssText = "font-size:11px;color:#8b97a8;line-height:1.5;"; hint.innerHTML = "Browse your self-hosted <a href=\"https://immich.app\" target=\"_blank\" rel=\"noopener\" style=\"color:#9bd6ff\">Immich</a> library and pull a photo into GPU_Assets (as a texture / reference). Set the server URL + an API key (asset.read).";
                  const stat = document.createElement("div"); stat.style.cssText = "font-size:11px;color:#8b97a8;min-height:14px;"; stat.textContent = "checking\u2026";
                  const cfgRow = document.createElement("div"); cfgRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;";
                  const url = document.createElement("input"); url.placeholder = "http://localhost:2283"; url.style.cssText = "flex:1;min-width:140px;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  const key = document.createElement("input"); key.type = "password"; key.placeholder = "API key"; key.style.cssText = "flex:1;min-width:100px;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  const test = document.createElement("button"); test.textContent = "Connect"; test.style.cssText = "padding:6px 12px;background:#2a3a5a;color:#cfe;border:1px solid #4a5a8a;border-radius:6px;cursor:pointer;font-size:12px;"; cfgRow.append(url, key, test);
                  const grid = document.createElement("div"); grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:6px;max-height:240px;overflow:auto;";
                  box.append(hint, cfgRow, stat, grid);
                  const loadRecent = () => fetch("/immich/recent?n=30").then(r => r.json()).then(j => { grid.innerHTML = ""; const list = (j && j.assets) || []; if (!list.length) { grid.innerHTML = "<div style='color:#8b97a8;font-size:11px;grid-column:1/-1;'>no photos returned</div>"; return; } list.forEach(a => { const cell = document.createElement("div"); cell.title = a.name + " \u2014 click to pull into GPU_Assets"; cell.style.cssText = "cursor:pointer;border:1px solid #2a3340;border-radius:6px;overflow:hidden;aspect-ratio:1;background:#0a0e14;"; const img = document.createElement("img"); img.loading = "lazy"; img.src = "/immich/thumb?id=" + encodeURIComponent(a.id); img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;"; cell.appendChild(img); cell.addEventListener("click", async () => { cell.style.opacity = ".5"; const r = await fetch("/immich/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, name: a.name }) }).then(x => x.json()).catch(e => ({ ok: false, error: e.message })); cell.style.opacity = "1"; stat.innerHTML = (r && r.ok) ? ("<span style='color:#9fe88f'>\u2713 pulled " + (r.file || "") + " \u2192 GPU_Assets/immich</span>") : ("<span style='color:#f88'>\u2717 " + (((r && r.error) || "pull failed") + "").slice(0, 100) + "</span>"); }); grid.appendChild(cell); }); }).catch(() => { grid.innerHTML = "<div style='color:#f88;font-size:11px;'>load failed</div>"; });
                  const refresh = () => { fetch("/immich/config").then(r => r.json()).then(c => { const cfg = (c && c.config) || {}; url.value = cfg.baseUrl || ""; if (cfg.apiKeySet) key.placeholder = "[key saved \u2014 type to replace]"; }).catch(() => {}); fetch("/immich/status").then(r => r.json()).then(s => { stat.innerHTML = (s && s.reachable) ? "<span style='color:#9fe88f'>\u2713 connected</span>" : "<span style='color:#caa05a'>not connected \u2014 set URL + key, press Connect</span>"; if (s && s.reachable) loadRecent(); }).catch(() => { stat.textContent = "(bridge offline)"; }); };
                  refresh();
                  test.addEventListener("click", async () => { stat.textContent = "connecting\u2026"; const body = { baseUrl: url.value.trim() }; if (key.value.trim()) body.apiKey = key.value.trim(); await fetch("/immich/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {}); key.value = ""; refresh(); });
              } },
            { id: "watchDownloads", type: "custom", label: "📥 Watch Downloads for models",
              render: (box) => {
                  box.style.cssText = "display:flex; flex-direction:column; gap:6px;";
                  const row = document.createElement("label"); row.style.cssText = "display:flex; gap:8px; align-items:center; font-size:12px; color:#cde; cursor:pointer;";
                  const cb = document.createElement("input"); cb.type = "checkbox";
                  row.append(cb, document.createTextNode("Auto-import new models you download (.glb/.gltf/.vrm/.fbx/.obj) into GPU_Assets"));
                  const msg = document.createElement("div"); msg.style.cssText = "font-size:11px; color:#8b97a8; min-height:14px;";
                  box.append(row, msg);
                  // Reflect the PERSISTED state on open (the bridge keeps it; this fixes the box not staying checked).
                  settingsCachedGET("/assets/ingest/status", 5000).then(j => { cb.checked = !!(j && j.watchDownloads); window._assetWatchOn = cb.checked; if (j) window._assetMoveOn = (j.moveOnImport !== false); }).catch(() => {});
                  cb.onchange = async () => {
                      const on = cb.checked; window._assetWatchOn = on;
                      try { await fetch("/assets/ingest/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ watchDownloads: on }) }); } catch {}
                      // v1821 — bust the cached status so reopening Settings reflects the just-saved value.
                      // Without this, settingsCachedGET returned the stale (8s TTL) status and the box
                      // appeared to "un-check" itself on reopen even though it saved correctly to disk.
                      try { window.settingsCacheBust && window.settingsCacheBust("/assets/ingest/status"); } catch {}
                      if (!on) { msg.style.color = "#8b97a8"; msg.textContent = "Watch off."; return; }
                      msg.style.color = "#9fb3cc"; msg.textContent = "Watching. Checking Downloads now\u2026";
                      try {
                          const a = await fetch("/assets/ingest/import", { method: "POST" }).then(r => r.json()).catch(() => null);
                          const b = await fetch("/assets/ingest/import-zips", { method: "POST" }).then(r => r.json()).catch(() => null);
                          const loose = a ? ((a.moved ? a.moved.length : 0) + (a.copied ? a.copied.length : 0)) : 0;
                          const kits = (b && b.zips) ? b.zips.reduce((n, z) => n + (z.models || 0), 0) : 0;
                          msg.style.color = "#9fe0b3"; msg.textContent = "\u2713 watching \u00b7 imported " + loose + " loose + " + kits + " from kits" + (b && b.skipped ? " (" + b.skipped + " zip(s) already done)" : "");
                          try { window.assetLibrary?.refresh?.(); } catch {}
                      } catch (e) { msg.style.color = "#f88"; msg.textContent = "watching, but the check failed: " + e.message; }
                  };
              } },
            { id: "moveOnImport", label: "\u2702\ufe0f Move imported models out of Downloads", hint: "When importing models from Downloads, MOVE them into GPU_Assets (don't leave copies behind). Duplicates already in your assets stay put in Downloads. On by default.", type: "toggle",
              get: () => { if (window._assetMoveOn === undefined) { try { fetch("/assets/ingest/status").then(r => r.json()).then(j => { window._assetMoveOn = (j && j.moveOnImport !== false); }).catch(() => {}); } catch {} return true; } return !!window._assetMoveOn; },
              set: (v) => { window._assetMoveOn = !!v; try { fetch("/assets/ingest/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moveOnImport: !!v }) }); } catch {} } },
            { id: "importDownloadsNow", label: "\ud83d\udce5 Import from Downloads now", hint: "Scan Downloads for loose .glb/.gltf/.vrm models AND known zip kits (e.g. Testfire Initiative.zip \u2192 installed as a skirmish mod) and bring them into your assets folder right now.", type: "button",
              action: () => { try { Promise.all([fetch("/assets/ingest/import", { method: "POST" }).then(r => r.json()).catch(() => null), fetch("/assets/ingest/import-zips?force=1", { method: "POST" }).then(r => r.json()).catch(() => null)]).then(([j, z]) => { const m = (j && j.moved && j.moved.length) || 0, c = (j && j.copied && j.copied.length) || 0, d = (j && j.dupesLeft) || 0; const zips = (z && z.zips) || []; const zmsg = zips.length ? ("\n" + zips.map(x => x.zip + " \u2192 " + (x.target || (x.models + " model(s)")) + (x.rule ? " [rule: " + x.rule + "]" : "")).join("\n")) : ""; const zerr = (z && z.errors && z.errors.length) ? ("\nzip errors: " + z.errors.join("; ")) : ""; alert("Imported " + (m + c) + " model(s)" + (m ? " (" + m + " moved)" : "") + (d ? ", left " + d + " duplicate(s)" : "") + ".\nZip kits: " + zips.length + zmsg + zerr); }).catch(() => alert("Import failed \u2014 is the bridge running?")); } catch {} } },
            { id: "autoSwitchHost", type: "custom", label: "\u26a1 Auto-switch to the fastest engine",
              render: (box) => {
                  box.style.cssText = "display:flex;flex-direction:column;gap:4px;";
                  const row = document.createElement("label"); row.style.cssText = "display:flex;gap:8px;align-items:center;font-size:12px;color:#cde;cursor:pointer;";
                  const cb = document.createElement("input"); cb.type = "checkbox";
                  row.append(cb, document.createTextNode("Jump to a faster SweK engine automatically (otherwise just suggest it)"));
                  const h = document.createElement("div"); h.style.cssText = "font-size:11px;color:#7a8290;";
                  h.textContent = "When another engine on your network is faster, switch after a short countdown. GPU compute is pointed at the GPU machine either way.";
                  box.append(row, h);
                  fetch("/sync/settings").then(r => r.json()).then(j => { cb.checked = !!(j && j.settings && j.settings.autoSwitchHost); }).catch(() => {});
                  cb.onchange = () => { try { fetch("/sync/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoSwitchHost: cb.checked }) }); } catch {} };
              } },
            { id: "aiWorker", type: "custom", label: "\uD83E\uDDE0 Act as an AI worker for the network",
              render: (box) => {
                  box.style.cssText = "display:flex;flex-direction:column;gap:4px;";
                  const row = document.createElement("label"); row.style.cssText = "display:flex;gap:8px;align-items:center;font-size:12px;color:#cde;cursor:pointer;";
                  const cb = document.createElement("input"); cb.type = "checkbox";
                  row.append(cb, document.createTextNode("Let other engines' games borrow this machine to run enemy AI"));
                  const h = document.createElement("div"); h.style.cssText = "font-size:11px;color:#7a8290;";
                  h.textContent = "When a host runs a multiplayer FPS, this engine registers as a brain and computes the enemy slots it's assigned (fastest CPUs get the nearest, smartest enemies). Off by default.";
                  box.append(row, h);
                  fetch("/sync/settings").then(r => r.json()).then(j => { cb.checked = !!(j && j.settings && j.settings.aiWorker); }).catch(() => {});
                  cb.onchange = () => { try { fetch("/sync/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aiWorker: cb.checked }) }); } catch {} };
              } },
            { id: "aiGruntModel", type: "custom", label: "\uD83D\uDC1C Grunt swarm brain",
              render: (box) => {
                  box.style.cssText = "display:flex;flex-direction:column;gap:4px;";
                  const row = document.createElement("label"); row.style.cssText = "display:flex;gap:8px;align-items:center;font-size:12px;color:#cde;";
                  const sel = document.createElement("select"); sel.style.cssText = "background:#0a0e14;color:#cde;border:1px solid #345;border-radius:4px;padding:3px;font-size:12px;";
                  for (const [v, t] of [["boids", "Boids (flock: separation + cohesion)"], ["pheromone", "Pheromone (scent-trail swarm)"]]) { const o = document.createElement("option"); o.value = v; o.textContent = t; sel.appendChild(o); }
                  row.append(document.createTextNode("Model:"), sel);
                  const h = document.createElement("div"); h.style.cssText = "font-size:11px;color:#7a8290;";
                  h.textContent = "How AI-worker engines steer the enemy grunt squad. Boids = Reynolds flocking. Pheromone = grunts climb a decaying scent field the players leave behind, so they follow trails and converge. Reported live in the Battle Network panel.";
                  box.append(row, h);
                  fetch("/sync/settings").then(r => r.json()).then(j => { sel.value = (j && j.settings && j.settings.aiGruntModel) || "boids"; }).catch(() => {});
                  sel.onchange = () => { try { fetch("/sync/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aiGruntModel: sel.value }) }); } catch {} };
              } },
            { id: "modelSync", type: "custom", label: "Model sync (peer-to-peer)",
              render: (box) => {
                  const mk = (tag, css, txt) => { const el = document.createElement(tag); if (css) Object.assign(el.style, css); if (txt != null) el.textContent = txt; return el; };
                  const sbtn = { background: "#234", color: "#cde", border: "1px solid #456", borderRadius: "5px", padding: "4px 10px", cursor: "pointer", fontSize: "12px" };
                  box.appendChild(mk("div", { fontSize: "13px", fontWeight: "600", marginBottom: "2px" }, "\ud83d\udd04 Model sync (peer-to-peer)"));
                  box.appendChild(mk("div", { fontSize: "11px", color: "#9aa", marginBottom: "8px" }, "Share GPU_Assets with another machine on your LAN \u2014 no cloud. Give the other machine the URL below, add ITS URL here, then Sync. Both bridges must be reachable on their port (firewall)."));
                  let myUrl = "";
                  const selfRow = mk("div", { display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" });
                  const selfLine = mk("div", { flex: "1 1 auto", fontSize: "12px", color: "#cde", wordBreak: "break-all" }, "This machine: \u2026");
                  const copyBtn = mk("button", { ...sbtn, padding: "2px 8px" }, "\ud83d\udccb Copy"); copyBtn.title = "Copy my URL to share with the other machine";
                  copyBtn.onclick = async () => { if (!myUrl) return; try { await navigator.clipboard.writeText(myUrl); copyBtn.textContent = "\u2713 Copied"; setTimeout(() => { copyBtn.textContent = "\ud83d\udccb Copy"; }, 1200); } catch { out.textContent = "Copy failed \u2014 select manually: " + myUrl; } };
                  selfRow.appendChild(selfLine); selfRow.appendChild(copyBtn); box.appendChild(selfRow);
                  const row = mk("div", { display: "flex", gap: "6px", marginBottom: "6px" });
                  const inp = mk("input"); inp.type = "text"; inp.placeholder = "http://192.168.50.x:8787"; inp.autocomplete = "off"; inp.spellcheck = false;
                  Object.assign(inp.style, { flex: "1 1 auto", minWidth: "0", background: "#0a0e14", color: "#cde", border: "1px solid #456", borderRadius: "5px", padding: "5px 8px", fontSize: "12px" });
                  const btnAdd = mk("button", sbtn, "+ Add"); row.appendChild(inp); row.appendChild(btnAdd); box.appendChild(row);
                  const acts = mk("div", { display: "flex", gap: "6px", marginBottom: "8px" });
                  const btnMirror = mk("button", sbtn, "\u21c4 Sync now (two-way)");
                  const btnPull = mk("button", sbtn, "\u2193 Pull only");
                  const btnBest = mk("button", sbtn, "\u27F1 Idlest peer"); btnBest.title = "Pull from the most idle saved/discovered peer (waits for one to free up per the slider below)";
                  acts.appendChild(btnMirror); acts.appendChild(btnPull); acts.appendChild(btnBest); box.appendChild(acts);
                  const hashRow = mk("label", { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#bcd", marginBottom: "8px", cursor: "pointer" });
                  const hashCb = mk("input"); hashCb.type = "checkbox"; hashRow.appendChild(hashCb); hashRow.appendChild(mk("span", null, "Content-hash dedup (slower; re-pulls edited models with the same name)")); box.appendChild(hashRow);
                  const autoRow = mk("label", { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#bcd", marginBottom: "8px", cursor: "pointer" });
                  const autoCb = mk("input"); autoCb.type = "checkbox";
                  const autoMin = mk("input"); autoMin.type = "number"; autoMin.min = "1"; autoMin.max = "1440";
                  Object.assign(autoMin.style, { width: "56px", background: "#0a0e14", color: "#cde", border: "1px solid #456", borderRadius: "5px", padding: "3px 6px", fontSize: "12px" });
                  autoRow.appendChild(autoCb); autoRow.appendChild(mk("span", null, "Auto-sync every")); autoRow.appendChild(autoMin); autoRow.appendChild(mk("span", null, "min (all saved peers)")); box.appendChild(autoRow);
                  // v1545 - make these toggles AUTHORITATIVE: after the POST, set the box from the
                  // server's ECHOED settings, so the displayed state always matches what the bridge
                  // actually stored. On any save failure, resync from /sync/status and show why,
                  // instead of leaving the box in a state the bridge never persisted (silent revert).
                  const syncSet = (patch, applyOk) => fetch("/sync/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).then(async (resp) => {
                      const ct = resp.headers.get("content-type") || ""; let j = null; try { j = await resp.json(); } catch {}
                      if (resp.ok && j && j.ok && j.settings) { applyOk(j.settings); }
                      else {
                          const why = !resp.ok ? ("HTTP " + resp.status + (resp.status === 404 ? " (old bridge? free :8787 + relaunch)" : ""))
                              : (!ct.includes("json") ? "got HTML not JSON \u2014 stale page, hard-reload (Ctrl+Shift+R)" : ((j && j.error) || "bridge returned not-ok"));
                          out.textContent = "\u2717 setting not saved \u2014 " + why; drawStatus();
                      }
                  }).catch((e) => { out.textContent = "\u2717 setting not saved \u2014 no response (" + ((e && e.message) || "network") + ")"; drawStatus(); });
                  const saveAuto = () => syncSet({ autoSync: autoCb.checked, autoSyncMin: parseInt(autoMin.value, 10) || 15 }, s => { autoCb.checked = !!s.autoSync; autoMin.value = s.autoSyncMin || 15; });
                  autoCb.onchange = saveAuto; autoMin.onchange = saveAuto;
                  // v1550 — idlest-peer wait slider (0 = pull immediately from the idlest; else wait up to N min for one to go idle)
                  const waitRow = mk("div", { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#bcd", marginBottom: "8px" });
                  const waitInp = mk("input"); waitInp.type = "range"; waitInp.min = "0"; waitInp.max = "120"; waitInp.step = "5"; waitInp.value = "120"; waitInp.style.flex = "1";
                  const waitLbl = mk("span", { minWidth: "168px", color: "#9aa", textAlign: "right" }, "");
                  const fmtWait = (v) => (v <= 0) ? "Idlest peer: no wait" : ("Wait up to " + (v >= 60 ? (Math.floor(v / 60) + "h" + (v % 60 ? " " + (v % 60) + "m" : "")) : (v + "m")) + " for idle");
                  const drawWait = () => { waitLbl.textContent = fmtWait(parseInt(waitInp.value, 10) || 0); };
                  waitRow.appendChild(mk("span", { title: "How long the Idlest-peer pull will wait for a busy peer to free up before pulling anyway" }, "\u23F3")); waitRow.appendChild(waitInp); waitRow.appendChild(waitLbl); box.appendChild(waitRow);
                  waitInp.oninput = drawWait;
                  waitInp.onchange = () => syncSet({ syncWaitMin: parseInt(waitInp.value, 10) || 0 }, s => { waitInp.value = s.syncWaitMin; drawWait(); });
                  drawWait();
                  const discRow = mk("label", { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#bcd", marginBottom: "6px", cursor: "pointer" });
                  const discCb = mk("input"); discCb.type = "checkbox";
                  discRow.appendChild(discCb); discRow.appendChild(mk("span", null, "Auto-detect other engines on this network (UDP beacon)")); box.appendChild(discRow);
                  discCb.onchange = () => syncSet({ discover: discCb.checked }, s => { discCb.checked = !!s.discover; }).then(() => setTimeout(drawDiscovered, 300));
                  const adRow = mk("label", { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#bcd", marginBottom: "6px", cursor: "pointer" });
                  const adCb = mk("input"); adCb.type = "checkbox";
                  adRow.appendChild(adCb); adRow.appendChild(mk("span", null, "Also auto-sync DISCOVERED engines (trusted networks only)")); box.appendChild(adRow);
                  adCb.onchange = () => { if (adCb.checked && !window.confirm("Auto-sync will then pull models from ANY engine detected on your network. Only enable on a network you trust. Continue?")) { adCb.checked = false; return; } syncSet({ autoSyncDiscovered: adCb.checked }, s => { adCb.checked = !!s.autoSyncDiscovered; }); };
                  const lastLine = mk("div", { fontSize: "11px", color: "#8a9", marginBottom: "8px" }, ""); box.appendChild(lastLine);
                  box.appendChild(mk("div", { fontSize: "12px", color: "#9aa", margin: "2px 0" }, "Discovered on your network:"));
                  const discBox = mk("div", { fontSize: "12px", display: "flex", flexDirection: "column", gap: "3px", marginBottom: "8px" }); box.appendChild(discBox);
                  box.appendChild(mk("div", { fontSize: "13px", fontWeight: "600", marginTop: "10px", marginBottom: "2px" }, "\ud83d\udcf7 Share this machine's webcam"));
                  box.appendChild(mk("div", { fontSize: "11px", color: "#9aa", marginBottom: "6px" }, "Expose this machine's camera as a stream other engines can pull (Mac FaceTime / PC webcam / Linux v4l2). Then hit \ud83d\udcf7 on a saved peer there to watch it. Needs ffmpeg installed."));
                  const camBtn = mk("button", sbtn, "\ud83d\udcf7 Expose my webcam"); box.appendChild(camBtn);
                  const camStat = mk("div", { fontSize: "11px", color: "#8a9", margin: "4px 0 6px" }, ""); box.appendChild(camStat);
                  const camAutoRow = document.createElement("label"); camAutoRow.style.cssText = "display:flex;align-items:center;gap:6px;font-size:11px;color:#cde;margin:2px 0 6px;cursor:pointer;";
                  const camAutoCb = document.createElement("input"); camAutoCb.type = "checkbox";
                  camAutoRow.append(camAutoCb, document.createTextNode("Auto-expose on engine startup (starts go2rtc if needed; needs ffmpeg)"));
                  box.appendChild(camAutoRow);
                  // v1563 — hydrate with a RAW fetch. The section's `const api` is declared lower
                  // down, so calling api() here hit the temporal-dead-zone, threw, got swallowed by
                  // the catch, and the box never reflected the saved state (looked like it "didn't keep").
                  (async () => { try { const r = await fetch("/camera/webcam-autostart"); const j = await r.json(); if (j && j.ok) camAutoCb.checked = !!j.webcamAuto; } catch {} })();
                  camAutoCb.onchange = async () => {
                      // v1561 — diagnostic save: surface WHY it failed (HTTP status, a non-JSON/HTML
                      // response = a stale cached page or an old bridge, or no response) instead of a
                      // vague "is the bridge reachable?". The save logic itself is known-good.
                      const want = camAutoCb.checked;
                      try {
                          const resp = await fetch("/camera/webcam-autostart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: want }) });
                          const ct = resp.headers.get("content-type") || "";
                          let j = null; try { j = await resp.json(); } catch {}
                          if (resp.ok && j && j.ok) { camAutoCb.checked = !!j.webcamAuto; camStat.textContent = j.webcamAuto ? "\u2713 will auto-expose on startup" : "auto-expose off"; camStat.style.color = "#9fe88f"; }
                          else {
                              camAutoCb.checked = !want;
                              const why = !resp.ok ? ("HTTP " + resp.status + (resp.status === 404 ? " \u2014 route missing (old bridge? free :8787 + relaunch)" : ""))
                                  : (!ct.includes("json") ? "got HTML not JSON \u2014 stale page, hard-reload (Ctrl+Shift+R)"
                                  : ((j && j.error) || "bridge returned not-ok"));
                              camStat.textContent = "\u2717 not saved \u2014 " + why; camStat.style.color = "#f88";
                          }
                      } catch (e) { camAutoCb.checked = !want; camStat.textContent = "\u2717 not saved \u2014 no response from bridge (" + ((e && e.message) || "network") + ")"; camStat.style.color = "#f88"; }
                  };
                  camBtn.onclick = async () => { camBtn.disabled = true; camStat.textContent = "Starting camera\u2026"; const res = await api("/camera/expose-webcam", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "webcam" }) }); camStat.innerHTML = (res && res.ok) ? ("\u2713 live: <b>" + (res.rtsp || res.name) + "</b>" + (res.note ? "<br><span style=\"color:#9aa\">" + res.note + "</span>" : "")) : ("\u2717 " + ((res && res.error) || "failed")); camBtn.disabled = false; };
                  box.appendChild(mk("div", { fontSize: "13px", fontWeight: "600", marginTop: "10px", marginBottom: "2px" }, "\ud83d\udda5\ufe0f Use another engine's GPU"));
                  box.appendChild(mk("div", { fontSize: "11px", color: "#9aa", marginBottom: "6px" }, "No GPU here? Point AI-model jobs (mesh gen, ComfyUI, image gen) at a GPU engine; results sync back to this machine."));
                  const gpuRow = mk("div", { display: "flex", gap: "6px", marginBottom: "4px" });
                  const gpuInp = mk("input"); gpuInp.type = "text"; gpuInp.placeholder = "http://192.168.50.x:8787"; gpuInp.autocomplete = "off"; gpuInp.spellcheck = false;
                  Object.assign(gpuInp.style, { flex: "1 1 auto", minWidth: "0", background: "#0a0e14", color: "#cde", border: "1px solid #456", borderRadius: "5px", padding: "5px 8px", fontSize: "12px" });
                  const gpuSet = mk("button", sbtn, "Set"); const gpuClr = mk("button", sbtn, "Clear");
                  gpuRow.appendChild(gpuInp); gpuRow.appendChild(gpuSet); gpuRow.appendChild(gpuClr); box.appendChild(gpuRow);
                  const gpuStat = mk("div", { fontSize: "11px", color: "#8a9", marginBottom: "2px" }, ""); box.appendChild(gpuStat);
                  const capStat = mk("div", { fontSize: "11px", color: "#9be19b", marginBottom: "6px" }, ""); box.appendChild(capStat);
                  gpuSet.onclick = async () => { await api("/compute/host", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: gpuInp.value.trim() }) }); drawCompute(); };
                  gpuClr.onclick = async () => { gpuInp.value = ""; await api("/compute/host", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: "" }) }); drawCompute(); };
                  box.appendChild(mk("div", { fontSize: "11px", color: "#9aa", margin: "4px 0 2px" }, "Ollama LLM host (optional \u2014 use the host's chat models too):"));
                  const llmRow = mk("div", { display: "flex", gap: "6px", marginBottom: "4px" });
                  const llmInp = mk("input"); llmInp.type = "text"; llmInp.placeholder = "http://192.168.50.x:11434"; llmInp.autocomplete = "off"; llmInp.spellcheck = false;
                  Object.assign(llmInp.style, { flex: "1 1 auto", minWidth: "0", background: "#0a0e14", color: "#cde", border: "1px solid #456", borderRadius: "5px", padding: "5px 8px", fontSize: "12px" });
                  const llmSet = mk("button", sbtn, "Set"); const llmClr = mk("button", sbtn, "Clear");
                  llmRow.appendChild(llmInp); llmRow.appendChild(llmSet); llmRow.appendChild(llmClr); box.appendChild(llmRow);
                  llmSet.onclick = async () => { await api("/compute/llm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: llmInp.value.trim() }) }); drawCompute(); };
                  llmClr.onclick = async () => { llmInp.value = ""; await api("/compute/llm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: "" }) }); drawCompute(); };
                  const peersBox = mk("div", { fontSize: "12px", display: "flex", flexDirection: "column", gap: "3px", marginBottom: "6px" }); box.appendChild(peersBox);
                  const out = mk("div", { fontSize: "11px", color: "#9aa", whiteSpace: "pre-wrap", minHeight: "16px" }); box.appendChild(out);
                  const api = (p, o) => fetch(p, o).then(r => r.json()).catch(e => ({ ok: false, error: e && e.message }));
                  const fmtOne = (res) => { if (!res || !res.ok) return "\u2717 " + ((res && res.error) || "failed"); const a = res.pulledFromPeer || res, back = res.peerPulledFromUs; let t = "\u2713 pulled " + (a.pulledCount || 0) + ", skipped " + (a.skipped || 0); if (a.errors && a.errors.length) t += ", " + a.errors.length + " err"; if (back && back.pulledCount != null) t += " \u00b7 peer pulled " + back.pulledCount; return t; };
                  const fmt = (res) => { if (!res || !res.ok) return "\u2717 " + ((res && res.error) || "failed"); if (res.results) return res.results.length ? res.results.map(x => x.peer + ": " + fmtOne(x.result)).join("\n") : "No saved peers to sync."; return fmtOne(res); };
                  const drawStatus = async () => {
                      let st = await api("/sync/status");
                      if (!st || !st.ok) { await new Promise(r => setTimeout(r, 700)); st = await api("/sync/status"); }   // v1545 - retry once: a transient miss during auto-update churn shouldn't leave the boxes looking unchecked
                      if (!st || !st.ok) { selfLine.textContent = "This machine: (bridge not reachable)"; return; }
                      myUrl = st.selfUrl || "";
                      selfLine.innerHTML = "This machine: <b>" + (st.selfUrl || "(no LAN IP found)") + "</b> \u00b7 " + (st.localCount || 0) + " models";
                      hashCb.checked = !!st.hashDedup; autoCb.checked = !!st.autoSync; autoMin.value = st.autoSyncMin || 15; discCb.checked = !!st.discover; adCb.checked = !!st.autoSyncDiscovered; if (st.syncWaitMin != null) { waitInp.value = st.syncWaitMin; drawWait(); } peersBox.innerHTML = "";
                      if (st.lastAuto && st.lastAuto.at) { const n = st.lastAuto.result && st.lastAuto.result.peers; lastLine.textContent = "Last auto-sync: " + new Date(st.lastAuto.at).toLocaleTimeString() + (n != null ? " (" + n + " peer" + (n === 1 ? "" : "s") + ")" : ""); } else lastLine.textContent = "";
                      (st.peers || []).forEach(p => {
                          const r = mk("div", { display: "flex", alignItems: "center", gap: "6px" });
                          r.appendChild(mk("span", { flex: "1", color: "#bcd", wordBreak: "break-all" }, p));
                          const sB = mk("button", { ...sbtn, padding: "2px 8px" }, "\u21c4"); sB.title = "Sync with this peer";
                          const camB = mk("button", { ...sbtn, padding: "2px 8px" }, "\ud83d\udcf7"); camB.title = "Pull this engine camera (restream its webcam here)";
                          const xB = mk("button", { ...sbtn, padding: "2px 8px" }, "\u2715"); xB.title = "Remove";
                          sB.onclick = () => doSync("/sync/mirror?peer=" + encodeURIComponent(p), sB);
                          camB.onclick = async () => { camB.disabled = true; const res = await api("/camera/peer-add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ peerUrl: p }) }); out.textContent = (res && res.ok) ? ("\u2713 camera added: " + (((res.added || []).map(a => a.name).join(", ")) || "(none exposed on peer)")) : ("\u2717 " + ((res && res.error) || "failed")); camB.disabled = false; };
                          xB.onclick = async () => { await api("/sync/peers/remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: p }) }); drawStatus(); };
                          r.appendChild(sB); r.appendChild(camB); r.appendChild(xB); peersBox.appendChild(r);
                      });
                      if (!(st.peers || []).length) peersBox.textContent = "(no saved peers yet)";
                  };
                  const doSync = async (p, btn) => {
                      const old = btn.textContent; btn.disabled = true; btn.textContent = "\u2026"; out.textContent = "Syncing\u2026";
                      const MB = (b) => (b / 1048576).toFixed(1);
                      const poll = setInterval(async () => { try { const pr = await api("/sync/progress"); const g = pr && pr.progress; if (g && g.active) out.textContent = "\u2193 " + (g.done || 0) + "/" + (g.total || 0) + (g.current ? "  " + g.current : "") + (g.curTotal ? "  (" + MB(g.curBytes || 0) + "/" + MB(g.curTotal) + " MB)" : ""); } catch {} }, 500);
                      const res = await api(p + (p.includes("?") ? "&" : "?") + "hash=" + (hashCb.checked ? "1" : "0"));
                      clearInterval(poll);
                      out.textContent = fmt(res); btn.disabled = false; btn.textContent = old; drawStatus();
                  };
                  const drawCompute = async () => {
                      let st = null; try { st = await api("/compute/status"); } catch {}
                      if (!st || !st.host) { gpuStat.textContent = "GPU host: off (this machine runs AI locally)"; return; }
                      if (document.activeElement !== gpuInp) gpuInp.value = st.host;
                      if (document.activeElement !== llmInp) llmInp.value = st.llmHost || "";
                      gpuStat.innerHTML = "Compute host: <b>" + st.host + "</b> \u2014 " + (st.reachable ? ("reachable" + (st.hostModels != null ? ", " + st.hostModels + " models" : "")) : "<span style=\"color:#e88\">not reachable</span>");
                      let cap = "";
                      if (st.caps) { const c = st.caps, g = c.gpu || {}; if (g.present) cap = "\ud83d\udda5\ufe0f GPU: " + g.name; else if (g.accel === "metal") cap = "\ud83c\udf4e Apple Metal / MLX"; else cap = "\u26a1 CPU only (slower for big jobs)"; cap += "  \u00b7  " + (c.cpuCores || "?") + " cores  \u00b7  " + (c.platform || ""); }
                      capStat.textContent = cap;
                  };
                  const drawDiscovered = async () => {
                      let list = []; try { const r = await api("/sync/discovered"); list = (r && r.discovered) || []; } catch {}
                      discBox.innerHTML = "";
                      if (!discCb.checked) { discBox.textContent = "(turn on auto-detect above)"; return; }
                      if (!list.length) { discBox.textContent = "(none found yet \u2014 the other machine needs this on too)"; return; }
                      const saved = new Set();
                      list.forEach((d) => {
                          const row = mk("div", { display: "flex", alignItems: "center", gap: "6px" });
                          row.appendChild(mk("span", { flex: "1", color: "#9be19b", wordBreak: "break-all" }, d.url));
                          const sB = mk("button", { ...sbtn, padding: "2px 8px" }, "\u21c4"); sB.title = "Sync with this engine now";
                          const aB = mk("button", { ...sbtn, padding: "2px 8px" }, "+"); aB.title = "Save as a peer";
                          const gB = mk("button", { ...sbtn, padding: "2px 8px" }, "\ud83d\udda5\ufe0f"); gB.title = "Use this engine's GPU";
                          sB.onclick = () => doSync("/sync/mirror?peer=" + encodeURIComponent(d.url), sB);
                          aB.onclick = async () => { await api("/sync/peers/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: d.url }) }); drawStatus(); };
                          gB.onclick = async () => { await api("/compute/host", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: d.url }) }); gpuInp.value = d.url; drawCompute(); };
                          row.appendChild(sB); row.appendChild(aB); row.appendChild(gB); discBox.appendChild(row);
                      });
                  };
                  btnAdd.onclick = async () => { const u = inp.value.trim(); if (!u) return; await api("/sync/peers/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: u }) }); inp.value = ""; drawStatus(); };
                  btnMirror.onclick = () => { const u = inp.value.trim(); doSync(u ? "/sync/mirror?peer=" + encodeURIComponent(u) : "/sync/now", btnMirror); };
                  btnPull.onclick = () => { const u = inp.value.trim(); if (!u) { out.textContent = "Enter a peer URL to pull from."; return; } doSync("/sync/pull?peer=" + encodeURIComponent(u), btnPull); };
                  const doBest = async () => {
                      btnBest.disabled = true; out.textContent = "Finding the idlest peer\u2026";
                      const MB = (b) => (b / 1048576).toFixed(1);
                      let prevBestAt = 0; try { const p0 = await api("/sync/progress"); prevBestAt = (p0 && p0.lastBest && p0.lastBest.at) || 0; } catch {}
                      const start = await api("/sync/pull-best");
                      if (!start || !start.ok) { out.textContent = "\u2717 " + ((start && start.error) || "couldn't start"); btnBest.disabled = false; return; }
                      if (!start.candidates) { out.textContent = "No saved or discovered peers to pull from."; btnBest.disabled = false; return; }
                      let seenActive = false;
                      const finish = (lb) => { btnBest.disabled = false; if (lb && lb.ok && lb.note && !lb.chosenPeer) out.textContent = "\u2713 " + lb.note; else if (lb && lb.ok) out.textContent = "\u2713 pulled " + (lb.pulledCount || 0) + " from " + (lb.chosenPeer || "?") + (lb.proceededBusy ? " (still busy after the wait \u2014 pulled anyway)" : "") + (lb.waitedMs > 60000 ? " \u00b7 waited " + Math.round(lb.waitedMs / 60000) + "m" : ""); else out.textContent = "\u2717 " + ((lb && lb.error) || "no result"); drawStatus(); };
                      const poll = setInterval(async () => {
                          const pr = await api("/sync/progress"); const g = pr && pr.progress; const lb = pr && pr.lastBest;
                          if (g && g.active) {
                              seenActive = true;
                              if (g.phase === "waiting") { const mins = Math.ceil((g.remainingMs || 0) / 60000); out.textContent = "\u23F3 waiting for an idle peer (best \u2248" + Math.round((g.bestScore || 0) * 100) + "% busy) \u2014 up to " + mins + " min left"; }
                              else out.textContent = "\u2193 " + (g.done || 0) + "/" + (g.total || 0) + (g.current ? "  " + g.current : "") + (g.curTotal ? "  (" + MB(g.curBytes || 0) + "/" + MB(g.curTotal) + " MB)" : "");
                          } else if (lb && lb.at && lb.at !== prevBestAt) { clearInterval(poll); finish(lb); }
                          else if (seenActive) { clearInterval(poll); finish(lb); }
                      }, 1000);
                      setTimeout(() => { try { clearInterval(poll); } catch {} btnBest.disabled = false; }, 2 * 60 * 60 * 1000 + 180000);   // safety stop just past 2h
                  };
                  btnBest.onclick = doBest;
                  hashCb.onchange = () => syncSet({ hashDedup: hashCb.checked }, s => { hashCb.checked = !!s.hashDedup; });
                  drawStatus(); drawDiscovered(); drawCompute();
                  try { clearInterval(window._syncDiscTimer); } catch {}
                  try { window._syncDiscTimer = setInterval(drawDiscovered, 4000); } catch {}
              } },
            // v1591 — Geek: grab/send files & folders to a peer's Downloads, both directions.
            { id: "peerFiles", type: "custom", label: "\u21c5 Peer file transfer (Downloads)",
              render: (box) => {
                  box.style.cssText = "display:flex; flex-direction:column; gap:7px;";
                  const hint = document.createElement("div"); hint.style.cssText = "font-size:11px; color:#7a8290; line-height:1.5;";
                  hint.innerHTML = "Move files / folders between THIS machine's <b>Downloads</b> and another SweK box's Downloads on your LAN. <b>Grab</b> pulls from a peer; <b>Send</b> pushes to a peer. The far peer must allow LAN access (Settings \u2192 Security) or it returns \u201cauth required\u201d.";
                  const peerRow = document.createElement("div"); peerRow.style.cssText = "display:flex; gap:6px; align-items:center; flex-wrap:wrap;";
                  const sel = document.createElement("select"); sel.style.cssText = "flex:1; min-width:150px; padding:6px 8px; background:#0c0f14; color:#e8eef8; border:1px solid #2a3340; border-radius:6px; font-size:12px;";
                  const refresh = document.createElement("button"); refresh.textContent = "\u21bb"; refresh.title = "rescan peers"; refresh.style.cssText = "padding:6px 10px; background:#1a2536; color:#9ed5ff; border:1px solid #2a4060; border-radius:6px; cursor:pointer; font-size:12px;";
                  peerRow.append(sel, refresh);
                  const actRow = document.createElement("div"); actRow.style.cssText = "display:flex; gap:6px; flex-wrap:wrap;";
                  const grabB = document.createElement("button"); grabB.textContent = "\u2b07 Grab from peer"; grabB.style.cssText = "padding:6px 12px; background:#16302a; color:#9fe88f; border:1px solid #2a4a3a; border-radius:6px; cursor:pointer; font-size:12px;";
                  const sendFileB = document.createElement("button"); sendFileB.textContent = "\u2b06 Send file"; sendFileB.style.cssText = "padding:6px 12px; background:#1a2536; color:#9ed5ff; border:1px solid #2a4060; border-radius:6px; cursor:pointer; font-size:12px;";
                  const sendDirB = document.createElement("button"); sendDirB.textContent = "\u2b06 Send folder"; sendDirB.style.cssText = "padding:6px 12px; background:#1a2536; color:#9ed5ff; border:1px solid #2a4060; border-radius:6px; cursor:pointer; font-size:12px;";
                  actRow.append(grabB, sendFileB, sendDirB);
                  const browser = document.createElement("div"); browser.style.cssText = "display:none; flex-direction:column; gap:4px; border:1px solid #1c2531; border-radius:6px; padding:6px; max-height:230px; overflow:auto; background:#0a0d12;";
                  const crumb = document.createElement("div"); crumb.style.cssText = "font-size:11px; color:#9ed5ff; display:flex; gap:4px; align-items:center; flex-wrap:wrap;";
                  const listEl = document.createElement("div"); listEl.style.cssText = "display:flex; flex-direction:column; gap:2px;";
                  browser.append(crumb, listEl);
                  const msg = document.createElement("div"); msg.style.cssText = "font-size:11px; color:#8b97a8; min-height:14px;";
                  box.append(hint, peerRow, actRow, browser, msg);
                  const peerUrl = () => sel.value;
                  const fmtSize = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : n > 1024 ? (n / 1024).toFixed(0) + " KB" : n + " B";
                  const loadPeers = async () => { sel.innerHTML = "<option value=''>(loading peers\u2026)</option>"; try { const j = await fetch("/peer/list").then(r => r.json()); sel.innerHTML = ""; const ps = (j && j.peers) || []; if (!ps.length) { sel.innerHTML = "<option value=''>(no peers \u2014 is discovery on?)</option>"; return; } for (const p of ps) { const o = document.createElement("option"); o.value = p.url; o.textContent = (p.name ? (p.name + " \u2014 ") : "") + p.ip; sel.append(o); } } catch (e) { sel.innerHTML = "<option value=''>(peer list failed)</option>"; } };
                  loadPeers(); refresh.onclick = loadPeers;
                  let sub = "";
                  const doGrab = async (rel) => { msg.style.color = "#9fb3cc"; msg.textContent = "grabbing " + rel + " \u2026"; try { const j = await fetch("/peer/grab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ peer: peerUrl(), path: rel }) }).then(r => r.json()); if (j && j.ok) { msg.style.color = "#9fe88f"; msg.textContent = "\u2713 grabbed " + j.files + " file(s), " + fmtSize(j.bytes) + " \u2192 " + (j.dest || "Downloads"); } else { msg.style.color = "#f88"; msg.textContent = "\u2717 " + ((j && j.error) || "grab failed") + (j && j.errors ? (" (" + j.errors + " error(s))") : ""); } } catch (e) { msg.style.color = "#f88"; msg.textContent = "\u2717 " + ((e && e.message) || "grab failed"); } };
                  const browse = async (s) => { if (!peerUrl()) { msg.style.color = "#caa05a"; msg.textContent = "pick a peer first"; return; } sub = s || ""; browser.style.display = "flex"; listEl.textContent = "loading\u2026"; crumb.textContent = ""; let j; try { j = await fetch("/peer/dl/remote?peer=" + encodeURIComponent(peerUrl()) + "&sub=" + encodeURIComponent(sub)).then(r => r.json()); } catch (e) { listEl.textContent = "error"; return; } if (!j || !j.ok) { listEl.innerHTML = ""; msg.style.color = "#f88"; msg.textContent = "\u2717 " + ((j && j.error) || "could not read peer Downloads"); return; } crumb.innerHTML = ""; const mkCrumb = (label, target) => { const a = document.createElement("span"); a.textContent = label; a.style.cssText = "cursor:pointer; text-decoration:underline dotted;"; a.onclick = () => browse(target); return a; }; crumb.append(mkCrumb("Downloads", "")); let acc = ""; for (const part of sub.split("/").filter(Boolean)) { acc = acc ? (acc + "/" + part) : part; crumb.append(document.createTextNode(" / "), mkCrumb(part, acc)); } listEl.innerHTML = ""; for (const e of (j.entries || [])) { const row = document.createElement("div"); row.style.cssText = "display:flex; gap:8px; align-items:center; font-size:11px; padding:2px 3px;"; const nm = document.createElement("span"); nm.style.cssText = "flex:1; color:" + (e.dir ? "#9ed5ff" : "#cde") + "; cursor:" + (e.dir ? "pointer" : "default") + ";"; nm.textContent = (e.dir ? "\uD83D\uDCC1 " : "\uD83D\uDCC4 ") + e.name + (e.dir ? "" : ("  " + fmtSize(e.size))); if (e.dir) nm.onclick = () => browse(sub ? (sub + "/" + e.name) : e.name); const g = document.createElement("button"); g.textContent = "grab"; g.style.cssText = "padding:1px 8px; background:#16302a; color:#9fe88f; border:1px solid #2a4a3a; border-radius:4px; cursor:pointer; font-size:10px;"; g.onclick = () => doGrab(sub ? (sub + "/" + e.name) : e.name); row.append(nm, g); listEl.append(row); } if (!(j.entries || []).length) listEl.textContent = "(empty)"; };
                  grabB.onclick = () => browse("");
                  const doSend = async (mode) => { if (!peerUrl()) { msg.style.color = "#caa05a"; msg.textContent = "pick a peer first"; return; } let src = null; try { src = await window.pickServerPath({ mode, title: mode === "file" ? "Pick a file to send" : "Pick a folder to send" }); } catch (e) { src = null; } if (!src) { try { src = prompt("Local " + mode + " path to send to the peer's Downloads:") || null; } catch (e) {} } if (!src) return; msg.style.color = "#9fb3cc"; msg.textContent = "sending " + src + " \u2026"; try { const j = await fetch("/peer/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ peer: peerUrl(), path: src }) }).then(r => r.json()); if (j && j.ok) { msg.style.color = "#9fe88f"; msg.textContent = "\u2713 sent " + j.files + " file(s), " + fmtSize(j.bytes) + " \u2192 peer's Downloads"; } else { msg.style.color = "#f88"; msg.textContent = "\u2717 " + ((j && j.error) || "send failed") + (j && j.errors ? (" (" + j.errors + " error(s))") : ""); } } catch (e) { msg.style.color = "#f88"; msg.textContent = "\u2717 " + ((e && e.message) || "send failed"); } };
                  sendFileB.onclick = () => doSend("file"); sendDirB.onclick = () => doSend("folder");
              } },
        ] },
        { id: "avatarGaugeToggles", label: "Avatar Gauges", icon: "📟", controls: [
            { id: "gaugeHunger", label: "Show Hunger gauge", hint: "Show/hide the Hunger gauge on the KPop Listener avatar panel.", type: "toggle",
              get: () => _pipGaugeMask()[0] === "1", set: (v) => _pipGaugeSetBit(0, v) },
            { id: "gaugeHappy", label: "Show Happy gauge", hint: "Show/hide the Happy gauge on the KPop Listener avatar panel.", type: "toggle",
              get: () => _pipGaugeMask()[1] === "1", set: (v) => _pipGaugeSetBit(1, v) },
            { id: "gaugeEnergy", label: "Show Energy gauge", hint: "Show/hide the Energy gauge on the KPop Listener avatar panel.", type: "toggle",
              get: () => _pipGaugeMask()[2] === "1", set: (v) => _pipGaugeSetBit(2, v) },
            // v1621 — KPop Listener window minimize is now opt-in (default = a normal visible window).
            { id: "kpopMinimize", type: "custom",
              render: (box) => {
                  Object.assign(box.style, { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px", padding: "6px 0" });
                  const cb = document.createElement("input"); cb.type = "checkbox"; cb.style.width = "auto";
                  const lab = document.createElement("label"); lab.textContent = "Start KPop Listener window minimized"; lab.style.cursor = "pointer"; lab.onclick = () => cb.click();
                  const hint = document.createElement("div"); hint.style.cssText = "font-size:11px;color:#6f7d8c;flex-basis:100%;"; hint.textContent = "Off (default) = the listener opens as a normal, visible window. On = it starts minimized to the taskbar. Takes effect on the next launch.";
                  box.appendChild(cb); box.appendChild(lab); box.appendChild(hint);
                  fetch("/kpop/minimize", { cache: "no-store" }).then(r => r.json()).then(j => { cb.checked = !!(j && j.on); }).catch(() => {});
                  cb.addEventListener("change", () => { fetch("/kpop/minimize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: cb.checked }) }).catch(() => {}); });
              } },
        ] },
        { id: "ai", label: "LLM / AI Models", icon: "🧠", controls: [
            { id: "aiModelsHub", type: "custom", label: "Pipeline & models",
              render: (box) => {
                  // v1534 — single 3-view switcher (Detected AI | Install Status |
                  // Install AI). Replaces the 3 stacked controls; the Install panel was
                  // floating top-right because installPanel.root is position:fixed --
                  // renderInstall() neutralizes that so it flows INLINE in this tab.
                  box.innerHTML = "";
                  const tabsRow = document.createElement("div");
                  Object.assign(tabsRow.style, { display: "flex", gap: "4px", marginBottom: "10px", borderBottom: "1px solid #2a3340" });
                  const body = document.createElement("div");
                  box.appendChild(tabsRow); box.appendChild(body);
                  const TABS = [ { key: "detected", label: "Detected AI" }, { key: "status", label: "Install Status" }, { key: "install", label: "Install AI" } ];
                  const btns = {}; let active = "detected";
                  for (const t of TABS) {
                      const b = document.createElement("button"); b.textContent = t.label;
                      Object.assign(b.style, { padding: "6px 12px", background: "transparent", color: "#9ab", border: "none", borderBottom: "2px solid transparent", cursor: "pointer", fontSize: "12.5px", fontWeight: "600" });
                      b.addEventListener("click", () => show(t.key)); btns[t.key] = b; tabsRow.appendChild(b);
                  }
                  const paintTabs = () => { for (const t of TABS) { const on = t.key === active; btns[t.key].style.color = on ? "#fff" : "#9ab"; btns[t.key].style.borderBottomColor = on ? "#4af" : "transparent"; } };

                  function renderDetected(host) {
                      const am = (typeof window !== "undefined") ? window.aiModels : null;
                      const sub = document.createElement("div");
                      sub.textContent = "On by default. Unchecking e.g. Trellis 2 means the pipeline won't even try running it.";
                      Object.assign(sub.style, { fontSize: "11px", color: "#9aa", marginBottom: "8px" });
                      host.appendChild(sub);
                      if (!am) { const e = document.createElement("div"); e.textContent = "(AI model registry not ready yet)"; e.style.color = "#9aa"; host.appendChild(e); return; }
                      const list = document.createElement("div"); list.textContent = "Not scanned yet \u2014 click below to detect available models."; Object.assign(list.style, { fontSize: "12px", color: "#9aa" }); host.appendChild(list);
                      const refresh = document.createElement("button"); refresh.textContent = "\uD83D\uDD0D Click to Detect";
                      Object.assign(refresh.style, { marginTop: "8px", background: "#234", color: "#cde", border: "1px solid #456", borderRadius: "5px", padding: "4px 10px", cursor: "pointer", fontSize: "12px" }); host.appendChild(refresh);
                      const draw = async () => {
                          list.textContent = "Detecting\u2026"; let models = []; try { models = await am.detect(); } catch {}
                          list.innerHTML = "";
                          if (!models.length) { list.textContent = "No models detected (services offline?)."; return; }
                          const groups = {}; for (const m of models) (groups[m.group] = groups[m.group] || []).push(m);
                          for (const [g, arr] of Object.entries(groups)) {
                              const gh = document.createElement("div"); gh.textContent = g; Object.assign(gh.style, { fontSize: "11px", color: "#7af", textTransform: "uppercase", letterSpacing: "0.05em", margin: "8px 0 3px" }); list.appendChild(gh);
                              for (const m of arr) {
                                  const row = document.createElement("label"); Object.assign(row.style, { display: "flex", alignItems: "center", gap: "8px", padding: "3px 0", cursor: "pointer", fontSize: "12.5px" });
                                  const chk = document.createElement("input"); chk.type = "checkbox"; chk.checked = am.isEnabled(m.key); chk.style.accentColor = "#4af"; chk.style.cursor = "pointer"; chk.addEventListener("change", () => am.setEnabled(m.key, chk.checked));
                                  const name = document.createElement("span"); name.textContent = m.label + (m.present === false ? "  (offline)" : "") + (m.gated ? "" : "  \u00b7listed"); if (m.present === false) name.style.color = "#888";
                                  row.appendChild(chk); row.appendChild(name); list.appendChild(row);
                              }
                          }
                      };
                      refresh.addEventListener("click", () => { refresh.textContent = "\u21bb Re-detect"; draw(); });
                  }
                  function renderStatus(host) {
                      const op = (typeof window !== "undefined") ? window._ollamaPanel : null;
                      if (op && op._statusView) { op._statusView.style.display = "block"; host.appendChild(op._statusView); try { op._refresh?.(); op._startStatsPoll?.(); } catch {} }
                      else { const e = document.createElement("div"); e.textContent = "(AI status panel not ready yet \u2014 reload if this persists)"; e.style.color = "#9aa"; host.appendChild(e); }
                  }
                  function renderInstall(host) {
                      const ip = (typeof window !== "undefined") ? window.installPanel : null;
                      if (ip && ip.root) {
                          Object.assign(ip.root.style, { position: "static", top: "auto", right: "auto", width: "100%", maxHeight: "none", boxShadow: "none", zIndex: "auto", border: "none", padding: "0", display: "block" });
                          host.appendChild(ip.root); try { ip.show?.(); ip.root.style.display = "block"; } catch {}
                      } else { const e = document.createElement("div"); e.textContent = "(Install panel not ready yet \u2014 reload if this persists)"; e.style.color = "#9aa"; host.appendChild(e); }
                  }
                  function show(key) { active = key; paintTabs(); body.innerHTML = ""; if (key === "detected") renderDetected(body); else if (key === "status") renderStatus(body); else renderInstall(body); }
                  show("detected");
              } },
            { id: "diffuser", label: "Auto-start image diffuser", hint: "Stable-Diffusion at boot. Turn OFF to reduce stutter. Needs reload.", type: "toggle", reload: true,
              get: () => ctx.flags?.get("voxelengine.diffuserAutoStart") !== "0",
              set: (v) => ctx.flags?.set("voxelengine.diffuserAutoStart", v ? "1" : "0") },
            { id: "comfyui", label: "Auto-start ComfyUI", hint: "ComfyUI (image-to-3D) at boot. Needs reload.", type: "toggle", reload: true,
              get: () => ctx.flags?.get("voxelengine.comfyuiAutoStart") !== "0",
              set: (v) => ctx.flags?.set("voxelengine.comfyuiAutoStart", v ? "1" : "0") },
            { id: "llmDialect", label: "Local LLM backend", type: "select",
              hint: "Ollama = native /api/*. LlamaStash = OpenAI-compatible /v1/* (also LM Studio / raw llama-server). Both default to :11434 — only the protocol changes.",
              options: ["ollama", "llamastash"],
              get: () => {
                  const o = (typeof window !== "undefined") ? window._ollama : null;
                  const d = o?.getDialect?.() ?? (ctx.flags?.get("voxelengine.llmDialect") || "ollama");
                  return d === "openai" ? "llamastash" : "ollama";
              },
              set: (v) => {
                  const d = v === "llamastash" ? "openai" : "ollama";
                  const o = (typeof window !== "undefined") ? window._ollama : null;
                  if (o?.setDialect) o.setDialect(d); else ctx.flags?.set("voxelengine.llmDialect", d);
              } },
            { id: "updates", type: "custom", label: "Tool & model updates",
              render: (box) => {
                  const up = (typeof window !== "undefined") ? window.updates : null;
                  const title = document.createElement("div");
                  title.textContent = "Tool & model updates";
                  Object.assign(title.style, { fontSize: "13px", fontWeight: "600", marginBottom: "2px" });
                  const sub = document.createElement("div");
                  Object.assign(sub.style, { fontSize: "11px", color: "#9aa", marginBottom: "8px" });
                  box.appendChild(title); box.appendChild(sub);
                  const list = document.createElement("div");
                  Object.assign(list.style, { fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px" });
                  box.appendChild(list);
                  const btn = document.createElement("button");
                  btn.textContent = "↻ Check now";
                  Object.assign(btn.style, { marginTop: "8px", background: "#234", color: "#cde", border: "1px solid #456", borderRadius: "5px", padding: "4px 10px", cursor: "pointer", fontSize: "12px" });
                  box.appendChild(btn);
                  const draw = () => {
                      if (!up) { list.textContent = "(update checker not ready — is the bridge running?)"; sub.textContent = ""; return; }
                      const items = up.get() || [];
                      const last = up.lastChecked();
                      sub.textContent = last ? ("Last checked " + new Date(last).toLocaleString() + " · manual only \u2014 tap Check now to refresh") : "Not checked yet \u2014 tap Check now (manual; no automatic checks).";
                      list.innerHTML = "";
                      if (!items.length) { list.textContent = "No data yet — tap Check now."; return; }
                      const avail = items.filter(x => x.updateAvailable).length;
                      const head = document.createElement("div");
                      head.textContent = avail ? (avail + " update" + (avail > 1 ? "s" : "") + " available") : "Everything up to date";
                      Object.assign(head.style, { color: avail ? "#ffd060" : "#7bd88f", fontWeight: "600", marginBottom: "4px" });
                      list.appendChild(head);
                      for (const it of items) {
                          const row = document.createElement("div");
                          Object.assign(row.style, { display: "flex", alignItems: "center", gap: "6px" });
                          const dot = document.createElement("span");
                          dot.textContent = it.error ? "⚠" : it.updateAvailable ? "🔸" : "✓";
                          const name = document.createElement("span"); name.style.flex = "1";
                          name.textContent = it.error
                              ? (it.name + " — check failed")
                              : (it.name + "  " + (it.baseline ? (it.baseline + " → ") : "") + (it.latest || "?"));
                          if (it.updateAvailable) name.style.color = "#ffd060";
                          else if (it.error) name.style.color = "#c88";
                          row.appendChild(dot); row.appendChild(name);
                          if (it.url) { const a = document.createElement("a"); a.href = it.url; a.target = "_blank"; a.textContent = "↗"; a.style.color = "#7af"; a.style.textDecoration = "none"; row.appendChild(a); }
                          list.appendChild(row);
                      }
                  };
                  btn.addEventListener("click", async () => { btn.textContent = "↻ Checking…"; btn.disabled = true; try { await up?.check(true); } finally { btn.textContent = "↻ Check now"; btn.disabled = false; draw(); } });
                  draw();
              } },
            _credentialControl({
                id: "kaggleCreds",
                label: "Kaggle credentials",
                hint: "Username + API key from kaggle.com/settings → Create New API Token. Stored via the bridge for GPU jobs. Fields stay put — no pop-up to lose when you tab back to copy the key.",
                fields: [
                    { key: "username", label: "Username", type: "text", placeholder: "your kaggle username" },
                    { key: "key", label: "API key", type: "password", placeholder: "from the kaggle.json you downloaded" },
                ],
                onSave: async (v) => {
                    const resp = await fetch("/kaggle/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: v.username, key: v.key }) });
                    const r = await resp.json().catch(() => null);
                    return r?.ok ? { ok: true, message: "Saved ✓ — open the KAGGLE panel to submit GPU jobs." } : { ok: false, error: r?.error || "bridge unreachable" };
                },
                loadStatus: async () => {
                    try {
                        const resp = await fetch("/kaggle/status"); const s = await resp.json();
                        return {
                            prefill: s.configured ? { username: s.username } : {},
                            ok: !!s.authOk,
                            note: s.configured ? (s.authOk ? ("✓ auth ok (" + (s.username || "") + ")") : ("saved, but auth ✗: " + (s.authError || "unknown"))) : "not configured yet",
                        };
                    } catch { return null; }
                },
            }),
        ]},
        // v710 — Discord webhook integration. Toasts mirror to a Discord
        // channel via webhook. The KPopListener side reads the webhook
        // from KPopDiscord.psm1 imports + Credentials.bas entry. This
        // panel writes that entry through a bridge endpoint, so the user
        // never has to edit files by hand.
        { id: "discord", label: "Connectors", icon: "🔌", controls: [
            { id: "agentReach", type: "custom", label: "\uD83D\uDC41\uFE0F Reach the web (Agent-Reach)",
              render: (box) => {
                  box.style.cssText = "display:flex;flex-direction:column;gap:6px;";
                  const hint = document.createElement("div"); hint.style.cssText = "font-size:11px;color:#8b97a8;line-height:1.5;"; hint.innerHTML = "Let the engine's AI search/read the web (<a href=\"https://github.com/Panniantong/Agent-Reach\" target=\"_blank\" rel=\"noopener\" style=\"color:#9bd6ff\">Agent-Reach</a>). No-login channels (web / reddit / github / youtube) work right now; the rest need <i>agent-reach install</i> + per-channel login (see Doctor).";
                  const statRow = document.createElement("div"); statRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;";
                  const stat = document.createElement("div"); stat.style.cssText = "font-size:11px;color:#8b97a8;flex:1;min-width:120px;"; stat.textContent = "checking\u2026";
                  const inst = document.createElement("button"); inst.textContent = "Install CLI"; inst.style.cssText = "padding:5px 10px;background:#3a3a5a;color:#cfe;border:1px solid #5a5a8a;border-radius:6px;cursor:pointer;font-size:11px;";
                  const doc = document.createElement("button"); doc.textContent = "Doctor"; doc.style.cssText = "padding:5px 10px;background:#2a3a5a;color:#cfe;border:1px solid #4a5a8a;border-radius:6px;cursor:pointer;font-size:11px;"; statRow.append(stat, inst, doc);
                  const row = document.createElement("div"); row.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;align-items:center;";
                  const chan = document.createElement("select"); chan.style.cssText = "background:#0c1822;color:#cfe7f5;border:1px solid #2a3340;border-radius:6px;padding:5px 6px;font-size:11px;"; ["web", "reddit", "github", "youtube"].forEach(c => { const o = document.createElement("option"); o.value = c; o.textContent = c; chan.appendChild(o); });
                  const q = document.createElement("input"); q.placeholder = "query (or URL for web/youtube)\u2026"; q.style.cssText = "flex:1;min-width:140px;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  const go = document.createElement("button"); go.textContent = "Go"; go.style.cssText = "padding:6px 12px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;border-radius:6px;cursor:pointer;font-size:12px;"; row.append(chan, q, go);
                  const docOut = document.createElement("pre"); docOut.style.cssText = "white-space:pre-wrap;font:11px ui-monospace,monospace;color:#9fb;background:#0a0e14;border:1px solid #2a3340;border-radius:6px;padding:8px;max-height:140px;overflow:auto;display:none;margin:0;";
                  const res = document.createElement("div"); res.style.cssText = "display:flex;flex-direction:column;gap:4px;font-size:11px;color:#cde;max-height:220px;overflow:auto;";
                  box.append(hint, statRow, row, docOut, res);
                  const refresh = () => fetch("/agentreach/status").then(r => r.json()).then(s => { stat.innerHTML = (s && s.installed) ? "<span style='color:#9fe88f'>\u2713 agent-reach installed</span>" : "<span style='color:#caa05a'>CLI not installed (no-login channels still work)</span>"; }).catch(() => { stat.textContent = "(bridge offline)"; });
                  refresh();
                  inst.addEventListener("click", async () => { inst.disabled = true; stat.textContent = "installing CLI\u2026"; const j = await fetch("/agentreach/install", { method: "POST" }).then(r => r.json()).catch(e => ({ ok: false, error: e.message })); inst.disabled = false; stat.innerHTML = (j && j.ok) ? "<span style='color:#9fe88f'>\u2713 CLI installed</span>" : ("<span style='color:#f88'>\u2717 " + (((j && j.error) || "failed") + "").slice(0, 100) + "</span>"); refresh(); });
                  doc.addEventListener("click", async () => { doc.disabled = true; docOut.style.display = "block"; docOut.textContent = "running doctor\u2026"; const j = await fetch("/agentreach/status").then(r => r.json()).catch(e => ({ raw: "error: " + e.message })); doc.disabled = false; docOut.textContent = (j && j.raw) || "(no doctor output \u2014 CLI not installed)"; });
                  go.addEventListener("click", async () => { const query = q.value.trim(); if (!query) { stat.textContent = "enter a query"; return; } go.disabled = true; res.innerHTML = "<span style='color:#8b97a8'>reaching\u2026</span>"; const j = await fetch("/agentreach/reach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: chan.value, query }) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message })); go.disabled = false; res.innerHTML = ""; if (!j || !j.ok) { res.innerHTML = "<span style='color:#f88'>\u2717 " + (((j && j.error) || "failed") + "").slice(0, 160) + "</span>"; return; } if (j.markdown != null) { const ta = document.createElement("textarea"); ta.readOnly = true; ta.value = j.markdown; ta.style.cssText = "width:100%;min-height:140px;background:#0a0e14;color:#cde;border:1px solid #2a3340;border-radius:6px;padding:8px;font:11px ui-monospace,monospace;"; res.appendChild(ta); } else if (j.results) { j.results.forEach(it => { const a = document.createElement("a"); a.href = it.url; a.target = "_blank"; a.rel = "noopener"; a.style.cssText = "color:#9bd6ff;text-decoration:none;padding:4px 6px;border:1px solid #1d2733;border-radius:6px;display:block;"; a.innerHTML = "<b>" + (it.title || it.url) + "</b>" + (it.stars != null ? (" <span style='color:#caa05a'>\u2605" + it.stars + "</span>") : "") + (it.subreddit ? (" <span style='color:#8b97a8'>" + it.subreddit + "</span>") : "") + (it.desc || it.markdown ? ("<br><span style='color:#8b97a8'>" + ((it.desc || it.markdown) + "").slice(0, 120) + "</span>") : ""); res.appendChild(a); }); } else if (j.title) { const d = document.createElement("div"); d.innerHTML = "<b>" + j.title + "</b> <span style='color:#8b97a8'>" + (j.uploader || "") + "</span><br><span style='color:#8b97a8'>" + ((j.description || "") + "").slice(0, 240) + "</span>"; res.appendChild(d); } });
              } },
            { id: "codegraph", type: "custom", label: "\uD83D\uDD78\uFE0F Code graph (CodeGraph)",
              render: (box) => {
                  box.style.cssText = "display:flex;flex-direction:column;gap:6px;";
                  const sb = "padding:5px 10px;background:#2a3a5a;color:#cfe;border:1px solid #4a5a8a;border-radius:6px;cursor:pointer;font-size:11px;";
                  const inp = "flex:1;min-width:120px;padding:5px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  box.innerHTML = "<div style='font-size:11px;color:#8b97a8;line-height:1.5;'>Build a local code knowledge-graph for a repo with <a href='https://github.com/colbymchenry/codegraph' target='_blank' rel='noopener' style='color:#9bd6ff'>CodeGraph</a> (for AI coding agents), then render it here. The graph is read best-effort from the project's <code>.codegraph/</code> SQLite \u2014 schema isn't documented, so node/edge detection is heuristic.</div>";
                  const r1 = document.createElement("div"); r1.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;";
                  const stat = document.createElement("div"); stat.style.cssText = "font-size:11px;color:#8b97a8;flex:1;min-width:120px;"; stat.textContent = "checking\u2026";
                  const inst = document.createElement("button"); inst.textContent = "Install"; inst.style.cssText = sb; r1.append(stat, inst);
                  const r2 = document.createElement("div"); r2.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;";
                  const proj = document.createElement("input"); proj.placeholder = "project folder to index\u2026"; proj.style.cssText = inp;
                  const brw = document.createElement("button"); brw.textContent = "\uD83D\uDCC1"; brw.style.cssText = sb; brw.title = "Browse";
                  const bld = document.createElement("button"); bld.textContent = "Build graph"; bld.style.cssText = sb; bld.title = "codegraph init (can take a while on big repos)";
                  const ld = document.createElement("button"); ld.textContent = "Load graph"; ld.style.cssText = sb;
                  r2.append(proj, brw, bld, ld);
                  const out = document.createElement("div"); out.style.cssText = "font-size:11px;color:#9aa;min-height:14px;";
                  const viz = document.createElement("div"); viz.style.cssText = "display:flex;flex-direction:column;gap:4px;";
                  box.append(r1, r2, out, viz);
                  const api = (p, o) => fetch(p, o).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
                  (async () => { const c = await api("/codegraph/config"); if (c && c.project) proj.value = c.project; })();
                  const refresh = () => api("/codegraph/status?project=" + encodeURIComponent(proj.value.trim())).then(s => { stat.innerHTML = !s ? "(offline)" : (s.installed ? ("<span style='color:#9fe88f'>\u2713 installed</span>" + (s.hasGraph ? " \u00b7 graph built" : " \u00b7 no graph yet")) : "<span style='color:#caa05a'>not installed</span>"); });
                  refresh();
                  brw.onclick = async () => { try { const p = await window.pickServerPath({ mode: "folder", title: "Pick a repo to index", start: proj.value.trim() }); if (p) { proj.value = p; api("/codegraph/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: p }) }); refresh(); } } catch {} };
                  proj.onchange = () => { api("/codegraph/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: proj.value.trim() }) }); refresh(); };
                  inst.onclick = async () => { inst.disabled = true; out.textContent = "installing CodeGraph (npm)\u2026"; const j = await api("/codegraph/install", { method: "POST" }); inst.disabled = false; out.textContent = j && j.ok ? "\u2713 installed" : ("\u2717 " + (((j && j.error) || "failed") + "").slice(0, 120)); refresh(); };
                  bld.onclick = async () => { if (!proj.value.trim()) { out.textContent = "pick a project folder first"; return; } bld.disabled = true; out.textContent = "building graph (codegraph init)\u2026 this can take a while"; const j = await api("/codegraph/init", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: proj.value.trim() }) }); bld.disabled = false; out.textContent = j && (j.ok || j.built) ? ("\u2713 graph built" + (j.graphDb ? " \u2192 " + j.graphDb : "")) : ("\u2717 " + (((j && j.error) || "failed") + "").slice(0, 140)); refresh(); };
                  const renderGraph = (data) => {
                      viz.innerHTML = "";
                      const nodes = data.nodes || [], edges = data.edges || [];
                      if (!nodes.length) { const ta = document.createElement("textarea"); ta.readOnly = true; ta.style.cssText = "width:100%;min-height:90px;background:#0a0e14;color:#cde;border:1px solid #2a3340;border-radius:6px;padding:6px;font:10px ui-monospace,monospace;"; ta.value = "No nodes extracted. " + (data.note || "") + "\nTables found:\n" + (data.tables || []).map(t => "  " + t.name + " (" + t.rows + " rows): " + t.columns.join(", ")).join("\n"); viz.appendChild(ta); return; }
                      const idx = new Map(); nodes.forEach((n, i) => idx.set(n.id, i));
                      const deg = new Array(nodes.length).fill(0); const Ed = [];
                      for (const e of edges) { const a = idx.get(e.from), b = idx.get(e.to); if (a == null || b == null || a === b) continue; deg[a]++; deg[b]++; Ed.push([a, b]); }
                      const N = Math.min(nodes.length, 250);
                      const order = nodes.map((_, i) => i).sort((x, y) => deg[y] - deg[x]).slice(0, N);
                      const keep = new Set(order); const remap = new Map(); order.forEach((oi, ni) => remap.set(oi, ni));
                      const vN = order.map(oi => nodes[oi]); const vE = Ed.filter(([a, b]) => keep.has(a) && keep.has(b)).map(([a, b]) => [remap.get(a), remap.get(b)]);
                      const W = 560, H = 360; const pos = vN.map((_, i) => ({ x: W / 2 + Math.cos(i / vN.length * 6.283) * 120 + (Math.random() - .5) * 20, y: H / 2 + Math.sin(i / vN.length * 6.283) * 120 + (Math.random() - .5) * 20, vx: 0, vy: 0 }));
                      const k = Math.sqrt((W * H) / Math.max(1, vN.length)) * 0.6;
                      for (let it = 0; it < 140; it++) {
                          const t = 1 - it / 140;
                          for (let i = 0; i < pos.length; i++) { let fx = 0, fy = 0; for (let j = 0; j < pos.length; j++) { if (i === j) continue; let dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y; let d = Math.hypot(dx, dy) || .01; const rep = k * k / d; fx += dx / d * rep; fy += dy / d * rep; } pos[i].vx = fx; pos[i].vy = fy; }
                          for (const [a, b] of vE) { let dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y; let d = Math.hypot(dx, dy) || .01; const att = d * d / k; const ux = dx / d * att, uy = dy / d * att; pos[a].vx -= ux; pos[a].vy -= uy; pos[b].vx += ux; pos[b].vy += uy; }
                          for (let i = 0; i < pos.length; i++) { let d = Math.hypot(pos[i].vx, pos[i].vy) || .01; const md = Math.min(d, 12 * t + 1); pos[i].x += pos[i].vx / d * md; pos[i].y += pos[i].vy / d * md; pos[i].x = Math.max(8, Math.min(W - 8, pos[i].x)); pos[i].y = Math.max(8, Math.min(H - 8, pos[i].y)); }
                      }
                      const cv = document.createElement("canvas"); cv.width = W; cv.height = H; cv.style.cssText = "width:100%;background:#06090f;border:1px solid #1d2733;border-radius:6px;";
                      const g = cv.getContext("2d");
                      g.strokeStyle = "rgba(120,150,200,0.18)"; g.lineWidth = 1;
                      for (const [a, b] of vE) { g.beginPath(); g.moveTo(pos[a].x, pos[a].y); g.lineTo(pos[b].x, pos[b].y); g.stroke(); }
                      const col = (kk) => ({ function: "#7fd0ff", class: "#ffd27f", method: "#9fe88f", variable: "#caa0ff", interface: "#ff9fbf" }[(kk || "").toLowerCase()] || "#8fb0d8");
                      for (let i = 0; i < vN.length; i++) { const rr = 3 + Math.min(6, (deg[order[i]] || 0) * 0.4); g.fillStyle = col(vN[i].kind); g.beginPath(); g.arc(pos[i].x, pos[i].y, rr, 0, 6.283); g.fill(); }
                      g.fillStyle = "#cfe"; g.font = "9px ui-monospace,monospace";
                      const lab = vN.map((n, i) => [i, deg[order[i]] || 0]).sort((a, b) => b[1] - a[1]).slice(0, 24);
                      for (const pair of lab) { const i = pair[0]; g.fillText((vN[i].name || "").slice(0, 18), pos[i].x + 5, pos[i].y + 3); }
                      viz.appendChild(cv);
                      const cap = document.createElement("div"); cap.style.cssText = "font-size:10px;color:#8b97a8;"; cap.textContent = "\u25CF " + nodes.length + " nodes / " + edges.length + " edges (showing top " + vN.length + " by connections) \u00b7 tables: " + (data.tables || []).map(t => t.name).join(", "); viz.appendChild(cap);
                  };
                  ld.onclick = async () => { if (!proj.value.trim()) { out.textContent = "pick a project folder first"; return; } ld.disabled = true; out.textContent = "reading graph\u2026"; const j = await api("/codegraph/graph?project=" + encodeURIComponent(proj.value.trim())); ld.disabled = false; if (!j || !j.ok) { out.textContent = "\u2717 " + (((j && j.error) || "failed") + "").slice(0, 140); return; } out.textContent = j.note && j.note !== "ok" ? ("\u26A0 " + j.note) : "\u2713 loaded"; renderGraph(j); };
              } },
            { id: "devBrowser", type: "custom", label: "\uD83C\uDF10 Browser automation (Dev-Browser)",
              render: (box) => {
                  box.style.cssText = "display:flex;flex-direction:column;gap:6px;";
                  const sb = "padding:5px 10px;background:#2a3a5a;color:#cfe;border:1px solid #4a5a8a;border-radius:6px;cursor:pointer;font-size:11px;";
                  box.innerHTML = "<div style='font-size:11px;color:#8b97a8;line-height:1.5;'>Drive a real browser with sandboxed scripts via <a href='https://github.com/SawyerHood/dev-browser' target='_blank' rel='noopener' style='color:#9bd6ff'>Dev-Browser</a> (Playwright). <b>headless</b> launches its own Chromium; <b>connect</b> drives your logged-in Chrome (needs the extension + chrome://inspect). A script gets a <code>browser</code> global; <code>console.log</code> output shows below.</div>";
                  const r1 = document.createElement("div"); r1.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;";
                  const stat = document.createElement("div"); stat.style.cssText = "font-size:11px;color:#8b97a8;flex:1;min-width:120px;"; stat.textContent = "checking\u2026";
                  const inst = document.createElement("button"); inst.textContent = "Install + Chromium"; inst.style.cssText = sb;
                  const mode = document.createElement("select"); mode.style.cssText = "background:#0c1822;color:#cfe7f5;border:1px solid #2a3340;border-radius:6px;padding:5px 6px;font-size:11px;"; [["headless", "headless"], ["connect", "your Chrome"]].forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; mode.appendChild(o); });
                  r1.append(stat, mode, inst);
                  const scr = document.createElement("textarea"); scr.style.cssText = "width:100%;min-height:90px;background:#0a0e14;color:#cde;border:1px solid #2a3340;border-radius:6px;padding:6px;font:11px ui-monospace,monospace;";
                  scr.value = "const page = await browser.getPage(\"main\");\nawait page.goto(\"https://example.com\");\nconsole.log(await page.title());";
                  const run = document.createElement("button"); run.textContent = "\u25B6 Run script"; run.style.cssText = "padding:6px 12px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;border-radius:6px;cursor:pointer;font-size:12px;align-self:flex-start;";
                  const res = document.createElement("pre"); res.style.cssText = "white-space:pre-wrap;font:11px ui-monospace,monospace;color:#9fb;background:#0a0e14;border:1px solid #2a3340;border-radius:6px;padding:8px;max-height:180px;overflow:auto;display:none;margin:0;";
                  box.append(r1, scr, run, res);
                  const api = (p, o) => fetch(p, o).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
                  const refresh = () => api("/devbrowser/status").then(s => { stat.innerHTML = !s ? "(offline)" : (s.installed ? ("<span style='color:#9fe88f'>\u2713 installed " + (s.version || "") + "</span>") : "<span style='color:#caa05a'>not installed</span>"); });
                  refresh();
                  inst.onclick = async () => { inst.disabled = true; res.style.display = "block"; res.textContent = "installing dev-browser + Chromium\u2026 (large, please wait)"; const j = await api("/devbrowser/install", { method: "POST" }); inst.disabled = false; res.textContent = j && j.ok ? ("\u2713 installed \u00b7 Chromium: " + (j.chromium || "?")) : ("\u2717 " + (((j && j.error) || "failed") + "").slice(0, 200)); refresh(); };
                  run.onclick = async () => { if (!scr.value.trim()) { return; } run.disabled = true; res.style.display = "block"; res.textContent = "running\u2026"; const j = await api("/devbrowser/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ script: scr.value, mode: mode.value }) }); run.disabled = false; if (!j) { res.textContent = "(offline)"; return; } res.textContent = (j.ok ? "" : "\u2717 exit " + (j.code != null ? j.code : "?") + "\n") + (j.stdout || "") + (j.stderr ? ("\n--- stderr ---\n" + j.stderr) : "") + (j.error ? ("\u2717 " + j.error) : ""); };
              } },
            { id: "humanizer", type: "custom", label: "\u270D\uFE0F Humanize text (de-AI)",
              render: (box) => {
                  box.style.cssText = "display:flex;flex-direction:column;gap:6px;";
                  const sb = "padding:5px 10px;background:#2a3a5a;color:#cfe;border:1px solid #4a5a8a;border-radius:6px;cursor:pointer;font-size:11px;";
                  box.innerHTML = "<div style='font-size:11px;color:#8b97a8;line-height:1.5;'>Rewrite AI-sounding text to read naturally, using <a href='https://github.com/blader/humanizer' target='_blank' rel='noopener' style='color:#9bd6ff'>blader/humanizer</a>'s guidance run through this engine's own LLM (the Ollama <i>LLM host</i> from Network settings). Install also clones the skill for your coding agents.</div>";
                  const r1 = document.createElement("div"); r1.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;";
                  const stat = document.createElement("div"); stat.style.cssText = "font-size:11px;color:#8b97a8;flex:1;min-width:120px;"; stat.textContent = "checking\u2026";
                  const inst = document.createElement("button"); inst.textContent = "Install skill"; inst.style.cssText = sb; r1.append(stat, inst);
                  const tone = document.createElement("input"); tone.placeholder = "tone (optional): casual / professional\u2026"; tone.style.cssText = "width:100%;padding:5px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  const txt = document.createElement("textarea"); txt.placeholder = "paste AI-generated text to humanize\u2026"; txt.style.cssText = "width:100%;min-height:90px;background:#0a0e14;color:#cde;border:1px solid #2a3340;border-radius:6px;padding:6px;font:12px system-ui,sans-serif;";
                  const go = document.createElement("button"); go.textContent = "\u2728 Humanize"; go.style.cssText = "padding:6px 12px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;border-radius:6px;cursor:pointer;font-size:12px;align-self:flex-start;";
                  const outRow = document.createElement("div"); outRow.style.cssText = "display:flex;gap:6px;align-items:center;"; const msg = document.createElement("div"); msg.style.cssText = "font-size:11px;color:#9aa;flex:1;"; const cp = document.createElement("button"); cp.textContent = "Copy"; cp.style.cssText = sb; cp.style.display = "none"; outRow.append(msg, cp);
                  const res = document.createElement("textarea"); res.readOnly = true; res.style.cssText = "width:100%;min-height:90px;background:#0a0e14;color:#cfe;border:1px solid #2a3340;border-radius:6px;padding:6px;font:12px system-ui,sans-serif;display:none;";
                  box.append(r1, tone, txt, go, outRow, res);
                  const api = (p, o) => fetch(p, o).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
                  const refresh = () => api("/humanizer/status").then(s => { if (!s) { stat.textContent = "(offline)"; return; } const sk = s.installed ? "\u2713 skill" : "skill not cloned (a built-in guide is used)"; const ll = (s.llm && s.llm.reachable) ? ("\u00b7 LLM " + (s.llm.model || "ready")) : "\u00b7 <span style='color:#caa05a'>no LLM (set Ollama host)</span>"; stat.innerHTML = "<span style='color:" + (s.installed ? "#9fe88f" : "#8b97a8") + "'>" + sk + "</span> " + ll; });
                  refresh();
                  inst.onclick = async () => { inst.disabled = true; msg.textContent = "cloning humanizer skill\u2026"; const j = await api("/humanizer/install", { method: "POST" }); inst.disabled = false; msg.textContent = j && j.ok ? "\u2713 skill installed" : ("\u2717 " + (((j && j.error) || "failed") + "").slice(0, 120)); refresh(); };
                  go.onclick = async () => { if (!txt.value.trim()) { msg.textContent = "paste some text first"; return; } go.disabled = true; msg.textContent = "humanizing\u2026"; res.style.display = "none"; cp.style.display = "none"; const j = await api("/humanizer/humanize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: txt.value, tone: tone.value.trim() }) }); go.disabled = false; if (j && j.ok) { res.value = j.humanized; res.style.display = "block"; cp.style.display = ""; msg.textContent = "\u2713 rewritten via " + (j.model || "LLM") + (j.usedSkill ? " (skill)" : " (built-in guide)"); } else { msg.textContent = "\u2717 " + (((j && j.error) || "failed") + "").slice(0, 160); } };
                  cp.onclick = () => { try { navigator.clipboard.writeText(res.value); cp.textContent = "Copied"; setTimeout(() => cp.textContent = "Copy", 1200); } catch {} };
              } },
            { id: "peerAnnounce", type: "custom", label: "\uD83D\uDCE3 Peer announcements (avatar cameo)",
              render: (box) => {
                  box.style.cssText = "display:flex;flex-direction:column;gap:6px;";
                  const sb = "padding:5px 10px;background:#2a3a5a;color:#cfe;border:1px solid #4a5a8a;border-radius:6px;cursor:pointer;font-size:11px;";
                  box.innerHTML = "<div style='font-size:11px;color:#8b97a8;line-height:1.5;'>When this engine has something to say (e.g. low disk), it tells its peers \u2014 and on any peer that's watching an avatar scene, this engine's avatar steps in, waves, speaks and leaves (otherwise a toast/ticker). Needs saved/discovered peers.</div>";
                  const row = document.createElement("label"); row.style.cssText = "display:flex;align-items:center;gap:6px;font-size:12px;color:#bcd;cursor:pointer;";
                  const cb = document.createElement("input"); cb.type = "checkbox";
                  const gb = document.createElement("input"); gb.type = "number"; gb.min = "0.2"; gb.max = "100"; gb.step = "0.5"; gb.style.cssText = "width:56px;background:#0a0e14;color:#cde;border:1px solid #456;border-radius:5px;padding:3px 6px;font-size:12px;";
                  row.append(cb, document.createTextNode("Auto-announce low disk to peers, below"), gb, document.createTextNode("GB free"));
                  const r2 = document.createElement("div"); r2.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;";
                  const test = document.createElement("button"); test.textContent = "\u2728 Broadcast a test"; test.style.cssText = sb;
                  const kindSel = document.createElement("select"); kindSel.style.cssText = "background:#0c1822;color:#cfe7f5;border:1px solid #2a3340;border-radius:6px;padding:5px 6px;font-size:11px;"; [["info","info"],["disk","low disk"],["warn","warning"]].forEach(([v,t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; kindSel.appendChild(o); });
                  const out = document.createElement("div"); out.style.cssText = "font-size:11px;color:#9aa;flex:1;min-width:120px;";
                  r2.append(kindSel, test, out);
                  box.append(row, r2);
                  const api = (p, o) => fetch(p, o).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
                  const load = () => api("/announce/settings").then(s => { if (s) { cb.checked = s.autoDisk !== false; gb.value = s.diskGb != null ? s.diskGb : 2; } });
                  load();
                  const save = () => api("/announce/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoDisk: cb.checked, diskGb: parseFloat(gb.value) || 2 }) }).then(s => { if (s && s.ok) { cb.checked = s.autoDisk !== false; gb.value = s.diskGb; } });
                  cb.onchange = save; gb.onchange = save;
                  test.onclick = async () => { test.disabled = true; out.textContent = "broadcasting\u2026"; const txt = kindSel.value === "disk" ? "Heads up - I'm low on disk space. Asset sync to me may pause." : (kindSel.value === "warn" ? "Quick heads up from your peer engine." : "Hello from your peer engine - just saying hi!"); const j = await api("/announce/broadcast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: txt, kind: kindSel.value, gestures: ["wave", "speak", "jump"] }) }); test.disabled = false; out.textContent = (j && j.ok) ? ("\u2713 sent to " + (j.sent || 0) + "/" + (j.targets || 0) + " peer(s) \u00b7 watch an avatar scene") : ("\u2717 " + (((j && j.error) || "failed") + "").slice(0, 100)); };
              } },
            { id: "devicesHub", label: "🛰️ Connectors & devices hub", hint: "Open the hub: one launcher linking every connector & device panel — presence, air, lights, wall switchboard, doorbell, cameras, Alexa, Shield tools, automation. Shows HA-connected status. Good landing page for a wall phone too.", type: "button",
              action: () => { try { window.open("/hub.html", "_blank"); } catch { location.href = "/hub.html"; } } },
            { id: "setupLinks", type: "custom", label: "Get started \u2014 setup links",
              render(host) {
                  host.style.cssText = "display:flex; flex-direction:column; gap:3px; font-size:11px;";
                  const intro = document.createElement("div"); intro.style.cssText = "color:#7a8290; margin-bottom:3px;";
                  intro.textContent = "New machine? Every connector below is optional (free unless noted). Click to get the key or set it up, then fill it in \u2014 you don't need to know what any of these are first.";
                  host.appendChild(intro);
                  const links = [
                      ["\uD83D\uDCAC Discord \u2014 make a channel webhook", "https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks"],
                      ["\uD83D\uDFE3 Twitch \u2014 register an app (Client ID)", "https://dev.twitch.tv/console/apps/create"],
                      ["\uD83D\uDFE3 Twitch \u2014 generate a user token", "https://twitchtokengenerator.com/"],
                      ["\u2728 Gemini \u2014 free API key", "https://aistudio.google.com/apikey"],
                      ["\uD83D\uDCC8 FMP \u2014 free trader key", "https://site.financialmodelingprep.com/developer/docs"],
                      ["\uD83E\uDD16 Grok (xAI) key", "https://console.x.ai/"],
                      ["\uD83E\uDD16 OpenAI key", "https://platform.openai.com/api-keys"],
                      ["\uD83E\uDD16 Anthropic (Claude) key", "https://console.anthropic.com/settings/keys"],
                      ["\uD83D\uDCCA Google Sheets \u2014 service-account creds", "https://console.cloud.google.com/apis/credentials"],
                  ];
                  for (const pair of links) { const a = document.createElement("a"); a.href = pair[1]; a.target = "_blank"; a.rel = "noopener"; a.textContent = pair[0] + " \u25B8"; a.style.cssText = "color:#9bd6ff; text-decoration:none; padding:1px 0;"; host.appendChild(a); }
              },
            },
            { id: "discordWebhook", type: "custom", label: "Webhook URL",
              render(host, hub) {
                  // v886 — fixed: the hub calls render(box, hub); this used to
                  // name the params (ctx, host) and build into the 2nd arg (the
                  // hub object, not a DOM node), which threw and made the whole
                  // Discord tab render "(failed to render…)". host = the box now.
                  host.style.display = "flex";
                  host.style.flexDirection = "column";
                  host.style.gap = "6px";
                  const hint = document.createElement("div");
                  hint.style.cssText = "color:#7a8290; font-size:11px;";
                  hint.textContent = "Mirror toasts to a Discord channel. Get a webhook URL in your server: Settings → Integrations → Webhooks → New Webhook → Copy URL.";
                  host.appendChild(hint);
                  const inp = document.createElement("input");
                  inp.type = "password";
                  inp.placeholder = "https://discord.com/api/webhooks/…";
                  inp.style.cssText = "width:100%; padding:6px 8px; background:#0c0f14; color:#e8eef8; border:1px solid #2a3340; border-radius:6px; font:11px ui-monospace,monospace;";
                  host.appendChild(inp);
                  const row = document.createElement("div");
                  row.style.cssText = "display:flex; gap:6px; flex-wrap:wrap; align-items:center;";
                  const showBtn = document.createElement("button");
                  showBtn.textContent = "👁 show";
                  showBtn.style.cssText = "padding:4px 10px; background:#2a3340; color:#cde; border:1px solid #455; border-radius:5px; cursor:pointer; font-size:11px;";
                  showBtn.addEventListener("click", () => {
                      inp.type = inp.type === "password" ? "text" : "password";
                      showBtn.textContent = inp.type === "password" ? "👁 show" : "🙈 hide";
                  });
                  const saveBtn = document.createElement("button");
                  saveBtn.textContent = "💾 Save";
                  saveBtn.style.cssText = "padding:4px 12px; background:#2a4d3a; color:#cfe; border:1px solid #4a7d5a; border-radius:5px; cursor:pointer; font-size:11px;";
                  const testBtn = document.createElement("button");
                  testBtn.textContent = "📡 Test post";
                  testBtn.style.cssText = "padding:4px 12px; background:#3a4a6a; color:#cde; border:1px solid #5a6a8a; border-radius:5px; cursor:pointer; font-size:11px;";
                  const clearBtn = document.createElement("button");
                  clearBtn.textContent = "🗑";
                  clearBtn.title = "Remove webhook from Credentials.bas";
                  clearBtn.style.cssText = "padding:4px 8px; background:#4a2a2a; color:#fcc; border:1px solid #7a3a3a; border-radius:5px; cursor:pointer; font-size:11px;";
                  const status = document.createElement("span");
                  status.style.cssText = "font-size:11px; color:#8b97a8; flex:1;";
                  row.append(showBtn, saveBtn, testBtn, clearBtn, status);
                  host.appendChild(row);
                  // v1043 — once the webhook is confirmed, surface a clickable
                  // link to its Discord channel (the bridge resolves channel/guild
                  // from the webhook metadata).
                  const linkRow = document.createElement("div");
                  linkRow.style.cssText = "font-size:11px; margin-top:2px;";
                  host.appendChild(linkRow);
                  function showChannelLink(j) {
                      linkRow.innerHTML = "";
                      if (j && j.channelUrl) {
                          const a = document.createElement("a");
                          a.href = j.channelUrl; a.target = "_blank"; a.rel = "noopener";
                          a.textContent = "💬 Open " + (j.channelName ? ("#" + j.channelName) : "this webhook's channel") + " in Discord ▸";
                          a.style.cssText = "color:#9bd6ff; text-decoration:none;";
                          linkRow.appendChild(a);
                      }
                  }
                  const refreshChannelLink = () => fetch("/discord/config").then(r => r.json()).then(showChannelLink).catch(() => {});
                  // Reload status: ask bridge if a webhook is currently configured
                  fetch("/discord/config").then(r => r.json()).then(j => {
                      if (j?.ok && j.configured) {
                          status.textContent = "✓ configured (" + (j.preview || "saved") + ")";
                          status.style.color = "#9fe88f";
                          inp.placeholder = "[saved — type a new URL to replace]";
                          showChannelLink(j);
                      } else {
                          status.textContent = "no webhook saved";
                      }
                  }).catch(() => { status.textContent = "(bridge offline)"; });
                  saveBtn.addEventListener("click", async () => {
                      const url = inp.value.trim();
                      if (!url) { status.textContent = "type a URL first"; status.style.color = "#fb6"; return; }
                      if (!/^https:\/\/discord(app)?\.com\/api\/webhooks\//.test(url)) {
                          if (!confirm("That doesn't look like a Discord webhook URL. Save anyway?")) return;
                      }
                      status.textContent = "saving…"; status.style.color = "#8b97a8";
                      try {
                          const r = await fetch("/discord/config", {
                              method: "POST", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ webhookUrl: url }),
                          });
                          const j = await r.json();
                          if (j.ok) {
                              status.textContent = "✓ saved · restart Listener to pick up";
                              status.style.color = "#9fe88f";
                              inp.value = "";
                              refreshChannelLink();
                          } else {
                              status.textContent = "save failed: " + (j.error || "?");
                              status.style.color = "#f88";
                          }
                      } catch (e) { status.textContent = "save error: " + e.message; status.style.color = "#f88"; }
                  });
                  testBtn.addEventListener("click", async () => {
                      // Test uses the saved URL (or the typed one) — server picks
                      status.textContent = "posting…"; status.style.color = "#8b97a8";
                      try {
                          const r = await fetch("/discord/test", {
                              method: "POST", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ webhookUrl: inp.value.trim() || undefined }),
                          });
                          const j = await r.json();
                          if (j.ok) {
                              status.textContent = "✓ test posted · check your Discord";
                              status.style.color = "#9fe88f";
                          } else {
                              status.textContent = "test failed: " + (j.error || "?");
                              status.style.color = "#f88";
                          }
                      } catch (e) { status.textContent = "test error: " + e.message; status.style.color = "#f88"; }
                  });
                  clearBtn.addEventListener("click", async () => {
                      if (!confirm("Remove the Discord webhook from Credentials.bas?\n\nThe Listener will stop mirroring toasts to Discord after its next restart.")) return;
                      try {
                          const r = await fetch("/discord/config", { method: "DELETE" });
                          const j = await r.json();
                          if (j.ok) { status.textContent = "✓ removed"; status.style.color = "#fb6"; inp.value = ""; }
                      } catch (e) { status.textContent = "remove error: " + e.message; status.style.color = "#f88"; }
                  });
              },
            },
            { id: "twitchChat", type: "custom", label: "Twitch chat",
              render(host) {
                  host.style.cssText = "display:flex; flex-direction:column; gap:6px;";
                  const hint = document.createElement("div"); hint.style.cssText = "color:#7a8290; font-size:11px;";
                  hint.innerHTML = 'Connect a Twitch channel&#39;s chat (IRC). Get a chat oauth token (scopes chat:read + chat:edit) at <a href="https://twitchtokengenerator.com/" target="_blank" rel="noopener" style="color:#9bd6ff">twitchtokengenerator.com</a>. Viewers&#39; chat commands can then reach the engine.';
                  const ch = document.createElement("input"); ch.placeholder = "channel (e.g. yourname)"; ch.style.cssText = "width:100%;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  const nk = document.createElement("input"); nk.placeholder = "bot nick (usually your channel name)"; nk.style.cssText = "width:100%;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  const tk = document.createElement("input"); tk.type = "password"; tk.placeholder = "oauth:… token"; tk.style.cssText = "width:100%;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  const row = document.createElement("div"); row.style.cssText = "display:flex; gap:6px; flex-wrap:wrap; align-items:center;";
                  const btn = document.createElement("button"); btn.textContent = "🔌 Connect"; btn.style.cssText = "padding:4px 12px;background:#3a4a6a;color:#cde;border:1px solid #5a6a8a;border-radius:5px;cursor:pointer;font-size:11px;";
                  const st = document.createElement("span"); st.style.cssText = "font-size:11px; color:#8b97a8; flex:1;";
                  row.append(btn, st); host.append(hint, ch, nk, tk, row);
                  fetch("/twitch/status").then(r => r.json()).then(j => { st.textContent = j && j.connected ? ("✓ connected: #" + (j.channel || "?")) : "not connected"; st.style.color = j && j.connected ? "#9fe88f" : "#8b97a8"; }).catch(() => { st.textContent = "(bridge offline)"; });
                  btn.addEventListener("click", async () => {
                      const channel = ch.value.trim(); if (!channel) { st.textContent = "type a channel"; st.style.color = "#fb6"; return; }
                      st.textContent = "connecting…"; st.style.color = "#8b97a8";
                      try {
                          const r = await fetch("/twitch/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, nick: nk.value.trim() || channel, token: tk.value.trim() }) });
                          const j = await r.json();
                          st.textContent = j.ok ? ("✓ connected: #" + channel) : ("failed: " + (j.error || "?")); st.style.color = j.ok ? "#9fe88f" : "#f88"; if (j.ok) tk.value = "";
                      } catch (e) { st.textContent = "error: " + e.message; st.style.color = "#f88"; }
                  });
              },
            },
            { id: "twitchEvents", type: "custom", label: "Twitch events + commands",
              render(host) {
                  host.style.cssText = "display:flex; flex-direction:column; gap:6px;";
                  const hint = document.createElement("div"); hint.style.cssText = "color:#7a8290; font-size:11px;";
                  hint.innerHTML = 'EventSub pushes follows / subs / cheers / raids / went-live in as toasts (mirrors to Discord if a webhook is set). Setup: 1) create an app at <a href="https://dev.twitch.tv/console/apps/create" target="_blank" rel="noopener" style="color:#9bd6ff">dev.twitch.tv/console/apps</a> and copy the <b>Client ID</b>; 2) get a <b>user token</b> (scopes moderator:read:followers + channel:read:subscriptions + bits:read) at <a href="https://twitchtokengenerator.com/" target="_blank" rel="noopener" style="color:#9bd6ff">twitchtokengenerator.com</a>; 3) broadcaster = your channel login.';
                  host.appendChild(hint);
                  const cid = document.createElement("input"); cid.placeholder = "app client id"; cid.style.cssText = "width:100%;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  const login = document.createElement("input"); login.placeholder = "broadcaster login (e.g. yourname)"; login.style.cssText = "width:100%;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  const tok = document.createElement("input"); tok.type = "password"; tok.placeholder = "user oauth token"; tok.style.cssText = "width:100%;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  host.append(cid, login, tok);
                  const row = document.createElement("div"); row.style.cssText = "display:flex; gap:6px; flex-wrap:wrap; align-items:center;";
                  const save = document.createElement("button"); save.textContent = "💾 Save"; save.style.cssText = "padding:4px 12px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;border-radius:5px;cursor:pointer;font-size:11px;";
                  const start = document.createElement("button"); start.textContent = "▶ Start EventSub"; start.style.cssText = "padding:4px 12px;background:#3a4a6a;color:#cde;border:1px solid #5a6a8a;border-radius:5px;cursor:pointer;font-size:11px;";
                  const stop = document.createElement("button"); stop.textContent = "⏹ Stop"; stop.style.cssText = "padding:4px 12px;background:#3a4a6a;color:#cde;border:1px solid #5a6a8a;border-radius:5px;cursor:pointer;font-size:11px;";
                  const st = document.createElement("span"); st.style.cssText = "font-size:11px; color:#8b97a8; flex:1;";
                  row.append(save, start, stop, st); host.appendChild(row);
                  const cmdRow = document.createElement("label"); cmdRow.style.cssText = "display:flex; gap:8px; align-items:center; font-size:11px; color:#cde; margin-top:2px;";
                  const cmdChk = document.createElement("input"); cmdChk.type = "checkbox";
                  cmdRow.append(cmdChk, document.createTextNode("Let chat commands drive the engine (!rain !storm !snow !clear !day !night !clouds <type> !kaiju [off])"));
                  host.appendChild(cmdRow);
                  const refresh = () => {
                      fetch("/twitch/eventsub/config").then(r => r.json()).then(j => { if (j) { cid.value = j.clientId || ""; login.value = j.broadcasterLogin || ""; if (j.tokenSet) tok.placeholder = "[token saved — type to replace]"; } }).catch(() => {});
                      fetch("/twitch/eventsub/status").then(r => r.json()).then(j => { st.textContent = j && j.connected ? ("✓ live · " + (j.subscriptions || []).filter(x => x.ok).length + " subs") : "not connected"; st.style.color = j && j.connected ? "#9fe88f" : "#8b97a8"; }).catch(() => { st.textContent = "(bridge offline)"; });
                      fetch("/twitch/commands").then(r => r.json()).then(j => { cmdChk.checked = !!(j && j.enabled); }).catch(() => {});
                  };
                  refresh();
                  save.addEventListener("click", async () => {
                      st.textContent = "saving…"; st.style.color = "#8b97a8";
                      try { const r = await fetch("/twitch/eventsub/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: cid.value.trim(), broadcasterLogin: login.value.trim(), token: tok.value.trim() }) }); const j = await r.json(); st.textContent = j.ok ? "✓ saved" : "save failed"; st.style.color = j.ok ? "#9fe88f" : "#f88"; if (j.ok) tok.value = ""; } catch (e) { st.textContent = "error: " + e.message; st.style.color = "#f88"; }
                  });
                  start.addEventListener("click", async () => {
                      st.textContent = "connecting…"; st.style.color = "#8b97a8";
                      try { const r = await fetch("/twitch/eventsub/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: cid.value.trim() || undefined, broadcasterLogin: login.value.trim() || undefined, token: tok.value.trim() || undefined }) }); const j = await r.json(); if (j.ok) { const n = (j.subscriptions || []).filter(x => x.ok).length; st.textContent = "✓ live · " + n + " subs"; st.style.color = "#9fe88f"; tok.value = ""; } else { st.textContent = "failed: " + (j.error || "?"); st.style.color = "#f88"; } } catch (e) { st.textContent = "error: " + e.message; st.style.color = "#f88"; }
                  });
                  stop.addEventListener("click", async () => { try { await fetch("/twitch/eventsub/stop", { method: "POST" }); st.textContent = "stopped"; st.style.color = "#8b97a8"; } catch {} });
                  cmdChk.addEventListener("change", async () => { try { await fetch("/twitch/commands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: cmdChk.checked }) }); } catch {} });
              },
            },
            { id: "ipCamera", type: "custom", label: "IP camera source",
              render(host) {
                  host.style.cssText = "display:flex; flex-direction:column; gap:6px;";
                  const hint = document.createElement("div"); hint.style.cssText = "color:#7a8290; font-size:11px;";
                  hint.innerHTML = 'Stream an IP camera onto an in-world screen wall. MJPEG URLs work with no extra software; RTSP needs ffmpeg on the bridge. Older Merkury / Geeni cams are Tuya-cloud (no local stream) until rooted \u2014 see <a href="https://github.com/guino/Merkury1080P" target="_blank" rel="noopener" style="color:#9bd6ff">guino/Merkury1080P</a> to unlock RTSP/MJPEG.';
                  host.appendChild(hint);
                  const url = document.createElement("input"); url.placeholder = "rtsp://\u2026 or http://\u2026/mjpeg"; url.style.cssText = "width:100%;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  const typeSel = document.createElement("select"); ["auto","mjpeg","rtsp"].forEach(o => { const op = document.createElement("option"); op.value = o; op.textContent = o; typeSel.appendChild(op); }); typeSel.style.cssText = "width:100%;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  host.append(url, typeSel);
                  const row = document.createElement("div"); row.style.cssText = "display:flex; gap:6px; flex-wrap:wrap; align-items:center;";
                  const save = document.createElement("button"); save.textContent = "\uD83D\uDCBE Save"; save.style.cssText = "padding:4px 12px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;border-radius:5px;cursor:pointer;font-size:11px;";
                  const wallBtn = document.createElement("button"); wallBtn.textContent = "\uD83D\uDCFA Build wall + stream"; wallBtn.style.cssText = "padding:4px 12px;background:#3a4a6a;color:#cde;border:1px solid #5a6a8a;border-radius:5px;cursor:pointer;font-size:11px;";
                  const streamBtn = document.createElement("button"); streamBtn.textContent = "\u25B6 Stream"; streamBtn.style.cssText = "padding:4px 12px;background:#3a4a6a;color:#cde;border:1px solid #5a6a8a;border-radius:5px;cursor:pointer;font-size:11px;";
                  const stopBtn = document.createElement("button"); stopBtn.textContent = "\u23F9 Stop"; stopBtn.style.cssText = "padding:4px 12px;background:#3a4a6a;color:#cde;border:1px solid #5a6a8a;border-radius:5px;cursor:pointer;font-size:11px;";
                  const st = document.createElement("span"); st.style.cssText = "font-size:11px; color:#8b97a8; flex:1;";
                  row.append(save, wallBtn, streamBtn, stopBtn, st); host.appendChild(row);
                  fetch("/camera/config").then(r => r.json()).then(j => { if (j) { url.value = j.url || ""; typeSel.value = j.type || "auto"; } }).catch(() => {});
                  const saveCfg = () => fetch("/camera/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.value.trim(), type: typeSel.value }) });
                  save.addEventListener("click", async () => { st.textContent = "saving\u2026"; try { const j = await (await saveCfg()).json(); st.textContent = j.ok ? "\u2713 saved" : "save failed"; st.style.color = j.ok ? "#9fe88f" : "#f88"; } catch (e) { st.textContent = "error"; st.style.color = "#f88"; } });
                  wallBtn.addEventListener("click", async () => { try { await saveCfg(); window.screenWall?.placeWall?.(); window.ipCamera?.start?.(); st.textContent = "\u2713 wall built \u00b7 streaming"; st.style.color = "#9fe88f"; } catch (e) { st.textContent = "error: " + e.message; st.style.color = "#f88"; } });
                  streamBtn.addEventListener("click", async () => { try { await saveCfg(); window.ipCamera?.start?.(); st.textContent = "\u2713 streaming"; st.style.color = "#9fe88f"; } catch (e) { st.textContent = "error"; st.style.color = "#f88"; } });
                  stopBtn.addEventListener("click", () => { try { window.ipCamera?.stop?.(); st.textContent = "stopped"; st.style.color = "#8b97a8"; } catch {} });
              },
            },
            { id: "discordVoice", type: "custom", label: "Discord voice (bot)",
              render(host) {
                  host.style.cssText = "display:flex; flex-direction:column; gap:6px;";
                  const hint = document.createElement("div"); hint.style.cssText = "color:#7a8290; font-size:11px;";
                  hint.innerHTML = 'Make the engine SPEAK in a Discord voice channel (needs a bot, not the webhook). 1) create a bot at <a href="https://discord.com/developers/applications" target="_blank" rel="noopener" style="color:#9bd6ff">discord.com/developers</a> and copy its token; 2) invite it with Connect + Speak; 3) first time, run <b>npm install</b> in ai-bridge for the voice libs. For the ids: turn on Discord Developer Mode, then right-click the server / voice channel \u2192 Copy ID.';
                  host.appendChild(hint);
                  const tok = document.createElement("input"); tok.type = "password"; tok.placeholder = "bot token"; tok.style.cssText = "width:100%;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  const gid = document.createElement("input"); gid.placeholder = "server (guild) id"; gid.style.cssText = "width:100%;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  const cid = document.createElement("input"); cid.placeholder = "voice channel id"; cid.style.cssText = "width:100%;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
                  host.append(tok, gid, cid);
                  const row = document.createElement("div"); row.style.cssText = "display:flex; gap:6px; flex-wrap:wrap; align-items:center;";
                  const save = document.createElement("button"); save.textContent = "\uD83D\uDCBE Save"; save.style.cssText = "padding:4px 12px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;border-radius:5px;cursor:pointer;font-size:11px;";
                  const conn = document.createElement("button"); conn.textContent = "\uD83D\uDD0A Connect"; conn.style.cssText = "padding:4px 12px;background:#3a4a6a;color:#cde;border:1px solid #5a6a8a;border-radius:5px;cursor:pointer;font-size:11px;";
                  const leave = document.createElement("button"); leave.textContent = "\u23CF Leave"; leave.style.cssText = "padding:4px 12px;background:#3a4a6a;color:#cde;border:1px solid #5a6a8a;border-radius:5px;cursor:pointer;font-size:11px;";
                  const st = document.createElement("span"); st.style.cssText = "font-size:11px; color:#8b97a8; flex:1;";
                  row.append(save, conn, leave, st); host.appendChild(row);
                  const sayRow = document.createElement("div"); sayRow.style.cssText = "display:flex; gap:6px; align-items:center;";
                  const sayIn = document.createElement("input"); sayIn.placeholder = "say something in voice\u2026"; sayIn.style.cssText = "width:100%;padding:6px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace; flex:1;";
                  const sayBtn = document.createElement("button"); sayBtn.textContent = "\uD83D\uDDE3 Say"; sayBtn.style.cssText = "padding:4px 12px;background:#3a4a6a;color:#cde;border:1px solid #5a6a8a;border-radius:5px;cursor:pointer;font-size:11px;";
                  sayRow.append(sayIn, sayBtn); host.appendChild(sayRow);
                  const mirRow = document.createElement("label"); mirRow.style.cssText = "display:flex; gap:8px; align-items:center; font-size:11px; color:#cde; margin-top:2px;";
                  const mirrorChk = document.createElement("input"); mirrorChk.type = "checkbox";
                  mirRow.append(mirrorChk, document.createTextNode("Auto-mirror the avatar's TTS into this voice channel"));
                  host.appendChild(mirRow);
                  mirrorChk.addEventListener("change", async () => { try { await fetch("/discord/voice/mirror", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: mirrorChk.checked }) }); } catch {} });
                  const refresh = () => {
                      fetch("/discord/voice/config").then(r => r.json()).then(j => { if (j) { gid.value = j.guildId || ""; cid.value = j.channelId || ""; if (j.tokenSet) tok.placeholder = "[token saved \u2014 type to replace]"; } }).catch(() => {});
                      fetch("/discord/voice/status").then(r => r.json()).then(j => { if (!j) return; st.textContent = j.joined ? ("\u2713 in #" + (j.channelName || "voice")) : (j.loggedIn ? "logged in" : (j.depsInstalled ? "not connected" : "run npm install in ai-bridge")); st.style.color = j.joined ? "#9fe88f" : "#8b97a8"; if (typeof j.mirror === "boolean") mirrorChk.checked = j.mirror; }).catch(() => { st.textContent = "(bridge offline)"; });
                  };
                  refresh();
                  const saveCfg = () => fetch("/discord/voice/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: tok.value.trim(), guildId: gid.value.trim(), channelId: cid.value.trim() }) });
                  save.addEventListener("click", async () => { st.textContent = "saving\u2026"; try { const j = await (await saveCfg()).json(); st.textContent = j.ok ? "\u2713 saved" : "save failed"; st.style.color = j.ok ? "#9fe88f" : "#f88"; if (j.ok) tok.value = ""; } catch (e) { st.textContent = "error"; st.style.color = "#f88"; } });
                  conn.addEventListener("click", async () => { st.textContent = "connecting\u2026"; st.style.color = "#8b97a8"; try { await saveCfg(); const j = await (await fetch("/discord/voice/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json(); st.textContent = j.ok ? ("\u2713 in #" + (j.channel || "voice")) : ("failed: " + (j.error || "?")); st.style.color = j.ok ? "#9fe88f" : "#f88"; if (j.ok) tok.value = ""; } catch (e) { st.textContent = "error: " + e.message; st.style.color = "#f88"; } });
                  leave.addEventListener("click", async () => { try { await fetch("/discord/voice/leave", { method: "POST" }); st.textContent = "left"; st.style.color = "#8b97a8"; } catch {} });
                  sayBtn.addEventListener("click", async () => { const text = sayIn.value.trim(); if (!text) return; st.textContent = "speaking\u2026"; try { const j = await (await fetch("/discord/voice/say", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })).json(); st.textContent = j.ok ? "\u2713 said it" : ("say failed: " + (j.error || "?")); st.style.color = j.ok ? "#9fe88f" : "#f88"; if (j.ok) sayIn.value = ""; } catch (e) { st.textContent = "error"; st.style.color = "#f88"; } });
              },
            },
            { id: "geminiKey", label: "Set Gemini API key (free)", hint: "Stored in the Windows Credential Manager via the bridge. Get one free at aistudio.google.com.", type: "button",
              action: async () => {
                  const k = prompt("Paste your Gemini API key (Google AI Studio, free):");
                  if (!k) return;
                  const r = await window.ai?.setKey?.("gemini", k.trim()).catch(() => null);
                  alert(r?.ok ? "Gemini key saved to the Windows vault." : "Save failed: " + (r?.error || "bridge unreachable")); } },
            { id: "otherKey", label: "Set Grok / OpenAI / Claude key", hint: "Optional — same vault. Needs that provider's own paid API key.", type: "button",
              action: async () => {
                  const p = (prompt("Which provider? grok | openai | claude") || "").trim().toLowerCase();
                  if (!["grok", "openai", "claude"].includes(p)) return;
                  const k = prompt("Paste the " + p + " API key:");
                  if (!k) return;
                  const r = await window.ai?.setKey?.(p, k.trim()).catch(() => null);
                  alert(r?.ok ? (p + " key saved.") : "Save failed: " + (r?.error || "bridge unreachable")); } },
            { id: "fmpKey", label: "Set FMP API key (AI Trader — free)", hint: "Powers the AI Trader's live congressional-trade feed. Free key at site.financialmodelingprep.com — 250 calls/day covers House + Senate. Stored on the bridge (trader.json).", type: "button",
              action: async () => {
                  const k = prompt("Paste your Financial Modeling Prep (FMP) API key — free tier, 250 calls/day:");
                  if (!k) return;
                  const r = await window.trader?.config?.({ source: "fmp", apiKey: k.trim() }).catch(() => null);
                  alert(r?.ok ? "FMP key saved — the AI Trader source is now set to FMP." : "Save failed: " + (r?.error || "trader bridge unreachable")); } },
            { id: "aiKeyStatus", label: "Check AI key status", hint: "Which providers have a key in the vault", type: "button",
              action: async () => {
                  const s = await window.ai?.keyStatus?.().catch(() => null);
                  if (!s) { alert("Bridge unreachable."); return; }
                  alert(Object.entries(s).map(([k, v]) => k + ": " + (v.set ? ("set …" + v.tail) : "not set")).join("\n")); } },
            { id: "genAsset", label: "Generate a voxel asset", hint: "Describe anything — whale, pagoda, Lego figure, fish. Uses free Gemini.", type: "button",
              action: async () => {
                  const d = prompt("Describe the voxel asset to generate:");
                  if (!d) return;
                  const r = await window.ai?.asset?.(d).catch(() => null);
                  if (r?.ok) {
                      // ai.asset (the rig+stage override) returns `voxels` as a COUNT
                      // (number); the bare generate() returns it as an ARRAY. Handle both.
                      const vc = Array.isArray(r.voxels) ? r.voxels.length : (typeof r.voxels === "number" ? r.voxels : "?");
                      alert("Built '" + r.name + "' (" + vc + " voxels). See console."); return;
                  }
                  const why = r?.error || "bridge unreachable";
                  const extra = r?.finishReason ? ("\nfinishReason: " + r.finishReason) : "";
                  alert("Failed: " + why + extra + (why === "bad_json" ? "\n(Gemini returned unparseable output — try a simpler subject or retry.)" : "")); } },
            // v799 — Google Sheets credentials (service-account JSON key path)
            _credentialControl({
                id: "sheetsCreds",
                label: "Google Sheets credentials",
                hint: "Service-account JSON file path. Generate at console.cloud.google.com → IAM → Service Accounts → Keys → Add JSON. Share each Sheet with the client_email in the JSON. See SHEETS_SETUP.md.",
                fields: [
                    { key: "credsPath", label: "Creds JSON path", type: "text", placeholder: "C:/VoxelBAK/sheets-creds.json" },
                ],
                onSave: async (v) => {
                    try {
                        const r = await window.sheets?.configure?.({ credsPath: v.credsPath });
                        if (r?.ready) return { ok: true, message: "Saved ✓ — auth as " + (r.clientEmail || "(unknown)") };
                        return { ok: false, error: r?.error || "config failed" };
                    } catch (e) {
                        return { ok: false, error: e?.message || "bridge unreachable" };
                    }
                },
                loadStatus: async () => {
                    try {
                        const s = await window.sheets?.status?.();
                        if (!s) return null;
                        return {
                            prefill: s.credsPath ? { credsPath: s.credsPath } : {},
                            ok: !!s.ready,
                            note: s.ready ? ("✓ ready — " + (s.clientEmail || "")) : (s.error || "not configured"),
                        };
                    } catch { return null; }
                },
            }),
            { id: "sheetsTest", label: "Test Sheets read", hint: "Reads a tiny range from a Sheet ID + range you supply (no write). Tests creds + sharing.", type: "button",
              action: async () => {
                  const id = prompt("Spreadsheet ID (the long string in /d/<here>/edit):");
                  if (!id) return;
                  const range = prompt("Range (e.g. 'Sheet1!A1:B5'):", "Sheet1!A1:B5");
                  if (!range) return;
                  try {
                      const r = await window.sheets?.read?.(id, range);
                      if (r?.error) { alert("Error: " + r.error); return; }
                      const rows = r?.values || [];
                      alert("Read " + rows.length + " row(s). First row: " + JSON.stringify(rows[0] || []));
                  } catch (e) { alert("Failed: " + e?.message); } } },
            { id: "goveeLights", label: "💡 Govee lights", hint: "Open the Govee panel: paste your Govee Home API key, scan your lights, and control on/off, brightness and color. Cloud API — the key stays on the bridge.", type: "button",
              action: () => { try { window.open("/govee.html", "_blank"); } catch { location.href = "/govee.html"; } } },
            { id: "push2run", label: "🔊 Push2Run", hint: "Open the Push2Run setup panel: paste-ready command rules (+ a swek-cmd.bat helper) so phrases pushed from your phone / hotkeys can run demos, toggle the perf dashboard, etc. on the running engine.", type: "button",
              action: () => { try { window.open("/push2run.html", "_blank"); } catch { location.href = "/push2run.html"; } } },
            { id: "macrodroid", label: "🤖 MacroDroid / Tasker recipes", hint: "Open a reference of bridge HTTP endpoints worth triggering from a phone (MacroDroid/Tasker HTTP Request action) — demos, watering, lights, Shield, avatar — with this PC's LAN base URL prefilled and copy buttons.", type: "button",
              action: () => { try { window.open("/macrodroid.html", "_blank"); } catch { location.href = "/macrodroid.html"; } } },
            { id: "clients", label: "🖥️ Connected devices", hint: "Open the live device roster: every client on the bridge right now (PC / phone / Shield) with its IP and uptime. Shield rows get one-tap buttons to open the avatar window, camera grid, wall switchboard or hub on that Shield over ADB — using its own IP, no typing.", type: "button",
              action: () => { try { window.open("/clients.html", "_blank"); } catch { location.href = "/clients.html"; } } },
            { id: "connectDevice", label: "📲 Connect a device", hint: "Open the connect helper: the bridge's LAN address (and .local mDNS name) to open on a phone, tablet or Shield on the same Wi-Fi, with copy buttons, every network address listed (real adapters first, virtual ones flagged), and one-tap 'open the engine here' for any connected Shield.", type: "button",
              action: () => { try { window.open("/connect.html", "_blank"); } catch { location.href = "/connect.html"; } } },
            { id: "appInstaller", label: "📥 App installer & links", hint: "Open the app installer: install links for every app this engine talks to (handy on the Shield, where you sideload) plus a push-installer — drop .apk files into ai-bridge/apks/ and install them straight to the Shield over ADB.", type: "button",
              action: () => { try { window.open("/shield-apps.html", "_blank"); } catch { location.href = "/shield-apps.html"; } } },
            { id: "alexaCmd", label: "🗣️ Alexa command", hint: "Open the Alexa command panel: type a command (e.g. 'set a 10 minute timer') and send it to an Echo through Home Assistant, via Alexa Media Player (pick a media_player entity) or the official Alexa Devices integration (device id).", type: "button",
              action: () => { try { window.open("/alexa.html", "_blank"); } catch { location.href = "/alexa.html"; } } },
            { id: "echoShow", label: "📺 Show on Echo", hint: "Open the Show-on-Echo panel: open an engine page (wall switchboard, custom board, …) on an Echo Show screen. Alexa has no native open-URL command, so it relies on a tiny one-time APL skill that maps page numbers to URLs; this panel fires the 'open page N' text command via Home Assistant. Not a true kiosk — the Show reverts to home after a few minutes.", type: "button",
              action: () => { try { window.open("/echo-show.html", "_blank"); } catch { location.href = "/echo-show.html"; } } },
            { id: "spacedesk", label: "🖥️ spacedesk auto-launch", hint: "Open the spacedesk panel: when the spacedesk server starts on this PC, auto-open the spacedesk viewer on the Shield so it joins as a second monitor. Scan finds the server's process name; Test launches the viewer now.", type: "button",
              action: () => { try { window.open("/spacedesk.html", "_blank"); } catch { location.href = "/spacedesk.html"; } } },
            { id: "xbox", label: "🎮 Xbox (Dev Mode)", hint: "Open the Xbox panel: control an Xbox One/Series in Developer Mode via its Device Portal — list & launch apps, read system perf, grab a screenshot. Needs the console IP + the Dev Portal username/password.", type: "button",
              action: () => { try { window.open("/xbox.html", "_blank"); } catch { location.href = "/xbox.html"; } } },
        ]},
        { id: "hosting", label: "Remote Hosting", icon: "\uD83D\uDCE1", controls: [
            { id: "remoteHosting", type: "custom", label: "Remote Hosting",
              render(host) {
                  // v1803 — hosting.html embedded inline; it has all controls already.
                  // Removed duplicate cloudflared/auth/tunnel controls from this wrapper.
                  const hframe = document.createElement("iframe");
                  hframe.src = "/hosting.html";
                  // v1836 — was a fixed 520px (cramped, scrolled). Fill the panel height so the
                  // whole hosting page is visible without an inner scrollbar fighting the outer one.
                  hframe.style.cssText = "width:100%;height:min(820px,78vh);border:1px solid #2a3340;border-radius:6px;background:#06090f;";
                  hframe.title = "Remote Hosting";
                  host.style.cssText = "display:flex;flex-direction:column;min-height:600px;";
                  host.appendChild(hframe);
              },
            },
        ]},
        // v1802 — GitHub Repos & Services (moved from settings.html)
        { id: "github-repos", label: "GitHub Repos & Services", icon: "\uD83D\uDC19", controls: [
            { id: "ghReposPanel", type: "custom", label: "Repos & local services",
              render(host) {
                  host.style.cssText = "display:flex;flex-direction:column;gap:0;min-height:200px;";
                  const panel = document.createElement("div"); panel.style.cssText = "display:flex;flex-direction:column;gap:0;";
                  const installOut = document.createElement("div"); installOut.style.cssText = "display:none;margin-top:6px;font-size:10px;color:#7a8290;font-family:ui-monospace,monospace;white-space:pre-wrap;max-height:120px;overflow-y:auto;background:#06090f;border:1px solid #2a3340;border-radius:5px;padding:5px 8px;";
                  host.append(panel, installOut);

                  function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
                  function _fmtAge(ts){ if(!ts) return ""; var s=Math.round((Date.now()-ts)/1000); if(s<120) return s+"s ago"; if(s<3600) return Math.round(s/60)+"m ago"; return Math.round(s/3600)+"h ago"; }
                  function _hdr(text, sub){ const d=document.createElement("div"); d.style.cssText="font-size:11px;font-weight:bold;color:#7fe0a0;margin:10px 0 4px;border-bottom:1px solid #1a2a1a;padding-bottom:3px;"; d.innerHTML=text+(sub?(' <span style="color:#7a8290;font-weight:normal;font-size:10px;">'+sub+"</span>"):""); return d; }

                  function _ghRow(s, svc, isMonitored, isEngine, reloadFn) {
                      const running=!!(svc&&svc.running), onPath=!!(svc&&svc.onPath);
                      const row=document.createElement("div"); row.style.cssText="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border:1px solid "+(running?"#1e4a30":"#1a2a3a")+";border-radius:6px;margin-bottom:5px;background:#0a1020;flex-wrap:wrap;";
                      const dot=s.svcId?('<span style="font-size:13px;color:'+(running?"#9fe88f":"#566")+';margin-right:2px;">'+(running?"●":"○")+"</span>"):"";
                      const info=document.createElement("div"); info.style.cssText="flex:1;min-width:180px;";
                      info.innerHTML=dot+(isEngine?'<span style="color:#ffd479;font-size:10px;margin-right:3px;">★</span>':"")+
                          '<a href="https://github.com/'+(s.full||s.repo)+'" target="_blank" rel="noopener" style="color:#9bd6ff;font-weight:bold;font-size:11px;text-decoration:none;">'+(s.full||s.repo)+"</a>"+
                          (s.swekPage?(' <a href="'+s.swekPage+'" target="_blank" style="font-size:9px;padding:0 5px;border-radius:10px;background:#0d2218;color:#9fe88f;border:1px solid #1e4a30;text-decoration:none;margin-left:3px;">SweK ↗</a>'):"")+
                          (s.version?('<span style="font-size:10px;color:#7fefb0;margin-left:6px;">'+esc(s.version)+"</span>"):"")+
                          '<div style="font-size:10px;color:#7a8290;margin-top:2px;">'+(s.desc||s.description||"")+"</div>"+
                          (s.svcId&&svc?('<div style="font-size:10px;color:#7a8290;margin-top:1px;">'+(running?'<span style="color:#9fe88f;">running</span>'+(svc.port?" on :"+svc.port:""):(onPath?"installed, not running":"not detected locally"))+"</div>"):"")+
                          (s.installCmd?('<div style="font-size:9px;color:#566;margin-top:2px;font-family:ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+esc(s.installCmd)+'">'+esc(s.installCmd)+"</div>"):"");
                      row.appendChild(info);
                      const btns=document.createElement("div"); btns.style.cssText="display:flex;flex-direction:column;gap:3px;min-width:90px;align-items:flex-end;";
                      if(!isEngine){ const mb=document.createElement("button"); mb.textContent=isMonitored?"✕ Remove":"+ Monitor"; mb.style.cssText="font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer;background:"+(isMonitored?"#1e0a0a":"#0a1820")+";color:"+(isMonitored?"#f99":"#7a8290")+";border:1px solid "+(isMonitored?"#5a2020":"#1a2a3a")+";"; mb.onclick=async()=>{ await fetch(isMonitored?"/github/peer-remove":"/github/peer-add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({repo:s.full||s.repo})}); reloadFn(); }; btns.appendChild(mb); }
                      if(s.svcId&&svc){
                          if(running&&s.svcPort){ const a=document.createElement("a"); a.href="http://localhost:"+s.svcPort; a.target="_blank"; a.rel="noopener"; a.textContent="↗ Open"; a.style.cssText="font-size:10px;padding:2px 8px;border-radius:4px;background:#0d2218;color:#9fe88f;border:1px solid #1e4a30;text-decoration:none;text-align:center;"; btns.appendChild(a); }
                          if(!running&&s.installCmd){ const b=document.createElement("button"); b.textContent="⬇ Install cmd"; b.title=s.installCmd; b.style.cssText="font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer;background:#0a0c1a;color:#a99bd0;border:1px solid #3a3056;"; b.onclick=()=>{ installOut.style.display="block"; installOut.textContent="Install: "+(s.label||s.repo)+"\n\n  "+s.installCmd+"\n\nRun in a terminal then reload."; }; btns.appendChild(b); }
                          const ab=document.createElement("button"); ab.textContent=(svc.autostart?"⏱ Auto: ON":"⏱ Auto: OFF"); ab.style.cssText="font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer;background:#0a0c0a;color:#7a8290;border:1px solid #1a2a3a;"; ab.onclick=async()=>{ await fetch("/bgsvc/autostart",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:s.svcId,on:!svc.autostart})}); reloadFn(); }; btns.appendChild(ab);
                          if(!running&&onPath){ const sb=document.createElement("button"); sb.textContent="▶ Start"; sb.style.cssText="font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer;background:#14241a;color:#9fe;border:1px solid #2a5a3a;"; sb.onclick=async()=>{ await fetch("/bgsvc/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:s.svcId})}); setTimeout(load,2500); }; btns.appendChild(sb); }
                          if(running){ const xb=document.createElement("button"); xb.textContent="■ Stop"; xb.style.cssText="font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer;background:#1e0a0a;color:#f99;border:1px solid #5a2020;"; xb.onclick=async()=>{ await fetch("/bgsvc/stop",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:s.svcId})}); setTimeout(load,1500); }; btns.appendChild(xb); }
                      }
                      row.appendChild(btns); return row;
                  }

                  async function load() {
                      panel.innerHTML = '<div style="font-size:10px;color:#7a8290;padding:6px;">loading…</div>';
                      try {
                          // v1807 — peer-config is the ONLY call we need to render the panel; it's
                          // instant server-side (reads a local file). Load it first on its own with a
                          // generous budget. peers (GitHub API, may be slow/rate-limited) and bgsvc
                          // status (probes local services) load after, in parallel, and are best-effort:
                          // if either times out the panel still renders — just without live version
                          // tags or service status dots. Previously all three were in one Promise.all,
                          // so a slow service-probe could time out the whole panel even though the
                          // config it needed was already available instantly.
                          const cfg = await settingsFetchJSON("/github/peer-config", {}, 8000);
                          if (!cfg || cfg.ok === false) throw new Error((cfg && cfg.error) || "could not load GitHub config");
                          const [peers, bsv] = await Promise.all([
                              settingsFetchJSON("/github/peers", {}, 12000),
                              settingsFetchJSON("/bgsvc/status", {}, 8000),
                          ]);
                          const svcs=(bsv&&bsv.services)||{};
                          const suggested=cfg.suggestedRepos||[];
                          const suggestedMap={}; suggested.forEach(s=>{suggestedMap[s.repo.toLowerCase()]=s;});
                          const monitoredRaw=[].concat(cfg.engineRepo?[{full:cfg.engineRepo,isEngine:true}]:[],
                              (cfg.monitorRepos||[]).map(r=>({full:r,isEngine:false})));
                          const monitoredKeys=new Set(monitoredRaw.map(r=>r.full.toLowerCase()));
                          const versionMap={}; if(peers&&peers.repos) peers.repos.forEach(r=>{if(r.full)versionMap[r.full.toLowerCase()]=r;});
                          panel.innerHTML="";

                          // v1807 — surface the backend's actual reason (rate limit, network, etc.)
                          // as a banner, AFTER clearing the loading state so it isn't immediately wiped.
                          if (peers && peers.error) {
                              const warn = document.createElement("div");
                              warn.style.cssText = "font-size:11px;color:" + (peers.rateLimited ? "#caa05a" : "#ff7b7b") + ";background:" + (peers.rateLimited ? "#1a1400" : "#2a1414") + ";border:1px solid " + (peers.rateLimited ? "#5a4520" : "#5a2020") + ";border-radius:6px;padding:6px 10px;margin-bottom:8px;";
                              warn.textContent = "\u26a0 " + peers.error;
                              panel.appendChild(warn);
                          }

                          // Section 1: Your repos
                          panel.appendChild(_hdr("Your monitored repos", monitoredRaw.length+" repos"));
                          if(!monitoredRaw.length){ const em=document.createElement("div"); em.style.cssText="font-size:10px;color:#7a8290;margin-bottom:8px;"; em.textContent="No repos yet. Add from the list below or type owner/repo in the box."; panel.appendChild(em); }
                          else { monitoredRaw.forEach(({full,isEngine})=>{ const key=full.toLowerCase(); const vd=versionMap[key]||{}; const sg=suggestedMap[key]||{}; const merged=Object.assign({full,repo:full,desc:vd.description||sg.desc||"",version:vd.version||null,swekPage:sg.swekPage||null,svcId:sg.svcId||null,svcPort:sg.svcPort||null,installCmd:sg.installCmd||null,label:sg.label||full},vd); const svc=merged.svcId?svcs[merged.svcId]:null; panel.appendChild(_ghRow(merged,svc,true,isEngine,load)); }); }

                          // Section 2: Suggested
                          const unmonitored=suggested.filter(s=>!monitoredKeys.has(s.repo.toLowerCase()));
                          if(unmonitored.length){
                              panel.appendChild(_hdr("Suggested repos","click + Monitor to track releases"));
                              const cats={}; unmonitored.forEach(s=>{if(!cats[s.cat])cats[s.cat]=[];cats[s.cat].push(s);});
                              Object.keys(cats).forEach(cat=>{ const ch=document.createElement("div"); ch.style.cssText="font-size:10px;color:#4a7a5a;margin:6px 0 2px;"; ch.textContent=cat; panel.appendChild(ch); cats[cat].forEach(s=>{ const svc=s.svcId?svcs[s.svcId]:null; panel.appendChild(_ghRow(s,svc,false,false,load)); }); });
                          }

                          // Section 3: Add custom
                          panel.appendChild(_hdr("Add any GitHub repo"));
                          const addRow=document.createElement("div"); addRow.style.cssText="display:flex;gap:5px;margin-bottom:4px;flex-wrap:wrap;";
                          const addIn=document.createElement("input"); addIn.placeholder="owner/repo or GitHub URL"; addIn.style.cssText="flex:1;min-width:180px;background:#0a1020;color:#cfe7f5;border:1px solid #1a2a3a;border-radius:5px;padding:3px 7px;font:11px ui-monospace,monospace;";
                          const addBtn=document.createElement("button"); addBtn.textContent="+ Add"; addBtn.style.cssText="font-size:11px;padding:3px 12px;background:#14241a;color:#9fe;border:1px solid #2a5a3a;border-radius:5px;cursor:pointer;";
                          addBtn.onclick=async()=>{ const v=addIn.value.trim(); if(!v)return; await fetch("/github/peer-add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({repo:v})}); addIn.value=""; load(); };
                          addIn.addEventListener("keydown",e=>{if(e.key==="Enter")addBtn.click();});
                          addRow.append(addIn,addBtn); panel.appendChild(addRow);
                      } catch(e){ panel.innerHTML='<div style="color:#ff7b7b;font-size:11px;">Could not load: '+e+'</div>'; }
                  }
                  load();
              }
            },
        ]},
        { id: "perf", label: "Performance", icon: "📊", controls: [
            // v670 — QUALITY embedded directly in Performance (replacing v669's
            // "Open quality panel" button). The four-option preset list with
            // descriptions is rendered as a select, and the AUTO target-FPS
            // slider sits below. Behavior is identical to the now-deprecated
            // standalone QualityPresetPanel — same setPreset() and
            // setAutoTargetFps() helpers, just rendered through the schema
            // settings hub. The old standalone panel is no longer mounted.
            { id: "qualityPreset", label: "Quality preset",
              hint: "FAST shadow 256 / bloom off / grid 5  ·  BALANCED shadow 512 / bloom on / grid 7  ·  QUALITY shadow 1024 / bloom on / grid 10  ·  AUTO modulates by FPS",
              type: "select",
              options: ["fast", "balanced", "quality", "auto"],
              get: () => {
                  try { return ctx._qualityModule?.getCurrentPreset?.() ?? "balanced"; } catch { return "balanced"; }
              },
              set: (v) => {
                  try { ctx._qualityModule?.setPreset?.(v, ctx._qualityHooks ?? {}); } catch (e) { console.warn("[settings] setPreset failed:", e?.message); }
              } },
            { id: "qualityAutoFps", label: "AUTO target FPS",
              hint: "Only applies when preset is AUTO. Engine eases quality down on dips and climbs back up when easy.",
              type: "slider",
              min: 30, max: 120, step: 5,
              get: () => {
                  try { return ctx._qualityModule?.getAutoTargetFps?.() ?? 60; } catch { return 60; }
              },
              set: (v) => {
                  try { ctx._qualityModule?.setAutoTargetFps?.(v); } catch (e) { console.warn("[settings] setAutoTargetFps failed:", e?.message); }
              } },
            // Legacy low/medium/high gfx-batch toggle, kept since it does a
            // different thing (toggles individual graphics checkboxes en
            // masse) than the FAST/BALANCED/QUALITY/AUTO render preset.
            { id: "preset", label: "Graphics-toggle preset", hint: "Bulk-flip all graphics checkboxes (sun shadows / god rays / etc.) on or off", type: "select",
              options: ["low", "medium", "high"],
              get: () => ctx._preset || "high",
              set: (v) => { ctx._preset = v; const p = GFX_PRESETS[v]; if (p && ctx.gfx) for (const k in p) ctx.gfx.set(k, p[k]); } },
            { id: "frustumCull", label: "Frustum culling", hint: "Skip drawing chunks outside the view (perf)", type: "toggle",
              get: () => ctx.renderer ? ctx.renderer.frustumCullEnabled !== false : true,
              set: (v) => { if (ctx.renderer) ctx.renderer.frustumCullEnabled = v; } },
            { id: "grassDensity", label: "Grass density", hint: "Blades placed per rebuild", type: "slider",
              min: 1000, max: 20000, step: 1000,
              get: () => ctx.vegetation?.getDensity?.() ?? 9000, set: (v) => ctx.vegetation?.setDensity?.(v) },
            { id: "perfDash", label: "Open performance dashboard", hint: "Worker pools + frame timing", type: "button",
              action: () => ctx.perf?.toggle?.() },
            { id: "bridgeHealth", label: "🩺 Bridge health", hint: "Open the bridge health dashboard: which runtime the bridge is on (Bun/Node + version), uptime, memory, LAN address, connected clients, and the live state of each subsystem — Home Assistant, go2rtc cameras, ComfyUI, the generation queue, background services and optional modules.", type: "button",
              action: () => { try { window.open("/bridge.html", "_blank"); } catch { location.href = "/bridge.html"; } } },
            { id: "runtimeLink", label: "🔗 Multi-runtime link", hint: "Open the multi-runtime link view: a hub-and-spoke map of the bridge and the runtimes that connect to it — the VBA/Excel engine (authoritative game state via /bridge/game_tick), the PowerShell KPop Listener, and WebGL clients (browsers/Shield). Shows each link's online/stale/offline state, last-seen, and what flows over it.", type: "button",
              action: () => { try { window.open("/runtimes.html", "_blank"); } catch { location.href = "/runtimes.html"; } } },
            { id: "interludePreview", type: "custom", label: "Interlude overlay",
              render(box) {
                  const wrap = document.createElement("div");
                  const title = document.createElement("div");
                  title.textContent = "Interlude overlay (covers engine stalls)";
                  Object.assign(title.style, { fontSize: "13px", marginBottom: "2px", fontWeight: "600" });
                  wrap.appendChild(title);
                  const hint = document.createElement("div");
                  hint.textContent = "Preview the 'please wait' styles. Used via window.engineBusy.runHeavy() around heavy ops (the dam-break flood already uses it). Optional video clip plays during the wait.";
                  Object.assign(hint.style, { fontSize: "11px", color: C.dim, marginBottom: "8px" });
                  wrap.appendChild(hint);
                  const row = document.createElement("div");
                  Object.assign(row.style, { display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" });
                  [["Spinner", "spinner"], ["Lore card", "lore"], ["Mix", "mix"], ["Video", "video"]].forEach(([lbl, st]) => {
                      const b = document.createElement("button");
                      b.textContent = lbl;
                      Object.assign(b.style, { background: C.tabOn, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 12px", cursor: "pointer", fontSize: "12px" });
                      b.addEventListener("click", () => window.engineBusy?.demo?.(st));
                      row.appendChild(b);
                  });
                  wrap.appendChild(row);
                  const vidRow = document.createElement("div");
                  Object.assign(vidRow.style, { display: "flex", gap: "6px" });
                  const inUrl = document.createElement("input");
                  inUrl.type = "text"; inUrl.placeholder = "interlude clip URL (e.g. /clips/wait.mp4)"; inUrl.autocomplete = "off"; inUrl.spellcheck = false;
                  try { inUrl.value = window.engineBusy?.getVideo?.() || ""; } catch {}
                  Object.assign(inUrl.style, { flex: "1 1 auto", minWidth: "0", background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 8px", fontSize: "12px" });
                  const save = document.createElement("button");
                  save.textContent = "Set clip";
                  Object.assign(save.style, { background: C.tabOn, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 12px", cursor: "pointer", fontSize: "12px" });
                  save.addEventListener("click", () => { window.engineBusy?.setVideo?.(inUrl.value.trim()); });
                  vidRow.appendChild(inUrl); vidRow.appendChild(save);
                  wrap.appendChild(vidRow);
                  box.appendChild(wrap);
              } },
            { id: "rearrangeTabs", label: "🧩 Rearrange minitabs (move mode)", hint: "Enter move mode: every LCARS minitab becomes draggable — drop each near a corner and they auto-stack inward along that edge, pinned to the sides so wide screens keep the middle clear. A toolbar gives Copy report (to share your layout) / Reset / Done. Hotkey: Shift+Alt+M.", type: "button",
              action: () => { try { window.minitabMove && window.minitabMove(true); } catch (e) {} } },
            { id: "perfDash", label: "📊 Toggle perf dashboard", hint: "Show/hide the live performance HUD: FPS + frame-time graph, p50/p95/max, the top time-eating sections per frame, plus a CPU/GPU/memory + chunk-streamer line. Draggable; same as the console's perf.toggle().", type: "button",
              action: () => { try { window.perf?.toggle?.(); } catch (e) {} } },
        ]},
        // v681 — Launch / Window Mode. User asked for a way to choose how the
        // engine page opens at startup: regular tabbed browser, dedicated app
        // window (no address bar / tabs / bookmarks), or kiosk fullscreen.
        // Stores the preference in localStorage so future boots use it. The
        // "Relaunch now" button POSTs to /launch/window which spawns a new
        // Chrome process with the right --app= / --kiosk flags.
        { id: "launch", label: "Launch", icon: "🪟", controls: [
            { id: "windowMode", label: "Window mode",
              hint: "Tabbed = normal browser. App = dedicated window with Windows title bar + min/max/close but NO browser chrome (address bar, tabs, bookmarks). Kiosk = full-screen, no chrome at all (Alt+F4 to exit).",
              type: "select",
              options: ["tabbed", "app", "kiosk"],
              get: () => { try { return localStorage.getItem("voxelengine.windowMode") || "tabbed"; } catch { return "tabbed"; } },
              set: (v) => { try { localStorage.setItem("voxelengine.windowMode", v); } catch {} } },
            { id: "windowSize", label: "App window size",
              hint: "Only used by App mode. The OS picks position; size is whatever you select here.",
              type: "select",
              options: ["1280x720", "1600x900", "1920x1080", "2560x1440", "default"],
              get: () => { try { return localStorage.getItem("voxelengine.windowSize") || "1280x720"; } catch { return "1280x720"; } },
              set: (v) => { try { localStorage.setItem("voxelengine.windowSize", v); } catch {} } },
            { id: "relaunchNow", label: "Relaunch in selected mode",
              hint: "Spawns a NEW Chrome window with your chosen mode. The current tab/window stays open — close it manually after the new one appears.",
              type: "button",
              action: async () => {
                  try {
                      const mode = localStorage.getItem("voxelengine.windowMode") || "tabbed";
                      const size = localStorage.getItem("voxelengine.windowSize") || "1280x720";
                      // v688 — if the user has "Prefer mDNS URL" on AND the bridge
                      // is actually advertising via mDNS, relaunch at voxelengine.local
                      // instead of the current location.origin. That makes the
                      // launched window portable to any device on the LAN.
                      let url = location.origin + "/";
                      try {
                          if (localStorage.getItem("voxelengine.preferMdnsRelaunch") === "1") {
                              const r = await fetch("/net/info");
                              const j = await r.json();
                              const mdnsUrl = j?.mdnsAdvertise?.url || j?.mdns;
                              if (mdnsUrl) url = mdnsUrl;
                          }
                      } catch { /* fall back to location.origin */ }
                      const r = await fetch("/launch/window", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ mode, size, url }),
                      });
                      const j = await r.json().catch(() => ({}));
                      if (j.ok) alert(`Launched ${mode} window at ${url}\n${j.note || ""}\n\nClose this tab once the new window opens.`);
                      else alert("Relaunch failed: " + (j.error || "unknown error"));
                  } catch (e) { alert("Relaunch failed: " + e.message); }
              } },
        ]},

        // v688 — Network / mDNS section. Shows what name the engine is
        // advertising via Bonjour/mDNS, the URL to reach it from other
        // devices, and a toggle that affects the Launch section's URL
        // choice. Read-only info comes from GET /net/info.
        { id: "network", label: "Network / mDNS", icon: "🌐", controls: [
            { id: "mdnsInfo", type: "custom",
              render: (box) => {
                  Object.assign(box.style, { padding: "10px 0", fontSize: "12px", lineHeight: "1.55" });
                  box.textContent = "Loading mDNS status…";
                  fetch("/net/info").then(r => r.json()).then(j => {
                      box.textContent = "";
                      const ad = j?.mdnsAdvertise || {};
                      const mdnsUrl = ad.url || j?.mdns || "";
                      const lanIps  = j?.lanIps || [];
                      const port    = j?.port || 8787;

                      // Header row — green dot if advertising, red if not
                      const head = document.createElement("div");
                      Object.assign(head.style, { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" });
                      const dot = document.createElement("span");
                      Object.assign(dot.style, { width: "10px", height: "10px", borderRadius: "50%",
                          background: ad.available ? "#5cd66f" : "#e44", display: "inline-block" });
                      head.appendChild(dot);
                      const h = document.createElement("b");
                      h.textContent = ad.available ? "mDNS advertising" : "mDNS not advertising";
                      h.style.color = ad.available ? "#9fd1ff" : "#e88";
                      head.appendChild(h);
                      box.appendChild(head);

                      const row = (label, value) => {
                          const r = document.createElement("div");
                          r.style.cssText = "display:flex; gap:8px; padding:2px 0;";
                          const l = document.createElement("span");
                          l.style.cssText = "color:#8a97a6; min-width:110px;";
                          l.textContent = label;
                          const v = document.createElement("span");
                          v.style.cssText = "color:#dfe7ef; user-select:text;";
                          v.textContent = value || "(none)";
                          r.appendChild(l); r.appendChild(v);
                          box.appendChild(r);
                      };
                      row("Name",        ad.name ? `${ad.name}.local` : "(default)");
                      row("Port",        String(port));
                      row("mDNS URL",    mdnsUrl);
                      row("LAN IPs",     lanIps.join(", "));
                      if (!ad.available && ad.lastError) row("Error", ad.lastError);

                      // Action buttons
                      const btnRow = document.createElement("div");
                      Object.assign(btnRow.style, { display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" });
                      const mkBtn = (label, onClick, primary = false) => {
                          const b = document.createElement("button");
                          b.textContent = label;
                          b.style.cssText = `padding:6px 12px; border:1px solid ${primary ? C.accent : "rgba(255,255,255,0.18)"};
                              background:${primary ? "rgba(92,200,255,0.16)" : "transparent"}; color:${C.text};
                              border-radius:6px; cursor:pointer; font-size:12px;`;
                          b.addEventListener("click", onClick);
                          btnRow.appendChild(b);
                      };
                      mkBtn("📋 Copy URL", () => {
                          if (!mdnsUrl) return;
                          navigator.clipboard?.writeText(mdnsUrl).then(
                              () => { const t = btnRow.firstChild; if (t) { t.textContent = "✓ copied"; setTimeout(() => { t.textContent = "📋 Copy URL"; }, 1500); } },
                              () => alert("clipboard blocked — manual: " + mdnsUrl),
                          );
                      }, true);
                      mkBtn("🌐 Open in new tab", () => {
                          if (!mdnsUrl) return;
                          window.open(mdnsUrl, "_blank", "noopener");
                      });
                      mkBtn("🔄 Refresh", () => {
                          box.innerHTML = "";
                          box.textContent = "Loading mDNS status…";
                          // Re-call the same render to refetch
                          setTimeout(() => { box.innerHTML = ""; this._render?.(); }, 50);
                      });
                      box.appendChild(btnRow);

                      // v1610 — editable mDNS name. Persists to the bridge (mdns.config.json) and re-advertises
                      // immediately. A space is fine in the display name; the .local host is auto-sanitized.
                      const ed = document.createElement("div");
                      Object.assign(ed.style, { marginTop: "12px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.10)" });
                      const edLbl = document.createElement("div");
                      edLbl.style.cssText = "color:#8a97a6; font-size:11px; margin-bottom:5px;";
                      edLbl.textContent = "mDNS name — what this box advertises on the LAN (a space is fine):";
                      ed.appendChild(edLbl);
                      const edRow = document.createElement("div");
                      edRow.style.cssText = "display:flex; gap:6px; align-items:center;";
                      const input = document.createElement("input");
                      input.type = "text";
                      input.value = ad.configuredName || "";
                      input.placeholder = ad.defaultName || "SweK Engine";
                      input.style.cssText = "flex:1 1 auto; padding:6px 8px; border:1px solid rgba(255,255,255,0.18); border-radius:6px; background:rgba(0,0,0,0.25); color:" + C.text + "; font-size:12px;";
                      const saveBtn = document.createElement("button");
                      saveBtn.textContent = "Save";
                      saveBtn.style.cssText = "padding:6px 14px; border:1px solid " + C.accent + "; background:rgba(92,200,255,0.16); color:" + C.text + "; border-radius:6px; cursor:pointer; font-size:12px;";
                      const edStat = document.createElement("div");
                      edStat.style.cssText = "font-size:11px; color:#8a97a6; margin-top:5px; min-height:14px;";
                      saveBtn.addEventListener("click", () => {
                          edStat.style.color = "#8a97a6"; edStat.textContent = "saving…";
                          fetch("/net/mdns/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: input.value.trim() }) })
                              .then(r => r.json())
                              .then(j => {
                                  if (j && j.ok) { edStat.style.color = "#9fe88f"; edStat.textContent = "\u2713 advertising as \u201c" + (j.name || "(default)") + "\u201d" + (j.host ? "  \u2192 " + j.host : ""); }
                                  else { edStat.style.color = "#e88"; edStat.textContent = "\u2717 " + ((j && j.error) || "save failed"); }
                              })
                              .catch(e => { edStat.style.color = "#e88"; edStat.textContent = "\u2717 " + ((e && e.message) || e); });
                      });
                      edRow.appendChild(input); edRow.appendChild(saveBtn);
                      ed.appendChild(edRow);
                      const edHint = document.createElement("div");
                      edHint.style.cssText = "font-size:11px; color:#6f7d8c; margin-top:5px;";
                      edHint.textContent = "Blank = per-box default (" + (ad.defaultName || "SweK Engine") + "). The .local host is auto-sanitized (spaces \u2192 hyphens). Peer discovery uses the UDP beacon, so this is just the friendly name.";
                      ed.appendChild(edHint); ed.appendChild(edStat);
                      box.appendChild(ed);
                  }).catch(e => {
                      box.textContent = "Couldn't fetch /net/info: " + (e?.message || e);
                      box.style.color = "#e88";
                  });
              } },
            { id: "preferMdnsRelaunch", label: "Use mDNS URL when relaunching",
              hint: "When on, the Launch section's Relaunch button opens the engine at the .local mDNS URL instead of localhost / current address. Useful when you'll show the relaunched window on a different device.",
              type: "toggle",
              get: () => { try { return localStorage.getItem("voxelengine.preferMdnsRelaunch") === "1"; } catch { return false; } },
              set: (v) => { try { localStorage.setItem("voxelengine.preferMdnsRelaunch", v ? "1" : "0"); } catch {} } },
            { id: "haCapabilities", label: "🏠 Home Assistant capabilities", hint: "Open the HA panel: which engine-relevant integrations you have vs. are missing (with install links + what each unlocks), and which engine features stay greyed until HA is connected.", type: "button",
              action: () => { try { window.open("/ha-capabilities.html", "_blank"); } catch { location.href = "/ha-capabilities.html"; } } },
            { id: "ballAlerts", label: "🔴 Ball alerts", hint: "Pulse a light or light group when engine events fire (new email, console error, generation done, someone home, HA alert). Choose direct Home Assistant control or speak it through an Alexa Echo, per-event colour + blip/alarm style, off-behaviour, and a base colour the engine re-asserts.", type: "button",
              action: () => { try { window.open("/ball-alerts.html", "_blank"); } catch { location.href = "/ball-alerts.html"; } } },
            { id: "haDiagram", label: "🗺 Home Assistant map", hint: "A diagram of the avatar's HA integrations grouped by reachability: set up & connected, ready to set up (core, just enable), and not on the network (add-on not installed like Frigate, or no matching hardware).", type: "button",
              action: () => { try { window.open("/ha-diagram.html", "_blank"); } catch { location.href = "/ha-diagram.html"; } } },
            { id: "nestProtect", label: "🔥 Nest Protect (smoke/CO)", hint: "Open the Nest Protect panel: reads smoke / carbon-monoxide / battery entities from Home Assistant and shows each detector's status. Note: the official HA Nest integration doesn't expose Protect — this surfaces whatever smoke/CO entities HA has.", type: "button",
              action: () => { try { window.open("/nest-protect.html", "_blank"); } catch { location.href = "/nest-protect.html"; } } },
            { id: "presence", label: "📍 Presence & occupancy", hint: "Open the presence panel: who's home/away (person + device_tracker entities, e.g. the HA Companion app's GPS) and which rooms are occupied (occupancy/presence/motion sensors) — read live from Home Assistant.", type: "button",
              action: () => { try { window.open("/presence.html", "_blank"); } catch { location.href = "/presence.html"; } } },
            { id: "haSwitches", label: "💡 Lights & switches", hint: "Open the lights & switches panel: turn any Home Assistant light.* or switch.* on/off/toggle by hand. A camera spotlight (CloudEdge / Tuya cam via the Tuya or LocalTuya integration) shows up here, usually as a switch. The same on/off can be fired automatically from a motion/presence rule.", type: "button",
              action: () => { try { window.open("/ha-switches.html", "_blank"); } catch { location.href = "/ha-switches.html"; } } },
            { id: "wall", label: "🧱 Wall switchboard (kiosk)", hint: "Open the wall switchboard: big touch tiles for lights/switches/valves with brightness + color-temp sliders, a scenes row, and drag-to-arrange. Add ?ids=light.a,switch.b to the URL to curate which tiles that phone shows.", type: "button",
              action: () => { try { window.open("/wall.html", "_blank"); } catch { location.href = "/wall.html"; } } },
            { id: "board", label: "🎛️ Custom entity board", hint: "Open a custom board: pick ANY Home Assistant entity (sensors, climate, covers, locks, media players, …) and it renders as a smart per-domain tile. Saved server-side per board name (?board=office). Picker + display in one.", type: "button",
              action: () => { try { window.open("/board.html", "_blank"); } catch { location.href = "/board.html"; } } },
            { id: "ac", label: "❄️ Climate / AC", hint: "Open the climate panel: target temp dial (−/+), current temp + humidity, HVAC mode, fan speed, presets (eco/boost/sleep) and louver swing for a climate.* entity like the Midea AC (midea_ac_lan).", type: "button",
              action: () => { try { window.open("/ac.html", "_blank"); } catch { location.href = "/ac.html"; } } },
            { id: "solar", label: "☀️ Solar & energy gauges", hint: "Open the solar gauges: live production, home-battery %, grid import/export and energy-today, read from the haSolar roles (Enphase Envoy etc.). Setup maps your HA sensors to each role. Optional toggle ties the avatar's mood to the battery level.", type: "button",
              action: () => { try { window.open("/solar.html", "_blank"); } catch { location.href = "/solar.html"; } } },
            { id: "doorbell", label: "🔔 Doorbell fan-out", hint: "Open the doorbell panel: one trigger (GET /doorbell/ring, fired from MacroDroid/Tasker on a Blink event) announces on the avatar (quip + TTS + HA speaker), pops the Blink app on the Shield, and can flash a light. Includes a Test ring button.", type: "button",
              action: () => { try { window.open("/doorbell.html", "_blank"); } catch { location.href = "/doorbell.html"; } } },
            { id: "arrival", label: "🏠 Arrival fan-out", hint: "Open the arrival panel: when a person arrives home (HA presence, or a phone geofence hitting /arrival/ring), greet them across the avatar + local TTS + the Echo, with optional Shield scene + light. Per-person greetings + a Test button.", type: "button",
              action: () => { try { window.open("/arrival.html", "_blank"); } catch { location.href = "/arrival.html"; } } },
            { id: "shieldDisplay", label: "📐 Shield display test", hint: "Open the Shield display tester: push rotation, resolution (wm size) and DPI (wm density) to the Shield over ADB to wrangle portrait-locked apps. 'Reset all' recovers a bad setting.", type: "button",
              action: () => { try { window.open("/shield-display.html", "_blank"); } catch { location.href = "/shield-display.html"; } } },
            { id: "cloudedge", label: "📷 CloudEdge camera", hint: "Open the CloudEdge helper: enable ONVIF in the CloudEdge app, then enter the camera IP + password here to build the local RTSP URL and register it with go2rtc so it shows in the camera picker. Note: only works if your cam exposes local ONVIF/RTSP (some are cloud-only).", type: "button",
              action: () => { try { window.open("/cloudedge.html", "_blank"); } catch { location.href = "/cloudedge.html"; } } },
            { id: "cams", label: "🎥 Camera grid", hint: "Open the camera grid: tiles every go2rtc stream on one kiosk page (WebRTC / MSE / MJPEG / Snapshot modes; tap a tile to expand). Streams come from the CloudEdge/RTSP setup. Good for a wall phone or a glance dashboard.", type: "button",
              action: () => { try { window.open("/cams.html", "_blank"); } catch { location.href = "/cams.html"; } } },
            { id: "airQuality", label: "🌬️ Air quality", hint: "Open the air-quality panel: PM2.5 with health color bands plus temperature/humidity, read from Home Assistant. A Govee H5106 (or similar) shows up here once it's added via the Govee BLE integration (local Bluetooth).", type: "button",
              action: () => { try { window.open("/air-quality.html", "_blank"); } catch { location.href = "/air-quality.html"; } } },
        ]},
        // v1617 — Cloud section: point the engine at a SweK rendezvous server (cloud/swek-rendezvous/) so
        // off-LAN boxes + people (e.g. PetFBI admins) can find + reach it across NAT. Config/status come from
        // /cloud/*; "Connect" opens a WebRTC P2P link to a listed peer via window.cloudPeer.
        { id: "cloud", label: "Google", icon: "\uD83D\uDD37", controls: [
            { id: "cloudPanel", type: "custom",
              render: (box) => {
                  Object.assign(box.style, { padding: "10px 0", fontSize: "12px", lineHeight: "1.5" });
                  const mk = (tag, css, txt) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; };
                  box.textContent = "";
                  box.appendChild(mk("div", "font-size:13px;font-weight:600;color:#9fd1ff;margin:0 0 4px;", "\u2601\uFE0F Cloud \u2014 cross-network rendezvous"));

                  const head = mk("div", "display:flex;align-items:center;gap:8px;margin-bottom:8px;");
                  const dot = mk("span", "width:10px;height:10px;border-radius:50%;background:#777;display:inline-block;flex:none;");
                  const htxt = mk("b", "color:#9fd1ff;", "Cloud link"); head.appendChild(dot); head.appendChild(htxt); box.appendChild(head);

                  const intro = mk("div", "color:#7f93a8;margin-bottom:10px;", "A rendezvous server lets remote boxes and people connect across networks. Deploy guide: cloud/swek-rendezvous/README.md (Cloud Run or a free e2-micro VM). Turn engine auth ON before exposing anything publicly.");
                  box.appendChild(intro);

                  // v1625 — at-a-glance cloud status: reachability + latency, registration, identity, directory, P2P links.
                  const statusBox = mk("div", "margin:4px 0 8px;padding:8px 10px;background:#0b1420;border:1px solid #18303f;border-radius:8px;font-size:11.5px;line-height:1.6;color:#aebfd0;");
                  box.appendChild(statusBox);
                  const srefresh = mk("button", "margin:0 0 12px;padding:4px 10px;background:#16283a;color:#bcd2e6;border:0;border-radius:6px;cursor:pointer;font-size:11px;", "\u21BB Refresh status"); box.appendChild(srefresh);
                  const refreshStatus = async () => {
                      statusBox.textContent = "checking\u2026";
                      try {
                          const [h, s, cfg] = await Promise.all([
                              fetch("/cloud/health", { cache: "no-store" }).then(r => r.json()).catch(() => ({ reachable: false })),
                              fetch("/cloud/status", { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
                              fetch("/cloud/config", { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
                          ]);
                          const p2p = (window.cloudPeer && window.cloudPeer.peers && window.cloudPeer.peers()) || [];
                          const p2pOpen = p2p.filter(x => x.state === "open").length;
                          const line = (k, v, col) => { const r = mk("div", "display:flex;gap:8px;"); r.appendChild(mk("span", "color:#6f8298;min-width:118px;flex:none;", k)); r.appendChild(mk("span", col ? ("color:" + col) : "", v)); return r; };
                          statusBox.textContent = "";
                          if (!cfg.enabled) { statusBox.appendChild(line("Cloud", "off \u2014 enable below", "#caa05a")); return; }
                          statusBox.appendChild(line("Rendezvous", h.reachable ? ("\u2713 reachable \u00b7 " + (h.latencyMs != null ? h.latencyMs : "?") + "ms" + (h.auth ? " \u00b7 auth on" : " \u00b7 OPEN \u26A0")) : ("\u2717 " + (h.error || "unreachable")), h.reachable ? "#9fe88f" : "#f88"));
                          statusBox.appendChild(line("Registered", s.registered ? "\u2713 yes" : ("\u2717 " + (s.error || "no")), s.registered ? "#9fe88f" : "#f88"));
                          statusBox.appendChild(line("This box", (cfg.name || "(unnamed)") + "  \u00b7  " + (cfg.id || "")));
                          statusBox.appendChild(line("Directory", ((s.peers != null ? s.peers : (h.peers || 0))) + " peer(s) online"));
                          statusBox.appendChild(line("P2P links", p2pOpen + " open" + (p2p.length > p2pOpen ? (" / " + p2p.length + " total") : "") + (p2pOpen ? "  \u2014 waves go P2P (no egress)" : "")));
                      } catch { statusBox.textContent = "status unavailable"; }
                  };
                  srefresh.onclick = refreshStatus;

                  // v1627 — direct links to the Google console pages you need for the rendezvous setup.
                  const linkWrap = mk("div", "margin:2px 0 12px;padding:8px 10px;background:#0b1420;border:1px solid #18303f;border-radius:8px;");
                  linkWrap.appendChild(mk("div", "font-size:11px;color:#7f93a8;margin-bottom:5px;", "Set up on Google (free tier): create a project, then either deploy to Cloud Run or spin up the always-free e2-micro VM."));
                  const links = [
                      ["\uD83C\uDD95 Cloud console \u2014 create / pick a project", "https://console.cloud.google.com/projectcreate"],
                      ["\uD83D\uDE80 Cloud Run \u2014 deploy the rendezvous", "https://console.cloud.google.com/run"],
                      ["\uD83D\uDDA5\uFE0F Compute Engine \u2014 create the e2-micro VM", "https://console.cloud.google.com/compute/instances"],
                      ["\uD83D\uDCB0 Free tier \u2014 what's always-free", "https://cloud.google.com/free/docs/free-cloud-features"],
                  ];
                  for (const [t, u] of links) { const a = mk("a", "display:block;color:#9bd6ff;text-decoration:none;padding:2px 0;font-size:11.5px;", t + " \u25B8"); a.href = u; a.target = "_blank"; a.rel = "noopener"; linkWrap.appendChild(a); }
                  linkWrap.appendChild(mk("div", "font-size:10.5px;color:#caa05a;margin-top:6px;line-height:1.45;", "\u26A0 The VM page defaults to e2-medium + a balanced disk (~$25/mo). For the always-free tier pick the E2 series \u2192 e2-micro, set the boot disk to Standard (\u226430 GB), and keep the region us-west1/central1/east1. The estimate shows list price (~$6-7) but the real bill is ~$0."));
                  box.appendChild(linkWrap);
                  const row = (labelTxt) => { const r = mk("div", "display:flex;align-items:center;gap:8px;margin:6px 0;"); const l = mk("label", "width:92px;color:#9fb3cc;flex:none;", labelTxt); r.appendChild(l); return r; };
                  const enRow = row("Enabled"); const enCb = mk("input", "width:auto;"); enCb.type = "checkbox"; enRow.appendChild(enCb); box.appendChild(enRow);
                  const urlRow = row("Server URL"); const urlIn = mk("input", "flex:1;min-width:0;padding:5px 7px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); urlIn.placeholder = "https://swek-rendezvous-xxxx.run.app"; urlRow.appendChild(urlIn); box.appendChild(urlRow);
                  const tokRow = row("Token"); const tokIn = mk("input", "flex:1;min-width:0;padding:5px 7px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); tokIn.type = "password"; tokIn.placeholder = "shared secret (SWEK_TOKEN)"; tokRow.appendChild(tokIn);
                  const genTok = mk("button", "padding:5px 10px;background:#16283a;color:#bcd2e6;border:0;border-radius:6px;cursor:pointer;flex:none;", "Generate"); genTok.title = "Make a strong random token"; tokRow.appendChild(genTok); box.appendChild(tokRow);
                  genTok.onclick = () => { try { const b = new Uint8Array(24); (window.crypto || crypto).getRandomValues(b); tokIn.value = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); tokIn.type = "text"; if (typeof updateGuide === "function") updateGuide(); } catch {} };
                  const nameRow = row("This box"); const nameIn = mk("input", "flex:1;min-width:0;padding:5px 7px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); nameIn.placeholder = "name shown to remote peers"; nameRow.appendChild(nameIn); box.appendChild(nameRow);

                  // v1630 — collapsible setup guides, rendered with THIS box's actual values (URL + token),
                  // so the steps are copy-paste-ready. v1775 — two tabs: Cloud Run and e2-micro VM.
                  // Also updated VM Node install to NodeSource 20.x (replaces old apt nodejs which gives Node 12).
                  function _esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
                  const _code = (s) => "<code style='background:#06101a;color:#dfe9f4;padding:1px 5px;border-radius:4px;font-size:10.5px;word-break:break-all'>" + _esc(s) + "</code>";

                  // -- shared guide container --
                  const guideWrap = mk("div", "margin:8px 0;");
                  const guideTabBar = mk("div", "display:flex;gap:4px;margin-bottom:4px;");
                  const guideBody  = mk("div", "display:none;background:#0b1420;border:1px solid #18303f;border-radius:8px;padding:9px 11px;font-size:11px;line-height:1.65;color:#aebfd0;");
                  let _guideTab = "";

                  function _makeGuideTab(label, key) {
                      const btn = mk("button", "font-size:11px;padding:2px 10px;border-radius:5px 5px 0 0;cursor:pointer;border:1px solid #18303f;border-bottom:0;background:#0d1c2e;color:#6f8aa0;", label);
                      btn.onclick = () => {
                          if (_guideTab === key) { guideBody.style.display = "none"; _guideTab = ""; _setActive(null); return; }
                          _guideTab = key; guideBody.style.display = "block"; updateGuide(); _setActive(btn);
                      };
                      guideTabBar.appendChild(btn);
                      return btn;
                  }
                  const _tabCR  = _makeGuideTab("\u2601\uFE0F Install instructions: Cloud Run", "cloudrun");
                  const _tabVM  = _makeGuideTab("\uD83D\uDDB5\uFE0F Install instructions: e2-micro VM", "vm");
                  function _setActive(active) {
                      [_tabCR, _tabVM].forEach(b => { b.style.background = (b === active) ? "#0b1420" : "#0d1c2e"; b.style.color = (b === active) ? "#9fb3cc" : "#6f8aa0"; });
                  }
                  guideWrap.appendChild(guideTabBar); guideWrap.appendChild(guideBody); box.appendChild(guideWrap);

                  function updateGuide() {
                      if (!_guideTab) return;
                      let host = "<your-ip-or-host>", port = "8787", proto = "http";
                      try { const u = new URL(urlIn.value.trim()); host = u.hostname || host; port = u.port || (u.protocol === "https:" ? "443" : "8787"); proto = u.protocol.replace(":", "") || "http"; } catch {}
                      const tok = tokIn.value.trim() || "<generate a token above>";
                      const healthUrl = proto + "://" + host + ":" + port + "/health";

                      if (_guideTab === "cloudrun") {
                          guideBody.innerHTML =
                              "<b>Prerequisites:</b> <a href='https://cloud.google.com/sdk/docs/install' target='_blank' style='color:#9ed5ff;'>gcloud CLI</a> installed on this machine, <b>gcloud auth login</b> done, billing enabled on your project.<br><br>" +
                              "<b>1.</b> In a terminal on this machine, " + _code("cd cloud/swek-rendezvous") + " (inside your SweK Engine folder).<br>" +
                              "<b>2.</b> Run: " + _code("gcloud run deploy swek-rendezvous --source . --region us-central1 --allow-unauthenticated --min-instances=1 --max-instances=1 --set-env-vars SWEK_TOKEN=" + tok) + "<br>" +
                              "&nbsp;&nbsp;&nbsp;(Or simply run " + _code("./deploy-rendezvous-to-gcp.sh") + " from the project root \u2014 it handles all of this.)<br>" +
                              "<b>3.</b> After deploy, gcloud prints a <b>Service URL</b> like <code>https://swek-rendezvous-xxxx.run.app</code>. Paste that into the <b>Server URL</b> field above.<br>" +
                              "<b>4.</b> Verify: " + _code("curl " + (proto + "://" + host + (port && port !== "443" && port !== "80" ? ":" + port : "") + "/health")) + " should return <code>{\"ok\":true,\u2026}</code>.<br>" +
                              "<b>5.</b> Enter the token above, set <b>Enabled</b> on, click <b>Save</b>. The status dot turns green.<br><br>" +
                              "<span style='color:#6f8aa0;'>Board state is ephemeral (resets on redeploy). Add <code>--gcs-fuse</code> to the deploy script for persistent board state.</span>";
                      } else {
                          // VM guide — NodeSource 20.x instead of apt nodejs (which gives Node 12 on Debian 12)
                          const runCmd = "SWEK_TOKEN=" + tok + " PORT=" + port + " node server.js";
                          const svcUnit =
                              "[Unit]\\nDescription=SweK rendezvous\\nAfter=network.target\\n\\n" +
                              "[Service]\\nEnvironment=PORT=" + port + "\\nEnvironment=SWEK_TOKEN=" + tok + "\\n" +
                              "ExecStart=/usr/bin/node /home/USER/swek-rendezvous/server.js\\nRestart=always\\n\\n" +
                              "[Install]\\nWantedBy=multi-user.target";
                          guideBody.innerHTML =
                              "<b>1.</b> On the <a href='https://console.cloud.google.com/compute/instances' target='_blank' style='color:#9ed5ff;'>VM instances page</a>, click <b>SSH</b> on your instance row \u2014 a browser terminal opens.<br>" +
                              "<b>2.</b> Install Node.js 20 via NodeSource (replaces the outdated apt version):<br>" +
                              "&nbsp;&nbsp;&nbsp;" + _code("curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -") + "<br>" +
                              "&nbsp;&nbsp;&nbsp;" + _code("sudo apt-get install -y nodejs") + "<br>" +
                              "&nbsp;&nbsp;&nbsp;Then confirm: " + _code("node --version") + " should show <code>v20.x.x</code>.<br>" +
                              "<b>3.</b> Upload the server: in the SSH window gear \u2192 <b>Upload file</b>, upload <b>server.js</b> and <b>board.html</b> from <code>cloud/swek-rendezvous/</code>. No npm install \u2014 pure Node.<br>" +
                              "<b>4.</b> Open the firewall for port " + port + ": " + _code("gcloud compute firewall-rules create swek-rv-http --allow=tcp:" + port + " --source-ranges=0.0.0.0/0") + "<br>" +
                              "&nbsp;&nbsp;&nbsp;Or in the console: VPC network \u2192 Firewall \u2192 Create rule, Ingress, All instances, 0.0.0.0/0, TCP " + port + ".<br>" +
                              "<b>5.</b> Run it: " + _code(runCmd) + " \u2014 you should see <em>listening on :" + port + " (token auth ON)</em>.<br>" +
                              "<b>6.</b> To keep it running after logout, write a systemd unit:<br>" +
                              "&nbsp;&nbsp;&nbsp;" + _code("sudo nano /etc/systemd/system/swek-rv.service") + " and paste:<br>" +
                              "<pre style='background:#06101a;color:#c8dce8;padding:6px 8px;border-radius:5px;font-size:10px;overflow-x:auto;'>" + _esc(svcUnit) + "</pre>" +
                              "&nbsp;&nbsp;&nbsp;Replace <code>USER</code> with your SSH username. Then: " + _code("sudo systemctl enable --now swek-rv") + "<br>" +
                              "<b>7.</b> Verify: " + _code("curl " + healthUrl) + " \u2014 should return <code>{\"ok\":true,\u2026}</code>.<br>" +
                              "<b>8.</b> Paste " + _code(proto + "://" + host + ":" + port) + " into <b>Server URL</b> above, enter the token, set <b>Enabled</b> on, click <b>Save</b>.";
                      }
                  }
                  urlIn.addEventListener("input", updateGuide); tokIn.addEventListener("input", updateGuide);
                  // TURN relay (optional) — only needed when STUN can't punch through (symmetric NAT). Relays media,
                  // so it costs bandwidth. See cloud/swek-rendezvous/README.md for running a coturn relay.
                  const turnHdr = mk("div", "color:#6f8aa0;margin:10px 0 2px;font-size:11px;cursor:pointer;", "\u25B8 TURN relay (optional \u2014 for symmetric NAT)");
                  const turnWrap = mk("div", "display:none;"); box.appendChild(turnHdr); box.appendChild(turnWrap);
                  turnHdr.onclick = () => { const on = turnWrap.style.display === "none"; turnWrap.style.display = on ? "block" : "none"; turnHdr.textContent = (on ? "\u25BE" : "\u25B8") + " TURN relay (optional \u2014 for symmetric NAT)"; };
                  const turnUrlRow = row("TURN URL"); const turnUrlIn = mk("input", "flex:1;min-width:0;padding:5px 7px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); turnUrlIn.placeholder = "turn:host:3478"; turnUrlRow.appendChild(turnUrlIn); turnWrap.appendChild(turnUrlRow);
                  const turnUserRow = row("TURN user"); const turnUserIn = mk("input", "flex:1;min-width:0;padding:5px 7px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); turnUserRow.appendChild(turnUserIn); turnWrap.appendChild(turnUserRow);
                  const turnCredRow = row("TURN cred"); const turnCredIn = mk("input", "flex:1;min-width:0;padding:5px 7px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); turnCredIn.type = "password"; turnCredRow.appendChild(turnCredIn); turnWrap.appendChild(turnCredRow);

                  const saveRow = mk("div", "display:flex;align-items:center;gap:8px;margin:8px 0;");
                  const saveBtn = mk("button", "padding:6px 14px;background:#1d6fe0;color:#fff;border:0;border-radius:6px;cursor:pointer;", "Save"); saveRow.appendChild(saveBtn);
                  const msg = mk("span", "font-size:11px;color:#7f93a8;"); saveRow.appendChild(msg); box.appendChild(saveRow);

                  const dirHdr = mk("div", "color:#9fb3cc;margin:12px 0 4px;font-weight:bold;", "Remote peers");
                  const boardRow = mk("div", "margin:4px 0 8px;");
                  const boardBtn = mk("button", "padding:6px 12px;background:#2c5a8a;color:#fff;border:0;border-radius:6px;cursor:pointer;", "\uD83D\uDC3E Open PetFBI board");
                  boardBtn.onclick = () => { const u = (urlIn.value.trim() || "").replace(/\/+$/, ""); if (u) window.open(u + "/board", "_blank"); else { msg.style.color = "#caa05a"; msg.textContent = "set the server URL first"; } };
                  boardRow.appendChild(boardBtn); box.appendChild(boardRow);
                  box.appendChild(dirHdr);
                  const dirBox = mk("div", "display:flex;flex-direction:column;gap:4px;"); box.appendChild(dirBox);

                  let _selfId = "";
                  const setDot = (st) => { dot.style.background = !st || !st.enabled ? "#777" : (st.registered ? "#5cd66f" : "#e6a23c"); htxt.textContent = !st || !st.enabled ? "Cloud link off" : (st.registered ? ("Cloud link up \u00b7 " + (st.peers || 0) + " peer(s)") : ("Cloud link: " + (st.error || "connecting\u2026"))); };

                  const loadCfg = async () => { try { const c = await fetch("/cloud/config", { cache: "no-store" }).then(r => r.json()); enCb.checked = !!c.enabled; urlIn.value = c.url || ""; nameIn.value = c.name || ""; tokIn.placeholder = c.token === "set" ? "•••••• (saved \u2014 leave blank to keep)" : "shared secret (SWEK_TOKEN)"; turnUrlIn.value = c.turnUrl || ""; turnUserIn.value = c.turnUser || ""; turnCredIn.value = c.turnCred || ""; _selfId = c.id || ""; if (!nameIn.value.trim()) { try { const ni = await fetch("/net/info", { cache: "no-store" }).then(r => r.json()); const host = ni && ni.hostname ? String(ni.hostname).trim() : ""; const oct = ((ni && ni.lanIps && ni.lanIps[0]) || "").split(".").pop(); nameIn.value = host || ("SweK Engine " + (oct || "")).trim(); nameIn.title = "auto-filled from this computer \u2014 edit if you like"; } catch {} } } catch {} if (typeof updateGuide === "function") updateGuide(); };
                  const loadStatus = async () => { try { const s = await fetch("/cloud/status", { cache: "no-store" }).then(r => r.json()); setDot(s); } catch {} };
                  const cpState = () => { try { const ps = (window.cloudPeer && window.cloudPeer.status && window.cloudPeer.status().peers) || []; const m = {}; for (const p of ps) m[p.id] = p.state; return m; } catch { return {}; } };
                  const loadDir = async () => {
                      let peers = []; try { const j = await fetch("/cloud/directory", { cache: "no-store" }).then(r => r.json()); if (j && j.ok) peers = j.peers || []; } catch {}
                      const live = cpState();
                      dirBox.textContent = "";
                      const others = peers.filter(p => p.id !== _selfId);
                      if (!others.length) { dirBox.appendChild(mk("div", "color:#6f7d8c;", enCb.checked ? "No other peers registered yet." : "Enable the cloud link to see remote peers.")); return; }
                      for (const p of others) {
                          const r = mk("div", "display:flex;align-items:center;gap:8px;padding:6px;border:1px solid #18303f;border-radius:6px;");
                          const pd = mk("span", "width:8px;height:8px;border-radius:50%;flex:none;background:" + (live[p.id] === "open" ? "#5cd66f" : "#3a566b") + ";");
                          const nm = mk("div", "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#dce8f4;", (p.name || p.id) + (p.kind && p.kind !== "engine" ? ("  \u00b7 " + p.kind) : ""));
                          const btn = mk("button", "padding:4px 10px;border:0;border-radius:5px;cursor:pointer;background:" + (live[p.id] === "open" ? "#2c8a4a" : "#1d6fe0") + ";color:#fff;", live[p.id] === "open" ? "Ping" : (live[p.id] ? "\u2026" : "Connect"));
                          btn.onclick = async () => { try { if (live[p.id] === "open") { window.cloudPeer.send({ t: "ping", ts: Date.now() }, p.id); btn.textContent = "pinged"; } else { btn.textContent = "\u2026"; await window.cloudPeer.connect(p.id); } } catch {} setTimeout(loadDir, 800); };
                          const wave = mk("button", "padding:4px 9px;border:0;border-radius:5px;cursor:pointer;background:#3a566b;color:#dce8f4;", "\uD83D\uDC4B");
                          wave.title = "Wave \u2014 fire this peer's avatar cameo (uses the free P2P link if open, else the cloud relay)";
                          wave.onclick = async () => {
                              wave.textContent = "\u2026";
                              try {
                                  const p2pOpen = window.cloudPeer && window.cloudPeer.peers && window.cloudPeer.peers().some(x => x.id === p.id && x.state === "open");
                                  if (p2pOpen) {
                                      const me = (nameIn.value || "A peer");
                                      const n = window.cloudPeer.send({ t: "announce", ann: { fromName: me, kind: "info", text: me + " waves hello \uD83D\uDC4B", gestures: ["wave", "speak"], id: "wave-" + Date.now().toString(36) } }, p.id);
                                      wave.textContent = n > 0 ? "\u2713 p2p" : "\u2717";
                                  } else {
                                      const j = await fetch("/cloud/wave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: p.id }) }).then(x => x.json());
                                      wave.textContent = (j && j.ok) ? "\u2713 relay" : "\u2717";
                                  }
                              } catch { wave.textContent = "\u2717"; }
                              setTimeout(() => { wave.textContent = "\uD83D\uDC4B"; }, 1600);
                          };
                          r.appendChild(pd); r.appendChild(nm); r.appendChild(wave); r.appendChild(btn); dirBox.appendChild(r);
                      }
                  };

                  saveBtn.onclick = async () => {
                      msg.style.color = "#7f93a8"; msg.textContent = "saving\u2026";
                      const body = { enabled: enCb.checked, url: urlIn.value.trim(), name: nameIn.value.trim(), turnUrl: turnUrlIn.value.trim(), turnUser: turnUserIn.value.trim(), turnCred: turnCredIn.value };
                      if (tokIn.value) body.token = tokIn.value;                      // blank = keep existing
                      try { const r = await fetch("/cloud/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(x => x.json()); if (r && r.ok) { msg.style.color = "#9fe88f"; msg.textContent = "\u2713 saved"; tokIn.value = ""; try { window.cloudPeer && window.cloudPeer.start && window.cloudPeer.start(); } catch {} } else { msg.style.color = "#f88"; msg.textContent = "\u2717 " + ((r && r.error) || "failed"); } } catch (e) { msg.style.color = "#f88"; msg.textContent = "\u2717 " + (e && e.message); }
                      setTimeout(() => { loadStatus(); loadDir(); }, 600);
                  };

                  loadCfg().then(() => { loadStatus(); loadDir(); refreshStatus(); });
                  const tmr = setInterval(() => { if (!document.body.contains(box)) { clearInterval(tmr); return; } loadStatus(); loadDir(); }, 6000);
              } },
            // v1627 — Gmail sub-section (the engine's dependency-free IMAP unread reader). Uses a Gmail app password.
            { id: "gmailPanel", type: "custom",
              render: (box) => {
                  const mk = (tag, css, txt) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; };
                  Object.assign(box.style, { padding: "12px 0 6px", borderTop: "1px solid #1a2c3a", marginTop: "8px" });
                  box.appendChild(mk("div", "font-size:13px;font-weight:600;color:#9fd1ff;margin:0 0 4px;", "\u2709\uFE0F Gmail \u2014 unread reader"));
                  box.appendChild(mk("div", "font-size:11px;color:#7f93a8;margin-bottom:6px;", "Reads your unread count over IMAP. Use a Gmail app password (not your normal password)."));
                  const appLink = mk("a", "display:inline-block;color:#9bd6ff;text-decoration:none;font-size:11px;margin-bottom:8px;", "\uD83D\uDD11 Get a Gmail app password \u25B8"); appLink.href = "https://myaccount.google.com/apppasswords"; appLink.target = "_blank"; appLink.rel = "noopener"; box.appendChild(appLink);
                  const grow = (lab) => { const r = mk("div", "display:flex;align-items:center;gap:8px;margin:5px 0;"); r.appendChild(mk("label", "width:96px;color:#9fb3cc;flex:none;font-size:11px;", lab)); return r; };
                  const r1 = grow("Address"); const user = mk("input", "flex:1;min-width:0;padding:5px 7px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); user.placeholder = "you@gmail.com"; r1.appendChild(user); box.appendChild(r1);
                  const r2 = grow("App password"); const pass = mk("input", "flex:1;min-width:0;padding:5px 7px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); pass.type = "password"; pass.placeholder = "16-char app password"; r2.appendChild(pass); box.appendChild(r2);
                  const sRow = mk("div", "display:flex;align-items:center;gap:8px;margin:8px 0;");
                  const save = mk("button", "padding:5px 14px;background:#1d6fe0;color:#fff;border:0;border-radius:6px;cursor:pointer;", "Save");
                  const check = mk("button", "padding:5px 12px;background:#16283a;color:#bcd2e6;border:0;border-radius:6px;cursor:pointer;", "Check unread");
                  const gmsg = mk("span", "font-size:11px;color:#7f93a8;"); sRow.appendChild(save); sRow.appendChild(check); sRow.appendChild(gmsg); box.appendChild(sRow);
                  fetch("/gmail/config").then(r => r.json()).then(c => { if (c) { user.value = c.user || ""; if (c.hasPass) pass.placeholder = "\u2022\u2022\u2022\u2022 saved \u2014 leave blank to keep"; } }).catch(() => {});
                  save.onclick = async () => { gmsg.style.color = "#7f93a8"; gmsg.textContent = "saving\u2026"; const body = { user: user.value.trim() }; if (pass.value) body.pass = pass.value; try { const r = await fetch("/gmail/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(x => x.json()); gmsg.style.color = (r && r.ok) ? "#9fe88f" : "#f88"; gmsg.textContent = (r && r.ok) ? "\u2713 saved" : ("\u2717 " + ((r && r.error) || "failed")); pass.value = ""; } catch (e) { gmsg.style.color = "#f88"; gmsg.textContent = "\u2717 " + (e && e.message); } };
                  check.onclick = async () => { gmsg.style.color = "#7f93a8"; gmsg.textContent = "checking\u2026"; try { const r = await fetch("/gmail/unread").then(x => x.json()); gmsg.style.color = (r && r.ok) ? "#9fe88f" : "#f88"; gmsg.textContent = (r && r.ok) ? ("\u2713 " + (r.unread != null ? r.unread : "?") + " unread") : ("\u2717 " + ((r && r.error) || "failed")); } catch (e) { gmsg.style.color = "#f88"; gmsg.textContent = "\u2717 " + (e && e.message); } };
              } },
            // v1629 — Maps sub-section: server-side Google Maps key for the PetFBI pin map + location layers.
            { id: "mapsPanel", type: "custom",
              render: (box) => {
                  const mk = (tag, css, txt) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; };
                  Object.assign(box.style, { padding: "12px 0 6px", borderTop: "1px solid #1a2c3a", marginTop: "8px" });
                  box.appendChild(mk("div", "font-size:13px;font-weight:600;color:#9fd1ff;margin:0 0 4px;", "\uD83D\uDDFA\uFE0F Maps"));
                  box.appendChild(mk("div", "font-size:11px;color:#7f93a8;line-height:1.5;margin-bottom:8px;", "Powers address geocoding \u2014 the \uD83D\uDCCD Locate button turns a report's address into map coordinates. The key stays on the bridge; it is never sent to the browser. The PetFBI map itself now uses free OpenStreetMap tiles (no key). Free tier is ~10k geocodes/month; \u26A0 set a DAILY QUOTA CAP so a runaway can never bill you."));
                  const links = [
                      ["\uD83D\uDDFA\uFE0F Enable the Maps Static API", "https://console.cloud.google.com/apis/library/static-maps-backend.googleapis.com"],
                      ["\uD83D\uDCCD Enable the Geocoding API", "https://console.cloud.google.com/apis/library/geocoding-backend.googleapis.com"],
                      ["\uD83D\uDD11 Create an API key", "https://console.cloud.google.com/apis/credentials"],
                      ["\uD83D\uDEE1\uFE0F Set a daily quota cap", "https://console.cloud.google.com/apis/api/geocoding-backend.googleapis.com/quotas"],
                  ];
                  for (const [t, u] of links) { const a = mk("a", "display:block;color:#9bd6ff;text-decoration:none;padding:2px 0;font-size:11.5px;", t + " \u25B8"); a.href = u; a.target = "_blank"; a.rel = "noopener"; box.appendChild(a); }
                  const kRow = mk("div", "display:flex;align-items:center;gap:8px;margin:8px 0;");
                  kRow.appendChild(mk("label", "width:74px;color:#9fb3cc;flex:none;font-size:11px;", "API key"));
                  const key = mk("input", "flex:1;min-width:0;padding:5px 7px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); key.type = "password"; key.placeholder = "AIza\u2026"; kRow.appendChild(key); box.appendChild(kRow);
                  const sRow = mk("div", "display:flex;align-items:center;gap:8px;margin:6px 0;");
                  const save = mk("button", "padding:5px 14px;background:#1d6fe0;color:#fff;border:0;border-radius:6px;cursor:pointer;", "Save key");
                  const test = mk("button", "padding:5px 12px;background:#16283a;color:#bcd2e6;border:0;border-radius:6px;cursor:pointer;", "Test geocode");
                  const mmsg = mk("span", "font-size:11px;color:#7f93a8;"); sRow.appendChild(save); sRow.appendChild(test); sRow.appendChild(mmsg); box.appendChild(sRow);
                  fetch("/maps/config").then(r => r.json()).then(c => { if (c && c.hasKey) key.placeholder = "\u2022\u2022\u2022\u2022 saved \u2014 leave blank to keep"; }).catch(() => {});
                  save.onclick = async () => { if (!key.value.trim()) { mmsg.style.color = "#caa05a"; mmsg.textContent = "paste a key first"; return; } mmsg.style.color = "#7f93a8"; mmsg.textContent = "saving\u2026"; try { const r = await fetch("/maps/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: key.value.trim() }) }).then(x => x.json()); mmsg.style.color = (r && r.hasKey) ? "#9fe88f" : "#f88"; mmsg.textContent = (r && r.hasKey) ? "\u2713 key saved" : "\u2717 failed"; key.value = ""; } catch (e) { mmsg.style.color = "#f88"; mmsg.textContent = "\u2717 " + (e && e.message); } };
                  test.onclick = async () => { mmsg.style.color = "#7f93a8"; mmsg.textContent = "geocoding\u2026"; try { const r = await fetch("/maps/geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: "Warwick, RI" }) }).then(x => x.json()); mmsg.style.color = (r && r.ok) ? "#9fe88f" : "#f88"; mmsg.textContent = (r && r.ok) ? ("\u2713 " + r.lat.toFixed(3) + ", " + r.lng.toFixed(3)) : ("\u2717 " + ((r && r.error) || "failed")); } catch (e) { mmsg.style.color = "#f88"; mmsg.textContent = "\u2717 " + (e && e.message); } };
              } },
            // v1627 — Drive sub-section (bottom). Drive runs through Claude's connector, not the engine bridge; these
            // are the Google console pages for enabling the Drive API / OAuth if you wire your own access.
            { id: "drivePanel", type: "custom",
              render: (box) => {
                  const mk = (tag, css, txt) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; };
                  Object.assign(box.style, { padding: "12px 0 6px", borderTop: "1px solid #1a2c3a", marginTop: "8px" });
                  box.appendChild(mk("div", "font-size:13px;font-weight:600;color:#9fd1ff;margin:0 0 4px;", "\uD83D\uDCC1 Google Drive"));

                  // v1863 — one-glance host-setup checklist for the credentialed box (e.g. Galaxina). Collapsible
                  // so it stays out of the way, but on-screen while you click through the steps.
                  const setup = mk("details", "margin:2px 0 8px;border:1px solid #24402c;border-radius:6px;background:#0a140d;padding:6px 8px;");
                  const ssum = mk("summary", "cursor:pointer;color:#bfe9d6;font-size:11px;font-weight:600;", "\u2705 Host setup checklist (do this on the credentialed box, e.g. Galaxina)");
                  setup.appendChild(ssum);
                  const sbody = mk("div", "font-size:10.5px;color:#9fb3a6;line-height:1.6;margin-top:6px;");
                  sbody.innerHTML =
                      "<div><b style='color:#dfeee5;'>1. Connect Drive.</b> Below: \u201cBrowse for client-secret JSON\u201d (or paste Client ID + secret) \u2192 <b>Connect Drive</b> \u2192 click the \u201copen Google sign-in\u201d link \u2192 finish consent. Lands on \u201c\u2713 Drive connected \u2014 secrets saved in Windows Credential Manager.\u201d</div>"
                    + "<div style='margin-top:4px;'><b style='color:#dfeee5;'>2. Set the folder.</b> Make a folder in Drive, open it, copy the ID from the URL (after <code>folders/</code>), paste into <b>Drive folder ID</b>. (Read-only can\u2019t create folders \u2014 make it by hand.)</div>"
                    + "<div style='margin-top:4px;'><b style='color:#dfeee5;'>3. Tick both toggles:</b> \u2611 <b>auto-pull from this folder</b> and \u2611 <b>push new updates to peers</b>, then <b>Save</b>.</div>"
                    + "<div style='margin-top:4px;'><b style='color:#dfeee5;'>4. Verify.</b> Click <b>Check now</b> \u2014 expect \u201cup to date\u201d (or it pulls a waiting patch).</div>"
                    + "<div style='margin-top:4px;color:#caa05a;'><b>Only ONE box (this one) should have push ON.</b> Leave the other peers\u2019 Drive unconfigured \u2014 they just receive pushes (or use \u201cPull via a credentialed peer\u201d). Publish the app to Production on Google\u2019s Audience tab so the token doesn\u2019t expire in 7 days.</div>";
                  setup.appendChild(sbody);
                  box.appendChild(setup);

                  // v1812 — auto-update folder config (was only in server.html). This is the
                  // full-render home for it; settings.html mirrors a lightweight version.
                  box.appendChild(mk("div", "font-size:11px;color:#7f93a8;line-height:1.5;margin-bottom:6px;", "Auto-pull Claude's *.swekupdate.json patches from a Drive folder. Folder ID = the long string in the folder's URL. OAuth login (personal Drive) or a service-account key is set via the Google console links below."));
                  const fRow = mk("div", "display:flex;align-items:center;gap:8px;margin:6px 0;flex-wrap:wrap;");
                  const fIn = mk("input", "flex:1;min-width:160px;padding:6px 8px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;font:11px ui-monospace,monospace;"); fIn.placeholder = "Drive folder ID";
                  fRow.appendChild(fIn); box.appendChild(fRow);
                  const oRow = mk("div", "display:flex;align-items:center;gap:10px;margin:6px 0;flex-wrap:wrap;");
                  const enWrap = mk("label", "display:flex;align-items:center;gap:6px;font-size:11.5px;color:#cfe;cursor:pointer;");
                  const enChk = mk("input"); enChk.type = "checkbox";
                  enWrap.append(enChk, document.createTextNode("auto-pull from this folder"));
                  // v1860 — when THIS box is the credentialed one, also PUSH each new update out to peers
                  // (they apply+restart without needing Drive creds). First-answer/idle-friendly, token stays here.
                  const pushWrap = mk("label", "display:flex;align-items:center;gap:6px;font-size:11.5px;color:#cfe;cursor:pointer;");
                  const pushChk = mk("input"); pushChk.type = "checkbox";
                  pushWrap.append(pushChk, document.createTextNode("push new updates to peers"));
                  pushWrap.title = "When this box pulls a new update from Drive, fan it out to all peers so they update automatically. Turn this on only on the credentialed box (e.g. Galaxina).";
                  const saveB = mk("button", "padding:5px 12px;background:#16331f;color:#bfeccd;border:1px solid #2f6a44;border-radius:6px;cursor:pointer;font-size:11px;", "Save");
                  const checkB = mk("button", "padding:5px 12px;background:#142a3a;color:#bcdcf0;border:1px solid #2a557a;border-radius:6px;cursor:pointer;font-size:11px;", "Check now");
                  oRow.append(enWrap, pushWrap, saveB, checkB); box.appendChild(oRow);

                  // v1814 — create the folder ON Drive instead of pasting an ID. Needs a write-capable
                  // service-account key; surfaces a clear error if the credential is read-only.
                  const cRow = mk("div", "display:flex;align-items:center;gap:8px;margin:6px 0;flex-wrap:wrap;");
                  const cName = mk("input", "flex:1;min-width:140px;padding:6px 8px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;font:11px ui-monospace,monospace;"); cName.placeholder = "new folder name (e.g. SweK Engine Updates)"; cName.value = "SweK Engine Updates";
                  const createB = mk("button", "padding:5px 12px;background:#241a33;color:#d3c0ec;border:1px solid #4a3068;border-radius:6px;cursor:pointer;font-size:11px;", "Create folder on Drive");
                  cRow.append(cName, createB); box.appendChild(cRow);

                  const stat = mk("div", "font-size:11px;color:#7f93a8;min-height:14px;margin-bottom:6px;", "checking\u2026"); box.appendChild(stat);

                  const _f = window.settingsFetchJSON || ((u, o, t) => fetch(u, o).then(r => r.json()).catch(e => ({ ok: false, error: String(e) })));
                  const loadDrive = () => _f("/update/drive/status", {}, 6000).then(j => {
                      if (!j) return;
                      if (document.activeElement !== fIn) fIn.value = j.folderId || "";
                      enChk.checked = !!j.enabled;
                      pushChk.checked = !!j.pushToPeers;
                      const mode = j.mode || "none";
                      let msg = (mode === "none") ? "no OAuth/key set yet \u2014 use the console links below" : (j.configured ? ("ready \u00b7 " + mode) : (mode + " \u00b7 set a folder"));
                      if (j.last) msg += j.last.ok ? (" \u00b7 last: " + ((j.last.applied || j.last.pulled) ? "update pulled" : "up to date")) : (" \u00b7 last: " + (j.last.reason || j.last.error || "error"));
                      stat.textContent = msg;
                      stat.style.color = (mode === "none") ? "#caa05a" : "#7f93a8";
                  }).catch(() => { stat.textContent = "(bridge offline)"; });
                  saveB.onclick = () => { saveB.disabled = true; _f("/update/drive/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderId: fIn.value.trim(), enabled: enChk.checked, pushToPeers: pushChk.checked }) }, 6000).then(() => { saveB.disabled = false; loadDrive(); }).catch(() => { saveB.disabled = false; }); };
                  checkB.onclick = () => { stat.textContent = "checking\u2026"; _f("/update/drive/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, 12000).then(() => setTimeout(loadDrive, 800)).catch(() => loadDrive()); };
                  createB.onclick = () => {
                      const nm = cName.value.trim() || "SweK Engine Updates";
                      createB.disabled = true; stat.style.color = "#7f93a8"; stat.textContent = "creating \u201c" + nm + "\u201d on Drive\u2026";
                      _f("/update/drive/create-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nm }) }, 15000).then((r) => {
                          createB.disabled = false;
                          if (r && r.ok && r.id) {
                              fIn.value = r.id;   // auto-fill the new ID
                              stat.style.color = "#9fe88f"; stat.textContent = "\u2713 created \u201c" + (r.name || nm) + "\u201d \u2014 folder ID filled in" + (r.saved ? " + saved" : "");
                              setTimeout(loadDrive, 600);
                          } else {
                              stat.style.color = "#caa05a";
                              stat.textContent = "\u2717 " + ((r && r.error) || "could not create folder") + " \u2014 the auto-update credential is read-only; create the folder in Drive and paste its ID, or grant the service-account a write scope.";
                          }
                      }).catch((e) => { createB.disabled = false; stat.style.color = "#caa05a"; stat.textContent = "\u2717 " + (e && e.message || e); });
                  };
                  loadDrive();

                  // v1857 — connect a personal Google Drive via OAuth (Desktop-app client). Paste the
                  // Client ID + secret from the console, click Connect: the engine opens Google's consent
                  // in a browser on the host, catches the loopback redirect, and saves the refresh token.
                  box.appendChild(mk("div", "font-size:12px;font-weight:600;color:#bfe9d6;margin:10px 0 4px;border-top:1px solid #15252f;padding-top:8px;", "\uD83D\uDD10 Connect personal Drive (OAuth)"));
                  // v1866 — remote-session warning. The OAuth sign-in uses a loopback redirect (http://127.0.0.1:<port>),
                  // which only works if the BROWSER is on the same machine as the bridge. If you're viewing this engine
                  // from another PC (LAN or tunnel), the Google callback hits 127.0.0.1 on YOUR machine, not the host,
                  // and refuses to connect. So detect a non-local session and tell the user to run this on the host.
                  const remoteWarn = mk("div", "display:none;font-size:11px;line-height:1.5;color:#ffd9a0;background:#3a2a12;border:1px solid #6a4a20;border-radius:6px;padding:7px 9px;margin:2px 0 8px;");
                  box.appendChild(remoteWarn);
                  (function checkLocal(){
                      _f("/self/whoami", {}, 5000).then((w) => {
                          if (w && w.ok && w.local === false) {
                              const host = w.name || "the host PC";
                              remoteWarn.style.display = "block";
                              remoteWarn.innerHTML = "\u26a0 <b>You're viewing this engine remotely.</b> Google\u2019s sign-in redirects to <code>127.0.0.1</code>, which only works in a browser running <b>on the host machine itself (" + String(host).replace(/</g,"&lt;") + ")</b>. Connecting from here will fail with \u201c127.0.0.1 refused to connect.\u201d<br><b>Do this on " + String(host).replace(/</g,"&lt;") + ":</b> sit at its screen, or Remote-Desktop into it, open its own browser to <code>http://localhost:8787</code>, and run Connect there. Everything else (folder, toggles) is fine to set from here.";
                          }
                      }).catch(() => {});
                  })();
                  const oauthStat = mk("div", "font-size:11px;color:#7f93a8;margin-bottom:5px;", "checking\u2026");
                  box.appendChild(oauthStat);
                  // v1858 — browse for the client-secret JSON Google gives you when you create the Desktop-app
                  // client (shaped { installed: { client_id, client_secret, ... } }). Read it in the browser
                  // (no upload), pull out the id + secret, and fill the fields below. Saves hand-copying.
                  const fileRow = mk("div", "display:flex;align-items:center;gap:8px;margin:5px 0;flex-wrap:wrap;");
                  const fileBtn = mk("button", "padding:5px 12px;background:#2a2440;color:#cbb0ff;border:1px solid #4a4070;border-radius:6px;cursor:pointer;font-size:11px;", "\uD83D\uDCC2 Browse for client-secret JSON\u2026");
                  const fileIn = mk("input"); fileIn.type = "file"; fileIn.accept = ".json,application/json"; fileIn.style.display = "none";
                  const fileMsg = mk("span", "font-size:10.5px;color:#7f93a8;");
                  fileBtn.onclick = () => fileIn.click();
                  fileIn.onchange = () => {
                      const f = fileIn.files && fileIn.files[0]; if (!f) return;
                      const rd = new FileReader();
                      rd.onload = () => {
                          try {
                              const j = JSON.parse(String(rd.result || ""));
                              const c = j.installed || j.web || j;   // desktop app = "installed"; be lenient
                              const cid = c.client_id || "", sec = c.client_secret || "";
                              if (!cid || !sec) { fileMsg.style.color = "#f88"; fileMsg.textContent = "\u2717 no client_id/client_secret in that file \u2014 is it the OAuth client JSON?"; return; }
                              idIn.value = cid; secIn.value = sec;
                              fileMsg.style.color = "#9fe88f"; fileMsg.textContent = "\u2713 loaded \u2014 now click Connect Drive";
                              if (j.web) { fileMsg.style.color = "#caa05a"; fileMsg.textContent = "\u26a0 this looks like a WEB client (\u2018web\u2019 key). The engine needs a DESKTOP-app client \u2014 it may not sign in. Loaded anyway."; }
                          } catch (e) { fileMsg.style.color = "#f88"; fileMsg.textContent = "\u2717 couldn't parse JSON: " + (e && e.message || e); }
                          fileIn.value = "";   // allow re-picking the same file
                      };
                      rd.onerror = () => { fileMsg.style.color = "#f88"; fileMsg.textContent = "\u2717 couldn't read the file"; };
                      rd.readAsText(f);
                  };
                  fileRow.append(fileBtn, fileIn, fileMsg); box.appendChild(fileRow);
                  box.appendChild(mk("div", "font-size:10px;color:#5f7085;margin:0 0 4px;", "\u2026or paste the two values by hand:"));
                  const idRow = mk("div", "display:flex;align-items:center;gap:8px;margin:5px 0;flex-wrap:wrap;");
                  idRow.appendChild(mk("label", "width:74px;color:#9fb3cc;flex:none;font-size:11px;", "Client ID"));
                  const idIn = mk("input", "flex:1;min-width:180px;padding:6px 8px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;font:10.5px ui-monospace,monospace;"); idIn.placeholder = "xxxxx.apps.googleusercontent.com";
                  idRow.appendChild(idIn); box.appendChild(idRow);
                  const secRow = mk("div", "display:flex;align-items:center;gap:8px;margin:5px 0;flex-wrap:wrap;");
                  secRow.appendChild(mk("label", "width:74px;color:#9fb3cc;flex:none;font-size:11px;", "Secret"));
                  const secIn = mk("input", "flex:1;min-width:180px;padding:6px 8px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;font:10.5px ui-monospace,monospace;"); secIn.type = "password"; secIn.placeholder = "GOCSPX-\u2026 (client secret)";
                  secRow.appendChild(secIn); box.appendChild(secRow);
                  const cbRow = mk("div", "display:flex;align-items:center;gap:8px;margin:6px 0;flex-wrap:wrap;");
                  const connectB = mk("button", "padding:5px 14px;background:#1d3a5c;color:#cfe4ff;border:1px solid #3a6a9c;border-radius:6px;cursor:pointer;font-size:11px;", "Connect Drive");
                  const recheckB = mk("button", "padding:5px 12px;background:#16283a;color:#bcd2e6;border:1px solid #2a557a;border-radius:6px;cursor:pointer;font-size:11px;", "Check connection");
                  cbRow.append(connectB, recheckB); box.appendChild(cbRow);
                  const authUrlWrap = mk("div", "font-size:10.5px;margin:4px 0;word-break:break-all;display:none;");
                  box.appendChild(authUrlWrap);

                  const loadOauth = () => _f("/update/drive/oauth-status", {}, 6000).then((j) => {
                      if (!j || !j.ok) { oauthStat.textContent = "(status unavailable)"; return; }
                      if (j.connected && !j.pending) { oauthStat.style.color = "#9fe88f"; oauthStat.textContent = "\u2713 Drive connected via OAuth" + (j.vaultWhere ? (" \u2014 secrets saved in " + j.vaultWhere) : " \u2014 the refresh token is stored."); }
                      else if (j.pending) { oauthStat.style.color = "#caa05a"; oauthStat.textContent = "\u23f3 waiting for you to finish Google sign-in\u2026 (open the link below if no window appeared)"; if (j.authUrl) { authUrlWrap.style.display = "block"; authUrlWrap.innerHTML = ""; const a = mk("a", "color:#9ed5ff;", "\u2192 open Google sign-in"); a.href = j.authUrl; a.target = "_blank"; a.rel = "noopener"; authUrlWrap.appendChild(a); } }
                      else if (j.error) { oauthStat.style.color = "#f88"; oauthStat.textContent = "\u2717 " + j.error; }
                      else { oauthStat.style.color = "#7f93a8"; oauthStat.textContent = "not connected \u2014 paste your Desktop-app Client ID + secret, then Connect."; }
                  }).catch(() => { oauthStat.textContent = "(bridge offline)"; });
                  connectB.onclick = async () => {
                      const cid = idIn.value.trim(), sec = secIn.value.trim();
                      if (!cid || !sec) { oauthStat.style.color = "#caa05a"; oauthStat.textContent = "paste both the Client ID and the secret first"; return; }
                      // v1866 — if this session isn't on the host, the loopback callback can't reach the bridge; warn hard.
                      if (remoteWarn.style.display !== "none") {
                          if (!confirm("You appear to be connecting from another machine. Google's sign-in redirects to 127.0.0.1, which won't reach this host's browser \u2014 the callback will refuse to connect.\n\nRun Connect from the host machine's own browser (localhost:8787) instead.\n\nContinue anyway?")) return;
                      }
                      connectB.disabled = true; oauthStat.style.color = "#7f93a8"; oauthStat.textContent = "starting Google sign-in\u2026";
                      try {
                          // v1859 — this returns immediately now; the auth URL + result come from polling oauth-status.
                          const r = await _f("/update/drive/oauth-connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: cid, clientSecret: sec }) }, 8000);
                          if (r && r.ok) {
                              secIn.value = "";   // don't keep the secret in the field
                              oauthStat.style.color = "#caa05a"; oauthStat.textContent = "\u23f3 opening Google sign-in\u2026 use the link below if no window appears, then finish the consent.";
                              // poll for the URL (ready within a moment) + the final connected/error state.
                              let n = 0; const pv = setInterval(() => { loadOauth(); if (++n > 100) clearInterval(pv); }, 3000);
                              loadOauth();
                          } else { oauthStat.style.color = "#f88"; oauthStat.textContent = "\u2717 " + ((r && r.error) || "couldn't start"); }
                      } catch (e) { oauthStat.style.color = "#f88"; oauthStat.textContent = "\u2717 " + (e && e.message || e); }
                      connectB.disabled = false;
                  };
                  recheckB.onclick = () => { loadOauth(); loadDrive(); };
                  loadOauth();

                  // v1859 — pull the update THROUGH a credentialed peer when THIS box has no Drive creds.
                  // The peer with creds does the Drive fetch and hands back just the update package; the
                  // token never leaves that peer. First peer to answer wins (favours the idle one).
                  const viaRow = mk("div", "display:flex;align-items:center;gap:8px;margin:8px 0 2px;flex-wrap:wrap;border-top:1px solid #15252f;padding-top:8px;");
                  const viaBtn = mk("button", "padding:5px 12px;background:#233a2a;color:#bfeccd;border:1px solid #3a6a4a;border-radius:6px;cursor:pointer;font-size:11px;", "\u2b07 Pull update via a credentialed peer");
                  const viaMsg = mk("span", "font-size:10.5px;color:#7f93a8;");
                  viaBtn.title = "If this box has no Drive creds, ask a peer that does (e.g. Galaxina) to fetch the update from Drive and hand it over. The credential stays on that peer.";
                  viaBtn.onclick = async () => {
                      viaBtn.disabled = true; viaMsg.style.color = "#7f93a8"; viaMsg.textContent = "asking peers with Drive creds\u2026";
                      try {
                          const r = await _f("/update/drive/via-peer", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, 30000);
                          if (r && r.ok && r.via === "self") { viaMsg.style.color = "#9fe88f"; viaMsg.textContent = "\u2713 this box has creds \u2014 pulled directly" + (r.found === false ? " (nothing new)" : ""); }
                          else if (r && r.ok && r.found === false) { viaMsg.style.color = "#caa05a"; viaMsg.textContent = "\u2014 " + (r.note || "no newer update"); }
                          else if (r && r.ok) { viaMsg.style.color = "#9fe88f"; viaMsg.textContent = "\u2713 pulled via " + (r.servedBy || "a peer") + (r.fileName ? (" (" + r.fileName + ")") : "") + " \u2014 applying/restarting"; }
                          else { viaMsg.style.color = "#f88"; viaMsg.textContent = "\u2717 " + ((r && r.error) || "failed"); }
                      } catch (e) { viaMsg.style.color = "#f88"; viaMsg.textContent = "\u2717 " + (e && e.message || e); }
                      viaBtn.disabled = false;
                  };
                  viaRow.append(viaBtn, viaMsg); box.appendChild(viaRow);

                  // v1856 — OAuth setup instructions. The engine's Drive login uses the LOOPBACK flow
                  // (redirects to http://127.0.0.1:<random-port>), which is the "Desktop app" client type
                  // — NOT "Web application" (that one demands fixed redirect URIs the engine can't give,
                  // and blocks you with "URI must not be empty"). Spelled out here so the credentials are
                  // documented right where you'd wire them.
                  const help = mk("details", "margin:8px 0 4px;border:1px solid #1c2733;border-radius:6px;background:#0a0e14;padding:6px 8px;");
                  const sum = mk("summary", "cursor:pointer;color:#9ed5ff;font-size:11px;", "How to set up the OAuth client (read this first)");
                  help.appendChild(sum);
                  const hb = mk("div", "font-size:10.5px;color:#8fb3c8;line-height:1.6;margin-top:6px;");
                  hb.innerHTML =
                      "The engine signs in with Google's <b>loopback flow</b> (it catches the redirect on a random <code>127.0.0.1</code> port), so you must create the right client type:"
                    + "<div style='margin-top:5px;'><b style='color:#bfe9d6;'>1. Client type = Desktop app.</b> In the Cloud console \u2192 Credentials \u2192 Create OAuth client ID, pick <b>Desktop app</b> \u2014 NOT \u201cWeb application.\u201d Desktop app needs <b>no</b> JavaScript origins and <b>no</b> redirect URIs (the loopback redirect isn\u2019t configured in the console). If a form is demanding those URIs, you picked Web application \u2014 go back and choose Desktop app.</div>"
                    + "<div style='margin-top:5px;'><b style='color:#bfe9d6;'>2. Grab the client secret at creation.</b> Google shows the full secret only once. Copy the <b>Client ID</b> + <b>Client secret</b> immediately.</div>"
                    + "<div style='margin-top:5px;'><b style='color:#bfe9d6;'>3. Consent screen (now under \u201cGoogle Auth Platform \u2192 Audience\u201d).</b> The console was reorganized \u2014 the old \u201cOAuth consent screen\u201d menu is gone. Add your Google account under <b>Test users</b> (Audience tab) or you\u2019ll get <b>Error 403: access_denied</b> when you sign in. \u26a0 In <b>Testing</b> mode the refresh token EXPIRES after 7 days, so auto-update would silently stop after a week. For an always-on host (e.g. Galaxina), click <b>Publish app</b> (Production) on the Audience tab \u2014 for a personal app this usually needs no verification, and the token stops expiring. You\u2019ll still click past a one-time \u201cunverified app \u2192 Advanced \u2192 Go to SweK\u201d screen; that\u2019s expected.</div>"
                    + "<div style='margin-top:5px;'><b style='color:#bfe9d6;'>4. Scope:</b> add <code>https://www.googleapis.com/auth/drive.readonly</code> on the consent screen.</div>"
                    + "<div style='margin-top:5px;color:#caa05a;'>Read-only is all the engine uses (it pulls update patches). To have it <i>create</i> the updates folder for you, that needs a write scope/service-account instead \u2014 otherwise just make the folder in Drive and paste its ID above.</div>";
                  help.appendChild(hb);
                  box.appendChild(help);

                  box.appendChild(mk("div", "font-size:11px;color:#7f93a8;line-height:1.5;margin:8px 0 4px;border-top:1px solid #15252f;padding-top:8px;", "Google console pages for enabling the Drive API + OAuth / service-account credentials:"));
                  const links = [["\uD83D\uDCC1 Enable the Drive API", "https://console.cloud.google.com/apis/library/drive.googleapis.com"], ["\u2795 Create OAuth client (pick Desktop app)", "https://console.cloud.google.com/apis/credentials/oauthclient"], ["\uD83D\uDC64 Audience \u2014 test users + Publish app", "https://console.cloud.google.com/auth/audience"], ["\uD83D\uDD10 All credentials", "https://console.cloud.google.com/apis/credentials"], ["\uD83D\uDDC2\uFE0F Open Google Drive", "https://drive.google.com"]];
                  for (const [t, u] of links) { const a = mk("a", "display:block;color:#9bd6ff;text-decoration:none;padding:2px 0;font-size:11.5px;", t + " \u25B8"); a.href = u; a.target = "_blank"; a.rel = "noopener"; box.appendChild(a); }
              } },
        ]},
        // v1620 — Art Frame: cast a generated image to a Home Assistant media_player (Chromecast / Nest Hub /
        // cast-capable TV or frame). The bridge rewrites the URL to a LAN-reachable one so the cast device can
        // fetch it, then calls media_player.play_media.
        { id: "artframe", label: "Art Frame", icon: "🖼️", controls: [
            { id: "artframePanel", type: "custom",
              render: (box) => {
                  Object.assign(box.style, { padding: "10px 0", fontSize: "12px", lineHeight: "1.5" });
                  const mk = (tag, css, txt) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; };
                  box.textContent = "";
                  box.appendChild(mk("div", "color:#7f93a8;margin-bottom:10px;", "Cast an image to a display via Home Assistant \u2014 a Chromecast, Nest Hub, or any cast-capable TV / frame. The cast device fetches the image over your LAN. Needs Home Assistant connected (Connectors)."));

                  const tRow = mk("div", "display:flex;align-items:center;gap:8px;margin:6px 0;");
                  tRow.appendChild(mk("label", "width:74px;color:#9fb3cc;flex:none;", "Display"));
                  const sel = mk("select", "flex:1;min-width:0;padding:6px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;");
                  const refresh = mk("button", "padding:6px 10px;background:#16283a;color:#bcd2e6;border:0;border-radius:6px;cursor:pointer;", "\u21BB"); tRow.appendChild(sel); tRow.appendChild(refresh); box.appendChild(tRow);

                  const iRow = mk("div", "display:flex;align-items:center;gap:8px;margin:6px 0;");
                  iRow.appendChild(mk("label", "width:74px;color:#9fb3cc;flex:none;", "Image"));
                  const img = mk("input", "flex:1;min-width:0;padding:6px 8px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); img.placeholder = "/GPU_Assets/...png  or  https://...jpg"; iRow.appendChild(img); box.appendChild(iRow);

                  const sRow = mk("div", "display:flex;align-items:center;gap:8px;margin:8px 0;");
                  const sendBtn = mk("button", "padding:6px 16px;background:#1d6fe0;color:#fff;border:0;border-radius:6px;cursor:pointer;", "Send to frame");
                  const msg = mk("span", "font-size:11px;color:#7f93a8;"); sRow.appendChild(sendBtn); sRow.appendChild(msg); box.appendChild(sRow);

                  const loadTargets = async () => {
                      sel.innerHTML = "<option>loading\u2026</option>";
                      try { const j = await fetch("/frame/targets", { cache: "no-store" }).then(r => r.json());
                          sel.innerHTML = "";
                          const ts = (j && j.targets) || [];
                          if (!ts.length) { sel.innerHTML = "<option value=''>no media_players (is HA connected?)</option>"; return; }
                          for (const t of ts) { const o = document.createElement("option"); o.value = t.entity_id; o.textContent = t.name + (t.state ? ("  \u00b7 " + t.state) : ""); sel.appendChild(o); }
                      } catch { sel.innerHTML = "<option value=''>couldn't load (HA?)</option>"; }
                  };
                  refresh.onclick = loadTargets;
                  sendBtn.onclick = async () => {
                      const entity_id = sel.value, imageUrl = img.value.trim();
                      if (!entity_id) { msg.style.color = "#caa05a"; msg.textContent = "pick a display"; return; }
                      if (!imageUrl) { msg.style.color = "#caa05a"; msg.textContent = "enter an image URL/path"; return; }
                      msg.style.color = "#7f93a8"; msg.textContent = "sending\u2026";
                      try { const j = await fetch("/frame/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity_id, imageUrl }) }).then(r => r.json());
                          if (j && j.ok) { msg.style.color = "#9fe88f"; msg.textContent = "\u2713 sent \u2192 " + entity_id; } else { msg.style.color = "#f88"; msg.textContent = "\u2717 " + ((j && j.error) || "failed"); }
                      } catch (e) { msg.style.color = "#f88"; msg.textContent = "\u2717 " + (e && e.message); }
                  };

                  // v1624 — send the image above to a REMOTE peer's frame (relayed via the cloud).
                  box.appendChild(mk("div", "border-top:1px solid #1a2c3a;margin:13px 0 9px;"));
                  box.appendChild(mk("div", "color:#7f93a8;margin-bottom:8px;", "Or send the image above to a remote peer's frame across the network. It's relayed through the cloud, and that peer casts it to its own designated display."));
                  const rRow = mk("div", "display:flex;align-items:center;gap:8px;margin:6px 0;");
                  rRow.appendChild(mk("label", "width:74px;color:#9fb3cc;flex:none;", "Peer"));
                  const psel = mk("select", "flex:1;min-width:0;padding:6px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;");
                  const rsend = mk("button", "padding:6px 14px;background:#5a3aa0;color:#fff;border:0;border-radius:6px;cursor:pointer;", "Send to peer"); rRow.appendChild(psel); rRow.appendChild(rsend); box.appendChild(rRow);
                  const rmsg = mk("div", "font-size:11px;color:#7f93a8;margin:2px 0 4px;"); box.appendChild(rmsg);
                  const loadPeers = async () => { psel.innerHTML = "<option>loading\u2026</option>"; try { const cfg = await fetch("/cloud/config", { cache: "no-store" }).then(r => r.json()).catch(() => ({})); const selfId = (cfg && cfg.id) || ""; const j = await fetch("/cloud/directory", { cache: "no-store" }).then(r => r.json()); psel.innerHTML = ""; const ps = ((j && j.peers) || []).filter(p => p.id !== selfId); if (!ps.length) { psel.innerHTML = "<option value=''>no cloud peers (enable Cloud)</option>"; return; } for (const p of ps) { const o = document.createElement("option"); o.value = p.id; o.textContent = p.name || p.id; psel.appendChild(o); } } catch { psel.innerHTML = "<option value=''>couldn't load</option>"; } };
                  rsend.onclick = async () => { const to = psel.value, imageUrl = img.value.trim(); if (!to) { rmsg.style.color = "#caa05a"; rmsg.textContent = "pick a peer"; return; } if (!imageUrl) { rmsg.style.color = "#caa05a"; rmsg.textContent = "enter an image above"; return; } rmsg.style.color = "#7f93a8"; rmsg.textContent = "relaying\u2026"; try { const r = await window.sendArtToPeer(to, imageUrl); if (r && r.ok) { rmsg.style.color = "#9fe88f"; rmsg.textContent = "\u2713 sent to " + ((psel.options[psel.selectedIndex] || {}).textContent || to); } else { rmsg.style.color = "#f88"; rmsg.textContent = "\u2717 " + ((r && r.error) || "failed"); } } catch (e) { rmsg.style.color = "#f88"; rmsg.textContent = "\u2717 " + (e && e.message); } };

                  // v1624 — which of MY displays a peer's incoming art lands on.
                  box.appendChild(mk("div", "border-top:1px solid #1a2c3a;margin:13px 0 9px;"));
                  const dRow = mk("div", "display:flex;align-items:center;gap:8px;margin:6px 0;");
                  dRow.appendChild(mk("label", "color:#9fb3cc;flex:none;", "Incoming art \u2192"));
                  const dsel = mk("select", "flex:1;min-width:0;padding:6px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); dRow.appendChild(dsel); box.appendChild(dRow);
                  box.appendChild(mk("div", "font-size:11px;color:#6f7d8c;", "Which of your displays a remote peer's art casts to. Leave as (first available) to auto-pick."));
                  const loadDefault = async () => { dsel.innerHTML = "<option value=''>(first available)</option>"; try { const tj = await fetch("/frame/targets", { cache: "no-store" }).then(r => r.json()); for (const t of ((tj && tj.targets) || [])) { const o = document.createElement("option"); o.value = t.entity_id; o.textContent = t.name; dsel.appendChild(o); } const dj = await fetch("/frame/default", { cache: "no-store" }).then(r => r.json()); dsel.value = (dj && dj.defaultEntity) || ""; } catch {} };
                  dsel.addEventListener("change", () => { fetch("/frame/default", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity_id: dsel.value }) }).catch(() => {}); });

                  loadTargets(); loadPeers(); loadDefault();
              } },
        ]},
        // v1867 — Message to TV: push a toast/overlay to an Android TV (Shield) via HA notify.<service>.
        { id: "tvNotify", label: "Message to TV", icon: "📺", controls: [
            { id: "tvNotifyPanel", type: "custom",
              render: (box) => {
                  const mk = (tag, css, txt) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; };
                  Object.assign(box.style, { padding: "10px 0", fontSize: "12px", lineHeight: "1.5" });
                  box.textContent = "";
                  box.appendChild(mk("div", "color:#7f93a8;margin-bottom:10px;", "Pop a toast/overlay onto an Android TV (e.g. the Shield) through Home Assistant. Needs the \u201CNotifications for Android TV / Fire TV\u201D integration in HA (which you already have if toasts appear on the TV)."));

                  const mRow = mk("div", "display:flex;align-items:flex-start;gap:8px;margin:6px 0;");
                  mRow.appendChild(mk("label", "width:64px;color:#9fb3cc;flex:none;padding-top:6px;", "Message"));
                  const msgIn = mk("textarea", "flex:1;min-width:0;padding:6px 8px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;min-height:44px;resize:vertical;font:12px inherit;"); msgIn.placeholder = "e.g. Update pushed to peers \u2014 restarting"; mRow.appendChild(msgIn); box.appendChild(mRow);

                  const tRow = mk("div", "display:flex;align-items:center;gap:8px;margin:6px 0;");
                  tRow.appendChild(mk("label", "width:64px;color:#9fb3cc;flex:none;", "Title"));
                  const titleIn = mk("input", "flex:1;min-width:0;padding:6px 8px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); titleIn.placeholder = "(optional) SweK"; tRow.appendChild(titleIn); box.appendChild(tRow);

                  const dRow = mk("div", "display:flex;align-items:center;gap:8px;margin:6px 0;");
                  dRow.appendChild(mk("label", "width:64px;color:#9fb3cc;flex:none;", "TV"));
                  const tvSel = mk("select", "flex:1;min-width:0;padding:6px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;");
                  const tvRefresh = mk("button", "padding:6px 10px;background:#16283a;color:#bcd2e6;border:0;border-radius:6px;cursor:pointer;", "\u21BB"); dRow.append(tvSel, tvRefresh); box.appendChild(dRow);

                  // options row: duration + position + color
                  const oRow = mk("div", "display:flex;align-items:center;gap:8px;margin:6px 0;flex-wrap:wrap;");
                  oRow.appendChild(mk("label", "width:64px;color:#9fb3cc;flex:none;", "Options"));
                  const durIn = mk("input", "width:62px;padding:5px 7px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); durIn.type = "number"; durIn.min = "1"; durIn.value = "6"; durIn.title = "duration (seconds)";
                  oRow.append(durIn, mk("span", "font-size:10.5px;color:#7f93a8;", "sec"));
                  const posSel = mk("select", "padding:5px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); ["bottom-right", "bottom-left", "top-right", "top-left", "center"].forEach(p => { const o = document.createElement("option"); o.value = p; o.textContent = p; posSel.appendChild(o); });
                  const colSel = mk("select", "padding:5px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); ["", "grey", "black", "indigo", "green", "red", "cyan", "teal", "amber", "pink"].forEach(c => { const o = document.createElement("option"); o.value = c; o.textContent = c || "(default color)"; colSel.appendChild(o); });
                  oRow.append(posSel, colSel); box.appendChild(oRow);

                  const sRow = mk("div", "display:flex;align-items:center;gap:8px;margin:10px 0;");
                  const sendBtn = mk("button", "padding:6px 16px;background:#1d6fe0;color:#fff;border:0;border-radius:6px;cursor:pointer;", "Send to TV");
                  const sMsg = mk("span", "font-size:11px;color:#7f93a8;"); sRow.append(sendBtn, sMsg); box.appendChild(sRow);

                  const loadTvs = async () => {
                      tvSel.innerHTML = "<option>loading\u2026</option>";
                      try {
                          const j = await fetch("/ha/notify-services", { cache: "no-store" }).then(r => r.json());
                          tvSel.innerHTML = "";
                          const svcs = (j && j.services) || [];
                          if (!svcs.length) { tvSel.innerHTML = "<option value=''>no notify.* services (is the Android TV integration set up in HA?)</option>"; return; }
                          for (const s of svcs) { const o = document.createElement("option"); o.value = s.service; o.textContent = s.full + (s.looksLikeTv ? "  \u2022 TV?" : ""); tvSel.appendChild(o); }
                      } catch { tvSel.innerHTML = "<option value=''>couldn't load (HA connected?)</option>"; }
                  };
                  tvRefresh.onclick = loadTvs;
                  sendBtn.onclick = async () => {
                      const message = msgIn.value.trim();
                      if (!message) { sMsg.style.color = "#caa05a"; sMsg.textContent = "type a message"; return; }
                      if (!tvSel.value) { sMsg.style.color = "#caa05a"; sMsg.textContent = "pick a TV"; return; }
                      sMsg.style.color = "#7f93a8"; sMsg.textContent = "sending\u2026";
                      const payload = { service: tvSel.value, message, title: titleIn.value.trim() || undefined, duration: parseInt(durIn.value, 10) || 6, position: posSel.value, color: colSel.value || undefined };
                      try {
                          const j = await fetch("/ha/tv-notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(r => r.json());
                          if (j && j.ok) { sMsg.style.color = "#9fe88f"; sMsg.textContent = "\u2713 sent to " + tvSel.value; } else { sMsg.style.color = "#f88"; sMsg.textContent = "\u2717 " + ((j && j.error) || "failed"); }
                      } catch (e) { sMsg.style.color = "#f88"; sMsg.textContent = "\u2717 " + (e && e.message); }
                  };
                  loadTvs();

                  // v1868 — auto-notify: pop a toast automatically when engine events fire.
                  box.appendChild(mk("div", "font-size:12px;font-weight:600;color:#bfe9d6;margin:14px 0 4px;border-top:1px solid #15252f;padding-top:10px;", "\uD83D\uDD14 Auto-notify the TV on events"));
                  const anStat = mk("div", "font-size:11px;color:#7f93a8;margin-bottom:6px;", "");
                  box.appendChild(anStat);
                  const anMaster = mk("label", "display:flex;align-items:center;gap:6px;font-size:12px;color:#cfe;cursor:pointer;margin:4px 0;");
                  const anChk = mk("input"); anChk.type = "checkbox";
                  anMaster.append(anChk, document.createTextNode("Auto-notify enabled"));
                  box.appendChild(anMaster);
                  const evLabels = { newEmail: "New email", genDone: "Generation done", arrival: "Someone home", haAlert: "HA alert (smoke/CO/etc.)", consoleError: "Engine error", driveUpdate: "Update pulled from Drive", updatePushed: "Update pushed to peers" };
                  const evWrap = mk("div", "display:flex;flex-direction:column;gap:3px;margin:4px 0 4px 18px;");
                  const evChks = {};
                  for (const k of Object.keys(evLabels)) { const l = mk("label", "display:flex;align-items:center;gap:6px;font-size:11px;color:#9fb3cc;cursor:pointer;"); const cb = mk("input"); cb.type = "checkbox"; evChks[k] = cb; l.append(cb, document.createTextNode(evLabels[k])); evWrap.appendChild(l); }
                  box.appendChild(evWrap);
                  const anBtnRow = mk("div", "display:flex;align-items:center;gap:8px;margin:6px 0 2px;");
                  const anSave = mk("button", "padding:5px 12px;background:#16331f;color:#bfeccd;border:1px solid #2f6a44;border-radius:6px;cursor:pointer;font-size:11px;", "Save auto-notify");
                  const anTest = mk("button", "padding:5px 12px;background:#142a3a;color:#bcdcf0;border:1px solid #2a557a;border-radius:6px;cursor:pointer;font-size:11px;", "Test toast");
                  const anMsg = mk("span", "font-size:10.5px;color:#7f93a8;"); anBtnRow.append(anSave, anTest, anMsg); box.appendChild(anBtnRow);
                  box.appendChild(mk("div", "font-size:10px;color:#6a7a88;margin-top:4px;", "Uses the TV + options above. Turn this on only on ONE box (e.g. the one near the TV) so events don't double-toast."));

                  const loadAuto = () => fetch("/tvnotify/config").then(r => r.json()).then((c) => {
                      if (!c) return;
                      anChk.checked = !!c.enabled;
                      for (const k of Object.keys(evChks)) evChks[k].checked = !!(c.events && c.events[k] && c.events[k].on);
                      anStat.textContent = c.enabled ? "on" : "off";
                  }).catch(() => { anStat.textContent = "(bridge offline)"; });
                  anSave.onclick = async () => {
                      anMsg.style.color = "#7f93a8"; anMsg.textContent = "saving\u2026";
                      const events = {}; for (const k of Object.keys(evChks)) events[k] = { on: evChks[k].checked };
                      const body = { enabled: anChk.checked, events };
                      // carry the currently-picked TV + options so auto-notify uses the same target.
                      if (tvSel.value) body.service = tvSel.value;
                      body.duration = parseInt(durIn.value, 10) || 6; body.position = posSel.value; if (colSel.value) body.color = colSel.value;
                      try { const r = await fetch("/tvnotify/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(x => x.json()); anMsg.style.color = "#9fe88f"; anMsg.textContent = "\u2713 saved"; loadAuto(); } catch (e) { anMsg.style.color = "#f88"; anMsg.textContent = "\u2717 " + (e && e.message); }
                  };
                  anTest.onclick = async () => {
                      anMsg.style.color = "#7f93a8"; anMsg.textContent = "sending test\u2026";
                      try { const r = await fetch("/tvnotify/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "genDone" }) }).then(x => x.json()); if (r && r.ok) { anMsg.style.color = "#9fe88f"; anMsg.textContent = "\u2713 test toast sent"; } else { anMsg.style.color = "#caa05a"; anMsg.textContent = "\u2014 " + ((r && (r.error || r.skipped)) || "not sent (enable + pick a TV)"); } } catch (e) { anMsg.style.color = "#f88"; anMsg.textContent = "\u2717 " + (e && e.message); }
                  };
                  loadAuto();
              } },
        ]},
        // v799 — Console Tools tab. The engine exposes ~40 user-facing
        // console APIs (window.X) that landed during dev rounds and never
        // got UI surfacing. This tab is the registry. Each entry has a
        // "Run" button (for no-args commands) or an "Open in devtools"
        // helper that drops the call signature on the clipboard.
        { id: "torrents", label: "Torrents", icon: "\uD83E\uDDF2", controls: [
            { id: "torrentPanel", type: "custom", render: (box) => {
                const mk = (tag, css, txt) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; };
                const fmtSpeed = (b) => b < 1024 ? b + " B/s" : b < 1048576 ? (b / 1024).toFixed(0) + " KB/s" : (b / 1048576).toFixed(1) + " MB/s";
                const fmtSize = (b) => b < 1048576 ? (b / 1024).toFixed(0) + " KB" : b < 1073741824 ? (b / 1048576).toFixed(0) + " MB" : (b / 1073741824).toFixed(2) + " GB";
                const fmtEta = (s) => (s == null || s < 0) ? "" : s < 60 ? s + "s" : s < 3600 ? Math.round(s / 60) + "m" : Math.round(s / 3600) + "h";
                box.appendChild(mk("div", "font-size:12px;color:#9fb3cc;line-height:1.5;margin-bottom:8px;", "Control BiglyBT through its Web Remote plugin. In BiglyBT: install \u201CBiglyBT Web Remote\u201D (Tools \u2192 Plugins \u2192 Get Plugins) and turn on \u201CAllow Remote Control on LAN,\u201D then enter the host:port it shows."));
                const row = (lab) => { const r = mk("div", "display:flex;align-items:center;gap:8px;margin:5px 0;"); r.appendChild(mk("label", "width:60px;flex:none;color:#9fb3cc;font-size:11px;", lab)); return r; };
                const hostRow = row("Host"); const host = mk("input", "flex:1;min-width:0;padding:5px 7px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); host.placeholder = "127.0.0.1"; hostRow.appendChild(host); box.appendChild(hostRow);
                const portRow = row("Port"); const port = mk("input", "width:90px;padding:5px 7px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); port.placeholder = "9091"; portRow.appendChild(port); portRow.appendChild(mk("span", "font-size:10.5px;color:#7f93a8;", "(use the port BiglyBT shows)")); box.appendChild(portRow);
                const userRow = row("User"); const user = mk("input", "flex:1;min-width:0;padding:5px 7px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); user.placeholder = "(optional)"; userRow.appendChild(user); box.appendChild(userRow);
                const passRow = row("Pass"); const pass = mk("input", "flex:1;min-width:0;padding:5px 7px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); pass.type = "password"; pass.placeholder = "(optional)"; passRow.appendChild(pass); box.appendChild(passRow);
                const btnRow = mk("div", "display:flex;align-items:center;gap:8px;margin:8px 0;");
                const save = mk("button", "padding:5px 14px;background:#1d6fe0;color:#fff;border:0;border-radius:6px;cursor:pointer;", "Save");
                const testBtn = mk("button", "padding:5px 12px;background:#16283a;color:#bcd2e6;border:0;border-radius:6px;cursor:pointer;", "Test");
                const voxBtn = mk("button", "padding:5px 12px;background:#243a52;color:#bcd2e6;border:0;border-radius:6px;cursor:pointer;margin-left:auto;", "\uD83E\uDDCA 3D voxel view");
                const msg = mk("span", "font-size:11px;color:#7f93a8;"); btnRow.append(save, testBtn, msg, voxBtn); box.appendChild(btnRow);
                voxBtn.onclick = () => window.open("/torrents.html", "_blank");
                fetch("/torrent/config").then(r => r.json()).then(c => { if (c) { host.value = c.host || ""; port.value = c.port || ""; } }).catch(() => {});
                save.onclick = async () => { msg.style.color = "#7f93a8"; msg.textContent = "saving\u2026"; try { await fetch("/torrent/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: host.value.trim(), port: port.value.trim(), user: user.value, pass: pass.value }) }).then(x => x.json()); msg.style.color = "#9fe88f"; msg.textContent = "\u2713 saved"; load(); } catch (e) { msg.style.color = "#f88"; msg.textContent = "\u2717 " + (e && e.message); } };
                testBtn.onclick = async () => { msg.style.color = "#7f93a8"; msg.textContent = "testing\u2026"; try { const r = await fetch("/torrent/test").then(x => x.json()); if (r && r.ok) { msg.style.color = "#9fe88f"; msg.textContent = "\u2713 BiglyBT " + (r.version || "") + " (rpc " + (r.rpcVersion || "?") + ")"; } else { msg.style.color = "#f88"; msg.textContent = "\u2717 " + ((r && r.error) || "failed"); } } catch (e) { msg.style.color = "#f88"; msg.textContent = "\u2717 " + (e && e.message); } };
                const addRow = mk("div", "display:flex;gap:8px;margin:10px 0 6px;");
                const mag = mk("input", "flex:1;min-width:0;padding:6px 8px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:6px;"); mag.placeholder = "paste a magnet link or .torrent URL"; addRow.appendChild(mag);
                const addBtn = mk("button", "padding:6px 14px;background:#2c7a4a;color:#fff;border:0;border-radius:6px;cursor:pointer;flex:none;", "Add"); addRow.appendChild(addBtn);
                const upInput = mk("input"); upInput.type = "file"; upInput.accept = ".torrent,application/x-bittorrent"; upInput.style.display = "none";
                const upBtn = mk("button", "padding:6px 12px;background:#2c5a7a;color:#fff;border:0;border-radius:6px;cursor:pointer;flex:none;", "\uD83D\uDCC4 .torrent"); addRow.append(upInput, upBtn); box.appendChild(addRow);
                upBtn.onclick = () => upInput.click();
                upInput.onchange = () => {
                    const f = upInput.files && upInput.files[0]; if (!f) return;
                    const rd = new FileReader();
                    rd.onload = async () => {
                        const b64 = String(rd.result || "").split(",").pop();   // strip the data:...;base64, prefix
                        msg.style.color = "#7f93a8"; msg.textContent = "uploading \u201C" + f.name + "\u201D\u2026";
                        try {
                            const r = await fetch("/torrent/addfile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: b64 }) }).then(x => x.json());
                            if (r && r.ok) { msg.style.color = "#9fe88f"; msg.textContent = r.duplicate ? "already added" : ("\u2713 added " + (r.name || f.name)); load(); }
                            else { msg.style.color = "#f88"; msg.textContent = "\u2717 " + ((r && r.error) || "failed"); }
                        } catch (e) { msg.style.color = "#f88"; msg.textContent = "\u2717 " + (e && e.message); }
                        upInput.value = "";
                    };
                    rd.readAsDataURL(f);
                };
                addBtn.onclick = async () => { const m = mag.value.trim(); if (!m) { msg.style.color = "#caa05a"; msg.textContent = "paste a magnet first"; return; } msg.style.color = "#7f93a8"; msg.textContent = "adding\u2026"; try { const r = await fetch("/torrent/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ magnet: m }) }).then(x => x.json()); if (r && r.ok) { msg.style.color = "#9fe88f"; msg.textContent = r.duplicate ? "already added" : ("\u2713 added " + (r.name || "")); mag.value = ""; load(); } else { msg.style.color = "#f88"; msg.textContent = "\u2717 " + ((r && r.error) || "failed"); } } catch (e) { msg.style.color = "#f88"; msg.textContent = "\u2717 " + (e && e.message); } };
                const sess = mk("div", "font-size:11px;color:#8fb0c4;margin:6px 0;"); box.appendChild(sess);
                const list = mk("div", "display:flex;flex-direction:column;gap:6px;"); box.appendChild(list);
                const act = async (p, id, extra) => { try { await fetch("/torrent/" + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ ids: [id] }, extra || {})) }); load(); } catch {} };
                let _busy = false;
                const load = async () => {
                    if (_busy) return;
                    // v1647 — don't re-render (and clobber) a per-torrent limit input the user is mid-edit
                    if (list.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;
                    _busy = true;
                    try {
                        let j; try { j = await fetch("/torrent/status").then(r => r.json()); } catch { sess.textContent = "bridge offline"; return; }
                        if (!j || !j.ok) { sess.style.color = "#caa05a"; sess.textContent = (j && j.error) || "not connected \u2014 set host:port + Save"; list.innerHTML = ""; return; }
                        sess.style.color = "#8fb0c4"; sess.textContent = (j.session ? ("\u2193 " + fmtSpeed(j.session.down) + "    \u2191 " + fmtSpeed(j.session.up) + "    ") : "") + j.count + " torrent" + (j.count === 1 ? "" : "s");
                        list.innerHTML = "";
                        if (!j.torrents.length) { list.appendChild(mk("div", "color:#7f93a8;font-size:12px;padding:8px;", "No torrents.")); return; }
                        for (const t of j.torrents) {
                            const card = mk("div", "background:#0d1825;border:1px solid #1b2f42;border-radius:8px;padding:8px 10px;");
                            const top = mk("div", "display:flex;align-items:center;gap:8px;");
                            const nm = mk("div", "flex:1;min-width:0;font-size:12px;color:#dce8f4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;", t.name); nm.title = t.name; top.appendChild(nm);
                            const badge = mk("span", "font-size:10px;padding:1px 6px;border-radius:4px;flex:none;color:#cde;"); badge.style.background = t.done ? "#10401f" : t.state === "downloading" ? "#173656" : t.state === "stopped" ? "#3a3a3a" : "#5a4410"; badge.textContent = t.done ? "done" : t.state; top.appendChild(badge);
                            card.appendChild(top);
                            const barWrap = mk("div", "height:6px;background:#0a1620;border-radius:4px;overflow:hidden;margin:5px 0;");
                            const bar = mk("div", "height:100%;width:" + t.pct + "%;background:" + (t.done ? "#3bd17a" : "linear-gradient(90deg,#1f9fd0,#2bd6ff)") + ";"); barWrap.appendChild(bar); card.appendChild(barWrap);
                            const meta = mk("div", "display:flex;align-items:center;gap:10px;font-size:10.5px;color:#8fb0c4;");
                            meta.appendChild(mk("span", null, t.pct + "%"));
                            if (t.down) meta.appendChild(mk("span", null, "\u2193" + fmtSpeed(t.down)));
                            if (t.up) meta.appendChild(mk("span", null, "\u2191" + fmtSpeed(t.up)));
                            meta.appendChild(mk("span", null, fmtSize(t.size)));
                            if (fmtEta(t.eta)) meta.appendChild(mk("span", null, "ETA " + fmtEta(t.eta)));
                            if (t.peers) meta.appendChild(mk("span", null, t.peers + "p"));
                            if (t.error) meta.appendChild(mk("span", "color:#f88;", t.error));
                            const sp = mk("div", "margin-left:auto;display:flex;gap:5px;");
                            const mkb = (lab, fn, c2) => { const b = mk("button", "font-size:10px;padding:2px 8px;background:" + (c2 || "#16283a") + ";color:#bcd2e6;border:0;border-radius:4px;cursor:pointer;", lab); b.onclick = fn; return b; };
                            if (t.state === "stopped") sp.appendChild(mkb("Start", () => act("start", t.id)));
                            else sp.appendChild(mkb("Stop", () => act("stop", t.id)));
                            sp.appendChild(mkb("\u2715", () => { if (confirm("Remove \u201C" + t.name + "\u201D from BiglyBT?\n\nThe downloaded data files are left on disk.")) act("remove", t.id, { deleteData: false }); }, "#3a1f1f"));
                            meta.appendChild(sp); card.appendChild(meta);
                            // v1647 — per-torrent speed caps (KB/s; blank = unlimited). torrent-set via /torrent/limits.
                            const limRow = mk("div", "display:flex;align-items:center;gap:5px;margin-top:6px;font-size:10px;color:#7f93a8;");
                            limRow.appendChild(mk("span", null, "cap KB/s"));
                            const limIn = (val, ph) => { const i = mk("input", "width:54px;padding:2px 5px;background:#0c1622;color:#dce8f4;border:1px solid #21384a;border-radius:4px;font-size:10px;"); i.type = "number"; i.min = "0"; i.placeholder = ph; if (val) i.value = val; return i; };
                            const dIn = limIn(t.downLimit, "\u2193 \u221E"), uIn = limIn(t.upLimit, "\u2191 \u221E");
                            limRow.append(mk("span", null, "\u2193"), dIn, mk("span", null, "\u2191"), uIn, mkb("Set", () => act("limits", t.id, { down: dIn.value, up: uIn.value })));
                            card.appendChild(limRow);
                            list.appendChild(card);
                        }
                    } finally { _busy = false; }
                };
                load(); setInterval(load, 4000);
            } },
        ] },
        { id: "console", label: "Console Tools", icon: "⌨️", controls: _buildConsoleToolsControls() },
        // v939 — Tasker integration. Transport + endpoints/keys live here so the
        // whole Tasker suite is configured from the Settings panel. window.taskerTrigger
        // reads these (localStorage) and POSTs /tasker/trigger; the bridge dispatches.
        { id: "tasker", label: "Tasker", icon: "📲", controls: [
            { id: "taskerTransport", label: "Tasker transport",
              hint: "How the engine reaches Tasker. Tasker HTTP = phone/VM on your LAN (no cloud). Join/AutoRemote = cloud. MQTT = via your broker.",
              type: "select",
              options: ["tasker_http", "join", "mqtt", "autoremote"],
              get: () => { try { return localStorage.getItem("voxelengine.tasker.transport") || "tasker_http"; } catch { return "tasker_http"; } },
              set: (v) => { try { localStorage.setItem("voxelengine.tasker.transport", v); window.taskerSync && window.taskerSync(); } catch {} } },
            _credentialControl({
                id: "taskerEndpoints",
                label: "Tasker endpoints & keys",
                hint: "Fill only what your chosen transport needs. Stored locally on this device.",
                fields: [
                    { key: "httpUrl",       label: "Tasker HTTP", placeholder: "http://<android-ip>:1821", optional: true },
                    { key: "joinKey",       label: "Join key",    type: "password", placeholder: "Join API key", optional: true },
                    { key: "joinDevice",    label: "Join device", placeholder: "device id or name", optional: true },
                    { key: "autoremoteKey", label: "AutoRemote",  type: "password", placeholder: "AutoRemote key", optional: true },
                    { key: "mqttTopic",     label: "MQTT topic",  placeholder: "tasker/cmd", optional: true },
                ],
                onSave: async (v) => {
                    try {
                        localStorage.setItem("voxelengine.tasker.httpUrl",       v.httpUrl || "");
                        localStorage.setItem("voxelengine.tasker.joinKey",       v.joinKey || "");
                        localStorage.setItem("voxelengine.tasker.joinDevice",    v.joinDevice || "");
                        localStorage.setItem("voxelengine.tasker.autoremoteKey", v.autoremoteKey || "");
                        localStorage.setItem("voxelengine.tasker.mqttTopic",     v.mqttTopic || "");
                        try { window.taskerSync && window.taskerSync(); } catch {}
                        return { ok: true, message: "Saved ✓ (synced to bridge)" };
                    } catch (e) { return { ok: false, error: e?.message || String(e) }; }
                },
                loadStatus: async () => {
                    try {
                        return { prefill: {
                            httpUrl:       localStorage.getItem("voxelengine.tasker.httpUrl") || "",
                            joinKey:       localStorage.getItem("voxelengine.tasker.joinKey") || "",
                            joinDevice:    localStorage.getItem("voxelengine.tasker.joinDevice") || "",
                            autoremoteKey: localStorage.getItem("voxelengine.tasker.autoremoteKey") || "",
                            mqttTopic:     localStorage.getItem("voxelengine.tasker.mqttTopic") || "",
                        } };
                    } catch { return null; }
                },
            }),
            { id: "taskerTest", label: "Send test command to Tasker",
              hint: "Fires command 'test' via the selected transport — check it lands in Tasker.",
              type: "button",
              action: async () => {
                  try {
                      const r = await window.taskerTrigger?.("test", {});
                      alert(r ? ("Tasker → " + JSON.stringify(r)) : "taskerTrigger not loaded");
                  } catch (e) { alert("Tasker test failed: " + (e?.message || e)); }
              } },
            { id: "taskerMacroEditor", type: "custom", label: "Macros",
              render(box) {
                  const wrap = document.createElement("div");
                  const title = document.createElement("div");
                  title.textContent = "Macros";
                  Object.assign(title.style, { fontSize: "13px", marginBottom: "2px", fontWeight: "600" });
                  wrap.appendChild(title);
                  const hint = document.createElement("div");
                  hint.textContent = "Named commands the engine sends to Tasker. 'command' is what your Tasker task matches on. Saved here AND pushed to the bridge so your phone can fire them too.";
                  Object.assign(hint.style, { fontSize: "11px", color: C.dim, marginBottom: "8px" });
                  wrap.appendChild(hint);
                  const list = document.createElement("div");
                  wrap.appendChild(list);
                  const msg = document.createElement("div");
                  Object.assign(msg.style, { fontSize: "11px", color: C.dim, marginTop: "4px", minHeight: "14px" });
                  function redraw() {
                      list.innerHTML = "";
                      const macros = (window.taskerMacros?.get?.() || []);
                      if (!macros.length) {
                          const e = document.createElement("div");
                          e.textContent = "No macros yet — add one below.";
                          Object.assign(e.style, { fontSize: "12px", color: C.dim, marginBottom: "6px" });
                          list.appendChild(e);
                      }
                      macros.forEach((m, i) => {
                          const row = document.createElement("div");
                          Object.assign(row.style, { display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" });
                          const lbl = document.createElement("div");
                          lbl.textContent = (m.label || m.command || m.id) + "  ·  " + (m.command || "") + (m.transport ? "  [" + m.transport + "]" : "");
                          Object.assign(lbl.style, { flex: "1 1 auto", minWidth: "0", fontSize: "12px", color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
                          const fire = document.createElement("button");
                          fire.textContent = "▶"; fire.title = "Fire now";
                          Object.assign(fire.style, { background: C.tabOn, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "3px 9px", cursor: "pointer", fontSize: "12px" });
                          fire.addEventListener("click", async () => {
                              msg.textContent = "Firing " + (m.label || m.id) + "…"; msg.style.color = C.dim;
                              let r = null; try { r = await window.taskerFire?.(m.id); } catch (e) { r = { ok: false, error: e?.message }; }
                              if (r?.ok) { msg.textContent = "Fired ✓ (" + r.transport + ")"; msg.style.color = "#9f8"; }
                              else { msg.textContent = "Failed: " + (r?.error || "unknown"); msg.style.color = "#f88"; }
                          });
                          const del = document.createElement("button");
                          del.textContent = "✕"; del.title = "Delete";
                          Object.assign(del.style, { background: C.bg, color: "#f88", border: `1px solid ${C.border}`, borderRadius: "5px", padding: "3px 9px", cursor: "pointer", fontSize: "12px" });
                          del.addEventListener("click", async () => {
                              const next = (window.taskerMacros?.get?.() || []).filter((_, j) => j !== i);
                              await window.taskerMacros?.set?.(next); redraw();
                          });
                          row.appendChild(lbl); row.appendChild(fire); row.appendChild(del);
                          list.appendChild(row);
                      });
                  }
                  const form = document.createElement("div");
                  Object.assign(form.style, { display: "flex", flexDirection: "column", gap: "5px", marginTop: "8px", borderTop: `1px solid ${C.border}`, paddingTop: "8px" });
                  const inLabel = document.createElement("input");
                  const inCmd = document.createElement("input");
                  const inParams = document.createElement("input");
                  [["Label", inLabel, "Flash the lights"], ["Command", inCmd, "flash_lights"], ["Params JSON (optional)", inParams, '{"color":"red"}']].forEach(([ph, inp, eg]) => {
                      inp.type = "text"; inp.placeholder = ph + (eg ? "  e.g. " + eg : ""); inp.autocomplete = "off"; inp.spellcheck = false;
                      Object.assign(inp.style, { background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 8px", fontSize: "12px" });
                      form.appendChild(inp);
                  });
                  const selMacroTransport = document.createElement("select");
                  [["", "transport: default"], ["tasker_http", "transport: Tasker HTTP"], ["join", "transport: Join"], ["mqtt", "transport: MQTT"], ["autoremote", "transport: AutoRemote"]].forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; selMacroTransport.appendChild(o); });
                  Object.assign(selMacroTransport.style, { background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 8px", fontSize: "12px" });
                  form.appendChild(selMacroTransport);
                  const add = document.createElement("button");
                  add.textContent = "Add macro";
                  Object.assign(add.style, { marginTop: "2px", background: C.tabOn, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 16px", cursor: "pointer", fontSize: "12px", alignSelf: "flex-start" });
                  add.addEventListener("click", async () => {
                      const label = inLabel.value.trim(), command = inCmd.value.trim();
                      if (!command) { msg.textContent = "Command is required."; msg.style.color = "#fb6"; return; }
                      let params = {};
                      const pv = inParams.value.trim();
                      if (pv) { try { params = JSON.parse(pv); } catch { msg.textContent = "Params must be valid JSON."; msg.style.color = "#fb6"; return; } }
                      const id = command.replace(/[^a-z0-9_]+/gi, "_").toLowerCase() + "_" + Date.now().toString(36);
                      const macro = { id, label: label || command, command, params };
                      if (selMacroTransport.value) macro.transport = selMacroTransport.value;
                      const next = (window.taskerMacros?.get?.() || []).concat([macro]);
                      msg.textContent = "Saving…"; msg.style.color = C.dim;
                      let r = null; try { r = await window.taskerMacros?.set?.(next); } catch (e) { r = { ok: false, error: e?.message }; }
                      inLabel.value = ""; inCmd.value = ""; inParams.value = ""; selMacroTransport.value = "";
                      if (r?.ok) { msg.textContent = "Added ✓ (synced)"; msg.style.color = "#9f8"; }
                      else { msg.textContent = "Saved locally · bridge sync: " + (r?.error || "?"); msg.style.color = "#fb6"; }
                      redraw();
                  });
                  form.appendChild(add);
                  wrap.appendChild(form);
                  wrap.appendChild(msg);
                  box.appendChild(wrap);
                  redraw();
              } },
            { id: "taskerInbound", type: "custom", label: "Inbound (phone → engine)",
              render(box) {
                  const wrap = document.createElement("div");
                  const title = document.createElement("div");
                  title.textContent = "Inbound (phone → engine)";
                  Object.assign(title.style, { fontSize: "13px", marginBottom: "2px", fontWeight: "600" });
                  wrap.appendChild(title);
                  const hint = document.createElement("div");
                  hint.textContent = "When Tasker POSTs an event (AutoNotification/AutoVoice), the engine reacts. Map a command (exact) or a voice keyword (contained) to a built-in action. Every event also fires a 'tasker:event' window event for custom handlers.";
                  Object.assign(hint.style, { fontSize: "11px", color: C.dim, marginBottom: "8px" });
                  wrap.appendChild(hint);
                  const list = document.createElement("div"); wrap.appendChild(list);
                  const msg = document.createElement("div");
                  Object.assign(msg.style, { fontSize: "11px", color: C.dim, marginTop: "4px", minHeight: "14px" });
                  function redraw() {
                      list.innerHTML = "";
                      const rules = window.taskerInbound?.rules?.get?.() || [];
                      if (!rules.length) {
                          const e = document.createElement("div");
                          e.textContent = "No inbound rules yet — add one below.";
                          Object.assign(e.style, { fontSize: "12px", color: C.dim, marginBottom: "6px" });
                          list.appendChild(e);
                      }
                      rules.forEach((r, i) => {
                          const row = document.createElement("div");
                          Object.assign(row.style, { display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" });
                          const lbl = document.createElement("div");
                          lbl.textContent = (r.matchType === "voice" ? '🎙 "' + r.match + '"' : "⌘ " + r.match) + "  →  " + r.action;
                          Object.assign(lbl.style, { flex: "1 1 auto", minWidth: "0", fontSize: "12px", color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
                          const del = document.createElement("button");
                          del.textContent = "✕"; del.title = "Delete";
                          Object.assign(del.style, { background: C.bg, color: "#f88", border: `1px solid ${C.border}`, borderRadius: "5px", padding: "3px 9px", cursor: "pointer", fontSize: "12px" });
                          del.addEventListener("click", () => { const next = (window.taskerInbound?.rules?.get?.() || []).filter((_, j) => j !== i); window.taskerInbound?.rules?.set?.(next); redraw(); });
                          row.appendChild(lbl); row.appendChild(del); list.appendChild(row);
                      });
                  }
                  const form = document.createElement("div");
                  Object.assign(form.style, { display: "flex", flexDirection: "column", gap: "5px", marginTop: "8px", borderTop: `1px solid ${C.border}`, paddingTop: "8px" });
                  const inMatch = document.createElement("input");
                  inMatch.type = "text"; inMatch.placeholder = 'match — command e.g. "lights_on", or voice keyword e.g. "rain"'; inMatch.autocomplete = "off"; inMatch.spellcheck = false;
                  Object.assign(inMatch.style, { background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 8px", fontSize: "12px" });
                  const selType = document.createElement("select");
                  [["command", "match: command (exact)"], ["voice", "match: voice keyword (contains)"]].forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; selType.appendChild(o); });
                  Object.assign(selType.style, { background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 8px", fontSize: "12px" });
                  const selAction = document.createElement("select");
                  (window.taskerInbound?.actions || ["event", "toast"]).forEach(a => { const o = document.createElement("option"); o.value = a; o.textContent = "action: " + a; selAction.appendChild(o); });
                  Object.assign(selAction.style, { background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 8px", fontSize: "12px" });
                  const add = document.createElement("button");
                  add.textContent = "Add rule";
                  Object.assign(add.style, { marginTop: "2px", background: C.tabOn, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 16px", cursor: "pointer", fontSize: "12px", alignSelf: "flex-start" });
                  add.addEventListener("click", () => {
                      const match = inMatch.value.trim();
                      if (!match) { msg.textContent = "Enter a match string."; msg.style.color = "#fb6"; return; }
                      const next = (window.taskerInbound?.rules?.get?.() || []).concat([{ match, matchType: selType.value, action: selAction.value }]);
                      window.taskerInbound?.rules?.set?.(next);
                      inMatch.value = "";
                      msg.textContent = "Added ✓"; msg.style.color = "#9f8";
                      redraw();
                  });
                  form.appendChild(inMatch); form.appendChild(selType); form.appendChild(selAction); form.appendChild(add);
                  wrap.appendChild(form);
                  const sim = document.createElement("div");
                  Object.assign(sim.style, { display: "flex", gap: "6px", marginTop: "10px" });
                  const inSim = document.createElement("input");
                  inSim.type = "text"; inSim.placeholder = 'simulate inbound voice/text e.g. "make it rain"'; inSim.autocomplete = "off"; inSim.spellcheck = false;
                  Object.assign(inSim.style, { flex: "1 1 auto", minWidth: "0", background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 8px", fontSize: "12px" });
                  const simBtn = document.createElement("button");
                  simBtn.textContent = "Simulate";
                  Object.assign(simBtn.style, { background: C.tabOn, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 14px", cursor: "pointer", fontSize: "12px" });
                  simBtn.addEventListener("click", async () => {
                      const text = inSim.value.trim(); if (!text) { return; }
                      msg.textContent = "Sending…"; msg.style.color = C.dim;
                      let r = null; try { r = await window.taskerInbound?.simulate?.({ kind: "voice", text }); } catch (e) { r = { ok: false, error: e?.message }; }
                      msg.textContent = r?.ok ? "Sent ✓ — watch for the engine reaction (~2s)" : ("Failed: " + (r?.error || "?"));
                      msg.style.color = r?.ok ? "#9f8" : "#f88";
                  });
                  sim.appendChild(inSim); sim.appendChild(simBtn);
                  wrap.appendChild(sim);
                  wrap.appendChild(msg);
                  box.appendChild(wrap);
                  redraw();
              } },
            { id: "taskerRoundTrip", type: "custom", label: "AutoInput round-trip",
              render(box) {
                  const wrap = document.createElement("div");
                  const title = document.createElement("div");
                  title.textContent = "AutoInput round-trip (read screen → engine)";
                  Object.assign(title.style, { fontSize: "13px", marginBottom: "2px", fontWeight: "600" });
                  wrap.appendChild(title);
                  const hint = document.createElement("div");
                  hint.textContent = 'Sends a command and waits for Tasker to reply. Your Tasker task should run AutoInput to read the app, then POST /tasker/event with the SAME replyId it received (top-level "replyId") plus the scraped text/params.';
                  Object.assign(hint.style, { fontSize: "11px", color: C.dim, marginBottom: "8px" });
                  wrap.appendChild(hint);
                  const rowTop = document.createElement("div");
                  Object.assign(rowTop.style, { display: "flex", gap: "6px" });
                  const inCmd = document.createElement("input");
                  inCmd.type = "text"; inCmd.placeholder = "command e.g. read_screen"; inCmd.value = "read_screen"; inCmd.autocomplete = "off"; inCmd.spellcheck = false;
                  Object.assign(inCmd.style, { flex: "1 1 auto", minWidth: "0", background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 8px", fontSize: "12px" });
                  const go = document.createElement("button");
                  go.textContent = "Request & read";
                  Object.assign(go.style, { background: C.tabOn, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 14px", cursor: "pointer", fontSize: "12px", whiteSpace: "nowrap" });
                  rowTop.appendChild(inCmd); rowTop.appendChild(go);
                  wrap.appendChild(rowTop);
                  const out = document.createElement("div");
                  Object.assign(out.style, { marginTop: "8px", fontSize: "12px", color: C.text, background: C.bg, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "7px 9px", minHeight: "34px", whiteSpace: "pre-wrap", wordBreak: "break-word" });
                  out.textContent = "(no result yet)";
                  wrap.appendChild(out);
                  const msg = document.createElement("div");
                  Object.assign(msg.style, { fontSize: "11px", color: C.dim, marginTop: "4px", minHeight: "14px" });
                  wrap.appendChild(msg);
                  go.addEventListener("click", async () => {
                      const cmd = inCmd.value.trim() || "read_screen";
                      msg.textContent = "Sent — waiting for Tasker reply (≤15s)…"; msg.style.color = C.dim;
                      out.textContent = "(waiting…)"; go.disabled = true;
                      try {
                          const ev = await window.taskerRequest?.(cmd, {});
                          out.textContent = (ev && (ev.text || (ev.params && JSON.stringify(ev.params)))) || "(empty reply)";
                          msg.textContent = "Reply received ✓"; msg.style.color = "#9f8";
                      } catch (e) {
                          out.textContent = "(no result)";
                          msg.textContent = "Failed: " + (e?.message || e); msg.style.color = "#f88";
                      } finally { go.disabled = false; }
                  });
                  box.appendChild(wrap);
              } },
            { id: "taskerJoinPush", type: "custom", label: "Join push",
              render(box) {
                  const wrap = document.createElement("div");
                  const title = document.createElement("div");
                  title.textContent = "Join push (engine → phone notification)";
                  Object.assign(title.style, { fontSize: "13px", marginBottom: "2px", fontWeight: "600" });
                  wrap.appendChild(title);
                  const hint = document.createElement("div");
                  hint.textContent = "Pushes a notification straight to your phone via Join (uses the Join key + device above). Separate from triggering a Tasker command. Optional URL opens when tapped.";
                  Object.assign(hint.style, { fontSize: "11px", color: C.dim, marginBottom: "8px" });
                  wrap.appendChild(hint);
                  const inTitle = document.createElement("input"), inText = document.createElement("input"), inUrl = document.createElement("input");
                  [["Title", inTitle], ["Text", inText], ["URL (optional)", inUrl]].forEach(([ph, inp]) => { inp.type = "text"; inp.placeholder = ph; inp.autocomplete = "off"; inp.spellcheck = false; Object.assign(inp.style, { background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 8px", fontSize: "12px", marginBottom: "5px", display: "block", width: "100%", boxSizing: "border-box" }); wrap.appendChild(inp); });
                  const send = document.createElement("button");
                  send.textContent = "Push to phone";
                  Object.assign(send.style, { background: C.tabOn, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 16px", cursor: "pointer", fontSize: "12px" });
                  const msg = document.createElement("div");
                  Object.assign(msg.style, { fontSize: "11px", color: C.dim, marginTop: "4px", minHeight: "14px" });
                  send.addEventListener("click", async () => {
                      const t = inTitle.value.trim(), text = inText.value.trim(), url = inUrl.value.trim();
                      if (!t && !text) { msg.textContent = "Enter a title or text."; msg.style.color = "#fb6"; return; }
                      msg.textContent = "Pushing…"; msg.style.color = C.dim; send.disabled = true;
                      let r = null; try { r = await window.joinPush?.({ title: t, text, url: url || undefined }); } catch (e) { r = { ok: false, error: e?.message }; }
                      send.disabled = false;
                      if (r?.ok) { msg.textContent = "Pushed ✓"; msg.style.color = "#9f8"; }
                      else { msg.textContent = "Failed: " + (r?.error || "need Join key+device above"); msg.style.color = "#f88"; }
                  });
                  wrap.appendChild(send); wrap.appendChild(msg);
                  box.appendChild(wrap);
              } },
        ]},
    ];
}

// v799 — registry of curated console commands. Pulled from the engine's
// window.X surface. Each entry: { id, label, hint, signature, run? }.
// run() = callable no-args; otherwise signature is shown for copy-paste.
const CONSOLE_TOOLS = [
    // === World / spawn / teleport ===
    { group: "World", id: "freshWorld",  label: "Fresh world (random seed)",   sig: "window.freshWorld()", run: () => window.freshWorld?.() },
    { group: "World", id: "resetWorld",  label: "Reset current world",         sig: "window.resetWorld()", run: () => window.resetWorld?.() },
    { group: "World", id: "hardReset",   label: "Hard reset (clear all state)", sig: "window.hardResetWorld()", run: () => window.hardResetWorld?.() },
    { group: "World", id: "gohome",      label: "Teleport to (0, 30, 0)",       sig: "window.gohome(y=30)", run: () => window.gohome?.() },
    { group: "World", id: "regenHere",   label: "Regenerate chunks at camera", sig: "window.regenHere()", run: () => window.regenHere?.() },
    { group: "World", id: "unstick",     label: "Unstick camera",              sig: "window.unstick()", run: () => window.unstick?.() },
    { group: "World", id: "worldSeed",   label: "Print current seed",          sig: "window.worldSeed()", run: async () => { const s = await window.worldSeed?.(); alert("Seed: " + s); } },
    { group: "World", id: "knockMtn",    label: "Knock down mountains (>30m)", sig: "window.knockDownMountains(maxY=30)", run: () => window.knockDownMountains?.() },

    // === Weather / FX ===
    { group: "Weather", id: "weather",     label: "Weather sys (open in devtools)", sig: "window.weatherSystem" },
    { group: "Weather", id: "kaijuWeath",  label: "Kaiju weather sys",              sig: "window.kaijuWeather" },
    // v823 — day/night cycle controls
    { group: "Weather", id: "dnNow",       label: "Current time + weather label",   sig: "window.dayNight.label", run: () => { try { alert(`time: ${window.dayNight.label} (t=${window.dayNight.t.toFixed(3)})\nweather: ${window.weather.state}${window.dayNight.paused ? " ⏸" : ""}${window.weather.pinned ? " 📌" : ""}\nwind: ${window.dayNight.windSpeed.toFixed(0)}m/s · temp: ${window.dayNight.temperature.toFixed(0)}°C\nF2=dawn F3=noon F4=dusk F5=midnight F6=pause`); } catch (e) { alert("dayNight not available: " + e?.message); } } },
    { group: "Weather", id: "dnNoon",      label: "Jump to noon",                   sig: "window.dayNight.noon()",     run: () => alert(window.dayNight.noon()) },
    { group: "Weather", id: "dnDawn",      label: "Jump to dawn",                   sig: "window.dayNight.dawn()",     run: () => alert(window.dayNight.dawn()) },
    { group: "Weather", id: "dnDusk",      label: "Jump to dusk",                   sig: "window.dayNight.dusk()",     run: () => alert(window.dayNight.dusk()) },
    { group: "Weather", id: "dnMidnight",  label: "Jump to midnight",               sig: "window.dayNight.midnight()", run: () => alert(window.dayNight.midnight()) },
    { group: "Weather", id: "dnToggle",    label: "Pause/play time",                sig: "window.dayNight.toggle()",   run: () => alert(window.dayNight.toggle()) },
    { group: "Weather", id: "dnCycle",     label: "Set day-cycle seconds (prompt)", sig: "window.dayNight.setCycle(sec)", run: () => { const v = prompt("Real seconds per in-game day (default 600):", String(window.dayNight.cycleSec || 600)); if (v != null) alert(window.dayNight.setCycle(parseFloat(v))); } },
    { group: "Weather", id: "wPin",        label: "Pin current weather state",      sig: "window.weather.pin()",       run: () => alert(window.weather.pin()) },
    { group: "Weather", id: "wUnpin",      label: "Unpin (auto resumes)",           sig: "window.weather.unpin()",     run: () => alert(window.weather.unpin()) },
    { group: "Weather", id: "wClear",      label: "Set weather: clear",             sig: "window.weather.clear()",     run: () => { window.weather.clear(); } },
    { group: "Weather", id: "wRain",       label: "Set weather: rain",              sig: "window.weather.rain()",      run: () => { window.weather.rain(); } },
    { group: "Weather", id: "wStorm",      label: "Set weather: storm",             sig: "window.weather.storm()",     run: () => { window.weather.storm(); } },
    { group: "Weather", id: "wSnow",       label: "Set weather: snow",              sig: "window.weather.snow()",      run: () => { window.weather.snow(); } },
    { group: "Weather", id: "wBlizzard",   label: "Set weather: blizzard",          sig: "window.weather.blizzard()",  run: () => { window.weather.blizzard(); } },
    // v824 — save/restore + clear localStorage state
    { group: "Weather", id: "dnSave",      label: "Save time+weather now",          sig: "window.dayNight.save()",     run: () => { window.dayNight.save(); } },
    { group: "Weather", id: "dnRestore",   label: "Restore time+weather from save", sig: "window.dayNight.restore()",  run: () => alert(window.dayNight.restore() ? "restored" : "no save found") },
    { group: "Weather", id: "dnClearSave", label: "Clear saved time+weather",       sig: "window.dayNight.clear()",    run: () => alert(window.dayNight.clear()) },
    { group: "Weather", id: "fire",        label: "Fire toggle",                     sig: "window.fire" },
    { group: "Weather", id: "lava",        label: "Lava toggle",                     sig: "window.lava" },
    { group: "Weather", id: "freeze",      label: "Freeze toggle",                   sig: "window.freeze" },
    { group: "Weather", id: "lahar",       label: "Lahar (volcanic mudflow)",        sig: "window.lahar" },
    { group: "Weather", id: "quake",       label: "Earthquake",                      sig: "window.quake" },
    { group: "Weather", id: "vortex",      label: "Vortex system",                   sig: "window.vortex" },
    { group: "Weather", id: "flashFlood",  label: "Flash flood",                     sig: "window.flashFlood({...opts})" },

    // === Kaiju ===
    { group: "Kaiju", id: "summon",      label: "Summon kaiju at camera",         sig: "window.summon(kind='sky')", run: () => window.summon?.() },
    { group: "Kaiju", id: "kaijuSim",    label: "Kaiju sim controls",             sig: "window.kaijuSim" },
    { group: "Kaiju", id: "creatures",   label: "Spawn creature collection",       sig: "window.creatures" },
    { group: "Kaiju", id: "creature",    label: "AI-generate creature",            sig: "window.creature('prompt', opts)" },

    // === Audio ===
    { group: "Audio", id: "muteAll",    label: "Mute all audio",                  sig: "window.muteAllAudio()", run: () => window.muteAllAudio?.() },
    { group: "Audio", id: "unmuteAll",  label: "Unmute all audio",                sig: "window.unmuteAllAudio()", run: () => window.unmuteAllAudio?.() },
    { group: "Audio", id: "toggleMute", label: "Toggle mute",                     sig: "window.toggleMuteAll()", run: () => window.toggleMuteAll?.() },
    { group: "Audio", id: "voice",      label: "Voice (TTS) controls",            sig: "window.voice" },
    { group: "Audio", id: "audio",      label: "Audio bus",                       sig: "window.audio" },

    // === Splat / 3DGS ===
    { group: "Splat", id: "splatScene",     label: "Splat scene (load/save/clear)", sig: "window.splatScene" },
    { group: "Splat", id: "splatList",      label: "List splat layers",              sig: "window.splatScene.list()", run: () => { try { console.log(window.splatScene.list()); alert("See devtools console."); } catch (e) { alert(e?.message); } } },
    { group: "Splat", id: "splatRestore",   label: "Restore splat state from localStorage", sig: "window.splatScene.restoreState()", run: async () => { try { const n = await window.splatScene.restoreState(); alert("Restored " + n + " layers"); } catch (e) { alert(e?.message); } } },

    // === Sheets ===
    { group: "Sheets", id: "sheetsStatus",  label: "Sheets bridge status",         sig: "window.sheets.status()", run: async () => { try { alert(JSON.stringify(await window.sheets.status(), null, 2)); } catch (e) { alert(e?.message); } } },

    // === Asset Library (v799) ===
    { group: "Asset Library", id: "alPanel",   label: "Open Asset Library panel",  sig: "window.assetLibraryPanel.show()", run: () => window.assetLibraryPanel?.show() },
    { group: "Asset Library", id: "alStatus",  label: "Library status",             sig: "window.assetLibrary.status()", run: async () => { try { alert(JSON.stringify(await window.assetLibrary.status(), null, 2)); } catch (e) { alert(e?.message); } } },
    { group: "Asset Library", id: "alList",    label: "List all assets",            sig: "window.assetLibrary.list()", run: async () => { try { const r = await window.assetLibrary.list(); console.log(r); alert(`${r.count || 0} assets — see devtools console.`); } catch (e) { alert(e?.message); } } },

    // === Diagnostics ===
    { group: "Diagnostics", id: "engineVer",   label: "Engine version",               sig: "window.engineVersion()", run: () => alert(window.engineVersion?.()) },
    { group: "Diagnostics", id: "engineStat",  label: "Engine status snapshot",       sig: "window.engineStatus()", run: () => { try { console.log(window.engineStatus()); alert("See devtools console."); } catch (e) { alert(e?.message); } } },
    { group: "Diagnostics", id: "perf",        label: "Perf toggle / HUD",            sig: "window.perf" },
    { group: "Diagnostics", id: "diag",        label: "Diagnostics namespace",        sig: "window.diag" },
    { group: "Diagnostics", id: "inspectStor", label: "Inspect localStorage usage",   sig: "window.inspectStorage()", run: () => { try { console.log(window.inspectStorage()); alert("See devtools console."); } catch (e) { alert(e?.message); } } },

    // === Water / sim ===
    { group: "Water/Sim", id: "water",          label: "Water controls",               sig: "window.water" },
    { group: "Water/Sim", id: "waterfall",      label: "Waterfall toggle",             sig: "window.waterfall(on=true)" },
    { group: "Water/Sim", id: "erosionHM",      label: "Erosion heightmap",            sig: "window.erosionHM" },
    { group: "Water/Sim", id: "flood",          label: "Flood controls",               sig: "window.flood" },
    { group: "Water/Sim", id: "underwater",     label: "Underwater FX",                sig: "window.underwater" },

    // === Misc ===
    { group: "Misc", id: "vegetation",      label: "Vegetation controls",          sig: "window.vegetation" },
    { group: "Misc", id: "clouds",          label: "Cloud controls",               sig: "window.clouds" },
    { group: "Misc", id: "schematic",       label: "Schematic loader",             sig: "window.schematic" },
    { group: "Misc", id: "wad",             label: "WAD (DOOM) loader",            sig: "window.wad" },
    { group: "Misc", id: "ai",              label: "AI provider bridge",           sig: "window.ai" },
    // v820 — universal demo viewer (Boids, Life, Gray-Scott, etc.)
    { group: "Misc", id: "demoViewer",      label: "🎛 Open universal demo viewer", sig: "open('universal-viewer.html')", run: () => window.open("universal-viewer.html", "_blank") },
    // v827 — entity↔rig bridge controls
    { group: "Misc", id: "entityRigList",   label: "🦴 List rigged entity meshes",  sig: "window.entityRig.listRiggedAssets()", run: () => {
        try {
            const items = window.entityRig.listRiggedAssets();
            if (items.length === 0) { alert("No rigged meshes loaded.\n\nThe attach API only works on meshes whose GLB included JOINTS_0+WEIGHTS_0 + animations (kaiju, civ markers with skin, etc.)."); return; }
            const lines = items.map(it => `${it.assetId}\n   joints: ${it.jointCount} · clips: ${it.clipNames.join(", ") || "(none)"}`).join("\n\n");
            alert("Rigged assets in scene:\n\n" + lines);
        } catch (e) { alert("Failed: " + e?.message); }
    } },
    { group: "Misc", id: "entityRigActive", label: "🦴 List active rig bridges",    sig: "window.entityRig.list()", run: () => {
        const ids = window.entityRig.list();
        alert(ids.length === 0 ? "No active rig bridges." : "Active entity rig bridges:\n\n  " + ids.join("\n  "));
    } },
    // v828 — POC modules built on rig foundation
    { group: "Misc", id: "camCinHint",     label: "🎬 Camera cinematic API",       sig: "window.cameraCinematic", run: () => {
        alert("Camera cinematic API:\n\n" +
              "  window.cameraCinematic.startRecording()\n" +
              "  window.cameraCinematic.snapshot('label')       — fly to a viewpoint, then snapshot\n" +
              "  window.cameraCinematic.stopRecording()         — returns the clip\n" +
              "  window.cameraCinematic.play(clip)              — plays it back\n" +
              "  window.cameraCinematic.saveToLibrary('mycam')  — saves to asset library");
    } },
    { group: "Misc", id: "entHudHint",     label: "💀 Entity HUD API",             sig: "window.entityHud", run: () => {
        alert("Entity HUD API (health bars + name tags):\n\n" +
              "  window.entityHud.attach('kaiju-1', { pos:[10,30,5], name:'Kaiju Alpha', hp:75, hpMax:100 })\n" +
              "  window.entityHud.update('kaiju-1', { hp: 50 })  — update HP, color auto-shifts to yellow/red\n" +
              "  window.entityHud.attach('hero', { boneRef:{ layerId:'splat1', idx:3 }, name:'Hero', hp:100 })  — anchored to a bone\n" +
              "  window.entityHud.detach('kaiju-1')");
    } },
    { group: "Misc", id: "jointEmHint",    label: "🔥 Joint particle emitter API", sig: "window.jointEmitter", run: () => {
        alert("Joint emitter API (particles from bones):\n\n" +
              "  window.jointEmitter.add('mouth-flame', {\n" +
              "    ownerId: 'kaiju-1',\n" +
              "    boneName: 'mouth',\n" +
              "    rate: 60,                              // particles/sec\n" +
              "    config: { vxRange:[-1,1], vyRange:[2,4], r:1, g:0.5, b:0, a:0.8, ttl:1.2, gravity:-2 }\n" +
              "  });\n" +
              "  window.jointEmitter.pause('mouth-flame') / .resume / .remove");
    } },
    { group: "Misc", id: "forceSkinHint",  label: "🔧 Force-skin static meshes",   sig: "window.forceSkin", run: () => {
        alert("Force-skin static meshes:\n\n" +
              "  const rigResp = await window.assetLibrary.get('my_rig');\n" +
              "  const r = window.forceSkin.apply(assetId, rigResp.data);\n" +
              "  // → mesh now has aJoints+aWeights VBOs, isRigged=true\n" +
              "  // Then attach a clip via:\n" +
              "  await window.entityRig.attach(entityId, 'my_rig', 'my_clip', { assetId });\n\n" +
              "  window.forceSkin.revert(assetId)  — restores static mesh");
    } },
];

function _buildConsoleToolsControls() {
    const controls = [];
    controls.push({
        id: "consoleNote", type: "custom", label: "About",
        render: (box) => {
            const d = document.createElement("div");
            d.innerHTML = "Curated list of <b>~40 console-accessible APIs</b> built across rounds. " +
                          "Each entry shows the call signature so you can paste into devtools (F12). " +
                          "Some have a <b>Run</b> button for one-shot tests. " +
                          "<br><br>If something here is stale or you've visually confirmed a feature works fine without the console hook, " +
                          "tell the build to remove the exposure to keep the surface clean.";
            Object.assign(d.style, { fontSize: "12px", color: "#aab", lineHeight: "1.4", padding: "2px 0 6px" });
            box.appendChild(d);
        }
    });
    // Group entries by their group field
    const byGroup = {};
    for (const t of CONSOLE_TOOLS) (byGroup[t.group] = byGroup[t.group] || []).push(t);
    for (const [group, items] of Object.entries(byGroup)) {
        controls.push({
            id: "consoleGroup_" + group.replace(/[^a-z0-9]/gi, "_"),
            type: "custom",
            label: group,
            render: (box) => {
                const header = document.createElement("div");
                header.textContent = group;
                Object.assign(header.style, {
                    fontSize: "12px", fontWeight: "600", color: "#7af",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    margin: "10px 0 4px",
                });
                box.appendChild(header);
                for (const t of items) {
                    const row = document.createElement("div");
                    Object.assign(row.style, {
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "3px 0", fontSize: "12px",
                    });
                    const nameBox = document.createElement("div");
                    Object.assign(nameBox.style, { flex: "1", minWidth: 0 });
                    const name = document.createElement("div");
                    name.textContent = t.label;
                    name.style.color = "#cde";
                    const sig = document.createElement("div");
                    sig.textContent = t.sig;
                    Object.assign(sig.style, {
                        fontSize: "10.5px", color: "#7a8", fontFamily: "monospace",
                        opacity: "0.75", whiteSpace: "nowrap", overflow: "hidden",
                        textOverflow: "ellipsis",
                    });
                    nameBox.appendChild(name);
                    nameBox.appendChild(sig);
                    row.appendChild(nameBox);

                    if (t.run) {
                        const btn = document.createElement("button");
                        btn.textContent = "Run";
                        Object.assign(btn.style, {
                            background: "#234", color: "#cde", border: "1px solid #456",
                            borderRadius: "4px", padding: "3px 9px", cursor: "pointer",
                            fontSize: "11px",
                        });
                        btn.addEventListener("click", async () => {
                            btn.disabled = true; btn.textContent = "...";
                            try { await t.run(); } catch (e) { alert(e?.message); }
                            btn.disabled = false; btn.textContent = "Run";
                        });
                        row.appendChild(btn);
                    } else {
                        const btn = document.createElement("button");
                        btn.textContent = "Copy";
                        btn.title = "Copy call signature to clipboard";
                        Object.assign(btn.style, {
                            background: "#243", color: "#cdc", border: "1px solid #465",
                            borderRadius: "4px", padding: "3px 9px", cursor: "pointer",
                            fontSize: "11px",
                        });
                        btn.addEventListener("click", () => {
                            try { navigator.clipboard?.writeText(t.sig); btn.textContent = "✓"; setTimeout(() => btn.textContent = "Copy", 800); }
                            catch { alert("Clipboard unavailable — manually copy: " + t.sig); }
                        });
                        row.appendChild(btn);
                    }
                    box.appendChild(row);
                }
            }
        });
    }
    return controls;
}

const C = {
    bg:     "rgba(12, 16, 22, 0.97)",
    panel:  "rgba(20, 26, 34, 0.98)",
    border: "rgba(90, 200, 255, 0.30)",
    accent: "#5cc8ff",
    text:   "#dfe7ef",
    dim:    "#8a97a6",
    tabOn:  "rgba(92, 200, 255, 0.16)",
};

// ─── v850: Remote-introspection helpers ────────────────────────────────
//
// describeSettingsSchema(schema) → JSON-safe snapshot of the entire
// settings panel: tab list, each tab's controls, each control's current
// value + type metadata. The phone "PC Settings" tab consumes this to
// render rows generically. get() values are captured at describe time;
// caller can re-describe for fresh values.
//
// applySettingsValue(schema, tabId, controlId, value) → finds the
// control by (tabId, controlId) and invokes its set(value). For
// type:"button" the value is ignored and the button's set() (treated
// as the action) is called. Returns {ok, value?, error?}.
//
// Custom controls (type:"custom") can't be remoted in v850 since their
// behavior is in a render() closure; they appear in describe() with
// type:"custom" so the phone can show a "open on PC" placeholder.
//
export function describeSettingsSchema(schema) {
    if (!Array.isArray(schema)) return [];
    const out = [];
    for (const tab of schema) {
        if (!tab || !tab.id) continue;
        const ctrls = [];
        for (const c of (tab.controls || [])) {
            if (!c || !c.id) continue;
            const entry = {
                id: c.id,
                label: c.label ?? c.id,
                hint:  c.hint ?? "",
                type:  c.type ?? "toggle",
            };
            // Capture current value via getter; swallow throws.
            try {
                if (typeof c.get === "function") {
                    const v = c.get();
                    // Treat undefined as "no value" rather than null —
                    // some getters return undefined for "not yet loaded".
                    if (v !== undefined) entry.value = v;
                }
            } catch (e) {
                entry.error = e?.message ?? String(e);
            }
            // Type-specific metadata
            if (entry.type === "slider") {
                if (c.min != null)  entry.min  = c.min;
                if (c.max != null)  entry.max  = c.max;
                if (c.step != null) entry.step = c.step;
                if (c.unit)         entry.unit = c.unit;
            } else if (entry.type === "radio" || entry.type === "select") {
                if (Array.isArray(c.options)) entry.options = c.options.slice();
            } else if (entry.type === "input") {
                if (c.placeholder) entry.placeholder = c.placeholder;
            } else if (entry.type === "custom") {
                // Mark non-remotable
                entry.remote = false;
            }
            ctrls.push(entry);
        }
        out.push({
            id: tab.id,
            label: tab.label ?? tab.id,
            icon:  tab.icon ?? "",
            controls: ctrls,
        });
    }
    return out;
}

export function applySettingsValue(schema, tabId, controlId, value) {
    if (!Array.isArray(schema)) return { ok: false, error: "no schema" };
    const tab = schema.find(t => t && t.id === tabId);
    if (!tab) return { ok: false, error: `no tab "${tabId}"` };
    const ctrl = (tab.controls || []).find(c => c && c.id === controlId);
    if (!ctrl) return { ok: false, error: `no control "${controlId}" in tab "${tabId}"` };
    if (ctrl.type === "custom") return { ok: false, error: `control "${controlId}" is custom-render (not remotable)` };
    if (typeof ctrl.set !== "function") return { ok: false, error: `control "${controlId}" has no setter` };
    try {
        ctrl.set(value);
        // Re-read after set (some setters clamp / coerce); swallow throw
        let after = value;
        try { if (typeof ctrl.get === "function") after = ctrl.get(); } catch {}
        return { ok: true, value: after };
    } catch (e) {
        return { ok: false, error: e?.message ?? String(e) };
    }
}

export class SettingsHub {
    constructor(schema, opts = {}) {
        // v1492 — list the category tabs alphabetically by label (Geek's ask).
        // v1633 — but pin "Assets" to the very top so it's the panel shown when Settings opens.
        this.schema = Array.isArray(schema)
            ? schema.slice().sort((a, b) => {
                const ap = (a && a.id) === "assets" ? 0 : 1, bp = (b && b.id) === "assets" ? 0 : 1;
                if (ap !== bp) return ap - bp;
                return String((a && a.label) || "").localeCompare(String((b && b.label) || ""));
            })
            : schema;
        this.onReloadNeeded = opts.onReloadNeeded || (() => {});
        this._activeCat = this.schema[0]?.id;
        this._visible = false;
        this._reloadPending = false;
        if (typeof document !== "undefined") this._build();
    }

    open(catId)   { if (this._root) { if (catId && this.schema.some(c => c && c.id === catId)) this._activeCat = catId; this._render(); this._root.style.display = "flex"; this._visible = true; try { window.__swekPollsPaused = true; window.dispatchEvent(new Event("swek:pollpause")); } catch {} } }
    close()  { if (this._root) { this._root.style.display = "none"; this._visible = false; try { window.__swekPollsPaused = false; window.dispatchEvent(new Event("swek:pollresume")); } catch {} } }
    toggle() { this._visible ? this.close() : this.open(); }

    _build() {
        const root = document.createElement("div");
        Object.assign(root.style, {
            position: "fixed", inset: "0", display: "none",
            alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.5)", zIndex: "10000",
            fontFamily: "system-ui, sans-serif",
        });
        root.addEventListener("click", (e) => { if (e.target === root) this.close(); });

        const panel = document.createElement("div");
        Object.assign(panel.style, {
            width: "min(620px, 92vw)", maxHeight: "84vh", display: "flex",
            flexDirection: "column", background: C.panel,
            border: `1px solid ${C.border}`, borderRadius: "10px",
            boxShadow: "0 12px 48px rgba(0,0,0,0.6)", overflow: "hidden", color: C.text,
        });

        // Header
        const head = document.createElement("div");
        Object.assign(head.style, {
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
            fontWeight: "600", letterSpacing: "0.3px",
        });
        head.innerHTML = "";
        // v1508 — breadcrumb: "⚙ Settings  ›  <active panel>". The section name is filled in by
        // _render() whenever the left-menu choice changes, so the topic is always at the top.
        const headLeft = document.createElement("div");
        Object.assign(headLeft.style, { display: "flex", alignItems: "baseline", gap: "8px", minWidth: "0", overflow: "hidden" });
        const headBrand = document.createElement("span"); headBrand.textContent = "⚙ Settings";
        Object.assign(headBrand.style, { color: C.dim, fontWeight: "600", flex: "0 0 auto" });
        const headSep = document.createElement("span"); headSep.textContent = "›";
        Object.assign(headSep.style, { color: C.dim, opacity: "0.65", flex: "0 0 auto" });
        const headSection = document.createElement("span");
        Object.assign(headSection.style, { color: C.accent, fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
        headLeft.append(headBrand, headSep, headSection);
        head.appendChild(headLeft);
        this._headSection = headSection;
        const x = document.createElement("button");
        x.textContent = "✕";
        Object.assign(x.style, { background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: "16px", flex: "0 0 auto", marginLeft: "12px" });
        x.addEventListener("click", () => this.close());
        head.appendChild(x);
        panel.appendChild(head);

        // Body: tabs (left) + content (right)
        const body = document.createElement("div");
        Object.assign(body.style, { display: "flex", minHeight: "0", flex: "1 1 auto" });
        const tabs = document.createElement("div");
        Object.assign(tabs.style, {
            flex: "0 0 150px", borderRight: `1px solid ${C.border}`,
            padding: "8px", display: "flex", flexDirection: "column", gap: "2px", overflowY: "auto",
        });
        const content = document.createElement("div");
        Object.assign(content.style, { flex: "1 1 auto", padding: "12px 16px", overflowY: "auto" });
        this._tabsEl = tabs;
        this._contentEl = content;
        body.appendChild(tabs);
        body.appendChild(content);
        panel.appendChild(body);

        // Footer reload banner (hidden until a reload-required toggle changes)
        const footer = document.createElement("div");
        Object.assign(footer.style, {
            padding: "10px 16px", borderTop: `1px solid ${C.border}`,
            fontSize: "12px", color: C.accent, display: "none", alignItems: "center", justifyContent: "space-between",
        });
        footer.innerHTML = `<span>Some changes need a reload.</span>`;
        const rb = document.createElement("button");
        rb.textContent = "Reload now";
        Object.assign(rb.style, { background: C.tabOn, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "4px 12px", cursor: "pointer" });
        rb.addEventListener("click", () => { try { location.reload(); } catch {} });
        footer.appendChild(rb);
        this._footer = footer;
        panel.appendChild(footer);

        root.appendChild(panel);
        document.body.appendChild(root);
        this._root = root;
    }

    _render() {
        if (!this._tabsEl) return;
        // Tabs
        this._tabsEl.innerHTML = "";
        for (const cat of this.schema) {
            const t = document.createElement("button");
            t.textContent = `${cat.icon || ""}  ${cat.label}`.trim();
            const on = cat.id === this._activeCat;
            Object.assign(t.style, {
                textAlign: "left", padding: "8px 10px", borderRadius: "6px", cursor: "pointer",
                border: "none", background: on ? C.tabOn : "transparent",
                color: on ? C.accent : C.text, fontSize: "13px", fontWeight: on ? "600" : "400",
            });
            t.addEventListener("click", () => { this._activeCat = cat.id; this._render(); });
            this._tabsEl.appendChild(t);
        }
        // Content for the active category
        const cat = this.schema.find(c => c.id === this._activeCat) || this.schema[0];
        if (this._headSection) this._headSection.textContent = `${cat?.icon || ""} ${cat?.label || ""}`.trim();   // v1508 — breadcrumb tracks the open panel
        this._contentEl.innerHTML = "";
        // v1562 — Bun-on-Windows warning. Several bridge config routes (asset ingest, peer sync,
        // installer list, go2rtc auto-expose, asset migrate) crash or mishandle under Bun on Windows,
        // so their toggles look like they "don't stick". Every one of these routes works under Node
        // (verified). Show a banner + one-click Switch-to-Node when the bridge reports it's on Bun.
        const bunBanner = document.createElement("div");
        bunBanner.style.cssText = "display:none; margin:0 0 10px; padding:9px 11px; background:#3a2a12; border:1px solid #7a5a1e; border-radius:7px; color:#ffd884; font-size:11.5px; line-height:1.5;";
        this._contentEl.appendChild(bunBanner);
        const showBun = (isBun) => {
            if (!isBun) { bunBanner.style.display = "none"; bunBanner.innerHTML = ""; return; }
            bunBanner.style.display = "block";
            bunBanner.innerHTML = "\u26a0 This bridge is running under <b>Bun</b>. On Windows, several settings (asset import, peer sync, auto-expose, the installer list) can fail to save or read under Bun \u2014 that\u2019s why a toggle may not stick. Run this machine under Node and they all work.<br>";
            const b = document.createElement("button"); b.textContent = "Switch to Node + restart";
            b.style.cssText = "margin-top:7px; padding:5px 11px; background:#1a2536; color:#9ed5ff; border:1px solid #2a4060; border-radius:6px; cursor:pointer; font-size:11px;";
            b.onclick = async () => {
                b.disabled = true; b.textContent = "switching\u2026";
                try { await fetch("/runtime/prefer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ useBun: false }) }); } catch {}
                try { await fetch("/sys/restart", { method: "POST" }); b.textContent = "restarting under Node\u2026 reload the page in ~10s"; }
                catch { b.textContent = "set to Node \u2014 restart the engine to apply"; }
            };
            bunBanner.appendChild(b);
        };
        if (this._runtimeIsBun === true) showBun(true);
        else if (this._runtimeIsBun === undefined) {
            fetch("/runtime").then(r => r.json()).then(j => { this._runtimeIsBun = !!(j && j.runtime === "bun"); showBun(this._runtimeIsBun); }).catch(() => {});
        }
        for (const ctrl of (cat?.controls || [])) {
            this._contentEl.appendChild(this._row(ctrl));
        }
    }

    _row(ctrl) {
        if (ctrl.type === "custom") {
            const box = document.createElement("div");
            Object.assign(box.style, { padding: "9px 2px", borderBottom: "1px solid rgba(255,255,255,0.05)" });
            if (ctrl.id) box.setAttribute("data-ctl-id", ctrl.id);   // v1817 — deep-link scroll target
            try { ctrl.render(box, this); } catch (e) { box.textContent = "(failed to render: " + (e?.message || e) + ")"; }
            return box;
        }
        const row = document.createElement("div");
        if (ctrl.id) row.setAttribute("data-ctl-id", ctrl.id);   // v1817 — deep-link scroll target
        Object.assign(row.style, {
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: "12px", padding: "9px 2px", borderBottom: "1px solid rgba(255,255,255,0.05)",
        });
        const left = document.createElement("div");
        left.style.minWidth = "0";
        const lbl = document.createElement("div");
        lbl.textContent = ctrl.label;
        lbl.style.fontSize = "13px";
        const hint = document.createElement("div");
        hint.textContent = ctrl.hint || "";
        Object.assign(hint.style, { fontSize: "11px", color: C.dim, marginTop: "2px" });
        left.appendChild(lbl);
        if (ctrl.hint) left.appendChild(hint);
        row.appendChild(left);
        row.appendChild(this._widget(ctrl));
        return row;
    }

    _widget(ctrl) {
        if (ctrl.type === "toggle") {
            const chk = document.createElement("input");
            chk.type = "checkbox";
            try { chk.checked = !!ctrl.get(); } catch { chk.checked = false; }
            chk.style.accentColor = C.accent;
            chk.style.transform = "scale(1.3)";
            chk.style.cursor = "pointer";
            chk.addEventListener("change", () => {
                try { ctrl.set(chk.checked); } catch {}
                if (ctrl.reload) this._needReload();
            });
            return chk;
        }
        if (ctrl.type === "select") {
            const sel = document.createElement("select");
            Object.assign(sel.style, { background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "4px 8px", cursor: "pointer" });
            let cur = "";
            try { cur = ctrl.get(); } catch {}
            for (const opt of ctrl.options) {
                const o = document.createElement("option");
                o.value = opt; o.textContent = opt;
                if (opt === cur) o.selected = true;
                sel.appendChild(o);
            }
            sel.addEventListener("change", () => { try { ctrl.set(sel.value); } catch {} });
            return sel;
        }
        if (ctrl.type === "slider") {
            const wrap = document.createElement("div");
            Object.assign(wrap.style, { display: "flex", alignItems: "center", gap: "8px" });
            const rng = document.createElement("input");
            rng.type = "range";
            rng.min = ctrl.min; rng.max = ctrl.max; rng.step = ctrl.step || 1;
            try { rng.value = ctrl.get(); } catch {}
            rng.style.accentColor = C.accent;
            const val = document.createElement("span");
            val.textContent = rng.value;
            Object.assign(val.style, { fontSize: "12px", color: C.dim, minWidth: "44px", textAlign: "right" });
            rng.addEventListener("input", () => { val.textContent = rng.value; try { ctrl.set(+rng.value); } catch {} });
            wrap.appendChild(rng); wrap.appendChild(val);
            return wrap;
        }
        // button
        const btn = document.createElement("button");
        btn.textContent = "Go";
        Object.assign(btn.style, { background: C.tabOn, color: C.text, border: `1px solid ${C.border}`, borderRadius: "5px", padding: "5px 14px", cursor: "pointer" });
        btn.addEventListener("click", () => { try { ctrl.action(); } catch {} });
        return btn;
    }

    _needReload() {
        this._reloadPending = true;
        if (this._footer) this._footer.style.display = "flex";
    }
}
