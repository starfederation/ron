# RON VS Code Extension

This folder contains a VS Code language extension for RON, Readable Object Notation.

## Features

- `.ron` language registration.
- TextMate syntax highlighting for RON values, strings, numbers, variables, temp ids, typed tags, braces, and brackets.
- Bracket matching and quote auto-closing.
- RON fenced code block highlighting for Markdown editor views and previews.

## Build a VSIX with Nix

From the repository root:

```sh
nix build .#vscode-extension-vsix
```

The VSIX is written to `result/share/vscode/extensions/ron-language-0.1.0.vsix`.

## Verify and package in a dev shell

From the repository root:

```sh
nix develop
cd vscode
npm run check
npm run package
```

The local VSIX is written to `vscode/dist/ron-language-0.1.0.vsix`. The dev shell supplies `node` and `vsce`.

## Install locally

After `nix build` from the repository root:

```sh
code --install-extension result/share/vscode/extensions/ron-language-0.1.0.vsix
```

After `npm run package` from `vscode/`:

```sh
code --install-extension dist/ron-language-0.1.0.vsix
```

For Cursor or another VS Code-compatible binary, replace `code` with `cursor`.

For source-folder development:

1. Open this `vscode` folder in VS Code.
2. Run `Developer: Install Extension from Location...`.
3. Pick this folder, or press F5 to launch an extension development host.
4. Open a `.ron` file or a Markdown file with a `ron` fenced code block.

## Current scope

Included:

- Syntax highlighting.
- Bracket matching.
- Quote auto-closing.
- Markdown fenced code highlighting in editor and preview.

Not included:

- Formatter.
- Diagnostics.
- Completions.
- Semantic validation against typed vocabulary schemas.

Source: ported from `../stardust` `ron/vscode` at commit `1005848` and adjusted for the standalone RON reference repository.
