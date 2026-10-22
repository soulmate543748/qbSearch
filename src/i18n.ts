/**
 * 文案。跟随 Obsidian 语言设置，中文优先。
 */

type Dict = Record<string, string>;

const zh: Dict = {
	pluginName: 'qbSearch',

	cmdOpen: '搜索笔记',
	cmdOpenSidebar: '在侧边栏搜索',
	cmdOpenModal: '全屏搜索',
	cmdSwitchToModal: '在弹窗中打开',
	cmdSwitchToSidebar: '在侧边栏中打开',

	placeholder: '搜索笔记…  file: tag: path: 缩小范围',
	placeholderCompact: '搜索…',

	filterAll: '全部',
	filterTitle: '文件名',
	filterTag: '标签',
	filterPath: '路径',

	filterButton: '筛选',
	filterHeading: '筛选',
	filterReset: '重置',
	dateSection: '发布时间',
	dateAny: '不限',
	dateDay: '最近一天',
	dateWeek: '最近一周',
	dateMonth: '最近一月',
	dateHalfYear: '最近半年',
	dateCustom: '自定义',
	dateTo: '至',
	dateRangeBoth: '{from} 至 {to}',
	dateRangeFrom: '{from} 之后',
	dateRangeTo: '{to} 之前',

	timeJustNow: '刚刚',
	timeMinutes: '{n} 分钟前',
	timeHours: '{n} 小时前',
	timeDays: '{n} 天前',

	hintMove: '选择',
	hintOpen: '打开',
	hintOpenNew: '新标签',
	hintClose: '关闭',
	hintPreview: '预览',
	hintClear: '清空',
	hintExpand: '弹窗打开',

	resultCount: '{n} 条结果',
	resultCountTotal: '共 {total} 条 · 显示前 {shown} 条',
	elapsed: '{ms} ms',
	scanned: '扫描 {n} 篇',

	emptyIdleTitle: '输入关键词开始搜索',
	emptyIdleHint: '支持 file: 文件名、tag: 标签、path: 路径，用 -词 排除',
	emptyNoResultTitle: '没有匹配的笔记',
	emptyNoResultHint: '试试更短的关键词，或去掉 file: / tag: 限制',
	emptyNoResultFilteredHint: '当前有发布时间筛选，放宽时间范围可能就有了',

	recentSearch: '最近搜索',
	clear: '清空',
	caseSensitiveOn: '区分大小写',
	caseSensitiveOff: '忽略大小写',

	fieldTitle: '文件名',
	fieldPath: '路径',
	fieldTag: '标签',
	fieldHeading: '标题',
	fieldContent: '正文',

	previewCopy: '复制正文',
	previewCopied: '已复制',
	previewOpen: '打开',
	previewMatches: '命中 {n} 处',

	settingsSearchHeading: '搜索',
	settingsDisplayHeading: '显示',
	settingsFilterHeading: '过滤',
	settingsMaintenanceHeading: '索引与维护',

	settingDefaultField: '默认搜索范围',
	settingDefaultFieldDesc: '输入里没有 file: / tag: / path: 前缀时，默认在哪个范围里找',
	settingOpenMode: '打开方式',
	settingOpenModeDesc: '命令与左侧放大镜图标默认把搜索开在侧边栏，还是弹窗全屏',
	optionOpenSidebar: '侧边栏（常驻）',
	optionOpenModal: '弹窗（全屏）',
	settingLimit: '结果条数上限',
	settingLimitDesc: '单次最多显示多少条，超出的可以细化关键词',
	settingRender: '渲染 Markdown',
	settingRenderDesc: '结果摘要按 Markdown 渲染，并跟随当前主题的排版',
	settingSnippet: '摘要长度',
	settingSnippetDesc: '每条结果截取多少字符作为预览',
	settingCase: '区分大小写',
	settingCaseDesc: '开启后 A 与 a 视为不同字符',
	settingTiming: '显示耗时',
	settingTimingDesc: '在结果头部显示搜索耗时与扫描篇数',
	settingExclude: '排除路径',
	settingExcludeDesc: '逗号分隔，支持 * 通配，例如 模板/, 归档/*',
	settingRemember: '记住上次搜索词',
	settingRememberDesc: '再次打开时自动填入上次的查询',
	settingHistory: '搜索历史',
	settingHistoryDesc: '当前记录 {n} 条',
	settingReset: '恢复默认设置',
	settingResetDesc: '不会删除搜索历史',
	settingResetDone: '已恢复默认设置',
	settingRebuild: '重建索引',
	settingRebuildDesc: '当前索引 {total} 篇笔记',
	settingRebuildDone: '索引已重建',

	optionAny: '全文',
	optionTitle: '仅文件名',
	optionTag: '仅标签',
	optionPath: '仅路径',
};

const en: Dict = {
	pluginName: 'qbSearch',

	cmdOpen: 'Search notes',
	cmdOpenSidebar: 'Search notes (sidebar)',
	cmdOpenModal: 'Search notes (full screen)',
	cmdSwitchToModal: 'Open in modal',
	cmdSwitchToSidebar: 'Open in sidebar',

	placeholder: 'Search notes…  file: tag: path: to narrow',
	placeholderCompact: 'Search…',

	filterAll: 'All',
	filterTitle: 'Name',
	filterTag: 'Tag',
	filterPath: 'Path',

	filterButton: 'Filters',
	filterHeading: 'Filters',
	filterReset: 'Reset',
	dateSection: 'Modified',
	dateAny: 'Any time',
	dateDay: 'Past day',
	dateWeek: 'Past week',
	dateMonth: 'Past month',
	dateHalfYear: 'Past 6 months',
	dateCustom: 'Custom',
	dateTo: 'to',
	dateRangeBoth: '{from} – {to}',
	dateRangeFrom: 'after {from}',
	dateRangeTo: 'before {to}',

	timeJustNow: 'just now',
	timeMinutes: '{n}m ago',
	timeHours: '{n}h ago',
	timeDays: '{n}d ago',

	hintMove: 'Move',
	hintOpen: 'Open',
	hintOpenNew: 'New tab',
	hintClose: 'Close',
	hintPreview: 'Preview',
	hintClear: 'Clear',
	hintExpand: 'Open in modal',

	resultCount: '{n} results',
	resultCountTotal: '{total} matches · showing first {shown}',
	elapsed: '{ms} ms',
	scanned: 'scanned {n}',

	emptyIdleTitle: 'Start typing to search',
	emptyIdleHint: 'Use file:, tag:, path: to narrow — -word to exclude',
	emptyNoResultTitle: 'No matching notes',
	emptyNoResultHint: 'Try a shorter keyword, or drop the file: / tag: filter',
	emptyNoResultFilteredHint: 'A date filter is active — widening it may help',

	recentSearch: 'Recent',
	clear: 'Clear',
	caseSensitiveOn: 'Match case',
	caseSensitiveOff: 'Ignore case',

	fieldTitle: 'name',
	fieldPath: 'path',
	fieldTag: 'tag',
	fieldHeading: 'heading',
	fieldContent: 'content',

	previewCopy: 'Copy',
	previewCopied: 'Copied',
	previewOpen: 'Open',
	previewMatches: '{n} matches',

	settingsSearchHeading: 'Search',
	settingsDisplayHeading: 'Display',
	settingsFilterHeading: 'Filters',
	settingsMaintenanceHeading: 'Index',

	settingDefaultField: 'Default scope',
	settingDefaultFieldDesc: 'Where to look when the query has no file: / tag: / path: prefix',
	settingOpenMode: 'Open in',
	settingOpenModeDesc: 'Where the command and ribbon icon open the search UI',
	optionOpenSidebar: 'Sidebar (persistent)',
	optionOpenModal: 'Modal (full screen)',
	settingLimit: 'Result limit',
	settingLimitDesc: 'Maximum number of results to show at once',
	settingRender: 'Render Markdown',
	settingRenderDesc: 'Render snippets as Markdown, following the active theme',
	settingSnippet: 'Snippet length',
	settingSnippetDesc: 'Characters of context shown for each result',
	settingCase: 'Match case',
	settingCaseDesc: 'Treat A and a as different characters',
	settingTiming: 'Show timing',
	settingTimingDesc: 'Show elapsed time and scanned notes in the header',
	settingExclude: 'Excluded paths',
	settingExcludeDesc: 'Comma separated, * wildcard allowed, e.g. templates/, archive/*',
	settingRemember: 'Remember last query',
	settingRememberDesc: 'Pre-fill the query next time the search opens',
	settingHistory: 'Search history',
	settingHistoryDesc: '{n} entries stored',
	settingReset: 'Restore defaults',
	settingResetDesc: 'Search history is kept',
	settingResetDone: 'Defaults restored',
	settingRebuild: 'Rebuild index',
	settingRebuildDesc: '{total} notes currently indexed',
	settingRebuildDone: 'Index rebuilt',

	optionAny: 'Full text',
	optionTitle: 'File name only',
	optionTag: 'Tags only',
	optionPath: 'Path only',
};

let active: 'zh' | 'en' = 'zh';

export function setLocale(locale: string | undefined): void {
	active = (locale ?? 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function t(key: string, vars?: Record<string, string | number>): string {
	const dict = active === 'zh' ? zh : en;
	let text = dict[key] ?? zh[key] ?? key;
	if (vars) {
		for (const [name, value] of Object.entries(vars)) {
			text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
		}
	}
	return text;
}
