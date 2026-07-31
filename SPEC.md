# Genre-to-Folder Organizer SRS (Condensed)

## 1. Document Control
- Type: Software Requirements Specification
- Version: 1.4 (condensed)
- Last updated: 2026-07-31

## 2. Problem and Goal
Many players treat multi-genre tags as a single string, reducing discoverability. The product scans a source library, maps genres to target folders, plans deterministic updates, applies copy/delete safely, and persists state for incremental sync.

## 3. Scope
In scope:
- Android-first React Native app (JavaScript)
- Recursive local scanning, extension filtering, metadata extraction
- Genre parsing and one-to-many destination mapping
- Incremental plan generation and apply (copy/delete)
- Local artifacts, logs, and progress UI

Out of scope:
- Cloud or remote storage sync
- Metadata editing/tag writing
- Playlist features

## 4. Constraints
- Runtime: Android UI flow only; distributable builds must be installable Android APKs generated via GitHub Actions
- Tech: React Native + JavaScript
- Data persistence: local JSON artifacts
- UI must follow approved design mocks unless explicitly re-approved
- Home screen design source: designs/Home - screen.png
- File processing screen design source: designs/Processing - screen.png

## 5. Configuration Contract
```json
{
  "source": "<absolute path>",
  "target": "<absolute path>",
  "allowedExtentions": ["mp3", "wma", "flac", "wav", "aac"],
  "genreToFolder": {
    "GenreName": ["Sub/Folder/Path"],
    "Others": "FallbackFolder"
  }
}
```
Rules:
- source: required, readable
- source must be on internal (non-removable) device storage
- target: required, writable for apply
- source and target must not resolve to the same folder path
- allowedExtentions: case-insensitive allowlist
- Others: fallback mapping

## 6. Artifact Contract
- db.json: canonical source state and resolved targets
- stats.json: run classifications
- toupdate.json: planned copy/update entries
- todelete.json: planned delete entries
- update flag: exists when pending operations remain
- log.txt: append-only run log
- operations-<timestamp>.log: per-run operation log

stats.json categories must include:
- filesToProcess, filesIgnored, newFiles, changedFiles, unchangedFiles
- filesWithNoGenre, parseStatErrors, filesToDeleteFromTarget

## 7. Functional Requirements

### FR-001 Validation and Discovery
- Fail fast on invalid config (missing/invalid source or target).
- Fail fast if source and target folders are the same path.
- Fail fast if source is on removable/external storage.
- Recursively discover source files and classify by extension.

### FR-002 Metadata and Genre Parsing
- Parse metadata (title, artist, genre, album, ctime, mtime) for kept files.
- Genre input supports arrays and delimiter-split strings (comma, semicolon, slash).
- Trim tokens, ignore empty values, deduplicate case-insensitively.

### FR-003 Missing Genre Handling
- Files with empty/missing genre are listed under Missing Genre.
- They are not processed further for sync in that run.
- They are excluded from toupdate/todelete and from apply operations.

### FR-004 Files With Error Handling
- Files with read/parse/stat/access errors are listed under Files With Error.
- Each entry shows filename/path and error text adjacent to filename.
- They are not processed further for sync in that run.
- They are excluded from toupdate/todelete and from apply operations.

### FR-005 Target Resolution
- Resolve one or more target paths per file using genreToFolder.
- Unmapped genres route to Others fallback.
- Deduplicate target paths per file.

### FR-006 Incremental Planning
- New file: absent from db => add to toupdate.
- Changed file: ctime changed => add to toupdate.
- Unchanged file: ctime equal => unchanged.
- Missing from source but in db => add to todelete.
- If changed file has destination-set changes, stale targets must be planned for delete.

### FR-007 Apply Semantics
- Apply order: delete planned targets first, then copy planned targets.
- Copy overwrites destination files without per-file prompt.
- After successful operations, update db and clear fulfilled plan entries.
- Preserve pending entries when operations fail.

### FR-008 Idempotency and Determinism
- No-change rerun produces no planned operations.
- Same inputs produce same outputs and artifacts.

### FR-009 Logging and Observability
- Record validation, planning summary, and apply outcomes.
- Timestamped operation logs must include timestamp, type, source, destination/target, and status.

### FR-010 Main Screen
- Show source/target selectors and current paths.
- Show summary counts (Total, To Copy, To Delete, Files With Error).
- Provide sections/tabs: Ready to Sync, Missing Genre, Files With Error.
- Ready to Sync shows copy candidates with resolved destination paths.
- Show cleanup/delete list with reason labels.
- Provide Start Sync action that transitions to the processing screen and performs dry-run planning.
- Source files must be read only after user presses Start.
- Start must not execute real file copy/delete operations.

### FR-011 Selection Before Copy
- User can select/deselect copy-eligible files before apply.
- Only selected files are included in copy execution.

### FR-012 Sync Progress Screen
- Dedicated apply screen with percent, counts, ETA, and progress bar.
- The overall processing screen must be vertically scrollable when content exceeds viewport height.
- Separate Copying & Overwriting and Cleanup & Deletions sections.
- Both sections independently scrollable.
- User must be able to reach all sections and action buttons (for example, View Sync Log and Back) even with large lists.
- Show per-item state (queued, in-progress, completed, failed, skipped where applicable).
- Multi-destination files must show grouped/clear destination rows.
- Include a section that shows the file currently under processing when real sync is running.
- After dry-run planning, expose a Sync Now action that executes actual add/copy/delete operations.
- Dry-run mode must list planned add/copy, delete, and error items without mutating target files.
- Include View Sync Log action and active log reference.
- Screen layout and visual hierarchy shall follow designs/Processing - screen.png.

### FR-013 Home and Access Flow
- Home screen is entry point for source/target selection.
- When source is selected by user or loaded from configuration, show the active source path on home screen.
- When target is selected by user or loaded from configuration, show the active target path on home screen.
- Prevent selecting the same folder for source and target.
- Prevent selecting source from removable/external storage; show actionable guidance.
- Show clear empty states when folders are not selected.
- Show contextual errors for invalid/inaccessible paths.
- Start Sync is enabled only when prerequisites are met.
- If removable/external storage permission is needed, provide request flow.
- Screen layout and visual hierarchy shall follow designs/Home - screen.png.

### FR-014 Settings
- Settings accessible from home or main screen.
- Supports editing genre mapping, extension filters, reset/clear config, and log access.

### FR-015 Screen Controller Separation
- Home screen logic and processing screen logic must be implemented in separate code modules/controllers.
- Home screen module/controller handles folder selection, validation prompts, and dry-run entry actions.
- Processing screen module/controller handles dry-run display state, current-file-in-process updates, and Sync Now apply execution.

## 8. Non-Functional Requirements
- Reliability: one-file failure must not abort full run.
- Performance: handle large libraries (target 10,000+ files).
- Memory: avoid full-file buffering patterns that risk OOM.
- Safety: never mutate files outside resolved target root.
- UX fidelity: key screens conform to approved design.

## 9. Error Handling
- Invalid config/JSON: fail fast with actionable message.
- Source scan failure: log and stop run.
- Per-file parse/read failure: classify under Files With Error and continue.
- Copy/delete failure: log details and continue when safe.

## 10. Execution Model
1. Start (Dry Run): read source files, discover files, parse metadata, and classify outcomes.
2. Plan: compute toupdate/todelete from scan + db and present results on processing screen.
3. Sync Now (Apply): execute delete/copy and persist updated artifacts.

## 11. Acceptance Criteria
- AC-001 Cold Start: valid files are planned and copied, db is created.
- AC-002 No Change: no planned ops and no update flag.
- AC-003 New File: appears in toupdate and db after apply.
- AC-004 Changed File: updated copy plus stale-target cleanup where needed.
- AC-005 Removed Source File: appears in todelete and is removed from target/db.
- AC-006 Missing Genre: appears only in Missing Genre and is not processed.
- AC-007 File Error: appears only in Files With Error with error text and is not processed.
- AC-008 Start Dry Run: pressing Start reads source files, shows planned add/delete/error items, and performs no target mutations.
- AC-009 Sync Now Apply: pressing Sync Now runs actual copy/delete and updates db/artifacts accordingly.
- AC-010 Live Current File: during Sync Now execution, processing screen displays the current file/operation being executed.
