import { reactive } from 'vue'

/**
 * Licht, donker of wat je apparaat zegt.
 *
 * Ramin, 24-09: *"web-app heeft geen theme-selection (dark/light)"*, en daarna: *"kijk wat
 * telefooninstelling heeft"*. De telefoon geeft je drie knoppen -- Licht, Donker, Systeem -- en bewaart
 * die per toestel, niet in je account. Dat is hier overgenomen: een telefoon in je hand vraagt iets
 * anders dan een monitor op kantoor, dus deze keuze reist niet mee.
 *
 * Systeem stempelt niets op `<html>`; dan beslist het apparaat via `prefers-color-scheme`. Een eigen
 * keuze zet `data-theme`, en die wint in beide richtingen -- zie web.css.
 */
const SLEUTEL = 'pa-thema'
export const STANDEN = ['system', 'light', 'dark']

export const thema = reactive({ stand: 'system' })

function lees() {
	try {
		const v = window.localStorage.getItem(SLEUTEL)
		return STANDEN.includes(v) ? v : 'system'
	} catch (e) {
		// Privémodus of geblokkeerde opslag: dan gewoon het apparaat volgen.
		return 'system'
	}
}

function teken(stand) {
	const el = document.documentElement
	if (stand === 'system') el.removeAttribute('data-theme')
	else el.setAttribute('data-theme', stand)
}

/** Bij het opstarten, vóór het eerste scherm: anders zie je even de verkeerde kleuren. */
export function start() {
	thema.stand = lees()
	teken(thema.stand)
}

export function zet(stand) {
	thema.stand = STANDEN.includes(stand) ? stand : 'system'
	teken(thema.stand)
	try {
		window.localStorage.setItem(SLEUTEL, thema.stand)
	} catch (e) {
		// Niet kunnen onthouden is geen reden om de kleur niet te zetten.
	}
}
