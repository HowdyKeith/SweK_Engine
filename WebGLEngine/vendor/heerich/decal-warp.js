/**
 * Bilinear warp for SVG path data.
 *
 * Takes <path> `d` strings authored in a 0–1 unit coordinate space and
 * remaps every coordinate through bilinear interpolation onto a projected
 * quad (4 corner points). Produces pixel-perfect perspective-correct
 * placement — no affine approximation.
 *
 * All SVG path commands are supported: M L H V C S Q T A Z
 * (absolute and relative). Arcs (A/a) are converted to cubic beziers.
 *
 * For performance, paths are pre-parsed once via `preparePaths()`.
 * The per-frame `warpPrepared()` then just iterates flat coordinate
 * arrays — no parsing, no regex, no allocation.
 */

// ── Tokenizer ────────────────────────────────────────────────────────────

const CMD_RE = /([MLHVCSQTZAmlhvcsqtza])/;
const NUM_RE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

/**
 * Extract all numbers from a string.
 * @param {string} str - String containing numeric values
 * @returns {number[]} Parsed numbers
 */
function parseNumbers(str) {
  const nums = [];
  let m;
  NUM_RE.lastIndex = 0;
  while ((m = NUM_RE.exec(str)) !== null) nums.push(parseFloat(m[0]));
  return nums;
}

/**
 * Parse an SVG path `d` string into command/argument pairs.
 * @param {string} d - SVG path data string
 * @returns {{cmd: string, args: number[]}[]} Parsed path commands
 */
function parsePath(d) {
  const segments = d.split(CMD_RE).filter(Boolean);
  const commands = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i].trim();
    if (!seg) continue;
    if (CMD_RE.test(seg) && seg.length === 1) {
      commands.push({ cmd: seg, args: parseNumbers(segments[i + 1] || "") });
      i++;
    }
  }
  return commands;
}

// ── Arc → Cubic Bezier conversion ───────────────────────────────────────

const TAU = Math.PI * 2;

/**
 * Convert an SVG arc to cubic bezier segments.
 * @param {number} cx - Current x position
 * @param {number} cy - Current y position
 * @param {number} rx - Arc x radius
 * @param {number} ry - Arc y radius
 * @param {number} phi - X-axis rotation in radians
 * @param {number} largeArc - Large arc flag (0 or 1)
 * @param {number} sweep - Sweep flag (0 or 1)
 * @param {number} ex - End x position
 * @param {number} ey - End y position
 * @returns {number[][]} Array of [cp1x, cp1y, cp2x, cp2y, ex, ey] cubic bezier segments
 */
function arcToCubics(cx, cy, rx, ry, phi, largeArc, sweep, ex, ey) {
  if (rx === 0 || ry === 0) return [[cx, cy, ex, ey, ex, ey]];

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);

  const dx2 = (cx - ex) / 2;
  const dy2 = (cy - ey) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  let rxSq = rx * rx;
  let rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;
  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  let sq =
    (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq);
  if (sq < 0) sq = 0;
  let root = Math.sqrt(sq);
  if (largeArc === sweep) root = -root;
  const cxp = (root * rx * y1p) / ry;
  const cyp = (-root * ry * x1p) / rx;

  const theta1 = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
  let dTheta = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx) - theta1;

  if (!sweep && dTheta > 0) dTheta -= TAU;
  else if (sweep && dTheta < 0) dTheta += TAU;

  const numSegs = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const segAngle = dTheta / numSegs;
  const result = [];
  const alpha = (4 / 3) * Math.tan(segAngle / 4);
  const mx = (cx + ex) / 2 + cosPhi * cxp - sinPhi * cyp;
  const my = (cy + ey) / 2 + sinPhi * cxp + cosPhi * cyp;

  let curTheta = theta1;
  for (let i = 0; i < numSegs; i++) {
    const cosT1 = Math.cos(curTheta);
    const sinT1 = Math.sin(curTheta);
    const nextTheta = curTheta + segAngle;
    const cosT2 = Math.cos(nextTheta);
    const sinT2 = Math.sin(nextTheta);

    const ep1x = cosT1 - alpha * sinT1;
    const ep1y = sinT1 + alpha * cosT1;
    const ep2x = cosT2 + alpha * sinT2;
    const ep2y = sinT2 - alpha * cosT2;

    result.push([
      cosPhi * rx * ep1x - sinPhi * ry * ep1y + mx,
      sinPhi * rx * ep1x + cosPhi * ry * ep1y + my,
      cosPhi * rx * ep2x - sinPhi * ry * ep2y + mx,
      sinPhi * rx * ep2x + cosPhi * ry * ep2y + my,
      i === numSegs - 1 ? ex : cosPhi * rx * cosT2 - sinPhi * ry * sinT2 + mx,
      i === numSegs - 1 ? ey : sinPhi * rx * cosT2 + cosPhi * ry * sinT2 + my,
    ]);
    curTheta = nextTheta;
  }

  return result;
}

// ── Bilinear mapping (inlined for speed) ────────────────────────────────

// ── Pre-parse: done once at defineDecal time ────────────────────────────

/**
 * A pre-parsed path ready for fast per-frame warping.
 * Each entry is an "op": { cmd, coords } where coords is a flat Float64Array
 * of absolute (u,v) pairs in unit space.
 *
 * @typedef {{ cmd: string, coords: Float64Array }[]} PreparedOps
 */

/**
 * Pre-parse and normalize a path `d` string for fast warping.
 * Resolves relative coords to absolute, converts H/V to L,
 * converts A to C (cubic beziers), and packs all coordinate
 * pairs into flat typed arrays.
 *
 * @param {string} d - SVG path data in 0–1 unit space
 * @returns {PreparedOps}
 */
export function preparePath(d) {
  const cmds = parsePath(d);
  const ops = [];
  let cx = 0,
    cy = 0;
  let sx = 0,
    sy = 0;

  for (const { cmd, args } of cmds) {
    const upper = cmd.toUpperCase();
    const isRel = cmd !== upper;

    if (upper === "Z") {
      ops.push({ cmd: "Z", coords: null });
      cx = sx;
      cy = sy;
      continue;
    }

    const count =
      upper === "M"
        ? 2
        : upper === "L"
          ? 2
          : upper === "H"
            ? 1
            : upper === "V"
              ? 1
              : upper === "C"
                ? 6
                : upper === "S"
                  ? 4
                  : upper === "Q"
                    ? 4
                    : upper === "T"
                      ? 2
                      : upper === "A"
                        ? 7
                        : 0;
    if (!count) continue;

    for (let i = 0; i < args.length; i += count) {
      const a = args.slice(i, i + count);

      if (upper === "H") {
        const ax = isRel ? cx + a[0] : a[0];
        ops.push({ cmd: "L", coords: new Float64Array([ax, cy]) });
        cx = ax;
        continue;
      }

      if (upper === "V") {
        const ay = isRel ? cy + a[0] : a[0];
        ops.push({ cmd: "L", coords: new Float64Array([cx, ay]) });
        cy = ay;
        continue;
      }

      if (upper === "A") {
        const aex = isRel ? cx + a[5] : a[5];
        const aey = isRel ? cy + a[6] : a[6];
        const cubics = arcToCubics(
          cx,
          cy,
          a[0],
          a[1],
          (a[2] * Math.PI) / 180,
          a[3],
          a[4],
          aex,
          aey,
        );
        for (const seg of cubics) {
          ops.push({ cmd: "C", coords: new Float64Array(seg) });
        }
        cx = aex;
        cy = aey;
        continue;
      }

      // M, L, C, S, Q, T — resolve to absolute coordinate pairs
      const abs = new Float64Array(a.length);
      for (let j = 0; j < a.length; j += 2) {
        abs[j] = isRel ? cx + a[j] : a[j];
        abs[j + 1] = isRel ? cy + a[j + 1] : a[j + 1];
      }

      const emitCmd = i > 0 && upper === "M" ? "L" : upper;
      ops.push({ cmd: emitCmd, coords: abs });

      cx = abs[abs.length - 2];
      cy = abs[abs.length - 1];
      if (upper === "M" && i === 0) {
        sx = cx;
        sy = cy;
      }
    }
  }

  return ops;
}

// ── Per-frame warp: runs on every render ────────────────────────────────

/**
 * Warp pre-parsed path ops through bilinear interpolation.
 * No parsing, no regex, no object allocation — just math and string concat.
 *
 * @param {PreparedOps} ops - Pre-parsed path ops from preparePath()
 * @param {number[]} p - Quad points [P0x,P0y, P1x,P1y, P2x,P2y, P3x,P3y]
 * @returns {string} Warped SVG path `d` string
 */
export function warpPrepared(ops, p) {
  let out = "";
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.cmd === "Z") {
      out += "Z";
      continue;
    }
    const c = op.coords;
    out += op.cmd;
    for (let j = 0; j < c.length; j += 2) {
      const u = c[j],
        v = c[j + 1];
      const u1 = 1 - u,
        v1 = 1 - v;
      if (j > 0) out += " ";
      out +=
        u1 * v1 * p[0] +
        u * v1 * p[2] +
        u * v * p[4] +
        u1 * v * p[6] +
        " " +
        (u1 * v1 * p[1] + u * v1 * p[3] + u * v * p[5] + u1 * v * p[7]);
    }
    out += " ";
  }
  return out;
}

// ── High-level helpers ──────────────────────────────────────────────────

/**
 * Pre-parse all <path> `d` attributes in an SVG content string.
 * Returns an array of { before, ops, after } for each <path> found,
 * plus any remaining text. Used at defineDecal time.
 *
 * @param {string} svgContent
 * @returns {{ fragments: Array<{before: string, ops: PreparedOps, after: string}>, tail: string }}
 */
export function prepareDecalContent(svgContent) {
  const re = /(<path\b[^>]*?\bd=(["']))([^"']*?)(\2[^>]*?>)/gi;
  const fragments = [];
  let lastIndex = 0;
  let match;
  while ((match = re.exec(svgContent)) !== null) {
    const prefix = svgContent.slice(lastIndex, match.index);
    fragments.push({
      before: prefix + match[1],
      ops: preparePath(match[3]),
      after: match[4],
    });
    lastIndex = re.lastIndex;
  }
  return { fragments, tail: svgContent.slice(lastIndex) };
}

/**
 * Warp pre-parsed decal content onto a projected quad. Fast per-frame path.
 *
 * @param {{ fragments: Array, tail: string }} prepared - From prepareDecalContent()
 * @param {number[]} quad - [P0x,P0y, P1x,P1y, P2x,P2y, P3x,P3y]
 * @returns {string}
 */
export function warpPreparedContent(prepared, quad) {
  let out = "";
  for (let i = 0; i < prepared.fragments.length; i++) {
    const f = prepared.fragments[i];
    out += f.before + warpPrepared(f.ops, quad) + f.after;
  }
  return out + prepared.tail;
}
