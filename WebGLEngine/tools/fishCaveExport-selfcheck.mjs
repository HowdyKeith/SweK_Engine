// WebGLEngine/tools/fishCaveExport-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/fishCaveExport-selfcheck.mjs      (~75 s; needs `python3`)
//
// THE GATE OF tools/fishCaveExport.py, THE SCRIPT KEITH RUNS ON HIS OWN MACHINE WITH HIS OWN TOKEN. The sandbox this tree is built in cannot reach the Fish1 CAVE server (global.brain-wire-test.org answers 403 to its proxy), so the script
// was written against caveclient's documented API and has NEVER TALKED TO THE REAL SERVER. This gate holds everything that can be held without it, and says in row 12 what it cannot:
//
//   1b token-help and save-token: the token comes from a hidden prompt, goes to save_token, and is printed nowhere; an empty one is refused
//   1  THE REFUSALS         a token on the command line (--token, --token=x, --auth-token) is refused by name before anything runs; a non-https server, an unknown hop count, an export without a datastack, a folder that is not empty, and a Python without
//                           caveclient (the install line is printed) are each refused with the reason and exit 2
//   2  DISCOVER             against a STAND-IN caveclient (a package this gate writes into a temp folder: the datastacks, a datastack info, five tables with counts, metadata and rows, a synapse table that filters like the real one): discover.json lists the
//                           datastacks and every table with its count, columns and at most five sample rows, flags the synapse table; tables.csv has a row a table; the client was built with https, max_retries 3 and the token the ENVIRONMENT held
//   3  THE SEARCH           export finds the two Mauthner cells by the default regexp in the cell-type table (both branches of it: "Mauthner" and "M-cell"), reports each match with its table and column, and DOWNLOADS NEITHER the synapse table NOR a table over
//                           --scan-max-rows (the stand-in's log shows no query_table for them); decoys that look like the pattern but are not it ("somatic cell", "mitral cell") do not match
//   4  THE SYNAPSES         synapses_out.csv and synapses_in.csv hold exactly the synapses the fixture says (autapses and root-id-0 rows left out, as the real query's flags ask), partners.csv ranks the strongest partners with ties by id, edges.csv holds the pair
//                           counts and summed sizes worked out by hand, synapses_circuit.csv (hops 2) holds the synapses AMONG the cells and their top partners and nothing else; --hops 1 writes no circuit file; labels.csv has the cell-type rows
//   5  THE OPTIONS          --root-ids skips the search (no query_table at all); --max-rows flags a query that hit the limit as TRUNCATED in the warnings and the manifest; --version reaches every call; --tables searches only those; no match writes
//                           mauthner_candidates.json and the manifest and exits 2 without a synapse query
//   6  THE MANIFEST         lists every file with its bytes and sha256 (recomputed here), the materialization version and timestamp, the options, the citation -- and a planted token in a text column of a table STOPS THE SCRIPT (the folder is checked for the token last)
//   7  NO TOKEN ANYWHERE    the environment token appears in no file the script wrote, nor in its stdout or stderr, on any path above
//   8  THE LIBRARY          `selftest-signatures` binds every keyword the script passes to the signature of the INSTALLED caveclient. THAT IS THE ONLY CONTACT WITH THE REAL LIBRARY: it runs when a Python with caveclient is found (FISH_CAVE_PYTHON, or python3),
//                           and says NOT CHECKED HERE when none is
//   9  A REAL DATAFRAME     when that Python also has pandas, the stand-in returns real pandas DataFrames and the whole export is run again: numpy integers, NaN and the column types the real library returns reach the CSV as plain text
//
//  10  THE CELLS' LABELS AND SUMMARIES (labels.csv, cells_summary.json)        11  THE BIG-NEURON FINDER (giants): the pass, the ranking, the mirror pairs, the options, the numpy integers
//  12  A SERVER THAT FAILS, AND A PASS THAT CARRIES ON BY ITSELF (added after the second real `giants` run died at page 25 of 59 on `500 ... server closed the connection unexpectedly`): the stand-in fails on demand (an HTTP status with the
//      real error text, a dropped connection by the requests class's NAME, a bare TimeoutError, an error that only says what it says, Ctrl+C -- also while the script sleeps -- and a plain mistake) at chosen call numbers. Rows: a hiccup is
//      asked for again at the same page and size and nothing is counted twice or skipped (the answer is the clean run's to the byte); a second failure in a row halves the page, starting from the server's cap and never making it bigger; the tries
//      run out -> exit 3, the row reached, the progress file kept and nothing else written; the waits grow threefold up to a ceiling and are real waits; THE SAME COMMAND RUN AGAIN CARRIES ON (in --out, or the furthest fish1_giants_* folder,
//      and not a folder that is not one) and replaces a half-answer; a pass in pieces (--pages 1 four times); --fresh; --start-offset; counts of another snapshot, datastack, synapse table or soma table are refused or left alone, never added
//      to or overwritten; a finished run is never overwritten and the refusal comes before the network; Ctrl+C is exit 130 in a call, in a wait and in the --keep-trying cooldown; only a transient error is retried (a 403, an unlisted class
//      and a mistake are not); the top-cell queries and the soma query are retried too, and a pass whose last step failed is not read again; --keep-trying N rounds and no more, and only for the server giving up.
//
// WHAT THIS CANNOT HOLD (SAID PLAINLY): that the server's tables are named what the script expects (it searches EVERY table, so the names do not matter, but the id columns must end in `root_id`, as the CAVE materialization's do); that `synapse_query`'s
// columns are `pre_pt_root_id`/`post_pt_root_id`/`size` (the script finds the pre/post columns by their names and refuses with the column list if it cannot); that the account's token reaches the datastack; that a 5,000,000-row query finishes. `discover` is the
// first thing to run for exactly this reason, and what it writes tells us which of these held.
//
// SABOTAGE LOG (70 mutants of tools/fishCaveExport.py, each applied in a scratch tree and the gate run on it with FISH_CAVE_PYTHON set to a Python that has caveclient 8.2.1 and pandas, so that sections 8 and 9 can go red; the number is how many rows
//   went red): C01 --token allowed 2; C02 --auth-token allowed 2; C03 --token= (with an equals sign) allowed 2; C04 a non-https server allowed 1; C05 localhost refused as well 1; C06 a string that is not a URL accepted 1; C07 the trailing slash kept 1; C08 the checked server not used 1; C09 the token not handed to the client 1; C10 max_retries 0 1; C11 the datastack not handed to the client 1; C12 a non-empty folder written into 1; C13 the manifest has no digests 1; C14 the manifest has no byte counts 1; C15 the token scan dropped 1; C16 the token scan skips a short token (threshold 99) 1; C17 the manifest leaves its files out 1; C18 the manifest leaves the citation out 1; C19 the search is case-sensitive 5; C20 the default pattern has no M-cell branch 10; C21 the default pattern matches any cell 11; C22 the synapse table is searched 1; C23 the scan limit ignored 8; C24 the scan limit one too strict 1; C25 any column ending in id is an id 6; C26 a zero id is an id 1; C27 partners tie to the larger id 6; C28 the cells are partners of themselves (out) 5; C29 the cells are partners of themselves (in) 5; C30 --max-partners ignored 6; C31 hops 1 writes a circuit as well 1; C32 the circuit query asks for pre only 2; C33 a synapse in both queries counted twice 1; C34 the edge sizes are not summed 1; C35 a query at the row limit not flagged 1; C36 the truncation not said on screen 1; C37 the row limit not passed 2; C38 zero ids asked for 2; C39 autapses kept 5; C40 positions not split 1; C41 metadata asked for in synapse queries 1; C42 the version not passed to synapse queries 2; C43 the version not passed to table queries 1; C44 the version not passed to the table list 1; C45 the version not passed to the counts 1; C46 --version ignored 1; C47 the sample is fifty rows 1; C48 discover forgets the datastack info 1; C49 discover forgets the timestamp 1; C50 the synapse table never flagged 2; C51 --datastack ignored by discover 1; C52 no candidates file when nothing matches 2; C53 --root-ids reads only the first id 1; C54 labels for every scanned neuron 1; C55 the manifest swaps cells and circuit 2; C56 --tables ignored 1; C57 hops not validated 1; C58 the datastack not required 1; C59 a blank CAVE_TOKEN is a token 1; C60 save-token does not trim 2; C61 an empty token saved 1; C62 save-token echoes the token 2; C63 token-help opens a browser 1; C64 a network error is a clean exit 1; C65 a refusal exits 1 8; C66 the error message carries the whole exception text 1; C67 selftest-signatures always passes 1; C68 a probe keyword dropped from the client call 1; C69 an id written as a float 8; C70 a NaN written as the text nan 1.
//   THREE WENT 0 RED THE FIRST TIME AND EACH GOT A ROW: C53 (--root-ids reading only its first id: the one row that used --root-ids gave one id), C66 (the error text not cut: no test had a long one), C70 (a NaN written as the text 'nan': no fixture had a NaN).
//   C20 (the default pattern without its M-cell branch) went 10 red, one of them the zero-id row, because the fixture's second cell is called "M-cell right". C67 and C68 are red ONLY with the real library found (section 8); without one the gate says NOT CHECKED HERE for it.
//   THE GATE FOUND TWO DEFECTS IN THE SCRIPT BEFORE THE MUTANTS: the checked server address (trailing slash dropped, https enforced) was computed and then not used to build the clients; and a synapse that joins two of the cells is in BOTH the synapses
//   out of them and the synapses into them, which edges.csv counted twice in the --hops 1 case (the fixture has such a synapse now). A THIRD CAME FROM RUNNING THE SCRIPT'S CONSTRUCTOR AGAINST THE REAL LIBRARY IN THE SANDBOX: caveclient talks to the server
//   when the client is built, which the sandbox's proxy refuses, and the script died with a traceback; it now says what failed and what to check.
//   ONCE, BY HAND, AGAINST THE REAL LIBRARY (not in the mutant runs): `selftest-signatures` on caveclient 8.2.1 in a scratch venv: 13 of 13 probes bind. The script has never talked to the real server.
//
// VERSION 2 (the first real export's three gaps: labels for the given cells, a per-cell summary, honest sizes; sections 5 and 10), SABOTAGED -- 37 mutants of tools/fishCaveExport.py, every one red by name, run with FISH_CAVE_PYTHON set to a Python with caveclient 8.2.1 and pandas:
//   V01 the label lookup filters on the wrong column 2 | V02 the filter keeps only the first id 5 | V03 the label lookup is unfiltered 3 | V04 the label lookup limit is 10 rows 1 |
//   V05 the label lookup queries the synapse table too 1 | V06 the label lookup does not skip tables over the limit 2 | V07 the label rows lose their whole-row JSON 1 | V08 a given-cells export never looks labels up 5 |
//   V09 a search export looks labels up again 2 | V10 labels.csv drops row_json 2 | V11 the lookup report is lost 2 | V12 position columns misnamed 1 | V13 the outgoing count reads the post column 4 |
//   V14 the incoming count reads the pre column 3 | V15 partnersOut counts the pre side 2 | V16 partnersIn counts the post side 2 | V17 noSynapses needs only one side empty 1 | V18 the box ignores the incoming synapses 1 |
//   V19 the box takes the pre position for incoming too 1 | V20 the box minimum and maximum are swapped 1 | V21 the centroid divides by one too many 1 | V22 the extent in micrometres is rounded to a whole number 1 |
//   V23 the extent in micrometres uses nanometres 1 | V24 the voxel size is not given to the summary 2 | V25 a zero size column is summed as real 1 | V26 total_size is a zero where it should be blank 1 |
//   V27 the zero-size warning does not say where the sizes are 1 | V28 the zero-size warning is not printed 1 | V29 a cell with no synapse is not flagged in the console 1 |
//   V30 a cell with no synapse has no warning in the manifest 1 | V31 the no-synapse warning does not name the way out 1 | V32 the summary lists the circuit and not the cells 4 | V33 the console line loses the partner counts 2 |
//   V34 the signature probe for the filtered query is dropped 2 | V35 the signature probe names a keyword the library lacks 1 | V36 the metadata lookup for the voxel size is lost 2 |
//   V37 the label lookup ids go in unsorted-wrong (a set of one) 3
// THE SCRIPT HAS NOW TALKED TO THE REAL SERVER (2026-10-23, Keith's machine): `discover` listed three datastacks and nine tables for fish1_full, and `export --root-ids` wrote a folder; version 2 then ran against it and its label lookup and summary worked, with one table (somas_distance_to_landmark) answering HTTP 500 to a filtered query, which the lookup records as skipped and goes on. The header sentence above that the script has never talked to the server is the state before that day.
// WHAT THE REAL EXPORT FOUND THAT NO FIXTURE HAD: labels.csv was empty because --root-ids skipped the only label step; the synapse table's size column is 0 in every row; and one of the two root ids was a 0.5 micrometre fragment with two synapses and no soma, which nothing in the folder said. The summary says all three now. `selftest-signatures` has a 14th probe (the filtered query), bound to caveclient 8.2.1: 14 of 14.
//
// VERSION 3 (THE BIG-NEURON FINDER, `giants`; section 11), SABOTAGED -- 60 mutants of tools/fishCaveExport.py, every one red by name, run with FISH_CAVE_PYTHON set to a Python with caveclient 8.2.1 and pandas:
//   W01 column_ints keeps a zero root id 1 | W02 column_ints keeps a zero root id (rows path) 3 | W03 the soma position uses the first voxel size for every axis 3 | W04 the soma position is in tenths of micrometres 6
//   W05 the longest axis is called left-right 5 | W06 the shortest axis is called left-right 5 | W07 the axes are ordered shortest first 1 | W08 the midline is the mean 4 | W09 the midline is taken on the wrong axis 5
//   W10 --midline is ignored 1 | W11 the midline source is not said 1 | W12 the pair can be on the same side 2 | W13 the mirror distance is not asked for 3 | W14 the front-back distance is not asked for 3
//   W15 the top-bottom distance is not asked for 3 | W16 the tolerance edge is exclusive 1 | W17 pairs are ranked smallest first 2 | W18 pairs are ranked by the larger cell 1 | W19 the pair ratio is inverted 1
//   W20 inputs and outputs are swapped in the pass 6 | W21 autapses are counted 3 | W22 the page advances by one row less 2 | W23 the pass ends on the first short page 2 | W23b the pass reads one empty page after the end 4
//   W23c a capping server is not said 1 | W23d the cap is said on every page 1 | W24 the columns are asked in the other order 1 | W25 the page is one row longer than asked 3 | W26 the page is asked at no version 1
//   W27 the counts count everybody, not the cells 1 | W28 no partial file is kept 3 | W29 a stopped pass deletes its partial file 3 | W30 a resume starts again at row 0 1 | W31 a resume forgets the counts 1
//   W32 a resume of another version is accepted 1 | W33 a resume of another datastack is accepted 1 | W34 the coverage warning needs a tenth of the table 1 | W35 the stopped-pass warning is lost 1 | W36 --sample is ignored 1
//   W37 the sample asks for twice as many 1 | W38 the sample call has no random_sample 1 | W39 the cells are ranked by what they send 3 | W41 ties go to the larger id 4 | W42 the top list is one too long 2
//   W43 the exact pass swaps in and out 2 | W44 the exact pass asks in sorted order 1 | W45 the viewer position uses one voxel size 2 | W46 the sides are swapped 1 | W47 a cell is its own mirror partner 1
//   W48 the extents use the soma voxel size 1 | W49 a stopped pass says it finished 1 | W50 --top 1 is allowed 1 | W51 a big soma table is read anyway 1 | W52 --soma-voxel-nm is ignored 1 | W53 an unknown voxel size is guessed 1
//   W54 the cell type is read from the wrong column 2 | W55 the paged probe is dropped 2 | W56 the sampled probe names a keyword the library lacks 1 | W57 the console lists no pairs 1 | W58 the manifest forgets the mode 1
// FOUR WENT 0 RED THE FIRST TIME AND EACH GOT A ROW OR A CELL: W15 (the top-bottom distance not asked for: no cell in the fixture was in line with another but at a different height -- 1109 is now, 40 um below 1104), W18 (pairs ranked by the larger cell: no two pairs whose smaller and larger cells ordered differently -- 1110/1111, 40 and 8 inputs, are now), W57 (the console listing no pairs: nothing read stdout -- a row does), and W40 (a fragment ranked) is EQUIVALENT: the pass counts only roots that have a soma, so no fragment is ever in the counts, and the filter in the ranking is a second line of defence nothing can reach.
// THE GATE FOUND A BUG IN THE SCRIPT BEFORE THE MUTANTS: a pass that was stopped (--pages 1) deleted its own giants_counts.partial.json, the very file --resume reads; and the first page rule (a short page ends the pass) would have read a server that caps a query's rows as the end of the table after one page: the end is now the table's row count (a stand-in that caps at 50 rows has a row).
// WHAT IS NOT CHECKED: that the real server pages synapses_axde by offset in a stable order (the pass compares the rows it read with the table's row count and says so below 99%), that a page of a million rows finishes before a timeout (--chunk-rows is the knob), and that the largest dendritic trees of the hindbrain are the Mauthner cells. `giants` has not run against the real server.
//
// THE FIRST REAL `giants` RUN DIED ON A NUMPY INTEGER (2026-10-23, Keith's machine: `TypeError: Object of type int64 is not JSON serializable` the moment the first page was saved), SABOTAGED -- 10 mutants of tools/fishCaveExport.py, every one red by name:
//   X01 the giants version is a numpy integer 2 | X02 the export version is a numpy integer 1 | X03 the synapse table row count is a numpy integer 2 | X04 a table row count in discover is a numpy integer 1 | X05 plain_int turns a number into text 7 |
//   X06 plain_int turns None into zero 1 | X07 the partial file is written without its version 3 | Y01 an unknown synapse count is not handled (no short-page rule) 1 | Y02 an unknown soma count passes 1 | Y03 the unknown-count refusal does not point at discover 1
// X06 went 0 red the first time (a count the server does not give became a zero that sailed past the 'is it over the limit' check): the soma-table refusal says the server did not say, the synapse-table case ends on the short page and writes null for the rows and the coverage, and one row holds both.
// WHY NO FIXTURE HAD CAUGHT IT: the stand-in handed back python integers, and caveclient hands back numpy ones, which the json module cannot write and which a default=str dump writes as TEXT -- the real export's MANIFEST said "materializationVersion": "737" with the quotes. The stand-in has a numpy-like integer now (np_ints), plain_int() normalises the version and every row count, and the real server's other surprise -- `201 - Limited query to 500000 rows`, a cap on the rows of a query -- is what the capped-server row (50 rows) stands in for.
//
// THE SECOND REAL `giants` RUN DIED AT PAGE 25 OF 59 (2026-10-23, Keith's machine, 41% and eight minutes in: HTTP 500, `psycopg2.OperationalError: server closed the connection unexpectedly`), and the script could neither retry nor find its own
// progress file again. SABOTAGED -- 58 mutants of tools/fishCaveExport.py, each applied in a scratch tree, the gate run on it with FISH_CAVE_PYTHON set to a Python that has caveclient 8.2.1 and pandas, EVERY ONE RED BY NAME (the number is how many rows
// went red) AFTER TWO WERE FIXED, below:
//   V01 a 500 is not a hiccup 11 | V02 every HTTP error is retried 1 | V03 every error is retried 3 | V04 the requests classes are not known by name 1 | V05 the builtin timeout is not known by type 1 | V06 an error is read only by its class 1
//   V07 one try too few 8 | V08 the wait does not grow 2 | V09 the wait has no ceiling 1 | V10 the wait doubles 1 | V11 the wait is not waited 2 | V12 the first failure halves the page 6 | V13 the third failure halves it, not the second 2
//   V14 the floor is ignored 1 | V15 a page can grow 1 | V16 halving ignores the server's cap 1 | V17 the cap is not remembered 1 | V18 the page size is not changed after halving 2 | V19 a stop exits 1 7 | V20 the stop does not say to run again 3
//   V21 the progress file is not written 3 | V22 Ctrl+C is not caught in a call 2 | V23 a mistake is raised as a stop 4 | V24 nothing carries on by itself 12 | V25 --fresh is ignored 1 | V26 --start-offset is ignored 1
//   V27 a snapshot that differs is not noticed 3 | V28 a datastack that differs 2 | V29 a synapse table that differs 1 | V30 a soma table that differs 1 | V31 the soma table is not written to the progress file 1 | V32 a partial with no soma table named is refused 1
//   V33 the nearest folder wins, not the furthest 1 | V34 the carried-on run starts a new folder 1 | V35 a finished run can be overwritten 1 | V36 the progress file blocks its own folder 13 | V37 the folder is checked only after the network 1
//   V38 a pass that was already read is read again 1 | V39 the top-cell queries are not retried 2 | V40 the soma query is not retried 1 | V41 the new options are not checked 1 | V42 a scan does not name the other snapshot's folder 1
//   V43 the carry-on is not said to be by itself 1 | V44 the manifest does not say it resumed 1 | V45 the stop names no row 3 | V46 a stop in the top-cell queries does not say the pass is skipped 1 | V47 a scan takes a folder that is not ours 1
//   V49 the wait message names no try 2 | V51 no keep-trying loop 3 | V52 one more round than asked 4 | V53 every stop is tried again, Ctrl+C too 1 | V54 the cooldown is not waited 2 | V55 Ctrl+C exits 3 2 | V56 a stop always exits 3 3
//   V57 negative keep-trying and cooldown are accepted 1 | V58 the manifest does not record keep-trying 1 | V59 Ctrl+C while waiting to retry exits 3 1 | V60 Ctrl+C in the cooldown exits 1 1
// THREE MUTANTS WERE NOT CLEAN THE FIRST TIME AND EACH GOT A ROW OR A FIX: V31 (the progress file's soma table was only ever checked on READ: the give-up row now reads the file's version and soma table as written) and V47 (the scan took any folder:
// the furthest-wins row now has a decoy folder, not named fish1_giants_*, that holds a valid partial file further on than the real ones) read 0 red; V41 matched nothing after the option check grew (the pattern was moved, not the gate). V21 made the
// gate THROW on the missing progress file, which hides every row after it: a missing file now reads as nulls, so the row that wanted it fails and the rest run. ALSO FOUND BY WRITING THE ROWS: the third failure of a page printed 'page 3' and the next
// round 'page 1' -- a round counts its pages from where it starts, said in the keep-trying row; and two places where the script did the same thing twice (the builtin connection errors matched by name AND by type; the shrink bounded by a min() AND by a
// guard) were each cut to one, because removing either copy would have changed nothing and a mutant of it could only have read 0 red.
//
// THE THIRD REAL RUN (2026-10-23: the whole synapse table read, 29,474,316 rows, 100%, resumed by itself, no warnings) GAVE TWO THINGS TO FIX. Every extent column of giants_top.csv was BLANK and nothing said why: the synapse table's voxel size was read
// inside a bare `except Exception: syn_res = []`; it is now a warning on the console and in the manifest, naming the table and the reason (the error's first line, or 'names no voxel size'). And `export`, the command run next, had no retry for its synapse
// queries; they are retried like the pass, and a stop says that only mauthner_candidates.json is in the folder, so the next run needs a different --out (the same command into the same folder IS refused, and a row holds that). SABOTAGED, 6 mutants,
// every one red by name: W01 export's synapse query is not retried 2 | W02 export's stop gives no advice about the folder 1 | W03 a failed voxel-size read is swallowed again 1 | W04 an empty voxel size is not noticed 1 | W05 the warning gives no reason 1
// | W06 the stop's advice is replaced by 'run again' 1. THE BLANK EXTENTS' CAUSE IS NOT KNOWN: the real call may have failed or the metadata may have named no voxel size; the next real run will say which, in its warnings.
// NOT CHECKED: that the real server's 500 is the kind a pause cures (it may be a time limit on a deep OFFSET, in which case smaller pages help less than hoped and the answer is a different query); the real requests / urllib3 exception classes
// (the stand-in builds classes of the same NAMES, which is all the script reads); a Ctrl+C on Windows (the gate raises it with _thread.interrupt_main, which is the same KeyboardInterrupt the console delivers, not the console event itself);
// and any of section 12 against the real server.
//
// VERSION 5 (--signs, --boxes and --sign-chunk: the label table's tag per synapse and the size table's bounding boxes; section 13), SABOTAGED -- 50 mutants of tools/fishCaveExport.py, every one red by name (FISH_CAVE_PYTHON set to a Python that has numpy and pandas):
//   V01 best_effort lets an ordinary error through 1 | V02 best_effort swallows Ctrl+C 1 | V03 best_effort is silent on the console 1 | V04 best_effort keeps a refusal out of the manifest 3 |
//   V05 the default label table name is wrong 3 | V06 a named table is not checked against the stack 1 | V07 several size tables pick the first 1 | V08 the chunk count is wrong 2 | V09 a chunk is one id short 1 |
//   V10 the ids are not sorted 2 | V11 the label table is filtered on id 3 | V12 a tag is joined on the label row's own id 3 | V13 inhibitory and excitatory counts swapped in the report 1 | V14 other tags counted wrong 1 |
//   V15 edge signs swapped 2 | V16 an other tag counts as inhibitory 1 | V17 sign columns without --signs 4 | V18 an empty join is used 1 | V19 the circuit's synapses are not asked for 4 |
//   V20 synapse_signs.csv loses its id column 1 | V21 the summary's in and out are swapped 1 | V22 other tags are not untagged in the summary 1 | V23 the manifest says signs false 1 | V24 the manifest carries no extras 2 |
//   V25 the README never mentions the signs 2 | V26 the README always mentions the boxes 1 | V27 the boxes are asked for by the post side only 4 | V28 the boxes are not deduplicated 4 |
//   V29 the boxes are filtered on the synapses' ids 4 | V30 the box scale uses one axis 3 | V31 the box volume drops an axis 3 | V32 every box counts as joined 2 | V33 the edge volume is the last box, not the sum 2 |
//   V34 the volume column appears when nothing joined 1 | V35 no warning for a missing voxel size 1 | V36 no warning for boxes that do not join 1 | V37 the stop advice of an extra is a different one 1 |
//   V38 the stack's tables are the --tables list 1 | V39 --boxes alone also asks for the signs 1 | V40 --boxes alone does nothing 3 | V41 --sign-chunk 0 is allowed 1 | V42 --sign-chunk is not used 1 |
//   V43 --label-table is ignored 1 | V44 --size-table is ignored 3 | V45 the summary carries no extras 2 | V46 the sign lookup is not best effort 3 | V47 the box lookup is not best effort 2 | V48 the voxel size is not read 3 |
//   V49 the label query forgets the version 1 | V50 the label query has a tiny row limit 5
// THREE WENT 0 RED THE FIRST TIME AND WERE FIXED IN THE GATE. V07 (several tables with 'size' in their name: the first is taken): no row had a stack with two, so the fixture got a second size table (one red now, and naming the table gets the boxes). V10 (the ids not sorted): Python's set
// of ints iterates in hash order, and the nineteen ids 100000..100017, 100023 sit in consecutive slots, so the list came out sorted anyway; the fixture now has a synapse with id 100100 (seventy-three unrelated synapses before it), which wraps around the table, and the unsorted list shows (two red).
// V37 (the stop advice of an extra replaced by 'run again'): no row looked past the start of the warning; the row reads the advice now (one red). The numbers in the section's rows were worked out by hand from the fixture (twenty synapse ids, twelve tagged: six inhibitory, five excitatory, one with a tag that is neither).
// NOT CHECKED (written without a token against the stand-in, like every version of this script): that the real server filters `synapses_axde_label` on `target_id` (the one column of that table that is its own; the filter that FAILED on a reference table in the first `discover` was on a column of the REFERENCED table, pt_root_id) and that target_id IS the synapse's id there (the table
// description says both are a cantor pair of pre_synapse_id and post_synapse_id; the script COUNTS the join and refuses an empty one instead of assuming it); that the size table's pt_root_id / pt2_root_id are its own columns, that its id is the synapse's id (counted, not assumed) and that its positions are in the voxels of its metadata; that 2,000 ids per request is accepted;
// and anything about the size of the real answers (the server returns at most 500,000 rows a query; a cell with more synapses than that is not one of ours). The first real run says which of these holds, in its warnings.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ENG, "tools", "fishCaveExport.py");
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const note = (t) => console.log("  ----  " + t);

console.log("fishCaveExport-selfcheck -- the script that exports the Mauthner circuit, held against a stand-in server\n");

const PY = process.env.PYTHON || "python3";
const probe = spawnSync(PY, ["--version"], { encoding: "utf8" });
if (probe.status !== 0) {
    note("NOT CHECKED HERE: no `" + PY + "` on this machine, so none of tools/fishCaveExport.py was run. Set PYTHON to a Python 3.9+.");
    finished = true; console.log("\nfishCaveExport-selfcheck: all checks pass (nothing was run)"); process.exit(0);
}
const REAL = process.env.FISH_CAVE_PYTHON || PY;
const hasMod = (py, m) => spawnSync(py, ["-c", "import " + m], { encoding: "utf8" }).status === 0;

// ---- the stand-in caveclient --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const TOKEN = "tok_SECRET_9f3c1a77e2";
const FIXTURE = {
    datastacks: ["fish1_test", "fish1_other"], version: 42, timestamp: "2026-09-15T00:00:00+00:00", datastack_info: { synapse_table: "synapses", soma_table: "soma", aligned_volume: "fish1" },
    tables: {
        synapses: { count: 31000000, schema: "synapse", rows: [] },
        soma: { count: 4, schema: "nucleus_detection", rows: [{ id: 1, pt_root_id: 1001, label: "soma" }, { id: 2, pt_root_id: 1002, label: "soma" }, { id: 3, pt_root_id: 2001, label: "soma" }, { id: 4, pt_root_id: 2002, label: "soma" }] },
        cell_types: { count: 5, schema: "cell_type_local", rows: [
            { id: 1, pt_root_id: 1001, cell_type: "Mauthner cell, left", status: "proofread" }, { id: 2, pt_root_id: 1002, cell_type: "M-cell right", status: "proofread" },
            { id: 3, pt_root_id: 2001, cell_type: "reticulospinal", status: "draft" }, { id: 4, pt_root_id: 2002, cell_type: "somatic cell", status: "draft" }, { id: 5, pt_root_id: 2003, cell_type: "mitral cell", status: "draft" }] },
        big_table: { count: 10000000, schema: "big", rows: [{ id: 1, pt_root_id: 9999, note: "Mauthner" }] },
        notes: { count: 7, schema: "note", rows: [{ id: 1, pt_root_id: 2004, note: "a note" }, { id: 2, pt_root_id: 2005, note: "another" }, { id: 3, pt_root_id: 2006, note: "n3" }, { id: 4, pt_root_id: 2007, note: "n4" }, { id: 5, pt_root_id: 2008, note: "n5" }, { id: 6, pt_root_id: 2009, note: "n6" }, { id: 7, pt_root_id: 2010, note: "n7" }] },
    },
};
// synapses: [pre, post, size]
const S = [];
const add = (pre, post, sizes) => sizes.forEach((s) => S.push([pre, post, s]));
add(1001, 2001, [100, 200, 300]); add(1001, 2002, [50]); add(1002, 2001, [10, 20]); add(1002, 2003, [500]);
add(2004, 1001, [10, 10, 10, 10]); add(2001, 1001, [7]); add(2004, 1002, [10, 10]); add(2005, 1002, [5]);
add(2001, 2002, [3, 5]); add(2004, 2001, [9]); add(3001, 2001, [1, 1, 1, 1, 1]);
add(1001, 1002, [33]);   // one cell onto the other: it is in BOTH the synapses out of the cells and the synapses into them, and must count once
add(1001, 1001, [77]);   // an autapse: the real query leaves it out when remove_autapses is true
add(1001, 0, [4, 4]);    // an unproofread partner (root id 0): left out when include_zeros is false
FIXTURE.synapses = S;

const STUB = String.raw`
import json, os
_fix = json.load(open(os.environ["FAKE_CAVE_FIXTURE"]))
_log = os.environ["FAKE_CAVE_LOG"]
try:
    import pandas as _pd
except ImportError:
    _pd = None
__version__ = "0.0-standin"

def _write(entry):
    with open(_log, "a") as f:
        f.write(json.dumps(entry, default=str) + "\n")

class _MiniDF:
    def __init__(self, rows, columns):
        self._rows, self.columns = rows, columns
    def to_dict(self, orient):
        assert orient == "records"
        return [dict(r) for r in self._rows]
    def __len__(self):
        return len(self._rows)

def _df(rows, columns):
    if _pd is not None and os.environ.get("FAKE_CAVE_PANDAS") == "1":
        return _pd.DataFrame(rows, columns=columns)
    return _MiniDF(rows, columns)

class _NpInt:
    """Stands in for a numpy integer: arithmetic, comparison and formatting work, the json module refuses it (as it refused the real one in the first giants run)."""
    def __init__(self, v): self.v = int(v)
    def __int__(self): return self.v
    def __index__(self): return self.v
    def __eq__(self, o): return self.v == int(o)
    def __ne__(self, o): return self.v != int(o)
    def __lt__(self, o): return self.v < int(o)
    def __le__(self, o): return self.v <= int(o)
    def __gt__(self, o): return self.v > int(o)
    def __ge__(self, o): return self.v >= int(o)
    def __hash__(self): return hash(self.v)
    def __add__(self, o): return _NpInt(self.v + int(o))
    __radd__ = __add__
    def __str__(self): return str(self.v)
    __repr__ = __str__
    def item(self): return self.v

def _np(v):
    return _NpInt(v) if _fix.get("np_ints") else v

class _HttpError(Exception):
    """What caveclient raises for a bad status: a message and a .response with the status code."""
    def __init__(self, status, text):
        Exception.__init__(self, text)
        self.response = type("Response", (), {"status_code": status})()

_calls = {}
def _maybe_fail(call, table=None):
    """The fixture's "flaky" list: [{ call, table?, from?, to?, kind?, status? }] -- the nth call of that kind (counted per call and table, from 1) between from and to fails the way kind says: http (a status), conn (a dropped connection), interrupt (Ctrl+C), other (a mistake a retry cannot fix)."""
    key = call + ":" + str(table)
    n = _calls[key] = _calls.get(key, 0) + 1
    for f in _fix.get("flaky", []):
        if f["call"] != call or (f.get("table") and f["table"] != table): continue
        if not (f.get("from", 1) <= n <= f.get("to", 10 ** 9)): continue
        kind = f.get("kind", "http")
        if kind == "http": raise _HttpError(f.get("status", 500), str(f.get("status", 500)) + " Server Error: (psycopg2.OperationalError) server closed the connection unexpectedly\n        This probably means the server terminated abnormally\n        before or while processing the request.\n\n(Background on this error at: http://sqlalche.me/e/13/e3q8) for url: https://pcgv3local.example.invalid/material")
        if kind == "conn": raise type(f.get("name", "ConnectionError"), (Exception,), {})("HTTPSConnectionPool(host='x', port=443): Max retries exceeded")   # the requests classes are not the builtin ones: only their NAMES say what they are
        if kind == "timeout": raise TimeoutError()   # the builtin, with no message to read
        if kind == "text": raise Exception("server closed the connection unexpectedly")   # an error of no known class that says what the real one said
        if kind == "interrupt": raise KeyboardInterrupt()
        if kind == "interrupt_while_waiting":   # a 500, and Ctrl+C a moment later: while the script sleeps before trying again
            import threading, _thread
            threading.Timer(0.3, _thread.interrupt_main).start()
            raise _HttpError(500, "500 Server Error: the server hiccuped")
        raise ValueError("a mistake the server will make again")

class _Info:
    def get_datastacks(self):
        _write({"call": "get_datastacks"}); return list(_fix["datastacks"])
    def get_datastack_info(self, datastack_name=None):
        _write({"call": "get_datastack_info", "datastack_name": datastack_name}); return dict(_fix["datastack_info"])

class _Mat:
    def most_recent_version(self):
        _write({"call": "most_recent_version"}); return _np(_fix["version"])
    def get_timestamp(self, version=None, datastack_name=None):
        _write({"call": "get_timestamp", "version": version}); return _fix["timestamp"]
    def get_tables(self, datastack_name=None, version=None):
        _write({"call": "get_tables", "version": version}); return list(_fix["tables"])
    def get_annotation_count(self, table_name, datastack_name=None, version=None):
        _write({"call": "get_annotation_count", "table": table_name, "version": version})
        if _fix.get("count_none") and table_name in _fix["count_none"]: return None   # a table whose size the server does not give
        return _np(_fix["tables"][table_name]["count"])
    def get_table_metadata(self, table_name, datastack_name=None, version=None, log_warning=True):
        _write({"call": "get_table_metadata", "table": table_name, "version": version}); _maybe_fail("get_table_metadata", table_name); t = _fix["tables"][table_name]
        md = {"schema": t["schema"], "description": "stand-in table " + table_name, "voxel_resolution": t.get("voxel_resolution", [8, 8, 30])}
        if _fix.get("no_voxel") or table_name in _fix.get("no_voxel_for", []): del md["voxel_resolution"]
        return md
    def query_table(self, table, limit=None, split_positions=False, materialization_version=None, metadata=True, filter_in_dict=None, select_columns=None, offset=None, random_sample=None, **kw):
        _write({"call": "query_table", "table": table, "limit": limit, "split_positions": split_positions, "version": materialization_version, "metadata": metadata, "filter_in_dict": filter_in_dict, "select_columns": select_columns, "offset": offset, "random_sample": random_sample})
        _maybe_fail("query_table", table)
        if table == _fix["datastack_info"].get("synapse_table") and _fix.get("query_synapses"):
            rows = [{"id": 100000 + i, "pre_pt_root_id": a, "post_pt_root_id": b, "size": size} for i, (a, b, size) in enumerate(_fix["synapses"])]
        else:
            rows = list(_fix["tables"][table]["rows"])
        for col, vals in (filter_in_dict or {}).items():
            if rows and col not in rows[0]: raise ValueError("column %s is not in table %s" % (col, table))   # what the server answers for a column the table does not have
            rows = [r for r in rows if r.get(col) in set(vals)]
        if random_sample: rows = rows[::max(1, len(rows) // random_sample)][:random_sample]
        if offset: rows = rows[offset:]
        if limit is not None: rows = rows[:limit]
        if _fix.get("row_cap"): rows = rows[:_fix["row_cap"]]   # a server that returns at most this many rows however many were asked for
        cols = list(select_columns) if select_columns else (list(rows[0].keys()) if rows else [])
        if select_columns: rows = [{c: r.get(c) for c in cols} for r in rows]
        return _df(rows, cols)
    def synapse_query(self, pre_ids=None, post_ids=None, materialization_version=None, remove_autapses=True, include_zeros=True, limit=None, split_positions=False, metadata=True, **kw):
        _write({"call": "synapse_query", "pre_ids": pre_ids, "post_ids": post_ids, "version": materialization_version, "remove_autapses": remove_autapses, "include_zeros": include_zeros, "limit": limit, "split_positions": split_positions, "metadata": metadata})
        _maybe_fail("synapse_query")
        pre = set(pre_ids) if pre_ids is not None else None; post = set(post_ids) if post_ids is not None else None
        rows = []
        for i, (a, b, size) in enumerate(_fix["synapses"]):
            if pre is not None and a not in pre: continue
            if post is not None and b not in post: continue
            if remove_autapses and a == b: continue
            if not include_zeros and not _fix.get("leak_zero") and (a == 0 or b == 0): continue
            rows.append({"id": 100000 + i, "pre_pt_root_id": a, "post_pt_root_id": b, "size": (float("nan") if _fix.get("nan_size") and i == 0 else (0 if _fix.get("zero_size") else size)), "ctr_pt_position_x": 10 * i, "ctr_pt_position_y": 20 * i, "ctr_pt_position_z": 3 * i, "pre_pt_position_x": 1000 + i, "pre_pt_position_y": 2000 + 2 * i, "pre_pt_position_z": 300 + 3 * i, "post_pt_position_x": 5000 + 5 * i, "post_pt_position_y": 6000 + i, "post_pt_position_z": 700 + 7 * i})
        if limit is not None: rows = rows[:limit]
        return _df(rows, ["id", "pre_pt_root_id", "post_pt_root_id", "size", "ctr_pt_position_x", "ctr_pt_position_y", "ctr_pt_position_z", "pre_pt_position_x", "pre_pt_position_y", "pre_pt_position_z", "post_pt_position_x", "post_pt_position_y", "post_pt_position_z"])

class _Auth:
    def get_new_token(self, open=False, no_text=False):
        _write({"call": "get_new_token", "open": open}); print("Go to https://example.invalid/token to make a token")
    def save_token(self, token=None, **kw):
        _write({"call": "save_token", "token_len": len(token or "")})

class CAVEclient:
    def __init__(self, datastack_name=None, server_address=None, auth_token=None, max_retries=None, **kw):
        _write({"call": "CAVEclient", "datastack_name": datastack_name, "server_address": server_address, "auth_token": "<present>" if auth_token else None, "max_retries": max_retries, "extra": sorted(kw)})
        if _fix.get("fail_construct"): raise ConnectionError("HTTPSConnectionPool(host='global.brain-wire-test.org', port=443): Max retries exceeded with url: /info/version" + ("; " + "x" * 1000 if _fix.get("long_message") else ""))
        self.info, self.materialize, self.auth = _Info(), _Mat(), _Auth()
`;

const work = fs.mkdtempSync(path.join(os.tmpdir(), "fishcave_"));
const stubDir = path.join(work, "stub"); fs.mkdirSync(path.join(stubDir, "caveclient"), { recursive: true });
fs.writeFileSync(path.join(stubDir, "caveclient", "__init__.py"), STUB);
const fixFile = path.join(work, "fixture.json");
const writeFixture = (f) => fs.writeFileSync(fixFile, JSON.stringify(f));
writeFixture(FIXTURE);
let runNo = 0;
/** Run the script with the stand-in on PYTHONPATH (unless `stub` is false) and a clean log; returns { status, stdout, stderr, log, out }. */
function run(args, { stub = true, env = {}, cwd = work, py = PY, input = undefined, pandas = false } = {}) {
    const log = path.join(work, `log${++runNo}.jsonl`);
    const e = { ...process.env, ...env, FAKE_CAVE_FIXTURE: fixFile, FAKE_CAVE_LOG: log, FAKE_CAVE_PANDAS: pandas ? "1" : "0" };
    if (stub) e.PYTHONPATH = stubDir; else delete e.PYTHONPATH;
    const r = spawnSync(py, [SCRIPT, ...args], { encoding: "utf8", env: e, cwd, input, timeout: 120000 });
    const lines = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "", log: lines };
}
const outDir = (n) => path.join(work, n);
const rd = (d, f) => fs.readFileSync(path.join(d, f), "utf8");
const parseCsv = (t) => { const rows = []; let row = [], cur = "", q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; } else cur += c; } if (cur !== "" || row.length) { row.push(cur); rows.push(row); } return rows; };
const csvRows = (d, f) => { const [h, ...rs] = parseCsv(rd(d, f)); return rs.map((r) => Object.fromEntries(h.map((c, i) => [c, r[i]]))); };
const allText = (d) => fs.readdirSync(d).map((f) => rd(d, f)).join("\n");
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const E = { CAVE_TOKEN: TOKEN };
let leaks = [];   // every stdout/stderr/folder checked for the token, for row 7
const watch = (r, d) => { leaks.push(r.stdout + r.stderr); if (d && fs.existsSync(d)) leaks.push(allText(d)); };

sec("1. the refusals");
{
    const r1 = run(["--token", "abc", "discover"], { env: E }), r2 = run(["discover", "--token=abc"], { env: E }), r3 = run(["export", "--auth-token", "abc"], { env: E });
    ok("!! A TOKEN ON THE COMMAND LINE IS REFUSED BY NAME, before the script does anything: --token, --token=x and --auth-token each exit 2, name the reason (shell history, ps) and the safe routes, and the stand-in client was never built", [r1, r2, r3].every((r) => r.status === 2 && /command line/.test(r.stderr) && /save-token/.test(r.stderr) && /CAVE_TOKEN/.test(r.stderr) && r.log.length === 0));
    const r4 = run(["discover", "--server", "http://global.example.org"], { env: E }), r5 = run(["discover", "--server", "ftp://x"], { env: E }), r5b = run(["discover", "--server", "http://localhost:8080", "--out", outDir("ok_local")], { env: E });
    ok("!! A SERVER THAT IS NOT HTTPS IS REFUSED (a token must not cross the network in the clear) -- except localhost, which is how a test server is reached; a string that is not a URL is refused too", r4.status === 2 && /https/.test(r4.stderr) && r4.log.length === 0 && r5.status === 2 && r5b.status === 0);
    const r6 = run(["export", "--out", outDir("e0")], { env: E }), r7 = run(["export", "--datastack", "fish1_test", "--hops", "3", "--out", outDir("e0b")], { env: E });
    ok("export without --datastack, and --hops other than 1 or 2, are refused with the reason and exit 2", r6.status === 2 && /--datastack/.test(r6.stderr) && r7.status === 2 && /--hops/.test(r7.stderr));
    fs.mkdirSync(outDir("full"), { recursive: true }); fs.writeFileSync(path.join(outDir("full"), "x.txt"), "x");
    const r8 = run(["discover", "--out", outDir("full")], { env: E });
    ok("!! AN OUTPUT FOLDER THAT IS NOT EMPTY IS REFUSED (the script never overwrites), and the file in it is untouched", r8.status === 2 && /not empty/.test(r8.stderr) && rd(outDir("full"), "x.txt") === "x" && fs.readdirSync(outDir("full")).length === 1);
    const nocave = hasMod(PY, "caveclient");
    if (nocave) note("NOT CHECKED HERE: " + PY + " has caveclient installed, so 'no caveclient' cannot be shown on this machine");
    else { const r9 = run(["discover", "--out", outDir("nocave")], { stub: false, env: E }); ok("!! A PYTHON WITHOUT caveclient SAYS HOW TO INSTALL IT (python3 -m pip install caveclient) and exits 2, and writes no folder of results", r9.status === 2 && /pip install caveclient/.test(r9.stderr) && !fs.existsSync(path.join(outDir("nocave"), "MANIFEST.json"))); }
    const long = JSON.parse(JSON.stringify(FIXTURE)); long.fail_construct = true; long.long_message = true; writeFixture(long);
    const r11 = run(["discover", "--out", outDir("dead2")], { env: E });
    ok("a very long error text is cut (300 characters of it), so a page of HTML from a proxy does not flood the screen", r11.status === 1 && /ConnectionError/.test(r11.stderr) && !r11.stderr.includes("x".repeat(400)) && r11.stderr.length < 900);
    const dead = JSON.parse(JSON.stringify(FIXTURE)); dead.fail_construct = true; writeFixture(dead);
    const r10 = run(["discover", "--out", outDir("dead")], { env: E }); writeFixture(FIXTURE);
    ok("!! A SERVER THAT CANNOT BE REACHED (a proxy that blocks the host answers like this) IS A MESSAGE AND NOT A TRACEBACK: exit 1, the error's type and text, and what to check (the network, --server, the token), and no output folder with results", r10.status === 1 && /ConnectionError/.test(r10.stderr) && /Check the network/.test(r10.stderr) && !/Traceback/.test(r10.stderr) && !fs.existsSync(path.join(outDir("dead"), "discover.json")) && !r10.stderr.includes(TOKEN));
    [r1, r2, r3, r4, r5, r5b, r6, r7, r8, r10, r11].forEach((r) => watch(r));
}

sec("1b. token-help and save-token");
{
    const th = run(["token-help"], { env: E }); watch(th);
    ok("token-help asks the library for the instructions (without opening a browser) and then points at `save-token` and the CAVE_TOKEN variable -- it prints no token", th.status === 0 && th.log.some((c) => c.call === "get_new_token" && c.open === false) && /example\.invalid\/token/.test(th.stdout) && /save-token/.test(th.stdout) && /CAVE_TOKEN/.test(th.stdout));
    // getpass would open /dev/tty on a machine that has one and wait for a person: the prompt is replaced by a function that returns a known string, in a Python that imports the script as a module
    const harness = (reply) => ["-c", "import sys, getpass; sys.path.insert(0, " + JSON.stringify(path.join(ENG, "tools")) + "); getpass.getpass = lambda p='': " + JSON.stringify(reply) + "; import fishCaveExport as m; sys.exit(m.main(['save-token']))"];
    const logS = path.join(work, "log_save.jsonl"), envS = { ...process.env, PYTHONPATH: stubDir, FAKE_CAVE_FIXTURE: fixFile, FAKE_CAVE_LOG: logS, FAKE_CAVE_PANDAS: "0" };
    const sv = spawnSync(PY, harness("  " + TOKEN + "  "), { encoding: "utf8", env: envS }), svLog = fs.existsSync(logS) ? fs.readFileSync(logS, "utf8") : "";
    ok("!! save-token READS THE TOKEN FROM A HIDDEN PROMPT (never an argument), trims it, hands it to caveclient's save_token (the stand-in logs only its length, " + TOKEN.length + "), and PRINTS NOTHING OF IT", sv.status === 0 && new RegExp('"token_len": ' + TOKEN.length + "[,}]").test(svLog.replace(/"token_len":\s*/g, '"token_len": ')) && !sv.stdout.includes(TOKEN) && !sv.stderr.includes(TOKEN) && /Saved/.test(sv.stdout));
    watch(sv);
    const logE = path.join(work, "log_save2.jsonl"), sv2 = spawnSync(PY, harness("   "), { encoding: "utf8", env: { ...envS, FAKE_CAVE_LOG: logE } });
    ok("an empty token is refused (exit 2) and save_token is never called", sv2.status === 2 && /no token entered/.test(sv2.stderr) && !(fs.existsSync(logE) && /save_token/.test(fs.readFileSync(logE, "utf8"))));
}

sec("2. discover");
const D = outDir("disc"), rd1 = run(["discover", "--out", D], { env: E });
watch(rd1, D);
{
    const j = JSON.parse(rd(D, "discover.json")), ds = j.details.fish1_test, tabs = Object.fromEntries((ds.tables || []).map((t) => [t.table, t]));
    ok("!! discover lists the datastacks the account can reach and, for each, the materialization version, its timestamp, the datastack info and EVERY table with its row count, metadata, columns and at most five sample rows; the synapse table is flagged", rd1.status === 0 && j.datastacks.join() === "fish1_test,fish1_other" && Object.keys(j.details).sort().join() === "fish1_other,fish1_test" && ds.materializationVersion === 42 && /2026-09-15/.test(ds.timestamp) && ds.datastackInfo.synapse_table === "synapses"
        && Object.keys(tabs).join() === "synapses,soma,cell_types,big_table,notes" && tabs.notes.count === 7 && tabs.notes.sample.length === 5 && tabs.cell_types.count === 5 && tabs.cell_types.columns.join() === "id,pt_root_id,cell_type,status" && tabs.cell_types.sample.length === 5 && tabs.cell_types.sample[0].cell_type === "Mauthner cell, left" && tabs.big_table.sample.length === 1 && tabs.synapses.isSynapseTable === true && tabs.soma.isSynapseTable === false
        && tabs.soma.metadata.schema === "nucleus_detection");
    const t = csvRows(D, "tables.csv");
    ok("tables.csv has a row per table per datastack (10: five tables, two datastacks), with the count, schema and columns, and the synapse table marked", t.length === 10 && t.filter((r) => r.datastack === "fish1_test").length === 5 && t.find((r) => r.datastack === "fish1_test" && r.table === "big_table").count === "10000000" && t.find((r) => r.datastack === "fish1_test" && r.table === "synapses").synapse_table === "true");
    const ctor = rd1.log.filter((c) => c.call === "CAVEclient");
    ok("!! the clients are built over https at the default server with max_retries 3, the datastack client per datastack, and the token the ENVIRONMENT held (the stand-in logs only that one was present)", ctor.length === 3 && ctor[0].server_address === "https://global.brain-wire-test.org" && ctor[0].datastack_name === null && ctor.slice(1).map((c) => c.datastack_name).join() === "fish1_test,fish1_other" && ctor.every((c) => c.auth_token === "<present>" && c.max_retries === 3));
    const rdOne = run(["discover", "--datastack", "fish1_other", "--out", outDir("disc1")], { env: E }); watch(rdOne, outDir("disc1"));
    ok("--datastack limits discover to that datastack (one datastack client, one set of tables), and the manifest names the datastack asked for", rdOne.status === 0 && Object.keys(JSON.parse(rd(outDir("disc1"), "discover.json")).details).join() === "fish1_other" && JSON.parse(rd(outDir("disc1"), "MANIFEST.json")).datastack === "fish1_other");
    const noTok = run(["discover", "--out", outDir("disc2")], {}); watch(noTok, outDir("disc2"));
    ok("with NO token in the environment the client is built without one (caveclient then reads the token it saved), and the run still works", noTok.status === 0 && noTok.log.filter((c) => c.call === "CAVEclient").every((c) => c.auth_token === null));
}

sec("3. the search");
const X = outDir("exp"), rx = run(["export", "--datastack", "fish1_test", "--out", X, "--max-partners", "3"], { env: E });
watch(rx, X);
const cand = rx.status === 0 ? JSON.parse(rd(X, "mauthner_candidates.json")) : { matches: [], scanned: [], skipped: [], ids: [] };
{
    ok("!! export FINDS THE TWO CELLS by the default regexp, in both of its branches (\"Mauthner cell, left\" and \"M-cell right\"), reports each match with its table, column and value, and does NOT match \"somatic cell\", \"mitral cell\" or \"reticulospinal\"", rx.status === 0 && cand.ids.join() === "1001,1002" && cand.matches.length === 2 && cand.matches.every((m) => m.table === "cell_types" && m.column === "cell_type") && cand.matches.map((m) => m.value).join() === "Mauthner cell, left,M-cell right");
    const q = rx.log.filter((c) => c.call === "query_table").map((c) => c.table);
    ok("!! THE SYNAPSE TABLE AND A TABLE OVER --scan-max-rows ARE NOT DOWNLOADED TO BE SEARCHED: query_table was called for soma, cell_types and notes and for nothing else; the skipped list says why (the synapse table; 10000000 rows over the limit)", q.join() === "soma,cell_types,notes" && cand.skipped.some((s) => s.table === "synapses" && /synapse table/.test(s.why)) && cand.skipped.some((s) => s.table === "big_table" && /10000000/.test(s.why)) && cand.scanned.map((s) => s.table).join() === "soma,cell_types,notes");
    const calls = rx.log.filter((c) => ["query_table", "synapse_query", "get_tables", "get_annotation_count"].includes(c.call));
    ok("!! one materialization version reaches EVERY query: the most recent one (42), asked once, in the table list, the counts, the table queries and the synapse queries (root ids change with proofreading)", rx.log.filter((c) => c.call === "most_recent_version").length === 1 && calls.length > 8 && calls.every((c) => c.version === 42) && JSON.parse(rd(X, "MANIFEST.json")).materializationVersion === 42);
    const scanq = rx.log.filter((c) => c.call === "query_table");
    ok("the table queries ask for scalar positions (split_positions) and the scan limit, and no metadata dictionary", scanq.every((c) => c.split_positions === true && c.limit === 300000 && c.metadata === false));
}

sec("4. the synapses");
{
    const out = csvRows(X, "synapses_out.csv"), inn = csvRows(X, "synapses_in.csv");
    const pair = (rs, a, b) => rs.filter((r) => r.pre_pt_root_id === String(a) && r.post_pt_root_id === String(b)).length;
    ok("!! synapses_out.csv holds the 8 synapses out of the cells and synapses_in.csv the 9 into them (the one from cell 1001 onto cell 1002 is in both) -- the autapse (1001 -> 1001) and the two synapses onto root id 0 are NOT there, because the query asks the server to leave them out -- with every column the server returned (id, the pre and post root ids, size, the split position)", out.length === 8 && inn.length === 9 && pair(out, 1001, 1002) === 1 && pair(inn, 1001, 1002) === 1 && pair(out, 1001, 2001) === 3 && pair(out, 1001, 2002) === 1 && pair(out, 1002, 2001) === 2 && pair(out, 1002, 2003) === 1 && pair(inn, 2004, 1001) === 4 && pair(inn, 2001, 1001) === 1 && pair(inn, 2004, 1002) === 2 && pair(inn, 2005, 1002) === 1 && !out.some((r) => r.post_pt_root_id === "0" || r.pre_pt_root_id === r.post_pt_root_id)
        && Object.keys(out[0]).join() === "id,pre_pt_root_id,post_pt_root_id,size,ctr_pt_position_x,ctr_pt_position_y,ctr_pt_position_z,pre_pt_position_x,pre_pt_position_y,pre_pt_position_z,post_pt_position_x,post_pt_position_y,post_pt_position_z");
    const sq = rx.log.filter((c) => c.call === "synapse_query");
    ok("!! the synapse queries are the three the design says, in order, with the flags it says: pre_ids = the cells; post_ids = the cells; pre_ids = post_ids = the cells and their top partners (remove_autapses, include_zeros false, split_positions, no metadata, the --max-rows limit)", sq.length === 3 && sq[0].pre_ids.join() === "1001,1002" && sq[0].post_ids === null && sq[1].post_ids.join() === "1001,1002" && sq[1].pre_ids === null && sq[2].pre_ids.join() === sq[2].post_ids.join() && sq.every((c) => c.remove_autapses === true && c.include_zeros === false && c.split_positions === true && c.metadata === false && c.limit === 5000000));
    const part = csvRows(X, "partners.csv");
    ok("!! partners.csv ranks the partners of the cells by their synapses with the cells (in + out), TIES BY THE SMALLER ID, and keeps --max-partners (3): 2001 (6: 5 out of the cells, 1 into them... worked out by hand: 3 + 2 from the cells and 1 to them), 2004 (6), then 2002 (1) -- the cells themselves are never partners", part.map((p) => p.partner_root_id).join() === "2001,2004,2002" && part[0].synapses_from_cells === "1" && part[0].synapses_to_cells === "5" && part[0].total === "6" && part[1].synapses_from_cells === "6" && part[1].synapses_to_cells === "0" && part[2].total === "1");
    ok("the circuit query asks for exactly the cells and their top partners: 1001, 1002, 2001, 2002, 2004", sq[2].pre_ids.join() === "1001,1002,2001,2002,2004");
    const circ = csvRows(X, "synapses_circuit.csv");
    ok("!! synapses_circuit.csv holds only the synapses AMONG those five neurons (17: 7 out of the cells, 7 into them, 3 among the partners) -- once each, the one from cell 1001 onto cell 1002 included: not 1002 -> 2003, not 2005 -> 1002, not 3001 -> 2001", circ.length === 17 && circ.filter((r) => r.pre_pt_root_id === "1001" && r.post_pt_root_id === "1002").length === 1 && !circ.some((r) => ["2003", "2005", "3001"].some((x) => r.pre_pt_root_id === x || r.post_pt_root_id === x)) && circ.every((r) => ["1001", "1002", "2001", "2002", "2004"].includes(r.pre_pt_root_id) && ["1001", "1002", "2001", "2002", "2004"].includes(r.post_pt_root_id)));
    const edges = csvRows(X, "edges.csv"), ed = (a, b) => edges.find((r) => r.pre_root_id === String(a) && r.post_root_id === String(b));
    ok("!! edges.csv has one row per pre -> post pair of the circuit with the synapse count and the summed size, worked out by hand: 1001>2001 3 / 600, 1001>2002 1 / 50, 1002>2001 2 / 30, 2004>1001 4 / 40, 2001>1001 1 / 7, 2004>1002 2 / 20, 2001>2002 2 / 8, 2004>2001 1 / 9 -- nine pairs, sorted -- 1001>1002 1 / 33, the cell-onto-cell synapse, ONCE", edges.length === 9 && ed(1001, 1002) && ed(1001, 1002).synapses === "1" && ed(1001, 1002).total_size === "33" && [[1001, 2001, 3, 600], [1001, 2002, 1, 50], [1002, 2001, 2, 30], [2004, 1001, 4, 40], [2001, 1001, 1, 7], [2004, 1002, 2, 20], [2001, 2002, 2, 8], [2004, 2001, 1, 9]].every(([a, b, n, s]) => ed(a, b) && ed(a, b).synapses === String(n) && ed(a, b).total_size === String(s)));
    const lab = csvRows(X, "labels.csv");
    ok("labels.csv has the rows of every table that names a neuron IN the circuit (1001, 1002, 2001, 2002, 2004: the cell-type rows, the soma rows, 2004's note), each with its table and its text columns as JSON, and none of a neuron outside it (2003, 2005, 9999)", lab.some((r) => r.root_id === "1001" && r.table === "cell_types" && /Mauthner cell, left/.test(r.text_columns.replace(/""/g, '"'))) && lab.some((r) => r.root_id === "1002" && r.table === "cell_types") && lab.some((r) => r.root_id === "2001" && r.table === "cell_types") && lab.some((r) => r.root_id === "2004" && r.table === "notes") && !lab.some((r) => ["2003", "2005", "9999"].includes(r.root_id)));
}

sec("5. the options");
{
    const H = outDir("hops1"), r1 = run(["export", "--datastack", "fish1_test", "--out", H, "--hops", "1", "--max-partners", "3"], { env: E }); watch(r1, H);
    ok("!! --hops 1 writes NO circuit file and makes two synapse queries; its edges.csv holds only the 9 pairs between the cells and their partners (the cell-onto-cell synapse, which is in both queries, counted once) (no 2001 > 2002, no 2004 > 2001)", r1.status === 0 && !fs.existsSync(path.join(H, "synapses_circuit.csv")) && r1.log.filter((c) => c.call === "synapse_query").length === 2 && csvRows(H, "edges.csv").length === 9 && csvRows(H, "edges.csv").find((r) => r.pre_root_id === "1001" && r.post_root_id === "1002").synapses === "1" && !csvRows(H, "edges.csv").some((r) => r.pre_root_id === "2001" && r.post_root_id === "2002"));
    const R = outDir("rootids"), r2 = run(["export", "--datastack", "fish1_test", "--out", R, "--root-ids", "1002", "--max-partners", "2"], { env: E }); watch(r2, R);
    const c2 = JSON.parse(rd(R, "mauthner_candidates.json"));
    const lq = r2.log.filter((c) => c.call === "query_table");
    ok("!! --root-ids SKIPS THE SEARCH: the candidates file says the ids were given and no table is searched -- the only query_table calls are the LABEL LOOKUP, one per table that is neither the synapse table nor over --scan-max-rows (soma, cell_types, notes), each filtered to the circuit's neurons (1002 and its two strongest partners 2001 and 2004) -- and the export runs for that one cell (the synapse queries name 1002 alone)", r2.status === 0 && lq.map((c) => c.table).join() === "soma,cell_types,notes" && lq.every((c) => c.filter_in_dict && c.filter_in_dict.pt_root_id.join() === "1002,2001,2004") && /no search was made/.test(c2.note) && c2.ids.join() === "1002" && r2.log.find((c) => c.call === "synapse_query").pre_ids.join() === "1002" && JSON.parse(rd(R, "MANIFEST.json")).cells.join() === "1002");
    const RI = outDir("rootids2"), rri = run(["export", "--datastack", "fish1_test", "--out", RI, "--root-ids", "1002, 1001,1002,", "--hops", "1"], { env: E }); watch(rri, RI);
    ok("!! --root-ids takes SEVERAL ids, in any order, with spaces and a trailing comma, each once: the manifest's cells are 1001, 1002 and the first synapse query names both", rri.status === 0 && JSON.parse(rd(RI, "MANIFEST.json")).cells.join() === "1001,1002" && rri.log.find((c) => c.call === "synapse_query").pre_ids.join() === "1001,1002");
    const T = outDir("trunc"), r3 = run(["export", "--datastack", "fish1_test", "--out", T, "--root-ids", "1001,1002", "--max-rows", "5"], { env: E }); watch(r3, T);
    const m3 = JSON.parse(rd(T, "MANIFEST.json"));
    ok("!! A QUERY THAT HIT --max-rows IS FLAGGED TRUNCATED: with a limit of 5 the warnings (and the manifest's `truncated`) name the queries that returned 5, the limit is the one the stand-in saw, and the run still finishes", r3.status === 0 && m3.warnings.length >= 2 && m3.warnings.every((w) => /^TRUNCATED:/.test(w)) && m3.truncated.length >= 2 && r3.log.filter((c) => c.call === "synapse_query").every((c) => c.limit === 5) && /WARNING: TRUNCATED/.test(r3.stdout));
    const V = outDir("ver"), r4 = run(["export", "--datastack", "fish1_test", "--out", V, "--root-ids", "1001", "--version", "7"], { env: E }); watch(r4, V);
    ok("--version N is the version of EVERY query (none asks for the most recent one), and the manifest records it", r4.status === 0 && r4.log.filter((c) => c.call === "most_recent_version").length === 0 && r4.log.filter((c) => c.call === "synapse_query").every((c) => c.version === 7) && JSON.parse(rd(V, "MANIFEST.json")).materializationVersion === 7);
    const S2 = outDir("tabs"), r5 = run(["export", "--datastack", "fish1_test", "--out", S2, "--tables", "soma,notes"], { env: E }); watch(r5, S2);
    ok("!! --tables searches only those tables, and with the cells in none of them there is NO MATCH: exit 2 with the reason, mauthner_candidates.json and a manifest that says 'no cells' are written, and NO synapse query is made", r5.status === 2 && /no cell matched/.test(r5.stderr) && r5.log.filter((c) => c.call === "synapse_query").length === 0 && r5.log.filter((c) => c.call === "query_table").map((c) => c.table).join() === "soma,notes" && JSON.parse(rd(S2, "MANIFEST.json")).result === "no cells" && fs.existsSync(path.join(S2, "mauthner_candidates.json")));
    const M = outDir("match"), r6 = run(["export", "--datastack", "fish1_test", "--out", M, "--match", "reticulo"], { env: E }); watch(r6, M);
    ok("--match replaces the pattern (case-insensitively): \"reticulo\" finds neuron 2001 in the cell-type table and not the Mauthner cells", r6.status === 0 && JSON.parse(rd(M, "mauthner_candidates.json")).ids.join() === "2001");
    const N = outDir("scanmax"), r7 = run(["export", "--datastack", "fish1_test", "--out", N, "--scan-max-rows", "3"], { env: E }); watch(r7, N);
    ok("--scan-max-rows is respected: with 3, cell_types (5 rows) is not downloaded, so nothing is found, and the skipped list says why", r7.status === 2 && JSON.parse(rd(N, "mauthner_candidates.json")).skipped.some((s) => s.table === "cell_types" && /over --scan-max-rows 3/.test(s.why)) && !r7.log.some((c) => c.call === "query_table" && c.table === "cell_types"));
}

{
    const B = outDir("bound"), rb = run(["export", "--datastack", "fish1_test", "--out", B, "--scan-max-rows", "5"], { env: E }); watch(rb, B);
    ok("!! --scan-max-rows is a LIMIT ON THE COUNT, not below it: a table with exactly that many rows (cell_types, 5) IS searched with --scan-max-rows 5, a table with more (notes, 7) is not", rb.status === 0 && JSON.parse(rd(B, "mauthner_candidates.json")).ids.join() === "1001,1002" && JSON.parse(rd(B, "mauthner_candidates.json")).skipped.some((s) => s.table === "notes"));
    const Z = outDir("zeros"), zf = JSON.parse(JSON.stringify(FIXTURE)); zf.leak_zero = true; writeFixture(zf);
    const rz = run(["export", "--datastack", "fish1_test", "--out", Z, "--max-partners", "3"], { env: E }); writeFixture(FIXTURE); watch(rz, Z);
    const zq = rz.log.filter((c) => c.call === "synapse_query"), zout = csvRows(Z, "synapses_out.csv");
    ok("!! A ZERO ROOT ID FROM THE SERVER (an unproofread partner) IS NEVER A PARTNER OR A MEMBER: with a server that returns the two synapses onto root id 0 anyway (they ARE in synapses_out.csv, as returned), partners.csv, the circuit query and the manifest's circuit hold no 0", rz.status === 0 && zout.some((r) => r.post_pt_root_id === "0") && !csvRows(Z, "partners.csv").some((r) => r.partner_root_id === "0") && zq[2].pre_ids.every((x) => x !== 0) && !JSON.parse(rd(Z, "MANIFEST.json")).circuitNeurons.includes(0));
    const NN = outDir("nan"), nf = JSON.parse(JSON.stringify(FIXTURE)); nf.nan_size = true; writeFixture(nf);
    const rn = run(["export", "--datastack", "fish1_test", "--out", NN, "--max-partners", "3"], { env: E }); writeFixture(FIXTURE); watch(rn, NN);
    ok("!! A NaN IN A COLUMN (a size the server did not fill in) IS WRITTEN AS AN EMPTY CELL, never as the text 'nan', and the export finishes (the edge's summed size skips it)", rn.status === 0 && csvRows(NN, "synapses_out.csv")[0].size === "" && !/\bnan\b/i.test(rd(NN, "synapses_out.csv") + rd(NN, "edges.csv")) && csvRows(NN, "edges.csv").length === 9);
    const SL = outDir("slash"), rs = run(["discover", "--server", "https://global.brain-wire-test.org/", "--out", SL], { env: E }); watch(rs, SL);
    ok("a trailing slash on --server is dropped before the client is built", rs.status === 0 && rs.log.filter((c) => c.call === "CAVEclient").every((c) => c.server_address === "https://global.brain-wire-test.org"));
    const BL = outDir("blank"), rbk = run(["discover", "--out", BL], { env: { CAVE_TOKEN: "   " } }); watch(rbk, BL);
    ok("a CAVE_TOKEN that is only spaces is no token (the client is built without one and caveclient reads its saved file)", rbk.status === 0 && rbk.log.filter((c) => c.call === "CAVEclient").every((c) => c.auth_token === null));
}

sec("6. the manifest, and a token that must never be in the folder");
{
    const m = JSON.parse(rd(X, "MANIFEST.json")), names = fs.readdirSync(X).filter((f) => f !== "MANIFEST.json").sort();
    ok("!! MANIFEST.json lists EVERY file of the folder (and not itself) with its byte count and a sha256 that is recomputed here and matches; the materialization version and timestamp, the datastack, the server, the caveclient version, every option, the cells, the circuit's neurons and the citation are in it", m.files.map((f) => f.name).sort().join() === names.join() && m.files.every((f) => f.bytes === fs.statSync(path.join(X, f.name)).size && f.sha256 === sha(path.join(X, f.name))) && m.materializationVersion === 42 && /2026-09-15/.test(m.timestamp) && m.datastack === "fish1_test" && m.server === "https://global.brain-wire-test.org" && m.caveclient === "0.0-standin" && m.options.hops === 2 && m.options.maxPartners === 3 && m.cells.join() === "1001,1002" && m.circuitNeurons.join() === "1001,1002,2001,2002,2004" && /Petkova/.test(m.citation) && m.tool === "fishCaveExport");
    const tri = JSON.parse(JSON.stringify(FIXTURE)); tri.tables.cell_types.rows[2].cell_type = "reticulospinal " + TOKEN; writeFixture(tri);
    const L = outDir("leak"), rl = run(["export", "--datastack", "fish1_test", "--out", L, "--max-partners", "2"], { env: E });
    writeFixture(FIXTURE);
    ok("!! A TOKEN THAT REACHED A FILE STOPS THE SCRIPT: with the environment token planted in a text column of a cell-type table (a label that lands in labels.csv), the last step -- a scan of the folder for the token -- refuses, exit 2, and names the file", rl.status === 2 && /token appears in/.test(rl.stderr) && /labels\.csv|mauthner_candidates\.json|MANIFEST/.test(rl.stderr));
    // the leak run's own folder has the token by design; it is the one folder not watched
}

sec("7. no token anywhere");
{
    const joined = leaks.join("\n");
    ok("!! THE ENVIRONMENT TOKEN APPEARS IN NO FILE THE SCRIPT WROTE and in NONE OF ITS STDOUT OR STDERR, across every run above (" + leaks.length + " outputs checked), and the refusal messages do not echo the token they refused", joined.length > 5000 && !joined.includes(TOKEN) && !joined.includes("abc\n") );
}

sec("8. the real library");
{
    const st = run(["selftest-signatures"], {});
    ok("!! `selftest-signatures` FAILS (exit 1, a FAIL line a probe) against a library that lacks what the script calls: the stand-in has no materializationengine, infoservice or auth modules (14 of the 16 probes FAIL; the two constructor probes bind to the stand-in's own), and the report says so instead of passing", st.status === 1 && (st.stdout.match(/^FAIL /gm) || []).length === 14 && (st.stdout.match(/^ok /gm) || []).length === 2);
    if (!hasMod(REAL, "caveclient")) note("NOT CHECKED HERE: no Python with caveclient installed (set FISH_CAVE_PYTHON to one). `selftest-signatures` binds every keyword the script passes to the installed library's signatures; it was run once by hand against caveclient 8.2.1, 16 of 16 ok (13 of 13 before the label lookup's filter_in_dict probe, 14 of 14 before the giants pager and sampler), and is recorded in this file's header.");
    else {
        const r = spawnSync(REAL, [SCRIPT, "selftest-signatures"], { encoding: "utf8", env: { ...process.env, PYTHONPATH: "" } });
        ok("!! `selftest-signatures` BINDS EVERY KEYWORD THE SCRIPT PASSES TO THE INSTALLED caveclient'S SIGNATURES (the client constructor, synapse_query, query_table with and without filter_in_dict and paged or sampled with select_columns, get_tables, get_table_metadata, get_annotation_count, most_recent_version, get_timestamp, get_datastacks, get_datastack_info, get_new_token, save_token): the only contact this gate has with the real library", r.status === 0 && (r.stdout.match(/^ok /gm) || []).length === 16 && !/FAIL/.test(r.stdout), r.stdout.trim().split("\n").length + " probes");
    }
}

sec("9. real pandas DataFrames");
{
    if (!hasMod(REAL, "pandas")) note("NOT CHECKED HERE: no Python with pandas (set FISH_CAVE_PYTHON to the one that has caveclient).");
    else {
        const P = outDir("pandas"), rp = run(["export", "--datastack", "fish1_test", "--out", P, "--max-partners", "3"], { env: E, py: REAL, pandas: true }); watch(rp, P);
        const same = ["synapses_out.csv", "synapses_in.csv", "edges.csv", "partners.csv", "synapses_circuit.csv"].every((f) => rd(P, f) === rd(X, f));
        ok("!! WITH REAL pandas DataFrames (numpy integers, the column dtypes the real library returns) the export writes the SAME CSV files to the byte as with the plain stand-in: no `np.int64(...)`, no `1.0` for an id, no NaN text", rp.status === 0 && same);
    }
}

sec("10. the labels and the summary (the cells GIVEN with --root-ids, as the first real export was)");
{
    writeFixture(FIXTURE);
    const L = outDir("labels"), rl = run(["export", "--datastack", "fish1_test", "--out", L, "--root-ids", "1001,1002"], { env: E }); watch(rl, L);
    const lq = rl.log.filter((c) => c.call === "query_table"), lab = csvRows(L, "labels.csv"), man = JSON.parse(rd(L, "MANIFEST.json")), sum = JSON.parse(rd(L, "cells_summary.json"));
    ok("!! THE LABEL LOOKUP ASKS THE SERVER FOR THE CIRCUIT'S NEURONS AND NOTHING MORE: three filtered queries (soma, cell_types, notes), each with pt_root_id in exactly the seven neurons (the cells 1001, 1002 and their five partners, sorted), none for the synapse table and none for the table of ten million rows; the report says what was looked at and what was skipped and why",
        rl.status === 0 && lq.map((c) => c.table).join() === "soma,cell_types,notes" && lq.every((c) => c.filter_in_dict.pt_root_id.join() === "1001,1002,2001,2002,2003,2004,2005" && c.limit === 300000 && c.split_positions === true && c.version === 42)
        && sum.labelLookup.looked.map((x) => x.table).join() === "soma,cell_types,notes" && sum.labelLookup.skipped.some((x) => x.table === "synapses" && /synapse table/.test(x.why)) && sum.labelLookup.skipped.some((x) => x.table === "big_table" && /over --scan-max-rows/.test(x.why)));
    const rowOf = (id, t) => lab.find((r) => r.root_id === String(id) && r.table === t);
    ok("!! labels.csv IS NOT EMPTY WHEN THE CELLS ARE GIVEN (the first real export's was): 11 rows -- 4 soma rows, 5 cell-type rows, 2 notes (2004's and 2005's) -- each with its table, its text columns as JSON and the WHOLE ROW as JSON (the ids and the positions, as text), and none for a neuron outside the circuit (2006, 9999)",
        lab.length === 11 && lab.filter((r) => r.table === "soma").length === 4 && lab.filter((r) => r.table === "cell_types").length === 5 && lab.filter((r) => r.table === "notes").length === 2 && !lab.some((r) => ["2006", "9999"].includes(r.root_id))
        && JSON.parse(rowOf(1001, "cell_types").row_json).cell_type === "Mauthner cell, left" && JSON.parse(rowOf(1001, "cell_types").row_json).pt_root_id === "1001" && /Mauthner cell, left/.test(rowOf(1001, "cell_types").text_columns.replace(/""/g, '"')) && Object.keys(lab[0]).join() === "root_id,table,text_columns,row_json");
    const c1 = sum.cells.find((c) => c.rootId === 1001), c2 = sum.cells.find((c) => c.rootId === 1002);
    ok("!! cells_summary.json COUNTS WHAT EACH CELL HAS, worked out by hand from the fixture: cell 1001 sends 5 synapses (to 2001 x3, 2002, 1002) to 3 partners and receives 5 (from 2004 x4, 2001) from 2 partners; cell 1002 sends 3 to 2 partners and receives 4 from 3 partners (the one from 1001 counted for both); the autapse and the root-id-0 synapses are not there; each cell is named in cell_types and soma",
        sum.cells.length === 2 && c1.synapsesOut === 5 && c1.synapsesIn === 5 && c1.partnersOut === 3 && c1.partnersIn === 2 && c2.synapsesOut === 3 && c2.synapsesIn === 4 && c2.partnersOut === 2 && c2.partnersIn === 3 && !c1.noSynapses && !c2.noSynapses
        && c1.labelRows.map((x) => x.table).sort().join() === "cell_types,soma" && c2.labelRows.map((x) => x.table).sort().join() === "cell_types,soma" && sum.datastack === "fish1_test" && sum.materializationVersion === 42 && sum.synapseTable === "synapses");
    const bx = c1.synapseBox, near = (a, b) => Math.abs(a - b) < 1e-9;
    ok("!! THE BOX THE SYNAPSES SIT IN is worked out by hand for cell 1001: ten positions (its five outgoing synapses at the PRE position, its five incoming at the POST position), x 1000..5055, y 2000..6011, z 300..777, centre (3025.4, 4010.3, 540.2), extent 4055 x 4011 x 477 voxels, which at the table's 8 x 8 x 30 nm voxels is 32.44 x 32.09 x 14.31 micrometres",
        bx && bx.points === 10 && bx.min.join() === "1000,2000,300" && bx.max.join() === "5055,6011,777" && near(bx.centroid[0], 3025.4) && near(bx.centroid[1], 4010.3) && near(bx.centroid[2], 540.2) && bx.extentVoxels.join() === "4055,4011,477" && bx.voxelNm.join() === "8,8,30" && bx.extentMicrometres.join() === "32.44,32.09,14.31" && sum.synapseVoxelNm.join() === "8,8,30");
    const GH = outDir("ghost"), rg = run(["export", "--datastack", "fish1_test", "--out", GH, "--root-ids", "1001,4242"], { env: E }); watch(rg, GH);
    const sg = JSON.parse(rd(GH, "cells_summary.json")), mg = JSON.parse(rd(GH, "MANIFEST.json")), g = sg.cells.find((c) => c.rootId === 4242);
    ok("!! A CELL WITH NO SYNAPSE AT ALL IS SAID TO BE, not left as a zero among the others: a root id that is in no synapse (4242, as a stale id from the live viewer would be) is flagged noSynapses in the summary with an empty box and no label, the console line ends 'NO SYNAPSES AT ALL at this version', and the manifest carries a warning naming it and the way out (--version); the other cell is exported as before (exit 0)",
        rg.status === 0 && g && g.noSynapses === true && g.synapsesOut === 0 && g.synapsesIn === 0 && g.synapseBox === null && g.labelRows.length === 0 && /cell 4242: 0 synapses out, 0 in .*NO SYNAPSES AT ALL at this version/.test(rg.stdout) && mg.warnings.some((w) => /cell 4242 has no synapse in or out at version 42/.test(w) && /--version/.test(w)) && sg.cells.find((c) => c.rootId === 1001).noSynapses === false);
    ok("the console says what each cell has, one line each, so the person at the keyboard can judge it before uploading: 'cell 1001: 5 synapses out, 5 in (3 / 2 partners); named in: cell_types, soma'", /cell 1001: 5 synapses out, 5 in \(3 \/ 2 partners\); named in: cell_types, soma/.test(rl.stdout) && /cell 1002: 3 synapses out, 4 in \(2 \/ 3 partners\); named in: cell_types, soma/.test(rl.stdout));
    const ZS = outDir("zerosize"), zf = JSON.parse(JSON.stringify(FIXTURE)); zf.zero_size = true; writeFixture(zf);
    const rz = run(["export", "--datastack", "fish1_test", "--out", ZS, "--root-ids", "1001,1002"], { env: E }); watch(rz, ZS); writeFixture(FIXTURE);
    const ez = csvRows(ZS, "edges.csv"), mz = JSON.parse(rd(ZS, "MANIFEST.json"));
    ok("!! A SIZE COLUMN THAT IS ZERO IN EVERY ROW IS SAID TO BE, not summed into a column of zeros (the real stack's synapses_axde is exactly that): edges.csv leaves total_size BLANK, the manifest and the console carry a warning that names the column and where the sizes are, and the counts are unchanged (11 pairs among the seven neurons, 1001>2001 3)",
        rz.status === 0 && ez.length === 11 && ez.every((r) => r.total_size === "") && ez.find((r) => r.pre_root_id === "1001" && r.post_root_id === "2001").synapses === "3" && mz.warnings.some((w) => /size column is 0 in every row/.test(w) && /synapses_axon_to_dendrite_size/.test(w)) && /WARNING: the synapse table's size column is 0/.test(rz.stdout));
    ok("and a size that is NOT zero is summed as before (the ordinary fixture: 1001>2001 600) with no size warning", csvRows(L, "edges.csv").find((r) => r.pre_root_id === "1001" && r.post_root_id === "2001").total_size === "600" && !man.warnings.some((w) => /size column/.test(w)));
    ok("!! A SEARCH THAT FOUND THE CELLS DOES NOT LOOK THEM UP AGAIN: the default export (the regexp search) makes exactly the three scan queries (soma, cell_types, notes) and no filtered one, and still writes labels.csv with its row_json and a cells_summary.json for the two cells it found",
        rx.log.filter((c) => c.call === "query_table").length === 3 && rx.log.filter((c) => c.call === "query_table").every((c) => !c.filter_in_dict) && fs.existsSync(path.join(X, "cells_summary.json")) && JSON.parse(rd(X, "cells_summary.json")).cells.map((c) => c.rootId).join() === "1001,1002" && Object.keys(csvRows(X, "labels.csv")[0]).join() === "root_id,table,text_columns,row_json" && JSON.parse(rd(X, "cells_summary.json")).labelLookup === null);
}

sec("11. the big-neuron finder (giants): a fixture with a mirror pair, a fragment, a lone giant and a small pair");
{
    // CELLS, in micrometres (front-back x 20..576, left-right y 10..190, top-bottom z 10..79); the midline is y = 100 (19 cells below it, 20 at or above, the first of the upper 20 AT 100: the median of 39)
    const cells = [[1101, 400, 140, 51, 30], [1102, 402, 60, 51, 28], [1104, 300, 150, 39, 33], [1105, 100, 130, 21, 5], [1106, 101, 70, 21, 4], [1108, 401, 190, 50, 29], [1110, 200, 160, 60, 40], [1111, 201, 40, 61, 8], [1109, 300, 50, 79, 20]];
    // 1108: a decoy above the midline, 90 um from it, in line with 1102 front-back and top-bottom but NOT its mirror (1102 is 40 um from it). 1110 and 1111: a mirror pair with 40 and 8 inputs (big cell, small partner: it ranks by the SMALLER one). 1109: in line with the lone giant 1104 and 50 um from the midline like it, but 40 um LOWER: not its mirror
    for (let k = 0; k < 15; k++) cells.push([2001 + k, 520 + 4 * k, 100 + 6 * k, 10 + 5 * k, 2]);   // the high side (2001 sits on the midline)
    for (let k = 0; k < 15; k++) cells.push([2101 + k, 20 + 2 * k, 10 + 5 * k, 15 + 4 * k, 2]);       // the low side
    const somaRows = cells.map(([root, x, y, z], i) => ({ id: 500 + i, pt_root_id: root, cell_type: i % 3 === 0 ? "exc" : i % 3 === 1 ? "inh" : "na", pt_position_x: x * 1000 / 8, pt_position_y: y * 1000 / 8, pt_position_z: z * 1000 / 30 }));
    const G = []; let frag = 900000;
    for (const [root, , , , d] of cells) for (let k = 0; k < d; k++) G.push([frag++, root, 1]);
    for (let k = 0; k < 35; k++) G.push([frag++, 1103, 1]);          // a fragment with the most inputs of all: no soma, so never a cell
    for (let k = 0; k < 3; k++) G.push([1101, 990001, 1]);           // 1101 sends three synapses to another fragment
    G.push([1101, 1101, 1]); G.push([1101, 0, 1]); G.push([0, 1104, 1]);   // an autapse and two root-id-0 synapses: never counted
    const GFIX = { datastacks: ["fish1_giants"], version: 77, timestamp: "2026-10-01T00:00:00+00:00", query_synapses: true,
        datastack_info: { synapse_table: "synapses", viewer_resolution_x: 16, viewer_resolution_y: 16, viewer_resolution_z: 30 },
        tables: { synapses: { count: G.length, schema: "synapse", rows: [], voxel_resolution: [16, 16, 30] }, somas: { count: somaRows.length, schema: "cell_type_local", rows: somaRows, voxel_resolution: [8, 8, 30] } }, synapses: G };
    const total = G.length, topRoots = [1110, 1104, 1101, 1108, 1102, 1109, 1111, 1105, 1106, 2001, 2002, 2003];
    const gArgs = (out, extra = []) => ["giants", "--datastack", "fish1_giants", "--out", out, "--chunk-rows", "80", "--top", "12", ...extra];
    writeFixture(GFIX);
    const A = outDir("giants"), ra = run(gArgs(A), { env: E }); watch(ra, A);
    const top = csvRows(A, "giants_top.csv"), prs = csvRows(A, "giants_pairs.csv"), map = JSON.parse(rd(A, "soma_map.json")), man = JSON.parse(rd(A, "MANIFEST.json"));
    const tq = ra.log.filter((c) => c.call === "query_table"), pages = tq.filter((c) => c.table === "synapses"), sq = ra.log.filter((c) => c.call === "synapse_query");
    ok("!! THE PASS READS ONLY WHAT IT COUNTS, A PAGE AT A TIME: the soma table once, whole (the scan limit, split positions, no column selection); the synapse table in pages of 80 with ONLY the pre and post root-id columns, offsets 0, 80, 160, 240 (the last page short, so the pass stops: " + total + " rows, 4 pages), no random sample, at the one version (77); then exactly two synapse queries for the twelve top cells (post_ids, then pre_ids, in rank order)",
        ra.status === 0 && tq.filter((c) => c.table === "somas").length === 1 && tq.find((c) => c.table === "somas").select_columns === null && tq.find((c) => c.table === "somas").limit === 300000 && tq.find((c) => c.table === "somas").split_positions === true
        && pages.length === 4 && pages.map((c) => c.offset).join() === "0,80,160,240" && pages.every((c) => c.limit === 80 && c.select_columns.join() === "pre_pt_root_id,post_pt_root_id" && c.random_sample === null && c.version === 77) && total > 240 && total <= 320
        && sq.length === 2 && sq[0].post_ids.join() === topRoots.join() && sq[0].pre_ids === null && sq[1].pre_ids.join() === topRoots.join() && sq[1].post_ids === null, `${total} rows`);
    ok("!! THE RANKING IS THE CELLS WITH A SOMA, BY SYNAPSES RECEIVED: 1110 (40), 1104 (33), 1101 (30), the decoy 1108 (29), 1102 (28), 1109 (20), 1111 (8), 1105 (5), 1106 (4), then the smallest ids among the cells with 2 (2001, 2002, 2003) -- the fragment 1103, which has 35 inputs and no soma, is not there; the autapse and the two root-id-0 synapses are in no count; 1101's three outgoing synapses make its out_degree 3",
        top.map((r) => r.root_id).join() === topRoots.join() && top.map((r) => r.in_degree).join() === "40,33,30,29,28,20,8,5,4,2,2,2" && !top.some((r) => r.root_id === "1103") && top.find((r) => r.root_id === "1101").out_degree === "3" && top.find((r) => r.root_id === "1104").out_degree === "0" && top.map((r) => r.rank).join() === "1,2,3,4,5,6,7,8,9,10,11,12" && Object.keys(top[0]).join() === "rank,root_id,soma_id,cell_type,soma_x_um,soma_y_um,soma_z_um,viewer_x,viewer_y,viewer_z,in_degree,out_degree,partners_in,extent_x_um,extent_y_um,extent_z_um,side_of_midline,mirror_partner");
    const r1102 = top.find((r) => r.root_id === "1102");
    ok("!! THE SOMA IS WHERE THE FIXTURE PUT IT, IN MICROMETRES FROM THE SOMA TABLE'S 8 x 8 x 30 nm VOXELS (not the synapse table's 16 x 16 x 30): 1102 at (402, 60, 51) um, its type from the table, the viewer position in the datastack's viewer voxels (16 x 16 x 30 nm: 25125, 3750, 1700), and the side of the midline",
        Math.abs(Number(r1102.soma_x_um) - 402) < 0.06 && Math.abs(Number(r1102.soma_y_um) - 60) < 0.06 && Math.abs(Number(r1102.soma_z_um) - 51) < 0.06 && r1102.viewer_x === "25125" && r1102.viewer_y === "3750" && r1102.viewer_z === "1700" && r1102.side_of_midline === "below-midline" && top.find((r) => r.root_id === "1101").side_of_midline === "above-midline" && ["exc", "inh", "na"].includes(r1102.cell_type));
    ok("!! THE AXES COME FROM THE SOMAS' SPREAD AND NOTHING ELSE: x is the longest (front-back), y the middle (left-right), z the shortest (top-bottom); the midline is the median of the somas along y, 100 um (the first of the upper twenty), said with where it came from; 39 cells with a soma, their types counted, the soma voxel size 8 x 8 x 30 nm",
        map.frontBack === "x" && map.leftRight === "y" && map.topBottom === "z" && map.midlineUm === 100 && /median of the somas/.test(map.midlineSource) && map.somas === 39 && map.cellTypes.exc + map.cellTypes.inh + map.cellTypes.na === 39 && map.somaVoxelNm.join() === "8,8,30");
    ok("!! THE PAIRS ARE THE MIRROR IMAGES, RANKED BY THE SMALLER CELL: (1101, 1102) first -- opposite sides of y = 100, 40 um from it each, 2 um apart front-back and top-bottom, 28 of 30 synapses (ratio 0.9333), mirror error 2 -- then (1110, 1111) (8 of 40: the biggest cell of all, but a pair is as big as its smaller cell) -- then (1105, 1106) (4 of 5, error 1); the lone giant 1104, the decoy 1108 (in line with 1102 but 90 um from the midline against its 40), 1109 (in line with 1104 and as far from the midline, but 40 um lower) and the cell on the midline (2001) are in no pair; and each cell's mirror_partner column says it",
        prs.length === 3 && prs[0].rootA === "1101" && prs[0].rootB === "1102" && prs[0].minIn === "28" && prs[0].maxIn === "30" && Math.abs(Number(prs[0].ratio) - 28 / 30) < 1e-9 && Math.abs(Number(prs[0].mirrorErrorUm) - 2) < 1e-9
        && prs[1].rootA === "1110" && prs[1].rootB === "1111" && prs[1].minIn === "8" && prs[1].maxIn === "40" && prs[2].rootA === "1105" && prs[2].rootB === "1106" && prs[2].minIn === "4" && Math.abs(Number(prs[2].mirrorErrorUm) - 1) < 1e-9
        && top.find((r) => r.root_id === "1101").mirror_partner === "1102" && top.find((r) => r.root_id === "1102").mirror_partner === "1101" && top.find((r) => r.root_id === "1111").mirror_partner === "1110" && ["1104", "1108", "1109", "2001"].every((id) => top.find((r) => r.root_id === id).mirror_partner === ""));
    ok("!! THE CONSOLE SAYS WHAT THE FILES SAY, so the person at the keyboard can judge before uploading: the top table with the biggest cell's line (rank 1, root 1110, 40 in, its soma and viewer position), the number of pairs and the biggest pair with its counts and mirror error, and the upload instruction naming the four files",
        /^  \s?1  root 1110  in    40  out    0  soma \(200, 160, 60\) um  viewer 12500 10000 2000  mirrors 1111$/m.test(ra.stdout) && /Mirror pairs \(3\), biggest first:/.test(ra.stdout) && /1101 and 1102: 28 and 30 synapses in, mirror error 2\.0 um/.test(ra.stdout) && /Upload giants_top\.csv, giants_pairs\.csv, soma_map\.json and MANIFEST\.json/.test(ra.stdout));
    const idx = (root) => G.map((x, i) => [x, i]).filter(([x]) => x[1] === root && x[0] !== 0 && x[0] !== root).map(([, i]) => i);   // the indices of the synapses INTO a cell
    const ii = idx(1102), d = ii[ii.length - 1] - ii[0];
    ok("!! THE EXACT PASS GIVES EACH TOP CELL'S EXTENT FROM ITS SYNAPSES' POSITIONS in the SYNAPSE table's voxels (16 x 16 x 30 nm): 1102's 28 inputs are rows " + ii[0] + ".." + ii[ii.length - 1] + " and the stand-in puts them at x 5000 + 5i, y 6000 + i, z 700 + 7i, so the box is 5d x d x 7d voxels, " + (5 * d * 16 / 1000).toFixed(2) + " x " + (d * 16 / 1000).toFixed(2) + " x " + (7 * d * 30 / 1000).toFixed(2) + " um",
        r1102.partners_in === "28" && Math.abs(Number(r1102.extent_x_um) - Math.round(5 * d * 16 / 10) / 100) < 0.011 && Math.abs(Number(r1102.extent_y_um) - Math.round(d * 16 / 10) / 100) < 0.011 && Math.abs(Number(r1102.extent_z_um) - Math.round(7 * d * 30 / 10) / 100) < 0.011, `d = ${d}`);
    ok("the manifest lists the files and what was read: giants_top.csv, giants_pairs.csv, soma_map.json, giants_counts.json, README.txt with their hashes (recomputed here); the whole table was read (" + total + " of " + total + " rows, 100%), the pass finished, and no partial counts file is left in the folder, and the counts file holds only cells that have a soma (no fragment)",
        ["giants_top.csv", "giants_pairs.csv", "soma_map.json", "giants_counts.json", "README.txt"].every((f) => man.files.some((e) => e.name === f && e.sha256 === sha(path.join(A, f)))) && man.rowsRead === total && man.tableRows === total && man.coveragePercent === 100 && man.finished === true && man.mode === "pages" && !fs.existsSync(path.join(A, "giants_counts.partial.json")) && man.warnings.length === 0 && JSON.parse(rd(A, "giants_counts.json")).counts.some(([r, i, o]) => r === 1104 && i === 33 && o === 0) && JSON.parse(rd(A, "giants_counts.json")).counts.every(([r]) => cells.some((c) => c[0] === r)));
    // the options
    const M60 = outDir("g_mid"), rm = run(gArgs(M60, ["--midline", "60"]), { env: E }); watch(rm, M60);
    const T1 = outDir("g_tol"), rt = run(gArgs(T1, ["--pair-tol", "1"]), { env: E }); watch(rt, T1);
    ok("!! --midline AND --pair-tol MOVE THE PAIRS: with the midline at 60 um (1102 is ON it, 1106 is above it) neither pair has two sides; with --pair-tol 1 the pair that mirrors to 2 um is dropped and the two that mirror to 1 um stay; the midline is then said to be the one given",
        csvRows(M60, "giants_pairs.csv").length === 0 && JSON.parse(rd(M60, "soma_map.json")).midlineUm === 60 && /--midline/.test(JSON.parse(rd(M60, "soma_map.json")).midlineSource) && csvRows(T1, "giants_pairs.csv").map((r) => r.rootA + "+" + r.rootB).join() === "1110+1111,1105+1106");
    const C = outDir("g_chunk"), rc = run(gArgs(C).map((x) => (x === "80" ? String(total) : x)), { env: E }); watch(rc, C);
    ok("!! THE END OF THE TABLE IS KNOWN FROM ITS ROW COUNT: with the page size equal to the " + total + " rows there is ONE page (no empty page after it) and giants_top.csv is byte for byte the 80-row run's; one page of a million rows gives it too",
        rc.log.filter((c) => c.call === "query_table" && c.table === "synapses").map((c) => c.offset).join() === "0" && rd(C, "giants_top.csv") === rd(A, "giants_top.csv") && (() => { const O = outDir("g_one"), ro = run(gArgs(O).map((x) => (x === "80" ? "1000000" : x)), { env: E }); watch(ro, O); return ro.log.filter((c) => c.call === "query_table" && c.table === "synapses").length === 1 && rd(O, "giants_top.csv") === rd(A, "giants_top.csv"); })());
    const CAPD = JSON.parse(JSON.stringify(GFIX)); CAPD.row_cap = 50; writeFixture(CAPD);
    const CP = outDir("g_capped"), rcp = run(gArgs(CP, ["--chunk-rows", "1000000"]), { env: E }); watch(rcp, CP);
    ok("!! A SERVER THAT CAPS THE ROWS OF A QUERY DOES NOT END THE PASS EARLY: with the cap at 50 rows and a page of a million, the pages come back short (50, 50, ...), the pass goes on from the row it reached (offsets 0, 50, 100, ... up to the table's " + total + " rows), says once that the server caps, and gives the uncapped run's answer to the byte",
        rcp.status === 0 && rcp.log.filter((c) => c.call === "query_table" && c.table === "synapses").map((c) => c.offset).join() === Array.from({ length: Math.ceil(total / 50) }, (_, i) => i * 50).join() && (rcp.stdout.match(/it caps a query/g) || []).length === 1 && rd(CP, "giants_top.csv") === rd(A, "giants_top.csv") && rd(CP, "giants_pairs.csv") === rd(A, "giants_pairs.csv") && JSON.parse(rd(CP, "MANIFEST.json")).finished === true);
    writeFixture(GFIX);
    // a pass that stops, and picks up again
    const P1 = outDir("g_part"), rp = run(gArgs(P1, ["--pages", "1"]), { env: E }); watch(rp, P1);
    const mp = JSON.parse(rd(P1, "MANIFEST.json")), partial = path.join(P1, "giants_counts.partial.json");
    ok("!! A PASS THAT WAS STOPPED SAYS SO AND LEAVES WHAT IT COUNTED: with --pages 1 the manifest and the console carry 'THE PASS DID NOT FINISH' with the rows read (80 of " + total + ") and the --resume line, the manifest says finished false and the coverage, and giants_counts.partial.json is in the folder with the offset 80",
        rp.status === 0 && mp.finished === false && mp.rowsRead === 80 && mp.warnings.some((w) => /THE PASS DID NOT FINISH: 80 of/.test(w) && /--resume/.test(w)) && /THE PASS DID NOT FINISH/.test(rp.stdout) && fs.existsSync(partial) && JSON.parse(fs.readFileSync(partial, "utf8")).offset === 80 && Math.abs(mp.coveragePercent - 100 * 80 / total) < 1e-9);
    const keep = path.join(work, "kept_partial.json"); fs.copyFileSync(partial, keep);
    const R = outDir("g_resume"), rr = run(gArgs(R, ["--resume", keep]), { env: E }); watch(rr, R);
    ok("!! --resume ADDS TO WHAT WAS COUNTED AND GIVES THE FULL RUN'S ANSWER: the pages it reads start at offset 80 (80, 160, 240), giants_top.csv and giants_pairs.csv are byte for byte the uninterrupted run's, and the manifest says it resumed and finished",
        rr.status === 0 && rr.log.filter((c) => c.call === "query_table" && c.table === "synapses").map((c) => c.offset).join() === "80,160,240" && rd(R, "giants_top.csv") === rd(A, "giants_top.csv") && rd(R, "giants_pairs.csv") === rd(A, "giants_pairs.csv") && JSON.parse(rd(R, "MANIFEST.json")).options.resume === true && JSON.parse(rd(R, "MANIFEST.json")).finished === true);
    const bad = JSON.parse(fs.readFileSync(keep, "utf8")); bad.version = 76; const badf = path.join(work, "bad_partial.json"); fs.writeFileSync(badf, JSON.stringify(bad));
    const bad2 = JSON.parse(fs.readFileSync(keep, "utf8")); bad2.datastack = "fish1_other"; const badf2 = path.join(work, "bad_partial2.json"); fs.writeFileSync(badf2, JSON.stringify(bad2)); const RB2 = outDir("g_resume_bad2"), rrb2 = run(gArgs(RB2, ["--resume", badf2]), { env: E });
    const RB = outDir("g_resume_bad"), rrb = run(gArgs(RB, ["--resume", badf]), { env: E }), RM = outDir("g_resume_missing"), rrm = run(gArgs(RM, ["--resume", path.join(work, "nope.json")]), { env: E });
    ok("!! A RESUME FILE FROM ANOTHER SNAPSHOT IS REFUSED (counts of version 76, or of another datastack, cannot be added to version 77's), and a file that is not there is refused by name: each exit 2, no synapse page read",
        rrb.status === 2 && /another snapshot|cannot be added to/.test(rrb.stderr) && /version 76/.test(rrb.stderr) && rrb2.status === 2 && /fish1_other/.test(rrb2.stderr) && rrm.status === 2 && /--resume could not read/.test(rrm.stderr) && rrb.log.filter((c) => c.call === "query_table" && c.table === "synapses").length === 0);
    const SM = outDir("g_sample"), rs = run(gArgs(SM, ["--sample", "100"]), { env: E }); watch(rs, SM);
    const ms = JSON.parse(rd(SM, "MANIFEST.json")), sp = rs.log.filter((c) => c.call === "query_table" && c.table === "synapses");
    ok("!! --sample N IS ONE RANDOM-SAMPLE QUERY AND NO PAGING: a single synapse-table query with random_sample 100 and no offset, the two root-id columns, the manifest says mode sample, and the exact pass for the top cells is still made (a sample of 100 rows counts fewer than twelve cells; those are ranked)",
        rs.status === 0 && sp.length === 1 && sp[0].random_sample === 100 && sp[0].offset === null && sp[0].select_columns.join() === "pre_pt_root_id,post_pt_root_id" && ms.mode === "sample" && ms.options.sample === 100 && rs.log.filter((c) => c.call === "synapse_query").length === 2 && csvRows(SM, "giants_top.csv").length >= 5 && csvRows(SM, "giants_top.csv").length <= 12 && Number(csvRows(SM, "giants_top.csv")[0].in_degree) >= 1, `${csvRows(SM, "giants_top.csv").length} cells ranked from the sample`);
    // refusals and warnings
    const r0 = run(["giants", "--out", outDir("g_nods")], { env: E }), r1 = run(["giants", "--datastack", "fish1_giants", "--top", "1", "--out", outDir("g_top1")], { env: E }), r2 = run(["giants", "--datastack", "fish1_giants", "--chunk-rows", "0", "--out", outDir("g_chunk0")], { env: E });
    const r3 = run(gArgs(outDir("g_limit"), ["--scan-max-rows", "10"]), { env: E });
    ok("!! THE REFUSALS ARE BY NAME, BEFORE ANY PAGE IS READ: no --datastack, --top 1, --chunk-rows 0 and a soma table over --scan-max-rows each exit 2 with the reason (the last names the table and its 39 rows) and read no synapse page",
        r0.status === 2 && /giants needs --datastack/.test(r0.stderr) && r1.status === 2 && /--top must be at least 2/.test(r1.stderr) && r2.status === 2 && /--chunk-rows must be at least 1/.test(r2.stderr) && r3.status === 2 && /soma table somas has 39 rows, over --scan-max-rows 10/.test(r3.stderr) && [r0, r1, r2, r3].every((r) => r.log.filter((c) => c.call === "query_table" && c.table === "synapses").length === 0));
    const nf = JSON.parse(JSON.stringify(GFIX)); nf.no_voxel = true; writeFixture(nf);
    const NV = outDir("g_novoxel"), rn = run(gArgs(NV), { env: E }), NV2 = outDir("g_voxel2"), rn2 = run(gArgs(NV2, ["--soma-voxel-nm", "16,16,60"]), { env: E }); watch(rn2, NV2);
    ok("!! A SOMA TABLE WHOSE VOXEL SIZE IS NOT KNOWN IS NOT GUESSED AT: exit 2 naming the table and the override, and with --soma-voxel-nm 16,16,60 the positions are exactly twice what 8,8,30 gave (1102 at 804 x 120 x 102 um)",
        rn.status === 2 && /voxel size of the soma table somas is not known/.test(rn.stderr) && /--soma-voxel-nm/.test(rn.stderr) && rn2.status === 0 && Math.abs(Number(csvRows(NV2, "giants_top.csv").find((r) => r.root_id === "1102").soma_x_um) - 804) < 0.06 && Math.abs(Number(csvRows(NV2, "giants_top.csv").find((r) => r.root_id === "1102").soma_y_um) - 120) < 0.06);
    const sf = JSON.parse(JSON.stringify(GFIX)); sf.tables.synapses.count = total * 10; writeFixture(sf);
    const SH = outDir("g_short"), rh = run(gArgs(SH), { env: E }); watch(rh, SH);
    ok("!! A SERVER THAT PAGES FEWER ROWS THAN THE TABLE HOLDS IS SAID TO: with the table claiming " + total * 10 + " rows and serving " + total + ", the warning gives the rows read, the count and the percentage and calls the counts lower bounds, in the manifest and on the console, with coverage 10%",
        rh.status === 0 && JSON.parse(rd(SH, "MANIFEST.json")).warnings.some((w) => new RegExp(`only ${total} of ${total * 10} rows were read \\(10\\.0%\\).*lower bounds`).test(w)) && /WARNING: only/.test(rh.stdout) && Math.abs(JSON.parse(rd(SH, "MANIFEST.json")).coveragePercent - 10) < 1e-9);
    writeFixture(GFIX);
    const TR = outDir("g_trunc"), rtr = run(gArgs(TR, ["--max-rows", "3"]), { env: E }); watch(rtr, TR);
    ok("the exact pass over the top cells flags a query that hit --max-rows as TRUNCATED, as export does: with a limit of 3 the synapses into the top cells (many) and the synapses out of them (exactly 3, 1101's) both hit it, two warnings in the manifest and the run still finishes; with the ordinary limit neither does (the run above has no warning)", rtr.status === 0 && JSON.parse(rd(TR, "MANIFEST.json")).warnings.filter((w) => /^TRUNCATED:/.test(w)).length === 2);
    const PD = REAL !== PY || hasMod(PY, "pandas") ? outDir("g_pandas") : null;
    if (PD && hasMod(REAL, "pandas")) { const rpd = run(gArgs(PD), { env: E, py: REAL, pandas: true }); watch(rpd, PD); ok("!! WITH REAL pandas DataFrames THE PASS COUNTS THE SAME: giants_top.csv, giants_pairs.csv and giants_counts.json are byte for byte the plain stand-in's (the column read is df[name].tolist(), not a row at a time)", rpd.status === 0 && ["giants_top.csv", "giants_pairs.csv", "giants_counts.json"].every((f) => rd(PD, f) === rd(A, f))); }
    else note("NOT CHECKED HERE: giants with real pandas DataFrames (no Python with pandas; set FISH_CAVE_PYTHON).");
    // A TABLE WHOSE ROW COUNT THE SERVER DOES NOT GIVE
    const cn = JSON.parse(JSON.stringify(GFIX)); cn.count_none = ["somas"]; writeFixture(cn);
    const SN = outDir("g_somanone"), rsn = run(gArgs(SN), { env: E });
    cn.count_none = ["synapses"]; writeFixture(cn);
    const YN = outDir("g_synnone"), ryn = run(gArgs(YN), { env: E }); watch(ryn, YN);
    ok("!! A ROW COUNT THE SERVER DOES NOT GIVE IS NOT A ZERO AND NOT A GUESS: for the soma table the run is refused (exit 2) saying the server did not say and suggesting `discover`, before any synapse page; for the synapse table the pass ends on the first SHORT page (the old rule, the only one left) -- four pages, the same giants_top.csv byte for byte -- and the manifest says the table's rows and the coverage are unknown (null) and that the pass finished",
        rsn.status === 2 && /server did not say how many rows the soma table somas has/.test(rsn.stderr) && /discover/.test(rsn.stderr) && rsn.log.filter((c) => c.call === "query_table" && c.table === "synapses").length === 0
        && ryn.status === 0 && ryn.log.filter((c) => c.call === "query_table" && c.table === "synapses").map((c) => c.offset).join() === "0,80,160,240" && rd(YN, "giants_top.csv") === rd(A, "giants_top.csv") && JSON.parse(rd(YN, "MANIFEST.json")).tableRows === null && JSON.parse(rd(YN, "MANIFEST.json")).coveragePercent === null && JSON.parse(rd(YN, "MANIFEST.json")).finished === true && !/NaN|undefined/.test(ryn.stdout), ryn.stderr.slice(0, 200));
    // NUMBERS FROM THE SERVER ARE NUMPY INTEGERS: the first real run died writing one into the partial counts file
    const npf = JSON.parse(JSON.stringify(GFIX)); npf.np_ints = true; writeFixture(npf);
    const NP = outDir("g_np"), rnp = run(gArgs(NP, ["--pages", "1"]), { env: E }); watch(rnp, NP);
    const npPartial = path.join(NP, "giants_counts.partial.json"), npMan = rnp.status === 0 ? JSON.parse(rd(NP, "MANIFEST.json")) : null;
    ok("!! A VERSION AND A ROW COUNT THAT ARE NUMPY INTEGERS ARE WRITTEN AS NUMBERS (the first real `giants` run died on `Object of type int64 is not JSON serializable` the moment it saved its first page): with a stand-in whose version and counts json refuses, the run exits 0, the partial counts file holds the version 77 and the table 'synapses' and the offset 80 as numbers, and the manifest has the version and the table's row count as numbers and not as text",
        rnp.status === 0 && fs.existsSync(npPartial) && (() => { const j = JSON.parse(fs.readFileSync(npPartial, "utf8")); return j.version === 77 && j.offset === 80 && j.table === "synapses" && typeof j.version === "number"; })() && npMan.materializationVersion === 77 && npMan.tableRows === total && typeof npMan.tableRows === "number" && typeof npMan.coveragePercent === "number", rnp.stderr.slice(0, 200));
    const NR = outDir("g_np_resume"), rnr = run(gArgs(NR, ["--resume", npPartial]), { env: E }); watch(rnr, NR);
    ok("and a partial file written that way is resumed (the version compares as a number with the server's), giving the uninterrupted run's answer", rnr.status === 0 && rd(NR, "giants_top.csv") === rd(A, "giants_top.csv"), rnr.stderr.slice(0, 200));
    const NE = outDir("np_export"), rne = run(["export", "--datastack", "fish1_giants", "--out", NE, "--root-ids", "1101", "--hops", "1"], { env: E }); watch(rne, NE);
    const ND = outDir("np_discover"), rnd = run(["discover", "--datastack", "fish1_giants", "--out", ND], { env: E }); watch(rnd, ND);
    ok("!! THE OTHER COMMANDS WRITE THEIR NUMBERS AS NUMBERS TOO: export's manifest has materializationVersion 77 as a number, and discover.json has each table's row count as a number (the real discover.json had text for the version)", rne.status === 0 && JSON.parse(rd(NE, "MANIFEST.json")).materializationVersion === 77 && rnd.status === 0 && JSON.parse(rd(ND, "discover.json")).details.fish1_giants.tables.every((t) => typeof t.count === "number"), rne.stderr.slice(0, 200) + rnd.stderr.slice(0, 200));
    // ---- 12. a server that fails, and a pass that carries on by itself ---------------------------------------------------------------------------------------------------------------------------------------------
    sec("12. a server that fails and a pass that carries on by itself (the second real run died at page 25 of 59 on `500 ... server closed the connection unexpectedly`)");
    const RA = ["--retry-wait", "0.001", "--retry-max-wait", "0.005", "--min-chunk-rows", "10"];   // waits of a thousandth of a second: the gate does not sleep
    const pg = (r) => r.log.filter((c) => c.call === "query_table" && c.table === "synapses");
    const flaky = (list, extra = {}) => { const f = JSON.parse(JSON.stringify(GFIX)); f.flaky = list; Object.assign(f, extra); writeFixture(f); };
    const partOf = (d) => { const f = path.join(d, "giants_counts.partial.json"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : { offset: null, rows: null, somaTable: null, version: null };   // a missing file reads as null offsets, so the row that wanted it fails instead of the gate throwing and hiding every row after it
    };
    const manOf = (d) => JSON.parse(rd(d, "MANIFEST.json"));
    const sameAsA = (d) => rd(d, "giants_top.csv") === rd(A, "giants_top.csv") && rd(d, "giants_pairs.csv") === rd(A, "giants_pairs.csv") && rd(d, "giants_counts.json") === rd(A, "giants_counts.json");
    const mkdir = (n) => { const d = outDir(n); fs.mkdirSync(d, { recursive: true }); return d; };
    const folders = (d) => fs.readdirSync(d).filter((n) => /^fish1_giants_/.test(n));
    const watchIn = (r, d) => { watch(r); for (const f of folders(d)) watch({ stdout: "", stderr: "" }, path.join(d, f)); };   // a working folder holds folders: the token check reads each, not the folder itself
    const GA = ["giants", "--datastack", "fish1_giants", "--chunk-rows", "80", "--top", "12"];
    const tail = (from) => { const o = []; for (let k = from; k < total; k += 40) o.push(k); return o; };

    flaky([{ call: "query_table", table: "synapses", from: 2, to: 2, status: 500 }]);
    const F1 = outDir("g_flaky1"), rf1 = run(gArgs(F1, RA), { env: E }); watch(rf1, F1);
    ok("!! A HICCUP IS ASKED FOR AGAIN, AT THE SAME PAGE AND THE SAME SIZE, AND NOTHING IS COUNTED TWICE OR SKIPPED: the server fails the second page once with the real error text; the pages asked for are offsets 0, 80, 80 (again), 160, 240, every one of 80 rows; the console says which page, what the server answered (HTTP 500 and its first line), the wait and 'try 2 of 7'; and giants_top.csv, giants_pairs.csv and giants_counts.json are byte for byte the clean run's, with no partial file left",
        rf1.status === 0 && pg(rf1).map((c) => c.offset).join() === "0,80,80,160,240" && pg(rf1).every((c) => c.limit === 80)
        && /page 2 \(rows from 80\): the server answered HTTP 500 \(500 Server Error: \(psycopg2\.OperationalError\) server closed the connection unexpectedly\); waiting 0\.001 s, then trying again \(try 2 of 7\)/.test(rf1.stdout)
        && sameAsA(F1) && !fs.existsSync(path.join(F1, "giants_counts.partial.json")) && manOf(F1).finished === true, rf1.stderr.slice(0, 200));
    flaky([{ call: "query_table", table: "synapses", from: 2, to: 3, status: 500 }]);
    const F2 = outDir("g_flaky2"), rf2 = run(gArgs(F2, RA), { env: E }); watch(rf2, F2);
    ok("!! A SECOND FAILURE IN A ROW HALVES THE PAGE, AND IT STAYS HALVED: the server fails the same page twice; the pages asked for are 80 rows at offset 80 (failed), 80 rows again (failed), then 40 rows at 80, and 40 rows from there on (offsets 120, 160, ...), the console says 'asking for 40 rows a page from now on' once, and the answer is still the clean run's to the byte",
        rf2.status === 0 && pg(rf2).map((c) => c.offset).join() === [0, 80, 80, 80, ...tail(120)].join() && pg(rf2).map((c) => c.limit).join() === [80, 80, 80, 40, ...tail(120).map(() => 40)].join()
        && (rf2.stdout.match(/asking for 40 rows a page from now on/g) || []).length === 1 && /try 3 of 7/.test(rf2.stdout) && sameAsA(F2), rf2.stderr.slice(0, 200));
    const F3 = outDir("g_flaky3"), rf3 = run(gArgs(F3, ["--retry-wait", "0.001", "--min-chunk-rows", "1000"]), { env: E }); watch(rf3, F3);
    ok("!! A PAGE IS NEVER MADE BIGGER BY A FAILURE: with --min-chunk-rows 1000 above the page of 80, the same two failures leave every page at 80 rows (offsets 0, 80, 80, 80, 160, 240), and the answer is the clean run's",
        rf3.status === 0 && pg(rf3).map((c) => c.offset).join() === "0,80,80,80,160,240" && pg(rf3).every((c) => c.limit === 80) && !/rows a page from now on/.test(rf3.stdout) && sameAsA(F3), rf3.stderr.slice(0, 200));
    flaky([{ call: "query_table", table: "synapses", from: 2, to: 3, status: 500 }], { row_cap: 50 });
    const F4 = outDir("g_flaky_cap"), rf4 = run(gArgs(F4, [...RA, "--chunk-rows", "1000000"]), { env: E }); watch(rf4, F4);
    ok("!! AGAINST A SERVER THAT CAPS A QUERY (the real one returns 500,000 rows to a page of a million), HALVING STARTS FROM THE CAP, not from the page asked for -- half of a million would change nothing: with the cap at 50 and a page of a million, two failures at offset 50 are followed by a page of 25 (the cap halved), and the answer is the clean run's",
        rf4.status === 0 && pg(rf4).map((c) => c.limit).slice(0, 4).join() === "1000000,1000000,1000000,25" && pg(rf4).map((c) => c.offset).slice(0, 4).join() === "0,50,50,50" && /asking for 25 rows a page from now on/.test(rf4.stdout) && sameAsA(F4), rf4.stderr.slice(0, 200));

    flaky([{ call: "query_table", table: "synapses", from: 3, status: 500 }]);
    const F5 = outDir("g_gaveup"), rf5 = run(gArgs(F5, [...RA, "--retries", "2"]), { env: E }); watch(rf5, F5);
    ok("!! WHEN THE TRIES RUN OUT IT STOPS, SAYS WHERE, AND KEEPS WHAT IT HAS: the server never answers the third page again; after 3 tries (2 retries, waiting 0.001 s and then 0.003 s) the run exits 3 with STOPPED, the page, the HTTP 500 and its first line, 'Stopped at row 160 of about N (P%)', the path of the saved counts and 'Run the SAME command again'; the folder holds the partial counts file (offset 160, 160 rows, naming version 77 and the soma table 'somas' it counted for) and NOTHING else -- no half-finished answer",
        rf5.status === 3 && pg(rf5).map((c) => c.offset).join() === "0,80,160,160,160" && /STOPPED: page 3 \(rows from 160\) got no good answer from the server after 3 tries \(HTTP 500: 500 Server Error/.test(rf5.stderr) && /Stopped at row 160 of about \d+ \(\d+\.\d%\)/.test(rf5.stderr)
        && /giants_counts\.partial\.json/.test(rf5.stderr) && /Run the SAME command again/.test(rf5.stderr) && (rf5.stdout.match(/waiting 0\.001 s/g) || []).length === 1 && (rf5.stdout.match(/waiting 0\.003 s/g) || []).length === 1 && !/waiting 0\.009/.test(rf5.stdout)
        && fs.readdirSync(F5).join() === "giants_counts.partial.json" && partOf(F5).offset === 160 && partOf(F5).rows === 160 && partOf(F5).somaTable === "somas" && partOf(F5).version === 77, rf5.stderr.slice(0, 300));
    const RW = ["--retry-wait", "0.001", "--retry-max-wait", "0.002", "--retries", "3"], FB = outDir("g_waits");
    flaky([{ call: "query_table", table: "synapses", from: 2, status: 500 }]);
    const rfb = run(gArgs(FB, RW), { env: E });
    ok("the waits grow by three times and stop at --retry-max-wait: with 0.001 s, a ceiling of 0.002 s and three retries the waits are 0.001, 0.002 and 0.002 (0.003 would have been the third)", rfb.status === 3 && (rfb.stdout.match(/waiting ([0-9.]+) s/g) || []).join("|") === "waiting 0.001 s|waiting 0.002 s|waiting 0.002 s");
    writeFixture(GFIX);
    const rc5 = run(gArgs(F5, RA), { env: E }); watch(rc5, F5);
    ok("!! THE SAME COMMAND RUN AGAIN CARRIES ON BY ITSELF: with the server well again, the identical command (same --out) finds the unfinished pass, says so (the folder, row 160 of about N, the cells counted, and that --fresh starts over), reads ONLY the pages from offset 160 (160, 240), writes the clean run's answer to the byte in the same folder, leaves no partial file, and the manifest says resumed, resumed by itself, finished",
        rc5.status === 0 && pg(rc5).map((c) => c.offset).join() === "160,240" && new RegExp("found an unfinished pass in .*g_gaveup: row 160 of about \\d+ \\(\\d+\\.\\d%\\), \\d+ cells counted -- carrying on from there \\(--fresh starts over\\)").test(rc5.stdout)
        && sameAsA(F5) && !fs.existsSync(path.join(F5, "giants_counts.partial.json")) && manOf(F5).options.resume === true && manOf(F5).options.autoResume === true && manOf(F5).finished === true && manOf(F5).rowsRead === total, rc5.stderr.slice(0, 200));

    const PP = outDir("g_pieces"), pieceRuns = [0, 1, 2, 3].map(() => { const r = run(gArgs(PP, ["--pages", "1"]), { env: E }); watch(r, PP); return { r, man: fs.existsSync(path.join(PP, "MANIFEST.json")) ? manOf(PP) : null, part: fs.existsSync(path.join(PP, "giants_counts.partial.json")) ? partOf(PP).offset : null }; });
    ok("!! A PASS IN PIECES: --pages 1 four times with the same command reads offsets 0, then 80, then 160, then 240, one page each; after each of the first three the manifest says finished false and the partial file holds the offset reached (80, 160, 240) -- the half-answers of one piece are replaced by the next -- and after the fourth the folder holds the finished answer, the clean run's to the byte, and no partial file",
        pieceRuns.every((p) => p.r.status === 0) && pieceRuns.map((p) => pg(p.r).map((c) => c.offset).join()).join("|") === "0|80|160|240" && pieceRuns.slice(0, 3).every((p, i) => p.man.finished === false && p.part === 80 * (i + 1)) && pieceRuns[3].man.finished === true && pieceRuns[3].part === null && sameAsA(PP), pieceRuns.map((p) => p.r.stderr).join(" ").slice(0, 200));

    const CA = mkdir("cwd_a"), runA = (extra) => run([...GA, ...extra], { env: E, cwd: CA });
    const ra1 = runA(["--pages", "1"]), ra2 = runA([]);
    const fa = folders(CA); watchIn(ra1, CA); watchIn(ra2, CA);
    ok("!! WITH NO --out THE FOLDER IS FOUND: a first command (--pages 1) makes one fish1_giants_<time> folder; the same command without --pages, run again, finds it in the working folder, reads offsets 80, 160, 240 and finishes IN THAT FOLDER -- one fish1_giants_* folder in all, holding the clean run's answer",
        ra1.status === 0 && ra2.status === 0 && fa.length === 1 && pg(ra2).map((c) => c.offset).join() === "80,160,240" && /found an unfinished pass in \.[\\/]fish1_giants_\d{8}T\d{6}Z: row 80 of about/.test(ra2.stdout) && sameAsA(path.join(CA, fa[0])), (ra1.stderr + ra2.stderr).slice(0, 200));

    const FH = outDir("g_fresh"); run(gArgs(FH, ["--pages", "1"]), { env: E });
    const rfr = run(gArgs(FH, ["--fresh"]), { env: E }); watch(rfr, FH);
    ok("!! --fresh STARTS OVER IN THE SAME FOLDER: with an unfinished pass in the folder, --fresh reads offsets 0, 80, 160, 240 (not 80...), says nothing of carrying on, replaces the half-answer, and finishes with the clean run's answer",
        rfr.status === 0 && pg(rfr).map((c) => c.offset).join() === "0,80,160,240" && !/found an unfinished pass/.test(rfr.stdout) && manOf(FH).options.fresh === true && manOf(FH).options.resume === false && sameAsA(FH), rfr.stderr.slice(0, 200));

    const SO = outDir("g_startoff"); run(gArgs(SO, ["--pages", "1"]), { env: E });
    const rso = run(gArgs(SO, ["--start-offset", "160"]), { env: E }); watch(rso, SO);
    ok("--start-offset IS A DECISION OF THE PERSON AND IS NOT OVERRIDDEN: with a partial file in the folder, --start-offset 160 starts at 160 (offsets 160, 240) and does not pick up the partial's 80",
        rso.status === 0 && pg(rso).map((c) => c.offset).join() === "160,240" && !/found an unfinished pass/.test(rso.stdout) && manOf(SO).options.resume === false, rso.stderr.slice(0, 200));

    const OLD = mkdir("g_other_snapshot");
    const OS = outDir("g_other_snapshot_src"); run(gArgs(OS, ["--pages", "1"]), { env: E });
    const other = partOf(OS); other.version = 76; fs.writeFileSync(path.join(OLD, "giants_counts.partial.json"), JSON.stringify(other));
    const shaOld = sha(path.join(OLD, "giants_counts.partial.json")), rOld = run(gArgs(OLD), { env: E });
    ok("!! COUNTS OF ANOTHER SNAPSHOT ARE NEVER ADDED TO, AND NEVER OVERWRITTEN: --out naming a folder whose partial file is for version 76 against the server's 77 exits 2 saying so, naming --version 76 (to carry on with it), --fresh and a new --out, reads no page, and leaves the file byte for byte as it was",
        rOld.status === 2 && /unfinished pass in .*g_other_snapshot is for datastack 'fish1_giants' version 76/.test(rOld.stderr) && /--version 76/.test(rOld.stderr) && /--fresh/.test(rOld.stderr) && pg(rOld).length === 0 && sha(path.join(OLD, "giants_counts.partial.json")) === shaOld, rOld.stderr.slice(0, 300));
    const CB = mkdir("cwd_b"), oldDir = path.join(CB, "fish1_giants_old"); fs.mkdirSync(oldDir); fs.writeFileSync(path.join(oldDir, "giants_counts.partial.json"), JSON.stringify(other));
    const shaOld2 = sha(path.join(oldDir, "giants_counts.partial.json")), rcb = run([...GA], { env: E, cwd: CB }); watchIn(rcb, CB);
    ok("and with no --out the other snapshot's folder is named and left alone: the run says 'note: ./fish1_giants_old holds an unfinished pass ... left alone (--version 76 carries it on)', starts at offset 0 in a NEW folder, finishes, and the old file is untouched",
        rcb.status === 0 && /note: \.[\\/]fish1_giants_old holds an unfinished pass for datastack 'fish1_giants' version 76: left alone \(--version 76 carries it on\)/.test(rcb.stdout) && pg(rcb).map((c) => c.offset).join() === "0,80,160,240" && folders(CB).length === 2 && sha(path.join(oldDir, "giants_counts.partial.json")) === shaOld2, rcb.stderr.slice(0, 200));

    const variants = [["datastack", (d) => { d.datastack = "fish1_other"; }, /datastack 'fish1_other' version 77/], ["table", (d) => { d.table = "synapses_other"; }, /table 'synapses_other'/], ["soma table", (d) => { d.somaTable = "somas_other"; }, /soma table 'somas_other', not 'somas'/]];
    const vr = variants.map(([label, edit, re], i) => { const d = outDir("g_variant" + i); fs.mkdirSync(d); const o = JSON.parse(JSON.stringify(partOf(OS))); edit(o); fs.writeFileSync(path.join(d, "giants_counts.partial.json"), JSON.stringify(o)); const r = run(gArgs(d), { env: E }); return { label, r, re, d, o }; });
    ok("!! A PARTIAL FILE FOR ANOTHER DATASTACK, SYNAPSE TABLE OR SOMA TABLE IS REFUSED TOO, by what differs: each exits 2 naming the difference (datastack 'fish1_other', table 'synapses_other', soma table 'somas_other' against 'somas'), reads no page, and leaves the file as it was",
        vr.every(({ r, re, d, o }) => r.status === 2 && re.test(r.stderr) && pg(r).length === 0 && JSON.stringify(partOf(d)) === JSON.stringify(o)), vr.map(({ label, r }) => label + ": " + r.status + " " + r.stderr.slice(0, 80)).join(" | "));
    const SA = outDir("g_soma_a"), SB = outDir("g_soma_b"); fs.mkdirSync(SA); fs.writeFileSync(path.join(SA, "giants_counts.partial.json"), JSON.stringify(Object.assign(JSON.parse(JSON.stringify(partOf(OS))), { somaTable: "somas" })));
    const rsa = run(gArgs(SA), { env: E }); watch(rsa, SA);
    const old = JSON.parse(JSON.stringify(partOf(OS))); delete old.somaTable; fs.mkdirSync(SB); fs.writeFileSync(path.join(SB, "giants_counts.partial.json"), JSON.stringify(old));
    const rsb = run(gArgs(SB), { env: E }); watch(rsb, SB);
    ok("a partial file that names the soma table it counted for, and the same name now, is carried on; and a partial file written by the version before this one (no soma table named in it, like the real one from the second run) is carried on too, because it cannot be told apart from a match",
        rsa.status === 0 && pg(rsa).map((c) => c.offset).join() === "80,160,240" && sameAsA(SA) && rsb.status === 0 && pg(rsb).map((c) => c.offset).join() === "80,160,240" && sameAsA(SB), (rsa.stderr + rsb.stderr).slice(0, 200));
    const CC = mkdir("cwd_c");
    run([...GA, "--out", "fish1_giants_a", "--pages", "1"], { env: E, cwd: CC }); run([...GA, "--out", "fish1_giants_b", "--pages", "2"], { env: E, cwd: CC });
    const decoy = path.join(CC, "not_ours"); fs.mkdirSync(decoy); const dec = JSON.parse(fs.readFileSync(path.join(CC, "fish1_giants_b", "giants_counts.partial.json"), "utf8")); dec.offset = 240; dec.rows = 240; fs.writeFileSync(path.join(decoy, "giants_counts.partial.json"), JSON.stringify(dec));   // a valid partial, further on than b, in a folder that is not a giants folder
    const shaA = sha(path.join(CC, "fish1_giants_a", "giants_counts.partial.json")), shaD = sha(path.join(decoy, "giants_counts.partial.json")), rcc = run([...GA], { env: E, cwd: CC }); watchIn(rcc, CC);
    ok("!! OF SEVERAL UNFINISHED PASSES THE FURTHEST WINS: folders a (row 80) and b (row 160) both hold the same command's counts; the next run without --out carries on in b (offsets 160, 240), finishes there, and leaves a exactly as it was; a folder NOT named fish1_giants_* that holds a valid partial file further on (offset 240) is not looked at -- it is not ours",
        rcc.status === 0 && pg(rcc).map((c) => c.offset).join() === "160,240" && /found an unfinished pass in \.[\\/]fish1_giants_b: row 160/.test(rcc.stdout) && sameAsA(path.join(CC, "fish1_giants_b")) && sha(path.join(CC, "fish1_giants_a", "giants_counts.partial.json")) === shaA && folders(CC).length === 2 && sha(path.join(decoy, "giants_counts.partial.json")) === shaD, rcc.stderr.slice(0, 200));

    const rfin = run(gArgs(A, RA), { env: E });
    ok("!! A FINISHED RUN IS NEVER OVERWRITTEN, AND THE REFUSAL COMES BEFORE THE NETWORK: the same command into the folder of the finished first run exits 2 'is not empty', the stand-in is not called at all (an empty log), and the folder's answer is unchanged",
        rfin.status === 2 && /is not empty/.test(rfin.stderr) && rfin.log.length === 0 && manOf(A).finished === true, rfin.stderr.slice(0, 200));

    flaky([{ call: "query_table", table: "synapses", from: 3, to: 3, kind: "interrupt" }]);
    const IC = outDir("g_ctrlc"), ric = run(gArgs(IC, RA), { env: E }); watch(ric, IC);
    const icOffset = fs.existsSync(path.join(IC, "giants_counts.partial.json")) ? partOf(IC).offset : null;
    writeFixture(GFIX);
    const ric2 = run(gArgs(IC, RA), { env: E }); watch(ric2, IC);
    ok("!! CTRL+C IS A STOP, NOT A TRACEBACK: pressed during the third page, the run exits 130 (not 3: the server did not give up, the person did) with 'STOPPED by you (Ctrl+C) during page 3', the row reached (160) and the instruction to run the same command again, no traceback is printed, the partial file holds offset 160; run again it carries on (offsets 160, 240) to the clean answer",
        ric.status === 130 && /STOPPED by you \(Ctrl\+C\) during page 3 \(rows from 160\)\. Stopped at row 160/.test(ric.stderr) && /Run the SAME command again/.test(ric.stderr) && !/Traceback/.test(ric.stderr) && icOffset === 160
        && ric2.status === 0 && pg(ric2).map((c) => c.offset).join() === "160,240" && sameAsA(IC), ric.stderr.slice(0, 200));

    for (const [kind, status, label] of [["http", 403, "a refused token (403)"], ["other", 0, "a mistake in the request"]]) {
        flaky([{ call: "query_table", table: "synapses", from: 2, to: 2, kind, status }]);
        const D = outDir("g_nottransient_" + kind), r = run(gArgs(D, RA), { env: E }); watch(r, D);
        ok("!! " + label.toUpperCase() + " IS NOT RETRIED: the second page fails once with it; the run asks for that page ONCE (offsets 0, 80), prints no 'waiting', exits 1 with the generic message (what failed, and what to check), and keeps the first page's counts in the folder",
            r.status === 1 && pg(r).map((c) => c.offset).join() === "0,80" && !/waiting/.test(r.stdout) && /Check the network/.test(r.stderr) && fs.existsSync(path.join(D, "giants_counts.partial.json")) && partOf(D).offset === 80, r.stderr.slice(0, 200));
    }
    const netNames = ["ConnectionError", "ConnectTimeout", "ReadTimeout", "Timeout", "ChunkedEncodingError", "RemoteDisconnected", "ProtocolError"];
    const netRuns = netNames.map((name) => { flaky([{ call: "query_table", table: "synapses", from: 2, to: 2, kind: "conn", name }]); const d = outDir("g_net_" + name), r = run(gArgs(d, RA), { env: E }); watch(r, d); return { name, r, d }; });
    ok("!! THE LIBRARY'S OWN CONNECTION ERRORS ARE RETRIED BY NAME (they are not the builtin classes, so only the name says what they are): " + netNames.join(", ") + " each fail the second page once; each run says 'the server answered <name>', asks for the page again (offsets 0, 80, 80, 160, 240) and gives the clean answer",
        netRuns.every(({ name, r, d }) => r.status === 0 && new RegExp("the server answered " + name).test(r.stdout) && pg(r).map((c) => c.offset).join() === "0,80,80,160,240" && sameAsA(d)), netRuns.filter(({ r }) => r.status !== 0).map(({ name, r }) => name + ": " + r.stderr.slice(0, 80)).join(" | "));
    flaky([{ call: "query_table", table: "synapses", from: 2, to: 2, kind: "timeout" }]);
    const TM = outDir("g_timeout"), rtm = run(gArgs(TM, RA), { env: E }); watch(rtm, TM);
    flaky([{ call: "query_table", table: "synapses", from: 2, to: 2, kind: "text" }]);
    const TX = outDir("g_text"), rtx = run(gArgs(TX, RA), { env: E }); watch(rtx, TX);
    flaky([{ call: "query_table", table: "synapses", from: 2, to: 2, kind: "conn", name: "SSLCertVerificationProblem" }]);
    const NL = outDir("g_unlisted"), rnl = run(gArgs(NL, RA), { env: E }); watch(rnl, NL);
    ok("!! THE BUILTIN TIMEOUT IS RETRIED BY TYPE AND AN ERROR OF NO KNOWN CLASS BY WHAT IT SAYS, AND A CLASS NOBODY LISTED IS NOT RETRIED: a bare TimeoutError and an Exception reading 'server closed the connection unexpectedly' each fail the second page once and the run finishes with the clean answer; an error class that is not in the list (a certificate problem) is asked for once (offsets 0, 80), exits 1 and prints no 'waiting'",
        rtm.status === 0 && pg(rtm).map((c) => c.offset).join() === "0,80,80,160,240" && sameAsA(TM) && rtx.status === 0 && pg(rtx).map((c) => c.offset).join() === "0,80,80,160,240" && sameAsA(TX) && rnl.status === 1 && pg(rnl).map((c) => c.offset).join() === "0,80" && !/waiting/.test(rnl.stdout), (rtm.stderr + rtx.stderr + rnl.stderr).slice(0, 200));
    flaky([{ call: "query_table", table: "synapses", from: 2, to: 2, status: 500 }]);
    const SL = outDir("g_sleep"), t0 = Date.now(), rsl = run(gArgs(SL, ["--retry-wait", "0.8"]), { env: E }), took = (Date.now() - t0) / 1000; watch(rsl, SL);
    ok("!! THE WAIT IS A REAL WAIT: with --retry-wait 0.8 and one failure the whole run takes at least 0.8 seconds (it took " + took.toFixed(2) + ") and says 'waiting 0.8 s'; the runs above, at a thousandth of a second, are much faster than that",
        rsl.status === 0 && took >= 0.8 && /waiting 0\.8 s/.test(rsl.stdout) && sameAsA(SL), rsl.stderr.slice(0, 200));

    flaky([{ call: "synapse_query", from: 1, to: 1, status: 503 }]);
    const SQ = outDir("g_synq"), rsq = run(gArgs(SQ, RA), { env: E }); watch(rsq, SQ);
    ok("!! THE QUERIES FOR THE TOP CELLS ARE RETRIED TOO: the first synapse query (the synapses INTO the top cells) fails once with 503, is asked for again, and the answer is the clean run's; the stand-in saw three synapse queries (one failed)",
        rsq.status === 0 && /the synapses into the top cells: the server answered HTTP 503/.test(rsq.stdout) && rsq.log.filter((c) => c.call === "synapse_query").length === 3 && sameAsA(SQ), rsq.stderr.slice(0, 200));
    flaky([{ call: "synapse_query", from: 1, status: 503 }]);
    const SX = outDir("g_synq_dead"), rsx = run(gArgs(SX, [...RA, "--retries", "1"]), { env: E }); watch(rsx, SX);
    const sxFiles = fs.readdirSync(SX).join(), sxOffset = fs.existsSync(path.join(SX, "giants_counts.partial.json")) ? partOf(SX).offset : null;
    writeFixture(GFIX);
    const rsx2 = run(gArgs(SX, RA), { env: E }); watch(rsx2, SX);
    ok("!! A SERVER THAT FAILS AFTER THE PASS COSTS NO PASS: when the queries for the top cells never answer, the run exits 3 saying so and where the counts are saved; the folder holds the partial file and nothing else, at offset " + total + " (the whole table); run again, the pass is SKIPPED (no synapse-table page is read at all) and the answer is the clean run's to the byte",
        rsx.status === 3 && /STOPPED: the synapses into the top cells got no good answer from the server after 2 tries \(HTTP 503/.test(rsx.stderr) && /giants_counts\.partial\.json/.test(rsx.stderr) && /skips the pass/.test(rsx.stderr)
        && sxFiles === "giants_counts.partial.json" && sxOffset === total && rsx2.status === 0 && pg(rsx2).length === 0 && sameAsA(SX), rsx.stderr.slice(0, 300));
    flaky([{ call: "query_table", table: "somas", from: 1, to: 1, status: 502 }]);
    const SM2 = outDir("g_soma_retry"), rsm = run(gArgs(SM2, RA), { env: E }); watch(rsm, SM2);
    ok("the soma table's one big query is retried too (a 502 on the first try): the run says 'the soma table: the server answered HTTP 502' and gives the clean answer", rsm.status === 0 && /the soma table: the server answered HTTP 502/.test(rsm.stdout) && sameAsA(SM2), rsm.stderr.slice(0, 200));
    // --keep-trying: a night's run with no one at the keyboard
    flaky([{ call: "query_table", table: "synapses", from: 3, to: 5, status: 500 }]);
    const KA = outDir("g_keep1"), tk0 = Date.now(), rka = run(gArgs(KA, [...RA, "--retries", "1", "--keep-trying", "3", "--cooldown", "0.8"]), { env: E }), tka = (Date.now() - tk0) / 1000; watch(rka, KA);
    ok("!! --keep-trying CARRIES ON BY ITSELF WHEN THE SERVER GIVES UP: with 2 tries a page, --keep-trying 3 and --cooldown 0.8, the server refuses the third page three times in a row; the first round stops at row 160 (the STOPPED message is printed), the run waits 0.8 s (it took " + tka.toFixed(2) + " s in all) and says 'round 1 of 3', the second round finds its own saved counts (offsets 0, 80, 160, 160, then 160, 160, 240) and finishes with the clean run's answer, exit 0",
        rka.status === 0 && pg(rka).map((c) => c.offset).join() === "0,80,160,160,160,160,240" && /--keep-trying: waiting 0\.8 s, then carrying on from the saved counts \(round 1 of 3; Ctrl\+C stops\)/.test(rka.stdout) && (rka.stdout.match(/--keep-trying: waiting/g) || []).length === 1 && /STOPPED: page 3/.test(rka.stderr)
        && /found an unfinished pass in .*g_keep1: row 160/.test(rka.stdout) && tka >= 0.8 && sameAsA(KA) && manOf(KA).options.keepTrying === 3, rka.stderr.slice(0, 200));
    flaky([{ call: "query_table", table: "synapses", from: 3, status: 500 }]);
    const KB = outDir("g_keep2"), rkb = run(gArgs(KB, [...RA, "--retries", "1", "--keep-trying", "1", "--cooldown", "0.001"]), { env: E }); watch(rkb, KB);
    ok("!! --keep-trying N TRIES N MORE ROUNDS AND NO MORE: with a server that never answers the third page, --keep-trying 1 makes two rounds (two STOPPED messages -- the second says page 1, because a round counts its pages from where it starts -- one 'waiting' line, offset 160 asked for four times in all) and ends with exit 3 and the counts saved at row 160",
        rkb.status === 3 && (rkb.stderr.match(/STOPPED: page \d+ \(rows from 160\)/g) || []).length === 2 && (rkb.stdout.match(/--keep-trying: waiting/g) || []).length === 1 && pg(rkb).map((c) => c.offset).join() === "0,80,160,160,160,160" && partOf(KB).offset === 160 && fs.readdirSync(KB).join() === "giants_counts.partial.json", rkb.stderr.slice(0, 200));
    flaky([{ call: "query_table", table: "synapses", from: 3, to: 3, kind: "interrupt" }]);
    const KC = outDir("g_keep3"), rkc = run(gArgs(KC, [...RA, "--keep-trying", "2", "--cooldown", "0.001"]), { env: E }); watch(rkc, KC);
    flaky([{ call: "query_table", table: "synapses", from: 2, to: 2, kind: "interrupt_while_waiting" }]);
    const IW = outDir("g_ctrlc_wait"), riw = run(gArgs(IW, ["--retry-wait", "1"]), { env: E }); watch(riw, IW);
    ok("!! CTRL+C WHILE THE RUN WAITS TO TRY AGAIN IS A STOP TOO: the second page fails with a 500, the run starts its one-second wait, Ctrl+C arrives during it; exit 130, 'STOPPED by you (Ctrl+C) while waiting to retry page 2 (rows from 80)', the row reached and the instruction to run again, no traceback, and the first page's counts are saved (offset 80)",
        riw.status === 130 && /STOPPED by you \(Ctrl\+C\) while waiting to retry page 2 \(rows from 80\)\. Stopped at row 80/.test(riw.stderr) && /Run the SAME command again/.test(riw.stderr) && !/Traceback/.test(riw.stderr) && fs.existsSync(path.join(IW, "giants_counts.partial.json")) && partOf(IW).offset === 80, riw.stderr.slice(0, 300));
    flaky([{ call: "query_table", table: "synapses", from: 3, to: 3, status: 500 }, { call: "query_table", table: "synapses", from: 4, to: 4, kind: "interrupt_while_waiting" }]);
    const KW = outDir("g_ctrlc_cooldown"), rkw = run(gArgs(KW, [...RA, "--retries", "1", "--keep-trying", "2", "--cooldown", "1"]), { env: E }); watch(rkw, KW);
    ok("!! CTRL+C DURING THE --keep-trying COOLDOWN ENDS THE RUN AT ONCE: the first round stops (STOPPED message), the run starts its one-second cooldown, Ctrl+C arrives during it; exit 130 with 'stopped by you (Ctrl+C).', no second round (page 3 asked for twice, never a third time), no traceback, and the counts are saved at row 160",
        rkw.status === 130 && /stopped by you \(Ctrl\+C\)\./.test(rkw.stderr) && !/Traceback/.test(rkw.stderr) && pg(rkw).map((c) => c.offset).join() === "0,80,160,160" && (rkw.stdout.match(/--keep-trying: waiting/g) || []).length === 1 && fs.existsSync(path.join(KW, "giants_counts.partial.json")) && partOf(KW).offset === 160, rkw.stderr.slice(0, 300));
    flaky([{ call: "query_table", table: "synapses", from: 2, to: 2, kind: "other" }]);
    const KD = outDir("g_keep4"), rkd = run(gArgs(KD, [...RA, "--keep-trying", "2", "--cooldown", "0.001"]), { env: E }); watch(rkd, KD);
    writeFixture(GFIX);
    const rke = run(gArgs(OLD, ["--keep-trying", "2", "--cooldown", "0.001"]), { env: E });
    ok("!! ONLY THE SERVER GIVING UP IS TRIED AGAIN: with --keep-trying 2, Ctrl+C exits 130 after ONE attempt (page 3 asked once, no 'waiting' line), a mistake in the request exits 1 after one attempt, and a refusal (the other snapshot's counts) exits 2 -- none of them loops",
        rkc.status === 130 && pg(rkc).map((c) => c.offset).join() === "0,80,160" && !/--keep-trying: waiting/.test(rkc.stdout) && (rkc.stderr.match(/STOPPED by you/g) || []).length === 1 && rkd.status === 1 && pg(rkd).map((c) => c.offset).join() === "0,80" && !/--keep-trying: waiting/.test(rkd.stdout) && rke.status === 2 && !/--keep-trying: waiting/.test(rke.stdout), (rkc.stderr + rkd.stderr + rke.stderr).slice(0, 200));
    // the voxel size of the synapse table, and export's queries
    flaky([{ call: "get_table_metadata", table: "synapses", from: 1, to: 1, status: 500 }]);
    const VM = outDir("g_voxel_fail"), rvm = run(gArgs(VM, RA), { env: E }); watch(rvm, VM);
    writeFixture(Object.assign(JSON.parse(JSON.stringify(GFIX)), { no_voxel_for: ["synapses"] }));
    const VN = outDir("g_voxel_none"), rvn = run(gArgs(VN, RA), { env: E }); watch(rvn, VN);
    writeFixture(GFIX);
    const blankExt = (d) => csvRows(d, "giants_top.csv").every((r) => r.extent_x_um === "" && r.extent_y_um === "" && r.extent_z_um === ""), ranking = (d) => csvRows(d, "giants_top.csv").map((r) => r.root_id + ":" + r.in_degree + ":" + r.out_degree).join();
    ok("!! A SYNAPSE TABLE WHOSE VOXEL SIZE CANNOT BE READ IS SAID, NOT SWALLOWED (the real run's extent columns were all blank and nothing said why): when the metadata call fails (a 500) or names no voxel size, the run still finishes with the clean run's ranking and counts, the extent columns are blank, and the console and the manifest each carry a warning naming the table and the reason (the error's first line, or 'names no voxel size'); the clean run has extents and no warning",
        rvm.status === 0 && rvn.status === 0 && blankExt(VM) && blankExt(VN) && ranking(VM) === ranking(A) && ranking(VN) === ranking(A) && !blankExt(A) && manOf(A).warnings.length === 0
        && manOf(VM).warnings.some((w) => /The voxel size of the synapse table synapses could not be read \(_HttpError: 500 Server Error/.test(w)) && manOf(VN).warnings.some((w) => /could not be read \(the table's metadata names no voxel size\)/.test(w)) && /WARNING: The voxel size of the synapse table synapses could not be read/.test(rvm.stdout + rvn.stdout), (rvm.stderr + rvn.stderr).slice(0, 200));

    const EA = ["export", "--datastack", "fish1_test", "--root-ids", "1001,1002", "--hops", "1"], eflaky = (list) => { const f = JSON.parse(JSON.stringify(FIXTURE)); f.flaky = list; writeFixture(f); };
    writeFixture(FIXTURE);
    const EC = outDir("e_clean"), rec = run([...EA, "--out", EC], { env: E }); watch(rec, EC);
    eflaky([{ call: "synapse_query", from: 1, to: 1, status: 503 }]);
    const EF = outDir("e_flaky"), ref = run([...EA, ...RA, "--out", EF], { env: E }); watch(ref, EF);
    eflaky([{ call: "synapse_query", from: 1, status: 503 }]);
    const ED = outDir("e_dead"), red = run([...EA, ...RA, "--retries", "1", "--out", ED], { env: E }); watch(red, ED);
    const edFiles = fs.readdirSync(ED).join();
    writeFixture(FIXTURE);
    const red2 = run([...EA, ...RA, "--out", ED], { env: E });
    const same = ["synapses_out.csv", "synapses_in.csv", "edges.csv", "partners.csv", "cells_summary.json"];
    ok("!! export'S SYNAPSE QUERIES ARE RETRIED TOO (the second real giants run's server failed in the middle of a long job, and export had no way to go on): the first query (the synapses OUT of the cells) fails once with a 503; the run says so and asks again (the stand-in saw 3 synapse queries, the clean run 2), exits 0, and " + same.join(", ") + " are byte for byte the clean run's",
        rec.status === 0 && ref.status === 0 && rec.log.filter((c) => c.call === "synapse_query").length === 2 && ref.log.filter((c) => c.call === "synapse_query").length === 3 && /synapses out of the cells: the server answered HTTP 503/.test(ref.stdout) && same.every((f) => rd(EF, f) === rd(EC, f)), (rec.stderr + ref.stderr).slice(0, 200));
    ok("!! WHEN export'S SERVER NEVER ANSWERS IT STOPS AND TELLS THE TRUTH ABOUT THE FOLDER: after 2 tries the run exits 3 with STOPPED, the query, the HTTP 503, and 'run the same command again with a different --out' because the folder holds only mauthner_candidates.json -- and the same command into that same folder IS refused ('is not empty'), so the instruction is the right one",
        red.status === 3 && /STOPPED: synapses out of the cells got no good answer from the server after 2 tries \(HTTP 503/.test(red.stderr) && /different --out/.test(red.stderr) && edFiles === "mauthner_candidates.json" && red2.status === 2 && /is not empty/.test(red2.stderr), red.stderr.slice(0, 300));
    writeFixture(GFIX);
    const rv = [["--retries", "-1"], ["--min-chunk-rows", "0"], ["--retry-wait", "-1"], ["--keep-trying", "-1"], ["--cooldown", "-1"]].map((x) => run(gArgs(outDir("g_badopt" + x[0]), x), { env: E }));
    ok("the new options are checked before the network is touched: --retries -1, --min-chunk-rows 0, --retry-wait -1, --keep-trying -1 and --cooldown -1 each exit 2 naming the options, with an empty stand-in log", rv.every((r) => r.status === 2 && /cannot be negative, and --min-chunk-rows must be at least 1/.test(r.stderr) && r.log.length === 0));
    writeFixture(FIXTURE);
}


sec("13. the signs and the boxes (VERSION 5: --signs, --boxes): the label table and the size table of the synapse table");
{
    // the fixture gets the two tables the real stack has (with the real stack's row counts, so the label lookup skips them as it did on fish1_full): a label table keyed by target_id = the synapse id, and a size table with its own pt_root_id / pt2_root_id
    const F13 = JSON.parse(JSON.stringify(FIXTURE));
    const tagOf = { 100000: 2, 100001: 2, 100002: 1, 100003: 3, 100007: 1, 100008: 1, 100009: 2, 100010: 1, 100011: 2, 100012: 1, 100013: 1, 100023: 2, 555555: 2 };
    F13.tables.synapses_label = { count: 29474316, schema: "reference_tag", rows: Object.entries(tagOf).map(([t, tag], i) => ({ id: 900 + i, tag, target_id: Number(t) })) };
    const box = (id, pre, post, a, b) => ({ id, pt_root_id: pre, pt2_root_id: post, pt_position_x: a[0], pt_position_y: a[1], pt_position_z: a[2], pt2_position_x: b[0], pt2_position_y: b[1], pt2_position_z: b[2], tag: 1, tag2: 2 });
    F13.tables.synapse_box_sizes = { count: 29474316, schema: "bound_2tag", rows: [box(100007, 2004, 1001, [100, 200, 10], [110, 205, 12]), box(100008, 2004, 1001, [100, 200, 10], [120, 210, 11]), box(100009, 2004, 1001, [0, 0, 0], [5, 5, 5]), box(100010, 2004, 1001, [0, 0, 0], [10, 10, 2]),
        box(100000, 1001, 2001, [1, 1, 1], [4, 4, 4]), box(100023, 1001, 1002, [0, 0, 0], [2, 2, 2]), box(777777, 2009, 1002, [0, 0, 0], [1, 1, 1])] };
    // seventy-three synapses of a cell that touches none of the others, then one onto cell 1001 with id 100100: a set of ints that wraps around its hash table iterates it out of order, so a list of ids that was never sorted shows
    for (let i = 0; i < 73; i++) F13.synapses.push([3001, 2001, 1]);
    F13.synapses.push([2005, 1001, 5]);
    const with13 = (f = {}) => { writeFixture(Object.assign(JSON.parse(JSON.stringify(F13)), f)); };
    const X13 = ["export", "--datastack", "fish1_test", "--root-ids", "1001,1002"], FAST = ["--retry-wait", "0.01", "--retry-max-wait", "0.02"];
    const man13 = (d) => JSON.parse(rd(d, "MANIFEST.json")), sum13 = (d) => JSON.parse(rd(d, "cells_summary.json")), qs = (r, t) => r.log.filter((c) => c.call === "query_table" && c.table === t);
    const edge = (d, a, b) => csvRows(d, "edges.csv").find((r) => r.pre_root_id === String(a) && r.post_root_id === String(b));
    const IDS20 = [...Array.from({ length: 18 }, (_, i) => 100000 + i), 100023, 100100];

    with13();
    const N0 = outDir("x13_plain"), r0 = run([...X13, "--out", N0], { env: E }); watch(r0, N0);
    ok("!! WITHOUT THE NEW FLAGS NOTHING CHANGES (the old exports stay the old exports): no query touches the label table or the size table, edges.csv has its four columns, the folder has neither synapse_signs.csv nor synapse_boxes.csv, cells_summary.json has no signs and the manifest says signs false, boxes false",
        r0.status === 0 && qs(r0, "synapses_label").length === 0 && qs(r0, "synapse_box_sizes").length === 0 && Object.keys(csvRows(N0, "edges.csv")[0]).join() === "pre_root_id,post_root_id,synapses,total_size" && !fs.existsSync(path.join(N0, "synapse_signs.csv")) && !fs.existsSync(path.join(N0, "synapse_boxes.csv"))
        && sum13(N0).cells.every((c) => !("signsIn" in c) && !("signsOut" in c)) && man13(N0).options.signs === false && man13(N0).options.boxes === false && man13(N0).extras === null, r0.stderr.slice(0, 200));

    const SG = outDir("x13_signs"), rs = run([...X13, "--signs", "--out", SG], { env: E }); watch(rs, SG);
    const sq = qs(rs, "synapses_label");
    ok("!! --signs ASKS THE LABEL TABLE FOR EXACTLY THE SYNAPSES EXPORTED AND NOTHING MORE: one query on synapses_label (the synapse table's name and _label), filtered on target_id, by the twenty synapse ids of the export sorted (100000..100017, 100023 and 100100: the cells' own synapses and the synapses among the cells and their partners; not the autapse, not the unproofread partner, not the synapses of a cell that touches neither), at the version of the export, with the row limit",
        rs.status === 0 && sq.length === 1 && Object.keys(sq[0].filter_in_dict).join() === "target_id" && sq[0].filter_in_dict.target_id.join() === IDS20.join() && sq[0].version === 42 && sq[0].limit === 5000000, rs.stderr.slice(0, 200));
    const sgRows = csvRows(SG, "synapse_signs.csv"), es = (a, b) => { const r = edge(SG, a, b); return r ? `${r.excitatory}/${r.inhibitory}/${r.unlabelled}` : "none"; };
    ok("!! synapse_signs.csv IS THE LABEL TABLE'S ROWS FOR THOSE SYNAPSES, every column the server returned: twelve rows (the thirteenth row of the table, for a synapse that is not in the export, is not there), their target ids sorted, with id, tag and target_id",
        sgRows.length === 12 && Object.keys(sgRows[0]).join() === "id,tag,target_id" && !sgRows.some((r) => r.target_id === "555555") && sgRows.map((r) => Number(r.target_id)).sort((a, b) => a - b).join() === Object.keys(tagOf).filter((k) => k !== "555555").map(Number).sort((a, b) => a - b).join());
    ok("!! edges.csv CARRIES THE SIGNS, counted by hand from the fixture (excitatory / inhibitory / unlabelled): 1001>2001 2/1/0, 2004>1001 1/3/0, 2001>1001 1/0/0, 2004>1002 0/2/0, 1001>1002 1/0/0, a pair with no tag at all is all unlabelled (2005>1002 0/0/1, 2005>1001 0/0/1, 1002>2001 0/0/2), and a tag that is neither 1 nor 2 counts as unlabelled (1001>2002 0/0/1); the four old columns and their values are unchanged",
        Object.keys(csvRows(SG, "edges.csv")[0]).join() === "pre_root_id,post_root_id,synapses,total_size,excitatory,inhibitory,unlabelled" && es(1001, 2001) === "2/1/0" && es(2004, 1001) === "1/3/0" && es(2001, 1001) === "1/0/0" && es(2004, 1002) === "0/2/0" && es(1001, 1002) === "1/0/0" && es(2005, 1002) === "0/0/1" && es(2005, 1001) === "0/0/1" && es(1002, 2001) === "0/0/2" && es(1001, 2002) === "0/0/1"
        && csvRows(SG, "edges.csv").length === 12 && csvRows(SG, "edges.csv").every((r) => csvRows(N0, "edges.csv").some((o) => o.pre_root_id === r.pre_root_id && o.post_root_id === r.post_root_id && o.synapses === r.synapses && o.total_size === r.total_size)));
    const sa = sum13(SG), c1 = sa.cells.find((c) => c.rootId === 1001), c2 = sa.cells.find((c) => c.rootId === 1002), sg = (o) => `${o.excitatory}/${o.inhibitory}/${o.untagged}`;
    ok("!! cells_summary.json SAYS HOW MANY OF EACH CELL'S SYNAPSES ARE EXCITATORY, INHIBITORY OR UNTAGGED, in and out, by hand: cell 1001 in 2/3/1 (from 2004 x4: three inhibitory, one excitatory; from 2001: excitatory; from 2005: untagged), out 3/1/1 (to 2001: two excitatory, one inhibitory; to 1002: excitatory; to 2002: tag 3, untagged); cell 1002 in 1/2/1, out 0/0/3; and the report names the table and counts the join: 20 asked, 12 tagged, 6 inhibitory, 5 excitatory, 1 other tag",
        sg(c1.signsIn) === "2/3/1" && sg(c1.signsOut) === "3/1/1" && sg(c2.signsIn) === "1/2/1" && sg(c2.signsOut) === "0/0/3" && sa.extras.signs.table === "synapses_label" && sa.extras.signs.asked === 20 && sa.extras.signs.tagged === 12 && sa.extras.signs.inhibitory === 6 && sa.extras.signs.excitatory === 5 && sa.extras.signs.otherTags === 1
        && man13(SG).options.signs === true && JSON.stringify(man13(SG).extras.signs) === JSON.stringify(sa.extras.signs) && /signs: 12 of 20 synapses tagged \(6 inhibitory, 5 excitatory\)/.test(rs.stdout) && /synapse_signs\.csv/.test(rd(SG, "README.txt")) && !/synapse_boxes/.test(rd(SG, "README.txt")));
    const CK = outDir("x13_chunks"), rc = run([...X13, "--signs", "--sign-chunk", "7", "--out", CK], { env: E }); watch(rc, CK);
    const cq = qs(rc, "synapses_label"), cids = cq.flatMap((c) => c.filter_in_dict.target_id);
    ok("!! THE IDS GO IN CHUNKS, ALL OF THEM AND EACH ONCE: --sign-chunk 7 asks three times with 7, 7 and 6 ids (the sorted twenty, cut in order), the union is the twenty, and the folder's edges.csv, synapse_signs.csv and summary signs are exactly what one query gave (the real chunk is 2,000)",
        rc.status === 0 && cq.map((c) => c.filter_in_dict.target_id.length).join() === "7,7,6" && cids.join() === IDS20.join() && rd(CK, "edges.csv") === rd(SG, "edges.csv") && rd(CK, "synapse_signs.csv") === rd(SG, "synapse_signs.csv") && JSON.stringify(sum13(CK).cells) === JSON.stringify(sa.cells) && /signs: 12 of 20/.test(rc.stdout + rc.stderr));
    const rz0 = run([...X13, "--signs", "--sign-chunk", "0", "--out", outDir("x13_chunk0")], { env: E });
    ok("--sign-chunk 0 is refused before the network is touched (exit 2, the option named, no call to the server)", rz0.status === 2 && /--sign-chunk must be at least 1/.test(rz0.stderr) && rz0.log.length === 0);

    // the extras are best effort
    with13({ flaky: [{ call: "query_table", table: "synapses_label", kind: "other" }] });
    const FM = outDir("x13_failhard"), rfm = run([...X13, "--signs", "--out", FM], { env: E }); watch(rfm, FM);
    with13({ flaky: [{ call: "query_table", table: "synapses_label", kind: "http", status: 500 }] });
    const FT = outDir("x13_failsoft"), rft = run([...X13, "--signs", "--retries", "1", ...FAST, "--out", FT], { env: E }); watch(rft, FT);
    with13({ flaky: [{ call: "query_table", table: "synapses_label", kind: "interrupt" }] });
    const FI = outDir("x13_failctrlc"), rfi = run([...X13, "--signs", "--out", FI], { env: E }); watch(rfi, FI);
    const sameMain = (d) => ["synapses_out.csv", "synapses_in.csv", "partners.csv", "synapses_circuit.csv"].every((f) => rd(d, f) === rd(N0, f));
    ok("!! A SIGN LOOKUP THAT FAILS DOES NOT COST THE EXPORT: when the label table answers an error a retry cannot fix, and when it answers 500 until the tries run out, the export still finishes (exit 0) with its synapses, partners and circuit identical to the plain run's, no synapse_signs.csv, edges.csv with its four columns, no signs in the summary, and a warning in the console AND the manifest that names what was skipped and why",
        rfm.status === 0 && rft.status === 0 && sameMain(FM) && sameMain(FT) && !fs.existsSync(path.join(FM, "synapse_signs.csv")) && !fs.existsSync(path.join(FT, "synapse_signs.csv")) && Object.keys(csvRows(FM, "edges.csv")[0]).join() === "pre_root_id,post_root_id,synapses,total_size" && Object.keys(csvRows(FT, "edges.csv")[0]).join() === "pre_root_id,post_root_id,synapses,total_size"
        && man13(FM).warnings.some((w) => /the synapse signs was skipped: ValueError: a mistake the server will make again/.test(w)) && man13(FT).warnings.some((w) => /the synapse signs was skipped: STOPPED: synapse signs, chunk 1 of 1 got no good answer from the server after 2 tries \(HTTP 500.*The rest of the export is complete and was written; for this extra run the same command again with a new --out\./.test(w)) && /WARNING: the synapse signs was skipped/.test(rfm.stdout) && /WARNING: the synapse signs was skipped/.test(rft.stdout) && sum13(FM).cells.every((c) => !("signsIn" in c)), (rfm.stderr + rft.stderr).slice(0, 200));
    ok("!! BUT CTRL+C IS STILL A STOP: an interrupt during the sign lookup ends the run with exit 130 and 'STOPPED by you', and no MANIFEST.json is written (the folder is not presented as finished)",
        rfi.status === 130 && /STOPPED by you \(Ctrl\+C\) during synapse signs, chunk 1 of 1/.test(rfi.stderr) && !fs.existsSync(path.join(FI, "MANIFEST.json")), rfi.stderr.slice(0, 200));

    // the tables are found by the stack's naming, or by name
    writeFixture(Object.assign(JSON.parse(JSON.stringify(F13)), { tables: FIXTURE.tables }));
    const NT = outDir("x13_notable"), rnt = run([...X13, "--signs", "--out", NT], { env: E }); watch(rnt, NT);
    with13();
    const BT = outDir("x13_badname"), rbt = run([...X13, "--signs", "--boxes", "--label-table", "nope", "--size-table", "nada", "--out", BT], { env: E }); watch(rbt, BT);
    ok("!! A STACK WITHOUT THE TABLES, OR A NAME THAT IS NOT ONE, IS SAID: no table called synapses_label (pass --label-table); nope is not a table of this stack; nada is not a table of this stack -- each a warning that names the table, the export otherwise complete (exit 0) and no query made to a table that is not there",
        rnt.status === 0 && man13(NT).warnings.some((w) => /the synapse signs was skipped: no table called synapses_label \(pass --label-table\)/.test(w)) && rbt.status === 0 && man13(BT).warnings.some((w) => /the synapse signs was skipped: nope is not a table of this stack/.test(w)) && man13(BT).warnings.some((w) => /the synapse boxes was skipped: nada is not a table of this stack/.test(w))
        && rbt.log.filter((c) => c.call === "query_table" && ["nope", "nada"].includes(c.table)).length === 0 && sameMain(NT) && sameMain(BT));
    with13({ tables: Object.assign({}, F13.tables, { synapse_other_size: { count: 29474316, schema: "bound_2tag", rows: [] } }) });
    const TW = outDir("x13_twosize"), rtw = run([...X13, "--boxes", "--out", TW], { env: E }), TX = outDir("x13_twosize_named"), rtx = run([...X13, "--boxes", "--size-table", "synapse_box_sizes", "--out", TX], { env: E }); watch(rtw, TW); watch(rtx, TX);
    ok("!! TWO TABLES WITH 'size' IN THEIR NAME ARE NOT GUESSED BETWEEN: the warning says 2 tables have 'size' in their name (pass --size-table), no box query is made, and naming the table (--size-table synapse_box_sizes) gets the boxes as before",
        rtw.status === 0 && man13(TW).warnings.some((w) => /the synapse boxes was skipped: 2 tables have 'size' in their name \(pass --size-table\)/.test(w)) && qs(rtw, "synapse_box_sizes").length === 0 && qs(rtw, "synapse_other_size").length === 0 && !fs.existsSync(path.join(TW, "synapse_boxes.csv")) && rtx.status === 0 && csvRows(TX, "synapse_boxes.csv").length === 7 && qs(rtx, "synapse_other_size").length === 0);
    const lab2 = JSON.parse(JSON.stringify(F13)); lab2.tables.synapses_label.rows.forEach((r) => { r.target_id += 5000000; });
    writeFixture(lab2);
    const NJ = outDir("x13_nojoin"), rnj = run([...X13, "--signs", "--out", NJ], { env: E }); watch(rnj, NJ);
    ok("!! A LABEL TABLE WHOSE target_id IS NOT THE SYNAPSE'S ID IS SAID, NOT USED: when no synapse asked for comes back with a tag, the warning says the table returned no tag for any of the 20 synapses and that target_id is not the synapse's id here; there is no synapse_signs.csv and edges.csv has no sign columns (zeros would read as 'all unlabelled', which is a lie about the data)",
        rnj.status === 0 && man13(NJ).warnings.some((w) => /the synapse signs was skipped: the label table synapses_label returned no tag for any of the 20 synapses asked for: its target_id is not the synapse's id/.test(w)) && !fs.existsSync(path.join(NJ, "synapse_signs.csv")) && Object.keys(csvRows(NJ, "edges.csv")[0]).length === 4);

    // the boxes
    with13();
    const BX = outDir("x13_boxes"), rbx = run([...X13, "--boxes", "--out", BX], { env: E }); watch(rbx, BX);
    const bq = qs(rbx, "synapse_box_sizes"), bxr = csvRows(BX, "synapse_boxes.csv"), bro = (id) => bxr.find((r) => r.id === String(id)), vol = (a, b) => { const r = edge(BX, a, b); return r ? r.box_volume_nm3 : "none"; };
    ok("!! --boxes ASKS THE SIZE TABLE TWICE, BY THE POSTSYNAPTIC ROOT ID AND THEN BY THE PRESYNAPTIC, for the cells given: pt2_root_id in [1001, 1002], then pt_root_id in [1001, 1002], at the export's version; the box of the synapse from cell 1001 to cell 1002 is in both answers and is written ONCE (7 rows: four boxes into 1001, the one out of 1001, the one between the cells, the one into 1002 that matches no exported synapse)",
        rbx.status === 0 && bq.length === 2 && Object.keys(bq[0].filter_in_dict).join() === "pt2_root_id" && bq[0].filter_in_dict.pt2_root_id.join() === "1001,1002" && Object.keys(bq[1].filter_in_dict).join() === "pt_root_id" && bq[1].filter_in_dict.pt_root_id.join() === "1001,1002" && bq.every((c) => c.version === 42) && bxr.length === 7 && bxr.filter((r) => r.id === "100023").length === 1, rbx.stderr.slice(0, 200));
    ok("!! THE BOXES CARRY THEIR SIZE IN nm AND THEIR VOLUME, by hand at the table's 8 x 8 x 30 nm voxels: 100007 is 10 x 5 x 2 voxels = 80 x 40 x 60 nm = 192,000 nm^3; 100008 20 x 10 x 1 = 384,000; 100009 5 x 5 x 5 = 240,000; 100010 10 x 10 x 2 = 384,000; 100000 3 x 3 x 3 = 51,840; 100023 2 x 2 x 2 = 15,360; every column the server returned is there as well",
        ["id", "pt_root_id", "pt2_root_id", "pt_position_x", "pt2_position_z", "tag", "tag2", "box_nm_x", "box_nm_y", "box_nm_z", "box_volume_nm3"].every((c) => c in bxr[0]) && bro(100007).box_nm_x === "80.0" && bro(100007).box_nm_y === "40.0" && bro(100007).box_nm_z === "60.0" && Number(bro(100007).box_volume_nm3) === 192000 && Number(bro(100008).box_volume_nm3) === 384000 && Number(bro(100009).box_volume_nm3) === 240000
        && Number(bro(100010).box_volume_nm3) === 384000 && Number(bro(100000).box_volume_nm3) === 51840 && Number(bro(100023).box_volume_nm3) === 15360);
    ok("!! THE JOIN IS COUNTED, AND EDGES TAKE THEIR VOLUME FROM IT: six of the seven boxes carry the id of an exported synapse (the seventh, 777777, does not), the report says so, and edges.csv gains a box_volume_nm3 column summed per pair -- 2004>1001 1,200,000 (four boxes), 1001>2001 51,840, 1001>1002 15,360, every other pair blank; the four old columns are unchanged and there are no sign columns (--signs was not asked)",
        rbx.status === 0 && sum13(BX).extras.boxes.rows === 7 && sum13(BX).extras.boxes.joinedById === 6 && JSON.stringify(sum13(BX).extras.boxes.voxelNm) === "[8,8,30]" && Object.keys(csvRows(BX, "edges.csv")[0]).join() === "pre_root_id,post_root_id,synapses,total_size,box_volume_nm3" && Number(vol(2004, 1001)) === 1200000 && Number(vol(1001, 2001)) === 51840 && Number(vol(1001, 1002)) === 15360
        && vol(1002, 2001) === "" && vol(2001, 1001) === "" && /boxes: 7 rows, 6 carry the id of an exported synapse/.test(rbx.stdout) && /synapse_boxes\.csv/.test(rd(BX, "README.txt")) && !/synapse_signs/.test(rd(BX, "README.txt")) && man13(BX).options.boxes === true);
    with13({ no_voxel_for: ["synapse_box_sizes"] });
    const NV = outDir("x13_novoxel"), rnv = run([...X13, "--boxes", "--out", NV], { env: E }); watch(rnv, NV);
    with13({ tables: Object.assign({}, F13.tables, { synapse_box_sizes: Object.assign({}, F13.tables.synapse_box_sizes, { rows: F13.tables.synapse_box_sizes.rows.map((r) => ({ ...r, id: r.id + 7000000 })) }) }) });
    const NI = outDir("x13_boxnojoin"), rni = run([...X13, "--boxes", "--out", NI], { env: E }); watch(rni, NI);
    ok("!! A SIZE TABLE WITHOUT A VOXEL SIZE, OR WHOSE ids ARE NOT THE SYNAPSES', IS SAID: with no voxel size the boxes are written in voxels only (box_nm_* and box_volume_nm3 blank) with a warning that names the table and edges.csv gets no volume column; when no box carries the id of an exported synapse the warning says the size table's id is not the synapse's id here and edges.csv has no volume column -- the boxes are still written, to look at",
        rnv.status === 0 && bxr.length === 7 && csvRows(NV, "synapse_boxes.csv").length === 7 && csvRows(NV, "synapse_boxes.csv").every((r) => r.box_nm_x === "" && r.box_volume_nm3 === "") && man13(NV).warnings.some((w) => /the size table synapse_box_sizes names no voxel size/.test(w)) && !("box_volume_nm3" in csvRows(NV, "edges.csv")[0])
        && rni.status === 0 && sum13(NI).extras.boxes.joinedById === 0 && man13(NI).warnings.some((w) => /none of the 7 boxes of synapse_box_sizes carries the id of an exported synapse/.test(w)) && csvRows(NI, "synapse_boxes.csv").length === 7 && !("box_volume_nm3" in csvRows(NI, "edges.csv")[0]));

    // both, with the tables listed by --tables
    with13();
    const BO = outDir("x13_both"), rbo = run([...X13, "--signs", "--boxes", "--tables", "soma", "--out", BO], { env: E }); watch(rbo, BO);
    ok("!! BOTH EXTRAS TOGETHER, WITH --tables NARROWING THE LABEL LOOKUP: the tables of the stack are asked for ONCE to find the label and size tables (the --tables list is for the label rows, not for the stack; a run without --tables reuses its own list and asks once too), edges.csv gets the sign columns and then the volume column in that order, the sign and box queries are the same as when run alone, and the manifest carries both reports",
        rbo.status === 0 && rbo.log.filter((c) => c.call === "get_tables").length === 1 && rs.log.filter((c) => c.call === "get_tables").length === 1 && Object.keys(csvRows(BO, "edges.csv")[0]).join() === "pre_root_id,post_root_id,synapses,total_size,excitatory,inhibitory,unlabelled,box_volume_nm3" && qs(rbo, "synapses_label").length === 1 && qs(rbo, "synapse_box_sizes").length === 2 && es(1001, 2001) === "2/1/0"
        && Object.keys(man13(BO).extras).sort().join() === "boxes,signs" && edge(BO, 2004, 1001).excitatory === "1" && Number(edge(BO, 2004, 1001).box_volume_nm3) === 1200000 && /synapse_signs\.csv/.test(rd(BO, "README.txt")) && /synapse_boxes\.csv/.test(rd(BO, "README.txt")), rbo.stderr.slice(0, 200));
    ok("!! THE TOKEN IS IN NONE OF THE NEW FILES: the folders of this section, files and consoles, carry no trace of the token (the stand-in's secret)", ![SG, CK, BX, BO, NV, NI, FM, FT, FI, NT, BT, NJ].some((d) => fs.existsSync(d) && allText(d).includes(TOKEN)) && !(rs.stdout + rs.stderr + rbx.stdout + rbo.stdout).includes(TOKEN));
    writeFixture(FIXTURE);
}

try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* the temp folder is only scratch */ }
finished = true;
console.log(fails ? `\nfishCaveExport-selfcheck: ${fails} FAILED` : "\nfishCaveExport-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
