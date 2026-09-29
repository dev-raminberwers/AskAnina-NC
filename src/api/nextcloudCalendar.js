/**
 * CalDAV client against THIS Nextcloud instance's own calendars —
 * `remote.php/dav/calendars/{user}/`, same standard Nextcloud paths the
 * Android app talks to over HTTP Basic Auth with an app-password. Here,
 * running inside Nextcloud's own page, the browser's existing session
 * cookie already authenticates every request — no credential of any kind
 * needs to be entered (Ramin, 2026-09-09: "voor de Nextcloud app zelf is
 * een API-key voldoende" — that API-key is for OUR backend, not this).
 *
 * Deliberately a hand-rolled PROPFIND/REPORT client (matching
 * NextcloudSource.kt's approach exactly) rather than a full CalDAV library —
 * only the two operations Today's timeline actually needs: list calendars,
 * fetch a day's events.
 */

import axios from '@nextcloud/axios'
import { WEB } from '../mode.js'
import * as account from './accountCalendar.js'
import { rruleVoor } from './accountCalendar.js'
import { generateRemoteUrl } from '@nextcloud/router'
import { getCurrentUser } from '@nextcloud/auth'

const PROPFIND_CALENDARS_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:ic="http://apple.com/ns/ical/">
  <d:prop>
    <d:displayname/>
    <ic:calendar-color/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`

const REPORT_EVENTS_BODY = (startUtc, endUtc) => `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${startUtc}" end="${endUtc}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`

function calendarsHomeUrl() {
	const user = getCurrentUser()?.uid
	if (!user) throw new Error('Not logged in')
	return generateRemoteUrl(`dav/calendars/${encodeURIComponent(user)}/`)
}

function parseXml(xmlText) {
	return new DOMParser().parseFromString(xmlText, 'application/xml')
}

function firstChildText(el, localName) {
	const node = el.getElementsByTagNameNS('*', localName)[0]
	return node ? node.textContent : null
}

/** @returns {Promise<Array<{href: string, displayName: string, color: string|null}>>} */
export async function discoverCalendars() {
	if (WEB) return account.discoverCalendars()
	const url = calendarsHomeUrl()
	const response = await axios({
		method: 'PROPFIND',
		url,
		headers: { Depth: '1', 'Content-Type': 'application/xml' },
		data: PROPFIND_CALENDARS_BODY,
	})
	const doc = parseXml(response.data)
	const responses = Array.from(doc.getElementsByTagNameNS('*', 'response'))
	const homePath = new URL(url, window.location.origin).pathname
	const calendars = []
	for (const el of responses) {
		const href = firstChildText(el, 'href')
		if (!href) continue
		if (href.replace(/\/$/, '') + '/' === homePath) continue // the home collection itself

		// "subscribed" covers mirrored external ICS subscriptions (holidays,
		// football fixtures, etc.) — real queryable collections, just not
		// marked with the plain CalDAV <cal:calendar/> resourcetype. See
		// NextcloudSource.kt's parseCalendars() for the same distinction.
		const resourceTypeEl = el.getElementsByTagNameNS('*', 'resourcetype')[0]
		const isCalendar = resourceTypeEl
			&& (resourceTypeEl.getElementsByTagNameNS('*', 'calendar').length > 0
				|| resourceTypeEl.getElementsByTagNameNS('*', 'subscribed').length > 0)
		if (!isCalendar) continue

		const displayName = firstChildText(el, 'displayname')
		if (!displayName) continue
		calendars.push({ href, displayName, color: firstChildText(el, 'calendar-color') })
	}
	return calendars
}

function escapeIcsText(text) {
	return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function toIcsUtcTime(date) {
	return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/**
 * "Item toevoegen" for the NC-app's Today view (2026-09-09, Ramin: "In de
 * Nextcloud app zie ik geen mogelijkheid om een item toe te voegen, bij
 * android wel") — same hand-rolled ICS-over-PUT approach as
 * NextcloudSource.kt's createEvent(), just built in JS. `calendar` is one
 * entry from discoverCalendars(); `start`/`end` are JS Date objects.
 * @returns {Promise<{id: string}>}
 */
export async function createEvent(calendar, { title, start, end, location, description, uid: presetUid, categories, recurrence, recurrenceUntil, recurrenceInterval, recurrenceCount }) {
	if (WEB) return account.createEvent(calendar, { title, start, end, location, description, uid: presetUid, categories, recurrence, recurrenceUntil, recurrenceInterval, recurrenceCount })
	// Een vaste UID (pa-trip-…) en de categorie PersonalAssistant, net als de
	// telefoon: zo herkent elke kant wat de app zelf schreef (2026-09-13).
	const uid = presetUid || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
	const now = toIcsUtcTime(new Date())
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//PersonalAssistant//EN',
		'BEGIN:VEVENT',
		`UID:${uid}`,
		`DTSTAMP:${now}`,
		`DTSTART:${toIcsUtcTime(start)}`,
		`DTEND:${toIcsUtcTime(end)}`,
		`SUMMARY:${escapeIcsText(title)}`,
	]
	if (location) lines.push(`LOCATION:${escapeIcsText(location)}`)
	if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`)
	if (categories) lines.push(`CATEGORIES:${escapeIcsText(categories)}`)
	const rule = rruleVoor(recurrence, new Date(start).toISOString(), recurrenceUntil, recurrenceInterval || 1, recurrenceCount || null)
	if (rule) lines.push('RRULE:' + rule)
	lines.push('END:VEVENT', 'END:VCALENDAR')
	const ics = lines.join('\r\n') + '\r\n'

	const calendarUrl = calendar.href.startsWith('http') ? calendar.href : window.location.origin + calendar.href
	const eventUrl = calendarUrl.replace(/\/?$/, '/') + `${uid}.ics`
	await axios({
		method: 'PUT',
		url: eventUrl,
		headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'If-None-Match': '*' },
		data: ics,
	})
	return { id: uid }
}

/**
 * Where a single event lives, so it can be changed or removed. Built from
 * the calendar it belongs to plus its UID — the same `<uid>.ics` convention
 * createEvent() writes to, which is how Nextcloud names events created by
 * any CalDAV client.
 */
function eventUrlFor(calendar, uid) {
	const calendarUrl = calendar.href.startsWith('http') ? calendar.href : window.location.origin + calendar.href
	// Een keer uit een reeks heet "<uid>@<dag>" (icsEvents.js); het bestand is dat van de reeks.
	return calendarUrl.replace(/\/?$/, '/') + `${String(uid).split('@')[0]}.ics`
}

/**
 * Rewrites one event (2026-09-10 — until now this app could only CREATE
 * appointments, never change or remove one, while the Android app could do
 * both; that gap is also why Nextcloud-mode edits never reached the action
 * log). Sends the whole VEVENT again rather than patching it, matching how
 * createEvent() writes in the first place.
 *
 * @param {object} calendar one entry from discoverCalendars()
 * @param {string} uid the event's UID
 * @param {{title: string, start: Date, end: Date, location?: ?string, description?: ?string}} fields
 */
export async function updateEvent(calendar, uid, { title, start, end, location, description }) {
	if (WEB) return account.updateEvent(calendar, uid, { title, start, end, location, description })
	const now = toIcsUtcTime(new Date())
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//PersonalAssistant//EN',
		'BEGIN:VEVENT',
		`UID:${String(uid).split('@')[0]}`,
		`DTSTAMP:${now}`,
		`DTSTART:${toIcsUtcTime(start)}`,
		`DTEND:${toIcsUtcTime(end)}`,
		`SUMMARY:${escapeIcsText(title)}`,
	]
	if (location) lines.push(`LOCATION:${escapeIcsText(location)}`)
	if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`)
	lines.push('END:VEVENT', 'END:VCALENDAR')

	await axios({
		method: 'PUT',
		url: eventUrlFor(calendar, uid),
		// Deliberately no If-None-Match here: unlike createEvent(), this is
		// MEANT to overwrite what is already there.
		headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
		data: lines.join('\r\n') + '\r\n',
	})
}

/** Removes one event from the calendar it lives in. */
/**
 * Removes one event from the calendar it lives in. Met `opts.occurrence` en `opts.start` (ISO van die keer)
 * alleen die ene keer uit een reeks (Ramin, 21-09: "deze of allemaal"): een EXDATE op de hoofdafspraak,
 * zoals de Agenda-app en de telefoon dat ook doen; de reeks zelf blijft.
 */
export async function deleteEvent(calendar, uid, opts = {}) {
	if (WEB) return account.deleteEvent(calendar, uid, opts)
	const url = eventUrlFor(calendar, uid)
	if (opts && opts.occurrence && opts.start) {
		const bestaand = await axios({ method: 'GET', url, headers: { Accept: 'text/calendar' } })
		const regels = String(bestaand.data).split(/\r?\n/)
		const exdate = 'EXDATE:' + toIcsUtcTime(new Date(opts.start))
		if (!regels.includes(exdate)) {
			// Achter de DTSTART van de hoofdafspraak (de eerste VEVENT zonder RECURRENCE-ID).
			let inHoofd = false
			let klaar = false
			const uit = []
			for (const r of regels) {
				uit.push(r)
				if (r === 'BEGIN:VEVENT') inHoofd = true
				if (!klaar && inHoofd && r.startsWith('DTSTART')) { uit.push(exdate); klaar = true }
			}
			if (!klaar) throw new Error('no DTSTART in ' + url)
			await axios({ method: 'PUT', url, headers: { 'Content-Type': 'text/calendar; charset=utf-8' }, data: uit.join('\r\n') + '\r\n' })
		}
		return
	}
	await axios({ method: 'DELETE', url })
}

/** `calendar` is one entry from discoverCalendars() (or a saved
 * SyncedSettings.selectedCalendars entry). Returns raw VEVENT ICS blocks
 * for the given day — parsing (RRULE expansion, all-day handling) is
 * [icsEvents.js]'s job, matching NextcloudSource.kt's own split between
 * fetching (this file) and parsing (IcsParser.kt). */
export async function fetchCalendarData(calendar, dateUtcStart, dateUtcEnd) {
	if (WEB) return account.fetchCalendarData(calendar, dateUtcStart, dateUtcEnd)
	// Nextcloud's own PROPFIND/REPORT responses give hrefs as absolute
	// paths from the domain root (already including any subdirectory the
	// instance is installed under) — resolving against the origin, not
	// reconstructing via generateRemoteUrl(), is what actually matches
	// that (see NextcloudSource.kt's own `origin` property for the same
	// reasoning on Android).
	const url = calendar.href.startsWith('http') ? calendar.href : window.location.origin + calendar.href
	const response = await axios({
		method: 'REPORT',
		url,
		// Zonder deze header doet Nextcloud alsof een geabonneerde agenda
		// (voetbal, tv-afleveringen, feestdagen) leeg is: het 207-antwoord
		// bevat dan nul objecten, terwijl de Agenda-app ze wel toont. Gevonden
		// bij de doorlichting van 2026-09-13 door het verzoek van de Agenda-app
		// naast het onze te leggen; dit was het enige verschil.
		headers: { Depth: '1', 'Content-Type': 'application/xml', 'X-NC-CalDAV-Webcal-Caching': 'On' },
		data: REPORT_EVENTS_BODY(dateUtcStart, dateUtcEnd),
	})
	const doc = parseXml(response.data)
	const responses = Array.from(doc.getElementsByTagNameNS('*', 'response'))
	const blocks = []
	for (const el of responses) {
		const href = firstChildText(el, 'href')
		const dataNode = el.getElementsByTagNameNS('*', 'calendar-data')[0]
		if (!href || !dataNode || !dataNode.textContent) continue
		blocks.push({ href, ics: dataNode.textContent })
	}
	return blocks
}

/**
 * Welke agenda's de schermen tonen: in Nextcloud de keuze uit de
 * instellingen, in de web-jas altijd de ene eigen agenda op onze server.
 */
export async function gekozenKalenders(settings) {
	if (WEB) return account.discoverCalendars()
	return (settings && settings.selectedCalendars) || []
}
