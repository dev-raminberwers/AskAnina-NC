<template>
	<div class="pa-trip" :class="{ 'pa-trip--bezig': bezig }">
		<div class="pa-trip__kop">
			<span class="pa-trip__icoon">{{ vliegt ? '✈️' : '🚗' }}</span>
			<span class="pa-trip__titel">{{ titel }}</span>
			<span v-if="vluchtNummer" class="pa-trip__chip">{{ vluchtNummer }}</span>
			<span v-if="vertraging > 0" class="pa-trip__vertraging">{{ t('Delayed %s', duurVan(vertraging)) }}</span>
			<button v-if="verwijderbaar" type="button" class="pa-trip__x" :title="t('Delete')" @click="$emit('delete')"><svg class="pa-prullenbak" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
		</div>

		<!-- Het stappenlijstje: drie zichtbaar, schuift mee met de klok. -->
		<button v-if="gedaanVerborgen > 0" type="button" class="pa-trip__vouw" @click="allesTonen = true">
			{{ t('%s steps done', gedaanVerborgen) }} · {{ t('Show all') }}
		</button>
		<div v-for="i in zichtbaar" :key="i" class="pa-trip__stap" :class="{ 'pa-trip__stap--gedaan': i < huidig, 'pa-trip__stap--nu': i === huidig && begonnen }">
			<span class="pa-trip__tijd">{{ klok(begins[i]) }}</span>
			<span class="pa-trip__stapnaam">
				{{ stapTitel(stappen[i]) }}
				<small v-if="onder(i)">{{ onder(i) }}</small>
			</span>
			<!-- Lange overstap (Ramin, kaart 76): [Hotel zoeken] rechts op de regel. -->
			<button v-if="langeOverstap(stappen[i])" type="button" class="pa-trip__knop pa-trip__knop--klein" @click.stop="$emit('choose-hotel', stappen[i])">{{ t('Search hotel') }}</button>
		</div>
		<button v-if="verderop > 0" type="button" class="pa-trip__vouw" @click="allesTonen = true">
			{{ t('%s steps ahead', verderop) }} · {{ t('Show all') }}
		</button>
		<button v-else-if="allesTonen && stappen.length > 3" type="button" class="pa-trip__vouw" @click="allesTonen = false">
			{{ t('Show less') }}
		</button>

		<!-- De vakken per fase. -->
		<div v-if="vliegt" class="pa-trip__vakken">
			<div v-for="v in vakken" :key="v[0]" class="pa-trip__vak">
				<span class="pa-trip__vaklabel">{{ v[0] }}</span>
				<span class="pa-trip__vakwaarde">{{ v[1] }}</span>
			</div>
		</div>

		<!-- De knoppen per fase. -->
		<div class="pa-trip__knoppen">
			<button v-if="hotelStap" type="button" class="pa-trip__knop pa-trip__knop--primair" @click="$emit('choose-hotel', hotelStap)">{{ t('Choose a hotel') }}</button>
			<template v-if="fase === 1">
				<a v-if="luchthavenPlek" class="pa-trip__knop pa-trip__knop--primair" :href="kaartLink(luchthavenPlek)" target="_blank" rel="noopener">{{ t('To the airport') }}</a>
				<a v-if="vluchtNummer" class="pa-trip__knop" :href="volgLink" target="_blank" rel="noopener">{{ t('Follow flight') }}</a>
			</template>
			<template v-else-if="fase === 2">
				<a v-if="vluchtNummer" class="pa-trip__knop pa-trip__knop--primair" :href="volgLink" target="_blank" rel="noopener">{{ t('Follow flight') }}</a>
				<a v-if="luchthavenPlek" class="pa-trip__knop" :href="etenLink" target="_blank" rel="noopener">{{ t('Something to eat') }}</a>
			</template>
			<template v-else>
				<a v-if="bestemmingPlek" class="pa-trip__knop pa-trip__knop--primair" :href="kaartLink(bestemmingPlek)" target="_blank" rel="noopener">{{ t('To destination') }}</a>
			</template>
		</div>
	</div>
</template>

<script>
/**
 * Eén reiskaart voor een vlucht (Ramin, 2026-09-15: "via workflows, zodat er
 * ALTIJD een EENDUIDIG layout is"). De server geeft alle stappen van één
 * vlucht dezelfde tripKey (rit, incheck, vlucht, bagage); dit is de kaart die
 * de telefoon ook tekent: drie fases (onderweg / op de luchthaven / geland),
 * vakken met gate, incheck, bagage, boarding, band, terminal, en knoppen.
 */
import { t, currentLocale } from '../../l10n/index.js'
import { duurVan } from './regelTekst.js'

export default {
	name: 'TripCard',
	props: {
		/** De kaarten van de server met dezelfde tripKey, op volgorde van tripStep.index. */
		stappen: { type: Array, required: true },
		/** Mag de vlucht-afspraak (en daarmee de hele reis) weg? */
		verwijderbaar: { type: Boolean, default: false },
	},
	emits: ['choose-hotel', 'delete'],
	data() {
		return { nu: Date.now(), klokje: null, allesTonen: false }
	},
	computed: {
		begins() { return this.stappen.map((s) => this.ms(s.tripStep?.start)) },
		ends() { return this.stappen.map((s) => this.ms(s.tripStep?.end)) },
		huidig() {
			const i = this.stappen.findIndex((s, idx) => (this.ends[idx] ?? Infinity) > this.nu)
			return i < 0 ? this.stappen.length : i
		},
		begonnen() { return this.huidig < this.stappen.length && (this.begins[this.huidig] ?? Infinity) <= this.nu },
		vluchtIndex() { return this.stappen.findIndex((s) => s.tripStep?.kind === 'flight' || s.flightInfo) },
		vluchtStap() { return this.stappen[this.vluchtIndex] || null },
		vliegt() { return !!this.vluchtStap },
		vluchtNummer() { return this.vluchtStap?.flightInfo?.flightNumber || this.vluchtStap?.tripStep?.flightNumber || null },
		status() { return this.vluchtStap?.liveFlight || this.vluchtStap?.scheduledFlight || null },
		vertrekLuchthaven() { return this.kort(this.vluchtStap?.flightInfo?.fromAirportName || this.vluchtStap?.tripStep?.fromLabel || '') },
		aankomstLuchthaven() { return this.kort(this.vluchtStap?.flightInfo?.toAirportName || this.vluchtStap?.tripStep?.toLabel || '') },
		bestemming() {
			// Een reis met meerdere vluchten (kaart 76): de eindbestemming van de hele reis.
			const eind = this.stappen.map((s) => s.event?.tripDestination).find(Boolean)
			if (eind) return this.kort(eind)
			const laatste = this.stappen[this.stappen.length - 1]
			return this.kort(laatste?.tripStep?.name || laatste?.tripStep?.location || this.aankomstLuchthaven)
		},
		fase() {
			if (!this.vliegt) return this.huidig >= this.stappen.length ? 3 : 1
			if (this.huidig >= this.stappen.length) return 3
			if (this.huidig > this.vluchtIndex) return 3
			if (this.huidig === this.vluchtIndex) return 2
			if (this.huidig === this.vluchtIndex - 1 && this.vluchtIndex >= 1) return 2
			return 1
		},
		inDeLucht() { return this.vliegt && this.huidig === this.vluchtIndex && this.begonnen },
		bezig() { return this.huidig < this.stappen.length && this.begonnen },
		titel() {
			if (this.huidig >= this.stappen.length) return t('Arrived in %s', this.bestemming)
			if (!this.vliegt) return (this.begonnen || this.huidig > 0) ? t('Underway') : t('Trip to %s', this.bestemming)
			if (this.fase === 3) return t('Landed in %s', this.aankomstLuchthaven || this.bestemming)
			if (this.inDeLucht) return t('In the air to %s', this.aankomstLuchthaven || this.bestemming)
			if (this.fase === 2) return t('At %s', this.vertrekLuchthaven)
			if (this.begonnen || this.huidig > 0) return t('Underway')
			return t('Trip to %s', this.bestemming)
		},
		vertraging() { return (this.fase === 3 ? this.status?.arrDelayedMinutes : this.status?.depDelayedMinutes) || 0 },
		geplandVertrek() { return this.begins[this.vluchtIndex] ?? null },
		incheckStart() { return this.vluchtIndex >= 1 ? this.begins[this.vluchtIndex - 1] : null },
		vakken() {
			const gate = this.status?.depGate || '—'
			const bagageSluit = this.klok(this.geplandVertrek == null ? null : this.geplandVertrek - 45 * 60000)
			const boarding = this.klok(this.geplandVertrek == null ? null : this.geplandVertrek - 30 * 60000)
			const geland = this.klok(this.ms(this.vluchtStap?.flightInfo?.actualArrival) ?? this.ends[this.vluchtIndex])
			const band = this.vluchtStap?.arrivalWindow?.baggage || '—'
			const terminal = this.status?.arrTerminal || '—'
			if (this.fase === 3) return [[t('Belt'), band], [t('Landed'), geland], [t('Terminal'), terminal]]
			if (this.fase === 2) return [[t('Gate'), gate], [t('Bags close'), bagageSluit], [t('Boarding'), boarding]]
			return [[t('Gate'), gate], [t('Check-in'), this.klok(this.incheckStart)], [t('Bags close'), bagageSluit]]
		},
		luchthavenPlek() {
			const stap = this.vluchtIndex >= 1 ? this.stappen[this.vluchtIndex - 1] : this.stappen[0]
			return stap?.resolvedLocation || this.stappen[0]?.resolvedLocation || null
		},
		bestemmingPlek() {
			// De laatste stap met een plek, maar niet de vluchtstap: die draagt de
			// vertrekluchthaven. Met een hotel is dit dus het hotel.
			for (let i = this.stappen.length - 1; i >= 0; i--) {
				if (this.stappen[i].resolvedLocation && this.stappen[i].tripStep?.kind !== 'flight') return this.stappen[i].resolvedLocation
			}
			return null
		},
		hotelStap() { return this.stappen.find((s) => s.tripStep?.kind === 'hotel' && s.tripStep.needsChoice) || null },
		volgLink() { return 'https://www.flightradar24.com/data/flights/' + String(this.vluchtNummer || '').toLowerCase() },
		etenLink() {
			const p = this.luchthavenPlek
			return p ? 'https://www.google.com/maps/search/restaurant/@' + p.lat + ',' + p.lon + ',16z' : 'https://www.google.com/maps/search/restaurant'
		},
		van() { return this.allesTonen ? 0 : Math.min(Math.max(0, this.huidig - 1), Math.max(0, this.stappen.length - 3)) },
		tot() { return this.allesTonen ? this.stappen.length : Math.min(this.stappen.length, this.van + 3) },
		zichtbaar() { const uit = []; for (let i = this.van; i < this.tot; i++) uit.push(i); return uit },
		gedaanVerborgen() { return this.van },
		verderop() { return this.stappen.length - this.tot },
	},
	mounted() {
		this.klokje = setInterval(() => { this.nu = Date.now() }, 30000)
	},
	beforeUnmount() {
		if (this.klokje) clearInterval(this.klokje)
	},
	methods: {
		t(...args) { return t(...args) },
		// De template kan een kale import niet zien; net als t() moet duurVan hier staan.
		duurVan(min) { return duurVan(min) },
		ms(iso) { if (!iso) return null; const v = new Date(iso).getTime(); return Number.isNaN(v) ? null : v },
		klok(ms) { return ms == null ? '—' : new Date(ms).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }) },
		kort(naam) { return String(naam || '').split('(')[0].split(',')[0].trim() },
		kaartLink(plek) { return 'https://www.google.com/maps/dir/?api=1&destination=' + plek.lat + '%2C' + plek.lon },
		langeOverstap(stap) { const s = stap.tripStep || {}; return s.kind === 'transfer' && s.long && s.lat != null && s.lon != null },
		stapTitel(stap) {
			const s = stap.tripStep || {}
			if (s.kind === 'travel') return '🚗 ' + [s.fromLabel, s.toLabel].filter(Boolean).join(' → ')
			if (s.kind === 'checkin') return t('Check-in — %s', s.airportName || '')
			if (s.kind === 'flight') return [s.flightNumber, [s.fromCode, s.toCode].filter(Boolean).join(' → ')].filter(Boolean).join(' ')
			if (s.kind === 'arrival') return t('Baggage claim — %s', s.airportName || '')
			if (s.kind === 'hotel') return s.needsChoice ? '🏨 ' + t('Choose a hotel') : '🏨 ' + t('Hotel: %s', s.name || '')
			// Overstap (kaart 76): luchthaven en wachttijd.
			if (s.kind === 'transfer') return (s.long ? '⚠️ ' : '') + t('Transfer at %s', s.airportName || '') + (s.minutes > 0 ? ' · ' + Math.floor(s.minutes / 60) + 'h' + String(s.minutes % 60).padStart(2, '0') : '')
			return stap.event?.title || s.location || ''
		},
		onder(i) {
			const s = this.stappen[i].tripStep || {}
			const plek = this.kort(s.location)
			if (i === this.huidig && !this.begonnen) {
				const over = Math.round(((this.begins[i] ?? this.nu) - this.nu) / 60000)
				return [plek, over >= 1 && over <= 180 ? t('in %s min', over) : null].filter(Boolean).join(' · ')
			}
			return plek
		},
	},
}
</script>

<style scoped>
.pa-trip { border: 1px solid var(--color-border, #ddd); border-radius: var(--border-radius-large, 8px); padding: 12px 16px; margin-bottom: 8px; background: var(--color-main-background, #fff); }
.pa-trip--bezig { border-color: var(--color-primary-element, #1e3a5f); box-shadow: inset 4px 0 0 var(--color-primary-element, #1e3a5f); }
.pa-trip__kop { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.pa-trip__titel { font-weight: bold; }
.pa-trip__chip { font-family: ui-monospace, monospace; font-size: 0.85em; padding: 1px 8px; border-radius: 999px; background: var(--color-background-dark, #eee); }
.pa-trip__vertraging { color: var(--color-error, #c0392b); font-size: 0.85em; }
.pa-trip__x { margin-left: auto; background: none; border: none; cursor: pointer; color: #d64541; padding: 4px; display: inline-flex; }
.pa-trip__x:hover { color: #b3231f; }
.pa-trip__stap { display: flex; gap: 10px; padding: 3px 0; font-size: 0.95em; align-items: flex-start; }
.pa-trip__stap .pa-trip__stapnaam { flex: 1; }
.pa-trip__knop--klein { margin-left: auto; padding: 3px 10px; font-size: 0.85em; align-self: center; background: transparent; color: inherit; cursor: pointer; font-family: inherit; white-space: nowrap; }
.pa-trip__stap--gedaan { opacity: 0.55; text-decoration: line-through; }
.pa-trip__stap--nu { font-weight: bold; }
.pa-trip__tijd { font-family: ui-monospace, monospace; flex: 0 0 3.2em; }
.pa-trip__stapnaam { display: flex; flex-direction: column; min-width: 0; }
.pa-trip__stapnaam small { color: var(--color-text-maxcontrast, #666); font-size: 0.85em; }
.pa-trip__vouw { background: none; border: none; color: var(--color-text-maxcontrast, #666); font-size: 0.85em; padding: 2px 0; cursor: pointer; }
.pa-trip__vakken { display: flex; gap: 8px; margin: 10px 0 6px; }
.pa-trip__vak { flex: 1; background: var(--color-background-hover, #f4f4f4); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; min-width: 0; }
.pa-trip__vaklabel { font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-maxcontrast, #666); }
.pa-trip__vakwaarde { font-family: ui-monospace, monospace; font-size: 1.05em; }
.pa-trip__knoppen { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.pa-trip__knop { display: inline-block; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--color-border-dark, #bbb); text-decoration: none; color: inherit; font-size: 0.9em; }
.pa-trip__knop--primair { background: var(--color-primary-element, #1e3a5f); color: var(--color-primary-element-text, #fff); border-color: transparent; }
</style>
