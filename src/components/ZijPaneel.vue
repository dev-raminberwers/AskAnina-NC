<template>
	<aside v-if="tabbladen.length" class="pa-zij">
		<div v-show="!zij.deckKaartOpen" class="pa-zij__tabs">
			<button v-for="t in tabbladen" :key="t.id" type="button" class="pa-zij__tab"
				:class="{ 'pa-zij__tab--aan': actief === t.id }" @click="kies(t.id)">
				{{ t.naam() }}
				<span v-if="tellingen[t.id]" class="pa-zij__badge">{{ tellingen[t.id] }}</span>
			</button>
			<button type="button" class="pa-zij__instel" :title="t('Choose panels')" @click="instellen = !instellen">⚙</button>
		</div>

		<!-- Welke panelen je hier wilt. Dit is een keuze van dit scherm en niet van je telefoon: een brede
		     monitor vraagt iets anders dan een duim. De knop eronder deelt de keuze wel met je andere
		     apparaten, voor wie overal hetzelfde wil (Ramin, 24-09). -->
		<div v-if="instellen" class="pa-zij__kiezer">
			<label v-for="m in MOGELIJK" :key="m.id" class="pa-zij__keuze">
				<input type="checkbox" :checked="gekozen.includes(m.id)" @change="wissel(m.id)">
				{{ m.naam() }}
			</label>
			<button type="button" class="pa-zij__sync" :disabled="syncBezig" @click="deelMetApparaten">
				{{ syncBezig ? t('Syncing…') : (gesynct ? t('Shared') : t('Use this on all my devices')) }}
			</button>
		</div>

		<!-- Waar de Deck-kaart landt (Ramin, 24-09). DeckView zet zijn eigen bewerkvenster hierin met een
		     Teleport; staat er geen kaart open, dan blijft dit vak leeg en zie je gewoon je paneel. -->
		<div id="pa-zij-deckkaart" class="pa-zij__deckkaart" />

		<div v-show="!zij.deckKaartOpen" class="pa-zij__inhoud">
			<component :is="component" v-if="component" :key="actief" :in-paneel="true" />
		</div>
	</aside>
</template>

<script>
import { t } from '../l10n/index.js'
import { zijPaneel } from '../api/navigatie.js'
import { getSettings, setSettings } from '../api/nextcloudUserData.js'
import RssView from './RssView.vue'
import PodcastView from './PodcastView.vue'
import TasksView from './TasksView.vue'
import NotesView from './NotesView.vue'
import OpenItemsView from './OpenItemsView.vue'
import GroceriesView from './GroceriesView.vue'

/**
 * De panelen die naast je scherm kunnen staan. Alleen schermen die smal nog leesbaar zijn: een agenda of
 * een kaart heeft breedte nodig, een lijst niet.
 */
const MOGELIJK = [
	{ id: 'news', naam: () => t('News'), component: 'RssView' },
	{ id: 'podcasts', naam: () => t('Podcasts'), component: 'PodcastView' },
	{ id: 'tasks', naam: () => t('Tasks'), component: 'TasksView' },
	{ id: 'notes', naam: () => t('Notes'), component: 'NotesView' },
	{ id: 'open', naam: () => t('Open items'), component: 'OpenItemsView' },
	{ id: 'groceries', naam: () => t('Shopping list'), component: 'GroceriesView' },
]

const BEWAARD = 'personalassistant.zijpaneel'

export default {
	name: 'ZijPaneel',
	components: { RssView, PodcastView, TasksView, NotesView, OpenItemsView, GroceriesView },
	props: {
		/** Aantallen per paneel (ongelezen nieuws, open taken), zoals de snelkeuzes op de telefoon. */
		tellingen: { type: Object, default: () => ({}) },
		/** Het scherm waar je nu op staat; dat slaan we over, anders staat hetzelfde twee keer in beeld. */
		huidigeTab: { type: String, default: '' },
	},
	data() {
		return { MOGELIJK, gekozen: [], actief: '', instellen: false, syncBezig: false, gesynct: false, zij: zijPaneel }
	},
	watch: {
		huidigeTab() { this.herstelActief() },
		/** Zonder tabbladen is er geen paneel; dan blijft de kaart in het bord staan. */
		tabbladen: { handler(v) { zijPaneel.aanwezig = (v || []).length > 0 }, immediate: true },
	},
	beforeUnmount() { zijPaneel.aanwezig = false },
	computed: {
		tabbladen() {
			return MOGELIJK.filter((m) => this.gekozen.includes(m.id) && m.id !== this.huidigeTab)
		},
		component() {
			const m = MOGELIJK.find((x) => x.id === this.actief)
			return m ? m.component : null
		},
	},
	async mounted() {
		// Eerst wat je op dit scherm koos; heb je hier nog niets gekozen, dan pakken we over wat je op een
		// ander apparaat deelde. Zo begint een nieuwe browser niet leeg.
		let lokaal = null
		try { lokaal = JSON.parse(localStorage.getItem(BEWAARD) || 'null') } catch (e) { lokaal = null }
		if (Array.isArray(lokaal)) {
			this.gekozen = lokaal
		} else {
			const s = await getSettings().catch(() => null)
			this.gekozen = Array.isArray(s && s.sidePanelTabs) ? s.sidePanelTabs : ['news', 'tasks']
		}
		this.actief = this.gekozen[0] || ''
		zijPaneel.aanwezig = this.tabbladen.length > 0
	},
	methods: {
		t,
		kies(id) { this.actief = id },
		/** Loop je naar het scherm dat rechts openstond, dan pakt het paneel het volgende tabblad. */
		herstelActief() {
			if (!this.tabbladen.some((x) => x.id === this.actief)) this.actief = (this.tabbladen[0] || {}).id || ''
		},
		wissel(id) {
			this.gekozen = this.gekozen.includes(id) ? this.gekozen.filter((x) => x !== id) : this.gekozen.concat([id])
			this.gesynct = false
			try { localStorage.setItem(BEWAARD, JSON.stringify(this.gekozen)) } catch (e) { /* prive-venster */ }
			if (!this.gekozen.includes(this.actief)) this.actief = this.gekozen[0] || ''
		},
		/** Deze indeling ook op je telefoon en je andere browsers. */
		async deelMetApparaten() {
			this.syncBezig = true
			const s = await getSettings().catch(() => null)
			if (s) await setSettings({ ...s, sidePanelTabs: this.gekozen.slice() }).catch(() => {})
			this.syncBezig = false
			this.gesynct = true
		},
	},
}
</script>

<style scoped>
.pa-zij { flex: 0 0 38%; max-width: 520px; min-width: 300px; border-left: 1px solid var(--color-border); display: flex; flex-direction: column; min-height: 0; }
.pa-zij__tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--color-border); }
.pa-zij__tab { font: inherit; font-size: 0.86em; border: 1px solid transparent; background: transparent; color: inherit; border-radius: 999px; padding: 3px 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
.pa-zij__tab:hover { background: var(--color-background-hover); }
.pa-zij__tab--aan { background: var(--color-primary-element-light); border-color: var(--color-border); font-weight: 600; }
.pa-zij__badge { font-size: 0.78em; background: var(--color-primary-element); color: var(--color-primary-element-text, #fff); border-radius: 999px; padding: 0 5px; min-width: 16px; text-align: center; }
.pa-zij__instel { margin-left: auto; font: inherit; border: 0; background: transparent; color: inherit; cursor: pointer; opacity: 0.6; padding: 2px 6px; }
.pa-zij__instel:hover { opacity: 1; }
.pa-zij__kiezer { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border-bottom: 1px solid var(--color-border); font-size: 0.9em; }
.pa-zij__keuze { display: flex; align-items: center; gap: 7px; }
.pa-zij__sync { margin-top: 6px; align-self: flex-start; font: inherit; font-size: 0.9em; border: 1px solid var(--color-border); background: transparent; color: inherit; border-radius: 999px; padding: 3px 12px; cursor: pointer; }
.pa-zij__inhoud { flex: 1; overflow-y: auto; padding: 10px 12px 20px; }

/* Op een smal scherm is er geen ruimte naast; dan valt het paneel gewoon weg. */
@media (max-width: 1100px) {
	.pa-zij { display: none; }
}

/* Waar een Deck-kaart landt (Ramin, 24-09). Leeg = onzichtbaar, zodat het paneel er normaal uitziet.
   De open kaart blijft in beeld als je het bord scrollt -- naast het bord stond hij ook vast.
   Onder de statusbalk beginnen, anders schuift hij eronder. */
.pa-zij__deckkaart:empty { display: none; }
.pa-zij__deckkaart { position: sticky; top: 0; height: calc(100vh - 16px); overflow-y: auto;
	padding: 8px; box-sizing: border-box; background: var(--color-main-background, #fff);
	display: flex; flex-direction: column; }
</style>
