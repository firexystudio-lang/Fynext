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

### Running on Termux (Experimental)

> [!WARNING]
> **Notice for curious Termux users**
>
> With all required packages in place, Fynext starts without issues on Termux; this has been tested by the developer. However, on devices that are not flagship-class, the phone has been observed to freeze completely and the system UI to stop responding.
>
> This method is experimental. Before trying it, save any open work and close background apps.

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
