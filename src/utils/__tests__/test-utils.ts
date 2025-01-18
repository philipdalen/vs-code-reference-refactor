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
    })
});

export const createMockVscode = (workspaceRoot: string = '/mock/workspace', tsconfigPath?: string) => ({
    workspace: createMockWorkspace(workspaceRoot, tsconfigPath),
    Uri: {
        file: (path: string) => ({ fsPath: path }),
        parse: (path: string) => ({ fsPath: path })
    }
});
