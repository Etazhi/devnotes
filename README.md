# DevNotes

**DevNotes** is a VS Code extension that lets you create, manage, and share annotations directly inside your code — without ever leaving the editor.

Attach notes to specific lines, write them in Markdown, and keep them private or share them with your team through project files.

---

## Features

- **Inline annotations** — attach notes to any line or selection in any file
- **Markdown support** — write notes with full Markdown: headings, lists, checklists, tables, code blocks
- **Syntax highlighting** — code snippets inside notes are highlighted automatically
- **Personal & project notes** — keep notes private (stored locally) or share them with the project team (stored in `.devnotes/`)
- **GitHub & Azure login** — authenticate to associate notes with your identity
- **Sidebar** — browse all notes for the current workspace in the activity bar
- **Edit & delete** — update or remove notes directly from the note panel

---

## Getting Started

1. Install the extension
2. Open the **DevNotes** panel in the activity bar
3. Sign in with **GitHub** or **Azure**
4. Select any line or block of code, right-click and choose **DevNotes: Add Note** — or use the lightbulb action

---

## Commands

All commands are available via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---|---|
| `DevNotes: Sign in with GitHub` | Authenticate with your GitHub account |
| `DevNotes: Sign in with Azure` | Authenticate with your Azure account |
| `DevNotes: Add Note` | Create a new note for the selected code |
| `DevNotes: Open Note` | Open a note in the detail panel |
| `DevNotes: Delete Note` | Delete a note by ID |
| `DevNotes: Clear Data` | Clear personal notes, project notes, or both |
| `DevNotes: Clear Session` | Reset the current authentication session |

---

## Note Scopes

| Scope | Storage | Visibility |
|---|---|---|
| **Personal** | VS Code `globalState` | Only visible to you, on this machine |
| **Project** | `.devnotes/<username>.json` in the workspace | Visible to anyone with access to the repository |

> Personal notes are always filtered by the logged-in user — switching accounts will not expose another user's private notes.

---

## Project Notes Storage

Project-scoped notes are saved in a `.devnotes/` folder at the root of your workspace. Each user gets their own file (`<username>.json`). You can commit this folder to share notes with your team, or add it to `.gitignore` to keep them local.

---

## Requirements

- VS Code `^1.120.0`
- A GitHub or Azure account (required to create notes)

---

## Extension Settings

No configuration required. DevNotes works out of the box.

---

## Known Issues

- Notes anchored to a file will not update automatically if the file is renamed or moved outside of VS Code.

---

## Release Notes

### 0.0.2

Initial release of "DevNotes by Etazhi" now available.