<template>
	<div class="pa-fuel">
		<h2>{{ t('Fuel') }}</h2>
		<FoutMelding v-if="error" :error="error" />

		<div class="pa-fuel__head">
			<div v-if="vehicle" class="pa-fuel__vehicle">
				<strong>{{ vehicle.name || vehicle.plate || t('Vehicle') }}</strong>
				<span class="pa-fuel__sub">{{ fuelLabel(vehicle.fuelType) }}<template v-if="vehicle.tankLitres"> · {{ vehicle.tankLitres }} l</template><template v-if="vehicle.kmPerLitre"> · {{ vehicle.kmPerLitre }} km/l</template></span>
			</div>
			<p v-else class="pa-fuel__sub">{{ t('Add a vehicle in Settings first.') }}</p>
			<div class="pa-fuel__controls">
				<label class="pa-fuel__sub">{{ t('Search radius') }}
					<select v-model.number="radius" class="pa-fuel__select" @change="search">
						<option :value="10">10 km</option>
						<option :value="15">15 km</option>
						<option :value="20">20 km</option>
						<option :value="30">30 km</option>
					</select>
				</label>
				<button type="button" class="pa-fuel__btn" :disabled="loading || !vehicle" @click="search">{{ t('Search again') }}</button>
			</div>
		</div>

		<NcLoadingIcon v-if="loading" :size="28" />
		<p v-else-if="!stations.length && vehicle && !error" class="pa-fuel__sub">{{ t('No stations found.') }}</p>

		<div v-for="s in stations" :key="s.id" class="pa-fuel__row" :class="{ 'pa-fuel__row--best': s.id === bestId }">
			<div class="pa-fuel__body">
				<div class="pa-fuel__title">{{ [s.brand, s.place].filter(Boolean).join(' · ') }}</div>
				<div v-if="s.id === bestId" class="pa-fuel__best">{{ t('Best choice') }}</div>
				<div class="pa-fuel__price">{{ euro(s.price, 3) }} <span class="pa-fuel__sub">{{ t('per litre') }}</span></div>
				<div class="pa-fuel__sub">{{ t('Total %s', euro(s.totalCost)) }} · {{ t('Detour %s km', Number(s.omweg || 0).toFixed(1)) }}<template v-if="s.extraMinutes != null"> · +{{ s.extraMinutes }} min</template></div>
				<div v-if="s.saving > 0" class="pa-fuel__saving">{{ t('Saves %s', euro(s.saving)) }}</div>
				<div v-if="s.priceStale" class="pa-fuel__warn">⚠ {{ t('Price is not from today') }}</div>
			</div>
			<a class="pa-fuel__btn pa-fuel__btn--primary" :href="mapsUrl(s)" target="_blank" rel="noopener">{{ t('Navigate') }}</a>
		</div>
	</div>
</template>

<script>
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import { t, currentLocale } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import FoutMelding from './FoutMelding.vue'
import { getSettings } from '../api/nextcloudUserData.js'
import { getAccessCode } from '../api/accessCode.js'
import * as paApi from '../api/paApi.js'
import { volgSync } from '../api/sync.js'

/** Dezelfde brandstofnamen als Android's TankSlimApi.fuelParam. */
const FUEL_PARAM = { E10: 'e10', E5: 'e5', DIESEL: 'diesel', DIESEL_PREMIUM: 'diesel-premium', LPG: 'lpg', CNG: 'cng', HVO: 'hvo', ELECTRIC: null }
const FUEL_LABEL = { E10: 'Euro 95 E10', E5: 'Euro 95 E5', DIESEL: 'Diesel', DIESEL_PREMIUM: 'Premium diesel', LPG: 'LPG', CNG: 'CNG', HVO: 'HVO', ELECTRIC: 'Electric' }

/** De voertuigen staan als JSON-tekst in de instellingen, precies zoals de telefoon ze schrijft. */
export function parseVehicles(raw) {
	if (Array.isArray(raw)) return raw
	if (typeof raw === 'string' && raw.trim()) {
		try { const v = JSON.parse(raw); return Array.isArray(v) ? v : [] } catch (e) { return [] }
	}
	return []
}

/**
 * Waar tank je het goedkoopst — vanaf huis, met het voertuig waar je nu mee
 * rijdt (2026-09-13). Dezelfde motor als op de telefoon: de lijst staat op
 * wat het je al met al kost, niet op de prijs op het bord.
 */
export default {
	name: 'FuelView',
	components: { FoutMelding, NcLoadingIcon, NcNoteCard },
	data() {
		return { stopKijken: null, loading: false, error: null, settings: {}, vehicle: null, radius: 15, stations: [], bestId: null }
	},
	async mounted() {
		await this.laad(true)
		// Meeluisteren met je andere apparaten (Ramin, 24-09): wissel je van auto op je telefoon, dan
		// staat hij hier ook meteen goed.
		this.stopKijken = volgSync(() => this.laad(false))
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
	},
	methods: {
		/**
		 * Je instellingen en de actieve auto opnieuw lezen.
		 *
		 * Prijzen halen we alleen op bij het openen of als je van auto wisselde: dat is een vraag aan een
		 * dienst buiten de deur, en die hoeft niet opnieuw omdat er elders iets anders veranderde.
		 */
		async laad(eersteKeer) {
			const vorige = this.vehicle?.plate || null
			try {
				this.settings = await getSettings()
				const alle = parseVehicles(this.settings.vehicles)
				this.vehicle = alle.find((v) => v.plate === this.settings.activeVehiclePlate) || alle[0] || null
			} catch (e) { this.error = foutTekst(e) }
			if (this.vehicle && (eersteKeer || this.vehicle.plate !== vorige)) await this.search()
		},
		t(...args) { return t(...args) },
		fuelLabel(type) { return FUEL_LABEL[type] || type || '' },
		euro(n, digits = 2) { return Number(n || 0).toLocaleString(currentLocale(), { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits }) },
		mapsUrl(s) { return 'https://www.google.com/maps/dir/?api=1&destination=' + s.lat + ',' + s.lng + '&travelmode=driving' },
		async search() {
			if (!this.vehicle) return
			const fuel = FUEL_PARAM[this.vehicle.fuelType]
			if (!fuel) { this.error = t('Electric cars have no fuel prices here.'); return }
			if (this.settings.homeLat == null || this.settings.homeLon == null) { this.error = t('Set your home address in Settings first.'); return }
			this.loading = true; this.error = null
			try {
				const r = await paApi.fuelStations(getAccessCode(), {
					startLat: this.settings.homeLat, startLng: this.settings.homeLon, radius: this.radius,
					liters: this.vehicle.tankLitres || 50, consumption: this.vehicle.kmPerLitre || 15, fueltype: fuel,
					tkKey: this.settings.tankerkoenigKey || '',
				})
				if (!r.ok) { this.error = r.error || t('No stations found.'); this.stations = []; return }
				this.stations = (r.stations || []).slice().sort((a, b) => a.totalCost - b.totalCost)
				this.bestId = r.bestCostId || null
			} catch (e) { this.error = foutTekst(e) } finally { this.loading = false }
		},
	},
}
</script>

<style scoped>
.pa-fuel__head { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; justify-content: space-between; margin-bottom: 12px; }
.pa-fuel__vehicle { display: flex; flex-direction: column; }
.pa-fuel__sub { font-size: 0.85em; color: var(--color-text-maxcontrast); }
.pa-fuel__controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.pa-fuel__select { font: inherit; min-height: 32px; margin-left: 6px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); }
.pa-fuel__row { display: flex; align-items: center; gap: 8px; border: 1px solid var(--color-border); border-radius: var(--border-radius-large); padding: 10px 14px; margin-bottom: 8px; }
.pa-fuel__row--best { border-color: var(--color-primary-element); }
.pa-fuel__body { flex: 1; }
.pa-fuel__title { font-weight: bold; }
.pa-fuel__best { font-size: 0.8em; text-transform: uppercase; letter-spacing: .06em; color: var(--color-primary-element); }
.pa-fuel__price { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.3em; }
.pa-fuel__saving { font-size: 0.85em; color: var(--color-success); }
.pa-fuel__warn { font-size: 0.85em; color: var(--color-error); }
.pa-fuel__btn { font: inherit; font-size: 0.85em; min-height: 32px; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); cursor: pointer; text-decoration: none; }
.pa-fuel__btn--primary { background: var(--color-primary-element); color: var(--color-primary-element-text); border-color: transparent; }
</style>
