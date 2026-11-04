<div align="center">

**English** · [Türkçe](README.md)

<a href="https://firexy.ct.ws">
  <img src="https://firexy.ct.ws/images/Team.png" alt="FirexyTeam logo" width="140" />
</a>

# Fynext

**Local Code Agent AI**

An AI-powered local agent for intelligent code analysis and management.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-1f2937?style=flat-square)
![Node.js](https://img.shields.io/badge/node-%3E%3D16-339933?style=flat-square&logo=node.js&logoColor=white)
![Python](https://img.shields.io/badge/python-%3E%3D3.8-3776AB?style=flat-square&logo=python&logoColor=white)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)

[Overview](#overview) · [Features](#features) · [Getting Started](#getting-started) · [Contributing](#contributing) · [Contact](#contact)

</div>

---

## Overview

Fynext is an advanced AI agent that runs in your local environment. It is designed to automate code analysis, project management, and development workflows.

It is an open-source solution that runs securely on your computer.

## Features

| Feature | Description |
| :-- | :-- |
| **Intelligent Code Analysis** | Analyzes your codebase and provides suggestions for improvement. |
| **Project Management** | Understands and organizes your project’s file structure. |
| **Local Execution** | All processing happens locally; your data never leaves your machine. |
| **Fast Processing** | Runs fast thanks to optimized performance. |
| **Targeted Solutions** | Customizable for specific tasks. |
| **Command Palette** | Search and run slash commands with `Ctrl+P` / `Ctrl+N`. |
| **Workspace Mentions** | Attach files to the conversation with `@path` suggestions. |
| **Shell Passthrough** | Run local commands directly with `!command`. |
| **Undo / Redo** | Track file changes and reverse them with `/undo` and `/redo`. |
| **Themes & Diff View** | Five built-in themes and colored git diffs. |
| **Collapsible Code** | Keep assistant code compact; click a highlighted filename inline to view or hide its contents. |
| **Compact & Export** | Summarize context with `/compact`, export chats with `/export`. |

### Slash commands

| Command | Description |
| :-- | :-- |
| `/help` | List commands and shortcuts. |
| `/model`, `/models` | Switch model or pick a local Ollama model. |
| `/review`, `/plan`, `/build`, `/mode` | Review, plan, or build workflows. |
| `/changes`, `/undo`, `/redo` | Inspect and reverse file changes made by tools. |
| `/diff [path]` | Show a colored git diff. |
| `/theme [name]` | List or switch themes. |
| `/details on\|off` | Toggle thinking details (`Ctrl+T`). |
| `/compact` | Summarize the conversation to reduce context. |
| `/export [file]` | Export the conversation as Markdown or JSON. |
| `/editor [file]` | Open a file in the configured editor. |
| `/init [--force]` | Create or refresh `AGENTS.md` for the workspace. |
| `/keybind [action key]` | Show or change TUI key bindings. |
| `/history`, `/new`, `/clear`, `/exit` | Manage conversations and the session. |

### TUI shortcuts

| Shortcut | Action |
| :-- | :-- |
| `Enter` | Send the prompt. |
| `Tab` | Switch between Plan and Build modes. |
| `Alt+Enter` / `Ctrl+J` | Insert a new line. |
| `Ctrl+P` / `Ctrl+N` | Open the command palette. |
| `Ctrl+Up` / `Ctrl+Down` | Walk through input history. |
| `Ctrl+T` | Toggle thinking details. |
| `Ctrl+O` | Start a new conversation. |
| `Ctrl+L` | Redraw the screen. |
| `Ctrl+C` | Stop the running task; press twice to exit when idle. |
| `!command` | Run a shell command from the prompt. |

## Possible Additions

Fynext can be extended in several useful directions to make it more powerful for everyday development workflows:

- **Project-aware AI summaries**: Add automatic summaries for repositories, modules, and folders so the agent can explain architecture quickly.
- **Task automation workflows**: Support repeatable workflows such as "run tests", "build project", "generate changelog", and "open PR summary" with guided steps.
- **Better code review support**: Detect bugs, risky patterns, performance issues, and security concerns before a change is merged.
- **Multi-model switching**: Allow quick switching between local and remote LLM providers with saved preferences per workspace.
- **Context indexing**: Create a searchable local index of project files and documentation to help the agent answer codebase-specific questions faster.
- **Git integration**: Add review of diffs, commit messages, branch comparisons, and branch-specific file recommendations.
- **Autonomous planning mode**: Allow Fynext to propose execution plans before modifying code, especially for larger refactors.
- **Documentation generation**: Auto-generate README, API docs, and inline comments from code structure and conventions.
- **User-friendly plugins**: Expose a lightweight extension system for custom tools, commands, and workspace presets.

These additions would make Fynext more useful as an everyday local engineering assistant while keeping its focus on privacy, local execution, and developer control.

## Getting Started

### Requirements

| Component | Version | Status |
| :-- | :-- | :-- |
| Operating system | Windows, Linux, or macOS | Required |
| Node.js | 16 or later | Required (for npm installation) |
| Python | 3.8 or later | Optional |

### Installation

Install Fynext globally via npm:

```bash
npm install -g github:firexystudio-lang/Fynext
```

### Project structure

```text
bin/            CLI entry point
src/cli/        main orchestration and TUI wiring
src/agent/      intent routing and tool status formatting
src/ai/         Ollama client and tool-call parsing
src/tools/      filesystem, git, web, and shell tools
src/context/    project memory and conversation context
src/history/    chat history and change tracking (undo/redo)
src/ui/         screen, theme, text helpers, plain fallback
src/config/     defaults and settings persistence
src/setup/      first-run setup
src/workflow/   feature roadmap and workflow presets
test/           node:test suites and fixtures
config/         system prompt and user settings
```

Run the test suite with `npm test`.

### Running on Termux (Experimental)

> [!WARNING]
> **Notice for curious Termux users**
>
> With all required packages in place, Fynext starts without issues on Termux; this has been tested by the developer. However, on devices that are not flagship-class, the phone has been observed to freeze completely and the system UI to stop responding.
>
> This method is experimental. Before trying it, save any open work and close background apps.

## Feature Roadmap

Fynext now includes the full recommended feature set as a practical roadmap for the project, with a mix of shipped capabilities and planned extensions.

| Feature | Status | Notes |
| :-- | :-- | :-- |
| Project-aware AI summaries | ✅ Implemented | Builds a project memory snapshot in `.fynext/project-memory.json` and keeps key files, languages and git details ready. |
| Task automation workflows | ✅ Implemented | Built-in commands support review, status checks, planning and build-oriented flows. |
| Better code review support | ✅ Implemented | `/review` and project memory analysis flag risky patterns, TODOs and secret-like strings. |
| Multi-model switching | ✅ Implemented | The config supports multiple model profiles and can switch with `/model`. |
| Context indexing | ✅ Implemented | Workspace metadata is cached for faster project-aware answers. |
| Git integration | ✅ Implemented | Git branch, status and recent commits are surfaced through `/git` and `/project`. |
| Autonomous planning mode | ✅ Implemented | `/plan` mode is available for read-only analysis and safe recommendations. |
| Interactive TUI productivity | ✅ Implemented | Command palette, `@` file mentions, shell passthrough, themes, keybindings and notifications. |
| Change tracking and undo | ✅ Implemented | File mutations are recorded per session and can be reversed with `/undo` or reapplied with `/redo`. |
| Context control | ✅ Implemented | `/compact` summarizes long conversations and `/export` writes Markdown or JSON transcripts. |
| Documentation generation | 🟡 Planned | Useful for README, API docs and inline code explanations. |
| User-friendly plugins | 🟡 Planned | Configurable presets and custom workflow extensions can be layered on top of the existing tool system. |

### Built-in workflow presets

The project now ships with reusable action sets for common engineering tasks:

- Review & risk check → `/project` → `/review` → `/git`
- Build & validate → `/mode build` → `npm test` → `npm run build`
- Changelog summary → `/git` → `git log --oneline -10` → summarize changes
- PR summary → `/project` → `/git` → review changed files → summarize impact

## Contributing

Your contributions are greatly appreciated. Use the **Issues** section for bug reports and suggestions, and follow the steps below to contribute code:

1. **Fork** the repository.
2. Create a feature branch:

   ```bash
   git checkout -b feature/feature-name
   ```

3. **Commit** your changes:

   ```bash
   git commit -m "A short, descriptive commit message"
   ```

4. **Push** your branch to the remote repository:

   ```bash
   git push origin feature/feature-name
   ```

5. Open a **Pull Request** on GitHub.

## Contact

**FirexyTeam**

- **Website:** [firexy.ct.ws](https://firexy.ct.ws)
- **Email:** [mfiretechh@gmail.com](mailto:mfiretechh@gmail.com)
- **GitHub:** [@firexystudio](https://github.com/firexystudio)

## Support

If you find Fynext useful, please consider supporting the project by giving the repository a ⭐.

---

<div align="center">

<sub>Made with ❤️ by FirexyTeam</sub>

</div>
