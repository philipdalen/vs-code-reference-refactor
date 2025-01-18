import * as vscode from 'vscode';
import * as path from 'path';
import { TypeAnalyzer } from '../utils/typeAnalyzer';
import { ImportManager } from '../utils/importManager';
import { FileManager } from '../utils/fileManager';
import { TypeFinder } from '../utils/typeFinder';

export async function moveType() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
    }

    // Get the selected type
    const selection = editor.selection;
    const document = editor.document;
    const typeFinder = new TypeFinder();
    const selectedType = await typeFinder.findTypeAtSelection(document, selection);

    if (!selectedType) {
        vscode.window.showErrorMessage('No type found at cursor position');
        return;
    }

    // Get workspace folder
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found');
        return;
    }

    // Show input box for destination path
    const defaultPath = path.join(workspaceFolder.uri.fsPath, 'types', `${selectedType.name}.ts`);
    const destinationPath = await vscode.window.showInputBox({
        prompt: `Enter the full path for moving type '${selectedType.name}'`,
        value: defaultPath,
        validateInput: (value) => {
            if (!value) {
                return 'Path cannot be empty';
            }
            if (!value.endsWith('.ts') && !value.endsWith('.tsx')) {
                return 'File must have a .ts or .tsx extension';
            }
            return null;
        }
    });

    if (!destinationPath) {
        return;
    }

    const destinationUri = vscode.Uri.file(destinationPath);

    try {
        const typeAnalyzer = new TypeAnalyzer();
        const importManager = new ImportManager();
        const fileManager = new FileManager();

        // Analyze dependencies
        const dependencies = await typeAnalyzer.analyzeDependencies(selectedType);

        // Find all references
        const references = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            document.uri,
            selection.start
        );

        if (!references) {
            vscode.window.showErrorMessage('Could not find references');
            return;
        }

        // Remove the type definition from the source file
        const edit = new vscode.WorkspaceEdit();
        edit.delete(
            document.uri,
            new vscode.Range(
                document.positionAt(selectedType.node.getStart()),
                document.positionAt(selectedType.node.getEnd())
            )
        );
        await vscode.workspace.applyEdit(edit);

        // Calculate import changes
        const changes = await importManager.calculateChanges(
            selectedType,
            document.uri,
            destinationUri,
            references
        );

        // Apply changes
        await fileManager.createDestinationFile(destinationUri, selectedType.node.getText());
        await importManager.updateImports(changes);

        // Save all modified documents
        const modifiedDocuments = new Set([
            document,
            await vscode.workspace.openTextDocument(destinationUri),
            ...(await Promise.all(changes.importChanges.map(change => 
                vscode.workspace.openTextDocument(change.uri)
            )))
        ]);

        await Promise.all([...modifiedDocuments].map(doc => doc.save()));

        vscode.window.showInformationMessage(`Type '${selectedType.name}' moved successfully`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to move type: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
