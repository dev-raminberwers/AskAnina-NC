/**
 * Waar de lijsten vandaan komen.
 *
 * Ramin, 27-09: *"De nextCloud app mag alleen data halen uit nextcloud."* Dus staat de bron hier apart
 * van de regels (`netwerkBouw.js`) en van de tekening. Dezelfde splitsing die deze codebase al overal
 * maakt: `if (WEB)` haalt het bij ons, anders bij jou.
 *
 * ## Waar het in Nextcloud staat
 *
 * ```
 * contacten (CardDAV)          de mensen, met hun nummers -- rechtstreeks uit je adresboek
 * eigen tabellen van deze app  gesprekken, mensen zonder adresboek-kaart, relaties, koppelingen
 * ```
 *
 * Die tabellen staan in de database van hun eigen Nextcloud (migratie `Version000900`), niet bij ons.
 * Ramin, 27-09: *"Is er geen mogelijkheid dat wij om een tabel zelf opbouwen binnen Next Cloud, want dan
 * zouden wij daar de koppelingen zelf kunnen plaatsen."* Dat kan, en het was goedkoper dan ik dacht --
 * deze app is een echte Nextcloud-app met eigen `lib/Db` en migraties, geen losse voorkant.
 *
 * ## De gesprekken
 *
 * *"Als er een nextcloud verbinding is dan worden de calls naar die nextcloud gestuurd."* De telefoon
 * stuurt ze naar `/api/network/calls` van deze app. Tot die app-versie op zijn toestel staat, is die
 * tabel leeg en tekent het netwerk alleen wat er verder is -- dat is stil, maar niet fout.
 */
import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import * as paApi from './paApi.js'
import { getAccessCode } from './accessCode.js'
import { discoverAddressBooks, listContacts } from './shortcutSources.js'

// Web of Nextcloud, op dezelfde manier als paApi.js het doet: aan de aanwezigheid van Nextcloud zelf.
// Stond hier eerst als process.env.PA_WEB -- en `process` bestaat niet in een browser, dus de hele bundel
// viel om bij het laden (Ramin, 27-09: "Uncaught ReferenceError: process is not defined").
const WEB = typeof window === 'undefined' || window.OCA === undefined

function url(pad) {
	return generateUrl('/apps/personalassistant/api/network' + pad)
}

/**
 * De lijsten waar `bouwNetwerk()` mee werkt.
 *
 * Bij ons staat de grafiek al klaar; dan rekenen we hem hier niet nog eens uit. Bij Nextcloud halen we
 * de onderdelen op en rekent de browser -- want de gegevens staan daar, en het rekenwerk hoort naar de
 * gegevens toe en niet andersom.
 */
export async function haalLijsten() {
	if (WEB) {
		return { alKlaar: await paApi.netwerk(getAccessCode()) }
	}

	const eigen = (await axios.get(url(''))).data

	// Het adresboek haalt de voorkant zelf op: daar is hij al mee verbonden, en het via onze eigen
	// controller doorgeven zou dezelfde gegevens twee keer over de lijn sturen.
	const uitAdresboek = []
	try {
		for (const boek of await discoverAddressBooks()) {
			for (const c of await listContacts(boek)) {
				uitAdresboek.push({
					id: 'contact:' + (boek.href || '') + '/' + (c.uid || c.href),
					naam: c.fullName,
					telefoon: (c.phones || [])[0] || null,
					email: (c.emails || [])[0] || null,
					bron: 'adresboek',
					zeker: 'bevestigd',
				})
			}
		}
	} catch (e) {
		// Geen adresboek beschikbaar: dan is het netwerk wat de app zelf weet. Geen reden om niets te tonen.
	}

	return {
		ik: eigen.ik,
		mensen: (eigen.mensen || []).concat(uitAdresboek),
		relaties: eigen.relaties || [],
		gesprekken: eigen.gesprekken || [],
		koppelingen: eigen.koppelingen || [],
		dingen: [],
		geenGesprekken: (eigen.gesprekken || []).length === 0,
	}
}

/** Iemand die niet in je adresboek staat: de broer van Delroy, een nummer zonder naam. */
export async function voegPersoonToe({ naam, aanduiding, telefoon }) {
	if (WEB) return paApi.netwerkActie(getAccessCode(), { actie: 'persoon', naam, aanduiding, telefoon })
	return (await axios.post(url('/person'), { naam, aanduiding, telefoon })).data
}

/** De betekenis: klant, buurman, zwager. Het enige wat een machine niet voor je kan invullen. */
export async function legRelatie({ van, naar, soort, context, vanDatum, totDatum, zeker }) {
	if (WEB) return paApi.netwerkActie(getAccessCode(), { actie: 'verbind', van, naar, soort, context, vanDatum, totDatum, zeker })
	return (await axios.post(url('/relation'), { van, naar, soort, context, vanDatum, totDatum, zeker })).data
}

/**
 * "Klopt niet."
 *
 * Geen prullenbak maar geheugen: de lijn blijft staan als afgewezen, zodat iets wat hem eerder voorstelde
 * hem niet volgende maand opnieuw voorstelt.
 */
export async function wijsAf(relatieId) {
	if (WEB) return paApi.netwerkActie(getAccessCode(), { actie: 'afwijzen', relatie: relatieId })
	return (await axios.post(url('/relation/' + encodeURIComponent(relatieId) + '/reject'), {})).data
}

/** Dit gesprek was met die mens. Jouw besluit wint van wat wij uit het nummer zouden afleiden. */
export async function koppelGesprek(gesprekId, persoonRef) {
	if (WEB) return paApi.netwerkActie(getAccessCode(), { actie: 'koppel', vanSoort: 'gesprek', vanId: gesprekId, naarSoort: 'persoon', naarId: String(persoonRef || '').replace('person:', '') })
	return (await axios.post(url('/call/link'), { gesprek: gesprekId, persoon: persoonRef || '' })).data
}
