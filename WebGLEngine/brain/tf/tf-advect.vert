#version 300 es
// brain/tf/tf-advect.vert -- WebGL2 TRANSFORM-FEEDBACK agent integrator. RIG-ONLY.
//
// One vertex shader invocation per agent. It reads this agent's own attributes (a_pos, a_vel) and its ring
// neighbour's position from u_srcPos -- the PREVIOUS frame's position buffer bound as a texture, never the buffer
// being written -- integrates one semi-implicit Euler step under the swirl field plus coupling, and writes v_pos /
// v_vel via transform feedback into the destination buffer. Two buffers, swapped each frame (ping-pong); positions
// never leave the GPU. Because every read is of the previous frame, the result is independent of the order the GPU
// runs the vertices -- the property brain/tf/tfStep.js proves. The math below is that twin, line for line; the twin
// is the verified reference and this shader's rig job is to reproduce it (f32 vs the twin's f64, so parity, not
// bit-identity, on Galaxina).
precision highp float;

in vec3 a_pos;
in vec3 a_vel;

uniform sampler2D u_srcPos;   // previous-frame positions (source buffer as a width=N texture)
uniform int   u_count;        // N agents
uniform float u_dt;
uniform float u_k;            // ring coupling strength

out vec3 v_pos;               // -> transform feedback (destination position buffer)
out vec3 v_vel;               // -> transform feedback (destination velocity buffer)

vec3 swirl(vec3 p) { return vec3(p.y * 0.5 - p.z * 0.3, p.z * 0.4 - p.x * 0.5, p.x * 0.3 - p.y * 0.4); }
vec3 srcPos(int i) { return texelFetch(u_srcPos, ivec2(i, 0), 0).xyz; }

void main() {
    int idx = gl_VertexID;
    int nx  = (idx + 1) % u_count;
    vec3 p  = a_pos;
    vec3 np = srcPos(nx);                     // neighbour from the SOURCE -- previous frame, no read-after-write
    vec3 f  = swirl(p) + u_k * (np - p);
    v_vel   = a_vel + f * u_dt;               // semi-implicit Euler, mirrors tfStep
    v_pos   = p + v_vel * u_dt;
    gl_Position = vec4(0.0, 0.0, 0.0, 1.0);   // not rasterizing; transform feedback only
}
