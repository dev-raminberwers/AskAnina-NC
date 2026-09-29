<template>
	<div class="pa-serie">
		<h2>{{ t('Series') }}</h2>
		<p class="pa-hint">{{ t('Follow a series and its new episodes show up in your day.') }}</p>

		<div class="pa-serie__zoek">
			<input v-model="vraag" type="search" class="pa-serie__veld" :placeholder="t('Search a series')" @keyup.enter="zoek">
			<button type="button" class="pa-serie__knopje" :disabled="zoekt || !vraag.trim()" @click="zoek">
				{{ zoekt ? t('Searching…') : t('Search') }}
			</button>
		</div>

		<FoutMelding v-if="error" :error="error" />

		<!-- Zoekresultaten, alleen zolang je aan het zoeken bent. -->
		<div v-if="treffers.length" class="pa-serie__treffers">
			<button v-for="s in treffers" :key="s.id" type="button" class="pa-serie__treffer"
				:disabled="volgtAl(s.id)" @click="volg(s)">
				<img v-if="s.image" :src="s.image" alt="" class="pa-serie__art">
				<span class="pa-serie__trefferTekst">
					<strong>{{ s.name }}</strong>
					<small>{{ [s.provider, s.status, s.premiered && s.premiered.slice(0, 4)].filter(Boolean).join(' · ') }}</small>
				</span>
				<span class="pa-serie__plus">{{ volgtAl(s.id) ? '✓' : '+' }}</span>
			</button>
			<button type="button" class="pa-serie__knopje" @click="treffers = []">{{ t('Close') }}</button>
		</div>

		<NcLoadingIcon v-if="bezig" :size="24" />

		<p v-else-if="!gevolgd.length" class="pa-serie__leeg">{{ t('You are not following any series yet.') }}</p>

		<!-- Wat je volgt, met wat er als eerstvolgende komt. -->
		<div v-for="s in gevolgd" :key="s.id" class="pa-serie__rij">
			<img v-if="s.image" :src="s.image" alt="" class="pa-serie__art">
			<div class="pa-serie__tekst">
				<div class="pa-serie__naam">{{ s.name }}</div>
				<small v-if="s.provider">{{ s.provider }}</small>
				<small v-if="volgende[s.id]" class="pa-serie__volgende">
					{{ t('Next: %s', aflevering(volgende[s.id])) }}
				</small>
				<small v-else-if="geladen[s.id]" class="pa-serie__gestopt">{{ t('Nothing announced.') }}</small>
			</div>
			<button type="button" class="pa-serie__knopje" @click="ontvolg(s.id)">{{ t('Unfollow') }}</button>
		</div>
	</div>
</template>

<script>
import { t, currentLocale } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import { getSettings, setSettings } from '../api/nextcloudUserData.js'
import { getAccessCode } from '../api/accessCode.js'
import * as paApi from '../api/paApi.js'
import FoutMelding from './FoutMelding.vue'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import { watch } from 'vue'
import { staat as sync, gingOver } from '../api/sync.js'

/**
 * Series volgen (Ramin, 24-09): hetzelfde scherm als op de telefoon.
 *
 * De lijst die je volgt staat in je gedeelde instellingen, dus wat je hier toevoegt staat ook op je
 * telefoon en andersom. De gegevens komen van TVMaze via onze eigen server -- een browser mag niet
 * rechtstreeks naar een ander adres, en dat is met opzet zo.
 */
export default {
	name: 'SeriesView',
	components: { FoutMelding, NcLoadingIcon },
	data() {
		return { vraag: '', treffers: [], gevolgd: [], volgende: {}, geladen: {}, zoekt: false, bezig: true, error: null, stopKijken: null }
	},
	async mounted() {
		await this.laadGevolgd()
		// Volg je op je telefoon een serie, dan staat hij hier meteen ook (24-09).
		this.stopKijken = watch(() => sync.versie, () => {
			if (gingOver('settings')) this.laadGevolgd()
		})
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
	},
	methods: {
		t,
		async laadGevolgd() {
			const s = await getSettings().catch(() => null)
			this.gevolgd = Array.isArray(s && s.series) ? s.series.map((x) => ({ ...x })) : []
			this.bezig = false
			this.gevolgd.forEach((x) => this.laadVolgende(x.id))
		},
		volgtAl(id) { return this.gevolgd.some((x) => x.id === id) },
		aflevering(ep) {
			const wanneer = ep.airstamp ? new Date(ep.airstamp).toLocaleDateString(currentLocale(), { weekday: 'short', day: 'numeric', month: 'short' }) : ''
			return [`${ep.season}x${ep.number}`, ep.name, wanneer].filter(Boolean).join(' · ')
		},
		async zoek() {
			if (!this.vraag.trim()) return
			this.zoekt = true
			try {
				const rij = await paApi.seriesSearch(getAccessCode(), this.vraag.trim())
				this.treffers = (rij || []).map((r) => {
					const sh = r.show || r
					return {
						id: sh.id,
						name: sh.name,
						provider: (sh.network || sh.webChannel || {}).name || '',
						image: (sh.image || {}).medium || '',
						status: sh.status || '',
						premiered: sh.premiered || '',
					}
				})
				this.error = null
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.zoekt = false
			}
		},
		/** Wat er als eerstvolgende komt; een serie die is afgelopen heeft dat niet, en dat mag je zien. */
		async laadVolgende(id) {
			const d = await paApi.seriesShow(getAccessCode(), id).catch(() => null)
			this.geladen = { ...this.geladen, [id]: true }
			if (!d) return
			const eps = ((d._embedded || {}).episodes) || []
			const nu = new Date().toISOString()
			const komend = eps.filter((e) => (e.airstamp || '') > nu).sort((a, b) => (a.airstamp || '').localeCompare(b.airstamp || ''))
			if (komend[0]) this.volgende = { ...this.volgende, [id]: komend[0] }
		},
		async volg(s) {
			if (this.volgtAl(s.id)) return
			this.gevolgd = this.gevolgd.concat([{ id: s.id, name: s.name, provider: s.provider, image: s.image }])
			await this.bewaar()
			this.laadVolgende(s.id)
		},
		async ontvolg(id) {
			this.gevolgd = this.gevolgd.filter((x) => x.id !== id)
			await this.bewaar()
		},
		async bewaar() {
			const s = await getSettings().catch(() => null)
			if (s) await setSettings({ ...s, series: this.gevolgd }).catch(() => {})
		},
	},
}
</script>

<style scoped>
.pa-hint { color: var(--color-text-maxcontrast, #666); }
.pa-serie__zoek { display: flex; gap: 8px; margin: 10px 0 16px; }
.pa-serie__veld { flex: 1; font: inherit; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--color-border); background: var(--color-main-background); color: inherit; }
.pa-serie__knopje { font: inherit; font-size: 0.85em; border: 1px solid var(--color-border); background: transparent; color: inherit; border-radius: 999px; padding: 3px 11px; cursor: pointer; }
.pa-serie__treffers { display: flex; flex-direction: column; gap: 4px; margin-bottom: 18px; padding: 8px; border: 1px solid var(--color-border); border-radius: var(--border-radius-large); }
.pa-serie__treffer { display: flex; align-items: center; gap: 10px; font: inherit; text-align: left; border: 0; background: transparent; color: inherit; cursor: pointer; padding: 5px; border-radius: 8px; }
.pa-serie__treffer:hover:not(:disabled) { background: var(--color-background-hover); }
.pa-serie__treffer:disabled { opacity: 0.55; cursor: default; }
.pa-serie__trefferTekst { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.pa-serie__trefferTekst small { color: var(--color-text-maxcontrast, #666); }
.pa-serie__plus { font-size: 1.1em; opacity: 0.7; }
.pa-serie__rij { display: flex; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--color-border); }
.pa-serie__art { width: 44px; height: 62px; object-fit: cover; border-radius: 5px; flex: 0 0 auto; }
.pa-serie__tekst { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pa-serie__naam { font-weight: 600; }
.pa-serie__tekst small { color: var(--color-text-maxcontrast, #666); }
.pa-serie__volgende { color: var(--color-primary-element); }
.pa-serie__leeg { color: var(--color-text-maxcontrast, #666); }
</style>
