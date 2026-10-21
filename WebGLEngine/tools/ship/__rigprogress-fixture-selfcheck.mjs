// synthetic fixture written and deleted by rigProgress-selfcheck. Prints numbered sections, then exits 0.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const n of [1, 2, 3]) { console.log(n + '. SECTION ' + n); console.log('  PASS  a check in section ' + n); await sleep(380); }
process.exit(0);