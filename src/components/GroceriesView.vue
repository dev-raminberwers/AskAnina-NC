<template>
	<div class="pa-groc">
		<h2>{{ t('Groceries') }}</h2>
		<FoutMelding v-if="error" :error="error" />

<!-- Winkels: je opgeslagen plekken met de categorie supermarkt, plus de winkels die je zelf intypte
		     (kaart 240: "naast product, ook winkel kunnen toevoegen, zoals praxis, Xenos"). Die laatste zijn
		     alleen een naam; ze staan met het voorvoegsel winkel: in hetzelfde veld, net als op de telefoon. -->
		<div class="pa-groc__chips">
			<button type="button" class="pa-groc__chip" :class="{ 'pa-groc__chip--on': store === '' }" @click="store = ''">{{ t('All') }}</button>
			<button v-for="w in stores" :key="w.id" type="button" class="pa-groc__chip" :class="{ 'pa-groc__chip--on': store === w.id }" @click="store = w.id">{{ w.name }}</button>
			<button v-for="w in eigenWinkels" :key="w" type="button" class="pa-groc__chip" :class="{ 'pa-groc__chip--on': store === w }" @click="store = w">{{ eigenNaam(w) }}</button>
			<form class="pa-groc__newstore" @submit.prevent="voegWinkelToe">
				<input v-model="nieuweWinkel" type="text" class="pa-groc__input pa-groc__input--store" :placeholder="t('New shop')">
				<button type="submit" class="pa-groc__chip" :disabled="!nieuweWinkel.trim()">+</button>
			</form>
		</div>

		<form class="pa-groc__add" @submit.prevent="add">
			<input v-model="nieuw.name" type="text" class="pa-groc__input" :placeholder="t('Item')">
			<input v-model="nieuw.quantity" type="text" class="pa-groc__input pa-groc__input--qty" :placeholder="t('Qty')">
			<button type="submit" class="pa-groc__btn pa-groc__btn--primary" :disabled="!nieuw.name.trim()">+</button>
		</form>

		<div class="pa-groc__tabs">
			<button type="button" :class="{ 'pa-groc__tab--on': tab === 'list' }" class="pa-groc__tab" @click="tab = 'list'">{{ t('List') }}</button>
			<button type="button" :class="{ 'pa-groc__tab--on': tab === 'suggestions' }" class="pa-groc__tab" @click="tab = 'suggestions'; loadSuggestions()">{{ t('Suggestions') }}<span v-if="suggesties.length"> ({{ suggesties.length }})</span></button>
			<button type="button" :class="{ 'pa-groc__tab--on': tab === 'products' }" class="pa-groc__tab" @click="tab = 'products'; loadProducts()">{{ t('Products') }}</button>
		</div>

		<NcLoadingIcon v-if="loading" :size="28" />

		<template v-else-if="tab === 'list'">
			<div v-if="afgevinkt.length" class="pa-groc__clear">
				<button type="button" class="pa-groc__btn" @click="clearTicked">{{ t('Clear %d ticked off', afgevinkt.length) }}</button>
			</div>
			<p v-if="!zichtbaar.length" class="pa-groc__empty">{{ t('No groceries yet.') }}</p>
			<div v-for="g in zichtbaar" :key="g.id" class="pa-groc__row" :class="{ 'pa-groc__row--done': g.done }">
				<!-- Je looproute: schuif een product naar de plek waar je het in de winkel tegenkomt. -->
				<button v-if="!g.done" type="button" class="pa-groc__chip" :title="t('Earlier in the shop')" @click="verschuifInRoute(g, -1)">▲</button>
				<button v-if="!g.done" type="button" class="pa-groc__chip" :title="t('Later in the shop')" @click="verschuifInRoute(g, 1)">▼</button>
<button type="button" class="pa-groc__name" @click="toggle(g)">
					<span class="pa-groc__title">{{ g.name }}</span>
				</button>
				<!-- Naar welke winkel deze boodschap hoort. Een keuzelijst en geen tekst: verplaatsen is de
				     handeling die je hier wilt doen (kaart 240). Afgevinkt is het alleen nog geschiedenis. -->
				<select v-if="!g.done" class="pa-groc__store" :value="g.storeId || ''" @change="zetWinkel(g, $event.target.value)">
					<option value="">{{ t('Any shop') }}</option>
					<option v-for="w in stores" :key="w.id" :value="w.id">{{ w.name }}</option>
					<option v-for="w in eigenWinkels" :key="w" :value="w">{{ eigenNaam(w) }}</option>
				</select>
				<span v-else-if="storeName(g.storeId)" class="pa-groc__sub">{{ storeName(g.storeId) }}</span>
				<span class="pa-groc__qtybox">
					<button type="button" class="pa-groc__mini" @click="bump(g, -1)">−</button>
					<span class="pa-groc__qty">{{ g.quantity || '1' }}</span>
					<button type="button" class="pa-groc__mini" @click="bump(g, 1)">+</button>
				</span>
				<button type="button" class="pa-groc__mini pa-groc__mini--del" :title="t('Remove')" @click="remove(g)">🗑</button>
			</div>
		</template>

		<template v-else-if="tab === 'suggestions'">
			<p v-if="!suggesties.length" class="pa-groc__empty">{{ t('No suggestions right now.') }}</p>
			<div v-for="s in suggesties" :key="s.productKey || s.name" class="pa-groc__row">
				<div class="pa-groc__name">
					<span class="pa-groc__title">{{ s.name }}</span>
					<span class="pa-groc__sub">
						<template v-if="s.lastBoughtAt">{{ t('Last bought %s', datum(s.lastBoughtAt)) }}</template>
						<template v-if="s.intervalDays"> · {{ t('every ~%d days', s.intervalDays) }}</template>
					</span>
				</div>
				<button type="button" class="pa-groc__btn pa-groc__btn--primary" @click="addSuggestion(s)">{{ t('Add to list') }}</button>
			</div>
		</template>

		<template v-else>
			<input v-model="zoek" type="text" class="pa-groc__input" :placeholder="t('Search products')" @input="loadProducts">
			<div v-for="p in producten" :key="p.productKey || p.name" class="pa-groc__row">
				<div class="pa-groc__name">
					<span class="pa-groc__title">{{ p.name }}</span>
					<span v-if="p.lastBoughtAt" class="pa-groc__sub">{{ t('Last bought %s', datum(p.lastBoughtAt)) }}</span>
				</div>
				<button type="button" class="pa-groc__btn" @click="addSuggestion(p)">{{ t('Add to list') }}</button>
			</div>
		</template>
	</div>
</template>

<script>
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import { t, currentLocale } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import FoutMelding from './FoutMelding.vue'
import { listGroceries, addGrocery, updateGrocery, removeGroceries, listLocations, getSettings, setSettings } from '../api/nextcloudUserData.js'
import { getAccessCode } from '../api/accessCode.js'
import * as paApi from '../api/paApi.js'
import { watch } from 'vue'
import { staat as sync } from '../api/sync.js'

/**
 * Waaraan je een zelf getypte winkel herkent (kaart 240).
 *
 * Dezelfde waarde als op de telefoon: beide lezen hetzelfde store_id, dus een winkel die je hier intypt
 * staat daar ook. Een opgeslagen plek heeft een id en heeft dit voorvoegsel niet.
 */
const EIGEN = 'winkel:'

/**
 * De boodschappenlijst — dezelfde lijst als op de telefoon, uit het
 * versleutelde bestand in je Nextcloud (2026-09-13). Suggesties en producten
 * komen van de server, uit je bonnen: die weet wat er weer op is.
 */
export default {
	name: 'GroceriesView',
	components: { FoutMelding, NcLoadingIcon, NcNoteCard },
	data() {
		return { loading: true, error: null, tab: 'list', store: '', stores: [], items: [], nieuw: { name: '', quantity: '' }, nieuweWinkel: '', suggesties: [], producten: [], zoek: '', looproute: [] }
	},
	computed: {
		zichtbaar() {
			// Afgevinkt zakt naar onderen in plaats van te verdwijnen: in de winkel wil je kunnen zien dat
			// je iets al hebt. Daarbinnen je eigen looproute door de winkel (Ramin, 24-09) -- hetzelfde
			// veld dat de telefoon gebruikt, dus de route is op beide hetzelfde. Wat er nog niet in staat
			// komt achteraan.
			const plek = (g) => {
				const i = this.looproute.indexOf((g.name || '').trim().toLowerCase())
				return i >= 0 ? i : Number.MAX_SAFE_INTEGER
			}
			return this.items.filter((g) => !this.store || g.storeId === this.store)
				.sort((a, b) => (a.done === b.done ? plek(a) - plek(b) : (a.done ? 1 : -1)))
		},
		afgevinkt() { return this.items.filter((g) => g.done) },
		/**
		 * De winkels die je zelf intypte en die nog iets op de lijst hebben.
		 *
		 * Uit de regels en niet uit een eigen lijst, zodat er niets op te ruimen valt. De winkel die je net
		 * koos hoort er ook bij, ook al hangt er nog geen boodschap aan -- anders verdwijnt de knop precies
		 * op het moment dat je hem net aanmaakte.
		 */
		eigenWinkels() {
			const uit = this.items.map((g) => g.storeId).filter((id) => String(id || '').startsWith(EIGEN))
			if (String(this.store).startsWith(EIGEN)) uit.push(this.store)
			return [...new Set(uit)].sort((a, b) => this.eigenNaam(a).localeCompare(this.eigenNaam(b)))
		},
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
	},
	async mounted() {
		// Meeluisteren met de rest van de app (24-09): verandert dit ergens anders, dan staat het
		// hier meteen goed in plaats van pas als je het scherm opnieuw opent.
		this.stopKijken = watch(() => sync.versie, () => { this.load() })
 await this.load(); this.laadLooproute() },
	methods: {
		/** Je looproute door de winkel, uit dezelfde instelling als de telefoon. */
		async laadLooproute() {
			const s = await getSettings().catch(() => null)
			this.looproute = Array.isArray(s && s.groceryOrder) ? s.groceryOrder.slice() : []
		},
		/**
		 * Een product eerder of later in je route zetten. Producten die nog geen plek hadden krijgen er
		 * hier een, in de volgorde waarin ze nu staan -- anders zou de eerste klik alles door elkaar gooien.
		 */
		async verschuifInRoute(g, richting) {
			const naam = (g.name || '').trim().toLowerCase()
			if (!naam) return
			let route = this.looproute.slice()
			if (!route.includes(naam)) {
				route = this.zichtbaar.filter((x) => !x.done).map((x) => (x.name || '').trim().toLowerCase())
			}
			const van = route.indexOf(naam)
			const naar = van + richting
			if (van < 0 || naar < 0 || naar >= route.length) return
			route.splice(naar, 0, route.splice(van, 1)[0])
			this.looproute = route
			const s = await getSettings().catch(() => null)
			if (s) await setSettings({ ...s, groceryOrder: route }).catch(() => {})
		},

		t(...args) { return t(...args) },
		datum(iso) { const d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short' }) },
		/**
		 * De naam van een winkel: een opgeslagen plek, of de naam die je zelf typte.
		 */
		storeName(id) {
			return this.eigenNaam(id) || this.stores.find((w) => w.id === id)?.name || ''
		},
		/** De naam achter het voorvoegsel, of leeg als dit geen zelf getypte winkel is. */
		eigenNaam(id) {
			return String(id || '').startsWith(EIGEN) ? String(id).slice(EIGEN.length).trim() : ''
		},
		/**
		 * Een winkel erbij.
		 *
		 * Hij komt nergens apart te staan: zodra je hem kiest hangt er een boodschap aan, en daaruit komt de
		 * knop de volgende keer terug. Een winkel waar niets voor nodig is verdwijnt zo vanzelf.
		 */
		voegWinkelToe() {
			const naam = this.nieuweWinkel.trim()
			if (!naam) return
			this.store = EIGEN + naam
			this.nieuweWinkel = ''
		},
		/** Deze boodschap naar een andere winkel. */
		async zetWinkel(g, waarde) {
			try {
				await updateGrocery({ ...g, storeId: waarde })
				g.storeId = waarde
			} catch (e) {
				this.error = e
			}
		},
		async load() {
			this.loading = true; this.error = null
			try {
				this.stores = (await listLocations()).filter((l) => l.category === 'supermarket')
				this.items = await listGroceries()
			} catch (e) { this.error = foutTekst(e) } finally { this.loading = false }
		},
		async add() {
			const name = this.nieuw.name.trim(); if (!name) return
			try {
				const saved = await addGrocery({ name, quantity: this.nieuw.quantity.trim(), storeId: this.store })
				this.items = [...this.items, saved]
				this.nieuw = { name: '', quantity: '' }
			} catch (e) { this.error = foutTekst(e) }
		},
		async addSuggestion(s) {
			try {
				const saved = await addGrocery({ name: s.name, productKey: s.productKey || '', storeId: this.store })
				this.items = [...this.items, saved]
				this.suggesties = this.suggesties.filter((x) => x !== s)
				this.tab = 'list'
			} catch (e) { this.error = foutTekst(e) }
		},
		async toggle(g) {
			const nieuw = { ...g, done: !g.done, boughtAtEpochMillis: g.done ? null : Date.now() }
			this.items = this.items.map((x) => (x.id === g.id ? nieuw : x))
			await updateGrocery(nieuw).catch((e) => { this.error = foutTekst(e) })
		},
		async bump(g, delta) {
			const n = Math.max(1, (parseInt(g.quantity, 10) || 1) + delta)
			const nieuw = { ...g, quantity: String(n) }
			this.items = this.items.map((x) => (x.id === g.id ? nieuw : x))
			await updateGrocery(nieuw).catch((e) => { this.error = foutTekst(e) })
		},
		async remove(g) {
			this.items = this.items.filter((x) => x.id !== g.id)
			await removeGroceries([g.id]).catch((e) => { this.error = foutTekst(e) })
		},
		async clearTicked() {
			const ids = this.afgevinkt.map((g) => g.id)
			this.items = this.items.filter((g) => !g.done)
			await removeGroceries(ids).catch((e) => { this.error = foutTekst(e) })
		},
		async loadSuggestions() {
			try {
				const onList = this.items.filter((g) => !g.done).map((g) => g.name)
				const r = await paApi.suggestions(getAccessCode(), onList)
				this.suggesties = Array.isArray(r) ? r : (r.suggestions || [])
			} catch (e) { this.suggesties = [] }
		},
		async loadProducts() {
			try {
				const r = await paApi.listProducts(getAccessCode(), this.zoek.trim())
				this.producten = Array.isArray(r) ? r : (r.products || [])
			} catch (e) { this.producten = [] }
		},
	},
}
</script>

<style scoped>
.pa-groc__chips, .pa-groc__tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
.pa-groc__chip, .pa-groc__tab { font: inherit; font-size: 0.9em; min-height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); cursor: pointer; }
.pa-groc__chip--on, .pa-groc__tab--on { border-color: var(--color-primary-element); background: var(--color-primary-element-light); }
.pa-groc__add { display: flex; gap: 6px; margin: 8px 0; }
.pa-groc__input { flex: 1; font: inherit; min-height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); }
.pa-groc__input--qty { flex: 0 0 80px; }
.pa-groc__newstore { display: flex; gap: 4px; align-items: center; }
.pa-groc__input--store { flex: 0 0 110px; padding: 2px 6px; font-size: 0.9em; }
.pa-groc__store { max-width: 130px; font-size: 0.85em; }
.pa-groc__row { display: flex; align-items: center; gap: 8px; border: 1px solid var(--color-border); border-radius: var(--border-radius-large); padding: 8px 12px; margin-bottom: 6px; }
.pa-groc__row--done .pa-groc__title { text-decoration: line-through; color: var(--color-text-maxcontrast); }
.pa-groc__name { flex: 1; text-align: left; background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; display: flex; flex-direction: column; }
.pa-groc__title { font-weight: bold; }
.pa-groc__sub { font-size: 0.85em; color: var(--color-text-maxcontrast); }
.pa-groc__qtybox { display: inline-flex; align-items: center; gap: 4px; }
.pa-groc__qty { min-width: 20px; text-align: center; font-family: ui-monospace, monospace; }
.pa-groc__mini { font: inherit; min-width: 30px; min-height: 30px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); cursor: pointer; }
.pa-groc__mini--del { color: var(--color-text-maxcontrast); }
.pa-groc__btn { font: inherit; font-size: 0.85em; min-height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); cursor: pointer; }
.pa-groc__btn--primary { background: var(--color-primary-element); color: var(--color-primary-element-text); border-color: transparent; }
.pa-groc__clear { text-align: right; margin-bottom: 6px; }
.pa-groc__empty { color: var(--color-text-maxcontrast); }
</style>
