const assert = require('node:assert');
const { sortImports, sortExports, applyEdits } = require('../../src/sorter');

const imports = (text, options) => applyEdits(text, sortImports(text, options));
const exportsOf = (text, options) => applyEdits(text, sortExports(text, options));

suite('Sorter - imports', () => {
	test('sorts imports by length and merges blank lines', () => {
		const input = [
			'import another from "x/another";',
			'',
			'import a from "a";',
			'import bb from "bb";',
			'',
			'const code = 1;',
			''
		].join('\n');
		assert.strictEqual(imports(input), [
			'import a from "a";',
			'import bb from "bb";',
			'import another from "x/another";',
			'',
			'const code = 1;',
			''
		].join('\n'));
	});

	test('returns no edits when already sorted', () => {
		assert.deepStrictEqual(sortImports('import a from "a";\nimport bb from "bb";\n'), []);
	});

	test('keeps shebang, directives and header comments in place', () => {
		const input = '#!/usr/bin/env node\n"use strict";\n/* eslint-disable */\nimport longer from "longer";\nimport a from "a";\n';
		assert.strictEqual(imports(input), '#!/usr/bin/env node\n"use strict";\n/* eslint-disable */\nimport a from "a";\nimport longer from "longer";\n');
	});

	test('moves attached and trailing comments with their import', () => {
		const input = 'import longer from "longer"; // why\n// about a\nimport a from "a";\n';
		assert.strictEqual(imports(input), '// about a\nimport a from "a";\nimport longer from "longer"; // why\n');
	});

	test('side-effect imports act as barriers', () => {
		const input = 'import bbbb from "b";\nimport a from "a";\nimport "./polyfill";\nimport dddd from "d";\nimport c from "c";\n';
		assert.strictEqual(imports(input), 'import a from "a";\nimport bbbb from "b";\nimport "./polyfill";\nimport c from "c";\nimport dddd from "d";\n');
	});

	test('sorts single-line and multiline specifiers', () => {
		const input = 'import { useState, a } from "react";\nimport {\n  zeta,\n  b,\n} from "x";\n';
		assert.strictEqual(imports(input), 'import {\n  b,\n  zeta,\n} from "x";\nimport { a, useState } from "react";\n');
	});

	test('does not sort specifiers when disabled or when they contain comments', () => {
		assert.strictEqual(imports('import { bb, a } from "x";\n', { sortSpecifiers: false }), 'import { bb, a } from "x";\n');
		assert.strictEqual(imports('import { bb, /* x */ a } from "x";\n'), 'import { bb, /* x */ a } from "x";\n');
	});

	test('keeps import and require groups separate', () => {
		const input = 'const longer = require("longer");\nimport bb from "bb";\nconst { b, a } = require("a");\nimport a from "a";\n\nfoo();\n';
		assert.strictEqual(imports(input), 'const { a, b } = require("a");\nconst longer = require("longer");\nimport a from "a";\nimport bb from "bb";\n\nfoo();\n');
	});

	test('ignores require when includeRequire is false', () => {
		const input = 'const longer = require("longer");\nconst a = require("a");\n';
		assert.deepStrictEqual(sortImports(input, { includeRequire: false }), []);
	});

	test('stops at non-import statements', () => {
		const input = 'import bb from "bb";\nimport a from "a";\nconst x = require("x").default;\nimport c from "c";\n';
		assert.strictEqual(imports(input), 'import a from "a";\nimport bb from "bb";\nconst x = require("x").default;\nimport c from "c";\n');
	});

	test('does not treat dynamic import or TS import-equals as imports', () => {
		assert.deepStrictEqual(sortImports('import("x");\nimport a from "a";\n'), []);
		assert.deepStrictEqual(sortImports('import x = require("y");\nimport a from "a";\n'), []);
	});

	test('preserves CRLF line endings', () => {
		const input = 'import bb from "bb";\r\nimport {\r\n  zz,\r\n  a\r\n} from "a";\r\n';
		assert.strictEqual(imports(input), 'import bb from "bb";\r\nimport {\r\n  a,\r\n  zz\r\n} from "a";\r\n');
	});

	test('handles import type and import attributes', () => {
		const input = 'import data from "./data.json" with { type: "json" };\nimport type { B, A } from "t";\n';
		assert.strictEqual(imports(input), 'import type { A, B } from "t";\nimport data from "./data.json" with { type: "json" };\n');
	});
});

suite('Sorter - exports', () => {
	test('sorts contiguous export blocks independently', () => {
		const input = [
			'export * from "./longer";',
			'export { b, a } from "./x";',
			'',
			'export const value = 1;',
			'',
			'export * as ns from "./n";',
			'export { zz, y };',
			''
		].join('\n');
		assert.strictEqual(exportsOf(input), [
			'export * from "./longer";',
			'export { a, b } from "./x";',
			'',
			'export const value = 1;',
			'',
			'export { y, zz };',
			'export * as ns from "./n";',
			''
		].join('\n'));
	});

	test('ignores indented exports and declarations', () => {
		const input = 'export function f() {}\n  export { b, a };\nexport default x;\n';
		assert.deepStrictEqual(sortExports(input), []);
	});

	test('imports and exports edits can be combined', () => {
		const input = 'import bb from "bb";\nimport a from "a";\n\nexport { bb, a };\n';
		const edits = sortImports(input).concat(sortExports(input));
		assert.strictEqual(applyEdits(input, edits), 'import a from "a";\nimport bb from "bb";\n\nexport { a, bb };\n');
	});
});
