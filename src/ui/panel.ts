/**
 * 搜索面板
 * ------------------------------------------------------------------
 * 弹窗与侧边栏共用同一个面板组件。设计目标是"输入即出结果"：
 *
 *   - 顶部：搜索框（左图标，右工具按钮）
 *   - 其次：范围 chips
 *   - 再次：结果计数 / 耗时 / 索引状态
 *   - 主体：结果卡片，标题 + 路径 + 修改时间 + 摘要
 *   - 底部：键位提示
 *
 * 时间筛选收在搜索框右侧的"筛选"浮层里：常驻面板上不占一行高度，
 * 需要时展开，选完即走。
 *
 * 渲染顺序是先出结构再补内容：摘要的 Markdown 渲染是异步的，
 * 先让用户看到标题和路径，再逐条把摘要渲染出来，避免整块卡住。
 */

import { App, MarkdownRenderer, TFile, setIcon } from 'obsidian';
import type QbSearchPlugin from '../main';
import { runSearch, type SearchOutcome, type SearchResult } from '../search';
import type { Field } from '../query';
import {
	DEFAULT_DATE_FILTER,
	PRESET_ORDER,
	describeFilter,
	formatModified,
	presetLabel,
	resolveRange,
	today,
	type DateFilter,
	type DatePreset,
} from '../datefilter';
import { markElement } from '../highlight';
import { openAndReveal } from './navigate';
import { t } from '../i18n';

const DEBOUNCE_MS = 80;
/** 每渲染多少条摘要让出一次主线程 */
const YIELD_EVERY = 5;

interface ChipDef {
	field: Field;
	label: () => string;
}

const CHIPS: ChipDef[] = [
	{ field: 'any', label: () => t('filterAll') },
	{ field: 'title', label: () => t('filterTitle') },
	{ field: 'tag', label: () => t('filterTag') },
	{ field: 'path', label: () => t('filterPath') },
];

/** 命中词：排除词不参与高亮，否则会把"没出现的东西"标出来 */
function needlesOf(result: SearchResult): string[] {
	return result.terms.filter((term) => !term.negate).map((term) => term.text);
}

export interface PanelOptions {
	/** 侧边栏压缩排版 */
	compact?: boolean;
	/** 打开时预填的查询 */
	initialQuery?: string;
	/** 打开时预置的时间筛选 */
	initialDateFilter?: DateFilter;
	/** 弹窗模式：请求关闭自身 */
	onRequestClose?: () => void;
	/** 侧边栏模式：请求把这套查询搬到弹窗里 */
	onRequestModal?: (query: string) => void;
}

export class SearchPanel {
	private app: App;
	private plugin: QbSearchPlugin;
	private root: HTMLElement;
	private options: PanelOptions;

	private inputEl!: HTMLInputElement;
	private chipsEl!: HTMLElement;
	private metaEl!: HTMLElement;
	private listEl!: HTMLElement;
	private footerEl!: HTMLElement;
	private caseBtn!: HTMLButtonElement;
	private clearBtn!: HTMLButtonElement;
	private filterBtn!: HTMLButtonElement;
	private filterPop!: HTMLElement;

	private field: Field;
	private caseSensitive: boolean;
	private dateFilter: DateFilter;
	private filterChips = new Map<DatePreset, HTMLElement>();
	private fromInput!: HTMLInputElement;
	private toInput!: HTMLInputElement;

	private results: SearchResult[] = [];
	private selected = -1;
	private outcome: SearchOutcome | null = null;

	private token = 0;
	private timer: number | null = null;
	private destroyed = false;
	private onDocPointerDown: ((event: MouseEvent) => void) | null = null;

	constructor(app: App, plugin: QbSearchPlugin, root: HTMLElement, options: PanelOptions = {}) {
		this.app = app;
		this.plugin = plugin;
		this.root = root;
		this.options = options;
		this.field = plugin.settings.defaultField;
		this.caseSensitive = plugin.settings.caseSensitive;
		this.dateFilter = { ...DEFAULT_DATE_FILTER, ...(options.initialDateFilter ?? {}) };
	}

	/* ---------------------------------------------------------------- 构建 */

	mount(): void {
		this.root.addClass('qbs-panel');
		if (this.options.compact) this.root.addClass('is-compact');
		this.root.empty();

		// 头部容器：搜索框 + 范围 chips 共用一个定位上下文，
		// 筛选浮层用 top: 100% 挂在它下面，字号变大也不会错位
		const head = this.root.createDiv({ cls: 'qbs-head' });

		const bar = head.createDiv({ cls: 'qbs-bar' });
		const iconEl = bar.createDiv({ cls: 'qbs-bar-icon' });
		setIcon(iconEl, 'search');

		this.inputEl = bar.createEl('input', {
			cls: 'qbs-input',
			attr: {
				type: 'text',
				spellcheck: 'false',
				autocapitalize: 'off',
				autocomplete: 'off',
				placeholder: this.options.compact ? t('placeholderCompact') : t('placeholder'),
			},
		});

		const tools = bar.createDiv({ cls: 'qbs-bar-tools' });

		this.filterBtn = tools.createEl('button', {
			cls: 'qbs-tool qbs-filter-toggle',
			attr: { type: 'button', 'aria-label': t('filterButton'), 'aria-expanded': 'false' },
		});
		setIcon(this.filterBtn, 'sliders-horizontal');

		this.caseBtn = tools.createEl('button', {
			cls: 'qbs-tool qbs-case',
			attr: { type: 'button', 'aria-label': t('caseSensitiveOn') },
		});
		this.caseBtn.setText('Aa');

		if (this.options.compact) {
			const expandBtn = tools.createEl('button', {
				cls: 'qbs-tool qbs-expand',
				attr: { type: 'button', 'aria-label': t('hintExpand') },
			});
			setIcon(expandBtn, 'maximize-2');
			expandBtn.addEventListener('click', () => {
				this.options.onRequestModal?.(this.inputEl.value.trim());
			});
		}

		this.clearBtn = tools.createEl('button', {
			cls: 'qbs-tool qbs-clear',
			attr: { type: 'button', 'aria-label': t('hintClear') },
		});
		setIcon(this.clearBtn, 'x');

		this.chipsEl = head.createDiv({ cls: 'qbs-chips' });
		this.renderChips();

		this.filterPop = head.createDiv({ cls: 'qbs-filter-pop' });
		this.renderFilterPop();

		const progress = this.root.createDiv({ cls: 'qbs-progress' });
		progress.createDiv({ cls: 'qbs-progress-bar' });

		this.metaEl = this.root.createDiv({ cls: 'qbs-meta' });
		this.listEl = this.root.createDiv({ cls: 'qbs-list' });
		this.footerEl = this.root.createDiv({ cls: 'qbs-footer' });

		this.renderFooter();
		this.bindEvents();

		if (this.options.initialQuery) {
			this.inputEl.value = this.options.initialQuery;
		} else if (this.plugin.settings.rememberLastQuery && this.plugin.settings.lastQuery) {
			this.inputEl.value = this.plugin.settings.lastQuery;
		}

		this.updateChromeState();
		if (this.inputEl.value.trim()) {
			this.execute();
		} else {
			this.renderIdle();
		}
	}

	private bindEvents(): void {
		this.inputEl.addEventListener('input', () => {
			this.updateChromeState();
			this.schedule();
		});

		this.inputEl.addEventListener('keydown', (event) => this.onKeyDown(event));

		this.clearBtn.addEventListener('click', () => {
			this.inputEl.value = '';
			this.inputEl.focus();
			this.updateChromeState();
			this.renderIdle();
			this.token++;
		});

		this.caseBtn.addEventListener('click', () => {
			this.caseSensitive = !this.caseSensitive;
			this.updateChromeState();
			this.schedule();
		});

		this.filterBtn.addEventListener('click', () => this.toggleFilter());

		// 点浮层外面收起。用捕获阶段，侧栏里嵌套的点击也能判到
		this.onDocPointerDown = (event: MouseEvent) => {
			if (!this.filterPop.hasClass('is-open')) return;
			const target = event.target as Node | null;
			if (!target) return;
			if (this.filterPop.contains(target) || this.filterBtn.contains(target)) return;
			this.closeFilter();
		};
		this.root.ownerDocument.addEventListener('pointerdown', this.onDocPointerDown, true);

		// 事件委托：chips 会随筛选重建，绑在容器上才不会失效
		this.chipsEl.addEventListener('click', (event) => {
			const chip = (event.target as HTMLElement).closest('.qbs-chip') as HTMLElement | null;
			const field = chip?.dataset.field as Field | undefined;
			if (!field || field === this.field) return;
			this.field = field;
			this.renderChips();
			this.schedule();
			this.inputEl.focus();
		});

		this.listEl.addEventListener('click', (event) => {
			const card = (event.target as HTMLElement).closest('.qbs-card') as HTMLElement | null;
			if (!card) return;
			const index = Number(card.dataset.index);
			const withMod = (event as MouseEvent).metaKey || (event as MouseEvent).ctrlKey;
			this.open(index, withMod);
		});

		this.listEl.addEventListener('mousemove', (event) => {
			const card = (event.target as HTMLElement).closest('.qbs-card') as HTMLElement | null;
			if (!card) return;
			const index = Number(card.dataset.index);
			if (index !== this.selected) this.select(index, false);
		});

		this.listEl.addEventListener('dblclick', (event) => {
			const card = (event.target as HTMLElement).closest('.qbs-card') as HTMLElement | null;
			if (!card) return;
			this.preview(Number(card.dataset.index));
		});
	}

	private renderChips(): void {
		this.chipsEl.empty();
		for (const chip of CHIPS) {
			const el = this.chipsEl.createEl('button', {
				cls: 'qbs-chip',
				attr: { type: 'button' },
				text: chip.label(),
			});
			el.dataset.field = chip.field;
			if (chip.field === this.field) el.addClass('is-active');
		}
	}

	private renderFooter(): void {
		this.footerEl.empty();
		const hints: Array<[string, string]> = this.options.compact
			? [
					['↑↓', t('hintMove')],
					['↵', t('hintOpen')],
				]
			: [
					['↑↓', t('hintMove')],
					['↵', t('hintOpen')],
					['⌘↵', t('hintOpenNew')],
					['⇧↵', t('hintPreview')],
					['esc', t('hintClose')],
				];

		for (const [key, label] of hints) {
			const item = this.footerEl.createDiv({ cls: 'qbs-hint' });
			item.createEl('kbd', { text: key });
			item.createSpan({ text: label });
		}
	}

	/* -------------------------------------------------------------- 时间筛选 */

	private renderFilterPop(): void {
		this.filterPop.empty();
		this.filterChips.clear();

		const head = this.filterPop.createDiv({ cls: 'qbs-filter-head' });
		head.createSpan({ cls: 'qbs-filter-title', text: t('filterHeading') });
		const reset = head.createEl('button', {
			cls: 'qbs-link',
			attr: { type: 'button' },
			text: t('filterReset'),
		});
		reset.addEventListener('click', () => {
			this.dateFilter = { ...DEFAULT_DATE_FILTER };
			this.syncFilterState();
			this.schedule();
		});

		const group = this.filterPop.createDiv({ cls: 'qbs-filter-group' });
		group.createDiv({ cls: 'qbs-filter-label', text: t('dateSection') });

		const chips = group.createDiv({ cls: 'qbs-filter-chips' });
		for (const preset of PRESET_ORDER) {
			const el = chips.createEl('button', {
				cls: 'qbs-fchip',
				attr: { type: 'button' },
				text: presetLabel(preset),
			});
			el.dataset.preset = preset;
			el.addEventListener('click', () => this.pickPreset(preset));
			this.filterChips.set(preset, el);
		}

		const range = group.createDiv({ cls: 'qbs-filter-range' });
		this.fromInput = range.createEl('input', {
			cls: 'qbs-date',
			attr: { type: 'date', 'aria-label': t('dateRangeFrom', { from: '' }) },
		});
		range.createSpan({ cls: 'qbs-filter-sep', text: t('dateTo') });
		this.toInput = range.createEl('input', {
			cls: 'qbs-date',
			attr: { type: 'date', 'aria-label': t('dateRangeTo', { to: '' }) },
		});

		for (const input of [this.fromInput, this.toInput]) {
			input.addEventListener('change', () => this.pickCustomDate());
			input.addEventListener('keydown', (event) => {
				if (event.key === 'Escape') {
					event.preventDefault();
					this.closeFilter();
					this.inputEl.focus();
				}
			});
		}

		this.syncFilterState();
	}

	/** 把当前筛选状态刷到 chip / 输入框 / 按钮上，不重建 DOM（避免打断日期选择） */
	private syncFilterState(): void {
		for (const [preset, el] of this.filterChips) {
			el.toggleClass('is-active', preset === this.dateFilter.preset);
		}
		if (this.fromInput.value !== this.dateFilter.from) this.fromInput.value = this.dateFilter.from;
		if (this.toInput.value !== this.dateFilter.to) this.toInput.value = this.dateFilter.to;

		const active = resolveRange(this.dateFilter) !== null;
		this.filterBtn.toggleClass('is-active', active);
		this.filterPop.toggleClass('has-filter', active);
	}

	private pickPreset(preset: DatePreset): void {
		if (preset === 'custom') {
			this.dateFilter.preset = 'custom';
			// 空的自定义范围默认收在今天，少点两次
			if (!this.dateFilter.from && !this.dateFilter.to) this.dateFilter.to = today();
			this.syncFilterState();
			// 预置了结束日期就已经是生效条件，结果得跟着变
			this.schedule();
			this.fromInput.focus();
			return;
		}

		this.dateFilter = { preset, from: '', to: '' };
		this.syncFilterState();
		this.schedule();
		this.closeFilter();
	}

	private pickCustomDate(): void {
		this.dateFilter.preset = 'custom';
		this.dateFilter.from = this.fromInput.value;
		this.dateFilter.to = this.toInput.value;
		this.syncFilterState();
		this.schedule();
	}

	private toggleFilter(): void {
		if (this.filterPop.hasClass('is-open')) this.closeFilter();
		else this.openFilter();
	}

	private openFilter(): void {
		this.filterPop.addClass('is-open');
		this.filterBtn.setAttr('aria-expanded', 'true');
		this.updateChromeState();
	}

	private closeFilter(): void {
		this.filterPop.removeClass('is-open');
		this.filterBtn.setAttr('aria-expanded', 'false');
	}

	private updateChromeState(): void {
		const hasText = this.inputEl.value.length > 0;
		this.clearBtn.toggleClass('is-visible', hasText);
		this.caseBtn.toggleClass('is-active', this.caseSensitive);
		this.caseBtn.setAttr('aria-label', this.caseSensitive ? t('caseSensitiveOn') : t('caseSensitiveOff'));
	}

	/* ---------------------------------------------------------------- 搜索 */

	private schedule(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => {
			this.timer = null;
			void this.execute();
		}, DEBOUNCE_MS);
	}

	private async execute(): Promise<void> {
		const query = this.inputEl.value.trim();
		const token = ++this.token;

		if (!query) {
			this.results = [];
			this.selected = -1;
			this.outcome = null;
			this.renderIdle();
			return;
		}

		this.setBusy(true);

		let outcome: SearchOutcome;
		try {
			outcome = await runSearch(this.plugin.index, query, {
				field: this.field,
				limit: this.plugin.settings.resultLimit,
				exclude: this.plugin.settings.exclude,
				caseSensitive: this.caseSensitive,
				snippetLength: this.plugin.settings.snippetLength,
				dateRange: resolveRange(this.dateFilter),
			});
		} catch (error) {
			console.error('[qbSearch] search failed', error);
			this.setBusy(false);
			return;
		}

		if (this.destroyed || token !== this.token) return;

		this.outcome = outcome;
		this.results = outcome.results;
		this.selected = outcome.results.length > 0 ? 0 : -1;

		this.renderMeta();
		this.renderResults();
		this.setBusy(false);
		this.scheduleSnippets(token);
	}

	private setBusy(busy: boolean): void {
		this.root.toggleClass('is-busy', busy);
	}

	/* ---------------------------------------------------------------- 渲染 */

	private renderMeta(): void {
		this.metaEl.empty();
		const outcome = this.outcome;
		if (!outcome) return;

		const countEl = this.metaEl.createDiv({ cls: 'qbs-meta-item qbs-meta-count' });
		if (outcome.total > outcome.results.length) {
			countEl.setText(t('resultCountTotal', { total: outcome.total, shown: outcome.results.length }));
		} else {
			countEl.setText(t('resultCount', { n: outcome.total }));
		}

		// 时间筛选开着的时候，把条件写出来——否则用户不知道结果为什么少了
		if (resolveRange(this.dateFilter) !== null) {
			this.metaEl.createDiv({ cls: 'qbs-meta-item qbs-meta-filter', text: describeFilter(this.dateFilter) });
		}

		if (this.plugin.settings.showTiming) {
			this.metaEl.createDiv({ cls: 'qbs-meta-item', text: t('elapsed', { ms: outcome.elapsedMs }) });
			// 侧边栏窄，扫描篇数省掉，省一行空间
			if (!this.options.compact) {
				this.metaEl.createDiv({ cls: 'qbs-meta-item', text: t('scanned', { n: outcome.scanned }) });
			}
		}

		if (this.inputEl.value.includes(':') || this.field !== 'any') {
			const scope = this.field === 'any' ? null : CHIPS.find((c) => c.field === this.field);
			if (scope) this.metaEl.createDiv({ cls: 'qbs-meta-item', text: scope.label() });
		}
	}

	private renderIdle(): void {
		this.metaEl.empty();
		this.listEl.empty();
		this.setBusy(false);

		const history = this.plugin.settings.history.slice(0, 8);
		if (history.length > 0) {
			const wrap = this.listEl.createDiv({ cls: 'qbs-recent' });
			const head = wrap.createDiv({ cls: 'qbs-recent-head' });
			head.createSpan({ text: t('recentSearch') });
			const clear = head.createEl('button', { cls: 'qbs-link', attr: { type: 'button' }, text: t('clear') });
			clear.addEventListener('click', () => {
				this.plugin.clearHistory();
				this.renderIdle();
			});

			const box = wrap.createDiv({ cls: 'qbs-recent-list' });
			for (const entry of history) {
				const item = box.createEl('button', { cls: 'qbs-recent-item', attr: { type: 'button' } });
				item.createSpan({ cls: 'qbs-recent-text', text: entry.query });
				item.createSpan({ cls: 'qbs-recent-count', text: String(entry.count) });
				item.addEventListener('click', () => {
					this.inputEl.value = entry.query;
					this.inputEl.focus();
					this.updateChromeState();
					void this.execute();
				});
			}
			return;
		}

		const empty = this.listEl.createDiv({ cls: 'qbs-empty' });
		const icon = empty.createDiv({ cls: 'qbs-empty-icon' });
		setIcon(icon, 'search');
		empty.createDiv({ cls: 'qbs-empty-title', text: t('emptyIdleTitle') });
		empty.createDiv({ cls: 'qbs-empty-hint', text: t('emptyIdleHint') });
	}

	private renderResults(): void {
		this.listEl.empty();

		if (this.results.length === 0) {
			const empty = this.listEl.createDiv({ cls: 'qbs-empty' });
			const icon = empty.createDiv({ cls: 'qbs-empty-icon' });
			setIcon(icon, 'file-question');
			empty.createDiv({ cls: 'qbs-empty-title', text: t('emptyNoResultTitle') });
			empty.createDiv({
				cls: 'qbs-empty-hint',
				text: resolveRange(this.dateFilter) !== null ? t('emptyNoResultFilteredHint') : t('emptyNoResultHint'),
			});
			return;
		}

		const needles = this.needles();
		const compact = this.options.compact === true;
		const now = Date.now();

		this.results.forEach((result, index) => {
			const card = this.listEl.createDiv({ cls: 'qbs-card' });
			card.dataset.index = String(index);

			const head = card.createDiv({ cls: 'qbs-card-head' });
			const titleEl = head.createDiv({ cls: 'qbs-title', text: result.doc.title });
			markElement(titleEl, needles, this.caseSensitive);

			const primary = result.fields[0];
			const fieldLabel =
				primary && primary !== 'content' && primary !== 'title'
					? t(`field${primary[0].toUpperCase()}${primary.slice(1)}`)
					: null;
			if (fieldLabel) head.createSpan({ cls: 'qbs-badge', text: fieldLabel });

			if (!compact) {
				const meter = head.createDiv({ cls: 'qbs-meter', attr: { title: `${result.relevance}%` } });
				meter.createDiv({ cls: 'qbs-meter-fill' }).style.width = `${Math.max(4, result.relevance)}%`;
			}

			const sub = card.createDiv({ cls: 'qbs-card-sub' });
			const dir = result.doc.path.includes('/')
				? result.doc.path.slice(0, result.doc.path.lastIndexOf('/'))
				: '';
			if (dir) sub.createSpan({ cls: 'qbs-path-text', text: dir });
			sub.createSpan({ cls: 'qbs-time', text: formatModified(result.doc.mtime, now) });

			const snippetEl = card.createDiv({ cls: 'qbs-snippet' });
			snippetEl.setText(result.snippet);
			markElement(snippetEl, needles, this.caseSensitive);
		});

		this.select(this.selected, true);
	}

	/**
	 * 摘要的 Markdown 渲染是异步且耗时的，单独走一轮：
	 * 先让列表可见，再逐条把纯文本换成渲染后的内容。
	 */
	private async scheduleSnippets(token: number): Promise<void> {
		if (!this.plugin.settings.renderMarkdown) return;

		const rows = Array.from(this.listEl.querySelectorAll('.qbs-snippet')) as HTMLElement[];
		const needles = this.needles();

		for (let index = 0; index < rows.length; index++) {
			if (this.destroyed || token !== this.token) return;

			const result = this.results[index];
			if (!result) continue;

			const el = rows[index];
			try {
				el.empty();
				el.addClass('is-markdown');
				await MarkdownRenderer.render(this.app, result.snippet, el, result.doc.path, this.plugin);
				el.addClass('markdown-rendered');
				markElement(el, needles, this.caseSensitive);
				this.trimTrailingEmpty(el);
			} catch {
				el.removeClass('is-markdown');
				el.setText(result.snippet);
				markElement(el, needles, this.caseSensitive);
			}

			if (index % YIELD_EVERY === YIELD_EVERY - 1) {
				await new Promise((resolve) => window.setTimeout(resolve, 0));
			}
		}
	}

	/** 摘要常以空行结尾，渲染后会多出空块 */
	private trimTrailingEmpty(el: HTMLElement): void {
		for (let i = 0; i < 3; i++) {
			const last = el.lastElementChild as HTMLElement | null;
			if (!last) return;
			const isEmpty = last.textContent === '' && last.children.length === 0;
			if (!isEmpty) return;
			last.remove();
		}
	}

	private needles(): string[] {
		const first = this.results[0] as SearchResult | undefined;
		if (!first) return [];
		return needlesOf(first);
	}

	/* ---------------------------------------------------------------- 交互 */

	private select(index: number, scroll: boolean): void {
		if (index < 0 || index >= this.results.length) return;
		const cards = this.listEl.querySelectorAll('.qbs-card');
		cards.forEach((card) => card.removeClass('is-selected'));
		const target = cards[index] as HTMLElement | undefined;
		if (!target) return;
		target.addClass('is-selected');
		this.selected = index;
		if (scroll) target.scrollIntoView({ block: 'nearest' });
	}

	private move(delta: number): void {
		if (this.results.length === 0) return;
		const next = Math.min(this.results.length - 1, Math.max(0, this.selected + delta));
		this.select(next, true);
	}

	private onKeyDown(event: KeyboardEvent): void {
		// 中文输入法选词时的回车 / 方向键不该被拦截
		const composing = (event as KeyboardEvent & { isComposing?: boolean }).isComposing;
		if (composing || event.keyCode === 229) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				this.move(1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				this.move(-1);
				break;
			case 'Enter': {
				event.preventDefault();
				if (event.shiftKey) {
					this.preview(this.selected);
				} else {
					this.open(this.selected, event.metaKey || event.ctrlKey);
				}
				break;
			}
			case 'Escape': {
				event.preventDefault();
				// 先收浮层，再谈清空 / 关闭
				if (this.filterPop.hasClass('is-open')) {
					this.closeFilter();
				} else if (this.options.onRequestClose) {
					// 弹窗模式交给宿主关闭；侧边栏模式先清空查询
					this.options.onRequestClose();
				} else if (this.inputEl.value) {
					this.inputEl.value = '';
					this.updateChromeState();
					this.token++;
					this.renderIdle();
				}
				break;
			}
			default:
				break;
		}
	}

	private resolveFile(result: SearchResult | undefined): TFile | null {
		if (!result) return null;
		const file = this.app.vault.getAbstractFileByPath(result.doc.path);
		return file instanceof TFile ? file : null;
	}

	private open(index: number, newLeaf: boolean): void {
		const result = this.results[index];
		const file = this.resolveFile(result);
		if (!file) return;

		this.plugin.recordQuery(this.inputEl.value.trim(), true);

		void openAndReveal(this.app, file, {
			needles: needlesOf(result),
			caseSensitive: this.caseSensitive,
			newLeaf,
		});
		this.options.onRequestClose?.();
	}

	private preview(index: number): void {
		const result = this.results[index];
		const file = this.resolveFile(result);
		if (!file || !result) return;

		this.plugin.recordQuery(this.inputEl.value.trim(), true);

		void this.plugin.openPreview(file, {
			needles: needlesOf(result),
			caseSensitive: this.caseSensitive,
		});
	}

	/* ---------------------------------------------------------------- 生命周期 */

	focus(): void {
		this.inputEl.focus();
		const length = this.inputEl.value.length;
		this.inputEl.setSelectionRange(length, length);
	}

	/** 外部把查询送进来：换掉输入框内容并立刻重搜 */
	setQuery(query: string): void {
		if (!this.inputEl) return;
		this.inputEl.value = query;
		this.updateChromeState();
		this.inputEl.focus();
		void this.execute();
	}

	/** 外部读取当前筛选，切到弹窗时带走 */
	getDateFilter(): DateFilter {
		return { ...this.dateFilter };
	}

	destroy(): void {
		this.destroyed = true;
		this.token++;
		if (this.timer !== null) window.clearTimeout(this.timer);
		if (this.onDocPointerDown) {
			this.root.ownerDocument.removeEventListener('pointerdown', this.onDocPointerDown, true);
			this.onDocPointerDown = null;
		}
		if (this.inputEl) this.plugin.persistLastQuery(this.inputEl.value);
		this.root.empty();
	}
}
