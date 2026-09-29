/**
 * Personal data storage for Nextcloud-mode users — settings/locations/
 * travel-choices/card-state outcomes, ALL kept in the user's OWN Nextcloud
 * (one JSON file at Files/PersonalAssistant/data.json, via WebDAV), never
 * on askanina.com (Ramin, 2026-09-09: "voor nextcloud... zo min
 * mogelijk data op onze server opslaan"). This REPLACES this app's earlier
 * use of paApi's settings/locations/travel_choices/links endpoints — those
 * endpoints still exist and are still used, but only by the "Account"
 * (non-Nextcloud) data source, which genuinely has nowhere else to store
 * this (see project_pa_account_backend_phase1 memory). The NC-app only
 * ever runs inside Nextcloud, so unlike Android it never needs to branch
 * on data-source — everything here always applies.
 *
 * The one exception, deliberately NOT moved here: pa_sync_state (the
 * notify_changed/wait_changed "something changed" counter) stays
 * server-side — it carries no personal data, just a per-owner counter/
 * timestamp, and moving it would mean losing instant cross-device sync
 * entirely in favour of polling this file's ETag (explicitly rejected,
 * 2026-09-09 Q&A: "laten staan (aanbevolen)").
 *
 * Whole-file read-modify-write, last-write-wins — no ETag/If-Match
 * locking. A real (if narrow) race exists if two devices save within the
 * same few hundred ms of each other; accepted for v1 given how low-stakes
 * this data is (settings/locations/outcome notes, not anything
 * safety-critical) — the same tradeoff class as the old pa_links
 * create-then-delete-old pattern this replaces, just shaped differently.
 *
 * ENCRYPTED at rest and in transit (2026-09-09: "Verstuur data encrypted
 * over internet en gebruik de API key als sleutel. dus wordt http ook
 * veiliger") — see cryptoUtil.js's own docblock for the full reasoning
 * (why the browser's native crypto.subtle couldn't be used, why the key
 * has to be the API-code and not anything Nextcloud-specific). The file on
 * disk is raw encrypted bytes, not JSON — Nextcloud itself (and anyone
 * intercepting the connection to it) never sees plaintext.
 */

import axios from '@nextcloud/axios'
import { WEB } from '../mode.js'
import * as account from './accountUserData.js'
import { generateRemoteUrl } from '@nextcloud/router'
import { getCurrentUser } from '@nextcloud/auth'
import { getAccessCode } from './accessCode.js'
import { persoonlijkDeel, voorkeurDeel, voegSamen } from './verdeling.js'
import { encryptJson, decryptJson } from './cryptoUtil.js'

import { t } from '../l10n/index.js'

const BLOB_PATH = 'PersonalAssistant/data.enc'
const DEFAULT_BLOB = { settings: {}, locations: [], travelChoices: {}, cardStates: {}, itemStatus: {}, groceries: [] }

/**
 * Het bestand in het geheugen houden.
 *
 * Doorlichting 2026-09-13: elke schermwissel haalde data.enc opnieuw op en
 * ontsleutelde het hele bestand — zes keer binnen een minuut. Nu één keer,
 * daarna uit het geheugen, en na een minuut of na een eigen wijziging
 * opnieuw. Wie op een ander apparaat iets verandert, komt via het
 * "gewijzigd"-signaal binnen (invalidateUserData).
 */
const CACHE_MS = 60 * 1000
let cache = null
let cacheAt = 0

/**
 * De serverhelft (je voorkeuren) krijgt zijn eigen kortstondige geheugen, net als data.enc hierboven.
 * Zonder dit zou elke schermwissel er opnieuw om vragen -- dezelfde doorlichting als 13-09.
 */
let serverCache = null
let serverCacheAt = 0

export function invalidateUserData() {
	if (WEB) return account.invalidateUserData()
	cache = null
	cacheAt = 0
	serverCache = null
	serverCacheAt = 0
}

function filesRoot() {
	const user = getCurrentUser()?.uid
	if (!user) throw new Error('Not logged in')
	return generateRemoteUrl(`dav/files/${encodeURIComponent(user)}/`)
}

function requireApiCode() {
	const code = getAccessCode()
	// Geen woord over waar de code nog meer voor dient (Ramin, 2026-09-14).
	if (!code) throw new Error(t('Set your USER-API code under Settings first.'))
	return code
}

async function ensureFolder() {
	try {
		await axios({ method: 'MKCOL', url: filesRoot() + 'PersonalAssistant/' })
	} catch (e) {
		// 405 = already exists, the expected case after the very first save.
		if (e.response?.status !== 405) throw e
	}
}

export async function loadUserData() {
	if (cache && Date.now() - cacheAt < CACHE_MS) {
		return JSON.parse(JSON.stringify(cache))
	}
	const apiCode = requireApiCode()
	try {
		const response = await axios.get(filesRoot() + BLOB_PATH, { responseType: 'arraybuffer' })
		let decrypted
		try {
			decrypted = decryptJson(apiCode, new Uint8Array(response.data))
		} catch (e) {
			// "aes-gcm: invalid tag" zegt niemand iets (Ramin, 2026-09-13).
			// Het betekent maar één ding: dit bestand is met een andere
			// API-code versleuteld dan de code die hier ingevuld staat.
			throw new Error(t('This API code cannot read your data: the file was saved with a different code. Enter the code your phone uses.'))
		}
		cache = { ...DEFAULT_BLOB, ...decrypted }
	} catch (e) {
		if (e.response?.status !== 404) throw e
		cache = { ...DEFAULT_BLOB }
	}
	cacheAt = Date.now()
	return JSON.parse(JSON.stringify(cache))
}

export async function saveUserData(blob) {
	const apiCode = requireApiCode()
	await ensureFolder()
	const encrypted = encryptJson(apiCode, blob)
	await axios.put(filesRoot() + BLOB_PATH, encrypted.buffer, {
		headers: { 'Content-Type': 'application/octet-stream' },
	})
	cache = JSON.parse(JSON.stringify(blob))
	cacheAt = Date.now()
}

// ---- Status van items: gedaan / bezig / gearchiveerd ----
//
// Ramin, 2026-09-13: "de status van een item moet ook op de server opgeslagen
// worden." Zelfde vorm als ItemStatus in de Android-app:
// { doneAt: millis|null, busySince: millis|null, archived: bool }.

export async function listItemStatus() {
	if (WEB) return account.listItemStatus()
	return (await loadUserData()).itemStatus || {}
}

export async function setItemStatus(eventId, status) {
	if (WEB) return account.setItemStatus(eventId, status)
	const blob = await loadUserData()
	blob.itemStatus = blob.itemStatus || {}
	const leeg = !status || (status.doneAt == null && status.busySince == null && !status.archived)
	if (leeg) delete blob.itemStatus[eventId]
	else blob.itemStatus[eventId] = status
	await saveUserData(blob)
}

// ---- Settings ----

/**
 * Je instellingen, uit allebei de bronnen (Ramin, 24-09 -- zie verdeling.js).
 *
 * In de Nextcloud-jas staat het persoonlijke hier in data.enc en staan je voorkeuren (menu-volgorde,
 * feeds, gelezen-stand) op onze server. Tot vandaag las dit scherm alleen data.enc, en dacht het dus dat
 * je geen menu-volgorde en geen gelezen berichten had.
 *
 * Is de server even niet bereikbaar, dan werk je gewoon door met wat er in data.enc staat.
 */
export async function getSettings() {
	if (WEB) return account.getSettings()
	const eigen = (await loadUserData()).settings
	if (!serverCache || Date.now() - serverCacheAt >= CACHE_MS) {
		serverCache = await account.getSettings().catch(() => null)
		serverCacheAt = Date.now()
	}
	return voegSamen(eigen, serverCache) || eigen
}

export async function setSettings(settings) {
	if (WEB) return account.setSettings(settings)
	const blob = await loadUserData()
	blob.settings = persoonlijkDeel(settings)
	await saveUserData(blob)
	// De voorkeuren naar de server, zodat je telefoon ze ook krijgt. Lukt dat niet, dan is je eigen
	// Nextcloud in elk geval bijgewerkt -- die helft is de belangrijkste.
	await account.setSettings(voorkeurDeel(settings)).catch(() => {})
	serverCache = null
	serverCacheAt = 0
}

// ---- Locations ----
// Ids are client-generated (crypto.randomUUID) — there's no auto-increment
// counter to hand out ids in a flat file the way MySQL did for pa_locations.

export async function listLocations() {
	if (WEB) return account.listLocations()
	return (await loadUserData()).locations
}

export async function createLocation(location) {
	if (WEB) return account.createLocation(location)
	const blob = await loadUserData()
	const saved = { id: randomId(), created_at: new Date().toISOString(), ...location }
	blob.locations.push(saved)
	await saveUserData(blob)
	return saved
}

// crypto.randomUUID() only exists in a secure context (HTTPS/localhost) —
// this app deliberately also runs over plain HTTP (feedback_cleartext_
// nextcloud memory: other users self-host Nextcloud on HTTP too), where
// it's simply undefined, not a graceful-degrade — caught live 2026-09-09
// on the http://10.10.13.10 test instance ("crypto.randomUUID is not a
// function"). Not a security-sensitive id (just a list key, never used as
// a credential), so Math.random is a fine fallback.
function randomId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID()
	}
	return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

export async function deleteLocation(id) {
	if (WEB) return account.deleteLocation(id)
	const blob = await loadUserData()
	blob.locations = blob.locations.filter((l) => l.id !== id)
	await saveUserData(blob)
}

// ---- Travel choices ----

export async function listTravelChoices() {
	if (WEB) return account.listTravelChoices()
	return (await loadUserData()).travelChoices
}

export async function setTravelChoice(eventId, fields) {
	if (WEB) return account.setTravelChoice(eventId, fields)
	const blob = await loadUserData()
	blob.travelChoices[eventId] = fields
	await saveUserData(blob)
}

// ---- Card-state (workflow-form outcomes) ----
// A plain key-value overwrite — simpler than the old pa_links "delete the
// old row, create a new one" dance (that only existed to work around
// pa_links never having had an UPDATE endpoint).

export async function loadCardState(eventId) {
	if (WEB) return account.loadCardState(eventId)
	return (await loadUserData()).cardStates[eventId] ?? null
}

export async function saveCardState(eventId, metadata) {
	if (WEB) return account.saveCardState(eventId, metadata)
	const blob = await loadUserData()
	blob.cardStates[eventId] = metadata
	await saveUserData(blob)
}

// ---- Boodschappen: dezelfde lijst als de telefoon (blob.groceries) ----
//
// Vorm per regel, gelijk aan GroceryItem op Android: { id, storeId, name,
// quantity, done, addedAtEpochMillis, boughtAtEpochMillis, productKey }.

function nieuwId() {
	return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2))
}

export async function listGroceries() {
	if (WEB) return account.listGroceries()
	return (await loadUserData()).groceries || []
}

export async function addGrocery(item) {
	if (WEB) return account.addGrocery(item)
	const blob = await loadUserData()
	blob.groceries = blob.groceries || []
	const saved = { id: nieuwId(), storeId: '', name: '', quantity: '', done: false, addedAtEpochMillis: Date.now(), boughtAtEpochMillis: null, productKey: '', ...item }
	blob.groceries.push(saved)
	await saveUserData(blob)
	return saved
}

export async function updateGrocery(item) {
	if (WEB) return account.updateGrocery(item)
	const blob = await loadUserData()
	blob.groceries = (blob.groceries || []).map((g) => (g.id === item.id ? { ...g, ...item } : g))
	await saveUserData(blob)
}

export async function removeGroceries(ids) {
	if (WEB) return account.removeGroceries(ids)
	const blob = await loadUserData()
	const weg = new Set(ids)
	blob.groceries = (blob.groceries || []).filter((g) => !weg.has(g.id))
	await saveUserData(blob)
}

/**
 * Van API-code gewisseld? Dan zet dit het bestand over op de nieuwe code
 * (2026-09-13). Zonder dit stond je met "invalid tag" voor een dichte deur:
 * de telefoon schrijft met de ene code, de browser leest met de andere, en
 * wie de verkeerde heeft ziet niets — en overschrijft bij de eerstvolgende
 * wijziging stilzwijgend het bestand van de ander.
 *
 * @returns {Promise<'none'|'already'|'rekeyed'>} none = geen bestand;
 *   already = de nieuwe code leest het al; rekeyed = overgezet.
 * @throws als de oude code het bestand ook niet leest.
 */
export async function rekeyUserData(oldCode, newCode) {
	if (WEB) return account.rekeyUserData(oldCode, newCode)
	let bytes
	try {
		const response = await axios.get(filesRoot() + BLOB_PATH, { responseType: 'arraybuffer' })
		bytes = new Uint8Array(response.data)
	} catch (e) {
		if (e.response?.status === 404) return 'none'
		throw e
	}
	try { decryptJson(newCode, bytes); return 'already' } catch (e) { /* dan met de oude */ }
	const blob = decryptJson(oldCode, bytes)
	const encrypted = encryptJson(newCode, blob)
	await axios.put(filesRoot() + BLOB_PATH, encrypted.buffer, { headers: { 'Content-Type': 'application/octet-stream' } })
	cache = { ...DEFAULT_BLOB, ...blob }
	cacheAt = Date.now()
	return 'rekeyed'
}
