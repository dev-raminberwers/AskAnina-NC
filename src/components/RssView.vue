<template>
	<div class="pa-rss">
		<!-- Artikel open: foto boven, artikel eronder, kop linkt naar het origineel (Ramin, 2026-09-15). -->
		<div v-if="open" class="pa-rss__artikel">
			<button type="button" class="pa-rss__terug" @click="open = null">‹ {{ t('Back') }}</button>
			<button type="button" class="pa-rss__ster pa-rss__ster--groot" :class="{ 'pa-rss__ster--aan': heeftSter(open) }"
				:title="heeftSter(open) ? t('Remove star') : t('Save for later')" @click="wisselSter(open)">
				{{ heeftSter(open) ? '★' : '☆' }}
			</button>
			<img :src="nieuwsBeeld(open.image || extraBeeld[open.link])" alt="" class="pa-rss__foto">
			<h2 class="pa-rss__kop"><a :href="open.link" target="_blank" rel="noopener">{{ open.title }}</a></h2>
			<div class="pa-rss__meta">{{ open.feedTitle }}<template v-if="open.published"> · {{ datum(open.published) }}</template></div>
			<div v-if="open.content" class="pa-rss__inhoud" v-html="open.content" />
			<p v-else class="pa-rss__inhoud">{{ open.summary }}</p>
			<a :href="open.link" target="_blank" rel="noopener" class="pa-rss__origineel">{{ t('Read the original') }} ↗</a>
		</div>

		<template v-else>
			<div class="pa-rss__toolbar">
				<h2>{{ t('News') }}</h2>
				<button type="button" class="pa-rss__knop" :disabled="loading" @click="load">↻</button>
			</div>
			<FoutMelding v-if="error" :error="error" />
			<NcLoadingIcon v-else-if="loading" :size="24" />
			<p v-else-if="!feeds.length" class="pa-rss__leeg">
				{{ t('No feeds yet. Add them under Settings.') }}
				<button type="button" class="pa-rss__knop" @click="naarInstellingen">{{ t('Go to Settings') }}</button>
			</p>
			<p v-else-if="!items.length" class="pa-rss__leeg">{{ t('Nothing new.') }}</p>
			<!-- Wat je gelezen hebt telt op al je apparaten (Ramin, 24-09): open je een bericht hier, dan
			     is het op je telefoon ook gelezen. -->
			<div v-if="items.length" class="pa-rss__balk">
				<!-- Alleen een filter, geen teller (Ramin, 24-09). Een getal naast "ongelezen" las alsof de
				     ster daar iets over zei; het is een aparte lijst en geen stand. Net als op de telefoon:
				     een chip met een ster, meer niet. -->
				<button type="button" class="pa-rss__knopje" :class="{ 'pa-rss__knopje--aan': alleenSterren }"
					:title="t('Favourites')" @click="alleenSterren = !alleenSterren">★</button>
				<!-- De keuze hoort bij het scherm, niet bij het paneel ernaast (Ramin, 24-09): daar staat
				     geen knop, maar hij volgt wel wat je hier koos. -->
				<button v-if="!inPaneel" type="button" class="pa-rss__knopje" :class="{ 'pa-rss__knopje--aan': alleenOngelezen }"
					@click="wisselOngelezen">{{ t('Show unread only') }}</button>
				<span>{{ t('%s unread', String(ongelezenAantal)) }}</span>
				<button v-if="ongelezenAantal" type="button" class="pa-rss__knopje" @click="allesGelezen">{{ t('Mark all as read') }}</button>
			</div>
			<!-- Compact: kop vet, de eerste regels van het bericht, foto rechts -- zoals op de telefoon. -->
			<div v-for="it in zichtbaar" :key="it.feedUrl + it.id" class="pa-rss__item"
				:class="{ 'pa-rss__item--gelezen': isGelezen(it) }" @click="openItem(it)">
				<!-- Later lezen (Ramin, 24-09). De ster staat op de regel zelf, zodat je hem kunt zetten
				     zonder het bericht te openen -- en hij telt op al je apparaten. -->
				<button type="button" class="pa-rss__ster" :class="{ 'pa-rss__ster--aan': heeftSter(it) }"
					:title="heeftSter(it) ? t('Remove star') : t('Save for later')" @click.stop="wisselSter(it)">
					{{ heeftSter(it) ? '★' : '☆' }}
				</button>
				<div class="pa-rss__tekst">
					<div class="pa-rss__titel">{{ it.title }}</div>
					<!-- Alleen bij ongelezen, net als op de telefoon: wat je gelezen hebt hoeft zijn eerste
					     regels niet te herhalen, en de lijst wordt er twee keer zo lang van. -->
					<div v-if="!isGelezen(it)" class="pa-rss__samenvatting">{{ it.summary }}</div>
					<div class="pa-rss__meta">{{ it.feedTitle }}<template v-if="it.published"> · {{ datum(it.published) }}</template></div>
				</div>
				<!-- De foto rechts, zoals op de telefoon (RssScreen.kt: "Foto rechts, zoals op het web").
				     Heeft het bericht er geen en levert de pagina er ook geen, dan Anina (24-09): een leeg
				     grijs vlak naast de helft van je berichten zag er kapot uit. -->
				<img :src="nieuwsBeeld(it.image || extraBeeld[it.link])" alt="" class="pa-rss__thumb">
			</div>
		</template>
	</div>
</template>

<script>
/**
 * Nieuws uit RSS-feeds (Ramin, 2026-09-15, kaart RSS-feed): compact lijstje
 * met foto links, kop vet en de eerste regels; klik = artikel open met de foto
 * boven en de kop als link naar het origineel. De feeds staan in je
 * instellingen (rssFeeds) en worden via onze server opgehaald (feeds/fetch.php).
 */
import * as paApi from '../api/paApi.js'
import { getAccessCode } from '../api/accessCode.js'
import { getSettings, setSettings } from '../api/nextcloudUserData.js'
import * as gezien from '../api/gezien.js'
import { navigatie } from '../api/navigatie.js'
import { t, currentLocale } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import FoutMelding from './FoutMelding.vue'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import { watch } from 'vue'
import { staat as sync, gingOver } from '../api/sync.js'
import { nieuwsBeeld } from '../api/aninaBeeld.js'
import { meld as meldTelling } from '../api/tellingen.js'

export default {
	name: 'RssView',
	components: { FoutMelding, NcLoadingIcon },
	props: {
		/** In het paneel naast een scherm: dan geen knoppen voor keuzes, alleen de lijst. */
		inPaneel: { type: Boolean, default: false },
	},
	data() {
		return { feeds: [], items: [], loading: true, error: null, open: null, gelezen: [], extraBeeld: {}, sterren: [], alleenSterren: false, alleenOngelezen: false }
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
	},
	async mounted() {
		// Meeluisteren met de rest van de app (24-09): verandert dit ergens anders, dan staat het
		// hier meteen goed in plaats van pas als je het scherm opnieuw opent.
		this.stopKijken = watch(() => sync.versie, async () => {
			/*
			 * Ook meeluisteren als er elders iets gelezen of gesterd is (Ramin, 24-09: *"ik deed een mark
			 * all read in de webapp; nu moeten de items op de andere devices ook als gelezen worden
			 * gezien"*). Daarvoor keken we alleen naar gewijzigde instellingen, dus een gelezen-melding
			 * ging hier ongemerkt voorbij.
			 *
			 * De berichten zelf zijn niet veranderd, alleen wat je ervan gelezen hebt -- dus geen hele
			 * herlading van vijftien bronnen, alleen de twee lijsten opnieuw.
			 */
			// Wat je gelezen of gesterd hebt: een vingerafdruk-vraag, de lijst komt alleen als hij afwijkt.
			if (gingOver('seen')) {
				this.gelezen = await gezien.haal('rssRead')
				this.sterren = await gezien.haal('rssStarred')
			}
			// De berichten zelf opnieuw ophalen is wel duur (vijftien bronnen), dus alleen als het
			// daarover ging.
			if (gingOver('settings', 'feeds')) this.load()
		})

		await this.load()
	},
	computed: {
		/**
		 * Wat er in de lijst staat. Filter je op sterren, dan zie je alleen die -- ook berichten die je
		 * al gelezen hebt, want een ster betekent "hier wil ik nog iets mee".
		 */
		zichtbaar() {
			// Filter je op favorieten, dan zie je ze allemaal -- gelezen en ongelezen. Een ster zegt "hier
			// wil ik nog iets mee", en dat verandert niet doordat je het al een keer opende.
			if (this.alleenSterren) return this.items.filter((x) => this.heeftSter(x))
			// Alleen ongelezen betekent alleen ongelezen (Ramin, 24-09): een gelezen bericht valt weg, ook
			// als het een ster heeft. Wie zijn favorieten wil zien, kiest het sterfilter hiernaast.
			if (this.alleenOngelezen) return this.items.filter((x) => !this.isGelezen(x))
			return this.items
		},
		ongelezenAantal() {
			return this.items.filter((x) => !this.isGelezen(x)).length
		},
	},
	watch: {
		// Het menu en het rechterpaneel dragen dit getal als badge (Ramin, 24-09). Dit scherm weet het als
		// eerste -- het heeft de lijst net geteld -- dus het zegt het door.
		ongelezenAantal: { handler(n) { meldTelling('nieuws', n) }, immediate: true },
	},
	methods: {
		nieuwsBeeld,
		t(...args) { return t(...args) },
		datum(iso) {
			const d = new Date(iso)
			return d.toLocaleString(currentLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
		},
		/**
		 * Voor berichten zonder eigen plaatje: bij de pagina zelf vragen (Ramin, 24-09: *"zet aan, want als
		 * het wel verschilt, dan is het aan"*).
		 *
		 * Eentje tegelijk en alleen voor wat je ziet -- vijftien feeds ineens opvragen zou een golf
		 * verzoeken opleveren voor berichten die je misschien nooit opent. Levert het niets op, dan blijft
		 * het vlak gewoon leeg; de server onthoudt een week lang dat deze pagina er geen heeft.
		 */
		async haalBeelden() {
			const zonder = this.items.filter((x) => !x.image && x.link && !(x.link in this.extraBeeld)).slice(0, 40)
			for (const it of zonder) {
				const d = await paApi.articleImage(getAccessCode(), it.link).catch(() => null)
				// Ook een leeg antwoord bewaren, anders vragen we het bij elke hertekening opnieuw.
				this.extraBeeld = { ...this.extraBeeld, [it.link]: (d && d.image) || '' }
			}
		},
		/** Dezelfde sleutel als de telefoon: het id van het bericht, en anders de link. */
		sleutel(it) { return (it.id || '').trim() || (it.link || '').trim() },
		isGelezen(it) { return this.gelezen.includes(this.sleutel(it)) },
		heeftSter(it) { return !!it && this.sterren.includes(this.sleutel(it)) },
		/** Ster erbij of eraf, en meteen naar je andere apparaten. */
		async wisselSter(it) {
			const k = this.sleutel(it)
			if (!k) return
			const eraf = this.heeftSter(it)
			this.sterren = await gezien.pas('rssStarred', eraf ? [] : [k], eraf ? [k] : [])
		},
		openItem(it) {
			this.open = it
			const k = this.sleutel(it)
			if (k && !this.gelezen.includes(k)) this.bewaarGelezen([k])
		},
		allesGelezen() {
			const nieuw = this.items.map((x) => this.sleutel(x)).filter(Boolean).filter((k) => !this.gelezen.includes(k))
			if (nieuw.length) this.bewaarGelezen(nieuw)
		},
		/**
		 * Bewaren in je gedeelde instellingen, zodat je telefoon dezelfde stand heeft.
		 *
		 * Alleen de wijziging gaat naar de server; die telt hem bij de lijst op. Zo wist een klik hier
		 * nooit meer wat je telefoon net doorstuurde, en gaat er niet elke keer 124 KB heen en weer.
		 * Zie gezien.js voor het hele verhaal.
		 */
		async bewaarGelezen(erbij = [], eraf = []) {
			this.gelezen = await gezien.pas('rssRead', erbij, eraf)
		},
		/** Onthouden bij je instellingen, zodat je telefoon en het paneel ernaast het ook weten. */
		async wisselOngelezen() {
			this.alleenOngelezen = !this.alleenOngelezen
			const s = await getSettings().catch(() => null)
			if (s) await setSettings({ ...s, feedsUnreadOnly: this.alleenOngelezen }).catch(() => {})
		},
		naarInstellingen() {
			navigatie.verzoek = { tab: 'settings', onderdeel: 'general' }
		},
		async load() {
			this.loading = true
			this.error = null
			try {
				const s = (await getSettings()) || {}
				// Gelezen en sterren staan sinds 24-09 niet meer in je instellingen maar in een eigen
				// lijst, die alleen wordt opgehaald als de vingerafdruk afwijkt (zie gezien.js).
				this.gelezen = await gezien.haal('rssRead')
				this.sterren = await gezien.haal('rssStarred')
				// Zonder te wachten: de lijst staat er al, de plaatjes druppelen erbij.
				this.haalBeelden()
				this.feeds = Array.isArray(s.rssFeeds) ? s.rssFeeds : []
				// Dezelfde instelling als op de telefoon, dus het paneel en het scherm volgen elkaar.
				this.alleenOngelezen = !!s.feedsUnreadOnly
				// Alle bronnen in één verzoek (Ramin, 24-09). Vijftien losse verzoeken leverden niets extra
				// op -- de server heeft ze toch al gecachet -- behalve verkeer.
				const d = await paApi.feedBundel(getAccessCode(), this.feeds.map((f) => f.url), { max: 60 })
				const per = (d.feeds || []).map((feed, i) => {
					const f = this.feeds[i] || {}
					// Een bron die niet gelezen kon worden komt terug als null; de rest gaat gewoon door.
					if (!feed) return []
					return (feed.items || []).map((it) => ({ ...it, feedTitle: feed.title || f.title || f.url, feedUrl: f.url }))
				})
				this.items = per.flat().sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0)).slice(0, 200)
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.loading = false
			}
		},
	},
}
</script>

<style scoped>
.pa-rss__ster { align-self: flex-start; font-size: 1.15em; line-height: 1; border: 0; background: transparent; color: var(--color-text-maxcontrast, #888); cursor: pointer; padding: 2px 4px; }
.pa-rss__ster--aan { color: #e0a800; }
.pa-rss__ster--groot { font-size: 1.5em; }
.pa-rss__item--gelezen .pa-rss__titel { font-weight: 400; opacity: 0.62; }
.pa-rss__item--gelezen .pa-rss__thumb { opacity: 0.55; }
.pa-rss__balk { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; color: var(--color-text-maxcontrast, #666); font-size: 0.9em; }
/* Dezelfde vorm als de chips op de kaarten: omlijnd rondje, geen link-achtige tekst. */
.pa-rss__knopje { font: inherit; font-size: 12.5px; border: 1px solid var(--pa-line, var(--color-border));
	background: transparent; color: var(--pa-ink2, inherit); border-radius: 999px; padding: 3px 11px;
	cursor: pointer; min-height: 28px; }
/* Aan = echt gevuld (Ramin, 24-09). Een lichte tint verschilde te weinig van uit; nu zie je in een
   oogopslag of het filter aanstaat. De rand mee in de vulkleur, anders lijkt hij er los omheen. */
.pa-rss__knopje--aan { background: var(--pa-navy, var(--color-primary-element, #2e8b57));
	border-color: transparent;
	color: var(--pa-navy-ink, var(--color-primary-element-text, #fff)); font-weight: 600; }
.pa-rss { max-width: 60em; }
.pa-rss__toolbar { display: flex; align-items: center; gap: 12px; }
.pa-rss__toolbar h2 { margin: 0; flex: 1; }
.pa-rss__knop { background: none; border: 1px solid var(--color-border-dark, #bbb); border-radius: 999px; padding: 4px 12px; cursor: pointer; color: inherit; font: inherit; }
.pa-rss__leeg { color: var(--color-text-maxcontrast, #666); display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.pa-rss__item { display: flex; gap: 12px; padding: 10px 0;
	border-bottom: 1px solid var(--pa-line, var(--color-border, #eee)); cursor: pointer; }
.pa-rss__item:hover { background: var(--color-background-hover, #f4f4f4); }
/* Het vak is liggend en het plaatje vaak vierkant, dus er valt altijd hoogte weg. Vanaf de bovenkand
   snijden in plaats van uit het midden (Ramin, 24-09): bij een portret blijft de kruin dan staan en
   verdwijnt alleen de onderkant, en bij een persfoto zit het onderwerp toch zelden onderin. */
.pa-rss__thumb { width: 96px; height: 84px; object-fit: cover; object-position: top; border-radius: 8px;
	flex: 0 0 96px; align-self: flex-start; background: var(--pa-surface2, var(--color-background-dark, #e6e6e6)); }
.pa-rss__thumb--leeg { opacity: 0.5; }
.pa-rss__tekst { min-width: 0; flex: 1; }
.pa-rss__titel { font-weight: bold; margin-bottom: 2px; display: -webkit-box; -webkit-line-clamp: 2;
	-webkit-box-orient: vertical; overflow: hidden; }
.pa-rss__samenvatting { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-size: 0.92em; }
.pa-rss__meta { font-size: 0.8em; color: var(--color-text-maxcontrast, #666); margin-top: 3px; }
.pa-rss__artikel { max-width: 46em; }
.pa-rss__terug { background: none; border: none; cursor: pointer; color: var(--color-primary-element, #1e3a5f); font: inherit; padding: 0 0 8px; }
.pa-rss__foto { width: 100%; max-height: 380px; object-fit: cover; object-position: top; border-radius: 10px; }
.pa-rss__kop { margin: 12px 0 4px; }
.pa-rss__kop a { color: inherit; text-decoration: none; }
.pa-rss__kop a:hover { text-decoration: underline; }
.pa-rss__inhoud { line-height: 1.55; margin-top: 10px; }
.pa-rss__inhoud :deep(img) { max-width: 100%; height: auto; }
.pa-rss__origineel { display: inline-block; margin-top: 14px; }
</style>
