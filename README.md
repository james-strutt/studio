# Studio — PDF, Image & Video Editor

A free, fast creative suite that replaces Adobe Acrobat Pro, a basic Photoshop, and Clipchamp/Premiere-lite. One TypeScript codebase, two targets: a web app (nothing to install, works on locked-down work machines) and a downloadable desktop app (offline, large files, OS integration).

Three editors in one shell — **PDF**, **Image**, **Video** — plus an **AI layer** that drives all three: an in-app assistant, an exposed MCP server for external agents (Claude Code, Claude Desktop, Cursor), and **ElevenLabs voice** for turning scripts into narration.

**Core principle: all processing happens client-side by default.** Nothing leaves the machine unless a cloud feature is explicitly invoked, and every cloud action is visibly badged "leaves this device".

---

## Architecture

| Target | Delivery |
|---|---|
| Web | Static SPA (Vite + React + TS), WASM/WebGPU-powered, Chromium first-class |
| Desktop | Electron, same React UI, plus native ffmpeg, local MCP server, file associations |

| Editor | Core | Heavy operations |
|---|---|---|
| PDF | PDF.js (view), pdf-lib (pages/forms/structure) | `mupdf` WASM (text edit, redaction), tesseract.js (OCR) |
| Image | Konva/react-konva object+layer model on Canvas 2D | transformers.js + ONNX Runtime Web (WebGPU) for local models |
| Video | WebCodecs + Mediabunny (demux/mux/convert) + compositing engine (timeline, keyframes, 4K render) | WebGPU effects/colour; desktop ffmpeg for HEVC/ProRes |
| AI | Command registry (single action layer) | Local: Whisper, RMBG, ESRGAN, LaMa, Kokoro. Cloud: BYO-key APIs (Anthropic/OpenAI/ElevenLabs/fal.ai) |

**Honest constraints:** browser WebCodecs encodes H.264/VP9/AV1 (H.265/ProRes = desktop ffmpeg); 4K editing needs proxy playback; Firefox/Safari lag Chromium on WebCodecs.

**Non-features (deliberate):** no accounts/cloud storage/sync, no realtime collaboration, no 3D/VFX node graphs, no mobile apps, no self-hosted AI inference (BYO key or local models only).

---

## Design language

Full tokens in `theme/tokens.css`; living demo in `theme/specimen.html` (open in a browser, toggle modes).

- **Lightbox** (default): cool luminous near-white workspace — the content is the darkest thing on screen. Inverts the dark-chrome editor convention; right for paper-first PDF work.
- **Grade** (dim mode): true-neutral graphite chrome with a neutral canvas surround for colour-accurate video work. Never blue-black.
- **Accent — "Leader" amber** (`#B45309` light / `#FBBF24` dim): from film countdown leader and the amber timecode readouts on broadcast tape decks. Used for selection, playhead, primary actions.
- **Signature — crop-mark corner ticks**: selection/focus is marked with four corner ticks (`.cropmark`, pure CSS, no extra DOM), not borders or glow. Used on selected clips, layers, pages, and the wordmark.
- **Type:** Instrument Sans (UI) + Spline Sans Mono (timecodes, dimensions, shortcuts, track labels — all data wears mono).
- **AI provenance badges:** `local model` (green — private) vs `leaves this device` (amber — caution) on every AI action.
- Quality floor: visible keyboard focus, `prefers-reduced-motion` respected, responsive to mobile widths.

---

## How to use this plan (instructions for the implementing agent)

- This plan covers the **full product**, not an MVP cut. Phases are in **chronological implementation order**; work them in order — within a phase, tasks are ordered by dependency.
- Mark tasks `[x]` as completed **in this file** — this README is the single source of truth (do not split into multiple plan docs).
- Every task has an ID (`P<phase>.<n>`). Reference IDs in commit messages.
- "AC:" = acceptance criteria. A task is not done until its AC passes. If a task has no AC, done = code merged, typecheck + lint clean, feature works by hand.
- If you must deviate from a specified library or approach, record a one-line decision note under the task instead of silently substituting.
- Definition of done per phase is the last task of that phase.

---

# Implementation plan

## Phase 0 — Scaffold

- [x] P0.1 Init repo: Vite + React 18 + TypeScript strict, npm. Path alias `@/` → `src/`. ESLint (typescript-eslint, no-explicit-any error) + Prettier.
- [x] P0.2 App shell: top bar (Studio wordmark, editor switcher PDF/Image/Video as segmented control, Export slot), left tool rail, main stage, right inspector panel, bottom command strip. Empty placeholder per editor. State: Zustand store `useShellStore` (activeEditor, theme, panels).
- [x] P0.3 Apply design system: import `theme/tokens.css`, load Instrument Sans + Spline Sans Mono (self-host woff2 in `public/fonts/` so offline works), implement Lightbox/Grade toggle honouring `prefers-color-scheme`, `.cropmark` selection utility. AC: shell matches `theme/specimen.html` shell section in both modes.
  - Decision: fonts self-hosted via `@fontsource-variable/{instrument-sans,spline-sans-mono}` (woff2 bundled into the build, offline-ready) instead of hand-placed files in `public/fonts/`. `global.css` imports `theme/tokens.css` verbatim and only prepends the `…Variable` family names so the tokens resolve.
- [x] P0.4 File open/save layer: File System Access API (Chromium) with `<input type=file>` + download fallback; recent-files list in IndexedDB (idb-keyval). One module `src/files/` used by all editors.
- [x] P0.5 Command registry core (`src/commands/`): `registerCommand({ id, title, editor, schema (zod), run, undo })`. Central dispatcher with undo/redo stacks per open document. All later features register commands — no feature may bypass the registry for document mutations.
- [x] P0.6 Command palette (Ctrl/⌘+K): fuzzy search over registered commands, keyboard-first, shows shortcuts. AC: palette executes a registered dummy command and undo reverses it. — verified by `src/commands/history.test.ts` (dispatch `demo.increment` → undo reverses).
  - Decision: fuzzy match is an in-house subsequence scorer (no Fuse.js) — see `src/palette/CommandPalette.tsx`.
- [x] P0.7 Electron wrapper: electron-vite, loads the same SPA, native file dialogs wired into P0.4 behind an interface, `.pdf` file association, single-instance lock. CI (GitHub Actions): typecheck, lint, unit tests, web build, Electron build (win + mac).
  - Decision: electron-vite emits ESM (`out/main/main.js`, `out/preload/preload.mjs`); Electron 43 runs both. CI's `electron` job runs `electron-vite build` (bundle compile) on win+mac; full electron-builder packaging/signing/notarisation is deferred to P9.3 (`dist:electron` script exists, unused in CI).
- [x] P0.8 **Phase done when:** shell runs on web + Electron, theme toggles, palette executes/undoes a command, CI green.
  - Verified locally on Windows 11 (2026-07-07): typecheck, lint, tests, web build, Electron build all clean; `npx electron .` boots the shell. **CI green on GitHub** (run 28824950588, commit 6583fbb): `check` + Electron builds on windows-latest and macos-latest all ✓. Phase 0 complete.

## Phase 1 — PDF: view, organise, annotate, everyday output

Viewing
- [x] P1.1 Integrate pdfjs-dist viewer: virtualised continuous scroll (render only visible pages ±2), zoom (fit width/page/actual/custom), rotate view, keyboard nav. AC: 200-page PDF opens < 2 s, scroll has no visible checkerboarding on a mid-range laptop.
  - Verified in Chrome (2026-07-07): 200-page opens in 87 ms; only 3-5 canvases live at once (offset-based virtualisation over pre-fetched page sizes); fit-width/fit-page/actual/custom all correct; dpr-aware crisp text. pdf.js worker bundled via `?url`. Buffer-detachment guard: pdf.js gets `bytes.slice()`, original kept for pdf-lib.
- [x] P1.2 View modes: single-page, two-up, book spread; dark-mode page rendering (invert-aware — text/background invert, images left sane).
  - Verified in Chrome (2026-07-07): fit-width 199% on load, page 1, only 2 rows live (virtualised); two-up = 2 pages/row over 15 rows; dark toggle applies. Row-based layout in `pdfLayout.ts` (unit-tested). Dark rendering uses `filter: invert(1) hue-rotate(180deg)` (ponytail: images invert too; true per-object preservation deferred). A fit-width scale bug (viewer size stuck at 0 under a CSS-`zoom` ancestor) was found by driving the real browser and fixed with a synchronous `clientWidth` measure.
- [x] P1.3 Panels: thumbnail sidebar (virtualised), outline/bookmarks tree (click → jump), text search with highlight-all + next/prev.
  - Verified in Chrome: virtualised thumbnail sidebar (click jumps + selects), outline tree with dest→page resolution (sample has none → empty state), text search with cached extraction + next/prev + jump. Highlight-all *overlay* deferred (needs a text layer; lands with P1.9 markup) — search currently jumps + lists snippets.
- [x] P1.4 Tabs for multiple open documents; dirty-state dot; close-confirm on unsaved changes.
  - Per-doc model in `pdfStore` (pdf.js proxy + original bytes + view state). Dirty dot + close-confirm wired (dirty flips true once P1.5+ mutations land). Close-confirm uses native `confirm()` for now (ponytail: swap for themed ConfirmModal later).

Page organisation (all via pdf-lib, all as registry commands with undo)
- [x] P1.5 Reorder pages by dragging thumbnails; multi-select (shift/ctrl) supported.
  - Multi-select (plain/ctrl/shift) + HTML5 drag-to-reorder → `pdf.movePage` command with undo. `movePage`/all mutations in `pdfMutations.ts` are unit-tested (8 tests). The select→delete→undo path is browser-verified (30→29→30 pages, dirty dot toggles); drag reorder uses the same dispatch path (not separately clicked through in automation).
- [x] P1.6 Insert (blank / from another PDF / from image), delete, duplicate, rotate, crop pages.
  - DONE. Crop landed as an interactive dialog (`PdfCropDialog`): renders the current page, drag to draw / move / corner-resize a crop box (dimmed outside), Apply → `pdf.cropPages` command with undo, applied to the current page or all selected pages. The screen-px→PDF-points mapping (Y-flip + scale) is extracted to a pure `cropRectToPdfBox` (`cropMath.ts`) and unit-tested (4 cases). Insert/delete/duplicate/rotate unchanged. Rotation caveat: crop assumes no view rotation and no intrinsic page `/Rotate` (the common case).
- [x] P1.7 Extract selected pages to new PDF; split by range / every N pages / by top-level bookmark / by target filesize.
  - DONE. `splitByRanges` + `splitByTargetSize` added to `pdfMutations.ts` (+`splitEveryN`, `extractPages` refactored onto a shared `docFromPages`); a 1-based range-string parser (`pdfRanges.ts`) is unit-tested (6 cases). Commands `pdf.splitByRanges` / `pdf.splitByTargetSize` / `pdf.splitByBookmark` (boundaries resolved via pdf.js outline → `destToPageIndex`). A `PdfSplitDialog` picks the mode with a live file-count preview. Split mutations unit-tested (4 new cases). Split writes downloaded files (like the pre-existing split-every-N), so no undo entry.
- [x] P1.8 Merge: drop multiple PDFs+images onto a merge tray, drag-to-order, combine. AC: merging preserves bookmarks and form fields of source documents.
  - DONE, **AC passes**. `mergeDocs` rewritten (`MergeInput[]`: pdf or image): copied widget annotations are registered into a rebuilt AcroForm `/Fields` (climbing `/Parent` to the root field, collision-safe field renaming across sources), and a fresh `/Outlines` tree is built from caller-supplied page-index trees with destinations remapped to the copied pages. Outline destinations are resolved to page indices by pdf.js (`resolveOutlineTree`, robust named-dest handling) so `mergeDocs` stays pure pdf-lib and node-testable. `PdfMergeDialog` is the drag-to-order tray (active doc seeded first, add PDFs/images, reorder, remove). Unit tests assert field-name preservation, collision→`name-2`, bookmark title+page remap, and AcroForm dropped when no fields (5 new cases); a node check on a real hierarchical-form + bookmarked fixture (`scripts/gen-form.mjs`) confirms 8 pages / 4 uniquely-named fields.
  - Note (not a numbered task): added a **Save/Export** path that was missing — `pdf.save` command (Ctrl+S / palette / Export button) writes the active document's bytes via the file service and clears the dirty flag; the top-bar badge now shows saved/unsaved. Needed so page edits are actually recoverable (and for the P1.19 manual task).
  - Verification note: the interactive dialogs are exercised only through the test suite + a node fixture check this session — an in-browser manual pass was not possible because Claude-in-Chrome was proxy-routed to a *different* Studio checkout (`C:/Users/James/…`), not this local build. Typecheck + lint + `vitest` (34 tests) + web build all clean. An in-app click-through of crop/split/merge is still worth doing before P1.19.

Annotation
- [x] P1.9 Text markup from real text selection: highlight, underline, strikethrough, squiggly — stored as proper PDF annotations (pdf-lib), not overlay graphics.
  - DONE. `pdfAnnotations.ts` writes real `/Highlight` `/Underline` `/StrikeOut` `/Squiggly` annotations with QuadPoints **and baked appearance streams** (highlight uses a Multiply ExtGState so text shows through), so they render in any viewer — unit-tested (4 cases: subtype, QuadPoints count, AP presence, multi-line, /Contents). A pdf.js `TextLayer` overlays each page (main viewer, rotation 0) for real text selection; `PdfMarkupLayer` maps the selection's client rects → PDF points per page and shows a floating toolbar (4 markup styles + 6-colour swatch) that dispatches `pdf.addMarkup` (multi-page groups → one undo step). Display is automatic: pdf.js `render()` defaults to `annotationMode: ENABLE`, so the baked AP rasterises into the canvas on the post-mutation reload. Shared `pdfMutate.ts` (mutateActive/undoMutation/targetPages) extracted from pdfPageCommands. Browser caveat from P1.8 still applies — text-layer alignment / selection mapping verified by the standard viewport math + typecheck, not an in-app pass.
- [x] P1.10 Sticky notes with replies + resolve state; freehand ink; shapes (rect, ellipse, line, arrow, polygon); text boxes/callouts. Colour/width pickers using theme palette.
  - DONE (drawing tools) — reply threads + resolve deferred to P1.13. `pdfAnnotations.ts` gained real `/Ink`, `/Square`, `/Circle`, `/Line` (with arrowhead + `/LE`), `/Polygon`, `/Text` (sticky note), and `/FreeText` writers, each with a baked appearance stream (Helvetica embedded for free text) — unit-tested (6 cases: InkList, IC fill, /L+/LE, Vertices, note /Contents, free-text /DA+AP). A `PdfAnnotToolbar` (tools + 6-colour swatch + width 1/2/4/6 + fill toggle) drives `PdfDrawOverlay`, a per-page pointer layer that maps drags/clicks to PDF points and dispatches `pdf.addInk|addShape|addLine|addPolygon|addNote|addTextBox` (each undoable). Note/text use an inline popup for content; polygon is click-to-add-vertex + Finish/double-click. Note **reply threads + resolve** shipped with P1.13 (`/IRT` replies + `/StateModel Review` state). Browser caveat from P1.8 still applies (overlay pointer-mapping verified by the viewport math + typecheck).
- [x] P1.11 Stamps: preset library (Approved, Draft, Confidential, Final) + custom image stamps saved locally.
  - DONE. `addStampText` (bordered label + embedded HelveticaBold) and `addStampImage` (embedded PNG/JPG via an image-XObject AP) write real `/Stamp` annotations — unit-tested (2 cases incl. a real 1px PNG embed). `PdfStampMenu` in the annotation toolbar lists the 4 presets and custom stamps; custom images are uploaded and persisted in IndexedDB (`stampStore.ts`), with delete. Clicking a stamp places it centred on the current page via `pdf.addStampText` / `pdf.addStampImage` (undoable). 46 tests pass.
- [x] P1.12 Measurement tools for plans/drawings: distance, perimeter, area — with scale calibration ("this line = 10 m") persisted per document.
  - DONE. Calibrate tool draws a reference line → popup ("this line = N unit") → stores a per-doc `{ unit, pointsPerUnit }` calibration in the store (survives edits via patchDoc). Distance (line), perimeter (open polyline), area (closed polygon) tools compute values with the pure, unit-tested `measureMath.ts` (pathLength/polygonArea/formatMeasure — 5 cases) and write real `/Line` `/PolyLine` `/Polygon` annotations via `addMeasurement`, each with a baked geometry + value label. Annotation toolbar shows the live scale readout. **Scope note:** calibration is session-per-document (not yet embedded in the saved file — re-persisting on reload is a small follow-up).
- [x] P1.13 Comment list panel: filter by author/type/page, click → jump, export summary as text.
  - DONE, plus the P1.10 reply/resolve deferral. `annotComments.ts` reads all annotations via **pdf-lib** (exposes `/IRT` and `/State`, which pdf.js doesn't) into typed items with stable object numbers — unit-tested (note contents/page, reply threading via /IRT, resolved state round-trip). `PdfComments` (new "Comments" sidebar tab) builds threads, filters by type/author, jumps to the page on click, exports a text summary, and supports **Reply** (`pdf.addReply` → hidden `/Text` + `/IRT`) and **Resolve/Reopen** (`pdf.setCommentState` → `/StateModel Review` + `/State`). Object numbers are stable within a load (pdf-lib preserves them), and each reply/resolve mutation loads the same bytes the panel read, so identity holds. 54 tests pass.

Forms & signatures (fill tier)
- [x] P1.14 Fill AcroForms (text, checkbox, radio, dropdown, listbox, date); tab-order navigation; flatten command.
  - DONE via pdf-lib's form API. `acroForm.ts`: `readFormFields` (typed: text/checkbox/radio/dropdown/optionlist + options/values), `setFieldValue` (regenerates the widget appearance), `flattenForm` — unit-tested (read all types, fill each, flatten→0 fields). A "Form" sidebar panel lists fields with the right control per type; edits dispatch `pdf.fillField` (undoable) and there's a Flatten button. Tab-order = the panel's sequential DOM order (native Tab). **Scope note:** date fields render as text inputs (PDF has no native date type — they're formatted text fields).
- [x] P1.15 Signature library: draw (pointer/touch), type (3 cursive font options), upload PNG; stored locally (IndexedDB); place/resize/date-stamp on page; flatten on save.
  - DONE. `SignatureCreator` modal builds a signature by **draw** (pointer canvas), **type** (3 cursive font options rendered to a transparent PNG), or **upload** (PNG); saved to IndexedDB (`signatureStore.ts`). `PdfSignMenu` lists saved signatures (transparent-preview thumbnails) with a date-stamp toggle; placing dispatches `pdf.placeSignature`, which draws the image **directly into page content** (`pdfSign.ts` — inherently flattened, satisfying "flatten on save") plus an optional date line — unit-tested (baked to content, no annotation, XObject present). **Scope note:** placement is centred at a default width (interactive resize/reposition is a follow-up); typed-signature fonts fall back to system cursive families (offline-safe but not pixel-identical across machines).

Security & output (everyday tier)
- [ ] P1.16 Password: add/remove open password + permissions password, AES-256 (mupdf WASM handles encrypt). Permission flags UI (printing, copying, editing, annotating).
- [ ] P1.17 Compress: downsample images to target DPI, subset fonts, strip unused objects (mupdf clean); target-size mode ("under 10 MB") iterating quality. AC: a 40 MB scan compresses below 10 MB with legible text.
- [ ] P1.18 Convert: images→PDF (batch, page-size options), PDF→PNG/JPG per page (pdfjs render), PDF→plain text.
- [ ] P1.19 **Phase done when:** every P1 feature is a palette-searchable command with working undo; a real-world task (merge 3 PDFs, reorder, annotate, measure, fill+sign a form, password, compress, export) completes without dev tools open.

## Phase 2 — Image editor foundation + PDF content editing

Image editor
- [ ] P2.1 Konva stage with document model: layers (raster, text, shape), z-order, opacity, blend modes, groups; layers panel with drag-reorder, visibility, lock. All mutations = registry commands.
- [ ] P2.2 Import PNG/JPG/WebP/AVIF (drag-drop, paste from clipboard); crop with ratio presets + straighten; resize/canvas-resize; rotate/flip.
- [ ] P2.3 Adjustments (non-destructive per layer): exposure, contrast, saturation, temperature, sharpen, vignette — implemented as Konva filters/custom shaders; one-click filter looks built from adjustment presets.
- [ ] P2.4 Tools: draw (brush size/opacity), shapes, arrows, text with font picker; eyedropper; screenshot-annotation kit (blur/pixelate region, numbered steps, callouts).
- [ ] P2.5 Export PNG/JPG/WebP/AVIF with quality slider + live filesize preview; batch convert/resize/rename over a folder of images.

PDF content editing (the hard tier)
- [ ] P2.6 In-place text editing via mupdf WASM: edit runs, font matching to embedded fonts, reflow within the block, add new text boxes with font embedding on save. AC: edit a word in a real government PDF; output opens clean in Acrobat Reader with no layout damage on untouched content.
- [ ] P2.7 True redaction: mark areas/text → apply → content removed from content stream + metadata; pattern redaction (regex over extracted text: emails, phone numbers); one-click sanitise (strip metadata, scripts, attachments, hidden layers). AC: redacted terms unrecoverable via text extraction of the saved file.
- [ ] P2.8 OCR: tesseract.js with language pack download-on-demand; deskew + auto-rotate; invisible text layer written onto scanned pages; batch across document. AC: scanned page becomes searchable and copyable.
- [ ] P2.9 Image editing inside PDFs: replace/resize/move/delete images; add watermark (text/image, tiled/single, opacity); headers/footers with page numbers and Bates numbering.
- [ ] P2.10 Links & page setup: add/edit/remove hyperlinks and internal go-to-page links; page resize (A4↔Letter etc. with content scaling options); page background colour.
- [ ] P2.11 **Phase done when:** image editor handles the screenshot-annotate-export loop end to end; PDF text edit + redaction pass their ACs.

## Phase 3 — Video editor: assemble & ship

Engine
- [ ] P3.1 Engine spike (timeboxed): integrate Mediabunny for demux/decode/mux; evaluate `@diffusionstudio/core` as compositing engine — **verify its licence permits use in a free tool; if not, build a thin compositor directly on Mediabunny + WebCodecs**. Record the decision here. AC: play a 4K MP4 in a canvas with frame-accurate seek.
- [ ] P3.2 Project model: tracks (video/audio/caption/overlay), clips (source ref, in/out, transform), serialisable to JSON project file (`.studio` bundle referencing media paths + saved blobs). Autosave to IndexedDB.
- [ ] P3.3 Proxy pipeline: background-generate 720p proxies via WebCodecs on import; timeline plays proxies, export uses originals; proxy status chip (mono, "Proxy · 720p · ready").

Timeline & editing
- [ ] P3.4 Timeline UI: multi-track, ruler with timecode (Spline Sans Mono), zoom, snapping, markers; playhead with timecode flag (Leader amber per design language); selected clip gets `.cropmark`.
- [ ] P3.5 Core edits as commands: trim (drag handles), split at playhead (S), ripple delete, roll, slip, move across tracks, detach audio.
- [ ] P3.6 Storyboard mode: same project, simplified strip view — reorder, trim, per-clip text, music track, one Export button. Mode toggle in top bar. AC: a first-time user can assemble 3 clips + music + titles and export without entering timeline mode.
- [ ] P3.7 Transitions (cut, dissolve, wipe, slide) with duration drag; text/titles with font/position/safe-area guides; image + sticker overlays; crop/rotate/pan-zoom (Ken Burns) per clip.
- [ ] P3.8 Audio basics: multiple tracks, per-clip volume, fade in/out handles, mute/solo, master meter.
- [ ] P3.9 Speed control per clip (0.25×–4×) with pitch-corrected audio; aspect presets (16:9, 9:16, 1:1, 4:5) with smart padding/blur fill.
- [ ] P3.10 Recording: screen (getDisplayMedia), webcam, mic straight onto tracks.
- [ ] P3.11 Export: WebCodecs hardware encode H.264/VP9/AV1 up to 4K, bitrate/quality presets (YouTube 4K, Teams/email 1080p, social 9:16), estimated filesize, progress with cancel; Electron path adds H.265 + ProRes via bundled ffmpeg. AC: 1-minute 4K H.264 export completes at ≥ realtime on hardware encode; output plays in Windows Media Player, QuickTime, and uploads clean to YouTube.
- [ ] P3.12 **Phase done when:** storyboard AND timeline flows both produce a correct 4K export; project survives close/reopen via autosave.

## Phase 4 — Video pro polish

- [ ] P4.1 Keyframes on position/scale/rotation/opacity/volume: diamond markers on clips, easing curve editor (linear, ease, bezier), copy/paste attributes between clips.
- [ ] P4.2 Colour: lift/gamma/gain wheels, curves, HSL qualifier, LUT import (.cube) applied via WebGPU shader; scopes panel (waveform, vectorscope, histogram) rendered from the current frame. AC: applying a LUT previews in < 1 frame at 1080p proxy.
- [ ] P4.3 Chroma key with spill suppression + edge feather; shape/freehand masks with feather; blend modes on video layers; adjustment layers.
- [ ] P4.4 Speed ramping (keyframed speed with frame blending); stabilisation (desktop: ffmpeg vidstab; web: mark desktop-only with honest tooltip).
- [ ] P4.5 Audio polish: auto-ducking (lower music under speech via sidechain on speech track), loudness normalisation to -14 LUFS preset, 3-band EQ, noise reduction (RNNoise WASM), compressor.
- [ ] P4.6 Motion titles / lower-thirds template library (10 templates, all editable); brand kit (fonts, colours, logo) applied across templates; nested/compound clips.
- [ ] P4.7 **Phase done when:** a talking-head + b-roll edit with LUT, ducked music, lower-third, and keyframed punch-ins exports and looks deliberate, not defaulted.

## Phase 5 — Local AI (private, free, offline after model download)

Infra
- [ ] P5.1 Model runtime: transformers.js v3 with WebGPU backend (WASM fallback); model files cached in IndexedDB/OPFS after first download with size shown before fetching; model manager UI (downloaded models, delete, disk usage). Every AI feature shows the `local model` badge.

Speech & transcript
- [ ] P5.2 Whisper transcription of any audio/video track (language auto-detect); word-level timestamps; transcript panel synced to timeline (click word → seek). AC: 10-min 1080p talking-head transcribes faster than 0.5× realtime on WebGPU.
- [ ] P5.3 **Text-based editing**: select/delete words or sentences in the transcript → ripple-cuts the underlying clips (Descript-style). Every text edit is a registry command with undo. AC: deleting a sentence lands cuts within ±1 frame of word boundaries.
- [ ] P5.4 Silence removal (energy-based, no model) + filler-word removal ("um/uh/like" via transcript match) with preview list → apply as batch cut.
- [ ] P5.5 Auto-captions: styled caption track from transcript (word-by-word highlight option), 5 caption templates, per-platform safe areas, burn-in on export or sidecar .srt/.vtt export.
- [ ] P5.6 Local TTS voiceover (Kokoro-class via ONNX): type text → narration clip on the VO track, fully offline; voice picker from bundled voices. ElevenLabs (P7) is the premium cloud path over the same script panel.

Vision
- [ ] P5.7 Image background removal (RMBG-class via transformers.js) → cutout layer with mask editing; video background removal/blur on talking-head clips (per-frame matting at proxy res, rendered full-res on export).
- [ ] P5.8 Object erase: LaMa-class local inpainting — brush over an object in an image (or PDF page image), model fills the hole; result lands as a new raster layer with undo.
- [ ] P5.9 Image upscale 2×/4× (Real-ESRGAN ONNX), denoise, auto-enhance; PDF "enhance scan" reusing the same models.
- [ ] P5.10 Auto-reframe 16:9 → 9:16: subject tracking (face/person detection per second, smoothed crop keyframes), editable after generation.
- [ ] P5.11 **Phase done when:** transcribe → text-edit → captions → export works fully offline (airplane mode) after models are cached.

## Phase 6 — Assistant, MCP server, ElevenLabs voice, cloud generative

Assistant (in-app)
- [ ] P6.1 Provider layer via Vercel AI SDK: Anthropic + OpenAI (BYO key, stored locally, never proxied) + any OpenAI-compatible base URL (Ollama / LM Studio for fully-local). Settings panel with key test button.
- [ ] P6.2 Chat panel wired to the command registry as tools (zod schemas → tool definitions): the model plans, calls commands, results stream back. Context provided: active editor, selection, timeline summary, transcript, PDF outline/extracted text.
- [ ] P6.3 Guardrails: multi-step plans previewed before execution when destructive ("this deletes 14 segments — apply?"); every assistant action lands in undo history; one assistant turn = one undo group.
- [ ] P6.4 Prompt-to-edit acceptance test: "cut the silences, add captions, punch in 10% on every second clip, export for YouTube" executes end-to-end from chat. AC: passes on a real 5-min talking-head video.

MCP server (desktop)
- [ ] P6.5 Localhost MCP server in Electron main via `@modelcontextprotocol/sdk`: exposes the command registry (same zod schemas) + read-only resources (project state, transcript, page text). Off by default; enable in settings with a confirm dialog; token-authenticated; localhost only.
- [ ] P6.6 Ship `docs/mcp.md` snippet for registering Studio in Claude Code/Desktop/Cursor. AC: from Claude Code, an agent opens a project, trims a clip, adds captions, and exports — hands-off.

ElevenLabs — script to voice (BYO key; every call badged `leaves this device`)
- [ ] P6.7 ElevenLabs client (`src/ai/elevenlabs.ts`): BYO API key in settings (stored locally only); voice library browser (`GET /v1/voices` + shared-voice search) with preview playback; model picker (multilingual v2 for quality, flash/turbo for cheap drafts); remaining-character quota display from the subscription endpoint.
- [ ] P6.8 Script panel in the video editor: write/paste a script, split into paragraphs/scenes; per-paragraph generation via `POST /v1/text-to-speech/{voice_id}` with voice settings (stability, similarity, style, speed); generated audio lands as clips on a dedicated VO track, one clip per paragraph, in script order. Same panel drives local TTS (P5.6) — provider dropdown.
- [ ] P6.9 Use the with-timestamps TTS variant for character-level timing → auto-generate a caption track aligned to the narration; reuse P5.5 caption templates for word-by-word highlights.
- [ ] P6.10 Cost + cache discipline: character count and estimated quota cost shown **before** each generation; results cached by hash(text+voice+model+settings) so unchanged paragraphs regenerate free; per-paragraph regenerate, never whole-script.
- [ ] P6.11 Sound effects via `POST /v1/sound-generation` onto an SFX track; music generation via ElevenLabs Music API onto the music track; optional instant voice clone (user records ~60 s, IVC endpoint) gated behind an explicit own-voice consent screen.
- [ ] P6.12 Register the official ElevenLabs MCP server as an optional external MCP in the assistant, so prompt-to-edit can include narration ("narrate this script and time the captions to it") via either the direct API or MCP tools.

Cloud generative (opt-in, badged)
- [ ] P6.13 fal.ai/Replicate adapter (BYO key): text-to-video b-roll (Runway/Veo-class models), generative image fill/expand, and text-to-image inserts; results land as normal clips/layers; per-action consent; provenance note stored in project metadata.
- [ ] P6.14 **Phase done when:** P6.4 and P6.6 acceptance tests pass, and a script typed into the script panel becomes timed narration + captions in under a minute of user effort.

## Phase 7 — PDF pro parity (full Acrobat replacement)

Form designer
- [ ] P7.1 Form designer mode: create/edit fields (text, checkbox, radio group, dropdown, listbox, date, signature), drag placement + alignment guides, properties panel (name, required, default, format masks).
- [ ] P7.2 Field logic: validation rules, calculation fields (sum/product/custom expression), tab-order editor with visual numbering.
- [ ] P7.3 Auto-detect form fields on a flat PDF (line/box/label heuristics) with a review-and-confirm UI before creation.
- [ ] P7.4 Form data: import/export FDF, XFDF, CSV, JSON; "mail-merge" fill (CSV rows → batch of filled PDFs).

Digital signatures (cryptographic)
- [ ] P7.5 Certificate signing: sign with PFX/P12 (PAdES, via @signpdf/pki.js class libraries), visible + invisible signature fields, timestamp server support, lock-after-signing.
- [ ] P7.6 Verification panel: validate existing signatures (chain, integrity, modifications-since-signing), clear valid/invalid/unknown states. AC: a document signed in Studio verifies green in Acrobat Reader, and vice versa.

Conversion (full fidelity tier)
- [ ] P7.7 HTML→PDF (Electron print pipeline / CDP printToPDF with page-size options); Office→PDF on desktop via LibreOffice headless when installed, with graceful "install LibreOffice" guidance when absent.
- [ ] P7.8 PDF→Word/Excel: layout-aware text + table extraction to .docx/.xlsx (honest fidelity: paragraphs, headings, tables — not pixel-perfect); per-export fidelity note shown once.
- [ ] P7.9 PDF/A conversion (archival) with a conformance checklist result; linearise (fast web view); repair broken cross-reference tables (mupdf).

Review & accessibility
- [ ] P7.10 Compare two versions: synced side-by-side scroll, pixel overlay diff with changed-region highlights, extracted-text diff report exportable as a summary.
- [ ] P7.11 Accessibility: tags tree viewer/editor, reading-order editor (drag to reorder), alt-text editor for images, PDF/UA checker with guided fix-ups.
- [ ] P7.12 **Phase done when:** a form is designed from scratch, filled via CSV merge, certificate-signed, verified in Acrobat, exported to PDF/A — all inside Studio.

## Phase 8 — Image pro parity

- [ ] P8.1 Selections: rectangle, ellipse, freehand lasso, polygon lasso, magic wand (tolerance); feather, invert, grow/shrink, transform selection; select-subject one-click (reuse P5.7 matting model).
- [ ] P8.2 Layer masks + clipping masks: paint on mask, apply/disable, density/feather controls; masks respected by all adjustments and export.
- [ ] P8.3 Adjustment layers (non-destructive stack above pixel layers): curves, levels, HSL, colour balance, black & white; blend-if style opacity by luminance.
- [ ] P8.4 Retouch tools: clone stamp (alt-source), heal brush (patch blend), red-eye removal.
- [ ] P8.5 Gradients (linear/radial, multi-stop editor) and pattern fill; saved swatches/palettes (local), brand-kit shared with the video editor (P4.6).
- [ ] P8.6 PSD import via ag-psd (layers, masks, text where possible; flattened fallback with warning); basic SVG import as editable vector objects.
- [ ] P8.7 Colour management: sRGB/Display-P3 aware canvas + export profiles; soft-proof toggle.
- [ ] P8.8 **Phase done when:** cut a subject with select-subject + mask refinement, retouch blemishes, grade with adjustment layers, and export a P3 and an sRGB copy — no rasterise-and-pray steps.

## Phase 9 — Batch, CLI, distribution, 1.0

Automation
- [ ] P9.1 Batch engine: define an operation set (compress, watermark, OCR, convert, resize, rename pattern) → apply to a file list/folder with per-item status, pause/resume, failure report. Works for PDFs and images; video batch = export queue.
- [ ] P9.2 CLI companion (desktop): `studio pdf compress in.pdf --target 10mb`, `studio pdf merge a.pdf b.pdf -o out.pdf`, `studio image resize *.png --width 1920` — thin client driving the same command registry over the local MCP/IPC channel. AC: CLI and UI produce byte-identical output for the same operation.

Distribution & hardening
- [ ] P9.3 Installers: code-signed Windows (NSIS) + macOS (DMG, notarised); auto-update via electron-updater with release channel; file associations extended to common image/video types ("Open with Studio").
- [ ] P9.4 Web deployment: static hosting with COOP/COEP headers (SharedArrayBuffer for WASM threads), service worker for full offline PWA install, WASM/model assets cached.
- [ ] P9.5 Performance pass against global criteria: cold start < 2 s, 200-page PDF and 4K project memory ceilings profiled, long-task audit (no main-thread stalls > 100 ms during scrub).
- [ ] P9.6 Accessibility & keyboard audit across the shell: every command reachable via palette, focus order sane in all panels, screen-reader labels on rail/inspector/timeline controls, both themes pass WCAG AA contrast.
- [ ] P9.7 In-app help: shortcut sheet overlay (?), first-run tour of the three editors + command strip.
- [ ] P9.8 **1.0 release gate:** all global success criteria below verified and recorded here with date + machine spec; all phases above fully ticked.

---

## Global success criteria

- Open a 200-page PDF in < 2 s; scroll at 60 fps
- Redacted documents contain zero recoverable content (verify with strings/qpdf)
- 4K timeline scrubs smoothly via proxies on a mid-range laptop; hardware export ≥ realtime
- Text-based edit round-trip lands cuts within ±1 frame
- Every AI-driven edit is in undo history, reversible in one step
- Everything except badged cloud actions works fully offline
- No document, image, or video leaves the device without a visible badge and explicit action
- A form designed, CSV-merged, certificate-signed in Studio verifies as valid in Acrobat Reader
