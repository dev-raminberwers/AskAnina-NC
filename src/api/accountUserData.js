/**
 * Persoonlijke gegevens van een Account-gebruiker (geen Nextcloud): op onze
 * server, via dezelfde endpoints als de telefoon in Account-modus
 * (settings/, locations/, travel_choices/, links/, groceries/). Zelfde
 * functienamen als nextcloudUserData.js, zodat de schermen niets merken.
 */
import { getAccessCode } from './accessCode.js'
import * as paApi from './paApi.js'
import { t } from '../l10n/index.js'

function code() {
	const c = getAccessCode()
	if (!c) throw new Error(t('Enter your USER-API code first.'))
	return c
}

/**
 * Wat we het laatst van de server zagen, en wanneer hij elk veld accepteerde.
 *
 * Ramin, 24-09: *"we moeten update tijden bijhouden. Want welke data is de waarheid?"* Hiermee sturen we
 * alleen de velden die híér zijn gewijzigd, en zeggen we erbij welke versie we zagen. Een scherm dat een
 * uur openstond overschrijft zo niet iets wat intussen op je telefoon veranderde.
 */
let laatst = null
let tijden = {}

/**
 * Je instellingen blijven een minuut in het geheugen staan, en wie er tegelijk om vraagt krijgt hetzelfde
 * antwoord.
 *
 * Ramin, 24-09: *"onderzoek wat zoveel calls (3000) veroorzaakt."* Eén keer de webagenda openen vroeg de
 * instellingen VIER keer op: het menu, de dag, de tellingen en het zoeken starten los van elkaar. De
 * Nextcloud-jas had dit geheugen al sinds de doorlichting van 13-09; de web-jas ging elke keer opnieuw
 * naar de server. Wat er op een ander apparaat verandert komt binnen via invalidateUserData.
 */
const CACHE_MS = 60 * 1000
let cache = null
let cacheAt = 0
let lopend = null

export function invalidateUserData() { laatst = null; tijden = {}; cache = null; cacheAt = 0; lopend = null }

export async function getSettings() {
	if (cache && Date.now() - cacheAt < CACHE_MS) return JSON.parse(JSON.stringify(cache))
	// Vragen er drie schermen tegelijk om, dan wachten ze op hetzelfde verzoek in plaats van elk een eigen.
	if (!lopend) {
		lopend = (async () => {
			const s = await paApi.getSettings(code(), true)
			const blob = s && typeof s === 'object' ? { ...s } : {}
			tijden = (blob._tijden && typeof blob._tijden === 'object') ? blob._tijden : {}
			delete blob._tijden
			laatst = JSON.parse(JSON.stringify(blob))
			cache = JSON.parse(JSON.stringify(blob))
			cacheAt = Date.now()
			return blob
		})().finally(() => { lopend = null })
	}
	return JSON.parse(JSON.stringify(await lopend))
}

/** Twee waarden vergelijken zonder aannames over hun vorm. */
function anders(a, b) { return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null) }

export async function setSettings(settings) {
	// Alleen wat er anders is dan wat we het laatst zagen. Weten we dat niet, dan gaat alles mee.
	const velden = {}
	for (const k of Object.keys(settings || {})) {
		if (!laatst || anders(settings[k], laatst[k])) velden[k] = settings[k]
	}
	if (Object.keys(velden).length === 0) return
	const gezienOp = {}
	for (const k of Object.keys(velden)) if (tijden[k]) gezienOp[k] = tijden[k]

	const antwoord = await paApi.settingsPatch(code(), { velden, gezienOp })
	if (antwoord && antwoord.tijden) tijden = antwoord.tijden
	laatst = { ...(laatst || {}), ...velden }
	// Wat geweigerd is, was elders nieuwer: neem de winnende waarde over in plaats van hem te negeren.
	if (antwoord && antwoord.geweigerd && !Array.isArray(antwoord.geweigerd)) {
		for (const [k, v] of Object.entries(antwoord.geweigerd)) laatst[k] = v
	}
	// Het geheugen hierboven zou anders een minuut lang de oude waarde blijven geven.
	cache = JSON.parse(JSON.stringify(laatst))
	cacheAt = Date.now()
}

/** Van code gewisseld: op de server is er niets over te zetten. */
export async function rekeyUserData() { return 'none' }

// ---- Plekken: pa_locations, in de vorm die de schermen al kennen ----

export async function listLocations() {
	return (await paApi.listLocations(code())).map((l) => ({
		id: l.id, name: l.name, lat: l.lat, lon: l.lon, display_name: l.display_name || null,
		category: l.category || null, geofence_enabled: !!l.geofence_enabled, created_at: l.created_at,
	}))
}

export async function createLocation(location) {
	const r = await paApi.createLocation(code(), {
		name: location.name, lat: location.lat, lon: location.lon,
		displayName: location.display_name || location.displayName || null,
		category: location.category || null, geofenceEnabled: !!location.geofence_enabled,
	})
	return { id: r.id, created_at: new Date().toISOString(), ...location }
}

export async function deleteLocation(id) {
	await paApi.deleteLocation(code(), id)
}

// ---- Reiskeuzes ----

export async function listTravelChoices() {
	return (await paApi.listTravelChoices(code())) || {}
}

export async function setTravelChoice(eventId, fields) {
	await paApi.setTravelChoice(code(), eventId, fields)
}

// ---- Kaartstatus en item-status: pa_links, net als Android ----

async function linksVan(eventId, soort) {
	return (await paApi.linksForEvent(code(), eventId)).filter((l) => l.linked_type === soort)
}

export async function loadCardState(eventId) {
	const l = (await linksVan(eventId, 'card_state'))[0]
	return l ? (l.metadata || {}) : null
}

export async function saveCardState(eventId, metadata) {
	for (const l of await linksVan(eventId, 'card_state')) await paApi.deleteLink(code(), l.id)
	await paApi.createLink(code(), { eventUid: eventId, calendarUri: 'account', linkedType: 'card_state', metadata })
}

export async function listItemStatus() {
	const uit = {}
	for (const l of await paApi.linksByType(code(), 'item_status')) {
		const m = l.metadata || {}
		uit[l.event_uid] = { doneAt: m.doneAt ?? null, busySince: m.busySince ?? null, archived: !!m.archived }
	}
	return uit
}

export async function setItemStatus(eventId, status) {
	for (const l of await linksVan(eventId, 'item_status')) await paApi.deleteLink(code(), l.id)
	const leeg = !status || (status.doneAt == null && status.busySince == null && !status.archived)
	if (leeg) return
	await paApi.createLink(code(), { eventUid: eventId, calendarUri: 'account', linkedType: 'item_status', metadata: status })
}

// ---- Boodschappen: pa_grocery_items ----

export async function listGroceries() {
	return await paApi.listServerGroceries(code())
}

export async function addGrocery(item) {
	const r = await paApi.createGrocery(code(), { name: item.name, quantity: item.quantity || '', storeId: item.storeId || '', productKey: item.productKey || '' })
	return { id: String(r.id), storeId: '', quantity: '', done: false, addedAtEpochMillis: Date.now(), boughtAtEpochMillis: null, productKey: '', ...item }
}

export async function updateGrocery(item) {
	await paApi.updateGrocery(code(), { id: parseInt(item.id, 10), name: item.name, quantity: item.quantity || '', storeId: item.storeId || '', done: !!item.done })
}

export async function removeGroceries(ids) {
	for (const id of ids) await paApi.deleteGrocery(code(), parseInt(id, 10))
}
