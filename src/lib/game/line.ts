// Линейка «Народный авангард» (§9.9, D-067): предложение, 4 этапа с паузами, ключевая дилемма этапа 3,
// награды и провал. Окна — квест-сессии vanguard_*; таймеры этапов — шаг 2 дня (tickLine).
import { BALANCE as B } from './balance';
import { hasPerk, setLoyalty } from './agents';
import {
	addBudget,
	addExposure,
	addInfluence,
	addReputation,
	agentById,
	aliveRivals,
	dirtyExposureMult,
	log,
	markDirty,
	month,
	removeAgent,
	setIdle
} from './effects';
import { clamp } from './formulas';
import { recordHighProfile } from './ops';
import { closeQuest, hasOpenQuest, openQuest } from './quest-core';
import { pickOne, pickWeightedIndex, randInt, roll } from './rng';
import { riskLevel, scheduleDelayed } from './dilemma-state';
import { US_STATES } from './geo';
import type { DilemmaChoice } from './dilemmas';
import type { Agent, GameState, LineState, QuestSession } from './types';

type StageKey = keyof typeof B.LINE_STAGE_BASE;

/** Навык линейки: max(слежка, допрос) (§9.9). */
export function lineSkill(a: Agent): number {
	return Math.max(a.skills.surveillance, a.skills.interrogation);
}

/** Может ли агент вести линейку: свободен и навык ≥ LINE_MIN_SKILL. */
export function canLeadLine(a: Agent): boolean {
	return a.status === 'idle' && lineSkill(a) >= B.LINE_MIN_SKILL;
}

function stageKey(stage: number, variant: number | null): StageKey | null {
	if (stage === 1) return 's1';
	if (stage === 2) return variant === 1 ? 's2_devoted' : 's2_cautious';
	if (stage === 3) return variant === 1 ? 's3_provoke' : variant === 0 ? 's3_evidence' : null;
	if (stage === 4) return 's4';
	return null;
}

/** §9.9: шанс этапа для ведущего и наличия напарника. */
export function lineStageChance(lead: Agent, hasPartner: boolean, key: StageKey): number {
	return clamp(
		B.LINE_STAGE_BASE[key] +
			B.LINE_SKILL_COEF * (lineSkill(lead) - B.LINE_MIN_SKILL) +
			(hasPartner ? B.LINE_PARTNER_BONUS : 0) +
			(hasPerk(lead, 'cold_blooded') ? B.LINE_COLD_BLOODED_BONUS : 0),
		B.LINE_CHANCE_MIN,
		B.LINE_CHANCE_MAX
	);
}

function stageCost(stage: number): number {
	return B.LINE_STAGE_COST[stage - 1] ?? 0;
}

function embed(a: Agent): void {
	a.status = 'embedded';
	a.location = { lineId: 'vanguard' };
}

/** Агенты линейки возвращаются (если ещё в штате и всё ещё на линейке). */
function release(s: GameState, id: number | null, loyalty = 0): void {
	const a = id !== null ? agentById(s, id) : undefined;
	if (!a || !a.location || !('lineId' in a.location)) return;
	setIdle(a);
	if (loyalty) setLoyalty(a, a.loyalty + loyalty);
}

function endLine(s: GameState, outcome: string): void {
	s.line = null;
	s.lineNextOfferDay = s.day + B.LINE_COOLDOWN_DAYS;
	for (const q of s.quests.filter((x) => x.questId.startsWith('vanguard_stage'))) closeQuest(s, q.id);
	openQuest(s, 'vanguard_result', { outcome });
}

// ------------------------------------------------------------ предложение (§3.3 шаг 4)

/** Начало месяца: бросок предложения линейки. */
export function monthStartLineOffer(s: GameState): void {
	if (month(s) < B.LINE_MIN_MONTH || s.line !== null || s.day < s.lineNextOfferDay) return;
	if (hasOpenQuest(s, 'vanguard_offer')) return;
	if (roll(s, B.LINE_OFFER_CHANCE)) openQuest(s, 'vanguard_offer', { minSkill: B.LINE_MIN_SKILL });
}

// ------------------------------------------------------------ таймеры (шаг 2)

/** Шаг 2 дня: конец этапа (бросок), конец паузы (окно следующего этапа). */
export function tickLine(s: GameState): void {
	const L = s.line;
	if (!L) return;
	const lead = agentById(s, L.leadId);
	if (!lead || !lead.location || !('lineId' in lead.location)) {
		lineBroken(s, L);
		return;
	}
	// §9.9, D-068: напарник выбыл не по линейке — линейка идёт без него (без бонуса со следующего броска, без штрафа).
	if (L.partnerId !== null) {
		const partner = agentById(s, L.partnerId);
		if (!partner || !partner.location || !('lineId' in partner.location)) L.partnerId = null;
	}
	if (L.stageEndDay !== null && s.day >= L.stageEndDay) {
		L.stageEndDay = null;
		const key = stageKey(L.stage, L.stage === 2 ? L.variant2 : L.stage === 3 ? L.variant3 : null)!;
		const p = lineStageChance(lead, L.partnerId !== null, key);
		if (roll(s, p)) {
			log(s, 'line_stage_done', { stage: L.stage, chance: p });
			if (L.stage >= 4) lineSuccess(s, L);
			else L.pauseUntilDay = s.day + B.LINE_PAUSE_DAYS;
		} else lineFail(s, L, lead);
		return;
	}
	if (L.pauseUntilDay !== null && s.day >= L.pauseUntilDay) {
		L.pauseUntilDay = null;
		const next = L.stage + 1;
		openQuest(s, next === 2 ? 'vanguard_stage2' : next === 3 ? 'vanguard_stage3' : 'vanguard_stage4', { stage: next });
	}
}

function lineSuccess(s: GameState, L: LineState): void {
	const dirty = L.variant3 === 1;
	const R = dirty ? B.LINE_REWARD_DIRTY : B.LINE_REWARD_CLEAN;
	addBudget(s, R.money);
	s.plan.points += R.plan;
	addInfluence(s, R.influence);
	addReputation(s, R.rep);
	// «Громкий успех в случайном штате (§6.3)».
	const st = pickOne(s, US_STATES);
	if (st) recordHighProfile(s, st);
	s.history.linesCompleted += 1;
	if (dirty) {
		s.history.linesProvoked += 1;
		const [a, b] = B.LINE_PROVOKE.delayDays;
		scheduleDelayed(s, 'line_provoke', s.day + randInt(s, a, b));
	}
	release(s, L.leadId);
	release(s, L.partnerId);
	const variant = dirty ? 'provoke' : 'evidence';
	log(s, 'line_success', { variant, money: R.money, plan: R.plan });
	endLine(s, dirty ? 'success_dirty' : 'success_clean');
}

const FAIL_OUTCOMES = ['fled', 'killed', 'captured', 'turned'] as const;

function lineFail(s: GameState, L: LineState, lead: Agent): void {
	addExposure(s, B.LINE_FAIL_EXPOSURE);
	const W = B.LINE_FAIL_OUTCOMES as Record<string, number>;
	const outcome = FAIL_OUTCOMES[Math.max(0, pickWeightedIndex(s, FAIL_OUTCOMES.map((k) => W[k] ?? 0)))];
	let lost = 0;
	if (outcome === 'fled') release(s, lead.id, B.LINE_FLED_LOYALTY);
	else if (outcome === 'killed') {
		removeAgent(s, lead.id);
		addReputation(s, B.LINE_KILLED_REP);
		log(s, 'agent_killed', { agentId: lead.id });
		lost += 1;
	} else if (outcome === 'captured') {
		// «Обмен пленными» (§9.1) в v1 не реализован: пленный теряется.
		removeAgent(s, lead.id);
		log(s, 'agent_captured', { agentId: lead.id });
		lost += 1;
	} else {
		// Перевербован: возвращается с той же лояльностью −10, что и fled (D-068: иначе отличим),
		// но скрыто работает на случайного живого соперника; живых нет — просто fled.
		release(s, lead.id, B.LINE_FLED_LOYALTY);
		const r = pickOne(s, aliveRivals(s));
		lead.moleFor = r?.id ?? null;
	}
	if (L.partnerId !== null) {
		const partner = agentById(s, L.partnerId);
		if (partner) {
			if (outcome === 'killed' && roll(s, B.LINE_PARTNER_DEATH_CHANCE)) {
				removeAgent(s, partner.id);
				log(s, 'agent_killed', { agentId: partner.id });
				lost += 1;
			} else release(s, partner.id, B.LINE_FLED_LOYALTY);
		}
	}
	s.history.lineAgentsLost += lost;
	// Исход ведущего виден игроку только как «раскрыт/погиб/в плену»; перевербовку журнал не выдаёт.
	log(s, 'line_failed', { stage: L.stage, outcome: outcome === 'turned' ? 'fled' : outcome });
	endLine(s, outcome === 'turned' ? 'fail_fled' : `fail_${outcome}`);
}

/**
 * §9.9, D-068: ведущий выбыл не по линейке (переход к врагу, крот раскрыт, другое удаление) — срыв.
 * Засвеченность +LINE_FAIL_EXPOSURE, броска судьбы и броска этапа нет, напарник возвращается
 * с лояльностью LINE_FLED_LOYALTY, награды нет, откат LINE_COOLDOWN_DAYS. Не отзыв.
 */
function lineBroken(s: GameState, L: LineState): void {
	addExposure(s, B.LINE_FAIL_EXPOSURE);
	release(s, L.partnerId, B.LINE_FLED_LOYALTY);
	// Тот же вид журнала, что у провала этапа (текст контента подходит), outcome 'broken' — срыв.
	log(s, 'line_failed', { stage: L.stage, outcome: 'broken' });
	endLine(s, 'fail_broken');
}

/** Отозвать агентов (окно этапа или пауза): награды нет, откат LINE_COOLDOWN_DAYS. */
export function recallLine(s: GameState): string | null {
	const L = s.line;
	if (!L) return 'no_line';
	if (L.stageEndDay !== null) return 'line_stage_running';
	release(s, L.leadId);
	release(s, L.partnerId);
	log(s, 'line_recalled', { stage: L.stage });
	endLine(s, 'recalled');
	return null;
}

// ------------------------------------------------------------ окна

const ch = (id: string, ok: boolean, reason: string | null = null, extra: Partial<DilemmaChoice> = {}): DilemmaChoice => ({
	id,
	available: ok,
	reason: ok ? null : reason,
	...extra
});

function lineLead(s: GameState): Agent | undefined {
	return s.line ? agentById(s, s.line.leadId) : undefined;
}

/** Выборы окон линейки. В окне этапа — точный шанс этапа (§10.3) и метка скрытого риска. */
export function lineChoices(s: GameState, q: QuestSession): DilemmaChoice[] {
	const money = (n: number) => s.budget >= n;
	switch (q.questId) {
		case 'vanguard_offer': {
			if (q.stage === 'partner') {
				const leadId = Number(q.params.leadId);
				const lead = agentById(s, leadId);
				const leadOk = !!lead && canLeadLine(lead);
				const partners = s.agents.filter((a) => a.status === 'idle' && a.id !== leadId).map((a) => a.id);
				const cost = stageCost(1);
				const chance = (p: boolean) => (lead ? lineStageChance(lead, p, 's1') : 0);
				return [
					ch('alone', leadOk && money(cost), leadOk ? 'no_money' : 'agent_busy', { chance: chance(false) }),
					ch('partner', leadOk && money(cost) && partners.length > 0, !leadOk ? 'agent_busy' : !money(cost) ? 'no_money' : 'no_idle_agent', {
						chance: chance(true),
						needsAgent: true,
						agentIds: partners
					}),
					// Передумать на шаге выбора напарника (или ведущий уже занят) — как отказ.
					ch('decline', true)
				];
			}
			const leads = s.agents.filter(canLeadLine).map((a) => a.id);
			return [
				ch('decline', true),
				ch('start', leads.length > 0 && money(stageCost(1)), leads.length === 0 ? 'need_skill7' : 'no_money', { needsAgent: true, agentIds: leads })
			];
		}
		case 'vanguard_stage2': {
			const lead = lineLead(s);
			const p = !!s.line?.partnerId;
			const c = (k: StageKey) => (lead ? lineStageChance(lead, p, k) : 0);
			const ok = money(stageCost(2));
			return [ch('cautious', ok, 'no_money', { chance: c('s2_cautious') }), ch('devoted', ok, 'no_money', { chance: c('s2_devoted'), dirty: true }), ch('recall', true)];
		}
		case 'vanguard_stage3': {
			const lead = lineLead(s);
			const p = !!s.line?.partnerId;
			const c = (k: StageKey) => (lead ? lineStageChance(lead, p, k) : 0);
			const ok = money(stageCost(3));
			return [
				ch('evidence', ok, 'no_money', { chance: c('s3_evidence') }),
				ch('provoke', ok, 'no_money', { chance: c('s3_provoke'), dirty: true, risk: riskLevel(B.LINE_PROVOKE.exposeChance) }),
				ch('quiet', true),
				ch('recall', true)
			];
		}
		case 'vanguard_stage4': {
			const lead = lineLead(s);
			return [ch('go', money(stageCost(4)), 'no_money', { chance: lead ? lineStageChance(lead, !!s.line?.partnerId, 's4') : 0 }), ch('recall', true)];
		}
		case 'vanguard_result':
			return [ch('ok', true)];
		default:
			return [];
	}
}

function startStage(s: GameState, stage: number, days: number): void {
	const L = s.line!;
	addBudget(s, -stageCost(stage));
	L.stage = stage;
	L.stageEndDay = s.day + days;
	L.pauseUntilDay = null;
}

/** Применяет выбор окна линейки. true — сессия закрыта. param — агент (ведущий или напарник). */
export function applyLineChoice(s: GameState, q: QuestSession, choice: string, param: number | null): boolean {
	const D = B.LINE_STAGE_DAYS;
	switch (q.questId) {
		case 'vanguard_offer': {
			if (choice === 'decline') {
				s.lineNextOfferDay = s.day + B.LINE_DECLINE_COOLDOWN_DAYS;
				return true;
			}
			if (choice === 'start') {
				q.params.leadId = param ?? s.agents.find(canLeadLine)!.id;
				q.stage = 'partner';
				return false;
			}
			const lead = agentById(s, Number(q.params.leadId))!;
			const partner = choice === 'partner' ? agentById(s, param ?? s.agents.find((a) => a.status === 'idle' && a.id !== lead.id)!.id) : undefined;
			embed(lead);
			if (partner) embed(partner);
			s.line = {
				stage: 1,
				variant2: null,
				variant3: null,
				leadId: lead.id,
				partnerId: partner?.id ?? null,
				startedDay: s.day,
				stageEndDay: null,
				pauseUntilDay: null
			};
			startStage(s, 1, D[0]);
			s.history.linesStarted += 1;
			log(s, 'line_started', { agentId: lead.id, partnerId: partner?.id ?? null });
			return true;
		}
		case 'vanguard_stage2':
		case 'vanguard_stage3':
		case 'vanguard_stage4': {
			if (!s.line) return true;
			if (choice === 'recall') {
				closeQuest(s, q.id);
				recallLine(s);
				return true;
			}
			const L = s.line;
			if (q.questId === 'vanguard_stage2') {
				L.variant2 = choice === 'devoted' ? 1 : 0;
				if (choice === 'devoted') {
					markDirty(s);
					addExposure(s, B.LINE_DEVOTED_EXPOSURE * dirtyExposureMult(s));
					s.history.lineCrimes += 1;
				}
				startStage(s, 2, D[1]);
			} else if (q.questId === 'vanguard_stage3') {
				if (choice === 'quiet') {
					L.variant3 = 2;
					closeQuest(s, q.id);
					addBudget(s, B.LINE_QUIET.money);
					s.plan.points += B.LINE_QUIET.plan;
					release(s, L.leadId);
					release(s, L.partnerId);
					log(s, 'line_quiet', { money: B.LINE_QUIET.money, plan: B.LINE_QUIET.plan });
					endLine(s, 'quiet');
					return true;
				}
				L.variant3 = choice === 'provoke' ? 1 : 0;
				if (choice === 'provoke') markDirty(s);
				startStage(s, 3, D[2]);
			} else startStage(s, 4, D[3]);
			return true;
		}
		case 'vanguard_result':
			return true;
	}
	return true;
}
