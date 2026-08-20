// FILE: ui/assetMigrate.js  (v1556)
// First-boot asset migration UI. A CLASSIC script (no ES module) so it runs the same on the
// full engine (index.html) and the headless server view (server.html) and any other boot page.
//
// Flow: once the page has FULLY loaded (window 'load' + a short settle so the engine finishes
// booting), GET /assets/migrate/check. If a prior engine version left user-added assets in its
// internal GPU_Assets, show a small progress card, POST /assets/migrate/start, and poll
// /assets/migrate/progress (same shape as the peer-sync bar) until done. A "Skip" link dismisses
// it for this version. Silent + invisible when there's nothing to migrate.
(function () {
  "use strict";
  if (window.__swekAssetMigrateRan) return; window.__swekAssetMigrateRan = true;

  var POLL_MS = 400, SETTLE_MS = 6000;   // v1632 - wait past the boot burst (peer/discovery/update polling) before migrating
  function j(url, opts) { return fetch(url, opts).then(function (r) { return r.json(); }).catch(function (e) { return { ok: false, error: e && e.message }; }); }
  function mb(b) { b = b || 0; return b < 1048576 ? (b / 1024).toFixed(0) + " KB" : (b / 1048576).toFixed(1) + " MB"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  function makeCard() {
    var c = document.createElement("div");
    c.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:2147483600;width:320px;max-width:90vw;background:rgba(6,16,22,.96);color:#dfe7f2;border:1px solid #1f5f78;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.55);font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;padding:12px 13px;backdrop-filter:blur(3px);";
    c.innerHTML =
      "<div style='display:flex;align-items:center;gap:8px;margin-bottom:6px'>" +
        "<span style='font-size:14px'>\u23F3</span>" +
        "<b id='amTitle' style='flex:1;color:#7fe0ff;font-weight:700'>Carrying assets forward</b>" +
        "<span id='amSkip' title='skip for this version' style='cursor:pointer;color:#8aa;font-size:11px'>skip</span>" +
      "</div>" +
      "<div id='amSub' style='color:#9fb3c6;margin-bottom:8px'></div>" +
      "<div style='height:10px;background:#0a1820;border:1px solid #163a48;border-radius:6px;overflow:hidden'>" +
        "<div id='amBar' style='height:100%;width:0%;background:linear-gradient(90deg,#1f9fd0,#2bd6ff);transition:width .25s ease'></div>" +
      "</div>" +
      "<div id='amStat' style='color:#8fb0c4;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'></div>";
    (document.body || document.documentElement).appendChild(c);
    return c;
  }

  function run() {
    j("/assets/migrate/check").then(function (chk) {
      if (!chk || !chk.ok || !chk.pending) return;   // nothing to do - stay invisible

      var card = makeCard();
      var title = card.querySelector("#amTitle"), sub = card.querySelector("#amSub");
      var bar = card.querySelector("#amBar"), stat = card.querySelector("#amStat"), skip = card.querySelector("#amSkip");
      var destLabel = chk.toExternal ? "your external assets folder" : ("this build (" + esc(chk.toVersion || "") + ")");
      title.textContent = "Carrying assets forward";
      sub.textContent = "moving " + chk.files + " asset" + (chk.files === 1 ? "" : "s") + " (" + mb(chk.bytes) + ") from " + esc(chk.fromVersion || "the internal folder") + " \u2192 " + destLabel;

      var dismissed = false;
      skip.addEventListener("click", function () { dismissed = true; j("/assets/migrate/dismiss", { method: "POST" }); fade(card); });

      if (chk.spaceWarning) {
        sub.innerHTML = "<span style='color:#ff8f8f'>Not enough free space on the destination drive to move " + mb(chk.bytes) + ". Set an external assets folder on a roomier drive (Settings \u2192 Assets) and retry.</span>";
        skip.textContent = "close";
        setTimeout(function () { if (!dismissed) fade(card); }, 9000);   // v1580 - don't leave it stuck on screen
        return;
      }

      j("/assets/migrate/start", { method: "POST" }).then(function (s) {
        if (!s || !s.ok) {
          sub.innerHTML = "<span style='color:#ff8f8f'>" + esc((s && s.error) || "couldn't start") + "</span>";
          skip.textContent = "close";
          setTimeout(function () { if (!dismissed) fade(card); }, 9000);   // v1580 - a failed start (e.g. "local only" from a non-trusted client) no longer leaves the card stuck at 0%
          return;
        }
        var timer = setInterval(function () {
          if (dismissed) { clearInterval(timer); return; }
          j("/assets/migrate/progress").then(function (p) {
            if (!p || !p.ok) return;
            var pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
            bar.style.width = pct + "%";
            stat.textContent = (p.done || 0) + "/" + (p.total || 0) + "  \u00b7  " + mb(p.movedBytes) + "/" + mb(p.totalBytes) + (p.current ? ("  \u00b7  " + p.current) : "");
            if (!p.active) {
              clearInterval(timer);
              bar.style.width = "100%";
              var err = (p.lastResult && p.lastResult.errors) || 0;
              if (err) {
                title.textContent = "Migrated with " + err + " error" + (err === 1 ? "" : "s");
                bar.style.background = "#caa05a";
                sub.innerHTML = "moved " + ((p.lastResult && p.lastResult.moved) || (p.done - err)) + " of " + p.total + " \u2014 the rest retries next boot";
              } else {
                title.textContent = "\u2713 Assets carried forward";
                bar.style.background = "linear-gradient(90deg,#1faa5a,#3bd67a)";
                sub.textContent = "moved " + p.total + " file" + (p.total === 1 ? "" : "s") + " into " + ((p.lastResult && p.lastResult.toExternal) || chk.toExternal ? "your external assets folder" : "this build");
              }
              stat.textContent = "";
              skip.textContent = "close";
              setTimeout(function () { if (!dismissed) fade(card); }, 6000);
            }
          });
        }, POLL_MS);
      });
    });
  }

  function fade(el) { try { el.style.transition = "opacity .5s ease"; el.style.opacity = "0"; setTimeout(function () { try { el.remove(); } catch (e) {} }, 600); } catch (e) { try { el.remove(); } catch (e2) {} } }

  function boot() { setTimeout(run, SETTLE_MS); }
  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot);
})();
