// @ts-ignore: external decorator
@external("env", "emitInt")
declare function emitInt(v: i32): void;
export function run(n: i32): i32 {
  if (n < 2) return 0;
  let count = 0;
  for (let i = 2; i <= n; i++) {
    let isP = true;
    for (let j = 2; j * j <= i; j++) { if (i % j == 0) { isP = false; break; } }
    if (isP) { emitInt(i); count++; }
  }
  return count;
}
