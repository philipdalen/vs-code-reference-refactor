import * as vscode from 'vscode';
import * as ts from 'typescript';
import { TypeInfo } from './typeAnalyzer';

export class TypeFinder {
    private isTypeNode(node: ts.Node): node is ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.EnumDeclaration {
        return (
            ts.isInterfaceDeclaration(node) ||
            ts.isTypeAliasDeclaration(node) ||
            ts.isEnumDeclaration(node)
        );
    }

    public async findTypeAtSelection(
        document: vscode.TextDocument,
        selection: vscode.Selection
    ): Promise<TypeInfo | undefined> {
        const sourceFile = ts.createSourceFile(
            document.fileName,
            document.getText(),
            ts.ScriptTarget.Latest,
            true
        );

        const offset = document.offsetAt(selection.start);
        let selectedNode: ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.EnumDeclaration | undefined;

        const visit = (node: ts.Node) => {
            if (node.getStart() <= offset && node.getEnd() >= offset) {
                if (this.isTypeNode(node)) {
                    selectedNode = node;
                    return;
                }
            }
            ts.forEachChild(node, visit);
        };

        ts.forEachChild(sourceFile, visit);

        if (!selectedNode) {
            return undefined;
        }

        return {
            name: selectedNode.name.text,
            node: selectedNode,
            dependencies: []
        };
    }

    public async findTypeInFile(
        uri: vscode.Uri,
        typeName: string
    ): Promise<TypeInfo | undefined> {
        const document = await vscode.workspace.openTextDocument(uri);
        const sourceFile = ts.createSourceFile(
            document.fileName,
            document.getText(),
            ts.ScriptTarget.Latest,
            true
        );

        let foundNode: ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.EnumDeclaration | undefined;

        const visit = (node: ts.Node) => {
            if (this.isTypeNode(node) && node.name.text === typeName) {
                foundNode = node;
                return;
            }
            ts.forEachChild(node, visit);
        };

        ts.forEachChild(sourceFile, visit);

        if (!foundNode) {
            return undefined;
        }

        return {
            name: typeName,
            node: foundNode,
            dependencies: []
        };
    }
}
