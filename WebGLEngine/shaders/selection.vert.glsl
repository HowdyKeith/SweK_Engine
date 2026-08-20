// FILE: shaders/selection.vert.glsl

attribute vec3 aPosition;

uniform mat4 uMVP;
uniform vec3 uSelectionPos;

void main() {

    vec3 pos = aPosition + uSelectionPos;

    gl_Position = uMVP * vec4(pos, 1.0);
}