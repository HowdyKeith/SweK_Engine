// FILE: render/portal.js
// VERSION: v2 - CLEAN SPATIAL PORTAL DEFINITION

export class Portal {

    constructor(a, b) {

        this.a = a;
        this.b = b;

        this.transformAtoB = new Float32Array(16);
        this.transformBtoA = new Float32Array(16);

        this.position = { x: 0, y: 0, z: 0 };
        this.normal = { x: 0, y: 0, z: 1 };

        this._identity();
    }

    _identity() {

        for (let i = 0; i < 16; i++) {
            this.transformAtoB[i] = (i % 5 === 0) ? 1 : 0;
            this.transformBtoA[i] = (i % 5 === 0) ? 1 : 0;
        }
    }

    setSurface(pos, normal) {
        this.position = pos;
        this.normal = normal;
    }
}