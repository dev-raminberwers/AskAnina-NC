<template>
	<div class="pa-buurt">
		<h2>{{ t('Nearby') }}</h2>

		<!-- Waar we vandaan rekenen. De browser mag je plek pas geven als je het toestaat; tot die tijd
		     (of als je weigert) gebruiken we je thuisadres uit je instellingen. Zonder allebei valt er
		     niets in de buurt te zoeken, en dat zeggen we dan ook. -->
		<p class="pa-buurt__plek">
			<template v-if="plekTekst">{{ plekTekst }}</template>
			<template v-else-if="zoektPlek">{{ t('Finding your location…') }}</template>
			<template v-else>{{ t('No location yet.') }}</template>
			<button v-if="!viaBrowser" type="button" class="pa-buurt__knopje" @click="vraagBrowserPlek">{{ t('Use my current location') }}</button>
		</p>

		<div class="pa-buurt__soorten">
			<button v-for="s in SOORTEN" :key="s.id" type="button" class="pa-buurt__soort"
				:class="{ 'pa-buurt__soort--aan': soort === s.id }" @click="soort = s.id; zoek()">
				{{ s.icoon }} {{ s.naam() }}
			</button>
		</div>

		<div class="pa-buurt__filter">
			<input v-model="naam" type="search" class="pa-buurt__veld" :placeholder="t('Filter by name')" @keyup.enter="zoek">
			<button type="button" class="pa-buurt__knopje" @click="zoek">{{ t('Search') }}</button>
		</div>

		<FoutMelding v-if="error" :error="error" />
		<NcLoadingIcon v-else-if="bezig" :size="24" />
		<p v-else-if="!treffers.length && gezocht" class="pa-buurt__leeg">{{ t('Nothing found here. Try a wider category.') }}</p>

		<div v-for="(p, i) in treffers" :key="i" class="pa-buurt__rij">
			<div class="pa-buurt__tekst">
				<div class="pa-buurt__naam">{{ p.name }}</div>
				<small>{{ [p.address, p.city, p.country].filter(Boolean).join(' · ') }}</small>
				<small v-if="p.openingHours" class="pa-buurt__open" :class="{ 'pa-buurt__open--nu': p.openNow === true, 'pa-buurt__open--dicht': p.openNow === false }">
					{{ p.openNow === true ? t('Open now') : (p.openNow === false ? t('Closed now') : p.openingHours) }}
				</small>
			</div>
			<div class="pa-buurt__acties">
				<span v-if="p.distanceMeters != null" class="pa-buurt__afstand">{{ afstand(p.distanceMeters) }}</span>
				<a v-if="p.phone" class="pa-buurt__knopje" :href="'tel:' + p.phone">{{ t('Call') }}</a>
				<a v-if="p.website" class="pa-buurt__knopje" :href="p.website" target="_blank" rel="noopener">{{ t('Website') }}</a>
				<a class="pa-buurt__knopje" :href="'https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lon" target="_blank" rel="noopener">{{ t('Navigate') }}</a>
			</div>
		</div>
	</div>
</template>

<script>
import { t } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import { getSettings } from '../api/nextcloudUserData.js'
import * as paApi from '../api/paApi.js'
import FoutMelding from './FoutMelding.vue'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'

/** Dezelfde elf soorten als op de telefoon, met dezelfde sleutels -- de server kent geen andere. */
const SOORTEN = [
	{ id: 'restaurant', naam: () => t('Restaurant'), icoon: '🍽' },
	{ id: 'cafe', naam: () => t('Cafe'), icoon: '☕' },
	{ id: 'supermarket', naam: () => t('Supermarket'), icoon: '🛒' },
	{ id: 'liquor', naam: () => t('Drinks'), icoon: '🍷' },
	{ id: 'pharmacy', naam: () => t('Pharmacy'), icoon: '💊' },
	{ id: 'fuel', naam: () => t('Fuel'), icoon: '⛽' },
	{ id: 'atm', naam: () => t('Cash machine'), icoon: '🏧' },
	{ id: 'parking', naam: () => t('Parking'), icoon: '🅿' },
	{ id: 'hotel', naam: () => t('Hotel'), icoon: '🏨' },
	{ id: 'station', naam: () => t('Station'), icoon: '🚉' },
	{ id: 'shop', naam: () => t('Shops'), icoon: '🏬' },
]

/**
 * In de buurt (Ramin, 24-09): hetzelfde scherm als op de telefoon.
 *
 * De telefoon weet waar je bent; een browser pas als je het toestaat. Daarom beginnen we bij je
 * thuisadres uit je instellingen -- dan staat er meteen iets bruikbaar -- en kun je met een knop je
 * echte plek geven. Zo hoef je geen toestemming te geven voor iets dat je alleen even wilde opzoeken.
 */
export default {
	name: 'NearbyView',
	components: { FoutMelding, NcLoadingIcon },
	data() {
		return {
			SOORTEN, soort: 'restaurant', naam: '', treffers: [], bezig: false, gezocht: false, error: null,
			lat: null, lon: null, plekTekst: '', viaBrowser: false, zoektPlek: false,
		}
	},
	async mounted() {
		const s = await getSettings().catch(() => null)
		if (s && s.homeLat != null && s.homeLon != null) {
			this.lat = s.homeLat
			this.lon = s.homeLon
			this.plekTekst = s.homeAddress || t('Home')
			this.zoek()
		}
	},
	methods: {
		t,
		afstand(m) { return m >= 1000 ? (Math.round(m / 100) / 10) + ' km' : Math.round(m) + ' m' },
		vraagBrowserPlek() {
			if (!navigator.geolocation) return
			this.zoektPlek = true
			navigator.geolocation.getCurrentPosition(
				(pos) => {
					this.lat = pos.coords.latitude
					this.lon = pos.coords.longitude
					this.viaBrowser = true
					this.zoektPlek = false
					this.plekTekst = t('Your current location')
					this.zoek()
				},
				// Weiger je, dan blijft het thuisadres staan; dat is bruikbaarder dan een leeg scherm.
				() => { this.zoektPlek = false },
				{ timeout: 10000, maximumAge: 60000 },
			)
		},
		async zoek() {
			if (this.lat == null || this.lon == null) return
			this.bezig = true
			this.gezocht = true
			try {
				this.treffers = await paApi.poiNearby(this.lat, this.lon, {
					category: this.soort,
					radius: 3000,
					nameFilter: this.naam.trim() || null,
				})
				this.error = null
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.bezig = false
			}
		},
	},
}
</script>

<style scoped>
.pa-buurt__plek { color: var(--color-text-maxcontrast, #666); display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pa-buurt__soorten { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
.pa-buurt__soort { font: inherit; font-size: 0.88em; border: 1px solid var(--color-border); background: transparent; color: inherit; border-radius: 999px; padding: 4px 12px; cursor: pointer; }
.pa-buurt__soort--aan { background: var(--color-primary-element-light); font-weight: 600; }
.pa-buurt__filter { display: flex; gap: 8px; margin-bottom: 14px; }
.pa-buurt__veld { flex: 1; font: inherit; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--color-border); background: var(--color-main-background); color: inherit; }
.pa-buurt__knopje { font: inherit; font-size: 0.85em; border: 1px solid var(--color-border); background: transparent; color: inherit; border-radius: 999px; padding: 3px 11px; cursor: pointer; text-decoration: none; }
.pa-buurt__leeg { color: var(--color-text-maxcontrast, #666); }
.pa-buurt__rij { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid var(--color-border); }
.pa-buurt__tekst { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pa-buurt__naam { font-weight: 600; }
.pa-buurt__open--nu { color: var(--color-success, #2a7); }
.pa-buurt__open--dicht { color: var(--color-error, #c33); }
.pa-buurt__acties { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.pa-buurt__afstand { font-variant-numeric: tabular-nums; color: var(--color-text-maxcontrast, #666); font-size: 0.9em; }
</style>
