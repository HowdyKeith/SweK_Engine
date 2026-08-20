// FILE: ui/confirmToast.js
// VERSION: v1499 — in-engine yes/no confirm toast with an optional auto-confirm countdown.
//
// tvNotify() only shows a passive notification. This adds a real interactive confirm that lives
// inside the engine (so it works on a headless/kiosk box with no Windows toast interaction), with
// Yes/No buttons and an optional "auto-Yes in Ns" countdown that fires Yes if no one answers.
//
//   const h = window.swekConfirm({
//       id: "engine-update",                  // dedupes; a second call with same id replaces
//       title: "Update ready",
//       message: "Install v1500 and restart?",
//       yesLabel: "Install & restart", noLabel: "Later",
//       autoYesSec: 30,                        // 0 = no auto-confirm
//       onYes: () => {...}, onNo: () => {...},
//   });
//   h.close();                                // dismiss programmatically (no callback)
//
// window.swekConfirm(opts) -> { close, el }

const G = (typeof window !== "undefined") ? window : globalThis;
const _open = new Map();   // id -> handle

function swekConfirm(opts = {}) {
    const id = opts.id || ("c" + Date.now());
    // replace an existing toast with the same id
    if (_open.has(id)) { try { _open.get(id).close(true); } catch {} }

    const wrap = document.createElement("div");
    wrap.style.cssText = "position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:99999;" +
        "background:rgba(10,18,26,.97);border:1px solid #2bd6ff;border-radius:10px;padding:13px 15px;" +
        "color:#cde;font:13px ui-monospace,monospace;box-shadow:0 10px 34px rgba(0,0,0,.55);max-width:min(560px,94vw);";
    if (opts.title) { const ti = document.createElement("div"); ti.style.cssText = "font-weight:700;margin-bottom:5px;color:#eaf6ff;"; ti.textContent = opts.title; wrap.appendChild(ti); }
    const msg = document.createElement("div"); msg.style.cssText = "margin-bottom:10px;line-height:1.45;"; msg.innerHTML = opts.message || ""; wrap.appendChild(msg);
    const row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;";
    const mk = (label, primary) => { const b = document.createElement("button"); b.textContent = label; b.style.cssText = "padding:6px 13px;border-radius:6px;cursor:pointer;font:12px ui-monospace,monospace;" + (primary ? "background:#0bf;color:#012;border:1px solid #2bd6ff;" : "background:#0c1622;color:#cde;border:1px solid #2a3340;"); return b; };
    const yes = mk(opts.yesLabel || "Yes", true);
    const no = mk(opts.noLabel || "No", false);
    const count = document.createElement("span"); count.style.cssText = "font-size:11px;color:#8b97a8;margin-left:auto;";
    row.append(yes, no, count); wrap.appendChild(row);

    let timer = null, remain = Math.max(0, parseInt(opts.autoYesSec || 0, 10) || 0), done = false;
    const cleanup = () => { if (timer) { clearInterval(timer); timer = null; } try { document.body.removeChild(wrap); } catch {} _open.delete(id); };
    const finish = (which, auto) => { if (done) return; done = true; cleanup(); try { if (which === "yes" && opts.onYes) opts.onYes({ auto: !!auto }); else if (which === "no" && opts.onNo) opts.onNo({ auto: !!auto }); } catch (e) {} };

    yes.onclick = () => finish("yes", false);
    no.onclick = () => { remain = 0; if (timer) { clearInterval(timer); timer = null; } finish("no", false); };

    if (remain > 0) {
        const paint = () => { count.textContent = "auto " + (opts.yesLabel || "yes").toLowerCase() + " in " + remain + "s"; };
        paint();
        timer = setInterval(() => { remain--; if (remain <= 0) { clearInterval(timer); timer = null; finish("yes", true); } else paint(); }, 1000);
    }

    document.body.appendChild(wrap);
    const handle = { id, el: wrap, close: (silent) => { if (done) return; done = true; cleanup(); if (!silent && opts.onClose) try { opts.onClose(); } catch {} },
                     setMessage: (html) => { msg.innerHTML = html; } };
    _open.set(id, handle);
    return handle;
}

G.swekConfirm = swekConfirm;
export default swekConfirm;
