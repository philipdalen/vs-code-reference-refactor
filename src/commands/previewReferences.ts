import * as vscode from 'vscode';
import { TypeFinder } from '../utils/typeFinder';
import { ReferenceAnalyzer } from '../utils/referenceAnalyzer';

export async function previewReferences() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
    }

    const selection = editor.selection;
    const document = editor.document;
    
    const typeFinder = new TypeFinder();
    const selectedType = await typeFinder.findTypeAtSelection(document, selection);

    if (!selectedType) {
        vscode.window.showErrorMessage('No type found at cursor position');
        return;
    }

    try {
        const referenceAnalyzer = new ReferenceAnalyzer();
        const references = await referenceAnalyzer.findReferences(document.uri, selection.start);

        if (!references || references.length === 0) {
            vscode.window.showInformationMessage('No references found');
            return;
        }

        // Create preview content
        let previewContent = `References for type "${selectedType.name}":\n\n`;
        for (const ref of references) {
            const location = ref.uri.fsPath;
            const position = ref.range.start;
            previewContent += `${location}:${position.line + 1}:${position.character + 1}\n`;
        }

        // Show preview in new document
        const preview = await vscode.workspace.openTextDocument({
            content: previewContent,
            language: 'text'
        });
        await vscode.window.showTextDocument(preview, { preview: true });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to preview references: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
