// bench.ts — CPU kernels for the WASM-vs-JS benchmark lab, compiled to bench.wasm.
// All operate on the module's own linear memory at fixed offsets; the page reads/writes those.
// The algorithms are integer-deterministic where it matters, so the WASM and JS versions produce
// identical output (a fair benchmark, and verifiable). Layout (16MB memory, 512x512 max):
//   HEIGHT_OFF   0        w*h float32   heightmap
//   SCRATCH_OFF  4MB      w*h float32   ping-pong scratch (smoothing)
//   IMG_OFF      8MB      w*h*4 bytes   RGBA image
//   IMG_SCR      12MB     w*h*4 bytes   image scratch

const HEIGHT_OFF: usize = 0;
const SCRATCH_OFF: usize = 4 * 1024 * 1024;
const IMG_OFF: usize = 8 * 1024 * 1024;
const IMG_SCR: usize = 12 * 1024 * 1024;

export function heightPtr(): usize { return HEIGHT_OFF; }
export function imgPtr(): usize { return IMG_OFF; }

// integer hash -> [0,1) — identical bit math to the JS mirror so heightmaps match exactly.
// @ts-ignore: decorator
@inline function hash2(x: i32, y: i32, seed: i32): f32 {
  let h: u32 = <u32>(x * 374761393 + y * 668265263 + seed * 1274126177);
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return <f32>(h & 0xffffff) / <f32>0x1000000;
}
// @ts-ignore: decorator
@inline function smoothstep(t: f32): f32 { return t * t * (3.0 - 2.0 * t); }

// @ts-ignore: decorator
@inline function valueNoise(x: f32, y: f32, seed: i32): f32 {
  const xi = <i32>Math.floor(x), yi = <i32>Math.floor(y);
  const xf = x - <f32>xi, yf = y - <f32>yi;
  const u = smoothstep(xf), v = smoothstep(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const ab = a + (b - a) * u, cd = c + (d - c) * u;
  return ab + (cd - ab) * v;
}

// fbm value-noise heightmap into HEIGHT_OFF. Returns nothing; page reads w*h float32.
export function genHeightmap(w: i32, h: i32, seed: i32, octaves: i32): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let amp: f32 = 1.0, freq: f32 = 4.0 / <f32>w, sum: f32 = 0.0, norm: f32 = 0.0;
      for (let o = 0; o < octaves; o++) {
        sum += valueNoise(<f32>x * freq, <f32>y * freq, seed + o * 131) * amp;
        norm += amp; amp *= 0.5; freq *= 2.0;
      }
      store<f32>(HEIGHT_OFF + (<usize>(y * w + x)) * 4, sum / norm);
    }
  }
}

// Box-blur smoothing of the heightmap, `iters` passes, ping-ponging HEIGHT<->SCRATCH.
export function smooth(w: i32, h: i32, iters: i32): void {
  let src = HEIGHT_OFF, dst = SCRATCH_OFF;
  for (let it = 0; it < iters; it++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let acc: f32 = 0.0; let n: i32 = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            acc += load<f32>(src + (<usize>(yy * w + xx)) * 4); n++;
          }
        }
        store<f32>(dst + (<usize>(y * w + x)) * 4, acc / <f32>n);
      }
    }
    const t = src; src = dst; dst = t;
  }
  // ensure the final result lives at HEIGHT_OFF
  if (src != HEIGHT_OFF) {
    for (let i = 0; i < w * h; i++) store<f32>(HEIGHT_OFF + (<usize>i) * 4, load<f32>(src + (<usize>i) * 4));
  }
}

// Image filter over RGBA at IMG_OFF. kind: 0 box-blur, 1 sobel edge, 2 sharpen. Writes back to IMG_OFF.
// clamped pixel-component read (module-scope; AS has no nested functions)
// @ts-ignore: decorator
@inline function pxc(w: i32, h: i32, x: i32, y: i32, c: i32): i32 {
  if (x < 0) x = 0; if (x >= w) x = w - 1; if (y < 0) y = 0; if (y >= h) y = h - 1;
  return <i32>load<u8>(IMG_OFF + (<usize>(y * w + x)) * 4 + <usize>c);
}
export function filterImage(w: i32, h: i32, kind: i32): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let v: i32 = 0;
        if (kind == 0) {
          let acc = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) acc += pxc(w, h, x + dx, y + dy, c);
          v = acc / 9;
        } else if (kind == 1) {
          const gx = pxc(w, h, x - 1, y - 1, c) + 2 * pxc(w, h, x - 1, y, c) + pxc(w, h, x - 1, y + 1, c)
                   - pxc(w, h, x + 1, y - 1, c) - 2 * pxc(w, h, x + 1, y, c) - pxc(w, h, x + 1, y + 1, c);
          const gy = pxc(w, h, x - 1, y - 1, c) + 2 * pxc(w, h, x, y - 1, c) + pxc(w, h, x + 1, y - 1, c)
                   - pxc(w, h, x - 1, y + 1, c) - 2 * pxc(w, h, x, y + 1, c) - pxc(w, h, x + 1, y + 1, c);
          v = <i32>Math.sqrt(<f64>(gx * gx + gy * gy)); if (v > 255) v = 255;
        } else {
          const center = pxc(w, h, x, y, c);
          const around = pxc(w, h, x - 1, y, c) + pxc(w, h, x + 1, y, c) + pxc(w, h, x, y - 1, c) + pxc(w, h, x, y + 1, c);
          v = 5 * center - around; if (v < 0) v = 0; if (v > 255) v = 255;
        }
        store<u8>(IMG_SCR + (<usize>(y * w + x)) * 4 + <usize>c, <u8>v);
      }
      store<u8>(IMG_SCR + (<usize>(y * w + x)) * 4 + 3, 255); // alpha
    }
  }
  for (let i = 0; i < w * h * 4; i++) store<u8>(IMG_OFF + <usize>i, load<u8>(IMG_SCR + <usize>i));
}
