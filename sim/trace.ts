// Трассировка одной партии помесячно: npx tsx sim/trace.ts <bot> <seed> [--set KEY=JSON] [--scenario late] [--events kind1,kind2]
import { BALANCE, advance, createGame, selectForecast } from '../src/lib/game/index';
import { botByName } from './bots';
import { SCENARIOS } from './scenarios';

const [botName, seed, ...rest] = process.argv.slice(2);
let events: string[] = [];
let scenario: string | null = null;
for (let i = 0; i < rest.length; i++) {
	if (rest[i] === '--set') {
		const v = rest[++i];
		const eq = v.indexOf('=');
		(BALANCE as Record<string, unknown>)[v.slice(0, eq)] = JSON.parse(v.slice(eq + 1));
	} else if (rest[i] === '--events') events = rest[++i].split(',');
	else if (rest[i] === '--scenario') scenario = rest[++i];
}
const s = createGame({ seed });
if (scenario) SCENARIOS[scenario](s);
const bot = botByName(botName).make(seed);
let lastId = 0;
let spentOps = 0;
while (s.outcome.status === 'active') {
	const b0 = s.budget;
	bot(s);
	spentOps += b0 - s.budget;
	const before = s.day;
	advance(s, 3, { ignorePause: true });
	for (const e of s.log) {
		if (e.id <= lastId) continue;
		if (events.includes(e.kind) || events.includes('*')) console.log(`  d${e.day} ${e.kind} ${JSON.stringify(e.data)}`);
	}
	lastId = s.log.at(-1)?.id ?? lastId;
	if (Math.floor(s.day / 30) > Math.floor(before / 30) && s.day % 30 === 0) {
		const f = selectForecast(s);
		const mm = s.log.filter((e) => e.kind === 'month_money').at(-1)?.data ?? {};
		console.log(
			`M${s.day / 30} bud ${s.budget} inc ${mm.income} exp ${mm.expenses} botSpend ${spentOps} | ag ${s.agents.length} idle ${s.agents.filter((a) => a.status === 'idle').length} | rep ${s.reputation.toFixed(0)} inf ${s.influence.toFixed(0)} E ${s.exposure.toFixed(0)} inv ${s.investigation.toFixed(0)} U ${s.unrest.toFixed(0)} ctl ${s.control.toFixed(0)} | share ${s.share.toFixed(3)} plan ${s.plan.points}/${s.plan.target} hist ${s.plan.ratioHistory.slice(-1).map((x) => x.toFixed(2))} | dept ${Object.values(s.departments).join('')} surv ${s.survLevel} repr ${s.reprLevel} tech ${s.techs.join('')}${s.research ? '+' + s.research.techId : ''} | net ${Object.values(s.networks).map((n) => n.level + ':' + n.agentIds.length).join(' ')} komp ${s.kompromat.length} lead ${s.leaders.map((l) => l.influence.toFixed(0)).join(',')} | rivals ${s.rivals.map((r) => (r.alive ? r.reputation.toFixed(0) + '/' + r.share.toFixed(2) : 'X')).join(' ')} fnet ${f.net}`
		);
		spentOps = 0;
	}
}
console.log('OUTCOME', JSON.stringify(s.outcome));
