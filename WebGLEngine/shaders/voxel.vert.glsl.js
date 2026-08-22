#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aOffset;

uniform mat4 uProj;
uniform mat4 uView;

void main() {
    vec3 pos = aPos + aOffset;
    gl_Position = uProj * uView * vec4(pos, 1.0);
}