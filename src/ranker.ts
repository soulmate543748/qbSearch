/**
 * 相关性打分与片段抽取
 * ------------------------------------------------------------------
 * 打分是 qbSearch 的核心。目标不是"谁先被扫到谁排前面"，而是
 * **标题命中 > 标签命中 > 标题（heading）命中 > 路径命中 > 正文命中**，
 * 并在此基础上加几项修正：
 *
 *   - 词频：出现次数按 log 衰减，避免刷词条堆分数
 *   - 位置：标题开头命中、标题完全等于关键词额外加分
 *   - 覆盖：多个词分散在正文不同段落时，若它们出现在很小的窗口内则加分
 *   - 短语：带引号的短语天然比单词更精确，权重更高
 *
 * 所有分数最后再按当次最高分归一化，界面上显示的是相对相关度。
 */

/** 命中字段。'content' 只在结果里出现，不属于查询语法里的范围限定 */
export type HitField = 'title' | 'tag' | 'heading' | 'path' | 'content';

import type { DocEntry } from './indexer';
import type { Field, Term } from './query';

const WEIGHT: Record<HitField, number> = {
	title: 5.0,
	tag: 3.5,
	heading: 2.5,
	path: 1.8,
	content: 1.0,
};

const PHRASE_MULTIPLIER = 1.45;

/** 词频的直接乘数：第 1 次命中收益最大，后续递减 */
function frequencyFactor(count: number): number {
	if (count <= 0) return 0;
	return 1 + Math.log1p(count - 1 + 1) * 0.55;
}

export function countOccurrences(haystack: string, needle: string): number {
	if (!needle) return 0;
	let count = 0;
	let from = 0;
	for (;;) {
		const idx = haystack.indexOf(needle, from);
		if (idx < 0) break;
		count++;
		if (count > 500) break; // 防止极端重复文本拖慢
		from = idx + needle.length;
	}
	return count;
}

export function occurrences(haystack: string, needle: string, cap = 200): number[] {
	const out: number[] = [];
	if (!needle) return out;
	let from = 0;
	while (out.length < cap) {
		const idx = haystack.indexOf(needle, from);
		if (idx < 0) break;
		out.push(idx);
		from = idx + needle.length;
	}
	return out;
}

interface TermEvaluation {
	/** 命中字段（按权重从高到低） */
	fields: HitField[];
	/** 该词项的得分 */
	score: number;
	/** 正文中的位置，用于片段定位 */
	contentPositions: number[];
}

function evalTerm(doc: DocEntry, term: Term, caseSensitive: boolean): TermEvaluation | null {
	const needle = caseSensitive ? term.text : term.lower;
	const pick = (original: string, lowered: string) => (caseSensitive ? original : lowered);

	const titleText = pick(doc.title, doc.lowerTitle);
	const pathText = pick(doc.path, doc.lowerPath);
	const contentText = pick(doc.content, doc.lowerContent);

	const buckets: Array<{ field: HitField; count: number }> = [];

	const wants = (f: HitField) => term.field === 'any' || (term.field as string) === f;

	if (wants('title')) {
		const count = countOccurrences(titleText, needle);
		if (count > 0) buckets.push({ field: 'title', count });
	}

	if (wants('tag')) {
		let count = 0;
		for (const tag of doc.tags) {
			if (countOccurrences(pick(tag, tag.toLowerCase()), needle) > 0) count++;
		}
		if (count > 0) buckets.push({ field: 'tag', count });
	}

	if (wants('heading')) {
		let count = 0;
		for (const h of doc.headings) {
			count += countOccurrences(pick(h, h.toLowerCase()), needle);
		}
		if (count > 0) buckets.push({ field: 'heading', count });
	}

	if (wants('path')) {
		// 路径里天然包含文件名，避免与 title 重复计分，这里只看目录部分
		const dir = pathText.includes('/') ? pathText.slice(0, pathText.lastIndexOf('/')) : '';
		const count = dir ? countOccurrences(dir, needle) : 0;
		if (count > 0) buckets.push({ field: 'path', count });
	}

	let contentPositions: number[] = [];
	if (wants('content')) {
		contentPositions = occurrences(contentText, needle);
		if (contentPositions.length > 0) {
			buckets.push({ field: 'content', count: contentPositions.length });
		}
	}

	if (buckets.length === 0) return null;

	buckets.sort((a, b) => WEIGHT[b.field] * frequencyFactor(b.count) - WEIGHT[a.field] * frequencyFactor(a.count));

	const primary = buckets[0];
	let score = WEIGHT[primary.field] * frequencyFactor(primary.count);

	// 次级字段只给少量加成，避免同一篇笔记因为"到处都有"而虚高
	for (let i = 1; i < buckets.length; i++) {
		score += WEIGHT[buckets[i].field] * frequencyFactor(buckets[i].count) * 0.12;
	}

	// 标题上的位置与精确度加成
	const titleLower = doc.lowerTitle;
	const termLower = term.lower;
	if (buckets.some((b) => b.field === 'title')) {
		if (titleLower === termLower) {
			score += 6;
		} else if (titleLower.startsWith(termLower)) {
			score += 2;
		} else if (titleLower.includes(` ${termLower}`) || titleLower.includes(`-${termLower}`)) {
			score += 0.8;
		}
	}

	// 标签完全相等比"标签里含这个词"更强
	if (buckets.some((b) => b.field === 'tag')) {
		const exact = doc.tags.some((tag) => tag.toLowerCase() === termLower);
		if (exact) score += 2.5;
	}

	if (term.phrase) score *= PHRASE_MULTIPLIER;

	return {
		fields: buckets.map((b) => b.field),
		score,
		contentPositions,
	};
}

/** 多个词在正文里的最小覆盖窗口，用于给"靠得很近"的命中加分 */
function proximityBonus(positionLists: number[][]): number {
	const active = positionLists.filter((p) => p.length > 0);
	if (active.length < 2) return 0;

	// 合并成 (位置, 属于第几个词) 的事件流
	const events: Array<{ pos: number; owner: number }> = [];
	active.forEach((list, owner) => {
		for (const pos of list.slice(0, 40)) events.push({ pos, owner });
	});
	events.sort((a, b) => a.pos - b.pos);

	const counts = new Array(active.length).fill(0) as number[];
	let covered = 0;
	let left = 0;
	let bestSpan = Number.POSITIVE_INFINITY;

	for (let right = 0; right < events.length; right++) {
		const owner = events[right].owner;
		if (counts[owner] === 0) covered++;
		counts[owner]++;

		while (covered === active.length && left <= right) {
			const span = events[right].pos - events[left].pos;
			if (span < bestSpan) bestSpan = span;

			const leftOwner = events[left].owner;
			counts[leftOwner]--;
			if (counts[leftOwner] === 0) covered--;
			left++;
		}
	}

	if (!Number.isFinite(bestSpan)) return 0;
	if (bestSpan <= 80) return 1.0;
	if (bestSpan <= 200) return 0.45;
	if (bestSpan <= 400) return 0.2;
	return 0;
}

export interface DocumentScore {
	score: number;
	fields: HitField[];
	contentPositions: number[][];
}

/**
 * 给单篇笔记打分。返回 null 表示不满足查询条件。
 * 规则：所有正向词项都必须命中；任一排除词项命中则整篇排除。
 */
export function scoreDocument(doc: DocEntry, terms: Term[], caseSensitive = false): DocumentScore | null {
	if (terms.length === 0) return null;

	const fields = new Set<HitField>();
	const contentPositions: number[][] = [];
	let total = 0;
	let positiveCount = 0;

	for (const term of terms) {
		const evaluation = evalTerm(doc, term, caseSensitive);

		if (term.negate) {
			if (evaluation) return null; // 命中排除词，直接丢弃
			continue;
		}

		if (!evaluation) return null; // 缺少任一关键词，不匹配
		positiveCount++;
		total += evaluation.score;
		for (const f of evaluation.fields) fields.add(f);
		contentPositions.push(evaluation.contentPositions);
	}

	if (positiveCount === 0) return null;

	// 多词查询：所有词都出现在标题里，几乎肯定是用户要找的那篇
	if (positiveCount > 1 && [...fields].length === 1 && fields.has('title')) {
		total += 2;
	}

	const positiveTerms = terms.filter((t) => !t.negate);
	if (positiveTerms.length > 1) {
		total += proximityBonus(contentPositions);
	}

	return { score: total, fields: [...fields], contentPositions };
}

/**
 * 抽取摘要：以最佳命中窗口为中心，向两边扩展到近似长度，
 * 再对齐到换行或句读，避免从词中间开始。
 */
export function buildSnippet(
	doc: DocEntry,
	terms: Term[],
	maxLength = 170,
	caseSensitive = false
): string {
	const content = doc.content;
	if (!content) return doc.headings.length > 0 ? doc.headings[0] : '';

	const haystack = caseSensitive ? content : doc.lowerContent;
	const needles = terms
		.filter((t) => !t.negate)
		.map((t) => (caseSensitive ? t.text : t.lower))
		.filter(Boolean);

	// 找密度最高的窗口中心
	const positions = needles.map((n) => occurrences(haystack, n, 60));
	const allPositions: number[] = [];
	for (const list of positions) allPositions.push(...list);

	let bestCenter = 0;
	if (allPositions.length > 0) {
		const half = Math.floor(maxLength / 2);
		let bestCount = -1;
		for (const center of allPositions) {
			let count = 0;
			for (const list of positions) {
				for (const p of list) {
					if (p >= center - half && p <= center + half) count++;
				}
			}
			if (count > bestCount) {
				bestCount = count;
				bestCenter = center;
			}
		}
	}

	let start = Math.max(0, bestCenter - Math.floor(maxLength / 2));
	let end = Math.min(content.length, start + maxLength);
	if (end - start < maxLength) start = Math.max(0, end - maxLength);

	// 向前对齐到换行或句末标点，最多回退 40 字符
	const backLimit = Math.max(0, start - 40);
	for (let i = start; i > backLimit; i--) {
		const ch = content[i - 1];
		if (ch === '\n' || ch === '。' || ch === '！' || ch === '？' || ch === '.' || ch === '；' || ch === ';') {
			start = i;
			break;
		}
	}

	// 向后对齐：避免把单词切断
	while (end < content.length && /[A-Za-z0-9]/.test(content[end])) end++;

	let snippet = content.slice(start, end).trim();
	if (start > 0) snippet = '…' + snippet;
	if (end < content.length) snippet = snippet + '…';

	return snippet.replace(/\n{3,}/g, '\n\n');
}

/** 归一化到 0–100，用于界面显示相对相关度 */
export function normalizeScores(scores: number[]): number[] {
	const max = scores.reduce((m, s) => (s > m ? s : m), 0);
	if (max <= 0) return scores.map(() => 0);
	return scores.map((s) => Math.round((s / max) * 100));
}
