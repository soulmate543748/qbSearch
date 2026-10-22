/**
 * 内存索引
 * ------------------------------------------------------------------
 * 每次搜索都重新读一遍全库是这类插件最慢的地方。qbSearch 的做法：
 *
 *   1. 首次搜索时把全库笔记读进内存（正文 + 小写副本 + 标签 + 标题行）
 *   2. 之后的搜索只做一次"stat 比对"——遍历 TFile 列表比 mtime / size，
 *      变化的才重读。这一步不碰磁盘，万篇笔记也就几毫秒。
 *   3. 监听 vault 事件（改、增、删、改名）把对应条目标记为待更新，
 *      用户正在编辑的那篇立刻能看到最新内容。
 *
 * 代价是内存：正文和小写副本各存一份。库很大时可以接受，
 * 因为换来的是"输入即出结果"。
 */

import { App, TFile, getAllTags, CachedMetadata } from 'obsidian';

export interface DocEntry {
	path: string;
	/** 不含扩展名的文件名 */
	title: string;
	lowerTitle: string;
	lowerPath: string;
	content: string;
	lowerContent: string;
	headings: string[];
	tags: string[];
	ctime: number;
	mtime: number;
	size: number;
}

export interface IndexStats {
	/** 索引里的文档总数 */
	total: number;
	/** 本次刷新重读的文档数 */
	refreshed: number;
	/** 本次刷新移除的文档数 */
	removed: number;
	/** 累计耗时（毫秒），仅本次刷新 */
	elapsedMs: number;
}

const READ_CONCURRENCY = 8;

export class VaultIndex {
	private entries = new Map<string, DocEntry>();
	private pending = new Set<string>();
	private running: Promise<IndexStats> | null = null;

	constructor(private app: App) {}

	get size(): number {
		return this.entries.size;
	}

	/** 标记某个路径需要重新读取 */
	invalidate(path?: string): void {
		if (path) this.pending.add(path);
		else this.entries.clear();
	}

	markAllDirty(): void {
		for (const path of this.entries.keys()) this.pending.add(path);
	}

	/**
	 * 刷新索引。并发调用会共享同一次刷新，避免连续输入时重复扫描。
	 */
	async refresh(): Promise<IndexStats> {
		if (this.running) return this.running;
		this.running = this.doRefresh();
		try {
			return await this.running;
		} finally {
			this.running = null;
		}
	}

	private async doRefresh(): Promise<IndexStats> {
		const started = performance.now();
		const files = this.app.vault.getMarkdownFiles();
		const alive = new Set<string>();
		const queue: TFile[] = [];

		for (const file of files) {
			alive.add(file.path);
			const cached = this.entries.get(file.path);
			if (!cached || cached.mtime !== file.stat.mtime || cached.size !== file.stat.size || this.pending.has(file.path)) {
				queue.push(file);
			}
		}

		let removed = 0;
		for (const path of [...this.entries.keys()]) {
			if (!alive.has(path)) {
				this.entries.delete(path);
				removed++;
			}
		}

		// pending 里可能有已删除的文件，清掉避免堆积
		for (const path of [...this.pending]) {
			if (!alive.has(path)) this.pending.delete(path);
		}

		let refreshed = 0;
		let cursor = 0;
		const workers = Array.from(
			{ length: Math.min(READ_CONCURRENCY, queue.length) },
			async () => {
				for (;;) {
					const index = cursor++;
					if (index >= queue.length) return;
					const file = queue[index];
					try {
						const entry = await this.buildEntry(file);
						if (entry) {
							this.entries.set(file.path, entry);
							this.pending.delete(file.path);
							refreshed++;
						}
					} catch {
						// 文件在扫描过程中被删除或改名，跳过即可
					}
				}
			}
		);
		await Promise.all(workers);

		return {
			total: this.entries.size,
			refreshed,
			removed,
			elapsedMs: Math.round(performance.now() - started),
		};
	}

	private async buildEntry(file: TFile): Promise<DocEntry | null> {
		const content = await this.app.vault.cachedRead(file);
		const cache: CachedMetadata | null = this.app.metadataCache.getFileCache(file);

		const headings: string[] = [];
		if (cache?.headings) {
			for (const h of cache.headings) {
				if (h.heading) headings.push(h.heading);
			}
		}

		const tags: string[] = [];
		const all = cache ? getAllTags(cache) : null;
		if (all) {
			for (const tag of all) tags.push(tag.replace(/^#/, ''));
		}

		const title = file.basename;

		return {
			path: file.path,
			title,
			lowerTitle: title.toLowerCase(),
			lowerPath: file.path.toLowerCase(),
			content,
			lowerContent: content.toLowerCase(),
			headings,
			tags,
			ctime: file.stat.ctime,
			mtime: file.stat.mtime,
			size: file.stat.size,
		};
	}

	all(): IterableIterator<DocEntry> {
		return this.entries.values();
	}
}
