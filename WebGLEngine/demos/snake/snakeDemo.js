// FILE: demos/snake/snakeDemo.js
// VERSION: v1 — round 360
//
// Classic Snake with a "centipede" extension: alongside the eat-and-
// grow apple, occasional MUSHROOM obstacles appear on the field. Each
// mushroom takes 4 hits to destroy. Hitting one with the head reduces
// its HP; hitting it at 0 HP turns it into AIR and gives 5 points.
// Hitting any cell while the mushroom is alive ends the game.
//
// Self-contained: HTML canvas overlay positioned over the WebGL view,
// no engine-side render state changes. Ticks at 10 Hz, key input via
// window.addEventListener.

const GRID_W = 28;          // cells across
const GRID_H = 22;          // cells down
const TICK_MS = 95;         // game step interval
const CELL_PX = 22;          // cell rendered size

const COLORS = {
    bg:        "#0a1018",
    grid:      "#1a2030",
    snakeHead: "#9c4",
    snakeBody: "#5a8",
    apple:     "#f55",
    mushroomA: "#fa6",   // healthy
    mushroomB: "#a64",   // wounded
    text:      "#cfd",
    accent:    "#6cf",
};

export class SnakeDemo {
    constructor({ camera } = {}) {
        this._reset();
        this._buildPanel();
        this._bindKeys();
        this._lastTick = performance.now();
        this._lastFrame = performance.now();
    }

    _reset() {
        // Snake — array of {x,y} cells, head at index 0
        this.snake = [
            { x: Math.floor(GRID_W / 2),     y: Math.floor(GRID_H / 2) },
            { x: Math.floor(GRID_W / 2) - 1, y: Math.floor(GRID_H / 2) },
            { x: Math.floor(GRID_W / 2) - 2, y: Math.floor(GRID_H / 2) },
        ];
        this.dir     = { x: 1, y: 0 };     // current heading
        this.nextDir = { x: 1, y: 0 };     // queued from last keypress
        this.mushrooms = [];               // must come before _randomEmptyCell (reads it)
        this.apple   = null;
        this.apple   = this._randomEmptyCell();
        this.score = 0;
        this.alive = true;
        this.tickCount = 0;
    }

    _randomEmptyCell() {
        const tried = new Set();
        for (let attempt = 0; attempt < 200; attempt++) {
            const x = Math.floor(Math.random() * GRID_W);
            const y = Math.floor(Math.random() * GRID_H);
            const key = x * 1000 + y;
            if (tried.has(key)) continue;
            tried.add(key);
            if (this._cellOccupied(x, y)) continue;
            return { x, y };
        }
        return null;
    }

    _cellOccupied(x, y) {
        for (const s of this.snake)   if (s.x === x && s.y === y) return true;
        for (const m of this.mushrooms) if (m.x === x && m.y === y) return true;
        if (this.apple && this.apple.x === x && this.apple.y === y) return true;
        return false;
    }

    _buildPanel() {
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
            position: "fixed", top: "60px", left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(8,14,20,0.96)",
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
        Object.assign(canvas.style, { display: "block", borderRadius: "4px" });
        overlay.innerHTML = `
            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:6px;">
                <div style="color:${COLORS.accent}; letter-spacing:2px; font-weight:bold;">🐍 SNAKE — centipede ext</div>
                <div id="sn-info" style="color:#9ab; font-size:10px;">arrow keys · space to restart · ESC to exit</div>
            </div>
            <div style="display:flex; gap:8px; padding:6px 0; border-bottom:1px solid #233; margin-bottom:6px;">
                <div>score: <span id="sn-score" style="color:${COLORS.snakeHead}; font-weight:bold;">0</span></div>
                <div>length: <span id="sn-len" style="color:${COLORS.snakeBody}; font-weight:bold;">3</span></div>
                <div>mushrooms: <span id="sn-mush" style="color:${COLORS.mushroomA}; font-weight:bold;">0</span></div>
                <div id="sn-status" style="margin-left:auto; color:${COLORS.accent};">LIVE</div>
            </div>
        `;
        overlay.appendChild(canvas);
        document.body.appendChild(overlay);
        this.overlay = overlay;
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
    }

    _bindKeys() {
        this._onKey = (e) => {
            const k = e.key;
            if (k === "ArrowUp"    && this.dir.y !==  1) this.nextDir = { x:  0, y: -1 };
            if (k === "ArrowDown"  && this.dir.y !== -1) this.nextDir = { x:  0, y:  1 };
            if (k === "ArrowLeft"  && this.dir.x !==  1) this.nextDir = { x: -1, y:  0 };
            if (k === "ArrowRight" && this.dir.x !== -1) this.nextDir = { x:  1, y:  0 };
            if (k === " "          && !this.alive)       { this._reset(); e.preventDefault(); }
            // Prevent the arrow keys from scrolling the parent page
            if (k.startsWith("Arrow")) e.preventDefault();
        };
        window.addEventListener("keydown", this._onKey);
    }

    /** One game tick — advance snake, resolve collisions, maybe spawn. */
    _tick() {
        if (!this.alive) return;
        this.tickCount++;
        // Commit queued direction
        this.dir = this.nextDir;
        const headX = this.snake[0].x + this.dir.x;
        const headY = this.snake[0].y + this.dir.y;

        // Wall collision
        if (headX < 0 || headX >= GRID_W || headY < 0 || headY >= GRID_H) {
            this.alive = false; return;
        }
        // Self collision (skip last segment — it'll move out of this cell)
        for (let i = 0; i < this.snake.length - 1; i++) {
            if (this.snake[i].x === headX && this.snake[i].y === headY) {
                this.alive = false; return;
            }
        }
        // Mushroom collision
        for (let i = 0; i < this.mushrooms.length; i++) {
            const m = this.mushrooms[i];
            if (m.x === headX && m.y === headY) {
                m.hp--;
                if (m.hp <= 0) {
                    this.mushrooms.splice(i, 1);
                    this.score += 5;
                    // No grow — destroying mushroom doesn't extend snake
                    // but does open the cell. Snake passes through this tick.
                    break;
                } else {
                    // Hit alive mushroom — game over
                    this.alive = false;
                    return;
                }
            }
        }

        // Move snake (add head, drop tail unless ate apple)
        this.snake.unshift({ x: headX, y: headY });
        let grew = false;
        if (this.apple && this.apple.x === headX && this.apple.y === headY) {
            this.score += 1;
            this.apple = this._randomEmptyCell();
            grew = true;
        }
        if (!grew) this.snake.pop();

        // Spawn a mushroom every 7 apples (snake length 10, 17, 24...)
        if (this.snake.length > 0 &&
            (this.snake.length - 3) > 0 &&
            (this.snake.length - 3) % 7 === 0 &&
            this.mushrooms.length < Math.floor((this.snake.length - 3) / 7) + 1) {
            const m = this._randomEmptyCell();
            if (m) this.mushrooms.push({ x: m.x, y: m.y, hp: 4 });
        }
    }

    _drawCell(x, y, color) {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x * CELL_PX + 1, y * CELL_PX + 1, CELL_PX - 2, CELL_PX - 2);
    }

    _drawFrame() {
        const ctx = this.ctx;
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        // Faint grid
        ctx.strokeStyle = COLORS.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= GRID_W; x++) { ctx.moveTo(x * CELL_PX, 0); ctx.lineTo(x * CELL_PX, GRID_H * CELL_PX); }
        for (let y = 0; y <= GRID_H; y++) { ctx.moveTo(0, y * CELL_PX); ctx.lineTo(GRID_W * CELL_PX, y * CELL_PX); }
        ctx.stroke();
        // Apple
        if (this.apple) this._drawCell(this.apple.x, this.apple.y, COLORS.apple);
        // Mushrooms with HP indicator
        for (const m of this.mushrooms) {
            this._drawCell(m.x, m.y, m.hp > 2 ? COLORS.mushroomA : COLORS.mushroomB);
            // Tiny HP pips
            ctx.fillStyle = "#000";
            const cx = m.x * CELL_PX + CELL_PX / 2;
            const cy = m.y * CELL_PX + CELL_PX / 2;
            ctx.fillRect(cx - 2, cy - 1, 4, 2);
            ctx.fillStyle = COLORS.text;
            ctx.font = "9px monospace";
            ctx.fillText(String(m.hp), cx - 2, cy + 7);
        }
        // Snake — head distinct from body
        for (let i = 0; i < this.snake.length; i++) {
            this._drawCell(this.snake[i].x, this.snake[i].y, i === 0 ? COLORS.snakeHead : COLORS.snakeBody);
        }
        // Game over banner
        if (!this.alive) {
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.fillRect(0, this.canvas.height / 2 - 50, this.canvas.width, 100);
            ctx.fillStyle = "#f88";
            ctx.font = "bold 28px monospace";
            ctx.textAlign = "center";
            ctx.fillText("GAME OVER", this.canvas.width / 2, this.canvas.height / 2);
            ctx.fillStyle = COLORS.text;
            ctx.font = "14px monospace";
            ctx.fillText(`score ${this.score} · press SPACE to restart`, this.canvas.width / 2, this.canvas.height / 2 + 24);
            ctx.textAlign = "left";
        }
    }

    _refreshHud() {
        const $ = id => this.overlay.querySelector("#" + id);
        $("sn-score").textContent = this.score;
        $("sn-len").textContent = this.snake.length;
        $("sn-mush").textContent = this.mushrooms.length;
        $("sn-status").textContent = this.alive ? "LIVE" : "DEAD";
        $("sn-status").style.color = this.alive ? COLORS.accent : "#f88";
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
