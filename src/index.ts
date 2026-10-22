/**
 * 对外暴露的纯逻辑入口（不依赖 Obsidian 运行时），便于测试与复用。
 */

export { parseQuery, describeTerms, type Field, type Term, type ParsedQuery } from './query';
export {
	compileExcludes,
	applyDefaultField,
	rankEntries,
	DEFAULT_OPTIONS,
	type SearchOptions,
	type SearchResult,
	type SearchOutcome,
} from './search';
export { scoreDocument, buildSnippet, normalizeScores, countOccurrences } from './ranker';
export { locateInContent, type MatchLocation } from './jump';
export {
	parseDay,
	resolveRange,
	matchesRange,
	describeFilter,
	formatModified,
	DEFAULT_DATE_FILTER,
	type DateFilter,
	type DateRange,
	type DatePreset,
} from './datefilter';
export { findRanges, markElement } from './highlight';
export type { DocEntry, IndexStats } from './indexer';
