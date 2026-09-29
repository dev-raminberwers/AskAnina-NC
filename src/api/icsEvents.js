/**
 * Turns raw VEVENT ICS blocks (from nextcloudCalendar.js) into the exact
 * event shape /pa/plan.php expects — see reference_pa_api_contract memory:
 * `{id, title, start, end, location, calendarName, calendarColor,
 * calendarUri, homeOverride, notAttended, description}`, start/end as
 * ISO-8601 datetime strings.
 *
 * Uses ical.js (the same library Nextcloud's own Calendar app is built on)
 * for RRULE expansion instead of hand-rolling it — IcsParser.kt on Android
 * had to do that itself since no equivalent Kotlin/JVM library was already
 * a project dependency; here, pulling in the one Nextcloud's own ecosystem
 * already standardizes on is the simpler and more correct choice.
 */

import ICAL from 'ical.js'
import { resolveAllDayOffset } from './allDayOffset.js'

/** @param {{href: string, ics: string}} block
 *  @param {Date} targetDate the day being planned
 *  @param {{href: string, displayName: string, color: string|null, ignoreLocationAlwaysHome?: boolean}} calendar */
export function parseEventsForDay(block, targetDate, calendar) {
	let comp
	try {
		comp = new ICAL.Component(ICAL.parse(block.ics))
	} catch (e) {
		return []
	}
	const vevents = comp.getAllSubcomponents('vevent')
	const dayStart = new Date(targetDate)
	dayStart.setHours(0, 0, 0, 0)
	const dayEnd = new Date(dayStart)
	dayEnd.setDate(dayEnd.getDate() + 1)

	const results = []
	for (const vevent of vevents) {
		const event = new ICAL.Event(vevent)
		if (event.isRecurring()) {
			// Expands just far enough to cover this one day — a
			// recurring event's master DTSTART is often long in the
			// past, so without this every occurrence before it would
			// have to be iterated too (2026-09-07's Android "Taalcafé"
			// out-of-order-timeline bug, same underlying cause: never
			// trust a recurring VEVENT's own master start/end directly).
			const iterator = event.iterator()
			let next
			let guard = 0
			// eslint-disable-next-line no-cond-assign
			while ((next = iterator.next()) && guard++ < 3000) {
				const occStart = next.toJSDate()
				if (occStart >= dayEnd) break
				if (occStart < dayStart) continue
				const occurrence = event.getOccurrenceDetails(next)
				results.push(toAppointmentEvent(event, occurrence.startDate, occurrence.endDate, calendar))
			}
		} else {
			const start = event.startDate
			const end = event.endDate || event.startDate
			if (start.toJSDate() < dayEnd && end.toJSDate() > dayStart) {
				results.push(toAppointmentEvent(event, start, end, calendar))
			}
		}
	}
	return results
}

/**
 * Alleen titel, plaats en datum van elke afspraak in deze blokken, zonder
 * herhalingen uit te klappen: voor Anina om "bij Bart" op te zoeken in
 * eerdere afspraken (Ramin, 2026-09-16).
 *
 * @param {Array<{href: string, ics: string}>} blocks
 * @return {Array<{title: string, location: string, date: string}>}
 */
export function plaatsenUit(blocks) {
	const uit = []
	for (const block of blocks) {
		let comp
		try { comp = new ICAL.Component(ICAL.parse(block.ics)) } catch (e) { continue }
		for (const vevent of comp.getAllSubcomponents('vevent')) {
			const location = (vevent.getFirstPropertyValue('location') || '').toString().trim()
			if (!location) continue
			const start = vevent.getFirstPropertyValue('dtstart')
			uit.push({ title: (vevent.getFirstPropertyValue('summary') || '').toString().trim(), location, date: start ? start.toJSDate().toISOString().slice(0, 10) : '' })
		}
	}
	return uit
}

function toAppointmentEvent(event, startTime, endTime, calendar) {
	let start = startTime.toJSDate()
	let end = endTime.toJSDate()
	// All-day handling — mirrors NextcloudSource.resolveAllDay() on Android:
	// re-anchors the raw midnight all-day value to a configured clock time,
	// with a synthetic 30-minute span (a reminder-style pin, not a real
	// duration). Falls back to the legacy plain-minutes field for calendars
	// saved before allDayReminderOffset existed.
	if (startTime.isDate) {
		const offsetInput = calendar.allDayReminderOffset || (calendar.allDayReminderOffsetMinutes != null ? String(calendar.allDayReminderOffsetMinutes) : null)
		const resolved = offsetInput ? resolveAllDayOffset(start, offsetInput) : null
		if (resolved) {
			start = resolved
			end = new Date(resolved.getTime() + 30 * 60 * 1000)
		}
	}
	// Een keer uit een reeks heet "<uid>@<dag>", zoals op Android (19-09): anders geldt klaar op
	// maandag ook op dinsdag (de kaartstatus hangt aan de id). De UID zelf staat in `uid`.
	const dag = start.getFullYear() + '-' + String(start.getMonth() + 1).padStart(2, '0') + '-' + String(start.getDate()).padStart(2, '0')
	return {
		id: event.isRecurring() ? event.uid + '@' + dag : event.uid,
		uid: event.uid,
		title: event.summary || '',
		start: toIsoWithOffset(start),
		end: toIsoWithOffset(end),
		location: event.location || null,
		calendarName: calendar.displayName,
		calendarColor: calendar.color,
		calendarUri: calendar.href,
		// Adres negeren = geen rit, je blijft waar je bent (niet meer 'altijd thuis'; Ramin, 20-09).
		homeOverride: !!calendar.isBirthdays,
		ignoreLocation: !!calendar.ignoreLocationAlwaysHome,
		notAttended: false,
		description: event.description || null,
		// Herhalend: dan is dit één keer uit een reeks en past het weekscherm
		// hem niet aan (2026-09-14).
		recurring: !!event.isRecurring(),
		// Hele-dag in de agenda zelf (de tijdlijn pint hem op een herinneringstijd,
		// het week- en maandscherm zet hem in de hele-dag-rij; 2026-09-14).
		allDay: !!startTime.isDate,
	}
}

/** plan.php expects ISO-8601 WITH a UTC offset (Ramin's own note in
 * reference_pa_api_contract: epoch millis "silently produces garbage/null
 * results") — Date#toISOString() always renders "Z" (UTC), which is a
 * valid offset form, so no local-timezone-offset math is needed here. */
function toIsoWithOffset(date) {
	return date.toISOString()
}
