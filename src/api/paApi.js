/**
 * Client for the askanina.com/ backend — the SAME stateless
 * compute API the Android app calls (see reference_pa_api_contract
 * memory). Plain fetch(), not @nextcloud/axios: this is a cross-origin
 * call to a different domain, not an in-Nextcloud one, and `_common.php`
 * already sends `Access-Control-Allow-Origin: *` for exactly this reason.
 *
 * Identity: the `X-PA-Owner-Key` header other clients compute from
 * Nextcloud credentials doesn't apply here — this app has none to hash
 * (Ramin, 2026-09-09: "voor de Nextcloud app zelf is een API-key
 * voldoende"). It sends the user's API-code instead (see accessCode.js).
 * This makes the NC app's own data (settings, travel-choices) its own
 * separate partition from the same account's Android data for now —
 * unifying those two is a later decision, not something this file does.
 */


import { getAccessCode, getDeviceKey, setDeviceKey, setLocked } from './accessCode.js'

const BASE_URL = 'https://askanina.com/'

/*
 * Wie we zijn tegen de server (29-09-2026).
 *
 * Elke aanroep hieronder krijgt van zijn component de API-code van de gebruiker mee. Die code gaat sinds
 * vandaag NIET meer naar buiten: vlak voor het versturen ruilen we hem hier in voor de toestelsleutel van
 * deze browser of deze Nextcloud. Zie accessCode.js voor waarom een toestelsleutel en niet de owner_key.
 *
 * Met opzet op deze ene plek en niet bij de 69 aanroepen: elke aanroep die een identiteit meestuurt komt
 * hierlangs, dus één regel dekt ze allemaal en er kan er geen vergeten worden.
 *
 * `ruw` is er voor het aanvragen van de sleutel zelf -- daar moet juist de code naartoe, anders vraag je
 * een sleutel aan met een sleutel die je nog niet hebt.
 */
function identiteit(ownerKey, ruw) {
	if (!ownerKey || ruw) return ownerKey
	const sleutel = getDeviceKey()
	// Alleen de code van DEZE gebruiker wordt geruild. Geeft een component iets anders mee -- een
	// owner_key uit een gedeeld profiel bijvoorbeeld -- dan blijft dat onaangeroerd.
	return (sleutel && ownerKey === getAccessCode()) ? sleutel : ownerKey
}

/*
 * Wachten tot de sleutel er is, vóór het eerste verzoek dat hem nodig heeft (30-09-2026).
 *
 * App.vue vraagt de sleutel aan in `created()`, en dat is niet genoeg: Vue wacht niet op een async
 * `created()` van de ouder, dus de kinderen doen hun eigen aanroepen er dwars doorheen. ADMIN mat dat op
 * Ramins Nextcloud -- een seconde na de POST naar devices.php gingen `werkelijk/list.php` en
 * `settings/get.php` nog met de kale code de deur uit.
 *
 * Eenmalig per installatie, dus vandaag ongevaarlijk. Maar zodra de oude weg dichtgaat worden dat de
 * eerste verzoeken van een nieuwe gebruiker, en die zouden dan geweigerd worden. Een storing die alleen
 * de allereerste keer optreedt is er precies een die je pas ziet als een vreemde hem heeft.
 *
 * Daarom staat de poort hier en niet in een scherm: dit is dezelfde ene deur waar alles langskomt.
 *
 * DE EERSTE POGING WAS FOUT en het is leerzaam waarom. Ik onthield de lopende aanvraag HIER, in de poort.
 * Maar App.vue vraagt de sleutel rechtstreeks aan en komt dus nooit langs de poort -- dus waren er twee
 * vragers die elkaar niet zagen, en elke aanvraag maakt een NIEUW toestel aan. ADMIN mat twee POSTs naar
 * `devices.php` per verse start, en Ramins toestellenlijst stond al op drie regels "Chrome op Windows".
 *
 * Het onthouden hoort dus in `zorgVoorToestelsleutel` zelf te zitten, bij het ding dat de aanvraag doet,
 * en niet bij een van de plekken die hem aanroept. Een grendel voor de deur helpt niet als er een tweede
 * deur is.
 */
async function call(path, { method = 'GET', body, ownerKey, ruw = false } = {}) {
	if (ownerKey && !ruw && !getDeviceKey() && ownerKey === getAccessCode()) {
		await zorgVoorToestelsleutel(ownerKey)
	}
	const headers = {}
	if (body !== undefined) headers['Content-Type'] = 'application/json'
	const wie = identiteit(ownerKey, ruw)
	if (wie) headers['X-PA-Owner-Key'] = wie
	// Welke jas dit is -- web-agenda of binnen Nextcloud. De server splitst zijn uurlimiet daarop uit
	// (Ramin, 24-09: "onderzoek wat zoveel calls veroorzaakt"); aan de user-agent zie je dat niet.
	headers['X-PA-Client'] = window.OCA === undefined ? 'web' : 'nextcloud'
	const response = await fetch(BASE_URL + path, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	})
	if (!response.ok) {
		const text = await response.text().catch(() => '')
		const fout = new Error(`HTTP ${response.status} from ${path}: ${text.slice(0, 300)}`)
		fout.status = response.status
		// Wat de server als reden en soort meegeeft (kaart 93: "geef die errorcode in mensentaal").
		try {
			const j = JSON.parse(text)
			fout.code = j.code || null
			fout.detail = j.error || null
			// Hoe lang je nog moet wachten (Ramin, 24-09). De server weet dat precies; zonder dit getal
			// zegt "wacht even" niet of dat tien seconden of tien minuten is.
			fout.retryAfter = Number(j.retryAfter || response.headers.get('Retry-After') || 0) || 0
		} catch (e) { fout.code = null; fout.detail = null; fout.retryAfter = Number(response.headers.get('Retry-After') || 0) || 0 }
		/*
		 * 401 terwijl we met een toestelsleutel praatten: die is ingetrokken. Iemand heeft dit toestel
		 * uitgelogd vanaf een ander scherm, of het account is weg.
		 *
		 * Sleutel weggooien en het slot erop. Wat hier NIET gebeurt is stilletjes een nieuwe sleutel
		 * aanvragen met de code die nog in deze browser ligt -- dan maak je het uitloggen ongedaan zonder
		 * dat iemand het merkt, en dat is precies waar deze hele verbouwing tegen bedoeld is.
		 */
		if (response.status === 401 && wie && wie !== ownerKey) {
			setDeviceKey('')
			setLocked(true)
		}
		throw fout
	}
	return response.json()
}

/**
 * Eenmalig een toestelsleutel ophalen voor deze browser of deze Nextcloud (29-09-2026).
 *
 * Aanroepen zodra er een code is en nog geen sleutel. Lukt het niet, dan gebeurt er niets en werkt de app
 * door op de code -- want een app die niet meer opstart omdat een sleutel niet opgehaald kon worden, is
 * erger dan een app die nog even de oude weg gebruikt. Zodra de deur bij ADMIN dichtgaat, verandert dat
 * van "werkt door" in "werkt niet", en dan hoort hier een melding te staan in plaats van een stilte.
 * Dat moment komt pas als alle drie de programma's op nul staan, niet eerder.
 *
 * De naam is wat de gebruiker straks in zijn lijst met toestellen ziet staan. "Chrome op Windows" zegt
 * hem meer dan "web", want hij moet kunnen kiezen wélke hij intrekt.
 *
 * **Hooguit één aanvraag tegelijk, en dat is hier geen nettigheid maar een eis.** Elke POST naar
 * `devices.php` maakt een NIEUW toestel aan. Twee vragers die elkaar niet zien, geven dus twee regels in
 * de lijst waarin iemand een vreemd toestel moet herkennen -- en als je er dan één intrekt, werkt de
 * andere door. Daarom staat het onthouden van de lopende aanvraag hier, bij het ding dat hem doet, en
 * niet bij een van de plekken die hem aanroept.
 *
 * @returns {Promise<boolean>} of er nu een sleutel ligt
 */
let lopendeAanvraag = null

export function zorgVoorToestelsleutel(code) {
	if (!code || getDeviceKey()) return Promise.resolve(!!getDeviceKey())
	lopendeAanvraag = lopendeAanvraag || vraagToestelsleutel(code)
	return lopendeAanvraag
}

async function vraagToestelsleutel(code) {
	const inNextcloud = typeof window !== 'undefined' && window.OCA !== undefined
	try {
		const uit = await call('account/devices.php', {
			method: 'POST',
			ownerKey: code,
			ruw: true,
			body: { name: browserNaam(), platform: inNextcloud ? 'nextcloud' : 'web' },
		})
		if (uit && uit.deviceKey) {
			setDeviceKey(uit.deviceKey)
			return true
		}
	} catch (e) {
		// 429 = er staan er al twintig. Dat is geen storing maar een grens, en de gebruiker moet er zelf
		// een intrekken. Tot die tijd blijft hij op de code werken.
	}
	return false
}

/** Waar de gebruiker deze sleutel straks aan herkent in zijn lijst met toestellen. */
function browserNaam() {
	const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || ''
	const browser = /Edg\//.test(ua) ? 'Edge'
		: /OPR\//.test(ua) ? 'Opera'
			: /Firefox\//.test(ua) ? 'Firefox'
				: /Chrome\//.test(ua) ? 'Chrome'
					: /Safari\//.test(ua) ? 'Safari' : 'Browser'
	const stelsel = /Windows/.test(ua) ? 'Windows'
		: /Android/.test(ua) ? 'Android'
			: /iPhone|iPad/.test(ua) ? 'iOS'
				: /Mac OS/.test(ua) ? 'Mac'
					: /Linux/.test(ua) ? 'Linux' : ''
	return stelsel ? browser + ' op ' + stelsel : browser
}

export function geocode(query) {
	return call('geocode.php?q=' + encodeURIComponent(query))
}

/** Live suggestions while typing an address (Ramin, 2026-09-09: the NC-app's
 * add-appointment location field had no autocomplete at all, unlike
 * Android's AddressAutocompleteField — different geocode results for the
 * same real place depending on which app created the appointment, since a
 * hand-typed address geocodes differently than a picked suggestion).
 * @returns {Promise<Array<{lat: number, lon: number, display_name: string, country_code: string|null}>>} */
export function geocodeSuggest(query, limit = 5) {
	return call('geocode_suggest.php?q=' + encodeURIComponent(query) + '&limit=' + limit)
}

/** @returns {Promise<{distance_km: number, duration_min: number, estimated: boolean}>} */
export function route(fromLat, fromLon, toLat, toLon, profile = 'driving') {
	const params = new URLSearchParams({ fromLat, fromLon, toLat, toLon, profile })
	return call('route.php?' + params.toString())
}

/** @returns {Promise<Array<{name: string, lat: number, lon: number, address: string|null, phone: string|null, website: string|null}>>} */
/**
 * Gelezen, gesterd en beluisterd (Ramin, 24-09): alleen wijzigingen sturen, en met een korte stand
 * kijken of er iets op te halen valt. Zie lib/Pa/Gezien.php en api/gezien.js.
 */
export function settingsPatch(ownerKey, body) {
	return call('settings/patch.php', { method: 'POST', ownerKey, body })
}


/**
 * Hetzelfde verzoek dat tegelijk van twee kanten komt, wordt er één.
 *
 * Ramin, 24-09: *"onderzoek wat zoveel calls (3000) veroorzaakt."* Bij het openen vroegen drie
 * onderdelen los van elkaar dezelfde dingen op: de gelezen-stand voor de nieuwsbadge, voor de sterren en
 * voor de lijst zelf, en de feeds voor de tellingen en voor het nieuwsscherm. Dat is niet verkeerd
 * bedacht -- ze weten niet van elkaar -- maar het is wel twee keer hetzelfde werk voor de server.
 *
 * Wie binnen [msGeldig] opnieuw vraagt, krijgt het antwoord dat er al ligt; wie vraagt terwijl het nog
 * onderweg is, wacht op datzelfde verzoek. Kort genoeg om niets verouderds te tonen.
 */
const samenLopend = new Map()
function samen(sleutel, msGeldig, maak) {
	const nu = Date.now()
	const er = samenLopend.get(sleutel)
	if (er && (er.belofte || nu - er.tijd < msGeldig)) return er.belofte || Promise.resolve(er.waarde)
	const belofte = maak()
		.then((waarde) => { samenLopend.set(sleutel, { waarde, tijd: Date.now(), belofte: null }); return waarde })
		.catch((e) => { samenLopend.delete(sleutel); throw e })
	samenLopend.set(sleutel, { waarde: null, tijd: nu, belofte })
	return belofte
}

/**
 * Wat er die dag werkelijk gebeurde, op regel-id (kaart 220). De telefoon meldt vertrek en aankomst; hier
 * lezen we het alleen, om "gepland 09:00, werkelijk 09:12" op de kaart te kunnen zetten.
 */
/**
 * "Hier tank ik niet" doorgeven -- hetzelfde luik dat de telefoon gebruikt (Ramin, 27-09).
 *
 * De keuze hangt aan de POMP: dag plus bestemming, niet aan een regel-id -- dat is een volgnummer dat bij
 * elke herplanning anders uitvalt. De server geeft daarna een sync-seintje en de dag wordt opnieuw gerekend,
 * dus wat je hier wegklikt ziet je telefoon ook.
 */
export function tankstopOverslaan(ownerKey, dag, naarLat, naarLon, aan, vanLat, vanLon) {
	const q = new URLSearchParams({
		dag,
		naarLat: String(naarLat),
		naarLon: String(naarLon),
		overslaan: aan ? '1' : '0',
		// Het luik eist deze twee, ook als er niets gezocht wordt.
		vanLat: String(vanLat),
		vanLon: String(vanLon),
	})
	return call('trip/tankstop.php?' + q.toString(), { ownerKey })
}

/**
 * "Blijf je wachten of rijd je door?" beantwoorden bij halen en brengen (Ramin, 27-09).
 *
 * Het antwoord hangt aan de PLEK, niet aan de afspraak: bij de tandarts wacht je altijd, en dan hoort die
 * vraag niet elke keer terug te komen.
 */
/** Het besluit over een cadeau vastleggen (kaart: een week voor een verjaardag). */
export function cadeauSet(ownerKey, persoon, besluit, jaar) {
	return call('cadeau/set.php', { method: 'POST', ownerKey, body: { persoon, besluit, jaar } })
}

export function halenPatroon(ownerKey, plek, patroon) {
	return call('halen.php', { method: 'POST', ownerKey, body: { plek, patroon } })
}

export function werkelijkVanDag(ownerKey, dag) {
	return call('account/werkelijk/list.php?dag=' + encodeURIComponent(dag), { ownerKey })
}

/**
 * Hoort er bij deze afspraak een uitnodiging uit je mail? (Ramin, 23-09: *"in de mail vind je de
 * contactgegevens van Homer. In de card een knop plaatsen of je de contact moet opslaan."*)
 *
 * Geeft de deelnemen-link en de gegevens van de persoon, of found = false. Is de vergadering afgezegd,
 * dan komt `cancelled` terug en hoort er geen knop meer bij, maar wel een melding.
 */
export function mailMeeting(ownerKey, dag, titel, start) {
	const q = 'date=' + encodeURIComponent(dag) + '&title=' + encodeURIComponent(titel) + '&start=' + (start || 0)
	return call('mail/meeting.php?' + q, { ownerKey })
}

/**
 * "Dit klopt niet" bij een kaart (kaart 218). Stuurt de regel zoals we hem kregen; de server zoekt er het
 * stukje spoor bij dat hem gemaakt heeft, en bewaart beide samen.
 */
export function meldFout(ownerKey, melding) {
	return call('melding.php', { method: 'POST', ownerKey, body: melding })
}

export function seenState(ownerKey) {
	// Drie vragers bij het starten: de nieuwsbadge, de sterren en de gelezen-lijst.
	return samen('seen/state|' + ownerKey, 5000, () => call('seen/state.php', { ownerKey }))
}
export function seenList(ownerKey, soort) {
	return call('seen/list.php?soort=' + encodeURIComponent(soort), { ownerKey })
}
export function seenAdd(ownerKey, body) {
	return call('seen/add.php', { method: 'POST', ownerKey, body })
}

/** RSS/Atom-feeds en podcasts via onze server (2026-09-15). */
export function feedFetch(ownerKey, url) {
	return call('feeds/fetch.php?url=' + encodeURIComponent(url), { ownerKey })
}
/**
 * Meerdere feeds in één verzoek (Ramin, 24-09). Veertig losse verzoeken voor een wachtrij leverden niets
 * op -- de server had ze toch al gecachet -- behalve verkeer en een rem die aansloeg.
 */
export function feedBundel(ownerKey, urls, { sinds = '', max = 200 } = {}) {
	// De tellingen en het nieuwsscherm vragen bij het openen dezelfde feeds op. Een halve minuut is genoeg
	// om die twee samen te laten vallen zonder dat een nieuw bericht blijft liggen.
	const sleutel = 'feeds|' + ownerKey + '|' + sinds + '|' + max + '|' + (urls || []).join(',')
	return samen(sleutel, 30000, () => call('feeds/bundel.php', { method: 'POST', ownerKey, body: { urls, sinds, max } }))
}

export function feedDiscover(ownerKey, url) {
	return call('feeds/discover.php?url=' + encodeURIComponent(url), { ownerKey })
}
/** Beurs (kaart 99, 2026-09-16): koersen en zoeken via onze server. */
export function marketQuotes(ownerKey, symbols) {
	return call('markets/quotes.php?symbols=' + encodeURIComponent(symbols), { ownerKey })
}

/** Bezorgingen (kaart 63, 2026-09-16): pakketjes volgen via AfterShip op onze server. */
// Back-office (kaart 119): hulp-gesprek, fouten melden, functies per tier.
/** Helpteksten (20-09): basis, schermen, FAQ; openbaar, in de taal van de app. */
export function help(lang) {
	return call('help.php?lang=' + encodeURIComponent(lang || 'en'))
}
export function supportMessages(ownerKey) {
	return call('support/messages.php', { ownerKey })
}
export function supportSend(ownerKey, body) {
	return call('support/messages.php', { method: 'POST', body, ownerKey })
}
export function reportError(ownerKey, body) {
	return call('errors/report.php', { method: 'POST', body, ownerKey }).catch(() => null)
}
export function adminInbox(ownerKey) {
	return call('admin/inbox.php', { ownerKey })
}
export function features(ownerKey) {
	return call('features.php', { ownerKey })
}

export function deliveries(ownerKey) {
	return call('deliveries/list.php', { ownerKey })
}

export function deliveryAdd(ownerKey, body) {
	return call('deliveries/add.php', { method: 'POST', body, ownerKey })
}

export function deliveryRemove(ownerKey, id) {
	return call('deliveries/remove.php', { method: 'POST', body: { id }, ownerKey })
}

export function marketSearch(ownerKey, q) {
	return call('markets/search.php?q=' + encodeURIComponent(q), { ownerKey })
}

export function podcastSearch(ownerKey, q, country) {
	return call('feeds/podcast_search.php?' + new URLSearchParams({ q, country: country || 'NL' }).toString(), { ownerKey })
}

export function poiNearby(lat, lon, { category = 'coffee_food', radius = 2000, nameFilter = null } = {}) {
	const params = new URLSearchParams({ lat, lon, category, radius })
	if (nameFilter) params.set('nameFilter', nameFilter)
	return call('poi.php?' + params.toString())
}

/**
 * Open-ended free-text POI search (Ramin, 2026-09-10: "vrij tekstveld zodat
 * de gebruiker een poi kan 'open/ruim' zoeken: 'makamba Doetinchem'") —
 * unlike poiNearby, no lat/lon/category needed; same PoiResult shape either way.
 * @returns {Promise<Array<{name: string, lat: number, lon: number, address: string|null, phone: string|null, website: string|null}>>}
 */
export function poiSearch(query, limit = 5, osmClass = null) {
	const params = new URLSearchParams({ q: query, limit })
	if (osmClass) params.set('class', osmClass)
	return call('poi_search.php?' + params.toString())
}

// Standalone named locations (architecture spec #8's "mark-a-location
// flow") — same owner_key scheme as settings/travel-choices, so under the
// NC-app's API-code partition this is its own self-contained list, separate
// from whatever the same account's Android app has saved (see
// project_pa_nextcloud_app_and_api_codes memory: the two are NOT unified).
export function listLocations(ownerKey) {
	return call('locations/list.php', { ownerKey })
}

export function createLocation(ownerKey, location) {
	return call('locations/create.php', { method: 'POST', body: location, ownerKey })
}

export function deleteLocation(ownerKey, id) {
	return call('locations/delete.php', { method: 'POST', body: { id }, ownerKey })
}

export function plan(ownerKey, request) {
	return call('plan.php', { method: 'POST', body: request, ownerKey })
}

export function checkConflict(ownerKey, candidate, events) {
	return call('check_conflict.php', { method: 'POST', body: { candidate, events }, ownerKey })
}

export function getSettings(ownerKey, metTijden = false) {
	return call('settings/get.php' + (metTijden ? '?tijden=1' : ''), { ownerKey })
}

export function setSettings(ownerKey, settings) {
	return call('settings/set.php', { method: 'POST', body: settings, ownerKey })
}

/**
 * Instant cross-device sync (Ramin, 2026-09-10: "ze moeten instant
 * veranderen" — settings changes made in Android/Account-mode should reach
 * this app right away, not just on its own next load/save). Same
 * long-poll wait_changed.php Android already uses — blocks server-side up
 * to ~25s, `{changed:false}` on timeout. Never exported/called with the
 * NC-app's own Nextcloud-derived key (this app has none); always the
 * APP-API code, matching settings/get.php|set.php above.
 */
export function waitChanged(ownerKey, since) {
	return call('wait_changed.php?since=' + since, { ownerKey })
}

/**
 * De foto's van een bon (24-09). `receiptImages` geeft welke er zijn; `receiptImageBytes` de versleutelde
 * bytes van een ervan. Ontsleutelen gebeurt in de browser, met jouw eigen code -- de server heeft de
 * sleutel niet en kan de bon dus niet lezen.
 */
export function receiptImages(ownerKey, receiptUid) {
	return call('receipts/images.php?receiptUid=' + encodeURIComponent(receiptUid), { ownerKey })
}

export async function receiptImageBytes(ownerKey, id) {
	const r = await fetch(BASE_URL + 'receipts/image.php?id=' + encodeURIComponent(id), {
		headers: { 'X-PA-Owner-Key': ownerKey },
	})
	if (!r.ok) {
		const fout = new Error('HTTP ' + r.status)
		fout.status = r.status
		throw fout
	}
	return new Uint8Array(await r.arrayBuffer())
}

/**
 * Gesprekken (24-09): alleen die waar iets bij geschreven is. De volledige belgeschiedenis blijft op het
 * toestel -- die komt hier nooit langs.
 */
export function callsList(ownerKey, limit = 100) {
	return call('calls.php?limit=' + encodeURIComponent(limit), { ownerKey })
}

/*
 * Het netwerk, voor de web-agenda.
 *
 * Alleen voor de web-bouw: daar staan de gegevens bij ons en heeft de server de grafiek al uitgerekend.
 * In de Nextcloud-app komt dit nooit langs -- die haalt alles uit zijn eigen Nextcloud (Ramin, 27-09).
 */
export function netwerk(ownerKey) {
	return call('netwerk.php', { ownerKey })
}

export function netwerkActie(ownerKey, body) {
	return call('netwerk.php', { method: 'POST', ownerKey, body })
}

export function callUpdate(ownerKey, id, velden) {
	return call('calls.php', { method: 'POST', ownerKey, body: { action: 'update', id, ...velden } })
}

export function callDelete(ownerKey, id) {
	return call('calls.php', { method: 'POST', ownerKey, body: { action: 'delete', id } })
}

/**
 * De afbeelding die bij een artikel hoort, als de feed er zelf geen meestuurt (24-09).
 *
 * De server opent de pagina en pakt de `og:image` -- wat een site meegeeft aan een deel-link. Lukt dat
 * niet, dan komt er een lege waarde terug en dat is ook een antwoord: die wordt een week bewaard, zodat we
 * het niet elke keer opnieuw proberen bij een site die het toch niet geeft.
 */
export function articleImage(ownerKey, url) {
	return call('og.php?url=' + encodeURIComponent(url), { ownerKey })
}

/**
 * Series opzoeken en ophalen via onze server (24-09).
 *
 * De gegevens komen van TVMaze, maar een browser mag daar niet rechtstreeks heen: de web-agenda mag
 * alleen met deze server praten. Dat is met opzet zo -- anders kan elke ingeslopen regel javascript het
 * hele internet op. De server haalt het op, bewaart het een uur en geeft het door.
 */
export function seriesSearch(ownerKey, q) {
	return call('series.php?q=' + encodeURIComponent(q), { ownerKey })
}

export function seriesShow(ownerKey, id) {
	return call('series.php?id=' + encodeURIComponent(id), { ownerKey })
}

/**
 * Rittenadministratie (24-09): per auto, per maand, met de totalen zakelijk en prive.
 *
 * Hetzelfde adres dat de telefoon al gebruikt -- `rides.php` bestond dus al; alleen het scherm ontbrak
 * aan deze kant. Een rit wijzigen gaat via een POST met `action: "update"`; de server rekent de totalen
 * opnieuw uit en geeft ze terug.
 */
export function ridePlates(ownerKey) {
	return call('rides.php?plates=1', { ownerKey })
}

export function rides(ownerKey, plate, year, month) {
	const q = new URLSearchParams({ year: String(year), month: String(month) })
	if (plate) q.set('plate', plate)
	return call('rides.php?' + q.toString(), { ownerKey })
}

export function rideUpdate(ownerKey, id, velden) {
	return call('rides.php', { method: 'POST', ownerKey, body: { action: 'update', id, ...velden } })
}

/** De route van een rit als lijst punten, om hem te tekenen. */
export function rideGeometry(ownerKey, id) {
	return call('rides.php?geometry=1&id=' + encodeURIComponent(id), { ownerKey })
}

/**
 * MailWatcher: wat de server uit je mailbox mag halen (Ramin, 24-09).
 *
 * Dit zit niet in de gedeelde instellingen maar achter een eigen adres, omdat er een wachtwoord bij hoort
 * dat de server bewaart en nooit teruggeeft -- `hasPassword` zegt alleen of er een staat. Laat je het leeg
 * bij het opslaan, dan blijft het wachtwoord dat er al is gewoon staan.
 */
export function mailWatchGet(ownerKey) {
	return call('mail/settings.php', { ownerKey })
}

export function mailWatchSave(ownerKey, instellingen) {
	return call('mail/settings.php', { method: 'POST', ownerKey, body: instellingen })
}

/** De mailserver opzoeken bij een e-mailadres, zodat je hem niet hoeft in te typen. */
export function mailWatchDiscover(ownerKey, email) {
	return call('mail/discover.php?email=' + encodeURIComponent(email), { ownerKey })
}

/** Het weer nu + komende uren + vandaag/morgen, via onze server (Deck 68, 2026-09-15). */
export function weatherNow(ownerKey, lat, lon) {
	return call(`weather/now.php?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`, { ownerKey })
}

/** Inloggen met e-mail + wachtwoord (Deck 67): geeft apiCode, of needs2fa + pendingToken. */
export function loginEmail(email, password) {
	return call('auth/login.php', { method: 'POST', body: { email, password } })
}

/** Tweestapsverificatie instellen (kaart 67): geheim + otpauth-link, daarna bevestigen met een code. */
export function twoFactorSetup(ownerKey) {
	return call('auth/2fa/setup.php', { method: 'POST', body: {}, ownerKey })
}

export function twoFactorConfirm(ownerKey, code) {
	return call('auth/2fa/confirm.php', { method: 'POST', body: { code }, ownerKey })
}

/** Tweede stap na loginEmail: de 6 cijfers uit de authenticator. */
export function loginVerify2fa(pendingToken, code) {
	return call('auth/2fa/login_verify.php', { method: 'POST', body: { pendingToken, code } })
}

/** Passkeys (18-09): de sleutel op je telefoon of laptop als inlog. Lijst/toevoegen/weghalen met code, inloggen zonder. */
export function passkeyList(ownerKey) {
	return call('auth/webauthn/list.php', { ownerKey })
}
export function passkeyDelete(ownerKey, id) {
	return call('auth/webauthn/delete.php', { method: 'POST', body: { id }, ownerKey })
}
/** Hele registratie in één keer: opties ophalen, de browser laten maken, opslaan. */
export async function passkeyRegister(ownerKey, label) {
	const opt = await call('auth/webauthn/register_options.php', { method: 'POST', body: {}, ownerKey })
	const cred = await navigator.credentials.create({ publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(opt.options) })
	return call('auth/webauthn/register_verify.php', { method: 'POST', body: { challengeToken: opt.challengeToken, credential: cred.toJSON(), label: label || null }, ownerKey })
}
/** Inloggen met een passkey; e-mail mag leeg (de browser laat dan zelf kiezen). Geeft {apiCode}. */
export async function passkeyLogin(email) {
	const opt = await call('auth/webauthn/login_options.php', { method: 'POST', body: { email: email || '' } })
	const cred = await navigator.credentials.get({ publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(opt.options) })
	return call('auth/webauthn/login_verify.php', { method: 'POST', body: { challengeToken: opt.challengeToken, credential: cred.toJSON() } })
}
export function passkeySupported() {
	return typeof window !== 'undefined' && !!window.PublicKeyCredential && typeof window.PublicKeyCredential.parseRequestOptionsFromJSON === 'function'
}

/** Anina met AI (Deck 41): vraag + wat er op het scherm staat naar onze server, antwoord terug. */
export function askAnina(ownerKey, question, context, history, apiKey = null, workspaceId = null, provider = null) {
	return call('ai/ask.php', { method: 'POST', body: { question, context, history, apiKey: apiKey || null, workspaceId: workspaceId || null, provider: provider || null }, ownerKey })
}

export function aninaStatus(ownerKey, eigenSleutel = false, provider = null) {
	const q = []
	if (eigenSleutel) q.push('own=1')
	if (provider) q.push('provider=' + encodeURIComponent(provider))
	return call('ai/status.php' + (q.length ? '?' + q.join('&') : ''), { ownerKey })
}

export function notifyChanged(ownerKey, kind) {
	return call('notify_changed.php', { method: 'POST', body: { kind }, ownerKey })
}

/**
 * Is this a real, unexpired APP-API code? Every other endpoint accepts an
 * unknown key as its own data partition by design, so a typo behaves
 * exactly like a working code until you notice your data looks empty —
 * this is the one call that says so out loud.
 * @returns {Promise<boolean>}
 */
export async function checkApiCode(code) {
	if (!code) return false
	try {
		/*
		 * De code als header, niet in de URL (doorlichting 2026-09-13).
		 *
		 * En `ruw`, want dit is de ene plek waar de CODE het onderwerp van de vraag is en niet onze
		 * identiteit (29-09-2026). Zonder dat zou de omruil naar de toestelsleutel hier toeslaan en vraagt
		 * deze functie "bestaat mijn toestelsleutel als code?" -- waarop het antwoord altijd nee is. Elke
		 * goede code kreeg dan een rode X.
		 *
		 * Gevonden doordat ADMIN 69 endpoints langs elkaar legde en dit als enige echte verschil vond. Hij
		 * heeft zijn kant gerepareerd (een uitdrukkelijk meegegeven code wint nu van de kop), maar dat
		 * helpt ons niet: wij sturen niets in de body, alleen die kop. Twee reparaties voor één fout, en
		 * alleen deze doet iets voor deze app.
		 */
		const response = await call('account/api_code_check.php', { ownerKey: code, ruw: true })
		return response.valid === true
	} catch (e) {
		return false
	}
}

/** This owner's AskAnina subscription state, or null when it can't be
 * fetched — the caller shows nothing rather than claiming "not subscribed"
 * on the strength of a failed request. */
export async function billingStatus(ownerKey) {
	try {
		return await call('billing/status.php', { ownerKey })
	} catch (e) {
		return null
	}
}

/** A Stripe-hosted Customer Portal link (change plan, payment method,
 * cancel). `locale` is the app's own language, not the browser's. */
export function billingPortal(ownerKey, locale, returnUrl = null) {
	return call('billing/portal.php', { method: 'POST', body: { locale, returnUrl }, ownerKey })
}

/**
 * User-action audit log (Ramin, 2026-09-10: "Daar zitten niet mijn
 * handelingen in? Zo niet, maak dat" — wants every create/edit/delete
 * visible, both Account-mode and Nextcloud-mode). Best-effort: failures
 * here must never block the actual calendar write that triggered them.
 * @returns {Promise<void>}
 */
export async function logAction(ownerKey, action, { entityId = null, summary = null } = {}) {
	if (!ownerKey) return
	try {
		await call('action_log/log.php', {
			method: 'POST',
			body: { source: 'nextcloud', action, entityId, summary },
			ownerKey,
		})
	} catch (e) {
		// best-effort — swallow
	}
}

// Generic bi-directional links (architecture spec #1 / reference_pa_links_architecture) —
// used here only for linked_type "card_state" (one workflow-form outcome per
// event, see CardStateRepo.kt on Android for the exact same save-deletes-old-
// then-creates-new pattern, ported 1:1 below).
export function createLink(ownerKey, link) {
	return call('links/create.php', { method: 'POST', body: link, ownerKey })
}

export function deleteLink(ownerKey, id) {
	return call('links/delete.php', { method: 'POST', body: { id }, ownerKey })
}

export function linksForEvent(ownerKey, eventUid) {
	return call('links/for_event.php?eventUid=' + encodeURIComponent(eventUid), { ownerKey })
}

export function listTravelChoices(ownerKey) {
	return call('travel_choices/list.php', { ownerKey })
}

export function setTravelChoice(ownerKey, eventId, choice) {
	return call('travel_choices/set.php', { method: 'POST', body: { eventId, ...choice }, ownerKey })
}

// ---- Bonnen en boodschappen (2026-09-13) ----

/** Je bonnen met hun regels, nieuwste eerst. */
export function listReceipts(ownerKey) {
	return call('receipts/list.php', { ownerKey })
}

/** De regels van één bon vastleggen (of overschrijven). */
export function syncReceipt(ownerKey, receipt) {
	return call('receipts/sync.php', { method: 'POST', body: receipt, ownerKey })
}

/** Wat er volgens je bonnen weer op is; wat al op de lijst staat valt af. */
export function suggestions(ownerKey, onList = []) {
	return call('receipts/suggestions.php', { method: 'POST', body: { onList }, ownerKey })
}

/** Je producten, of de producten die op een zoekwoord lijken. */
export function listProducts(ownerKey, q = '') {
	return call('receipts/products.php' + (q ? '?q=' + encodeURIComponent(q) : ''), { ownerKey })
}

/** Boodschappen in Account-modus (Nextcloud-modus bewaart ze in het versleutelde bestand). */
export function listServerGroceries(ownerKey) {
	return call('groceries/list.php', { ownerKey })
}

/** Waar tank je het goedkoopst — dezelfde motor als de telefoon (fuel/stations.php). */
export function fuelStations(ownerKey, params) {
	const q = new URLSearchParams()
	Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q.set(k, String(v)) })
	return call('fuel/stations.php?' + q.toString(), { ownerKey })
}

/** De reisplanner (trip/plan.php): auto, openbaar vervoer of vlucht, één manier per aanroep. */
export function planTrip(ownerKey, request) {
	return call('trip/plan.php', { method: 'POST', body: request, ownerKey })
}

/** Een abonnement starten: kaart via Stripe Checkout, of per factuur. */
export function billingCheckout(ownerKey, body) {
	return call('billing/checkout.php', { method: 'POST', body, ownerKey })
}

// ---- Account-modus (web-jas, 2026-09-13): afspraken en boodschappen op onze server ----

export function listAppointments(ownerKey) {
	return call('account/appointments/list.php', { ownerKey })
}
export function createAppointment(ownerKey, body) {
	return call('account/appointments/create.php', { method: 'POST', body, ownerKey })
}
export function updateAppointment(ownerKey, body) {
	return call('account/appointments/update.php', { method: 'POST', body, ownerKey })
}
/** Met `occurrence` (Ymd) alleen die ene keer uit de reeks (Ramin, 21-09: 'deze of allemaal'). */
export function deleteAppointment(ownerKey, id, occurrence = null) {
	return call('account/appointments/delete.php', { method: 'POST', body: occurrence ? { id, occurrence } : { id }, ownerKey })
}
export function linksByType(ownerKey, linkedType) {
	return call('links/by_type.php?linkedType=' + encodeURIComponent(linkedType), { ownerKey })
}
export function createGrocery(ownerKey, body) {
	return call('groceries/create.php', { method: 'POST', body, ownerKey })
}
export function updateGrocery(ownerKey, body) {
	return call('groceries/update.php', { method: 'POST', body, ownerKey })
}
export function deleteGrocery(ownerKey, id) {
	return call('groceries/delete.php', { method: 'POST', body: { id }, ownerKey })
}

// ── Notities, taken en Deck bij ons (Account) en de agenda-spiegel ──────
// Dezelfde vormen als de Nextcloud-varianten (zie shortcutSources.js).
export function accountNotes(ownerKey) {
	return call('account/notes/list.php', { ownerKey })
}
export function saveAccountNote(ownerKey, body) {
	return call('account/notes/save.php', { method: 'POST', body, ownerKey })
}
export function deleteAccountNote(ownerKey, id) {
	return call('account/notes/delete.php', { method: 'POST', body: { id }, ownerKey })
}
export function accountTasks(ownerKey, which = 'open') {
	return call('account/tasks/list.php?which=' + encodeURIComponent(which), { ownerKey })
}
export function saveAccountTask(ownerKey, body) {
	return call('account/tasks/save.php', { method: 'POST', body, ownerKey })
}
export function deleteAccountTask(ownerKey, id) {
	return call('account/tasks/delete.php', { method: 'POST', body: { id }, ownerKey })
}
export function accountDeck(ownerKey) {
	return call('account/deck/list.php', { ownerKey })
}
export function saveAccountDeck(ownerKey, body) {
	return call('account/deck/save.php', { method: 'POST', body, ownerKey })
}
export function deleteAccountDeck(ownerKey, type, id) {
	return call('account/deck/delete.php', { method: 'POST', body: { type, id }, ownerKey })
}
// Deck volwaardig (Ramin, 2026-09-14): volgorde in één keer en plaatjes bij een kaart.
export function reorderAccountDeck(ownerKey, body) {
	return call('account/deck/reorder.php', { method: 'POST', body, ownerKey })
}
export function accountDeckAttachments(ownerKey, cardId) {
	return call('account/deck/attachment.php?card_id=' + encodeURIComponent(cardId), { ownerKey })
}
export function accountDeckAttachment(ownerKey, id) {
	return call('account/deck/attachment.php?id=' + encodeURIComponent(id), { ownerKey })
}
export function addAccountDeckAttachment(ownerKey, body) {
	return call('account/deck/attachment.php', { method: 'POST', body, ownerKey })
}
export function deleteAccountDeckAttachment(ownerKey, id) {
	return call('account/deck/attachment.php', { method: 'POST', body: { id, delete: true }, ownerKey })
}
/** De afspraken die de telefoon uit zijn eigen agenda's spiegelt (alleen lezen). */
export function mirrorEvents(ownerKey, fromIso, toIso) {
	const params = new URLSearchParams({ from: fromIso, to: toIso })
	return call('account/mirror/list.php?' + params.toString(), { ownerKey })
}
export function accountContacts(ownerKey) {
	return call('account/contacts/list.php', { ownerKey })
}
export function saveAccountContact(ownerKey, body) {
	return call('account/contacts/save.php', { method: 'POST', body, ownerKey })
}
export function deleteAccountContact(ownerKey, id) {
	return call('account/contacts/delete.php', { method: 'POST', body: { id }, ownerKey })
}

// Je gegevens en je account (privacy-check kaart 121, 16-09).
export function exportAccount(ownerKey) {
	return call('account/export.php', { ownerKey })
}
export function deleteAccountStatus(ownerKey) {
	return call('account/delete.php', { ownerKey })
}
export function requestAccountDeletion(ownerKey) {
	return call('account/delete.php', { method: 'POST', ownerKey, body: { confirm: 'DELETE' } })
}
export function cancelAccountDeletion(ownerKey) {
	return call('account/delete.php', { method: 'POST', ownerKey, body: { cancel: true } })
}
