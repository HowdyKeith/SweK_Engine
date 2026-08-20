// FILE: demos_code/wadModePicker.js
//
// Small panel to pick a WAD room (map) + a game mode and launch the FPS host.
// Rooms come from the bridge (GET /api/wad/info -> { name, maps }); selecting a
// room posts /api/wad/select before the level loads (done inside the host).
//
//   import { mountWadModePicker } from "./wadModePicker.js";
//   mountWadModePicker({ bridgeUrl });   // adds a panel; Launch starts the host.
import { MODES, mountWadModes } from "./wadModes.js";

export function mountWadModePicker(opts = {}) {
  const bridgeUrl = opts.bridgeUrl || "";
  const panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;right:12px;top:60px;z-index:950;background:#14101c;border:1px solid #ffaa44;" +
    "border-radius:8px;padding:12px;width:230px;font:12px system-ui,sans-serif;color:#ffce8a;box-shadow:0 6px 24px #000a;";
  const selCss = "width:100%;background:#241c30;color:#ffce8a;border:1px solid #6a4a2a;border-radius:4px;padding:4px;margin-bottom:8px";
  panel.innerHTML =
    `<div style="font-weight:700;color:#ffaa44;margin-bottom:8px">WAD FPS</div>` +
    `<label style="display:block;margin-bottom:2px">Room (map)</label>` +
    `<select id="wmp_room" style="${selCss}"></select>` +
    `<label style="display:block;margin-bottom:2px">Mode</label>` +
    `<select id="wmp_mode" style="${selCss}"></select>` +
    `<button id="wmp_go" style="width:100%;background:#ffaa44;color:#1a1020;border:0;border-radius:4px;padding:7px;font-weight:700;cursor:pointer">Launch</button>` +
    `<div id="wmp_status" style="margin-top:8px;color:#b98">…</div>`;
  document.body.appendChild(panel);
  const $ = (id) => panel.querySelector("#" + id);

  for (const [key, m] of Object.entries(MODES)) {
    const o = document.createElement("option"); o.value = key; o.textContent = m.label; $("wmp_mode").appendChild(o);
  }

  (async () => {
    try {
      const r = await fetch(bridgeUrl + "/api/wad/info");
      const j = await r.json();
      const maps = (j && j.maps) || [];
      if (maps.length) {
        for (const m of maps) { const o=document.createElement("option"); o.value=m; o.textContent=m; $("wmp_room").appendChild(o); }
        if (j.name) $("wmp_room").value = j.name;
        $("wmp_status").textContent = `${maps.length} map(s) · ${j.name || ""}`;
      } else {
        const o=document.createElement("option"); o.value=""; o.textContent=(j && j.name) || "current level"; $("wmp_room").appendChild(o);
        $("wmp_status").textContent = "single level";
      }
    } catch (e) {
      const o=document.createElement("option"); o.value=""; o.textContent="current level"; $("wmp_room").appendChild(o);
      $("wmp_status").textContent = "bridge offline?";
    }
  })();

  let host = null;
  $("wmp_go").onclick = async () => {
    $("wmp_go").disabled = true; $("wmp_status").textContent = "loading…";
    try { if (host) host.stop(); } catch {}
    host = await mountWadModes({ mode: $("wmp_mode").value, mapName: $("wmp_room").value || null, bridgeUrl, kpop: opts.kpop });
    $("wmp_status").textContent = host ? "running — Esc to quit" : "launch failed";
    $("wmp_go").disabled = false;
  };

  return { panel, stop: () => { try { host?.stop(); } catch {} panel.remove(); } };
}
