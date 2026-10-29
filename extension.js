const vscode = require('vscode');
const sorter = require('./src/sorter');

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

	context.subscriptions.push(
		vscode.commands.registerCommand('ordinator.sortImports', () => applyToActiveEditor([sorter.sortImports])),
		vscode.commands.registerCommand('ordinator.sortExports', () => applyToActiveEditor([sorter.sortExports]))
	);

	let providerRegistration = registerProvider();
	context.subscriptions.push(
		{ dispose: () => providerRegistration.dispose() },
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('ordinator.languages')) {
				providerRegistration.dispose();
				providerRegistration = registerProvider();
			}
		})
	);
}

const KIND_ALL = vscode.CodeActionKind.Source.append('ordinator');
const KIND_IMPORTS = KIND_ALL.append('sortImports');
const KIND_EXPORTS = KIND_ALL.append('sortExports');

function getSorterOptions(document) {
	const config = vscode.workspace.getConfiguration('ordinator', document);
	return {
		sortSpecifiers: config.get('sortSpecifiers', true),
		includeRequire: config.get('includeRequire', true)
	};
}

function computeEdits(document, sorters) {
	const text = document.getText();
	const options = getSorterOptions(document);
	return sorters.flatMap(sort => sort(text, options)).map(e => vscode.TextEdit.replace(
		new vscode.Range(document.positionAt(e.start), document.positionAt(e.end)),
		e.newText
	));
}

function createAction(document, title, kind, sorters) {
	const edits = computeEdits(document, sorters);
	if (!edits.length) return null;
	const action = new vscode.CodeAction(title, kind);
	action.edit = new vscode.WorkspaceEdit();
	action.edit.set(document.uri, edits);
	return action;
}

class OrdinatorCodeActionProvider {
	provideCodeActions(document, _range, context) {
		const only = context.only;
		// Source actions are only offered when explicitly requested (on save or "Source Action...").
		if (!only) return [];

		// `source.ordinator` (e.g. on save) gets one combined edit so both sorts are
		// computed against the same document version.
		if (KIND_ALL.contains(only) && only.contains(KIND_IMPORTS) && only.contains(KIND_EXPORTS)) {
			const action = createAction(document, 'Sort imports and exports', KIND_ALL, [sorter.sortImports, sorter.sortExports]);
			return action ? [action] : [];
		}

		const actions = [];
		if (only.contains(KIND_IMPORTS)) actions.push(createAction(document, 'Sort imports', KIND_IMPORTS, [sorter.sortImports]));
		if (only.contains(KIND_EXPORTS)) actions.push(createAction(document, 'Sort exports', KIND_EXPORTS, [sorter.sortExports]));
		return actions.filter(Boolean);
	}
}

OrdinatorCodeActionProvider.providedCodeActionKinds = [KIND_ALL, KIND_IMPORTS, KIND_EXPORTS];

function registerProvider() {
	const languages = vscode.workspace.getConfiguration('ordinator').get('languages', []);
	return vscode.languages.registerCodeActionsProvider(
		languages.map(language => ({ language })),
		new OrdinatorCodeActionProvider(),
		{ providedCodeActionKinds: OrdinatorCodeActionProvider.providedCodeActionKinds }
	);
}

async function applyToActiveEditor(sorters) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;
	const edits = computeEdits(editor.document, sorters);
	if (!edits.length) return;
	const workspaceEdit = new vscode.WorkspaceEdit();
	workspaceEdit.set(editor.document.uri, edits);
	return vscode.workspace.applyEdit(workspaceEdit);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
