/**
 * Landen, niet talen.
 *
 * Ramin, 2026-09-13: *"het gaat mij erom dat we landen nemen, en nl-nl,
 * en-gb, ... gebruiken."* Een land kiest de taal (de eerste twee letters van
 * de code) én de gewoontes: Engels in Amerika rekent in mijlen en begint de
 * week op zondag; Engels in Groot-Brittannië doet dat allebei niet.
 *
 * Een land met meer talen (België, Zwitserland, Canada) laat de taal kiezen —
 * alleen talen waarvoor deze app een vertaling heeft. Dezelfde lijst leeft in
 * de Android-app (LanguageSupport.kt) en op de site; verandert hier iets, dan
 * daar ook. De namen zijn de namen die het land zichzelf geeft.
 */
export const CONTINENTS = ['europe', 'americas', 'africa', 'oceania']

export const LANGUAGE_NAMES = {
	en: 'English', nl: 'Nederlands', fr: 'Français', de: 'Deutsch', es: 'Español', it: 'Italiano', pt: 'Português',
}

export const COUNTRIES = [
	// Europa
	{ cc: 'nl', name: 'Nederland', languages: ['nl-nl'], units: 'km', firstDay: 'mon', continent: 'europe' },
	{ cc: 'be', name: 'België', languages: ['nl-be', 'fr-be', 'de-be'], units: 'km', firstDay: 'mon', continent: 'europe' },
	{ cc: 'gb', name: 'United Kingdom', languages: ['en-gb'], units: 'mi', firstDay: 'mon', continent: 'europe' },
	{ cc: 'ie', name: 'Ireland', languages: ['en-ie'], units: 'km', firstDay: 'mon', continent: 'europe' },
	{ cc: 'fr', name: 'France', languages: ['fr-fr'], units: 'km', firstDay: 'mon', continent: 'europe' },
	{ cc: 'lu', name: 'Luxembourg', languages: ['fr-lu', 'de-lu'], units: 'km', firstDay: 'mon', continent: 'europe' },
	{ cc: 'es', name: 'España', languages: ['es-es'], units: 'km', firstDay: 'mon', continent: 'europe' },
	{ cc: 'de', name: 'Deutschland', languages: ['de-de'], units: 'km', firstDay: 'mon', continent: 'europe' },
	{ cc: 'at', name: 'Österreich', languages: ['de-at'], units: 'km', firstDay: 'mon', continent: 'europe' },
	{ cc: 'ch', name: 'Schweiz', languages: ['de-ch', 'fr-ch', 'it-ch'], units: 'km', firstDay: 'mon', continent: 'europe' },
	{ cc: 'pt', name: 'Portugal', languages: ['pt-pt'], units: 'km', firstDay: 'mon', continent: 'europe' },
	{ cc: 'it', name: 'Italia', languages: ['it-it'], units: 'km', firstDay: 'mon', continent: 'europe' },
	// Amerika
	{ cc: 'us', name: 'United States', languages: ['en-us', 'es-us'], units: 'mi', firstDay: 'sun', continent: 'americas' },
	{ cc: 'ca', name: 'Canada', languages: ['en-ca', 'fr-ca'], units: 'km', firstDay: 'sun', continent: 'americas' },
	{ cc: 'mx', name: 'México', languages: ['es-mx'], units: 'km', firstDay: 'sun', continent: 'americas' },
	{ cc: 'br', name: 'Brasil', languages: ['pt-br'], units: 'km', firstDay: 'sun', continent: 'americas' },
	{ cc: 'ar', name: 'Argentina', languages: ['es-ar'], units: 'km', firstDay: 'sun', continent: 'americas' },
	{ cc: 'co', name: 'Colombia', languages: ['es-co'], units: 'km', firstDay: 'sun', continent: 'americas' },
	{ cc: 'cl', name: 'Chile', languages: ['es-cl'], units: 'km', firstDay: 'mon', continent: 'americas' },
	// Afrika en Oceanië
	{ cc: 'za', name: 'South Africa', languages: ['en-za'], units: 'km', firstDay: 'sun', continent: 'africa' },
	{ cc: 'au', name: 'Australia', languages: ['en-au'], units: 'km', firstDay: 'mon', continent: 'oceania' },
	{ cc: 'nz', name: 'New Zealand', languages: ['en-nz'], units: 'km', firstDay: 'mon', continent: 'oceania' },
]

export function countryByCode(cc) {
	return COUNTRIES.find((c) => c.cc === String(cc || '').toLowerCase()) || null
}

/** De taalcode van een land — de gangbare, of de gevraagde als het land die spreekt. */
export function localeFor(cc, language) {
	const land = countryByCode(cc)
	if (!land) return null
	const gevraagd = String(language || '').toLowerCase().replace('_', '-')
	if (gevraagd && land.languages.includes(gevraagd)) return gevraagd
	return land.languages[0]
}

/** Het land dat bij een taalcode hoort ('pt-br' → br, 'nl' → nl). */
export function countryForLocale(locale) {
	const code = String(locale || '').toLowerCase().replace('_', '-')
	return COUNTRIES.find((c) => c.languages.includes(code))
		|| COUNTRIES.find((c) => c.languages[0].split('-')[0] === code.split('-')[0])
		|| null
}

/** De emoji-vlag van een land. */
export function flag(cc) {
	return String(cc || '').toLowerCase().slice(0, 2).split('').map((ch) => String.fromCodePoint(0x1F1E6 + ch.charCodeAt(0) - 97)).join('')
}
