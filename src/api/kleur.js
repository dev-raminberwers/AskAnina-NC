/**
 * Kleurhulpjes voor gekleurde vlakken (agenda-kleuren, labels): witte of
 * donkere tekst, wat het beste leest (Ramin, 2026-09-14: "gele achtergrond
 * en witte tekst … automatisch contrasterende font-color").
 */

/** "#ffcc00", "ffcc00" of "#fc0" → [r, g, b], of null. */
export function rgb(kleur) {
	let h = String(kleur || '').trim().replace(/^#/, '')
	if (h.length === 3) h = h.split('').map((c) => c + c).join('')
	if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
	return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Tekstkleur die leesbaar is op deze achtergrond. */
export function tekstKleur(kleur) {
	const c = rgb(kleur)
	if (!c) return '#fff'
	const helderheid = (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000
	return helderheid > 150 ? '#111' : '#fff'
}

/** Kleur met # ervoor, of de terugvalkleur. */
export function hex(kleur, terugval) {
	return rgb(kleur) ? '#' + String(kleur).trim().replace(/^#/, '') : terugval
}
