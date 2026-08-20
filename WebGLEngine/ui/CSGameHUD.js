// FILE: ui/CSGameHUD.js
// VERSION: v2 — round 324, fuse bar + throw hint v538
//
// DOM overlay HUD for CS rounds:
//   • Top center: round timer (red <30s); becomes the bomb fuse when planted
//   • Top left: score "T 0 - 0 CT", round number
//   • Top center (when planted): "BOMB PLANTED" banner + a draining fuse bar
//     that flashes faster (1.5→9Hz) as the fuse runs out, synced to the beep
//   • Bottom center: plant progress bar (when planting) or
//     defuse progress bar (when defusing)
//   • Bottom center: round-over banner with winner + reason
//   • Bottom right: contextual hint ([E] plant/defuse, [G] throw)
//
// Reads from CSRoundManager.snapshot() each frame. Pure DOM — no
// canvas overlay, no WebGL, no engine entanglement.

import { ROUND_STATE, WINNER } from "../simulation/CSRoundManager.js";

export class CSGameHUD {
    constructor() {
        this._root = null;
        this._els = {};
        this._installed = false;
        this._visible = false;
    }

    install() {
        if (this._installed) return;
        const root = document.createElement("div");
        root.id = "cs-hud";
        root.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            pointer-events: none;
            font-family: 'Courier New', monospace;
            color: #fff;
            text-shadow: 0 0 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1);
            z-index: 200;
            display: none;
        `;

        // Top-center: round timer
        const timer = document.createElement("div");
        timer.style.cssText = `
            position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
            font-size: 32px; font-weight: bold; letter-spacing: 2px;
        `;
        timer.textContent = "0:00";
        root.appendChild(timer);
        this._els.timer = timer;

        // Top-left: score + round
        const score = document.createElement("div");
        score.style.cssText = `
            position: absolute; top: 16px; left: 24px;
            font-size: 18px; line-height: 1.4;
        `;
        score.innerHTML = `<div style="color:#ffaa44">T <span class="cs-t">0</span></div>
                           <div style="color:#44aaff">CT <span class="cs-ct">0</span></div>
                           <div style="color:#aaa; font-size: 12px;">RD <span class="cs-rd">0</span></div>`;
        root.appendChild(score);
        this._els.tScore  = score.querySelector(".cs-t");
        this._els.ctScore = score.querySelector(".cs-ct");
        this._els.rdNum   = score.querySelector(".cs-rd");

        // Top-right: player side indicator
        const side = document.createElement("div");
        side.style.cssText = `
            position: absolute; top: 16px; right: 24px;
            font-size: 18px;
        `;
        side.textContent = "PLAYING AS —";
        root.appendChild(side);
        this._els.side = side;

        // v542 — money (top-left, below score) + buy hint
        const money = document.createElement("div");
        money.style.cssText = `
            position: absolute; top: 92px; left: 24px;
            font-size: 20px; font-weight: bold; color: #66ff66;
        `;
        money.textContent = "$0";
        root.appendChild(money);
        this._els.money = money;

        const buyHint = document.createElement("div");
        buyHint.style.cssText = `
            position: absolute; top: 120px; left: 24px;
            font-size: 13px; color: #ccffcc;
            background: rgba(0,50,0,0.5); padding: 2px 8px; border-radius: 3px;
            display: none;
        `;
        root.appendChild(buyHint);
        this._els.buyHint = buyHint;

        // Bomb planted banner
        const bombBanner = document.createElement("div");
        bombBanner.style.cssText = `
            position: absolute; top: 70px; left: 50%; transform: translateX(-50%);
            background: rgba(255, 60, 60, 0.85); color: #fff;
            padding: 4px 16px; border-radius: 4px;
            font-size: 16px; letter-spacing: 1px;
            display: none;
        `;
        bombBanner.textContent = "BOMB PLANTED";
        root.appendChild(bombBanner);
        this._els.bombBanner = bombBanner;

        // v538 — bomb fuse bar (drains 35s→0, flashes faster as it empties)
        const fuse = document.createElement("div");
        fuse.style.cssText = `
            position: absolute; top: 104px; left: 50%; transform: translateX(-50%);
            width: 280px; height: 14px;
            background: rgba(0,0,0,0.6); border: 1px solid rgba(255,90,90,0.8);
            border-radius: 3px; overflow: hidden;
            display: none;
        `;
        const fuseFill = document.createElement("div");
        fuseFill.style.cssText = `
            height: 100%; width: 100%;
            background: linear-gradient(90deg, #ff2200, #ff7744);
        `;
        fuse.appendChild(fuseFill);
        root.appendChild(fuse);
        this._els.fuse = fuse;
        this._els.fuseFill = fuseFill;

        // Bottom-center: action progress bar
        const progress = document.createElement("div");
        progress.style.cssText = `
            position: absolute; bottom: 100px; left: 50%; transform: translateX(-50%);
            width: 260px; height: 20px;
            background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.5);
            display: none;
        `;
        const progressFill = document.createElement("div");
        progressFill.style.cssText = `
            height: 100%; width: 0%;
            background: linear-gradient(90deg, #f80 0%, #fa0 100%);
            transition: width 0.05s linear;
        `;
        progress.appendChild(progressFill);
        const progressLabel = document.createElement("div");
        progressLabel.style.cssText = `
            position: absolute; top: -18px; left: 0; right: 0;
            text-align: center; font-size: 13px;
        `;
        progress.appendChild(progressLabel);
        root.appendChild(progress);
        this._els.progress      = progress;
        this._els.progressFill  = progressFill;
        this._els.progressLabel = progressLabel;

        // Bottom-center: round-over banner
        const result = document.createElement("div");
        result.style.cssText = `
            position: absolute; bottom: 140px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.85); border: 2px solid #fff;
            padding: 12px 28px; border-radius: 6px;
            font-size: 22px; font-weight: bold;
            display: none; text-align: center;
        `;
        root.appendChild(result);
        this._els.result = result;

        // Bottom-right: contextual hint
        const hint = document.createElement("div");
        hint.style.cssText = `
            position: absolute; bottom: 24px; right: 24px;
            font-size: 14px; opacity: 0.85;
            display: none;
        `;
        root.appendChild(hint);
        this._els.hint = hint;

        document.body.appendChild(root);
        this._root = root;
        this._installed = true;
    }

    show() {
        if (!this._installed) this.install();
        this._root.style.display = "block";
        this._visible = true;
    }

    hide() {
        if (this._root) this._root.style.display = "none";
        this._visible = false;
    }

    uninstall() {
        if (this._root) this._root.remove();
        this._root = null;
        this._installed = false;
        this._visible = false;
        this._els = {};
    }

    /** Update from a CSRoundManager.snapshot() each frame. */
    update(snap) {
        if (!this._visible) return;

        // Round timer — only meaningful in LIVE; when BOMB_PLANTED,
        // we show the bomb fuse instead.
        if (snap.state === ROUND_STATE.LIVE) {
            this._els.timer.textContent = formatMMSS(snap.roundTime);
            this._els.timer.style.color = (snap.roundTime < 30) ? "#ff5555" : "#fff";
            this._els.bombBanner.style.display = "none";
            this._els.fuse.style.display = "none";
        } else if (snap.state === ROUND_STATE.BOMB_PLANTED) {
            const tr = snap.bomb.timeRemaining;
            // urgency 0→1 over the 35s fuse (matches the audio beep cadence)
            const urgency = Math.max(0, Math.min(1, 1 - tr / 35));
            // flash 1.5Hz → 9Hz as it runs out
            const hz = 1.5 + urgency * 7.5;
            const on = Math.sin((performance.now() / 1000) * hz * Math.PI * 2) > -0.2;
            this._els.timer.textContent = tr.toFixed(1);
            this._els.timer.style.color = on ? "#ff3333" : "#ff9999";
            this._els.bombBanner.style.display = "block";
            this._els.bombBanner.style.background = on ? "rgba(255,40,40,0.92)" : "rgba(150,20,20,0.7)";
            this._els.fuse.style.display = "block";
            this._els.fuseFill.style.width = Math.max(0, (tr / 35) * 100) + "%";
            this._els.fuseFill.style.opacity = on ? "1" : "0.55";
        } else if (snap.state === ROUND_STATE.WAITING) {
            this._els.timer.textContent = "READY";
            this._els.timer.style.color = "#fff";
            this._els.bombBanner.style.display = "none";
            this._els.fuse.style.display = "none";
        } else if (snap.state === ROUND_STATE.ROUND_OVER) {
            this._els.bombBanner.style.display = "none";
            this._els.fuse.style.display = "none";
        }

        this._els.tScore.textContent  = snap.scores.t;
        this._els.ctScore.textContent = snap.scores.ct;
        this._els.rdNum.textContent   = snap.roundNumber;

        // v542 — economy: money + buy-window hint
        if (this._els.money) this._els.money.textContent = "$" + (snap.money ?? 0);
        if (this._els.buyHint) {
            const canBuyKit = snap.canBuy && !snap.playerHasKit && (snap.money ?? 0) >= (snap.kitCost ?? 400);
            this._els.buyHint.style.display = canBuyKit ? "block" : "none";
            if (canBuyKit) this._els.buyHint.textContent = `[B] buy defuse kit $${snap.kitCost ?? 400}`;
        }

        const sideColor = snap.playerSide === "t" ? "#ffaa44" : "#44aaff";
        let sideHtml = `PLAYING AS <span style="color:${sideColor};font-weight:bold">${snap.playerSide.toUpperCase()}</span>`;
        if (snap.playerHasKit) sideHtml += `<div style="font-size:13px;color:#66ff88;margin-top:2px">🧰 DEFUSE KIT</div>`;
        this._els.side.innerHTML = sideHtml;

        // Progress bar (plant or defuse)
        if (snap.bomb.plantProgress > 0 && snap.bomb.plantProgress < 1) {
            this._els.progress.style.display = "block";
            this._els.progressFill.style.width = (snap.bomb.plantProgress * 100) + "%";
            this._els.progressFill.style.background = "linear-gradient(90deg,#f80,#fa0)";
            this._els.progressLabel.textContent = "PLANTING…";
        } else if (snap.bomb.defuseProgress > 0 && snap.bomb.defuseProgress < 1) {
            this._els.progress.style.display = "block";
            this._els.progressFill.style.width = (snap.bomb.defuseProgress * 100) + "%";
            this._els.progressFill.style.background = "linear-gradient(90deg,#06f,#0af)";
            this._els.progressLabel.textContent = snap.bomb.defuseHasKit ? "DEFUSING (KIT)…" : "DEFUSING (NO KIT)…";
        } else {
            this._els.progress.style.display = "none";
        }

        // Round result banner
        if (snap.state === ROUND_STATE.ROUND_OVER && snap.lastResult) {
            const r = snap.lastResult;
            const w = r.winner;
            const winnerText = w === WINNER.T ? "TERRORISTS WIN" :
                               w === WINNER.CT ? "COUNTER-TERRORISTS WIN" : "DRAW";
            const color = w === WINNER.T ? "#ffaa44" :
                          w === WINNER.CT ? "#44aaff" : "#ccc";
            this._els.result.style.display = "block";
            this._els.result.style.color = color;
            this._els.result.innerHTML = `${winnerText}<div style="font-size:14px;font-weight:normal;color:#aaa;margin-top:4px">${r.reason}</div>`;
        } else {
            this._els.result.style.display = "none";
        }

        // Contextual hint
        let hintText = "";
        if (snap.state === ROUND_STATE.LIVE && snap.bomb.carrier === "player" && !snap.bomb.dropped) {
            hintText = snap.inPlantZone
                ? `[E] hold to plant at ${snap.inPlantZone.toUpperCase()}  ·  [G] throw`
                : "carry bomb to A or B site  ·  [G] throw";
        } else if (snap.state === ROUND_STATE.BOMB_PLANTED && snap.nearBomb) {
            hintText = "[E] hold to defuse";
        }
        if (hintText) {
            this._els.hint.style.display = "block";
            this._els.hint.textContent = hintText;
        } else {
            this._els.hint.style.display = "none";
        }
    }
}

function formatMMSS(secs) {
    secs = Math.max(0, secs);
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs - m * 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}
