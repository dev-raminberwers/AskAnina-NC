<template>
	<div ref="wortel" class="pa-cal">
		<div class="pa-cal__toolbar">
			<div class="pa-cal__nav">
				<NcButton :aria-label="t('Previous')" @click="stap(-1)"><template #icon><MaterialIcoon naam="keyboardArrowLeft" :size="20" /></template></NcButton>
				<NcButton @click="vandaag">{{ t('Today') }}</NcButton>
				<NcButton :aria-label="t('Next')" @click="stap(1)"><template #icon><MaterialIcoon naam="keyboardArrowRight" :size="20" /></template></NcButton>
				<h2 class="pa-cal__titel">{{ titel }}</h2>
			</div>
			<div class="pa-cal__keuzes">
				<div class="pa-cal__chips">
					<button type="button" class="pa-cal__chip" :class="{ 'pa-cal__chip--active': mode === 'week' }" @click="mode = 'week'; load()">{{ t('Week') }}</button>
					<button type="button" class="pa-cal__chip" :class="{ 'pa-cal__chip--active': mode === 'month' }" @click="mode = 'month'; load()">{{ t('Month') }}</button>
				</div>
				<label v-if="mode === 'week'" class="pa-cal__dagen" :title="t('Days side by side')">
					<span>{{ t('%s days', kalenderDagen) }}</span>
					<input type="range" min="1" max="7" step="1" :value="kalenderDagen" @input="kalenderDagen = Number($event.target.value)" @change="zetDagen(Number($event.target.value))">
				</label>
				<div v-if="mode === 'week' && kalenderDagen === 7" class="pa-cal__chips" :title="t('Which day is the first column')">
					<button type="button" class="pa-cal__chip" :class="{ 'pa-cal__chip--active': weekMode === 'fixed' }" @click="zetWeekMode('fixed')">{{ t('Fixed week') }}</button>
					<button type="button" class="pa-cal__chip" :class="{ 'pa-cal__chip--active': weekMode === 'today' }" @click="zetWeekMode('today')">{{ t('Today first') }}</button>
				</div>
				<button type="button" class="pa-cal__chip" :class="{ 'pa-cal__chip--active': miniOpen }" :title="t('Go to date')" @click="miniOpen = !miniOpen; pasHoogte()"><MaterialIcoon naam="calendarMonth" :size="16" /></button>
			</div>
		</div>

		<!-- Kleine maandkalender om snel te springen, en de agenda's aan/uit. -->
		<div v-if="miniOpen" class="pa-cal__mini-rij">
			<div class="pa-cal__mini">
				<div class="pa-cal__mini-kop">
					<button type="button" class="pa-cal__mini-knop" @click="miniMaand = new Date(miniMaand.getFullYear(), miniMaand.getMonth() - 1, 1)">‹</button>
					<span>{{ miniMaand.toLocaleDateString(locale, { month: 'long', year: 'numeric' }) }}</span>
					<button type="button" class="pa-cal__mini-knop" @click="miniMaand = new Date(miniMaand.getFullYear(), miniMaand.getMonth() + 1, 1)">›</button>
				</div>
				<div class="pa-cal__mini-grid">
					<span v-for="(naam, i) in miniKoppen" :key="'k' + i" class="pa-cal__mini-dagnaam">{{ naam }}</span>
					<button v-for="d in miniDagen" :key="d.sleutel" type="button" class="pa-cal__mini-dag" :class="{ 'pa-cal__mini-dag--buiten': !d.inMaand, 'pa-cal__mini-dag--vandaag': d.vandaag, 'pa-cal__mini-dag--gekozen': d.sleutel === dagSleutel(anker) }" @click="springNaar(d.sleutel)">{{ d.datum.getDate() }}</button>
				</div>
			</div>
			<div v-if="calendars.length > 1" class="pa-cal__agendas">
				<button v-for="c in calendars" :key="c.href" type="button" class="pa-cal__agenda" :class="{ 'pa-cal__agenda--uit': verborgen.includes(c.href) }" @click="wisselAgenda(c)">
					<span class="pa-cal__agenda-bol" :style="{ background: hex(c.color, 'var(--color-primary-element, #1e3a5f)') }" />{{ c.displayName }}
				</button>
			</div>
		</div>

		<FoutMelding v-if="error" :error="error" />
		<FoutMelding v-else-if="!calendars.length && !loading" type="warning" :error="t('No calendars selected yet — pick one or more under Settings.')" />
		<NcLoadingIcon v-if="loading" :size="28" />

		<EventForm v-if="formOpen" :key="formSleutel" :calendars="calendars" :event="formEvent" :start="formStart" @saved="formOpen = false; load()" @cancel="formOpen = false; pasHoogte()" />

		<!-- Weekweergave: zeven kolommen, uren onder elkaar, nu-lijn; slepen verzet, de onderrand rekt. -->
		<div v-if="mode === 'week' && !loading" class="pa-cal__week">
			<div class="pa-cal__weekkop" :style="kolomStijl">
				<div class="pa-cal__uurkolom pa-cal__weeknr">{{ weekNummerTekst }}</div>
				<div v-for="d in dagen" :key="d.sleutel" class="pa-cal__dagkop" :class="{ 'pa-cal__dagkop--vandaag': d.vandaag }" @click="$emit('day-click', d.datum)">
					<span class="pa-cal__dagnaam">{{ d.naam }}</span>
					<span class="pa-cal__dagnr">{{ d.datum.getDate() }}</span>
				</div>
			</div>
			<div class="pa-cal__heledag" :style="kolomStijl">
				<div class="pa-cal__uurkolom pa-cal__heledag-label">{{ t('All day') }}</div>
				<div v-for="d in dagen" :key="'a' + d.sleutel" class="pa-cal__heledag-cel">
					<button v-for="ev in heleDag(d)" :key="ev.id + ev.start" type="button" class="pa-cal__chipev" :style="chipStijl(ev)" :title="ev.title" @click="openEvent(ev)">{{ ev.title }}</button>
				</div>
			</div>
			<div ref="grid" class="pa-cal__grid" :style="{ height: gridHoogte, ...kolomStijl }">
				<div class="pa-cal__uurkolom">
					<div v-for="u in 24" :key="u" class="pa-cal__uur">{{ twee(u - 1) }}:00</div>
				</div>
				<div v-for="d in dagen" :key="'g' + d.sleutel" class="pa-cal__dagkolom" :class="{ 'pa-cal__dagkolom--vandaag': d.vandaag }" :data-dag="d.sleutel" @click="nieuwOp(d, $event)">
					<div v-if="werkUren(d)" class="pa-cal__werk" :style="werkUren(d)" />
					<div v-for="u in 24" :key="u" class="pa-cal__uurlijn" />
					<div v-if="d.vandaag" class="pa-cal__nu" :style="{ top: nuTop + 'px' }" />
					<div v-for="ev in getimed(d)" :key="ev.id + ev.start" class="pa-cal__event" :class="{ 'pa-cal__event--sleep': sleep && sleep.ev === ev, 'pa-cal__event--vast': !bewerkbaar(ev) }" :style="stijl(ev, d)" :title="ev.title + ' ' + klok(ev.start) + '–' + klok(ev.end)" @pointerdown.stop="beginSleep($event, ev, d, 'verplaats')">
						<span class="pa-cal__event-tijd">{{ sleep && sleep.ev === ev ? sleepTekst : klok(ev.start) }}</span>
						<span class="pa-cal__event-titel">{{ ev.title }}</span>
						<span v-if="bewerkbaar(ev)" class="pa-cal__greep" :title="t('Drag to change the end')" @pointerdown.stop="beginSleep($event, ev, d, 'rek')" />
					</div>
				</div>
			</div>
		</div>

		<!-- Maandweergave: zes weken; meerdaagse afspraken als doorlopende balk per week. -->
		<div v-if="mode === 'month' && !loading" ref="maand" class="pa-cal__maand" :style="{ height: gridHoogte }">
			<div class="pa-cal__maandkoppen">
				<div v-for="(naam, i) in maandKoppen" :key="i" class="pa-cal__maandkop">{{ naam }}</div>
			</div>
			<div v-for="week in weken" :key="week.sleutel" class="pa-cal__weekrij">
				<div v-for="d in week.dagen" :key="'m' + d.sleutel" class="pa-cal__cel" :class="{ 'pa-cal__cel--buiten': !d.inMaand, 'pa-cal__cel--vandaag': d.vandaag }" @click="nieuwOpDag(d)">
					<div class="pa-cal__celkop">
						<button type="button" class="pa-cal__celnr" :title="t('Open day')" @click.stop="$emit('day-click', d.datum)">{{ d.datum.getDate() }}</button>
					</div>
					<div class="pa-cal__balkruimte" :style="{ height: (week.balkRijen * 20) + 'px' }" />
					<button v-for="ev in enkelDaags(d).slice(0, 3)" :key="ev.id + ev.start" type="button" class="pa-cal__chipev" :style="chipStijl(ev)" :title="ev.title" @click.stop="openEvent(ev)">
						<span v-if="!isHeleDag(ev)" class="pa-cal__chipev-tijd">{{ klok(ev.start) }}</span>{{ ev.title }}
					</button>
					<button v-if="enkelDaags(d).length > 3" type="button" class="pa-cal__meer" @click.stop="$emit('day-click', d.datum)">{{ t('%s more', enkelDaags(d).length - 3) }}</button>
				</div>
				<button v-for="b in week.balken" :key="'b' + b.ev.id + b.ev.start" type="button" class="pa-cal__balk" :style="{ left: 'calc(' + (b.van * 100 / 7) + '% + 2px)', width: 'calc(' + ((b.tot - b.van + 1) * 100 / 7) + '% - 4px)', top: (28 + b.rij * 20) + 'px', background: hex(b.ev.calendarColor, 'var(--color-primary-element, #1e3a5f)'), color: tekstKleur(b.ev.calendarColor) }" :title="b.ev.title" @click.stop="openEvent(b.ev)">{{ b.ev.title }}</button>
			</div>
		</div>
	</div>
</template>

<script>
import MaterialIcoon from './MaterialIcoon.vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import FoutMelding from './FoutMelding.vue'
import EventForm from './EventForm.vue'
import { t, currentLocale } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import { getSettings, setSettings } from '../api/nextcloudUserData.js'
import { fetchCalendarData, gekozenKalenders, updateEvent } from '../api/nextcloudCalendar.js'
import { parseEventsForDay } from '../api/icsEvents.js'
import { COUNTRIES } from '../l10n/index.js'
import { tekstKleur, hex } from '../api/kleur.js'
import { getAccessCode } from '../api/accessCode.js'
import * as paApi from '../api/paApi.js'
import { volgSync } from '../api/sync.js'

const UUR_PX = 48
const KWARTIER = 15 * 60 * 1000
const DAGNAMEN = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const VERBORGEN_SLEUTEL = 'personalassistant.calendar.hidden'

function twee(n) { return String(n).padStart(2, '0') }
function dagSleutel(d) { return d.getFullYear() + '-' + twee(d.getMonth() + 1) + '-' + twee(d.getDate()) }
function dagStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function plusDagen(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function icsUtc(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') }
/** ISO-weeknummer. */
function weekNummer(d) {
	const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
	const dag = x.getUTCDay() || 7
	x.setUTCDate(x.getUTCDate() + 4 - dag)
	const jaarStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1))
	return Math.ceil(((x - jaarStart) / 86400000 + 1) / 7)
}
/** Loopt de afspraak over meer dan één dag (een einde precies om middernacht telt niet)? */
function meerdaags(ev) {
	const s = new Date(ev.start)
	const e = new Date(ev.end)
	const eindDag = dagStart(new Date(e.getTime() - 1))
	return eindDag > dagStart(s)
}

/**
 * Agenda: week- en maandoverzicht (Ramin, 2026-09-14). Klik op een leeg vak
 * = nieuwe afspraak op dat moment, klik op een afspraak = bewerken, slepen =
 * verzetten (tijd en dag), de onderrand slepen = einde rekken. Dagkop of
 * dagnummer = naar het dagscherm met de reisplanning. Werkuren lichter,
 * kleine maandkalender en agenda's aan/uit onder de kalender-knop. Tot
 * onderaan het scherm, zonder lege ruimte eronder.
 */
export default {
	name: 'CalendarView',
	components: { MaterialIcoon, NcButton, NcLoadingIcon, FoutMelding, EventForm },
	emits: ['day-click'],
	data() {
		let verborgen = []
		try { verborgen = JSON.parse(localStorage.getItem(VERBORGEN_SLEUTEL) || '[]') } catch (e) { verborgen = [] }
		return { stopKijken: null,
			mode: 'week',
			anker: dagStart(new Date()),
			weekMode: 'fixed',
			// Hoeveel dagen naast elkaar (kaart 97); minder dan 7 = altijd vanaf het anker.
			kalenderDagen: 7,
			weekFirstDay: 'auto',
			settings: null,
			calendars: [],
			verborgen,
			eventsPerDag: {},
			loading: true,
			error: null,
			formOpen: false,
			formEvent: null,
			formStart: null,
			formSleutel: 0,
			nuTop: 0,
			klokTimer: null,
			gridHoogte: 'auto',
			miniOpen: false,
			miniMaand: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
			sleep: null,
		}
	},
	computed: {
		locale() { return currentLocale() },
		eersteDag() {
			// 0 = zondag, 1 = maandag; 'auto' volgt het land.
			if (this.weekFirstDay === 'sun') return 0
			if (this.weekFirstDay === 'mon') return 1
			const cc = (this.settings && this.settings.country) || ''
			const land = COUNTRIES.find((c) => c.cc === cc)
			return land && land.firstDay === 'sun' ? 0 : 1
		},
		bereik() {
			if (this.mode === 'week') {
				const n = Math.min(7, Math.max(1, Number(this.kalenderDagen) || 7))
				const start = (this.weekMode === 'today' || n < 7) ? dagStart(this.anker) : this.weekBegin(this.anker)
				return { start, dagen: n }
			}
			const eersteVanMaand = new Date(this.anker.getFullYear(), this.anker.getMonth(), 1)
			return { start: this.weekBegin(eersteVanMaand), dagen: 42 }
		},
		dagen() {
			const vandaagSleutel = dagSleutel(new Date())
			const uit = []
			for (let i = 0; i < this.bereik.dagen; i++) {
				const datum = plusDagen(this.bereik.start, i)
				const sleutel = dagSleutel(datum)
				uit.push({
					datum, sleutel,
					naam: datum.toLocaleDateString(this.locale, { weekday: 'short' }),
					vandaag: sleutel === vandaagSleutel,
					inMaand: datum.getMonth() === this.anker.getMonth(),
					events: (this.eventsPerDag[sleutel] || []).filter((ev) => !this.verborgen.includes(ev.calendarUri)),
				})
			}
			return uit
		},
		/** Maand: zes weken, elk met zijn balken voor meerdaagse afspraken. */
		weken() {
			const uit = []
			for (let w = 0; w < 6; w++) {
				const dagen = this.dagen.slice(w * 7, w * 7 + 7)
				if (!dagen.length) break
				const gezien = new Set()
				const kandidaten = []
				dagen.forEach((d, kolom) => {
					for (const ev of d.events) {
						if (!meerdaags(ev)) continue
						const k = ev.id + '|' + ev.start
						if (gezien.has(k)) continue
						gezien.add(k)
						const eindDag = dagStart(new Date(new Date(ev.end).getTime() - 1))
						const laatste = Math.min(6, kolom + Math.round((eindDag - dagStart(d.datum)) / 86400000))
						kandidaten.push({ ev, van: kolom, tot: Math.max(kolom, laatste) })
					}
				})
				// Rijen toewijzen zonder overlap.
				const rijen = []
				const balken = []
				for (const k of kandidaten.sort((a, b) => a.van - b.van || b.tot - a.tot)) {
					let rij = 0
					while (rijen[rij] && rijen[rij].some((x) => !(k.tot < x.van || k.van > x.tot))) rij++
					rijen[rij] = rijen[rij] || []
					rijen[rij].push(k)
					balken.push({ ...k, rij })
				}
				uit.push({ sleutel: dagen[0].sleutel, dagen, balken, balkRijen: rijen.length })
			}
			return uit
		},
		maandKoppen() {
			return this.dagen.slice(0, 7).map((d) => d.naam)
		},
		miniKoppen() {
			const basis = this.weekBegin(new Date())
			return [0, 1, 2, 3, 4, 5, 6].map((i) => plusDagen(basis, i).toLocaleDateString(this.locale, { weekday: 'narrow' }))
		},
		miniDagen() {
			const eerste = new Date(this.miniMaand.getFullYear(), this.miniMaand.getMonth(), 1)
			const start = this.weekBegin(eerste)
			const vandaag = dagSleutel(new Date())
			const uit = []
			for (let i = 0; i < 42; i++) {
				const datum = plusDagen(start, i)
				uit.push({ datum, sleutel: dagSleutel(datum), inMaand: datum.getMonth() === this.miniMaand.getMonth(), vandaag: dagSleutel(datum) === vandaag })
			}
			return uit
		},
		kolomStijl() {
			// Op een smal scherm is de uurkolom 40px (zie de media query onderaan).
			const uur = (typeof window !== 'undefined' && window.innerWidth <= 700) ? '40px' : '56px'
			return { gridTemplateColumns: uur + ' repeat(' + this.dagen.length + ', minmax(0, 1fr))' }
		},
		titel() {
			if (this.mode === 'month') return this.anker.toLocaleDateString(this.locale, { month: 'long', year: 'numeric' })
			const a = this.dagen[0].datum
			const b = this.dagen[this.dagen.length - 1].datum
			const opties = { day: 'numeric', month: 'short' }
			return a.toLocaleDateString(this.locale, opties) + ' – ' + b.toLocaleDateString(this.locale, { ...opties, year: 'numeric' })
		},
		weekNummerTekst() {
			return this.weekMode === 'fixed' && this.dagen.length === 7 ? t('Wk %s', weekNummer(this.dagen[0].datum)) : ''
		},
		sleepTekst() {
			const s = this.sleep
			if (!s) return ''
			return this.klok(s.nieuwStart) + '–' + this.klok(s.nieuwEind)
		},
	},
	async mounted() {
		// Meeluisteren met je andere apparaten (Ramin, 24-09): verandert dit elders, dan staat
		// het hier meteen goed in plaats van pas als je het scherm opnieuw opent.
		this.stopKijken = volgSync(() => this.load())
		await this.load()
		this.zetNu()
		this.klokTimer = setInterval(this.zetNu, 60000)
		window.addEventListener('keydown', this.toets)
		window.addEventListener('resize', this.pasHoogte)
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
		clearInterval(this.klokTimer)
		window.removeEventListener('keydown', this.toets)
		window.removeEventListener('resize', this.pasHoogte)
	},
	methods: {
		t(...args) { return t(...args) },
		twee,
		dagSleutel,
		hex,
		tekstKleur,
		klok(iso) { return new Date(iso).toLocaleTimeString(this.locale, { hour: '2-digit', minute: '2-digit' }) },
		weekBegin(d) {
			const x = dagStart(d)
			const verschil = (x.getDay() - this.eersteDag + 7) % 7
			return plusDagen(x, -verschil)
		},
		toets(e) {
			if (e.target && /input|textarea|select/i.test(e.target.tagName)) return
			if (e.key === 'ArrowLeft') this.stap(-1)
			if (e.key === 'ArrowRight') this.stap(1)
		},
		stap(richting) {
			if (this.mode === 'week') this.anker = plusDagen(this.anker, this.bereik.dagen * richting)
			else this.anker = new Date(this.anker.getFullYear(), this.anker.getMonth() + richting, 1)
			this.load()
		},
		vandaag() { this.anker = dagStart(new Date()); this.load() },
		springNaar(waarde) {
			if (!waarde) return
			this.anker = dagStart(new Date(waarde + 'T00:00:00'))
			this.miniMaand = new Date(this.anker.getFullYear(), this.anker.getMonth(), 1)
			this.load()
		},
		wisselAgenda(c) {
			this.verborgen = this.verborgen.includes(c.href) ? this.verborgen.filter((h) => h !== c.href) : [...this.verborgen, c.href]
			try { localStorage.setItem(VERBORGEN_SLEUTEL, JSON.stringify(this.verborgen)) } catch (e) { /* niet erg */ }
		},
		async zetDagen(n) {
			this.kalenderDagen = Math.min(7, Math.max(1, n))
			try {
				const s = (await getSettings()) || {}
				await setSettings({ ...s, calendarDays: this.kalenderDagen })
			} catch (e) { /* de weergave zelf staat al goed */ }
			await this.load()
			this.kalenderDagen = Math.min(7, Math.max(1, n))
		},
		async zetWeekMode(w) {
			// Eerst bewaren, dan laden: load() leest de keuze uit de instellingen
			// terug en zette hem anders weer op de oude stand (Ramin, 2026-09-15).
			this.weekMode = w
			try {
				const s = (await getSettings()) || {}
				await setSettings({ ...s, weekMode: w })
			} catch (e) { /* de weergave zelf staat al goed */ }
			await this.load()
			this.weekMode = w
		},
		zetNu() {
			const nu = new Date()
			this.nuTop = (nu.getHours() + nu.getMinutes() / 60) * UUR_PX
		},
		/** Tot onderaan het scherm, geen lege ruimte eronder (Ramin, 2026-09-14). */
		pasHoogte() {
			this.$nextTick(() => {
				const el = this.mode === 'week' ? this.$refs.grid : this.$refs.maand
				if (!el) return
				const boven = el.getBoundingClientRect().top
				const hoogte = Math.max(320, window.innerHeight - boven - 12)
				this.gridHoogte = hoogte + 'px'
			})
		},
		async load() {
			this.loading = true
			this.error = null
			try {
				this.settings = (await getSettings()) || {}
				this.weekMode = this.settings.weekMode === 'today' ? 'today' : 'fixed'
				this.kalenderDagen = Math.min(7, Math.max(1, Number(this.settings.calendarDays) || 7))
				this.weekFirstDay = this.settings.weekFirstDay || 'auto'
				this.calendars = await gekozenKalenders(this.settings)
				const start = this.bereik.start
				const eind = plusDagen(start, this.bereik.dagen)
				const perDag = {}
				const blokkenPerAgenda = await Promise.all(this.calendars.map(async (c) => {
					try {
						return { c, blokken: await fetchCalendarData(c, icsUtc(start), icsUtc(eind)) }
					} catch (e) {
						return { c, blokken: [] }
					}
				}))
				for (let i = 0; i < this.bereik.dagen; i++) {
					const dag = plusDagen(start, i)
					const lijst = []
					for (const { c, blokken } of blokkenPerAgenda) {
						for (const blok of blokken) lijst.push(...parseEventsForDay(blok, dag, c))
					}
					const gezien = new Set()
					perDag[dagSleutel(dag)] = lijst
						.filter((ev) => { const k = ev.id + '|' + ev.start; if (gezien.has(k)) return false; gezien.add(k); return true })
						.sort((a, b) => new Date(a.start) - new Date(b.start))
				}
				// De series die je volgt erbij (Ramin, 24-09: "series ook in Calendar tonen"). Op de
				// telefoon staan ze als afspraak in je dag; hier hoorden ze ook thuis. Ze komen niet uit
				// een agenda maar uit je gevolgde series, dus we voegen ze als eigen laag toe -- met een
				// eigen calendarUri, zodat je ze net als een agenda kunt wegklikken.
				await this.voegSeriesToe(perDag, start)
				this.eventsPerDag = perDag
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.loading = false
				this.$nextTick(() => {
					this.pasHoogte()
					if (this.$refs.grid && this.mode === 'week') this.$refs.grid.scrollTop = 7 * UUR_PX
				})
			}
		},
		isHeleDag(ev) {
			if (ev.allDay) return true
			const s = new Date(ev.start)
			const e = new Date(ev.end)
			return (e - s) >= 23 * 3600000 && s.getHours() === 0 && s.getMinutes() === 0
		},
		/**
		 * De afleveringen van je gevolgde series als afspraken in de agenda.
		 *
		 * Eén verzoek per serie, en alleen voor de dagen die in beeld staan. De uitzendtijd komt van
		 * TVMaze; heeft een aflevering er geen, dan slaan we hem over -- een aflevering op een onbekend
		 * tijdstip in je agenda zetten is een gok die er als een afspraak uitziet.
		 */
		async voegSeriesToe(perDag, start) {
			const code = getAccessCode()
			if (!code) return
			const instellingen = await getSettings().catch(() => null)
			const series = Array.isArray(instellingen && instellingen.series) ? instellingen.series : []
			if (!series.length) return
			for (const serie of series) {
				const d = await paApi.seriesShow(code, serie.id).catch(() => null)
				if (!d) continue
				for (const ep of ((d._embedded || {}).episodes) || []) {
					if (!ep.airstamp) continue
					const begin = new Date(ep.airstamp)
					const sleutel = dagSleutel(begin)
					if (!(sleutel in perDag)) continue
					const duur = (ep.runtime || d.averageRuntime || 45) * 60000
					perDag[sleutel].push({
						id: 'serie-' + ep.id,
						title: `${serie.name} - ${ep.season}x${ep.number}`,
						start: begin.toISOString(),
						end: new Date(begin.getTime() + duur).toISOString(),
						location: serie.provider || '',
						calendarName: t('Series'),
						calendarUri: 'synthetic-series',
						calendarColor: '#8e44ad',
					})
				}
			}
			// Opnieuw op tijd zetten; de afleveringen zijn er achteraf bij gekomen.
			for (const sleutel of Object.keys(perDag)) {
				perDag[sleutel].sort((a, b) => new Date(a.start) - new Date(b.start))
			}
		},
		heleDag(d) { return d.events.filter((ev) => this.isHeleDag(ev) || meerdaags(ev)) },
		getimed(d) { return d.events.filter((ev) => !this.isHeleDag(ev) && !meerdaags(ev)) },
		enkelDaags(d) { return d.events.filter((ev) => !meerdaags(ev)) },
		bewerkbaar(ev) { return !String(ev.id).startsWith('mirror-') && !ev.recurring },
		chipStijl(ev) {
			return { background: hex(ev.calendarColor, 'var(--color-primary-element, #1e3a5f)'), color: tekstKleur(ev.calendarColor) }
		},
		werkUren(d) {
			const s = this.settings || {}
			const dagen = Array.isArray(s.workDays) ? s.workDays.map((x) => String(x).toUpperCase()) : []
			if (!dagen.includes(DAGNAMEN[d.datum.getDay()])) return null
			const van = /^(\d{1,2}):(\d{2})/.exec(s.workStartTime || '')
			const tot = /^(\d{1,2}):(\d{2})/.exec(s.workEndTime || '')
			if (!van || !tot) return null
			const a = Number(van[1]) + Number(van[2]) / 60
			const b = Number(tot[1]) + Number(tot[2]) / 60
			if (b <= a) return null
			return { top: (a * UUR_PX) + 'px', height: ((b - a) * UUR_PX) + 'px' }
		},
		stijl(ev, d) {
			const dagBegin = dagStart(d.datum)
			const sleept = this.sleep && this.sleep.ev === ev
			const start = sleept ? this.sleep.nieuwStart : new Date(ev.start)
			const eind = sleept ? this.sleep.nieuwEind : new Date(ev.end)
			const s = Math.max(0, (start - dagBegin) / 3600000 - (sleept ? this.sleep.dagVerschil * 24 : 0))
			const e = Math.min(24, (eind - dagBegin) / 3600000 - (sleept ? this.sleep.dagVerschil * 24 : 0))
			const hoogte = Math.max(0.4, e - s)
			// Overlappende afspraken naast elkaar: plek en breedte uit de groep.
			const groep = this.getimed(d).filter((x) => new Date(x.start) < new Date(ev.end) && new Date(x.end) > new Date(ev.start))
			const idx = Math.max(0, groep.findIndex((x) => x === ev))
			const n = Math.max(1, groep.length)
			const stijl = {
				top: (s * UUR_PX) + 'px',
				height: (hoogte * UUR_PX - 2) + 'px',
				left: (idx * (100 / n)) + '%',
				width: (100 / n) + '%',
				background: hex(ev.calendarColor, 'var(--color-primary-element, #1e3a5f)'),
				color: tekstKleur(ev.calendarColor),
			}
			if (sleept && this.sleep.dagVerschil) {
				stijl.transform = 'translateX(' + (this.sleep.dagVerschil * this.sleep.kolomBreedte) + 'px)'
			}
			return stijl
		},
		/**
		 * Slepen: 'verplaats' schuift begin en einde samen (per kwartier, en
		 * per dag naar een andere kolom), 'rek' schuift alleen het einde.
		 */
		beginSleep(e, ev, d, soort) {
			if (!this.bewerkbaar(ev)) { this.openEvent(ev); return }
			if (e.button !== 0) return
			e.preventDefault()
			const kolom = e.currentTarget.closest('.pa-cal__dagkolom')
			const kolomBreedte = kolom ? kolom.getBoundingClientRect().width : 100
			const start0 = new Date(ev.start)
			const eind0 = new Date(ev.end)
			this.sleep = { ev, soort, x0: e.clientX, y0: e.clientY, nieuwStart: start0, nieuwEind: eind0, dagVerschil: 0, kolomBreedte, bewogen: false }
			const move = (m) => {
				const dy = m.clientY - this.sleep.y0
				const dx = m.clientX - this.sleep.x0
				if (Math.abs(dx) > 4 || Math.abs(dy) > 4) this.sleep.bewogen = true
				const kwartieren = Math.round((dy / UUR_PX) * 4)
				const dagVerschil = soort === 'verplaats' ? Math.round(dx / kolomBreedte) : 0
				if (soort === 'verplaats') {
					const verschuiving = kwartieren * KWARTIER + dagVerschil * 86400000
					this.sleep.nieuwStart = new Date(start0.getTime() + verschuiving)
					this.sleep.nieuwEind = new Date(eind0.getTime() + verschuiving)
				} else {
					const nieuwEind = new Date(eind0.getTime() + kwartieren * KWARTIER)
					if (nieuwEind - start0 >= KWARTIER) this.sleep.nieuwEind = nieuwEind
				}
				this.sleep.dagVerschil = dagVerschil
			}
			const up = async () => {
				window.removeEventListener('pointermove', move)
				window.removeEventListener('pointerup', up)
				const s = this.sleep
				this.sleep = null
				if (!s) return
				if (!s.bewogen) { this.openEvent(ev); return }
				if (s.nieuwStart.getTime() === start0.getTime() && s.nieuwEind.getTime() === eind0.getTime()) return
				const agenda = this.calendars.find((c) => c.href === ev.calendarUri) || this.calendars[0]
				try {
					await updateEvent(agenda, ev.id, { title: ev.title, start: s.nieuwStart, end: s.nieuwEind, location: ev.location || null, description: ev.description || null })
					await this.load()
				} catch (err) {
					this.error = foutTekst(err)
				}
			}
			window.addEventListener('pointermove', move)
			window.addEventListener('pointerup', up)
		},
		openEvent(ev) {
			if (String(ev.id).startsWith('mirror-')) {
				this.error = t('This appointment comes from your phone and can only be changed there.')
				return
			}
			this.formEvent = ev
			this.formStart = null
			this.formSleutel++
			this.formOpen = true
			this.pasHoogte()
		},
		nieuwOp(d, e) {
			const rect = e.currentTarget.getBoundingClientRect()
			const uren = (e.clientY - rect.top) / UUR_PX
			const kwartier = Math.floor(uren * 4) / 4
			const start = new Date(d.datum)
			start.setHours(Math.floor(kwartier), Math.round((kwartier % 1) * 60), 0, 0)
			this.nieuwMet(start)
		},
		nieuwOpDag(d) {
			const start = new Date(d.datum)
			start.setHours(9, 0, 0, 0)
			this.nieuwMet(start)
		},
		nieuwMet(start) {
			this.formEvent = null
			this.formStart = start
			this.formSleutel++
			this.formOpen = true
			this.$el.scrollIntoView({ behavior: 'smooth', block: 'start' })
			this.pasHoogte()
		},
	},
}
</script>

<style scoped>
.pa-cal { display: flex; flex-direction: column; }
.pa-cal__toolbar { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.pa-cal__nav { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pa-cal__titel { margin: 0 0 0 8px; font-size: 1.2em; }
.pa-cal__keuzes { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.pa-cal__chips { display: flex; gap: 4px; }
.pa-cal__chip { border: 1px solid var(--color-border, #ccc); background: transparent; border-radius: 16px; padding: 4px 12px; cursor: pointer; color: inherit; display: inline-flex; align-items: center; }
.pa-cal__chip--active { background: var(--color-primary-element, #1e3a5f); color: var(--color-primary-element-text, #fff); border-color: transparent; }

/* mini-maand + agenda's */
.pa-cal__mini-rij { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; margin-bottom: 8px; }
.pa-cal__mini { border: 1px solid var(--color-border, #ddd); border-radius: var(--border-radius-large, 8px); padding: 6px 8px; width: 240px; }
.pa-cal__mini-kop { display: flex; justify-content: space-between; align-items: center; font-weight: 600; margin-bottom: 4px; }
.pa-cal__mini-knop { border: none; background: transparent; cursor: pointer; font-size: 1.2em; color: inherit; padding: 0 6px; }
.pa-cal__dagen { display: inline-flex; align-items: center; gap: 6px; font-size: 0.85em; }
.pa-cal__dagen input { width: 90px; }
.pa-cal__mini-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
.pa-cal__mini-dagnaam { text-align: center; font-size: 0.7em; color: var(--color-text-maxcontrast); }
.pa-cal__mini-dag { border: none; background: transparent; cursor: pointer; padding: 3px 0; border-radius: 50%; font-size: 0.8em; color: inherit; }
.pa-cal__mini-dag:hover { background: var(--color-background-hover); }
.pa-cal__mini-dag--buiten { opacity: .4; }
.pa-cal__mini-dag--vandaag { font-weight: 700; color: #c0392b; }
.pa-cal__mini-dag--gekozen { background: var(--color-primary-element, #1e3a5f); color: var(--color-primary-element-text, #fff); }
.pa-cal__agendas { display: flex; flex-direction: column; gap: 4px; }
.pa-cal__agenda { border: none; background: transparent; cursor: pointer; text-align: left; display: inline-flex; align-items: center; gap: 8px; color: inherit; font: inherit; padding: 2px 4px; }
.pa-cal__agenda--uit { opacity: .45; text-decoration: line-through; }
.pa-cal__agenda-bol { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }

/* week */
.pa-cal__week { border: 1px solid var(--color-border, #ddd); border-radius: var(--border-radius-large, 8px); overflow: hidden; display: flex; flex-direction: column; }
/* De kop en de hele-dag-rij moeten dezelfde ruimte overhouden als het rooster eronder, want daar zit een
   schuifbalk in. Zonder die reservering zijn de kolommen boven breder dan onder: gemeten 24-09 stond de
   laatste dag twaalf pixels naast zijn kolom, en dat liep per kolom verder op (Ramin: "de grid loopt niet
   goed"). `scrollbar-gutter` doet hetzelfde voor browsers die het kennen; de padding vangt de rest op. */
.pa-cal__weekkop, .pa-cal__heledag { display: grid; grid-template-columns: 56px repeat(7, minmax(0, 1fr)); border-bottom: 1px solid var(--color-border, #ddd); scrollbar-gutter: stable; overflow-y: scroll; }
/* Wel de ruimte, niet de balk: die hoort alleen bij het rooster dat echt schuift. */
.pa-cal__weekkop::-webkit-scrollbar, .pa-cal__heledag::-webkit-scrollbar { width: 15px; background: transparent; }
.pa-cal__weekkop::-webkit-scrollbar-thumb, .pa-cal__heledag::-webkit-scrollbar-thumb { background: transparent; }
.pa-cal__weeknr { font-size: 0.8em; color: var(--color-text-maxcontrast); display: flex; align-items: center; justify-content: center; }
.pa-cal__dagkop { padding: 6px 4px; text-align: center; cursor: pointer; border-left: 1px solid var(--color-border, #eee); }
.pa-cal__dagkop--vandaag .pa-cal__dagnr { background: var(--color-primary-element, #1e3a5f); color: var(--color-primary-element-text, #fff); border-radius: 50%; padding: 2px 7px; }
.pa-cal__dagnaam { display: block; font-size: 0.8em; color: var(--color-text-maxcontrast); text-transform: uppercase; }
.pa-cal__dagnr { font-weight: 600; }
.pa-cal__heledag-label { font-size: 0.8em; color: var(--color-text-maxcontrast); padding: 4px; }
.pa-cal__heledag-cel { min-height: 24px; min-width: 0; overflow: hidden; padding: 2px; border-left: 1px solid var(--color-border, #eee); display: flex; flex-direction: column; gap: 2px; }
.pa-cal__grid { display: grid; grid-template-columns: 56px repeat(7, minmax(0, 1fr)); overflow-y: auto; position: relative; }
.pa-cal__uurkolom { font-size: 0.75em; color: var(--color-text-maxcontrast); }
.pa-cal__uur { height: 48px; box-sizing: border-box; padding: 2px 4px; text-align: right; border-top: 1px solid var(--color-border, #eee); }
.pa-cal__dagkolom { position: relative; border-left: 1px solid var(--color-border, #eee); cursor: crosshair; height: 1152px; }
.pa-cal__dagkolom--vandaag { background: var(--color-background-hover, rgba(0,0,0,.03)); }
.pa-cal__werk { position: absolute; left: 0; right: 0; background: rgba(120, 150, 200, .12); pointer-events: none; }
.pa-cal__uurlijn { height: 48px; box-sizing: border-box; border-top: 1px solid var(--color-border, #eee); }
.pa-cal__nu { position: absolute; left: 0; right: 0; height: 2px; background: #c0392b; z-index: 2; pointer-events: none; }
.pa-cal__event { position: absolute; box-sizing: border-box; border-radius: 6px; padding: 2px 4px; overflow: hidden; cursor: grab; font-size: 0.78em; line-height: 1.2; z-index: 1; touch-action: none; user-select: none; }
.pa-cal__event--vast { cursor: pointer; }
.pa-cal__event--sleep { z-index: 3; box-shadow: 0 2px 10px rgba(0,0,0,.4); opacity: .95; cursor: grabbing; }
.pa-cal__event-tijd { display: block; opacity: .9; }
.pa-cal__event-titel { display: block; font-weight: 600; }
.pa-cal__greep { position: absolute; left: 0; right: 0; bottom: 0; height: 7px; cursor: ns-resize; }

/* maand */
.pa-cal__maand { display: flex; flex-direction: column; border: 1px solid var(--color-border, #ddd); border-radius: var(--border-radius-large, 8px); overflow: hidden; }
.pa-cal__maandkoppen { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border-bottom: 1px solid var(--color-border, #ddd); flex: 0 0 auto; }
.pa-cal__maandkop { padding: 6px 4px; text-align: center; font-size: 0.8em; text-transform: uppercase; color: var(--color-text-maxcontrast); }
.pa-cal__weekrij { position: relative; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); flex: 1 1 0; min-height: 80px; overflow: hidden; }
.pa-cal__cel { min-width: 0; overflow: hidden; padding: 4px; border-top: 1px solid var(--color-border, #eee); border-left: 1px solid var(--color-border, #eee); cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
.pa-cal__cel--buiten { opacity: .45; }
.pa-cal__cel--vandaag { background: var(--color-background-hover, rgba(0,0,0,.03)); }
.pa-cal__celkop { display: flex; justify-content: flex-end; }
.pa-cal__celnr { border: none; background: transparent; font-weight: 600; cursor: pointer; padding: 2px 6px; border-radius: 12px; color: inherit; }
.pa-cal__cel--vandaag .pa-cal__celnr { background: var(--color-primary-element, #1e3a5f); color: var(--color-primary-element-text, #fff); }
.pa-cal__balkruimte { flex: 0 0 auto; }
.pa-cal__balk { position: absolute; height: 18px; border: none; border-radius: 4px; font-size: 0.75em; text-align: left; padding: 0 6px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor: pointer; z-index: 1; }
.pa-cal__chipev { display: block; max-width: 100%; box-sizing: border-box; border: none; border-radius: 4px; text-align: left; padding: 1px 5px; font-size: 0.75em; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor: pointer; }
.pa-cal__chipev-tijd { opacity: .85; margin-right: 4px; }
.pa-cal__meer { border: none; background: transparent; font-size: 0.75em; color: var(--color-text-maxcontrast); cursor: pointer; text-align: left; padding: 0 5px; }
@media (max-width: 700px) {
	.pa-cal__weekkop, .pa-cal__heledag, .pa-cal__grid { grid-template-columns: 40px repeat(7, minmax(0, 1fr)); }
	.pa-cal__weekrij { min-height: 64px; }
	.pa-cal__chipev { font-size: 0.65em; }
}
</style>
