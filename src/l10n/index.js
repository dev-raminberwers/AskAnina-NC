/**
 * De taal van de Nextcloud-app.
 *
 * Ramin, 2026-09-13: geen talen maar LANDEN, met codes als nl-nl, en-gb,
 * pt-br. Het land bepaalt de taal én de gewoontes (datumnotatie, eerste dag
 * van de week, kilometers of mijlen). Zie countries.js voor de lijst.
 *
 * Werkwijze: t('Engelse tekst') geeft de vertaling in de gekozen taal, en
 * anders de Engelse tekst zelf. Een landvariant (pt-br) erft alles van zijn
 * basistaal (pt) en overschrijft alleen wat daar anders is — zo hoeft geen
 * enkele vertaling twee keer geschreven te worden.
 *
 * De keuze komt uit het versleutelde bestand in de gebruiker zijn Nextcloud
 * (settings.country), zodat de telefoon en deze app hetzelfde land zien.
 * Totdat die geladen is, volgt de app de taal van Nextcloud zelf.
 */

import { reactive } from 'vue'
import { COUNTRIES, localeFor, countryForLocale } from './countries.js'
import dictionaries from './dictionaries.js'

// Reactief, zodat elke component die t() aanroept opnieuw tekent zodra het
// land verandert — zonder herladen.
const staat = reactive({ locale: null })

function nextcloudLocale() {
	const lang = (document.documentElement.getAttribute('lang') || 'en').toLowerCase().replace('_', '-')
	return lang
}

/** De actieve taalcode, bijvoorbeeld 'nl-nl' of 'en'. */
export function currentLocale() {
	return staat.locale || nextcloudLocale()
}

/**
 * Kies een land (cc, bijvoorbeeld 'nl' of 'br'); de taal volgt.
 *
 * Er komt hier niet altijd een landcode binnen. De telefoon bewaart in `settings.country` soms een hele
 * taalcode ('en-gb'), en daarmee vond dit niets: er bestaat geen land met de code 'en-gb', het land heet
 * 'gb'. Het gevolg was dat de web-agenda terugviel op de taal van de pagina -- Nederlands -- terwijl de
 * telefoon netjes Engels toonde (Ramin, 24-09: *"in web zie ik Agenda staan, in Android heet het
 * Calendar"*). Dus proberen we het nu ook andersom: hoort deze code bij een taal, dan pakken we het land
 * dat die taal spreekt.
 */
export function useCountry(cc, language) {
	const locale = localeFor(cc, language) || localeFor((countryForLocale(cc) || {}).cc, language)
	staat.locale = locale || null
	return staat.locale
}

export function useLocale(locale) {
	staat.locale = locale ? String(locale).toLowerCase().replace('_', '-') : null
}

function lookup(locale, text) {
	if (!locale) return undefined
	const exact = dictionaries[locale]
	if (exact && exact[text] != null) return exact[text]
	const base = locale.split('-')[0]
	const baseDict = dictionaries[base]
	if (baseDict && baseDict[text] != null) return baseDict[text]
	return undefined
}

/**
 * Vertaal een Engelse tekst. `%s` wordt ingevuld met de extra argumenten in
 * volgorde; `%1$s` en `%2$s` met het argument van DAT nummer, zodat een
 * vertaling de volgorde mag omdraaien ("Zodat je om %2$s bij %1$s bent").
 */
export function t(text, ...args) {
	let out = lookup(currentLocale(), text)
	if (out == null) out = text
	if (args.length) {
		let i = 0
		out = out.replace(/%(?:(\d+)\$)?[sd]/g, (_, n) => String((n ? args[n - 1] : args[i++]) ?? ''))
	}
	return out
}

export { COUNTRIES }
