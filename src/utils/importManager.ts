import * as vscode from 'vscode';
import * as ts from 'typescript';
import * as path from 'path';
import { PathResolver } from './pathResolver';

export interface ImportChange {
    uri: vscode.Uri;
    oldImportPath: string;
    newImportPath: string;
    typeName: string;
    isTypeOnly: boolean;
}

export interface Changes {
    importChanges: ImportChange[];
    typeContent: string;
}

/**
 * Represents an edit operation to be applied to a document
 */
interface ImportEdit {
    range: vscode.Range;
    newText: string;
}

export class ImportManager {
    private pathResolver: PathResolver;

    constructor() {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        this.pathResolver = new PathResolver(workspaceRoot);
    }

    /**
     * Calculates the necessary import changes for moving a type to a new location
     * @param typeInfo - Information about the type being moved
     * @param sourceUri - The URI of the source file containing the type
     * @param destinationUri - The URI of the destination file where the type will be moved
     * @param references - Array of locations where the type is referenced
     * @returns Promise resolving to Changes object containing import changes and type content
     * @example
     * // Moving an interface from types.ts to models.ts
     * const changes = await importManager.calculateChanges(
     *   { name: 'UserType', node: typeNode },
     *   vscode.Uri.file('/src/types.ts'),
     *   vscode.Uri.file('/src/models.ts'),
     *   [
     *     // Reference in user.ts
     *     { uri: vscode.Uri.file('/src/user.ts'), ... }
     *   ]
     * );
     * // Result:
     * // {
     * //   importChanges: [{
     * //     uri: '/src/user.ts',
     * //     oldImportPath: './types',
     * //     newImportPath: './models',
     * //     typeName: 'UserType',
     * //     isTypeOnly: false
     * //   }],
     * //   typeContent: 'interface UserType { ... }'
     * // }
     */
    public async calculateChanges(
        typeInfo: { name: string; node: ts.Node },
        sourceUri: vscode.Uri,
        destinationUri: vscode.Uri,
        references: vscode.Location[]
    ): Promise<Changes> {
        console.log('[ImportManager] calculateChanges called with:', {
            typeName: typeInfo.name,
            sourceUri: sourceUri.fsPath,
            destinationUri: destinationUri.fsPath,
            referencesCount: references.length
        });

        const changes: Changes = {
            importChanges: [],
            typeContent: typeInfo.node.getText()
        };

        // Calculate relative paths for each reference
        for (const ref of references) {
            const refDocument = await vscode.workspace.openTextDocument(ref.uri);
            const refText = refDocument.getText();
            const refSourceFile = ts.createSourceFile(
                ref.uri.fsPath,
                refText,
                ts.ScriptTarget.Latest,
                true
            );

            const { path: oldImportPath, isTypeOnly } = this.findExistingImportPath(refSourceFile, typeInfo);
            if (!oldImportPath) continue;

            const refPath = ref.uri.fsPath;
            const destPath = destinationUri.fsPath;
            
            console.log('[ImportManager] Processing reference:', {
                refPath,
                destPath,
                oldImportPath
            });
            
            // Always try to use path alias first, fallback to relative path
            const aliasPath = this.pathResolver.tryMatchPathAlias(destPath);
            console.log('[ImportManager] Alias path result:', aliasPath);
            
            const newImportPath = aliasPath || this.pathResolver.resolveImportPath(refPath, destPath);
            console.log('[ImportManager] Final import path:', newImportPath);

            // Always preserve type imports if they were originally type imports
            changes.importChanges.push({
                uri: ref.uri,
                oldImportPath,
                newImportPath,
                typeName: typeInfo.name,
                isTypeOnly: isTypeOnly
            });
        }

        return changes;
    }

    /**
     * Finds the existing import path and type-only status for a type in a source file.
     * 
     * This method searches through all import declarations in a source file to find where
     * a type is currently imported from. Used to determine the old import path when moving a type.
     * 
     * @example
     * // For a file containing:
     * // import { Type1 } from "./types";
     * // findExistingImportPath(sourceFile, { name: "Type1" }) returns { path: "./types", isTypeOnly: false }
     * 
     * // For a file containing:
     * // import type { Type2 } from "@/models";
     * // findExistingImportPath(sourceFile, { name: "Type2" }) returns { path: "@/models", isTypeOnly: true }
     * 
     * @param refSourceFile - The TypeScript source file to search in
     * @param typeInfo - Object containing the type name to search for
     * @param typeInfo.name - The name of the type to find
     * @param typeInfo.node - The AST node of the type (unused in this method)
     * @returns Object containing the current import path and whether it's a type-only import
     *          Returns { path: '', isTypeOnly: false } if the type is not found
     */
    private findExistingImportPath(refSourceFile: ts.SourceFile, typeInfo: { name: string; node: ts.Node }): { path: string; isTypeOnly: boolean } {
        let result = { path: '', isTypeOnly: false };

        ts.forEachChild(refSourceFile, node => {
            if (!ts.isImportDeclaration(node)) return;

            const namedImports = this.getNamedImports(node);
            if (!namedImports) return;

            const hasType = namedImports.elements.some(el => el.name.text === typeInfo.name);
            if (!hasType) return;

            result = {
                path: (node.moduleSpecifier as ts.StringLiteral).text,
                isTypeOnly: node.importClause?.isTypeOnly || false
            };
        });

        return result;
    }

    private getNamedImports(node: ts.ImportDeclaration): ts.NamedImports | null {
        const namedBindings = node.importClause?.namedBindings;
        return namedBindings && ts.isNamedImports(namedBindings) ? namedBindings : null;
    }

    /**
     * Updates import statements in TypeScript files based on provided changes
     * @param changes - The changes to apply to imports
     * @example
     * // Update imports after moving a type
     * await importManager.updateImports({
     *   importChanges: [{
     *     uri: vscode.Uri.file('/src/user.ts'),
     *     oldImportPath: './types',
     *     newImportPath: './models',
     *     typeName: 'UserType',
     *     isTypeOnly: false
     *   }],
     *   typeContent: 'interface UserType { id: string; name: string; }'
     * });
     * // This will update imports in user.ts:
     * // Before: import { UserType } from './types';
     * // After:  import { UserType } from './models';
     */
    public async updateImports(changes: Changes): Promise<void> {
        for (const change of changes.importChanges) {
            const document = await vscode.workspace.openTextDocument(change.uri);
            const edits = await this.calculateEditsForDocument(document, change);
            await this.applyEdits(change.uri, edits);
        }
    }

    /**
     * Calculates the necessary edits for a document based on a single import change
     * @param document - The document to calculate edits for
     * @param change - The import change to apply
     * @returns Array of edits to be applied
     * @example
     * // Example 1: Merging a type into an existing import
     * const change = {
     *   uri: documentUri,
     *   oldImportPath: './old-types',
     *   newImportPath: './types',
     *   typeName: 'Type2',
     *   isTypeOnly: false
     * };
     * // Input:  import { Type1 } from "./types";
     * // Output: import { Type1, Type2 } from "./types";
     * 
     * // Example 2: Merging with type-only import
     * const change = {
     *   uri: documentUri,
     *   oldImportPath: './old-types',
     *   newImportPath: '@/types',
     *   typeName: 'Type2',
     *   isTypeOnly: true
     * };
     * // Input:  import type { Type1 } from "@/types";
     * // Output: import type { Type1, Type2 } from "@/types";
     */
    private async calculateEditsForDocument(
        document: vscode.TextDocument,
        change: ImportChange
    ): Promise<ImportEdit[]> {
        const sourceFile = ts.createSourceFile(
            document.fileName,
            document.getText(),
            ts.ScriptTarget.Latest,
            true
        );

        const editsToApply: ImportEdit[] = [];
        let hasExistingImport = false;
        let lastImportPos = 0;

        ts.forEachChild(sourceFile, node => {
            if (!ts.isImportDeclaration(node)) return;

            lastImportPos = node.getEnd();
            const importPath = (node.moduleSpecifier as ts.StringLiteral).text;
            
            if (importPath === change.oldImportPath) {
                this.handleOldImportPath(node, document, change, editsToApply);
            } else if (importPath === change.newImportPath) {
                hasExistingImport = true;
                this.handleNewImportPath(node, document, change, editsToApply);
            }
        });

        if (!hasExistingImport) {
            this.addNewImport(lastImportPos, document, change, editsToApply);
        }

        // Sort edits from last to first to avoid position shifting
        return editsToApply.sort((a, b) => b.range.start.line - a.range.start.line);
    }

    /**
     * Handles modifications to the old import path, either removing the type or updating remaining types
     * @param node - The import declaration node
     * @param document - The document being modified
     * @param change - The import change to apply
     * @param edits - Array of edits to append to
     * @example
     * // When moving 'UserType' from './types' to './models'
     * // Input:  import { UserType, OtherType } from './types';
     * // Output: import { OtherType } from './types';
     * // Or if it's the only type:
     * // Input:  import { UserType } from './types';
     * // Output: [Import statement removed]
     */
    private handleOldImportPath(
        node: ts.ImportDeclaration,
        document: vscode.TextDocument,
        change: ImportChange,
        edits: ImportEdit[]
    ): void {
        const importClause = node.importClause;
        if (!importClause?.namedBindings || !ts.isNamedImports(importClause.namedBindings)) return;

        const elements = importClause.namedBindings.elements;
        if (elements.length === 1 && elements[0].name.text === change.typeName) {
            // Remove the entire import if it only contains our type
            edits.push(this.createEdit(node.getStart(), node.getEnd(), '', document));
        } else if (elements.some(el => el.name.text === change.typeName)) {
            // Remove only the specific type
            const remainingTypes = elements
                .filter(el => el.name.text !== change.typeName)
                .map(el => el.name.text)
                .join(', ');
            
            const typeKeyword = (importClause.isTypeOnly || change.isTypeOnly) ? 'type ' : '';
            const newImport = `import ${typeKeyword}{ ${remainingTypes} } from "${(node.moduleSpecifier as ts.StringLiteral).text}";`;
            edits.push(this.createEdit(node.getStart(), node.getEnd(), newImport, document));
        }
    }

    /**
     * Handles modifications to the new import path, merging the type into existing imports
     * @param node - The import declaration node
     * @param document - The document being modified
     * @param change - The import change to apply
     * @param edits - Array of edits to append to
     * @example
     * // When moving 'UserType' to a file with existing imports
     * // Input:  import { ExistingType } from './models';
     * // Output: import { ExistingType, UserType } from './models';
     * // Or with type-only imports:
     * // Input:  import type { ExistingType } from './models';
     * // Output: import type { ExistingType, UserType } from './models';
     */
    private handleNewImportPath(
        node: ts.ImportDeclaration,
        document: vscode.TextDocument,
        change: ImportChange,
        edits: ImportEdit[]
    ): void {
        const importClause = node.importClause;
        if (!importClause?.namedBindings || !ts.isNamedImports(importClause.namedBindings)) return;

        const elements = importClause.namedBindings.elements;
        if (elements.some(el => el.name.text === change.typeName)) return;

        const existingTypes = elements.map(el => el.name.text);
        existingTypes.push(change.typeName);
        const sortedTypes = existingTypes.sort().join(', ');

        // If either the existing import or the new import is type-only, 
        // the merged import should be type-only to maintain type safety
        const shouldBeTypeOnly = importClause.isTypeOnly || change.isTypeOnly;
        const typeKeyword = shouldBeTypeOnly ? 'type ' : '';
        const newImport = `import ${typeKeyword}{ ${sortedTypes} } from "${(node.moduleSpecifier as ts.StringLiteral).text}";`;
        
        const startPos = node.getStart();
        const endPos = node.getEnd();
        edits.push(this.createEdit(startPos, endPos, newImport, document));
    }

    /**
     * Creates a new import statement when no existing import exists
     * @param lastImportPos - Position of the last import in the file
     * @param document - The document being modified
     * @param change - The import change to apply
     * @param edits - Array of edits to append to
     * @example
     * // When adding a new type import to a file
     * // Input:  [No existing import]
     * // Output: import { UserType } from './models';
     * // Or with type-only:
     * // Output: import type { UserType } from './models';
     */
    private addNewImport(
        lastImportPos: number,
        document: vscode.TextDocument,
        change: ImportChange,
        edits: ImportEdit[]
    ): void {
        const importStatement = change.isTypeOnly
            ? `import type { ${change.typeName} } from "${change.newImportPath}";\n`
            : `import { ${change.typeName} } from "${change.newImportPath}";\n`;

        const pos = document.positionAt(lastImportPos).line + 1;
        edits.push({
            range: new vscode.Range(pos, 0, pos, 0),
            newText: importStatement
        });
    }

    /**
     * Creates an edit object with the given range and new text
     * @param start - Start position of the edit
     * @param end - End position of the edit
     * @param newText - New text to insert
     * @param document - The document being modified
     * @returns An edit object
     * @example
     * // Creating an edit to replace text
     * const edit = createEdit(0, 10, 'new text', document);
     * // Result:
     * // {
     * //   range: new vscode.Range(
     * //     document.positionAt(0),
     * //     document.positionAt(10)
     * //   ),
     * //   newText: 'new text'
     * // }
     */
    private createEdit(
        start: number,
        end: number,
        newText: string,
        document: vscode.TextDocument
    ): ImportEdit {
        return {
            range: new vscode.Range(
                document.positionAt(start),
                document.positionAt(end)
            ),
            newText
        };
    }

    /**
     * Applies a set of edits to a document
     * @param uri - The URI of the document to modify
     * @param edits - The edits to apply
     * @example
     * // Applying multiple edits to a document
     * await applyEdits(documentUri, [
     *   {
     *     range: new vscode.Range(0, 0, 0, 10),
     *     newText: 'import { Type1 } from "./types";'
     *   },
     *   {
     *     range: new vscode.Range(1, 0, 1, 15),
     *     newText: 'import { Type2 } from "./models";'
     *   }
     * ]);
     */
    private async applyEdits(uri: vscode.Uri, edits: ImportEdit[]): Promise<void> {
        const edit = new vscode.WorkspaceEdit();
        for (const editToApply of edits) {
            edit.replace(uri, editToApply.range, editToApply.newText);
        }
        await vscode.workspace.applyEdit(edit);
    }
}
