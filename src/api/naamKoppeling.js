/**
 * Onder welke andere naam kent de telefoon deze afspraak?
 *
 * Telefoon en web noemen dezelfde agenda-afspraak anders: de telefoon `42906@2026-09-27` (het rijnummer
 * uit de Android-agenda), het web `mirror-4a3477a1-…` (de iCal-uid uit de spiegel). Wat je op de telefoon
 * koos -- vervoer, gemeten tijden -- staat daarom onder een naam die het web nooit vond. Ramin, 27-09:
 * van 62 bewaarde vervoerskeuzes stonden er 58 onder zo'n naam.
 *
 * De telefoon geeft zijn eigen naam sinds 27-09 mee bij het spiegelen; de server bewaart hem
 * (`pa_mirror_events.phone_id`) en levert hem uit als `phoneId`. Hier houden we die koppeling bij, zodat
 * elke opzoeking beide namen kan proberen.
 *
 * Bewust GEEN hernoeming van wat er al staat: dat zou de keuzes van de telefoon onbruikbaar maken zodra
 * een oudere app-versie ze weer onder de oude naam wegschrijft. Twee namen kennen is veiliger dan er een
 * doorstrepen.
 */

/** web-id -> telefoon-id, gevuld bij het ophalen van de spiegel. */
const telefoonNaam = new Map()

/** De koppeling onthouden; lege waarden worden genegeerd. */
export function onthoudKoppeling(webId, phoneId) {
	if (!webId || !phoneId || webId === phoneId) return
	telefoonNaam.set(String(webId), String(phoneId))
}

/**
 * Alle namen waaronder deze afspraak bekend kan zijn, de eigen naam voorop.
 *
 * Gebruik dit bij elke opzoeking die per afspraak iets onthoudt. Zonder koppeling komt er precies één
 * naam uit en verandert er dus niets.
 */
export function namenVoor(id) {
	if (!id) return []
	const eigen = String(id)
	const ander = telefoonNaam.get(eigen)
	return ander ? [eigen, ander] : [eigen]
}

/** Alles vergeten; alleen nodig als de gebruiker wisselt. */
export function vergeetKoppelingen() {
	telefoonNaam.clear()
}
