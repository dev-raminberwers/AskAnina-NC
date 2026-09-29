/**
 * JS port of Android's AllDayOffset.kt — same grammar, same priority order,
 * kept in exact sync so a value typed once (the settings blob is shared
 * verbatim between Android and this app, just under different owner-key
 * partitions) behaves identically wherever it's applied. Accepted forms,
 * tried in order:
 *
 * - `+1d20:00` / `1d20.00` / `-2d08:30` — N days later (negative = earlier),
 *   at that time. Leading `+` optional; `:` or `.` as separator.
 * - `+1d2000` — same, no separator (bare 4-digit HHMM after the `d`).
 * - `+2d` / `1d` — N days later, at midnight.
 * - `20:00` / `20.00` — same day, at that time.
 * - a bare integer (legacy) — minutes since midnight, same day.
 *
 * Returns null for blank/unparseable input — callers should keep the raw
 * (all-day/midnight) value unchanged in that case.
 */

const DAY_AND_TIME = /^([+-]?\d+)d(\d{1,2})[.:](\d{2})$/i
const DAY_AND_TIME_COMPACT = /^([+-]?\d+)d(\d{2})(\d{2})$/i
const DAY_ONLY = /^([+-]?\d+)d$/i
const TIME_ONLY = /^(\d{1,2})[.:](\d{2})$/
const LEGACY_MINUTES = /^\d+$/

/** @param {Date} allDayDate the event's raw all-day date (any time-of-day
 *  component is ignored — only Y/M/D, in local time, is used)
 *  @param {string} offset
 *  @returns {Date|null} */
export function resolveAllDayOffset(allDayDate, offset) {
	const input = (offset || '').trim()
	if (!input) return null

	let m = DAY_AND_TIME.exec(input)
	if (m) return applyOffset(allDayDate, m[1], m[2], m[3])

	m = DAY_AND_TIME_COMPACT.exec(input)
	if (m) return applyOffset(allDayDate, m[1], m[2], m[3])

	m = DAY_ONLY.exec(input)
	if (m) return applyOffset(allDayDate, m[1], '0', '0')

	m = TIME_ONLY.exec(input)
	if (m) return applyOffset(allDayDate, '0', m[1], m[2])

	if (LEGACY_MINUTES.test(input)) {
		const d = new Date(allDayDate)
		d.setHours(0, 0, 0, 0)
		d.setMinutes(d.getMinutes() + parseInt(input, 10))
		return d
	}

	return null
}

function applyOffset(allDayDate, daysStr, hourStr, minuteStr) {
	const hour = parseInt(hourStr, 10)
	const minute = parseInt(minuteStr, 10)
	if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
	const d = new Date(allDayDate)
	d.setHours(0, 0, 0, 0)
	d.setDate(d.getDate() + parseInt(daysStr, 10))
	d.setHours(hour, minute, 0, 0)
	return d
}
