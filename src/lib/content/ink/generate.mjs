// Генератор Ink-исходников квестов из ../quests.data.json.
// Запуск: node src/lib/content/ink/generate.mjs
// Тексты правятся в quests.data.json; .ink-файлы руками не править.
// Компиляция .ink -> .ink.json (inkjs Compiler) - задача scaffolder (см. README.md рядом).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, '..', 'quests.data.json'), 'utf8'));

/**
 * Проверка, что в тексте нет служебных конструкций Ink.
 * @param {string} text
 * @param {string} where
 * @returns {string}
 */
function safe(text, where) {
	if (/[{}|\\#]|->|<-|\/\//.test(text) || /^\s*[-*+~=<>]/.test(text)) {
		throw new Error(`Ink-служебные символы в тексте (${where}): ${text}`);
	}
	return text;
}

let generated = 0;
for (const [questId, q] of Object.entries(data)) {
	// Дилеммы и линейка (D-067) написаны вручную: они читают risk_*, chance_*, p_* и ветвятся по стадии.
	if (q.handwritten) continue;
	generated += 1;
	const lines = [];
	lines.push(`// GENERATED из quests.data.json (node src/lib/content/ink/generate.mjs). Не править руками.`);
	lines.push(`// Квест: ${questId}`);
	lines.push('EXTERNAL core_var(name)');
	lines.push('EXTERNAL core_can(choiceId)');
	lines.push('EXTERNAL core_choose(choiceId, param)');
	lines.push('');
	lines.push('-> start');
	lines.push('');
	lines.push('=== start ===');
	const others = Object.keys(q.stages).filter((k) => k !== 'choice');
	if (others.length === 0) {
		lines.push(safe(q.stages.choice, `${questId}.stages.choice`));
	} else {
		lines.push('~ temp stage = core_var("stage")');
		others.forEach((st, i) => {
			lines.push(i === 0 ? `{ stage == "${st}":` : `- stage == "${st}":`);
			lines.push('    ' + safe(q.stages[st], `${questId}.stages.${st}`));
		});
		lines.push('- else:');
		lines.push('    ' + safe(q.stages.choice, `${questId}.stages.choice`));
		lines.push('}');
	}
	lines.push('-> choices');
	lines.push('');
	lines.push('=== choices ===');
	for (const c of q.choices) {
		const knot = 'do_' + c.id.replace(/\W/g, '_');
		lines.push(`+ {core_can("${c.id}")} [${safe(c.label, `${questId}.${c.id}.label`)}] -> ${knot}`);
	}
	lines.push('+ -> waiting');
	lines.push('');
	lines.push('=== waiting ===');
	lines.push('-> DONE');
	for (const c of q.choices) {
		const knot = 'do_' + c.id.replace(/\W/g, '_');
		lines.push('');
		lines.push(`=== ${knot} ===`);
		// Параметр -1: агент выбирается ядром (первый свободный). TODO(core): выбор агента игроком.
		lines.push(`~ temp err = core_choose("${c.id}", -1)`);
		lines.push('{ err == "":');
		lines.push('    ' + safe(c.outcome, `${questId}.${c.id}.outcome`));
		lines.push('    -> END');
		lines.push('}');
		lines.push('Не удалось применить решение ({err}).');
		lines.push('-> choices');
	}
	lines.push('');
	writeFileSync(join(here, `${questId}.ink`), lines.join('\n'), 'utf8');
}
console.log(`Сгенерировано квестов: ${generated} (рукописные пропущены: ${Object.keys(data).length - generated})`);
