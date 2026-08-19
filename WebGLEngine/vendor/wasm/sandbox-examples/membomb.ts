export function run(n: i32): i32 {
  let grown = 0;
  for (let i = 0; i < 100000; i++) {
    const p = memory.grow(1); // ask for another 64KB page each time
    if (p < 0) return grown;   // cap hit -> grow returns -1; we stop gracefully
    grown++;
  }
  return grown;
}
