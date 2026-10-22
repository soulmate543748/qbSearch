import { App, Notice, PluginSettingTab, Setting, setIcon } from 'obsidian';
import type QbSearchPlugin from './main';
import { DEFAULT_SETTINGS, HISTORY_LIMIT } from './settings';
import type { Field } from './query';
import { t } from './i18n';

export class QbSearchSettingTab extends PluginSettingTab {
	private plugin: QbSearchPlugin;

	constructor(app: App, plugin: QbSearchPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('qbs-settings');

		this.renderHero();
		this.renderSearchSection();
		this.renderDisplaySection();
		this.renderFilterSection();
		this.renderMaintenanceSection();
	}

	/* ------------------------------------------------------------ 顶部信息 */

	private renderHero(): void {
		const hero = this.containerEl.createDiv({ cls: 'qbs-hero' });
		const row = hero.createDiv({ cls: 'qbs-hero-row' });

		const icon = row.createDiv({ cls: 'qbs-hero-icon' });
		setIcon(icon, 'search');

		const titles = row.createDiv({ cls: 'qbs-hero-titles' });
		titles.createDiv({ cls: 'qbs-hero-name', text: 'qbSearch' });
		titles.createDiv({
			cls: 'qbs-hero-meta',
			text: `v${this.plugin.manifest.version} · ${this.plugin.index.size} notes indexed`,
		});

		hero.createDiv({
			cls: 'qbs-hero-desc',
			text:
				this.plugin.locale().startsWith('zh')
					? '本地全文搜索。结果按相关性排序，摘要按 Markdown 渲染并跟随主题。'
					: 'Local full-text search. Results are relevance-ranked, snippets render as Markdown and follow your theme.',
		});
	}

	/* ------------------------------------------------------------ 分区 */

	private heading(text: string, icon: string): void {
		const el = this.containerEl.createDiv({ cls: 'qbs-setting-heading' });
		const iconEl = el.createSpan({ cls: 'qbs-setting-heading-icon' });
		setIcon(iconEl, icon);
		el.createSpan({ text });
	}

	private async save(): Promise<void> {
		await this.plugin.saveSettings();
	}

	/* ------------------------------------------------------------ 搜索 */

	private renderSearchSection(): void {
		this.heading(t('settingsSearchHeading'), 'search');

		new Setting(this.containerEl)
			.setName(t('settingOpenMode'))
			.setDesc(t('settingOpenModeDesc'))
			.addDropdown((dropdown) => {
				dropdown.addOption('sidebar', t('optionOpenSidebar'));
				dropdown.addOption('modal', t('optionOpenModal'));
				dropdown.setValue(this.plugin.settings.openMode);
				dropdown.onChange(async (value) => {
					this.plugin.settings.openMode = value === 'modal' ? 'modal' : 'sidebar';
					await this.save();
				});
			});

		new Setting(this.containerEl)
			.setName(t('settingDefaultField'))
			.setDesc(t('settingDefaultFieldDesc'))
			.addDropdown((dropdown) => {
				const options: Array<[Field, string]> = [
					['any', t('optionAny')],
					['title', t('optionTitle')],
					['tag', t('optionTag')],
					['path', t('optionPath')],
				];
				for (const [value, label] of options) dropdown.addOption(value, label);
				dropdown.setValue(this.plugin.settings.defaultField);
				dropdown.onChange(async (value) => {
					this.plugin.settings.defaultField = value as Field;
					await this.save();
				});
			});

		new Setting(this.containerEl)
			.setName(t('settingLimit'))
			.setDesc(t('settingLimitDesc'))
			.addSlider((slider) => {
				slider
					.setLimits(20, 500, 10)
					.setValue(this.plugin.settings.resultLimit)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.resultLimit = value;
						await this.save();
					});
			});

		new Setting(this.containerEl)
			.setName(t('settingCase'))
			.setDesc(t('settingCaseDesc'))
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.caseSensitive).onChange(async (value) => {
					this.plugin.settings.caseSensitive = value;
					await this.save();
				});
			});

		new Setting(this.containerEl)
			.setName(t('settingRemember'))
			.setDesc(t('settingRememberDesc'))
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.rememberLastQuery).onChange(async (value) => {
					this.plugin.settings.rememberLastQuery = value;
					await this.save();
				});
			});
	}

	/* ------------------------------------------------------------ 显示 */

	private renderDisplaySection(): void {
		this.heading(t('settingsDisplayHeading'), 'layout');

		new Setting(this.containerEl)
			.setName(t('settingRender'))
			.setDesc(t('settingRenderDesc'))
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.renderMarkdown).onChange(async (value) => {
					this.plugin.settings.renderMarkdown = value;
					await this.save();
				});
			});

		new Setting(this.containerEl)
			.setName(t('settingSnippet'))
			.setDesc(t('settingSnippetDesc'))
			.addSlider((slider) => {
				slider
					.setLimits(80, 400, 10)
					.setValue(this.plugin.settings.snippetLength)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.snippetLength = value;
						await this.save();
					});
			});

		new Setting(this.containerEl)
			.setName(t('settingTiming'))
			.setDesc(t('settingTimingDesc'))
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.showTiming).onChange(async (value) => {
					this.plugin.settings.showTiming = value;
					await this.save();
				});
			});
	}

	/* ------------------------------------------------------------ 过滤 */

	private renderFilterSection(): void {
		this.heading(t('settingsFilterHeading'), 'filter');

		new Setting(this.containerEl)
			.setName(t('settingExclude'))
			.setDesc(t('settingExcludeDesc'))
			.addText((text) => {
				text
					.setPlaceholder('templates/, archive/*, *.canvas.md')
					.setValue(this.plugin.settings.exclude)
					.onChange(async (value) => {
						this.plugin.settings.exclude = value;
						await this.save();
					});
				text.inputEl.addClass('qbs-wide-input');
			});
	}

	/* ------------------------------------------------------------ 维护 */

	private renderMaintenanceSection(): void {
		this.heading(t('settingsMaintenanceHeading'), 'database');

		new Setting(this.containerEl)
			.setName(t('settingHistory'))
			.setDesc(t('settingHistoryDesc', { n: this.plugin.settings.history.length }))
			.addButton((button) => {
				button.setButtonText(t('clear')).onClick(async () => {
					this.plugin.settings.history = [];
					await this.save();
					this.display();
				});
			});

		new Setting(this.containerEl)
			.setName(t('settingRebuild'))
			.setDesc(t('settingRebuildDesc', { total: this.plugin.index.size }))
			.addButton((button) => {
				button.setButtonText(t('settingRebuild')).onClick(async () => {
					this.plugin.index.invalidate();
					await this.plugin.index.refresh();
					new Notice(t('settingRebuildDone'));
					this.display();
				});
			});

		new Setting(this.containerEl)
			.setName(t('settingReset'))
			.setDesc(t('settingResetDesc'))
			.addButton((button) => {
				button.setButtonText(t('settingReset')).onClick(async () => {
					const history = this.plugin.settings.history;
					this.plugin.settings = { ...DEFAULT_SETTINGS, history: history.slice(0, HISTORY_LIMIT) };
					await this.save();
					new Notice(t('settingResetDone'));
					this.display();
				});
			});
	}
}
