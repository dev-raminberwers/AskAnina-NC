<template>
	<!-- Ben je er niet? Dan een bescheiden regel: het gaat over mensen elders. -->
	<div v-if="!benJeEr" class="pa-feest pa-feest--klein" :style="{ '--pa-feestkleur': kleur }">
		<span class="pa-feest__vlaggen">{{ vlaggen }}</span>
		<div class="pa-feest__wat">
			<div class="pa-feest__titel">{{ titel }}</div>
			<div class="pa-feest__sub">{{ t('Public holiday in %s', landenTekst) }}</div>
		</div>
		<button v-if="magFeliciteren" type="button" class="knop stil" @click="$emit('feliciteren', regel)">
			{{ t('Send greetings') }}
		</button>
	</div>

	<!-- Ben je er wel, dan raakt de dag je eigen agenda: een kaart met de gloed van de gelegenheid. -->
	<div v-else class="kaart pa-feest" :style="{ '--pa-feestkleur': kleur }">
		<div class="pa-feest__gloed"></div>
		<div class="pa-feest__kop">
			<span class="pa-feest__vlaggen">{{ vlaggen }}</span>
			<span class="pa-feest__titel">{{ titel }}</span>
		</div>
		<div class="pa-feest__groot">
			<span class="pa-feest__heledag">{{ t('All day') }}</span>
			<span class="pa-feest__sub">{{ landenTekst }}</span>
		</div>
		<div class="pa-feest__voet">
			<span class="pa-feest__sub">{{ werkblokUit ? t('No work block today') : t('Your work block stays as it is') }}</span>
			<button v-if="magFeliciteren" type="button" class="knop stil" @click="$emit('feliciteren', regel)">
				{{ t('Send greetings') }}
			</button>
		</div>
	</div>
</template>

<script>
import { t } from '../../l10n/index.js'

/**
 * Een feestdag is geen afspraak (Ramin, 26-09: *"De feestdag moet vrolijk zijn"*).
 *
 * Geen DONE, geen prullenbak, geen wekker — er valt niets af te vinken aan een dag. Overgezet uit
 * `ui/today/FeestdagKaart.kt`, met dezelfde twee vormen: ben je in een van die landen, dan raakt de dag
 * je eigen agenda en krijgt hij een hele kaart; ben je er niet, dan is het een bescheiden regel over
 * mensen elders.
 *
 * De knop "feliciteren" staat er alleen als de server zegt dat het mag — een klant feliciteren met een
 * herdenking is erger dan niets sturen.
 */
export default {
	name: 'FeestdagKaart',
	props: {
		/** De regel met soort 'feestdag' zoals de server hem levert. */
		regel: { type: Object, required: true },
	},
	emits: ['feliciteren'],
	computed: {
		inhoud() { return this.regel.inhoud || {} },
		titel() { return this.inhoud.titel || '' },
		benJeEr() { return !!this.inhoud.benJeEr },
		werkblokUit() { return !!this.inhoud.werkblokUit },
		magFeliciteren() { return !!this.inhoud.feliciteren && !!this.inhoud.feest },
		/** De kleur van de gelegenheid; onbekend is geen gok, dan de rustige lijnkleur. */
		kleur() { return this.inhoud.kleur || 'var(--pa-lijn, rgba(0,0,0,0.18))' },
		landen() {
			const l = this.inhoud.landen
			return Array.isArray(l) ? l.map((x) => String(x).toLowerCase()) : []
		},
		/** De vlaggen als emoji: twee letters omgezet naar de regionale tekens. */
		vlaggen() {
			return this.landen.slice(0, 4).map((code) => {
				if (code.length !== 2) return ''
				return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
			}).join(' ')
		},
		landenTekst() {
			try {
				const namen = new Intl.DisplayNames([document.documentElement.lang || 'nl'], { type: 'region' })
				return this.landen.map((c) => namen.of(c.toUpperCase()) || c.toUpperCase()).join(', ')
			} catch (e) {
				return this.landen.map((c) => c.toUpperCase()).join(', ')
			}
		},
	},
	methods: { t(...a) { return t(...a) } },
}
</script>

<style scoped>
.pa-feest { position: relative; overflow: hidden; border-left: 4px solid var(--pa-feestkleur); }
/* De gloed: linksboven uit de kaart, zacht genoeg om tekst overheen te kunnen zetten. */
.pa-feest__gloed {
	position: absolute; inset: 0 auto auto 0; width: 100%; height: 120px; pointer-events: none;
	background: radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--pa-feestkleur) 26%, transparent), transparent 70%);
}
.pa-feest__kop { display: flex; align-items: center; gap: 10px; position: relative; }
.pa-feest__groot { display: flex; align-items: baseline; gap: 10px; margin-top: 12px; position: relative; }
.pa-feest__heledag { font-size: 1.4em; font-weight: 600; }
.pa-feest__titel { font-weight: 600; }
.pa-feest__sub { font-size: 0.9em; opacity: 0.75; }
.pa-feest__vlaggen { font-size: 1.3em; line-height: 1; }
.pa-feest__voet {
	display: flex; align-items: center; gap: 10px; margin-top: 10px; padding-top: 10px;
	border-top: 1px solid var(--pa-lijn, rgba(0, 0, 0, 0.08)); position: relative;
}
.pa-feest__voet .pa-feest__sub { flex: 1 1 auto; }
.pa-feest--klein {
	display: flex; align-items: center; gap: 10px; border-radius: 12px; padding: 10px 12px; border-left: 0;
	background: color-mix(in srgb, var(--pa-feestkleur) 7%, transparent);
}
.pa-feest--klein .pa-feest__wat { flex: 1 1 auto; }
</style>
