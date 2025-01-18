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

            // Find existing import style for this reference
            let oldImportPath = '';
            let isTypeOnly = false;

            ts.forEachChild(refSourceFile, node => {
                if (ts.isImportDeclaration(node)) {
                    const importPath = (node.moduleSpecifier as ts.StringLiteral).text;
                    const importClause = node.importClause;
                    if (importClause) {
                        isTypeOnly = importClause.isTypeOnly;
                        if (importClause.namedBindings) {
                            const namedBindings = importClause.namedBindings;
                            if (ts.isNamedImports(namedBindings)) {
                                const hasType = namedBindings.elements.some(
                                    element => element.name.text === typeInfo.name
                                );
                                if (hasType) {
                                    oldImportPath = importPath;
                                }
                            }
                        }
                    }
                }
            });

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
     * Updates import statements in TypeScript files based on provided changes
     * @param changes - The changes to apply to imports
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
     */
    private addNewImport(
        lastImportPos: number,
        document: vscode.TextDocument,
        change: ImportChange,
        edits: ImportEdit[]
    ): void {
        debugger
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
     */
    private async applyEdits(uri: vscode.Uri, edits: ImportEdit[]): Promise<void> {
        const edit = new vscode.WorkspaceEdit();
        for (const editToApply of edits) {
            edit.replace(uri, editToApply.range, editToApply.newText);
        }
        await vscode.workspace.applyEdit(edit);
    }
}
