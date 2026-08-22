// ui/minitabLayout.js (v1325)
// Edge-anchored stacking for LCARS minitabs + a live "move mode" (drag to reposition,
// persisted to localStorage) + a position report you can paste back to bake as defaults.
//
// MODEL: every .lcars-minitab belongs to a screen edge (top/bottom/left/right) and is
// anchored to ONE end of that edge (a "corner") a set distance in, then later tabs stack
// inward. So top-right tabs start a fixed gap from the right and grow LEFT; bottom-left
// grow RIGHT; etc. This keeps every tab pinned to the sides on wide screens — render space
// in the middle stays clear.
//
// API: window.minitabMove(true|false) toggles move mode. window.minitabReport() copies +
// logs the current layout as JSON. Set window.MINITAB_LAYOUT_OFF = true before load to disable.
(function () {
  if (window.MINITAB_LAYOUT_OFF) return;

  const GAP_FROM_EDGE = 14;   // distance along the edge from the corner to the FIRST tab
  const SPACING = 8;          // gap between stacked tabs
  const FLUSH = 0;            // tabs sit flush to their edge
  // v1573 — extra start-inset (px) for specific corner groups so they clear fixed UI:
  //   bottom:left  +144 (1.5in)  -> PERFORMANCE etc. clear the bottom-left "SweK View" button
  //   left:bottom  +288 (3in)    -> AI BRAIN / AUDIO / LIBRARY clear the bottom-left quick buttons
  const CORNER_INSET = { "bottom:left": 144, "left:bottom": 288 };
  const LS_KEY = "swek.minitabLayout.v1";

  // Baked defaults: id -> { edge, corner, order }. Filled from a user report later.
  // v1584 — declutter the rails: World Settings (was TERRAIN), Palette, Brush, Scene live
  // on the BOTTOM edge, anchored at the right corner, in this order growing leftward.
  const DEFAULTS = {
    world_settings:     { edge: "bottom", corner: "right", order: 10 },
    palette:            { edge: "bottom", corner: "right", order: 20 },
    dock_terrain_brush: { edge: "bottom", corner: "right", order: 30 },
    dock_sandbox_scene: { edge: "bottom", corner: "right", order: 40 },
    // v1974 — AI BRAIN moved off the left edge onto the BOTTOM edge, anchored bottom-left just after
    // PERFORMANCE (order after perf's baked left:340 slot), per request.
    performance:        { edge: "bottom", corner: "left", order: 10 },
    narrative:          { edge: "bottom", corner: "left", order: 20 },
    ai_brain:           { edge: "bottom", corner: "left", order: 30 },
  };

  let overrides = {};
  try { overrides = JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {}; } catch (e) { overrides = {}; }
  function saveOverrides() { try { localStorage.setItem(LS_KEY, JSON.stringify(overrides)); } catch (e) {} }

  let moveMode = false, applying = false, observer = null, raf = null;
  let dragEl = null, dragDX = 0, dragDY = 0, dragMoved = false, toolbar = null;

  const EDGES = ["top", "bottom", "left", "right"];
  // v1583 — one layout engine now owns BOTH .lcars-minitab AND dockSystem's .dock-tab
  // elements, so the two families stop overlapping on a shared edge. Each tab also gets a
  // DISTINCT color cycled across its edge. Dock tabs are tinted inline (their :hover/.expanded
  // cues are filter-based in CSS so an inline background is safe); minitabs use color-* classes.
  const PALETTE = ["voyager", "gold", "cyan", "green", "pink", "yellow", "burgundy", "purple", "teal", "red"];
  const PAL_BG = { voyager: "#ff9f43", gold: "#ffcf6b", cyan: "#67e6ff", green: "#7fd66f", pink: "#ff8aa8", yellow: "#ffd066", burgundy: "#9b2d4f", purple: "#b07cff", teal: "#3fc9c0", red: "#dd4433" };
  const PAL_FG = { burgundy: "#fff", red: "#fff", purple: "#1a1030", teal: "#04201d" };
  function cssEsc(s) { try { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&"); } catch (e) { return String(s); } }
  function colorize(el, idx) {
    const name = PALETTE[idx % PALETTE.length];
    if (el.classList.contains("dock-tab")) { el.style.background = PAL_BG[name]; el.style.color = PAL_FG[name] || "#0a1016"; }
    else { for (const c of PALETTE) el.classList.remove("color-" + c); el.classList.add("color-" + name); }
  }
  function slug(s) { return String(s || "").replace(/[\u25b2\u25bc\u25c0\u25b6]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
  function edgeOf(el) {
    if (el.classList.contains("dock-tab-left")) return "left";
    if (el.classList.contains("dock-tab-right")) return "right";
    for (const e of EDGES) if (el.classList.contains("edge-" + e)) return e;
    return "bottom";
  }
  function setEdgeClass(el, edge) {
    EDGES.forEach(e => el.classList.toggle("edge-" + e, e === edge));
    if (/\bdock-tab\b/.test(el.className)) {
      EDGES.forEach(e => el.classList.toggle("dock-tab-" + e, e === edge));   // v1584 — incl. top/bottom
    }
  }
  function allTabs() { return Array.prototype.slice.call(document.querySelectorAll(".lcars-minitab, .dock-tab")); }
  function visible(el) { return getComputedStyle(el).display !== "none"; }

  function idOf(el) {
    if (el.dataset.mtid) return el.dataset.mtid;
    let base = "";
    if (el.dataset.dockid) base = slug("dock_" + el.dataset.dockid);   // dock tabs: stable id straight from the dock
    else { const label = el.querySelector("span:last-child"); base = slug(label ? label.textContent : el.textContent); }
    if (!base) { const m = el.className.match(/color-(\w+)/); base = edgeOf(el) + "_" + (m ? m[1] : "tab"); }
    const used = new Set(allTabs().map(t => t.dataset.mtid).filter(Boolean));
    let id = base, n = 2; while (used.has(id)) id = base + "_" + (n++);
    el.dataset.mtid = id; return id;
  }

  function configFor(el) {
    const id = idOf(el);
    let edge = edgeOf(el);
    const o = overrides[id] || DEFAULTS[id] || {};
    if (o.edge) { edge = o.edge; if (edgeOf(el) !== edge) setEdgeClass(el, edge); }
    let corner = o.corner;
    if (!corner) {
      if (el.classList.contains("dock-tab")) { corner = "top"; }   // v1583 — dock drawers slide from the top, so always top-anchor
      else {
      const r = el.getBoundingClientRect();
      corner = (edge === "top" || edge === "bottom")
        ? ((r.left + r.width / 2 > window.innerWidth / 2) ? "right" : "left")
        : ((r.top + r.height / 2 > window.innerHeight / 2) ? "bottom" : "top");
      }
    }
    return { id, edge, corner, order: (typeof o.order === "number") ? o.order : 100000 };
  }

  function layout() {
    if (observer) observer.disconnect();
    applying = true;
    try {
      const groups = {};
      allTabs().filter(visible).forEach(el => {
        const c = configFor(el);
        (groups[c.edge + ":" + c.corner] = groups[c.edge + ":" + c.corner] || []).push({ el, c });
      });
      const edgeColorIdx = {};
      Object.keys(groups).forEach(key => {
        const edge = key.split(":")[0], corner = key.split(":")[1];
        const horiz = (edge === "top" || edge === "bottom");
        const arr = groups[key].sort((a, b) => (a.c.order - b.c.order) || a.c.id.localeCompare(b.c.id));
        let acc = GAP_FROM_EDGE + (CORNER_INSET[edge + ":" + corner] || 0);
        // v3403 -- *** READ/WRITE SPLIT: THIS LOOP FORCED ONE FULL RELAYOUT PER PANEL. ***
        //
        // Keith's console: `[Violation] Forced reflow while executing JavaScript took 267ms`, with the dashboard
        // pausing before the gauges appeared. The body below WROTE el.style (invalidating layout) and then READ
        // el.offsetWidth/offsetHeight, which the browser can only answer by laying the whole page out -- SO A
        // DOCK OF N PANELS COST N SYNCHRONOUS LAYOUTS, on boot, on resize and on every dock change. The gauges
        // were never failing to load; they were behind this.
        //
        // NOTHING ABOUT THE RESULT CHANGES. The flush-to-edge writes are hoisted into their own pass, EVERY
        // MEASUREMENT IS TAKEN AFTER THOSE WRITES EXACTLY AS BEFORE, and the positioning writes follow. Same
        // values, same order, same accumulated `acc` -- ONE layout for the group instead of one per element.
        //
        // THE HOISTED READS INCLUDE THE DRAWER'S offsetHeight (used only on a horizontal edge), because leaving
        // ONE read in the write pass would have restored the thrash while looking fixed.

        // PASS 1 -- writes only: flush every tab in this group to its edge.
        arr.forEach(({ el }) => {
          el.style.position = "fixed";
          el.style[edge] = FLUSH + "px";
          el.style[{ top: "bottom", bottom: "top", left: "right", right: "left" }[edge]] = "auto";
        });
        // PASS 2 -- reads only: one layout answers every measurement in this group.
        const measured = arr.map(({ el }) => ({ size: horiz ? el.offsetWidth : el.offsetHeight, offH: el.offsetHeight }));
        // PASS 3 -- writes only: position from the cached sizes.
        arr.forEach(({ el }, _i) => {
          const size = measured[_i].size;
          if (corner === "left") { el.style.left = acc + "px"; el.style.right = "auto"; }
          else if (corner === "right") { el.style.right = acc + "px"; el.style.left = "auto"; }
          else if (corner === "top") { el.style.top = acc + "px"; el.style.bottom = "auto"; }
          else { el.style.bottom = acc + "px"; el.style.top = "auto"; }
          // v1583 — distinct color cycled across the whole edge (both corners share the counter)
          edgeColorIdx[edge] = (edgeColorIdx[edge] || 0); colorize(el, edgeColorIdx[edge]++);
          // v1583/1584 — keep a docked tab's drawer aligned with its (relocated) tab, and slide
          // it from whatever edge the tab now lives on (right -> bottom etc.)
          if (el.classList.contains("dock-tab") && el.dataset.dockid) {
            const dr = document.querySelector('.dock-drawer[data-dockid="' + cssEsc(el.dataset.dockid) + '"]');
            if (dr) {
              EDGES.forEach(e => dr.classList.toggle("dock-drawer-" + e, e === edge));
              if (horiz) {
                const off = (measured[_i].offH || 24) + 4;
                if (edge === "bottom") { dr.style.bottom = off + "px"; dr.style.top = ""; }
                else { dr.style.top = off + "px"; dr.style.bottom = ""; }
                if (corner === "right") { dr.style.right = acc + "px"; dr.style.left = ""; }
                else { dr.style.left = acc + "px"; dr.style.right = ""; }
                dr.style.maxHeight = "calc(100vh - " + (off + 40) + "px)";
              } else {
                // v1587 — left/right drawers: set ONLY top + maxHeight. Clearing left/right to ""
                // (not "auto") lets the .dock-drawer-{left,right} CSS keep its off-screen anchor so the
                // collapse transform still hides it — "auto" broke that and left PROMPT/SPAWN stuck open.
                const tabTop = (corner === "bottom") ? (window.innerHeight - acc - size) : acc;
                dr.style.top = tabTop + "px"; dr.style.bottom = ""; dr.style.left = ""; dr.style.right = "";
                dr.style.maxHeight = "calc(100vh - " + tabTop + "px - 12px)";
              }
            }
          }
          acc += size + SPACING;
        });
      });
    } catch (e) { /* never let layout throw */ }
    finally {
      applying = false;
      if (observer) observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    }
  }

  function scheduleLayout() { if (raf || dragEl) return; raf = requestAnimationFrame(() => { raf = null; layout(); }); }

  // ---- move mode -------------------------------------------------------------
  function classifyDrop(el) {
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const d = { top: cy, bottom: window.innerHeight - cy, left: cx, right: window.innerWidth - cx };
    const edge = Object.keys(d).reduce((a, b) => (d[a] <= d[b] ? a : b));
    let corner, order;
    if (edge === "top" || edge === "bottom") { corner = cx > window.innerWidth / 2 ? "right" : "left"; order = Math.round(corner === "right" ? (window.innerWidth - r.right) : r.left); }
    else { corner = cy > window.innerHeight / 2 ? "bottom" : "top"; order = Math.round(corner === "bottom" ? (window.innerHeight - r.bottom) : r.top); }
    return { edge, corner, order };
  }

  function onDown(e) {
    if (!moveMode) return;
    const t = e.target.closest && e.target.closest(".lcars-minitab"); if (!t) return;
    e.preventDefault(); e.stopPropagation();
    dragEl = t; dragMoved = false;
    const r = t.getBoundingClientRect(); dragDX = e.clientX - r.left; dragDY = e.clientY - r.top;
    t.style.transition = "none"; t.style.zIndex = "99999";
  }
  function onMove(e) {
    if (!dragEl) return;
    dragMoved = true;
    dragEl.style.position = "fixed";
    dragEl.style.left = (e.clientX - dragDX) + "px"; dragEl.style.top = (e.clientY - dragDY) + "px";
    dragEl.style.right = "auto"; dragEl.style.bottom = "auto";
  }
  function onUp() {
    if (!dragEl) return;
    const t = dragEl; dragEl = null; t.style.zIndex = ""; t.style.transition = "";
    if (dragMoved) { const c = classifyDrop(t); overrides[idOf(t)] = { edge: c.edge, corner: c.corner, order: c.order }; setEdgeClass(t, c.edge); saveOverrides(); }
    layout();
  }

  function setMoveMode(on) {
    moveMode = !!on;
    document.body.classList.toggle("mt-movemode", moveMode);
    allTabs().forEach(t => {
      if (moveMode) {
        if (!visible(t)) { t.dataset.mtForced = "1"; t.style.display = "block"; t.style.opacity = "0.55"; }
        t.style.outline = "2px dashed #ffd066"; t.style.cursor = "move";
      } else {
        t.style.outline = ""; t.style.cursor = "";
        if (t.dataset.mtForced) { t.style.display = "none"; t.style.opacity = ""; delete t.dataset.mtForced; }
      }
    });
    if (moveMode) showToolbar(); else hideToolbar();
    layout();
  }

  function showToolbar() {
    if (toolbar) { toolbar.style.display = "flex"; return; }
    toolbar = document.createElement("div");
    toolbar.style.cssText = "position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:100000;display:flex;gap:8px;align-items:center;background:#10151d;border:1px solid #2a4036;border-radius:11px;padding:8px 12px;font:12px/1.3 ui-monospace,Menlo,Consolas,monospace;color:#e3f0ea;box-shadow:0 6px 22px #0008";
    toolbar.innerHTML = '<span style="color:#9bf0c4">Move mode</span><span style="color:#8aa69c">drag tabs to a corner</span>'
      + '<button id="mtReport" style="background:#10231a;color:#41e08a;border:1px solid #224a36;border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer">⧉ Copy report</button>'
      + '<button id="mtReset" style="background:#221c10;color:#ffcf6b;border:1px solid #5a4a22;border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer">⤺ Reset</button>'
      + '<button id="mtDone" style="background:#10231a;color:#41e08a;border:1px solid #224a36;border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer">✓ Done</button>';
    document.body.appendChild(toolbar);
    toolbar.querySelector("#mtReport").onclick = () => { window.minitabReport(); flash(toolbar.querySelector("#mtReport"), "copied"); };
    toolbar.querySelector("#mtReset").onclick = () => { overrides = {}; saveOverrides(); allTabs().forEach(t => { delete t.dataset.mtid; }); layout(); };
    toolbar.querySelector("#mtDone").onclick = () => setMoveMode(false);
  }
  function hideToolbar() { if (toolbar) toolbar.style.display = "none"; }
  function flash(btn, txt) { const o = btn.textContent; btn.textContent = "✓ " + txt; setTimeout(() => btn.textContent = o, 1200); }

  // ---- report ----------------------------------------------------------------
  window.minitabReport = function () {
    const out = {};
    allTabs().filter(visible).forEach(el => {
      const id = idOf(el), r = el.getBoundingClientRect(), edge = edgeOf(el);
      let corner, order;
      if (edge === "top" || edge === "bottom") { corner = (r.left + r.width / 2 > window.innerWidth / 2) ? "right" : "left"; order = Math.round(corner === "right" ? (window.innerWidth - r.right) : r.left); }
      else { corner = (r.top + r.height / 2 > window.innerHeight / 2) ? "bottom" : "top"; order = Math.round(corner === "bottom" ? (window.innerHeight - r.bottom) : r.top); }
      out[id] = { edge, corner, order };
    });
    const json = JSON.stringify(out, null, 2);
    try { navigator.clipboard.writeText(json); } catch (e) {}
    console.log("[minitab layout report] (copied to clipboard)\n" + json);
    return out;
  };
  window.minitabMove = setMoveMode;

  // ---- wire up ---------------------------------------------------------------
  function start() {
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("click", (e) => { if (moveMode && e.target.closest && e.target.closest(".lcars-minitab")) { e.stopPropagation(); e.preventDefault(); } }, true);
    document.addEventListener("keydown", (e) => { if (e.shiftKey && e.altKey && (e.key === "m" || e.key === "M")) { e.preventDefault(); setMoveMode(!moveMode); } });
    window.addEventListener("resize", scheduleLayout);
    observer = new MutationObserver((muts) => {
      if (dragEl || applying) return;
      for (const m of muts) { if (m.type === "childList" || (m.type === "attributes" && (m.attributeName === "style" || m.attributeName === "class"))) { scheduleLayout(); break; } }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    layout();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
