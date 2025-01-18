import * as ts from 'typescript';
import * as vscode from 'vscode';

export interface TypeInfo {
    name: string;
    node: ts.Node;
    dependencies: string[];
}

export class TypeAnalyzer {
    public async analyzeDependencies(typeInfo: TypeInfo): Promise<string[]> {
        const dependencies: string[] = [];
        const visitor = (node: ts.Node) => {
            if (ts.isTypeReferenceNode(node)) {
                const typeName = node.typeName.getText();
                if (!dependencies.includes(typeName)) {
                    dependencies.push(typeName);
                }
            }
            ts.forEachChild(node, visitor);
        };

        ts.forEachChild(typeInfo.node, visitor);
        return dependencies;
    }

    public isTypeNode(node: ts.Node): node is ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.EnumDeclaration {
        return (
            ts.isInterfaceDeclaration(node) ||
            ts.isTypeAliasDeclaration(node) ||
            ts.isEnumDeclaration(node)
        );
    }

    public getTypeInfo(node: ts.Node): TypeInfo | undefined {
        if (!this.isTypeNode(node)) {
            return undefined;
        }

        return {
            name: node.name.text,
            node: node,
            dependencies: []
        };
    }

    public async validateMove(typeInfo: TypeInfo, destinationUri: vscode.Uri): Promise<string | undefined> {
        try {
            const destinationDoc = await vscode.workspace.openTextDocument(destinationUri);
            const sourceText = destinationDoc.getText();
            const sourceFile = ts.createSourceFile(
                destinationUri.fsPath,
                sourceText,
                ts.ScriptTarget.Latest,
                true
            );

            let hasConflict = false;
            ts.forEachChild(sourceFile, node => {
                if (this.isTypeNode(node) && node.name.text === typeInfo.name) {
                    hasConflict = true;
                }
            });

            if (hasConflict) {
                return `Type '${typeInfo.name}' already exists in destination file`;
            }

            return undefined;
        } catch (error) {
            return `Failed to validate move: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    }
}
