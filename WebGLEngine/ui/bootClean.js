// ui/bootClean.js — "clean boot": on engine start, tuck away the panels that auto-open (Cameras, the
// STATUS readout, the demo/prompt menu, the difficulty HUD) so the first thing you see is just the world.
// Each stays one click away via a small "▤ Panels" button (bottom-left) that toggles them all back. Opt-out
// with localStorage voxelengine.cleanBoot = "0". Non-destructive: we only flip display, never remove panels,
// and once a panel is shown the engine's own tabs/controls keep working normally.
export function runBootClean(refs) {
  try {
    if (typeof document === "undefined") return null;
    var on = true;
    try { on = localStorage.getItem("voxelengine.cleanBoot") !== "0"; } catch (e) {}
    if (!on) return null;

    // The panels we hide on boot. Each entry resolves its element lazily (some mount a beat after boot).
    var targets = [
      function () { return refs && refs.cameraPanel && refs.cameraPanel.root; },   // Cameras (top-right)
      function () { return refs && refs.hud && refs.hud.root; },                    // STATUS (bottom-left)
      function () { return refs && refs.demoMenu && refs.demoMenu.root; },          // Demos / prompt (top-left)
      function () { var dm = refs && refs._lazyDemoMenu && refs._lazyDemoMenu(); return dm && dm.root; },   // Demos (late mount)
      function () { return document.getElementById("gameHud"); },                   // difficulty HUD (top-right)
    ];

    var hidden = [];       // { el, prevDisplay }
    var shownByUser = false;

    function hideAll() {
      hidden = [];
      for (var i = 0; i < targets.length; i++) {
        var el = null; try { el = targets[i](); } catch (e) {}
        if (el && el.style && el.style.display !== "none") {
          hidden.push({ el: el, prev: el.style.display || "" });
          el.style.display = "none";
        }
      }
    }
    function showAll() {
      for (var i = 0; i < hidden.length; i++) {
        try { hidden[i].el.style.display = hidden[i].prev; } catch (e) {}
      }
      hidden = [];
    }

    // Give panels that mount slightly after boot a moment, then hide. Two passes catch late mounts.
    setTimeout(hideAll, 400);
    setTimeout(hideAll, 1400);

    // ---- the restore toggle (bottom-left, clear of the icon rail) ----
    var btn = document.createElement("button");
    btn.id = "swek-panels-toggle";
    btn.innerHTML = "\u25A4 Panels";
    btn.title = "Show / hide the engine panels (Cameras, Status, Demos, Difficulty)";
    btn.style.cssText = [
      "position:fixed", "left:96px", "bottom:14px", "z-index:9200",
      "background:rgba(10,20,16,0.85)", "border:1px solid rgba(120,200,160,0.4)", "border-radius:8px",
      "color:#9fe6c4", "font:11.5px ui-rounded,system-ui,sans-serif", "padding:6px 12px", "cursor:pointer",
      "opacity:0.75", "transition:opacity .15s"
    ].join(";");
    btn.onmouseenter = function () { btn.style.opacity = "1"; };
    btn.onmouseleave = function () { btn.style.opacity = "0.75"; };
    btn.onclick = function () {
      shownByUser = !shownByUser;
      if (shownByUser) { showAll(); btn.style.color = "#eafff4"; btn.innerHTML = "\u25A4 Panels"; }
      else { hideAll(); btn.style.color = "#9fe6c4"; }
    };
    document.body.appendChild(btn);

    return { hideAll: hideAll, showAll: showAll };
  } catch (e) { return null; }
}
