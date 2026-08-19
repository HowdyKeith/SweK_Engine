export function run(n: i32): i32 {
  let x = 0;
  while (true) { x = (x + 1) & 0x7fffffff; } // runaway; the sandbox timeout must kill this
  return x;
}
