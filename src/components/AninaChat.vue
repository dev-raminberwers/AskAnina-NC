<template>
	<div class="pa-nova">
		<div class="pa-nova__kop">
			<strong>{{ t('Ask Anina') }}</strong>
			<span v-if="stand && stand.enabled" class="pa-nova__teller">{{ t('%s of %s questions this month', stand.used, stand.limit) }}</span>
			<button type="button" class="pa-nova__x" :title="t('Close')" @click="$emit('close')">×</button>
		</div>

		<!-- Eerst uitleg en akkoord: wat er wordt verstuurd en dat wij niets bewaren. -->
		<div v-if="!akkoord" class="pa-nova__uitleg">
			<p>{{ t('Anina can answer questions about the day you are looking at. Your question, the appointments and journeys on this screen, your open tasks and your first name are sent to our server and from there to Claude (Anthropic) to compose the answer. We keep nothing of the conversation; only the number of questions per month is counted.') }}</p>
			<p>{{ t('Anina only answers and advises. Changes you still make yourself in the app.') }}</p>
			<NcButton type="primary" @click="$emit('akkoord')">{{ t('OK, ask Anina') }}</NcButton>
		</div>

		<template v-else>
			<NcNoteCard v-if="stand && !stand.enabled" type="warning">{{ t('Anina with AI is not switched on for this server yet.') }} {{ t('You can add your own Anthropic API key under Settings, Account, APIs.') }}</NcNoteCard>
			<div ref="lijst" class="pa-nova__lijst">
				<p v-if="!beurten.length" class="pa-nova__hint">{{ t('For example: what is on my plate today, when do I have to leave, do I have time for lunch?') }}</p>
				<div v-for="(b, i) in beurten" :key="i" class="pa-nova__beurt" :class="'pa-nova__beurt--' + b.role">
					{{ b.content }}
					<!-- Genoemde afspraken als knopje: klik = naar die dag (Ramin, 2026-09-15). -->
					<span v-if="b.refs && b.refs.length" class="pa-nova__refs">
						<button v-for="r in b.refs" :key="r.date + r.title" type="button" class="pa-nova__ref" @click="$emit('ga-naar', r)">📅 {{ dagTekst(r.date) }} · {{ r.title }}</button>
					</span>
				</div>
				<div v-if="bezig" class="pa-nova__beurt pa-nova__beurt--assistant pa-nova__beurt--wacht">…</div>
			</div>
			<FoutMelding v-if="error" :error="error" />
			<form class="pa-nova__rij" @submit.prevent="stuur">
				<input v-model="tekst" type="text" :placeholder="luistert ? t('Listening…') : t('Your question')" :disabled="bezig" class="pa-nova__veld">
				<!-- Spraak: inspreken en voorlezen, met wat de browser zelf kan (Ramin, 2026-09-15). -->
				<button v-if="kanLuisteren" type="button" class="pa-nova__knop" :class="{ 'pa-nova__knop--aan': luistert }" :title="t('Speak your question')" :disabled="bezig" @click="luister">🎤</button>
				<button v-if="kanSpreken" type="button" class="pa-nova__knop" :class="{ 'pa-nova__knop--aan': voorlezen }" :title="voorlezen ? t('Stop reading answers aloud') : t('Read answers aloud')" @click="wisselVoorlezen">{{ voorlezen ? '🔊' : '🔇' }}</button>
				<NcButton type="primary" native-type="submit" :disabled="bezig || !tekst.trim()">{{ t('Ask') }}</NcButton>
			</form>
		</template>
	</div>
</template>

<script>
import NcButton from '@nextcloud/vue/components/NcButton'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import { t, currentLocale } from '../l10n/index.js'
import { aninaFoutTekst } from '../api/fouten.js'
import FoutMelding from './FoutMelding.vue'
import { askAnina, aninaStatus } from '../api/paApi.js'

/**
 * Anina met AI, voorproefje (Deck 41, 2026-09-15): een klein gesprek over de
 * dag die op het scherm staat. De ouder levert de context (afspraken, reizen,
 * taken, naam, taal); het gesprek zelf blijft in de browser.
 */
export default {
	name: 'AninaChat',
	components: { NcButton, NcNoteCard, FoutMelding },
	props: {
		ownerKey: { type: String, default: '' },
		context: { type: Object, required: true },
		akkoord: { type: Boolean, default: false },
		/** Eigen Anthropic-sleutel uit de instellingen; leeg = serversleutel. */
		apiKey: { type: String, default: '' },
		workspaceId: { type: String, default: '' },
		/** Claude, OpenAI of Gemini (2026-09-16); leeg = instelling op de server. */
		provider: { type: String, default: '' },
		/** Taalcode voor luisteren en praten; leeg = de taal van de app. */
		taal: { type: String, default: '' },
		/**
		 * Een vraag die meteen gesteld wordt bij het openen.
		 *
		 * Voor knoppen die Anina openen met een onderwerp -- "wat kan ik X geven?" bij de cadeauvraag.
		 * Leeg = gewoon een leeg venster.
		 */
		beginVraag: { type: String, default: '' },
	},
	emits: ['close', 'akkoord', 'ga-naar', 'formulier'],
	data() {
		const Herkenner = window.SpeechRecognition || window.webkitSpeechRecognition
		let voorlezen = false
		try { voorlezen = localStorage.getItem('pa.nova.voorlezen') === '1' } catch (e) { /* geen opslag */ }
		// viaSpraak: kwam de laatste vraag via de microfoon? Dan gaat het gesprek in spraak
		// verder: een vraag terug wordt voorgelezen en daarna luistert de browser weer (2026-09-16).
		return { tekst: '', beurten: [], bezig: false, error: null, stand: null, kanLuisteren: !!Herkenner, kanSpreken: !!window.speechSynthesis, luistert: false, voorlezen, herkenner: null, viaSpraak: false }
	},
	beforeUnmount() {
		if (this.herkenner) { try { this.herkenner.abort() } catch (e) { /* al gestopt */ } }
		if (window.speechSynthesis) window.speechSynthesis.cancel()
	},
	async mounted() {
		try { this.stand = await aninaStatus(this.ownerKey, !!this.apiKey, this.provider || null) } catch (e) { this.stand = null }
		// Een knop die Anina met een onderwerp opent, stelt die vraag meteen -- anders moet je zelf typen
		// wat je net hebt aangeklikt.
		if (this.beginVraag) {
			this.tekst = this.beginVraag
			this.stuur()
		}
	},
	methods: {
		t(...args) { return t(...args) },
		dagTekst(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString(currentLocale(), { weekday: 'short', day: 'numeric', month: 'short' }) },
		/** Microfoon: één zin inspreken, de herkende tekst gaat meteen als vraag weg. */
		luister() {
			const Herkenner = window.SpeechRecognition || window.webkitSpeechRecognition
			if (!Herkenner) return
			if (this.luistert && this.herkenner) { this.herkenner.stop(); return }
			const h = new Herkenner()
			h.lang = this.spraakTaal()
			h.interimResults = true
			h.maxAlternatives = 1
			h.onresult = (e) => {
				let tekst = ''
				for (const r of e.results) tekst += r[0].transcript
				this.tekst = tekst
				if (e.results[e.results.length - 1].isFinal) { this.luistert = false; this.viaSpraak = true; this.stuur() }
			}
			h.onerror = () => { this.luistert = false }
			h.onend = () => { this.luistert = false }
			this.herkenner = h
			this.luistert = true
			try { h.start() } catch (e) { this.luistert = false }
		},
		/** nl → nl-NL enz.; anders de app-taal. */
		spraakTaal() {
			const kaart = { nl: 'nl-NL', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-PT' }
			return (this.taal && kaart[this.taal]) || currentLocale() || 'nl-NL'
		},
		wisselVoorlezen() {
			this.voorlezen = !this.voorlezen
			try { localStorage.setItem('pa.nova.voorlezen', this.voorlezen ? '1' : '0') } catch (e) { /* geen opslag */ }
			if (!this.voorlezen && window.speechSynthesis) window.speechSynthesis.cancel()
		},
		/** Voorlezen; met daarna = true gaat de microfoon na het voorlezen weer open. */
		spreek(tekst, altijd = false, daarna = false) {
			if ((!this.voorlezen && !altijd) || !window.speechSynthesis) { if (daarna) this.luister(); return }
			window.speechSynthesis.cancel()
			const u = new SpeechSynthesisUtterance(tekst)
			u.lang = this.spraakTaal()
			if (daarna) { u.onend = () => this.luister(); u.onerror = () => this.luister() }
			window.speechSynthesis.speak(u)
		},
		async stuur() {
			const vraag = this.tekst.trim()
			if (!vraag || this.bezig) return
			this.tekst = ''
			this.error = null
			const geschiedenis = this.beurten.slice(-8)
			this.beurten.push({ role: 'user', content: vraag })
			const viaSpraak = this.viaSpraak
			this.viaSpraak = false
			this.bezig = true
			try {
				const uit = await askAnina(this.ownerKey, vraag, this.context, geschiedenis, this.apiKey || null, this.workspaceId || null, this.provider || null)
				// Een ingevuld afspraakformulier (Ramin, 2026-09-16): de ouder opent het
				// gewone formulier, de gebruiker kijkt na en slaat op.
				const formulier = uit.form && uit.form.type === 'appointment' ? uit.form : null
				const tekstUit = formulier && !uit.answer ? t('Check the form and save.') : uit.answer
				this.beurten.push({ role: 'assistant', content: tekstUit, refs: Array.isArray(uit.refs) ? uit.refs : [] })
				// Een vraag terug (welke Bart? ochtend of avond?) gaat in spraak als de vraag in spraak kwam.
				this.spreek(tekstUit, viaSpraak && (uit.listen || !!formulier), viaSpraak && uit.listen && !formulier)
				if (this.stand) { this.stand.used = uit.used; this.stand.limit = uit.limit }
				if (formulier) this.$emit('formulier', formulier)
			} catch (e) {
				this.error = aninaFoutTekst(e)
			} finally {
				this.bezig = false
				this.$nextTick(() => { const l = this.$refs.lijst; if (l) l.scrollTop = l.scrollHeight })
			}
		},
	},
}
</script>

<style scoped>
.pa-nova { border: 1px solid var(--color-border, #ccc); border-radius: 14px; padding: 12px 14px; margin: 12px 0; background: var(--color-main-background, #fff); display: flex; flex-direction: column; gap: 8px; max-width: 48em; }
.pa-nova__kop { display: flex; align-items: center; gap: 10px; }
.pa-nova__teller { color: var(--color-text-maxcontrast, #666); font-size: 0.85em; margin-left: auto; }
.pa-nova__x { border: none; background: none; font-size: 1.3em; cursor: pointer; color: inherit; line-height: 1; }
.pa-nova__uitleg p { margin: 0 0 8px; font-size: 0.95em; }
.pa-nova__lijst { max-height: 40vh; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.pa-nova__hint { color: var(--color-text-maxcontrast, #666); font-size: 0.9em; margin: 0; }
.pa-nova__beurt { padding: 8px 12px; border-radius: 12px; white-space: pre-wrap; max-width: 90%; }
.pa-nova__beurt--user { align-self: flex-end; background: var(--color-primary-element, #1e3a5f); color: var(--color-primary-element-text, #fff); }
.pa-nova__beurt--assistant { align-self: flex-start; background: var(--color-background-hover, #f0f0f0); }
.pa-nova__beurt--wacht { color: var(--color-text-maxcontrast, #666); }
.pa-nova__rij { display: flex; gap: 6px; }
.pa-nova__refs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.pa-nova__ref { border: 1px solid var(--color-border, #ccc); background: var(--color-main-background, #fff); color: var(--color-main-text, #222); border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 0.85em; cursor: pointer; }
.pa-nova__ref:hover { border-color: var(--color-primary-element, #1e3a5f); }
.pa-nova__veld { flex: 1; }
.pa-nova__knop { border: 1px solid var(--color-border, #ccc); background: var(--color-main-background, #fff); border-radius: 50%; width: 34px; height: 34px; cursor: pointer; font-size: 1.1em; line-height: 1; padding: 0; }
.pa-nova__knop--aan { border-color: var(--color-primary-element, #1e3a5f); box-shadow: 0 0 0 2px var(--color-primary-element-light, #cfe0f5); }
</style>
