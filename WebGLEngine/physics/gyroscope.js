// physics/gyroscope.js
//
// A spinning gyroscope pivoted at one end does not fall over; it precesses -- its axis sweeps a cone around the
// vertical. The reason is angular momentum. The gyroscope carries a large angular momentum L along its spin axis, and
// gravity applies a torque about the pivot, tau = r_cm x (m*g), which points sideways to the axis. Newton's law for
// rotation, dL/dt = tau, then says the axis does not tip toward the ground -- it moves at right angles to the pull,
// and the whole axis swings around the vertical instead of falling. Writing the axis as a-hat = L/|L| and the torque
// as tau = -mgl*(a-hat x z-hat), the torque is always perpendicular to both the axis and the vertical, so |L| and the
// vertical component of L are conserved exactly: the axis holds its tilt and precesses steadily at Omega = mgl/|L|.
// Faster spin means larger |L| means SLOWER precession -- the counterintuitive fact a real gyroscope shows. Every step
// is cross products and one square root: +,-,*,/,sqrt, no trig, so it is bit-identical across machines.
//
// Convention: y is up (the vertical z-hat = [0,1,0]); L is the angular-momentum vector.

function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function mag3(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }

// Build a gyroscope: spin rate omega about a given axis direction (normalised here, sqrt only -- no trig, so the
// initial state is bit-identical too). I is the spin moment of inertia; |L| = I*omega. Returns { L, I }.
export function makeGyro({ omega = 40, I = 1, axis = [0.48, 0.88, 0] } = {}) {
    const m = Math.sqrt(axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]), L0 = I * omega;
    return { L: [axis[0] / m * L0, axis[1] / m * L0, axis[2] / m * L0], I };
}

// One step: a-hat = L/|L|; tau = -tipTorque*(a-hat x z-hat); L += tau*dt. tipTorque = m*g*l (the gravity torque scale).
export function gyroStep(state, { tipTorque = 12, dt = 1 / 60 } = {}) {
    const L = state.L, m = mag3(L);
    const ah = [L[0] / m, L[1] / m, L[2] / m];
    const t = cross(ah, [0, 1, 0]);
    L[0] -= tipTorque * t[0] * dt; L[1] -= tipTorque * t[1] * dt; L[2] -= tipTorque * t[2] * dt;
    return state;
}

// The spin axis (unit vector) = L/|L|.
export function axisOf(state) { const L = state.L, m = mag3(L); return [L[0] / m, L[1] / m, L[2] / m]; }
// cos of the polar angle from vertical -- the tilt that precession holds constant.
export function cosTilt(state) { const L = state.L; return L[1] / mag3(L); }
// magnitude of L -- conserved, and what sets the precession rate.
export function spinMag(state) { return mag3(state.L); }
