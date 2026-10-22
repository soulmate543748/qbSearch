/**
 * 预览弹窗
 * ------------------------------------------------------------------
 * 在结果列表里按 Shift+Enter 或双击打开：先看全文再决定要不要跳过去。
 * 正文用 Obsidian 自己的渲染器渲染，所以和阅读视图完全一致；
 * 命中词在渲染后的 DOM 里标出来，并自动滚到第一处。
 */

import { App, MarkdownRenderer, Modal, Notice, TFile, setIcon } from 'obsidian';
import type QbSearchPlugin from '../main';
import { markElement } from '../highlight';
import { openAndReveal } from './navigate';
import { t } from '../i18n';

export interface PreviewOptions {
	needles: string[];
	caseSensitive: boolean;
}

export class PreviewModal extends Modal {
	private plugin: QbSearchPlugin;

	constructor(
		app: App,
		plugin: QbSearchPlugin,
		private file: TFile,
		private options: PreviewOptions
	) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen(): Promise<void> {
		const { contentEl, modalEl } = this;
		modalEl.addClass('qbs-preview-modal');
		contentEl.addClass('qbs-preview');
		contentEl.empty();

		const header = contentEl.createDiv({ cls: 'qbs-preview-head' });
		const titles = header.createDiv({ cls: 'qbs-preview-titles' });
		titles.createDiv({ cls: 'qbs-preview-title', text: this.file.basename });
		titles.createDiv({ cls: 'qbs-preview-path', text: this.file.path });

		const actions = header.createDiv({ cls: 'qbs-preview-actions' });

		const copyBtn = actions.createEl('button', { cls: 'qbs-ghost-btn', attr: { type: 'button' } });
		setIcon(copyBtn.createSpan({ cls: 'qbs-ghost-icon' }), 'copy');
		copyBtn.createSpan({ text: t('previewCopy') });
		copyBtn.addEventListener('click', async () => {
			try {
				const content = await this.app.vault.cachedRead(this.file);
				await navigator.clipboard.writeText(content);
				new Notice(t('previewCopied'));
			} catch (error) {
				console.error('[qbSearch] copy failed', error);
			}
		});

		const openBtn = actions.createEl('button', { cls: 'qbs-ghost-btn is-primary', attr: { type: 'button' } });
		setIcon(openBtn.createSpan({ cls: 'qbs-ghost-icon' }), 'arrow-up-right');
		openBtn.createSpan({ text: t('previewOpen') });
		openBtn.addEventListener('click', () => {
			void openAndReveal(this.app, this.file, {
				needles: this.options.needles,
				caseSensitive: this.options.caseSensitive,
			});
			this.close();
		});

		const body = contentEl.createDiv({ cls: 'qbs-preview-body markdown-rendered' });

		let content = '';
		try {
			content = await this.app.vault.cachedRead(this.file);
		} catch {
			body.setText('—');
			return;
		}

		try {
			await MarkdownRenderer.render(this.app, content, body, this.file.path, this.plugin);
		} catch {
			body.empty();
			body.setText(content);
		}

		const marked = markElement(body, this.options.needles, this.options.caseSensitive);
		if (marked > 0) {
			const footer = contentEl.createDiv({ cls: 'qbs-preview-foot' });
			footer.setText(t('previewMatches', { n: marked }));

			const first = body.querySelector('.qbs-mark') as HTMLElement | null;
			if (first) {
				window.setTimeout(() => first.scrollIntoView({ block: 'center' }), 60);
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
