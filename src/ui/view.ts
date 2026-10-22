import { ItemView, WorkspaceLeaf } from 'obsidian';
import type QbSearchPlugin from '../main';
import { SearchPanel } from './panel';

export const QBS_VIEW_TYPE = 'qbsearch-view';

/** 侧边栏常驻面板。与弹窗共用 SearchPanel，只是压缩排版、关不放。 */
export class SearchSidebarView extends ItemView {
	private panel: SearchPanel | null = null;
	/** 视图还没 onOpen 时先存着，挂载时再填进搜索框 */
	private pendingQuery: string | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: QbSearchPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return QBS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'qbSearch';
	}

	getIcon(): string {
		return 'search';
	}

	async onOpen(): Promise<void> {
		// 面板要像卡片一样浮在侧栏里：外层负责定位与圆角，面板负责排版
		this.contentEl.addClass('qbs-host');
		const shell = this.contentEl.createDiv({ cls: 'qbs-sidebar' });

		this.panel = new SearchPanel(this.app, this.plugin, shell, {
			compact: true,
			initialQuery: this.pendingQuery ?? undefined,
			onRequestModal: (query) => this.plugin.switchToModal(query, this.panel?.getDateFilter()),
		});
		this.pendingQuery = null;
		this.panel.mount();
		window.setTimeout(() => this.panel?.focus(), 50);
	}

	async onClose(): Promise<void> {
		this.panel?.destroy();
		this.panel = null;
		this.contentEl.empty();
	}

	/** 再次触发命令时唤起已有面板：带上新查询，或只是把焦点放回输入框 */
	focusSearch(query?: string): void {
		if (query !== undefined) {
			if (this.panel) this.panel.setQuery(query);
			else this.pendingQuery = query;
		}
		window.setTimeout(() => this.panel?.focus(), 30);
	}
}
