// multiplayer/sharedOgreClient.js
//
// Round 148 (multiplayer round 36-37) — client for the server-side
// canonical OGRE. Subscribes to the bridge WebSocket, receives the
// 20Hz position + HP broadcast, exposes an interpolated position
// any demo can read. Replaces the per-client local OGRE simulation
// with a server-authoritative one: every connected tab now sees the
// OGRE at the same coordinates, taking the same damage from anyone's
// hits.
//
// Architecture:
//   * Connects to ws://localhost:8787 (the existing bridge server)
//   * Listens for "ogre:state" — { active, x, y, z, yaw, ogreHp,
//     ogreMaxHp, wave, contributors, targetId }
//   * Listens for "ogre:killed" and "ogre:attack"
//   * Maintains lastSnapshot + previousSnapshot for interpolation
//   * Exposes:
//        client.getInterpolatedState()  — for renderers
//        client.getHpFraction()         — for HP bars
//        client.startWave({ maxHp, wave, spawnX, spawnY, spawnZ })
//        client.applyDamage(amount)
//        client.stopWave()
//        client.onAttack(callback)       — fires when OGRE attacks
//        client.onKilled(callback)       — fires when OGRE dies
//
// Reconnects automatically on disconnect with exponential backoff.

const DEFAULT_URL = (typeof window !== "undefined" && window.location)
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
    : "ws://localhost:8787";
const INTERPOLATION_DURATION_MS = 100;   // smooths between 20Hz updates

export class SharedOgreClient {
    constructor(opts = {}) {
        this.url = opts.url ?? DEFAULT_URL;
        this.ws = null;
        this.connected = false;
        this.reconnectDelay = 500;
        this._reconnectTimer = null;

        // State
        this.active = false;
        this.lastSnapshot = null;
        this.previousSnapshot = null;
        this.lastSnapshotAt = 0;
        this.maxHp = 0;
        this.hp = 0;
        this.wave = 0;
        this.contributors = [];
        this.myPlayerId = null;

        // Round 151 — player HP / death / wave countdown / leaderboard
        this.playerHps = new Map();   // playerId → { hp, maxHp, alive, name }
        this.myHp     = 0;
        this.myMaxHp  = 0;
        this.alive    = true;
        this.respawnAt = 0;             // performance.now() ms when respawn fires (0=alive)
        this.waveCountdown = null;      // { startsAtMs, nextWave, nextMaxHp } or null
        this.leaderboard = [];          // [{ playerId, name, totalDamage, kills }]

        // Subscribers
        this._attackHandlers = [];
        this._killedHandlers = [];
        this._stateHandlers = [];
        this._hpHandlers = [];          // (playerId, hp, maxHp) → void
        this._diedHandlers = [];        // (msg) → void
        this._respawnHandlers = [];     // (msg) → void
        this._countdownHandlers = [];   // (msg) → void
        this._bombHandlers = [];        // (msg) → void  (round 152)

        this._connect();
    }

    _connect() {
        try {
            this.ws = new WebSocket(this.url);
        } catch (e) {
            console.warn("[SharedOgre] WS construct failed:", e?.message);
            this._scheduleReconnect();
            return;
        }
        this.ws.onopen = () => {
            this.connected = true;
            this.reconnectDelay = 500;
            console.log("[SharedOgre] connected");
        };
        this.ws.onmessage = (ev) => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch { return; }
            this._handleMessage(msg);
        };
        this.ws.onclose = () => {
            this.connected = false;
            console.log("[SharedOgre] disconnected");
            this._scheduleReconnect();
        };
        this.ws.onerror = () => { /* onclose follows */ };
    }

    _scheduleReconnect() {
        if (this._reconnectTimer) return;
        const delay = Math.min(8000, this.reconnectDelay);
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this.reconnectDelay = Math.min(8000, this.reconnectDelay * 1.7);
            this._connect();
        }, delay);
    }

    _handleMessage(msg) {
        if (!msg || !msg.type) return;
        switch (msg.type) {
            case "player:welcome":
                // Server assigns us a player ID on connect — capture it
                // so we can recognize our own attack targeting later.
                this.myPlayerId = msg.playerId;
                break;
            case "ogre:state":
                this.active = !!msg.active;
                this.maxHp = msg.ogreMaxHp || 0;
                this.hp = msg.ogreHp || 0;
                this.wave = msg.wave || 0;
                this.contributors = msg.contributors || [];
                this.squad = msg.squad || [];   // v1465 — grunt squad markers (pos + state)
                // Store position snapshot for interpolation
                this.previousSnapshot = this.lastSnapshot;
                this.lastSnapshot = {
                    x: msg.x || 0,
                    y: msg.y || 0,
                    z: msg.z || 0,
                    yaw: msg.yaw || 0,
                    targetId: msg.targetId,
                    receivedAt: performance.now(),
                };
                this.lastSnapshotAt = this.lastSnapshot.receivedAt;
                for (const h of this._stateHandlers) {
                    try { h(this); } catch (e) { console.warn("[SharedOgre] state handler:", e); }
                }
                break;
            case "ogre:attack":
                for (const h of this._attackHandlers) {
                    try { h(msg); } catch (e) { console.warn("[SharedOgre] attack handler:", e); }
                }
                break;
            case "ogre:killed":
                this.active = false;
                this.hp = 0;
                if (Array.isArray(msg.leaderboard)) {
                    this.leaderboard = msg.leaderboard;
                }
                for (const h of this._killedHandlers) {
                    try { h(msg); } catch (e) { console.warn("[SharedOgre] killed handler:", e); }
                }
                break;

            // Round 151 messages -------------------------------------
            case "players:roster": {
                // Seed playerHps with the current roster (sent on join)
                for (const p of msg.players || []) {
                    this.playerHps.set(p.playerId, {
                        hp: p.hp, maxHp: p.maxHp,
                        alive: p.alive !== false, name: p.name,
                    });
                    if (p.playerId === this.myPlayerId) {
                        this.myHp = p.hp; this.myMaxHp = p.maxHp;
                        this.alive = p.alive !== false;
                    }
                }
                break;
            }
            case "player:hp": {
                let entry = this.playerHps.get(msg.playerId);
                if (!entry) {
                    entry = { hp: msg.hp, maxHp: msg.maxHp, alive: true };
                    this.playerHps.set(msg.playerId, entry);
                } else {
                    entry.hp = msg.hp; entry.maxHp = msg.maxHp;
                }
                if (msg.playerId === this.myPlayerId) {
                    this.myHp = msg.hp; this.myMaxHp = msg.maxHp;
                }
                for (const h of this._hpHandlers) {
                    try { h(msg.playerId, msg.hp, msg.maxHp); }
                    catch (e) { console.warn("[SharedOgre] hp handler:", e); }
                }
                break;
            }
            case "player:died": {
                const entry = this.playerHps.get(msg.playerId);
                if (entry) entry.alive = false;
                if (msg.playerId === this.myPlayerId) {
                    this.alive = false;
                    this.respawnAt = performance.now() + (msg.respawnInMs || 0);
                }
                for (const h of this._diedHandlers) {
                    try { h(msg); } catch (e) { console.warn("[SharedOgre] died handler:", e); }
                }
                break;
            }
            case "player:respawned": {
                const entry = this.playerHps.get(msg.playerId);
                if (entry) {
                    entry.hp = msg.hp; entry.maxHp = msg.maxHp; entry.alive = true;
                }
                if (msg.playerId === this.myPlayerId) {
                    this.myHp = msg.hp; this.myMaxHp = msg.maxHp;
                    this.alive = true; this.respawnAt = 0;
                }
                for (const h of this._respawnHandlers) {
                    try { h(msg); } catch (e) { console.warn("[SharedOgre] respawn handler:", e); }
                }
                break;
            }
            case "wave:countdown": {
                this.waveCountdown = {
                    startsAtMs: performance.now() + (msg.startsInMs || 0),
                    nextWave: msg.nextWave,
                    nextMaxHp: msg.nextMaxHp,
                };
                for (const h of this._countdownHandlers) {
                    try { h(msg); } catch (e) { console.warn("[SharedOgre] countdown handler:", e); }
                }
                break;
            }
            // Round 152 — bomb event from the Excel commander (or any
            // HTTP poster). State broadcast follows so HP updates too.
            case "ogre:bombed": {
                for (const h of this._bombHandlers) {
                    try { h(msg); } catch (e) { console.warn("[SharedOgre] bomb handler:", e); }
                }
                break;
            }
        }
    }

    // ---- public API -------------------------------------------------

    startWave(opts = {}) {
        if (!this.connected) return false;
        this.ws.send(JSON.stringify({
            type: "ogre:start",
            data: {
                maxHp:  opts.maxHp  ?? 200,
                wave:   opts.wave   ?? 1,
                spawnX: opts.spawnX ?? 25,
                spawnY: opts.spawnY ?? 35,
                spawnZ: opts.spawnZ ?? 25,
            },
        }));
        return true;
    }

    applyDamage(amount) {
        if (!this.connected || !this.active) return false;
        if (amount <= 0) return false;
        this.ws.send(JSON.stringify({
            type: "ogre:damage",
            data: { amount },
        }));
        return true;
    }

    stopWave() {
        if (!this.connected) return false;
        this.ws.send(JSON.stringify({ type: "ogre:stop" }));
        return true;
    }

    // Interpolated position for smooth rendering between 20Hz updates.
    // Uses last 2 snapshots; clamps t at 1 to avoid extrapolation past
    // the most recent server tick.
    getInterpolatedState() {
        if (!this.lastSnapshot) return null;
        if (!this.previousSnapshot) {
            return {
                x: this.lastSnapshot.x,
                y: this.lastSnapshot.y,
                z: this.lastSnapshot.z,
                yaw: this.lastSnapshot.yaw,
            };
        }
        const now = performance.now();
        let t = (now - this.lastSnapshot.receivedAt) / INTERPOLATION_DURATION_MS;
        t = Math.max(0, Math.min(1, t));
        const a = this.previousSnapshot;
        const b = this.lastSnapshot;
        // Lerp position; for yaw, handle wraparound
        let dyaw = b.yaw - a.yaw;
        while (dyaw >  Math.PI) dyaw -= 2 * Math.PI;
        while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
        return {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            z: a.z + (b.z - a.z) * t,
            yaw: a.yaw + dyaw * t,
        };
    }

    getHpFraction() {
        return this.maxHp > 0 ? (this.hp / this.maxHp) : 0;
    }

    // v1465 — grunt squad markers (id, x, z, state) for the arena renderer.
    getSquad() { return this.squad || []; }

    // Was the most recent attack aimed at THIS player? Useful for
    // local screen-flash / damage feedback even though damage routing
    // itself is purely server-authoritative.
    isAttackingMe(attackMsg) {
        return attackMsg?.targetPlayerId === this.myPlayerId;
    }

    onAttack(cb) { this._attackHandlers.push(cb); }
    onKilled(cb) { this._killedHandlers.push(cb); }
    onState(cb)  { this._stateHandlers.push(cb); }

    // Round 151 event hooks
    onPlayerHp(cb)        { this._hpHandlers.push(cb); }
    onPlayerDied(cb)      { this._diedHandlers.push(cb); }
    onPlayerRespawned(cb) { this._respawnHandlers.push(cb); }
    onWaveCountdown(cb)   { this._countdownHandlers.push(cb); }
    // Round 152
    onBomb(cb)            { this._bombHandlers.push(cb); }

    // Round 151 getters
    getMyHp()      { return this.myHp; }
    getMyMaxHp()   { return this.myMaxHp; }
    getMyHpFrac()  { return this.myMaxHp > 0 ? this.myHp / this.myMaxHp : 0; }
    isAlive()      { return this.alive; }
    // Returns remaining respawn time in seconds, or 0 if alive.
    getRespawnRemaining() {
        if (this.alive) return 0;
        return Math.max(0, (this.respawnAt - performance.now()) / 1000);
    }
    // Returns seconds until next wave, or null if no countdown is active.
    getWaveCountdownRemaining() {
        if (!this.waveCountdown) return null;
        const remain = (this.waveCountdown.startsAtMs - performance.now()) / 1000;
        if (remain <= 0) {
            // The countdown elapsed — clear it so we don't keep
            // reporting negative time
            this.waveCountdown = null;
            return null;
        }
        return remain;
    }
    getNextWaveInfo() { return this.waveCountdown; }
    getLeaderboard()  { return this.leaderboard; }

    close() {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this.ws) {
            try { this.ws.close(); } catch {}
            this.ws = null;
        }
        this._attackHandlers = [];
        this._killedHandlers = [];
        this._stateHandlers = [];
        this._hpHandlers = [];
        this._diedHandlers = [];
        this._respawnHandlers = [];
        this._countdownHandlers = [];
        this._bombHandlers = [];
    }
}
