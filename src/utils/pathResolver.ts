import * as path from 'path';
import * as ts from 'typescript';
import * as vscode from 'vscode';

/**
 * Handles TypeScript path resolution and alias mapping based on tsconfig.json configuration.
 * This class is responsible for:
 * 1. Loading and parsing tsconfig.json settings
 * 2. Converting between file system paths and TypeScript path aliases
 * 3. Resolving import paths based on project configuration
 * 
 * The class uses the following tsconfig.json settings:
 * - `compilerOptions.baseUrl`: Base directory for resolving non-relative module names
 * - `compilerOptions.paths`: Path mapping entries for module aliases
 * 
 * @example
 * ```typescript
 * // Initialize with workspace root
 * const resolver = new PathResolver('/path/to/project');
 * 
 * // Convert file system path to alias
 * const alias = resolver.tryMatchPathAlias('/path/to/project/src/utils/helper.ts');
 * // Returns: '@utils/helper'
 * 
 * // Resolve import path between files
 * const importPath = resolver.resolveImportPath(
 *   '/path/to/project/src/components/Button.ts',
 *   '/path/to/project/src/utils/helper.ts'
 * );
 * // Returns: '../utils/helper'
 * ```
 */
export class PathResolver {
    /** Base URL for resolving non-relative module names, from tsconfig.json */
    private baseUrl: string | undefined;
    
    /** Path mapping configuration from tsconfig.json */
    private paths: { [key: string]: string[] } | undefined;
    
    /** Directory containing the tsconfig.json file */
    private configDir: string | undefined;

    /**
     * Creates a new PathResolver instance and loads TypeScript configuration.
     * 
     * @param workspaceRoot - The root directory of the workspace, used to locate tsconfig.json
     * @example
     * ```typescript
     * const resolver = new PathResolver('/path/to/project');
     * ```
     */
    constructor(workspaceRoot: string) {
        this.loadTsConfig(workspaceRoot);
    }

    /**
     * Loads and parses the TypeScript configuration from tsconfig.json.
     * The configuration is searched for in the following order:
     * 1. Path specified in VSCode settings (typeRefactor.tsconfig)
     * 2. Default tsconfig.json in the workspace root
     * 
     * @param workspaceRoot - The root directory of the workspace
     * @internal
     */
    private loadTsConfig(workspaceRoot: string) {
        if (!workspaceRoot) {
            console.log('[PathResolver] No workspace root provided');
            return;
        }

        // First try to get config path from settings
        const config = vscode.workspace.getConfiguration('typeRefactor');
        const configRelativePath = config.get<string>('tsconfig');
        
        // Find the config file - either from settings or default location
        const configPath = configRelativePath 
            ? path.join(workspaceRoot, configRelativePath)
            : ts.findConfigFile(workspaceRoot, ts.sys.fileExists, 'tsconfig.json');

        if (!configPath || !ts.sys.fileExists(configPath)) {
            console.log('[PathResolver] No tsconfig.json found');
            return;
        }

        try {
            const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
            if (configFile.error) {
                console.log('[PathResolver] Error reading tsconfig:', configFile.error);
                return;
            }

            // Store the directory containing tsconfig.json
            this.configDir = path.dirname(configPath);
            
            // Set baseUrl and paths from the raw config
            this.baseUrl = configFile.config.compilerOptions?.baseUrl || '.';
            this.paths = configFile.config.compilerOptions?.paths;
        } catch (error) {
            console.log('[PathResolver] Error parsing tsconfig:', error);
        }
    }

    /**
     * Attempts to convert an absolute file path to its corresponding TypeScript path alias.
     * This is useful when refactoring imports to use path aliases instead of relative paths.
     * 
     * The function uses the paths configuration from tsconfig.json to map file system paths
     * to their corresponding import aliases.
     * 
     * @example
     * Given tsconfig.json:
     * ```json
     * {
     *   "compilerOptions": {
     *     "baseUrl": "./src",
     *     "paths": {
     *       "@/*": ["*"],
     *       "@utils/*": ["utils/*"]
     *     }
     *   }
     * }
     * ```
     * 
     * Usage examples:
     * ```typescript
     * // Convert absolute paths to aliased imports
     * pathResolver.tryMatchPathAlias('/project/src/utils/helper.ts')
     * // Returns: '@utils/helper'
     * 
     * pathResolver.tryMatchPathAlias('/project/src/components/Button.tsx')
     * // Returns: '@/components/Button'
     * 
     * // Returns undefined if no alias matches
     * pathResolver.tryMatchPathAlias('/project/outside/file.ts')
     * // Returns: undefined
     * ```
     * 
     * @param absoluteFilePath - The absolute path to the file in the file system
     * @returns The matched path alias without file extension, or undefined if no alias matches
     * @throws Will not throw, returns undefined for any error cases
     */
    public tryMatchPathAlias(absoluteFilePath: string): string | undefined {
        if (!this.paths || !this.baseUrl || !this.configDir) {
            console.log('[PathResolver] No paths, baseUrl or configDir configured');
            return undefined;
        }

        // Resolve baseUrl relative to tsconfig.json location
        const absoluteBaseUrl = path.resolve(this.configDir, this.baseUrl);

        // Get path relative to baseUrl
        const filePathFromBaseUrl = path.relative(absoluteBaseUrl, absoluteFilePath);

        for (const [aliasPattern, aliasTargets] of Object.entries(this.paths)) {
            // Handle path alias patterns (e.g., @/*)
            const aliasPrefix = aliasPattern.replace(/\*$/, '');
            const aliasTargetPath = aliasTargets[0].replace(/\*$/, ''); // Use first target

            // Resolve target directory relative to tsconfig location
            const absoluteAliasPath = path.resolve(absoluteBaseUrl, aliasTargetPath);

            if (absoluteFilePath.startsWith(absoluteAliasPath)) {
                const relativeToAlias = path.relative(absoluteAliasPath, absoluteFilePath);
                const importPath = `${aliasPrefix}${relativeToAlias}`.replace(/\.(ts|tsx|vue)$/, '');
                return importPath;
            }
        }

        return undefined;
    }

    public resolveImportPath(fromPath: string, toPath: string): string {
        // First try to resolve using path alias
        const aliasPath = this.tryMatchPathAlias(toPath);
        if (aliasPath) {
            return aliasPath;
        }

        // Fall back to relative path if no alias matches
        let relativePath = path.relative(path.dirname(fromPath), toPath);
        if (!relativePath.startsWith('.')) {
            relativePath = './' + relativePath;
        }
        return relativePath;
    }

    public shouldPreserveImportType(importPath: string, fromPath: string): boolean {
        if (!this.paths) {
            return false;
        }

        // Check if the import uses any of our configured path aliases
        return Object.keys(this.paths).some(pattern => {
            const patternWithoutWildcard = pattern.replace(/\*/g, '');
            return importPath.startsWith(patternWithoutWildcard);
        });
    }
}
