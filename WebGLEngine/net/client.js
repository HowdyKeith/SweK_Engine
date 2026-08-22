// FILE: net/client.js
// VERSION: v1 - MULTI-USER VOXEL SYNC CLIENT

export class NetClient {

    constructor(url = "ws://localhost:8080") {

        this.ws = new WebSocket(url);

        this.id = null;

        this.players = new Map();

        this.onVoxel = null;
        this.onPlayer = null;
        this.onInit = null;

        this._bind();
    }

    _bind() {

        this.ws.onmessage = (e) => {

            const msg = JSON.parse(e.data);

            // INIT
            if (msg.type === "init") {

                this.id = msg.id;

                if (this.onInit) {
                    this.onInit(msg);
                }
            }

            // VOXELS
            if (msg.type === "voxel") {

                if (this.onVoxel) {
                    this.onVoxel(msg);
                }
            }

            // PLAYERS
            if (msg.type === "player") {

                this.players.set(msg.id, msg.data);

                if (this.onPlayer) {
                    this.onPlayer(msg);
                }
            }
        };
    }

    // ------------------------------------------------------------
    // SEND PLAYER STATE
    // ------------------------------------------------------------
    sendMove(camera) {

        if (this.ws.readyState !== 1) return;

        this.ws.send(JSON.stringify({
            type: "move",
            data: {
                x: camera.position.x,
                y: camera.position.y,
                z: camera.position.z,
                yaw: camera.yaw,
                pitch: camera.pitch
            }
        }));
    }

    // ------------------------------------------------------------
    // VOXEL EDIT
    // ------------------------------------------------------------
    setVoxel(x, y, z, v) {

        if (this.ws.readyState !== 1) return;

        this.ws.send(JSON.stringify({
            type: "setVoxel",
            x, y, z, v
        }));
    }
}