<template>
	<div class="pa-bel">
		<h2>{{ t('Calls') }}</h2>
		<p class="pa-hint">{{ t('Your calls, so you can add a note to one afterwards.') }}</p>

		<FoutMelding v-if="error" :error="error" />
		<NcLoadingIcon v-else-if="bezig" :size="24" />
		<p v-else-if="!gesprekken.length" class="pa-bel__leeg">{{ t('Nothing here yet. Open Calls on your phone once to send them over.') }}</p>

		<div v-for="g in gesprekken" :key="g.id" class="pa-bel__rij">
			<span class="pa-bel__soort" :title="soortTekst(g)">{{ soortIcoon(g) }}</span>
			<div class="pa-bel__tekst">
				<div class="pa-bel__wie">{{ g.contactName || g.number || t('Unknown') }}</div>
				<small>{{ wanneer(g.startMs) }}<template v-if="duur(g)"> · {{ duur(g) }}</template></small>
				<!-- Wat je erbij schreef; hier te wijzigen, en dat komt op je telefoon terug. -->
				<textarea class="pa-bel__notitie" :value="g.notes" rows="1" :placeholder="t('Add a note')"
					@change="bewaar(g, $event.target.value)" @input="groei($event.target)" />
				<small v-if="g.taskTitle" class="pa-bel__taak">✓ {{ g.taskTitle }}</small>
			</div>
			<div class="pa-bel__acties">
				<a v-if="g.number" class="pa-bel__knopje" :href="'tel:' + g.number">{{ t('Call back') }}</a>
				<button type="button" class="pa-bel__knopje" @click="openFormulier(g)">{{ t('Follow up') }}</button>
				<button type="button" class="pa-bel__knopje" @click="weg(g)">{{ t('Delete') }}</button>
			</div>
		</div>

		<!-- Het belformulier, zoals op de telefoon (Ramin, 24-09): wat besproken is wordt een echte
		     notitie, en wat je nog moet doen een echte taak. Allebei komen ze in je eigen lijsten terecht,
		     niet in een hoekje van dit scherm -- anders moet je op twee plekken kijken. -->
		<div v-if="formulier" class="pa-bel__laag" @click.self="formulier = null">
			<div class="pa-bel__formulier">
				<h3>{{ formulier.contactName || formulier.number || t('Unknown') }}</h3>
				<p class="pa-hint">{{ wanneer(formulier.startMs) }}</p>

				<label class="pa-bel__label">{{ t('What was discussed?') }}</label>
				<textarea v-model="notitieTekst" class="pa-bel__groot" rows="5" :placeholder="t('Add a note')" />

				<label class="pa-bel__label">{{ t('Anything to do afterwards?') }}</label>
				<input v-model="taakTekst" type="text" class="pa-bel__veld" :placeholder="t('Task, for example: send the quote')">
				<input v-model="taakDatum" type="date" class="pa-bel__veld">

				<p v-if="formulierFout" class="pa-bel__fout">{{ formulierFout }}</p>
				<div class="pa-bel__formknoppen">
					<button type="button" class="pa-bel__knopje" @click="formulier = null">{{ t('Cancel') }}</button>
					<button type="button" class="pa-bel__knopje pa-bel__knopje--hoofd" :disabled="bewaren" @click="bewaarFormulier">
						{{ bewaren ? t('Saving…') : t('Save') }}
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import { t, currentLocale } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import { getAccessCode } from '../api/accessCode.js'
import * as paApi from '../api/paApi.js'
import { createNote, createTask } from '../api/shortcutSources.js'
import FoutMelding from './FoutMelding.vue'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import { watch } from 'vue'
import { staat as sync, gingOver } from '../api/sync.js'

/**
 * Gesprekken (Ramin, 24-09): dezelfde lijst als op de telefoon, inclusief de belgeschiedenis.
 *
 * Eerst stuurde de telefoon alleen de gesprekken door waar al iets bij stond. Dat klonk zuinig, maar het
 * maakte dit scherm onbruikbaar voor waar het voor is: Ramin wees erop dat je juist een notitie wilt
 * kunnen zetten bij een gesprek waar nog niets bij staat. Dus gaat de hele lijst mee, en maakt een
 * notitie het gesprek alsnog aan als de server het nog niet kende.
 *
 * Wat je hier schrijft komt op je telefoon terug.
 */
export default {
	name: 'CallsView',
	components: { FoutMelding, NcLoadingIcon },
	data() {
		return { gesprekken: [], bezig: true, error: null, formulier: null, notitieTekst: '', taakTekst: '', taakDatum: '', bewaren: false, formulierFout: '' }
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
	},
	async mounted() {
		// Meeluisteren met de rest van de app (24-09): verandert dit ergens anders, dan staat het
		// hier meteen goed in plaats van pas als je het scherm opnieuw opent.
		this.stopKijken = watch(() => sync.versie, () => { if (gingOver('calls')) this.laad() })

		await this.laad()
	},
	methods: {
		t,
		soortIcoon(g) {
			if (g.callType === 'MISSED') return '📵'
			if (g.direction === 'OUTGOING' || g.callType === 'OUTGOING') return '📤'
			return '📥'
		},
		soortTekst(g) {
			if (g.callType === 'MISSED') return t('Missed')
			if (g.direction === 'OUTGOING' || g.callType === 'OUTGOING') return t('Outgoing')
			return t('Incoming')
		},
		wanneer(ms) {
			return new Date(ms).toLocaleString(currentLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
		},
		/** Hoe lang het duurde; een gemist gesprek heeft geen duur en krijgt er dus ook geen. */
		duur(g) {
			if (!g.answeredMs || !g.endMs) return ''
			const sec = Math.max(0, Math.round((g.endMs - g.answeredMs) / 1000))
			const m = Math.floor(sec / 60)
			return m ? `${m} min` : `${sec} s`
		},
		groei(el) {
			el.style.height = 'auto'
			el.style.height = el.scrollHeight + 'px'
		},
		async laad() {
			this.bezig = true
			try {
				const d = await paApi.callsList(getAccessCode(), 200)
				this.gesprekken = (d && d.calls) || []
				this.error = null
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.bezig = false
			}
		},
		/**
		 * Een notitie bewaren. De gegevens van het gesprek gaan mee, zodat de server het alsnog kan
		 * aanmaken als het er nog niet stond -- je schrijft immers meestal iets bij een gesprek dat tot
		 * dat moment alleen in je belgeschiedenis stond.
		 */
		async bewaar(g, tekst) {
			if (tekst === g.notes) return
			g.notes = tekst
			await paApi.callUpdate(getAccessCode(), g.id, {
				notes: tekst,
				number: g.number,
				contactName: g.contactName,
				direction: g.direction,
				callType: g.callType,
				startMs: g.startMs,
			}).catch(() => {})
		},
		openFormulier(g) {
			this.formulier = g
			this.notitieTekst = g.notes || ''
			this.taakTekst = g.taskTitle || ''
			this.taakDatum = ''
			this.formulierFout = ''
		},
		/**
		 * Opslaan: een notitie in je notitielijst, een taak in je takenlijst, en bij het gesprek zelf
		 * alleen de verwijzing. Zo staat wat je opschreef op de plek waar je het later zoekt.
		 *
		 * Gaat er iets mis, dan zeggen we dat en blijft het formulier staan -- je typwerk kwijtraken aan
		 * een mislukte opslag is het ergste wat een formulier kan doen.
		 */
		async bewaarFormulier() {
			const g = this.formulier
			if (!g) return
			this.bewaren = true
			this.formulierFout = ''
			try {
				const wie = g.contactName || g.number || t('Unknown')
				if (this.notitieTekst.trim()) {
					await createNote({
						title: t('Call with %s, %s', wie, this.wanneer(g.startMs)),
						content: this.notitieTekst,
						category: t('Calls'),
					})
				}
				if (this.taakTekst.trim()) {
					await createTask({
						summary: `${wie}: ${this.taakTekst.trim()}`,
						due: this.taakDatum || null,
						notes: this.notitieTekst || '',
					})
				}
				g.notes = this.notitieTekst
				g.taskTitle = this.taakTekst.trim() || null
				await paApi.callUpdate(getAccessCode(), g.id, {
					notes: this.notitieTekst,
					taskTitle: g.taskTitle,
					number: g.number,
					contactName: g.contactName,
					direction: g.direction,
					callType: g.callType,
					startMs: g.startMs,
				})
				this.formulier = null
			} catch (e) {
				this.formulierFout = foutTekst(e)
			} finally {
				this.bewaren = false
			}
		},
		async weg(g) {
			this.gesprekken = this.gesprekken.filter((x) => x.id !== g.id)
			await paApi.callDelete(getAccessCode(), g.id).catch(() => {})
		},
	},
}
</script>

<style scoped>
.pa-hint { color: var(--color-text-maxcontrast, #666); }
.pa-bel__leeg { color: var(--color-text-maxcontrast, #666); }
.pa-bel__rij { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid var(--color-border); }
.pa-bel__soort { font-size: 1.1em; flex: 0 0 auto; }
.pa-bel__tekst { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.pa-bel__wie { font-weight: 600; }
.pa-bel__tekst small { color: var(--color-text-maxcontrast, #666); }
.pa-bel__notitie { font: inherit; font-size: 0.92em; border: 0; border-bottom: 1px dashed var(--color-border); background: transparent; color: inherit; padding: 3px 0; resize: none; overflow: hidden; }
.pa-bel__taak { color: var(--color-primary-element); }
.pa-bel__acties { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.pa-bel__knopje { font: inherit; font-size: 0.85em; border: 1px solid var(--color-border); background: transparent; color: inherit; border-radius: 999px; padding: 3px 11px; cursor: pointer; text-decoration: none; }
.pa-bel__knopje--hoofd { background: var(--color-primary-element); color: var(--color-primary-element-text, #fff); border-color: var(--color-primary-element); }
.pa-bel__laag { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 40; }
.pa-bel__formulier { background: var(--color-main-background, #fff); color: var(--color-main-text); border-radius: var(--border-radius-large); padding: 18px 20px 16px; width: 100%; max-width: 460px; max-height: 88vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); }
.pa-bel__formulier h3 { margin: 0 0 2px; }
.pa-bel__label { display: block; margin: 14px 0 4px; font-size: 0.9em; color: var(--color-text-maxcontrast, #666); }
.pa-bel__groot, .pa-bel__veld { width: 100%; box-sizing: border-box; font: inherit; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: inherit; }
.pa-bel__veld { margin-bottom: 6px; }
.pa-bel__fout { color: var(--color-error, #c33); font-size: 0.9em; }
.pa-bel__formknoppen { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
</style>
