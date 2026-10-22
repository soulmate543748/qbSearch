/**
 * 测试运行器。用 esbuild 的 alias 把 obsidian 换成 test/ 下的打桩实现，
 * 因此不需要安装或启动 Obsidian 就能跑逻辑测试。
 */
import esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, '.test-build');
fs.mkdirSync(outDir, { recursive: true });

const suites = [{ name: '搜索内核', entry: 'test/search.test.ts' }];

let failed = 0;

for (const suite of suites) {
	const outfile = path.join(outDir, `${path.basename(suite.entry, '.test.ts')}.cjs`);

	await esbuild.build({
		entryPoints: [path.join(root, suite.entry)],
		bundle: true,
		platform: 'node',
		format: 'cjs',
		target: 'node18',
		outfile,
		logLevel: 'error',
		alias: { obsidian: path.join(root, 'test/obsidian-stub.mjs') },
	});

	console.log(`\n▸ ${suite.name}`);
	const res = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
	if (res.status !== 0) failed++;
}

fs.rmSync(outDir, { recursive: true, force: true });

console.log(failed === 0 ? '\n所有测试套件通过 ✓\n' : `\n${failed} 个测试套件失败 ✗\n`);
process.exit(failed === 0 ? 0 : 1);
