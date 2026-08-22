// kiosk.js — v1245
// Always-on phone mode for the connector views (x4 / starfield / fallout pip-boy).
// Fullscreen + landscape orientation lock + screen wake-lock (so the phone never
// sleeps) + re-acquire of the wake-lock when the tab returns to the foreground.
// Opt-in: add ?kiosk=1 to the URL (bookmark it on the spare phone), or tap the ⛶
// button. All APIs degrade to no-ops where unsupported. Fullscreen / orientation /
// wake-lock generally require a user gesture on mobile, so auto-enter also arms the
// first tap.
(function () {
  let wakeLock = null, on = false;

  async function acquireWake() {
    try {
      if ("wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener && wakeLock.addEventListener("release", () => { wakeLock = null; });
      }
    } catch (e) { /* denied or unsupported */ }
  }
  async function lockLandscape() {
    try { const o = screen.orientation; if (o && o.lock) await o.lock("landscape"); } catch (e) {}
  }
  async function goFullscreen() {
    try {
      const el = document.documentElement;
      const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (fn) await fn.call(el);
    } catch (e) {}
  }

  async function enter() {
    on = true;
    await goFullscreen(); await lockLandscape(); await acquireWake();
    document.documentElement.classList.add("kiosk");
    try { localStorage.setItem("swek.kiosk", "1"); } catch (e) {}
    syncBtn();
  }
  function exit() {
    on = false;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) {}
    try { wakeLock && wakeLock.release(); } catch (e) {} wakeLock = null;
    document.documentElement.classList.remove("kiosk");
    try { localStorage.removeItem("swek.kiosk"); } catch (e) {}
    syncBtn();
  }

  // Browsers drop the wake-lock when the page is hidden; re-acquire on return.
  document.addEventListener("visibilitychange", () => {
    if (on && document.visibilityState === "visible" && !wakeLock) acquireWake();
  });

  let btn = null;
  function syncBtn() { if (btn) { btn.style.opacity = on ? "0.55" : "1"; btn.title = on ? "Exit kiosk" : "Kiosk (fullscreen · landscape · stay awake)"; } }
  function addButton() {
    btn = document.createElement("button");
    btn.textContent = "⛶";
    btn.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:9999;width:40px;height:40px;border-radius:10px;border:1px solid #2a4a55;background:rgba(14,39,48,.8);color:#5ff0e6;font-size:18px;cursor:pointer;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);";
    btn.onclick = () => on ? exit() : enter();
    document.body.appendChild(btn); syncBtn();
  }

  window.SweKKiosk = { enter, exit, isOn: () => on };

  if (document.readyState !== "loading") addButton();
  else document.addEventListener("DOMContentLoaded", addButton);

  // Auto-enter for the always-on phone: ?kiosk=1 or a remembered prior session.
  const auto = /[?&]kiosk=1\b/.test(location.search) ||
    (function () { try { return localStorage.getItem("swek.kiosk") === "1"; } catch (e) { return false; } })();
  if (auto) {
    const once = () => { enter(); window.removeEventListener("pointerdown", once); };
    enter();                                            // works if already user-activated
    window.addEventListener("pointerdown", once, { once: true });   // else first tap arms it
  }
})();
