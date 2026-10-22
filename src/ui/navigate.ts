/**
 * 打开笔记并定位到命中处
 * ------------------------------------------------------------------
 * 从结果列表点进去，用户要的是"直接看到命中的那一句"，不是先看到文件开头
 * 再自己找。这里做三件事：
 *
 *   1. 选对 leaf：主编辑区最近活跃的那个，绝不把笔记开进侧栏顶掉搜索框
 *   2. 打开时带上 eState.line，阅读模式下也能滚到命中行
 *   3. 编辑模式下选中命中的词并居中滚动，光标落在词尾——Live Preview 会
 *      把该块渲染成源码，命中处一眼可见
 */

import { App, MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';
import { locateInContent } from '../jump';

/** 主编辑区里最近活跃的 leaf；没有就新开一个标签页 */
export function pickMainLeaf(app: App, newLeaf = false): WorkspaceLeaf {
	const workspace = app.workspace;
	if (newLeaf) return workspace.getLeaf('tab');
	return workspace.getMostRecentLeaf(workspace.rootSplit) ?? workspace.getLeaf('tab');
}

export interface RevealOptions {
	needles: string[];
	caseSensitive?: boolean;
	/** 在新标签页打开 */
	newLeaf?: boolean;
}

export async function openAndReveal(app: App, file: TFile, options: RevealOptions): Promise<void> {
	const leaf = pickMainLeaf(app, options.newLeaf);

	// 索引里的正文可能比磁盘旧一行改动的距离，定位失败只是不高亮，不影响打开
	const content = await app.vault.cachedRead(file).catch(() => '');
	const hit = content ? locateInContent(content, options.needles, options.caseSensitive) : null;

	await leaf.openFile(file, hit ? { eState: { line: hit.line, ch: hit.ch } } : undefined);

	if (!hit) return;
	const view = leaf.view;
	if (!(view instanceof MarkdownView)) return;

	// 编辑器要等一帧才拿到最新布局，立刻选中会被随后的 setState 冲掉；
	// 大文件或慢机器上还要再等，所以做成有限次重试而不是固定延时一次
	let attempts = 0;
	const apply = (): void => {
		attempts++;
		try {
			const editor = view.editor;
			if (editor.lineCount() <= hit.line && attempts < 4) {
				window.setTimeout(apply, 120);
				return;
			}
			const from = editor.offsetToPos(hit.start);
			const to = editor.offsetToPos(hit.end);
			editor.setSelection(from, to);
			editor.scrollIntoView({ from, to }, true);
		} catch (error) {
			if (attempts < 4) {
				window.setTimeout(apply, 120);
				return;
			}
			console.error('[qbSearch] reveal failed', error);
		}
	};

	window.setTimeout(apply, 40);
}
