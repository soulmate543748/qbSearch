import type { Field } from './query';

export interface HistoryEntry {
	query: string;
	count: number;
	at: number;
}

/** 搜索界面的打开方式：侧边栏常驻，或弹窗全屏 */
export type OpenMode = 'sidebar' | 'modal';

export interface QbSearchSettings {
	/** 命令 / 图标默认在哪打开搜索界面 */
	openMode: OpenMode;
	/** 输入无字段前缀时的默认搜索范围 */
	defaultField: Field;
	/** 结果条数上限 */
	resultLimit: number;
	/** 摘要按 Markdown 渲染 */
	renderMarkdown: boolean;
	/** 摘要字符数 */
	snippetLength: number;
	caseSensitive: boolean;
	showTiming: boolean;
	/** 排除路径，逗号分隔 */
	exclude: string;
	rememberLastQuery: boolean;
	lastQuery: string;
	history: HistoryEntry[];
}

export const DEFAULT_SETTINGS: QbSearchSettings = {
	openMode: 'sidebar',
	defaultField: 'any',
	resultLimit: 100,
	renderMarkdown: true,
	snippetLength: 170,
	caseSensitive: false,
	showTiming: true,
	exclude: '',
	rememberLastQuery: true,
	lastQuery: '',
	history: [],
};

export const HISTORY_LIMIT = 20;
