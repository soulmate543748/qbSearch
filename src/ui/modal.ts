import { App, Modal } from 'obsidian';
import type QbSearchPlugin from '../main';
import type { DateFilter } from '../datefilter';
import { SearchPanel } from './panel';

/** 全屏弹窗搜索。默认入口已改为侧边栏，这里留作"临时大范围查找"。 */
export class SearchModal extends Modal {
	private panel: SearchPanel | null = null;

	constructor(
		app: App,
		private plugin: QbSearchPlugin,
		private initialQuery?: string,
		private initialDateFilter?: DateFilter
	) {
		super(app);
	}

	onOpen(): void {
		this.containerEl.addClass('qbs-modal-container');
		this.modalEl.addClass('qbs-modal');
		this.contentEl.addClass('qbs-modal-content');

		// 用搜索框代替默认标题栏
		this.modalEl.querySelector('.modal-title')?.remove();

		this.panel = new SearchPanel(this.app, this.plugin, this.contentEl, {
			initialQuery: this.initialQuery,
			initialDateFilter: this.initialDateFilter,
			onRequestClose: () => this.close(),
		});
		this.panel.mount();
		window.setTimeout(() => this.panel?.focus(), 0);
	}

	onClose(): void {
		this.panel?.destroy();
		this.panel = null;
		this.containerEl.removeClass('qbs-modal-container');
		this.contentEl.empty();
	}
}
