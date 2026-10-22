/**
 * 按修改时间筛选
 * ------------------------------------------------------------------
 * 面板上"发布时间"那一组选项背后的全部逻辑。保持纯函数，方便测试：
 *
 *   preset  →  时间区间（毫秒）  →  和 doc.mtime 比大小
 *
 * 预设用"回看多少天"实现，不用日历月，原因是用户心里的"最近一周"
 * 是 7×24 小时，而不是"上周一到上周日"。自定义范围则按**本地日期**取整：
 * 起始日的 00:00:00.000 到结束日的 23:59:59.999，这样"至 10-21"
 * 才包含 21 号当天写的东西。
 */

import { t } from './i18n';

export type DatePreset = 'any' | 'day' | 'week' | 'month' | 'halfYear' | 'custom';

export interface DateFilter {
	preset: DatePreset;
	/** 自定义范围，YYYY-MM-DD，空串表示该端不限 */
	from: string;
	to: string;
}

export interface DateRange {
	/** 起始时间戳（含），-Infinity 表示不限 */
	start: number;
	/** 结束时间戳（含），Infinity 表示不限 */
	end: number;
}

export const DEFAULT_DATE_FILTER: DateFilter = { preset: 'any', from: '', to: '' };

const DAY = 86_400_000;

/** 半年按 182 天算，比 6×30 更接近日历半年 */
const PRESET_DAYS: Record<Exclude<DatePreset, 'any' | 'custom'>, number> = {
	day: 1,
	week: 7,
	month: 30,
	halfYear: 182,
};

export const PRESET_ORDER: DatePreset[] = ['any', 'day', 'week', 'month', 'halfYear', 'custom'];

export function presetLabel(preset: DatePreset): string {
	return t(
		{
			any: 'dateAny',
			day: 'dateDay',
			week: 'dateWeek',
			month: 'dateMonth',
			halfYear: 'dateHalfYear',
			custom: 'dateCustom',
		}[preset]
	);
}

/**
 * 解析 YYYY-MM-DD（也容忍 YYYY/MM/DD）成本地时间。
 * endOfDay 为真时取当天最后一毫秒，"至"那一端要用它。
 */
export function parseDay(input: string, endOfDay = false): number | null {
	const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(input.trim());
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;

	const date = endOfDay
		? new Date(year, month - 1, day, 23, 59, 59, 999)
		: new Date(year, month - 1, day, 0, 0, 0, 0);

	// 2026-02-31 这类会被 Date 顺延到下个月，这里判掉
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		return null;
	}
	return date.getTime();
}

/**
 * 把筛选条件解析成区间。返回 null 表示"不限"——
 * 界面上是"不限"、自定义两端都空、日期填错，都归到这里，不报错也不拦结果。
 */
export function resolveRange(filter: DateFilter, now = Date.now()): DateRange | null {
	if (filter.preset === 'any') return null;

	if (filter.preset === 'custom') {
		const start = filter.from ? parseDay(filter.from) : null;
		const end = filter.to ? parseDay(filter.to, true) : null;

		if (start === null && end === null) return null;
		// 起止填反了就按时间先后摆正，不提示错误
		if (start !== null && end !== null && start > end) {
			return { start: parseDay(filter.to) as number, end: parseDay(filter.from, true) as number };
		}
		return { start: start ?? -Infinity, end: end ?? Infinity };
	}

	return { start: now - PRESET_DAYS[filter.preset] * DAY, end: Infinity };
}

export function isDateFilterActive(filter: DateFilter, now = Date.now()): boolean {
	return resolveRange(filter, now) !== null;
}

export function matchesRange(mtime: number, range: DateRange | null): boolean {
	if (!range) return true;
	return mtime >= range.start && mtime <= range.end;
}

/** 给状态行用的一句话描述 */
export function describeFilter(filter: DateFilter): string {
	if (filter.preset !== 'custom') return presetLabel(filter.preset);
	if (filter.from && filter.to) return t('dateRangeBoth', { from: filter.from, to: filter.to });
	if (filter.from) return t('dateRangeFrom', { from: filter.from });
	if (filter.to) return t('dateRangeTo', { to: filter.to });
	return presetLabel('custom');
}

function pad(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

/** 卡片上的修改时间：一天内给相对时间，更久给日期 */
export function formatModified(ms: number, now = Date.now()): string {
	const diff = Math.max(0, now - ms);
	if (diff < 60_000) return t('timeJustNow');
	if (diff < 3_600_000) return t('timeMinutes', { n: Math.floor(diff / 60_000) });
	if (diff < DAY) return t('timeHours', { n: Math.floor(diff / 3_600_000) });
	if (diff < 7 * DAY) return t('timeDays', { n: Math.floor(diff / DAY) });

	const date = new Date(ms);
	const sameYear = date.getFullYear() === new Date(now).getFullYear();
	const md = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	return sameYear ? md : `${date.getFullYear()}-${md}`;
}

/** 自定义范围输入框的默认值提示：今天，方便"最近半年"之类的快速收窄 */
export function today(now = Date.now()): string {
	const date = new Date(now);
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
