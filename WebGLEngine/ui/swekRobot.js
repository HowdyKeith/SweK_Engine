// ui/swekRobot.js — v1688
import { guardedTick } from "/ui/poller.js";   // v2771 — brain poll routes through polling discipline (hidden/in-flight/cap)
// The little SweK robot (CSS-animated SVG, no GL). Shared by the docked gauges, the page gauges, and server.html.
// It now has a comfortable "life flow": idle bob + blink always, and it periodically WAVES, NODS, DANCES, or CHEERS
// (pom-poms) — a light echo of the rigged 3D avatar's expressions, without the cost. flashError() still goes red.
//   const bot = createSwekRobot();           // -> { el, setState, flashError, play, state }
//   bot.play("cheer", 3000)                  // force an expression for a bit
//   bot.flashError()                         // red alarm for ~4s

let _stylesInjected = false;
function _injectStyles() {
    if (_stylesInjected) return; _stylesInjected = true;
    const css =
        "@keyframes swekBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}" +
        "@keyframes swekBlink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(0.12)}}" +
        "@keyframes swekAlarm{0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-1.5px) rotate(-4deg)}75%{transform:translateY(-1.5px) rotate(4deg)}}" +
        // sway (dance) of the whole body
        "@keyframes swekSway{0%,100%{transform:translateX(0) rotate(0)}25%{transform:translateX(-3px) rotate(-5deg)}75%{transform:translateX(3px) rotate(5deg)}}" +
        // head nod
        "@keyframes swekNod{0%,100%{transform:rotate(0)}20%,60%{transform:rotate(12deg)}40%,80%{transform:rotate(0)}}" +
        // head spin (full 360 with ease-in and ease-out, slight head tilt at peak)
        "@keyframes swekSpin{0%{transform:rotate(0) scaleX(1)}25%{transform:rotate(90deg) scaleX(0.4)}50%{transform:rotate(180deg) scaleX(1)}75%{transform:rotate(270deg) scaleX(0.4)}100%{transform:rotate(360deg) scaleX(1)}}" +
        // single-arm wave (right arm up + wag)
        "@keyframes swekWaveR{0%{transform:rotate(0)}15%{transform:rotate(-150deg)}33%{transform:rotate(-128deg)}51%{transform:rotate(-158deg)}69%{transform:rotate(-130deg)}85%{transform:rotate(-150deg)}100%{transform:rotate(0)}}" +
        // dance arm swings (opposite phase)
        "@keyframes swekSwingL{0%,100%{transform:rotate(16deg)}50%{transform:rotate(-22deg)}}" +
        "@keyframes swekSwingR{0%,100%{transform:rotate(-16deg)}50%{transform:rotate(22deg)}}" +
        // cheer: both arms up + shake
        "@keyframes swekCheerL{0%,100%{transform:rotate(140deg)}50%{transform:rotate(162deg)}}" +
        "@keyframes swekCheerR{0%,100%{transform:rotate(-140deg)}50%{transform:rotate(-162deg)}}" +
        "@keyframes swekPom{0%,100%{transform:scale(1) rotate(-12deg)}50%{transform:scale(1.18) rotate(12deg)}}" +
        // ---- base state ----
        ".swekRobot .botBody{animation:swekBob 3.2s ease-in-out infinite;transform-origin:50% 100%}" +
        ".swekRobot .botEyes{animation:swekBlink 5.5s ease-in-out infinite;transform-origin:50% 50%;transform-box:fill-box}" +
        // v1935 — offline "X X" eyes: hidden normally; when .botOffline, hide the round eyes (and their blink) and show the X's.
        ".swekRobot .botEyesX{display:none}" +
        ".swekRobot.botOffline .botEyes{display:none}" +
        ".swekRobot.botOffline .botEyesX{display:block}" +
        ".swekRobot .botArmL{transform-origin:14px 38px;transform-box:view-box;transition:transform 0.4s ease}" +
        ".swekRobot .botArmR{transform-origin:46px 38px;transform-box:view-box;transition:transform 0.4s ease}" +
        ".swekRobot .botHead{transform-origin:30px 14px;transform-box:view-box}" +
        ".swekRobot .botPom{opacity:0;transform-box:fill-box;transform-origin:50% 50%;transition:opacity 0.25s ease}" +
        // ---- error ----
        // v3024 -- BRAIN LIGHT STATES. --brainLit says how many of the four cores are lit; the classes say what
        // the lighting MEANS. Nothing here is decorative: every rule matches a distinction the activity block
        // makes, and flattening any would let the avatar say something the fleet view does not.
        ".swekRobot{--brainLit:1}" +
        ".swekRobot .botDomeLight{transition:opacity .5s,fill .5s}" +
        ".swekRobot.brainIdle .botDomeLight{opacity:.3;animation:swekBrainAmbient 3.4s ease-in-out infinite}" +
        ".swekRobot.brainRunning .botDomeLight{animation:swekBrainRun 1.1s ease-in-out infinite}" +
        ".swekRobot.brainWorse .botDomeLight{animation:swekBrainRun 1.1s ease-in-out infinite;fill:#ffb46a!important}" +
        // STUCK DOES NOT ANIMATE. A frozen pattern reads as stuck; dark reads as finished, and it is not.
        ".swekRobot.brainStuck .botDomeLight{animation:none!important;opacity:.5;fill:#e6c877!important}" +
        ".swekRobot.brainUnknown .botDomeLight{animation:none!important;opacity:.18;fill:#7f8f88!important}" +
        // v3114 -- FACE-UNKNOWN IS NOT BRAIN-UNKNOWN. "the roundhouse is unreachable" and "the camera cannot
        // see you" are separate facts with separate fixes, so they get separate marks and can show at once:
        // brainUnknown kills the DOME LIGHT, faceUnknown dims the EYES. Putting both on one class would be the
        // two-things-one-label shape, and putting the face state on the dome would make a camera problem look
        // like a network problem.
        ".swekRobot.faceUnknown .botEyes{opacity:.3}" +
        ".swekRobot.faceUnknown .botEyeL,.swekRobot.faceUnknown .botEyeR{animation:none!important}" +
        "@keyframes swekBrainAmbient{0%,100%{opacity:.3}50%{opacity:.7}}" +
        "@keyframes swekBrainRun{0%,100%{opacity:.35}50%{opacity:1}}" +
        ".swekRobot.botErr .botBody{animation:swekAlarm 0.45s ease-in-out infinite;filter:drop-shadow(0 0 5px #f43) drop-shadow(0 0 2px #f00)}" +
        ".swekRobot.botErr .botAntTip{fill:#f44!important}" +
        // ---- wave ----
        ".swekRobot.fx-wave .botArmR{animation:swekWaveR 1.9s ease-in-out;transform-origin:46px 38px;transform-box:view-box}" +
        // ---- nod ----
        ".swekRobot.fx-nod .botHead{animation:swekNod 1.1s ease-in-out}" +
        // ---- spin ----
        ".swekRobot.fx-spin .botHead{animation:swekSpin 0.7s cubic-bezier(0.4,0,0.2,1);transform-origin:30px 22px;transform-box:view-box}" +
        // ---- dance ----
        ".swekRobot.fx-dance .botBody{animation:swekBob 3.2s ease-in-out infinite,swekSway 1.05s ease-in-out infinite}" +
        ".swekRobot.fx-dance .botArmL{animation:swekSwingL 1.05s ease-in-out infinite}" +
        ".swekRobot.fx-dance .botArmR{animation:swekSwingR 1.05s ease-in-out infinite}" +
        // ---- cheer ----
        ".swekRobot.fx-cheer .botArmL{animation:swekCheerL 0.5s ease-in-out infinite}" +
        ".swekRobot.fx-cheer .botArmR{animation:swekCheerR 0.5s ease-in-out infinite}" +
        ".swekRobot.fx-cheer .botPom{opacity:1;animation:swekPom 0.5s ease-in-out infinite}" +
        // ---- talk (mouth flap while the spoken ticker is talking) ----
        "@keyframes swekTalk{0%,100%{transform:scaleY(1)}50%{transform:scaleY(3.2)}}" +
        // ---- antenna ping ripple (one per ACTUAL network ping; mirrors the radar) ----
        "@keyframes swekAntPing{0%{transform:scale(1);opacity:0.85}60%{opacity:0.35}100%{transform:scale(8);opacity:0}}" +
        ".swekRobot .botMouth{transform-origin:50% 50%;transform-box:fill-box;transition:transform 0.07s ease}" +
        ".swekRobot.mouthOpen .botMouth{transform:scaleY(3.0)}" +
        ".swekRobot.talking .botMouth{animation:swekTalk 0.16s ease-in-out infinite}" +
        // ---- antenna emanation: glow on each ring + a tip pulse while actively scanning ----
        ".swekRobot .antRing{filter:drop-shadow(0 0 1.5px #7fe9ff)}" +
        "@keyframes swekAntTip{0%,100%{opacity:1}50%{opacity:0.5}}" +
        ".swekRobot.antScan .botAntTip{animation:swekAntTip 0.5s ease-in-out infinite}" +
        // ---- GPU brain piece on the head: a whirlpool that swirls while the brain is solving ----
        ".swekRobot .botBrainDome{transition:fill .45s ease}" +
        ".swekRobot .botWhirl{transform-origin:30px 11px;transform-box:view-box;opacity:.3;transition:opacity .45s ease}" +
        ".swekRobot .botBrainSpark{opacity:0;transition:opacity .45s ease}" +
        ".swekRobot.brainOn .botBrainDome{fill:#1f6f6b}" +
        ".swekRobot.brainOn .botWhirl{opacity:1;animation:swekWhirl 2.1s linear infinite}" +
        ".swekRobot.brainOn .botBrainSpark{opacity:.9;animation:swekSpark 2.1s ease-in-out infinite}" +
        // ---- glass dome over the brain, with lights that flash periodically and cast a glow onto it ----
        ".swekRobot .botDomeHalo{opacity:0}" +
        ".swekRobot .botDomeLight{opacity:.4}" +
        ".swekRobot .hl1{animation:swekDomeHalo 3.6s ease-in-out infinite}" +
        ".swekRobot .ll1{animation:swekDomeCore 3.6s ease-in-out infinite}" +
        ".swekRobot .hl2{animation:swekDomeHalo 3.6s ease-in-out infinite 1.2s}" +
        ".swekRobot .ll2{animation:swekDomeCore 3.6s ease-in-out infinite 1.2s}" +
        ".swekRobot .hl3{animation:swekDomeHalo 3.6s ease-in-out infinite 2.4s}" +
        ".swekRobot .ll3{animation:swekDomeCore 3.6s ease-in-out infinite 2.4s}" +
        "@keyframes swekDomeHalo{0%,100%{opacity:0}12%{opacity:.5}32%{opacity:.04}}" +
        "@keyframes swekDomeCore{0%,100%{opacity:.35}12%{opacity:1}32%{opacity:.4}}" +
        "@keyframes swekWhirl{to{transform:rotate(-360deg)}}" +
        "@keyframes swekSpark{0%,100%{opacity:.35}50%{opacity:1}}" +
        "";
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
}

// A small Archimedean whirlpool spiral for the brain piece, centred at (30,8).
function _whirlPath() {
    const pts = [], steps = 52, turns = 2.25, maxR = 2.6;
    for (let i = 0; i <= steps; i++) { const th = (i / steps) * turns * 2 * Math.PI, r = maxR * (i / steps); pts.push((30 + r * Math.cos(th)).toFixed(1) + " " + (11 + r * Math.sin(th)).toFixed(1)); }
    return "M" + pts.join(" L");
}
const _WHIRL = _whirlPath();

export function createSwekRobot(opts = {}) {
    _injectStyles();
    const w = opts.width || 60, h = opts.height || 88;
    const gid = "swekBotGrad" + Math.random().toString(36).slice(2, 8);
    const wrap = document.createElement("span");
    wrap.className = "swekRobot";
    wrap.style.display = "inline-flex"; wrap.style.lineHeight = "0";
    wrap.innerHTML =
        '<svg viewBox="0 0 60 88" width="' + w + '" height="' + h + '" style="overflow:visible" xmlns="http://www.w3.org/2000/svg">' +
        '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#cfe9ff"/><stop offset="1" stop-color="#7fb6d8"/></linearGradient></defs>' +
        '<g class="botBody">' +
        // pom-poms (behind arms, shown on cheer) — left up-left, right up-right
        '<g transform="translate(6,23)"><g class="botPom"><g stroke="#ff5ad0" stroke-width="1.4">' +
        '<line x1="0" y1="-4" x2="0" y2="4"/><line x1="-4" y1="0" x2="4" y2="0"/><line x1="-3" y1="-3" x2="3" y2="3"/><line x1="-3" y1="3" x2="3" y2="-3"/></g>' +
        '<circle r="1.6" fill="#ffd0f0"/></g></g>' +
        '<g transform="translate(54,23)"><g class="botPom"><g stroke="#5ad6ff" stroke-width="1.4">' +
        '<line x1="0" y1="-4" x2="0" y2="4"/><line x1="-4" y1="0" x2="4" y2="0"/><line x1="-3" y1="-3" x2="3" y2="3"/><line x1="-3" y1="3" x2="3" y2="-3"/></g>' +
        '<circle r="1.6" fill="#d0f4ff"/></g></g>' +
        // head group (antenna + head + eyes) — nods
        '<g class="botHead">' +
        // GPU brain piece: a bumpy cap seated on the head top; whirlpool swirls while solving
        '<g class="botBrain">' +
        // dome interior
        '<path d="M17 15 Q17 2 30 2 Q43 2 43 15 Z" fill="#0a1a26" opacity="0.5"/>' +
        // small brain, nestled low into the forehead with headroom above
        '<path class="botBrainDome" d="M23.5 15 Q22 10 26 9.5 Q28 8 30 9.6 Q32 8 34 9.5 Q38 10 36.5 15 Z" fill="#3a5870" stroke="#4a6f88" stroke-width="0.7"/>' +
        '<path d="M25.5 13.5 Q27.5 11.2 29.5 13.5 T33.5 13.5" fill="none" stroke="#243b4e" stroke-width="0.7" opacity="0.7"/>' +
        '<g class="botWhirl"><path d="' + _WHIRL + '" fill="none" stroke="#33ccff" stroke-width="1" stroke-linecap="round"/></g>' +
        '<circle class="botBrainSpark" cx="30" cy="11" r="1.3" fill="#9fe6c0"/>' +
        // flashing light halos cast a glow down over the brain
        '<circle class="botDomeHalo hl1" cx="23" cy="7" r="6" fill="#ffd47a"/>' +
        '<circle class="botDomeHalo hl2" cx="30" cy="5" r="6" fill="#7affea"/>' +
        '<circle class="botDomeHalo hl3" cx="37" cy="7" r="6" fill="#ff9ad0"/>' +
        // glass dome (semi-transparent front)
        '<path class="botDomeGlass" d="M17 15 Q17 2 30 2 Q43 2 43 15" fill="#82cdff" fill-opacity="0.09" stroke="#8fd6ff" stroke-width="1" stroke-opacity="0.5"/>' +
        // bright light cores, flashing periodically
        '<circle class="botDomeLight ll1" cx="23" cy="7" r="1.5" fill="#fff0c0"/>' +
        '<circle class="botDomeLight ll2" cx="30" cy="5" r="1.5" fill="#d8fff6"/>' +
        '<circle class="botDomeLight ll3" cx="37" cy="7" r="1.5" fill="#ffd4ec"/>' +
        // glass shine
        '<path d="M21 12 Q20 4 27 2.8" fill="none" stroke="#ffffff" stroke-width="1.1" stroke-opacity="0.38" stroke-linecap="round"/>' +
        '</g>' +
        '<line x1="30" y1="2" x2="30" y2="-4" stroke="#7fb6d8" stroke-width="2"/>' +
        '<circle class="botAntTip" cx="30" cy="-5" r="2.6" fill="#5ad6ff"/>' +
        '<rect x="16" y="14" width="28" height="20" rx="6" fill="url(#' + gid + ')" stroke="#5a90b4" stroke-width="1"/>' +
        '<g class="botEyes"><circle cx="24" cy="24" r="3" fill="#0b2536"/><circle cx="36" cy="24" r="3" fill="#0b2536"/></g>' +
        // v1935 — dead "X X" eyes shown when the internet is down (hidden by default; .botOffline swaps them in)
        '<g class="botEyesX">' +
        '<line x1="21.5" y1="21.5" x2="26.5" y2="26.5" stroke="#0b2536" stroke-width="1.6" stroke-linecap="round"/><line x1="26.5" y1="21.5" x2="21.5" y2="26.5" stroke="#0b2536" stroke-width="1.6" stroke-linecap="round"/>' +
        '<line x1="33.5" y1="21.5" x2="38.5" y2="26.5" stroke="#0b2536" stroke-width="1.6" stroke-linecap="round"/><line x1="38.5" y1="21.5" x2="33.5" y2="26.5" stroke="#0b2536" stroke-width="1.6" stroke-linecap="round"/>' +
        '</g>' +
        '<rect class="botMouth" x="25.5" y="29" width="9" height="2" rx="1" fill="#0b2536"/>' +
        '</g>' +
        // torso
        '<rect x="19" y="36" width="22" height="24" rx="5" fill="url(#' + gid + ')" stroke="#5a90b4" stroke-width="1"/>' +
        '<circle cx="30" cy="46" r="3.4" fill="#5ad6ff"/>' +
        '<rect x="25" y="52" width="10" height="3" rx="1.5" fill="#5a90b4"/>' +
        // arms (animatable)
        '<rect class="botArmL" x="11" y="38" width="6" height="16" rx="3" fill="url(#' + gid + ')" stroke="#5a90b4" stroke-width="0.8"/>' +
        '<rect class="botArmR" x="43" y="38" width="6" height="16" rx="3" fill="url(#' + gid + ')" stroke="#5a90b4" stroke-width="0.8"/>' +
        // legs + feet
        '<rect x="22" y="60" width="6" height="16" rx="3" fill="url(#' + gid + ')" stroke="#5a90b4" stroke-width="0.8"/>' +
        '<rect x="32" y="60" width="6" height="16" rx="3" fill="url(#' + gid + ')" stroke="#5a90b4" stroke-width="0.8"/>' +
        '<ellipse cx="25" cy="78" rx="5" ry="3" fill="#5a90b4"/><ellipse cx="35" cy="78" rx="5" ry="3" fill="#5a90b4"/>' +
        '</g></svg>';

    let _state = "ok", _fxTimer = 0, _flowTimer = 0, _curFx = "", _lastPing = 0;
    const FX = ["wave", "nod", "dance", "cheer", "spin"];

    function _clearFx() { for (const f of FX) wrap.classList.remove("fx-" + f); _curFx = ""; }
    function play(name, ms) {
        if (_state === "error") return;            // don't override the alarm
        if (!FX.includes(name)) return;
        _clearFx(); _curFx = name; wrap.classList.add("fx-" + name);
        try { window.dispatchEvent(new CustomEvent("swek:move", { detail: { move: name } })); } catch (e) {}
        clearTimeout(_fxTimer);
        const dur = ms || (name === "dance" ? 4200 : name === "cheer" ? 3200 : 2000);
        _fxTimer = setTimeout(() => { wrap.classList.remove("fx-" + name); if (_curFx === name) _curFx = ""; }, dur);
    }
    // comfortable life flow: mostly idle, occasionally an expression. Weighted so it feels alive, not busy.
    function _scheduleFlow() {
        clearTimeout(_flowTimer);
        const gap = 6000 + Math.random() * 9000;   // 6–15s between expressions
        _flowTimer = setTimeout(() => {
            if (_state !== "error" && !document.hidden) {
                const pick = ["wave", "nod", "nod", "dance", "cheer", "wave"][Math.floor(Math.random() * 6)];
                play(pick);
            }
            _scheduleFlow();
        }, gap);
    }
    _scheduleFlow();

    function setState(key) {
        _state = key;
        wrap.classList.toggle("botErr", key === "error");
        if (key === "error") _clearFx();
    }
    function setTalking(on) { try { wrap.classList.toggle("talking", !!on); } catch {} }

    // v3024 -- THE BRAIN LIGHTS MEAN SOMETHING NOW. They have flashed on a TIMER since they were drawn: pretty,
    // and carrying exactly zero information. The roundhouse has published a real activity block since v3018
    // (idle / running / unattended / unknown, plus the step trajectory from v3007) and nothing was reading it.
    //
    // THE MAPPING IS DELIBERATELY NOT "MORE LIGHTS = BETTER":
    //   idle        one light, slow ambient. The engine is up and nothing is being asked of it.
    //   running     lights advance with round N of M, so the avatar shows PROGRESS rather than mere activity.
    //   worsened    the running colour shifts WARM. This is the one worth seeing across a room, and the whole
    //               reason to drive lights instead of printing text -- v3007 measured runs that ended worse
    //               than they started, and a verdict alone hides that completely.
    //   unattended  the pattern FREEZES mid-cycle rather than going dark. A frozen pattern reads as STUCK; dark
    //               reads as FINISHED, and it is not. A box that died mid-run says "running" forever.
    //   unknown     dim, not off. A peer on a build too old to report is not an idle box.
    //
    // setBrain takes the block THE PEER PUBLISHES, so this cannot drift from what the fleet view says.
    function setBrain(act) {
        try {
            const st = (act && act.state) || "unknown";
            for (const c of ["brainIdle", "brainRunning", "brainWorse", "brainStuck", "brainUnknown"]) wrap.classList.remove(c);
            if (st === "running") {
                const worse = act && act.trajectory === "worsened-overall";
                wrap.classList.add(worse ? "brainWorse" : "brainRunning");
                // Progress drives how many cores are lit. Unknown round -> 1, never 0: a running box with no
                // round yet is still running, and a dark brain would say otherwise.
                const n = (act.round != null && act.maxRounds) ? Math.max(1, Math.min(4, Math.ceil((act.round / act.maxRounds) * 4))) : 1;
                wrap.style.setProperty("--brainLit", String(n));
            } else if (st === "unattended") {
                wrap.classList.add("brainStuck");
                wrap.style.setProperty("--brainLit", "2");
            } else if (st === "idle") {
                wrap.classList.add("brainIdle");
                wrap.style.setProperty("--brainLit", "1");
            } else {
                wrap.classList.add("brainUnknown");
                wrap.style.setProperty("--brainLit", "1");
            }
            _brain = st;
        } catch {}
    }
    let _brain = "unknown";
    // v1935 — internet down -> dead X eyes. Independent of error/talking state (a box can be alarmed AND offline).
    function setOffline(on) { try { wrap.classList.toggle("botOffline", !!on); } catch {} }
    let _pulseT = 0;
    function pingRipple(opts) {
        try {
            const svg = wrap.querySelector("svg"); if (!svg) return;
            const NS = "http://www.w3.org/2000/svg";
            const col = (opts && opts.color) || "#5ad6ff";
            const c = document.createElementNS(NS, "circle");
            c.setAttribute("class", "antRing");
            c.setAttribute("cx", "30"); c.setAttribute("cy", "-5"); c.setAttribute("r", "2.6"); c.setAttribute("fill", "none");
            c.setAttribute("stroke", col); c.setAttribute("stroke-width", "1.7"); c.setAttribute("vector-effect", "non-scaling-stroke");
            const aR = document.createElementNS(NS, "animate"); aR.setAttribute("attributeName", "r"); aR.setAttribute("from", "2.6"); aR.setAttribute("to", "21"); aR.setAttribute("dur", "1.2s"); aR.setAttribute("fill", "freeze");
            const aO = document.createElementNS(NS, "animate"); aO.setAttribute("attributeName", "opacity"); aO.setAttribute("from", "1"); aO.setAttribute("to", "0"); aO.setAttribute("dur", "1.2s"); aO.setAttribute("fill", "freeze");
            c.appendChild(aR); c.appendChild(aO); svg.appendChild(c);
            setTimeout(function () { try { c.remove(); } catch (e) {} }, 1300);
        } catch (e) {}
    }
    // Sustained emanation: while a scan keeps pinging, keep waves radiating + pulse the antenna tip.
    let _scanUntil = 0, _scanTimer = 0;
    function antennaScan(ms) {
        _scanUntil = Math.max(_scanUntil, Date.now() + (ms || 1500));
        try { wrap.classList.add("antScan"); } catch (e) {}
        if (!_scanTimer) {
            _scanTimer = setInterval(function () {
                if (Date.now() >= _scanUntil) { clearInterval(_scanTimer); _scanTimer = 0; try { wrap.classList.remove("antScan"); } catch (e) {} return; }
                pingRipple();
            }, 360);
        }
    }
    function mouthPulse(ms) { try { wrap.classList.add("mouthOpen"); clearTimeout(_pulseT); _pulseT = setTimeout(function () { wrap.classList.remove("mouthOpen"); }, ms || 120); } catch {} }
    // shared event -> move classifier. Each context (server.html log, engine toasts, page peer-watch) feeds its own
    // stream in via react(line); the mapping + throttle live here so all robots behave the same.
    let _lastReact = 0;
    function react(line) {
        try {
            const msg = String((line && (line.msg != null ? line.msg : line)) || "");
            const lvl = String((line && line.level) || "");
            if (lvl === "error") { flashError(); return; }
            const now = Date.now(); if (now - _lastReact < 4500) return;
            let move = null;
            if (lvl === "success") move = "cheer";
            else if (/\u{1F44B}|remote login|hiring agent|new peer|peer online|peer joined|peer discovered|peer connected|introduc|welcome|came online|new subscriber|new follower|rustdesk|remote desktop|rdp\b|connecting to/iu.test(msg)) move = "wave";
            else if (/request view|RustDesk view request|incoming.*connect|peer.*connect.*you/iu.test(msg)) move = "spin";
            else if (/\u2713|\u2705|synced|sync complete|up to date|all good|completed|complete|success|cleared|achiev/i.test(msg)) move = "cheer";
            else if (/version|\bupdate\b|probe|checking|armed|scanning|\bsync\b|loading|building/i.test(msg)) move = "nod";
            if (move) { _lastReact = now; play(move); }
        } catch (e) {}
    }
    function flashError(ms = 4000) {
        setState("error");
        try { window.dispatchEvent(new CustomEvent("swek:move", { detail: { move: "error" } })); } catch (e) {}
        clearTimeout(flashError._t);
        flashError._t = setTimeout(() => setState("ok"), ms);
    }
    try {
        const onErr = () => { try { flashError(); } catch {} };
        window.addEventListener("error", onErr);
        window.addEventListener("unhandledrejection", onErr);
        window.addEventListener("swek:ping", function (e) {
            try { const now = Date.now(); pingRipple(e && e.detail); if (now - _lastPing < 600) antennaScan(1400); _lastPing = now; } catch (er) {}
        });
    } catch {}

    // GPU brain piece: toggle the whirlpool on brain activity, and (unless told not to) poll the brain for it.
    function setBrainActive(on) { try { wrap.classList.toggle("brainOn", !!on); } catch (e) {} }
    if (opts.pollBrain !== false && typeof fetch === "function") {
        const pollBrain = function () {
            return guardedTick("swekRobot:brain-health", function () {
                return fetch("/ai/brain/health", { cache: "no-store" }).then((r) => r.json()).then((j) => {
                    const live = j && (j.live || j.brains || j.count || j.state === "solving" || j.state === "active");
                    setBrainActive(!!live);
                }).catch(function () { setBrainActive(false); });
            });
        };
        try { pollBrain(); setInterval(pollBrain, 2500); } catch (e) {}
    }

    return { el: wrap, setState, setBrain, get brain() { return _brain; }, flashError, play, setTalking, setOffline, mouthPulse, pingRipple, antennaScan, react, setBrainActive, state: () => _state };
}
