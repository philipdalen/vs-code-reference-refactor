import { vi } from 'vitest';
import * as path from 'path';

export const createMockWorkspace = (root: string = '/mock/workspace', tsconfigPath?: string) => ({
    workspaceFolders: [{
        uri: { fsPath: root },
        name: path.basename(root),
        index: 0
    }],
    getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue(tsconfigPath || './tsconfig.json')
    }),
    applyEdit: vi.fn().mockResolvedValue(true),
    openTextDocument: vi.fn().mockImplementation(async (uri: { fsPath: string }) => ({
        fileName: uri.fsPath,
        getText: () => '',
        positionAt: (offset: number) => ({ line: 0, character: offset }),
        uri: { fsPath: uri.fsPath }
    }))
});

class MockRange {
    constructor(
        public start: { line: number; character: number },
        public end: { line: number; character: number }
    ) {}
}

class MockWorkspaceEdit {
    private edits = new Map<string, { range: MockRange; newText: string }[]>();

    replace(uri: { fsPath: string }, range: MockRange, newText: string) {
        const key = uri.fsPath;
        if (!this.edits.has(key)) {
            this.edits.set(key, []);
        }
        this.edits.get(key)!.push({ range, newText });
    }

    get(uri: { fsPath: string }) {
        return this.edits.get(uri.fsPath) || [];
    }
}

export const createMockVscode = (workspaceRoot: string = '/mock/workspace', tsconfigPath?: string) => ({
    workspace: createMockWorkspace(workspaceRoot, tsconfigPath),
    Uri: {
        file: (path: string) => ({ fsPath: path }),
        parse: (path: string) => ({ fsPath: path })
    },
    Range: MockRange,
    Position: class {
        constructor(public line: number, public character: number) {}
    },
    WorkspaceEdit: MockWorkspaceEdit
});
