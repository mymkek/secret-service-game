<script lang="ts" module>
	export type IllustrationName =
		| 'case'
		| 'chance'
		| 'report'
		| 'election'
		| 'victory'
		| 'defeat'
		| 'result'
		| 'menu'
		| 'hearings'
		| 'journalist'
		| 'senator'
		| 'evacuation'
		| 'director'
		| 'informant'
	| 'sting'
	| 'signal'
	| 'cia'
	| 'warrant'
	| 'mask'
	| 'vanguard';

	/** Цвет подложки по смыслу сцены. */
	const TONE: Record<IllustrationName, string> = {
		case: 'var(--color-fbi)',
		chance: 'var(--color-violet)',
		report: 'var(--color-cyan)',
		election: 'var(--color-fbi)',
		victory: 'var(--color-gold)',
		defeat: 'var(--color-danger)',
		result: 'var(--color-gold)',
		menu: 'var(--color-fbi)',
		hearings: 'var(--color-fbi)',
		journalist: 'var(--color-cyan)',
		senator: 'var(--color-violet)',
		evacuation: 'var(--color-coral)',
		director: 'var(--color-mossad)',
		informant: 'var(--color-usss)',
		sting: 'var(--color-danger)',
		signal: 'var(--color-cyan)',
		cia: 'var(--color-cia)',
		warrant: 'var(--color-mossad)',
		mask: 'var(--color-violet)',
		vanguard: 'var(--color-coral)'
	};
</script>

<script lang="ts">
	let { name, size = 144, class: cls = '' }: { name: IllustrationName; size?: number; class?: string } = $props();
</script>

<!-- Иллюстрации нарисованы в палитре игры: цвета берутся из CSS-переменных темы. Декоративные (aria-hidden). -->
<svg width={size} height={size} viewBox="0 0 160 160" class="shrink-0 {cls}" aria-hidden="true" style="--a:{TONE[name]}">
	<defs>
		<linearGradient id="il-bg" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" style="stop-color:var(--a);stop-opacity:0.55" />
			<stop offset="1" style="stop-color:var(--color-surface-1)" />
		</linearGradient>
		<linearGradient id="il-gold" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" style="stop-color:var(--color-gold-bright)" />
			<stop offset="1" style="stop-color:var(--color-gold)" />
		</linearGradient>
		<linearGradient id="il-light" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" style="stop-color:var(--color-gold-bright);stop-opacity:0.55" />
			<stop offset="1" style="stop-color:var(--color-gold-bright);stop-opacity:0" />
		</linearGradient>
		<radialGradient id="il-glow" cx="0.5" cy="0.45" r="0.55">
			<stop offset="0" style="stop-color:var(--a);stop-opacity:0.55" />
			<stop offset="1" style="stop-color:var(--a);stop-opacity:0" />
		</radialGradient>
	</defs>
	<rect x="4" y="4" width="152" height="152" rx="38" fill="url(#il-bg)" />
	<rect x="4" y="4" width="152" height="152" rx="38" fill="none" class="stroke-white/10" stroke-width="1.5" />
	<circle cx="80" cy="76" r="62" fill="url(#il-glow)" />

	{#if name === 'case'}
		<!-- Папка дела -->
		<g transform="rotate(-7 80 80)"><rect x="42" y="38" width="70" height="66" rx="7" class="fill-ink/90" /></g>
		<g transform="rotate(5 80 80)"><rect x="48" y="34" width="70" height="66" rx="7" class="fill-muted" /></g>
		<path d="M28 62a9 9 0 0 1 9-9h26l9 10h51a9 9 0 0 1 9 9v46a9 9 0 0 1-9 9H37a9 9 0 0 1-9-9z" fill="url(#il-gold)" />
		<path d="M28 78h104v38a9 9 0 0 1-9 9H37a9 9 0 0 1-9-9z" class="fill-black/15" />
		<rect x="44" y="92" width="44" height="5" rx="2.500" class="fill-black/30" />
		<rect x="44" y="103" width="30" height="5" rx="2.500" class="fill-black/30" />
		<g transform="rotate(-14 112 104)"><circle cx="112" cy="104" r="15" class="fill-danger/20 stroke-danger" stroke-width="3" /><path d="m105 104 5 5 9-10" fill="none" class="stroke-danger" stroke-width="3.500" stroke-linecap="round" stroke-linejoin="round" /></g>
	{:else if name === 'chance'}
		<!-- Карточка шанса и кубик -->
		<g transform="rotate(-14 66 84)"><rect x="34" y="36" width="64" height="88" rx="10" class="fill-ink" /><rect x="40" y="42" width="52" height="76" rx="6" class="fill-surface-3" /><path d="M66 66l10 14-10 14-10-14z" fill="url(#il-gold)" /></g>
		<g transform="rotate(10 104 98)"><rect x="80" y="74" width="48" height="48" rx="12" fill="url(#il-gold)" /><circle cx="94" cy="88" r="4.500" class="fill-surface-1" /><circle cx="114" cy="88" r="4.500" class="fill-surface-1" /><circle cx="104" cy="98" r="4.500" class="fill-surface-1" /><circle cx="94" cy="108" r="4.500" class="fill-surface-1" /><circle cx="114" cy="108" r="4.500" class="fill-surface-1" /></g>
		<path d="M122 36l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" class="fill-gold-bright" />
	{:else if name === 'report'}
		<!-- Квартальный отчёт -->
		<rect x="40" y="26" width="80" height="108" rx="12" class="fill-ink" />
		<rect x="62" y="20" width="36" height="16" rx="8" class="fill-surface-3" />
		<rect x="50" y="48" width="60" height="5" rx="2.500" class="fill-surface-3/60" />
		<rect x="52" y="104" width="12" height="18" rx="3" fill="url(#il-gold)" />
		<rect x="70" y="90" width="12" height="32" rx="3" class="fill-fbi" />
		<rect x="88" y="76" width="12" height="46" rx="3" class="fill-ok" />
		<path d="m52 80 18-14 18 6 20-18" fill="none" class="stroke-surface-3" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
		<circle cx="118" cy="118" r="17" class="fill-ok" /><path d="m110 118 6 6 11-12" fill="none" class="stroke-white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
	{:else if name === 'election'}
		<!-- Урна для голосования -->
		<g transform="rotate(-8 80 50)"><rect x="56" y="22" width="48" height="60" rx="5" class="fill-ink" /><path d="M80 36l3.500 7 7.500 1-5.500 5 1.500 7.500-7-4-7 4 1.500-7.500-5.500-5 7.500-1z" fill="url(#il-gold)" /></g>
		<path d="M38 84h84l-9 46a8 8 0 0 1-8 6H55a8 8 0 0 1-8-6z" class="fill-fbi" />
		<path d="M38 84h84l-2.500 12H40.500z" class="fill-white/20" />
		<rect x="58" y="82" width="44" height="7" rx="3.500" class="fill-surface-1" />
		<path d="M80 108l5 10-5 10-5-10z" fill="url(#il-gold)" />
	{:else if name === 'victory'}
		<!-- Кубок -->
		<g class="stroke-gold-bright/50" stroke-width="3" stroke-linecap="round">
			<path d="M80 14v14M30 40l10 10M130 40l-10 10M16 82h14M130 82h14" />
		</g>
		<path d="M50 46H34v10a22 22 0 0 0 22 22M110 46h16v10a22 22 0 0 1-22 22" fill="none" stroke="url(#il-gold)" stroke-width="7" stroke-linecap="round" />
		<path d="M50 38h60v34a30 30 0 0 1-60 0z" fill="url(#il-gold)" />
		<path d="M58 42h12v36a30 30 0 0 1-12-10z" class="fill-white/30" />
		<rect x="73" y="100" width="14" height="16" class="fill-gold" />
		<rect x="56" y="114" width="48" height="14" rx="5" fill="url(#il-gold)" />
		<path d="M80 50l4.500 9 10 1.500-7.200 7 1.700 10-9-4.700-9 4.700 1.700-10-7.200-7 10-1.500z" class="fill-surface-1/70" />
	{:else if name === 'defeat'}
		<!-- Расколотый щит -->
		<path d="M80 22l42 16v34c0 28-18 48-42 62-24-14-42-34-42-62V38z" class="fill-surface-3" />
		<path d="M80 22l42 16v34c0 28-18 48-42 62-24-14-42-34-42-62V38z" fill="none" class="stroke-danger" stroke-width="5" stroke-linejoin="round" />
		<path d="M80 22l-8 28 14 14-12 18 10 16-4 18" fill="none" class="stroke-danger" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
		<path d="M97 70l9 9M98 79l-9 9" class="stroke-muted" stroke-width="4" stroke-linecap="round" />
		<path d="M52 66l9 9M61 66l-9 9" class="stroke-muted" stroke-width="4" stroke-linecap="round" />
		<circle cx="126" cy="132" r="3" class="fill-danger/60" /><circle cx="36" cy="126" r="2.500" class="fill-danger/60" />
	{:else if name === 'result'}
		<!-- Документ с печатью -->
		<g transform="rotate(-5 80 80)"><rect x="40" y="26" width="80" height="108" rx="10" class="fill-ink" />
		<rect x="52" y="44" width="56" height="5" rx="2.500" class="fill-surface-3/60" /><rect x="52" y="58" width="56" height="5" rx="2.500" class="fill-surface-3/60" /><rect x="52" y="72" width="38" height="5" rx="2.500" class="fill-surface-3/60" /></g>
		<g transform="rotate(-16 104 108)"><circle cx="104" cy="108" r="24" class="fill-gold/15 stroke-gold" stroke-width="4" /><circle cx="104" cy="108" r="17" fill="none" class="stroke-gold" stroke-width="1.500" /><path d="M104 96l3.500 7 7.500 1-5.500 5 1.500 7.500-7-4-7 4 1.500-7.500-5.500-5 7.500-1z" class="fill-gold" /></g>
	{:else if name === 'menu'}
		<!-- Эмблема ведомства -->
		<circle cx="80" cy="80" r="50" class="fill-surface-3" />
		<circle cx="80" cy="80" r="50" fill="none" stroke="url(#il-gold)" stroke-width="5" />
		<circle cx="80" cy="80" r="40" fill="none" class="stroke-gold/40" stroke-width="1.500" stroke-dasharray="3 5" />
		<path d="M80 46l28 11v22c0 18-12 31-28 39-16-8-28-21-28-39V57z" class="fill-fbi" />
		<path d="M80 62l5.500 11 12 1.800-8.700 8.400 2 12-10.800-5.700-10.800 5.700 2-12-8.700-8.400 12-1.800z" fill="url(#il-gold)" />
	{:else if name === 'hearings'}
		<!-- Капитолий и молоток -->
		<path d="M80 18v12" class="stroke-gold-bright" stroke-width="3" stroke-linecap="round" />
		<path d="M54 64a26 24 0 0 1 52 0z" fill="url(#il-gold)" />
		<rect x="70" y="30" width="20" height="10" rx="4" class="fill-ink" />
		<rect x="36" y="64" width="88" height="8" rx="3" class="fill-ink" />
		<path d="M44 72h72v6H44z" class="fill-muted" />
		<g class="fill-ink"><rect x="48" y="78" width="9" height="34" rx="2" /><rect x="64" y="78" width="9" height="34" rx="2" /><rect x="87" y="78" width="9" height="34" rx="2" /><rect x="103" y="78" width="9" height="34" rx="2" /></g>
		<rect x="38" y="112" width="84" height="8" rx="3" class="fill-muted" /><rect x="30" y="120" width="100" height="10" rx="3" class="fill-ink" />
		<g transform="rotate(-35 118 128)"><rect x="100" y="112" width="34" height="18" rx="5" fill="url(#il-gold)" /><rect x="114" y="128" width="6" height="22" rx="3" class="fill-gold" /></g>
	{:else if name === 'journalist'}
		<!-- Газета и микрофон -->
		<g transform="rotate(-6 70 84)"><rect x="26" y="34" width="86" height="104" rx="10" class="fill-ink" />
		<rect x="36" y="46" width="66" height="14" rx="3" class="fill-surface-3" />
		<rect x="36" y="68" width="34" height="30" rx="4" class="fill-fbi" /><path d="m36 98 12-12 8 8 6-6 8 10z" class="fill-white/40" />
		<rect x="76" y="68" width="26" height="4" rx="2" class="fill-surface-3/60" /><rect x="76" y="78" width="26" height="4" rx="2" class="fill-surface-3/60" /><rect x="76" y="88" width="26" height="4" rx="2" class="fill-surface-3/60" />
		<rect x="36" y="106" width="66" height="4" rx="2" class="fill-surface-3/60" /><rect x="36" y="116" width="50" height="4" rx="2" class="fill-surface-3/60" /></g>
		<rect x="108" y="40" width="26" height="42" rx="13" fill="url(#il-gold)" />
		<path d="M102 70a19 19 0 0 0 38 0M121 89v20M108 109h26" fill="none" class="stroke-gold-bright" stroke-width="5" stroke-linecap="round" />
	{:else if name === 'senator'}
		<!-- Силуэт сенатора -->
		<g class="fill-gold-bright"><path d="M80 18l3 6.500 7 1-5 5 1.200 7-6.200-3.300-6.200 3.300 1.200-7-5-5 7-1z" /></g>
		<circle cx="80" cy="66" r="21" class="fill-ink" />
		<path d="M64 60c2-12 30-14 32 0-8-4-24-4-32 0z" class="fill-muted" />
		<path d="M28 138c0-26 22-42 52-42s52 16 52 42z" class="fill-surface-3" />
		<path d="M80 96l-16 8 12 34h8l12-34z" class="fill-ink" />
		<path d="M80 100l7 7-4 6 6 20h-18l6-20-4-6z" fill="url(#il-gold)" />
		<path d="M64 104L50 138h14l8-30zM96 104l14 34H96l-8-30z" class="fill-black/25" />
		<circle cx="106" cy="118" r="4" class="fill-danger" />
	{:else if name === 'evacuation'}
		<!-- Дверь и бегущий агент -->
		<rect x="88" y="26" width="48" height="96" rx="6" class="fill-surface-1" />
		<rect x="88" y="26" width="48" height="96" rx="6" fill="none" class="stroke-ink" stroke-width="4" />
		<path d="M92 30l26 8v76l-26 6z" fill="url(#il-gold)" />
		<path d="M118 38v76l14 6V30z" class="fill-gold-bright/30" />
		<circle cx="58" cy="52" r="10" class="fill-ink" />
		<path d="M60 64l-6 22-14 12M54 86l12 10 4 20M60 66l16 8M58 68l-14-6" fill="none" class="stroke-ink" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
		<path d="M22 80h-8M26 94h-12M22 66h-8" class="stroke-coral" stroke-width="3.500" stroke-linecap="round" />
		<path d="M24 134h112" class="stroke-white/20" stroke-width="3" stroke-linecap="round" />
	{:else if name === 'director'}
		<!-- Допрос под лампой -->
		<path d="M80 6v22" class="stroke-muted" stroke-width="3" stroke-linecap="round" />
		<path d="M62 44a18 14 0 0 1 36 0z" class="fill-ink" /><rect x="58" y="42" width="44" height="6" rx="3" class="fill-muted" />
		<path d="M64 50h32l24 82H40z" fill="url(#il-light)" />
		<circle cx="52" cy="98" r="11" class="fill-surface-1" /><path d="M32 134c0-14 8-24 20-24s20 10 20 24z" class="fill-surface-1" />
		<circle cx="108" cy="98" r="11" class="fill-surface-3" /><path d="M88 134c0-14 8-24 20-24s20 10 20 24z" class="fill-surface-3" />
		<rect x="30" y="118" width="100" height="10" rx="4" fill="url(#il-gold)" />
		<rect x="38" y="127" width="8" height="22" rx="2" class="fill-gold" /><rect x="114" y="127" width="8" height="22" rx="2" class="fill-gold" />
		<rect x="62" y="108" width="34" height="11" rx="2" class="fill-ink" />
	{:else if name === 'informant'}
		<!-- Человек в капюшоне и сообщение -->
		<path d="M80 42c-20 0-32 16-32 36v6c0 6-12 14-16 20 0 18 20 28 48 28s48-10 48-28c-4-6-16-14-16-20v-6c0-20-12-36-32-36z" class="fill-surface-3" />
		<ellipse cx="80" cy="82" rx="19" ry="22" class="fill-surface-1" />
		<circle cx="72" cy="80" r="2.500" class="fill-gold-bright" /><circle cx="88" cy="80" r="2.500" class="fill-gold-bright" />
		<path d="M32 104c4 4 12 6 16 8" fill="none" class="stroke-white/15" stroke-width="3" stroke-linecap="round" />
		<path d="M104 22h38a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8h-18l-12 10V60h-8a8 8 0 0 1-8-8V30a8 8 0 0 1 8-8z" fill="url(#il-gold)" />
		<circle cx="112" cy="41" r="3.500" class="fill-surface-1" /><circle cx="124" cy="41" r="3.500" class="fill-surface-1" /><circle cx="136" cy="41" r="3.500" class="fill-surface-1" />
	{:else if name === 'sting'}
		<!-- Приманка: конверт с деньгами в ловушке -->
		<path d="M30 118h100" class="stroke-white/20" stroke-width="3" stroke-linecap="round" />
		<rect x="46" y="64" width="68" height="44" rx="6" class="fill-ink" />
		<path d="m46 70 34 24 34-24" fill="none" class="stroke-surface-3" stroke-width="3.500" stroke-linejoin="round" />
		<circle cx="80" cy="92" r="11" fill="url(#il-gold)" /><path d="M80 86v12M76 90h6a3 3 0 0 1 0 6h-6" fill="none" class="stroke-surface-1" stroke-width="2.500" stroke-linecap="round" />
		<path d="M38 64l10-22 12 14 12-26 8 24 12-18 10 22" fill="none" class="stroke-danger" stroke-width="4.500" stroke-linecap="round" stroke-linejoin="round" />
		<path d="M110 40l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" class="fill-gold-bright" />
	{:else if name === 'signal'}
		<!-- Радиоперехват: антенна и волны -->
		<path d="M80 62v62M62 124h36" class="stroke-ink" stroke-width="7" stroke-linecap="round" />
		<circle cx="80" cy="54" r="9" fill="url(#il-gold)" />
		<path d="M60 40a28 28 0 0 0 0 28M100 40a28 28 0 0 1 0 28" fill="none" class="stroke-gold-bright" stroke-width="5" stroke-linecap="round" />
		<path d="M46 30a48 48 0 0 0 0 48M114 30a48 48 0 0 1 0 48" fill="none" class="stroke-gold-bright/60" stroke-width="5" stroke-linecap="round" />
		<rect x="32" y="102" width="40" height="28" rx="6" class="fill-surface-3" /><path d="M38 116h6l3-8 5 14 4-9h8" fill="none" class="stroke-ok" stroke-width="2.500" stroke-linecap="round" stroke-linejoin="round" />
		<circle cx="118" cy="116" r="12" class="fill-danger/25 stroke-danger" stroke-width="3" /><path d="M118 110v7M118 121v1" class="stroke-danger" stroke-width="3.500" stroke-linecap="round" />
	{:else if name === 'cia'}
		<!-- Рукопожатие через папку: розетка ЦРУ -->
		<circle cx="80" cy="78" r="46" class="fill-surface-3" />
		<circle cx="80" cy="78" r="46" fill="none" stroke="url(#il-gold)" stroke-width="4" />
		<path d="M80 40l8 34 34 6-34 8-8 34-8-34-34-8 34-6z" class="fill-cia" />
		<path d="M80 54l4 20 20 4-20 5-4 20-4-20-20-5 20-4z" fill="url(#il-gold)" />
		<rect x="40" y="124" width="80" height="14" rx="5" class="fill-ink" /><rect x="48" y="129" width="40" height="4" rx="2" class="fill-surface-3" />
	{:else if name === 'warrant'}
		<!-- Ордер с исправленной датой -->
		<g transform="rotate(-4 80 80)"><rect x="38" y="24" width="84" height="112" rx="10" class="fill-ink" />
		<rect x="50" y="38" width="60" height="8" rx="4" fill="url(#il-gold)" />
		<rect x="50" y="56" width="60" height="5" rx="2.500" class="fill-surface-3/60" /><rect x="50" y="68" width="44" height="5" rx="2.500" class="fill-surface-3/60" />
		<rect x="50" y="84" width="38" height="12" rx="3" class="fill-danger/25" /><path d="M52 90h34" class="stroke-danger" stroke-width="3" stroke-linecap="round" />
		<text x="92" y="95" class="fill-warn" font-size="11" font-weight="700">12.03</text>
		<path d="M50 120c8-8 12 4 20-2s10-6 16-2" fill="none" class="stroke-surface-3" stroke-width="2.500" stroke-linecap="round" /></g>
		<g transform="rotate(-16 108 112)"><circle cx="108" cy="112" r="20" class="fill-mossad/25 stroke-mossad" stroke-width="3.500" /><path d="M99 112l6 6 12-12" fill="none" class="stroke-mossad" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" /></g>
	{:else if name === 'mask'}
		<!-- Маска и сердце -->
		<path d="M32 50c14-8 30-10 48-4 18-6 34-4 48 4 2 30-8 52-48 70-40-18-50-40-48-70z" class="fill-surface-3" />
		<path d="M32 50c14-8 30-10 48-4 18-6 34-4 48 4 2 30-8 52-48 70-40-18-50-40-48-70z" fill="none" stroke="url(#il-gold)" stroke-width="4" stroke-linejoin="round" />
		<path d="M48 70c6-6 16-6 22 0-6 6-16 6-22 0zM90 70c6-6 16-6 22 0-6 6-16 6-22 0z" class="fill-ink" />
		<path d="M64 98c10 8 22 8 32 0" fill="none" class="stroke-ink" stroke-width="4" stroke-linecap="round" />
		<path d="M124 108c-8-8-16 2-8 10l8 8 8-8c8-8 0-18-8-10z" class="fill-danger" />
	{:else if name === 'vanguard'}
		<!-- Знамя движения и силуэты -->
		<path d="M44 28v104" class="stroke-ink" stroke-width="6" stroke-linecap="round" />
		<path d="M48 30h62l-12 20 12 20H48z" class="fill-coral" />
		<path d="M60 40l4 8 9 1-6.500 6 1.500 9-8-4-8 4 1.500-9-6.500-6 9-1z" fill="url(#il-gold)" />
		<g class="fill-surface-3"><circle cx="70" cy="100" r="10" /><path d="M54 138c0-14 7-24 16-24s16 10 16 24z" /><circle cx="104" cy="104" r="9" /><path d="M90 138c0-12 6-21 14-21s14 9 14 21z" /></g>
		<circle cx="118" cy="48" r="13" class="fill-ink" /><path d="M112 48h12M118 42v12" class="stroke-gold-bright" stroke-width="2.500" stroke-linecap="round" />
	{/if}
</svg>
