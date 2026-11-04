// Боты-стратегии для симулятора баланса. Каждый бот — функция «хода» между advance().
// Все действия идут через applyAction (тот же API, что у игрока); скрытое от игрока
// (кроты, params.real у эвакуации) боты не читают.
import {
	BALANCE as B,
	applyAction,
	validateAction,
	questChoices,
	previewOperation,
	DEPT_KEYS,
	LEGENDS,
	RECRUIT_METHODS,
	RIVAL_IDS,
	SKILLS,
	TECH_IDS,
	type Agent,
	type DeptKey,
	type GameState,
	type OpTarget,
	type PlayerAction,
	type RivalId
} from '../src/lib/game/index';
import { honestBotTurn } from '../src/lib/game/testing/honest-bot';
import {
	act,
	botRng,
	buildDepts,
	buildReprTo,
	buildSurvTo,
	dayOfQuarterLeft,
	defendInvestigation,
	fakeAtQuarterEnd,
	forecastNet,
	handlePerks,
	handleQuests,
	hasTech,
	hire,
	honestQuestPolicy,
	idle,
	planHire,
	emergency,
	rosterLimit,
	infiltrate,
	isHero,
	loyaltyCare,
	month,
	periodicLoyaltyCheck,
	primarySkill,
	publicRelations,
	research,
	rivalKompromat,
	runCases,
	surveil,
	type BotDef,
	type BotTurn,
	type QuestPolicy
} from './kit';

// ------------------------------------------------------------ общие куски

interface Mem {
	lastCheck: number;
	lastLeak: number;
	lastSabotageQ: number;
	lastLobbyQ: number;
	spies: Set<number>;
	reserved: Set<number>;
}
const newMem = (): Mem => ({ lastCheck: -999, lastLeak: -999, lastSabotageQ: 0, lastLobbyQ: 0, spies: new Set(), reserved: new Set() });

/** Сколько ещё дел «просятся» к агентам: доступные и не взятые. */
function openCases(s: GameState): number {
	return s.cases.filter((c) => c.takenByOpId === null).length;
}

/** Найм по спросу: остались незанятые дела и мало свободных. */
function demandHire(s: GameState, cap: number, reserve: number, minNet: number, ex?: Set<number>): void {
	planHire(s, { target: cap, reserve, minNet, exclude: ex });
}

function lastRatio(s: GameState): number {
	return s.plan.ratioHistory.at(-1) ?? 1;
}

/** «Грязная» политика квестов: компромат и давление там, где выгодно. */
const dirtyQuestPolicy: QuestPolicy = (s, q, av) => {
	const pick = (...ids: string[]) => ids.find((x) => av.includes(x)) ?? null;
	switch (q.questId) {
		case 'hearings':
			return pick('testify', 'secrecy');
		case 'blogger_docs':
			return pick('discredit', 'deal');
		case 'journalist':
			return pick('discredit', 'bribe', 'ignore');
		case 'senator_secret':
			return s.investigation < 40 ? pick('blackmail', 'hold') : pick('hold');
		case 'rally':
			return pick('allow');
		case 'informant':
			return pick('kompromat', 'pay', 'report');
		default:
			return honestQuestPolicy(s, q, av);
	}
};

/** Честная база: дела, найм, отделы, пиар, лояльность. */
function honestCore(s: GameState, mem: Mem, o: { depts: [DeptKey, number][]; cap: number; minTerror: number; ex?: Set<number>; repCap?: number }) {
	handlePerks(s);
	runCases(s, { reserve: 60, minInvest: 0.3, minTerror: o.minTerror, terrorExtras: true, exclude: o.ex });
	demandHire(s, o.cap, 250, 60, o.ex);
	buildDepts(s, o.depts, 500);
	publicRelations(s, 350, o.repCap ?? 97, 40);
	loyaltyCare(s, 300);
	if (s.departments.counterintel >= 1) periodicLoyaltyCheck(s, mem, 240, 400);
}

const HONEST_DEPTS: [DeptKey, number][] = [
	['analytics', 2],
	['pr', 1],
	['operations', 2],
	['legal', 1],
	['pr', 2],
	['counterintel', 1],
	['analytics', 3],
	['legal', 2],
	['operations', 3],
	['pr', 3],
	['legal', 3],
	['analytics', 4],
	['pr', 4],
	['operations', 4],
	['legal', 4],
	['analytics', 5],
	['pr', 5],
	['counterintel', 2]
];

// ------------------------------------------------------------ честный (§10.1 архетип)

const honest: BotDef = {
	name: 'honest',
	about: 'Честный: расследования и теракты (шанс ≥ 0.40), найм по спросу до 16, отделы равномерно (Ан/Оп/Пиар/Юр/КР1), пиар-кампании, Конгресс, медали. Без слежки, технологий и грязных выборов.',
	make() {
		const mem = newMem();
		return (s) => {
			handleQuests(s, honestQuestPolicy);
			honestCore(s, mem, { depts: HONEST_DEPTS, cap: 20, minTerror: 0.4 });
		};
	}
};

/** Эталонный бот ядра (src/lib/game/testing/honest-bot.ts) — без изменений. */
const reference: BotDef = {
	name: 'ref',
	about: 'Эталонный honest-bot из ядра (testing/honest-bot.ts): теракты всегда, autoChoice в квестах, найм при budget > 1200.',
	make() {
		return (s) => honestBotTurn(s);
	}
};

// ------------------------------------------------------------ «Чистые руки»

const clean: BotDef = {
	name: 'clean',
	about: 'Целевой «Чистые руки»: честная база + Кибер 1, Слежка 2, A1, A2; найм только при запасе по плану (ratio ≥ 1.15); теракт при шансе ≥ 0.5; пиар до 100.',
	make() {
		const mem = newMem();
		const depts: [DeptKey, number][] = [
			['analytics', 2],
			['pr', 1],
			['cyber', 1],
			['operations', 2],
			['pr', 2],
			['legal', 1],
			['analytics', 3],
			['counterintel', 1],
			['pr', 3],
			['legal', 2],
			['analytics', 4],
			['pr', 4],
			['operations', 3],
			['analytics', 5],
			['pr', 5],
			['legal', 3],
			['operations', 4]
		];
		return (s) => {
			handleQuests(s, honestQuestPolicy);
			handlePerks(s);
			runCases(s, { reserve: 60, minInvest: 0.3, minTerror: 0.5, terrorExtras: true });
			// Найм: только если план с запасом и дел больше, чем рук.
			const free = idle(s).length;
			const pace = s.plan.points / Math.max(1, s.plan.target);
			const qLeft = dayOfQuarterLeft(s) / 90;
			const onTrack = pace >= (1 - qLeft) * 1.05;
			void free; void onTrack;
			planHire(s, { target: 20, reserve: 250, minNet: 80 });
			buildDepts(s, depts, 500);
			buildSurvTo(s, 2, 600);
			if (s.survLevel >= 2) research(s, ['A1', 'A2'], 500);
			publicRelations(s, 300, 100, 40);
			loyaltyCare(s, 300);
			if (s.departments.counterintel >= 1) periodicLoyaltyCheck(s, mem, 240, 400);
		};
	}
};

// ------------------------------------------------------------ грязный

function topRival(s: GameState): RivalId | null {
	const alive = s.rivals.filter((r) => r.alive).sort((a, b) => b.share - a.share);
	return alive[0]?.id ?? null;
}

export type FakeMode = 'fill' | 'never' | 'always' | 'rescue' | 'early';

const FAKE_ABOUT: Record<FakeMode, string> = {
	fill: 'до ratio 1.0 в последний ход квартала',
	never: 'никогда',
	always: 'всегда до ratio 1.3 (максимум 30 % цели)',
	rescue: 'только если ratio < 0.7',
	early: 'до 1.0 только в кварталах 1–2'
};

function makeDirty(fake: FakeMode): BotDef {
	return {
	name: fake === 'fill' ? 'dirty' : `dirty-fake-${fake}`,
	about: 'Грязный (§10.1): ~10 агентов, Кибер 3, Слежка 4, C1; слежка за соперниками → сливы на лидера по доле, внедрение и подстава раз в квартал, лобби, встречный компромат при «Под следствием» ≥ 35; фальшивки: ' + FAKE_ABOUT[fake] + '.',
	make() {
		const mem = newMem();
		const depts: [DeptKey, number][] = [
			['analytics', 2],
			['cyber', 1],
			['pr', 1],
			['cyber', 2],
			['legal', 1],
			['cyber', 3],
			['operations', 2],
			['pr', 2],
			['legal', 2],
			['counterintel', 1],
			['pr', 3],
			['legal', 3],
			['analytics', 3],
			['pr', 4]
		];
		return (s) => {
			handleQuests(s, dirtyQuestPolicy);
			handlePerks(s);
			defendInvestigation(s, 35);
			const top = topRival(s);
			// Грязные операции: 1–2 слежки, пока засвеченность умеренная.
			const runningSurv = s.operations.filter((o) => o.type === 'surveillance').length;
			if (top && s.exposure < 40 && runningSurv < 2 && s.survLevel >= 1) {
				const t = s.rivals.filter((r) => r.alive).sort((a, b) => rivalKompromat(s, a.id).length - rivalKompromat(s, b.id).length)[0];
				surveil(s, { kind: 'rival', id: t.id }, 150, new Set());
			}
			// Сливы на лидера по доле, не чаще раза в 20 дней.
			if (top && s.exposure < 45 && s.day - mem.lastLeak >= 20) {
				const k = rivalKompromat(s, top).sort((a, b) => b.strength - a.strength)[0];
				if (k && s.investigation < 30 && act(s, { type: 'leak', kompromatId: k.id })) mem.lastLeak = s.day;
			}
			// Внедрение и подстава.
			const embedded = s.agents.filter((a) => a.status === 'embedded' && a.location && 'rivalId' in a.location);
			if (top && embedded.length === 0 && month(s) >= 6 && s.operations.every((o) => o.type !== 'infiltration'))
				infiltrate(s, { kind: 'rival', id: top }, 300, new Set());
			const q = s.plan.quarter;
			if (dayOfQuarterLeft(s) <= 15 && mem.lastSabotageQ < q) {
				for (const a of embedded) {
					const rid = (a.location as { rivalId: RivalId }).rivalId;
					const r = s.rivals.find((x) => x.id === rid)!;
					if (r.sabotageCount < 3 && act(s, { type: 'sabotage', rivalId: rid })) {
						mem.lastSabotageQ = q;
						break;
					}
				}
			}
			if (top && dayOfQuarterLeft(s) <= 15 && mem.lastLobbyQ < q && s.influence >= 35 && act(s, { type: 'lobby', rivalId: top })) mem.lastLobbyQ = q;
			if (fake === 'fill') fakeAtQuarterEnd(s, 1.0, 1.0);
			else if (fake === 'always') fakeAtQuarterEnd(s, 1.3, 1.3);
			else if (fake === 'rescue') fakeAtQuarterEnd(s, 0.7, 0.7);
			else if (fake === 'early' && s.plan.quarter <= 2) fakeAtQuarterEnd(s, 1.0, 1.0);
			runCases(s, { reserve: 60, minInvest: 0.3, minTerror: 0.4, terrorExtras: true });
			demandHire(s, 20, 300, 80);
			buildDepts(s, depts, 450);
			buildSurvTo(s, 4, 450);
			research(s, ['C1'], 500);
			publicRelations(s, 350, 97, 45);
			loyaltyCare(s, 300);
			if (s.departments.counterintel >= 1) periodicLoyaltyCheck(s, mem, 240, 400);
		};
	}
	};
}
const dirty = makeDirty('fill');

// ------------------------------------------------------------ «Монополия»

const monopoly: BotDef = {
	name: 'monopoly',
	about:
		'Целевой «Монополия»: приоритет Кибер 1–2 → Слежка 1–3 (сила 2) → C1; 2–3 «оперативника» следят за целью (соперник с наименьшим весом); компромат копится, в последний ход квартала — пачка сливов до реп. ≈ 0 и лобби по цели, сколько позволяет влияние (выбытие по доле < 0.12 два квартала); поглощение при реп. цели < 25 и влиянии ≥ 75; влияние — Конгресс каждый месяц, шантаж сенаторов; подстава раз в квартал; встречный компромат при «Под следствием» ≥ 40; фальшивки при ratio < 0.7.',
	make() {
		const mem = newMem();
		const ops = new Set<number>();
		const depts: [DeptKey, number][] = [
			['analytics', 2],
			['cyber', 1],
			['cyber', 2],
			['pr', 1],
			['legal', 1],
			['pr', 2],
			['legal', 2],
			['operations', 2],
			['counterintel', 1],
			['cyber', 3],
			['pr', 3],
			['legal', 3],
			['analytics', 3],
			['cyber', 4],
			['pr', 4]
		];
		return (s) => {
			handleQuests(s, (st, q, av) => {
				if (q.questId === 'senator_secret') return av.includes('blackmail') && st.investigation < 45 ? 'blackmail' : 'hold';
				if (q.questId === 'hearings') return av.includes('testify') ? 'testify' : av[0];
				return dirtyQuestPolicy(st, q, av);
			});
			handlePerks(s);
			defendInvestigation(s, 40);
			// Шантаж сенаторов из запаса (влияние), пока следствие терпимо.
			if (s.investigation < 45) for (const k of s.kompromat) if (k.target.kind === 'senator' && (k.usedCooldownUntil ?? 0) <= s.day) act(s, { type: 'blackmail', kompromatId: k.id });
			for (const id of [...ops]) if (!s.agents.some((a) => a.id === id)) ops.delete(id);
			const nOps = s.survLevel >= 3 && s.budget > 400 ? 2 : 1;
			while (ops.size < nOps && s.agents.length - ops.size > 7) {
				const c = s.agents.filter((a) => !ops.has(a.id) && !isHero(a)).sort((x, y) => primarySkill(y, 'surveillance') - primarySkill(x, 'surveillance'))[0];
				if (!c) break;
				ops.add(c.id);
			}
			// D-059: соперник «на грани» (репутация 0) — льготное поглощение при влиянии ≥ collapseMinInfluence.
			const A = B.ACT_ABSORB as typeof B.ACT_ABSORB & { collapseMinInfluence?: number; collapseCost?: number };
			for (const r of s.rivals) {
				const rr = r as typeof r & { collapsing?: boolean };
				if (r.alive && rr.collapsing && s.influence >= (A.collapseMinInfluence ?? A.minInfluence) && s.budget >= (A.collapseCost ?? A.cost) + 100) act(s, { type: 'absorb', rivalId: r.id });
			}
			const alive = s.rivals.filter((r) => r.alive && !(r as typeof r & { collapsing?: boolean }).collapsing);
			const w = (r: (typeof alive)[number]) => (0.5 + Math.min(1.5, r.planRatio)) * (0.5 + r.reputation / 100) * (0.5 + r.influence / 100) * (r.id === 'secret_service' ? 1.1 : 1);
			const target = [...alive].sort((a, b) => w(a) - w(b))[0];
			const left = dayOfQuarterLeft(s);
			// Приоритет инфраструктуры грязной работы.
			const infraDone = s.survLevel >= 3 && hasTech(s, 'C1');
			const infraNext = s.departments.cyber < 2 ? B.DEPT_COST_BY_LEVEL[s.departments.cyber] : s.survLevel < 3 ? B.SURV_COST_BY_LEVEL[s.survLevel] : !hasTech(s, 'C1') ? 300 : 0;
			if (s.departments.cyber < 2) buildDepts(s, [['analytics', 1], ['cyber', 2]], 150, 20);
			buildSurvTo(s, s.departments.cyber >= 4 ? 5 : 3, 150);
			if (s.departments.cyber >= 1) research(s, ['C1'], 200);
			if (target) {
				const tid = target.id;
				if (target.reputation < B.ACT_ABSORB.maxTargetRep && s.influence >= B.ACT_ABSORB.minInfluence && s.budget >= B.ACT_ABSORB.cost + 200) act(s, { type: 'absorb', rivalId: tid });
				// D-052: репутация ≤ 0 выбивает сразу — если запаса компромата хватает, сливаем немедленно.
				{
					const ks0 = rivalKompromat(s, tid).sort((a, b) => b.strength - a.strength);
					const dmg0 = ks0.reduce((acc, k) => acc - B.ACT_LEAK.repPerStrength * k.strength, 0);
					if (dmg0 >= target.reputation && s.investigation < 60 && s.exposure < 80)
						for (const k of ks0) {
							if (!target.alive || target.reputation <= 0) break;
							act(s, { type: 'leak', kompromatId: k.id });
						}
				}
				if (s.exposure < 60 && s.survLevel >= 1 && s.budget >= 150)
					for (const id of ops) {
						const a = s.agents.find((x) => x.id === id);
						if (!a || a.status !== 'idle') continue;
						const others = new Set(s.agents.filter((x) => x.id !== id).map((x) => x.id));
						surveil(s, { kind: 'rival', id: tid }, 100, others, 0.3);
					}
				const q = s.plan.quarter;
				if (left <= 3) {
					// Пачка сливов: опускаем репутацию цели к нулю перед распределением.
					const ks = rivalKompromat(s, tid).sort((a, b) => b.strength - a.strength);
					if (s.investigation < 60) for (const k of ks) {
						if (target.reputation <= 3) break;
						act(s, { type: 'leak', kompromatId: k.id });
					}
					// Лобби по цели, пока хватает влияния (оставляем запас на поглощение, если оно близко).
					// Держим влияние на льготное поглощение цели, которую вот-вот доведём до 0 (D-059).
					const keep = target.reputation < 30 ? Math.max(15, ((B.ACT_ABSORB as { collapseMinInfluence?: number }).collapseMinInfluence ?? B.ACT_ABSORB.minInfluence) + 5) : 15;
					while (s.influence - B.ACT_LOBBY.influence >= keep && target.lobbyMult > B.ACT_LOBBY.multMin + 1e-9) {
						if (!act(s, { type: 'lobby', rivalId: tid })) break;
					}
				}
				const emb = s.agents.filter((a) => a.status === 'embedded' && a.location && 'rivalId' in a.location && a.location.rivalId === tid);
				if (emb.length === 0 && month(s) >= 6 && infraDone && !s.operations.some((o) => o.type === 'infiltration'))
					infiltrate(s, { kind: 'rival', id: tid }, 300, ops, 0.3);
				if (left <= 15 && mem.lastSabotageQ < q && emb.length > 0 && target.sabotageCount < 3 && s.investigation < 40)
					if (act(s, { type: 'sabotage', rivalId: tid })) mem.lastSabotageQ = q;
			}
			fakeAtQuarterEnd(s, 0.7, 0.7);
			runCases(s, { reserve: 60, minInvest: 0.3, minTerror: 0.4, terrorExtras: true, exclude: ops });
			planHire(s, { target: 20, reserve: 300 + infraNext, minNet: 80, exclude: ops, ratioNeed: 1.0 });
			if (s.agents.length - ops.size < 7) hire(s, { target: 14, reserve: 200, minNet: 40 });
			if (infraDone) buildDepts(s, depts, 450);
			if (s.budget >= 300) act(s, { type: 'congressWork' });
			if (s.reputation < 90 && s.budget >= 350 + infraNext) act(s, { type: 'prCampaign' });
			loyaltyCare(s, 300);
			if (s.departments.counterintel >= 1) periodicLoyaltyCheck(s, mem, 180, 400);
		};
	}
};


// ------------------------------------------------------------ «1984»

export interface Opts1984 {
	/** Рывок по этапам: Репр. 5+6 при запасе на них, A3 и 7 — по мере денег (при спаде недовольства 3 окно безопаснее). */
	staged?: boolean;
	/** Откатить слежку после включения Репрессий 7 (требования проверяются только при стройке). */
	rollbackSurv: boolean;
}

function make1984(o: Opts1984): BotDef {
	return {
		name: o.rollbackSurv ? '1984-rb' : '1984',
		about:
			'Целевой «1984»: Кибер 5, Слежка 1–6, A1→A2, Репрессии 1–4 рано, Пиар 2/Юр 3; Репрессии 5→6→A3→7 одним рывком при запасе денег; митинг — «дать пройти», профсоюз — без уступок; пиар и Юр против скандалов.' +
			(o.rollbackSurv ? ' После Репрессий 7 откатывает Слежку до 2.' : ''),
		make() {
			const mem = newMem();
			const depts: [DeptKey, number][] = [
				['analytics', 2],
				['cyber', 1],
				['cyber', 2],
				['pr', 1],
				['cyber', 3],
				['pr', 2],
				['legal', 1],
				['cyber', 4],
				['legal', 2],
				['legal', 3],
				['cyber', 5],
				['pr', 3],
				['operations', 2],
				['counterintel', 1],
				['pr', 4],
				['legal', 4],
				['pr', 5]
			];
			const policy: QuestPolicy = (s, q, av) => {
				const pick = (...ids: string[]) => ids.find((x) => av.includes(x)) ?? null;
				if (q.questId === 'union_meeting') return pick('infiltrate', 'refuse');
				if (q.questId === 'blogger_docs') return pick('discredit', 'deal', 'detain');
				if (q.questId === 'rally') return pick('allow');
				if (q.questId === 'journalist') return pick('discredit', 'bribe', 'ignore');
				return dirtyQuestPolicy(s, q, av);
			};
			const stagedSprint = o.staged ?? true;
			return (s) => {
				handleQuests(s, policy);
				handlePerks(s);
				defendInvestigation(s, 40);
				const prereqReady = s.survLevel >= 5 && hasTech(s, 'A2') && s.departments.legal >= 3 && s.departments.pr >= 2;
				// Финальный рывок: Репрессии 5, 6, затем A3 и 7. Нужен запас на 5+6+A3+7.
				const sprintCost = [500, 600, 1000, 700].slice(Math.max(0, s.reprLevel - 4)).reduce((a, b) => a + b, 0);
				let spent = false;
				if (s.reprLevel < 4 && s.survLevel >= 3) spent = buildReprTo(s, s.survLevel >= 3 && s.departments.pr >= 2 ? 4 : 3, 300) || spent;
				if (prereqReady && s.survLevel >= 6) {
					if (s.reprLevel === 4 && s.budget >= (stagedSprint ? 1100 + 300 : sprintCost + 300)) spent = buildReprTo(s, 5, 0) || spent;
					else if (s.reprLevel === 5) spent = buildReprTo(s, 6, 0) || spent;
					else if (s.reprLevel === 6 && !hasTech(s, 'A3')) spent = research(s, ['A3'], 0) || spent;
					else if (s.reprLevel === 6 && hasTech(s, 'A3')) spent = buildReprTo(s, 7, 0) || spent;
				}
				if (o.rollbackSurv && s.reprLevel >= 7 && s.survLevel > 2 && !s.builds.some((b) => b.kind === 'surv')) act(s, { type: 'rollbackSurv' });
				// Крупные лидеры при Репрессиях 5 — убрать (если недовольство не на грани).
				if (s.reprLevel >= 5) for (const l of s.leaders) if (l.influence >= 60 && s.unrest < 70) act(s, { type: 'removeLeader', leaderId: l.id });
				const inSprint = s.reprLevel >= 4 && prereqReady && s.survLevel >= 6;
				const reserveBig = inSprint ? sprintCost : 0;
				if (!(o.rollbackSurv && s.reprLevel >= 7)) buildSurvTo(s, s.departments.cyber >= 5 && hasTech(s, 'A2') ? 6 : Math.min(5, s.departments.cyber + 1), 300 + reserveBig);
				if (s.survLevel >= 2) research(s, ['A1', 'A2'], 300 + reserveBig);
				runCases(s, { reserve: 60, minInvest: 0.3, minTerror: 0.4, terrorExtras: true });
				demandHire(s, 20, 300 + reserveBig, 120);
				buildDepts(s, depts, 450 + reserveBig);
				publicRelations(s, 250 + (inSprint ? reserveBig : 0), 97, 35);
				loyaltyCare(s, 300);
				if (s.departments.counterintel >= 1) periodicLoyaltyCheck(s, mem, 240, 400 + reserveBig);
				void spent;
			};
		}
	};
}

// ------------------------------------------------------------ «Тень»

const SHADOW_COUNTRIES = ['canada', 'mexico', 'cuba'];

const shadow: BotDef = {
	name: 'shadow',
	about:
		'Целевой «Тень»: честная база дома (≥ 8 агентов на делах); B1 с 2-го месяца, затем КР1→B2→B3; шпионов не больше 1 на страну до B2, 2 до B3, 3 после — и только если прошлый квартал ratio ≥ 0.85; шпионы — лучшие по слежке с лояльностью ≥ 50, курс языка, навык слежки до 7 (если есть деньги), «журналист» с подготовкой, вербовка за деньги; эвакуация — «проверить», двойной агент — чистка; фальшивки при ratio < 0.7.',
	make() {
		const mem = newMem();
		const assigned = new Map<number, string>(); // agentId → country
		const depts: [DeptKey, number][] = [
			['analytics', 2],
			['counterintel', 1],
			['operations', 2],
			['pr', 1],
			['legal', 1],
			['pr', 2],
			['counterintel', 2],
			['operations', 3],
			['analytics', 3],
			['cyber', 2],
			['counterintel', 3],
			['legal', 2],
			['counterintel', 4],
			['pr', 3],
			['counterintel', 5],
			['operations', 4]
		];
		const policy: QuestPolicy = (s, q, av) => {
			const pick = (...ids: string[]) => ids.find((x) => av.includes(x)) ?? null;
			if (q.questId === 'evacuation') return pick('check', 'stay');
			if (q.questId === 'double_agent') return pick('purge', 'ignore');
			if (q.questId === 'airport') return pick('flee');
			if (q.questId === 'recruit_retry') return pick('money', 'kompromat', 'ideology');
			if (q.questId === 'defector_contact') return pick('return', 'court', 'ignore');
			return honestQuestPolicy(s, q, av);
		};
		return (s) => {
			handleQuests(s, policy);
			handlePerks(s);
			// Приоритет ветки B: прочие траты ждут, пока не накоплено на следующую технологию.
			const nextB = (['B1', 'B2', 'B3'] as const).find((t) => !hasTech(s, t));
			const save = nextB && s.research?.techId !== nextB ? B.TECH_COST_BY_TIER[['B1', 'B2', 'B3'].indexOf(nextB)] : 0;
			if (s.departments.counterintel < 1) buildDepts(s, [['counterintel', 1]], 100, 0);
			research(s, ['B1', 'B2', 'B3'], 150);
			for (const id of [...assigned.keys()]) if (!s.agents.some((a) => a.id === id)) assigned.delete(id);
			const perCountry = hasTech(s, 'B3') ? 3 : hasTech(s, 'B2') ? 2 : 1;
			const abroadIn = (c: string) => [...assigned.values()].filter((cc) => cc === c).length;
			const okPlan = (s.plan.ratioHistory.at(-1) ?? 1) >= 0.85;
			if (hasTech(s, 'B1') || s.research?.techId === 'B1')
				for (let round = 0; round < perCountry; round++)
					for (const c of SHADOW_COUNTRIES) {
						if (abroadIn(c) > round) continue;
						const homeN = s.agents.filter((a) => !assigned.has(a.id)).length;
						if (homeN <= 8 || !okPlan) break;
						const cand = s.agents
							.filter((a) => !assigned.has(a.id) && a.status === 'idle' && a.loyalty >= 50)
							.sort((x, y) => y.skills.surveillance - x.skills.surveillance || x.id - y.id)[0];
						if (!cand) break;
						assigned.set(cand.id, c);
					}
			for (const [id, c] of assigned) {
				const a = s.agents.find((x) => x.id === id);
				if (!a || a.status !== 'idle') continue;
				if (!a.languages.includes(c)) {
					if (s.budget >= 250) act(s, { type: 'train', agentId: id, course: 'language', countryId: c });
					continue;
				}
				if (a.skills.surveillance < 7 && s.budget >= 600) {
					act(s, { type: 'train', agentId: id, course: 'skill', skill: 'surveillance' });
					continue;
				}
				if (!hasTech(s, 'B1')) continue;
				if (s.budget >= 40 + 60 + 150) act(s, { type: 'deployAgent', agentId: id, countryId: c, legend: 'journalist', prep: true, recruit: 'money' });
			}
			const spies = new Set(assigned.keys());
			fakeAtQuarterEnd(s, 0.7, 0.7);
			runCases(s, { reserve: 60, minInvest: 0.3, minTerror: 0.4, terrorExtras: true, exclude: spies });
			const home = s.agents.filter((a) => !spies.has(a.id));
			const wantSpies = 3 * perCountry - spies.size;
			if (hasTech(s, 'B1') && wantSpies > 0 && home.length <= 9 && okPlan)
				hire(s, { target: 22, reserve: 300 + save / 2, minNet: 60, preferSkill: 'surveillance' });
			else planHire(s, { target: 22, reserve: 300 + save, minNet: 60, exclude: spies, ratioNeed: 1.0 });
			buildDepts(s, depts, 500 + save);
			publicRelations(s, 400 + save, 97, 40);
			loyaltyCare(s, 250, 55);
			if (s.departments.counterintel >= 1) periodicLoyaltyCheck(s, mem, 240, 500);
		};
	}
};


// ------------------------------------------------------------ «Серый кардинал»

const cardinal: BotDef = {
	name: 'cardinal',
	about:
		'Целевой «Кардинал» (D-050): Ан 2, Кибер 1–5, Слежка 1–6 (A1→A2 ради Слежки 6), C1→C2→C3; слежка за сенаторами по лучшему шансу до 5 + 1 запасной, затем президент командой из 3; во время удержания 120 дней восполняет сгоревших сенаторов и компромат на президента (выборы, срок); Слежку 6 не откатывает; квест «Сенатор» — придержать; Юр 3 против ответного удара; засвеченность ≤ 70.',
	make() {
		const mem = newMem();
		const depts: [DeptKey, number][] = [
			['analytics', 2],
			['cyber', 1],
			['cyber', 2],
			['cyber', 3],
			['cyber', 4],
			['pr', 1],
			['legal', 1],
			['cyber', 5],
			['pr', 2],
			['legal', 2],
			['legal', 3],
			['operations', 2],
			['counterintel', 1],
			['pr', 3]
		];
		const policy: QuestPolicy = (s, q, av) => {
			if (q.questId === 'senator_secret') return av.includes('hold') ? 'hold' : av[0];
			return dirtyQuestPolicy(s, q, av);
		};
		return (s) => {
			handleQuests(s, policy);
			handlePerks(s);
			defendInvestigation(s, 40);
			const need = B.CARDINAL_SENATORS_REQUIRED;
			const c3surv = (B.TECH_TREE as Record<string, { req: { surv?: number } }>).C3.req.surv ?? 5;
			const presSurv = (B as Record<string, unknown>).CARDINAL_PRESIDENT_MIN_SURV as number | undefined;
			const survGoal = Math.max(5, c3surv, presSurv ?? 0);
			const order: ('A1' | 'A2' | 'C1' | 'C2' | 'C3')[] =
				survGoal >= 6 ? (s.survLevel >= 2 ? ['C1', 'C2', 'A1', 'A2', 'C3'] : ['C1', 'C2']) : ['C1', 'C2', 'C3'];
			research(s, order, 100);
			buildSurvTo(s, Math.min(survGoal, s.departments.cyber + 1, survGoal >= 6 && !hasTech(s, 'A2') ? 5 : 6), 150);
			const active = (k: { expiresDay: number | null }) => k.expiresDay === null || k.expiresDay > s.day || hasTech(s, 'C2');
			const covered = new Set(s.kompromat.filter((k) => k.target.kind === 'senator' && active(k)).map((k) => (k.target as { id: string }).id));
			const inFlight = new Set(s.operations.filter((o) => o.target?.kind === 'senator').map((o) => (o.target as { id: string }).id));
			const hasPres = s.kompromat.some((k) => k.target.kind === 'president' && k.target.id === s.presidentTerm && (k.expiresDay ?? 1e9) > s.day + 30);
			const presInFlight = s.operations.some((o) => o.target?.kind === 'president');
			const want = need + 1; // запасной сенатор на случай «сгорания» во время удержания
			if (s.survLevel >= 5 && s.exposure < 70) {
				if (covered.size + inFlight.size < want) {
					const free = s.senators
						.filter((x) => !covered.has(x.id) && !inFlight.has(x.id))
						.map((x) => {
							const best = idle(s).filter((a) => !isHero(a)).sort((p, q) => primarySkill(q, 'surveillance') - primarySkill(p, 'surveillance'))[0];
							const ch = best ? previewOperation(s, { opType: 'surveillance', agentIds: [best.id], target: { kind: 'senator', id: x.id } }).chance : 0;
							return { x, ch };
						})
						.sort((a, b) => b.ch - a.ch);
					for (const f of free.slice(0, want - covered.size - inFlight.size)) surveil(s, { kind: 'senator', id: f.x.id }, 100, new Set(), 0.3, 1);
				}
				if (covered.size >= need && hasTech(s, 'C3') && !hasPres && !presInFlight) surveil(s, { kind: 'president' }, 100, new Set(), 0.3, 2);
			}
			runCases(s, { reserve: 60, minInvest: 0.3, minTerror: 0.4, terrorExtras: true });
			demandHire(s, 20, 400, 100);
			buildDepts(s, depts, 500);
			publicRelations(s, 300, 97, 40);
			loyaltyCare(s, 300);
			if (s.departments.counterintel >= 1) periodicLoyaltyCheck(s, mem, 240, 400);
		};
	}
};


// ------------------------------------------------------------ случайный

/** Кандидаты действий (как в fuzz-тесте ядра) — равновероятный выбор категории, затем параметров. */
function randomCandidates(s: GameState, r: () => number): PlayerAction[][] {
	const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
	const idleIds = idle(s).map((a) => a.id);
	const team = (n: number) => [...idleIds].sort(() => r() - 0.5).slice(0, n);
	const groups: PlayerAction[][] = [];
	groups.push(s.hirePool.map((c) => ({ type: 'hire', candidateId: c.id })));
	groups.push(s.agents.map((a) => ({ type: 'fire', agentId: a.id })));
	groups.push(s.agents.map((a) => ({ type: 'medal', agentId: a.id })));
	groups.push(s.agents.map((a) => ({ type: 'train', agentId: a.id, course: pick(['skill', 'language', 'legend'] as const), skill: pick(SKILLS), countryId: pick(SHADOW_COUNTRIES) })));
	groups.push(DEPT_KEYS.map((d) => ({ type: 'buildDept', dept: d })));
	groups.push(TECH_IDS.map((t) => ({ type: 'research', tech: t })));
	groups.push([{ type: 'buildSurv' }, { type: 'buildRepr' }, { type: 'rollbackSurv' }, { type: 'rollbackRepr' }, { type: 'cancelResearch' }]);
	groups.push(
		s.cases.map((c) => {
			const type = c.kind === 'terror' ? 'terror' : 'investigation';
			return { type: 'startOp', opType: type, caseId: c.id, agentIds: team(B.OP_AGENTS_REQUIRED[type] + Math.floor(r() * 3)) } as PlayerAction;
		})
	);
	const targets: OpTarget[] = [...RIVAL_IDS.map((id) => ({ kind: 'rival' as const, id })), { kind: 'senator', id: pick(s.senators).id }, { kind: 'president' }];
	groups.push(targets.flatMap((t) => (['surveillance', 'infiltration'] as const).map((opType) => ({ type: 'startOp', opType, target: t, agentIds: team(1) }) as PlayerAction)));
	groups.push(s.kompromat.flatMap((k) => [{ type: 'leak', kompromatId: k.id }, { type: 'counterKompromat', kompromatId: k.id }] as PlayerAction[]));
	groups.push(RIVAL_IDS.flatMap((id) => [{ type: 'sabotage', rivalId: id }, { type: 'lobby', rivalId: id }, { type: 'poach', rivalId: id }] as PlayerAction[]));
	groups.push([{ type: 'fakeStats', points: 1 }, { type: 'congressWork' }, { type: 'prCampaign' }, { type: 'loyaltyCheck' }]);
	groups.push(s.agents.map((a) => ({ type: 'deployAgent', agentId: a.id, countryId: pick(SHADOW_COUNTRIES), legend: pick(LEGENDS), prep: r() < 0.5, recruit: pick(RECRUIT_METHODS) })));
	return groups.filter((g) => g.length > 0);
}

const random: BotDef = {
	name: 'random',
	about: 'Случайный: каждый ход 2 попытки — равновероятная категория действия (найм, увольнение, стройка, технология, дело, слежка/внедрение, слив, лобби, пиар…), затем случайные параметры; квесты — случайный доступный выбор.',
	make(seed) {
		const r = botRng('random:' + seed);
		return (s) => {
			for (const q of [...s.quests]) {
				const av = questChoices(s, q).filter((c) => c.available);
				if (av.length) act(s, { type: 'questChoice', sessionId: q.id, choice: av[Math.floor(r() * av.length)].id });
			}
			for (let i = 0; i < 2; i++) {
				const g = randomCandidates(s, r);
				const grp = g[Math.floor(r() * g.length)];
				const a = grp[Math.floor(r() * grp.length)];
				if (a && validateAction(s, a) === null) applyAction(s, 'player', a);
			}
			for (const a of s.agents) while (a.pendingPerks > 0) {
				const p = (['cold_blooded', 'marksman', 'analyst', 'ghost', 'mentor', 'iron_will', 'negotiator', 'netrunner'] as const).find((x) => !a.perks.includes(x));
				if (!p || !act(s, { type: 'choosePerk', agentId: a.id, perk: p })) break;
			}
		};
	}
};

// ------------------------------------------------------------ варианты для экспериментов

/** Честный бот с заданным уровнем контрразведки (для D-040). */
export function honestCI(level: number): BotDef {
	return {
		name: `honest-ci${level}`,
		about: `Честный, контрразведка до ${level} в приоритете`,
		make() {
			const mem = newMem();
			const ciPlan: [DeptKey, number][] = [];
			for (let l = 1; l <= level; l++) {
				if (l === 3) ciPlan.push(['analytics', 2], ['cyber', 1], ['cyber', 2]);
				ciPlan.push(['counterintel', l]);
			}
			const depts = [...ciPlan, ...HONEST_DEPTS.filter(([d]) => d !== 'counterintel')];
			return (s) => {
				handleQuests(s, honestQuestPolicy);
				honestCore(s, mem, { depts, cap: 16, minTerror: 0.4 });
			};
		}
	};
}

/** Аварийная защита от банкротства перед каждым ходом (как сделал бы игрок). */
function guarded(b: BotDef): BotDef {
	return { ...b, make: (seed) => { const t = b.make(seed); return (s) => { emergency(s); t(s); }; } };
}

export const BOTS: BotDef[] = [
	guarded(honest),
	reference,
	guarded(clean),
	guarded(dirty),
	guarded(monopoly),
	guarded(make1984({ rollbackSurv: false })),
	guarded(shadow),
	guarded(cardinal),
	random
];

export function botByName(full: string): BotDef {
	const at = full.indexOf('@');
	if (at > 0) {
		const cap = Number(full.slice(at + 1));
		const inner = botByName(full.slice(0, at));
		return { ...inner, name: full, make: (seed) => { const t = inner.make(seed); return (s) => { rosterLimit.cap = cap; try { t(s); } finally { rosterLimit.cap = Infinity; } }; } };
	}
	const name = full;
	if (name.startsWith('honest-ci')) return guarded(honestCI(Number(name.slice(9))));
	if (name.startsWith('dirty-fake-')) return guarded(makeDirty(name.slice(11) as FakeMode));
	const b = BOTS.find((x) => x.name === name);
	if (!b) throw new Error('unknown bot ' + name);
	return b;
}

export type { BotTurn, Agent };
