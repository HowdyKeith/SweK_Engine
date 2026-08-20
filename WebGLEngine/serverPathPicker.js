// serverPathPicker.js — phone-friendly server folder/file picker for the
// standalone pages (comics, avatar stage, asset library, pip-boy). Browses the
// PC filesystem via /fs/roots + /fs/list so a path can be tapped instead of
// typed. Exposes window.pickServerPath({mode:"folder"|"file", start, title})
// -> Promise<path|null>. One definition; pages just <script src> this.
(function () {
    if (window.pickServerPath) return;
    window.pickServerPath = function (opts) {
        opts = opts || {}; var mode = opts.mode || "folder";
        return new Promise(function (resolve) {
            var ov = document.createElement("div"); ov.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:14px;";
            var box = document.createElement("div"); box.style.cssText = "background:#11161e;border:1px solid #2a3340;border-radius:12px;width:min(540px,96vw);max-height:84vh;display:flex;flex-direction:column;overflow:hidden;color:#dde6f2;font:13px ui-monospace,monospace;box-shadow:0 14px 50px rgba(0,0,0,.6);";
            var head = document.createElement("div"); head.style.cssText = "padding:11px 13px;border-bottom:1px solid #1c2531;font-weight:bold;"; head.textContent = opts.title || (mode === "file" ? "Select a file" : "Select a folder");
            var cur = document.createElement("div"); cur.style.cssText = "padding:7px 13px;font-size:11px;color:#9fb0c8;background:#0c0f14;word-break:break-all;border-bottom:1px solid #1c2531;";
            var list = document.createElement("div"); list.style.cssText = "flex:1;overflow:auto;padding:6px;display:flex;flex-direction:column;gap:2px;min-height:180px;";
            var foot = document.createElement("div"); foot.style.cssText = "padding:9px 13px;border-top:1px solid #1c2531;display:flex;gap:8px;justify-content:flex-end;";
            var mk = function (t, p) { var b = document.createElement("button"); b.textContent = t; b.style.cssText = "padding:8px 13px;border-radius:7px;cursor:pointer;font:12px ui-monospace,monospace;" + (p ? "background:#16361f;color:#bfffd9;border:1px solid #1aa257;" : "background:#1c2733;color:#dde6f2;border:1px solid #2a3a4a;"); return b; };
            var cancel = mk("Cancel", false), choose = mk(mode === "file" ? "Select file" : "Use this folder", true);
            foot.appendChild(cancel); foot.appendChild(choose);
            box.appendChild(head); box.appendChild(cur); box.appendChild(list); box.appendChild(foot); ov.appendChild(box); document.body.appendChild(ov);
            var here = opts.start || "";
            var close = function (v) { try { document.body.removeChild(ov); } catch (e) {} resolve(v); };
            cancel.onclick = function () { close(null); }; choose.onclick = function () { close(here || null); }; ov.onclick = function (e) { if (e.target === ov) close(null); };
            var row = function (label, icon, onClick) { var r = document.createElement("div"); r.style.cssText = "display:flex;gap:8px;align-items:center;padding:9px;border-radius:6px;cursor:pointer;"; r.onmouseenter = function () { r.style.background = "#1a212c"; }; r.onmouseleave = function () { r.style.background = ""; }; var i = document.createElement("span"); i.textContent = icon; var t = document.createElement("span"); t.textContent = label; t.style.wordBreak = "break-all"; r.appendChild(i); r.appendChild(t); r.onclick = onClick; return r; };
            function roots() {
                here = ""; cur.textContent = "Drives / start"; list.innerHTML = ""; choose.style.display = "none";
                fetch("/fs/roots").then(function (r) { return r.json(); }).catch(function () { return null; }).then(function (j) {
                    if (!j || !j.ok) { list.appendChild(row("can't read drives (sign in if remote)", "\u26A0", function () {})); return; }
                    if (j.home) list.appendChild(row("Home  " + j.home, "\uD83C\uDFE0", function () { browse(j.home); }));
                    if (j.engine) list.appendChild(row("Engine folder", "\u2699", function () { browse(j.engine); }));
                    (j.roots || []).forEach(function (d) { list.appendChild(row(d, "\uD83D\uDCBD", function () { browse(d); })); });
                });
            }
            function browse(dir) {
                choose.style.display = "";
                fetch("/fs/list?path=" + encodeURIComponent(dir)).then(function (r) { return r.json(); }).catch(function () { return null; }).then(function (j) {
                    if (!j || !j.ok) {
                        cur.textContent = dir + " \u2014 " + ((j && j.error) || "no response");
                        list.innerHTML = "";
                        list.appendChild(row("\uD83D\uDCBD back to drives / start", "\u21a9", function () { roots(); }));
                        var par = dir.replace(/[\\\/]+$/, "").replace(/[\\\/][^\\\/]*$/, "");
                        if (par && par !== dir) list.appendChild(row(".. up to " + par, "\u2B06", function () { browse(par); }));
                        return;
                    }
                    here = j.path; cur.textContent = j.path; list.innerHTML = "";
                    list.appendChild(row(".. up", "\u2B06", function () { if (j.parent) browse(j.parent); else roots(); }));
                    (j.folders || []).forEach(function (f) { list.appendChild(row(f.name, "\uD83D\uDCC1", function () { browse(f.path); })); });
                    if (mode === "file") (j.files || []).forEach(function (f) { list.appendChild(row(f.name, "\uD83D\uDCC4", function () { close(f.path); })); });
                });
            }
            if (here) browse(here); else roots();
        });
    };
    // Convenience: a button handler that picks the GLOBAL assets folder and saves
    // it via /config/assets-dir, then calls onDone(path, info). For pages that
    // load from /GPU_Assets/*.
    window.pickAssetsFolder = function (onDone) {
        fetch("/config/assets-dir").then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (c) {
            window.pickServerPath({ mode: "folder", title: "Pick the assets folder", start: (c && c.assetsDir) || "" }).then(function (p) {
                if (!p) return;
                fetch("/config/assets-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dir: p }) })
                    .then(function (r) { return r.json(); }).catch(function (e) { return { ok: false, error: e.message }; })
                    .then(function (j) { if (onDone) onDone(p, j); });
            });
        });
    };
})();
