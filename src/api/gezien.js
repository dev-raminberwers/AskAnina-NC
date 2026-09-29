import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import * as paApi from './paApi.js'
import { getAccessCode } from './accessCode.js'

/**
 * Wat je gelezen, gesterd of beluisterd hebt.
 *
 * Ramin, 24-09: *"moeten we niet alleen wijzigingen doorsturen? Dan wordt er alleen een response met alle
 * nummers teruggestuurd. Als die nummers ook op het device kloppen, niets doen, anders full sync."*
 *
 * Zo werkt het nu. Lees je een artikel, dan gaat er één sleutel naar de server in plaats van het hele
 * instellingenblok (dat was 124 KB, en liep daarom stuk -- zie migratie 0082 en 0083). Bij elk antwoord
 * krijg je de stand terug: per soort een aantal én een korte vingerafdruk. Klopt die met wat we hier
 * hebben, dan gebeurt er niets; verschilt hij, dan halen we alleen díé lijst op.
 *
 * **Waarom niet alleen het aantal.** Twee apparaten kunnen allebei 719 gelezen artikelen hebben die niet
 * dezelfde 719 zijn; dan zegt de telling "klopt" terwijl ze uit elkaar lopen en merk je het nooit. De
 * vingerafdruk gaat over de gesorteerde sleutels, dus gelijk aantal én gelijke afdruk betekent echt
 * hetzelfde.
 *
 * De berekening staat woord voor woord ook in `Lib\Pa\Gezien::vingerafdruk()` en in `Gezien.kt` op de
 * telefoon. Wijzigt er een, wijzig ze alle drie -- anders denken twee kanten eeuwig dat ze verschillen.
 */

export const SOORTEN = ['rssRead', 'rssStarred', 'podcastListened']

/** Lijsten in het geheugen van dit tabblad, met de stand waarop ze gebaseerd zijn. */
const lijsten = {}
const afdrukken = {}

/** Dezelfde vingerafdruk als de server en de telefoon: gesorteerd, ontdubbeld, acht tekens. */
export function vingerafdruk(sleutels) {
	const schoon = [...new Set((sleutels || []).map((s) => String(s || '').trim()).filter(Boolean))].sort()
	return { n: schoon.length, h: bytesToHex(sha256(new TextEncoder().encode(schoon.join('\n')))).slice(0, 8) }
}

function gelijk(a, b) { return !!a && !!b && a.n === b.n && a.h === b.h }

/**
 * De lijst van deze soort, actueel gehouden aan de hand van de stand van de server.
 *
 * @param {string} soort rssRead · rssStarred · podcastListened
 * @param {?object} stand de al opgehaalde stand, om een extra verzoek te besparen
 */
export async function haal(soort, stand = null) {
	const code = getAccessCode()
	if (!code) return lijsten[soort] || []
	const s = stand || await paApi.seenState(code).catch(() => null)
	const wil = s && s[soort]
	if (wil && gelijk(wil, afdrukken[soort]) && lijsten[soort]) {
		return lijsten[soort]
	}
	const d = await paApi.seenList(code, soort).catch(() => null)
	if (!d) return lijsten[soort] || []
	// Wat expres is weggehaald hoort hier ook weg (Ramin, 24-09): anders houdt dit tabblad zijn eigen
	// oude ster en stuurt hij hem bij de volgende wijziging gewoon terug.
	const weg = new Set(d.weg || [])
	lijsten[soort] = (d.keys || []).filter((k) => !weg.has(k))
	afdrukken[soort] = { n: d.n, h: d.h }
	return lijsten[soort]
}

/** Alle drie de lijsten in één keer nakijken; haalt alleen op wat afwijkt. */
export async function controleer() {
	const code = getAccessCode()
	if (!code) return
	const stand = await paApi.seenState(code).catch(() => null)
	if (!stand) return
	for (const soort of SOORTEN) {
		if (!gelijk(stand[soort], afdrukken[soort])) await haal(soort, stand)
	}
}

/**
 * Sleutels erbij of eraf. Stuurt alleen de wijziging en werkt de lijst hier meteen bij, zodat het scherm
 * niet hoeft te wachten op de server.
 */
export async function pas(soort, erbij = [], eraf = []) {
	const code = getAccessCode()
	const nu = new Set(lijsten[soort] || [])
	erbij.forEach((k) => nu.add(k))
	eraf.forEach((k) => nu.delete(k))
	lijsten[soort] = [...nu]
	afdrukken[soort] = vingerafdruk(lijsten[soort])
	if (!code || (erbij.length === 0 && eraf.length === 0)) return lijsten[soort]
	const antwoord = await paApi.seenAdd(code, { [soort]: { erbij, eraf } }).catch(() => null)
	// De server rekent zelf ook; wijkt zijn stand af van de onze, dan had een ander apparaat gelijk.
	if (antwoord && antwoord.stand && !gelijk(antwoord.stand[soort], afdrukken[soort])) {
		await haal(soort, antwoord.stand)
	}
	return lijsten[soort]
}

/** Alles vergeten wat we in het geheugen hadden (bij uitloggen of een andere code). */
export function leeg() {
	for (const soort of SOORTEN) { delete lijsten[soort]; delete afdrukken[soort] }
}
