# PetFBI pipeline — porting notes from R_clean401.py (Keith's working Python)

This captures the REAL, working extraction + FB-post mechanics from Keith's
Python version, so the engine build ports proven logic instead of guessing.
(The newest VBA — vertical-toolbar version — will refine this; update when it lands.)

## The report parser (FBIreport + Key sheet)
- status = first word of report ("Lost"/"Found"), type = second word ("Cat"/"Dog").
- Fields are extracted by SUBSTRING DELIMITERS defined in an Excel **Key** sheet:
  each row is (target-name, left-delimiter, right-delimiter); getSubstring pulls
  the text between them from the report. Rows with empty target define a
  replacement pair used to clean the just-extracted value.
- So the parser is DATA-DRIVEN by the workbook, not hardcoded. Our v2091/v2092
  parser hardcodes the equivalent fields (title/petType/sex/status/reportId/
  location) — good enough for the board, but the Key-sheet approach is how Keith
  tunes it when PetFBI's format shifts.

## The post text (Templates sheet + placeholders)
- Post body template chosen by [status][type], e.g. Templates[Lost][Cat].
- Placeholders filled from the report: [SUBID], [ADD1], [NEIGHBORHOOD], [AREA],
  and crucially the GENDER pair:
    [GENDER-HE/SHE]   -> "he"  (Male)  / "she" (Female)
    [GENDER-HER/HIS]  -> "his" (Male)  / "her" (Female)
  Filled from the report's M/F field. THIS is why sex is the one detail kept:
  it drives the post's pronouns.

## Image + map extraction (the page-fetch pass we still need to build)
- PET PIC: GET the report page; the page JSON contains  picture_file":"<file>"
  -> the image URL is  https://images.petfbi.org/<file>  -> save Pet.jpg
- MAP: build a Google search URL from STREET+TOWN+STATE+ZIP (with " and "->"+",
  spaces/commas->"+"), GET it, then scrape the Google Maps tile token:
    start = 'vt/data\\u003d'  end = '"};'
  -> https://www.google.com/maps/vt/data=<token>  -> save Map.png
  NOTE: this is a brittle Google-scrape. Both PetFBI and PawBoost pages have
  REAL GPS coords in their HTML (Keith confirmed) — prefer those + a proper
  static-map when we build this, rather than re-scraping Google.
- FLYER (NEW, not in this Python version): PetFBI now auto-generates a flyer
  image on the report page; grab + store it too (Pet.jpg = owner pic, Flyer.png
  = generated flyer). PawBoost has a "Download Lost Pet Flyer" too.

## The Facebook post injection (assisted, no API — matches Keith's VBA)
Sequence, per post:
1. Open the FB business composer for the target page in Chrome.
2. Admin clicks "add photo" -> the OS file-open dialog appears.
3. Code waits for the dialog by window title: winWaitFor("Open").
4. Type BOTH image paths into the filename field, space-separated + quoted, then
   Enter — the dialog loads multiple files at once:
     "c:\\downloads\\Pet.jpg" "c:\\downloads\\Map.png"\n
5. Shift+Tab x2 to move from the filename field back into the composer text area.
6. Paste the filled post text (parse_OutBlock).
7. Admin reviews and clicks Post.
Volume: ~5 posts/hour, human-paced. Assisted, NEVER auto-post.

## Two FB destinations (per Keith)
- **MA Lost Pets** page: post PET PIC + MAP + info text.
- **Official Lost Dogs Massachusetts / Lost Cats Massachusetts**: post the PetFBI
  FLYER image + the same info text.
The Python picks the page by type (Dog/Cat) from an "MA Pages" sheet
(fbPageList, matched on a DOG/CAT tag). Board should carry per-destination
image sets: {MA Lost Pets: [pet, map]}, {Official: [flyer]}, shared text.

## What the BOARD must hand the poster (VBA/Python)
Per report, once assembled:
- the filled POST TEXT (with gender pronouns resolved), and
- LOCAL FILE PATHS to the images it needs (Pet.jpg, Map.png, Flyer.png).
The poster's file-dialog trick needs real on-disk paths, so the bridge must
DOWNLOAD the images locally first and store their paths on the report.

## Build order (next pass, against real JSON-LD + newest VBA)
1. Extend petfbi_grab.py: GPS from the page (JSON-LD / coords), picture_file ->
   pet pic, the new flyer image; return {gps, petImg, flyerImg}.
2. pawboost_grab.py sibling: same three from the pawboost landing page.
3. Bridge: on ingest (or a "fetch page" button), pull GPS + download pet/flyer/
   map images to a local folder; store paths + gps + mapUrl on the report.
4. Board: per-destination composed post (text + image path set), with a
   copy-text button and the file paths shown, so the VBA can pick them up.

## THE WORKBOOK (R_clean.xls) — the data that drives everything

Keith's workbook is the real config. Sheets: Quick Replies, Key, MA Pages,
ME Pages, RI Pages, CT Pages, NH Pages, PetFBIo, Templates, Template.

### Key sheet (42 rows) — the parser rules (target, left-delim, right-delim)
Rows with a TARGET name extract that field by substring between the two
delimiters; rows with an EMPTY target are text-CLEANUP replacements applied to
the just-extracted value. The real field set:
  STATUS ('' .. ' '), TYPE ('' .. ' - '), NAME (' -' ..), DATE ('Date Lost:' ..),
  DESCRIPTION ('Description:' ..), EMAIL ('Email: ' .. '@'),
  PHONE1 ('Primary:' ..), PETIDNUM ('Pet FBI Report ID:' ..),
  BREED ('Breed:' ..), COLOR ('Color:' ..), AGE ('Age:' ..),
  COLLAR ('Collar:' ..), GENDER ('M/F:' ..),
  STREET ('Location Specifics:' .. ','), ADDRESS2 (', ' ..),
  STATE ('State, Zip:' .. ','), ZIP (',' ..), COMMENT ('Comments:' ..).
Cleanup rows normalize e.g. "microchipped" spelling, "German Shepard"->"Shepherd",
"Silver or Gray"->"Gray", " Ln "->" Lane ", " x "/" X "->" at ", "Tan or Cream"
->"Tan", "Domestic Long/Short/Medium Hair." collapses, "e?s"->"e's", etc.
Our v2092 hardcodes the equivalent extraction; the Key sheet is how Keith TUNES
it — worth loading the sheet directly so his cleanups carry over.

### Templates sheet — post body keyed by [PetFBI status] x [type column]
Rows: Lost, Found, Spotted, Deceased (+ continuation rows for Bird/Lizard).
Columns: Cat, Dog, Bird, Rabbit, Lizard, Other, Mammal.
Placeholders in the body: [TOWN] [STATE] [COLOR] [STREET] [NEIGHBORHOOD] [AREA]
[NAME] [BREED] [DATE] [COLLAR] [DESCRIPTION] [COMMENT] [EMAIL] [PHONE1] [PHONE2]
[PETIDNUM] [EMAILNAME], and the gender pair [GENDER-HE/SHE] / [GENDER-HER/HIS].
Example (Lost/Cat): ">>  [TOWN], [STATE] - Lost [COLOR] Cat ... [GENDER-HER/HIS]
name is [NAME] and is a [BREED]. [GENDER-HE/SHE] has been missing since [DATE].
... Please share and email [EMAIL]@contact.petfbi.org ... PetFBI: https://petfbi.org/api/view/[PETIDNUM]".
The leading marker (>> / << / ^^ / ** / __) tags the status flavor.

### Gender fill (confirmed): from GENDER field,
  Male   -> [GENDER-HE/SHE]="he",  [GENDER-HER/HIS]="his"
  Female -> [GENDER-HE/SHE]="she", [GENDER-HER/HIS]="her"

### MA Pages (240 rows) — town -> Facebook page routing
Columns: fbPage, fbURL, fbPageID, Town, BusinessID. The report's TOWN is matched
against the Town column to pick the local town page; special tag rows drive the
statewide pages:
  Row 0  "MA Lost Pets"            Town="Default"  (the catch-all statewide page)
  Row 1  "Lost Dogs Massachusetts" Town="DOG"      (matched when type==Dog)
  plus a CAT statewide, BIRD ("New England Lost & Found Birds"), ADVOCATE, etc.
BusinessID (1781360465418747) is the FB business account that owns them.
Per-state sheets: RI Pages (38), CT Pages (44), NH Pages (14), ME Pages (2).
So the FULL routing is: post to (a) the town's local page if found, AND (b) the
statewide page(s): "MA Lost Pets" always, plus "Lost Dogs/Cats Massachusetts"
by type. THIS is the two-destination logic — richer than first described:
town page + statewide, with the official statewide getting the flyer.

### PetFBIo sheet — the live scratch/staging area
Columns: "Post Inbox text here:", "Info Fields:", "Pulled Infos:",
"PetFBI report here:", "Picture:", "Map:" — the working surface where a report
is pasted, parsed, and the picture/map get staged. This is essentially the
single-report version of what the board now does.

### PORT PLAN REFINEMENT
When building the composer, load these sheets rather than reinventing:
- Key -> the field extractors + cleanups (drop-in tune-ability).
- Templates -> the post text per status x type, with the placeholder + gender fill.
- {STATE} Pages -> town->page routing; post to town page + statewide, official
  statewide gets the flyer image, MA Lost Pets gets pet pic + map.
These sheets should live with the board (or be importable) so Keith keeps
editing his templates/pages in one place, and the engine composes from them.

## NEWEST VBA (FBISheetLibrary2_ai.xlsb) — the definitive ground truth

The vertical-toolbar workbook. 90+ modules; the ones that matter:
ai_PetFBI.bas (orchestration), ai_FBPosts.bas (posting), ImageLibrary.bas,
ai_Google.bas (maps). Key procedures: ConvertReport2Post, ConvertReport,
PawBoostConvertReport, DownloadPetFBIImg, FBIimageDownload, FBPostInjection.

### GPS is in the page HTML (CONFIRMED — replaces the Google-tile scrape)
FBIimageDownload fetches https://petfbi.org/api/view/<ID>/<emailname>#/ and reads
the coords straight out of the HTML:
    fbiLong = GetStringBetween(html, "geo_longitude\\:", ",\\geo_latitude")
    fbilat  = GetStringBetween(html, "geo_latitude\\:", ",\\location_state")
Then DecimalToDMS(lat)/DecimalToDMS(long) -> a Google Maps search for the map
image. So the build should read geo_longitude/geo_latitude from the page JSON
(both PetFBI and, per Keith, PawBoost have real coords) rather than re-scraping
Google tiles. Much more robust than R_clean401.py's approach.

### Pet image — og:image (more robust than picture_file)
    PicStart = InStr(1, html, "g:image") + 18   ' the og:image meta content
    PetFBIImg = Mid(html, PicStart, 100); trim at ".jpeg"
    SaveWebFile(PetFBIImgURL, "C:\\Downloads\\Pet.jpg")
Falls back to the "picture_file":"pic<ID>_...jpeg" pattern (DownloadPetFBIImg).
Guard: if the page contains "reunited with their family" -> speak "Reunited" and
STOP (don't post). That's a real ingest rule: a reunited pet is not posted.

### Flyer image — the auto-generated PetFBI flyer
URL pattern:  https://petfbi.org/admin.html#/flyer/<PetID>
(the new pre-generated flyer Keith mentioned). This is the image the OFFICIAL
statewide pages get.

### PawBoost parse (PawBoostConvertReport) — matches our v2092 parser
Pairs label-line + value-line (the "value on next line" format), then pulls:
NAME:, STATUS: (ProperCase), SEX:, SPECIES:, MESSAGE FROM OWNER: (-> comment),
DESCRIPTION:, PAWBOOST ID:. An 8-char input is treated as a bare ID -> load the
detail page by ID. Coat field tagged "PAWBOOST" as the source marker.

### The FB post injection (FBPostInjection) — the EXACT sequence to feed
1. WaitForWindow("Meta Business Suite")  ' composer page loaded
2. Speak: prompt admin to click "Add Photo"
3. While winTitle <> "Open": wait   ' the OS file dialog
4. Clipboard = Chr(34) & "c:\\Downloads\\Pet.jpg" & Chr(34) & Chr(34) &
   "c:\\Downloads\\Map.png" & Chr(34)     ' BOTH paths, quoted, back-to-back
5. SendCtrlV_API (paste into the filename field) -> SendKeys "{ENTER}"
   -> wait while winTitle = "Open" (dialog closes, images load)
6. Clipboard = the composed post text (ClipboardFromReportCell)
7. SimulateTabKey x2  ' move from filename field back into the composer body
8. SendCtrlV_API      ' paste the text
9. Speak "DONE. Please Review and Submit."  ' admin clicks Post
So the board must produce, per post: the composed TEXT (on clipboard/into a cell)
and Pet.jpg + Map.png (+ Flyer.png for official) as real files at known paths.
Refinement over R_clean401.py: uses a clipboard-paste API (SendCtrlV_API), not
pyautogui.typewrite, and waits on "Meta Business Suite" + "Open" by title.

### What this locks in for the engine build
- Page fetch: GET the report page; extract geo_longitude/geo_latitude, og:image
  (pet pic), and the flyer URL /admin.html#/flyer/<id>. Honor the "reunited" ->
  don't-post guard.
- Map: from real GPS (DMS or a proper static-map), not a Google-tile scrape.
- Download Pet.jpg / Map.png / Flyer.png to a known local folder; store paths.
- Compose text from the Templates sheet (status x type, gender fill).
- Route per {STATE} Pages: town page + statewide; official statewide gets flyer,
  MA Lost Pets gets pet pic + map.
- Hand the poster (VBA/Python or a JS equivalent) the composed text + file paths;
  the file-dialog injection is the assisted, ~5/hour, never-auto post step.

## BUILD DECISIONS (locked with Keith)

### 1. HTML grabs are ALSO sheet-tunable (like the Key sheet)
Keith's whole philosophy: when the online HTML changes, adjust the FILTER in the
spreadsheet, not the code. The report-TEXT fields already work that way (Key
sheet). We extend the SAME idea to the PAGE-HTML grabs (GPS / pet pic / flyer),
which the VBA currently hardcodes. Add a new sheet -- proposed name "HTMLKey" --
with the same (target, left-delim, right-delim) shape the Key sheet uses, seeded
from the VBA's current patterns:

  target        left-delim                 right-delim
  ---------     -------------------------  ----------------------
  GEO_LONG      geo_longitude\:            ,\geo_latitude
  GEO_LAT       geo_latitude\:             ,\location_state
  PETPIC        g:image" content="         "            (og:image; fallback below)
  PETPIC_ALT    "picture_file":"           "            (pic<ID>_....jpeg pattern)
  FLYER_ID      (petId)                    (n/a -> URL template below)
  REUNITED      reunited with their family (presence flag -> archive, don't post)

Plus a couple of URL templates (own tiny sheet or a Config block):
  REPORT_PAGE   https://petfbi.org/api/view/{ID}/{EMAILNAME}#/
  PETPIC_BASE   https://images.petfbi.org/{file}
  FLYER_URL     https://petfbi.org/admin.html#/flyer/{ID}
  PAWBOOST_PAGE {the pawboost landing link from the email}

When PetFBI renames geo_longitude or moves the flyer, Keith edits HTMLKey /
the URL templates -- no engine code change. Source-specific rules: a "source"
column (petfbi / pawboost) or parallel sheets so each site's grabs are tuned
independently. The engine's grab step is a generic "apply these (left,right)
rules to the fetched HTML", identical in spirit to the Key-sheet text parser.

### 2. The engine reads a SYNCED COPY in its tree (not the live workbook)
The board reads its own copy of the sheets from the engine tree (e.g.
PetFBI/config/), NOT Keith's live R_clean.xls. Why: the live file may be open/
locked in Excel, moved, or mid-edit -- the engine must never depend on that.
Keith IMPORTS/refreshes from his master when he updates templates or page lists
(a "sync sheets" action). So: master workbook = Keith's; engine copy = derived,
refreshed on demand. The sync can export the needed sheets (Key, HTMLKey,
Templates, {STATE} Pages, URL templates) to a format the bridge reads easily
(the .xlsb/.xls directly via a reader, or a generated JSON snapshot -- decide at
build time; JSON is simplest for the Node bridge + lets the board show them).

### BUILD ORDER (next session, substantial)
1. Sheet sync/import: read Key + HTMLKey + Templates + {STATE} Pages + URL
   templates from Keith's workbook -> engine copy (xlsb reader or JSON snapshot).
   DECISION (Keith): JSON SNAPSHOT. A "sync sheets" action exports the needed
   sheets to a JSON file in the engine tree (PetFBI/config/petfbi-sheets.json);
   the bridge reads JSON trivially and the board can display the rules. Keith's
   workbook stays the master; the sync is one button, run when he edits
   templates/pages. Node does NOT read .xlsb natively, so the export is done by
   a small Python step (openpyxl/xlrd/pyxlsb) that the bridge shells out to, OR
   pre-generated. JSON is fast, robust, and inspectable.
2. Bridge page-fetch: GET report page; apply HTMLKey rules -> GPS, pic, flyer,
   reunited-flag. Honor reunited -> archive+skip-post.
3. Image download: Pet.jpg / Map.png (from GPS) / Flyer.png -> local folder;
   store paths + gps on the report.
4. Compose: fill the Templates post text (status x type, gender) from the report.
5. Route: town page + statewide from {STATE} Pages; official gets flyer, MA Lost
   Pets gets pic+map.
6. Handoff: board hands the poster the composed text + local image paths for the
   file-dialog injection (assisted, never auto).
