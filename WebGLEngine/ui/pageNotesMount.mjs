// WebGLEngine/ui/pageNotesMount.mjs -- UNNUMBERED. The one line a page includes to show its Notes row:
//   <script type="module" src="/ui/pageNotesMount.mjs"></script>
// (and, where the row should sit inside the page instead of floating in the corner, <div id="swek-notes"></div>). The logic is ui/pageNotes.mjs.
import { mountNotes } from "/ui/pageNotes.mjs";
mountNotes(document, (u, o) => fetch(u, o), location);
