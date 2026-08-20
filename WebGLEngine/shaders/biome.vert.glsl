// FILE: shaders/biome.vert.glsl

attribute vec3 aPosition;

uniform mat4 uMVP;

varying vec3 vWorldPos;

void main() {
    vWorldPos = aPosition;
    gl_Position = uMVP * vec4(aPosition, 1.0);
}