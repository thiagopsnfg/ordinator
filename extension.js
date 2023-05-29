const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "ordinator" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let orderSelection = vscode.commands.registerCommand('extension.orderSelection', function () {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return; // No open text editor

    const selections = editor.selections;

		if (selections.length < 2) {
			return vscode.window.showErrorMessage(`Select more then one line to order`);
		}
		
		const selectionsSorted = selections.slice().sort((a,b) => {
			if(editor.document.getText(a) > editor.document.getText(b)) return 1;
			if(editor.document.getText(a) < editor.document.getText(b)) return -1;
			return 0;
		});

		return editor.edit(builder => {
			selections.forEach((selection, idx) => builder.replace(selection, editor.document.getText(selectionsSorted[idx])))
		});
	});

	context.subscriptions.push(orderSelection);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
