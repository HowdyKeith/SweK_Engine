// FILE: net/netClient.js
// VERSION: v3 - GRACEFUL NO-SERVER MODE
//
// v3: default URL is null (i.e. no auto-connect). Previously defaulted to
// ws://localhost:8080 which targeted the old `modern-gl-bridge` multiplayer
// authority server — that was removed in v2.23d, so the default was just
// noisy console errors. v3 disabled-mode is silent and every send-path
// short-circuits when no socket is up. To opt into multiplayer later:
//
//     const net = new NetClient("ws://localhost:8080");

export class NetClient {

    constructor(url = null) {

        this.disabled = !url;
        this.ws = null;

        this.onCommand = null;
        this.onVoxel = null;
        this.onPlayer = null;

        this.id = null;

        if (this.disabled) {
            // Silent — no multiplayer server configured. main.js calls
            // sendMove every frame; those become no-ops below.
            return;
        }

        this.ws = new WebSocket(url);
        this.ws.addEventListener("error", () => {
            // Connection refused / unreachable. Don't keep retrying or
            // spamming the console; just disable until something explicitly
            // re-creates the client with a working URL.
            console.warn(`[NetClient] connection failed (${url}); multiplayer disabled`);
            this.disabled = true;
        });
        this._bind();
    }

    _bind() {

        this.ws.onmessage = (e) => {

            const msg = JSON.parse(e.data);

            // INIT
            if (msg.type === "init") {
                this.id = msg.id;
            }

            // REMOTE COMMAND
            if (msg.type === "cmd") {
                if (this.onCommand) this.onCommand(msg.data);
            }

            // VOXEL UPDATE
            if (msg.type === "voxel") {
                if (this.onVoxel) this.onVoxel(msg);
            }

            // PLAYER UPDATE
            if (msg.type === "player") {
                if (this.onPlayer) this.onPlayer(msg);
            }
        };
    }

    // ------------------------------------------------------------
    // SEND GENERIC COMMAND
    // ------------------------------------------------------------
    sendCommand(cmd) {

        if (this.disabled || !this.ws || this.ws.readyState !== 1) return;

        this.ws.send(JSON.stringify({
            type: "cmd",
            data: cmd
        }));
    }

    // ------------------------------------------------------------
    sendMove(camera) {

        this.sendCommand({
            type: "player:move",
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
            yaw: camera.yaw,
            pitch: camera.pitch
        });
    }

    setVoxel(x, y, z, v) {

        this.sendCommand({
            type: "voxel:set",
            x, y, z, v
        });
    }
}
