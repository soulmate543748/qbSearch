/**
 * 查询解析
 * ------------------------------------------------------------------
 * 把用户输入拆成带字段限定的词项。语法：
 *
 *   foo bar            普通关键词，空格分隔（AND）
 *   "foo bar"          短语，必须连续出现
 *   file:note          只在文件名里找
 *   path:folder        只在路径里找
 *   tag:project        只在标签里找
 *   h:section          只在标题（heading）里找
 *   -foo               排除包含 foo 的笔记
 *
 * 字段前缀与引号可以组合，例如 file:"my note"。
 */

export type Field = 'any' | 'title' | 'path' | 'tag' | 'heading';

export interface Term {
	/** 原始文本，保留大小写，用于高亮 */
	text: string;
	/** 小写形式，用于不区分大小写的匹配 */
	lower: string;
	field: Field;
	negate: boolean;
	/** 是否来自引号短语 */
	phrase: boolean;
}

export interface ParsedQuery {
	terms: Term[];
	hasPositive: boolean;
	raw: string;
}

const FIELD_ALIASES: Record<string, Field> = {
	file: 'title',
	name: 'title',
	title: 'title',
	path: 'path',
	in: 'path',
	folder: 'path',
	tag: 'tag',
	tags: 'tag',
	h: 'heading',
	heading: 'heading',
	headings: 'heading',
	section: 'heading',
	content: 'any',
	text: 'any',
};

/** 中英文引号都当作短语边界 */
const QUOTE_PAIRS: Record<string, string> = {
	'"': '"',
	"'": "'",
	'“': '”',
	'‘': '’',
	'「': '」',
};

function isSpace(ch: string): boolean {
	return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

export function parseQuery(input: string): ParsedQuery {
	const terms: Term[] = [];
	const s = input ?? '';
	let i = 0;

	while (i < s.length) {
		if (isSpace(s[i])) {
			i++;
			continue;
		}

		// 排除前缀。单独的 "-" 不算排除，避免把 "a - b" 解析坏
		let negate = false;
		if (s[i] === '-' && i + 1 < s.length && !isSpace(s[i + 1])) {
			negate = true;
			i++;
		}

		// 字段前缀：只认内置的别名，认不出就当作普通文本（例如 "https://..." 不会被吃掉）
		let field: Field = 'any';
		const prefixMatch = /^([A-Za-z]+):/.exec(s.slice(i));
		if (prefixMatch) {
			const resolved = FIELD_ALIASES[prefixMatch[1].toLowerCase()];
			if (resolved) {
				field = resolved;
				i += prefixMatch[0].length;
			}
		}

		let value = '';
		let phrase = false;

		const closer = QUOTE_PAIRS[s[i]];
		if (closer) {
			phrase = true;
			i++;
			while (i < s.length && s[i] !== closer) {
				value += s[i];
				i++;
			}
			if (i < s.length) i++; // 跳过收尾引号；未闭合则吃到结尾
		} else {
			while (i < s.length && !isSpace(s[i])) {
				value += s[i];
				i++;
			}
		}

		// tag:#项目 和 tag:项目 等价
		if (field === 'tag' && value.startsWith('#')) value = value.slice(1);

		// 孤立的 "-" 没有意义，丢掉，避免 "a - b" 被解析成三个词项
		if (!value || value === '-') continue;

		terms.push({
			text: value,
			lower: value.toLowerCase(),
			field,
			negate,
			phrase,
		});
	}

	return {
		terms,
		hasPositive: terms.some((t) => !t.negate),
		raw: s,
	};
}

/** 供界面提示用：把词项还原成可读的筛选描述 */
export function describeTerms(terms: Term[]): string[] {
	return terms.map((t) => {
		const fieldLabel =
			t.field === 'title'
				? 'file'
				: t.field === 'path'
				? 'path'
				: t.field === 'tag'
				? 'tag'
				: t.field === 'heading'
				? 'h'
				: '';
		const body = t.phrase ? `"${t.text}"` : t.text;
		return `${t.negate ? '-' : ''}${fieldLabel ? fieldLabel + ':' : ''}${body}`;
	});
}
