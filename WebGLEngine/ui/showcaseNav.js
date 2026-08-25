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
  // *** v3998 -- NOT WHEN EMBEDDED. Keith: "it shows the title 'wireframe head Show' at the top, and that
  // should not be seen on Server.html." ***
  //
  // This pill is a GALLERY nav: back to the front door, prev/next through the five curated pieces. Inside an
  // iframe there is no gallery to navigate -- avatar-server.html hosts thead.html in a small panel and its own
  // View picker is the navigation -- so the pill is a floating title bar sitting on top of the avatar's head,
  // with two arrows that would navigate the PANEL to a full-page showcase.
  //
  // *** thead.html ALREADY HIDES ITS OWN CHROME ON ?embed=1 (v3656) AND THIS PILL SURVIVED IT, because that
  // hide list names elements in the page's markup -- #tag, #mood, #cap, #navpad, #bar -- and this one is
  // INJECTED BY A SCRIPT AFTER THE FACT. A hide list cannot name an element that does not exist yet. *** So the
  // guard belongs here, in the thing doing the injecting, rather than as a sixth id in a list on every page
  // that ever loads this file.
  //
  // TWO TESTS, BECAUSE THEY CATCH DIFFERENT HOSTS: ?embed=1 is this tree's stated convention and is what
  // avatar-server.html and ui/avatarSwitch.js send; the frame test catches any other embedder that never got
  // the memo. Either one is enough to stay silent, and staying silent is the safe direction -- a missing nav
  // pill on a full-page showcase is a nuisance, while one welded over an avatar is what Keith is looking at.
  function isEmbedded() {
    try { if (new URLSearchParams(location.search).get("embed") === "1") return true; } catch (e) {}
    try { if (window.top !== window.self) return true; } catch (e) { return true; }  // cross-origin frame throws
    return false;
  }

  function boot() {
    try {
      if (isEmbedded()) return;
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
