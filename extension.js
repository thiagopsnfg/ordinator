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
	let selectedLines = [];

		if (selections.length < 1) {
			return vscode.window.showErrorMessage(`Select something to order`);
		}

		if (selections.length === 1) {
			const selection = selections[0];

			if(selection.isSingleLine){
				return vscode.window.showErrorMessage(`Select more than one line to order`);
			}

			for (let lineNumber = selection.start.line; lineNumber <= selection.end.line; lineNumber++) {
				const line = editor.document.lineAt(lineNumber);
				const range = new vscode.Range(line.range.start, line.range.end);
				selectedLines.push(range);
			}
		} else {
			selectedLines = selections;
		}

		
		const selectionsSorted = selectedLines.slice().sort((a,b) => {
			if(editor.document.getText(a).length > editor.document.getText(b).length) return 1;
			if(editor.document.getText(a).length < editor.document.getText(b).length) return -1;
			return 0;
		});
		
		selectionsSorted.forEach(s => console.log(editor.document.getText(s)))
		
		return editor.edit(builder => {
			selectedLines.forEach((selection, idx) => builder.replace(selection, editor.document.getText(selectionsSorted[idx])))
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
