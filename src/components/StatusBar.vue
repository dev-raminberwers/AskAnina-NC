<template>
	<div v-if="weer || vertrek || (openTaken && openTaken.length) || supportOngelezen" ref="wortel" class="pa-status">
		<!-- Eén rij (Ramin, 2026-09-15, kaart 69): [weer][andere iconen] [open taken];
		     de takenbalk vult de rest en krimpt als er meer iconen bijkomen. -->
		<div class="pa-status__balk">
			<!-- Weer zoals Ramins voorbeeld bij kaart 68: druppel of icoon, minimum, kleurbalk met de
			     temperatuur van nu als bolletje, maximum. De weekdag stond er ook bij, maar die is weg
			     (Ramin, 24-09): in een balk die over vandaag gaat voegt "Do" niets toe, en de datum staat
			     al boven je dag. -->
			<button v-if="weer" type="button" class="pa-status__vak pa-status__weer" :class="{ 'pa-status__vak--open': open === 'weer' }" :title="weer.rainSoon ? t('Rain around %s', weer.rainSoon.time) : t('Weather')" @click.stop="wissel('weer')">
				<span class="pa-status__icoon">{{ nat ? '💧' : icoon(weer.condition, weer.isDay) }}</span>
				<span>{{ minVandaag }}°</span>
				<span class="pa-status__balkje"><span class="pa-status__bol" :style="{ left: 'calc(' + positie + '% - 8px)' }" /></span>
				<span>{{ maxVandaag }}°</span>
				<span v-if="weer.rainSoon" class="pa-status__regen">{{ weer.rainSoon.time }}</span>
			</button>
			<!-- Hier stond een draaiend rondje met wat er heen en weer ging. Weg op verzoek (Ramin, 24-09:
			     "de spinner duikt vaak op en maakt het beeld onrustig"). Een balk die elke paar seconden
			     iets laat verschijnen en verdwijnen leest slechter dan een balk die stil staat; dat de app
			     synchroniseert hoef je niet te zien zolang het gewoon werkt. Mislukt er iets, dan komt er
			     een echte melding -- en dat is het moment dat het je iets zegt. -->
			<button v-if="vertrek" type="button" class="pa-status__vak" :class="{ 'pa-status__vak--open': open === 'vertrek' }" :title="t('Departure %s', vertrek.tijd)" @click.stop="wissel('vertrek')">
				<span class="pa-status__icoon">{{ vertrek.icoon }}</span>
				<span>{{ vertrek.tijd }}</span>
				<span v-if="aftellen" class="pa-status__aftel">{{ aftellen }}</span>
			</button>
			<!-- Open supportverzoek voor de beheerder (kaart 132): klik = beheer > Support in een nieuw tabblad. -->
			<a v-if="supportOngelezen" class="pa-status__vak pa-status__support" :href="beheerUrl + '#support'" target="_blank" rel="noopener" :title="t('Open support requests: %s', supportOngelezen)">
				<span class="pa-status__icoon">💬</span>
				<span>{{ supportOngelezen }}</span>
			</a>
			<!-- Open taken: rood = verlopen, geel = binnen twee dagen, groen = ruim op tijd; aantallen per kleur. -->
			<button v-if="openTaken && openTaken.length" type="button" class="pa-status__taken" :title="t('Open tasks') + ' ' + openTaken.length" @click.stop="$emit('open-items')">
				<span v-if="verdeling.rood" class="pa-status__seg pa-status__seg--rood" :style="{ flex: verdeling.rood }">{{ verdeling.rood }}</span>
				<span v-if="verdeling.geel" class="pa-status__seg pa-status__seg--geel" :style="{ flex: verdeling.geel }">{{ verdeling.geel }}</span>
				<span v-if="verdeling.groen" class="pa-status__seg pa-status__seg--groen" :style="{ flex: verdeling.groen }">{{ verdeling.groen }}</span>
			</button>
		</div>

		<!-- Laag óver de inhoud, niet ertussen: het scherm eronder blijft staan. -->
		<div v-if="open === 'weer' && weer" class="pa-status__laag">
			<div class="pa-status__dagen">
				<span v-for="(d, i) in weer.days.slice(0, 2)" :key="d.date">
					{{ icoon(d.condition, true) }} {{ i === 0 ? t('Today %s° / %s°', d.min, d.max) : t('Tomorrow %s° / %s°', d.min, d.max) }}
				</span>
				<span>{{ t('Wind %s km/h', weer.windKmh) }}</span>
				<span v-if="weer.days[0]">{{ t('Sunrise %s · sunset %s', weer.days[0].sunrise, weer.days[0].sunset) }}</span>
			</div>
			<div class="pa-status__uren">
				<span v-for="u in weer.hours.slice(0, 12)" :key="u.date + u.time" class="pa-status__uur" :class="{ 'pa-status__uur--nat': u.mm >= 0.2 }">
					<small>{{ u.time }}</small>
					<span>{{ icoon(u.condition, true) }}</span>
					<small>{{ u.temp }}°</small>
					<small v-if="u.mm >= 0.1">{{ u.mm }} mm</small>
				</span>
			</div>
			<small v-if="bijgewerkt" class="pa-status__voet">{{ t('Updated %s', tijd(bijgewerkt)) }}</small>
		</div>
		<div v-if="open === 'vertrek' && vertrek" class="pa-status__laag">
			<div>{{ vertrek.icoon }} {{ t('Departure %s', vertrek.tijd) }}<template v-if="aftellen"> · {{ aftellen }}</template><template v-if="vertrek.naar"> · {{ vertrek.naar }}</template></div>
			<small v-if="bijgewerkt" class="pa-status__voet">{{ t('Updated %s', tijd(bijgewerkt)) }}</small>
		</div>
	</div>
</template>

<script>
import { adminInbox } from '../api/paApi.js'
import { getAccessCode } from '../api/accessCode.js'
import { t, currentLocale } from '../l10n/index.js'
import { verdeling } from '../api/termijnen.js'

/**
 * Statusbalk bovenaan de app (Deck 68/69, 2026-09-15): weer, volgend vertrek en
 * de open taken in één rij; details openen als laag over de inhoud. Geen
 * meldingsbalk; alleen wat er nu speelt. Zelfde inhoud als op de telefoon.
 */
export default {
	name: 'StatusBar',
	props: {
		weer: { type: Object, default: null },
		vertrek: { type: Object, default: null },
		bijgewerkt: { type: Date, default: null },
		openTaken: { type: Array, default: () => [] },
		fout: { type: Boolean, default: false },
	},
	emits: ['open-items'],
	data() { return { open: null, sluiter: null, supportOngelezen: 0, supportTimer: null, nu: Date.now(), klok: null } },
	computed: {
		beheerUrl() { return new URL('../beheer/', window.location.href).toString() },
		minVandaag() { const d = this.weer && this.weer.days && this.weer.days[0]; return d ? Math.min(d.min, this.weer.temp) : this.weer.temp },
		maxVandaag() { const d = this.weer && this.weer.days && this.weer.days[0]; return d ? Math.max(d.max, this.weer.temp) : this.weer.temp },
		/** Plek van het bolletje op de balk, 0–100. */
		positie() { const span = this.maxVandaag - this.minVandaag; if (span <= 0) return 50; return Math.max(0, Math.min(100, Math.round((this.weer.temp - this.minVandaag) / span * 100))) },
		nat() { return !!(this.weer && (this.weer.rainSoon || /rain|drizzle|showers|snow|thunder/.test(this.weer.condition))) },
		verdeling() { return verdeling(this.openTaken || []) },
		/**
		 * Aftellen tot je weg moet (Ramin, 24-09). Op de telefoon staat dit al in de meldingenbalk; hier
		 * hoort het in de app zelf, zodat het web het ook heeft.
		 *
		 * De browser maakt er zelf de goede taal van -- "over 12 min." in het Nederlands, "in 12 min." in
		 * het Engels -- dus er hoeft geen enkele zin vertaald te worden.
		 */
		aftellen() {
			if (!this.vertrek || !this.vertrek.om) return ''
			const over = this.vertrek.om - this.nu
			if (over <= 0) return ''
			const minuten = Math.round(over / 60000)
			try {
				const f = new Intl.RelativeTimeFormat(currentLocale(), { numeric: 'always', style: 'narrow' })
				return minuten < 60 ? f.format(minuten, 'minute') : f.format(Math.round(minuten / 60), 'hour')
			} catch (e) {
				// Oudere browser zonder RelativeTimeFormat: dan maar het kale getal.
				return minuten < 60 ? minuten + ' min' : Math.round(minuten / 60) + ' h'
			}
		},
	},
	mounted() {
		this.laadSupport()
		this.supportTimer = setInterval(() => this.laadSupport(), 5 * 60 * 1000)
		// Klik buiten de balk sluit de laag.
		this.sluiter = (e) => { if (this.open && this.$refs.wortel && !this.$refs.wortel.contains(e.target)) this.open = null }
		document.addEventListener('click', this.sluiter)
		// Elke twintig seconden bijwerken: de teller staat in minuten, dus vaker heeft geen zin.
		this.klok = setInterval(() => { this.nu = Date.now() }, 20000)
	},
	beforeUnmount() {
		if (this.sluiter) document.removeEventListener('click', this.sluiter)
		if (this.klok) clearInterval(this.klok)
		if (this.supportTimer) clearInterval(this.supportTimer)
	},
	methods: {
		async laadSupport() {
			try { const r = await adminInbox(getAccessCode() || ''); this.supportOngelezen = r && r.admin ? Number(r.unread || 0) : 0 } catch (e) { /* geen beheerder of offline */ }
		},
		t(...args) { return t(...args) },
		wissel(wat) { this.open = this.open === wat ? null : wat },
		tijd(d) { return d.toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }) },
		icoon(toestand, dag) {
			const kaart = {
				clear: dag ? '☀️' : '🌙', mostly_clear: dag ? '🌤️' : '🌙', partly_cloudy: '⛅', overcast: '☁️', fog: '🌫️',
				drizzle: '🌦️', rain: '🌧️', freezing_rain: '🌧️', snow: '🌨️', showers: '🌦️', snow_showers: '🌨️', thunderstorm: '⛈️',
			}
			return kaart[toestand] || '☁️'
		},
	},
}
</script>

<style scoped>
/* Blijft bovenaan staan als je scrollt (Ramin, 24-09: "als ik naar deck ga, verschuift het scherm iets
   naar beneden, waardoor statusbalk niet meer in beeld is"). De hele pagina scrolt als een geheel -- op
   een Deck-bord met veel kaarten is dat zo duizenden pixels -- en de balk schoof gewoon mee weg. Met een
   eigen achtergrond, anders schuift de inhoud eronder er doorheen. */
.pa-status { position: sticky; top: 0; z-index: 30; margin: 0 0 10px; padding: 6px 0 4px; background: var(--color-main-background, #fff); }
.pa-status__balk { display: flex; gap: 6px; align-items: center; }
.pa-status__vak { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-background-hover); color: var(--color-main-text); font: inherit; font-size: 0.9em; font-variant-numeric: tabular-nums; cursor: pointer; white-space: nowrap; flex: 0 0 auto; }
.pa-status__vak:hover, .pa-status__vak--open { border-color: var(--color-primary-element); }
.pa-status__icoon { font-size: 1.05em; line-height: 1; }
.pa-status__weer { gap: 8px; }
.pa-status__balkje { position: relative; display: inline-block; width: 110px; height: 12px; border-radius: 6px; background: linear-gradient(90deg, #4b5563 0%, #8fbc8f 40%, #d7dc3a 65%, #ffb347 100%); }
.pa-status__bol { position: absolute; top: -3px; width: 16px; height: 16px; border-radius: 50%; background: #f5f5f0; border: 2px solid #6b7280; box-sizing: border-box; }
.pa-status__regen { color: #1f6fb2; font-weight: 600; }
/* De takenbalk vult wat overblijft en krimpt als er iconen bijkomen. */
.pa-status__taken { flex: 1 1 90px; min-width: 90px; display: flex; height: 28px; border: none; border-radius: 14px; overflow: hidden; padding: 0; cursor: pointer; font: inherit; }
.pa-status__seg { display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 0.85em; min-width: 26px; text-shadow: 0 1px 2px rgba(0,0,0,.4); }
.pa-status__seg--rood { background: #c0392b; }
.pa-status__seg--geel { background: #e0a800; }
.pa-status__seg--groen { background: #2e8b57; }
.pa-status__laag { position: absolute; top: 34px; left: 0; z-index: 60; min-width: 280px; max-width: 100%; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-main-background); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25); }
.pa-status__dagen { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 0.92em; margin-bottom: 8px; }
.pa-status__uren { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 4px; }
.pa-status__uur { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 44px; padding: 4px 2px; border-radius: 8px; font-size: 0.85em; }
.pa-status__uur--nat { background: rgba(31, 111, 178, 0.12); }
.pa-status__uur small, .pa-status__voet { color: var(--color-text-maxcontrast); font-size: 0.8em; }
.pa-status__voet { display: block; margin-top: 6px; }
.pa-status__support { text-decoration: none; color: inherit; border-color: var(--color-error, #b33a3a); }
</style>
