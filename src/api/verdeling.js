/**
 * Welke instelling waar hoort, voor wie zijn eigen Nextcloud gebruikt.
 *
 * Eén bron voor beide platformen: deze lijst is woord voor woord dezelfde als
 * `data/settings/Verdeling.kt` in de app. Lopen ze uiteen, dan schrijft het ene apparaat iets weg waar het
 * andere niet kijkt -- precies wat er 24-09 misging.
 *
 * Ramin, 24-09: *"splitsing houden, maar goed trekken"*. Wat over hem gaat blijft bij hem thuis in
 * `data.enc`; wat alleen een voorkeur is mag op onze server staan, zodat het op al zijn apparaten
 * hetzelfde is. Zijn menu-volgorde stond op de server en zijn telefoon keek alleen naar Nextcloud, dus die
 * twee zijn elkaar nooit tegengekomen.
 *
 * Persoonlijk = het zegt waar je bent, wie je bent, of het is een sleutel van jou. De rest is voorkeur.
 * Een nieuwe instelling die niemand indeelt valt bij de voorkeuren en blijft dus gewoon synchroniseren;
 * de vormen die bijna altijd persoonlijk zijn (adres, coördinaat, woon-werk, sleutel) worden op hun naam
 * herkend, zodat een nieuw `…Lat`-veld niet per ongeluk naar de server lekt.
 */

const VORMEN = ['Address', 'Lat', 'Lon', 'Key', 'CountryCode']

const PERSOONLIJK = new Set([
	'selectedCalendars', 'workCalendarTarget',
	'workDays', 'workStartTime', 'workEndTime', 'workTravelMode',
	'workFromHomeDays', 'workFromHomeDates',
	'vehicles', 'activeVehiclePlate', 'vehicle', 'station',
	'firstName', 'lastName', 'dateOfBirth',
	'nextcloudUrl', 'nextcloudUser', 'nextcloudAppPassword',
	'medicines', 'documents', 'subscriptions',
])

/** Hoort deze instelling bij jou thuis in plaats van op onze server? */
export function isPersoonlijk(naam) {
	return PERSOONLIJK.has(naam) || naam.startsWith('commute') || VORMEN.some((v) => naam.endsWith(v))
}

function filter(o, houd) {
	const uit = {}
	for (const k of Object.keys(o || {})) if (houd(k)) uit[k] = o[k]
	return uit
}

/** Alleen de persoonlijke helft -- dit gaat naar je eigen Nextcloud. */
export function persoonlijkDeel(s) { return filter(s, isPersoonlijk) }

/** Alleen de voorkeuren -- dit gaat naar onze server, zodat al je apparaten het delen. */
export function voorkeurDeel(s) { return filter(s, (k) => !isPersoonlijk(k)) }

/**
 * De twee helften weer tot één geheel: het persoonlijke uit `nextcloud`, de voorkeuren van de `server`.
 * Ontbreekt er een (niet bereikbaar), dan telt wat er wél is -- beter de halve waarheid dan een lege
 * instelling die je keuzes overschrijft.
 */
export function voegSamen(nextcloud, server) {
	if (!nextcloud) return server || null
	if (!server) return nextcloud
	return { ...voorkeurDeel(server), ...persoonlijkDeel(nextcloud) }
}
