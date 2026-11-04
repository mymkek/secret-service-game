// Проверки правил через публичный API: «1984», «Тень» и «Кардинал» не складываются (одна вершина за партию, §4.5),
// и отмена исследования (D-038) не даёт выгоды. Запуск: npx tsx sim/checks.ts [baseline.json]
import { readFileSync } from 'node:fs';
import { BALANCE as B, advance, applyAction, createGame, validateAction, type GameState, type TechId } from '../src/lib/game/index';

let fails = 0;
const check = (name: string, ok: boolean, info = '') => {
	console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`);
	if (!ok) fails++;
};

/** Партия с выполненными требованиями всех трёх вершин (как поздняя fuzz-партия). */
function ready(seed: string): GameState {
	const s = createGame({ seed });
	for (const d of ['analytics', 'operations', 'cyber', 'counterintel', 'pr', 'legal'] as const) s.departments[d] = 5;
	s.survLevel = s.survMaxEver = 6;
	s.reprLevel = s.reprMaxEver = 6;
	s.techs.push('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
	s.budget = 10000;
	s.paused = false;
	return s;
}

// 1. После завершения одной вершины остальные закрыты навсегда.
for (const first of ['A3', 'B3', 'C3'] as TechId[]) {
	const s = ready('apex-' + first);
	check(`исследование ${first} стартует`, applyAction(s, 'player', { type: 'research', tech: first }).ok);
	advance(s, 125, { ignorePause: true });
	check(`${first} завершена`, s.techs.includes(first));
	for (const other of ['A3', 'B3', 'C3'] as TechId[]) {
		if (other === first) continue;
		const e = validateAction(s, { type: 'research', tech: other });
		check(`после ${first} нельзя ${other}`, e === 'apex_locked', `ошибка: ${e}`);
	}
	check(`после ${first} отмена исследования ничего не открывает`, validateAction(s, { type: 'cancelResearch' }) === 'no_research');
}

// 2. D-038: отмена вершины возвращает 50 % и снимает блок; цикл «старт/отмена» только теряет деньги.
{
	const s = ready('cancel');
	const b0 = s.budget;
	applyAction(s, 'player', { type: 'research', tech: 'B3' });
	check('во время B3 закрыта C3', validateAction(s, { type: 'research', tech: 'C3' }) === 'research_busy');
	applyAction(s, 'player', { type: 'cancelResearch' });
	check('отмена B3 вернула 50 %', s.budget === b0 - B.TECH_COST_BY_TIER[2] + Math.round(B.RESEARCH_CANCEL_REFUND * B.TECH_COST_BY_TIER[2]), `бюджет ${b0} → ${s.budget}`);
	check('после отмены блок снят (apexChosen = null)', s.apexChosen === null);
	check('после отмены можно C3', validateAction(s, { type: 'research', tech: 'C3' }) === null);
	const b1 = s.budget;
	for (let i = 0; i < 5; i++) {
		applyAction(s, 'player', { type: 'research', tech: 'A3' });
		applyAction(s, 'player', { type: 'cancelResearch' });
	}
	check('5 циклов старт/отмена A3 стоят 5 × 500', b1 - s.budget === 5 * (B.TECH_COST_BY_TIER[2] - Math.round(B.RESEARCH_CANCEL_REFUND * B.TECH_COST_BY_TIER[2])), `потеряно ${b1 - s.budget}`);
	// Прогресс теряется: повторный старт начинает срок заново.
	applyAction(s, 'player', { type: 'research', tech: 'C3' });
	advance(s, 60, { ignorePause: true });
	applyAction(s, 'player', { type: 'cancelResearch' });
	applyAction(s, 'player', { type: 'research', tech: 'C3' });
	check('прогресс отменённого исследования не сохраняется', s.research !== null && s.research.doneDay - s.day === B.TECH_DAYS_BY_TIER[2], `осталось ${s.research ? s.research.doneDay - s.day : '—'} дн.`);
}

// 3. «Парковка» денег в исследовании против изъятия остатка: при одинаковой сумме потери равны (50 % и 50 %).
{
	const cost = B.TECH_COST_BY_TIER[2];
	const refund = Math.round(B.RESEARCH_CANCEL_REFUND * cost);
	let never = true;
	for (const excess of [300, 500, 1000, 2000, 4000]) {
		const noPark = Math.round(B.CLAWBACK_RATE * excess);
		const park = Math.round(B.CLAWBACK_RATE * Math.max(0, excess - cost)) + (cost - refund);
		console.log(`     превышение потолка ${excess}: без парковки −${noPark}, с парковкой вершины (${cost}) и отменой −${park}`);
		if (park < noPark) never = false;
	}
	check('парковка денег в исследовании не выгоднее изъятия остатка', never);
}

// 4. По записям прогонов: ни в одной партии нет двух вершин.
const files = process.argv.slice(2);
for (const f of files) {
	const d = JSON.parse(readFileSync(f, 'utf8')) as { records: { bot: string; final: { techs: string } }[] };
	const multi = d.records.filter((r) => ['A3', 'B3', 'C3'].filter((t) => r.final.techs.split(',').includes(t)).length > 1);
	check(`${f}: партий с двумя вершинами`, multi.length === 0, `${multi.length} из ${d.records.length}`);
}

console.log(fails ? `\n${fails} проверок не прошло` : '\nвсе проверки прошли');
process.exit(fails ? 1 : 0);
