// Разбор симптома: поздняя fuzz-партия (fuzz.test.ts, «поздняя партия»): 18 из 20 партий кончаются переворотом.
// Точная копия цикла теста + абляции. Запуск: npx tsx sim/late-fuzz.ts [N]
import { BALANCE as B, advance, applyAction, createGame, questChoices, validateAction, DEPT_KEYS, LEGENDS, RECRUIT_METHODS, RIVAL_IDS, SKILLS, TECH_IDS, type GameState, type OpTarget, type PlayerAction } from '../src/lib/game/index';
import { honestBotTurn } from '../src/lib/game/testing/honest-bot';
import { lateFuzz } from './scenarios';

function mulberry(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// Копия candidates() из fuzz.test.ts (кроме autoPickPerk — перки здесь не важны).
function candidates(s: GameState, r: () => number): PlayerAction[] {
	const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
	const idle = s.agents.filter((a) => a.status === 'idle').map((a) => a.id);
	const team = (n: number) => [...idle].sort(() => r() - 0.5).slice(0, n);
	const out: PlayerAction[] = [];
	for (const c of s.hirePool) out.push({ type: 'hire', candidateId: c.id });
	for (const a of s.agents) {
		out.push({ type: 'fire', agentId: a.id }, { type: 'medal', agentId: a.id }, { type: 'setSalary', agentId: a.id, mult: pick(B.SALARY_MULTS) });
		out.push({ type: 'train', agentId: a.id, course: pick(['skill', 'language', 'legend'] as const), skill: pick(SKILLS), countryId: pick(['canada', 'mexico', 'cuba']) });
		if (a.pendingPerks > 0) out.push({ type: 'choosePerk', agentId: a.id, perk: 'cold_blooded' });
		out.push({ type: 'deployAgent', agentId: a.id, countryId: pick(['canada', 'mexico', 'cuba']), legend: pick(LEGENDS), prep: r() < 0.5, recruit: pick(RECRUIT_METHODS) });
		out.push({ type: 'recallAgent', agentId: a.id }, { type: 'recallEmbedded', agentId: a.id }, { type: 'scapegoat', agentId: a.id });
	}
	for (const d of DEPT_KEYS) out.push({ type: 'buildDept', dept: d });
	for (const t of TECH_IDS) out.push({ type: 'research', tech: t });
	out.push({ type: 'buildSurv' }, { type: 'buildRepr' }, { type: 'rollbackSurv' }, { type: 'rollbackRepr' }, { type: 'cancelResearch' });
	for (const c of s.cases) {
		const type = c.kind === 'terror' ? 'terror' : 'investigation';
		out.push({ type: 'startOp', opType: type, caseId: c.id, agentIds: team(B.OP_AGENTS_REQUIRED[type] + Math.floor(r() * 3)) });
		out.push({ type: 'intercept', caseId: c.id });
	}
	const targets: OpTarget[] = [
		...RIVAL_IDS.map((id) => ({ kind: 'rival' as const, id })),
		...s.leaders.map((l) => ({ kind: 'leader' as const, id: l.id })),
		{ kind: 'senator', id: pick(s.senators).id },
		{ kind: 'president' }
	];
	for (const t of targets) for (const opType of ['surveillance', 'infiltration'] as const) out.push({ type: 'startOp', opType, target: t, agentIds: team(1 + Math.floor(r() * 2)) });
	for (const op of s.operations) {
		if (idle.length) out.push({ type: 'reinforceOp', opId: op.id, agentId: pick(idle) });
		out.push({ type: 'cancelOp', opId: op.id });
	}
	for (const k of s.kompromat) out.push({ type: 'leak', kompromatId: k.id }, { type: 'counterKompromat', kompromatId: k.id }, { type: 'blackmail', kompromatId: k.id });
	for (const id of RIVAL_IDS) out.push({ type: 'sabotage', rivalId: id }, { type: 'lobby', rivalId: id }, { type: 'poach', rivalId: id }, { type: 'absorb', rivalId: id });
	for (const l of s.leaders) out.push({ type: 'removeLeader', leaderId: l.id });
	out.push({ type: 'fakeStats', points: 1 + Math.floor(r() * 2) }, { type: 'congressWork' }, { type: 'prCampaign' }, { type: 'loyaltyCheck' });
	for (const q of s.quests) for (const c of questChoices(s, q)) out.push({ type: 'questChoice', sessionId: q.id, choice: c.id });
	return out;
}

interface Variant {
	name: string;
	random: boolean;
	bot: boolean;
	/** Свой выбор в квестах до хода бота (иначе honest-bot возьмёт первый доступный — autoChoice). */
	quest?: (s: GameState) => void;
	extra?: (s: GameState) => void;
	setup?: (s: GameState) => void;
}

const allowRally = (s: GameState) => {
	for (const q of [...s.quests]) {
		const ch = questChoices(s, q).filter((c) => c.available).map((c) => c.id);
		const pref = q.questId === 'rally' ? 'allow' : q.questId === 'union_meeting' ? 'concede' : ch[0];
		if (pref && ch.includes(pref)) applyAction(s, 'player', { type: 'questChoice', sessionId: q.id, choice: pref });
	}
};

const VARIANTS: Variant[] = [
	{ name: 'fuzz (тест как есть)', random: true, bot: true },
	{ name: 'honest-bot без случайных', random: false, bot: true },
	{ name: 'без действий игрока', random: false, bot: false },
	{ name: 'honest-bot, митинг «дать пройти»', random: false, bot: true, quest: allowRally },
	{ name: 'без действий, Репрессии откатить до 3', random: false, bot: false, setup: (s) => { applyAction(s, 'player', { type: 'rollbackRepr' }); s.reprRollbacks = []; applyAction(s, 'player', { type: 'rollbackRepr' }); s.reprRollbacks = []; } },
	{ name: 'без действий, убирать лидеров (Репр. 5)', random: false, bot: false, extra: (s) => { for (const l of [...s.leaders]) applyAction(s, 'player', { type: 'removeLeader', leaderId: l.id }); } },
	{ name: 'fuzz, но без buildRepr', random: true, bot: true },
	{ name: 'honest+allow, убирать лидеров', random: false, bot: true, quest: allowRally, extra: (s) => { for (const l of [...s.leaders]) applyAction(s, 'player', { type: 'removeLeader', leaderId: l.id }); } },
	{ name: 'honest+allow, откат Репр. 5→3 (оттепель)', random: false, bot: true, quest: allowRally, setup: (s) => { applyAction(s, 'player', { type: 'rollbackRepr' }); applyAction(s, 'player', { type: 'rollbackRepr' }); } },
	{ name: 'honest+allow, откат Репр. 5→0', random: false, bot: true, quest: allowRally, setup: (s) => { for (let i = 0; i < 5; i++) applyAction(s, 'player', { type: 'rollbackRepr' }); } },
	{ name: 'honest+allow, U старт 50 (Репр. 5)', random: false, bot: true, quest: allowRally, setup: (s) => { s.unrest = 50; } }
];

const N = Number(process.argv[2] ?? 20);
for (let i = 4; i < process.argv.length; i++) if (process.argv[i] === '--set') { const v = process.argv[++i]; const eq = v.indexOf('='); (B as Record<string, unknown>)[v.slice(0, eq)] = JSON.parse(v.slice(eq + 1)); }
const only = process.argv[3] ? Number(process.argv[3]) : 0;
for (const v of VARIANTS.slice(only)) {
	const tally: Record<string, number> = {};
	const months: number[] = [];
	let riotMonthsTotal = 0;
	const src = { disperse: 0, protest: 0, reprUp: 0, thaw: 0, leaderMax: 0, unrestAt12: [] as number[] };
	for (let g = 0; g < N; g++) {
		const r = mulberry(5000 + g);
		const s = createGame({ seed: `late-${g}` });
		lateFuzz(s);
		v.setup?.(s);
		let turn = 0;
		let lastId = 0;
		while (s.outcome.status === 'active') {
			turn++;
			if (turn % 10 === 0) s.budget += 3000;
			v.quest?.(s);
			if (v.bot) honestBotTurn(s);
			v.extra?.(s);
			if (v.random) {
				const cand = candidates(s, r);
				for (let i = 0; i < 4 && s.outcome.status === 'active'; i++) {
					const a = cand[Math.floor(r() * cand.length)];
					if (!a || a.type === 'fire' || a.type === 'scapegoat') continue;
					if (v.name.includes('без buildRepr') && a.type === 'buildRepr') continue;
					if (validateAction(s, a) === null) applyAction(s, 'player', a);
				}
			}
			const before = s.day;
			advance(s, v.random ? 1 + Math.floor(r() * 5) : 3, { ignorePause: true });
			for (const e of s.log) {
				if (e.id <= lastId) continue;
				if (e.kind === 'quest_choice' && e.data.choice === 'disperse') src.disperse++;
				if (e.kind === 'national_protest') src.protest++;
				if (e.kind === 'repr_built') src.reprUp++;
				if (e.kind === 'thaw') src.thaw++;
			}
			lastId = s.log.at(-1)?.id ?? lastId;
			src.leaderMax = Math.max(src.leaderMax, s.leaders.length);
			if (Math.floor(s.day / 30) > Math.floor(before / 30) && s.unrest >= 80) riotMonthsTotal++;
			if (before < 360 && s.day >= 360) src.unrestAt12.push(s.unrest);
		}
		const k = s.outcome.victoryPath ? 'win:' + s.outcome.victoryPath : 'loss:' + s.outcome.defeatReason;
		tally[k] = (tally[k] ?? 0) + 1;
		if (k === 'loss:riot') months.push(s.outcome.month!);
	}
	months.sort((a, b) => a - b);
	const med = months.length ? months[Math.floor(months.length / 2)] : NaN;
	const u12 = src.unrestAt12.sort((a, b) => a - b);
	console.log(
		`${v.name.padEnd(42)} ${JSON.stringify(tally)} | переворот: медиана мес. ${med} | мес. с U≥80 на партию ${(riotMonthsTotal / N).toFixed(1)} | «разогнать» ${(src.disperse / N).toFixed(1)}, нац. протест ${(src.protest / N).toFixed(1)}, +уровень репр. ${(src.reprUp / N).toFixed(1)}, оттепель ${(src.thaw / N).toFixed(1)} | U на M12 p50 ${u12.length ? u12[Math.floor(u12.length / 2)].toFixed(0) : '—'}`
	);
}
