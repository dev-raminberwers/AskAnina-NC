/**
 * The user's PersonalAssistant API-code (Ramin, 2026-09-09) — this app's
 * only piece of "login". Stored in this browser's localStorage rather than
 * a server-side Nextcloud user setting: no custom PHP endpoint exists (or
 * is needed) to persist it, and pa_api_codes.isValid() isn't even wired
 * into request handling yet ("generen en check komt later" — see
 * Lib\Pa\ApiCodes's own docblock). Re-entering it once per browser is an
 * acceptable v1 cost; a real per-user NC setting can replace this later
 * without changing anything that reads getAccessCode().
 */

const STORAGE_KEY = 'personalassistant.apiCode'

export function getAccessCode() {
	return localStorage.getItem(STORAGE_KEY) || ''
}

export function setAccessCode(code) {
	if (code) {
		localStorage.setItem(STORAGE_KEY, code)
	} else {
		localStorage.removeItem(STORAGE_KEY)
	}
	// Een andere code is een andere gebruiker of een nieuwe aanmelding; de toestelsleutel die bij de
	// vorige hoorde mag dan niet blijven staan.
	setDeviceKey('')
}

/*
 * De toestelsleutel (29-09-2026).
 *
 * Tot vandaag stuurde deze app de API-code van de gebruiker zelf mee als identiteit. Dat was een besluit
 * van Ramin van 09-09 -- "voor de Nextcloud app zelf is een API-key voldoende" -- en het klopte toen: een
 * code was een manier om binnen te komen en verder niets. Sinds de inlogverbouwing is dat anders, en
 * Ramin heeft dat besluit op 29-09 ingetrokken.
 *
 * WAAROM GEEN owner_key, hoe verleidelijk ook. De server accepteert die al, dus het zou meteen werken.
 * Maar dan staat de hoofdsleutel van het hele account in de localStorage van een browser, en die kun je
 * niet intrekken zonder het account te breken. ADMIN zette het scherp: het doel van deze verbouwing is
 * niet een langere sleutel maar EEN SLEUTEL DIE JE KUNT INTREKKEN als hij wegraakt.
 *
 *     korte code       toegang tot alles; in te trekken door hem te vervangen (en dan overal opnieuw)
 *     owner_key        toegang tot alles; NIET in te trekken
 *     toestelsleutel   toegang tot alles; je trekt precies die ene in, de rest blijft werken
 *
 * Per browser en per Nextcloud-installatie dus een eigen sleutel. Raakt een laptop kwijt, dan gaat die
 * ene eruit en blijft de telefoon werken.
 *
 * Waarom geen sessie voor de web-agenda, wat ADMIN liever had gezien: `_common.php` sluit de sessie bij
 * elk verzoek meteen weer, en de API staat op `Access-Control-Allow-Origin: *` -- met een sterretje
 * weigert de browser koekjes mee te sturen. Dat sterretje kan niet weg, want deze bundel draait ook
 * BINNEN Nextcloud, op het domein van de klant. Eén bundel, twee jassen, dus één manier van herkennen
 * die in allebei werkt.
 */
const DEVICE_KEY = 'personalassistant.deviceKey'

export function getDeviceKey() {
	return localStorage.getItem(DEVICE_KEY) || ''
}

export function setDeviceKey(sleutel) {
	if (sleutel) {
		localStorage.setItem(DEVICE_KEY, sleutel)
	} else {
		localStorage.removeItem(DEVICE_KEY)
	}
}

// Vergrendelscherm (kaart 7): de code blijft staan, maar het scherm gaat op
// slot tot je opnieuw inlogt. Het e-mailadres onthouden we alleen om het
// alvast in te vullen; het is geen geheim.
const LOCK_KEY = 'personalassistant.locked'
const EMAIL_KEY = 'personalassistant.loginEmail'
export function isLocked() {
	return localStorage.getItem(LOCK_KEY) === '1'
}
export function setLocked(locked) {
	if (locked) localStorage.setItem(LOCK_KEY, '1')
	else localStorage.removeItem(LOCK_KEY)
}
export function getLoginEmail() {
	return localStorage.getItem(EMAIL_KEY) || ''
}
export function setLoginEmail(email) {
	if (email) localStorage.setItem(EMAIL_KEY, email)
	else localStorage.removeItem(EMAIL_KEY)
}
