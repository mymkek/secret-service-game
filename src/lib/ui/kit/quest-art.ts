import type { IllustrationName } from './Illustration.svelte';

/** Единственное место, где questId сопоставляется с иллюстрацией. Неизвестные квесты получают «папку дела». */
const QUEST_ART: Record<string, IllustrationName> = {
	hearings: 'hearings',
	journalist: 'journalist',
	blogger_docs: 'journalist',
	senator_secret: 'senator',
	evacuation: 'evacuation',
	director_questioning: 'director',
	informant: 'informant',
	// дилеммы и линейка (D-067)
	dilemma_valuable_source: 'informant',
	dilemma_source_crime: 'informant',
	dilemma_forced_confession: 'director',
	dilemma_sting: 'sting',
	dilemma_quiet_signal: 'signal',
	dilemma_share_with_cia: 'cia',
	dilemma_fudged_warrant: 'warrant',
	dilemma_cover_life: 'mask',
	dilemma_election_dossier: 'election',
	vanguard_offer: 'vanguard',
	vanguard_stage2: 'vanguard',
	vanguard_stage3: 'vanguard',
	vanguard_stage4: 'vanguard',
	vanguard_result: 'vanguard'
};

export const questArt = (questId: string): IllustrationName => QUEST_ART[questId] ?? 'case';
