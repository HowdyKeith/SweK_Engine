// ================================
// FILE: engine.bootstrap.js
// ================================

export function initGL(canvas) {
  const gl =
    canvas.getContext("webgl2") ||
    canvas.getContext("webgl");

  if (!gl) {
    throw new Error("WebGL not supported");
  }

  // REQUIRED for Uint32 indices (THIS IS A COMMON BREAK)
  const ext = gl.getExtension("OES_element_index_uint");
  if (!ext) {
    console.warn("OES_element_index_uint NOT available — meshes may break");
  }

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);

  return gl;
}