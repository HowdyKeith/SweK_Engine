// FILE: WebGLEngine/brains/bridgeClient.js
// Shared client for the three bridge-pattern pages. Talks to the Node relay
// (server.js, :8787): subscribes to bridge:state over WebSocket (falls back to
// polling GET /bridge/state), and POSTs directives to /bridge/directive.
//
//   const c = new BridgeClient();           // same host, default port 8787
//   c.onState = (state) => { ... };         // { tick, entities:[{x,y,z,hp,alive}] } or {…,enemies}
//   c.start();
//   c.send({ cmd: "target", id: 3 });
(function (global) {
  "use strict";

  function BridgeClient(opts) {
    opts = opts || {};
    const host = opts.host || location.hostname || "localhost";
    const port = opts.port || 8787;
    this.httpBase = `http://${host}:${port}`;
    this.wsUrl = `ws://${host}:${port}`;
    this.pollMs = opts.pollMs || 500;
    this.onState = null;
    this.onStatus = null;          // (connected:boolean, via:"ws"|"poll") => {}
    this._ws = null;
    this._poll = null;
  }

  BridgeClient.prototype._emitStatus = function (ok, via) {
    if (this.onStatus) try { this.onStatus(ok, via); } catch (e) {}
  };

  BridgeClient.prototype.start = function () {
    this._connectWS();
    // poll as a safety net even with WS (cheap); WS updates simply arrive sooner
    this._poll = setInterval(() => this.pullOnce(), this.pollMs);
    this.pullOnce();
  };

  BridgeClient.prototype.stop = function () {
    if (this._ws) { try { this._ws.close(); } catch (e) {} this._ws = null; }
    if (this._poll) { clearInterval(this._poll); this._poll = null; }
  };

  BridgeClient.prototype._connectWS = function () {
    let ws;
    try { ws = new WebSocket(this.wsUrl); } catch (e) { return; }
    this._ws = ws;
    ws.onopen = () => this._emitStatus(true, "ws");
    ws.onclose = () => { this._emitStatus(false, "ws"); this._ws = null; setTimeout(() => this._connectWS(), 3000); };
    ws.onerror = () => {};
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m && m.type === "bridge:state" && m.state && this.onState) this.onState(m.state);
    };
  };

  BridgeClient.prototype.pullOnce = async function () {
    try {
      const r = await fetch(this.httpBase + "/bridge/state", { headers: { Accept: "application/json" } });
      const j = await r.json();
      const state = j && (j.state || j.latest || j);
      this._emitStatus(true, "poll");
      if (state && this.onState) this.onState(state);
    } catch (e) { this._emitStatus(false, "poll"); }
  };

  BridgeClient.prototype.send = async function (directive) {
    try {
      await fetch(this.httpBase + "/bridge/directive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(directive),
      });
      return true;
    } catch (e) { return false; }
  };

  // Normalize whatever the relay holds into a flat entity list with x,y,z,alive.
  BridgeClient.entities = function (state) {
    if (!state) return [];
    const arr = Array.isArray(state.entities) ? state.entities
              : Array.isArray(state.enemies) ? state.enemies : [];
    return arr.map((e, i) => ({
      id: (e.id != null ? e.id : i),
      x: +e.x || 0, y: +e.y || 0, z: +e.z || 0,
      hp: (e.hp != null ? e.hp : (e.health != null ? e.health : null)),
      alive: (e.alive === undefined ? true : !!e.alive),
    }));
  };

  global.BridgeClient = BridgeClient;
})(window);
