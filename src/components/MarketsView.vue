<template>
	<div class="pa-markt">
		<div class="pa-markt__toolbar">
			<h2>{{ t('Markets') }}</h2>
			<button type="button" class="pa-markt__knop" :title="t('Refresh')" @click="ververs">↻</button>
		</div>
		<FoutMelding v-if="error" :error="error" />
		<!-- Zoeken: aandeel, fonds, index, grondstof of crypto (kaart 99, 2026-09-16). -->
		<input id="pa-markt-zoek" v-model="zoek" type="search" class="pa-markt__veld" :placeholder="t('Search a share, fund, index, commodity or crypto')" @input="zoekLater">
		<ul v-if="zoek.trim() && treffers.length" class="pa-markt__treffers">
			<li v-for="tr in treffers" :key="tr.symbol">
				<button type="button" class="pa-markt__treffer" :disabled="volgtAl(tr.symbol)" @click="volg(tr)">
					<strong>{{ tr.name || tr.symbol }}</strong>
					<small>{{ [tr.symbol, soort(tr.type), tr.exchange].filter(Boolean).join(' · ') }}</small>
					<span v-if="!volgtAl(tr.symbol)" class="pa-markt__plus">+</span>
				</button>
			</li>
		</ul>
		<p v-else-if="zoek.trim() && zoekBezig" class="pa-markt__leeg">{{ t('Searching…') }}</p>

		<p v-if="!lijst.length" class="pa-markt__leeg">{{ t('Nothing followed yet. Search above and tap a result to follow it.') }}</p>
		<NcLoadingIcon v-else-if="loading && !Object.keys(koersen).length" :size="24" />
		<table v-else class="pa-markt__tabel">
			<tbody>
				<tr v-for="s in lijst" :key="s.symbol">
					<td>
						<div class="pa-markt__naam">{{ (koersen[s.symbol] && koersen[s.symbol].name) || s.name || s.symbol }}</div>
						<small>{{ [s.symbol, koersen[s.symbol] && soort(koersen[s.symbol].type), koersen[s.symbol] && tijd(koersen[s.symbol].time)].filter(Boolean).join(' · ') }}</small>
					</td>
					<td class="pa-markt__koers">
						<template v-if="koersen[s.symbol]">
							<div class="pa-markt__prijs">{{ prijs(koersen[s.symbol]) }}</div>
							<div :class="['pa-markt__pct', richting(koersen[s.symbol].changePercent)]">{{ pct(koersen[s.symbol].changePercent) }}</div>
						</template>
						<small v-else>{{ t('No quote') }}</small>
					</td>
					<td class="pa-markt__acties">
						<button type="button" class="pa-markt__x" :title="t('Stop following')" @click="stop(s)">×</button>
					</td>
				</tr>
			</tbody>
		</table>
		<p v-if="lijst.length" class="pa-markt__hint">{{ t('Quotes are delayed by about 15 minutes.') }}</p>
	</div>
</template>

<script>
import * as paApi from '../api/paApi.js'
import { getAccessCode } from '../api/accessCode.js'
import { getSettings, setSettings } from '../api/nextcloudUserData.js'
import { t, currentLocale } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import FoutMelding from './FoutMelding.vue'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'

/**
 * Beurs (kaart 99, Ramin, 2026-09-16): aandelen, fondsen, indexen,
 * obligaties, grondstoffen en crypto volgen. De lijst staat in de
 * instellingen (marketSymbols, dezelfde als op de telefoon); koersen komen
 * via onze server, een kwartier vertraagd, en verversen elke vijf minuten.
 */
export default {
	name: 'MarketsView',
	components: { FoutMelding, NcLoadingIcon },
	data() {
		return { settings: {}, lijst: [], koersen: {}, loading: false, error: null, zoek: '', treffers: [], zoekBezig: false, zoekTimer: null, klok: null }
	},
	async mounted() {
		try {
			this.settings = (await getSettings()) || {}
			this.lijst = Array.isArray(this.settings.marketSymbols) ? this.settings.marketSymbols : []
		} catch (e) { this.error = foutTekst(e) }
		await this.ververs()
		this.klok = setInterval(() => this.ververs(), 5 * 60 * 1000)
	},
	beforeUnmount() {
		clearInterval(this.klok)
		clearTimeout(this.zoekTimer)
	},
	methods: {
		t(...args) { return t(...args) },
		volgtAl(symbool) { return this.lijst.some((s) => s.symbol.toUpperCase() === String(symbool).toUpperCase()) },
		async ververs() {
			if (!this.lijst.length) { this.koersen = {}; return }
			this.loading = true
			try {
				const uit = await paApi.marketQuotes(getAccessCode(), this.lijst.map((s) => s.symbol).join(','))
				const per = {}
				for (const k of uit) per[k.symbol.toUpperCase()] = k
				this.koersen = per
				this.error = null
			} catch (e) { this.error = foutTekst(e) } finally { this.loading = false }
		},
		zoekLater() {
			clearTimeout(this.zoekTimer)
			const q = this.zoek.trim()
			if (!q) { this.treffers = []; return }
			this.zoekTimer = setTimeout(async () => {
				this.zoekBezig = true
				try { this.treffers = (await paApi.marketSearch(getAccessCode(), q)).slice(0, 8) } catch (e) { this.treffers = [] } finally { this.zoekBezig = false }
			}, 400)
		},
		async bewaar(nieuw) {
			this.lijst = nieuw
			try {
				const s = (await getSettings()) || {}
				await setSettings({ ...s, marketSymbols: nieuw })
			} catch (e) { this.error = foutTekst(e) }
		},
		async volg(tr) {
			if (this.volgtAl(tr.symbol)) return
			await this.bewaar([...this.lijst, { symbol: tr.symbol.toUpperCase(), name: tr.name || '' }])
			this.zoek = ''
			this.treffers = []
			await this.ververs()
		},
		async stop(s) {
			await this.bewaar(this.lijst.filter((x) => x.symbol !== s.symbol))
		},
		soort(type) {
			const kaart = { equity: t('share'), etf: t('fund'), mutualfund: t('fund'), index: t('index'), future: t('commodity'), cryptocurrency: t('crypto'), currency: t('currency') }
			return kaart[String(type || '').toLowerCase()] || ''
		},
		prijs(k) {
			const getal = k.price >= 1000 ? Math.round(k.price).toLocaleString(currentLocale()) : k.price.toLocaleString(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
			return [k.currency, getal].filter(Boolean).join(' ')
		},
		pct(p) { return p == null ? '' : (p > 0 ? '+' : '') + p.toFixed(2) + ' %' },
		richting(p) { return p > 0 ? 'pa-markt__pct--op' : (p < 0 ? 'pa-markt__pct--neer' : '') },
		tijd(iso) { return iso ? new Date(iso).toLocaleString(currentLocale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '' },
	},
}
</script>

<style scoped>
.pa-markt { padding: 12px 16px; max-width: 48em; }
.pa-markt__toolbar { display: flex; align-items: center; gap: 10px; }
.pa-markt__toolbar h2 { flex: 1; margin: 0; }
.pa-markt__knop { border: 1px solid var(--color-border, #ccc); background: var(--color-main-background, #fff); border-radius: 50%; width: 34px; height: 34px; cursor: pointer; }
.pa-markt__veld { width: 100%; margin: 10px 0 4px; }
.pa-markt__treffers { list-style: none; padding: 0; margin: 0 0 10px; }
.pa-markt__treffer { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; border: none; background: none; padding: 8px 6px; cursor: pointer; border-radius: 8px; color: inherit; font: inherit; }
.pa-markt__treffer:hover:not(:disabled) { background: var(--color-background-hover, #f0f0f0); }
.pa-markt__treffer small { color: var(--color-text-maxcontrast, #666); flex: 1; }
.pa-markt__plus { font-size: 1.3em; color: var(--color-primary-element, #1e3a5f); }
.pa-markt__tabel { width: 100%; border-collapse: collapse; margin-top: 8px; }
.pa-markt__tabel td { padding: 10px 6px; border-bottom: 1px solid var(--color-border, #eee); vertical-align: middle; }
.pa-markt__naam { font-weight: 600; }
.pa-markt__tabel small { color: var(--color-text-maxcontrast, #666); }
.pa-markt__koers { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.pa-markt__prijs { font-weight: 600; }
.pa-markt__pct { font-size: 0.9em; }
.pa-markt__pct--op { color: #2e8b57; }
.pa-markt__pct--neer { color: #d64541; }
.pa-markt__acties { width: 34px; text-align: right; }
.pa-markt__x { border: none; background: none; font-size: 1.3em; cursor: pointer; color: #d64541; }
.pa-markt__leeg, .pa-markt__hint { color: var(--color-text-maxcontrast, #666); font-size: 0.9em; }
</style>
