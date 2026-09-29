/**
 * De vragen van de planner op een kaart: welke zin erbij hoort en welke knoppen eronder.
 *
 * Letterlijk overgezet uit `ui/today/RegelKaarten.kt` -- `vraagTekst` (regel 2789), `vraagZin` (2736) en
 * `VraagActies` (2419). Eén plek voor alle drie, zodat web en telefoon niet opnieuw uit elkaar lopen.
 */
import { t } from '../../l10n/index.js'

/** RegelKaarten.kt:2789 -- welke zin bij welke vraag. */
export function vraagTekst(vraag) {
	switch (vraag) {
	case 'needsAddress': return t('Where is this? Add an address.')
	case 'needsTravelDecision': return t('How do you travel there?')
	case 'needsAccommodation': return t('Where do you sleep?')
	case 'needsTransferDecision': return t('After landing: transfer, stay, or home?')
	case 'needsTransferFlight': return t('Which flight is next?')
	case 'locationOrApp': return t('Is this a place or an app?')
	case 'needsGift': return t('Does a gift need buying?')
	// Halen en brengen: blijf je, of rijd je door? (Ramin, 27-09.) Eén vraag, twee knoppen.
	case 'halenPatroon': return t('Do you wait there, or drive on?')
	default: return t('Question')
	}
}

/**
 * RegelKaarten.kt:2736 -- de zin zoals hij op de kaart staat.
 *
 * Waar de vraag over gaat komt erachter (kaart 225). Ramin, 23-09 over een reisvraag op een lege dag:
 * *"kan de gebruiker niet zien waar de vraag over gaat"*.
 */
export function vraagZin(v) {
	const i = v.inhoud || {}
	if (i.vraag === 'needsGift' && i.persoon) return t('Does %s need a gift?', i.persoon)
	const zin = vraagTekst(i.vraag)
	return i.titel ? zin + ' — ' + i.titel : zin
}

/**
 * RegelKaarten.kt:2419 -- welke knoppen bij deze vraag horen.
 *
 * Geeft null als er niets te kiezen valt; dan komt er ook geen lege knoppenrij te staan.
 * `cadeau` en `locOfApp` staan hier nog niet: die hebben een eigen scherm op de telefoon.
 */
export function vraagActies(v) {
	const i = v.inhoud || {}
	const vraag = i.vraag
	const bron = v.bron
	const heeftPlek = i.lat != null && !isNaN(Number(i.lat))
	const hotel = ['needsAccommodation', 'needsTransferDecision'].includes(vraag) && heeftPlek
	const adres = vraag === 'needsAddress' && bron != null
	const vervoer = vraag === 'needsTravelDecision' && bron != null
	// Halen/brengen: de plek waar het antwoord voor geldt, en wat we nu aannemen.
	const halen = vraag === 'halenPatroon' && !!i.plek
	// Moet er een cadeau komen? Vier antwoorden, zoals op de telefoon (RegelKaarten.kt:2451).
	const cadeau = vraag === 'needsGift' && !!i.persoon
	if (!hotel && !adres && !vervoer && !halen && !cadeau) return null
	return {
		hotel, adres, vervoer, halen, cadeau, bron,
		plek: i.plek || null,
		aanname: i.aanname || null,
		persoon: i.persoon || null,
		jaar: i.jaar != null ? Number(i.jaar) : null,
		eerdereTips: i.eerdereTips || null,
		afstandKm: i.distanceKm != null ? Number(i.distanceKm) : null,
	}
}
