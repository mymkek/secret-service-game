import { advance, createGame } from '../src/lib/game/index';
const s = createGame({ seed: 'repro-rival-zero' });
advance(s, 89, { ignorePause: true });
const p = s.rivals.find((r) => r.id === 'police')!;
p.reputation = 0; // как после пачки сливов в последний день квартала
advance(s, 1, { ignorePause: true }); // день 90: конец месяца 3 = конец квартала
console.log('day', s.day, 'police alive', p.alive, 'rep', p.reputation.toFixed(2), 'outcome', s.outcome.status);
