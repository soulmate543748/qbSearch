/**
 * 关键词高亮
 * ------------------------------------------------------------------
 * 先算区间再合并，避免"a"和"ab"两个词互相嵌套导致 DOM 结构错乱。
 * 渲染成 DOM 之后再做标记，所以 Markdown 渲染出来的正文、标题、
 * 代码块里的命中都能标到，而不是只标原始字符串。
 */

export type Range = [number, number];

export function findRanges(text: string, needles: string[], caseSensitive = false): Range[] {
	if (!text || needles.length === 0) return [];

	const haystack = caseSensitive ? text : text.toLowerCase();
	const raw: Range[] = [];

	for (const needle of needles) {
		if (!needle) continue;
		const target = caseSensitive ? needle : needle.toLowerCase();
		if (!target) continue;

		let from = 0;
		for (;;) {
			const index = haystack.indexOf(target, from);
			if (index < 0) break;
			raw.push([index, index + target.length]);
			from = index + target.length;
			if (raw.length > 400) break;
		}
	}

	if (raw.length === 0) return [];

	raw.sort((a, b) => a[0] - b[0] || b[1] - a[1]);

	const merged: Range[] = [raw[0]];
	for (let i = 1; i < raw.length; i++) {
		const last = merged[merged.length - 1];
		const current = raw[i];
		if (current[0] <= last[1]) {
			last[1] = Math.max(last[1], current[1]);
		} else {
			merged.push(current);
		}
	}

	return merged;
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT']);

/**
 * 在已经渲染好的 DOM 里包一层 <mark>。返回标记的数量。
 */
export function markElement(root: HTMLElement, needles: string[], caseSensitive = false): number {
	const cleaned = needles.map((n) => n.trim()).filter(Boolean);
	if (cleaned.length === 0) return 0;

	const doc = root.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
	if (!doc) return 0;

	const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, {
		acceptNode(node: Node): number {
			const parent = (node as Text).parentElement;
			if (!parent) return 2; // REJECT
			if (SKIP_TAGS.has(parent.tagName)) return 2;
			if (parent.closest('.qbs-mark')) return 2;
			const value = node.nodeValue;
			if (!value || !value.trim()) return 2;
			return 1; // ACCEPT
		},
	});

	const targets: Text[] = [];
	let node: Node | null = walker.nextNode();
	while (node) {
		targets.push(node as Text);
		node = walker.nextNode();
	}

	let marked = 0;

	for (const textNode of targets) {
		const text = textNode.nodeValue ?? '';
		const ranges = findRanges(text, cleaned, caseSensitive);
		if (ranges.length === 0) continue;

		const fragment = doc.createDocumentFragment();
		let cursor = 0;

		for (const [start, end] of ranges) {
			if (start > cursor) fragment.appendChild(doc.createTextNode(text.slice(cursor, start)));
			const mark = doc.createElement('mark');
			mark.className = 'qbs-mark';
			mark.textContent = text.slice(start, end);
			fragment.appendChild(mark);
			cursor = end;
			marked++;
		}

		if (cursor < text.length) fragment.appendChild(doc.createTextNode(text.slice(cursor)));
		textNode.parentNode?.replaceChild(fragment, textNode);
	}

	return marked;
}
