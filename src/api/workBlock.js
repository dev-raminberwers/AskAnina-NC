/**
 * Je werkdag als afspraak, net als op de telefoon.
 *
 * Dezelfde regels als workEventsFor() in de Android-app (TodayScreen.kt): op
 * een werkdag komt er een blok van je begintijd tot je eindtijd, op je
 * werkadres — of op je thuisadres als je die dag thuiswerkt. Dat blok gaat
 * mee naar de dagplanner als gewone afspraak, dus de rit ernaartoe en de rit
 * terug worden erbij gerekend; alleen een vlucht binnen werktijd snijdt het
 * blok in stukken.
 *
 * Thuiswerken = je vaste patroon (workFromHomeDays) XOR een losse afwijking
 * voor die datum (workFromHomeDates). Zo zet één tik op de kaart die ene dag
 * om zonder je patroon te veranderen.
 */

const DAGEN = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

function lijst(waarde) {
	if (!waarde) return []
	if (Array.isArray(waarde)) return waarde
	return String(waarde).split(',').map((s) => s.trim()).filter(Boolean)
}

function dagSleutel(date) {
	const y = date.getFullYear()
	const m = String(date.getMonth() + 1).padStart(2, '0')
	const d = String(date.getDate()).padStart(2, '0')
	return `${y}-${m}-${d}`
}

function tijdOpDag(date, hhmm) {
	const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim())
	if (!m) return null
	const d = new Date(date)
	d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0)
	return d
}

const VLUCHTNUMMER = /\b[a-z]{2}\s?\d{2,4}\b/
const VLUCHTWOORD = /\b(vlucht|flight|flug|vuelo|volo|voo)\b/
const LUCHTHAVENWOORD = /\b(luchthaven|airport|flughafen|aeropuerto|aeroporto|aéroport)\b/

function lijktOpVlucht(event) {
	const tekst = ((event.title || '') + ' ' + (event.location || '')).toLowerCase()
	if (VLUCHTNUMMER.test(tekst) && VLUCHTWOORD.test(tekst)) return true
	return VLUCHTWOORD.test(tekst) || LUCHTHAVENWOORD.test(tekst)
}

/** Werkt je op deze dag thuis? */
export function werktThuis(date, settings) {
	const patroon = lijst(settings.workFromHomeDays).map((s) => s.toUpperCase()).includes(DAGEN[date.getDay()])
	const afwijking = lijst(settings.workFromHomeDates).includes(dagSleutel(date))
	return patroon !== afwijking
}

export { dagSleutel }

/**
 * @param {Date} date de dag
 * @param {Array} dayEvents de echte afspraken van die dag
 * @param {object} settings de gesynchroniseerde instellingen
 * @param {{office: string, home: string, calendar: string}} labels vertaalde titels
 */
export function workEventsFor(date, dayEvents, settings, labels) {
	if (settings.workLat == null || settings.workLon == null) return []
	const werkdagen = lijst(settings.workDays).map((s) => s.toUpperCase())
	if (!werkdagen.includes(DAGEN[date.getDay()])) return []
	const workStart = tijdOpDag(date, settings.workStartTime)
	const workEnd = tijdOpDag(date, settings.workEndTime)
	if (!workStart || !workEnd || workEnd <= workStart) return []

	const thuis = werktThuis(date, settings)
	const adres = thuis ? (settings.homeAddress || '') : (settings.workAddress || '')
	const sleutel = dagSleutel(date)

	const segment = (id, start, end) => ({
		id,
		title: thuis ? labels.home : labels.office,
		start: start.toISOString(),
		end: end.toISOString(),
		location: adres,
		calendarName: labels.calendar,
		calendarUri: 'synthetic-work',
		homeOverride: false,
		notAttended: false,
		description: null,
	})

	const vluchten = dayEvents
		.filter((ev) => {
			const s = new Date(ev.start); const e = new Date(ev.end)
			return !isNaN(s) && !isNaN(e) && s < workEnd && e > workStart && lijktOpVlucht(ev)
		})
		.sort((a, b) => new Date(a.start) - new Date(b.start))

	if (!vluchten.length) return [segment('synthetic-work-' + sleutel, workStart, workEnd)]

	const segments = []
	let cursor = workStart
	vluchten.forEach((vlucht, index) => {
		const vs = new Date(vlucht.start); const ve = new Date(vlucht.end)
		const begin = vs < workStart ? workStart : vs
		const eind = ve > workEnd ? workEnd : ve
		if (begin > cursor) segments.push(segment('synthetic-work-' + sleutel + '-' + index, cursor, begin))
		if (eind > cursor) cursor = eind
	})
	if (cursor < workEnd) segments.push(segment('synthetic-work-' + sleutel + '-end', cursor, workEnd))
	return segments
}

/**
 * Welke afspraken binnen een werkblok vallen: alles dat begint tussen begin
 * en eind van het blok en zelf geen werk of vlucht is.
 */
/** Sleutel van een genest item: afspraak-id, of de vertrektijd van een losse rit. */
export function nestSleutel(k) {
	return k.event ? k.event.id : 'reis:' + (k.travel && k.travel.departureTime)
}

export function nestUnderWork(items) {
	const children = {}
	const nested = new Set()
	// Container-afspraken (kaart 53): de server zet containerId op wat erin valt.
	for (const blok of items) {
		const ev = blok.event
		if (!ev || !blok.isContainer) continue
		// Ook losse reisstappen (terugrit) die de server in de container zet (2026-09-15).
		const binnen = items.filter((k) => (k.event || k.travel) && k.containerId === ev.id)
		if (binnen.length) {
			children[ev.id] = binnen
			binnen.forEach((k) => nested.add(nestSleutel(k)))
		}
	}
	for (const blok of items) {
		const ev = blok.event
		if (!ev || ev.calendarUri !== 'synthetic-work') continue
		const begin = new Date(ev.start); const eind = new Date(ev.end)
		const binnen = items.filter((k) => {
			// De rit terug naar kantoor na een afspraak onder werktijd: de
			// werk-workflow zet containerId op het werkblok (2026-09-16).
			if (!k.event && k.travel && k.containerId === ev.id) return true
			const kev = k.event
			if (!kev || kev.calendarUri === 'synthetic-work' || k.flightInfo) return false
			const ks = new Date(kev.start)
			return ks >= begin && ks < eind
		})
		if (binnen.length) {
			children[ev.id] = binnen
			binnen.forEach((k) => nested.add(nestSleutel(k)))
		}
	}
	return { children, nested }
}

/**
 * Is deze titel een reis met twee of meer vluchten (kaart 76)? Luchthaven,
 * eventueel maatschappij, luchthaven, ... met minstens drie luchthavens:
 * "AMS EK DXB BKK SQ SIN QF SYD AKL LA SCL". Zelfde regel als
 * FlightChain::isKetting op de server en isVluchtKetting op de telefoon.
 */
export function isVluchtKetting(titel) {
	const tokens = String(titel || '').trim().toUpperCase().split(/\s+/).filter(Boolean)
	if (tokens.length < 3) return false
	let luchthavens = 0
	let verwachtLuchthaven = true
	for (const tok of tokens) {
		if (verwachtLuchthaven && /^[A-Z]{3}$/.test(tok)) { luchthavens++; verwachtLuchthaven = false; continue }
		if (!verwachtLuchthaven && /^[A-Z0-9]{2}$/.test(tok)) { verwachtLuchthaven = true; continue }
		if (!verwachtLuchthaven && /^[A-Z]{3}$/.test(tok)) { luchthavens++; continue }
		return false
	}
	return luchthavens >= 3 && !verwachtLuchthaven
}

/** Een hotel of ander verblijf, dezelfde woorden als Detect::accommodation op de server. */
export function isVerblijf(titel) {
	return /(hotel|resort|guesthouse|guest house|hostel|airbnb|b&b|overnachting|verblijf|accommodation)/i.test(String(titel || ''))
}
