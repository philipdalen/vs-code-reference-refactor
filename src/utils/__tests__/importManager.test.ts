import { describe, it, expect, vi, beforeEach, SpyInstance } from 'vitest';
import { ImportManager } from '../importManager';
import * as vscode from 'vscode';
import * as ts from 'typescript';
import { createMockVscode } from './test-utils';

// Mock vscode
vi.mock('vscode', () => createMockVscode());

// Mock TypeScript's system functions
vi.mock('typescript', () => {
    const actual = vi.importActual('typescript');
    return {
        ...actual,
        sys: {
            fileExists: vi.fn().mockReturnValue(true),
            directoryExists: vi.fn(),
            readDirectory: vi.fn(),
            readFile: vi.fn()
        },
        createSourceFile: vi.fn(),
        ScriptTarget: { Latest: 99 },
        isImportDeclaration: vi.fn(),
        isNamedImports: vi.fn()
    };
});

describe('ImportManager', () => {
    let importManager: ImportManager;
    let mockWorkspaceEdit: SpyInstance;

    beforeEach(() => {
        vi.resetModules();
        importManager = new ImportManager();
        mockWorkspaceEdit = vi.spyOn(vscode.workspace, 'applyEdit').mockResolvedValue(true);
    });

    describe('updateImports', () => {
        it('should merge types into existing import with same path', async () => {
            // Mock the source file content
            const mockSourceFile = {
                fileName: '/mock/workspace/src/file.ts',
                statements: [{
                    kind: ts.SyntaxKind.ImportDeclaration,
                    moduleSpecifier: { text: './types' },
                    importClause: {
                        namedBindings: {
                            elements: [{ name: { text: 'Type1' } }]
                        }
                    },
                    getStart: () => 0,
                    getEnd: () => 35
                }],
                getFullText: () => 'import { Type1 } from "./types";'
            };

            // Setup TypeScript mocks
            const mockCreateSourceFile = vi.mocked(ts.createSourceFile);
            mockCreateSourceFile.mockReturnValue(mockSourceFile as any);
            vi.mocked(ts.isImportDeclaration).mockReturnValue(true);
            vi.mocked(ts.isNamedImports).mockReturnValue(true);

            // Mock the document
            const mockDocument = {
                fileName: '/mock/workspace/src/file.ts',
                getText: () => 'import { Type1 } from "./types";',
                positionAt: (offset: number) => ({ line: 0, character: offset }),
                uri: { fsPath: '/mock/workspace/src/file.ts' }
            };

            vi.spyOn(vscode.workspace, 'openTextDocument').mockResolvedValue(mockDocument as any);

            // Test merging Type2 into the existing import
            await importManager.updateImports({
                importChanges: [{
                    uri: { fsPath: '/mock/workspace/src/file.ts' } as any,
                    oldImportPath: './old-types',
                    newImportPath: './types',
                    typeName: 'Type2',
                    isTypeOnly: false
                }],
                typeContent: ''
            });

            // Verify the workspace edit was called with merged import
            expect(mockWorkspaceEdit).toHaveBeenCalled();
            const edit = mockWorkspaceEdit.mock.calls[0][0];
            expect(edit.get(mockDocument.uri)[0].newText).toBe('import { Type1, Type2 } from "./types";');
        });

        it('should preserve type keyword when merging with type-only import', async () => {
            // Mock the source file content with type-only import
            const mockSourceFile = {
                fileName: '/mock/workspace/src/file.ts',
                statements: [{
                    kind: ts.SyntaxKind.ImportDeclaration,
                    moduleSpecifier: { text: './types' },
                    importClause: {
                        isTypeOnly: true,
                        namedBindings: {
                            elements: [{ name: { text: 'Type1' } }]
                        }
                    },
                    getStart: () => 0,
                    getEnd: () => 40
                }],
                getFullText: () => 'import type { Type1 } from "./types";'
            };

            // Setup TypeScript mocks
            const mockCreateSourceFile = vi.mocked(ts.createSourceFile);
            mockCreateSourceFile.mockReturnValue(mockSourceFile as any);
            vi.mocked(ts.isImportDeclaration).mockReturnValue(true);
            vi.mocked(ts.isNamedImports).mockReturnValue(true);

            // Mock the document
            const mockDocument = {
                fileName: '/mock/workspace/src/file.ts',
                getText: () => 'import type { Type1 } from "./types";',
                positionAt: (offset: number) => ({ line: 0, character: offset }),
                uri: { fsPath: '/mock/workspace/src/file.ts' }
            };

            vi.spyOn(vscode.workspace, 'openTextDocument').mockResolvedValue(mockDocument as any);

            // Test merging Type2 into the existing type-only import
            await importManager.updateImports({
                importChanges: [{
                    uri: { fsPath: '/mock/workspace/src/file.ts' } as any,
                    oldImportPath: './old-types',
                    newImportPath: './types',
                    typeName: 'Type2',
                    isTypeOnly: true
                }],
                typeContent: ''
            });

            // Verify the workspace edit preserved the type keyword
            expect(mockWorkspaceEdit).toHaveBeenCalled();
            const edit = mockWorkspaceEdit.mock.calls[0][0];
            expect(edit.get(mockDocument.uri)[0].newText).toBe('import type { Type1, Type2 } from "./types";');
        });
    });
});
