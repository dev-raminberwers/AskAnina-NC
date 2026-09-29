<template>
	<!--
		Niet ingelogd? Dan het inlogscherm, in ALLE jassen (Ramin, 30-09).

		Hier stond `web && !ingelogd`, en dat `web &&` was de fout. In Nextcloud werd het inlogscherm
		daardoor nooit getoond: de app tekende zichzelf helemaal uit -- menu, lege dag, "Nothing planned" --
		met daarboven een RODE foutmelding "Set your USER-API code under Settings first."

		Drie dingen mis in dat ene scherm. Het ziet eruit als een storing terwijl er niets kapot is; het
		vraagt om een "USER-API code", een woord dat een gebruiker nergens kent en dat we bovendien net
		achter ons hebben gelaten; en het toont een heel programma dat niets kan doen.

		Ramin: *"Eerste scherm bij openen app moet inlogscherm zijn."* Dat gold al voor de Android-app en
		het geldt hier net zo goed -- het is dezelfde bundel en dezelfde gebruiker.
	-->
	<!--
		IN de schil, niet ernaast (Ramin, 30-09).

		Eerst stond `<LoginView>` hier los, buiten `<NcContent>`. In de web-jas viel dat niet op, maar
		binnen Nextcloud landde de kaart in de NAVIGATIEKOLOM: een smal wit blokje links, met rechts een
		leeg blauw vlak waar de app hoort te staan. De schil van Nextcloud verdeelt zijn ruimte namelijk
		zelf, en wie er niets in zet, krijgt de eerste plek toegewezen.

		Dus: dezelfde schil, met een inhoudsvak en zonder menu. Er valt niets te navigeren zolang je niet
		binnen bent, en het inlogscherm staat waar de app staat.
	-->
	<NcContent v-if="!ingelogd || vergrendeld" app-name="personalassistant">
		<NcAppContent>
			<LoginView v-if="!ingelogd" @ingelogd="ingelogd = true" />
			<LoginView v-else :vergrendeld="true" @ingelogd="vergrendeld = false" @uitloggen="uitloggen" />
		</NcAppContent>
	</NcContent>
	<NcContent v-else app-name="personalassistant">
		<NcAppNavigation>
			<template #list>
				<!-- Zoeken in instellingen en gegevens, resultaten terwijl je typt (Ramin, 2026-09-15). -->
				<li class="pa-zoek">
					<input v-model="zoek" type="search" class="pa-zoek__veld" :placeholder="t('Search')" @input="zoekNu">
					<ul v-if="zoek.trim().length >= 1" class="pa-zoek__lijst">
						<li v-if="zoek.trim().length < 2" class="pa-zoek__leeg">{{ t('Two or more characters needed') }}</li>
						<li v-else-if="zoekBezig" class="pa-zoek__leeg"><span class="pa-zoek__wiel" /> {{ t('Searching…') }}</li>
						<li v-else-if="!zoekResultaten.length" class="pa-zoek__leeg">{{ t('No results') }}</li>
						<li v-for="(r, i) in zoekResultaten" :key="i">
							<button type="button" class="pa-zoek__item" @click="gaNaar(r)">
								<span class="pa-zoek__soort">{{ r.soort }}</span>
								<span class="pa-zoek__titel">{{ r.titel }}</span>
								<small v-if="r.onder">{{ r.onder }}</small>
							</button>
						</li>
					</ul>
				</li>
				<NcAppNavigationItem :name="t('Today')"
					:active="tab === 'today'"
					@click="tab = 'today'; jumpDate = null">
					<template #icon>
						<MaterialIcoon naam="home" :size="20" />
					</template>
				</NcAppNavigationItem>
				<!-- De volgorde komt uit je instellingen en is dus op telefoon, web en Nextcloud dezelfde
				     (Ramin, 24-09). Sleep je hem op het ene apparaat, dan staat hij op het andere ook zo. -->
				<NcAppNavigationItem v-for="(m, i) in menuItems" :key="m.id" :name="m.naam()" :active="tab === m.id"
					:telling="badgeVoor(m.id)"
					draggable :sleept="sleepIndex === i" :doel="sleepDoel === i"
					@click="kiesMenu(m)"
					@sleep-start="sleepIndex = i"
					@sleep-over="sleepDoel = i"
					@sleep-drop="legNeer(i)"
					@sleep-eind="sleepIndex = null; sleepDoel = null">
					<template #icon>
						<MaterialIcoon :naam="m.icoon" :size="20" />
					</template>
				</NcAppNavigationItem>
				<!-- Instellingen begint vooraan, ook als je er de vorige keer via Rijmodus binnenkwam: anders
			     blijft die diepe link staan en opent dit knopje bij Weergave (24-09). -->
				<NcAppNavigationItem :name="t('Settings')"
					:active="tab === 'settings'"
					@click="openInstellingen">
					<template #icon>
						<MaterialIcoon naam="settings" :size="20" />
					</template>
				</NcAppNavigationItem>
			</template>
		</NcAppNavigation>
		<NcAppContent>
			<!-- Statusbalk boven elk scherm (Ramin, 2026-09-15, kaart 69); Vandaag levert de gegevens. -->
			<StatusBar :weer="status.weer" :vertrek="status.vertrek" :bijgewerkt="status.bijgewerkt" :open-taken="status.openTaken" @open-items="tab = 'open'" />
			<TodayView v-if="tab === 'today'" :initial-date="jumpDate" @open-items="tab = 'open'" @status="status = $event" @ga-tab="tab = $event" />
			<OpenItemsView v-else-if="tab === 'open'" @open-deck="deckSprong = $event; tab = 'deck'" />
			<TripView v-else-if="tab === 'trip'" />
			<GroceriesView v-else-if="tab === 'groceries'" />
			<ReceiptsView v-else-if="tab === 'receipts'" />
			<FuelView v-else-if="tab === 'fuel'" />
			<RidesView v-else-if="tab === 'rides'" />
			<NearbyView v-else-if="tab === 'nearby'" />
			<SeriesView v-else-if="tab === 'series'" />
			<CallsView v-else-if="tab === 'calls'" />
			<CalendarView v-else-if="tab === 'calendar'" @day-click="onDayClick" />
			<LocationsView v-else-if="tab === 'locations'" />
			<NotesView v-else-if="tab === 'notes'" />
			<TasksView v-else-if="tab === 'tasks'" />
			<ContactsView v-else-if="tab === 'contacts'" />
			<NetwerkView v-else-if="tab === 'netwerk'" />
			<DeckView v-else-if="tab === 'deck'" :spring-naar="deckSprong" />
			<RssView v-else-if="tab === 'news'" />
			<PodcastView v-else-if="tab === 'podcasts'" />
			<MarketsView v-else-if="tab === 'markets'" />
			<DeliveriesView v-else-if="tab === 'deliveries'" />
			<HelpView v-else-if="tab === 'support'" @ga="gaNaar" />
			<!-- De sleutel bevat de diepe link: kom je vanuit een ander menu-onderdeel opnieuw binnen, dan
			     bouwt het scherm zich opnieuw op en opent het op het goede tabblad. Zonder sleutel bleef de
			     eerste keuze staan, want de begintoestand wordt maar een keer bepaald (24-09). -->
			<SettingsView v-else :key="'s-' + (settingsTab || '') + '-' + (settingsSubTab || '')"
				:initial-tab="settingsTab" :initial-sub-tab="settingsSubTab" />
			<!-- Voettekst onder elk scherm (kaart 123, Ramin: "jouw suggestie plus chat"): versie, privacy,
			     voorwaarden, hulp/chat, en van wie het is. -->
			<footer class="pa-voet">
				<span>AskAnina {{ versie }} · BERWERS innovations</span>
				<a :href="siteUrl + '?p=privacy'" target="_blank" rel="noopener">{{ t('Privacy') }}</a>
				<a :href="siteUrl + '?p=terms'" target="_blank" rel="noopener">{{ t('Terms') }}</a>
				<button type="button" class="pa-voet__knop" @click="tab = 'support'">{{ t('Help & chat') }}</button>
			</footer>
		</NcAppContent>
		<!-- Het paneel naast je scherm (Ramin, 24-09): tabbladen die je zelf kiest, zodat de breedte die
		     hier toch was iets doet. Ook op Vandaag -- juist daar wil je je nieuws of je taken ernaast
		     (Ramin: "anders heeft het geen zin om Nieuws naast Nieuws te hebben"). Het scherm waar je op
		     staat valt vanzelf uit de tabbladen, dus dubbel staat er nooit iets. Alleen op een smal scherm
		     valt het paneel weg, want daar is geen ruimte naast. -->
		<ZijPaneel v-if="ingelogd && !vergrendeld" :tellingen="paneelTellingen" :huidige-tab="tab" />
		<!-- De podcastbalk hoort bij de APP, niet bij het podcastscherm (Ramin, 25-09: "laat die
		     doorspelen"). Hij staat hier, buiten de schermen, en wordt dus nooit afgebroken als je
		     ergens anders heen gaat. Alleen zijn plek hangt van het scherm af. -->
		<SpelerBalk v-if="ingelogd && !vergrendeld" :op-podcast-pagina="tab === 'podcasts'" />
	</NcContent>
</template>

<script>
import NcContent from '@nextcloud/vue/components/NcContent'
import NcAppNavigation from '@nextcloud/vue/components/NcAppNavigation'
import NcAppNavigationItem from '@nextcloud/vue/components/NcAppNavigationItem'
import NcAppContent from '@nextcloud/vue/components/NcAppContent'
import SpelerBalk from './components/SpelerBalk.vue'
import MaterialIcoon from './components/MaterialIcoon.vue'
import { tellingen, ververs as ververselTellingen } from './api/tellingen.js'
import MarketsView from './components/MarketsView.vue'
import DeliveriesView from './components/DeliveriesView.vue'
import HelpView from './components/HelpView.vue'
import { features as haalFeatures, zorgVoorToestelsleutel } from './api/paApi.js'
import { zetVoorinvulling } from './api/voorinvulling.js'
import RssView from './components/RssView.vue'
import PodcastView from './components/PodcastView.vue'
import TodayView from './components/TodayView.vue'
import CalendarView from './components/CalendarView.vue'
import { navigatie } from './api/navigatie.js'
import { zoek } from './api/zoeken.js'
import LocationsView from './components/LocationsView.vue'
import NotesView from './components/NotesView.vue'
import TasksView from './components/TasksView.vue'
import ContactsView from './components/ContactsView.vue'
import NetwerkView from './components/NetwerkView.vue'
import DeckView from './components/DeckView.vue'
import SettingsView from './components/SettingsView.vue'
import OpenItemsView from './components/OpenItemsView.vue'
import GroceriesView from './components/GroceriesView.vue'
import ReceiptsView from './components/ReceiptsView.vue'
import FuelView from './components/FuelView.vue'
import TripView from './components/TripView.vue'
import { getSettings, setSettings } from './api/nextcloudUserData.js'
import { watch } from 'vue'
import { staat as sync, gingOver, startLuisteren, stopLuisteren } from './api/sync.js'
import { t, useCountry } from './l10n/index.js'
import { WEB } from './mode.js'
// Versie en site-adres voor de voettekst (kaart 123); de site staat naast de web-agenda.
const APP_VERSIE = (typeof __PA_VERSIE__ !== 'undefined') ? __PA_VERSIE__ : ''
const SITE_URL = (typeof window !== 'undefined' && window.location && /\/app\/?$/.test(window.location.pathname)) ? window.location.pathname.replace(/\/app\/?$/, '/') : 'https://askanina.com/'
import { getAccessCode, isLocked, setLocked, setAccessCode } from './api/accessCode.js'
import LoginView from './components/LoginView.vue'
import StatusBar from './components/StatusBar.vue'
import RidesView from './components/RidesView.vue'
import NearbyView from './components/NearbyView.vue'
import SeriesView from './components/SeriesView.vue'
import CallsView from './components/CallsView.vue'
import ZijPaneel from './components/ZijPaneel.vue'

/**
 * De menu-items van de web-agenda, in dezelfde volgorde als op de telefoon (Ramin, 24-09: *"zet de
 * volgorde van de menu-items zoals in Android"*), met dezelfde codes.
 *
 * Deze volgorde geldt zolang je er zelf niets van gemaakt hebt; daarna wint `menuOrder` uit je
 * instellingen. Gesprekken, ritten, series, in de buurt en rijmodus staan er niet in -- die schermen
 * bestaan hier nog niet -- maar ze blijven wel in je volgorde staan en zijn in de instellingen te
 * verslepen, zodat je de telefoon vanaf het web compleet kunt ordenen.
 *
 * De codes zijn met opzet identiek aan `Rollen.ALLE_MENU` in de Android-app, want ze staan samen in een
 * instelling die beide kanten lezen en schrijven. Een uitzondering: de reis heet hier `trip` en daar
 * `trips`; dat wordt hieronder rechtgetrokken zodat je er verder nergens aan hoeft te denken.
 */
const ALLE_MENU = [
	{ id: 'deck', naam: () => 'Deck', icoon: 'viewAgenda' },
	{ id: 'open', naam: () => t('Open items'), icoon: 'checklist' },
	{ id: 'tasks', naam: () => t('Tasks'), icoon: 'taskAlt' },
	{ id: 'contacts', naam: () => t('Contacts'), icoon: 'person' },
	// Het netwerk (kaart 39): staat naast Contacten, want dat is waar het over gaat.
	{ id: 'netwerk', naam: () => t('Network'), icoon: 'hub' },
	{ id: 'calls', naam: () => t('Calls'), icoon: 'call' },
	{ id: 'groceries', naam: () => t('Shopping list'), icoon: 'shoppingCart' },
	{ id: 'notes', naam: () => t('Notes'), icoon: 'description' },
	{ id: 'receipts', naam: () => t('Receipts'), icoon: 'receipt' },
	{ id: 'locations', naam: () => t('Locations'), icoon: 'place' },
	{ id: 'nearby', naam: () => t('Nearby'), icoon: 'explore' },
	{ id: 'fuel', naam: () => t('Fuel'), icoon: 'localGasStation' },
	{ id: 'rides', naam: () => t('Rides'), icoon: 'route' },
	{ id: 'news', naam: () => t('News'), icoon: 'rssFeed' },
	{ id: 'podcasts', naam: () => t('Podcasts'), icoon: 'podcastMic' },
	{ id: 'series', naam: () => t('Series'), icoon: 'tv' },
	{ id: 'markets', naam: () => t('Markets'), icoon: 'showChart' },
	{ id: 'deliveries', naam: () => t('Deliveries'), icoon: 'localShipping' },
	{ id: 'trip', naam: () => t('Trip'), icoon: 'luggage' },
	{ id: 'calendar', naam: () => t('Calendar'), icoon: 'calendarMonth' },
	{ id: 'support', naam: () => t('Help'), icoon: 'helpOutline' },
	/*
	 * Rijmodus staat wel in het menu maar heeft hier geen eigen scherm (Ramin, 24-09: *"we kunnen
	 * Drive gewoon tonen, maar dan tonen we de instellingen pagina"*). Rijden doe je met je
	 * telefoon; wat je erover kunt instellen hoort wél overal te bereiken te zijn. Klikken brengt
	 * je dus naar die instellingen, zodat het onderdeel niet als lege plek in je menu staat.
	 */
	{ id: 'drive', naam: () => t('Drive mode'), icoon: 'directionsCar', instellingen: { tab: 'display', sub: 'drive' } },
]

export default {
	name: 'App',
	components: {
		NcContent,
		NcAppNavigation,
		NcAppNavigationItem,
		NcAppContent,
		SpelerBalk,
		MaterialIcoon,
		TodayView,
		CalendarView,
		LocationsView,
		NotesView, TasksView, ContactsView, NetwerkView, DeckView,
		SettingsView,
		OpenItemsView,
		GroceriesView,
		ReceiptsView,
		FuelView,
		TripView,
		LoginView,
		StatusBar,
		ZijPaneel,
		RidesView,
		NearbyView,
		SeriesView,
		CallsView,
		MarketsView,
		DeliveriesView,
		HelpView,
		RssView,
		PodcastView,
	},
	data() {
		return { versie: APP_VERSIE, siteUrl: SITE_URL, tab: 'today', jumpDate: null, web: WEB, ingelogd: !!getAccessCode(), vergrendeld: isLocked(), uitgezet: [], beheerder: false, status: { weer: null, vertrek: null, bijgewerkt: null, openTaken: [] }, settingsTab: null, settingsSubTab: null, deckSprong: null, zoek: '', zoekResultaten: [], zoekBezig: false, zoekTimer: null, zoekVolgnr: 0, settings: null, stopKijken: null, sleepIndex: null, sleepDoel: null }
	},
	computed: {
		/**
		 * De menu-items in de volgorde die in je instellingen staat (`menuOrder`), met de items die je hebt
		 * weggezet eruit (`menuHidden`).
		 *
		 * Ramin, 24-09: *"zet de volgorde van de menu-items zoals in Android en omgekeerd"*. De volgorde
		 * hoort bij jou en niet bij het apparaat, dus hij staat in je instellingen -- hetzelfde veld dat de
		 * telefoon gebruikt. Sleep je hem hier, dan staat hij op de telefoon ook zo, en andersom.
		 *
		 * Twee dingen die deze lijst NIET doet, met opzet:
		 *  - Vandaag en Instellingen staan er niet in; die horen vast boven- en onderaan, net als op de
		 *    telefoon.
		 *  - Wat de telefoon wel kent maar het web niet (gesprekken, ritten, series, in de buurt,
		 *    rijmodus) blijft gewoon in je volgorde staan. We slaan het hier over in plaats van het weg te
		 *    gooien, anders zou openen van de web-agenda die items van je telefoon vegen.
		 */
		/** Aantallen bij de tabbladen van het zijpaneel, zoals de badges bij de snelkeuzes op de telefoon. */
		paneelTellingen() {
			// Ook het rechterpaneel krijgt de aantallen op zijn knoppen (Ramin, 24-09).
			return { open: (this.status.openTaken || []).length, news: tellingen.nieuws, podcasts: tellingen.podcasts }
		},
		menuItems() {
			// De telefoon noemt de reis 'trips', wij 'trip'. Een naamsverschil uit het verleden; hier
			// rechtgetrokken zodat beide kanten dezelfde volgorde lezen zonder dat een van de twee het
			// item kwijtraakt.
			const order = (this.settings?.menuOrder || []).map((id) => (id === 'trips' ? 'trip' : id))
			const hidden = this.settings?.menuHidden || []
			const rest = ALLE_MENU.filter((m) => !order.includes(m.id))
			const gesorteerd = order.map((id) => ALLE_MENU.find((m) => m.id === id)).filter(Boolean).concat(rest)
			return gesorteerd.filter((m) => !hidden.includes(m.id) && this.aan(m.id))
		},

		/** Volledige link naar de back-office (zelfde site als de web-agenda). */
		beheerUrl() { return new URL('../beheer/', window.location.href).toString() },
		navVerzoek() { return navigatie.verzoek },
	},
	watch: {
		// Een scherm vraagt om een ander scherm (foutknop "Naar Instellingen").
		navVerzoek(v) {
			if (!v) return
			this.settingsTab = v.onderdeel || null
			this.settingsSubTab = v.subOnderdeel || null
			this.tab = v.tab
		},
	},
	async created() {
		/*
		 * Eerst een toestelsleutel, dan pas praten (29-09-2026).
		 *
		 * Dit moet vóór elke andere aanroep staan, anders gaan de eerste verzoeken van elke sessie nog op
		 * de kale code de deur uit -- en juist die deur gaat straks dicht. Het kost één verzoek, eenmalig
		 * per browser; daarna ligt de sleutel in localStorage en slaat deze regel zichzelf over.
		 *
		 * Lukt het niet, dan werkt de app door op de code. Zie zorgVoorToestelsleutel() voor waarom dat
		 * vandaag de goede keuze is en vanaf welk moment het dat niet meer is.
		 */
		await zorgVoorToestelsleutel(getAccessCode()).catch(() => false)
		// Het gekozen land uit het versleutelde bestand, vóór het eerste scherm.
		try {
			const s = await getSettings()
			this.settings = s || null
			// De taal van de app volgt je eigen keuze, niet die van de pagina eromheen. Staat er geen land
			// ingesteld, dan weten we het meestal toch: waar je woont, of welke taal Anina spreekt. Zonder
			// dit stond dezelfde app op askanina.com in het Nederlands en binnen Nextcloud in het Engels,
			// puur omdat die twee pagina's een andere taal opgeven (gemeten 24-09).
			const land = (s && (s.country || s.homeCountryCode)) || null
			const taal = (s && (s.language || s.aninaTaal || s.novaTaal)) || null
			if (land || taal) useCountry(land || taal, taal)
		} catch (e) { /* zonder instellingen volgt de app Nextcloud */ }
	},
	mounted() {
		this.laadFeatures()
		// Eén oor voor de hele app (Ramin, 24-09): verandert er iets op een ander apparaat, dan horen alle
		// schermen dat meteen in plaats van dat elk scherm zijn eigen verbinding openhoudt.
		startLuisteren()
		// Instellingen kunnen ook op een ander apparaat gewijzigd zijn; dan klopt het menu hier nog niet.
		this.stopKijken = watch(() => sync.versie, async () => {
			// Nieuwe afleveringen of artikelen: de server seint 'feeds' zodra hij ze ziet, dus de badges
			// kloppen zonder dat je iets opent (Ramin, 24-09).
			/*
			 * Elk ding dat langskwam afhandelen -- niet stoppen bij het eerste.
			 *
			 * Hier stond een `return` na de tellingen. Dat werkte zolang de server een enkele soort per
			 * ronde meldde, maar sinds de wijzigingen per soort binnenkomen (25-09) komt er een lijstje:
			 * ['settings', 'feeds', 'seen']. De eerste regel matchte, telde de badges, en stopte -- en dan
			 * werd je menu-volgorde nooit opgehaald. Precies de klacht "het menu wordt weer niet gesynct".
			 */
			if (gingOver('feeds', 'seen')) {
				ververselTellingen({ altijd: true }).catch(() => {})
			}
			if (gingOver('settings')) {
				const s = await getSettings().catch(() => null)
				if (s) this.settings = s
			}
		})
		// De aantallen meteen bij het opstarten, anders zie je de badge pas als je het scherm al opent.
		ververselTellingen().catch(() => {})
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
		stopLuisteren()
	},
	methods: {
		/** Functie aan voor deze tier (back-office, kaart 119)? Geen antwoord = aan. */
		aan(naam) { return !this.uitgezet.includes(naam) },
		async laadFeatures() {
			try { const f = await haalFeatures(getAccessCode() || ''); this.uitgezet = Object.keys(f.features || {}).filter((k) => f.features[k] === false); this.beheerder = !!f.isAdmin } catch (e) { /* dan alles aan */ }
		},
		/** Back-office in een nieuw tabblad (kaart 119); zelfde site, dus meteen ingelogd. */
		/**
		 * Een menu-item op zijn nieuwe plek leggen (Ramin, 24-09: *"maak de menu-items ook
		 * drag-and-droppable"*).
		 *
		 * De volgorde komt uit je instellingen en gaat er ook weer heen, dus je telefoon en Nextcloud
		 * nemen hem meteen over -- `settings/set.php` meldt de wijziging en het gedeelde oor doet de rest.
		 *
		 * Wat het web niet kent (gesprekken op de telefoon, rijmodus) blijft staan waar het stond: we
		 * schuiven alleen binnen de items die hier zichtbaar zijn en plakken de rest er weer achter.
		 */
		/** Een onderdeel zonder eigen scherm opent zijn instellingen (Ramin, 24-09). */
		/**
		 * Het getal naast een menu-item: ongelezen nieuws, nog te beluisteren afleveringen (Ramin, 24-09).
		 * De rest van het menu heeft geen teller -- dan zegt een badge iets waar hij niet voor staat.
		 */
		badgeVoor(id) {
			if (id === 'news') return tellingen.nieuws
			if (id === 'podcasts') return tellingen.podcasts
			return 0
		},
		/** Instellingen vanaf het knopje onderaan: zonder diepe link, dus op het eerste tabblad. */
		openInstellingen() {
			this.settingsTab = null
			this.settingsSubTab = null
			this.tab = 'settings'
		},
		kiesMenu(m) {
			if (m.instellingen) {
				this.settingsTab = m.instellingen.tab
				this.settingsSubTab = m.instellingen.sub
				this.tab = 'settings'
				return
			}
			// Een gewone klik op Instellingen begint vooraan. Zonder dit bleef de diepe link van de
			// vorige keer staan: wie eenmaal op Rijmodus had geklikt, kwam daarna bij elke klik op
			// Instellingen weer bij Weergave > Rijmodus uit (24-09).
			if (m.id === 'settings') {
				this.settingsTab = null
				this.settingsSubTab = null
			}
			this.tab = m.id
		},
		async legNeer(naar) {
			const van = this.sleepIndex
			this.sleepIndex = null
			this.sleepDoel = null
			if (van === null || van === naar) return
			/*
			 * De bewaarde lijst op zijn plek bewerken, niet opnieuw opbouwen (Ramin, 24-09: *"hoe gaan we
			 * om met menu-items die niet in de web-app staan, wel op de telefoon?"*).
			 *
			 * Hiervoor werd de lijst gemaakt als "alles wat ik zie" plus "de rest erachteraan". Elk
			 * onderdeel dat het web niet kent -- rijmodus, marketing -- schoof daardoor bij élke sleep een
			 * stukje naar het eind, tot het onderaan stond zonder dat iemand daarom vroeg. Nu halen we
			 * alleen het versleepte item eruit en zetten het terug op zijn nieuwe plek; al het andere
			 * blijft staan waar het stond. Zo doet het menulint op de telefoon het ook.
			 *
			 * De namen: hier heet het reisscherm 'trip', op de telefoon 'trips'.
			 */
			const zichtbaar = this.menuItems.map((m) => m.id)
			const naarTelefoon = (id) => (id === 'trip' ? 'trips' : id)
			const wat = naarTelefoon(zichtbaar[van])
			const waarheen = naarTelefoon(zichtbaar[naar])
			const lijst = (this.settings?.menuOrder || []).slice().filter((id) => id !== wat)
			let doel = lijst.indexOf(waarheen)
			if (doel < 0) doel = lijst.length
			else if (naar > van) doel += 1
			lijst.splice(doel, 0, wat)
			// Wat het web kent maar nog niet in de lijst stond, komt er achteraan bij.
			for (const id of zichtbaar.map(naarTelefoon)) if (!lijst.includes(id)) lijst.push(id)
			const nieuw = lijst
			this.settings = { ...(this.settings || {}), menuOrder: nieuw }
			const s = await getSettings().catch(() => null)
			if (s) await setSettings({ ...s, menuOrder: nieuw }).catch(() => {})
		},
		openBeheer() { window.open(this.beheerUrl, '_blank') },
		/** Vanaf het vergrendelscherm helemaal uitloggen (kaart 7). */
		uitloggen() { setAccessCode(''); setLocked(false); window.location.reload() },
		t(...args) {
			return t(...args)
		},
		onDayClick(date) {
			this.jumpDate = date
			this.tab = 'today'
		},
		zoekNu() {
			clearTimeout(this.zoekTimer)
			const vraag = this.zoek.trim()
			if (vraag.length < 2) { this.zoekResultaten = []; return }
			this.zoekBezig = true
			const nr = ++this.zoekVolgnr
			this.zoekTimer = setTimeout(async () => {
				const uit = await zoek(vraag).catch(() => [])
				if (nr !== this.zoekVolgnr) return
				this.zoekResultaten = uit
				this.zoekBezig = false
			}, 300)
		},
		gaNaar(r) {
			this.zoek = ''
			this.zoekResultaten = []
			if (r.tab === 'settings') {
				this.settingsTab = r.settingsTab || null
				this.settingsSubTab = r.settingsSubTab || null
			}
			if (r.date) this.jumpDate = r.date
			// Het item zelf openen, niet alleen het onderdeel (kaart 104).
			if (r.deck) this.deckSprong = r.deck
			if (r.open) zetVoorinvulling('open-' + r.open.soort, r.open)
			this.tab = r.tab
		},
	},
}
</script>

<style>
/*
 * Schuifbalken, overal in de app (Ramin, 24-09: *"kan de slider aan de buitenkant, en in darkmode een
 * donkere kleur krijgen"*). In donkere modus stond er een felwitte balk over het agenda-rooster.
 *
 * De kleuren komen uit de thema-variabelen, dus hij volgt vanzelf licht en donker -- zonder dat er ergens
 * een vaste kleur staat die bij het andere thema misstaat. De baan zelf blijft doorzichtig, zodat de balk
 * op elke ondergrond past.
 *
 * `scrollbar-color` regelt Firefox, de `::-webkit-`-regels doen Chrome, Edge en Safari. Allebei nodig:
 * geen van beide kent de ander.
 */
* {
	scrollbar-width: thin;
	scrollbar-color: var(--color-border-dark, rgba(128, 128, 128, 0.5)) transparent;
}
*::-webkit-scrollbar {
	width: 10px;
	height: 10px;
}
*::-webkit-scrollbar-track {
	background: transparent;
}
*::-webkit-scrollbar-thumb {
	background: var(--color-border-dark, rgba(128, 128, 128, 0.45));
	border-radius: 999px;
	/* Een rand in de kleur van de achtergrond maakt de balk optisch smaller en houdt hem van de inhoud af. */
	border: 2px solid transparent;
	background-clip: content-box;
}
*::-webkit-scrollbar-thumb:hover {
	background: var(--color-text-maxcontrast, rgba(128, 128, 128, 0.75));
	background-clip: content-box;
}
/* Geen pijltjes boven en onder: die zijn op een aanraakscherm toch niet te raken. */
*::-webkit-scrollbar-button {
	display: none;
}

/* In donkere modus is er geen thema-variabele om op terug te vallen; dan zelf een gedempte grijstint. */
@media (prefers-color-scheme: dark) {
	* {
		scrollbar-color: rgba(255, 255, 255, 0.28) transparent;
	}
	*::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.28);
		background-clip: content-box;
	}
	*::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.45);
		background-clip: content-box;
	}
}

/* Losse invoervelden (buiten NcTextField) zagen eruit als kale browser-velden, wit
   in het donkere thema (Ramin, 2026-09-15). Eén regel voor alle schermen; :where
   houdt de specificiteit op nul, dus de Nextcloud-componenten winnen altijd. */
:where(.app-personalassistant, #content-vue, #pa-web-app, .pa-login) :where(input:not([type='checkbox'], [type='radio'], [type='file'], [type='range'], [type='color'], .input-field__input, .checkbox-radio-switch__input), textarea, select:not(.select__input)) {
	box-sizing: border-box; padding: 6px 10px; min-height: 34px; font: inherit; color: var(--color-main-text, #222);
	background: var(--color-main-background, #fff); border: 1px solid var(--color-border-maxcontrast, #949494); border-radius: var(--border-radius-large, 10px);
}
:where(.app-personalassistant, #content-vue, #pa-web-app, .pa-login) :where(input, textarea, select):focus-visible { outline: 2px solid var(--color-primary-element, #1e3a5f); outline-offset: -1px; }
:where(.app-personalassistant, #content-vue, #pa-web-app, .pa-login) :where(input:not([type='checkbox'], [type='radio']), textarea, select)::placeholder { color: var(--color-text-maxcontrast, #888); }
:where(.app-personalassistant, #content-vue, #pa-web-app, .pa-login) :where(input[type='checkbox'], input[type='radio']) { accent-color: var(--color-primary-element, #1e3a5f); width: 18px; height: 18px; }
.pa-zoek { list-style: none; margin: 0 0 5px; padding: 0 3px; position: relative; }
.pa-zoek__veld { width: 100%; box-sizing: border-box; padding: 4px 10px; font-size: 0.94em; border: 1px solid var(--color-border, #ccc); border-radius: 999px; font: inherit; background: var(--color-main-background, #fff); color: inherit; }
.pa-zoek__lijst { list-style: none; margin: 6px 0 0; padding: 4px; max-height: 60vh; overflow-y: auto; border: 1px solid var(--color-border, #ccc); border-radius: 10px; background: var(--color-main-background, #fff); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15); }
.pa-zoek__leeg { padding: 8px 10px; color: var(--color-text-maxcontrast, #666); font-size: 0.9em; display: flex; align-items: center; gap: 8px; }
.pa-zoek__wiel { width: 14px; height: 14px; border: 2px solid var(--color-border-dark, #bbb); border-top-color: var(--color-primary-element, #1e3a5f); border-radius: 50%; animation: pa-zoek-draai 0.8s linear infinite; display: inline-block; }
@keyframes pa-zoek-draai { to { transform: rotate(360deg); } }
.pa-binnenkort { max-width: 40em; }
.pa-binnenkort h2 { margin-top: 0; }
.pa-zoek__item { display: flex; flex-direction: column; align-items: flex-start; width: 100%; text-align: left; background: none; border: none; padding: 6px 10px; border-radius: 8px; cursor: pointer; color: inherit; font: inherit; }
.pa-zoek__item:hover, .pa-zoek__item:focus { background: var(--color-background-hover, #f0f0f0); }
.pa-zoek__soort { font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-primary-element, #1e3a5f); }
.pa-zoek__titel { font-weight: 600; }
.pa-zoek__item small { color: var(--color-text-maxcontrast, #666); }
.pa-beheer-link { display: flex; align-items: center; gap: 10px; padding: 8px 12px; margin: 2px 8px; border-radius: 8px; color: var(--color-main-text); text-decoration: none; }
.pa-beheer-link:hover { background: var(--color-background-hover); }
.pa-voet { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; justify-content: center; margin: 32px 16px 16px; padding-top: 10px; border-top: 1px solid var(--color-border, #ddd); font-size: 12px; color: var(--color-text-maxcontrast, #666); }
.pa-voet a, .pa-voet__knop { color: inherit; text-decoration: underline; background: none; border: 0; padding: 0; font: inherit; cursor: pointer; }
</style>