/**
 * 搜索编排
 * ------------------------------------------------------------------
 * 负责：解析查询 → 应用界面筛选与排除规则 → 打分排序 → 截断 → 抽摘要。
 * 纯函数部分（rankEntries）可以脱离 Obsidian 单独测试。
 */

import type { VaultIndex, DocEntry, IndexStats } from './indexer';
import { parseQuery, type Field, type Term } from './query';
import { matchesRange, type DateRange } from './datefilter';
import { scoreDocument, buildSnippet, normalizeScores, type HitField } from './ranker';

export interface SearchOptions {
	/** 界面上选中的筛选。输入里自带字段前缀时以输入为准 */
	field: Field;
	/** 结果条数上限 */
	limit: number;
	/** 排除规则，逗号分隔，支持 * 通配 */
	exclude: string;
	caseSensitive: boolean;
	/** 摘要目标长度 */
	snippetLength: number;
	/** 按修改时间筛选，null / 省略表示不限 */
	dateRange?: DateRange | null;
}

export interface SearchResult {
	doc: DocEntry;
	score: number;
	/** 归一化到 0–100 的相对相关度 */
	relevance: number;
	snippet: string;
	terms: Term[];
	fields: HitField[];
}

export interface SearchOutcome {
	query: string;
	results: SearchResult[];
	/** 命中总数（截断前） */
	total: number;
	/** 参与打分的文档数 */
	scanned: number;
	elapsedMs: number;
	index: IndexStats | null;
}

export const DEFAULT_OPTIONS: SearchOptions = {
	field: 'any',
	limit: 100,
	exclude: '',
	caseSensitive: false,
	snippetLength: 170,
};

/** 把 "模板*, 归档/, *.excalidraw.md" 这类规则编译成正则 */
export function compileExcludes(raw: string): RegExp[] {
	if (!raw) return [];
	const patterns = raw
		.split(',')
		.map((p) => p.trim())
		.filter(Boolean);

	return patterns.map((pattern) => {
		const escaped = pattern
			.replace(/[.+^${}()|[\]\\]/g, '\\$&')
			.replace(/\*\*/g, '\u0000')
			.replace(/\*/g, '[^/]*')
			.replace(/\u0000/g, '.*')
			.replace(/\/$/, '/');
		// 不含斜杠的规则在整个路径上模糊匹配，含斜杠的从路径开头匹配
		return pattern.includes('/')
			? new RegExp(`^${escaped}`, 'i')
			: new RegExp(`(^|/)${escaped}`, 'i');
	});
}

function isExcluded(path: string, rules: RegExp[]): boolean {
	for (const rule of rules) {
		if (rule.test(path)) return true;
	}
	return false;
}

/** 把界面筛选套用到没有字段前缀的词项上 */
export function applyDefaultField(terms: Term[], field: Field): Term[] {
	if (field === 'any') return terms;
	return terms.map((term) => (term.field === 'any' ? { ...term, field } : term));
}

/**
 * 对一组文档打分排序。不涉及 Obsidian API，便于测试。
 */
export function rankEntries(
	entries: Iterable<DocEntry>,
	terms: Term[],
	options: Pick<SearchOptions, 'caseSensitive' | 'limit' | 'snippetLength' | 'dateRange'>,
	excludeRules: RegExp[] = []
): { results: SearchResult[]; total: number; scanned: number } {
	const scored: Array<{ doc: DocEntry; score: number; fields: HitField[] }> = [];
	const range = options.dateRange ?? null;
	let scanned = 0;

	for (const doc of entries) {
		if (excludeRules.length > 0 && isExcluded(doc.path, excludeRules)) continue;
		// 时间筛选和路径排除一样，是"不参与打分"的硬过滤，不算进扫描数
		if (!matchesRange(doc.mtime, range)) continue;
		scanned++;

		const result = scoreDocument(doc, terms, options.caseSensitive);
		if (!result) continue;
		scored.push({ doc, score: result.score, fields: result.fields });
	}

	// 分数相同时新笔记优先，符合"最近改的通常是我要找的"这一直觉
	scored.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return b.doc.mtime - a.doc.mtime;
	});

	const total = scored.length;
	const limited = scored.slice(0, Math.max(1, options.limit));
	const normalized = normalizeScores(limited.map((s) => s.score));

	const results: SearchResult[] = limited.map((item, index) => ({
		doc: item.doc,
		score: item.score,
		relevance: normalized[index],
		snippet: buildSnippet(item.doc, terms, options.snippetLength, options.caseSensitive),
		terms,
		fields: item.fields,
	}));

	return { results, total, scanned };
}

/**
 * 完整搜索流程：刷新索引 → 解析 → 打分。
 */
export async function runSearch(
	index: VaultIndex,
	rawQuery: string,
	options: SearchOptions
): Promise<SearchOutcome> {
	const started = performance.now();
	const indexStats = await index.refresh();

	const parsed = parseQuery(rawQuery);
	if (!parsed.hasPositive) {
		return {
			query: rawQuery,
			results: [],
			total: 0,
			scanned: 0,
			elapsedMs: Math.round(performance.now() - started),
			index: indexStats,
		};
	}

	const terms = applyDefaultField(parsed.terms, options.field);
	const rules = compileExcludes(options.exclude);

	const { results, total, scanned } = rankEntries(index.all(), terms, options, rules);

	return {
		query: rawQuery,
		results,
		total,
		scanned,
		elapsedMs: Math.round(performance.now() - started),
		index: indexStats,
	};
}
