import * as vscode from 'vscode';
import { moveType } from './commands/moveType';
import { previewReferences } from './commands/previewReferences';

export function activate(context: vscode.ExtensionContext) {
    console.log('TypeScript Type Mover is now active');

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('typeMover.moveType', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor');
                return;
            }
            await moveType();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('typeMover.previewReferences', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor');
                return;
            }
            await previewReferences();
        })
    );
}

export function deactivate() {}
