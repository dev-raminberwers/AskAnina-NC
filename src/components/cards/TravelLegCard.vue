<template>
	<div class="pa-card pa-card--muted">
		<div class="pa-card__time">
			<!-- Echt vertrek: departureTime is het moment om je klaar te maken (klaarmaaktijd zit
			     erin); Ramin, 2026-09-15: "12:47 + 33 min rijden = geen 13:50". -->
			<span class="pa-card__big">{{ formatTime(vertrekEcht(travel)) }}</span>
			<span class="pa-card__label">{{ t('Leave') }}</span>
			<span class="pa-card__chip">{{ modeLabel }}</span>
		</div>
		<div class="pa-card__facts">
			<span><span class="pa-card__l">{{ t('Travel time') }}</span> {{ duur(travel.duration_min) }}</span>
			<span v-if="travel.arrivalTime"><span class="pa-card__l">{{ t('Arrival') }}</span> {{ formatTime(travel.arrivalTime) }}</span>
			<span v-if="travel.departureBufferMinutes > 0"><span class="pa-card__l">{{ t('Get ready from') }}</span> {{ formatTime(travel.departureTime) }}</span>
		</div>
		<div class="pa-card__meta">
			{{ modeIcon }} {{ travel.distance_km ? Math.round(travel.distance_km) + ' km · ' : '' }}{{ travel.fromLabel }} → {{ travel.toLabel }}
		</div>
		<!-- Dezelfde knoppen als de reiskaart op de telefoon: navigeren, en één
		     tik verandert de rit (Ramin, 2026-09-13). -->
		<div class="pa-card__actions">
			<a v-if="destination" class="pa-card__btn pa-card__btn--primary" :href="navigateUrl" target="_blank" rel="noopener">{{ t('Navigate') }}</a>
			<span v-if="showModes" class="pa-card__modes">
				<button v-for="m in modes" :key="m.id" type="button" class="pa-card__mode" :class="{ 'pa-card__mode--on': isCurrent(m.id) }" :title="m.label" @click="$emit('mode', m.id)">{{ m.icon }}</button>
			</span>
		</div>
	</div>
</template>

<script>
import { t, currentLocale } from '../../l10n/index.js'
import { duurVan } from './regelTekst.js'
export default {
	name: 'TravelLegCard',
	props: {
		travel: { type: Object, required: true },
		currentMode: { type: String, default: null },
		destination: { type: Object, default: null },
		showModes: { type: Boolean, default: true },
	},
	emits: ['mode'],
	computed: {
		modes() {
			const km = this.travel.distance_km
			const alle = [
				{ id: 'driving', icon: '🚗', label: t('Car') },
				{ id: 'cycling', icon: '🚲', label: t('Bike'), max: 30 },
				{ id: 'walking', icon: '🚶', label: t('On foot'), max: 8 },
				{ id: 'training', icon: '🚆', label: t('Public transport') },
			]
			return alle.filter((m) => m.max == null || km == null || km <= m.max)
		},
		effectiveMode() {
			if (this.travel.isFlightLeg) return 'flying'
			if (this.travel.isTrainLeg) return 'training'
			return this.currentMode || 'driving'
		},
		modeLabel() {
			const m = { driving: t('Car'), cycling: t('Bike'), walking: t('On foot'), training: t('Public transport'), flying: t('Plane') }
			return (m[this.effectiveMode] || t('Car')).toUpperCase()
		},
		modeIcon() {
			return { driving: '🚗', cycling: '🚲', walking: '🚶', training: '🚆', flying: '✈️' }[this.effectiveMode] || '🚗'
		},
		navigateUrl() {
			if (!this.destination) return '#'
			return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(this.destination.lat + ',' + this.destination.lon)
		},
	},
	methods: {
		t(...args) { return t(...args) },
		isCurrent(id) { return this.effectiveMode === id },
		formatTime(iso) {
			return iso ? new Date(iso).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }) : ''
		},
		/** Echt vertrek = vertrektijd van de planner plus de klaarmaaktijd die erin zit. */
		vertrekEcht(travel) {
			if (!travel.departureTime) return null
			const buf = Number(travel.departureBufferMinutes || 0)
			return new Date(new Date(travel.departureTime).getTime() + buf * 60000).toISOString()
		},
		// Was een derde eigen formule naast regelTekst.duurVan en de Android-kant, en zei het weer anders
		// ("2 u 15"). Ramin, 29-09: "Nergens xxxmin, altijd xhxxmin."
		duur(min) {
			return duurVan(Math.round(min || 0))
		},
	},
}
</script>

<style scoped>
.pa-card { border-radius: var(--border-radius-large); padding: 12px 16px; margin-bottom: 8px; }
.pa-card--muted { background: var(--color-background-hover); }
.pa-card__time { display: flex; align-items: baseline; gap: 10px; }
.pa-card__big { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.9em; font-weight: 500; letter-spacing: -.02em; }
.pa-card__label { color: var(--color-text-maxcontrast); font-size: 0.85em; }
.pa-card__chip { margin-left: auto; font-size: 0.7em; letter-spacing: .06em; border: 1px solid var(--color-border); border-radius: 6px; padding: 2px 6px; color: var(--color-text-maxcontrast); }
.pa-card__facts { display: flex; gap: 16px; flex-wrap: wrap; font-size: 0.9em; margin-top: 4px; }
.pa-card__l { color: var(--color-text-maxcontrast); margin-right: 4px; }
.pa-card__meta { font-size: 0.9em; color: var(--color-text-maxcontrast); margin-top: 6px; }
.pa-card__actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--color-border); }
.pa-card__btn { font: inherit; font-size: 0.85em; min-height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--color-border); text-decoration: none; display: inline-flex; align-items: center; color: var(--color-main-text); }
.pa-card__btn--primary { background: var(--color-primary-element); color: var(--color-primary-element-text); border-color: transparent; }
.pa-card__modes { margin-left: auto; display: flex; gap: 4px; }
.pa-card__mode { font: inherit; min-width: 36px; min-height: 32px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); cursor: pointer; }
.pa-card__mode--on { border-color: var(--color-primary-element); background: var(--color-primary-element-light); }
</style>
