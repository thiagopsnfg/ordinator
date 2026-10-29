const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

const UNSORTED = 'import longer from "longer";\nimport a from "a";\n\nexport { bb, a };\n';
const SORTED_IMPORTS = 'import a from "a";\nimport longer from "longer";\n\nexport { bb, a };\n';
const SORTED_ALL = 'import a from "a";\nimport longer from "longer";\n\nexport { a, bb };\n';

async function codeActions(document, kind, expectAny = true) {
	const range = new vscode.Range(0, 0, 0, 0);
	// Right after startup the provider registry may not be settled yet; retry briefly.
	for (let attempt = 0; ; attempt++) {
		const actions = await vscode.commands.executeCommand("vscode.executeCodeActionProvider", document.uri, range, kind);
		if (!expectAny || actions.length || attempt >= 20) return actions;
		await new Promise(resolve => setTimeout(resolve, 100));
	}
}

suite("Extension Test Suite", () => {
	let tmpDir;

	suiteSetup(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ordinator-"));
		await vscode.extensions.getExtension("thiagopsnfg.ordinator").activate();
	});

	suiteTeardown(async () => {
		await vscode.workspace.getConfiguration("editor").update("codeActionsOnSave", undefined, vscode.ConfigurationTarget.Global);
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("offers source.ordinator.sortImports code action", async () => {
		const document = await vscode.workspace.openTextDocument({ language: "javascript", content: UNSORTED });
		const actions = await codeActions(document, "source.ordinator.sortImports");
		assert.strictEqual(actions.length, 1);
		assert.strictEqual(actions[0].kind.value, "source.ordinator.sortImports");

		await vscode.workspace.applyEdit(actions[0].edit);
		assert.strictEqual(document.getText(), SORTED_IMPORTS);
	});

	test("does not offer actions for unconfigured languages", async () => {
		const document = await vscode.workspace.openTextDocument({ language: "plaintext", content: UNSORTED });
		const actions = await codeActions(document, "source.ordinator", false);
		assert.strictEqual(actions.length, 0);
	});

	test("sorts imports and exports on save via editor.codeActionsOnSave", async () => {
		await vscode.workspace.getConfiguration("editor").update(
			"codeActionsOnSave",
			{ "source.ordinator": "explicit" },
			vscode.ConfigurationTarget.Global
		);

		const file = path.join(tmpDir, "onsave.js");
		fs.writeFileSync(file, "");
		const document = await vscode.workspace.openTextDocument(file);
		const editor = await vscode.window.showTextDocument(document);
		await editor.edit(builder => builder.insert(new vscode.Position(0, 0), UNSORTED));
		await document.save();

		assert.strictEqual(document.getText(), SORTED_ALL);
	});
});
