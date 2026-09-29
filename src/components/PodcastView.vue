<template>
	<div class="pa-pod">
		<div class="pa-pod__toolbar">
			<button v-if="gekozen" type="button" class="pa-pod__terug" @click="gekozen = null; afleveringen = []">‹ {{ t('Back') }}</button>
			<h2>{{ gekozen ? gekozen.name : t('Podcasts') }}</h2>
		</div>
		<FoutMelding v-if="error" :error="error" />
		<NcLoadingIcon v-else-if="loading" :size="24" />

		<!-- De wachtrij: wat er nog op je wacht, van al je podcasts door elkaar en nieuwste eerst
		     (Ramin, 24-09: "bij podcasts, toon de episodes, niet de podcasts -- de queue van de
		     episodes"). Wat je gehoord hebt valt eruit, en wat er was voordat je je abonneerde telt niet
		     mee: een nieuwe aanmelding is geen achterstand van jaren. -->
		<template v-else-if="!gekozen && toont === 'wachtrij'">
			<div class="pa-pod__toon">
				<button type="button" class="pa-pod__toonknop pa-pod__toonknop--aan">{{ t('Up next') }} <span v-if="wachtrij.length" class="pa-pod__telling">{{ wachtrij.length }}</span></button>
				<button type="button" class="pa-pod__toonknop" @click="toont = 'shows'">{{ t('My podcasts') }}</button>
			</div>
			<p v-if="!podcasts.length" class="pa-pod__leeg">
				{{ t('No podcasts yet. Search and subscribe under Settings.') }}
				<button type="button" class="pa-pod__knop" @click="naarInstellingen">{{ t('Go to Settings') }}</button>
			</p>
			<p v-else-if="!wachtrij.length && !wachtrijBezig" class="pa-pod__leeg">{{ t('Nothing left to listen to. New episodes appear here by themselves.') }}</p>
			<NcLoadingIcon v-if="wachtrijBezig" :size="24" />
			<div v-for="ep in wachtrij" :key="ep.id" class="pa-pod__ep" :class="{ 'pa-pod__ep--nu': speler.huidig && speler.huidig.id === ep.id }">
				<!-- De hoes met de duur eronder, in de mono-letter -- zoals op de telefoon. De duur stond
				     eerder tussen de andere gegevens en viel daar weg. -->
				<div class="pa-pod__epkolom">
					<img :src="podcastBeeld(ep.showArt)" alt="" class="pa-pod__epart">
					<span v-if="ep.duration" class="pa-pod__epduur">{{ duur(ep.duration) }}</span>
				</div>
				<div class="pa-pod__eptekst">
					<div class="pa-pod__epshow">{{ ep.showName }}</div>
					<div class="pa-pod__eptitel">{{ ep.title }}</div>
					<div class="pa-pod__epmeta">
						<template v-if="ep.published">{{ datum(ep.published) }}</template>
						<template v-if="positie(ep) > 30"> · {{ t('Continue where you left off') }} ({{ duur(positie(ep)) }})</template>
					</div>
				<!-- Waar de aflevering over gaat, zolang je hem nog niet gehoord hebt (zoals de telefoon). -->
				<div v-if="ep.summary" class="pa-pod__epsamenvatting">{{ ep.summary }}</div>
				</div>
				<button type="button" class="pa-pod__knop" @click="speel(ep)">
					{{ speler.huidig && speler.huidig.id === ep.id && speler.speelt ? t('Pause') : t('Play') }}
				</button>
				<button type="button" class="pa-pod__knop" :title="t('Mark as played')" @click="zetGehoord(ep)">✓</button>
			</div>
		</template>

		<!-- Je abonnementen. -->
		<template v-else-if="!gekozen">
			<div class="pa-pod__toon">
				<button type="button" class="pa-pod__toonknop" @click="toont = 'wachtrij'">{{ t('Up next') }}</button>
				<button type="button" class="pa-pod__toonknop pa-pod__toonknop--aan">{{ t('My podcasts') }}</button>
			</div>
			<p v-if="!podcasts.length" class="pa-pod__leeg">
				{{ t('No podcasts yet. Search and subscribe under Settings.') }}
				<button type="button" class="pa-pod__knop" @click="naarInstellingen">{{ t('Go to Settings') }}</button>
			</p>
			<div class="pa-pod__rooster">
				<button v-for="p in podcasts" :key="p.feedUrl" type="button" class="pa-pod__tegel" @click="kies(p)">
					<img :src="podcastBeeld(p.artwork)" alt="" class="pa-pod__art">
					<span class="pa-pod__naam">{{ p.name }}</span>
					<small>{{ p.artist }}</small>
				</button>
			</div>
		</template>

		<!-- Afleveringen van één podcast. -->
		<template v-else>
			<div v-for="ep in afleveringen" :key="ep.id" class="pa-pod__ep" :class="{ 'pa-pod__ep--nu': speler.huidig && speler.huidig.id === ep.id }">
				<div class="pa-pod__eptekst">
					<div class="pa-pod__eptitel">{{ ep.title }}</div>
					<div class="pa-pod__epmeta">
						<template v-if="ep.published">{{ datum(ep.published) }}</template>
						<template v-if="ep.duration"> · {{ duur(ep.duration) }}</template>
						<template v-if="positie(ep) > 30"> · {{ t('Continue where you left off') }} ({{ duur(positie(ep)) }})</template>
					</div>
					<div class="pa-pod__epsamenvatting">{{ ep.summary }}</div>
				</div>
				<button v-if="ep.audio" type="button" class="pa-pod__knop pa-pod__knop--primair" @click="speel(ep)">
					{{ speler.huidig && speler.huidig.id === ep.id && speler.speelt ? '❚❚' : '▶' }}
				</button>
			</div>
		</template>

	</div>
</template>

<script>
/**
 * Podcasts (Ramin, 2026-09-15, kaart PODCAST PLAYER): je abonnementen uit de
 * instellingen (podcasts), de afleveringen via onze server, en een speler die
 * onthoudt waar je was (per aflevering, in deze browser) met afspeelsnelheid.
 */
import { staat as speler, speel as speelAf, positieVan } from '../api/speler.js'
import * as paApi from '../api/paApi.js'
import { getAccessCode } from '../api/accessCode.js'
import { getSettings } from '../api/nextcloudUserData.js'
import * as gezien from '../api/gezien.js'
import { watch } from 'vue'
import { staat as sync, gingOver } from '../api/sync.js'
import { navigatie } from '../api/navigatie.js'
import { t, currentLocale } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import FoutMelding from './FoutMelding.vue'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import { podcastBeeld } from '../api/aninaBeeld.js'
import { meld as meldTelling } from '../api/tellingen.js'


export default {
	name: 'PodcastView',
	components: { FoutMelding, NcLoadingIcon },
	data() {
		return { speler, stopKijken: null, podcasts: [], gekozen: null, afleveringen: [], loading: true, error: null, toont: 'wachtrij', wachtrij: [], wachtrijBezig: false, beluisterd: [], gehoordTot: {}, vanaf: {} }
	},
	async mounted() {
		await this.load()
		/*
		 * Meeluisteren als er elders iets beluisterd is (Ramin, 24-09). Vink je een aflevering af op je
		 * telefoon, dan hoort hij hier meteen uit de wachtrij te vallen -- niet pas als je van scherm
		 * wisselt.
		 */
		this.stopKijken = watch(() => sync.versie, async () => {
			if (!gingOver('seen', 'settings', 'feeds')) return
			this.beluisterd = await gezien.haal('podcastListened')
			this.bouwWachtrij()
		})
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
	},
	methods: {
		podcastBeeld,
		t(...args) { return t(...args) },
		datum(iso) { return new Date(iso).toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) },
		duur(sec) {
			const s = Math.round(sec)
			const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60)
			return h ? `${h}:${String(m).padStart(2, '0')} u` : `${m} min`
		},
		naarInstellingen() { navigatie.verzoek = { tab: 'settings', onderdeel: 'general' } },
		/** Waar je gebleven was; de speler bewaart dit, dit scherm laat het alleen zien. */
		positie(ep) {
			return positieVan(ep)
		},
		async load() {
			this.loading = true
			try {
				const s = (await getSettings()) || {}
				this.podcasts = Array.isArray(s.podcasts) ? s.podcasts : []
				// Waar je gebleven bent, gedeeld met de telefoon (24-09). Zonder dit zou de wachtrij
				// afleveringen tonen die je daar allang gehoord hebt.
				// Beluisterd staat sinds 24-09 in een eigen lijst; alleen ophalen als de vingerafdruk
				// afwijkt van wat we al hebben (zie gezien.js).
				this.beluisterd = await gezien.haal('podcastListened')
				this.gehoordTot = (s.podcastListenedUpTo && typeof s.podcastListenedUpTo === 'object') ? s.podcastListenedUpTo : {}
				this.vanaf = (s.podcastFrom && typeof s.podcastFrom === 'object') ? s.podcastFrom : {}
				this.error = null
				this.bouwWachtrij()
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.loading = false
			}
		},
		/** Is deze aflevering al gehad? Op de sleutel, of omdat hij ouder is dan "alles gehoord tot". */
		alGehoord(feedUrl, ep) {
			const sleutels = [ep.id, ep.audio && ep.audio.url, ep.link].filter(Boolean)
			if (sleutels.some((k) => this.beluisterd.includes(k))) return true
			const tot = this.gehoordTot[feedUrl] || ''
			return !!tot && !!ep.published && ep.published <= tot
		},
		/**
		 * De wachtrij: alles wat nog op je wacht, van al je podcasts door elkaar en nieuwste eerst.
		 *
		 * De feeds worden een voor een opgehaald en de lijst groeit mee, zodat je niet naar een leeg
		 * scherm kijkt tot de traagste podcast binnen is.
		 */
		async bouwWachtrij() {
			this.wachtrijBezig = true
			const uit = []
			// Weet de telefoon niet vanaf wanneer deze podcast meetelt, dan kijken we een maand terug in
			// plaats van naar alles wat er ooit was. Zonder die grens stonden er 1528 afleveringen klaar
			// (24-09) -- het complete archief van elke podcast, en dus geen wachtrij meer.
			const maandTerug = new Date(Date.now() - 30 * 86400000).toISOString()
			// Alle podcasts in één verzoek, en de server laat meteen weg wat ouder is dan we tonen
			// (Ramin, 24-09: *"waarom worden er 40 podcasts opgehaald?"*). Veertig heen-en-weertjes voor
			// een wachtrij is verkeer zonder opbrengst; de server had ze toch al gecachet.
			const vroegste = this.podcasts
				.map((p) => this.vanaf[p.feedUrl] || maandTerug)
				.reduce((a, b) => (a < b ? a : b), maandTerug)
			const d = await paApi.feedBundel(getAccessCode(), this.podcasts.map((p) => p.feedUrl), { sinds: vroegste, max: 60 })
				.catch(() => null)
			const feeds = (d && d.feeds) || []
			this.podcasts.forEach((p, i) => {
				const feed = feeds[i]
				if (!feed) return
				const start = this.vanaf[p.feedUrl] || maandTerug
				for (const ep of (feed.items || [])) {
					if (!ep.audio || !ep.audio.url) continue
					if (start && (ep.published || '') < start) continue
					if (this.alGehoord(p.feedUrl, ep)) continue
					uit.push({ ...ep, feedUrl: p.feedUrl, showName: p.name || feed.title, showArt: p.artwork || feed.image || '' })
				}
			})
			this.wachtrij = uit.slice().sort((a, b) => (b.published || '').localeCompare(a.published || ''))
			// Het menu en het rechterpaneel dragen dit als badge (Ramin, 24-09).
			meldTelling('podcasts', this.wachtrij.length)
			this.wachtrijBezig = false
		},
		/** Afgevinkt: hij valt uit de wachtrij en dat geldt ook op je telefoon. */
		async zetGehoord(ep) {
			const sleutel = (ep.audio && ep.audio.url) || ep.id
			this.wachtrij = this.wachtrij.filter((x) => x.id !== ep.id)
			meldTelling('podcasts', this.wachtrij.length)
			// Alleen deze ene sleutel naar de server, niet de hele lijst (24-09).
			this.beluisterd = await gezien.pas('podcastListened', [sleutel])
		},
		async kies(p) {
			this.gekozen = p
			this.loading = true
			try {
				const feed = await paApi.feedFetch(getAccessCode(), p.feedUrl)
				this.afleveringen = (feed.items || []).filter((x) => x.audio)
				if (!p.artwork && feed.image) p.artwork = feed.image
				this.error = null
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.loading = false
			}
		},
		/**
		 * Afspelen gaat via de gedeelde speler (25-09): die zit in App.vue en blijft leven als je naar een
		 * ander scherm gaat. Dit scherm zegt alleen WELKE aflevering aan de beurt is.
		 */
		speel(ep) {
			speelAf(ep, ep.image || (this.gekozen && this.gekozen.artwork) || '')
		},
	},
}
</script>

<style scoped>
.pa-pod { max-width: 60em; padding-bottom: 120px; }
.pa-pod__toolbar { display: flex; align-items: center; gap: 12px; }
.pa-pod__toolbar h2 { margin: 0; }
.pa-pod__terug { background: none; border: none; cursor: pointer; color: var(--color-primary-element, #1e3a5f); font: inherit; }
.pa-pod__leeg { color: var(--color-text-maxcontrast, #666); display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.pa-pod__knop { background: none; border: 1px solid var(--color-border-dark, #bbb); border-radius: 999px; padding: 6px 14px; cursor: pointer; color: inherit; font: inherit; }
.pa-pod__knop--primair { background: var(--color-primary-element, #1e3a5f); color: var(--color-primary-element-text, #fff); border-color: transparent; min-width: 44px; }
.pa-pod__rooster { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; margin-top: 12px; }
.pa-pod__tegel { background: none; border: 1px solid var(--color-border, #ddd); border-radius: 12px; padding: 10px; cursor: pointer; color: inherit; font: inherit; text-align: left; display: flex; flex-direction: column; gap: 4px; }
.pa-pod__tegel:hover { background: var(--color-background-hover, #f4f4f4); }
.pa-pod__art { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; }
.pa-pod__naam { font-weight: bold; }
.pa-pod__tegel small { color: var(--color-text-maxcontrast, #666); }
.pa-pod__toon { display: flex; gap: 6px; margin: 0 0 10px; }
.pa-pod__toonknop { font: inherit; font-size: 0.9em; border: 1px solid var(--color-border, #ccc); background: transparent; color: inherit; border-radius: 999px; padding: 3px 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.pa-pod__toonknop--aan { background: var(--color-primary-element-light); font-weight: 600; }
.pa-pod__telling { font-size: 0.85em; background: var(--color-primary-element); color: var(--color-primary-element-text, #fff); border-radius: 999px; padding: 0 6px; }
.pa-pod__epart { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; flex: 0 0 auto; }
/* De hoes met de duur eronder, zoals op de telefoon: de duur in de mono-letter van het ontwerp. */
.pa-pod__epkolom { display: flex; flex-direction: column; align-items: center; gap: 2px; flex: 0 0 auto; }
.pa-pod__epduur { font-family: "IBM Plex Mono", monospace; font-size: 10.5px;
	color: var(--pa-ink3, var(--color-text-maxcontrast, #777)); }
.pa-pod__epshow { font-size: 0.82em; color: var(--color-text-maxcontrast, #666); }
.pa-pod__ep { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0;
	border-bottom: 1px solid var(--pa-line, var(--color-border, #eee)); }
.pa-pod__ep--nu { background: var(--color-background-hover, #f4f4f4); }
.pa-pod__eptekst { flex: 1; min-width: 0; }
.pa-pod__eptitel { font-weight: bold; }
.pa-pod__epmeta { font-size: 0.8em; color: var(--color-text-maxcontrast, #666); }
.pa-pod__epsamenvatting { font-size: 0.9em; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pa-pod__speler { position: fixed; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: var(--color-main-background, #fff); border-top: 1px solid var(--color-border, #ddd); box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.12); z-index: 20; }
.pa-pod__spelerart { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; }
.pa-pod__spelertekst { flex: 1; min-width: 0; }
.pa-pod__spelertitel { font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pa-pod__audio { width: 100%; }
.pa-pod__snelheid { font-size: 0.85em; display: flex; flex-direction: column; gap: 2px; }
</style>
