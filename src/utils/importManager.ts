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

    public async updateImports(changes: Changes): Promise<void> {
        for (const change of changes.importChanges) {
            const document = await vscode.workspace.openTextDocument(change.uri);
            const text = document.getText();
            const sourceFile = ts.createSourceFile(
                document.fileName,
                text,
                ts.ScriptTarget.Latest,
                true
            );

            // First collect all the edits we need to make
            const editsToApply: { range: vscode.Range; newText: string }[] = [];
            let hasExistingImport = false;
            let lastImportPos = 0;

            ts.forEachChild(sourceFile, node => {
                if (ts.isImportDeclaration(node)) {
                    lastImportPos = node.getEnd();
                    const importPath = (node.moduleSpecifier as ts.StringLiteral).text;
                    
                    if (importPath === change.oldImportPath) {
                        // Remove the old import if it only contains our type
                        const importClause = node.importClause;
                        if (importClause && importClause.namedBindings) {
                            const namedBindings = importClause.namedBindings;
                            if (ts.isNamedImports(namedBindings)) {
                                const elements = namedBindings.elements;
                                if (elements.length === 1 && elements[0].name.text === change.typeName) {
                                    // If this is the only type in the import, remove the entire import
                                    editsToApply.push({
                                        range: new vscode.Range(
                                            document.positionAt(node.getStart()),
                                            document.positionAt(node.getEnd())
                                        ),
                                        newText: ''
                                    });
                                } else if (elements.some(el => el.name.text === change.typeName)) {
                                    // If there are multiple types, only remove the specific type
                                    const remainingTypes = elements
                                        .filter(el => el.name.text !== change.typeName)
                                        .map(el => el.name.text)
                                        .join(', ');
                                    
                                    const typeKeyword = node.importClause?.isTypeOnly ? 'type ' : '';
                                    const newImport = `import ${typeKeyword}{ ${remainingTypes} } from '${importPath}';`;
                                    
                                    editsToApply.push({
                                        range: new vscode.Range(
                                            document.positionAt(node.getStart()),
                                            document.positionAt(node.getEnd())
                                        ),
                                        newText: newImport
                                    });
                                }
                            }
                        }
                    } else if (importPath === change.newImportPath) {
                        hasExistingImport = true;
                        // Update existing import to include our type if it's not already there
                        const importClause = node.importClause;
                        if (importClause && importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
                            const elements = importClause.namedBindings.elements;
                            if (!elements.some(el => el.name.text === change.typeName)) {
                                const existingTypes = elements.map(el => el.name.text);
                                existingTypes.push(change.typeName);
                                const sortedTypes = existingTypes.sort().join(', ');
                                const typeKeyword = importClause.isTypeOnly ? 'type ' : '';
                                const newImport = `import ${typeKeyword}{ ${sortedTypes} } from '${importPath}';`;
                                
                                editsToApply.push({
                                    range: new vscode.Range(
                                        document.positionAt(node.getStart()),
                                        document.positionAt(node.getEnd())
                                    ),
                                    newText: newImport
                                });
                            }
                        }
                    }
                }
            });

            // Add new import if it doesn't exist
            if (!hasExistingImport) {
                const importStatement = change.isTypeOnly
                    ? `import type { ${change.typeName} } from '${change.newImportPath}';\n`
                    : `import { ${change.typeName} } from '${change.newImportPath}';\n`;

                editsToApply.push({
                    range: new vscode.Range(
                        document.positionAt(lastImportPos).line + 1,
                        0,
                        document.positionAt(lastImportPos).line + 1,
                        0
                    ),
                    newText: importStatement
                });
            }

            // Sort edits from last to first to avoid position shifting
            editsToApply.sort((a, b) => b.range.start.line - a.range.start.line);

            // Apply all edits in a single edit operation
            const edit = new vscode.WorkspaceEdit();
            for (const editToApply of editsToApply) {
                edit.replace(change.uri, editToApply.range, editToApply.newText);
            }
            await vscode.workspace.applyEdit(edit);
        }
    }
}
