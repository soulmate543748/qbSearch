/**
 * 命中定位
 * ------------------------------------------------------------------
 * 搜索面板点开一条结果时，光把笔记打开是不够的——用户还得自己在几屏内容里
 * 找那个词。这里负责把"命中的词"换算成正文里的字符区间与行号，交给编辑器
 * 选中并滚过去。
 *
 * 纯字符串运算，不碰 Obsidian API，可以直接测。
 */

export interface MatchLocation {
	/** 命中区间在正文里的起止字符偏移（半开区间） */
	start: number;
	end: number;
	/** 命中处所在行（0 起） */
	line: number;
	/** 命中处在该行的列偏移 */
	ch: number;
	/** 实际命中的词 */
	needle: string;
}

function lineStartOf(content: string, offset: number): number {
	const index = content.lastIndexOf('\n', offset - 1);
	return index < 0 ? 0 : index + 1;
}

function countLines(content: string, offset: number): number {
	let lines = 0;
	for (let i = 0; i < offset; i++) {
		if (content.charCodeAt(i) === 10) lines++;
	}
	return lines;
}

/**
 * 在正文里找第一处命中。
 * 多词查询时按词长从长到短试：长词更具体，定位更准。
 */
export function locateInContent(
	content: string,
	needles: string[],
	caseSensitive = false
): MatchLocation | null {
	if (!content) return null;

	const words = needles
		.map((needle) => needle.trim())
		.filter(Boolean)
		.sort((a, b) => b.length - a.length);

	if (words.length === 0) return null;

	const haystack = caseSensitive ? content : content.toLowerCase();

	for (const word of words) {
		const target = caseSensitive ? word : word.toLowerCase();
		const start = haystack.indexOf(target);
		if (start < 0) continue;
		const lineStart = lineStartOf(content, start);
		return {
			start,
			end: start + word.length,
			line: countLines(content, lineStart),
			ch: start - lineStart,
			needle: word,
		};
	}

	return null;
}
