# Changelog

All notable changes to Fynext are documented in this file.

## [Unreleased]

### Added

- Fynext Ported ESP32: expressive robot face firmware for the ESP32-2432S08 (CYD) with animated eyes, eyebrows, blinking, touch gaze and RGB LED moods.
- USB serial bridge (`src/robot/face-bridge.js`) with auto port detection, reconnect and command throttling.
- `/face on|off|ports|port|test|emotion|status` command and automatic emotion hooks for agent events.
- `robotFaceEnabled`, `robotFacePort` and `robotFaceBaud` settings.
- Firmware documentation in `firmware/fynext-ported-esp32/` and `docs/robot-face.md`.

## [1.0.0]

### Added

- Interactive command palette with `Ctrl+P` / `Ctrl+N` and searchable slash commands.
- `@path` workspace file mentions with live suggestions and `Tab` completion.
- `!command` shell passthrough from the prompt.
- Session change tracking with `/changes`, `/undo`, and `/redo`.
- Five built-in themes (`fynext`, `dark`, `light`, `solarized`, `mono`) and `/theme`.
- Colored git diffs through `/diff`.
- Thinking detail toggle with `/details on|off` and `Ctrl+T`.
- `/compact` conversation summarization and `/export` to Markdown or JSON.
- `/editor` for opening files in an external editor.
- Desktop notification bell for completed tasks, configurable via `notifications`.
- Configurable key bindings with `/keybind` and persisted `keybinds` settings.
- `/init` workspace bootstrap that generates `AGENTS.md`.
- Workspace `AGENTS.md` instructions are included in the system prompt.
- Plain-terminal fallback with sanitized output for non-TTY sessions.

### Changed

- Reorganized the project into `bin/`, `src/cli/`, `src/agent/`, `src/ai/`, `src/tools/`, `src/context/`, `src/history/`, `src/config/`, `src/setup/`, `src/workflow/`, and `src/ui/`.
- Consolidated duplicate modules into single canonical files per responsibility.
- Moved the CLI entry point to `bin/fynext.js` and orchestration to `src/cli/main.js`.
- Extended the configuration defaults with generation, UI, editor, notification, and keybinding options.
- Improved hallucinated tool-call detection so valid tool names and safe fallbacks are parsed correctly.

### Fixed

- Restored parsing of tool calls that appear as plain text in model output.
- Prevented duplicate approval prompts for tool calls already approved by the agent.
- Preserved ANSI formatting in slash-command results only when explicitly requested, keeping plain output safe.

### Tests

- Added coverage for change tracking and undo/redo.
- Added coverage for the command palette, `@` mentions, and input history.
- Full suite runs with `npm test`.
