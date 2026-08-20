console.log("[DEBUG CUBE] boot");

const canvas = document.querySelector("canvas");

const gl = canvas.getContext("webgl2");

if (!gl) {
    throw new Error("WebGL2 not supported");
}

canvas.width = innerWidth;
canvas.height = innerHeight;

// -----------------------------
// SHADERS
// -----------------------------
const vs = `#version 300 es
layout(location=0) in vec3 aPos;

uniform float uTime;

void main() {
    float c = cos(uTime);
    float s = sin(uTime);

    mat3 rotY = mat3(
        c, 0, s,
        0, 1, 0,
       -s, 0, c
    );

    vec3 pos = rotY * aPos;

    gl_Position = vec4(pos * 0.5, 1.0);
}
`;

const fs = `#version 300 es
precision highp float;
out vec4 outColor;

void main() {
    outColor = vec4(0.2, 0.8, 1.0, 1.0);
}
`;

// -----------------------------
// PROGRAM
// -----------------------------
function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);

    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
    }

    return s;
}

const program = gl.createProgram();
gl.attachShader(program, compile(gl.VERTEX_SHADER, vs));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs));
gl.linkProgram(program);

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
}

gl.useProgram(program);

// -----------------------------
// CUBE GEOMETRY
// -----------------------------
const vertices = new Float32Array([
    // front
    -1,-1, 1,
     1,-1, 1,
     1, 1, 1,
    -1, 1, 1,

    // back
    -1,-1,-1,
     1,-1,-1,
     1, 1,-1,
    -1, 1,-1,
]);

const indices = new Uint16Array([
    0,1,2, 2,3,0, // front
    1,5,6, 6,2,1, // right
    5,4,7, 7,6,5, // back
    4,0,3, 3,7,4, // left
    3,2,6, 6,7,3, // top
    4,5,1, 1,0,4  // bottom
]);

// -----------------------------
// BUFFERS
// -----------------------------
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);

const vbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

const ibo = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

// -----------------------------
// UNIFORM
// -----------------------------
const uTime = gl.getUniformLocation(program, "uTime");

// -----------------------------
// RENDER LOOP
// -----------------------------
function loop(t) {
    t *= 0.001;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(program);

    gl.uniform1f(uTime, t);

    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);

    requestAnimationFrame(loop);
}

console.log("[DEBUG CUBE] running");
requestAnimationFrame(loop);