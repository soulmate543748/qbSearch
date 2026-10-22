/**
 * 搜索内核测试
 * ------------------------------------------------------------------
 * 重点不是"能不能搜到"，而是**排序对不对**：
 * 标题命中是否排在正文命中之前、短语是否比单词严格、排除是否生效、
 * 截断是否发生在排序之后。这些是"结果更准确"的可验证部分。
 */

import {
	parseQuery,
	applyDefaultField,
	compileExcludes,
	rankEntries,
	findRanges,
	locateInContent,
	parseDay,
	resolveRange,
	matchesRange,
	formatModified,
} from '../src/index';
import type { DocEntry } from '../src/indexer';
import type { DateRange } from '../src/datefilter';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
	if (condition) {
		passed++;
		console.log(`  ✓ ${name}`);
	} else {
		failed++;
		console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`);
	}
}

function section(title: string): void {
	console.log(`\n▸ ${title}`);
}

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 20);

function makeDoc(
	path: string,
	content: string,
	options: { tags?: string[]; headings?: string[]; mtime?: number } = {}
): DocEntry {
	const title = path.split('/').pop()!.replace(/\.md$/, '');
	return {
		path,
		title,
		lowerTitle: title.toLowerCase(),
		lowerPath: path.toLowerCase(),
		content,
		lowerContent: content.toLowerCase(),
		headings: options.headings ?? [],
		tags: options.tags ?? [],
		ctime: options.mtime ?? NOW,
		mtime: options.mtime ?? NOW,
		size: content.length,
	};
}

const docs: DocEntry[] = [
	makeDoc('项目/搜索优化方案.md', '本文讨论搜索的排序策略，搜索在全文中的位置并不重要。', {
		tags: ['项目', '搜索'],
		headings: ['搜索优化'],
		mtime: NOW - 2 * DAY,
	}),
	makeDoc('日记/2026-10-01.md', '今天读了一篇关于搜索的文章，顺手记了几条搜索笔记。', {
		tags: ['日记'],
		mtime: NOW - 19 * DAY,
	}),
	makeDoc('归档/旧计划.md', '计划里提到搜索，但没有展开。', { tags: ['归档'], mtime: NOW - 400 * DAY }),
	makeDoc('笔记/git tag 用法.md', '使用 git tag 给提交打标签，配合 git tag -l 查看。', {
		tags: ['git'],
		mtime: NOW - DAY,
	}),
	makeDoc('笔记/tagging 心得.md', 'tagging 是一种习惯，与 git 无关。', { mtime: NOW - 3 * DAY }),
	makeDoc('模板/日记模板.md', '模板内容：搜索占位符。', { tags: ['模板'], mtime: NOW - 100 * DAY }),
];

function search(
	query: string,
	options: Partial<{
		field: any;
		limit: number;
		exclude: string;
		caseSensitive: boolean;
		dateRange: DateRange | null;
	}> = {}
) {
	const parsed = parseQuery(query);
	const terms = applyDefaultField(parsed.terms, options.field ?? 'any');
	return rankEntries(
		docs,
		terms,
		{
			caseSensitive: options.caseSensitive ?? false,
			limit: options.limit ?? 50,
			snippetLength: 170,
			dateRange: options.dateRange ?? null,
		},
		compileExcludes(options.exclude ?? '')
	);
}

function titles(results: Array<{ doc: DocEntry }>): string[] {
	return results.map((r) => r.doc.title);
}

/* ---------------------------------------------------------------- 解析 */

section('查询解析');

{
	const q = parseQuery('file:"my note" -draft tag:#项目 path:日记 foo');
	check('词项数量为 5', q.terms.length === 5, String(q.terms.length));
	check('file: 映射到 title 字段', q.terms[0].field === 'title');
	check('引号识别为短语', q.terms[0].phrase === true);
	check('引号内空格保留', q.terms[0].text === 'my note', q.terms[0].text);
	check('- 前缀识别为排除', q.terms[1].negate === true);
	check('tag:# 会去掉井号', q.terms[2].text === '项目', q.terms[2].text);
	check('path: 映射到 path 字段', q.terms[3].field === 'path');
	check('普通词落到 any', q.terms[4].field === 'any');
}

{
	const q = parseQuery('https://example.com');
	check('网址不会被误认为字段前缀', q.terms[0].text === 'https://example.com', q.terms[0].text);
}

{
	const q = parseQuery('a - b');
	check('孤立减号不产生排除项', q.terms.length === 2 && !q.terms[1].negate);
}

/* ---------------------------------------------------------------- 排序 */

section('排序准确性');

{
	const r = search('搜索').results;
	check('命中 4 篇（模板被关键词命中）', r.length === 4, titles(r).join(', '));
	check('标题含关键词的排在首位', r[0].doc.title.includes('搜索'), titles(r).join(', '));
}

{
	const r = search('搜索').results;
	const byTitle = titles(r);
	const idxOptimize = byTitle.indexOf('搜索优化方案');
	const idxDiary = byTitle.indexOf('2026-10-01');
	check('标题命中优先于正文高频命中', idxOptimize >= 0 && idxDiary > idxOptimize, byTitle.join(' > '));
}

{
	const r = search('tag:搜索').results;
	check('tag: 只返回带该标签的笔记', r.length === 1 && r[0].doc.title === '搜索优化方案', titles(r).join(', '));
}

{
	const r = search('搜索', { field: 'title' }).results;
	check('界面筛选「文件名」生效', r.every((x) => x.doc.title.includes('搜索')), titles(r).join(', '));
}

{
	const r = search('git').results;
	check('文件名命中 git 的排第一', r[0].doc.title.includes('git'), titles(r).join(', '));
}

/* ---------------------------------------------------------------- 精确性 */

section('匹配精确性');

{
	const r = search('"git tag"').results;
	check('短语只命中连续出现的那篇', r.length === 1 && r[0].doc.title === 'git tag 用法', titles(r).join(', '));
}

{
	const plain = search('搜索 排序').results;
	check('多词为 AND：只返回同时含两词的笔记', plain.length === 1 && plain[0].doc.title === '搜索优化方案', titles(plain).join(', '));
}

{
	const r = search('搜索 -日记').results;
	check('排除词生效', titles(r).every((t) => t !== '2026-10-01'), titles(r).join(', '));
}

{
	const r = search('搜索', { exclude: '模板*' }).results;
	check('排除规则命中目录', titles(r).every((t) => t !== '日记模板'), titles(r).join(', '));
}

{
	const r = search('搜索', { caseSensitive: true }).results;
	check('区分大小写时中文不受影响', r.length > 0);
}

{
	const lower = search('GIT').results;
	check('默认忽略大小写', lower.length === 2, titles(lower).join(', '));
}

/* ---------------------------------------------------------------- 截断 */

section('截断与归一化');

{
	const all = search('搜索').results;
	const limited = search('搜索', { limit: 2 }).results;
	check('limit 生效', limited.length === 2, String(limited.length));
	check('截断发生在排序之后（首条仍是高分项）', limited[0].doc.title === all[0].doc.title, limited[0].doc.title);
	check('相关度归一化，首条为 100', limited[0].relevance === 100, String(limited[0].relevance));
}

/* ---------------------------------------------------------------- 摘要 */

section('摘要抽取');

{
	const r = search('搜索').results[0];
	check('摘要非空', r.snippet.length > 0);
	check('摘要包含关键词', r.snippet.includes('搜索') || r.doc.title.includes('搜索'));
	check('摘要受长度约束（含省略号不超过 200）', r.snippet.length <= 200, String(r.snippet.length));
	check('命中位置被记录', r.doc.path === '项目/搜索优化方案.md');
}

{
	const doc = makeDoc('长文.md', '前置内容。'.repeat(100) + '关键字在这里出现。' + '后置内容。'.repeat(100));
	const results = rankEntries([doc], parseQuery('关键字').terms, { caseSensitive: false, limit: 5, snippetLength: 80 });
	check('长文中摘要会定位到命中处', results.results[0].snippet.includes('关键字'), results.results[0].snippet.slice(0, 40));
}

/* ---------------------------------------------------------------- 高亮 */

section('高亮区间');

{
	const ranges = findRanges('搜索优化：搜索排序', ['搜索']);
	check('两处命中都被找到', ranges.length === 2, JSON.stringify(ranges));
	check('区间位置正确', ranges[0][0] === 0 && ranges[0][1] === 2, JSON.stringify(ranges[0]));
}

{
	const ranges = findRanges('git tag 用法', ['git', 'tag']);
	check('多个词各自成区间', ranges.length === 2, JSON.stringify(ranges));
}

{
	const ranges = findRanges('abcabc', ['abc', 'bca']);
	check('重叠区间被合并', ranges.length === 1 && ranges[0][0] === 0 && ranges[0][1] === 6, JSON.stringify(ranges));
}

{
	const ranges = findRanges('Git Tag', ['git'], false);
	check('默认忽略大小写', ranges.length === 1);
	const strict = findRanges('Git Tag', ['git'], true);
	check('区分大小写时不命中', strict.length === 0);
}

/* ---------------------------------------------------------------- 命中定位 */

section('命中定位（点结果后跳到哪一行）');

{
	const content = '# 标题\n\n第一段没有命中。\n\n第二段有 搜索 关键词。';
	const hit = locateInContent(content, ['搜索']);
	check('定位到命中词', !!hit && content.slice(hit.start, hit.end) === '搜索');
	check('行号从 0 起且落在命中行', hit?.line === 4, String(hit?.line));
	check('列偏移落在词首', hit?.ch === 5, String(hit?.ch));
}

{
	const content = '开头 Git Tag 结尾';
	const loose = locateInContent(content, ['git'], false);
	check('默认忽略大小写也能定位', loose?.start === 3, String(loose?.start));
	const strict = locateInContent(content, ['git'], true);
	check('区分大小写时定位失败', strict === null);
}

{
	const content = '这里先出现开发，后面才是开发工具。';
	const hit = locateInContent(content, ['开发', '开发工具']);
	check('多词时优先用更长的词定位', hit?.needle === '开发工具', hit?.needle);
}

{
	check('没有命中时返回 null', locateInContent('无关内容', ['搜索']) === null);
	check('空查询不定位', locateInContent('正文', []) === null);
}

/* ---------------------------------------------------------------- 时间筛选 */

section('时间筛选');

{
	check('不限 → 没有区间', resolveRange({ preset: 'any', from: '', to: '' }) === null);

	const week = resolveRange({ preset: 'week', from: '', to: '' }, NOW);
	check(
		'最近一周 = 7×24 小时，且没有上界',
		week?.start === NOW - 7 * DAY && week?.end === Infinity,
		JSON.stringify(week)
	);

	const day = resolveRange({ preset: 'day', from: '', to: '' }, NOW);
	check('最近一天 = 24 小时', day?.start === NOW - DAY);
}

{
	check(
		'日期解析到本地零点',
		parseDay('2026-10-01') === new Date(2026, 9, 1, 0, 0, 0, 0).getTime()
	);
	check(
		'结束日取当天最后一毫秒',
		parseDay('2026-10-21', true) === new Date(2026, 9, 21, 23, 59, 59, 999).getTime()
	);
	check('不存在的日期返回 null', parseDay('2026-02-31') === null);
	check('非日期文本返回 null', parseDay('上周') === null);
}

{
	const custom = resolveRange({ preset: 'custom', from: '2026-10-01', to: '2026-10-10' });
	check(
		'自定义范围首尾都含当天',
		matchesRange(new Date(2026, 9, 1, 0, 1).getTime(), custom) &&
			matchesRange(new Date(2026, 9, 10, 23, 0).getTime(), custom)
	);
	check('范围外被排除', !matchesRange(new Date(2026, 9, 11, 0, 1).getTime(), custom));

	const reversed = resolveRange({ preset: 'custom', from: '2026-10-10', to: '2026-10-01' });
	check(
		'起止填反自动摆正',
		!!reversed && reversed.start === new Date(2026, 9, 1).getTime() && reversed.end === new Date(2026, 9, 10, 23, 59, 59, 999).getTime(),
		JSON.stringify(reversed)
	);
	check(
		'只填一端时另一端不限',
		resolveRange({ preset: 'custom', from: '2026-10-01', to: '' })?.end === Infinity
	);
	check('两端都空视为不限', resolveRange({ preset: 'custom', from: '', to: '' }) === null);
}

{
	const week = search('搜索', { dateRange: resolveRange({ preset: 'week', from: '', to: '' }, NOW) });
	check('一周筛选只留下最近的笔记', week.results.length === 1, titles(week.results).join(', '));

	const month = search('搜索', { dateRange: resolveRange({ preset: 'month', from: '', to: '' }, NOW) });
	check('放宽到一月多回一篇', month.results.length === 2, titles(month.results).join(', '));

	const day = search('搜索', { dateRange: resolveRange({ preset: 'day', from: '', to: '' }, NOW) });
	check('一天内没有结果', day.results.length === 0, titles(day.results).join(', '));
	check('被筛掉的笔记不计入扫描数', day.scanned < search('搜索').scanned);
}

{
	check('旧笔记的修改时间显示为日期', /^\d{4}-\d{2}-\d{2}$/.test(formatModified(NOW - 400 * DAY, NOW)));
	check('刚改过的显示为相对时间', formatModified(NOW - 30_000, NOW).length > 0);
}

/* ---------------------------------------------------------------- 输出 */

console.log(`\n${passed} 通过 / ${failed} 失败`);
if (failed > 0) process.exit(1);
