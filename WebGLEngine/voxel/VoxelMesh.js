import { greedyMesh } from "./greedyMesh.js";

export class VoxelMesh {
    constructor(gl) {
        this.gl = gl;

        this.vertexBuffer = gl.createBuffer();
        this.indexBuffer = gl.createBuffer();

        this.vertexCount = 0;
        this.indexCount = 0;
    }

    buildFromChunk(chunk) {
        const result = greedyMesh(chunk);

        const gl = this.gl;

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, result.vertices, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, result.indices, gl.STATIC_DRAW);

        this.vertexCount = result.vertices.length / 3;
        this.indexCount = result.indices.length;
    }
}