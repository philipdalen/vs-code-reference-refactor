# TypeScript Type Mover

A VS Code extension for moving TypeScript types between files with automated import updating.

## Features

- Move types and interfaces between files
- Automatically update all import references
- Support for TypeScript (.ts, .tsx) and Vue (.vue) files
- Preview changes before applying
- Handles type dependencies
- Supports path aliases from tsconfig.json

## Usage

1. Place your cursor on a type name or select the type you want to move
2. Open the command palette (Cmd+Shift+P / Ctrl+Shift+P)
3. Run "Move Type to File" command
4. Choose the destination file
5. Review the changes in the preview
6. Confirm to apply the changes

You can also:
- Right-click on a type and select "Move Type to File" from the context menu
- Use "Preview Type References" command to see all references before moving

## Supported Types

- Type aliases
- Interfaces
- Enums
- Generic types
- Mapped types
- Utility types

## Extension Settings

If you are using Windsurf or Cursor, these settings must be configured in your Windsurf/Cursor settings, not in VS Code settings:

* `typeMover.importStyle`: Choose between 'regular' imports or 'type' imports
* `typeMover.ignoredFolders`: Array of folders to ignore when updating imports
* `typeMover.pathAliases`: Additional path aliases not in tsconfig.json
* `typeRefactor.tsconfig`: Path to your tsconfig.json file, relative to workspace root. If not specified, the extension will look for tsconfig.json in the workspace root.

### TSConfig Configuration

The extension uses your project's tsconfig.json for path alias resolution. By default, it looks for tsconfig.json in your workspace root. If your tsconfig is located elsewhere, you can specify its location using the `typeRefactor.tsconfig` setting:

```json
{
  "typeRefactor.tsconfig": "./path/to/tsconfig.json"
}
```

The path should be relative to your workspace root. For example:
- `"typeRefactor.tsconfig": "./tsconfig.json"` (same as default)
- `"typeRefactor.tsconfig": "./configs/tsconfig.json"`
- `"typeRefactor.tsconfig": "./packages/main/tsconfig.json"`

This is particularly useful in monorepo setups or projects with non-standard TypeScript configurations.

## Requirements

- VS Code 1.80.0 or higher
- TypeScript 4.8.0 or higher

## Installation

1. Open VS Code
2. Press F1 or Cmd+Shift+P / Ctrl+Shift+P
3. Type "Extensions: Install Extension"
4. Search for "TypeScript Type Mover"
5. Click Install

## Local Development and Installation

### Local Development
1. Clone the repository
2. Run `npm install`
3. Open in VS Code
4. Press F5 to start debugging

### Local Installation
1. Build the extension:
   ```bash
   npm run vscode:prepublish
   ```
2. Package the extension:
   ```bash
   npx vsce package
   ```
   This will create a `.vsix` file in your project directory.

3. Install the extension locally:
   - Open VS Code
   - Press F1 or Cmd+Shift+P / Ctrl+Shift+P
   - Type "Extensions: Install from VSIX"
   - Navigate to and select the `.vsix` file created in step 2

Alternatively, you can install it directly from the command line:
```bash
code --install-extension typescript-type-mover-0.1.0.vsix
```

## Development

1. Clone the repository
2. Run `npm install`
3. Open in VS Code
4. Press F5 to start debugging

## License

MIT
