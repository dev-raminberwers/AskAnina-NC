import { t, currentLocale } from '../../l10n/index.js'
import { namenVoor } from '../../api/naamKoppeling.js'

/**
 * Hoe een regel heet, en welk icoon en woord erbij horen.
 *
 * Ramin, 24-09: *"De server geeft je de waarden, op de devices wordt 'alleen' getekend."* Dit bestand is
 * dat tekenen: het bedenkt niets, het kiest alleen een woord en een tekentje bij wat er binnenkomt. Eén
 * plek, omdat dezelfde regel op twee manieren in beeld komt -- als eigen kaart, en als stap binnen een
 * blok (zie BlokKaart) -- en die twee moeten hetzelfde zeggen.
 */

export const ICONEN = {
	thuis: '🏠', werk: '🏢', afspraak: '📅', rit: '🚗', inchecken: '🛄', vlucht: '✈️', overstap: '🔁',
	bagage: '🧳', verblijf: '🏨', gat: '⏳', tankstop: '⛽', parkeren: '🅿️', melding: 'ℹ️', vraag: '❓',
}

export const VERVOER = { auto: '🚗', trein: '🚆', vlucht: '✈️', fiets: '🚲', lopen: '🚶', taxi: '🚕' }

/**
 * Een afspraak is niet altijd een afspraak (Ramin, 24-09: *"study spanish moet een study card zijn en
 * geen afspraak"*). De server zet er een soort bij -- studie, sport, eten, een herinnering, een aflevering
 * -- en die soort bepaalt wat je ziet: een eigen icoon, een eigen woord op het chipje, en géén donker
 * afsprakenvlak. Dat vlak is voor de echte afspraken, anders zegt het niets meer.
 */
// Deze afspraak stond in meer dan een agenda en is samengevoegd (Ramin 26-09, Lib\Pa\Dubbel). Zichtbaar,
// want anders lijkt het alsof er een kaart verdwenen is.
export function ookInTekst(regel) {
	const lijst = regel?.inhoud?.ookIn
	if (!Array.isArray(lijst) || lijst.length === 0) return ''
	return t('Also in {agendas}', { agendas: lijst.join(', ') })
}

export const KAARTSOORTEN = {
	studie: { icoon: '📚', label: () => t('Study') },
	sport: { icoon: '🏃', label: () => t('Sport') },
	lunch: { icoon: '🍽️', label: () => t('Lunch') },
	dinner: { icoon: '🍽️', label: () => t('Dinner') },
	herinnering: { icoon: '🔔', label: () => t('Reminder') },
	entertainment: { icoon: '🎬', label: () => t('Episode') },
	gesprek: { icoon: '📞', label: () => t('Call') },
	bellen: { icoon: '📞', label: () => t('Call') },
	festiviteit: { icoon: '🎉', label: () => t('Celebration') },
	verjaardag: { icoon: '🎂', label: () => t('Birthday') },
	podcastverwacht: { icoon: '🎙️', label: () => t('Expected') },
	// Je eigen meting of je medicijnen (26-09).
	gezondheid: { icoon: '🩺', label: () => t('Health') },
	// Een bezoek aan een zorgverlener: daar wacht iemand op je (26-09).
	arts: { icoon: '👩‍⚕️', label: () => t('Doctor') },
	// Thuis, en niemand wacht op je: geen reis en geen "laat weten" (kaart 238).
	klus: { icoon: '🧹', label: () => t('Chore') },
	administratie: { icoon: '🧾', label: () => t('Paperwork') },
	// Heen en meteen terug: hier blijf je niet (kaart 237).
	halen: { icoon: '🚘', label: () => t('Pick-up') },
	brengen: { icoon: '🚗', label: () => t('Drop-off') },
}

export function naamVan(plek) {
	if (!plek) return ''
	return plek.locatie || plek.stad || plek.regio || plek.land || ''
}

export function kaartSoortVan(r) {
	return KAARTSOORTEN[((r || {}).inhoud || {}).cardType] || null
}

export function icoonVan(r) {
	if (r.soort === 'rit' && r.vervoer) return VERVOER[r.vervoer.soort] || ICONEN.rit
	const k = kaartSoortVan(r)
	if (k) return k.icoon
	return ICONEN[r.soort] || '•'
}

export function soortLabelVan(r) {
	const k = kaartSoortVan(r)
	if (k) return k.label()
	return ({
		thuis: t('Home'), werk: t('Work'), afspraak: t('Appointment'), rit: t('Ride'), inchecken: t('Check-in'),
		vlucht: t('Flight'), overstap: t('Transfer'), bagage: t('Baggage claim'), verblijf: t('Stay'),
		gat: t('Gap'), tankstop: t('Fuel stop'), parkeren: t('Parking'), melding: t('Notice'), vraag: t('Question'),
	})[r.soort] || r.soort
}

export function vraagTekst(v) {
	return ({
		needsAddress: t('Where is this? Add an address.'),
		needsTravelDecision: t('How do you travel there?'),
		needsAccommodation: t('Where do you sleep?'),
		needsTransferDecision: t('After landing: transfer, stay, or home?'),
		needsTransferFlight: t('Which flight is next?'),
	})[v] || t('Question')
}

export function titelVan(r) {
	const i = r.inhoud || {}
	if (i.titel) return i.titel
	if (r.soort === 'rit') return (i.fromLabel || naamVan(r.van)) + ' → ' + (i.toLabel || naamVan(r.naar))
	if (r.soort === 'gat') return t('%s minutes free', String(i.minutes ?? i.rawMinutes ?? '?'))
	// Waar de vraag over gaat erbij (kaart 225): een kale "Hoe reis je daarheen?" op een dag waar
	// verder niets staat, is niet te beantwoorden.
	if (r.soort === 'vraag') return vraagTekst(i.vraag) + (i.titel ? ' — ' + i.titel : '')
	if (r.soort === 'melding') return i.tekst || i.melding || t('Notice')
	if (r.soort === 'tankstop') return t('Refuel before the ride to %s', i.toLabel || naamVan(r.naar) || '')
	return i.label || i.airportName || naamVan(r.naar) || soortLabelVan(r)
}

/**
 * Een bedrag met het teken van je eigen munt ervoor, zoals de telefoon het schrijft. Zonder bekende munt
 * alleen het getal -- een bedrag zonder teken is nog steeds een bedrag, een verkeerd teken is een leugen.
 */
function metValuta(bedrag, decimalen) {
	// In de schrijfwijze van de taal: NL schrijft 2,245 en niet 2.245. toFixed() geeft altijd een punt.
	const getal = Number(bedrag).toLocaleString(currentLocale(), {
		minimumFractionDigits: decimalen, maximumFractionDigits: decimalen,
	})
	try {
		const teken = (0).toLocaleString(currentLocale(), { style: 'currency', currency: valutaVanLocale(), minimumFractionDigits: 0 })
			.replace(/[\d\s.,]/g, '')
		return teken ? teken + ' ' + getal : getal
	} catch (e) {
		return getal
	}
}

/** De munt die bij de taal van dit scherm hoort; onbekend = geen teken. */
function valutaVanLocale() {
	const land = (currentLocale().split('-')[1] || '').toUpperCase()
	return { NL: 'EUR', BE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', PT: 'EUR', GB: 'GBP', US: 'USD' }[land] || 'EUR'
}

/** De brandstofprijs: drie decimalen, want zo staat hij op het bord. */
function prijsPerLiter(prijs) {
	return metValuta(prijs, 3) + '/l'
}

/**
 * De naam van een regel als STAP in een blok. Korter dan de titel van een losse kaart: de bestemming staat
 * al in de rit erboven, dus die hoeft er niet nog eens bij. Zoals `BlokRegel` op Android het doet.
 */
export function stapTitelVan(r) {
	const i = r.inhoud || {}
	if (i.titel) return i.titel
	if (r.soort === 'rit') return (i.fromLabel || naamVan(r.van)) + ' → ' + (i.toLabel || naamVan(r.naar))
	if (r.soort === 'gat') return t('%s minutes free', String(i.minutes ?? i.rawMinutes ?? '?'))
	if (r.soort === 'melding') return i.tekst || i.melding || t('Notice')
	return i.label || i.airportName || soortLabelVan(r)
}

/** De regel eronder: hoe lang, hoe ver, of waar. Kort, want het staat als stap in een kaart. */
export function subVan(r) {
	const i = r.inhoud || {}
	const delen = []
	if (r.soort === 'rit' || r.soort === 'vlucht' || r.soort === 'overstap') {
		const v = r.vervoer || {}
		if (v.km) delen.push(v.km + ' km')
		if (v.duurMin) delen.push(duurVan(v.duurMin))
		if (i.flightNumber) delen.push(i.flightNumber)
	} else if (r.soort !== 'tankstop' && r.soort !== 'parkeren') {
		const plek = naamVan(r.naar || r.van)
		if (plek && plek !== titelVan(r)) delen.push(plek)
	}
	// Bij een stop onderweg NIET: daar is `van` je vertrekpunt, dus er stond "Thuis" bij een pomp in Wehl.
	// Het adres van de pomp zelf staat al in extraVan(), zoals op de telefoon.
	// Waar je incheckt hoort bij de incheck-stap in de vluchtkaart (Ramin, 24-09). Komt het uit onze eigen
	// naslag en niet van de bron, dan staat dat erbij -- balies verhuizen soms.
	if (i.checkInDesk) {
		delen.push(i.checkInUitNaslag
			? t('Desks %s (last time)', String(i.checkInDesk))
			: t('Desks %s', String(i.checkInDesk)))
	}
	if (i.checkInTerminal) delen.push(t('Terminal %s', String(i.checkInTerminal)))
	if (i.baggage) delen.push(t('Belt %s', String(i.baggage)))
	if (i.delayMinutes) delen.push(t('Delay %s', duurVan(i.delayMinutes)))
	// Waar de tijden vandaan komen (RegelKaarten.kt: `vluchtHerkomst`). Uit de dienstregeling is iets
	// anders dan gecontroleerd, en dat hoort de lezer te weten.
	if (i.flightWarning === 'dienstregeling') delen.push(t('From the timetable, not checked today'))
	else if (i.flightWarning === 'geen_live_gegevens') delen.push(t('Estimated, no live flight data'))
	if (i.arrivalEstimated) delen.push(i.durationMinutes ? t('Arrival estimated, %s min flight', String(i.durationMinutes)) : t('Arrival estimated'))
	return delen.join(' · ')
}

/** De klok van een regel, in de tijdzone van die regel (een vlucht landt in een andere). */
export function klokVan(r, sec) {
	if (sec == null) return '?'
	const opties = { hour: '2-digit', minute: '2-digit' }
	if (r && r.zone) opties.timeZone = r.zone
	try {
		return new Date(sec * 1000).toLocaleTimeString(currentLocale(), opties)
	} catch (e) {
		return new Date(sec * 1000).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' })
	}
}

/**
 * De thuis-regel van middernacht zegt niets (Ramin, 22-09: *"de 00:00 Home card kan weg"*, en 24-09
 * opnieuw: *"De Thuis card aan het begin mag weg"*). Die van het eind van de dag -- weer thuis -- blijft.
 */
export function isDagBeginThuis(r) {
	if (r.soort !== 'thuis' || r.begin == null) return false
	if (r.eind != null && r.eind - r.begin >= 24 * 3600) return false
	try {
		const klok = new Date(r.begin * 1000).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: r.zone || undefined })
		return klok === '00:00'
	} catch (e) {
		return false
	}
}

/**
 * De ENIGE manier waarop een duur op het scherm komt: "2h15min", nooit "125 min".
 *
 * Ramin, 29-09: "Nergens xxxmin, altijd xhxxmin." Hij zag het op de telefoon, maar het stond hier net zo:
 * deze helper zei "2 u 15" en de feitenregels eronder zetten het getal er rauw neer. De app en het web
 * tekenen dezelfde kaart, dus ze moeten ook dezelfde duur laten zien.
 *
 * Onder het uur blijft het "45min" en wordt het geen "0h45min": dat uur zegt niets.
 *
 * Geen vertaalsleutel meer: "h" en "min" zijn in alle zeven talen hetzelfde, en een sleutel per taal kan
 * hier alleen maar nieuwe vormen introduceren.
 */
export function duurVan(minuten) {
	const m = Number(minuten) || 0
	if (m < 60) return m + 'min'
	return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0') + 'min'
}

/** "2026-09-29T11:35:00+02:00" wordt "11:35"; lukt dat niet, dan de tekst zelf. */
export function klokUitIso(iso) {
	try {
		return new Date(iso).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' })
	} catch (e) {
		return String(iso)
	}
}

/** Wat er met je koffer gebeurt bij een overstap. */
export function kofferVan(ruw) {
	return ({
		through: t('Checked through'),
		recheck: t('Collect it and check in again'),
		customs: t('Customs with your suitcase'),
		ask: t('Ask the airline at the desk'),
	})[ruw] || null
}

/**
 * De stand van een vlucht in gewone taal.
 *
 * Er stond "Status estimated" op de kaart (24-09): dat is onze eigen vierde trap -- geen vluchtgegevens
 * maar een gemiddelde uit onze naslag (zie Vluchtbron). Die verdient een zin die zegt wat het is. De
 * overige woorden komen van AeroDataBox; wat we niet kennen laten we staan, dan is het tenminste
 * navraagbaar in plaats van verzonnen.
 */
export function vluchtStatusVan(ruw) {
	const s = String(ruw || '').toLowerCase()
	return ({
		scheduled: t('On time'),
		expected: t('On time'),
		estimated: t('Estimate, no live data'),
		checkin: t('Check-in open'),
		boarding: t('Boarding'),
		gateclosed: t('Gate closed'),
		departed: t('Departed'),
		'en-route': t('In the air'),
		enroute: t('In the air'),
		active: t('In the air'),
		delayed: t('Delayed'),
		approaching: t('Almost there'),
		arrived: t('Landed'),
		landed: t('Landed'),
		diverted: t('Diverted'),
		cancelled: t('Cancelled'),
		canceled: t('Cancelled'),
		canceleduncertain: t('Probably cancelled'),
		unknown: t('Unknown'),
	})[s] || String(ruw)
}

/**
 * Een melding in gewone taal. Zonder dit staat er een kale sleutel op de kaart -- op de telefoon stond
 * daar drie keer "Notice" onder elkaar (P5, 23-09) tot elke soort zijn eigen zin kreeg.
 */
export function meldingVan(r) {
	const i = r.inhoud || {}
	const min = Number(i.minutes) || 0
	switch (i.melding) {
	case 'voertuigElders':
		// Meer dan drie uur lopen is geen afstand meer maar een mededeling.
		return min > 180
			? t('Your car is at %s: too far to walk', String(i.fromLabel || ''))
			: t('Your car is at %1$s: %2$s on foot', String(i.fromLabel || ''), duurVan(min))
	case 'adresNietGevonden':
		return t('Address not found: %s', String(i.tekst || ''))
	case 'routeOnbekend':
		return t('No route to %s', String(i.toLabel || ''))
	case 'documentVerloopt':
		return t('%1$s expires in %2$s days', String(i.tekst || ''), String(i.daysLeft != null ? i.daysLeft : 0))
	default:
		return i.tekst || null
	}
}

/**
 * Waarom staat dit hier? De server geeft de reden als sleutel, wij maken er een zin van.
 *
 * @param {object} r de regel
 * @param {?string} aankomstTijd wanneer je er moet zijn, voor "zodat je om 09:00 bij Bart bent"
 */
export function waaromVan(r, aankomstTijd = null) {
	const i = r.inhoud || {}
	const naar = i.toLabel || naamVan(r.naar) || ''
	switch (i.waarom) {
	case 'ritNaar': return t('So you are at %1$s by %2$s', naar, String(aankomstTijd || ''))
	case 'ritTerug': return t('Back to %s after your last appointment', naar)
	case 'ritVerblijf': return t('To where you are staying')
	case 'inchecken': return t('At the airport %s min before departure', String(i.leadMinutes != null ? i.leadMinutes : 0))
	case 'overstapWachten': return t('Waiting for your connecting flight')
	case 'bagage': return t('Baggage and getting out: %s', duurVan(i.minutes != null ? i.minutes : 0))
	case 'tankstop': return t('Your range drops below what this drive needs')
	case 'gatLoont': return t('Going home in between is worth it')
	case 'gatBlijven': return t('Too little time to go home in between')
	default: return null
	}
}

/** De tijdzone van dit apparaat; om te bepalen of een zone het noemen waard is. */
function eigenZone() {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
	} catch (e) {
		return ''
	}
}

/**
 * De feiten onder de grote tijd: afstand, duur, buffers, gates, koffer, tankstop, tijdzone.
 *
 * Ramin, 24-09: *"Bekijk de kaarten van Android en maak ze zo ook voor webapp."* Dit is de lijst die de
 * telefoon toont (feitenVan in RegelKaarten.kt), veld voor veld. Het web perste dit in een regel achter
 * elkaar, waardoor bij een overstap de gate, de koffer en de overstaptijd niet in beeld kwamen.
 *
 * Een vlucht toont alleen wat NU telt (Ramin, 22-09: *"de band in Bangkok is te vroeg als je nog thuis
 * bent"*): voor vertrek de terminal en straks de gate, in de lucht de aankomstkant, na de landing de band.
 *
 * @returns {Array<{l: string, v: string}>} label/waarde-paren
 */
export function feitenVan(r, nu = Math.floor(Date.now() / 1000)) {
	const i = r.inhoud || {}
	const uit = []
	const zet = (l, v) => { if (v !== null && v !== undefined && v !== '') uit.push({ l, v }) }
	const v = r.vervoer || {}
	if (v.km) zet(t('Distance'), Math.round(v.km) + ' km')
	if (v.duurMin) zet(t('Travel time'), duurVan(v.duurMin))
	if (r.soort === 'rit' && r.eind != null) zet(t('Arrival'), klokVan(r, r.eind))
	if (r.soort === 'vlucht' && (v.verwijzing || i.flightNumber)) zet(t('Flight'), v.verwijzing || i.flightNumber)
	if (i.departureBufferMinutes) zet(t('Get ready'), duurVan(i.departureBufferMinutes))
	if (i.arrivalBufferMinutes) zet(t('Arrive early'), duurVan(i.arrivalBufferMinutes))
	if (i.baggage) zet(t('Belt'), String(i.baggage))
	// Waar je incheckt (Ramin, 24-09). Komt het uit onze eigen naslag en niet van de bron, dan staat dat
	// erbij -- balies verhuizen soms.
	if (i.checkInDesk) zet(t('Desks'), i.checkInUitNaslag ? t('%s (last time)', String(i.checkInDesk)) : String(i.checkInDesk))
	if (i.checkInTerminal) zet(t('Terminal'), String(i.checkInTerminal))
	// Overstap (Ramin, 22-09): bij welke gate je aankomt en naar welke je moet.
	if (r.soort === 'overstap') {
		if (i.aankomstGate) zet(t('Arrival gate'), String(i.aankomstGate))
		if (i.volgendeTerminal) zet(t('Terminal'), String(i.volgendeTerminal))
		if (i.volgendeGate) zet(t('Gate'), String(i.volgendeGate))
		if (i.overstapMinuten) zet(t('Transfer time'), duurVan(i.overstapMinuten))
		const koffer = kofferVan(i.koffer)
		if (koffer) zet(t('Suitcase'), i.paspoort ? koffer + ' · ' + t('Passport control in between') : koffer)
		// Krap staat niet tussen de feiten maar als waarschuwing onder de kaart (Ramin, 23-09).
		if (!i.krap && i.minimaal) zet(t('Needed'), duurVan(i.minimaal))
	}
	// Ook op de bagageband-regel: haal je hem op omdat het los geboekt is, of vanwege de douane?
	if (r.soort === 'bagage') {
		const koffer = kofferVan(i.koffer)
		if (koffer) zet(t('Suitcase'), koffer)
	}
	if (r.soort === 'vlucht' && r.begin != null) {
		const voorVertrek = nu < r.begin
		const bijnaWeg = voorVertrek && r.begin - nu <= 4 * 3600
		const inDeLucht = !voorVertrek && (r.eind == null || nu < r.eind)
		const geland = r.eind != null && nu >= r.eind
		if (i.flightStatus) zet(t('Status'), vluchtStatusVan(i.flightStatus))
		if (voorVertrek) {
			if (i.depTerminal) zet(t('Terminal'), String(i.depTerminal))
			if (bijnaWeg && i.depGate) zet(t('Gate'), String(i.depGate))
			if (i.depEstimated && i.delayMinutes != null) zet(t('Now expected'), klokUitIso(i.depEstimated))
		}
		if (inDeLucht || geland) {
			if (i.arrTerminal) zet(t('Arrival terminal'), String(i.arrTerminal))
			if (i.arrGate) zet(t('Arrival gate'), String(i.arrGate))
			if (i.arrDelayMinutes) zet(t('Delay'), duurVan(i.arrDelayMinutes))
		}
		if (geland && i.arrBaggage) zet(t('Belt'), String(i.arrBaggage))
		// Weet de dienstregeling de aankomst niet, dan komt die uit onze eigen naslag van vliegduren. Dat
		// zeggen we erbij: een schatting mag er niet uitzien als een zekere tijd (kaart 214, 24-09).
		if (i.arrivalEstimated) {
			zet(t('Arrival'), i.durationMinutes ? t('estimated, %s', duurVan(i.durationMinutes)) : t('estimated'))
		}
	}
	if (r.soort === 'tankstop') {
		if (i.kmLeft) zet(t('Range'), i.kmLeft + ' km')
		if (i.ritKm) zet(t('Distance'), i.ritKm + ' km')
		const liters = Number(i.litresNeeded)
		if (liters) zet(t('To fill'), Math.round(liters) + ' L')
	}
	// Over de tijdzone heen: beide kanten noemen, anders weet je niet waar "tot 12:24" bij hoort.
	const zVan = (r.van || {}).zone || r.zone
	const zNaar = (r.naar || {}).zone || r.zone
	if (zVan && zNaar && zVan !== zNaar) {
		zet(t('Time zone'), zVan + ' → ' + zNaar)
	} else if (r.zone && r.zone !== eigenZone()) {
		zet(t('Time zone'), r.zone)
	}
	return uit
}

/**
 * Wat er in een blok-stap achter [subVan] nog bij hoort: wanneer je verder rijdt na een tankstop, tot
 * hoe laat de afspraak zelf duurt, en wat er werkelijk gebeurde als dat afwijkt van de planning
 * (kaart 220). Band en reistijd zitten al in [subVan] en komen hier niet nog eens.
 *
 * @param {object} r de regel
 * @param {boolean} nadruk de afspraak zelf in een blok: die mag zijn eindtijd erbij hebben
 * @param {?object} echt wat er werkelijk gebeurde, of null
 */
export function extraVan(r, nadruk = false, echt = null) {
	const i = r.inhoud || {}
	const delen = []
	// Een tankstop kost een kwartier: zeg erbij wanneer je verder rijdt (Ramin, 23-09).
	if (r.soort === 'tankstop' && i.verderOm) delen.push(t('on again at %s', klokUitIso(i.verderOm)))
	// WELKE pomp het is, met de prijs en wat hij je scheelt -- zelfde volgorde als op de telefoon
	// (Ramin, 25-09). Staat er niets, dan is de pomp nog niet gekozen; de planner wacht daar niet op.
	if (r.soort === 'tankstop') {
		if (i.stationAdres) delen.push(i.stationAdres)
		if (i.stationPlaats) delen.push(i.stationPlaats)
		if (i.stationGeenPrijs) delen.push(t('no price known here'))
		else if (i.stationPrijs != null) delen.push(prijsPerLiter(i.stationPrijs))
		if (i.stationBespaard != null) delen.push(t('Saves %s', metValuta(i.stationBespaard, 2)))
		if (i.stationOmwegMin != null) delen.push(t('%s min detour', String(i.stationOmwegMin)))
	}
	if (nadruk && r.eind != null && r.eind !== r.begin) delen.push(t('until %s', klokVan(r, r.eind)))
	// Gepland tegenover werkelijk: alleen tonen als het echt afwijkt, anders is het ruis.
	if (echt && echt.begin) {
		const werkelijk = klokUitIso(echt.begin)
		if (werkelijk !== klokVan(r, r.begin)) delen.push(t('actually %s', werkelijk))
	}
	return delen.join(' · ')
}

/**
 * Hoe het echt ging: wanneer je vertrok, aankwam, weer wegging en terug was.
 *
 * De telefoon meet die momenten (kaart 220) en de server bewaart ze per regel. Heen- en terugrit hebben
 * allebei dezelfde afspraak als bron, dus het enige verschil is de tijd: de vroegste is de heenreis, een
 * rit die pas begint als de afspraak al loopt is de terugreis -- ook als het de enige is.
 *
 * @param {object} werkelijk alles wat gemeten is, op regel-id
 * @param {object} r de afspraak
 * @returns {?Array<{l: string, v: string}>} de momenten, of null als er niets gemeten is
 */
export function echteMomentenVan(werkelijk, r) {
	if (r.soort !== 'afspraak' || r.niveau !== 0) return null
	// Alle namen waaronder deze afspraak bekend kan zijn: de telefoon meet onder zijn eigen naam.
	const namen = namenVoor(r.bron || r.id)
	const mijne = Object.values(werkelijk || {}).filter((w) => namen.includes(w.bronId))
	if (!mijne.length) return null
	const sec = (iso) => { const d = Date.parse(iso || ''); return isNaN(d) ? null : d / 1000 }
	// Een rit met alleen een EIND, gemeld door de aankomstcontrole, is nooit gereden: die controle vinkte
	// de rit af zodra ze je op de plek zag -- ook bij een afspraak thuis, waar geen rit was.
	const nooitGereden = (w) => !w.begin && w.door === 'aankomst'
	const ritten = mijne.filter((w) => w.soort === 'rit' && !nooitGereden(w))
		.sort((a, b) => (sec(a.begin || a.eind) || 0) - (sec(b.begin || b.eind) || 0))
	const naAfspraak = (w) => r.begin != null && (sec(w.begin || w.eind) || 0) > r.begin
	const heen = ritten.find((w) => !naAfspraak(w)) || null
	const terugRit = [...ritten].reverse().find((w) => w !== heen && naAfspraak(w)) || null
	// De afspraak zelf: het begin komt van een knop, het eind van Klaar. Die twee hebben hun EIGEN regel,
	// net als op de telefoon -- eerder liftte het eind mee op "Left again" en stond dezelfde tijd onder
	// twee namen.
	const eigen = mijne.find((w) => w.soort === 'afspraak') || null
	const uit = []
	const zet = (label, iso) => { if (iso) uit.push({ l: label, v: klokUitIso(iso) }) }
	zet(t('Left'), heen && heen.begin)
	zet(t('Arrived'), heen && heen.eind)
	// Op tijd ertussen: je begint na aankomst en houdt op voordat je weer weggaat.
	// Een begin dat van de aankomstcontrole komt is geen begin: die zag je op de plek, meer niet.
	zet(t('Started'), eigen && eigen.door !== 'aankomst' && eigen.begin)
	zet(t('Finished'), eigen && eigen.eind)
	zet(t('Left again'), terugRit && terugRit.begin)
	zet(t('Back'), terugRit && terugRit.eind)
	return uit.length ? uit : null
}

/** Is deze afspraak echt afgerond? Alleen dan hoort "hoe het echt ging" er te staan (Ramin, 27-09). */
export function echtAfgerond(werkelijk, r) {
	const namen = namenVoor(r.bron || r.id)
	const eigen = Object.values(werkelijk || {}).find((w) => w.soort === 'afspraak' && namen.includes(w.bronId))
	return !!(eigen && eigen.eind)
}
