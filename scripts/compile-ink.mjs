// Компиляция src/lib/content/ink/*.ink -> <id>.ink.json (inkjs/compiler).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Compiler, CompilerOptions } from 'inkjs/compiler/Compiler';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'content', 'ink');
const files = readdirSync(dir).filter((f) => f.endsWith('.ink')).sort();
let failed = 0;

// Сообщения inkjs: 'ERROR: line 12: ...' или 'ERROR: 'file' line 12: ...' -> 'файл:строка: ...'
function fmt(file, msg) {
	const m = /line ([0-9]+):? *(.*)/s.exec(msg);
	const text = msg.replace(/^(ERROR|WARNING|TODO): */, "");
	return m ? file + ":" + m[1] + ": " + m[2].trim() : file + ": " + text;
}

for (const f of files) {
	const errors = [];
	const warnings = [];
	const opts = new CompilerOptions(
		null, [], false,
		(msg, type) => (type === 2 ? errors : type === 1 ? warnings : []).push(fmt(f, msg)),
		null
	);
	try {
		const story = new Compiler(readFileSync(join(dir, f), 'utf8'), opts).Compile();
		if (errors.length === 0) {
			writeFileSync(join(dir, f.replace(/\.ink$/, '.ink.json')), story.ToJson());
			console.log(`ok   ${f}${warnings.length ? ` (${warnings.length} warnings)` : ''}`);
		}
	} catch (e) {
		if (errors.length === 0) errors.push(fmt(f, e.message));
	}
	for (const w of warnings) console.warn(`warn ${w}`);
	if (errors.length) {
		failed++;
		for (const e of errors) console.error(`ERROR ${e}`);
	}
}
if (failed) {
	console.error(`\nInk: не скомпилировано файлов: ${failed} из ${files.length}`);
	process.exit(1);
}
console.log(`Ink: скомпилировано ${files.length}`);
