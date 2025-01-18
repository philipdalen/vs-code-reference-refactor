import * as vscode from 'vscode';
import * as ts from 'typescript';

export class ReferenceAnalyzer {
    public async findReferences(
        uri: vscode.Uri,
        position: vscode.Position
    ): Promise<vscode.Location[]> {
        const references = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            uri,
            position
        );

        return references || [];
    }

    public async findImportReferences(
        uri: vscode.Uri,
        typeName: string
    ): Promise<vscode.Location[]> {
        const document = await vscode.workspace.openTextDocument(uri);
        const sourceFile = ts.createSourceFile(
            document.fileName,
            document.getText(),
            ts.ScriptTarget.Latest,
            true
        );

        const locations: vscode.Location[] = [];

        const visit = (node: ts.Node) => {
            if (ts.isImportDeclaration(node)) {
                const importClause = node.importClause;
                if (importClause && importClause.namedBindings) {
                    if (ts.isNamedImports(importClause.namedBindings)) {
                        for (const element of importClause.namedBindings.elements) {
                            if (element.name.text === typeName) {
                                locations.push(
                                    new vscode.Location(
                                        uri,
                                        new vscode.Range(
                                            document.positionAt(element.getStart()),
                                            document.positionAt(element.getEnd())
                                        )
                                    )
                                );
                            }
                        }
                    }
                }
            }
            ts.forEachChild(node, visit);
        };

        ts.forEachChild(sourceFile, visit);

        return locations;
    }

    public async validateReferences(references: vscode.Location[]): Promise<string[]> {
        const errors: string[] = [];
        const config = vscode.workspace.getConfiguration('typeMover');
        const ignoredFolders = config.get<string[]>('ignoredFolders', ['node_modules', 'dist']);

        for (const ref of references) {
            // Check if reference is in ignored folder
            if (ignoredFolders.some(folder => ref.uri.fsPath.includes(folder))) {
                errors.push(`Reference found in ignored folder: ${ref.uri.fsPath}`);
                continue;
            }

            // Check if file exists and is writable
            try {
                const document = await vscode.workspace.openTextDocument(ref.uri);
                if (document.isUntitled) {
                    errors.push(`Cannot modify unsaved file: ${ref.uri.fsPath}`);
                }
            } catch (error) {
                errors.push(`Cannot access file: ${ref.uri.fsPath}`);
            }
        }

        return errors;
    }
}
