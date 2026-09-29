<template>
	<div class="pa-open">
		<h2>{{ t('Open items') }}</h2>
		<FoutMelding v-if="error" :error="error" />
		<NcLoadingIcon v-if="loading" :size="32" />

		<template v-else>
			<p v-if="!termijnen.length && !openstaand.length && !morgen" class="pa-open__empty">{{ t('Nothing left open.') }}</p>

			<template v-if="termijnen.length">
				<h3>{{ t('Deadlines') }}</h3>
				<div v-for="d in termijnen" :key="d.bron + d.title + d.due" class="pa-open__row" :class="{ 'pa-open__row--late': d.verlopen, 'pa-open__row--klik': d.bron === 'deck' }" @click="d.bron === 'deck' && $emit('open-deck', d)">
					<span class="pa-open__flag">⚑</span>
					<div class="pa-open__body">
						<div class="pa-open__title">{{ d.title }}</div>
						<div class="pa-open__sub">{{ termijnTekst(d) }} · {{ d.bron === 'deck' ? 'Deck' : t('Tasks') }}</div>
					</div>
				</div>
			</template>

			<template v-if="openstaand.length">
				<h3>{{ t('Still open') }}</h3>
				<div v-for="item in openstaand" :key="item.id" class="pa-open__row">
					<div class="pa-open__body">
						<div class="pa-open__title">{{ item.title }}</div>
						<div class="pa-open__sub">{{ wanneer(item.start) }} · {{ item.calendarName }}</div>
						<div class="pa-open__btns">
							<button type="button" class="pa-open__btn pa-open__btn--primary" @click="vinkAf(item)">{{ t('Done') }}</button>
							<button type="button" class="pa-open__btn" :disabled="bezig === item.id" @click="naarMorgen(item)">{{ t('To tomorrow') }}</button>
						</div>
					</div>
				</div>
			</template>

			<template v-if="morgen">
				<h3>{{ t('Tomorrow') }}</h3>
				<div class="pa-open__row">
					<div class="pa-open__body">
						<div v-if="morgen.vertrek" class="pa-open__leave">{{ t('Leave at %s', klok(morgen.vertrek)) }}</div>
						<div class="pa-open__title">{{ morgen.eerste.title }}</div>
						<div class="pa-open__sub">{{ klok(morgen.eerste.start) }}<span v-if="morgen.eerste.location"> · {{ morgen.eerste.location.split(',')[0] }}</span></div>
						<div v-if="morgen.meer > 0" class="pa-open__sub">{{ t('and %d more', morgen.meer) }}</div>
					</div>
				</div>
			</template>
		</template>
	</div>
</template>

<script>
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import { t, currentLocale } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import FoutMelding from './FoutMelding.vue'
import { getSettings, listItemStatus, setItemStatus } from '../api/nextcloudUserData.js'
import { fetchCalendarData, updateEvent, discoverCalendars, gekozenKalenders } from '../api/nextcloudCalendar.js'
import { parseEventsForDay } from '../api/icsEvents.js'
import { laadTermijnen } from '../api/termijnen.js'
import { getAccessCode } from '../api/accessCode.js'
import * as paApi from '../api/paApi.js'
import { volgSync } from '../api/sync.js'

/**
 * Het avondoverzicht, net als op de telefoon (Ramin, 2026-09-13): wat
 * bleef liggen, wat afloopt (taken en Deck-kaarten), en morgen — met hoe laat
 * je weg moet. Afvinken en naar morgen schuiven doen het echt: de status gaat
 * naar het versleutelde bestand, de afspraak verhuist in de agenda.
 */
const DAGEN_TERUG = 7
const DAGEN_VOORUIT = 2

function dagStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function toIcsUtc(date) { return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') }
function dagSleutel(d) { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0') }

export default {
	name: 'OpenItemsView',
	emits: ['open-deck'],
	components: { FoutMelding, NcLoadingIcon, NcNoteCard },
	data() {
		return { stopKijken: null, loading: true, error: null, termijnen: [], openstaand: [], morgen: null, itemStatus: {}, bezig: null, calendars: [] }
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
	},
	async mounted() {
		// Meeluisteren met je andere apparaten (Ramin, 24-09): verandert dit elders, dan staat
		// het hier meteen goed in plaats van pas als je het scherm opnieuw opent.
		this.stopKijken = volgSync(() => this.load())
		await this.load()
	},
	methods: {
		t(...args) { return t(...args) },
		klok(iso) { return new Date(iso).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }) },
		wanneer(iso) { return new Date(iso).toLocaleString(currentLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) },
		termijnTekst(d) {
			const vandaag = dagSleutel(new Date())
			const morgen = dagSleutel(new Date(Date.now() + 86400000))
			if (d.verlopen) return t('Was due %s', d.due)
			if (d.due === vandaag) return t('Due today')
			if (d.due === morgen) return t('Due tomorrow')
			return t('Due %s', d.due)
		},
		async dagAfspraken(datum) {
			const start = dagStart(datum); const end = new Date(start); end.setDate(end.getDate() + 1)
			const events = []
			for (const calendar of this.calendars) {
				const blocks = await fetchCalendarData(calendar, toIcsUtc(start), toIcsUtc(end)).catch(() => [])
				for (const block of blocks) events.push(...parseEventsForDay(block, datum, calendar))
			}
			return events
		},
		async load() {
			this.loading = true; this.error = null
			try {
				const settings = await getSettings()
				this.calendars = await gekozenKalenders(settings)
				this.itemStatus = await listItemStatus().catch(() => ({}))

				// Wat bleef liggen: voorbij, niet afgevinkt, laatste week.
				const nu = Date.now()
				const open = []
				for (let i = 0; i <= DAGEN_TERUG; i++) {
					const datum = new Date(); datum.setDate(datum.getDate() - i)
					for (const ev of await this.dagAfspraken(datum)) {
						if (new Date(ev.end).getTime() >= nu) continue
						if (this.itemStatus[ev.id]?.doneAt) continue
						// Wat de app zelf in je agenda zette (ritten, inchecken) is
						// niets om af te vinken; gelogde gesprekken wel (Ramin,
						// 2026-09-11: "telefoongesprekken wel erbij houden").
						if (String(ev.id).startsWith('pa-') && !String(ev.id).startsWith('pa-call-')) continue
						if (/^[\u{1F680}-\u{1F6FF}✈]/u.test(ev.title || '')) continue
						if (!open.some((o) => o.id === ev.id)) open.push(ev)
					}
				}
				this.openstaand = open.sort((a, b) => new Date(b.start) - new Date(a.start))

				// Termijnen: taken met een DUE, Deck-kaarten met een datum (zelfde lader als de tijdlijn).
				this.termijnen = await laadTermijnen(DAGEN_VOORUIT)

				// Morgen: de eerste afspraak, en hoe laat je weg moet.
				const morgenDatum = new Date(); morgenDatum.setDate(morgenDatum.getDate() + 1)
				const morgenEvents = (await this.dagAfspraken(morgenDatum)).sort((a, b) => new Date(a.start) - new Date(b.start))
				if (morgenEvents.length) {
					let vertrek = null
					try {
						const home = (settings.homeLat != null && settings.homeLon != null) ? { lat: settings.homeLat, lon: settings.homeLon } : null
						const plan = await paApi.plan(getAccessCode(), {
							events: morgenEvents, home, homeLabel: t('Home'),
							gapThresholdMinutes: settings.gapThresholdMinutes ?? 90,
							departureBufferMinutes: settings.gettingReadyHomeMinutes ?? 30,
							arrivalBufferMinutes: settings.arrivalBufferMinutes ?? 10,
						})
						vertrek = (plan.items || []).map((i) => i.travel?.departureTime).find(Boolean) || null
					} catch (e) { /* dan zonder vertrektijd */ }
					this.morgen = { eerste: morgenEvents[0], vertrek, meer: morgenEvents.length - 1 }
				} else {
					this.morgen = null
				}
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.loading = false
			}
		},
		async vinkAf(item) {
			const nieuw = { ...(this.itemStatus[item.id] || {}), doneAt: Date.now(), busySince: null }
			this.itemStatus = { ...this.itemStatus, [item.id]: nieuw }
			this.openstaand = this.openstaand.filter((o) => o.id !== item.id)
			await setItemStatus(item.id, nieuw).catch((e) => { this.error = foutTekst(e) })
		},
		async naarMorgen(item) {
			const calendar = this.calendars.find((c) => c.href === item.calendarUri)
			if (!calendar) { this.error = t('This appointment cannot be moved from here.'); return }
			this.bezig = item.id
			try {
				const start = new Date(item.start); start.setDate(start.getDate() + 1)
				const end = new Date(item.end); end.setDate(end.getDate() + 1)
				await updateEvent(calendar, item.id, { title: item.title, start, end, location: item.location, description: item.description })
				this.openstaand = this.openstaand.filter((o) => o.id !== item.id)
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.bezig = null
			}
		},
	},
}
</script>

<style scoped>
.pa-open h3 { font-size: 0.8em; text-transform: uppercase; letter-spacing: .06em; color: var(--color-text-maxcontrast); margin: 18px 0 6px; }
.pa-open__empty { color: var(--color-text-maxcontrast); }
.pa-open__row { display: flex; gap: 10px; border: 1px solid var(--color-border); border-radius: var(--border-radius-large); padding: 10px 14px; margin-bottom: 8px; }
.pa-open__row--late { border-color: var(--color-error); }
.pa-open__flag { color: var(--color-primary-element); }
.pa-open__row--late .pa-open__flag { color: var(--color-error); }
.pa-open__body { flex: 1; }
.pa-open__title { font-weight: bold; }
.pa-open__sub { font-size: 0.85em; color: var(--color-text-maxcontrast); }
.pa-open__leave { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.4em; font-weight: 500; }
.pa-open__btns { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.pa-open__btn { font: inherit; font-size: 0.85em; min-height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); cursor: pointer; }
.pa-open__btn--primary { background: var(--color-primary-element); color: var(--color-primary-element-text); border-color: transparent; }
.pa-open__row--klik { cursor: pointer; }
.pa-open__row--klik:hover { background: var(--color-background-hover, #f0f0f0); }
</style>
