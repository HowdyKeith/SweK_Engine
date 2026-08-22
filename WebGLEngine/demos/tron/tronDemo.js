// FILE: demos/tron/tronDemo.js
// VERSION: v1 — round 360
//
// Two-cycle Tron: player (cyan) vs AI (magenta). Each leaves a trail.
// Crash into any trail (your own or theirs) or a wall and you lose.
// AI uses a "longest open straight ahead, else turn toward more space"
// heuristic — beatable but reasonably tough.

const GRID_W = 60;          // cells across
const GRID_H = 42;          // cells down
const TICK_MS = 50;          // game step interval
const CELL_PX = 11;          // cell rendered size

const COLORS = {
    bg:           "#04060a",
    grid:         "#0e1420",
    playerHead:   "#6cf",
    playerTrail:  "#46a",
    aiHead:       "#f6a",
    aiTrail:      "#a46",
    text:         "#cfd",
    accent:       "#6cf",
    danger:       "#f88",
};

// Direction enums for compass logic — order: 0=N, 1=E, 2=S, 3=W
const DIRS = [
    { x: 0, y: -1 },   // N
    { x: 1, y:  0 },   // E
    { x: 0, y:  1 },   // S
    { x: -1, y: 0 },   // W
];

export class TronDemo {
    constructor({ camera } = {}) {
        this._reset();
        this._buildPanel();
        this._bindKeys();
        this._lastTick = performance.now();
    }

    _reset() {
        // Grid of cell-occupancy: 0=empty, 1=player trail, 2=ai trail
        this.grid = new Uint8Array(GRID_W * GRID_H);
        this.player = { x: 8,            y: Math.floor(GRID_H / 2), dir: 1, alive: true };  // facing East
        this.ai     = { x: GRID_W - 9,    y: Math.floor(GRID_H / 2), dir: 3, alive: true };  // facing West
        this._mark(this.player.x, this.player.y, 1);
        this._mark(this.ai.x,     this.ai.y,     2);
        this.nextDir = this.player.dir;
        this.winner  = null;
        this.ticks   = 0;
        this.scoreP  = this.scoreP ?? 0;
        this.scoreA  = this.scoreA ?? 0;
        this.gameNum = (this.gameNum ?? 0) + 1;
    }

    _cell(x, y) { return this.grid[y * GRID_W + x]; }
    _mark(x, y, v) { this.grid[y * GRID_W + x] = v; }

    _inBounds(x, y) { return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H; }

    _buildPanel() {
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
            position: "fixed", top: "60px", left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(4,8,16,0.97)",
            border: "1px solid #6ad",
            borderRadius: "8px",
            padding: "12px 14px",
            zIndex: "8800",
            boxShadow: "0 0 24px rgba(80,180,255,0.22)",
            fontFamily: "monospace", color: COLORS.text, fontSize: "12px",
        });
        const canvas = document.createElement("canvas");
        canvas.width  = GRID_W * CELL_PX;
        canvas.height = GRID_H * CELL_PX;
        Object.assign(canvas.style, { display: "block", borderRadius: "4px", background: COLORS.bg });

        overlay.innerHTML = `
            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:6px;">
                <div style="color:${COLORS.accent}; letter-spacing:2px; font-weight:bold;">⚡ TRON — light cycles</div>
                <div id="tr-info" style="color:#9ab; font-size:10px;">arrow keys/WASD · space to restart</div>
            </div>
            <div style="display:flex; gap:14px; padding:6px 0; border-bottom:1px solid #233; margin-bottom:6px;">
                <div>YOU: <span id="tr-scoreP" style="color:${COLORS.playerHead}; font-weight:bold;">0</span></div>
                <div>AI:  <span id="tr-scoreA" style="color:${COLORS.aiHead};    font-weight:bold;">0</span></div>
                <div>match: <span id="tr-game" style="color:${COLORS.text};">1</span></div>
                <div id="tr-status" style="margin-left:auto; color:${COLORS.accent};">DRIVING</div>
            </div>
        `;
        overlay.appendChild(canvas);
        document.body.appendChild(overlay);
        this.overlay = overlay;
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
    }

    _bindKeys() {
        // Player dir 0=N, 1=E, 2=S, 3=W. Block 180° flips (crash).
        this._onKey = (e) => {
            const k = e.key.toLowerCase();
            const cur = this.player.dir;
            if ((k === "arrowup"    || k === "w") && cur !== 2) this.nextDir = 0;
            if ((k === "arrowright" || k === "d") && cur !== 3) this.nextDir = 1;
            if ((k === "arrowdown"  || k === "s") && cur !== 0) this.nextDir = 2;
            if ((k === "arrowleft"  || k === "a") && cur !== 1) this.nextDir = 3;
            if (k === " ") {
                if (this.winner) {
                    // Award the round
                    if (this.winner === "player") this.scoreP++;
                    else if (this.winner === "ai") this.scoreA++;
                    // else tie — no score change
                    this._reset();
                }
                e.preventDefault();
            }
            if (e.key.startsWith("Arrow")) e.preventDefault();
        };
        window.addEventListener("keydown", this._onKey);
    }

    /** Open-space heuristic for the AI: try going straight, otherwise
     *  flood-fill check left and right and take whichever has more cells. */
    _aiPickDir() {
        const a = this.ai;
        const straight = a.dir;
        const left  = (a.dir + 3) % 4;
        const right = (a.dir + 1) % 4;
        // If straight is clear and has reasonable runway, prefer it
        const r = this._lookahead(a.x, a.y, straight);
        if (r >= 4) return straight;
        // Otherwise pick the side with more open cells via short lookahead
        const lOpen = this._lookahead(a.x, a.y, left);
        const rOpen = this._lookahead(a.x, a.y, right);
        if (lOpen === 0 && rOpen === 0 && r > 0) return straight;   // last resort
        return lOpen >= rOpen ? left : right;
    }

    /** Number of clear cells you'd cross before crashing if you turn into `dir` from (x, y). */
    _lookahead(x, y, dir, limit = 12) {
        let count = 0;
        const d = DIRS[dir];
        let cx = x, cy = y;
        for (let i = 0; i < limit; i++) {
            cx += d.x; cy += d.y;
            if (!this._inBounds(cx, cy)) break;
            if (this._cell(cx, cy) !== 0) break;
            count++;
        }
        return count;
    }

    _tick() {
        if (this.winner) return;
        this.ticks++;
        const p = this.player;
        const a = this.ai;
        p.dir = this.nextDir;
        a.dir = this._aiPickDir();

        const pDir = DIRS[p.dir];
        const aDir = DIRS[a.dir];
        const pnX = p.x + pDir.x, pnY = p.y + pDir.y;
        const anX = a.x + aDir.x, anY = a.y + aDir.y;

        // Head-on collision (both move into same cell)
        if (pnX === anX && pnY === anY) {
            p.alive = false; a.alive = false;
            this.winner = "tie";
            return;
        }
        // Player resolution
        if (!this._inBounds(pnX, pnY) || this._cell(pnX, pnY) !== 0) p.alive = false;
        // AI resolution
        if (!this._inBounds(anX, anY) || this._cell(anX, anY) !== 0) a.alive = false;

        if (!p.alive && !a.alive) this.winner = "tie";
        else if (!p.alive)         this.winner = "ai";
        else if (!a.alive)         this.winner = "player";

        // Move alive cycles
        if (p.alive) { p.x = pnX; p.y = pnY; this._mark(p.x, p.y, 1); }
        if (a.alive) { a.x = anX; a.y = anY; this._mark(a.x, a.y, 2); }
    }

    _drawFrame() {
        const ctx = this.ctx;
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        // Grid (very faint)
        ctx.strokeStyle = COLORS.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= GRID_W; x += 4) { ctx.moveTo(x * CELL_PX, 0); ctx.lineTo(x * CELL_PX, GRID_H * CELL_PX); }
        for (let y = 0; y <= GRID_H; y += 4) { ctx.moveTo(0, y * CELL_PX); ctx.lineTo(GRID_W * CELL_PX, y * CELL_PX); }
        ctx.stroke();
        // Trails
        for (let y = 0; y < GRID_H; y++) {
            for (let x = 0; x < GRID_W; x++) {
                const v = this._cell(x, y);
                if (v === 0) continue;
                ctx.fillStyle = v === 1 ? COLORS.playerTrail : COLORS.aiTrail;
                ctx.fillRect(x * CELL_PX + 1, y * CELL_PX + 1, CELL_PX - 2, CELL_PX - 2);
            }
        }
        // Heads
        const drawHead = (cycle, color) => {
            ctx.fillStyle = color;
            ctx.fillRect(cycle.x * CELL_PX, cycle.y * CELL_PX, CELL_PX, CELL_PX);
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1;
            ctx.strokeRect(cycle.x * CELL_PX + 0.5, cycle.y * CELL_PX + 0.5, CELL_PX - 1, CELL_PX - 1);
        };
        drawHead(this.player, COLORS.playerHead);
        drawHead(this.ai,     COLORS.aiHead);
        // Banner
        if (this.winner) {
            const msgs = {
                player: { text: "YOU WIN",  color: COLORS.playerHead },
                ai:     { text: "AI WINS",  color: COLORS.aiHead },
                tie:    { text: "TIE",       color: COLORS.text },
            };
            const m = msgs[this.winner];
            ctx.fillStyle = "rgba(0,0,0,0.72)";
            ctx.fillRect(0, this.canvas.height / 2 - 40, this.canvas.width, 80);
            ctx.fillStyle = m.color;
            ctx.font = "bold 28px monospace";
            ctx.textAlign = "center";
            ctx.fillText(m.text, this.canvas.width / 2, this.canvas.height / 2);
            ctx.fillStyle = COLORS.text;
            ctx.font = "13px monospace";
            ctx.fillText("press SPACE for next round", this.canvas.width / 2, this.canvas.height / 2 + 22);
            ctx.textAlign = "left";
        }
    }

    _refreshHud() {
        const $ = id => this.overlay.querySelector("#" + id);
        $("tr-scoreP").textContent = this.scoreP;
        $("tr-scoreA").textContent = this.scoreA;
        $("tr-game").textContent   = this.gameNum;
        if (this.winner) {
            $("tr-status").textContent = this.winner === "player" ? "YOU WIN" : (this.winner === "ai" ? "AI WINS" : "TIE");
            $("tr-status").style.color = this.winner === "player" ? COLORS.playerHead : (this.winner === "ai" ? COLORS.aiHead : COLORS.text);
        } else {
            $("tr-status").textContent = "DRIVING";
            $("tr-status").style.color = COLORS.accent;
        }
    }

    render() {
        const now = performance.now();
        if (now - this._lastTick >= TICK_MS) {
            this._lastTick = now;
            this._tick();
        }
        this._drawFrame();
        this._refreshHud();
    }

    dispose() {
        window.removeEventListener("keydown", this._onKey);
        try { this.overlay.remove(); } catch {}
    }
}
