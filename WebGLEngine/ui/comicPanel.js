// ui/comicPanel.js — v1138
// "COMICS" minitab + panel: a built-in cross-platform .cbz/.cbr reader. Gallery of
// covers -> click to open a page-by-page reader (arrow keys, fit modes, double-page).
// Page images are served straight from /comics/page (raw bytes), so no base64 churn.

import { createMiniTab } from "./LCARSMiniTab.js";

export function mountComicPanel(opts = {}) {
    if (document.getElementById("comicPanelRoot")) return;
    const api = (op, body) => fetch("/comics/" + op, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));

    const panel = document.createElement("div");
    panel.id = "comicPanelRoot";
    panel.style.cssText = "position:fixed; inset:4vh 4vw; background:#06080c; border:1px solid #233; border-radius:12px; box-shadow:0 12px 50px rgba(0,0,0,.7); display:none; flex-direction:column; z-index:9100; font:12px system-ui,sans-serif; color:#cde; overflow:hidden;";

    const head = document.createElement("div");
    head.style.cssText = "display:flex; align-items:center; gap:8px; padding:9px 14px; border-bottom:1px solid #1d2736; flex:0 0 auto;";
    head.innerHTML = '<span style="font-weight:700;color:#9fd;letter-spacing:.5px;">\uD83D\uDCD6 COMICS</span><span id="cmTitle" style="color:#8b97a8;font-size:11px;"></span>';
    const sp = document.createElement("div"); sp.style.flex = "1"; head.appendChild(sp);
    const dir = document.createElement("input"); dir.placeholder = "comics folder path"; dir.style.cssText = "width:300px;max-width:40vw;padding:5px 8px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:6px;font:11px ui-monospace,monospace;";
    const setB = document.createElement("button"); setB.textContent = "Scan"; setB.style.cssText = "padding:5px 11px;background:#2a4d3a;color:#cfe;border:1px solid #4a7d5a;border-radius:6px;cursor:pointer;font-size:11px;";
    const closeB = document.createElement("button"); closeB.textContent = "\u2715"; closeB.style.cssText = "padding:4px 9px;background:#1a2230;color:#cde;border:1px solid #2a3340;border-radius:6px;cursor:pointer;font-size:12px;";
    head.append(dir, setB, closeB); panel.appendChild(head);

    // gallery
    const gallery = document.createElement("div"); gallery.style.cssText = "flex:1 1 auto; overflow:auto; padding:12px; display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:12px; align-content:start;";
    panel.appendChild(gallery);

    // reader (hidden until a book is opened)
    const reader = document.createElement("div"); reader.style.cssText = "position:absolute; inset:0; top:42px; background:#06080c; display:none; flex-direction:column;";
    const stage = document.createElement("div"); stage.style.cssText = "flex:1 1 auto; overflow:auto; display:flex; align-items:flex-start; justify-content:center; gap:6px; padding:10px; background:#04050a;";
    const imgA = document.createElement("img"); const imgB = document.createElement("img");
    for (const im of [imgA, imgB]) im.style.cssText = "max-width:100%; height:auto; object-fit:contain; image-rendering:auto; border-radius:2px; box-shadow:0 4px 18px rgba(0,0,0,.5);";
    imgB.style.display = "none";
    stage.append(imgA, imgB);
    const ctrl = document.createElement("div"); ctrl.style.cssText = "flex:0 0 auto; display:flex; gap:8px; align-items:center; justify-content:center; padding:8px; border-top:1px solid #1d2736; background:#0a0d12;";
    const mkb = (t) => { const b = document.createElement("button"); b.textContent = t; b.style.cssText = "padding:6px 12px;background:#1a2230;color:#cde;border:1px solid #2a3340;border-radius:6px;cursor:pointer;font-size:12px;"; return b; };
    const backB = mkb("\u2190 Library"), prevB = mkb("\u2039 Prev"), nextB = mkb("Next \u203A");
    const counter = document.createElement("span"); counter.style.cssText = "font:11px ui-monospace,monospace;color:#9bb;min-width:80px;text-align:center;";
    const fitSel = document.createElement("select"); fitSel.style.cssText = "padding:5px 8px;background:#0c0f14;color:#cde;border:1px solid #2a3340;border-radius:6px;font-size:11px;";
    for (const [v, t] of [["width", "Fit width"], ["height", "Fit height"], ["full", "Actual size"]]) { const o = document.createElement("option"); o.value = v; o.textContent = t; fitSel.appendChild(o); }
    const dpg = document.createElement("label"); dpg.style.cssText = "display:flex;gap:5px;align-items:center;font-size:11px;color:#cde;"; const dpgC = document.createElement("input"); dpgC.type = "checkbox"; dpg.append(dpgC, document.createTextNode("2-page"));
    const vqSel = document.createElement("select"); vqSel.title = "PDF render quality (higher = sharper when zoomed)"; vqSel.style.cssText = "padding:5px 8px;background:#0c0f14;color:#cde;border:1px solid #2a3340;border-radius:6px;font-size:11px;";
    for (const [v, t] of [["0", "Normal"], ["220", "Sharp"], ["300", "Max"]]) { const o = document.createElement("option"); o.value = v; o.textContent = t; vqSel.appendChild(o); }
    const delB = mkb("\uD83D\uDDD1 Delete"); delB.title = "Delete this file (asks first)";
    ctrl.append(backB, prevB, counter, nextB, fitSel, dpg, vqSel, delB); reader.append(stage, ctrl); panel.appendChild(reader);

    document.body.appendChild(panel);

    let cur = null, idx = 0, total = 0, curIsPdf = false, viewDpi = 0, curName = "";
    const pageUrl = (id, i) => "/comics/page?id=" + encodeURIComponent(id) + "&i=" + i + ((curIsPdf && viewDpi) ? ("&dpi=" + viewDpi) : "");

    function applyFit() {
        const mode = fitSel.value;
        // v3403 -- hoisted OUT of the loop: reading stage.clientHeight after writing im.style forces a relayout
        // on every iteration. The value cannot change between the two images, so measuring once is the same
        // number for strictly less work.
        const stageH = stage.clientHeight;
        for (const im of [imgA, imgB]) {
            im.style.maxWidth = mode === "width" ? "100%" : "none";
            im.style.maxHeight = mode === "height" ? (stageH - 20) + "px" : "none";
            im.style.width = mode === "full" ? "auto" : (mode === "width" ? "100%" : "auto");
        }
        if (dpgC.checked) { imgA.style.maxWidth = "49%"; imgB.style.maxWidth = "49%"; }
    }
    function show() {
        if (!cur) return;
        counter.textContent = (idx + 1) + (dpgC.checked && idx + 1 < total ? "-" + (idx + 2) : "") + " / " + total;
        imgA.src = pageUrl(cur, idx);
        if (dpgC.checked && idx + 1 < total) { imgB.style.display = ""; imgB.src = pageUrl(cur, idx + 1); } else imgB.style.display = "none";
        applyFit();
        stage.scrollTop = 0;
    }
    function step(d) { const n = dpgC.checked ? 2 : 1; idx = Math.max(0, Math.min(total - 1, idx + d * n)); show(); }

    async function open(id, name) {
        const p = await api("pages?id=" + encodeURIComponent(id));
        if (!p.ok) { document.getElementById("cmTitle").textContent = "\u2717 " + (p.error || "can't read"); return; }
        cur = id; total = p.count; idx = 0; curIsPdf = (p.kind === "pdf"); curName = name;
        document.getElementById("cmTitle").textContent = name + " \u2014 " + total + " pages";
        reader.style.display = "flex"; show();
    }
    function closeReader() { reader.style.display = "none"; cur = null; document.getElementById("cmTitle").textContent = ""; }

    async function loadGallery() {
        const j = await api("list");
        gallery.innerHTML = "";
        if (!j.ok) { gallery.innerHTML = '<div style="color:#8b97a8;grid-column:1/-1;padding:10px;">' + (j.error || "set a comics folder above") + '</div>'; return; }
        if (!j.comics.length) { gallery.innerHTML = '<div style="color:#8b97a8;grid-column:1/-1;padding:10px;">no .cbz/.cbr files found in ' + j.dir + '</div>'; return; }
        for (const c of j.comics) {
            const card = document.createElement("div"); card.style.cssText = "cursor:pointer; display:flex; flex-direction:column; gap:5px;";
            const cov = document.createElement("div"); cov.style.cssText = "aspect-ratio:2/3; background:#0c1018; border:1px solid #1c2531; border-radius:6px; overflow:hidden; display:flex; align-items:center; justify-content:center;";
            const im = document.createElement("img"); im.loading = "lazy"; im.style.cssText = "width:100%;height:100%;object-fit:cover;"; im.src = pageUrl(c.id, 0); im.onerror = () => { cov.innerHTML = '<span style="font-size:10px;color:#566;padding:6px;text-align:center;">' + (c.ext.toUpperCase()) + '</span>'; };
            cov.appendChild(im);
            const t = document.createElement("div"); t.style.cssText = "font-size:10.5px;color:#bcd;line-height:1.3;max-height:28px;overflow:hidden;"; t.textContent = c.name;
            card.append(cov, t); card.onclick = () => open(c.id, c.name); gallery.appendChild(card);
        }
    }

    setB.addEventListener("click", async () => { await api("config", { dir: dir.value.trim() }); loadGallery(); });
    dir.addEventListener("keydown", e => { if (e.key === "Enter") setB.click(); });
    closeB.addEventListener("click", () => { panel.style.display = "none"; });
    backB.addEventListener("click", closeReader);
    prevB.addEventListener("click", () => step(-1));
    nextB.addEventListener("click", () => step(1));
    fitSel.addEventListener("change", applyFit);
    dpgC.addEventListener("change", show);
    vqSel.addEventListener("change", () => { viewDpi = parseInt(vqSel.value, 10) || 0; show(); });
    delB.addEventListener("click", async () => {
        if (!cur) return;
        if (!window.confirm("Delete \"" + (curName || "this file") + "\"?\n\nThis permanently removes the file from disk \u2014 it cannot be undone.")) return;
        delB.disabled = true;
        const r = await api("delete", { id: cur });
        delB.disabled = false;
        if (r && r.ok) { closeReader(); loadGallery(); } else { document.getElementById("cmTitle").textContent = "\u2717 " + ((r && r.error) || "delete failed"); }
    });
    window.addEventListener("keydown", e => { if (panel.style.display === "none" || !cur) return; if (e.key === "ArrowRight" || e.key === " ") { step(1); e.preventDefault(); } else if (e.key === "ArrowLeft") { step(-1); e.preventDefault(); } else if (e.key === "Escape") closeReader(); });

    (async () => { const c = await api("config"); dir.value = c.dir || ""; })();

    if (opts.tab !== false) {
        createMiniTab({ edge: "left", label: "COMICS", color: "voyager", onClick: () => { const showing = panel.style.display !== "none" && panel.style.display !== ""; panel.style.display = showing ? "none" : "flex"; if (!showing) loadGallery(); } });
    }
    // v1558 — opened from the Applications launcher when mounted with { tab: false }.
    return { root: panel, open: () => { panel.style.display = "flex"; try { loadGallery(); } catch {} }, close: () => { panel.style.display = "none"; } };
}
