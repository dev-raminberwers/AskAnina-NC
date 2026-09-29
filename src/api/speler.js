import { reactive } from 'vue'

/**
 * De podcastspeler van de hele webapp, op één plek.
 *
 * Hiervoor zat het `<audio>`-element in het podcastscherm zelf. Ging je naar een ander scherm, dan
 * werd dat scherm afgebroken -- en het geluid ermee (Ramin, 25-09: *"als ik een podcast luister en naar
 * een andere pagina ga, stopt de podcast player"*).
 *
 * Nu leeft de speler naast de schermen: het element hangt in [App.vue] en blijft daar staan, wat je
 * ook aanklikt. De schermen zetten hier alleen wat er speelt; wat er met het geluid gebeurt, gebeurt
 * hier.
 *
 * De positie in een aflevering blijft in de browser staan (localStorage): dat hoort bij dit apparaat en
 * deze browser, niet bij je account -- op je telefoon luister je op een ander moment verder.
 */

// Let op de dubbele punt: dit is de sleutel die de oude speler al gebruikte. Met een ander
// teken zou elke bewaarde luisterpositie in een klap onvindbaar zijn.
const POS = 'pa-pod-pos:'
const SNELHEID = 'pa-pod-snelheid'

/** Wat er speelt. Schermen lezen dit om te laten zien welke aflevering aan de beurt is. */
export const staat = reactive({
	/** De aflevering die in de speler staat, of null. */
	huidig: null,
	/** Het plaatje erbij (van de aflevering, anders van de podcast). */
	art: '',
	/** Loopt het geluid op dit moment? */
	speelt: false,
	/** Als tekst, want de keuzelijst werkt met tekst. */
	snelheid: leesSnelheid(),
})

/** Het ene `<audio>`-element van de app. Wordt gezet door de balk die het tekent. */
let element = null
let laatstBewaard = 0

function leesSnelheid() {
	try {
		return localStorage.getItem(SNELHEID) || '1'
	} catch (e) {
		return '1'
	}
}

/** De bewaarde positie van deze aflevering, in seconden. */
export function positieVan(ep) {
	try {
		return Number(localStorage.getItem(POS + (ep && ep.audio && ep.audio.url)) || 0)
	} catch (e) {
		return 0
	}
}

/** Aanmelden vanuit de balk die het element tekent. */
export function koppel(el) {
	element = el
	if (el) el.playbackRate = Number(staat.snelheid)
}

/**
 * Een aflevering afspelen, of pauzeren als hij al speelt.
 *
 * Staat dezelfde aflevering al in de speler, dan is dit de pauzeknop -- dat is wat je verwacht als je
 * nog een keer op hetzelfde afspeelknopje tikt.
 */
export function speel(ep, art) {
	if (staat.huidig && staat.huidig.id === ep.id) {
		if (!element) return
		if (element.paused) element.play().catch(() => {})
		else element.pause()
		return
	}
	staat.huidig = ep
	staat.art = art || ''
	// Het element krijgt zijn nieuwe bron pas na het tekenen; daarna kan er gespeeld worden.
	setTimeout(() => {
		if (!element) return
		element.playbackRate = Number(staat.snelheid)
		element.play().catch(() => {})
	}, 0)
}

/** Terugspoelen naar waar je gebleven was, zodra de aflevering geladen is. */
export function herstelPositie() {
	if (!element || !staat.huidig) return
	const p = positieVan(staat.huidig)
	// Niet de laatste tien seconden: dan begint hij op de aftiteling en denk je dat hij stuk is.
	if (p > 5 && p < (element.duration || Infinity) - 10) element.currentTime = p
	element.playbackRate = Number(staat.snelheid)
}

/** Onthouden waar je bent, hoogstens eens per vijf seconden. */
export function bewaarPositie() {
	if (!element || !staat.huidig || Date.now() - laatstBewaard < 5000) return
	laatstBewaard = Date.now()
	try {
		localStorage.setItem(POS + staat.huidig.audio.url, String(Math.floor(element.currentTime)))
	} catch (e) {
		/* geen ruimte of geblokkeerd: niet erg, dan begin je vooraan */
	}
}

/** De snelheid veranderen; geldt meteen en blijft staan voor de volgende keer. */
export function zetSnelheid(waarde) {
	staat.snelheid = waarde
	if (element) element.playbackRate = Number(waarde)
	try {
		localStorage.setItem(SNELHEID, waarde)
	} catch (e) {
		/* niet erg */
	}
}

/** De speler leegmaken (het kruisje op de balk). */
export function sluit() {
	if (element) element.pause()
	staat.huidig = null
	staat.art = ''
	staat.speelt = false
}
