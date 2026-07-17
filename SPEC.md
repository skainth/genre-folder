# Genre-to-Folder Organizer

## 1. Document Control
- Document type: Software Requirements Specification (SRS)
- Method: Spec-Driven Development (SDD)
- Version: 1.0
- Status: Draft baseline for greenfield rebuild
- Last updated: 2026-07-17

## 2. Problem Statement
Many audio players (especially in-car devices) treat multi-genre metadata as a single literal value (for example, `Pop/Metal/Rock`) instead of separate genres. This makes genre-based browsing difficult.

The system must reorganize source audio files into a target folder hierarchy using genre mappings so each track is discoverable under expected genre folders.

## 3. Product Vision
Build a utility that:
1. Scans a source music library.
2. Reads audio metadata.
3. Maps each file to one or more target folders by genre.
4. Produces deterministic update plans.
5. Applies file copy/delete operations safely.
6. Maintains a local database and run artifacts to support incremental sync.

## 4. Scope
### 4.1 In Scope
- Android mobile application UI
- Local filesystem scanning (recursive)
- Audio extension filtering
- Metadata extraction for supported formats
- Multi-genre parsing and mapping
- Incremental change detection (new/changed/removed)
- Generation of machine-readable update artifacts
- Execution of copy/delete updates into target folders
- Basic logging and run statistics

### 4.2 Out of Scope
- Cloud APIs and remote storage operations
- Metadata editing/tag writing
- Playlist management
- Concurrent distributed processing across machines

## 5. Stakeholders and Users
- Primary user: individual maintaining a personal music library
- Secondary user: developer/operator extending the utility

## 6. Assumptions and Constraints
### 6.1 Assumptions
- Source files have readable filesystem metadata.
- Audio metadata parser can read at least genre/title/artist/album when available.
- User provides valid absolute paths for source and target.

### 6.2 Constraints
- Runtime: Android application (UI layer) with local processing engine
- UI framework/library: React Native (required)
- Implementation language: JavaScript (required)
- TypeScript: optional and not required
- Execution style: Android UI-driven workflows
- Data persistence: JSON artifacts on local disk

### 6.3 UI Design Constraint
- The Android UI shall follow `design-android.png` as the visual and layout source of truth.
- The implementation shall preserve the structure, hierarchy, and interaction model represented in `design-android.png`.
- Any deviation from `design-android.png` requires explicit sign-off before implementation.

## 7. System Context
Inputs:
- Source directory tree
- Configuration file
- Existing local database (if present)

Outputs:
- Target folder/file updates
- Local database updates
- Stats and actionable update artifacts
- Log file

## 8. Configuration Contract
The system shall read configuration with this schema:

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
- `source` is required and must exist.
- `target` is required; if missing, run terminates with clear message.
- `allowedExtentions` drives inclusion filter (case-insensitive).
- `genreToFolder` maps normalized genre values to one or more folder paths.
- `Others` is fallback when no explicit mapping exists.

## 9. Artifact Contract
The application shall maintain the following artifacts under a data workspace:
- `db.json`: canonical source-to-target file state
- `stats.json`: run classification output
- `toupdate.json`: files to copy/update
- `todelete.json`: files to remove from target
- `update` (flag file): non-empty when updates are available
- `log.txt`: appended operational logs

### 9.1 Data Shapes
`db.json`:
```json
{
  "files": {
    "<sourceFilePath>": {
      "filepath": "<sourceFilePath>",
      "metadata": {
        "title": "<string>",
        "artist": ["<string>"],
        "genre": ["<string>"],
        "album": "<string>"
      },
      "ctime": 0,
      "mtime": 0,
      "targets": ["<targetFilePath>"]
    }
  }
}
```

`stats.json` must include keyed collections for:
- Files to process
- Files ignored
- New files
- Changed files
- Unchanged files
- Files with no genre
- Parse/stat errors
- Files to delete from target

## 10. Functional Requirements

### FR-001 Configuration Validation
- The system shall fail fast when `source` is empty or does not exist.
- The system shall fail fast when `target` is empty.
- The system shall log validation failures and stop further processing.

### FR-002 Source Discovery
- The system shall recursively discover all files under `source`.
- The system shall classify files into `keep` and `ignore` by extension.

### FR-003 Metadata Extraction
- For each kept file, the system shall attempt metadata extraction.
- On parser/stat failure, the system shall record an error entry and continue.
- On success, the system shall capture genre, title, artist, album, ctime, mtime.

### FR-004 Genre Parsing
- The system shall support genre inputs as:
  - array of strings
  - delimited string with one of: comma, semicolon, slash
- The system shall trim whitespace around split genre tokens.
- Empty genre tokens shall be ignored.

### FR-005 Target Resolution
- For each genre token:
  - If mapped in `genreToFolder`, generate one target path per mapped folder.
  - Else generate fallback target path under `Others` (or default `others`).
- The system shall deduplicate target paths for a file.

### FR-006 Incremental Change Detection
- If source `ctime` equals stored `ctime`, classify as unchanged.
- If file is new to DB, classify as new.
- If file exists in DB and `ctime` changed, classify as changed.

### FR-007 Run Statistics
- The system shall aggregate categorized outcomes in `stats.json`.
- Categories shall be machine-readable key-value maps keyed by filepath.

### FR-008 Deletion Detection
- The system shall identify files present in DB but absent from current source scan.
- Those files shall be listed for target deletion.

### FR-009 Update Plan Generation
- The system shall write `toupdate.json` containing merged new+changed file entries.
- The system shall write `todelete.json` containing files to remove from target.
- If either set is non-empty, system shall create/update `update` flag with summary text.

### FR-010 Apply Update Plan
- During apply phase, the system shall:
  1. Delete target files listed in `todelete.json`.
  2. Copy source files to all target paths from `toupdate.json`.
  3. Update `db.json` to represent final state.
  4. Optionally write mirrored DB in target root.
  5. Remove `update` flag after successful completion.

### FR-011 Idempotent Re-Runs
- Re-running with no source changes shall produce no update flag and no file operations.

### FR-012 Logging
- The system shall append run events, validation issues, and summary counts to log output.

### FR-013 Android UI Implementation
- The system shall provide an Android UI for core user flows: configuration, scan/plan execution, apply updates, and viewing run results.
- The Android UI shall be implemented using React Native.
- The Android UI codebase shall use regular JavaScript source files.
- TypeScript setup shall not be required for build or runtime.
- The Android UI shall be implemented to match `design-android.png`.
- The Android UI shall not be replaced with a CLI-only experience.

### FR-014 UI Consistency with Design Asset
- Screen layout, component grouping, and visual priority shall match `design-android.png`.
- Navigation flow and major interactions shall match `design-android.png`.
- Required UI elements in `design-android.png` shall be present in the implemented Android UI.

## 11. Non-Functional Requirements

### NFR-001 Reliability
- A single file failure shall not terminate the full run.
- Processing shall continue for remaining files.

### NFR-002 Performance
- Must handle at least 10,000 files in source scan without crashing.
- Memory usage shall remain bounded (no full binary content loaded in memory).

### NFR-003 Determinism
- Same input state must produce same artifacts and target results.

### NFR-004 Portability
- Paths shall be handled with platform-safe path joining.

### NFR-005 Observability
- Logs and artifacts shall be sufficient to diagnose:
  - why file was copied/deleted/ignored
  - whether updates are pending

### NFR-006 Android UX Fidelity
- The implemented UI shall be reviewed against `design-android.png` and accepted only when key screens and interactions conform to the design asset.
- The app shall render correctly on Android phone form factors in portrait orientation.

## 12. Error Handling Requirements
- Missing config or invalid JSON: fail fast with actionable message.
- Source scan failure: log and exit non-zero.
- Metadata parser failure on a file: record in stats, continue.
- Copy/delete filesystem failure: log file path and error details; continue when safe.

## 13. Security and Safety Requirements
- No network access required.
- No execution of external untrusted code.
- Never delete files outside configured target paths derived from plan artifacts.

## 14. Execution Model
Recommended three-phase pipeline:
1. Scan phase: discover files, parse metadata, compute stats.
2. Plan phase: convert stats + DB into update/delete artifacts.
3. Apply phase: execute filesystem mutations and persist DB.

## 15. Acceptance Criteria (End-to-End)

### AC-001 First Run (Cold Start)
Given empty DB and valid source/target,
When pipeline runs,
Then all valid source files are planned and copied to mapped targets,
And DB is created with corresponding entries.

### AC-002 No Change Run
Given DB reflects current source,
When pipeline runs,
Then changed/new/delete sets are empty,
And no update flag exists.

### AC-003 New File
Given one new source file appears,
When pipeline runs,
Then file is in `toupdate.json`, copied to targets, and added to DB.

### AC-004 Changed File
Given one existing source file has updated ctime,
When pipeline runs,
Then old target variants are marked for delete (if required by design),
And updated targets are copied and DB refreshed.

### AC-005 Removed Source File
Given one DB file no longer exists in source,
When pipeline runs,
Then file is in `todelete.json`, removed from target, and removed from DB.

### AC-006 Unknown Genre
Given file genre has no explicit mapping,
When pipeline runs,
Then target path is resolved under fallback `Others` folder.

### AC-007 Metadata Failure
Given one file causes parser/stat error,
When pipeline runs,
Then error is captured in stats/log and other files continue processing.

### AC-008 Android UI Availability
Given the application build is installed on Android,
When the user opens the app,
Then the user can perform configuration, run plan/apply actions, and view run outputs through the Android UI.

### AC-009 UI Matches Design
Given `design-android.png` as the approved design,
When the implemented Android UI is reviewed,
Then the UI structure and primary interactions match `design-android.png`.

## 16. Test Plan Requirements
Minimum automated coverage:
- Unit tests
  - extension filter behavior
  - genre split/tokenization
  - target resolution and deduplication
  - analytics aggregation
- Integration tests
  - scan phase artifact generation
  - plan phase update/delete correctness
  - apply phase file copy/delete + DB updates
- Regression tests
  - no-change idempotency
  - fallback genre behavior
  - changed-file replacement semantics

## 17. Open Design Decisions (For Rebuild)
- Should change detection use `ctime`, `mtime`, content hash, or a combination?
- Should empty target folders be pruned after deletes?
- Should plan/apply be split into separate commands or one orchestrated command?
- Should database live only in data workspace, target root, or both?
- Should genre normalization support case folding and synonym aliases?

## 18. Definition of Done
The rebuild is complete when:
1. All functional requirements (FR-001 to FR-014) are implemented.
2. All non-functional requirements are met or explicitly waived.
3. Acceptance criteria AC-001 to AC-009 pass.
4. Automated tests run green in CI/local test command.
5. README documents setup, configuration, and run pipeline.
