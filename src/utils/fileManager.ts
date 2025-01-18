import * as vscode from 'vscode';
import * as ts from 'typescript';

/**
 * Manages file operations for creating, updating, and deleting content in workspace files.
 * Uses VSCode's workspace edit API to perform file operations with proper undo/redo support.
 */
export class FileManager {
    /**
     * Creates or updates a destination file with the provided content.
     * If the file exists, appends the new content at the bottom with a newline separator.
     * If the file doesn't exist, creates it with the provided content.
     * 
     * @param destinationUri - The URI of the destination file to create or update
     * @param content - The content to write to the file
     * @throws {Error} If the workspace edit fails to apply
     */
    public async createDestinationFile(destinationUri: vscode.Uri, content: string): Promise<void> {
        const edit = new vscode.WorkspaceEdit();
        
        try {
            // Try to open existing file
            const existingDocument = await vscode.workspace.openTextDocument(destinationUri);
            const existingContent = existingDocument.getText();
            
            // Append new content at the bottom with a newline separator
            const newContent = existingContent.trimEnd() + '\n\n' + content.trimStart();
            
            // Replace entire file content
            const fullRange = new vscode.Range(
                new vscode.Position(0, 0),
                existingDocument.lineAt(existingDocument.lineCount - 1).range.end
            );
            edit.replace(destinationUri, fullRange, newContent);
        } catch {
            // File doesn't exist, create it
            edit.createFile(destinationUri, { overwrite: true });
            edit.insert(destinationUri, new vscode.Position(0, 0), content);
        }
        
        await vscode.workspace.applyEdit(edit);
    }

    /**
     * Deletes a TypeScript node from a source file.
     * Uses the node's position information to determine the range to delete.
     * 
     * A TypeScript node represents a piece of TypeScript syntax in the Abstract Syntax Tree (AST).
     * In this context, it refers to a type declaration like an interface, type alias, or enum.
     * For example:
     * ```typescript
     * interface Person { ... }  // This entire interface declaration is a node
     * type Status = "active" | "inactive";  // This type alias is a node
     * enum Direction { ... }  // This enum declaration is a node
     * ```
     * 
     * @param sourceUri - The URI of the source file containing the node
     * @param node - The TypeScript node to delete
     * @throws {Error} If the file cannot be opened or the edit fails to apply
     */
    public async deleteTypeFromSource(sourceUri: vscode.Uri, node: ts.Node): Promise<void> {
        const document = await vscode.workspace.openTextDocument(sourceUri);
        const edit = new vscode.WorkspaceEdit();
        
        const start = document.positionAt(node.getStart());
        const end = document.positionAt(node.getEnd());
        
        edit.delete(sourceUri, new vscode.Range(start, end));
        await vscode.workspace.applyEdit(edit);
    }
}
