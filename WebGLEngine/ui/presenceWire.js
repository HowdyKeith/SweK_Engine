// ui/presenceWire.js — v1301
// Wires Home Assistant presence into the engine. Opt-in via two localStorage flags so it
// never surprises:
//   voxelengine.presenceWire   — react to arrivals/departures (toast + avatar quip)
//   voxelengine.presenceAwayDim — dim the engine while nobody is home
// Both are toggled from the Presence panel (presence.html) or window.presence.*. The poll
// only hits HA while reactions are enabled. The first read after enabling just establishes
// a baseline (no reactions), so it won't announce everyone who's already home.

let _timer = null, _people = null, _baseline = false, _away = false, _dimEl = null;
const FLAG = "voxelengine.presenceWire", DIM = "voxelengine.presenceAwayDim";
const isOn  = () => { try { return localStorage.getItem(FLAG) === "1"; } catch { return false; } };
const dimOn = () => { try { return localStorage.getItem(DIM)  === "1"; } catch { return false; } };

function toast(text, color) { try { window.toast?.show?.({ text, color: color || "#9cf", durationMs: 4000 }); } catch {} }
function avatarSay(quip) { try { fetch("/avatar/mood", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mood: "support", quip }) }).catch(() => {}); } catch {} }

function setDim(active) {
    if (active && !_dimEl) {
        _dimEl = document.createElement("div");
        _dimEl.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:90000;pointer-events:none;transition:opacity .8s;opacity:0;";
        _dimEl.innerHTML = '<div style="position:absolute;left:14px;bottom:14px;color:#7fd0ff;font:12px ui-monospace,monospace;background:#0a0e14cc;border:1px solid #224a5e;border-radius:8px;padding:7px 11px;">\uD83C\uDFE0 nobody home \u2014 engine dimmed</div>';
        document.body.appendChild(_dimEl);
        requestAnimationFrame(() => { if (_dimEl) _dimEl.style.opacity = "1"; });
    } else if (!active && _dimEl) {
        const el = _dimEl; _dimEl = null; el.style.opacity = "0"; setTimeout(() => { try { el.remove(); } catch {} }, 800);
    }
}

async function tick() {
    if (!isOn()) { if (_dimEl) setDim(false); return; }      // disabled — don't poll HA, clear any dim
    let j; try { j = await fetch("/ha/presence", { cache: "no-store" }).then(r => r.json()); } catch { return; }
    if (!j || j.ok === false || !Array.isArray(j.people)) return;

    const cur = {}; j.people.forEach(p => { cur[p.name] = !!p.home; });
    if (_people && _baseline) {                              // diff people -> arrival / departure reactions
        for (const name in cur) {
            const was = _people[name];
            if (was === undefined) continue;                 // newly-seen entity: no transition yet
            if (!was && cur[name])      { toast("\uD83C\uDFE0 " + name + " is home", "#41e08a"); avatarSay("Welcome home, " + name + "!"); }
            else if (was && !cur[name]) { toast("\uD83D\uDC4B " + name + " left", "#8499ac");     avatarSay("See you later, " + name + "."); }
        }
    }
    _people = cur; _baseline = true;

    // away-dim on a whole-home empty / re-occupied transition
    const homeCount = (j.homeCount != null) ? j.homeCount : j.people.filter(p => p.home).length;
    const nowAway = j.people.length > 0 && homeCount === 0;
    if (nowAway !== _away) {
        _away = nowAway;
        if (dimOn()) {
            if (nowAway) { setDim(true);  toast("nobody home", "#7fd0ff"); }
            else         { setDim(false); toast("welcome back", "#41e08a"); }
        }
    }
    if (!dimOn() && _dimEl) setDim(false);
    window.presence._last = { homeCount, awayCount: j.awayCount, away: _away, people: cur };
}

export function installPresenceWire() {
    window.presence = {
        on:     () => { try { localStorage.setItem(FLAG, "1"); } catch {} tick(); return true; },
        off:    () => { try { localStorage.setItem(FLAG, "0"); } catch {} setDim(false); return false; },
        awayDim: (b) => { try { localStorage.setItem(DIM, b ? "1" : "0"); } catch {} if (!b) setDim(false); return !!b; },
        status: () => ({ enabled: isOn(), awayDim: dimOn(), ...(window.presence._last || {}) }),
        _last: null,
    };
    if (_timer) clearInterval(_timer);
    _timer = setInterval(tick, 12000);
    setTimeout(tick, 3000);                                  // first read soon after boot (baseline only)
    console.log("[presence] wired — window.presence.on()/off()/awayDim(true). Toggle from Settings \u2192 Network \u2192 Presence.");
}
