import { reactive, watch } from 'vue'
import { getAccessCode } from './accessCode.js'
import * as paApi from './paApi.js'

/**
 * Eén oor voor de hele app: verandert er iets op een ander apparaat, dan weten alle schermen het meteen.
 *
 * Ramin, 24-09: *"als er bij één device iets verandert, direct met een push doorgeven aan de andere
 * gekoppelde devices"*. De server houdt per soort bij wanneer er voor het laatst iets veranderde en
 * `wait_changed.php` blijft maximaal 25 seconden openstaan tot dat gebeurt. Geen websocket en geen
 * push-dienst: dit draait op gedeelde hosting, en een openstaande vraag is daar het enige dat het houdt.
 *
 * **Waarom één lus en niet één per scherm.** Het Vandaag-scherm had er al een, Instellingen ook, en op de
 * telefoon Vandaag en Deck. Elk scherm hield dus zijn eigen verbinding open, en schermen zonder lus --
 * Taken, Notities, Gesprekken -- hoorden helemaal niets. Nu is er één lus die blijft lopen zolang de app
 * open staat, en tellen de schermen mee via [staat].
 *
 * Een scherm luistert door `staat.versie` te volgen:
 *
 *     watch(() => sync.staat.versie, () => this.laad())
 *
 * Wie alleen op zijn eigen soort wil reageren, vraagt dat aan [gingOver] -- NIET door zelf met
 * `staat.soort` te vergelijken:
 *
 *     watch(() => sync.staat.versie, () => { if (sync.gingOver('calls')) this.laad() })
 *
 * Waarom dat onderscheid er is (Ramin, 25-09). De server hield per gebruiker EEN etiket, en zestien
 * soorten overschreven elkaar daarin. Zette de telefoon drie nieuwsitems op gelezen ('seen') en liep er
 * kort daarna een feed-ronde ('feeds'), dan stond er 'feeds' en deed het nieuwsscherm -- dat op 'seen'
 * wachtte -- niets. Sindsdien stuurt de server ALLE soorten die sinds jouw laatste moment veranderden
 * mee, en is `staat.soorten` de lijst waar je op moet kijken. Elk scherm dat zelf `staat.soort === ...`
 * vergelijkt, bouwt die oude fout opnieuw.
 */
export const staat = reactive({
	versie: 0,
	/** Alle soorten die in deze ronde veranderden. Leeg = de server zei het niet; dan alles herladen. */
	soorten: [],
	/** De laatste soort. Alleen voor meldingen en logregels -- filter er niet op, gebruik [gingOver]. */
	soort: '',
	verbonden: false,
})

/**
 * Ging deze wijziging (ook) over een van deze soorten?
 *
 * Zonder soorten meegeven: ging er iets om. Weet de server niet waar het over ging, dan is het antwoord
 * ja -- een keer te veel herladen kost een verzoek, een keer te weinig laat je naar verouderde gegevens
 * kijken zonder dat iets dat meldt.
 *
 * @param {...string} soorten bijvoorbeeld 'seen', 'feeds'
 * @returns {boolean}
 */
export function gingOver(...soorten) {
	const gemeld = staat.soorten
	if (!soorten.length || !gemeld || !gemeld.length) return true
	return soorten.some((s) => gemeld.includes(s))
}

let loopt = false

/** Wacht tot er iets verandert, en tel dan op. Blijft draaien zolang de app open is. */
export function startLuisteren() {
	if (loopt) return
	loopt = true
	void lus()
}

export function stopLuisteren() {
	loopt = false
}

async function lus() {
	let sinds = 0
	while (loopt) {
		const code = getAccessCode()
		// Zonder code is er niemand om naar te luisteren, en op een tabblad op de achtergrond hoeft het
		// niet: bij terugkomst haalt het scherm zelf op wat het gemist heeft.
		if (!code || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) {
			staat.verbonden = false
			await pauze(3000)
			continue
		}
		const antwoord = await paApi.waitChanged(code, sinds).catch(() => null)
		if (!loopt) break
		if (antwoord?.changed) {
			sinds = antwoord.changedAtMs
			// `kinds` is de volledige lijst; `kind` is de terugval voor een server van voor 25-09.
			staat.soorten = Array.isArray(antwoord.kinds) && antwoord.kinds.length
				? antwoord.kinds
				: (antwoord.kind ? [antwoord.kind] : [])
			staat.soort = antwoord.kind || ''
			staat.versie += 1
			staat.verbonden = true
		} else if (antwoord) {
			// Time-out zonder nieuws: de verbinding staat, er was alleen niets te melden.
			staat.verbonden = true
		} else {
			// Serverfout of geen netwerk: even wachten in plaats van zo hard mogelijk blijven vragen.
			staat.verbonden = false
			await pauze(5000)
		}
	}
}

function pauze(ms) {
	return new Promise((r) => setTimeout(r, ms))
}

/**
 * Meeluisteren met wijzigingen van je andere apparaten (Ramin, 24-09: *"loop ze na"*).
 *
 * Ieder scherm schreef hiervoor zijn eigen watcher, en dat ging op vier schermen mis: het ene luisterde
 * alleen naar gewijzigde instellingen, de andere drie luisterden helemaal niet. De gegevens kwamen dan
 * wel binnen, maar je zag het pas als je van scherm wisselde.
 *
 * Eén plek dus. Geef op waar je op wilt reageren; laat je dat weg, dan reageert het scherm op alles.
 *
 * @param {Function} bijWijziging wordt aangeroepen zodra er iets verandert
 * @param {?string[]} soorten bijvoorbeeld ['appointment', 'settings']; null = alles
 * @returns {Function} aanroepen om te stoppen (hoort in beforeUnmount)
 */
export function volgSync(bijWijziging, soorten = null) {
	return watch(() => staat.versie, () => {
		if (soorten && !gingOver(...soorten)) return
		bijWijziging(staat.soort)
	})
}
