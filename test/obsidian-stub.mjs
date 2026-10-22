/**
 * Obsidian API 打桩。只实现被测模块真正用到的部分。
 */
export function getAllTags(cache) {
	return cache && cache.tags ? cache.tags : null;
}

export class App {}
export class TFile {}
export class TAbstractFile {}
export class View {}
export class ItemView {}
export class Modal {
	constructor(app) {
		this.app = app;
	}
}
export class Plugin {}
export class Component {}
export class PluginSettingTab {}
export class Setting {
	constructor() {}
	setName() {
		return this;
	}
	setDesc() {
		return this;
	}
	addToggle() {
		return this;
	}
	addSlider() {
		return this;
	}
	addDropdown() {
		return this;
	}
	addText() {
		return this;
	}
	addButton() {
		return this;
	}
}
export class Notice {
	constructor() {}
}
export class WorkspaceLeaf {}
export const MarkdownRenderer = {
	async render() {},
};
export function setIcon() {}
export const moment = { locale: () => 'zh-cn' };
