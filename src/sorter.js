/**
 * Pure (vscode-free) helpers that sort import/require/export statements.
 * Every public function returns a list of edits expressed as offsets
 * ({ start, end, newText }) over the original text, never overlapping.
 */

const DEFAULT_OPTIONS = {
	sortSpecifiers: true,
	includeRequire: true
};

const IDENT_CHAR = /[\w$\u00A0-\uFFFF]/;

/** Same criterion as the "Order Selection" command: shorter first. */
function compareByLength(a, b) {
	if (a.length !== b.length) return a.length - b.length;
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

function detectEol(text) {
	return text.includes('\r\n') ? '\r\n' : '\n';
}

function nextToken(text, pos) {
	const len = text.length;
	while (pos < len && /\s/.test(text[pos])) pos++;
	if (pos >= len) return null;

	const start = pos;
	const ch = text[pos];

	if (ch === '/' && text[pos + 1] === '/') {
		let end = text.indexOf('\n', pos);
		if (end === -1) end = len;
		if (text[end - 1] === '\r') end--;
		return { type: 'comment', start, end, value: text.slice(start, end) };
	}
	if (ch === '/' && text[pos + 1] === '*') {
		const close = text.indexOf('*/', pos + 2);
		const end = close === -1 ? len : close + 2;
		return { type: 'comment', start, end, value: text.slice(start, end) };
	}
	if (ch === '"' || ch === "'" || ch === '`') {
		pos++;
		while (pos < len && text[pos] !== ch) {
			if (text[pos] === '\\') pos++;
			else if (text[pos] === '\n' && ch !== '`') return null;
			pos++;
		}
		const end = Math.min(pos + 1, len);
		return { type: 'string', start, end, value: text.slice(start, end) };
	}
	if (IDENT_CHAR.test(ch)) {
		while (pos < len && IDENT_CHAR.test(text[pos])) pos++;
		return { type: 'ident', start, end: pos, value: text.slice(start, pos) };
	}
	return { type: 'punct', start, end: pos + 1, value: ch };
}

/** Returns the next non-comment token, flagging whether comments were skipped. */
function nextCode(text, pos, state) {
	let tok = nextToken(text, pos);
	while (tok && tok.type === 'comment') {
		if (state) state.hasComment = true;
		tok = nextToken(text, tok.end);
	}
	return tok;
}

function hasNewline(text, from, to) {
	return text.slice(from, to).includes('\n');
}

/** Parses `{ ... }` starting at `open` token. Accepts only specifier-like content. */
function parseBraces(text, open, state, allowColon) {
	let tok = nextCode(text, open.end, state);
	while (tok) {
		if (tok.type === 'punct' && tok.value === '}') {
			return { open: open.start, close: tok.start, end: tok.end };
		}
		const ok = tok.type === 'ident' || tok.type === 'string' ||
			(tok.type === 'punct' && (tok.value === ',' || (allowColon && tok.value === ':')));
		if (!ok) return null;
		tok = nextCode(text, tok.end, state);
	}
	return null;
}

/** Consumes optional import attributes and a same-line semicolon. */
function finishStatement(text, end) {
	let tok = nextCode(text, end);
	if (tok && tok.type === 'ident' && (tok.value === 'with' || tok.value === 'assert')) {
		const brace = nextCode(text, tok.end);
		if (brace && brace.type === 'punct' && brace.value === '{') {
			const close = text.indexOf('}', brace.end);
			if (close !== -1) {
				end = close + 1;
				tok = nextCode(text, end);
			}
		}
	}
	if (tok && tok.type === 'punct' && tok.value === ';' && !hasNewline(text, end, tok.start)) {
		end = tok.end;
	}
	return end;
}

function parseImport(text, pos) {
	const state = { hasComment: false };
	const kw = nextToken(text, pos);
	if (!kw || kw.type !== 'ident' || kw.value !== 'import') return null;

	let tok = nextCode(text, kw.end, state);
	if (!tok) return null;

	if (tok.type === 'string') {
		return { kind: 'sideEffect', start: kw.start, end: finishStatement(text, tok.end), braces: null, hasComment: state.hasComment };
	}

	let braces = null;
	while (tok) {
		if (tok.type === 'ident' && tok.value === 'from') {
			const source = nextCode(text, tok.end, state);
			if (source && source.type === 'string') {
				return { kind: 'import', start: kw.start, end: finishStatement(text, source.end), braces, hasComment: state.hasComment };
			}
		}
		if (tok.type === 'punct' && tok.value === '{') {
			if (braces) return null;
			braces = parseBraces(text, tok, state, false);
			if (!braces) return null;
			tok = nextCode(text, braces.end, state);
			continue;
		}
		const ok = tok.type === 'ident' || (tok.type === 'punct' && (tok.value === ',' || tok.value === '*'));
		if (!ok) return null;
		tok = nextCode(text, tok.end, state);
	}
	return null;
}

function parseRequire(text, pos) {
	const state = { hasComment: false };
	const kw = nextToken(text, pos);
	if (!kw || kw.type !== 'ident' || !['const', 'let', 'var'].includes(kw.value)) return null;

	let tok = nextCode(text, kw.end, state);
	let braces = null;
	if (tok && tok.type === 'punct' && tok.value === '{') {
		braces = parseBraces(text, tok, state, true);
		if (!braces) return null;
		tok = { end: braces.end, type: 'ident' };
	} else if (!tok || tok.type !== 'ident') {
		return null;
	}

	const expected = [['punct', '='], ['ident', 'require'], ['punct', '(']];
	for (const [type, value] of expected) {
		tok = nextCode(text, tok.end, state);
		if (!tok || tok.type !== type || tok.value !== value) return null;
	}
	const source = nextCode(text, tok.end, state);
	if (!source || source.type !== 'string') return null;
	const close = nextCode(text, source.end, state);
	if (!close || close.type !== 'punct' || close.value !== ')') return null;

	let end = close.end;
	const semi = nextCode(text, end);
	if (semi && semi.type === 'punct' && semi.value === ';' && !hasNewline(text, end, semi.start)) {
		end = semi.end;
	}

	// Reject things like `require('x').foo` or `require('x'), b = 1`.
	const after = nextToken(text, end);
	if (after && after.type !== 'comment' && !hasNewline(text, end, after.start)) return null;

	return { kind: 'require', start: kw.start, end, braces, hasComment: state.hasComment };
}

function parseExport(text, pos) {
	const state = { hasComment: false };
	const kw = nextToken(text, pos);
	if (!kw || kw.type !== 'ident' || kw.value !== 'export') return null;

	let tok = nextCode(text, kw.end, state);
	if (tok && tok.type === 'ident' && tok.value === 'type') tok = nextCode(text, tok.end, state);
	if (!tok || tok.type !== 'punct') return null;

	let braces = null;
	if (tok.value === '*') {
		tok = nextCode(text, tok.end, state);
		if (tok && tok.type === 'ident' && tok.value === 'as') {
			const name = nextCode(text, tok.end, state);
			if (!name || (name.type !== 'ident' && name.type !== 'string')) return null;
			tok = nextCode(text, name.end, state);
		}
		if (!tok || tok.type !== 'ident' || tok.value !== 'from') return null;
	} else if (tok.value === '{') {
		braces = parseBraces(text, tok, state, false);
		if (!braces) return null;
		const from = nextCode(text, braces.end);
		if (!from || from.type !== 'ident' || from.value !== 'from') {
			return { kind: 'export', start: kw.start, end: finishStatement(text, braces.end), braces, hasComment: state.hasComment };
		}
		tok = from;
	} else {
		return null;
	}

	const source = nextCode(text, tok.end, state);
	if (!source || source.type !== 'string') return null;
	return { kind: 'export', start: kw.start, end: finishStatement(text, source.end), braces, hasComment: state.hasComment };
}

/** Comment that starts on the same line right after the statement, if any. */
function trailingComment(text, end) {
	const tok = nextToken(text, end);
	if (tok && tok.type === 'comment' && !hasNewline(text, end, tok.start)) return tok;
	return null;
}

function sortSpecifierList(inner, eol) {
	if (/\/\/|\/\*/.test(inner)) return inner;

	const raw = inner.split(',');
	const hasTrailingComma = raw.length > 1 && raw[raw.length - 1].trim() === '';
	const parts = raw.map(p => p.trim()).filter(Boolean);
	if (parts.length < 2) return inner;

	const sorted = parts.slice().sort(compareByLength);

	if (inner.includes('\n')) {
		const indent = (inner.match(/\n([ \t]*)\S/) || [null, '\t'])[1];
		const closingIndent = (inner.match(/\n([ \t]*)$/) || [null, ''])[1];
		return eol + sorted.map(p => indent + p).join(',' + eol) + (hasTrailingComma ? ',' : '') + eol + closingIndent;
	}

	const leading = inner.match(/^\s*/)[0];
	const trailing = inner.match(/\s*$/)[0];
	return leading + sorted.join(', ') + (hasTrailingComma ? ',' : '') + trailing;
}

function renderStatement(text, stmt, opts, eol) {
	const raw = text.slice(stmt.start, stmt.end);
	if (!opts.sortSpecifiers || !stmt.braces || stmt.hasComment) return raw;

	const innerStart = stmt.braces.open + 1 - stmt.start;
	const innerEnd = stmt.braces.close - stmt.start;
	return raw.slice(0, innerStart) + sortSpecifierList(raw.slice(innerStart, innerEnd), eol) + raw.slice(innerEnd);
}

function buildItem(text, stmt, comments, opts, eol) {
	const trailing = trailingComment(text, stmt.end);
	const code = renderStatement(text, stmt, opts, eol);
	return {
		kind: stmt.kind,
		key: code.replace(/\s+/g, ' '),
		text: comments.map(c => c.value).concat(code + (trailing ? text.slice(stmt.end, trailing.end) : '')).join(eol),
		end: trailing ? trailing.end : stmt.end
	};
}

function sortItems(items) {
	return items.slice().sort((a, b) => compareByLength(a.key, b.key));
}

/** Skips shebang, leading comments and directive prologue ('use strict'). */
function skipHeader(text) {
	let pos = 0;
	if (text.startsWith('#!')) {
		const nl = text.indexOf('\n');
		pos = nl === -1 ? text.length : nl + 1;
	}
	for (;;) {
		const tok = nextToken(text, pos);
		if (!tok) return null;
		if (tok.type === 'comment') {
			pos = tok.end;
			continue;
		}
		if (tok.type === 'string' && tok.value[0] !== '`') {
			const after = nextToken(text, tok.end);
			if (!after || (after.type === 'punct' && after.value === ';')) {
				pos = after ? after.end : tok.end;
				continue;
			}
			if (hasNewline(text, tok.end, after.start)) {
				pos = tok.end;
				continue;
			}
		}
		return tok.start;
	}
}

/**
 * Sorts the import/require block at the top of the file, merging it into a
 * single block. Side-effect imports (`import './x'`) stay in place and split
 * the sorting into segments; `import` and `require` are kept as separate groups.
 */
function sortImports(text, options) {
	const opts = Object.assign({}, DEFAULT_OPTIONS, options);
	const eol = detectEol(text);
	const parse = pos => parseImport(text, pos) || (opts.includeRequire ? parseRequire(text, pos) : null);

	const regionStart = skipHeader(text);
	if (regionStart === null || !parse(regionStart)) return [];

	const items = [];
	let pending = [];
	let pos = regionStart;
	let regionEnd = regionStart;
	for (;;) {
		const tok = nextToken(text, pos);
		if (!tok) break;
		if (tok.type === 'comment') {
			pending.push(tok);
			pos = tok.end;
			continue;
		}
		const stmt = parse(tok.start);
		if (!stmt) break;
		const item = buildItem(text, stmt, pending, opts, eol);
		items.push(item);
		pending = [];
		pos = regionEnd = item.end;
	}

	const output = [];
	let segment = [];
	const flush = () => {
		const groups = [];
		for (const item of segment) {
			let group = groups.find(g => g.kind === item.kind);
			if (!group) groups.push(group = { kind: item.kind, items: [] });
			group.items.push(item);
		}
		groups.forEach(g => output.push(...sortItems(g.items)));
		segment = [];
	};
	for (const item of items) {
		if (item.kind === 'sideEffect') {
			flush();
			output.push(item);
		} else {
			segment.push(item);
		}
	}
	flush();

	const newText = output.map(i => i.text).join(eol);
	if (newText === text.slice(regionStart, regionEnd)) return [];
	return [{ start: regionStart, end: regionEnd, newText }];
}

const EXPORT_LINE = /^export\s*(?:type\s*)?[{*]/;

/**
 * Sorts each contiguous block of `export { ... }` / `export ... from` lines
 * (statements starting at column 0, without blank lines between them).
 */
function sortExports(text, options) {
	const opts = Object.assign({}, DEFAULT_OPTIONS, options);
	const eol = detectEol(text);
	const edits = [];

	const exportAt = lineStart => (EXPORT_LINE.test(text.slice(lineStart, lineStart + 20)) ? parseExport(text, lineStart) : null);
	const nextLineStart = pos => {
		const nl = text.indexOf('\n', pos);
		return nl === -1 ? -1 : nl + 1;
	};

	let lineStart = 0;
	while (lineStart !== -1 && lineStart < text.length) {
		let stmt = exportAt(lineStart);
		if (!stmt) {
			lineStart = nextLineStart(lineStart);
			continue;
		}

		const items = [];
		const blockStart = stmt.start;
		for (;;) {
			const item = buildItem(text, stmt, [], opts, eol);
			items.push(item);
			const after = nextToken(text, item.end);
			if (after && !hasNewline(text, item.end, after.start)) break;
			const next = nextLineStart(item.end);
			if (next === -1) break;
			stmt = exportAt(next);
			if (!stmt) break;
		}

		const blockEnd = items[items.length - 1].end;
		const newText = sortItems(items).map(i => i.text).join(eol);
		if (newText !== text.slice(blockStart, blockEnd)) {
			edits.push({ start: blockStart, end: blockEnd, newText });
		}
		lineStart = nextLineStart(blockEnd);
	}

	return edits;
}

/** Applies offset edits to a string (used by tests and as a reference). */
function applyEdits(text, edits) {
	return edits
		.slice()
		.sort((a, b) => b.start - a.start)
		.reduce((acc, e) => acc.slice(0, e.start) + e.newText + acc.slice(e.end), text);
}

module.exports = {
	compareByLength,
	sortImports,
	sortExports,
	applyEdits
};
