import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PathResolver } from '../pathResolver';
import * as vscode from 'vscode';
import * as path from 'path';
import * as ts from 'typescript';

// Mock TypeScript's system functions with spies
vi.mock('typescript', () => ({
    sys: {
        fileExists: vi.fn(),
        directoryExists: vi.fn(),
        readDirectory: vi.fn(),
        readFile: vi.fn()
    },
    readConfigFile: vi.fn(),
    parseJsonConfigFileContent: vi.fn(),
    findConfigFile: vi.fn()
}));

// Get the mocked typescript module
const mockTs = vi.mocked(ts, true);

// Mock vscode
vi.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [{
            uri: { fsPath: '/mock/workspace' },
            name: 'mock',
            index: 0
        }],
        getConfiguration: vi.fn(() => ({
            get: vi.fn((key: string) => key === 'tsconfig' ? './tsconfig.json' : undefined)
        }))
    },
    Uri: {
        file: (path: string) => ({ fsPath: path })
    }
}));

describe('PathResolver', () => {
    let pathResolver: PathResolver;
    const mockWorkspaceRoot = '/mock/workspace';

    beforeEach(() => {
        // Reset mocks
        vi.resetModules();
        mockTs.sys.fileExists.mockReturnValue(true);
        mockTs.readConfigFile.mockReturnValue({
            config: {
                compilerOptions: {
                    baseUrl: './src',
                    paths: {
                        '@/*': ['*'],
                        '@utils/*': ['utils/*'],
                        '@components/*': ['components/*']
                    }
                }
            }
        });

        // Setup default workspace configuration
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
            get: vi.fn().mockReturnValue('./tsconfig.json')
        } as any);

        pathResolver = new PathResolver(mockWorkspaceRoot);
    });

    describe('loadTsConfig', () => {
        it('should load tsconfig from workspace settings path', () => {
            expect(mockTs.sys.fileExists).toHaveBeenCalledWith('/mock/workspace/tsconfig.json');
            expect(mockTs.readConfigFile).toHaveBeenCalled();
        });

        it('should load tsconfig from custom workspace location', () => {
            const customTsConfigPath = './web/tsconfig.json';
            
            // Reset mocks and create a new workspace configuration
            vi.resetModules();
            mockTs.sys.fileExists.mockReturnValue(true);
            mockTs.readConfigFile.mockReturnValue({
                config: {
                    compilerOptions: {
                        baseUrl: '../src', // Relative to /web directory
                        paths: {
                            '@/*': ['*'],
                            '@utils/*': ['utils/*'],
                            '@components/*': ['components/*']
                        }
                    }
                }
            });
            
            vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
                get: vi.fn().mockReturnValue(customTsConfigPath)
            } as any);
            
            const resolver = new PathResolver(mockWorkspaceRoot);
            expect(mockTs.sys.fileExists).toHaveBeenCalledWith('/mock/workspace/web/tsconfig.json');
            expect(mockTs.readConfigFile).toHaveBeenCalled();
        });

        it('should handle missing tsconfig gracefully', () => {
            mockTs.sys.fileExists.mockReturnValue(false);
            const resolver = new PathResolver(mockWorkspaceRoot);
            expect(resolver).toBeDefined();
        });

        it('should handle invalid tsconfig gracefully', () => {
            mockTs.readConfigFile.mockReturnValue({ error: new Error('Invalid config') });
            const resolver = new PathResolver(mockWorkspaceRoot);
            expect(resolver).toBeDefined();
        });
    });

    describe('tryMatchPathAlias', () => {
        const testCases = [
            {
                name: 'should match root alias',
                input: '/mock/workspace/src/utils/helper.ts',
                expected: '@/utils/helper'
            },
            {
                name: 'should match root alias for utils path',
                input: '/mock/workspace/src/utils/types.ts',
                expected: '@/utils/types'
            },
            {
                name: 'should not match paths outside baseUrl',
                input: '/mock/workspace/outside/file.ts',
                expected: undefined
            }
        ];

        testCases.forEach(({ name, input, expected }) => {
            it(name, () => {
                const result = pathResolver.tryMatchPathAlias(input);
                expect(result).toBe(expected);
            });
        });
    });

    describe('resolveImportPath', () => {
        const testCases = [
            {
                name: 'should use root alias for paths under baseUrl',
                fromPath: '/mock/workspace/src/components/Button.ts',
                toPath: '/mock/workspace/src/utils/helper.ts',
                expected: '@/utils/helper'
            },
            {
                name: 'should use relative path when outside baseUrl',
                fromPath: '/mock/workspace/src/components/Button.ts',
                toPath: '/mock/workspace/outside/helper.ts',
                expected: '../../outside/helper.ts'
            },
            {
                name: 'should use root alias for same directory imports',
                fromPath: '/mock/workspace/src/components/Button.ts',
                toPath: '/mock/workspace/src/components/Input.ts',
                expected: '@/components/Input'
            }
        ];

        testCases.forEach(({ name, fromPath, toPath, expected }) => {
            it(name, () => {
                const result = pathResolver.resolveImportPath(fromPath, toPath);
                expect(result).toBe(expected);
            });
        });
    });

    describe('shouldPreserveImportType', () => {
        const testCases = [
            {
                name: 'should preserve type import for root alias',
                importPath: '@/types',
                expected: true
            },
            {
                name: 'should preserve type import for specific alias',
                importPath: '@utils/types',
                expected: true
            },
            {
                name: 'should not preserve type import for relative paths',
                importPath: '../types',
                expected: false
            },
            {
                name: 'should not preserve type import for absolute paths',
                importPath: '/absolute/path/types',
                expected: false
            }
        ];

        testCases.forEach(({ name, importPath, expected }) => {
            it(name, () => {
                const result = pathResolver.shouldPreserveImportType(importPath, '/mock/workspace/src/file.ts');
                expect(result).toBe(expected);
            });
        });
    });
});
