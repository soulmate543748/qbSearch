import { Plugin, TFile, moment } from 'obsidian';
import { DEFAULT_SETTINGS, HISTORY_LIMIT, type HistoryEntry, type QbSearchSettings } from './settings';
import type { DateFilter } from './datefilter';
import { VaultIndex } from './indexer';
import { setLocale, t } from './i18n';
import { SearchModal } from './ui/modal';
import { PreviewModal, type PreviewOptions } from './ui/preview';
import { QBS_VIEW_TYPE, SearchSidebarView } from './ui/view';
import { QbSearchSettingTab } from './settings-tab';

export default class QbSearchPlugin extends Plugin {
	settings: QbSearchSettings;
	index: VaultIndex;

	async onload(): Promise<void> {
		setLocale(moment.locale());
		await this.loadSettings();

		this.index = new VaultIndex(this.app);

		this.addRibbonIcon('search', t('cmdOpen'), () => this.openSearch());

		this.addCommand({
			id: 'open-search',
			name: t('cmdOpen'),
			callback: () => this.openSearch(),
		});

		this.addCommand({
			id: 'open-search-sidebar',
			name: t('cmdOpenSidebar'),
			callback: () => {
				void this.openSidebar();
			},
		});

		this.addCommand({
			id: 'open-search-modal',
			name: t('cmdOpenModal'),
			callback: () => this.openSearchModal(),
		});

		this.addCommand({
			id: 'rebuild-index',
			name: t('settingRebuild'),
			callback: async () => {
				this.index.invalidate();
				await this.index.refresh();
			},
		});

		this.registerView(QBS_VIEW_TYPE, (leaf) => new SearchSidebarView(leaf, this));

		// 监听变更：改了哪篇就重读哪篇，不必等下次全量比对
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile) this.index.invalidate(file.path);
			})
		);
		this.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFile) this.index.invalidate(file.path);
			})
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				this.index.invalidate(file.path);
			})
		);
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				this.index.invalidate(oldPath);
				if (file instanceof TFile) this.index.invalidate(file.path);
			})
		);

		this.addSettingTab(new QbSearchSettingTab(this.app, this));
	}

	onunload(): void {
		this.app.workspace.getLeavesOfType(QBS_VIEW_TYPE).forEach((leaf) => leaf.detach());
	}

	/* ---------------------------------------------------------------- 入口 */

	/** 命令与图标的默认入口，跟随设置 */
	openSearch(query?: string): void {
		if (this.settings.openMode === 'modal') this.openSearchModal(query);
		else void this.openSidebar(query);
	}

	/** 全屏弹窗：适合一次性的大范围查找 */
	openSearchModal(query?: string, dateFilter?: DateFilter): void {
		new SearchModal(this.app, this, query, dateFilter).open();
	}

	/** 侧边栏常驻面板：默认入口，点结果不动搜索词 */
	async openSidebar(query?: string): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(QBS_VIEW_TYPE);
		if (existing.length > 0) {
			const leaf = existing[0];
			this.app.workspace.revealLeaf(leaf);
			const view = leaf.view;
			if (view instanceof SearchSidebarView) view.focusSearch(query);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: QBS_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);

		const view = leaf.view;
		if (view instanceof SearchSidebarView) view.focusSearch(query);
	}

	/** 从侧边栏切到弹窗：把当前查询和时间筛选带过去，避免重设一遍 */
	switchToModal(query: string, dateFilter?: DateFilter): void {
		this.openSearchModal(query, dateFilter);
	}

	/** 从弹窗切到侧边栏：先开面板，再把查询送进去 */
	async switchToSidebar(query: string): Promise<void> {
		await this.openSidebar(query);
	}

	openPreview(file: TFile, options: PreviewOptions): void {
		new PreviewModal(this.app, this, file, options).open();
	}

	locale(): string {
		return moment.locale();
	}

	/* ---------------------------------------------------------------- 历史 */

	/** 记录一次查询。只在真正打开笔记时调用，避免把中途输入的半截词记进去 */
	recordQuery(query: string, opened = false): void {
		const trimmed = query.trim();
		if (!trimmed) return;

		if (this.settings.rememberLastQuery) this.settings.lastQuery = trimmed;

		const history = this.settings.history;
		const existing = history.find((entry) => entry.query === trimmed);

		if (existing) {
			existing.count += opened ? 1 : 0;
			existing.at = Date.now();
			this.settings.history = [existing, ...history.filter((entry) => entry !== existing)];
		} else {
			const entry: HistoryEntry = { query: trimmed, count: 1, at: Date.now() };
			this.settings.history = [entry, ...history];
		}

		this.settings.history = this.settings.history.slice(0, HISTORY_LIMIT);
		void this.saveSettings();
	}

	clearHistory(): void {
		this.settings.history = [];
		void this.saveSettings();
	}

	/** 面板关闭时把当前输入留在内存里，下次打开能带出来 */
	persistLastQuery(query: string): void {
		if (!this.settings.rememberLastQuery) return;
		const trimmed = query.trim();
		if (!trimmed || trimmed === this.settings.lastQuery) return;
		this.settings.lastQuery = trimmed;
		void this.saveSettings();
	}

	/* ---------------------------------------------------------------- 持久化 */

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
