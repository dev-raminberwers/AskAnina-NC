<template>
	<div class="pa-bezorg">
		<div class="pa-bezorg__toolbar">
			<h2>{{ t('Deliveries') }}</h2>
			<button type="button" class="pa-bezorg__knop" :title="t('Refresh')" @click="ververs">↻</button>
		</div>
		<FoutMelding v-if="error" :error="error" />

		<!-- Trackingcode invoeren; de vervoerder wordt aan de code herkend (kaart 63). -->
		<form class="pa-bezorg__form" @submit.prevent="volg">
			<input id="pa-bezorg-code" v-model="code" type="text" class="pa-bezorg__veld" :placeholder="t('Tracking code')" autocomplete="off">
			<input id="pa-bezorg-titel" v-model="titel" type="text" class="pa-bezorg__veld" :placeholder="t('Name (optional, e.g. the shop)')" autocomplete="off">
			<NcButton type="primary" native-type="submit" :disabled="bezig || !code.trim()">{{ t('Follow') }}</NcButton>
		</form>
		<p class="pa-bezorg__hint">{{ t('The carrier is recognised from the code. On the expected day a Parcel card appears at home on your timeline.') }}</p>

		<NcLoadingIcon v-if="loading" :size="24" />
		<p v-else-if="!lijst.length" class="pa-bezorg__leeg">{{ t('No parcels followed yet.') }}</p>
		<div v-for="d in lijst" :key="d.id" class="pa-bezorg__kaart">
			<div class="pa-bezorg__kop">
				<strong>{{ d.title || d.trackingNumber }}</strong>
				<span class="pa-bezorg__status" :class="'pa-bezorg__status--' + d.state">{{ statusTekst(d.state) }}</span>
				<button type="button" class="pa-bezorg__x" :title="t('Stop following')" @click="stop(d)">×</button>
			</div>
			<div class="pa-bezorg__feiten">
				<span v-if="d.courier"><span class="l">{{ t('Carrier') }}</span> {{ d.courier }}</span>
				<span><span class="l">{{ t('Tracking code') }}</span> {{ d.trackingNumber }}</span>
				<span v-if="d.expectedDate"><span class="l">{{ t('Expected') }}</span> {{ datum(d.expectedDate) }}</span>
			</div>
			<div v-if="d.lastCheckpoint" class="pa-bezorg__laatste">
				{{ d.lastCheckpoint }}<small v-if="d.lastLocation"> · {{ d.lastLocation }}</small>
			</div>
		</div>
	</div>
</template>

<script>
import * as paApi from '../api/paApi.js'
import { getAccessCode } from '../api/accessCode.js'
import { t, currentLocale } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import FoutMelding from './FoutMelding.vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import { volgSync } from '../api/sync.js'

/**
 * Bezorgingen (kaart 63, Ramin 2026-09-16): trackingcode invoeren, onze
 * server volgt het pakket via AfterShip. Dezelfde lijst als op de telefoon;
 * op de verwachte dag zet de dagplanner een kaart Pakket thuis.
 */
export default {
	name: 'DeliveriesView',
	components: { FoutMelding, NcButton, NcLoadingIcon },
	data() {
		return { stopKijken: null, lijst: [], loading: true, error: null, code: '', titel: '', bezig: false, klok: null }
	},
	async mounted() {
		// Meeluisteren met je andere apparaten (Ramin, 24-09): verandert dit elders, dan staat
		// het hier meteen goed in plaats van pas als je het scherm opnieuw opent.
		this.stopKijken = volgSync(() => this.ververs())
		await this.ververs()
		this.klok = setInterval(() => this.ververs(), 5 * 60 * 1000)
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
		if (this.klok) clearInterval(this.klok)
	},
	methods: {
		t(...args) { return t(...args) },
		async ververs() {
			try {
				const uit = await paApi.deliveries(getAccessCode())
				this.lijst = uit.deliveries || []
				this.error = null
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.loading = false
			}
		},
		async volg() {
			if (this.bezig || !this.code.trim()) return
			this.bezig = true
			try {
				await paApi.deliveryAdd(getAccessCode(), { trackingNumber: this.code.trim(), title: this.titel.trim() || null, language: (currentLocale() || 'nl').slice(0, 2) })
				this.code = ''
				this.titel = ''
				this.error = null
				await this.ververs()
			} catch (e) {
				// Wat de server zegt (bijv. sleutel zonder schrijfrecht) is hier nuttiger dan de algemene tekst.
				this.error = e && e.detail ? String(e.detail).replace(/^tracking failed: /, '') : foutTekst(e)
			} finally {
				this.bezig = false
			}
		},
		async stop(d) {
			try {
				await paApi.deliveryRemove(getAccessCode(), d.id)
				await this.ververs()
			} catch (e) {
				this.error = foutTekst(e)
			}
		},
		statusTekst(state) {
			return { delivered: t('Delivered'), today: t('Out for delivery'), problem: t('Problem'), underway: t('Underway'), pending: t('Registered') }[state] || state
		},
		datum(iso) {
			const d = new Date(iso + 'T12:00:00')
			return isNaN(d) ? iso : d.toLocaleDateString(currentLocale(), { weekday: 'short', day: 'numeric', month: 'short' })
		},
	},
}
</script>

<style scoped>
.pa-bezorg { padding: 8px 16px 24px; max-width: 720px; }
.pa-bezorg__toolbar { display: flex; align-items: center; gap: 10px; }
.pa-bezorg__toolbar h2 { flex: 1; margin: 8px 0; }
.pa-bezorg__knop { font: inherit; min-width: 36px; min-height: 36px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); cursor: pointer; }
.pa-bezorg__form { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
.pa-bezorg__veld { flex: 1 1 180px; min-height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); font: inherit; }
.pa-bezorg__hint, .pa-bezorg__leeg { color: var(--color-text-maxcontrast); font-size: 0.9em; }
.pa-bezorg__kaart { border: 1px solid var(--color-border); border-radius: var(--border-radius-large); padding: 12px 16px; margin-top: 8px; }
.pa-bezorg__kop { display: flex; align-items: center; gap: 8px; }
.pa-bezorg__kop strong { flex: 1; }
.pa-bezorg__status { font-size: 0.7em; text-transform: uppercase; letter-spacing: .06em; border: 1px solid var(--color-border); border-radius: 6px; padding: 2px 6px; }
.pa-bezorg__status--delivered { color: var(--color-success); border-color: var(--color-success); }
.pa-bezorg__status--today { color: var(--color-warning); border-color: var(--color-warning); }
.pa-bezorg__status--problem { color: var(--color-error); border-color: var(--color-error); }
.pa-bezorg__status--underway { color: var(--color-primary-element); border-color: var(--color-primary-element); }
.pa-bezorg__x { font: inherit; min-width: 32px; min-height: 32px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); cursor: pointer; }
.pa-bezorg__feiten { display: flex; gap: 14px; flex-wrap: wrap; font-size: 0.9em; margin-top: 6px; }
.pa-bezorg__feiten .l { color: var(--color-text-maxcontrast); margin-right: 4px; }
.pa-bezorg__laatste { font-size: 0.9em; margin-top: 6px; }
.pa-bezorg__laatste small { color: var(--color-text-maxcontrast); }
</style>
