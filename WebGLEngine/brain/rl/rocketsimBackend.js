// brain/rl/rocketsimBackend.js -- v2216 -- the REAL-physics backend for the RL spike.
//
// RIG-ONLY. This drives ground-truth Rocket League physics through a Python subprocess
// (rocketsim_bridge.py -> rlgym_sim / RocketSim). It exists so the head + loop you develop
// against the kinematic stub can be pointed at real physics with a one-word backend change
// and NOTHING ELSE moving -- the same drop-in discipline as the CPU/GPU field solvers and
// the BZFlag TCP/WebSocket transport swap.
//
// Two things make it correct-by-construction yet testable WITHOUT a GPU/game files here:
//   1. All game logic lives in the Python side; this file is only a strict request/response
//      JSON-line pipe. The framing is a pure function, so the selfcheck exercises it against
//      a FAKE transport that echoes canned frames -- no python, no subprocess, no meshes.
//   2. The subprocess transport is built only in start(); importing this module has zero
//      runtime side effects, so the node selfcheck can import it safely.
//
// WHY IT CANNOT RUN IN THE SANDBOX (honest): RocketSim needs the arena COLLISION MESHES,
// which are NOT redistributable -- you dump them once from an installed Rocket League with
// the bundled dumper. Plus rlgym_sim + RocketSim are a pip install on the rig. Both are
// listed in rocketsim_bridge.py's header.
//
// PROTOCOL (one JSON object per line, strict request -> one response):
//   ->  {"cmd":"reset","seed":123}          <-  {"obs":[20 floats]}
//   ->  {"cmd":"step","action":[8 floats]}  <-  {"obs":[20],"reward":float,"done":bool,"info":{...}}
//   ->  {"cmd":"close"}                      <-  {"bye":true}
// The 20-float obs layout MUST match rocketPolicy.js / rocketEnv.js exactly.

import { OBS_DIM, ACT_DIM } from "./rocketPolicy.js";
import { fileURLToPath } from "node:url";

// Pure line-framer: feed it raw text chunks, it calls onLine(parsedObject) for each complete
// newline-terminated JSON line. Separated out so it is unit-testable with no I/O.
export function makeLineFramer(onLine) {
    let buf = "";
    return function feed(chunk) {
        buf += chunk;
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let obj; try { obj = JSON.parse(line); } catch { obj = { error: "bad json", raw: line }; }
            onLine(obj);
        }
    };
}

export class RocketSimBackend {
    constructor(opts = {}) {
        this.obsDim = OBS_DIM;
        this.actDim = ACT_DIM;
        this.backend = "rocketsim";
        this.python = opts.python || "python3";
        this.script = opts.script || fileURLToPath(new URL("./rocketsim_bridge.py", import.meta.url));
        this.maxSteps = opts.maxSteps || 300;
        this._transport = opts.transport || null;   // injectable for tests
        this._pending = [];                           // FIFO of {resolve,reject}
        this._framer = makeLineFramer((obj) => {
            const p = this._pending.shift();
            if (p) p.resolve(obj);
        });
        this._started = false;
    }

    async start() {
        if (this._started) return;
        if (!this._transport) this._transport = await this._spawnTransport();
        this._transport.onLine = (text) => this._framer(text);
        if (this._transport.attach) this._transport.attach();
        this._started = true;
    }

    _send(obj) {
        return new Promise((resolve, reject) => {
            this._pending.push({ resolve, reject });
            try { this._transport.write(JSON.stringify(obj) + "\n"); }
            catch (e) { this._pending.pop(); reject(e); }
        });
    }

    async reset(seed) {
        const r = await this._send({ cmd: "reset", seed: (seed ?? ((Math.random() * 1e9) | 0)) });
        if (!r || !Array.isArray(r.obs) || r.obs.length !== OBS_DIM)
            throw new Error(`rocketsim reset: bad obs (${r && r.obs && r.obs.length})`);
        this.t = 0;
        return Float32Array.from(r.obs);
    }

    async step(action) {
        if (!action || action.length !== ACT_DIM) throw new Error(`step: action must be ${ACT_DIM} floats`);
        const r = await this._send({ cmd: "step", action: Array.from(action, Number) });
        if (!r || !Array.isArray(r.obs) || r.obs.length !== OBS_DIM)
            throw new Error(`rocketsim step: bad obs (${r && r.obs && r.obs.length})`);
        this.t = (this.t || 0) + 1;
        return { obs: Float32Array.from(r.obs), reward: +r.reward || 0, done: !!r.done, info: r.info || {} };
    }

    async close() {
        try { await this._send({ cmd: "close" }); } catch {}
        try { if (this._transport && this._transport.close) this._transport.close(); } catch {}
        this._started = false;
    }

    // Build a real subprocess transport. Deno on the rig; node path kept for parity so the
    // loop runs under either runtime. Spawn lives HERE, never at module scope.
    async _spawnTransport() {
        const args = [this.script];
        if (globalThis.Deno && Deno.Command) {
            const proc = new Deno.Command(this.python, {
                args, stdin: "piped", stdout: "piped", stderr: "piped",
            }).spawn();
            const enc = new TextEncoder(), dec = new TextDecoder();
            const writer = proc.stdin.getWriter();
            const t = {
                write: (s) => writer.write(enc.encode(s)),
                close: () => { try { writer.close(); } catch {} try { proc.kill(); } catch {} },
                onLine: null,
                attach() {
                    (async () => {
                        for await (const chunk of proc.stdout) if (t.onLine) t.onLine(dec.decode(chunk));
                    })();
                },
            };
            return t;
        }
        // node fallback
        const { spawn } = await import("node:child_process");
        const proc = spawn(this.python, args, { stdio: ["pipe", "pipe", "pipe"] });
        const t = {
            write: (s) => proc.stdin.write(s),
            close: () => { try { proc.stdin.end(); } catch {} try { proc.kill(); } catch {} },
            onLine: null,
            attach() { proc.stdout.setEncoding("utf8"); proc.stdout.on("data", (d) => { if (t.onLine) t.onLine(d); }); },
        };
        return t;
    }
}
