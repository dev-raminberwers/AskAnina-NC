<template>
	<!-- De vormgeving van site/kaarten.html (Ramin, 24-09: "gebruik ook zelfde css"). Alle klassenamen
	     hieronder komen daar letterlijk vandaan; kaarten.css schermt ze af onder .pa-kaarten, vandaar de
	     wikkel. Wat hier bovenop komt zijn de knoppen die Design niet had: klaar, weggooien, navigeren,
	     de vervoerskeuze -- precies de aanvulling die op kaarten.html zelf ook al staat beschreven. -->
	<div class="pa-kaarten">
		<div class="kaart" :class="kaartSoorten" :style="kleur ? { '--pa-kaartkleur': kleur } : null" @click="$emit('click')">
			<div class="kop">
				<span class="pa-regel__icoon" aria-hidden="true">{{ icoon }}</span>
				<span class="titel">{{ titel }}</span>
				<span class="chip">{{ soortLabel }}</span>
				<span v-if="regel.niveau === 0" class="knopjes" @click.stop>
					<!-- Kaart 218: zeggen dat dit niet klopt. Staat vooraan en klein, zodat hij niet in de weg zit. -->
					<button type="button" class="pa-meld__knop" :title="t('This is not right')"
						@click="meldOpen = !meldOpen">?</button>
					<button type="button" class="knop stil" :class="{ 'primair': done }" @click="$emit('toggle-done')">
						{{ done ? '✓ ' : '' }}{{ t('Done') }}
					</button>
					<template v-if="deletable">
						<span v-if="vraagWeg && recurring" class="pa-regel__vraag">
							{{ t('This is part of a series. Delete only this time, or every time?') }}
							<button type="button" class="knop stil" @click="vraagWeg = false; $emit('delete', 'once')">{{ t('Only this time') }}</button>
							<button type="button" class="knop stil" @click="vraagWeg = false; $emit('delete', 'all')">{{ t('Every time') }}</button>
							<button type="button" class="knop stil" @click="vraagWeg = false">{{ t('No') }}</button>
						</span>
						<span v-else-if="vraagWeg" class="pa-regel__vraag">
							{{ t('Delete this appointment?') }}
							<button type="button" class="knop stil" @click="vraagWeg = false; $emit('delete', 'all')">{{ t('Yes') }}</button>
							<button type="button" class="knop stil" @click="vraagWeg = false">{{ t('No') }}</button>
						</span>
						<button v-else type="button" class="knop stil" :title="t('Delete')" @click="vraagWeg = true"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
					</template>
					<!-- De wekker, op dezelfde plek als op de telefoon (RegelKaarten.kt: klaar, weggooien
					     en wekker op dezelfde drie plekken). Doorgestreept als er niets meer afgaat. -->
					<button v-if="wekkerbaar" type="button" class="knop stil" :title="wekkerUit ? t('Alarm off') : t('Alarm on')"
						@click="$emit('alarm')">{{ wekkerUit ? '🔕' : '🔔' }}</button>
				</span>
			</div>

			<!-- De grote tijd met wat erbij hoort ernaast, zoals op de telefoon.

			     Bij een werkdag is dat NIET wanneer je werk begint maar wanneer je de deur uit moet
			     (Ramin, 24-09). Er stond groot 09:00 terwijl je om 07:47 weg moest; dan is dat tweede het
			     getal waar je naar kijkt. De werktijd zelf staat er als bijschrift naast. -->
			<div class="tijdrij">
				<span class="tijd">{{ klok(vertrek != null ? vertrek : regel.begin) }}</span>
				<!-- De plek als chip, direct naast de grote tijd en boven "tot xx:xx" (RegelKaarten.kt 1984). -->
				<span v-if="plekChip" class="chip">{{ plekChip }}</span>
				<span v-if="vertrek != null" class="label">{{ t('leave home · %s', klok(regel.begin) + (regel.eind ? '–' + klok(regel.eind) : '')) }}</span>
				<span v-else-if="regel.eind && regel.eind !== regel.begin" class="label">{{ t('until %s', klok(regel.eind)) }}</span>
				<span v-if="regel.zone && andereZone" class="label">{{ regel.zone }}</span>
			</div>

			<!-- De feitenregel van Design: korte labels waar we ze hebben, anders alleen de waarde. -->
			<div v-if="feiten.length" class="feiten">
				<span v-for="(f, i) in feiten" :key="i">
					<span v-if="f.l" class="l">{{ f.l }}</span>
					<span class="v">{{ f.v }}</span>
				</span>
			</div>

			<!-- Stond in meer dan een agenda en is samengevoegd (Ramin 26-09): zichtbaar, want anders lijkt
			     het alsof er een kaart verdwenen is. -->
			<div v-if="ookIn" class="feiten">{{ ookIn }}</div>

			<!-- Waarom deze pomp: COST vet als hij de goedkoopste is, TIME vet als hij het dichtst bij de
			     route ligt, allebei vet als hij allebei is (Ramin, 25-09). -->
			<div v-if="tankLabel" class="feiten pa-tanklabel">
				<template v-if="!tankLabel.geenPrijs"><span :class="{ dik: tankLabel.cost }">COST</span><span>/</span></template><span :class="{ dik: tankLabel.time }">TIME</span>
			</div>

			<!-- Klopt er iets niet aan deze kaart? (kaart 218) Klein en rustig, want je hebt het zelden
			     nodig; een tik vouwt het regeltje open. -->
			<div v-if="meldOpen" class="pa-meld" @click.stop>
				<input v-model="meldTekst" type="text" :placeholder="t('What is wrong here?')" class="pa-meld__veld">
				<button type="button" class="knop stil" :disabled="meldBezig" @click="stuurMelding">
					{{ meldGedaan ? t('Thanks') : t('Send') }}
				</button>
				<button type="button" class="knop stil" @click="meldOpen = false">{{ t('Cancel') }}</button>
			</div>

			<!-- Wat er uit je mail bij deze afspraak hoort: de deelnemen-link en wie je spreekt.
			     Zelfde als op de telefoon (UitnodigingKnoppen). Is de vergadering afgezegd, dan staat
			     dat er in plaats van een knop -- dan hoef je nergens heen. -->
			<div v-if="uitnodiging && uitnodiging.cancelled" class="waarschuwing">
				{{ t('This meeting was cancelled.') }}
			</div>
			<div v-else-if="uitnodiging && uitnodiging.found" class="acties" @click.stop>
				<span class="pa-uit__bron">{{ t('From your mail') }}</span>
				<a v-if="uitnodiging.url" class="knop primair" :href="uitnodiging.url" target="_blank" rel="noopener">
					{{ deelnemenTekst }}
				</a>
				<button v-if="uitnodiging.contact && uitnodiging.contact.name" type="button" class="knop stil"
					:disabled="contactBezig" @click="bewaarContact">
					{{ contactGedaan ? t('Saved') : t('Save %s as a contact', uitnodiging.contact.name) }}
				</button>
			</div>

			<!-- Waarom staat dit hier? In gewone taal, zoals op de telefoon (waaromTekst). -->
			<div v-if="waarom" class="waarom">{{ waarom }}</div>

			<div v-if="regel.status === 'conflict'" class="waarschuwing">
				⚠ {{ t('Too short: %s minutes short', String(regel.inhoud?.shortByMinutes || '?')) }}
			</div>

			<!-- Links de app waar deze afspraak in gebeurt, rechts "Laat weten" -- één rij, zoals op de
			     telefoon (RegelKaarten.kt regel 2273). Staat de locatie van een afspraak op een app
			     (Duolingo, Strava), dan is DAT de knop die je indrukt. -->
			<div v-if="app || laatWeten" class="acties" @click.stop>
				<a v-if="app" class="knop primair" :href="appUrl" target="_blank" rel="noopener"
					@click="$emit('app-geopend')">{{ app.name }} ↗</a>
				<span class="pa-rek"></span>
				<button v-if="laatWeten" type="button" class="knop" @click="$emit('laat-weten')">➤ {{ t('Let them know') }}</button>
			</div>

			<!-- De vragen die de planner over DEZE kaart heeft, als gekleurd vlak onderin -- niet als losse
			     kaart ernaast (Ramin 22-09; de server geeft ze mee in `kaarten[].vragen`). -->
			<div v-for="v in vragen" :key="v.id" class="pa-vraagvlak" @click.stop>
				<div class="pa-vraagvlak__zin">{{ vraagZin(v) }}</div>
				<div class="acties">
					<button v-if="vraagHotel(v)" type="button" class="knop primair" @click="$emit('hotel', v)">{{ t('Choose a hotel') }}</button>
					<button v-if="vraagAdres(v)" type="button" class="knop primair" @click="$emit('address', v)">{{ t('Add an address') }}</button>
					<!-- Halen en brengen: twee knoppen, en die van wat we nu aannemen staat aan. Je antwoord
					     geldt voor de plek, dus deze vraag komt daarna niet meer terug. -->
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
					<span v-if="vraagVervoer(v).length" class="modi">
						<button v-for="m in vraagVervoer(v)" :key="m.id" type="button" :title="m.label"
							@click="$emit('mode', m.id, v)">{{ m.icon }}</button>
					</span>
				</div>
			</div>


			<!-- Een rit: navigeren, en één tik verandert het vervoer (dezelfde knoppen als de oude reiskaart). -->
			<div v-if="acties" class="acties" @click.stop>
				<a v-if="regel.soort === 'rit' && navigateUrl" class="knop primair" :href="navigateUrl" target="_blank" rel="noopener">{{ t('Navigate') }}</a>
				<button v-if="hotelVraag" type="button" class="knop primair" @click="$emit('hotel')">{{ t('Choose a hotel') }}</button>
				<button v-if="adresVraag" type="button" class="knop primair" @click="$emit('address')">{{ t('Add an address') }}</button>
				<span v-if="showModes" class="modi">
					<button v-for="m in modes" :key="m.id" type="button" :aria-pressed="(currentMode || huidigVervoer) === m.id" :title="m.label" @click="$emit('mode', m.id)">{{ m.icon }}</button>
				</span>
			</div>
		</div>
	</div>
</template>

<script>
import { t, currentLocale } from '../../l10n/index.js'
import { feitenVan, waaromVan, meldingVan, duurVan } from './regelTekst.js'
import { vraagZin, vraagActies } from './vraag.js'
import * as paApi from '../../api/paApi.js'
import { getAccessCode } from '../../api/accessCode.js'

/**
 * Eén regel van de nieuwe dag-lijst (structuurplan §11, F5): dezelfde velden op server, telefoon en web.
 * Tekent begin/eind in de zone van de regel, van → naar, het vervoer en wat de server erbij vertelt.
 */
const ICONEN = { thuis: '🏠', werk: '🏢', afspraak: '📅', rit: '🚗', inchecken: '🛄', vlucht: '✈️', overstap: '🔁', bagage: '🧳', verblijf: '🏨', gat: '⏳', tankstop: '⛽', parkeren: '🅿️', melding: 'ℹ️', vraag: '❓' }

/**
 * Een afspraak is niet altijd een afspraak (Ramin, 24-09: *"study spanish moet een study card zijn en
 * geen afspraak"*). De server zet er een soort bij -- studie, sport, eten, een herinnering, een aflevering
 * -- en die soort bepaalt wat je ziet: een eigen icoon, een eigen woord op het chipje, en géén donker
 * afsprakenvlak. Dat vlak is voor de echte afspraken, anders zegt het niets meer.
 */
function ookInTekst(regel) {
	const lijst = regel?.inhoud?.ookIn
	if (!Array.isArray(lijst) || lijst.length === 0) return ''
	return t('Also in {agendas}', { agendas: lijst.join(', ') })
}

const KAARTSOORTEN = {
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
const VERVOER = { auto: '🚗', trein: '🚆', vlucht: '✈️', fiets: '🚲', lopen: '🚶', taxi: '🚕' }

export default {
	name: 'RegelKaart',
	props: {
		regel: { type: Object, required: true },
		done: { type: Boolean, default: false },
		deletable: { type: Boolean, default: false },
		recurring: { type: Boolean, default: false },
		/** Bij een werkdag: wanneer je van huis moet. Dan is dát de grote tijd (Ramin, 24-09). */
		vertrek: { type: Number, default: null },
		/** Vervoerkeuze van de gebruiker voor deze rit (travelChoices van de afspraak). */
		currentMode: { type: String, default: null },
		showModes: { type: Boolean, default: false },
		/** De kleur van de agenda waar deze afspraak uit komt: het balkje links, zoals op de telefoon. */
		kleur: { type: String, default: null },
		/** De vragen die bij deze kaart horen; de server zet ze in `kaarten[].vragen`. */
		vragen: { type: Array, default: () => [] },
		/** Wat er werkelijk gebeurde, op regel-id (kaart 220); leeg zolang niemand iets meldde. */
		werkelijk: { type: Object, default: () => ({}) },
	},
	emits: ['click', 'toggle-done', 'delete', 'mode', 'hotel', 'address', 'alarm', 'laat-weten', 'app-geopend', 'halen', 'cadeau'],
	data() {
		return { vraagWeg: false, uitnodiging: null, contactBezig: false, contactGedaan: false,
			meldOpen: false, meldTekst: '', meldBezig: false, meldGedaan: false }
	},
	async mounted() {
		// Alleen bij een echte afspraak met een naam: bij een rit of een gat valt er niets uit de mail
		// te halen, en zonder titel zou elke afspraak van die dag dezelfde knop krijgen (23-09).
		if (this.regel.soort !== 'afspraak' || this.regel.begin == null) return
		const titel = (this.regel.inhoud || {}).titel || (this.regel.inhoud || {}).label || ''
		if (!titel) return
		const dag = new Date(this.regel.begin * 1000).toISOString().slice(0, 10)
		try {
			this.uitnodiging = await paApi.mailMeeting(getAccessCode(), dag, titel, this.regel.begin)
		} catch (e) {
			// Geen mailkoppeling of geen antwoord: dan staat de kaart er gewoon zonder deze knoppen.
		}
	},
	computed: {
		/**
		 * De app waar deze afspraak in gebeurt (RegelKaarten.kt:2273). Staat de locatie op een app --
		 * Duolingo, Strava -- dan is DAT de knop die je indrukt, niet "Navigeren".
		 */
		app() {
			const r = this.regel
			if (r.soort !== 'afspraak' || r.niveau !== 0) return null
			if ((r.inhoud || {}).cardType === 'entertainment') return null
			const a = (r.inhoud || {}).app
			return a && a.name ? a : null
		},
		/**
		 * Waar die knop heen gaat. Een browser kan geen Android-pakket openen, dus we gaan naar de
		 * web-versie als de app er een heeft, en anders naar de Play Store -- net als de telefoon doet
		 * wanneer het pakket ontbreekt.
		 */
		appUrl() {
			const a = this.app
			if (!a) return null
			if (a.url) return a.url
			if (a.androidPackage) return 'https://play.google.com/store/apps/details?id=' + encodeURIComponent(a.androidPackage)
			return 'https://play.google.com/store/search?q=' + encodeURIComponent(a.name) + '&c=apps'
		},

		hotelVraag() {
			const i = this.regel.inhoud || {}
			return this.regel.soort === 'vraag' && (i.vraag === 'needsAccommodation' || i.vraag === 'needsTransferDecision') && i.lat != null && i.lon != null
		},
		adresVraag() {
			return this.regel.soort === 'vraag' && (this.regel.inhoud || {}).vraag === 'needsAddress' && !!this.regel.bron
		},
		acties() {
			if (this.regel.soort === 'rit') return !!(this.navigateUrl || this.showModes)
			return this.hotelVraag || this.adresVraag || (this.regel.soort === 'vraag' && this.showModes)
		},
		icoon() {
			if (this.regel.soort === 'rit' && this.regel.vervoer) return VERVOER[this.regel.vervoer.soort] || ICONEN.rit
			if (this.kaartSoort) return this.kaartSoort.icoon
			return ICONEN[this.regel.soort] || '•'
		},
		/** De soort die de server aan deze kaart gaf, als wij die kennen. */
		kaartSoort() {
			return KAARTSOORTEN[(this.regel.inhoud || {}).cardType] || null
		},
		soortLabel() {
			if (this.kaartSoort) return this.kaartSoort.label()
			const s = this.regel.soort
			return ({
				thuis: t('Home'), werk: t('Work'), afspraak: t('Appointment'), rit: t('Ride'), inchecken: t('Check-in'), vlucht: t('Flight'),
				overstap: t('Transfer'), bagage: t('Baggage claim'), verblijf: t('Stay'), gat: t('Gap'), tankstop: t('Fuel stop'),
				parkeren: t('Parking'), melding: t('Notice'), vraag: t('Question'),
			})[s] || s
		},
		titel() {
			const i = this.regel.inhoud || {}
			if (i.titel) return i.titel
			if (this.regel.soort === 'rit') return (i.fromLabel || this.naam(this.regel.van)) + ' → ' + (i.toLabel || this.naam(this.regel.naar))
			if (this.regel.soort === 'gat') return t('%s minutes free', String(i.minutes ?? i.rawMinutes ?? '?'))
			if (this.regel.soort === 'vraag') return this.vraagTekst(i.vraag)
			// Een melding krijgt zijn eigen zin; anders stond er een kale sleutel of het woord Notice
			// (P5, 23-09: drie keer 'Notice' onder elkaar).
			if (this.regel.soort === 'melding') return meldingVan(this.regel) || i.melding || t('Notice')
			// De naam van de pomp zodra die bekend is; zolang dat niet zo is, waar je heen onderweg bent.
			if (this.regel.soort === 'tankstop') return i.stationNaam || t('Refuel before the ride to %s', i.toLabel || this.naam(this.regel.naar) || '')
			return i.label || i.airportName || this.naam(this.regel.naar) || this.soortLabel
		},
		/**
		 * Welke soort kaart dit is, in de klassen van Design: een afspraak is het donkere vlak, een vlucht
		 * en een werkdag krijgen hun eigen randkleur, een gat of melding is de gestippelde notitie.
		 */
		kaartSoorten() {
			const s = this.regel.soort
			return {
				// Het donkere vlak is voor een échte afspraak. Een studieblok, een herinnering of een
				// aflevering krijgt de gewone kaart met zijn eigen icoon en woord (Ramin, 24-09).
				afspraak: s === 'afspraak' && this.regel.niveau === 0 && !this.kaartSoort,
				vlucht: s === 'vlucht',
				werk: s === 'werk',
				notitie: s === 'gat' || s === 'melding' || s === 'vraag',
				gemist: this.regel.status === 'conflict',
				'pa-regel--klaar': this.done,
				'pa-regel--kind': !!this.regel.container,
			}
		},
		/** Wat er onder de tijd staat. Zelfde inhoud als voorheen, nu in de feitenregel van Design. */
		/**
		 * De feiten komen uit regelTekst.js -- dezelfde lijst die de kaart in een blok toont, en
		 * dezelfde die de telefoon toont (feitenVan in RegelKaarten.kt). Deze kaart had er zijn eigen
		 * versie van, met minder erin: dezelfde vlucht toonde op de ene plek zijn gate en op de andere
		 * niet. Wat hieronder nog volgt zijn de twee zinnen die alleen deze kaart heeft.
		 */
		/** De plek als chip naast de tijd; leeg als hij niets toevoegt (RegelKaarten.kt: `plek`). */
		plekChip() {
			const r = this.regel
			if (r.soort === 'rit' || r.soort === 'thuis') return ''
			const ct = (r.inhoud || {}).cardType
			if (ct === 'herinnering' || ct === 'entertainment') return ''
			const p = r.naar || r.van
			const naam = p ? (p.locatie || p.stad || p.regio || p.land || '') : ''
			return naam && naam !== this.titel ? naam : ''
		},
		/** Klaar, weggooien en wekker horen bij dezelfde soorten regels (RegelKaarten.kt regel 1908). */
		wekkerbaar() {
			const r = this.regel
			if (r.niveau !== 0) return false
			if ((r.inhoud || {}).cardType === 'podcastverwacht') return false
			return ['afspraak', 'werk', 'verblijf', 'vlucht'].includes(r.soort)
		},
		wekkerUit() { return this.done },
		/** Wie in zijn eentje iets doet, hoeft niemand iets te laten weten (RegelKaarten.kt: `alleen`). */
		laatWeten() {
			const r = this.regel
			if (r.soort !== 'afspraak' || r.niveau !== 0) return false
			const ct = (r.inhoud || {}).cardType
			const alleen = ['gezondheid', 'sport', 'studie', 'taak', 'podcastverwacht', 'klus', 'administratie',
				'entertainment', 'gesprek', 'bellen', 'herinnering']
			return !alleen.includes(ct)
		},
		ookIn() {
			return ookInTekst(this.regel)
		},
		feiten() {
			const uit = feitenVan(this.regel)
			if (this.route && uit.length === 0) uit.push({ v: this.route })
			if (this.details) uit.push({ v: this.details })
			return uit
		},
		/**
		 * Het label COST/TIME, of null als er geen pomp gekozen is.
		 *
		 * Zonder pomp geen label: het zou een keuze suggereren die nog niet gemaakt is.
		 */
		tankLabel() {
			const i = this.regel.inhoud || {}
			if (this.regel.soort !== 'tankstop' || !i.stationNaam) return null
			// Zonder prijsinformatie is COST betekenisloos; dan blijft alleen TIME over.
			return { cost: !!i.stationGoedkoopst, time: !!i.stationSnelst, geenPrijs: !!i.stationGeenPrijs }
		},
		route() {
			if (this.regel.soort === 'rit' || this.regel.soort === 'vlucht' || this.regel.soort === 'overstap') {
				const v = this.regel.vervoer || {}
				const delen = []
				if (v.km) delen.push(v.km + ' km')
				if (v.duurMin) delen.push(duurVan(v.duurMin))
				if (v.verwijzing) delen.push(v.verwijzing)
				return delen.join(' · ')
			}
			const plek = this.naam(this.regel.naar || this.regel.van)
			return plek && plek !== this.titel ? plek : ''
		},
		/** "Deelnemen aan Teams", of alleen "Deelnemen" als we de dienst niet herkennen. */
		deelnemenTekst() {
			const naam = ({ zoom: 'Zoom', teams: 'Teams', meet: 'Google Meet', webex: 'Webex' })[(this.uitnodiging || {}).platform]
			return naam ? t('Join %s', naam) : t('Join the meeting')
		},
		/** Waarom deze regel er staat; bij een rit met de tijd waarop je er moet zijn erin. */
		waarom() {
			return waaromVan(this.regel, this.regel.eind != null ? this.klok(this.regel.eind) : null)
		},
		/** De twee zinnen die niet in feitenVan passen: het gat en de tankstop rekenen iets uit. */
		details() {
			const i = this.regel.inhoud || {}
			const delen = []
			if (this.regel.soort === 'gat' && i.toBaseMinutes != null) delen.push(t('Via %s: %s min there, %s min back', i.baseLabel || t('Home'), String(i.toBaseMinutes), String(i.fromBaseMinutes)))
			if (this.regel.soort === 'tankstop') {
				delen.push(t('Range %s km, ride %s km, about %s litres', String(i.kmLeft ?? '?'), String(i.ritKm ?? '?'), String(i.litresNeeded ?? '?')))
				// Welke pomp het is (Ramin, 25-09). Staat er niets, dan is hij nog niet gekozen.
				if (i.stationAdres) delen.push(i.stationAdres)
				if (i.stationPlaats) delen.push(i.stationPlaats)
				// Het teken van je eigen munt voor het bedrag (Ramin, 25-09). Kent de browser de munt van
				// je land niet, dan blijft het getal staan zonder teken -- een verkeerd teken is erger.
				if (i.stationGeenPrijs) delen.push(t('no price information'))
				else if (i.stationPrijs != null) delen.push(this.metValuta(i.stationPrijs, 3) + '/l')
				if (i.stationBespaard != null) delen.push(t('Saves %s', this.metValuta(i.stationBespaard, 2)))
				if (i.stationOmwegMin) delen.push(t('%s min detour', String(i.stationOmwegMin)))
			}
			if (this.regel.status === 'overgeslagen') delen.push(t('Skipped'))
			return delen.join(' · ')
		},
		/** Een bedrag met het teken van je eigen munt ervoor; zonder bekende munt alleen het getal. */
		metValuta(bedrag, decimalen) {
			const getal = Number(bedrag).toFixed(decimalen)
			try {
				const opmaak = new Intl.NumberFormat(currentLocale(), { style: 'currency', currency: this.muntCode() })
				const deel = opmaak.formatToParts(0).find((p) => p.type === 'currency')
				return deel ? deel.value + ' ' + getal : getal
			} catch (e) {
				return getal
			}
		},
		/**
		 * De munt die bij je land hoort, afgeleid uit je taalkeuze.
		 *
		 * De server stuurt geen munt mee, dus die leiden we hier af -- net als de telefoon doet met
		 * Currency.getInstance(Locale). Alleen de landen die de app kent staan erin; al het andere wordt
		 * euro, want daar zit het gebruik. Een verkeerd teken is erger dan geen, dus bij twijfel valt
		 * metValuta terug op het kale getal.
		 */
		muntCode() {
			const regio = String(currentLocale() || '').split(/[-_]/)[1]
			const perLand = { GB: 'GBP', US: 'USD', BR: 'BRL', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN' }
			return perLand[(regio || '').toUpperCase()] || 'EUR'
		},
		navigateUrl() {
			const p = this.regel.naar
			if (this.regel.soort !== 'rit' || !p || p.lat == null || p.lon == null) return ''
			return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(p.lat + ',' + p.lon)
		},
		huidigVervoer() {
			const s = this.regel.vervoer && this.regel.vervoer.soort
			return ({ auto: 'driving', fiets: 'cycling', lopen: 'walking', trein: 'training' })[s] || null
		},
		modes() {
			const km = this.regel.vervoer && this.regel.vervoer.km
			const alle = [
				{ id: 'driving', icon: '🚗', label: t('Car') },
				{ id: 'cycling', icon: '🚲', label: t('Bike'), max: 30 },
				{ id: 'walking', icon: '🚶', label: t('On foot'), max: 8 },
				{ id: 'training', icon: '🚆', label: t('Public transport') },
			]
			return alle.filter((m) => !m.max || !km || km <= m.max || m.id === (this.currentMode || this.huidigVervoer))
		},
		andereZone() {
			try { return this.regel.zone !== Intl.DateTimeFormat().resolvedOptions().timeZone } catch (e) { return false }
		},
	},
	methods: {
		vraagZin,
		/** Welke knoppen onder deze vraag horen (RegelKaarten.kt:2419); null = geen rij. */
		vraagHotel(v) { const a = vraagActies(v); return !!(a && a.hotel) },
		vraagAdres(v) { const a = vraagActies(v); return !!(a && a.adres) },
		vraagHalen(v) { const a = vraagActies(v); return !!(a && a.halen) },
		vraagCadeau(v) { const a = vraagActies(v); return !!(a && a.cadeau) },
		vraagEerder(v) { const a = vraagActies(v); return a ? a.eerdereTips : null },
		vraagAanname(v) { const a = vraagActies(v); return a ? a.aanname : null },
		/** De vervoerknoppen van de vraag: dezelfde lijst als bij een rit. */
		vraagVervoer(v) {
			const a = vraagActies(v)
			return a && a.vervoer ? this.modes : []
		},

		/**
		 * Zeggen dat deze kaart niet klopt (kaart 218). De kaart zelf gaat mee zoals de server hem stuurde;
		 * daar zoekt hij het spoor bij. Zonder die twee samen is een melding niet na te spelen.
		 */
		async stuurMelding() {
			if (this.meldBezig) return
			this.meldBezig = true
			const r = this.regel
			try {
				await paApi.meldFout(getAccessCode(), {
					regelId: r.id,
					bron: r.bron || null,
					titel: (r.inhoud || {}).titel || this.titel,
					soort: r.soort,
					dag: r.begin ? new Date(r.begin * 1000).toISOString().slice(0, 10) : null,
					bericht: this.meldTekst,
					regel: r,
					platform: 'web',
				})
				this.meldGedaan = true
				setTimeout(() => { this.meldOpen = false; this.meldGedaan = false; this.meldTekst = '' }, 1200)
			} catch (e) {
				// Niet verstuurd: laat het regeltje open staan, dan kun je het zo nog eens proberen.
			}
			this.meldBezig = false
		},
		/**
		 * De persoon uit de uitnodiging bij je contacten zetten, zodat je hem straks terugvindt bij het
		 * gesprek (Ramin, 23-09: *"dan koppel je die persoon aan de (video)call"*).
		 */
		async bewaarContact() {
			const c = (this.uitnodiging || {}).contact
			if (!c || !c.name || this.contactBezig) return
			this.contactBezig = true
			try {
				await paApi.saveAccountContact(getAccessCode(), { fullName: c.name, email: c.email || null, phone: c.phone || null })
				this.contactGedaan = true
			} catch (e) {
				this.contactBezig = false
			}
		},
		t,
		naam(plek) {
			if (!plek) return ''
			return plek.locatie || plek.stad || plek.regio || plek.land || ''
		},
		klok(sec) {
			if (sec == null) return '?'
			const opties = { hour: '2-digit', minute: '2-digit' }
			if (this.regel.zone) opties.timeZone = this.regel.zone
			try { return new Date(sec * 1000).toLocaleTimeString(currentLocale(), opties) } catch (e) { return new Date(sec * 1000).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }) }
		},
		vraagTekst(v) {
			return ({
				needsAddress: t('Where is this? Add an address.'),
				needsTravelDecision: t('How do you travel there?'),
				needsAccommodation: t('Where do you sleep?'),
				needsTransferDecision: t('After landing: transfer, stay, or home?'),
				needsTransferFlight: t('Which flight is next?'),
			})[v] || t('Question')
		},
	},
}
</script>

<style scoped>
/* Het label COST/TIME: het vette deel zegt wat deze pomp is. */
.pa-tanklabel { letter-spacing: 0.04em; }
.pa-tanklabel .dik { font-weight: 700; }

/* De uitleg waarom dit er staat: even zacht als de feiten, maar een hele zin. */
.waarom { font-size: 12.5px; color: var(--pa-ink3); margin: -6px 0 10px; }
/* Het vraagtekentje van "dit klopt niet": klein en grijs, want je hebt het zelden nodig. */
.pa-meld__knop { font: inherit; font-size: 12px; width: 24px; height: 24px; border-radius: 50%;
	border: 1px solid var(--pa-line); background: transparent; color: var(--pa-ink3); cursor: pointer;
	line-height: 1; padding: 0; }
.pa-meld__knop:hover { color: var(--pa-ink); }
.pa-meld { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
.pa-meld__veld { flex: 1; min-width: 140px; font: inherit; font-size: 13px; padding: 6px 9px;
	border: 1px solid var(--pa-line); border-radius: 9px; background: var(--pa-surface); color: var(--pa-ink); }

/* "Uit je mail": zegt waar deze knoppen vandaan komen, zonder de knoppen zelf te verzwaren. */
.pa-uit__bron { font-size: 11.5px; color: var(--pa-ink3); align-self: center; }
/* De vormgeving komt uit kaarten.css (overgezet uit site/kaarten.html). Hier staat alleen wat die
   demo-pagina niet kende: de wikkel eromheen, het icoontje, en de paar toestanden van de app. */
.pa-kaarten { margin-bottom: 10px; }
.kaart .titel { flex: 1; min-width: 0; }
.pa-regel__icoon { font-size: 15px; line-height: 1; flex: none; }
.kop .knopjes { display: flex; align-items: center; gap: 6px; }
.kop .knopjes .knop { min-height: 30px; padding: 0 10px; font-size: 12.5px; }
.pa-regel__vraag { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12.5px; }
/* Afgevinkt blijft staan, maar vraagt geen aandacht meer -- zoals .stap.gedaan in het ontwerp. */
.kaart.pa-regel--klaar { opacity: .5; }
/* Een kind hoort zichtbaar onder zijn hoofdkaart, niet ernaast. */
.pa-regel--kind { margin-left: 14px; }
/* Op het donkere vlak van een afspraak moet de bijtekst van kleur veranderen. Design gaf die kaart
   .soort en .waar mee; onze tijdrij en feitenregel stonden er nog in het donkergrijs van een lichte
   kaart, en dat was op navy nauwelijks te lezen. */
/* Laat weten staat rechts (Ramin: geen link-achtige tekst, een omlijnde knop). */
.acties--rechts { justify-content: flex-end; }
</style>
