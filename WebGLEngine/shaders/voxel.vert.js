attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUV;
attribute float aMaterial;

uniform mat4 uViewProj;

varying vec3 vNormal;
varying vec2 vUV;
varying float vMaterial;

void main() {
    vNormal = aNormal;
    vUV = aUV;
    vMaterial = aMaterial;

    gl_Position = uViewProj * vec4(aPosition, 1.0);
}