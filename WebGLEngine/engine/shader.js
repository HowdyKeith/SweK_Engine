export const vertexShaderSource = `#version 300 es
layout(location=0) in vec3 aPos;

uniform mat4 uViewProj;

void main() {
    gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

export const fragmentShaderSource = `#version 300 es
precision highp float;

out vec4 outColor;

void main() {
    outColor = vec4(0.3, 0.7, 1.0, 1.0);
}
`;