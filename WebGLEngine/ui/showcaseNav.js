// ui/showcaseNav.js — a small, consistent nav pill injected onto each curated showcase page, so the
// five pieces feel like ONE navigable gallery (back to the front door + prev/next through the set)
// instead of scattered tools. A page opts in with:  window.SHOWCASE_ID = "<id>";  then loads this script.
// Zero dependencies; self-styling; top-center so it clears per-page corner UI.
(function () {
  "use strict";
  // The curated set — keep in sync with showcase.html's SHOWCASE list.
  var PIECES = [
    { id: "fabric",     name: "The Fabric",      href: "/fabric.html",       tag: "all three" },
    { id: "wasm",       name: "WASM Lab",        href: "/wasm-bench.html",   tag: "run anywhere" },
    { id: "aibrain",    name: "AI Brain",        href: "/aibrain.html",      tag: "the bridge" },
    { id: "head",       name: "Wireframe Head",  href: "/thead.html",        tag: "show + drive" },
    { id: "battleship", name: "ABYSS Battleship",href: "/index.html?forceEngine=1&go=battleship&clean=1", tag: "flagship client" },
  ];
  function boot() {
    try {
      var id = window.SHOWCASE_ID || "";
      var i = PIECES.findIndex(function (p) { return p.id === id; });
      var prev = i >= 0 ? PIECES[(i - 1 + PIECES.length) % PIECES.length] : null;
      var next = i >= 0 ? PIECES[(i + 1) % PIECES.length] : null;
      var cur = i >= 0 ? PIECES[i] : null;

      var bar = document.createElement("div");
      bar.id = "swekShowcaseNav";
      bar.style.cssText = [
        "position:fixed", "top:8px", "left:50%", "transform:translateX(-50%)",
        "z-index:2147483000", "display:flex", "align-items:center", "gap:2px",
        "background:rgba(9,20,14,0.88)", "border:1px solid #2a5a3a", "border-radius:999px",
        "padding:3px 4px", "backdrop-filter:blur(6px)",
        "font:12px ui-rounded,system-ui,sans-serif", "box-shadow:0 4px 16px rgba(0,0,0,.4)"
      ].join(";");

      function pill(html, title, onclick, accent) {
        var b = document.createElement("button");
        b.innerHTML = html; b.title = title || "";
        b.style.cssText = "background:transparent;border:0;color:" + (accent || "#bfe7d4") +
          ";font:inherit;cursor:pointer;padding:5px 9px;border-radius:999px;white-space:nowrap;";
        b.onmouseenter = function () { b.style.background = "rgba(43,150,120,0.18)"; };
        b.onmouseleave = function () { b.style.background = "transparent"; };
        b.onclick = onclick; return b;
      }
      // ✦ back to the front door
      bar.appendChild(pill("✦ Showcase", "Back to the showcase front door", function () { location.href = "/showcase.html"; }, "#8effc4"));
      if (cur) {
        var sep = document.createElement("span"); sep.textContent = "·"; sep.style.cssText = "color:#3a5a48;padding:0 2px;"; bar.appendChild(sep);
        if (prev) bar.appendChild(pill("‹", "Previous: " + prev.name, function () { location.href = prev.href; }));
        var label = document.createElement("span");
        label.innerHTML = "<b style='color:#eafff4'>" + cur.name + "</b> <span style='color:#6fae8e;font-size:10.5px'>" + cur.tag + "</span>";
        label.style.cssText = "padding:0 6px;white-space:nowrap;"; bar.appendChild(label);
        if (next) bar.appendChild(pill("›", "Next: " + next.name, function () { location.href = next.href; }));
      }
      (document.body || document.documentElement).appendChild(bar);
    } catch (e) { /* never break the host page */ }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
