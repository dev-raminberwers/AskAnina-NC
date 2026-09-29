/**
 * De agenda van een Account-gebruiker (geen Nextcloud): afspraken in onze
 * eigen database, via account/appointments/*.php — dezelfde endpoints als de
 * telefoon in Account-modus gebruikt.
 *
 * De schermen praten in ICS-blokken en UIDs (dat is wat de Nextcloud-kant
 * oplevert), dus hier vertalen we een rij uit de database naar precies zo'n
 * blok. Dan hoeven Vandaag, Overzicht en Open items niets te weten van
 * welke bron eronder zit. UID-vorm: `apt-<id>`, gelijk aan Android.
 */
import { getAccessCode } from './accessCode.js'
import * as paApi from './paApi.js'
import { onthoudKoppeling } from './naamKoppeling.js'
import { t } from '../l10n/index.js'

export const ACCOUNT_CALENDAR_HREF = 'account'

let cache = null
let cacheAt = 0
const CACHE_MS = 30 * 1000

export function invalidateAccountCalendar() {
	cache = null
	cacheAt = 0
}

function code() {
	const c = getAccessCode()
	if (!c) throw new Error(t('Enter your USER-API code first.'))
	return c
}

export function accountCalendar() {
	return { href: ACCOUNT_CALENDAR_HREF, displayName: t('My appointments'), color: '#1e3a5f' }
}

export async function discoverCalendars() {
	return [accountCalendar()]
}

async function alleAfspraken() {
	if (cache && Date.now() - cacheAt < CACHE_MS) return cache
	cache = await paApi.listAppointments(code())
	cacheAt = Date.now()
	return cache
}

/**
 * De herhaalcode als RRULE (Ramin, 2026-09-14): BIWEEKLY = elke twee weken,
 * MONTHLY = zelfde datum, MONTHLY_NTH = zelfde weekdag op dezelfde plek in de
 * maand als de start (eerste vrijdag), YEARLY = jaarlijks. ical.js rolt hem
 * uit, zoals bij een Nextcloud-agenda.
 */
export function rruleVoor(recurrence, startUtc, until, interval = 1, count = null) {
	if (!recurrence || recurrence === 'NONE') return null
	let rule = null
	if (recurrence === 'DAILY') rule = 'FREQ=DAILY'
	else if (recurrence === 'WEEKLY') rule = 'FREQ=WEEKLY'
	else if (recurrence === 'BIWEEKLY') rule = 'FREQ=WEEKLY;INTERVAL=2'
	else if (recurrence === 'MONTHLY') rule = 'FREQ=MONTHLY'
	else if (recurrence === 'YEARLY') rule = 'FREQ=YEARLY'
	else if (recurrence === 'MONTHLY_NTH') {
		const d = new Date(String(startUtc).replace(' ', 'T') + (String(startUtc).endsWith('Z') ? '' : 'Z'))
		const dagen = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
		const dag = d.getUTCDate()
		const dagenInMaand = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
		const rang = Math.floor((dag - 1) / 7) + 1
		const laatste = dag + 7 > dagenInMaand
		rule = `FREQ=MONTHLY;BYDAY=${laatste || rang >= 5 ? -1 : rang}${dagen[d.getUTCDay()]}`
	} else return null
	const n = parseInt(interval, 10)
	if (n > 1 && recurrence !== 'BIWEEKLY') rule += `;INTERVAL=${n}`
	const c = parseInt(count, 10)
	if (c > 0) rule += `;COUNT=${c}`
	if (until) rule += `;UNTIL=${String(until).replace(/-/g, '')}T235959Z`
	return rule
}

function icsTijd(mysqlUtc) {
	// "2026-09-14 10:00:00" (UTC) -> 20260914T100000Z
	return String(mysqlUtc).replace(/[-:]/g, '').replace(' ', 'T') + 'Z'
}

function escapeIcsText(text) {
	return String(text ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/** Eén rij uit pa_appointments als VCALENDAR-tekst, zoals CalDAV hem zou geven. */
export function rijAlsIcs(rij) {
	const uid = `apt-${rij.id}`
	const lines = [
		'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PersonalAssistant//EN', 'BEGIN:VEVENT',
		`UID:${uid}`,
		`DTSTAMP:${icsTijd(rij.start_utc)}`,
		`DTSTART:${icsTijd(rij.start_utc)}`,
		`DTEND:${icsTijd(rij.end_utc)}`,
		`SUMMARY:${escapeIcsText(rij.title)}`,
	]
	if (rij.location) lines.push(`LOCATION:${escapeIcsText(rij.location)}`)
	if (rij.description) lines.push(`DESCRIPTION:${escapeIcsText(rij.description)}`)
	const rule = rruleVoor(rij.recurrence, rij.start_utc, rij.recurrence_until, rij.recurrence_interval || 1, rij.recurrence_count || null)
	if (rule) lines.push('RRULE:' + rule)
	lines.push('END:VEVENT', 'END:VCALENDAR')
	return lines.join('\r\n') + '\r\n'
}

/**
 * Dezelfde vorm als nextcloudCalendar.fetchCalendarData: blokken {href, ics}.
 * Herhalende afspraken gaan altijd mee (de parser kiest de juiste dag);
 * losse alleen als ze het venster raken.
 */
export async function fetchCalendarData(calendar, dateUtcStart, dateUtcEnd) {
	const start = Date.parse(dateUtcStart.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'))
	const end = Date.parse(dateUtcEnd.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'))
	const rijen = await alleAfspraken()
	const eigen = rijen
		.filter((r) => {
			if (r.recurrence && r.recurrence !== 'NONE') return true
			const s = Date.parse(String(r.start_utc).replace(' ', 'T') + 'Z')
			const e = Date.parse(String(r.end_utc).replace(' ', 'T') + 'Z')
			return e > start && s < end
		})
		.map((r) => ({ href: `apt-${r.id}`, ics: rijAlsIcs(r) }))
	// Plus wat de telefoon uit zijn eigen agenda's spiegelt (Basis met eigen
	// Nextcloud of telefoonagenda; Ramin, 2026-09-13: "wie basis heeft, ziet
	// zijn afspraken uit zijn telefoon in web-based PA"). Alleen lezen.
	let spiegel = []
	try {
		spiegel = await paApi.mirrorEvents(code(), new Date(start).toISOString(), new Date(end).toISOString())
	} catch (e) {
		spiegel = []
	}
	// Onthouden hoe de TELEFOON deze afspraak noemt: alleen dan vindt het web de keuzes en gemeten tijden
	// die daar onder die naam bewaard zijn (Ramin, 27-09).
	for (const ev of spiegel || []) {
		if (ev && ev.phoneId) onthoudKoppeling(`mirror-${ev.uid}`, ev.phoneId)
	}
	return eigen.concat((spiegel || []).map((ev) => ({ href: `mirror-${ev.uid}`, ics: spiegelAlsIcs(ev) })))
}

/** Een gespiegelde telefoon-afspraak (ISO met Z) als ICS-blok. */
function spiegelAlsIcs(ev) {
	const uid = `mirror-${ev.uid}`
	const tijd = (iso) => String(iso).replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
	const lines = [
		'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PersonalAssistant//EN', 'BEGIN:VEVENT',
		`UID:${uid}`,
		`DTSTAMP:${tijd(ev.start)}`,
		`DTSTART:${tijd(ev.start)}`,
		`DTEND:${tijd(ev.end)}`,
		`SUMMARY:${escapeIcsText(ev.title)}`,
	]
	if (ev.location) lines.push(`LOCATION:${escapeIcsText(ev.location)}`)
	if (ev.description) lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`)
	lines.push('END:VEVENT', 'END:VCALENDAR')
	return lines.join('\r\n') + '\r\n'
}

function nummer(uid) {
	// "<uid>@<dag>" is een keer uit een reeks (icsEvents.js); het nummer staat vóór de @.
	const m = /^apt-(\d+)$/.exec(String(uid).split('@')[0])
	if (!m) throw new Error('Not an account appointment: ' + uid)
	return parseInt(m[1], 10)
}

export async function createEvent(calendar, { title, start, end, location, description, uid, recurrence, recurrenceUntil, recurrenceInterval, recurrenceCount }) {
	const r = await paApi.createAppointment(code(), {
		title, start: new Date(start).toISOString(), end: new Date(end).toISOString(),
		location: location || null, description: description || null, clientUid: uid || null,
		recurrence: recurrence || 'NONE', recurrenceUntil: recurrenceUntil || null,
		recurrenceInterval: recurrenceInterval || 1, recurrenceCount: recurrenceCount || null,
	})
	invalidateAccountCalendar()
	return { id: uid || `apt-${r.id}` }
}

export async function updateEvent(calendar, uid, { title, start, end, location, description }) {
	await paApi.updateAppointment(code(), {
		id: nummer(uid), title, start: new Date(start).toISOString(), end: new Date(end).toISOString(),
		location: location || null, description: description || null,
	})
	invalidateAccountCalendar()
}

/** `opts.occurrence` = alleen deze keer: de dag zit in het id (<uid>@<YYYY-MM-DD>), de server bewaart hem als uitzondering. */
export async function deleteEvent(calendar, uid, opts = {}) {
	const dag = opts && opts.occurrence ? String(uid).split('@')[1] : null
	await paApi.deleteAppointment(code(), nummer(uid), dag ? dag.replace(/-/g, '') : null)
	invalidateAccountCalendar()
}
