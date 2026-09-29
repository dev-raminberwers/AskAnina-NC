<template>
	<div class="pa-trip">
		<h2>{{ t('Trip') }}</h2>
		<FoutMelding v-if="error" :error="error" />
		<NcNoteCard v-if="saved" type="success">{{ t('Trip saved to your calendar.') }}</NcNoteCard>
		<NcNoteCard v-if="terugKlaar" type="info">{{ t('Now the way back: check the date and press Search.') }}</NcNoteCard>

		<form class="pa-trip__form" @submit.prevent="search">
			<div class="pa-trip__field">
				<input v-model="destination" type="text" class="pa-trip__input" :placeholder="t('Where to?')" autocomplete="off" @input="onDestinationInput">
				<ul v-if="suggestions.length" class="pa-trip__suggest">
					<li v-for="s in suggestions" :key="s.display_name"><button type="button" @click="pickSuggestion(s)">{{ s.display_name }}</button></li>
				</ul>
			</div>
			<div class="pa-trip__row">
				<label class="pa-trip__sub">
					<input v-model="departAt" type="radio" :value="false"> {{ t('Arrive by') }}
				</label>
				<label class="pa-trip__sub">
					<input v-model="departAt" type="radio" :value="true"> {{ t('Depart at') }}
				</label>
				<input v-model="date" type="date" class="pa-trip__input pa-trip__input--short">
				<input v-model="time" type="time" class="pa-trip__input pa-trip__input--short">
			</div>
			<input v-model="hint" type="text" class="pa-trip__input" :placeholder="t('Optional: airports, airline or flight number, e.g. AMS KL BCN or KL1513')">
			<!-- Je voorkeursmaatschappijen als knoppen: kies er een en de vlucht
			     wordt alleen bij die maatschappij gezocht (Ramin, 2026-09-13). -->
			<div v-if="airlines.length" class="pa-trip__row">
				<button type="button" class="pa-trip__chip" :class="{ 'pa-trip__chip--on': airlineChoice === null }" @click="kiesMaatschappij(null)">{{ t('All') }}</button>
				<button v-for="a in airlines" :key="a" type="button" class="pa-trip__chip" :class="{ 'pa-trip__chip--on': airlineChoice === a }" @click="kiesMaatschappij(a)">{{ a }}</button>
			</div>
			<div class="pa-trip__row">
				<select v-model="calendarHref" class="pa-trip__input pa-trip__input--short">
					<option v-for="c in calendars" :key="c.href" :value="c.href">{{ c.displayName }}</option>
				</select>
				<button type="submit" class="pa-trip__btn pa-trip__btn--primary" :disabled="searching || !destination.trim()">{{ t('Search') }}</button>
			</div>
		</form>

		<NcLoadingIcon v-if="searching" :size="28" />
		<p v-if="busyModes.length" class="pa-trip__sub">{{ t('Still looking: %s', busyModes.map(modeLabel).join(', ')) }}</p>

		<div v-for="(o, i) in options" :key="o.mode + o.startTime" class="pa-trip__option" :class="{ 'pa-trip__option--chosen': chosen === i }" @click="chosen = i">
			<div class="pa-trip__head">
				<span class="pa-trip__icon">{{ modeIcon(o.mode) }}</span>
				<div class="pa-trip__body">
					<div class="pa-trip__title">{{ modeLabel(o.mode) }}<template v-if="o.flightNumber"> · {{ o.flightNumber }}</template></div>
					<div class="pa-trip__sub">{{ klok(o.startTime) }}{{ plus(o.startTime) }} – {{ klok(o.endTime) }}{{ plus(o.endTime) }} · {{ duur(o.durationMin) }}<template v-if="o.transfers"> · {{ t('%d transfers', o.transfers) }}</template></div>
				</div>
				<input type="radio" name="pa-trip-choice" :checked="chosen === i" @change="chosen = i">
			</div>
			<div v-if="chosen === i" class="pa-trip__legs">
				<div v-for="(l, j) in o.legs.filter(x => x.mode !== 'WALK')" :key="j" class="pa-trip__leg">
					<span class="pa-trip__legtime">{{ klok(l.startTime) }}{{ plus(l.startTime) }}</span>
					<span class="pa-trip__icon">{{ modeIcon(l.mode) }}</span>
					<span class="pa-trip__legtext">{{ legTitle(l) }}</span>
				</div>
			</div>
		</div>

		<p v-for="n in notes" :key="n" class="pa-trip__note">{{ noteText(n) }}</p>

		<div v-if="options.length" class="pa-trip__row">
			<button type="button" class="pa-trip__btn pa-trip__btn--primary" :disabled="chosen === null || saving || !calendarHref" @click="save">{{ t('Save to calendar') }}</button>
		</div>
	</div>
</template>

<script>
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import { t, currentLocale } from '../l10n/index.js'
import { neemVoorinvulling } from '../api/voorinvulling.js'
import { foutTekst } from '../api/fouten.js'
import FoutMelding from './FoutMelding.vue'
import { getSettings, setTravelChoice } from '../api/nextcloudUserData.js'
import { createEvent, gekozenKalenders } from '../api/nextcloudCalendar.js'
import { getAccessCode } from '../api/accessCode.js'
import * as paApi from '../api/paApi.js'
import { volgSync } from '../api/sync.js'

/**
 * De reisplanner, zoals Today → + → Trip op de telefoon (2026-09-13): waar
 * naartoe, wanneer er zijn, en de drie manieren (auto, openbaar vervoer,
 * vliegen) los opgevraagd zodat je de snelste al ziet terwijl de trage nog
 * zoekt. De gekozen reis gaat als losse kaarten in je agenda — dezelfde
 * UID-vorm (pa-trip-…) en dezelfde categorie als de telefoon, zodat de
 * dagplanner ze als "dit is de reis" herkent en er niets bij verzint.
 */
const MODES = ['car', 'transit', 'flight']

/** "AMS KL BCN" → luchthavens + maatschappijen; "KL1513" → vluchtnummers. Zelfde regels als de telefoon. */
function leesHint(text) {
	const tokens = text.trim().split(/\s+/).filter(Boolean).map((x) => x.toUpperCase())
	if (!tokens.length) return { flightNumbers: [], iataCodes: [], airlineCodes: [] }
	const luchthavens = []; const maatschappijen = []; const vooraf = []
	let wachtend = null
	for (const tok of tokens) {
		if (tok.length === 3 && /^[A-Z]{3}$/.test(tok)) {
			if (luchthavens.length) maatschappijen.push(wachtend)
			wachtend = null
			luchthavens.push(tok)
		} else if (tok.length === 2 && /^[A-Z0-9]{2}$/.test(tok) && /[A-Z]/.test(tok)) {
			// Maatschappij vóór de eerste luchthaven, of zonder luchthavens ("OR" = TUI,
			// Ramin 2026-09-15): die geldt dan voor alle stukken, als een keuze.
			if (luchthavens.length) wachtend = tok; else vooraf.push(tok)
		} else {
			// Iets anders (een vluchtnummer): dan gaat de hele invoer als nummers.
			return { flightNumbers: tokens, iataCodes: [], airlineCodes: [] }
		}
	}
	if (wachtend !== null) return { flightNumbers: tokens, iataCodes: [], airlineCodes: [] }
	const vast = vooraf[0] || null
	if (!luchthavens.length) return { flightNumbers: [], iataCodes: [], airlineCodes: vast ? [vast] : [], vasteMaatschappij: vast }
	const perStuk = vast ? Array.from({ length: Math.max(1, luchthavens.length - 1) }, (_, i) => maatschappijen[i] || vast) : maatschappijen
	return { flightNumbers: [], iataCodes: luchthavens, airlineCodes: perStuk, vasteMaatschappij: vast }
}

async function reisSleutel(bestemming, startIso) {
	const bytes = new TextEncoder().encode(bestemming + '|' + startIso)
	const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes))
	return Array.from(hash.slice(0, 6)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default {
	name: 'TripView',
	components: { FoutMelding, NcLoadingIcon, NcNoteCard },
	data() {
		const morgen = new Date(Date.now() + 86400000)
		return { stopKijken: null,
			settings: {}, calendars: [], calendarHref: '',
			destination: '', destLat: null, destLon: null, suggestions: [], suggestTimer: null,
			// Vertrekken-om is de gewone vraag (Ramin, 2026-09-13).
			departAt: true, date: morgen.toISOString().slice(0, 10), time: '12:00', hint: '',
			searching: false, busyModes: [], options: [], notes: [], chosen: null, airlineChoice: null,
			saving: false, saved: false, error: null,
			// Ingesproken terugreis, klaargezet zodra de heenreis bewaard is (kaart 100).
			terug: null, terugKlaar: false,
		}
	},
	computed: {
		airlines() { return (this.settings.preferredAirlines || []).map((a) => String(a).toUpperCase()).filter(Boolean) },
	},
	async mounted() {
		await this.laadBasis(true)
		// Meeluisteren met je andere apparaten (Ramin, 24-09). Alleen je instellingen en agenda's; wat je
		// hier in het formulier hebt ingevuld blijft staan.
		this.stopKijken = volgSync(() => this.laadBasis(false), ['settings'])
		// Ingesproken reis via Anina (kaart 100): ingevuld en meteen zoeken; de
		// gebruiker kiest en slaat op. "Terug zondag" wacht tot de heenreis bewaard is.
		const v = neemVoorinvulling('trip')
		if (v && v.destination) {
			this.destination = v.destination
			this.destLat = null; this.destLon = null
			if (v.date) this.date = v.date
			this.time = v.time || '09:00'
			this.departAt = v.timing !== 'arrive'
			this.hint = v.flights || v.airline || ''
			this.terug = v.returnDate ? { date: v.returnDate, time: v.returnTime || '09:00', airline: v.airline || '', vanaf: v.destination } : null
			this.search()
		}
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
	},
	methods: {
		/** Je instellingen en gekozen agenda's; bij het openen en als er elders iets wijzigt. */
		async laadBasis(eersteKeer) {
			try {
				this.settings = await getSettings()
				this.calendars = await gekozenKalenders(this.settings)
				if (eersteKeer || !this.calendarHref) this.calendarHref = this.calendars[0]?.href || ''
			} catch (e) { this.error = foutTekst(e) }
		},
		t(...args) { return t(...args) },
		kiesMaatschappij(a) { this.airlineChoice = a; if (this.destination.trim()) this.search() },
		klok(iso) { return new Date(iso).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }) },
		// "+1" achter een tijd die een dag na de gekozen dag valt (Ramin, 2026-09-13: "hh:mm+1").
		plus(iso) {
			const dagen = Math.round((Date.parse(String(iso).slice(0, 10)) - Date.parse(this.date)) / 86400000)
			return dagen > 0 ? '+' + dagen : ''
		},
		duur(min) { min = Math.max(0, min); const h = Math.floor(min / 60); const m = min % 60; return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min` },
		/** De duur van een stap: van de server als de klokken in andere tijdzones staan (vlucht), anders uit de tijden. */
		legDuur(l) { return l.durationMin > 0 ? l.durationMin : Math.round((new Date(l.endTime) - new Date(l.startTime)) / 60000) },
		modeIcon(mode) {
			return { car: '🚗', CAR: '🚗', transit: '🚆', TRAIN: '🚆', RAIL: '🚆', BUS: '🚌', METRO: '🚇', TRAM: '🚊', flight: '✈', FLIGHT: '✈', CHECKIN: '🛂', TRANSFER: '🔁', ARRIVAL: '🧳', TAXI: '🚕', WALK: '🚶' }[mode] || '•'
		},
		modeLabel(mode) { return { car: t('Car'), transit: t('Public transport'), flight: t('Flight') }[mode] || mode },
		legTitle(l) {
			if (l.mode === 'CHECKIN') return t('Check-in, security, passport control')
			if (l.mode === 'ARRIVAL') return t('Passport control, baggage, customs')
			if (l.mode === 'TRANSFER') return t('Transfer') + ' · ' + l.toName
			const lijn = (l.routeShortName || l.displayName || '').trim()
			const route = l.fromName + ' → ' + l.toName
			return lijn ? `${lijn}  ${route}` : route
		},
		noteText(n) {
			if (n === 'no_airlabs_key') return t('Set an AirLabs API key under Settings first.')
			if (n === 'too_close_to_fly') return t('Too close to fly.')
			if (n === 'no_car_route') return t('No road to this destination, so no car trip.')
			if (n === 'no_airport_near_origin' || n === 'no_airport_near_destination') return t('No airport nearby.')
			if (n === 'no_flight_on_route' || n === 'no_flight_found') return t('No matching flights found.')
			if (n.startsWith('no_flight_airline:')) return t('No connection with %s for this trip. Try All or another airline.', n.slice(18))
			if (n.startsWith('airlabs_error:')) return t('AirLabs refused the request (%s). Check your AirLabs key and monthly limit under Settings, APIs.', n.slice(14))
			return n
		},
		onDestinationInput() {
			this.destLat = null; this.destLon = null
			clearTimeout(this.suggestTimer)
			const q = this.destination.trim()
			if (q.length < 3) { this.suggestions = []; return }
			this.suggestTimer = setTimeout(async () => {
				try { this.suggestions = await paApi.geocodeSuggest(q, 5) } catch (e) { this.suggestions = [] }
			}, 350)
		},
		pickSuggestion(s) {
			this.destination = s.display_name; this.destLat = s.lat; this.destLon = s.lon; this.suggestions = []
		},
		deadlineIso() {
			// Lokale tijd van deze browser; de telefoon neemt de tijdzone van de bestemming, dat komt later.
			const d = new Date(`${this.date}T${this.time}:00`)
			const off = -d.getTimezoneOffset(); const sign = off >= 0 ? '+' : '-'; const a = Math.abs(off)
			return `${this.date}T${this.time}:00${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`
		},
		async search() {
			this.error = null; this.saved = false; this.terugKlaar = false; this.options = []; this.notes = []; this.chosen = null; this.suggestions = []
			if (this.destLat == null) {
				try { const g = await paApi.geocode(this.destination.trim()); this.destLat = g.lat; this.destLon = g.lon } catch (e) { this.error = t('Pick a destination first.'); return }
			}
			const home = (this.settings.homeLat != null && this.settings.homeLon != null) ? { lat: this.settings.homeLat, lon: this.settings.homeLon } : null
			if (!home) { this.error = t('Set your home address in Settings first.'); return }
			const pins = leesHint(this.hint)
			const basis = {
				fromLat: home.lat, fromLon: home.lon, fromLabel: t('Home'),
				toLat: this.destLat, toLon: this.destLon, toLabel: this.destination.trim(),
				arriveBy: this.deadlineIso(), departAt: this.departAt,
				airlabsApiKey: this.settings.airLabsKey || null,
				preferredAirlines: (this.airlineChoice || pins.vasteMaatschappij) ? [this.airlineChoice || pins.vasteMaatschappij] : (this.settings.preferredAirlines || []),
				flightNumbers: pins.flightNumbers, iataCodes: pins.iataCodes,
				// Een gekozen knop, of een getypte maatschappij ("OR" = TUI), geldt voor alle stukken en gaat voor de hint.
				airlineCodes: (this.airlineChoice || pins.vasteMaatschappij) ? Array(Math.max(1, (pins.iataCodes.length || 2) - 1)).fill(this.airlineChoice || pins.vasteMaatschappij) : pins.airlineCodes,
				strictAirline: !!(this.airlineChoice || pins.vasteMaatschappij),
			}
			this.searching = true; this.busyModes = [...MODES]
			await Promise.all(MODES.map(async (mode) => {
				try {
					const r = await paApi.planTrip(getAccessCode(), { ...basis, modes: [mode] })
					this.options = [...this.options, ...(r.options || [])].sort((a, b) => (a.startTime < b.startTime ? 1 : -1))
					this.notes = [...new Set([...this.notes, ...(r.notes || [])])]
					if (this.chosen === null && this.options.length) this.chosen = 0
				} catch (e) { this.error = foutTekst(e) } finally {
					this.busyModes = this.busyModes.filter((m) => m !== mode)
					if (!this.busyModes.length) this.searching = false
				}
			}))
			if (!this.options.length && !this.error) this.error = t('Nothing found for this trip.')
		},
		async save() {
			const optie = this.options[this.chosen]; if (!optie) return
			const calendar = this.calendars.find((c) => c.href === this.calendarHref); if (!calendar) return
			this.saving = true; this.error = null
			try {
				const legs = optie.legs.filter((l) => l.mode !== 'WALK')
				let kaarten = legs.map((l) => ({ title: this.legTitle(l), start: new Date(l.startTime), end: new Date(l.endTime), location: l.toName }))
				// Een vliegreis wordt één afspraak met de reis als titel, "AMS EK DXB EK BKK ...",
				// en de vluchtnummers in de omschrijving (Ramin, kaart 76). De dagplanner klapt
				// hem per dag uit tot een reiskaart met alle stappen.
				const vluchten = legs.filter((l) => l.mode === 'FLIGHT')
				if (optie.mode === 'flight' && vluchten.length) {
					const iata = (naam) => (String(naam || '').toUpperCase().match(/\(([A-Z]{3})\)/) || [])[1] || null
					const codes = vluchten.map((l) => [iata(l.fromName), iata(l.toName)])
					if (codes.every((c) => c[0] && c[1])) {
						const woorden = [codes[0][0]]
						vluchten.forEach((l, i) => {
							const m = String(l.routeShortName || '').trim().toUpperCase().match(/^([A-Z0-9]{2})\d/)
							if (m) woorden.push(m[1])
							woorden.push(codes[i][1])
						})
						kaarten = [{ title: woorden.join(' '), start: new Date(vluchten[0].startTime), end: new Date(vluchten[vluchten.length - 1].endTime), location: null, description: vluchten.map((l) => (l.routeShortName || '').trim()).filter(Boolean).join(' ') || null }]
					}
				}
				if (!kaarten.length) kaarten.push({ title: t('Trip to %s', this.destination.trim()), start: new Date(optie.startTime), end: new Date(optie.endTime), location: this.destination.trim() })
				const sleutel = await reisSleutel(this.destination.trim(), legs[0]?.startTime || optie.startTime)
				const travelMode = optie.mode === 'flight' ? 'flying' : optie.mode === 'transit' ? 'training' : 'driving'
				for (let i = 0; i < kaarten.length; i++) {
					const uid = `pa-trip-${sleutel}-${i}`
					await createEvent(calendar, { ...kaarten[i], uid, categories: 'PersonalAssistant' })
					await setTravelChoice(uid, { travelMode, flightNumber: optie.flightNumber || null, isTrip: true })
				}
				this.saved = true
				if (this.terug) {
					// De terugreis: naar huis, op de gezegde dag; de gebruiker drukt op Zoeken.
					const t = this.terug
					this.terug = null
					this.destination = this.settings.homeAddress || ''
					this.destLat = this.settings.homeLat || null; this.destLon = this.settings.homeLon || null
					this.date = t.date; this.time = t.time; this.departAt = true; this.hint = t.airline
					this.options = []; this.notes = []; this.chosen = null
					this.terugKlaar = true
				}
			} catch (e) { this.error = foutTekst(e) } finally { this.saving = false }
		},
	},
}
</script>

<style scoped>
.pa-trip__form { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.pa-trip__field { position: relative; }
.pa-trip__row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.pa-trip__input { font: inherit; min-height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); width: 100%; }
.pa-trip__input--short { width: auto; }
.pa-trip__suggest { position: absolute; z-index: 5; left: 0; right: 0; margin: 0; padding: 4px 0; list-style: none; background: var(--color-main-background); border: 1px solid var(--color-border); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,.12); }
.pa-trip__suggest button { width: 100%; text-align: left; background: none; border: 0; padding: 6px 10px; font: inherit; color: inherit; cursor: pointer; }
.pa-trip__suggest button:hover { background: var(--color-background-hover); }
.pa-trip__sub { font-size: 0.85em; color: var(--color-text-maxcontrast); }
.pa-trip__note { font-size: 0.85em; color: var(--color-text-maxcontrast); margin: 4px 0; }
.pa-trip__option { border: 1px solid var(--color-border); border-radius: var(--border-radius-large); padding: 10px 14px; margin-bottom: 8px; cursor: pointer; }
.pa-trip__option--chosen { border-color: var(--color-primary-element); }
.pa-trip__head { display: flex; align-items: center; gap: 10px; }
.pa-trip__body { flex: 1; }
.pa-trip__title { font-weight: bold; }
.pa-trip__icon { font-size: 1.2em; min-width: 1.6em; text-align: center; }
.pa-trip__legs { border-top: 1px solid var(--color-border); margin-top: 8px; padding-top: 6px; display: flex; flex-direction: column; gap: 4px; }
.pa-trip__leg { display: flex; gap: 8px; align-items: center; font-size: 0.9em; }
.pa-trip__legtime { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; min-width: 44px; }
.pa-trip__btn { font: inherit; font-size: 0.9em; min-height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); cursor: pointer; }
.pa-trip__chip { font: inherit; font-size: 0.85em; min-height: 30px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); cursor: pointer; }
.pa-trip__chip--on { border-color: var(--color-primary-element); background: var(--color-primary-element-light); font-weight: bold; }
.pa-trip__btn--primary { background: var(--color-primary-element); color: var(--color-primary-element-text); border-color: transparent; }
</style>
