<template>
	<!-- Eén kaart per blok, met de regels als stappen erin -- precies zoals de telefoon het doet.
	     Ramin, 24-09: *"Je gebruikt meerdere cards voor werk. Bekijk hoe het in Android is. Volg alle
	     kaarten zoals Android ze hebben."* Het web zette de rit, het werk en de terugrit als drie losse
	     kaarten onder elkaar; op de telefoon is dat één werkdag met drie regels. -->
	<div class="pa-kaarten">
		<div class="kaart" :class="soorten">
			<div class="kop">
				<span class="pa-blok__icoon" aria-hidden="true">{{ icoon }}</span>
				<!-- Tikken op de titel opent het bewerkscherm (Ramin, 23-09: "ik kan het niet editten");
					     in een blok was dat weggevallen toen de losse kaarten verdwenen. -->
				<span class="titel" :class="{ 'pa-blok__tik': hoofd && teOpenen(hoofd) }"
					@click="hoofd && teOpenen(hoofd) && $emit('open', hoofd)">{{ titel }}</span>
				<span class="chip">{{ blok.tijd }}</span>
				<!-- Geen knop op de kop van een stapel (RegelKaarten.kt:406): "3 episodes" afvinken zou
				     alleen de eerste raken. Elke regel heeft zijn eigen knop op zijn eigen regel. -->
				<span v-if="hoofd && !blok.stapel && !verwacht" class="knopjes" @click.stop>
					<button type="button" class="knop stil" :class="{ primair: hoofdKlaar }" @click="$emit('toggle-done', hoofd.id)">
						{{ hoofdKlaar ? '✓ ' : '' }}{{ t('Done') }}
					</button>
				</span>
			</div>

			<!-- De grote tijd van het blok: waar je nú in zit, en anders wat er als eerste komt. Bij een
			     werkdag is dat je vertrektijd van huis en niet het uur waarop het werk begint. -->
			<div v-if="groteTijd" class="tijdrij">
				<span class="tijd">{{ groteTijd }}</span>
				<span v-if="groteLabel" class="label">{{ groteLabel }}</span>
			</div>
			<!-- De feiten van de hoofdregel: afstand, duur, gates, koffer, tijdzone. De telefoon zet die
			     onder de grote tijd (feitenVan in RegelKaarten.kt); hier stonden ze nergens, waardoor bij een
			     overstap de gate en de koffer onzichtbaar bleven. -->
			<div v-if="feiten.length" class="feiten">
				<span v-for="f in feiten" :key="f.l + f.v"><span class="l">{{ f.l }}</span> <span class="v">{{ f.v }}</span></span>
			</div>
			<!-- Stond in meer dan een agenda en is samengevoegd (Ramin 26-09). -->
			<div v-if="ookIn" class="feiten">{{ ookIn }}</div>
			<!-- Waarom staat dit hier? Bij de hoofdregel van het blok, in gewone taal. -->
			<div v-if="waarom" class="waarom">{{ waarom }}</div>

			<div class="stappen-lijst">
				<template v-for="r in stappen" :key="r.id">
					<div class="stap" :class="{ gedaan: klaar(r), nu: rNu(r), 'pa-blok__tik': teOpenen(r) }"
						@click="teOpenen(r) && $emit('open', r)">
						<span class="st">{{ klok(r, r.begin) }}</span>
						<!-- Het plaatje van de podcast voor de naam (Ramin, 23-09): je herkent hem eerder aan de
						     hoes dan aan de titel. Alleen als de feed er een heeft. -->
						<img v-if="(r.inhoud || {}).afbeelding" :src="r.inhoud.afbeelding" alt="" class="pa-blok__hoes">
						<div class="pa-blok__wat">
							<div class="sl">{{ regelTitel(r) }}<span v-if="rNu(r)" class="nu-tag">{{ t('now') }}</span></div>
							<div v-if="stapTekst(r)" class="ss">{{ stapTekst(r) }}</div>
						</div>
						<!-- Wat niet aan de beurt is toont alleen zijn stand, zoals op de telefoon: geen knop om
						     iets af te vinken dat al geweest is, wel het woord erbij dat zegt hoe het afliep. -->
						<span v-if="standVan(r)" class="chip">{{ standVan(r) }}</span>
						<!-- Elk ding in een stapel vink je apart af (Ramin, 22-09: "in 1 card, maar onafhankelijk
						     behandelen"): drie afleveringen om 20:00 zijn drie dingen. -->
						<button v-if="blok.stapel && !verwacht && r.niveau === 0" type="button" class="knop stil" @click.stop="$emit('toggle-done', r.id)">
							{{ klaar(r) ? '✓ ' : '' }}{{ t('Done') }}
						</button>
					</div>
					<!-- Wat binnen deze stap valt -- een tankstop tijdens de rit, een belletje onderweg --
					     staat eronder, ingesprongen (Ramin, 23-09: "plaats IN de container onder de rit"). -->
					<div v-for="k in kinderenVan(r)" :key="k.id" class="stap pa-blok__kind" :class="{ gedaan: klaar(k) || genegeerd(k), nu: rNu(k) }">
						<span class="st">{{ klok(k, k.begin) }}</span>
						<div class="pa-blok__wat">
							<div class="sl">{{ regelTitel(k) }}</div>
							<div v-if="stapTekst(k)" class="ss">{{ stapTekst(k) }}</div>
						</div>
						<!-- "Hier tank ik niet", met een weg terug: een keuze die je niet kunt herroepen is
						     een val. Dit gaat naar de server, dus de telefoon weet het ook (Ramin, 27-09). -->
						<button v-if="isDrivestop(k)" type="button" class="knop stil"
							@click.stop="negeerKlik(k)">
							{{ genegeerd(k) ? t('Refuel after all') : t('Ignore') }}
						</button>
					</div>
				</template>
				<!-- Waar de laatste rit op uitkomt, zodat de kaart afsluit met "17:36 Thuis" in plaats van
				     in het niets (Ramin, 23-09). Alleen bij een afspraak-blok: daar is de terugrit het slot;
				     bij een werkdag of vlucht staat de eindbestemming al in de stappen. -->
				<div v-if="aankomst" class="stap pa-blok__aankomst">
					<span class="st">{{ aankomst.tijd }}</span>
					<div class="pa-blok__wat"><div class="ss">{{ aankomst.waar }}</div></div>
				</div>
			</div>
			<!-- Krap staat niet tussen de feiten maar als waarschuwing onder de kaart (Ramin, 23-09):
			     tussen de getallen las je er zo langs. -->
			<div v-for="w in waarschuwingen" :key="w" class="waarschuwing">{{ w }}</div>

			<!-- De vragen van de planner over deze kaart, als gekleurd vlak onderin. Zat alleen in de losse
			     kaart; zodra er een rit bij hoort werd het een blok en verdween de vraag -- juist bij halen
			     en brengen, waar er altijd een rit is (27-09). -->
			<div v-for="v in blok.vragen || []" :key="v.id" class="pa-vraagvlak" @click.stop>
				<div class="pa-vraagvlak__zin">{{ vraagZin(v) }}</div>
				<div class="acties">
					<button v-if="vraagHotel(v)" type="button" class="knop primair" @click="$emit('hotel', v)">{{ t('Choose a hotel') }}</button>
					<button v-if="vraagAdres(v)" type="button" class="knop primair" @click="$emit('address', v)">{{ t('Add an address') }}</button>
					<template v-if="vraagHalen(v)">
						<button type="button" class="knop" :class="{ primair: vraagAanname(v) === 'wachten' }"
							@click="$emit('halen', v, 'wachten')">{{ t('I wait there') }}</button>
						<button type="button" class="knop" :class="{ primair: vraagAanname(v) === 'doorrijden' }"
							@click="$emit('halen', v, 'doorrijden')">{{ t('I drive on') }}</button>
					</template>
					<template v-if="vraagCadeau(v)">
						<span v-if="vraagEerder(v)" class="pa-vraagvlak__eerder">{{ t('Earlier: %s', vraagEerder(v)) }}</span>
						<button type="button" class="knop primair" @click="$emit('cadeau', v, 'tip')">{{ t('Gift ideas') }}</button>
						<span class="pa-rek"></span>
						<button type="button" class="knop" @click="$emit('cadeau', v, 'geen')">{{ t('No gift') }}</button>
						<button type="button" class="knop" @click="$emit('cadeau', v, 'geregeld')">{{ t('Already sorted') }}</button>
						<button type="button" class="knop" @click="$emit('cadeau', v, 'kopen')">{{ t('Still to buy') }}</button>
					</template>
				</div>
			</div>

			<!-- De manieren: EEN rij onderaan, zoals op de telefoon (Ramin, 27-09). Stonden eerst in de stap
			     die aan de beurt was, en kwamen daardoor tussen de tankstop en de afspraak.
			     GEEN navigatieknop: die hoort op de telefoon, niet achter een bureau (Ramin, 27-09). -->
			<div v-if="ritKnoppen" class="acties" @click.stop>
				<span class="modi">
					<button v-for="m in vervoerKeuzes(ritKnoppen)" :key="m.id" type="button"
						:aria-pressed="huidigVervoer(ritKnoppen) === m.id" :title="m.label"
						@click="$emit('mode', ritKnoppen.bron || ritKnoppen.id, m.id)">{{ m.icon }}</button>
				</span>
			</div>
		</div>
	</div>
</template>

<script>
import { t } from '../../l10n/index.js'
import { namenVoor } from '../../api/naamKoppeling.js'
import { vraagZin, vraagActies } from './vraag.js'
import { icoonVan, titelVan, stapTitelVan, subVan, klokVan, kaartSoortVan, naamVan, feitenVan, waaromVan, extraVan, meldingVan, duurVan, ookInTekst } from './regelTekst.js'

export default {
	name: 'BlokKaart',
	props: {
		/** Zoals TodayView ze maakt: { sleutel, regels, titel, tijd, werk, reis, stapel, afspraakBlok, vertrek }. */
		blok: { type: Object, required: true },
		/** Welke regels afgevinkt zijn, op id. */
		itemStatus: { type: Object, default: () => ({}) },
		nu: { type: Number, default: () => Math.floor(Date.now() / 1000) },
		/** Wat er werkelijk gebeurde, op regel-id; leeg zolang niemand iets gemeld heeft (kaart 220). */
		werkelijk: { type: Object, default: () => ({}) },
	},
	emits: ['toggle-done', 'mode', 'open', 'negeer', 'halen', 'hotel', 'address', 'cadeau'],
	data() {
		/** Wat je net wegklikte, tot de server het bevestigt. Op id. */
		return { negeerdLokaal: {} }
	},
	computed: {
		/** Is dit de kaart met de verwachte podcasts? De server zet `stapel: 'verwacht'`. */
		verwacht() {
			return !!this.blok.verwacht || String(this.blok.sleutel || '').startsWith('verwacht-')
		},
		/** De regel waar het blok naar heet: het werk, de vlucht, de afspraak. */
		hoofd() {
			const r = this.blok.regels || []
			if (this.blok.stapel) return null
			// Heeft de lijst al gekozen welke regel de kop is, dan die -- anders kiezen wij een andere en
			// staat de titel zowel bovenaan als tussen de stappen (Ramin, 27-09).
			if (this.blok.hoofdId) {
				const gekozen = r.find((x) => x.id === this.blok.hoofdId)
				if (gekozen) return gekozen
			}
			return r.find((x) => x.soort === 'werk' || x.soort === 'vlucht' || x.soort === 'verblijf')
				|| r.find((x) => x.soort === 'afspraak' && x.niveau === 0)
				|| null
		},
		hoofdKlaar() { return this.hoofd ? this.klaar(this.hoofd) : false },
		/** Het icoon van de kop; bij een stapel dat van de eerste regel (een stapel heeft geen kop). */
		icoon() {
			const r = this.hoofd || (this.blok.regels || [])[0]
			return r ? icoonVan(r) : '🔔'
		},
		titel() { return this.blok.titel || (this.hoofd ? titelVan(this.hoofd) : '') },
		soorten() {
			const h = this.hoofd
			return {
				werk: !!this.blok.werk,
				vlucht: !!this.blok.reis,
				afspraak: !!this.blok.afspraakBlok && h != null && !kaartSoortVan(h),
			}
		},
		/**
		 * Een afspraakblok en een stapel tonen geen grote tijd: daar staat de afspraak zelf tussen de
		 * ritten, en bij een stapel zou de eerste zwaarder wegen dan de rest.
		 */
		/**
		 * De regel waar de grote tijd bij hoort (RegelKaarten.kt regel 435): waar je NU in zit, anders het
		 * eerstvolgende, anders het begin van het blok. Bij een afspraak met een rit is dat je vertrektijd
		 * en niet het uur van de afspraak.
		 */
		actiefRegel() {
			const lijst = (this.blok.regels || []).filter((r) => r.begin != null)
			if (lijst.length === 0) return this.hoofd
			const nu = this.nu
			return lijst.find((r) => nu >= r.begin && (r.eind == null || nu < r.eind))
				|| lijst.filter((r) => r.begin >= nu).sort((a, b) => a.begin - b.begin)[0]
				|| lijst.slice().sort((a, b) => a.begin - b.begin)[0]
				|| this.hoofd
		},
		/**
		 * De rit waarmee dit blok begint: die bepaalt de grote tijd.
		 *
		 * Ramin, 27-09: *"de grote tijd is afspraaktijd, moet vertrektijd zijn"*. De kaart beantwoordt één
		 * vraag -- wanneer moet ik weg. Wat er op dit moment aan de beurt is staat in de stappen, met de
		 * NU-markering erbij. Android doet hetzelfde (`heenrit` bij een afspraakblok).
		 */
		heenrit() {
			if (!this.blok.afspraakBlok && !this.blok.werk) return null
			const doel = this.actiefRegel
			if (!doel || doel.begin == null) return null
			return (this.blok.regels || [])
				.filter((r) => r.soort === 'rit' && r.begin != null && r.begin < doel.begin)
				.sort((a, b) => a.begin - b.begin)[0] || null
		},
		groteTijd() {
			// Alleen verwachtingen, afleveringen en herinneringen hebben er geen (Android: zonderGroteTijd).
			if (this.blok.herinneringen || this.blok.vermaak || this.verwacht) return null
			if (this.blok.vertrek != null) return klokVan(this.actiefRegel, this.blok.vertrek)
			const a = this.heenrit || this.actiefRegel
			return a && a.begin != null ? klokVan(a, a.begin) : null
		},
		groteLabel() {
			const h = this.actiefRegel
			if (!h) return null
			if (this.blok.vertrek != null) {
				const tot = h.eind ? '–' + klokVan(h, h.eind) : ''
				return t('leave home · %s', klokVan(h, h.begin) + tot)
			}
			return h.eind && h.eind !== h.begin ? t('until %s', klokVan(h, h.eind)) : null
		},
		/** De rit waar de knoppenrij bij hoort: die aan de beurt is, anders de eerste met een doel. */
		ritKnoppen() {
			if (this.blok.stapel) return null
			const lijst = this.blok.regels || []
			const aan = this.aanDeBeurt
			if (aan && this.vervoerKeuzes(aan).length) return aan
			return lijst.find((r) => this.vervoerKeuzes(r).length) || null
		},
		/** Wat binnen een andere regel valt komt daar niet nog eens als eigen stap bij. */
		stappen() {
			const lijst = this.blok.regels || []
			if (this.blok.stapel) return lijst
			const ids = new Set(lijst.map((r) => r.id))
			// De hoofdregel hoort er OOK in: op de telefoon staat de afspraak gewoon in zijn eigen blok,
			// onder de ritten. Wat binnen een andere regel valt (een tankstop in een rit) komt daar
			// ingesprongen onder en niet als eigen stap -- dat deel blijft.
			return lijst.filter((r) => !(r.container && ids.has(r.container)))
		},
		/** Stond deze afspraak in meer dan een agenda? Dan zegt de kaart dat (Ramin 26-09). */
		ookIn() {
			return this.hoofd ? ookInTekst(this.hoofd) : ''
		},
		/** De feiten van de hoofdregel, zoals de telefoon ze onder de grote tijd zet. */
		feiten() {
			// Bij de regel waar de grote tijd bij hoort: afstand, reistijd, aankomst horen bij de rit die je
			// nu voor je hebt, niet bij de afspraak aan het eind.
			return this.actiefRegel ? feitenVan(this.actiefRegel, this.nu) : []
		},
		/** Waarom dit blok er staat; bij een rit met de tijd waarop je er moet zijn erin. */
		waarom() {
			if (!this.hoofd) return null
			return waaromVan(this.hoofd, this.hoofd.eind != null ? klokVan(this.hoofd, this.hoofd.eind) : null)
		},
		/** Wat er misgaat: een krappe overstap, een te lange gang naar je auto. */
		waarschuwingen() {
			const uit = []
			for (const r of this.blok.regels || []) {
				const i = r.inhoud || {}
				if (r.soort === 'overstap' && i.krap) {
					uit.push(i.minimaal
						? t('Tight transfer: %1$s, while %2$s is the minimum', duurVan(i.overstapMinuten || 0), duurVan(i.minimaal))
						: t('Tight transfer'))
				}
			}
			return uit
		},
		/** Waar de laatste rit op uitkomt; alleen bij een afspraak-blok (zie het sjabloon). */
		aankomst() {
			if (!this.blok.afspraakBlok) return null
			const ritten = (this.blok.regels || []).filter((r) => r.soort === 'rit' && r.eind != null)
			const laatste = ritten[ritten.length - 1]
			if (!laatste) return null
			const waar = (laatste.inhoud || {}).toLabel || naamVan(laatste.naar)
			return waar ? { tijd: klokVan(laatste, laatste.eind), waar } : null
		},
		/**
		 * De stap waar je nu bent, en anders de eerstvolgende. Alleen die krijgt knoppen -- zelfde regel
		 * als op de telefoon.
		 */
		aanDeBeurt() {
			const lijst = this.blok.regels || []
			return lijst.find((r) => this.rNu(r))
				|| lijst.filter((r) => (r.begin || 0) >= this.nu).sort((a, b) => (a.begin || 0) - (b.begin || 0))[0]
				|| null
		},
	},
	methods: {
		t,
		klok: klokVan,
		/** Een melding krijgt zijn eigen zin; anders staat er een kaal "Notice" (P5, 23-09). */
		/**
		 * Hoe een stap heet IN een blok: korter dan de titel van een losse kaart, want de bestemming staat
		 * al in de rit erboven (zoals `BlokRegel` op Android).
		 */
		regelTitel(r) {
			return r.soort === 'melding' ? (meldingVan(r) || stapTitelVan(r)) : stapTitelVan(r)
		},
		sub: subVan,
		klaar(r) {
			// Onder beide namen kijken: de telefoon vinkt af onder ZIJN naam voor dezelfde afspraak.
			const stand = namenVoor(r.id).map((n) => this.itemStatus[n]).find(Boolean)
			return !!(stand && stand.doneAt) || r.status === 'klaar' || r.status === 'overgeslagen'
		},
		rNu(r) {
			return r.begin != null && this.nu >= r.begin && (r.eind == null || this.nu < r.eind)
		},
		/**
		 * Wat er onder de naam van een stap staat: de vaste gegevens (subVan) plus wat alleen in een blok
		 * telt -- wanneer je verder rijdt, tot hoe laat, en wat er werkelijk gebeurde.
		 */
		stapTekst(r) {
			const nadruk = r.niveau === 0 && ['afspraak', 'werk', 'verblijf'].includes(r.soort)
			const delen = [subVan(r), extraVan(r, nadruk, (this.werkelijk || {})[r.id] || null)].filter(Boolean)
			return delen.join(' \u00b7 ')
		},
		/**
		 * Het woord achter een stap die niet meer aan de beurt is: klaar of overgeslagen. Die twee zijn
		 * niet hetzelfde (zie feedback_done_is_niet_skipped) -- afvinken is iets anders dan niet gaan.
		 * Een verwachte aflevering krijgt niets: daar is nog niets gebeurd.
		 */
		standVan(r) {
			if (this.blok.stapel || (r.inhoud || {}).cardType === 'podcastverwacht') return null
			if (this.aanDeBeurt !== null && r.id === this.aanDeBeurt.id) return null
			if (this.genegeerd(r)) return t('Skipped')
			if (r.status === 'overgeslagen') return t('Skipped')
			if (this.klaar(r)) return t('Done')
			return null
		},
		/** Waar een bewerkscherm achter zit: de afspraak zelf, niet de berekende rit of check-in. */
		teOpenen(r) {
			return r.niveau === 0 && !!r.bron
				&& ['afspraak', 'werk', 'verblijf', 'vlucht'].includes(r.soort)
		},
		vraagZin,
		vraagHotel(v) { const a = vraagActies(v); return !!(a && a.hotel) },
		vraagAdres(v) { const a = vraagActies(v); return !!(a && a.adres) },
		vraagHalen(v) { const a = vraagActies(v); return !!(a && a.halen) },
		vraagCadeau(v) { const a = vraagActies(v); return !!(a && a.cadeau) },
		vraagEerder(v) { const a = vraagActies(v); return a ? a.eerdereTips : null },
		vraagAanname(v) { const a = vraagActies(v); return a ? a.aanname : null },
		/** Is dit een stop onderweg (tankstop, parkeren)? De server zet ze in `drivestops`. */
		isDrivestop(k) {
			return (this.blok.drivestops || []).includes(k.id)
		},
		knoppenVoor(r) {
			if (this.blok.stapel) return false
			if (this.aanDeBeurt === null || r.id !== this.aanDeBeurt.id) return false
			return this.vervoerKeuzes(r).length > 0
		},
		/** Wat binnen deze stap valt: een tankstop in de rit, een belletje onderweg. */
		kinderenVan(r) {
			if (this.blok.stapel) return []
			return (this.blok.regels || []).filter((k) => k.container === r.id)
		},
		/**
		 * Heb je deze stop weggeklikt? De server weet het (`stationOvergeslagen`, uit dag+bestemming) en
		 * tot de dag opnieuw gerekend is weet dit scherm het zelf even (`negeerdLokaal`). Zonder dat
		 * tweede stukje bleef de knop op "Ignore" staan tot de planner klaar was.
		 */
		/** Wegklikken of terugdraaien: eerst hier zichtbaar, dan naar de server. */
		negeerKlik(k) {
			const aan = !this.genegeerd(k)
			this.negeerdLokaal = { ...this.negeerdLokaal, [k.id]: aan }
			this.$emit('negeer', k, aan)
		},
		genegeerd(k) {
			if (this.negeerdLokaal[k.id] !== undefined) return this.negeerdLokaal[k.id]
			return !!(k.inhoud || {}).stationOvergeslagen
		},
		/** Waar de knop naartoe zegt te gaan: de pomp zolang die er nog is, anders de bestemming. */
		huidigVervoer(r) {
			const s = r.vervoer && r.vervoer.soort
			return ({ auto: 'driving', fiets: 'cycling', lopen: 'walking', trein: 'training' })[s] || null
		},
		/** Dezelfde knoppen als op de losse ritkaart; fiets en lopen alleen als de afstand dat toelaat. */
		vervoerKeuzes(r) {
			if (r.soort !== 'rit') return []
			const km = r.vervoer && r.vervoer.km
			const huidig = this.huidigVervoer(r)
			return [
				{ id: 'driving', icon: '🚗', label: t('Car') },
				{ id: 'cycling', icon: '🚲', label: t('Bike'), max: 30 },
				{ id: 'walking', icon: '🚶', label: t('On foot'), max: 8 },
				{ id: 'training', icon: '🚆', label: t('Public transport') },
			].filter((m) => !m.max || !km || km <= m.max || m.id === huidig)
		},
	},
}
</script>

<style scoped>
/* De vormgeving komt uit kaarten.css; hier alleen wat die demo-pagina niet kende. */
.pa-kaarten { margin-bottom: 10px; }
.kaart .titel { flex: 1; min-width: 0; }
.pa-blok__icoon { font-size: 15px; line-height: 1; flex: none; }
.kop .knopjes { display: flex; align-items: center; gap: 6px; margin-left: 0; }
.kop .knopjes .knop { min-height: 30px; padding: 0 10px; font-size: 12.5px; }
.pa-blok__wat { flex: 1; min-width: 0; }
.stappen-lijst .stap:first-child { border-top: 1px solid var(--pa-line); }
/* Wat binnen een stap valt springt in, zodat je ziet dat het eronder hangt. */
.pa-blok__kind { padding-left: 24px; border-top: 0; }
/* De afsluitende aankomst is geen stap maar een eindpunt: zelfde vorm, zachtere kleur. */
.pa-blok__tik { cursor: pointer; }
/* De gemeten momenten staan onder een streep: het is geen planning meer maar wat er gebeurde. */
.pa-blok__echt { border-top: 1px solid var(--pa-line); padding-top: 8px; margin-top: 4px; }
.pa-blok__echt-kop { font-size: 11.5px; color: var(--pa-ink3); margin-bottom: 4px; }
/* De hoes van een aflevering: klein vierkant voor de naam, zoals op de telefoon. */
.pa-blok__hoes { width: 28px; height: 28px; border-radius: 6px; object-fit: cover; flex: none; }
/* De uitleg waarom dit er staat: even zacht als de feiten, maar een hele zin. */
.waarom { font-size: 12.5px; color: var(--pa-ink3); margin: -6px 0 10px; }
.pa-blok__aankomst .st, .pa-blok__aankomst .ss { color: var(--pa-ink3); }
.pa-blok__kind .st { color: var(--pa-ink3); }
/* De knoppen van de stap waar je bent: 'mini' uit het ontwerp, ook voor de navigeer-link. */
.stap .mini a { font: inherit; font-size: 12px; min-height: 32px; padding: 0 10px; border-radius: 9px;
	border: 1px solid var(--pa-line); background: var(--pa-navy); color: var(--pa-navy-ink);
	text-decoration: none; display: inline-flex; align-items: center; }
</style>
