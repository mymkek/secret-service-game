// Идентификаторы мира. Это не числа баланса, а словарь сущностей: названия и
// веса дел даёт контент (content-schema.ts → StateContent), ядру нужны только id.

/** 50 штатов США, коды USPS. Порядок фиксирован — от него зависит порядок вызовов RNG. */
export const US_STATES = [
	'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
	'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
	'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
	'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
	'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
] as const;

/** Id сенаторов бюджетного комитета (§8.5). Число — BUDGET_COMMITTEE_SIZE. */
export function senatorIds(count: number): string[] {
	const ids: string[] = [];
	for (let i = 1; i <= count; i++) ids.push(`senator_${i}`);
	return ids;
}
