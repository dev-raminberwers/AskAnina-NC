/**
 * Foutmeldingen in mensentaal (Ramin, 2026-09-14: "Request failed with status
 * code 403" zegt niemand iets). Eén plek voor alle schermen: de statuscode of
 * de netwerkfout wordt een zin die zegt wat er aan de hand is en wat je kunt
 * doen. Wat we niet herkennen, tonen we zoals het kwam.
 *
 * En bij elke fout die je zelf kunt oplossen hoort een knop naar de plek in
 * Instellingen waar dat kan (Ramin, 2026-09-14) — zie foutLink().
 */
import { t } from '../l10n/index.js'
import { WEB } from '../mode.js'

export const GEEN_CODE = 'Set your USER-API code under Settings first.'
export const GEEN_AGENDA = 'No calendars selected yet — pick one or more under Settings.'

/**
 * Een wachttijd in woorden: "45 seconden", "3 minuten". Geen klok van twee cijfers -- je hoeft niet op de
 * seconde te weten wanneer het weer mag, je wilt weten of je moet wachten of iets anders gaan doen.
 */
export function wachttijd(seconden) {
	const s = Math.max(1, Math.round(seconden))
	if (s < 90) return t('%s seconds', String(s))
	return t('%s minutes', String(Math.ceil(s / 60)))
}

export function foutTekst(e) {
	const status = Number(e?.response?.status || e?.status || 0)
	if (status === 401) return t('You are not signed in anymore. Sign in again.')
	if (status === 403) return t('You are not allowed to change this. It is read-only for you.')
	if (status === 404) return t('Not found. It may already have been deleted.')
	if (status === 409 || status === 412) return t('This was changed elsewhere in the meantime. Reload and try again.')
	if (status === 429) {
		const nog = Number(e?.retryAfter || 0)
		return nog > 0
			? t('Too many requests in a row. Try again in %s.', wachttijd(nog))
			: t('Too many requests in a row. Wait a moment and try again.')
	}
	if (status >= 500) return t('The server had a problem. Try again in a moment.')
	const tekst = String(e?.message || e || '')
	if (/Network Error|Failed to fetch|timeout|ERR_INTERNET|ECONNREFUSED/i.test(tekst)) return t('No connection. Check your network and try again.')
	return tekst
}

/**
 * Waarom Anina niet kon antwoorden, in mensentaal (Ramin, 2026-09-15, kaart 93:
 * "HTTP 502, geef die errorcode in mensentaal"). De server geeft een soort mee.
 */
export function aninaFoutTekst(e) {
	const soort = e?.code || null
	const reden = String(e?.detail || '').replace(/^.*claude said /, '')
	if (soort === 'key') return t('The API key was not accepted. Check it under Settings, Account, APIs.')
	if (soort === 'nokey') return t('Anina is not set up yet. Add an Anthropic API key under Settings, Account, APIs.')
	if (soort === 'limit') return t('You have used all questions for this month.')
	if (soort === 'rate') return t('Too many questions in a row. Wait a minute and try again.')
	if (soort === 'busy') return t('Claude is very busy right now. Try again in a moment.')
	if (soort === 'long') return t('This day holds too much information for one question. Ask about a shorter period.')
	if (soort === 'timeout') return t('Claude took too long to answer. Try again.')
	if (reden) return t('Anina could not answer: %s', reden)
	return foutTekst(e)
}

/**
 * Waar je deze fout oplost, of null als er niets te klikken valt.
 * @returns {?{label: string, tab: string, onderdeel: ?string, subOnderdeel: ?string}}
 */
export function foutLink(tekst) {
	const s = String(tekst || '')
	if (s === t(GEEN_CODE) || s === GEEN_CODE || s === t('You are not signed in anymore. Sign in again.')) {
		return { label: t('Go to Settings'), tab: 'settings', onderdeel: 'account', subOnderdeel: WEB ? 'apis' : null }
	}
	if (s === t('The API key was not accepted. Check it under Settings, Account, APIs.') || s === t('Anina is not set up yet. Add an Anthropic API key under Settings, Account, APIs.')) {
		return { label: t('Go to Settings'), tab: 'settings', onderdeel: 'account', subOnderdeel: WEB ? 'apis' : null }
	}
	if (s === t(GEEN_AGENDA) || s === GEEN_AGENDA) {
		return { label: t('Choose calendars'), tab: 'settings', onderdeel: 'account', subOnderdeel: 'nextcloud' }
	}
	if (s === t('Pick a calendar in Settings first.') || s === 'Pick a calendar in Settings first.') {
		return { label: t('Choose calendars'), tab: 'settings', onderdeel: 'account', subOnderdeel: 'nextcloud' }
	}
	return null
}
