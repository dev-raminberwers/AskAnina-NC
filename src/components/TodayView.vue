<template>
	<div class="pa-today">
		<h2>
			<!-- Een dag terug of vooruit (Ramin, 24-09: "ik kan geen dag naar voren of achteren"). De
			     telefoon heeft die pijltjes naast de titel; hier stonden ze nog niet, waardoor je aan
			     vandaag vastzat. -->
			<button type="button" class="pa-today__dag" :title="t('Previous day')" @click="verschuifDag(-1)">‹</button>
			{{ dateLabel }}
			<button type="button" class="pa-today__dag" :title="t('Next day')" @click="verschuifDag(1)">›</button>
			<button v-if="!isVandaag" type="button" class="pa-today__vandaag" @click="gaNaarVandaag">{{ t('Today') }}</button>
			<!-- F3/F5: waar je bent en de modus van dit moment, uit de dag-lijst van de server. -->
			<button v-if="modus" type="button" class="pa-today__modus" :class="{ 'pa-today__modus--zelf': modus.bron === 'override' }" :title="t('Mode')" @click="modusKiezer = !modusKiezer">{{ modusTekst }}</button>
		</h2>
		<!-- Zelf een modus kiezen (V3): knoppen, geldt tot middernacht; Automatisch geeft hem terug aan de server. -->
		<div v-if="modusKiezer" class="pa-today__moduskiezer">
			<p class="pa-today__modusuitleg">{{ t('Anina picks the mode from what you are doing right now, according to your day. Choose one yourself to override it until midnight.') }}</p>
			<div class="pa-today__chips">
				<button type="button" class="pa-today__chip" :class="{ 'pa-today__chip--active': !modusKeuze }" @click="kiesModus(null)">{{ t('Automatic') }}</button>
				<button v-for="m in modusNamen" :key="m.id" type="button" class="pa-today__chip" :class="{ 'pa-today__chip--active': modusKeuze === m.id }" @click="kiesModus(m.id)">{{ m.label }}</button>
			</div>
		</div>

		<FoutMelding v-if="error" :error="error" />
		<NcNoteCard v-else-if="!selectedCalendars.length && !loading" type="warning">
			{{ t('No calendars selected yet — pick one or more under Settings.') }}
		</NcNoteCard>

		<!-- Alleen een rondje als er nog niets staat. Ververst de dag terwijl je kijkt, dan zegt de
		     statusbalk wat er loopt en blijft je dag gewoon in beeld (Ramin, 24-09). -->
		<NcLoadingIcon v-if="loading && !regels.length" :size="32" />

		<template v-else>
			<!-- Dun kaartje "Open taken" (Ramin, 2026-09-14): de pil is rood voor wat
			     al verlopen is, geel voor binnen twee dagen, groen voor ruim op tijd. -->
			<!-- Wat je hebt afgedaan en achter je ligt, terughalen (Ramin, 24-09). Dezelfde knop als op de
			     telefoon: weg uit beeld is niet weg uit je dag. -->
			<button type="button" class="pa-today__vorige" @click="toontVorige = !toontVorige">
				{{ toontVorige ? t('Hide what is done') : t('Show previous 24 hours') }}
			</button>
			<!-- De dag-lijst (structuurplan §11): dezelfde regels als de telefoon; sinds F8 (22-09) de enige
			     weergave.

			     Hier stond een kale <template> omheen, zonder v-if of v-for. Vue tekent daar niets van: de
			     hele dag-lijst, "Niets gepland" en het hotelpaneel verdwenen uit beeld terwijl de server
			     gewoon zes regels teruggaf (Ramin, 24-09: "waarom staan er hier geen afspraken"). Geen
			     foutmelding, geen lege lijst -- alleen niets. Dus: geen wikkel zonder reden. -->
			<template v-for="blok in regelBlokken" :key="blok.sleutel">
				<!-- De stip van nu (Ramin, 22-09: "verticaal links van de card"): een streepje naast wat er
				     nu loopt, met de stip op het punt tussen begin en eind waar je bent. Klaar is klaar --
				     wat je hebt afgevinkt krijgt hem niet meer (23-09: "het bolletje kan nu weg"). Eén wikkel
				     om alle soorten rijen heen, zodat de kaarten zelf hier niets van hoeven te weten. -->
				<!-- Er komt vandaag niets meer: de afsluiter staat vóór de eerste rij van een volgende dag,
				     zoals op de telefoon. Zo weet je dat de rest van de rol al morgen is. -->
				<div v-if="klaarVandaag && blok.dagStreep && blok.dagStreep > vandaagSleutel" class="pa-kaarten pa-klaar">
					<div class="kaart">
						<div class="kop"><span class="pa-blok__icoon" aria-hidden="true">✅</span>
							<span class="titel">{{ t('No more appointments for today') }}</span></div>
						<p class="pa-klaar__tekst">{{ t('Everything for today is done. Enjoy the rest of your day.') }}</p>
					</div>
				</div>
				<div class="pa-rij" :class="{ 'pa-rij--nu': fractieNu(blok) !== null }">
					<span v-if="fractieNu(blok) !== null" class="pa-rij__lijn" aria-hidden="true">
						<span class="pa-rij__stip" :style="{ top: (fractieNu(blok) * 100) + '%' }"></span>
					</span>
					<div class="pa-rij__inhoud">
					<!-- De scheiding tussen twee dagen. De rol loopt door; zonder streep weet je niet meer
					     welke dag je leest (Ramin, 24-09). -->
					<div v-if="blok.dagStreep" class="pa-dagstreep">
						<span>{{ dagNaam(blok.dagStreep) }}</span>
					</div>
					<!-- Een blok is ÉÉN kaart met zijn regels als stappen erin, zoals op de telefoon
					     (Ramin, 24-09: "volg alle kaarten zoals Android ze hebben"). Een werkdag was hier
					     drie losse kaarten: de rit erheen, het werk, de rit terug. -->
					<BlokKaart v-else-if="blok.reis || blok.werk || blok.stapel || blok.afspraakBlok"
						:blok="blok" :item-status="itemStatus"
						:werkelijk="werkelijkPerRegel"
						@toggle-done="toggleDone" @mode="setModeVoorId" @open="openRegel"
						@negeer="negeerStop" @halen="(v, patroon) => antwoordHalen(v, patroon)"
						@cadeau="(v, keuze) => antwoordCadeau(v, keuze)"
						@hotel="kiesHotelVoorRegel" @address="openAdres" />
					<!-- Thuis is geen afspraak maar een grens van de dag: een dunne regel, geen kaart. -->
					<div v-else-if="blok.regels[0].soort === 'thuis'" class="pa-thuisregel">
						<span>🏠 {{ t('Home') }}</span>
						<span class="pa-thuisregel__tijd">{{ klokVoor(blok.regels[0]) }}</span>
					</div>
					<GapCard v-else-if="blok.regels[0].soort === 'gat'" :gap="gapVanRegel(blok.regels[0])" />
					<!-- Een feestdag is geen afspraak (Ramin, 26-09): geen DONE, geen prullenbak, geen wekker.
					     Alleen wat er is. -->
					<FeestdagKaart v-else-if="blok.regels[0].soort === 'feestdag'" :regel="blok.regels[0]" />
					<RegelKaart v-else :regel="blok.regels[0]" :kleur="agendaKleurVan(blok.regels[0])"
						:current-mode="vervoerKeuze(blok.regels[0])"
						:show-modes="toontVervoer(blok.regels[0])" @hotel="kiesHotelVoorRegel(blok.regels[0])" @address="openAdres(blok.regels[0])"
						@mode="setModeVoorId(blok.regels[0].bron, $event)"
						@halen="(v, patroon) => antwoordHalen(v, patroon)"
						@cadeau="(v, keuze) => antwoordCadeau(v, keuze)"
						:done="blok.regels[0].niveau === 0 && !!standVan(blok.regels[0].id)?.doneAt"
						:deletable="blok.regels[0].niveau === 0 && !!eventVoorRegel(blok.regels[0]) && verwijderbaar(eventVoorRegel(blok.regels[0]))"
						:recurring="isReeks(eventVoorRegel(blok.regels[0]))"
						:vragen="blok.vragen || []"
						:werkelijk="werkelijkPerRegel"
						@toggle-done="toggleDone(blok.regels[0].id)"
						@delete="verwijderEvent(eventVoorRegel(blok.regels[0]), $event)"
						@click="eventVoorRegel(blok.regels[0]) && toggleDetail({ event: eventVoorRegel(blok.regels[0]), cardType: blok.regels[0].inhoud?.cardType })" />
					</div>
				</div>
			</template>
			<CardDetailForm v-if="expandedEventId" :key="'r-' + expandedEventId" :card-type="'afspraak'" :event-uid="expandedEventId"
				:werkelijk="werkelijkPerRegel" :regel="regelVoorId(expandedEventId)" class="pa-today__detail" />
			<!-- Hotel kiezen vanuit een vraag-regel (F5): zelfde paneel als bij de oude reiskaart. -->
			<div v-if="hotelKeuze && hotelKeuze.regel" class="pa-hotel">
				<h3>{{ t('Choose a hotel') }}</h3>
				<p v-if="hotelKeuze.laden">{{ t('Searching hotels near %s…', hotelKeuze.stap.tripStep?.airportName || '') }}</p>
				<p v-else-if="!hotelKeuze.hotels.length">{{ t('No hotels found nearby.') }}</p>
				<button v-for="h in hotelKeuze.hotels" :key="h.name + h.lat" type="button" class="pa-hotel__rij" :class="{ 'pa-hotel__rij--gekozen': hotelKeuze.gekozen === h }" @click="hotelKeuze.gekozen = h">
					<span class="pa-hotel__naam">{{ h.name }}</span>
					<span v-if="h.address || h.city" class="pa-hotel__adres">{{ [h.address, h.city].filter(Boolean).join(', ') }}</span>
				</button>
				<label class="pa-hotel__tot">{{ t('Until when do you stay?') }} <input v-model="hotelKeuze.tot" type="date"></label>
				<div class="pa-hotel__knoppen">
					<NcButton type="primary" :disabled="!hotelKeuze.gekozen || !hotelKeuze.tot || hotelKeuze.bezig" @click="bewaarHotel">{{ t('Save hotel') }}</NcButton>
					<NcButton @click="hotelKeuze = null">{{ t('Cancel') }}</NcButton>
				</div>
			</div>
			<div v-if="klaarVandaag && !klaarVoorMorgen" class="pa-kaarten pa-klaar">
				<div class="kaart">
					<div class="kop"><span class="pa-blok__icoon" aria-hidden="true">✅</span>
						<span class="titel">{{ t('No more appointments for today') }}</span></div>
					<p class="pa-klaar__tekst">{{ t('Everything for today is done. Enjoy the rest of your day.') }}</p>
				</div>
			</div>
			<p v-if="!regels.length" class="pa-today__empty">{{ t('Nothing planned.') }}</p>

			<div class="pa-today__knoppen">
				<NcButton v-if="!showAdd && selectedCalendars.length" @click="openAdd">
					<template #icon>
						<MaterialIcoon naam="add" :size="20" />
					</template>
					{{ t('Add appointment') }}
				</NcButton>
				<!-- Herinnering (Deck 78, 2026-09-15): tekst, datum, tijd, klaar. -->
				<NcButton v-if="!herinnering && selectedCalendars.length" @click="openHerinnering">{{ t('Reminder') }}</NcButton>
				<!-- Anina met AI, voorproefje (Deck 41, 2026-09-15). -->
				<NcButton v-if="!aninaOpen" @click="openAnina">{{ t('Ask Anina') }}</NcButton>
			</div>
			<form v-if="herinnering" class="pa-today__herinnering" @submit.prevent="saveHerinnering">
				<NcTextField :model-value="herinnering.tekst" :label="t('What should I remind you of?')" @update:model-value="(v) => (herinnering.tekst = v)" />
				<div class="pa-today__herinnering-rij">
					<input v-model="herinnering.datum" type="date" :title="t('Date')">
					<input v-model="herinnering.tijd" type="time" :title="t('Time')">
					<NcButton type="primary" native-type="submit" :disabled="herinneringBezig || !herinnering.tekst.trim() || !herinnering.datum || !herinnering.tijd">{{ t('Add reminder') }}</NcButton>
					<NcButton @click="herinnering = null">{{ t('Cancel') }}</NcButton>
				</div>
				<FoutMelding v-if="herinneringFout" :error="herinneringFout" />
			</form>
			<AninaChat v-if="aninaOpen" :owner-key="getAccessCode()" :context="aninaContext" :begin-vraag="aninaVraag" :akkoord="!!settings?.novaConsent" :api-key="aninaSleutel" :workspace-id="settings?.anthropicWorkspaceId || ''" :provider="settings?.aiProvider || ''" :taal="settings?.novaTaal || ''" @close="aninaOpen = false; aninaVraag = ''" @akkoord="aninaAkkoord" @ga-naar="aninaGaNaar" @formulier="aninaFormulier" />

			<div v-if="showAdd" class="pa-today__add">
				<NcTextField :model-value="addForm.title" :label="t('Title')" @update:model-value="(v) => (addForm.title = v)" />
				<div v-if="selectedCalendars.length > 1" class="pa-today__chips">
					<button v-for="calendar in selectedCalendars" :key="calendar.href" type="button"
						class="pa-today__chip" :class="{ 'pa-today__chip--active': addCalendar?.href === calendar.href }"
						@click="addCalendar = calendar">{{ calendar.displayName }}</button>
				</div>
				<div class="pa-today__row">
					<input type="date" v-model="addForm.startDate" class="pa-today__date" @change="onAddStartChanged">
					<input type="time" v-model="addForm.startTime" class="pa-today__time" @change="onAddStartChanged">
				</div>
				<div class="pa-today__row">
					<input type="date" v-model="addForm.endDate" class="pa-today__date">
					<input type="time" v-model="addForm.endTime" class="pa-today__time">
				</div>
				<NcTextField :model-value="addForm.location" :label="t('Location')" @update:model-value="onAddLocationChanged" />
				<ul v-if="addLocationSuggestions.length" class="pa-today__location-suggestions">
					<li v-for="s in addLocationSuggestions" :key="s.display_name" @click="pickAddLocationSuggestion(s)">
						{{ s.display_name }}
					</li>
				</ul>
				<NcLoadingIcon v-if="travelPreviewLoading" :size="16" />
				<p v-if="travelPreview" class="pa-today__travel-preview">{{ travelPreview }}</p>
				<!-- Aansluiten op de volgende afspraak (kaart 112, 2026-09-16). -->
				<p v-if="aansluit" class="pa-today__travel-preview">
					{{ t('Next: %s at %s. To be there in time you must leave here by %s.', aansluit.titel, aansluit.start, aansluit.einde) }}
					<NcButton @click="aansluiten">{{ t('Connect to it') }}</NcButton>
				</p>
				<NcTextField :model-value="addForm.description" :label="t('Description')" @update:model-value="(v) => (addForm.description = v)" />
				<div class="pa-today__row">
					<label for="pa-add-recurrence">{{ t('Repeat') }}</label>
					<select id="pa-add-recurrence" v-model="addForm.recurrence">
						<option value="NONE">{{ t('Never') }}</option>
						<option value="DAILY">{{ t('Every day') }}</option>
						<option value="WEEKLY">{{ t('Every week') }}</option>
						<option value="BIWEEKLY">{{ t('Every two weeks') }}</option>
						<option value="MONTHLY">{{ t('Every month, same date') }}</option>
						<option value="MONTHLY_NTH">{{ t('Every month, same weekday') }}</option>
						<option value="YEARLY">{{ t('Every year') }}</option>
					</select>
					<input v-if="addForm.recurrence !== 'NONE'" id="pa-add-recurrence-until" type="date" v-model="addForm.recurrenceUntil" class="pa-today__date" :title="t('Until (optional)')">
				</div>
				<div v-if="addForm.recurrence !== 'NONE' && addForm.recurrence !== 'BIWEEKLY'" class="pa-today__row">
					<label for="pa-add-recurrence-interval">{{ t('Every') }}</label>
					<input id="pa-add-recurrence-interval" v-model.number="addForm.recurrenceInterval" type="number" min="1" max="366" class="pa-today__num">
					<label for="pa-add-recurrence-count">{{ t('How many times (optional)') }}</label>
					<input id="pa-add-recurrence-count" v-model.number="addForm.recurrenceCount" type="number" min="1" max="999" class="pa-today__num">
				</div>
				<NcNoteCard v-if="addError" type="error">{{ addError }}</NcNoteCard>
				<NcNoteCard v-if="addConflict" type="warning">
					This overlaps with “{{ addConflict }}”. Press save again to add it anyway.
				</NcNoteCard>
				<div class="pa-today__add-actions">
					<NcButton type="primary" :disabled="!canSaveAdd || adding" @click="saveAdd">{{ t('Save') }}</NcButton>
					<NcButton @click="cancelAdd">{{ t('Cancel') }}</NcButton>
				</div>
			</div>
		</template>
	</div>
</template>

<script>
import MaterialIcoon from './MaterialIcoon.vue'
import { t, currentLocale } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import FoutMelding from './FoutMelding.vue'
import { laadTermijnen, verdeling } from '../api/termijnen.js'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import { getAccessCode } from '../api/accessCode.js'
import { namenVoor } from '../api/naamKoppeling.js'
import { getSettings, setSettings, listItemStatus, setItemStatus, invalidateUserData, listTravelChoices, setTravelChoice } from '../api/nextcloudUserData.js'
import * as paApi from '../api/paApi.js'
import { watch } from 'vue'
import { staat as sync } from '../api/sync.js'
import { fetchCalendarData, createEvent, deleteEvent, gekozenKalenders } from '../api/nextcloudCalendar.js'
import { parseEventsForDay, plaatsenUit } from '../api/icsEvents.js'
import { discoverAddressBooks, listContacts, listDeckBoards, listDeckStacks, listNotes } from '../api/shortcutSources.js'
import { zetVoorinvulling } from '../api/voorinvulling.js'
import { workEventsFor, nestUnderWork, nestSleutel, werktThuis, dagSleutel, isVluchtKetting, isVerblijf } from '../api/workBlock.js'
import GapCard from './cards/GapCard.vue'
import FeestdagKaart from './cards/FeestdagKaart.vue'
// Wat een afspraak tot een BLOK maakt: er moet een berekende stap omheen staan. Letterlijk dezelfde
// verzameling als Android (RegelKaarten.kt, `stappen`), zodat web en telefoon dezelfde kaart tonen.
const BLOK_STAPPEN = new Set(['rit', 'gat', 'tankstop', 'parkeren'])

import RegelKaart from './cards/RegelKaart.vue'
import BlokKaart from './cards/BlokKaart.vue'
import { klokVan, isDagBeginThuis } from './cards/regelTekst.js'
import AninaChat from './AninaChat.vue'
import CardDetailForm from './CardDetailForm.vue'

export default {
	name: 'TodayView',
	components: { MaterialIcoon, FoutMelding, NcButton, NcTextField, NcLoadingIcon, NcNoteCard, GapCard, FeestdagKaart, CardDetailForm, AninaChat, RegelKaart, BlokKaart },
	props: {
		// Optional jump-in date — set when Overview's "day-click" lands here
		// (mirrors Android's TODAY_ROUTE_PATTERN optional-date arg). Defaults
		// to today when unset.
		initialDate: { type: Date, default: null },
	},
	data() {
		return {
			loading: true,
			// Staat het vorige etmaal open? Dan blijft ook staan wat je al hebt afgedaan (24-09).
			toontVorige: false,
			// Loopt de wacht-op-wijziging-lus nog? Uit bij het verlaten van het scherm (24-09).
			wacht: false,
			zichtbaarheid: null,
			stopKijken: null,
			error: null,
			items: [],
			// F5: de nieuwe dag-lijst en de modus van dit moment (structuurplan); schakelaar onthouden in de browser.
			// De rol: per dag de regels, op volgorde. regels[] hieronder is het geheel achter elkaar.
			dagen: [],
			// Kaarten van de server per dagsleutel (27-09). null = die server stuurde ze niet mee.
			kaartenPerDag: {},
			// Hoeveel dagen de rol toont. Begint op één: elke dag kost een eigen berekening en drie
			// agenda-opvragen, dus drie dagen vooraf ophalen verdrievoudigde het verkeer van één keer
			// laden -- en dat liep 24-09 meteen tegen de uurlimiet aan. De volgende dag komt erbij zodra
			// je er bijna bent (zie meerDagen), en dat is ook precies wat Ramin vroeg: doorlopen tot iets
			// uit beeld gaat, niet vooruit ophalen wat je misschien nooit ziet.
			rolDagen: 1,
			rolBezig: false,
			modus: null,
			modusKiezer: false,
			modusKeuze: leesModusKeuze(),
			// Taken en Deck-kaarten met een datum, voor het dunne kaartje "Open taken".
			openTaken: [],
			// Wat er werkelijk gebeurde, op regel-id (kaart 220). De telefoon meldt het, wij tekenen het.
			werkelijkPerRegel: {},
			// Wanneer een seintje voor het laatst een herberekening gaf; zie de vangrail in mounted().
			laatsteSeinLoad: 0,
			// Gedaan / bezig / gearchiveerd per afspraak, uit het versleutelde
			// bestand — dezelfde bron als de telefoon (2026-09-13).
			itemStatus: {},
			travelChoices: {},
			werkKinderen: {},
			genest: new Set(),
			hotelKeuze: null,
			// Statusbalk: het weer (30 min server-cache) en wanneer we laatst laadden.
			weer: null,
			bijgewerkt: null,
			aninaOpen: false,
			/** Een vraag die Anina meteen stelt bij het openen (cadeau-ideeen). */
			aninaVraag: '',
			herinnering: null,
			herinneringBezig: false,
			herinneringFout: null,
			// De komende 14 dagen in het kort, alleen voor Anina (geladen bij het openen van het paneel).
			komend: [],
			komendBezig: false,
			// Namen uit de contacten en eerdere afspraken met een adres, om "bij Bart"
			// op te zoeken bij een ingesproken afspraak (Ramin, 2026-09-16).
			aninaMensen: [],
			aninaPlekken: [],
			// Waar een taak, Deck-kaart of notitie heen kan (kaart 100).
			aninaTakenlijsten: [],
			aninaBorden: [],
			aninaMappen: [],
			// Waar een taak, Deck-kaart of notitie heen kan (kaart 100).
			aninaTakenlijsten: [],
			aninaBorden: [],
			aninaMappen: [],
			// Waar een taak, Deck-kaart of notitie heen kan (kaart 100).
			aninaTakenlijsten: [],
			aninaBorden: [],
			aninaMappen: [],
			// Waar een taak, Deck-kaart of notitie heen kan (kaart 100).
			aninaTakenlijsten: [],
			aninaBorden: [],
			aninaMappen: [],
			werktThuisVandaag: false,
			settings: null,
			accessCode: getAccessCode(),
			selectedCalendars: [],
			date: this.initialDate || new Date(),
			expandedEventId: null,
			// "Add appointment" (2026-09-09, Ramin: "In de Nextcloud app zie
			// ik geen mogelijkheid om een item toe te voegen, bij android
			// wel") — inline expanding form, not NcModal, same reasoning as
			// LocationsView.vue's own add-form.
			showAdd: false,
			adding: false,
			addError: null,
			// This day's events, kept so a new appointment can be checked
			// for an overlap before it is saved.
			dayEvents: [],
			// Set when the backend reports the new appointment clashes with
			// something; the user can then save anyway or go back and change it.
			addConflict: null,
			addCalendar: null,
			addForm: { title: '', startDate: '', startTime: '09:00', endDate: '', endTime: '10:00', location: '', description: '', recurrence: 'NONE', recurrenceUntil: '', recurrenceInterval: 1, recurrenceCount: '' },
			addLocationSuggestions: [],
			addLocationSuppressUntilNextEdit: false,
			addLocationTimer: null,
			addLocationLat: null,
			addLocationLon: null,
			// Live travel-time preview (Ramin, 2026-09-09: "bij het invoeren
			// van het adres gelijk osrm-en") — same logic as Android's own
			// AddAppointmentDialog: routes from whichever real event on
			// this day ends right before the new one starts, falling back
			// to Home only when there's nothing earlier that day.
			travelPreview: null,
			travelPreviewLoading: false,
			/** De volgende afspraak van de dag en hoe laat je hier uiterlijk weg moet (kaart 112). */
			aansluit: null,
		}
	},
	computed: {
		/** De regels in blokken: een groep met een vlucht erin wordt één reisblok, de rest staat los. */
		/**
		 * Wat er in de lijst hoort: alles behalve wat je hebt afgedaan en meer dan twee uur voorbij is
		 * (Ramin, 23-09). Je dag gaat over wat er nog komt; wat klaar is en achter je ligt, hoeft niet
		 * mee te scrollen. Dezelfde grens als op de telefoon.
		 */
		/** Alle dagen van de rol achter elkaar; de rest van het scherm rekent hier gewoon mee door. */
		regels() {
			return this.dagen.flatMap((d) => d.regels || [])
		},
		zichtbareRegels() {
			// De thuis-regel van middernacht zegt niets (Ramin, 24-09: "De Thuis card aan het begin mag
			// weg"); die van het eind van de dag -- weer thuis -- blijft. Zelfde regel als op de telefoon.
			const lijst = this.regels.filter((r) => !isDagBeginThuis(r))
			if (this.toontVorige) return lijst
			const nu = Math.floor(Date.now() / 1000)
			return lijst.filter((r) => {
				const eind = r.eind || r.begin
				const afgedaan = !!this.standVan(r.id)?.doneAt || r.status === 'klaar' || r.status === 'overgeslagen'
				return !(afgedaan && eind != null && eind < nu - 2 * 3600)
			})
		},
		regelBlokken() {
			// De server levert de kaarten (27-09). Alleen tekenen; niet zelf groeperen -- dat deden web en
			// telefoon ieder apart en dan lopen ze uit elkaar.
			const vanServer = this.blokkenVanServer()
			if (vanServer !== null) return vanServer
			const perGroep = {}
			for (const r of this.zichtbareRegels) {
				const g = r.groep || r.bron || r.id
				if (!perGroep[g]) perGroep[g] = []
				perGroep[g].push(r)
			}
			const reisGroepen = new Set(Object.keys(perGroep).filter((g) => perGroep[g].some((r) => r.soort === 'vlucht')))
			// Werkdag: de werk-regel, de rit erheen (bron = werk), de kinderen (container = werk) en de rit terug.
			const werkIds = new Set(this.zichtbareRegels.filter((r) => r.soort === 'werk' && r.niveau === 0).map((r) => r.id))
			const werkVan = (r) => (werkIds.has(r.id) ? r.id : (r.container && werkIds.has(r.container) ? r.container : (r.bron && werkIds.has(r.bron) ? r.bron : null)))
			const perWerk = {}
			for (const r of this.zichtbareRegels) { const w = werkVan(r); if (w) { if (!perWerk[w]) perWerk[w] = []; perWerk[w].push(r) } }
			// Stapels: herinneringen en afleveringen die kort na elkaar komen worden een kaart, zoals op de
			// telefoon. Drie series om 20:00 zijn een kaart en geen drie schermen scrollen. Staat er iets
			// anders tussen, dan horen ze niet bij elkaar -- anders valt een afspraak van half vier
			// onzichtbaar weg tussen twee herinneringen van drie en vier uur.
			const samenNemen = { herinnering: 'herinneringen', entertainment: 'vermaak' }
			const stapelVan = {}
			const stapelRegels = {}
			const dagVan = (r) => (r.begin == null ? 'x' : String(Math.floor(r.begin / 86400)))
			for (const soortNaam of Object.keys(samenNemen)) {
				const vanDeze = this.zichtbareRegels
					.filter((r) => r.soort === 'afspraak' && r.niveau === 0 && (r.inhoud || {}).cardType === soortNaam && r.begin != null)
					.sort((a, b) => a.begin - b.begin)
				let groep = []
				const sluit = () => {
					if (groep.length >= 2) {
						const sleutel = samenNemen[soortNaam] + '-' + groep[0].id + '@' + dagVan(groep[0])
						for (const x of groep) stapelVan[x.id + '@' + dagVan(x)] = sleutel
						stapelRegels[sleutel] = groep.slice()
					}
					groep = []
				}
				for (const h of vanDeze) {
					const vorige = groep[groep.length - 1]
					const ertussen = vorige && this.zichtbareRegels.some((a) => a.niveau === 0 && a.begin != null
						&& a !== vorige && a !== h && (a.inhoud || {}).cardType !== soortNaam
						&& a.begin > vorige.begin && a.begin < h.begin)
					if (vorige && (dagVan(vorige) !== dagVan(h) || h.begin - vorige.begin > 2 * 3600 || ertussen)) sluit()
					groep.push(h)
				}
				sluit()
			}
			const uit = []
			const gedaan = new Set()
			// De dag waar een blok bij hoort, zodat er een scheiding tussen kan (Ramin, 24-09). De rol
			// loopt door over dagen heen; zonder die streep weet je niet meer waar je bent.
			let vorigeDag = null
			const dagStreep = (r) => {
				const d = r.rolDag || null
				if (d && d !== vorigeDag) {
					vorigeDag = d
					// rolDag is "2026-09-25"; als datum voorstellen zonder tijdzone-verrassing.
					const [j, m, dd] = d.split('-').map(Number)
					uit.push({ sleutel: 'dag-' + d, dagStreep: new Date(j, m - 1, dd) })
				}
			}
			const klokVan = (sec, zone) => {
				if (sec == null) return '?'
				try { return new Date(sec * 1000).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit', timeZone: zone || undefined }) } catch (e) { return new Date(sec * 1000).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }) }
			}
			for (const r of this.zichtbareRegels) {
				const g = r.groep || r.bron || r.id
				const w = werkVan(r)
				const sb = stapelVan[r.id + '@' + dagVan(r)]
				dagStreep(r)
				if (sb) {
					if (gedaan.has(sb)) continue
					gedaan.add(sb)
					const regels = stapelRegels[sb]
					const vermaak = sb.startsWith('vermaak-')
					uit.push({
						sleutel: sb,
						stapel: true,
						regels,
						titel: vermaak ? t('%s episodes', String(regels.length)) : t('%s reminders', String(regels.length)),
						tijd: klokVan(regels[0].begin, regels[0].zone) + ' – ' + klokVan(regels[regels.length - 1].eind || regels[regels.length - 1].begin, regels[regels.length - 1].zone),
					})
					continue
				}
				if (w && !reisGroepen.has(g)) {
					if (gedaan.has('werk-' + w)) continue
					gedaan.add('werk-' + w)
					const regels = perWerk[w]
					const werk = regels.find((x) => x.id === w)
					// De grote tijd op een werkdag is niet wanneer je werk begint, maar wanneer je de deur uit
					// moet (Ramin, 24-09: *"hier moet de tijd staan dat je van huis moet vertrekken"*). Er
					// stond 09:00 terwijl je om 07:47 weg moest -- en dat tweede is het getal waar je iets
					// aan hebt. De rit ernaartoe is de rit die eindigt waar het werk begint.
					const heenrit = regels.find((r) => r.soort === 'rit' && r.begin != null && werk?.begin != null && r.begin < werk.begin)
					uit.push({
						sleutel: 'werk-' + w, werk: true, regels,
						titel: werk?.inhoud?.titel || t('Work'),
						tijd: klokVan(werk?.begin, werk?.zone) + ' – ' + klokVan(werk?.eind, werk?.zone),
						vertrek: heenrit ? heenrit.begin : null,
					})
					continue
				}
				if (reisGroepen.has(g)) {
					if (gedaan.has(g)) continue
					gedaan.add(g)
					const regels = perGroep[g]
					const vlucht = regels.find((x) => x.soort === 'vlucht')
					const van = vlucht && vlucht.van ? (vlucht.van.locatie || vlucht.van.stad || '') : ''
					const naar = vlucht && vlucht.naar ? (vlucht.naar.locatie || vlucht.naar.stad || '') : ''
					const klok = (sec, zone) => {
						if (sec == null) return '?'
						try { return new Date(sec * 1000).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit', timeZone: zone || undefined }) } catch (e) { return new Date(sec * 1000).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }) }
					}
					uit.push({ sleutel: 'reis-' + g, reis: true, regels, titel: (vlucht?.inhoud?.titel || (van + ' → ' + naar)), tijd: klok(regels[0].begin, regels[0].zone) + ' – ' + klok(regels[regels.length - 1].eind, regels[regels.length - 1].zone) })
				} else if ((perGroep[g] || []).some((x) => x.soort === 'afspraak' && x.niveau === 0)
					// Zoals Android (RegelKaarten.kt): een afspraak wordt pas een blok als er ook echt een
					// berekende stap omheen staat. Zonder rit is het een gewone kaart -- op beide schermen.
					&& (perGroep[g] || []).some((x) => BLOK_STAPPEN.has(x.soort))) {
					// Een afspraak met de rit ernaartoe en terug hoort in EEN kaart (Ramin, 23-09): de
					// heenrit, de afspraak en de terugrit zijn samen een uitje, geen drie losse dingen.
					// Dezelfde groepering als de telefoon: alles wat dezelfde afspraak als bron heeft.
					if (gedaan.has('afspraak-' + g)) continue
					gedaan.add('afspraak-' + g)
					const regels = perGroep[g]
					// Deur tot deur, zoals Android het rekent: alleen de HOOFDLIJN telt. Wat binnen een
					// andere regel van deze groep valt -- een tankstop in de rit, een belletje onderweg --
					// verandert niet hoe laat je de deur uit moet.
					const hoofdlijn = regels.filter((h) => h.container == null || !regels.some((x) => x.id === h.container))
					const lijn = hoofdlijn.length ? hoofdlijn : regels
					const afspraak = lijn.find((x) => x.soort === 'afspraak' && x.niveau === 0)
					// De vroegste start en de LAATSTE aankomst, niet de eerste en laatste uit de lijst:
					// de tankstop staat achteraan maar eindigt eerder (Android, 23-09).
					const eerste = lijn.reduce((a, b) => ((a?.begin ?? Infinity) <= (b.begin ?? Infinity) ? a : b), null)
					const laatste = lijn.reduce((a, b) => (((a?.eind ?? a?.begin) ?? -Infinity) >= ((b.eind ?? b.begin) ?? -Infinity) ? a : b), null)
					uit.push({
						sleutel: 'afspraak-' + g,
						afspraakBlok: true,
						regels,
						// Dezelfde hoofdregel als Android kiest, en BlokKaart gebruikt hem ook -- anders
						// stond de titel zowel als kop als tussen de stappen (27-09).
						hoofdId: afspraak?.id || null,
						titel: afspraak?.inhoud?.titel || t('Appointment'),
						tijd: klokVan(eerste?.begin, eerste?.zone) + ' – ' + klokVan(laatste?.eind ?? laatste?.begin, laatste?.zone),
					})
				} else {
					uit.push({ sleutel: r.id, reis: false, regels: [r] })
				}
			}
			return uit
		},
		modusNamen() {
			return [
				{ id: 'thuis', label: t('Home') }, { id: 'werk', label: t('Work') }, { id: 'onderweg', label: t('On the way') }, { id: 'weg', label: t('Away') },
				{ id: 'plan', label: t('Planning') }, { id: 'nacht', label: t('Night') }, { id: 'in_meeting', label: t('In a meeting') }, { id: 'nauwkeurig', label: t('Precise') }, { id: 'verlof', label: t('Time off') },
			]
		},
		/**
		 * Wat je aan het doen bent, afgeleid uit de soort kaart (Ramin, 24-09: *"omdat het een STUDY card
		 * was, had het STUDYING moeten zijn"*). Deze namen zijn wel te tonen maar niet zelf te kiezen --
		 * ze staan daarom hier en niet in modusNamen, dat de keuzeknoppen vult.
		 */
		bezigheidNamen() {
			return {
				studeren: t('Studying'), sporten: t('Working out'), eten: t('Eating'),
				bellen: t('On a call'), feest: t('Celebrating'), focus: t('Focus time'),
			}
		},
		modusTekst() {
			if (!this.modus) return ''
			const namen = { ...this.bezigheidNamen }
			for (const m of this.modusNamen) namen[m.id] = m.label
			let naam = namen[this.modus.naam] || this.modus.naam
			// Wat je aan het doen bent komt er pas bij als je de afspraak ook echt gestart hebt (Ramin,
			// 24-09: *"ik heb de knop Duolingo nog niet geklikt, dus niet gestart"*). Zolang je dat niet
			// deed zegt de balk alleen waar je bent.
			const bezigId = this.modus.bezigheidId
			if (this.modus.bezigheid && bezigId && this.standVan(bezigId)?.busySince) {
				naam = namen[this.modus.bezigheid] || this.modus.bezigheid
			}
			const waar = this.modus.waarLabel
			return waar && waar.toLowerCase() !== naam.toLowerCase() ? waar + ' · ' + naam : naam
		},
		/** Afspraken die hun ritten in de eigen kaart tekenen (kaart 114). */
		houdersMetStappen() {
			const uit = new Set()
			for (const item of this.items) {
				if (item.event && item.cardSteps) uit.add(item.event.id)
			}
			return uit
		},
		/** De plaats waar de dag begint (thuis), voor "Navigeren naar plaats/straat". */
		hierPlaats() {
			const thuis = this.items.find((i) => i.isHomeStart)
			const naam = thuis?.resolvedLocation?.display_name || this.settings?.homeAddress || ''
			return naam.split(',').pop().trim()
		},
		/** Kaarten met dezelfde tripKey, op volgorde van stap (server-stap reisgroep). */
		reisGroepen() {
			const uit = {}
			for (const item of this.items) {
				if (!item.tripKey) continue
				;(uit[item.tripKey] = uit[item.tripKey] || []).push(item)
			}
			for (const k of Object.keys(uit)) {
				uit[k].sort((a, b) => (a.tripStep?.index ?? 0) - (b.tripStep?.index ?? 0))
				if (uit[k].length < 2) delete uit[k]
			}
			return uit
		},
		verdelingTaken() {
			return verdeling(this.openTaken)
		},
		/** Wat Anina mag zien: alleen wat hier op het scherm staat (Deck 41). */
		/** De eigen sleutel die bij de gekozen AI hoort (2026-09-16). */
		aninaSleutel() {
			const s = this.settings || {}
			return (s.aiProvider === 'openai' ? s.openaiApiKey : s.aiProvider === 'gemini' ? s.geminiApiKey : s.anthropicApiKey) || ''
		},
		aninaContext() {
			const tijd = (iso) => iso ? new Date(iso).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }) : null
			const items = this.items.map((i) => {
				if (i.travel) {
					return { kind: i.travel.isFlightLeg ? 'flight' : (i.travel.isTrainLeg ? 'train journey' : 'journey'), departure: tijd(i.travel.departureTime), arrival: tijd(i.travel.arrivalTime), from: i.travel.fromLabel || null, to: i.travel.toLabel || null, minutes: i.travel.duration_min ? Math.round(i.travel.duration_min) : null }
				}
				if (i.checkIn) return { kind: 'check-in', at: tijd(i.checkIn.at || i.checkIn.time), title: i.checkIn.title || null }
				if (i.event) {
					const status = this.standVan(i.event.id)?.status || null
					// Afgevinkt of niet: zo kan Anina zeggen wat je vandaag nog niet deed (kaart 93).
					return { kind: 'appointment', title: i.event.title, start: tijd(i.event.start), end: tijd(i.event.end), location: i.event.location || null, calendar: i.event.calendarName || null, status, done: !!this.standVan(i.event.id)?.doneAt }
				}
				return null
			}).filter(Boolean)
			const tasks = this.openTaken.map((x) => ({ title: x.title, due: x.due || null, source: x.bron }))
			const s = this.settings || {}
			return {
				date: dagSleutel(this.date),
				now: new Date().toISOString(),
				language: (s.novaTaal || currentLocale() || 'nl').slice(0, 2),
				name: s.firstName || '',
				items,
				tasks,
				settings: { home: s.homeAddress || null, weatherNow: this.weer ? { temp: this.weer.temp, condition: this.weer.condition, rainSoon: this.weer.rainSoon } : null },
				upcoming: this.komend,
				people: this.aninaMensen,
				places: this.aninaPlekken,
				taskLists: this.aninaTakenlijsten,
				deckBoards: this.aninaBorden,
				noteFolders: this.aninaMappen,
			}
		},
		statusVoorBalk() {
			return { weer: this.weer, vertrek: this.volgendVertrek, bijgewerkt: this.bijgewerkt, openTaken: this.openTaken }
		},
		/** Het eerstvolgende vertrek van vandaag, voor de statusbalk. */
		volgendVertrek() {
			if (dagSleutel(this.date) !== dagSleutel(new Date())) return null
			const nu = Date.now()
			const ritten = this.items.filter((i) => i.travel && i.travel.departureTime && new Date(i.travel.departureTime).getTime() > nu && dagSleutel(new Date(i.travel.departureTime)) === dagSleutel(new Date()))
				.sort((a, b) => new Date(a.travel.departureTime) - new Date(b.travel.departureTime))
			const r = ritten[0]
			if (!r) return null
			const t = r.travel
			return {
				tijd: new Date(t.departureTime).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }),
				// De kale tijd erbij, zodat de statusbalk kan aftellen (Ramin, 24-09). Zonder dit had die
				// alleen een stuk tekst als "14:20" en kon hij niet rekenen.
				om: new Date(t.departureTime).getTime(),
				naar: t.toLabel || '',
				icoon: t.isFlightLeg ? '✈️' : (t.isTrainLeg ? '🚆' : '🚗'),
			}
		},
		isVandaag() {
			return dagSleutel(this.date) === dagSleutel(new Date())
		},
		dateLabel() {
			return this.date.toLocaleDateString(currentLocale(), { weekday: 'long', day: 'numeric', month: 'long' })
		},
		canSaveAdd() {
			return !!(this.addForm.title && this.addCalendar && this.addForm.startDate && this.addForm.startTime && this.addForm.endDate && this.addForm.endTime)
		},
	},
	watch: {
		/** Alles wat de statusbalk bovenin nodig heeft (kaart 69). */
		statusVoorBalk: {
			handler(v) { this.$emit('status', v) },
			immediate: true,
			deep: true,
		},
		initialDate(value) {
			if (value) {
				this.date = value
				this.load(false, 'andere dag')
			}
		},
	},
	async mounted() {
		await this.load(false, 'scherm geopend')
		this.wacht = true
		// Meekijken met het oor dat de hele app deelt (24-09): verandert er iets, hier of op een ander
		// apparaat, dan bouwt de dag zich opnieuw op. Eerder hield dit scherm zijn eigen verbinding open,
		// en schermen zonder zo een lus hoorden helemaal niets.
		// Hoogstens één herberekening per twintig seconden op een seintje. Op 24-09 liep dit los: de
		// berekening zelf werkte de routes bij, dat gaf een seintje, waarop dit scherm liet herberekenen --
		// 169 keer in een minuut. De oorzaak zit in Ritten.php (geen seintje meer vanuit een berekening);
		// dit is de vangrail, zodat geen enkel toekomstig seintje nog een rondje zonder eind kan worden.
		this.stopKijken = watch(() => sync.versie, () => {
			if (!this.wacht) return
			const nu = Date.now()
			if (nu - (this.laatsteSeinLoad || 0) < 20000) return
			this.laatsteSeinLoad = nu
			this.load(true, 'seintje: ' + (sync.soorten.join('+') || 'onbekend'))
		})
		// Het tabblad kan uren op de achtergrond staan; dan hoeft er niet doorgepolld te worden. Bij
		// terugkomst halen we meteen op wat er intussen gebeurd is, zodat je nooit naar een oude dag kijkt.
		this.zichtbaarheid = () => {
			if (document.visibilityState === 'visible' && this.wacht) this.load(true, 'tabblad weer zichtbaar')
		}
		document.addEventListener('visibilitychange', this.zichtbaarheid)
		// Bijna onderaan? Dan komt de volgende dag erbij (Ramin, 24-09).
		this.bijScrollen = () => {
			const el = document.scrollingElement || document.documentElement
			if (el.scrollHeight - el.scrollTop - el.clientHeight < 600) this.meerDagen()
		}
		window.addEventListener('scroll', this.bijScrollen, { passive: true })
	},
	beforeUnmount() {
		this.wacht = false
		if (this.stopKijken) this.stopKijken()
		if (this.zichtbaarheid) document.removeEventListener('visibilitychange', this.zichtbaarheid)
		if (this.bijScrollen) window.removeEventListener('scroll', this.bijScrollen)
	},
	methods: {
		/**
		 * De kaarten van de server omzetten naar de blok-vorm die dit scherm tekent. Geeft null terug als
		 * de server ze niet meestuurde -- dan valt [regelBlokken] terug op de eigen groepering.
		 *
		 * Wat hier NIET gebeurt: beslissen wat bij elkaar hoort. Dat staat in `Lib\Pa\Dag\Kaarten`, als
		 * letterlijke vertaling van Android. Hier alleen opzoeken en de tijd opmaken -- die hangt aan de
		 * tijdzone van de kijker en hoort dus niet van de server te komen.
		 */
		blokkenVanServer() {
			const alleKaarten = []
			for (const d of this.dagen) {
				const k = this.kaartenPerDag[dagSleutel(d.datum)]
				if (!k) return null
				alleKaarten.push(...k)
			}
			if (alleKaarten.length === 0) return null
			const perId = new Map()
			for (const r of this.regels) perId.set(r.id, r)
			const zichtbaar = new Set(this.zichtbareRegels.map((r) => r.id))
			const klok = (sec, zone) => {
				if (sec == null) return '?'
				try { return new Date(sec * 1000).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit', timeZone: zone || undefined }) } catch (e) { return new Date(sec * 1000).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }) }
			}
			const uit = []
			let vorigeDag = null
			for (const k of alleKaarten) {
				let regels = (k.regels || []).map((id) => perId.get(id)).filter((r) => r && zichtbaar.has(r.id))
				if (regels.length === 0) continue
				// De HOOFDregel vooraan: de kaart tekent regels[0], en zonder dit kwam bij een afspraak met
				// een vraag de vraagregel op de kaart te staan -- niveau 1, dus zonder chips en met de
				// verkeerde tijd. De server weet al wie de kop is.
				// Alleen bij een LOSSE kaart: die tekent regels[0]. Een blok tekent dezelfde lijst als
				// stappen, en dan hoort de volgorde de klok te volgen -- eerst de rit, dan de afspraak.
				if (k.hoofd && k.soort === 'los') {
					const i = regels.findIndex((r) => r.id === k.hoofd)
					if (i > 0) regels = [regels[i], ...regels.slice(0, i), ...regels.slice(i + 1)]
				}
				const vragen = (k.vragen || []).map((id) => perId.get(id)).filter(Boolean)
				// Dagstreep zoals in de eigen groepering: bij het wisselen van de dag.
				const d = regels[0].begin != null ? dagSleutel(new Date(regels[0].begin * 1000)) : null
				if (this.dagen.length > 1 && d && d !== vorigeDag) {
					vorigeDag = d
					const [j, m, dd] = d.split('-').map(Number)
					uit.push({ sleutel: 'dag-' + d, dagStreep: new Date(j, m - 1, dd) })
				}
				const tijd = k.van != null ? (k.tot != null && k.tot !== k.van ? klok(k.van, k.zone) + ' – ' + klok(k.tot, k.zone) : klok(k.van, k.zone)) : null
				uit.push({
					sleutel: k.sleutel,
					regels,
					vragen,
					hoofdId: k.hoofd || null,
					// De stops onderweg (tanken, parkeren), op volgorde zoals de server ze zet. De kaart zet
					// er de negeer-knop bij; zonder dit kwam die nergens te staan.
					drivestops: k.drivestops || [],
					// De kop van een stapel, zoals RegelKaarten.kt:392 hem kiest. Bij verwachte podcasts geen
					// aantal: een kop voor een en voor meer (Ramin, 26-09: "titel van alletwee: expected
					// podcasts", en 27-09 opnieuw).
					titel: k.stapel === 'herinneringen' ? t('%s reminders', String(regels.length))
						: k.stapel === 'vermaak' ? t('%s episodes', String(regels.length))
							: k.stapel === 'verwacht' ? t('Expected podcasts')
								: (k.titel || null),
					tijd,
					reis: k.soort === 'reis',
					werk: k.soort === 'werk',
					afspraakBlok: k.soort === 'afspraak',
					stapel: k.soort === 'stapel' ? (k.stapel || true) : false,
					herinneringen: k.stapel === 'herinneringen',
					vermaak: k.stapel === 'vermaak',
					verwacht: k.stapel === 'verwacht',
				})
			}
			return uit
		},
		/**
		 * Nog een dag aan de rol, als je bijna onderaan bent.
		 *
		 * Ramin, 24-09: *"toon afspraken van dagen totdat ze uit beeld gaan"*. Dus niet vooraf een week
		 * ophalen -- dat is verkeer voor dagen die je misschien nooit ziet -- maar er een bij zodra je in
		 * de buurt komt. Eén tegelijk, en niet opnieuw zolang de vorige nog onderweg is.
		 */
		async meerDagen() {
			if (this.rolBezig || this.loading || this.rolDagen >= 14) return
			this.rolBezig = true
			try {
				const d = new Date(this.date)
				d.setDate(d.getDate() + this.rolDagen)
				const regels = await this.laadDag(d, 'rol verder')
				regels.forEach((r) => { r.rolDag = dagSleutel(d) })
				this.dagen = this.dagen.concat([{ datum: d, regels }])
				this.rolDagen++
			} catch (e) {
				// Een dag die niet lukt stopt de rol niet; je ziet gewoon wat er wel is.
			} finally {
				this.rolBezig = false
			}
		},
		/**
		 * "Ik wacht" of "Ik rijd door" bij halen en brengen (Ramin, 27-09).
		 *
		 * Gaat naar de server, die het per plek onthoudt en de dag opnieuw laat rekenen -- het antwoord
		 * verandert de gaten en dus de vertrektijden.
		 */
		async antwoordHalen(vraag, patroon) {
			const plek = (vraag.inhoud || {}).plek
			if (!plek) return
			try {
				await paApi.halenPatroon(getAccessCode(), plek, patroon)
				await this.load()
			} catch (e) {
				this.error = foutTekst(e)
			}
		},
		/**
		 * Het antwoord op "moet er een cadeau komen?" (RegelKaarten.kt:2451).
		 *
		 * Vier antwoorden: "ideeën" opent Anina met de vraag erin, de andere drie leggen het besluit vast
		 * en halen de vraag weg. "Nee" wordt ook onthouden -- anders staat hij er morgen weer.
		 */
		async antwoordCadeau(vraag, keuze) {
			const i = vraag.inhoud || {}
			if (!i.persoon) return
			if (keuze === 'tip') {
				this.aninaVraag = t('What could I give %s?', i.persoon)
				this.aninaOpen = true
				return
			}
			try {
				await paApi.cadeauSet(getAccessCode(), i.persoon, keuze, i.jaar ?? null)
				await this.load()
			} catch (e) {
				this.error = foutTekst(e)
			}
		},
		/** De regel die bij dit afspraak-id hoort; het detailscherm heeft hem nodig voor de gemeten momenten. */
		regelVoorId(id) {
			return (this.regels || []).find((r) => r.niveau === 0 && (r.bron || r.id) === id) || null
		},
		/** De klok van een regel, in de tijdzone van die regel. */
		klokVoor(r) { return klokVan(r, r.begin) },
		/**
		 * "Today Friday 25 September 2026", met een hoofdletter zoals de telefoon het schrijft.
		 *
		 * Het woord staat VOOR de datum (Ramin, 25-09). Gisteren doet mee omdat je die dag ziet zodra je
		 * het vorige etmaal openklapt; verder terug of vooruit is alleen de datum, want dan zegt een woord
		 * je niets meer.
		 */
		dagNaam(d) {
			const tekst = d.toLocaleDateString(currentLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
			const datum = tekst.charAt(0).toUpperCase() + tekst.slice(1)
			const dag = (x) => x.toLocaleDateString('sv').slice(0, 10)
			const nu = new Date()
			const morgen = new Date(nu); morgen.setDate(morgen.getDate() + 1)
			const gisteren = new Date(nu); gisteren.setDate(gisteren.getDate() - 1)
			let woord = null
			if (dag(d) === dag(nu)) woord = t('Today')
			else if (dag(d) === dag(morgen)) woord = t('Tomorrow')
			else if (dag(d) === dag(gisteren)) woord = t('Yesterday')
			return woord ? woord + ' ' + datum : datum
		},
		/** F5: de afspraak (uit de oude kaarten) die bij een regel van niveau 0 hoort, voor klaar/verwijderen/details. */
		/** De kleur van de agenda waar deze regel uit komt; null = geen eigen kleur. */
		agendaKleurVan(r) {
			const ev = this.eventVoorRegel(r)
			const kleur = ev && (ev.calendarColor || ev.calendar_color)
			return typeof kleur === 'string' && kleur.trim() !== '' ? kleur : null
		},
		eventVoorRegel(r) {
			if (!r || r.niveau !== 0) return null
			return this.eventVoorId(r.id)
		},
		eventVoorId(id) {
			if (!id) return null
			const item = this.items.find((i) => i.event && i.event.id === id)
			return item ? item.event : null
		},
		/** Vervoerknoppen op een rit, en op de vraag "hoe reis je erheen?" (allebei hangen aan de afspraak = bron). */
		toontVervoer(r) {
			return !!r.bron && (r.soort === 'rit' || (r.soort === 'vraag' && (r.inhoud || {}).vraag === 'needsTravelDecision'))
		},
		/** Vraag "waar slaap je?" → hetzelfde hotelpaneel als de reiskaart; het hotel komt in de agenda van de vlucht. */
		kiesHotelVoorRegel(r) {
			const i = r.inhoud || {}
			if (i.lat == null || i.lon == null) return
			const event = this.eventVoorId(i.eventId || r.bron)
			const stap = { tripStep: { lat: i.lat, lon: i.lon, arrivalIso: i.arrivalIso || null, airportName: i.fromLabel || i.airportName || '' } }
			this.kiesHotel({ event, tripKey: null }, stap, r)
		},
		/** Vraag "waar is dit?" → het bewerkformulier van die afspraak. */
		/** De dag van vandaag, in dezelfde vorm als de dagstreep hem draagt. */
		vandaagSleutel() {
			return dagSleutel(new Date())
		},
		/**
		 * Is alles van vandaag geweest of afgevinkt, en staat er geen taak meer open? Dan komt er niets
		 * meer en zegt de kaart dat. Niet als de dag leeg was: dan valt er niets af te sluiten.
		 */
		klaarVandaag() {
			const nu = Math.floor(Date.now() / 1000)
			const vandaag = this.vandaagSleutel
			const soorten = ['afspraak', 'rit', 'vlucht', 'verblijf', 'werk', 'inchecken']
			const vanVandaag = (this.regels || []).filter((r) => r.begin != null
				&& soorten.includes(r.soort)
				&& dagSleutel(new Date(r.begin * 1000)) === vandaag)
			if (!vanVandaag.length) return false
			const nogIets = vanVandaag.some((r) => (r.eind || r.begin) > nu
				&& (r.niveau > 0 || !this.standVan(r.id)?.doneAt))
			// Alleen wat vandaag nog af moet telt mee, net als op de telefoon (TodayScreen.kt: `t.due != null
			// && !t.due.isAfter(now)`). Met alles erbij -- ook taken zonder datum en die van volgende maand --
			// verschijnt deze kaart nooit: er staat altijd wel iets open.
			const vandaagAf = (this.openTaken || []).filter((x) => x.due && dagSleutel(new Date(x.due)) <= vandaag)
			return !nogIets && vandaagAf.length === 0
		},
		/** Staat er nog een dag na vandaag in beeld? Dan hoort de afsluiter daarboven, niet onderaan. */
		klaarVoorMorgen() {
			return (this.regelBlokken || []).some((b) => b.dagStreep && b.dagStreep > this.vandaagSleutel)
		},
		/**
		 * Hoe ver je bent in wat er nu loopt, tussen 0 en 1 -- of null als er niets loopt. Bepaalt of de
		 * rij de streep met de stip krijgt. Een gat, een melding en een vraag lopen niet; wat je hebt
		 * afgevinkt ook niet meer.
		 */
		/**
		 * Waar de stip staat, of null als hij er niet hoort.
		 *
		 * De klok bepaalt WAAR de stip staat, maar niet OF hij er is: daarvoor moet je echt begonnen zijn
		 * (Ramin, 26-09 over Duolingo en 27-09 over een rit: *"dat kan daar niet staan, omdat er nog geen
		 * navigeren is gedrukt"*). Een gemeld begin komt van navigeren, Start nu, de app openen of de
		 * bluetooth in de auto. Zonder dat is de planning een plan, geen voortgang.
		 */
		fractieNu(blok) {
			const nu = Math.floor(Date.now() / 1000)
			for (const r of blok.regels || []) {
				if (['gat', 'melding', 'vraag'].includes(r.soort)) continue
				if (r.begin == null || r.eind == null || r.eind <= r.begin) continue
				if (nu < r.begin || nu > r.eind) continue
				if (!this.echtBegonnen(r)) continue
				const klaar = !!this.standVan(r.id)?.doneAt
					|| ['klaar', 'overgeslagen', 'geannuleerd'].includes(r.status)
				if (klaar) continue
				return Math.min(1, Math.max(0, (nu - r.begin) / (r.eind - r.begin)))
			}
			return null
		},
		/**
		 * De afvinkstand van deze afspraak, onder welke naam hij ook bewaard is.
		 *
		 * De telefoon vinkt af onder ZIJN naam (het rijnummer uit de agenda); zonder de koppeling bleef een
		 * afgevinkt telefoontje hier gewoon openstaan (Ramin, 27-09).
		 */
		standVan(id) {
			for (const naam of namenVoor(id)) {
				if (this.itemStatus[naam]) return this.itemStatus[naam]
			}
			return null
		},
		/** Is er voor deze regel een echt begin gemeld? (RegelKaarten.kt regel 237.) */
		echtBegonnen(r) {
			const namen = namenVoor(r.bron || r.id)
			return Object.values(this.werkelijkPerRegel || {})
				.some((w) => namen.includes(w.bronId) && w.soort === r.soort && w.begin)
		},
		/** Tikken op een regel in een blok: het bewerkscherm van die afspraak. */
		openRegel(r) {
			const event = this.eventVoorRegel(r)
			if (event) this.toggleDetail({ event, cardType: r.inhoud?.cardType })
		},
		openAdres(r) {
			const event = this.eventVoorId(r.bron)
			if (event) this.toggleDetail({ event, cardType: 'afspraak' })
		},
		/** Zelf gekozen modus: tot middernacht (lokaal); null = automatisch. Daarna de dag opnieuw laden. */
		kiesModus(naam) {
			this.modusKeuze = naam
			this.modusKiezer = false
			try {
				if (naam) {
					const middernacht = new Date(); middernacht.setHours(24, 0, 0, 0)
					localStorage.setItem('personalassistant.modus', JSON.stringify({ naam, tot: Math.floor(middernacht.getTime() / 1000) }))
				} else {
					localStorage.removeItem('personalassistant.modus')
				}
			} catch (e) { /* privé-venster */ }
			this.load()
		},
		t(...args) {
			return t(...args)
		},
		getAccessCode() { return getAccessCode() },
		nestSleutel(k) { return nestSleutel(k) },
		/** Herinnering: de volgende hele uur op de gekozen dag als standaardtijd. */
		openHerinnering() {
			const nu = new Date()
			const uur = String(Math.min(23, nu.getHours() + 1)).padStart(2, '0')
			this.herinnering = { tekst: '', datum: toDateInputValue(this.date), tijd: uur + ':00' }
			this.herinneringFout = null
		},
		async saveHerinnering() {
			const h = this.herinnering
			if (!h || !h.tekst.trim()) return
			const start = new Date(`${h.datum}T${h.tijd}:00`)
			if (isNaN(start.getTime())) return
			const end = new Date(start.getTime() + 5 * 60000)
			this.herinneringBezig = true
			this.herinneringFout = null
			try {
				// Het woord Herinnering in de titel: de server herkent het en maakt er een
				// herinneringskaart van (bel), met de wekker op de telefoon op dat moment.
				await createEvent(this.addCalendar || this.selectedCalendars[0], { title: t('Reminder') + ': ' + h.tekst.trim(), start, end, location: null, description: null })
				paApi.logAction(getAccessCode(), 'appointment.create', { summary: t('Reminder') + ': ' + h.tekst.trim() })
				paApi.notifyChanged(getAccessCode(), 'appointment').catch(() => {})
				this.herinnering = null
				await this.load()
			} catch (e) {
				this.herinneringFout = foutTekst(e)
			} finally {
				this.herinneringBezig = false
			}
		},
		/** Knopje onder een antwoord van Anina: naar die dag springen. */
		/** Een dag terug of vooruit; de lijst wordt opnieuw opgebouwd voor die dag. */
		verschuifDag(dagen) {
			const d = new Date(this.date)
			d.setDate(d.getDate() + dagen)
			this.date = d
			this.load()
		},
		gaNaarVandaag() {
			this.date = new Date()
			this.load()
		},
		aninaGaNaar(ref) {
			const d = new Date(ref.date + 'T12:00:00')
			if (isNaN(d.getTime())) return
			this.aninaOpen = false
			this.date = d
			this.load()
		},
		/** Anina openen en de komende twee weken ophalen, zodat "wanneer ga ik naar Bart" een antwoord heeft. */
		async openAnina() {
			this.aninaOpen = true
			if (this.komend.length || this.komendBezig) return
			this.komendBezig = true
			try {
				const van = new Date(this.date); van.setHours(0, 0, 0, 0)
				const tot = new Date(van); tot.setDate(tot.getDate() + 14)
				const uit = []
				for (const calendar of this.selectedCalendars) {
					const blocks = await fetchCalendarData(calendar, toIcsUtc(van), toIcsUtc(tot))
					for (let d = 0; d < 14; d++) {
						const dag = new Date(van); dag.setDate(dag.getDate() + d)
						for (const block of blocks) {
							for (const e of parseEventsForDay(block, dag, calendar)) {
								uit.push({ date: dagSleutel(dag), title: e.title, start: e.allDay ? null : new Date(e.start).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }), end: e.allDay ? null : new Date(e.end).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }), location: e.location || null, calendar: calendar.name || calendar.displayName || null })
							}
						}
					}
				}
				this.komend = uit.filter((x, i, l) => l.findIndex((y) => y.date === x.date && y.title === x.title && y.start === x.start) === i).slice(0, 120)
			} catch (e) { /* dan alleen de dag op het scherm */ } finally { this.komendBezig = false }
			this.laadMensenEnPlekken()
		},
		/** Wie ken je en waar was je eerder, voor "maak een afspraak bij Bart" (2026-09-16). */
		async laadMensenEnPlekken() {
			const plekken = []
			try {
				const van = new Date(); van.setHours(0, 0, 0, 0); van.setDate(van.getDate() - 180)
				const tot = new Date(); tot.setDate(tot.getDate() + 60)
				for (const calendar of this.selectedCalendars) {
					plekken.push(...plaatsenUit(await fetchCalendarData(calendar, toIcsUtc(van), toIcsUtc(tot))))
				}
			} catch (e) { /* dan zonder eerdere plekken */ }
			const namen = []
			try {
				const boeken = await discoverAddressBooks()
				for (const boek of boeken) {
					for (const c of await listContacts(boek).catch(() => [])) {
						if (c.fullName) namen.push(c.fullName)
						if (c.fullName && c.address) plekken.push({ title: c.fullName, location: c.address, date: '' })
					}
				}
			} catch (e) { /* dan zonder contacten */ }
			this.aninaMensen = namen.filter((n, i, l) => l.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i).slice(0, 400)
			this.aninaTakenlijsten = this.selectedCalendars.map((c) => c.displayName || c.name).filter(Boolean)
			try {
				const borden = await listDeckBoards()
				const uit = []
				for (const b of borden.slice(0, 10)) {
					const stacks = b.stacks || await listDeckStacks(b).catch(() => [])
					uit.push({ board: b.title, lists: stacks.map((s) => s.title) })
				}
				this.aninaBorden = uit
			} catch (e) { /* dan zonder borden */ }
			try { this.aninaMappen = Array.from(new Set((await listNotes()).map((n) => n.category).filter(Boolean))) } catch (e) { /* dan zonder mappen */ }
			this.aninaTakenlijsten = this.selectedCalendars.map((c) => c.displayName || c.name).filter(Boolean)
			try {
				const borden = await listDeckBoards()
				const uit = []
				for (const b of borden.slice(0, 10)) {
					const stacks = b.stacks || await listDeckStacks(b).catch(() => [])
					uit.push({ board: b.title, lists: stacks.map((s) => s.title) })
				}
				this.aninaBorden = uit
			} catch (e) { /* dan zonder borden */ }
			try { this.aninaMappen = Array.from(new Set((await listNotes()).map((n) => n.category).filter(Boolean))) } catch (e) { /* dan zonder mappen */ }
			this.aninaTakenlijsten = this.selectedCalendars.map((c) => c.displayName || c.name).filter(Boolean)
			try {
				const borden = await listDeckBoards()
				const uit = []
				for (const b of borden.slice(0, 10)) {
					const stacks = b.stacks || await listDeckStacks(b).catch(() => [])
					uit.push({ board: b.title, lists: stacks.map((s) => s.title) })
				}
				this.aninaBorden = uit
			} catch (e) { /* dan zonder borden */ }
			try { this.aninaMappen = Array.from(new Set((await listNotes()).map((n) => n.category).filter(Boolean))) } catch (e) { /* dan zonder mappen */ }
			this.aninaTakenlijsten = this.selectedCalendars.map((c) => c.displayName || c.name).filter(Boolean)
			try {
				const borden = await listDeckBoards()
				const uit = []
				for (const b of borden.slice(0, 10)) {
					const stacks = b.stacks || await listDeckStacks(b).catch(() => [])
					uit.push({ board: b.title, lists: stacks.map((s) => s.title) })
				}
				this.aninaBorden = uit
			} catch (e) { /* dan zonder borden */ }
			try { this.aninaMappen = Array.from(new Set((await listNotes()).map((n) => n.category).filter(Boolean))) } catch (e) { /* dan zonder mappen */ }
			this.aninaPlekken = plekken.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
				.filter((p, i, l) => l.findIndex((q) => q.title.toLowerCase() === p.title.toLowerCase() && q.location.toLowerCase() === p.location.toLowerCase()) === i).slice(0, 150)
		},
		/** Ingesproken afspraak: het gewone formulier, ingevuld; de gebruiker kijkt na en slaat op. */
		aninaFormulier(f) {
			this.aninaOpen = false
			// Taak, Deck-kaart of notitie: naar dat onderdeel, dat opent zijn formulier ingevuld (kaart 100).
			const tabVoor = { task: 'tasks', deck: 'deck', note: 'notes', trip: 'trip' }
			if (tabVoor[f.type]) {
				zetVoorinvulling(f.type, f)
				this.$emit('ga-tab', tabVoor[f.type])
				return
			}
			this.openAdd()
			const dag = /^\d{4}-\d{2}-\d{2}$/.test(f.date || '') ? f.date : this.addForm.startDate
			this.addForm = { ...this.addForm, title: f.title || '', startDate: dag, endDate: dag, startTime: f.startTime || this.addForm.startTime, endTime: f.endTime || this.addForm.endTime, location: f.location || '', description: f.notes || '' }
			if (f.location) this.onAddLocationChanged(f.location)
		},
		/** Akkoord op de uitleg van Anina onthouden, in dezelfde instellingen als de rest. */
		async aninaAkkoord() {
			this.settings = { ...(this.settings || {}), novaConsent: true }
			try { await setSettings({ ...(this.settings || {}) }) } catch (e) { /* dan vragen we het volgende keer nog eens */ }
		},
		/** Weer voor de statusbalk: bij het thuisadres (de browser vragen we niet om je plek). */
		async laadWeer(settings) {
			if (settings?.homeLat == null || settings?.homeLon == null) return
			try {
				this.weer = await paApi.weatherNow(getAccessCode(), settings.homeLat, settings.homeLon)
			} catch (e) { /* geen weer is geen ramp; de balk laat het vak dan weg */ }
		},
		/** De vlucht-afspraak achter een reiskaart (de bron in de agenda). */
		vluchtEventVan(item) {
			const groep = this.reisGroepen[item.tripKey] || []
			const vlucht = groep.find((x) => x.event && x.flightInfo) || groep.find((x) => x.event)
			return vlucht ? vlucht.event : null
		},
		/** Hotelkiezer openen: hotels bij de aankomstluchthaven. */
		async kiesHotel(item, stap, regel = null) {
			const s = stap.tripStep || {}
			const aankomst = new Date(s.arrivalIso || s.start || Date.now())
			// Bij een overstap (kaart 76): standaard tot de dag van de volgende vlucht.
			const morgen = s.nextDeparture ? new Date(s.nextDeparture) : new Date(aankomst.getTime() + 86400000)
			this.hotelKeuze = { item, stap, regel, hotels: [], laden: true, gekozen: null, tot: dagSleutel(morgen), bezig: false }
			try {
				const lijst = await paApi.poiNearby(s.lat, s.lon, { category: 'hotel', radius: 15000 })
				if (this.hotelKeuze) this.hotelKeuze.hotels = Array.isArray(lijst) ? lijst : []
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				if (this.hotelKeuze) this.hotelKeuze.laden = false
			}
		},
		/** Het hotel als afspraak, van aankomst (plus drie kwartier) tot de vertrekdag 11:00, in de agenda van de vlucht. */
		async bewaarHotel() {
			const k = this.hotelKeuze
			if (!k || !k.gekozen || !k.tot) return
			const s = k.stap.tripStep || {}
			const vlucht = (k.item.tripKey ? this.reisGroepen[k.item.tripKey] || [] : []).find((x) => x.event && x.flightInfo) || k.item
			const ev = vlucht.event
			const calendar = (!ev || ev.calendarUri === 'account')
				? { href: 'account' }
				: (this.selectedCalendars.find((c) => c.href === ev.calendarUri) || this.selectedCalendars[0])
			const aankomst = new Date(s.arrivalIso || s.start || Date.now())
			const start = new Date(aankomst.getTime() + 45 * 60000)
			// Bij een overstap eindigt het hotel vier uur voor de volgende vlucht:
			// koffer, douane en opnieuw inchecken zitten daartussen (kaart 76).
			const end = s.nextDeparture ? new Date(new Date(s.nextDeparture).getTime() - 4 * 3600000) : new Date(k.tot + 'T11:00:00')
			const h = k.gekozen
			const locatie = [h.address || h.name, h.city].filter(Boolean).join(', ')
			k.bezig = true
			try {
				await createEvent(calendar, { title: t('Hotel: %s', h.name), start, end, location: locatie, description: null, uid: 'pa-hotel-' + Math.random().toString(36).slice(2, 10) })
				paApi.notifyChanged(getAccessCode(), 'appointment').catch(() => {})
				this.hotelKeuze = null
				await this.load()
			} catch (e) {
				k.bezig = false
				this.error = foutTekst(e)
			}
		},
		modeFor(item) {
			return this.keuzeVan(item.event?.id)?.travelMode || null
		},
		/** Nieuwe lijst: de keuze hangt aan de afspraak (bron van de rit). */
		vervoerKeuze(r) {
			return r && r.bron ? (this.keuzeVan(r.bron)?.travelMode || null) : null
		},
		/**
		 * De bewaarde keuze bij deze afspraak, onder welke naam hij ook staat.
		 *
		 * De telefoon bewaart hem onder ZIJN naam voor dezelfde afspraak (het rijnummer uit de
		 * Android-agenda). Zonder de koppeling zag het web die keuzes nooit (Ramin, 27-09).
		 */
		keuzeVan(id) {
			for (const naam of namenVoor(id)) {
				if (this.travelChoices[naam]) return this.travelChoices[naam]
			}
			return null
		},
		/** Nieuwe lijst: een gat-regel in de vorm die GapCard kent (POI's rondom, via je basis). */
		gapVanRegel(r) {
			const i = r.inhoud || {}
			const van = r.van || {}
			// De bestemming: de eerstvolgende rit na dit gat (zelfde afspraak).
			const rit = this.regels.find((x) => x.soort === 'rit' && x.begin != null && r.eind != null && x.begin >= r.eind && (x.bron === r.bron || !r.bron))
			const naar = rit && rit.naar ? rit.naar : {}
			return {
				minutes: i.minutes ?? i.rawMinutes ?? 0, rawMinutes: i.rawMinutes ?? i.minutes ?? 0, worthwhile: !!i.worthwhile,
				fromLabel: van.locatie || van.stad || '', toLabel: naar.locatie || naar.stad || '',
				lat: van.lat, lon: van.lon, toLat: naar.lat ?? null, toLon: naar.lon ?? null,
				toBaseMinutes: i.toBaseMinutes ?? null, fromBaseMinutes: i.fromBaseMinutes ?? null,
				viaBaseMinutes: (i.toBaseMinutes != null && i.fromBaseMinutes != null) ? i.toBaseMinutes + i.fromBaseMinutes : null,
				baseLabel: i.baseLabel || '', taxiProvider: i.taxiProvider || null, baseLat: null, baseLon: null,
			}
		},
		async setMode(item, mode) {
			return this.setModeVoorId(item.event?.id, mode)
		},
		async setModeVoorId(id, mode) {
			if (!id) return
			const nieuw = { ...(this.travelChoices[id] || {}), travelMode: mode }
			this.travelChoices = { ...this.travelChoices, [id]: nieuw }
			await setTravelChoice(id, nieuw).catch((e) => { this.error = foutTekst(e) })
			await this.load()
		},
		async toggleThuiswerken() {
			// Eén tik zet déze dag om; het vaste patroon blijft staan.
			const s = this.settings || await getSettings()
			const sleutel = dagSleutel(this.date)
			const huidig = String(s.workFromHomeDates || '').split(',').map((x) => x.trim()).filter(Boolean)
			const nieuw = huidig.includes(sleutel) ? huidig.filter((x) => x !== sleutel) : [...huidig, sleutel]
			await setSettings({ ...s, workFromHomeDates: nieuw.join(',') }).catch((e) => { this.error = foutTekst(e) })
			await this.load()
		},
		/** Onderdeel van een reeks (id <uid>@<dag>): verwijderen vraagt deze keer of alle keren (Ramin, 21-09). */
		isReeks(ev) {
			return !!ev && (!!ev.recurring || String(ev.id).includes('@'))
		},
		/** Een gewone afspraak uit een eigen agenda; gespiegelde telefoon-afspraken en het werkblok niet. */
		verwijderbaar(ev) {
			if (!ev || ev.calendarUri === 'synthetic-work' || String(ev.id).startsWith('mirror-')) return false
			return ev.calendarUri === 'account' || this.selectedCalendars.some((c) => c.href === ev.calendarUri)
		},
		async verwijderEvent(ev, bereik = 'all') {
			if (!ev) return
			const calendar = ev.calendarUri === 'account' ? { href: 'account' } : this.selectedCalendars.find((c) => c.href === ev.calendarUri)
			if (!calendar) return
			try {
				// Een stuk van een reis met meerdere vluchten: de afspraak is de hele reis (kaart 76).
				// Alleen deze keer (21-09): uitzondering op de reeks in de agenda waar hij vandaan komt.
				const alleenDezeKeer = bereik === 'once' && this.isReeks(ev)
				await deleteEvent(calendar, ev.parentId || ev.id, alleenDezeKeer ? { occurrence: true, start: ev.start } : {})
				this.error = null
				await this.load()
			} catch (e) {
				this.error = foutTekst(e)
			}
		},
		async toggleDone(eventId) {
			const huidig = this.itemStatus[eventId] || {}
			const nieuw = { ...huidig, doneAt: huidig.doneAt ? null : Date.now(), busySince: null }
			this.itemStatus = { ...this.itemStatus, [eventId]: nieuw }
			await setItemStatus(eventId, nieuw).catch((e) => { this.error = foutTekst(e) })
		},
		/**
		 * Een stop onderweg wegklikken (of terugdraaien). Gaat naar `trip/tankstop.php`, net als op de
		 * telefoon: de keuze hoort bij dag+bestemming en moet de kant van de server op, anders weet je
		 * telefoon er niets van (Ramin, 27-09: *"De ignore knop heeft invloed op de mobiele versie"*).
		 */
		async negeerStop(regel, aan) {
			const i = regel.inhoud || {}
			const naarLat = i.vensterNaarLat ?? i.ritNaarLat ?? i.stationLat
			const naarLon = i.vensterNaarLon ?? i.ritNaarLon ?? i.stationLon
			const vanLat = i.vensterVanLat ?? regel.van?.lat
			const vanLon = i.vensterVanLon ?? regel.van?.lon
			if ([naarLat, naarLon, vanLat, vanLon].some((x) => x == null)) return
			const dag = new Date((regel.begin || 0) * 1000).toISOString().slice(0, 10)
			try {
				await paApi.tankstopOverslaan(getAccessCode(), dag, naarLat, naarLon, aan, vanLat, vanLon)
				// Opnieuw laden, want dit verandert de dag: zonder tankstop vervalt het kwartier.
				await this.load()
			} catch (e) {
				this.error = foutTekst(e)
			}
		},
		async toggleBusy(eventId) {
			const huidig = this.itemStatus[eventId] || {}
			const nieuw = { ...huidig, busySince: huidig.busySince ? null : Date.now() }
			this.itemStatus = { ...this.itemStatus, [eventId]: nieuw }
			await setItemStatus(eventId, nieuw).catch((e) => { this.error = foutTekst(e) })
		},
		toggleDetail(item) {
			const id = item.event?.id
			if (!id) return
			this.expandedEventId = this.expandedEventId === id ? null : id
		},
		openAdd() {
			const dateStr = toDateInputValue(this.date)
			this.addCalendar = this.selectedCalendars[0] || null
			this.addForm = { title: '', startDate: dateStr, startTime: '09:00', endDate: dateStr, endTime: '10:00', location: '', description: '' }
			this.addLocationSuggestions = []
			this.addLocationLat = null
			this.addLocationLon = null
			this.travelPreview = null
			this.addError = null
			// A fresh form has no overlap warning yet, and a leftover one must
			// not count as "already warned" for the next appointment.
			this.addConflict = null
			this.showAdd = true
		},
		cancelAdd() {
			this.showAdd = false
			this.addConflict = null
			this.addLocationSuggestions = []
			this.addLocationLat = null
			this.addLocationLon = null
			this.travelPreview = null
			this.addError = null
		},
		// Debounced live suggestions (Ramin, 2026-09-09: same
		// AddressAutocompleteField behaviour Android already has) — picking
		// one stores its already-short display_name as the location, same
		// as a hand-typed address would just keep typing without ever
		// picking a suggestion.
		onAddLocationChanged(value) {
			this.addForm.location = value
			if (this.addLocationSuppressUntilNextEdit) {
				this.addLocationSuppressUntilNextEdit = false
				this.addLocationSuggestions = []
				return
			}
			// A hand-typed edit invalidates whatever coordinate a PRIOR
			// suggestion pick resolved — no preview until a new one lands.
			this.addLocationLat = null
			this.addLocationLon = null
			this.travelPreview = null
			clearTimeout(this.addLocationTimer)
			if (value.trim().length < 3) {
				this.addLocationSuggestions = []
				return
			}
			this.addLocationTimer = setTimeout(async () => {
				try {
					this.addLocationSuggestions = await paApi.geocodeSuggest(value)
				} catch {
					this.addLocationSuggestions = []
				}
			}, 400)
		},
		pickAddLocationSuggestion(suggestion) {
			this.addForm.location = suggestion.display_name
			this.addLocationSuggestions = []
			this.addLocationSuppressUntilNextEdit = true
			this.addLocationLat = suggestion.lat
			this.addLocationLon = suggestion.lon
			this.updateTravelPreview()
		},
		// Auto-correct instead of just failing at Save (Ramin, 2026-09-09:
		// "als de start time na de eindtijd is, verander eindtijd naar
		// start tijd +1 uur") — moving start past the current end bumps
		// end to start+1h.
		onAddStartChanged() {
			if (!this.addForm.startDate || !this.addForm.startTime) return
			const start = new Date(`${this.addForm.startDate}T${this.addForm.startTime}:00`)
			const end = this.addForm.endDate && this.addForm.endTime
				? new Date(`${this.addForm.endDate}T${this.addForm.endTime}:00`)
				: null
			if (!end || end <= start) {
				const bumped = new Date(start.getTime() + 60 * 60 * 1000)
				this.addForm.endDate = toDateInputValue(bumped)
				this.addForm.endTime = `${String(bumped.getHours()).padStart(2, '0')}:${String(bumped.getMinutes()).padStart(2, '0')}`
			}
			this.updateTravelPreview()
		},
		/** Eindtijd = vertrek uiterlijk voor de volgende afspraak (kaart 112). */
		aansluiten() {
			if (!this.aansluit) return
			this.addForm.endDate = this.aansluit.eindeDatum
			this.addForm.endTime = this.aansluit.einde
		},
		async updateAansluit(lat, lon, start) {
			this.aansluit = null
			let volgende = null
			for (const item of this.items) {
				const ev = item.event
				if (!ev?.start || !ev.location || ev.calendarUri === 'synthetic-work') continue
				const s0 = new Date(ev.start)
				if (s0 > start && s0.toDateString() === start.toDateString() && (!volgende || s0 < new Date(volgende.start))) volgende = ev
			}
			if (!volgende) return
			const doel = await paApi.geocode(volgende.location).catch(() => null)
			if (!doel) return
			const route = await paApi.route(lat, lon, doel.lat, doel.lon).catch(() => null)
			if (!route) return
			const einde = new Date(new Date(volgende.start).getTime() - (Math.round(route.duration_min) + 10) * 60000)
			if (einde <= start) return
			const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
			this.aansluit = { titel: volgende.title, start: hhmm(new Date(volgende.start)), einde: hhmm(einde), eindeDatum: toDateInputValue(einde) }
		},
		async updateTravelPreview() {
			const lat = this.addLocationLat
			const lon = this.addLocationLon
			if (lat == null || lon == null || !this.addForm.startDate || !this.addForm.startTime) {
				this.travelPreview = null
				this.aansluit = null
				return
			}
			this.updateAansluit(lat, lon, new Date(`${this.addForm.startDate}T${this.addForm.startTime}:00`)).catch(() => { this.aansluit = null })
			this.travelPreviewLoading = true
			this.travelPreview = null
			try {
				const start = new Date(`${this.addForm.startDate}T${this.addForm.startTime}:00`)
				// Latest-ending real event that's already over by the time
				// this new one starts — the actual place the day's
				// timeline is coming FROM, same as DayPlanner's own
				// $prevLocation server-side.
				let preceding = null
				let precedingEnd = null
				for (const item of this.items) {
					if (!item.event?.end) continue
					const end = new Date(item.event.end)
					if (end <= start && (precedingEnd === null || end > precedingEnd)) {
						precedingEnd = end
						preceding = item.event
					}
				}
				let origin = null
				let fromLabel = null
				if (preceding?.location) {
					const found = await paApi.geocode(preceding.location).catch(() => null)
					if (found) {
						origin = { lat: found.lat, lon: found.lon }
						fromLabel = preceding.title
					}
				}
				if (!origin) {
					const settings = await getSettings().catch(() => null)
					if (settings?.homeLat != null && settings?.homeLon != null) {
						origin = { lat: settings.homeLat, lon: settings.homeLon }
					}
				}
				if (!origin) {
					this.travelPreview = null
					return
				}
				const route = await paApi.route(origin.lat, origin.lon, lat, lon)
				this.travelPreview = fromLabel
					? `~${route.duration_min} min (${route.distance_km.toFixed(1)} km) from "${fromLabel}"`
					: `~${route.duration_min} min (${route.distance_km.toFixed(1)} km) from home`
			} catch {
				this.travelPreview = null
			} finally {
				this.travelPreviewLoading = false
			}
		},
		async saveAdd() {
			if (!this.canSaveAdd) return
			const start = new Date(`${this.addForm.startDate}T${this.addForm.startTime}:00`)
			const end = new Date(`${this.addForm.endDate}T${this.addForm.endTime}:00`)
			if (end <= start) {
				this.addError = t('End must be after start.')
				return
			}
			this.adding = true
			this.addError = null
			// Warn once about an overlap, then let a second press through — the
			// same "create anyway" behaviour the Android app has had since
			// 2026-09-08, while this app saved clashes silently. A failed check
			// never blocks saving.
			if (!this.addConflict) {
				const clash = await paApi.checkConflict(
					this.accessCode,
					{ start: start.toISOString(), end: end.toISOString() },
					this.dayEvents,
				).catch(() => null)
				const hit = clash && Array.isArray(clash.conflicts) ? clash.conflicts[0] : null
				if (hit) {
					this.addConflict = hit.title || 'another appointment'
					this.adding = false
					return
				}
			}
			try {
				await createEvent(this.addCalendar, {
					title: this.addForm.title,
					start,
					end,
					location: this.addForm.location || null,
					description: this.addForm.description || null,
					recurrence: this.addForm.recurrence || 'NONE',
					recurrenceUntil: this.addForm.recurrence !== 'NONE' && this.addForm.recurrenceUntil ? this.addForm.recurrenceUntil : null,
					recurrenceInterval: this.addForm.recurrence !== 'NONE' ? (parseInt(this.addForm.recurrenceInterval, 10) || 1) : 1,
					recurrenceCount: this.addForm.recurrence !== 'NONE' && parseInt(this.addForm.recurrenceCount, 10) > 0 ? parseInt(this.addForm.recurrenceCount, 10) : null,
				})
				paApi.logAction(getAccessCode(), 'appointment.create', { summary: this.addForm.title })
				// Wake every other device that is long-polling for changes
				// (2026-09-10) — this app wrote straight to Nextcloud and told
				// nobody, so a phone only noticed on its own next reload.
				paApi.notifyChanged(getAccessCode(), 'appointment').catch(() => {})
				this.showAdd = false
				await this.load()
			} catch (e) {
				this.addError = foutTekst(e)
			} finally {
				this.adding = false
			}
		},
		/**
		 * Wachten tot er iets verandert, en dan de dag opnieuw opbouwen -- zonder dat je iets doet.
		 *
		 * Ramin, 24-09: *"de hele pagina AJAX, dat dingen gepusht kunnen worden naar de WEB-app"*. Dit is
		 * dezelfde lus die de telefoon al draait: `wait_changed.php` houdt de verbinding maximaal 25
		 * seconden open en antwoordt zodra de server iets aanraakt. Geen websocket en geen push-dienst --
		 * dit draait op gedeelde hosting, en een openstaande vraag is het enige dat daar betrouwbaar werkt.
		 *
		 * De statusbalk hoeft hier niets voor te doen: weer, vertrek en open taken komen uit dit scherm,
		 * dus die vernieuwen mee zodra `load()` klaar is.
		 *
		 * Gaat er iets mis, dan wachten we vijf seconden voor we het opnieuw proberen. Anders zou een
		 * server die even weg is een lus opleveren die zo hard mogelijk blijft vragen.
		 */
		/**
		 * [stil] = een verversing die je niet gevraagd hebt (de wacht-lus, of terugkomen op het tabblad).
		 * Dan blijft staan wat er staat tot het nieuwe binnen is: het laad-rondje maakt de lijst leeg, en
		 * een dag die om de haverklap leeg knippert is onleesbaar. Bij een leeg scherm tonen we het wel,
		 * want dan valt er niets te bewaren.
		 */
		/**
		 * De dag (opnieuw) berekenen. [reden] gaat mee naar de server en belandt als één regel in het
		 * gedragslogboek (Ramin, 24-09), zodat je achteraf kunt zien hoe vaak dit gebeurde en waardoor --
		 * het debug-logboek houdt maar 1000 regels en is daarmee binnen een halfuur rond.
		 */
		/**
		 * De 24-uursrol: vandaag en de dagen erna achter elkaar door, met een scheiding per dag.
		 *
		 * Ramin, 24-09: *"toon afspraken van dagen totdat ze uit beeld gaan. als er dus weinig afspraken
		 * zijn met veel gaten, kan het dus zijn dat er meerdere lege dagen zijn (day dividers tonen)"*.
		 * Precies zoals de telefoon het doet. De web-agenda toonde tot nu toe één dag, met pijltjes ernaast;
		 * die pijltjes blijven, maar ze verzetten nu het beginpunt van de rol.
		 */
		async load(stil = false, reden = 'scherm') {
			if (!stil || !this.regels.length) this.loading = true
			this.error = null
			// Wat niet per dag verschilt, één keer: je instellingen, je agenda's, wat je hebt afgevinkt.
			// Open taken hangen niet aan de gekozen dag (Ramin, 2026-09-15, kaart 69).
			laadTermijnen(null, true).then((x) => { this.openTaken = x }).catch(() => {})
			// Wat er vandaag werkelijk gebeurde (kaart 220): alleen voor de dag die in beeld staat, en het
			// mag mislukken -- dan staat er gewoon de planning, zoals voorheen.
			paApi.werkelijkVanDag(getAccessCode(), dagSleutel(this.date))
				.then((d) => { this.werkelijkPerRegel = (d && d.regels) || {} })
				.catch(() => { this.werkelijkPerRegel = {} })
			try {
				this.settings = await getSettings()
				this.laadWeer(this.settings)
				this.selectedCalendars = await gekozenKalenders(this.settings)
				this.itemStatus = await listItemStatus().catch(() => ({}))
				this.travelChoices = await listTravelChoices().catch(() => ({}))
			} catch (e) {
				this.error = foutTekst(e)
				this.loading = false
				return
			}
			if (!this.selectedCalendars.length) { this.loading = false; return }
			const dagen = []
			for (let i = 0; i < this.rolDagen; i++) {
				const d = new Date(this.date)
				d.setDate(d.getDate() + i)
				dagen.push(d)
			}
			try {
				const uit = []
				for (const d of dagen) {
					// Eén voor één, niet alle tegelijk: drie dagplanningen naast elkaar lieten de server
					// eerder op zijn eigen logboek vastlopen, en het scheelt pieken in je uurlimiet.
					const regels = await this.laadDag(d, reden)
					// De dag waar deze regels bij horen, vastgelegd bij het ophalen. Op de tijd afgaan gaat
					// mis: een reis of een nachtafspraak van morgen kan een regel van vandaag opleveren,
					// en dan stond "Donderdag 24 september" een tweede keer onder vrijdag (24-09).
					regels.forEach((r) => { r.rolDag = dagSleutel(d) })
					uit.push({ datum: d, regels })
				}
				this.dagen = uit
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.bijgewerkt = new Date()
				this.loading = false
			}
		},
		/** Eén dag ophalen en berekenen; geeft de regels terug. */
		async laadDag(datum, reden = 'scherm') {
			try {
				const settings = this.settings
				if (!settings || !this.selectedCalendars.length) return []

				const dayStart = new Date(datum)
				dayStart.setHours(0, 0, 0, 0)
				const dayEnd = new Date(dayStart)
				dayEnd.setDate(dayEnd.getDate() + 1)
				const startUtc = toIcsUtc(dayStart)
				const endUtc = toIcsUtc(dayEnd)

				const events = []
				for (const calendar of this.selectedCalendars) {
					const blocks = await fetchCalendarData(calendar, startUtc, endUtc)
					for (const block of blocks) {
						events.push(...parseEventsForDay(block, datum, calendar))
					}
				}
				// Een reis met meerdere vluchten staat op de dag van vertrek maar
				// duurt dagen (kaart 76): tot vier dagen terugkijken naar zulke
				// reizen; de planner houdt alleen de stukken van deze dag over.
				try {
					const terugStart = new Date(dayStart)
					terugStart.setDate(terugStart.getDate() - 4)
					const bekend = new Set(events.map((e) => e.id))
					for (const calendar of this.selectedCalendars) {
						const blocks = await fetchCalendarData(calendar, toIcsUtc(terugStart), startUtc)
						for (const block of blocks) {
							for (let d = 1; d <= 4; d++) {
								const dag = new Date(dayStart)
								dag.setDate(dag.getDate() - d)
								for (const ev of parseEventsForDay(block, dag, calendar)) {
									if (isVluchtKetting(ev.title) && !bekend.has(ev.id)) { bekend.add(ev.id); events.push(ev) }
								}
							}
						}
					}
				} catch (e) { /* dan zonder terugkijken */ }
				// En vooruit: een hotel in de dagen na een vlucht van vandaag, alleen als
				// context voor de planner (blijf je? dan niet nog eens vragen), kaart 76.
				try {
					const vooruitEind = new Date(dayEnd)
					vooruitEind.setDate(vooruitEind.getDate() + 4)
					const bekend = new Set(events.map((e) => e.id))
					for (const calendar of this.selectedCalendars) {
						const blocks = await fetchCalendarData(calendar, endUtc, toIcsUtc(vooruitEind))
						for (const block of blocks) {
							for (let d = 1; d <= 4; d++) {
								const dag = new Date(dayStart)
								dag.setDate(dag.getDate() + d)
								for (const ev of parseEventsForDay(block, dag, calendar)) {
									if (isVerblijf(ev.title) && !bekend.has(ev.id)) { bekend.add(ev.id); events.push({ ...ev, contextOnly: true }) }
								}
							}
						}
					}
				} catch (e) { /* dan zonder vooruitkijken */ }
				// Je werkdag erbij, als afspraak — net als op de telefoon.
				events.push(...workEventsFor(datum, events, settings, { office: t('At the office'), home: t('Working from home'), calendar: t('Work') }))
				if (dagSleutel(datum) === dagSleutel(this.date)) this.werktThuisVandaag = werktThuis(datum, settings)
				events.sort((a, b) => new Date(a.start) - new Date(b.start))
				// Kept for the creation-time overlap check in saveAdd()
				// — the Android app has warned about a clashing appointment
				// before saving since 2026-09-08; this app silently saved it.
				this.dayEvents = events.filter((e) => !e.contextOnly)

				const home = (settings.homeLat != null && settings.homeLon != null)
					? { lat: settings.homeLat, lon: settings.homeLon }
					: null

				const work = (settings.workLat != null && settings.workLon != null) ? { lat: settings.workLat, lon: settings.workLon } : null
				const response = await paApi.plan(this.accessCode, {
					events,
					home,
					work,
					travelChoices: this.travelChoices,
					// Het woord voor 'thuis' in de taal van de gebruiker; anders zet
					// de planner er zelf 'Thuis' op, ook in een Engelse pagina.
					homeLabel: t('Home'),
					gapThresholdMinutes: settings.gapThresholdMinutes ?? 90,
					departureBufferMinutes: settings.gettingReadyHomeMinutes ?? 30,
					arrivalBufferMinutes: settings.arrivalBufferMinutes ?? 10,
					checkinLeadMinutesDefault: settings.checkinLeadMinutes ?? 150,
					arrivalProcessingMinutesDefault: settings.arrivalProcessingMinutes ?? 60,
					airlabsApiKey: settings.airLabsKey || '',
					preferredAirlines: settings.preferredAirlines || [],
					// Welke dag, in de tijd van de browser (kaart 76).
					date: dagSleutel(this.date),
					utcOffsetMinutes: -new Date().getTimezoneOffset(),
					// F3: wie vraagt (render-filter) en de modus van dit moment; een eigen keuze gaat mee tot middernacht.
					platform: 'web',
					reden,
					modus: this.modusKeuze || null,
					modusTot: this.modusKeuze ? (leesModusTot() || null) : null,
				})
				// De modus, de oude kaarten en het werk-nest gaan over waar je NU bent; die komen dus van de
				// eerste dag van de rol. De dagen erna leveren alleen hun regels.
				const regels = (response.structuur && response.structuur.nieuw && response.structuur.nieuw.regels) || []
				// De kaarten van de server (27-09): welke regels samen een kaart zijn. Hangen aan de regels
				// van dezelfde dag, zodat de rol ze per dag bij elkaar houdt.
				this.kaartenPerDag[dagSleutel(datum)] = (response.structuur && response.structuur.nieuw && response.structuur.nieuw.kaarten) || null
				if (dagSleutel(datum) === dagSleutel(this.date)) {
					this.items = response.items || []
					this.modus = response.modus || null
					const nest = nestUnderWork(this.items)
					this.werkKinderen = nest.children
					this.genest = nest.nested
				}
				return regels
			} finally {
				this.bijgewerkt = new Date()
			}
		},
	},
}

function leesModusKeuze() {
	try {
		const k = JSON.parse(localStorage.getItem('personalassistant.modus') || 'null')
		return k && k.tot > Date.now() / 1000 ? k.naam : null
	} catch (e) { return null }
}

function leesModusTot() {
	try { return (JSON.parse(localStorage.getItem('personalassistant.modus') || 'null') || {}).tot || null } catch (e) { return null }
}


function toIcsUtc(date) {
	return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function toDateInputValue(date) {
	const pad = (n) => String(n).padStart(2, '0')
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
</script>

<style scoped>
/* Thuis is een grens van de dag, geen afspraak: een dunne regel met de tijd rechts (net als op de
   telefoon), niet een hele kaart. */
.pa-thuisregel { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 14px; margin-bottom: 10px; color: var(--color-text-maxcontrast); font-size: 0.9em; }
.pa-thuisregel__tijd { font-family: "IBM Plex Mono", ui-monospace, monospace; }
/* De scheiding tussen twee dagen in de rol: een streep met de dag erin, zoals op de telefoon. */
.pa-dagstreep { display: flex; align-items: center; gap: 12px; margin: 18px 0 10px; color: var(--color-text-maxcontrast); font-size: 0.9em; }
.pa-dagstreep::before, .pa-dagstreep::after { content: ''; flex: 1; height: 1px; background: var(--color-border); }
.pa-today__dag { border: 0; background: transparent; color: inherit; font: inherit; font-size: 1.15em; line-height: 1; padding: 0 6px; cursor: pointer; opacity: 0.65; }
.pa-today__dag:hover { opacity: 1; }
.pa-today__vandaag, .pa-today__vorige { border: 1px solid var(--color-border, #ccc); background: transparent; color: inherit; font: inherit; font-size: 0.8em; border-radius: 999px; padding: 2px 10px; margin-left: 8px; cursor: pointer; }
.pa-today__vorige { margin: 0 0 8px; font-size: 0.85em; }
/* F3/F5: de modus-chip naast de datum; blauw = zelf gekozen. */
.pa-today__modus { display: inline-block; margin-left: 10px; vertical-align: middle; font-size: .55em; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--color-text-maxcontrast); border: 1px solid var(--color-border); border-radius: 6px; padding: 2px 8px; }
.pa-today__modus--zelf { color: var(--color-primary-element); border-color: var(--color-primary-element); }
.pa-today__modus { background: transparent; cursor: pointer; }
/* F5: een vliegreis als één blok met de stappen erin. */
.pa-reisblok { margin: 0 0 10px; padding: 8px 10px; border: 1px solid var(--color-border); border-radius: var(--border-radius-large); background: var(--color-background-hover); }
.pa-reisblok__kop { font-weight: 700; margin: 0 0 8px; }
.pa-reisblok__tijd { font-weight: 400; color: var(--color-text-maxcontrast); margin-left: 8px; }
.pa-today__moduskiezer { margin: 0 0 12px; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--border-radius-large); }
.pa-today__modusuitleg { margin: 0 0 8px; color: var(--color-text-maxcontrast); font-size: .9em; }
/* De afsluiter van de dag: zelfde kaartvorm, maar zonder tijd -- er valt niets meer te doen. */
.pa-klaar { margin-bottom: 10px; }
.pa-klaar__tekst { margin: 6px 0 0; font-size: 13.5px; }

/* De streep met de stip links van wat er nu loopt: een dun lijntje over de hoogte van de kaart, met de
   stip op het punt waar je bent. Staat er niets te lopen, dan neemt de wikkel geen ruimte in. */
.pa-rij { display: flex; align-items: stretch; }
.pa-rij--nu { gap: 4px; }
.pa-rij__lijn { position: relative; width: 12px; flex: none; }
.pa-rij__lijn::before { content: ""; position: absolute; left: 5px; top: 4px; bottom: 14px; width: 2px;
	background: var(--color-border, #ddd); border-radius: 1px; }
.pa-rij__stip { position: absolute; left: 1px; width: 10px; height: 10px; border-radius: 50%;
	background: var(--color-primary-element, #0a7); transform: translateY(-50%); }
.pa-rij__inhoud { flex: 1; min-width: 0; }

/* Eén regel waarvan de achtergrond het verhaal vertelt: rood = verlopen,
   geel = binnen twee dagen, groen = ruim op tijd (Ramin, 2026-09-14). */
.pa-today__taken { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 36px; margin: 0 0 8px; padding: 0; border: none; border-radius: 10px; overflow: hidden; background: #2e8b57; color: #fff; cursor: pointer; }
.pa-today__taken-naam { position: relative; z-index: 1; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; text-shadow: 0 1px 3px rgba(0,0,0,.6); }
.pa-today__pil { position: absolute; inset: 0; display: flex; }
.pa-today__pil-rood { background: #c0392b; }
.pa-today__pil-geel { background: #e0a800; }
.pa-today__pil-groen { background: #2e8b57; }
.pa-today__item {
	margin-bottom: 4px;
}
.pa-today__empty {
	color: var(--color-text-maxcontrast);
}
.pa-hotel { border: 1px solid var(--color-border, #ddd); border-radius: var(--border-radius-large, 8px); padding: 12px 16px; margin: 0 0 8px; display: flex; flex-direction: column; gap: 6px; }
.pa-hotel h3 { margin: 0 0 4px; }
.pa-hotel__rij { display: flex; flex-direction: column; align-items: flex-start; text-align: left; background: var(--color-background-hover, #f4f4f4); border: 2px solid transparent; border-radius: 8px; padding: 6px 10px; cursor: pointer; color: inherit; font: inherit; }
.pa-hotel__rij--gekozen { border-color: var(--color-primary-element, #1e3a5f); }
.pa-hotel__naam { font-weight: bold; }
.pa-hotel__rij small { color: var(--color-text-maxcontrast, #666); }
.pa-hotel__tot { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
.pa-hotel__knoppen { display: flex; gap: 8px; margin-top: 6px; }
.pa-today__detail {
	margin: -4px 0 12px 16px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-left-width: 4px;
	border-radius: var(--border-radius-large);
}
.pa-today__knoppen { display: flex; flex-wrap: wrap; gap: 8px; }
.pa-today__herinnering { margin-top: 10px; padding: 12px; border: 1px solid var(--color-border); border-radius: 12px; max-width: 40em; display: flex; flex-direction: column; gap: 8px; }
.pa-today__herinnering-rij { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.pa-today__add {
	margin-top: 16px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius);
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.pa-today__row {
	display: flex;
	gap: 8px;
}
.pa-today__date {
	flex: 2;
}
.pa-today__time {
	flex: 1;
}
.pa-today__add-actions {
	display: flex;
	gap: 8px;
}
.pa-today__chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.pa-today__chip {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-pill, 16px);
	background: var(--color-background-hover);
	padding: 4px 12px;
	cursor: pointer;
	font-size: 0.85em;
}
.pa-today__chip--active {
	background: var(--color-primary-element);
	color: var(--color-primary-element-text);
	border-color: var(--color-primary-element);
}
.pa-today__location-suggestions {
	list-style: none;
	padding: 0;
	margin: -4px 0 4px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius);
	max-height: 220px;
	overflow-y: auto;
}
.pa-today__location-suggestions li {
	padding: 8px 12px;
	cursor: pointer;
	font-size: 0.9em;
}
.pa-today__location-suggestions li:hover {
	background: var(--color-background-hover);
}
.pa-today__travel-preview {
	color: var(--color-text-maxcontrast);
	font-size: 0.9em;
	margin: -4px 0 4px;
}
.pa-today__num {
	width: 5em;
}
</style>
