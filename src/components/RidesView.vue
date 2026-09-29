<template>
	<div class="pa-rit">
		<div class="pa-rit__kop">
			<h2>{{ t('Rides') }}</h2>
			<select v-if="kentekens.length > 1" :value="kenteken" class="pa-rit__keuze" @change="kenteken = $event.target.value; laad()">
				<option v-for="k in kentekens" :key="k.plate" :value="k.plate">{{ k.plate }} ({{ k.count }})</option>
			</select>
			<div class="pa-rit__maand">
				<button type="button" class="pa-rit__pijl" :title="t('Previous month')" @click="verschuif(-1)">‹</button>
				<span>{{ maandLabel }}</span>
				<button type="button" class="pa-rit__pijl" :title="t('Next month')" @click="verschuif(1)">›</button>
			</div>
		</div>

		<FoutMelding v-if="error" :error="error" />
		<NcLoadingIcon v-else-if="bezig" :size="24" />

		<template v-else>
			<!-- De totalen bovenaan: waarvoor je deze administratie bijhoudt. -->
			<div class="pa-rit__totalen">
				<span class="pa-rit__totaal"><strong>{{ km(totalen.business) }}</strong> {{ t('business') }}</span>
				<span class="pa-rit__totaal"><strong>{{ km(totalen.private) }}</strong> {{ t('private') }}</span>
				<span class="pa-rit__totaal pa-rit__totaal--alles"><strong>{{ km(totalen.all) }}</strong> {{ t('total') }}</span>
			</div>

			<p v-if="!ritten.length" class="pa-rit__leeg">{{ t('No rides this month. Your phone records them while you drive.') }}</p>

			<div v-for="r in ritten" :key="r.id" class="pa-rit__rij">
				<div class="pa-rit__tijd">
					<strong>{{ dag(r.startAt) }}</strong>
					<small>{{ klok(r.startAt) }}<template v-if="r.endAt"> – {{ klok(r.endAt) }}</template></small>
				</div>
				<div class="pa-rit__route">
					<div class="pa-rit__adressen">{{ r.fromAddress || t('Unknown') }} → {{ r.toAddress || t('Unknown') }}</div>
					<small v-if="r.odometerStart || r.odometerEnd">{{ r.odometerStart }} – {{ r.odometerEnd }} km</small>
					<input class="pa-rit__omschrijving" :value="r.description || ''" :placeholder="t('What was this ride for?')"
						@change="zetVeld(r, { description: $event.target.value })">
				</div>
				<div class="pa-rit__km">{{ km(r.km) }}</div>
				<!-- Zakelijk of prive: het enige dat je achteraf nog wilt kunnen wijzigen. -->
				<div class="pa-rit__doel">
					<button type="button" class="pa-rit__knop" :class="{ 'pa-rit__knop--aan': r.purpose === 'business' }"
						@click="zetVeld(r, { purpose: 'business' })">{{ t('business') }}</button>
					<button type="button" class="pa-rit__knop" :class="{ 'pa-rit__knop--aan': r.purpose !== 'business' }"
						@click="zetVeld(r, { purpose: 'private' })">{{ t('private') }}</button>
				</div>
			</div>
		</template>
	</div>
</template>

<script>
import { t, currentLocale } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import { getAccessCode } from '../api/accessCode.js'
import * as paApi from '../api/paApi.js'
import FoutMelding from './FoutMelding.vue'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import { volgSync } from '../api/sync.js'

/**
 * De rittenadministratie, zoals op de telefoon (Ramin, 24-09).
 *
 * De telefoon legt ritten vast terwijl je rijdt; dit scherm laat ze zien en laat je achteraf zeggen of
 * een rit zakelijk of prive was. Meer valt er niet te doen: een rit die je niet gereden hebt, kun je hier
 * niet verzinnen, en de kilometers komen van de auto zelf.
 *
 * Het adres `rides.php` bestond al voor de telefoon -- alleen dit scherm ontbrak aan deze kant.
 */
export default {
	name: 'RidesView',
	components: { FoutMelding, NcLoadingIcon },
	data() {
		const nu = new Date()
		return {
			stopKijken: null,
			jaar: nu.getFullYear(), maand: nu.getMonth() + 1,
			kenteken: '', kentekens: [], ritten: [], totalen: { business: 0, private: 0, all: 0 },
			bezig: true, error: null,
		}
	},
	computed: {
		maandLabel() {
			return new Date(this.jaar, this.maand - 1, 1).toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric' })
		},
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
	},
	async mounted() {
		// Meeluisteren met je andere apparaten (Ramin, 24-09): verandert dit elders, dan staat
		// het hier meteen goed in plaats van pas als je het scherm opnieuw opent.
		this.stopKijken = volgSync(() => this.laad())
		const code = getAccessCode()
		if (code) {
			const p = await paApi.ridePlates(code).catch(() => null)
			this.kentekens = (p && p.plates) || []
			this.kenteken = (this.kentekens[0] || {}).plate || ''
		}
		await this.laad()
	},
	methods: {
		t,
		km(v) { return (Math.round((Number(v) || 0) * 10) / 10).toLocaleString(currentLocale()) + ' km' },
		dag(iso) { return new Date(iso).toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short' }) },
		klok(iso) { return new Date(iso).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }) },
		verschuif(n) {
			const d = new Date(this.jaar, this.maand - 1 + n, 1)
			this.jaar = d.getFullYear()
			this.maand = d.getMonth() + 1
			this.laad()
		},
		async laad() {
			this.bezig = true
			const code = getAccessCode()
			if (!code) { this.bezig = false; return }
			try {
				const r = await paApi.rides(code, this.kenteken, this.jaar, this.maand)
				this.ritten = r.rides || []
				this.totalen = r.totals || { business: 0, private: 0, all: 0 }
				this.error = null
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.bezig = false
			}
		},
		/**
		 * Een rit aanpassen. De server rekent de totalen opnieuw uit, dus die halen we daarna opnieuw op in
		 * plaats van ze hier na te rekenen -- twee sommen over hetzelfde lopen vroeg of laat uiteen.
		 */
		async zetVeld(rit, velden) {
			Object.assign(rit, velden)
			const code = getAccessCode()
			if (!code) return
			await paApi.rideUpdate(code, rit.id, velden).catch(() => {})
			await this.laad()
		},
	},
}
</script>

<style scoped>
.pa-rit__kop { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.pa-rit__keuze { font: inherit; padding: 3px 8px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: inherit; }
.pa-rit__maand { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.pa-rit__pijl { font: inherit; font-size: 1.2em; border: 0; background: transparent; color: inherit; cursor: pointer; opacity: 0.65; padding: 0 4px; }
.pa-rit__pijl:hover { opacity: 1; }
.pa-rit__totalen { display: flex; gap: 18px; flex-wrap: wrap; margin: 12px 0 16px; }
.pa-rit__totaal { font-size: 0.92em; color: var(--color-text-maxcontrast, #666); }
.pa-rit__totaal strong { font-size: 1.25em; color: var(--color-main-text); margin-right: 4px; font-variant-numeric: tabular-nums; }
.pa-rit__totaal--alles strong { color: var(--color-primary-element); }
.pa-rit__leeg { color: var(--color-text-maxcontrast, #666); }
.pa-rit__rij { display: flex; gap: 14px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid var(--color-border); }
.pa-rit__tijd { display: flex; flex-direction: column; min-width: 78px; font-variant-numeric: tabular-nums; }
.pa-rit__tijd small { color: var(--color-text-maxcontrast, #666); }
.pa-rit__route { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.pa-rit__adressen { overflow-wrap: anywhere; }
.pa-rit__omschrijving { font: inherit; font-size: 0.9em; border: 0; border-bottom: 1px dashed var(--color-border); background: transparent; color: inherit; padding: 2px 0; }
.pa-rit__km { min-width: 72px; text-align: right; font-variant-numeric: tabular-nums; }
.pa-rit__doel { display: flex; gap: 4px; }
.pa-rit__knop { font: inherit; font-size: 0.82em; border: 1px solid var(--color-border); background: transparent; color: inherit; border-radius: 999px; padding: 2px 10px; cursor: pointer; }
.pa-rit__knop--aan { background: var(--color-primary-element-light); font-weight: 600; }

@media (max-width: 700px) {
	.pa-rit__rij { flex-wrap: wrap; }
	.pa-rit__km { min-width: 0; text-align: left; }
}
</style>
