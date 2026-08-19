// FILE: render/entityDebugRenderer.js
// VERSION: v2 - WIREFRAME ECS ENTITY DEBUG RENDER (shared visuals)
//
// Reads entity transforms via the render-side bridge and draws each one as
// a colored wireframe cube. Color/scale conventions live in entityVisuals.js
// and are shared with EntityCubeRenderer.

import { colorFor, scaleFor } from "./entityVisuals.js";

export class EntityDebugRenderer {
    constructor(gl) {
        this.gl = gl;
        this.program = null;
        this.vao = null;
        this.uViewProj = null;
        this.uOffset = null;
        this.uColor = null;
        this.uScale = null;
        this.lastDrawn = 0;
        this.init();
    }

    init() {
        const gl = this.gl;

        const vs = `#version 300 es
        layout(location=0) in vec3 aPos;

        uniform mat4 uViewProj;
        uniform vec3 uOffset;
        uniform float uScale;

        void main() {
            vec3 p = aPos * uScale + uOffset;
            gl_Position = uViewProj * vec4(p, 1.0);
        }`;

        const fs = `#version 300 es
        precision highp float;
        uniform vec4 uColor;
        out vec4 outColor;

        void main() {
            outColor = uColor;
        }`;

        const compile = (type, src) => {
            const sh = gl.createShader(type);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                console.error("[ENTITYDEBUG] shader:", gl.getShaderInfoLog(sh));
            }
            return sh;
        };

        this.program = gl.createProgram();
        gl.attachShader(this.program, compile(gl.VERTEX_SHADER, vs));
        gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(this.program);

        this.uViewProj = gl.getUniformLocation(this.program, "uViewProj");
        this.uOffset   = gl.getUniformLocation(this.program, "uOffset");
        this.uColor    = gl.getUniformLocation(this.program, "uColor");
        this.uScale    = gl.getUniformLocation(this.program, "uScale");

        // Unit cube centered on origin so uOffset is the entity's center
        // and uScale is the half-extent doubled. 12 edges = 24 endpoints.
        const v = [
            -0.5,-0.5,-0.5,  0.5,-0.5,-0.5,
             0.5,-0.5,-0.5,  0.5,-0.5, 0.5,
             0.5,-0.5, 0.5, -0.5,-0.5, 0.5,
            -0.5,-0.5, 0.5, -0.5,-0.5,-0.5,

            -0.5, 0.5,-0.5,  0.5, 0.5,-0.5,
             0.5, 0.5,-0.5,  0.5, 0.5, 0.5,
             0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
            -0.5, 0.5, 0.5, -0.5, 0.5,-0.5,

            -0.5,-0.5,-0.5, -0.5, 0.5,-0.5,
             0.5,-0.5,-0.5,  0.5, 0.5,-0.5,
             0.5,-0.5, 0.5,  0.5, 0.5, 0.5,
            -0.5,-0.5, 0.5, -0.5, 0.5, 0.5,
        ];

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    // entities: Array<{ id, kind, x, y, z }> from ecs_render_bridge
    render(entities, camera) {
        if (!entities || entities.length === 0) {
            this.lastDrawn = 0;
            return;
        }

        const gl = this.gl;
        gl.useProgram(this.program);

        const mvp = camera.getViewProjMatrix?.() || camera.getMatrix?.();
        if (mvp) gl.uniformMatrix4fv(this.uViewProj, false, mvp);

        gl.bindVertexArray(this.vao);

        // Render order: props (back), enemies, player on top. Pure cosmetic
        // — ensures the player marker is most visible.
        const order = ["prop", "enemy", "player", "other"];
        let drawn = 0;
        for (const kind of order) {
            const color = colorFor(kind);
            gl.uniform4fv(this.uColor, color);
            const scale = scaleFor(kind);
            gl.uniform1f(this.uScale, scale);
            for (const e of entities) {
                if ((e.kind || "other") !== kind) continue;
                gl.uniform3f(this.uOffset, e.x, e.y + scale / 2, e.z);
                gl.drawArrays(gl.LINES, 0, 24);
                drawn++;
            }
        }

        gl.bindVertexArray(null);
        this.lastDrawn = drawn;
    }
}
