// Mock vscode and typescript first, before any imports
import { vi } from 'vitest';
import { createMockVscode } from './test-utils';

vi.mock('vscode', () => createMockVscode());

// Mock TypeScript's system functions
vi.mock('typescript', () => {
    return {
        createSourceFile: vi.fn(),
        ScriptTarget: { Latest: 99 },
        isImportDeclaration: vi.fn(),
        isNamedImports: vi.fn(),
        forEachChild: vi.fn().mockImplementation((node, callback) => {
            if (node.statements) {
                node.statements.forEach(callback);
            }
        }),
        SyntaxKind: {
            ImportDeclaration: 'ImportDeclaration'
        },
        sys: {
            fileExists: vi.fn().mockReturnValue(true),
            directoryExists: vi.fn(),
            readDirectory: vi.fn(),
            readFile: vi.fn()
        },
        readConfigFile: vi.fn().mockReturnValue({
            config: {
                compilerOptions: {
                    baseUrl: './src',
                    paths: {}
                }
            }
        }),
        parseJsonConfigFileContent: vi.fn().mockReturnValue({
            options: {
                baseUrl: './src',
                paths: {}
            }
        })
    };
});

// Import after mocks are set up
import { describe, it, expect, beforeEach, SpyInstance } from 'vitest';
import { ImportManager } from '../importManager';
import * as vscode from 'vscode';
import * as ts from 'typescript';

describe('ImportManager', () => {
    let importManager: ImportManager;
    let mockWorkspaceEdit: SpyInstance;

    // Helper function to create a mock source file
    const createMockSourceFile = (importStatement: string, isTypeOnly: boolean = false, importPath: string = './types') => ({
        fileName: '/mock/workspace/src/file.ts',
        statements: [{
            kind: ts.SyntaxKind.ImportDeclaration,
            moduleSpecifier: { text: importPath },
            importClause: {
                isTypeOnly,
                namedBindings: {
                    elements: [{ name: { text: 'Type1' } }]
                }
            },
            getStart: () => 0,
            getEnd: () => importStatement.length,
            getFullText: () => importStatement
        }],
        getFullText: () => importStatement
    });

    // Helper function to create a mock document
    const createMockDocument = (content: string) => ({
        fileName: '/mock/workspace/src/file.ts',
        getText: () => content,
        positionAt: (offset: number) => ({ line: 0, character: offset }),
        uri: { fsPath: '/mock/workspace/src/file.ts' }
    });

    beforeEach(() => {
        vi.resetModules();
        importManager = new ImportManager();
        mockWorkspaceEdit = vi.spyOn(vscode.workspace, 'applyEdit').mockResolvedValue(true);

        // Setup common TypeScript mocks
        vi.mocked(ts.isImportDeclaration).mockReturnValue(true);
        vi.mocked(ts.isNamedImports).mockReturnValue(true);
    });

    describe.only('updateImports', () => {
        const testCases = [
            {
                name: 'should merge types into existing import with same path',
                sourceContent: 'import { Type1 } from "./types";',
                oldImportPath: './old-types',
                newImportPath: './types',
                isTypeOnly: false,
                newTypeIsTypeOnly: false,
                expected: 'import { Type1, Type2 } from "./types";',
                runTest: true
            },
            {
                name: 'should preserve type keyword when merging with type-only import',
                sourceContent: 'import type { Type1 } from "@/types";',
                oldImportPath: '@/old-types',
                newImportPath: '@/types',
                isTypeOnly: true,
                newTypeIsTypeOnly: true,
                expected: 'import type { Type1, Type2 } from "@/types";',
                runTest: false
            },
            {
                name: 'should preserve type keyword when merging regular import with type-only import',
                sourceContent: 'import { Type1 } from "@/types";',
                oldImportPath: '@/old-types',
                newImportPath: '@/types',
                isTypeOnly: false,
                newTypeIsTypeOnly: true,
                expected: 'import type { Type1, Type2 } from "@/types";',
                runTest: false
            }
        ];

        testCases.forEach(({ name, sourceContent, oldImportPath, newImportPath, isTypeOnly, newTypeIsTypeOnly, expected, runTest }) => {
            const testFn = runTest ? it : it.skip;
            testFn(name, async () => {
                // Setup mocks for this test case
                const mockSourceFile = createMockSourceFile(sourceContent, isTypeOnly,newImportPath);
                const mockDocument = createMockDocument(sourceContent);
                vi.mocked(ts.createSourceFile).mockReturnValue(mockSourceFile as any);
                vi.spyOn(vscode.workspace, 'openTextDocument').mockResolvedValue(mockDocument as any);

                // Test merging Type2 into the existing import
                await importManager.updateImports({
                    importChanges: [{
                        uri: { fsPath: '/mock/workspace/src/file.ts' } as any,
                        oldImportPath,
                        newImportPath,
                        typeName: 'Type2',
                        isTypeOnly: newTypeIsTypeOnly
                    }],
                    typeContent: ''
                });

                // Verify the workspace edit
                expect(mockWorkspaceEdit).toHaveBeenCalled();
                const edit = mockWorkspaceEdit.mock.calls[0][0];
                expect(edit.get(mockDocument.uri)[0].newText).toBe(expected);
            });
        });

        // Add error case tests
        it('should handle missing import clause gracefully', async () => {
            const mockSourceFile = {
                ...createMockSourceFile('import { Type1 } from "./types";'),
                statements: [{
                    kind: ts.SyntaxKind.ImportDeclaration,
                    moduleSpecifier: { text: './types' },
                    // Missing importClause to simulate malformed import
                    getStart: () => 0,
                    getEnd: () => 35
                }]
            };

            const mockDocument = createMockDocument('import { Type1 } from "./types";');
            
            vi.mocked(ts.createSourceFile).mockReturnValue(mockSourceFile as any);
            vi.spyOn(vscode.workspace, 'openTextDocument').mockResolvedValue(mockDocument as any);

            // Should not throw and should still attempt to create a new import
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

            expect(mockWorkspaceEdit).toHaveBeenCalled();
        });
    });
});
