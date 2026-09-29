<template>
	<div class="pa-settings">
		<h2>{{ t('Settings') }}</h2>

		<NcNoteCard v-if="loadError" type="error">{{ loadError }}</NcNoteCard>

		<!-- Same top-level grouping as the Android app (Ramin, 2026-09-09:
		     "Bereid Settings in Nextcloud-app uit... gebruik dezelfde
		     indeling", repeated 2026-09-09 "de Settings van de NC-app is nog
		     miniem... neem de Android-versie over") — General / Details
		     (Private,Work,Travel) / Account(Nextcloud,APIs). Digest times
		     ARE ported (below) even though this browser tab can't itself
		     send the notification — it's the same field Android reads back
		     out, so setting it here is just a more convenient input method.
		     Ride-hailing is ALSO ported, but per-browser (localStorage, see
		     rideHailing.js) rather than the shared blob — matches Android's
		     own SyncedSettings, which excludes it for the same reason
		     (which apps you have installed only means something on THIS
		     device). Preferred-airlines now has the same name-search-while-
		     typing Android has (airlines_iata.json, same bundled snapshot).
		     Still deliberately NOT ported: quick picks (Android's nav-drawer
		     shortcut picker — this app's nav is fixed, not customizable),
		     theme/language (Nextcloud's own Personal Settings already
		     control both for every app including this one — a second,
		     independent override here would just be confusing, not useful),
		     navigation-app deep links, call-log, swipe actions, the
		     Local/on-device calendar source (all tied to a specific phone,
		     or a gesture this browser tab has no equivalent for). About is
		     a simple static section, not lifted from Android's own (which
		     links to in-app legal pages this app doesn't have yet). -->
		<div class="pa-settings__tabs">
			<button v-for="t in tabs" :key="t.id" type="button" :class="{ 'pa-settings__tab--active': tab === t.id }" class="pa-settings__tab" @click="tab = t.id">
				{{ t.label }}
			</button>
		</div>

		<template v-if="tab === 'details'">
			<div class="pa-settings__subtabs">
				<button v-for="t in detailsSubTabs" :key="t.id" type="button" :class="{ 'pa-settings__chip--active': detailsSubTab === t.id }" class="pa-settings__chip" @click="detailsSubTab = t.id">
					{{ t.label }}
				</button>
			</div>

			<template v-if="detailsSubTab === 'private'">
				<h3>{{ t('My details') }}</h3>
				<!-- Naam en geboortedatum stonden alleen op de telefoon, terwijl het gedeelde velden zijn
				     (Ramin, 24-09). Anina gebruikt je naam in wat ze zegt, en je geboortedatum geeft je je
				     eigen verjaardagskaart. -->
				<NcTextField :model-value="firstName" :label="t('First name')" @update:model-value="(v) => { firstName = v; save() }" />
				<NcTextField :model-value="lastName" :label="t('Last name')" @update:model-value="(v) => { lastName = v; save() }" />
				<label class="pa-vehicle__field">{{ t('Date of birth') }}
					<input type="date" class="pa-vehicle__select" :value="dateOfBirth || ''" @change="dateOfBirth = $event.target.value; save()">
				</label>
				<NcTextField :model-value="homeAddress" :label="t('Home address')" @update:model-value="(v) => { homeAddress = v; save() }" />
				<NcButton :disabled="!homeAddress" @click="geocodeHome">{{ t('Search') }}</NcButton>
				<span v-if="homeGeocodeStatus">{{ homeGeocodeStatus }}</span>

				<!-- Ramin, 2026-09-10: "geef optie om adres sportschool in te
				     geven... Maak My details card onder private-tab,
				     Locations" — exact same-location match wins the sport
				     card when set; keyword detection (title/location text)
				     is the fallback used otherwise, server-side. -->

				<h3>{{ t('Locations') }}</h3>
				<NcTextField :model-value="gymAddress" :label="t('Gym address')" @update:model-value="(v) => { gymAddress = v; save() }" />
				<NcButton :disabled="!gymAddress" @click="geocodeGym">{{ t('Search') }}</NcButton>
				<span v-if="gymGeocodeStatus">{{ gymGeocodeStatus }}</span>


				<h3>{{ t('Defaults') }}</h3>
				<NcTextField :model-value="gettingReadyHomeMinutes" :label="t('Getting ready at home (minutes)')" type="number" @update:model-value="(v) => { gettingReadyHomeMinutes = v; save() }" />
				<NcTextField :model-value="gettingReadyWorkMinutes" :label="t('Getting ready at work (minutes)')" type="number" @update:model-value="(v) => { gettingReadyWorkMinutes = v; save() }" />
				<NcTextField :model-value="arrivalBufferMinutes" :label="t('Arrival buffer (minutes)')" type="number" @update:model-value="(v) => { arrivalBufferMinutes = v; save() }" />
				<NcTextField :model-value="gapThresholdMinutes" :label="t('Gap threshold (minutes)')" type="number" @update:model-value="(v) => { gapThresholdMinutes = v; save() }" />
				<!-- F4 (structuurplan V2): na een afspraak onder werktijd alleen terug naar kantoor als er nog genoeg werkdag over is. -->
				<NcTextField :model-value="returnToOfficeMinutes" :label="t('Back to the office only if at least this many minutes of the working day remain')" type="number" @update:model-value="(v) => { returnToOfficeMinutes = v; save() }" />

				<!-- F4 (V1): wat wint bij overlap — slepen, of de pijltjes. -->
				<!-- Rollen (V4): meerdere mag; ze bepalen de startset op de telefoon en de prioriteiten-standaard bij de onboarding. -->

				<h3>{{ t('What are you?') }}</h3>
				<p class="pa-hint">{{ t('Pick everything that fits. You can change it later.') }}</p>
				<div class="pa-rollen">
					<button v-for="r in ROLLEN" :key="r" type="button" class="pa-rol" :class="{ 'pa-rol--aan': rollen.includes(r) }" @click="wisselRol(r)">{{ t(ROL_LABEL[r]) }}</button>
				</div>
				<!-- De vervolgvragen die bij je rollen horen; dezelfde vijf als in de onboarding en op de
				     telefoon. Een ja zet de bijbehorende menu-onderdelen aan, een nee zet ze achteraan. -->
				<template v-if="rolVragen.length">
					<h3>{{ t('A few more questions') }}</h3>
					<div v-for="v in rolVragen" :key="v" class="pa-rollen">
						<span class="pa-prio__naam">{{ rolVraagLabel(v) }}</span>
						<button type="button" class="pa-rol" :class="{ 'pa-rol--aan': rolAntwoorden[v] === true }" @click="zetRolAntwoord(v, true)">{{ t('Yes') }}</button>
						<button type="button" class="pa-rol" :class="{ 'pa-rol--aan': rolAntwoorden[v] === false }" @click="zetRolAntwoord(v, false)">{{ t('No') }}</button>
					</div>
				</template>

				<h3>{{ t('Documents that expire') }}</h3>
				<p class="pa-hint">{{ t('A passport or licence that runs out; you get a warning before a trip.') }}</p>
				<div v-for="(d, i) in documenten" :key="'doc' + i" class="pa-vehicle">
					<NcTextField :model-value="d.name || ''" :label="t('Name')" @update:model-value="(x) => { d.name = x; save() }" />
					<label class="pa-vehicle__field">{{ t('Expires') }}
						<input type="date" class="pa-vehicle__select" :value="d.expires || ''" @change="d.expires = $event.target.value; save()">
					</label>
					<NcButton @click="documenten.splice(i, 1); save()">{{ t('Remove') }}</NcButton>
				</div>
				<NcButton @click="documenten.push({ name: '', expires: '' })">{{ t('Add document') }}</NcButton>


				<h3>{{ t('Medicines') }}</h3>
				<div v-for="(m, i) in medicijnen" :key="'med' + i" class="pa-vehicle">
					<NcTextField :model-value="m.name || ''" :label="t('Name')" @update:model-value="(x) => { m.name = x; save() }" />
					<NcTextField :model-value="m.dose || ''" :label="t('Dose')" @update:model-value="(x) => { m.dose = x; save() }" />
					<NcTextField :model-value="m.times || ''" :label="t('When')" @update:model-value="(x) => { m.times = x; save() }" />
					<label class="pa-vehicle__active">
						<input type="checkbox" :checked="!!m.repeatPrescription" @change="m.repeatPrescription = $event.target.checked; save()">
						{{ t('Repeat prescription') }}
					</label>
					<label v-if="m.repeatPrescription" class="pa-vehicle__field">{{ t('Order again by') }}
						<input type="date" class="pa-vehicle__select" :value="m.repeatBy || ''" @change="m.repeatBy = $event.target.value; save()">
					</label>
					<NcButton @click="medicijnen.splice(i, 1); save()">{{ t('Remove') }}</NcButton>
				</div>
				<NcButton @click="medicijnen.push({ name: '', dose: '', times: '' })">{{ t('Add medicine') }}</NcButton>


				<h3>{{ t('Subscriptions and fixed costs') }}</h3>
				<p class="pa-hint">{{ t('What renews by itself, and how long before you can still cancel.') }}</p>
				<div v-for="(a, i) in vasteLasten" :key="'sub' + i" class="pa-vehicle">
					<NcTextField :model-value="a.name || ''" :label="t('Name')" @update:model-value="(x) => { a.name = x; save() }" />
					<NcTextField :model-value="String(a.amount || '')" :label="t('Amount')" type="number" @update:model-value="(x) => { a.amount = parseFloat(x) || 0; save() }" />
					<label class="pa-vehicle__field">{{ t('Period') }}
						<select :value="a.period || 'month'" class="pa-vehicle__select" @change="a.period = $event.target.value; save()">
							<option value="month">{{ t('Per month') }}</option>
							<option value="quarter">{{ t('Per quarter') }}</option>
							<option value="year">{{ t('Per year') }}</option>
						</select>
					</label>
					<label class="pa-vehicle__field">{{ t('Renews on') }}
						<input type="date" class="pa-vehicle__select" :value="a.renews || ''" @change="a.renews = $event.target.value; save()">
					</label>
					<NcTextField :model-value="String(a.noticeDays || '')" :label="t('Notice period (days)')" type="number" @update:model-value="(x) => { a.noticeDays = parseInt(x, 10) || 0; save() }" />
					<NcButton @click="vasteLasten.splice(i, 1); save()">{{ t('Remove') }}</NcButton>
				</div>
				<NcButton @click="vasteLasten.push({ name: '', amount: 0, period: 'month' })">{{ t('Add subscription') }}</NcButton>
				<NcTextField :model-value="tankerkoenigKey" :label="t('Tankerkönig API key (Germany)')" @update:model-value="(v) => { tankerkoenigKey = v; save() }" />

			</template>

			<template v-else-if="detailsSubTab === 'work'">
				<h3>{{ t('Work') }}</h3>
				<!-- Losse dagen die afwijken van je patroon staan HIER NIET (Ramin, 24-09: "waar komt dit
				     vandaan? ik zie dit niet terug in Android"). Terecht: op de telefoon is dat geen
				     instelling maar een knop op de werkkaart van die dag zelf. En de betekenis is niet
				     "thuis" maar "wijkt af van het patroon" -- op een dag die al thuis is, betekent
				     dezelfde datum juist kantoor. Als lijstje met datums in de instellingen klopte het
				     label dus niet eens. De waarde blijft bewaard en gaat gewoon mee in de sync; hij hoort
				     alleen op de kaart gezet te worden, niet hier. -->
				<!-- In welke agenda werkafspraken terechtkomen; de lijst komt uit je gekozen agendas. -->
				<label class="pa-vehicle__field">{{ t('Work appointments go to') }}
					<select :value="workCalendarTarget || ''" class="pa-vehicle__select" @change="workCalendarTarget = $event.target.value || null; save()">
						<option value="">{{ t('Default calendar') }}</option>
						<option v-for="c in availableCalendars" :key="c.href" :value="c.href">{{ c.displayName || c.href }}</option>
					</select>
				</label>
				<NcTextField :model-value="workAddress" :label="t('Work address')" @update:model-value="(v) => { workAddress = v; save() }" />
				<NcButton :disabled="!workAddress" @click="geocodeWork">{{ t('Search') }}</NcButton>
				<span v-if="workGeocodeStatus">{{ workGeocodeStatus }}</span>

				<p>{{ t('Commute mode') }}</p>
				<div class="pa-settings__chips">
					<button v-for="m in ['CAR', 'TRAIN', 'BIKE']" :key="m" type="button" :class="{ 'pa-settings__chip--active': workTravelMode === m }" class="pa-settings__chip" @click="workTravelMode = m; save()">{{ m }}</button>
				</div>

				<!-- Ramin, 2026-09-10: "Maak in settings onder WORK een
				     commute sectie: default dep en arr trainstation met
				     tijden" — only relevant once TRAIN is the chosen mode.
				     Redesigned same day to TWO full routes (Home→Work,
				     Work→Home): "that is only one route... we also need
				     one from work to home... time, departure station, put
				     behind the arrival time, and then arrival station...
				     mark the two lines with home to work. and the other
				     line with work to home." Station fields use free-text
				     POI search (poiSearch), same debounced-suggestions
				     pattern as address fields; each row scrolls
				     horizontally rather than squeezing four fields into
				     one narrow column. -->
				<template v-if="workTravelMode === 'TRAIN'">
					<h3>{{ t('Commute') }}</h3>
					<p class="pa-settings__commute-direction">{{ t('Home → Work') }}</p>
					<div class="pa-settings__row pa-settings__row--commute">
						<input type="time" v-model="commuteH2wDepartureTime" class="pa-settings__time pa-settings__time--inline" @change="save()">
						<NcTextField :model-value="commuteH2wDepartureStation" :label="t('Departure station')" class="pa-settings__commute-station"
							@update:model-value="(v) => { commuteH2wDepartureStation = v; save(); searchCommuteStation('h2wDep', v) }" />
						<input type="time" v-model="commuteH2wArrivalTime" class="pa-settings__time pa-settings__time--inline" @change="save()">
						<NcTextField :model-value="commuteH2wArrivalStation" :label="t('Arrival station')" class="pa-settings__commute-station"
							@update:model-value="(v) => { commuteH2wArrivalStation = v; save(); searchCommuteStation('h2wArr', v) }" />
					</div>
					<ul v-if="commuteH2wDepSuggestions.length" class="pa-settings__suggestions">
						<li v-for="poi in commuteH2wDepSuggestions" :key="`${poi.name}-${poi.lat}-${poi.lon}`" @click="pickCommuteStation('h2wDep', poi)">
							{{ poi.name }}<template v-if="poi.address"> — {{ poi.address }}</template>
						</li>
					</ul>
					<ul v-if="commuteH2wArrSuggestions.length" class="pa-settings__suggestions">
						<li v-for="poi in commuteH2wArrSuggestions" :key="`${poi.name}-${poi.lat}-${poi.lon}`" @click="pickCommuteStation('h2wArr', poi)">
							{{ poi.name }}<template v-if="poi.address"> — {{ poi.address }}</template>
						</li>
					</ul>

					<p class="pa-settings__commute-direction">{{ t('Work → Home') }}</p>
					<div class="pa-settings__row pa-settings__row--commute">
						<input type="time" v-model="commuteW2hDepartureTime" class="pa-settings__time pa-settings__time--inline" @change="save()">
						<NcTextField :model-value="commuteW2hDepartureStation" :label="t('Departure station')" class="pa-settings__commute-station"
							@update:model-value="(v) => { commuteW2hDepartureStation = v; save(); searchCommuteStation('w2hDep', v) }" />
						<input type="time" v-model="commuteW2hArrivalTime" class="pa-settings__time pa-settings__time--inline" @change="save()">
						<NcTextField :model-value="commuteW2hArrivalStation" :label="t('Arrival station')" class="pa-settings__commute-station"
							@update:model-value="(v) => { commuteW2hArrivalStation = v; save(); searchCommuteStation('w2hArr', v) }" />
					</div>
					<ul v-if="commuteW2hDepSuggestions.length" class="pa-settings__suggestions">
						<li v-for="poi in commuteW2hDepSuggestions" :key="`${poi.name}-${poi.lat}-${poi.lon}`" @click="pickCommuteStation('w2hDep', poi)">
							{{ poi.name }}<template v-if="poi.address"> — {{ poi.address }}</template>
						</li>
					</ul>
					<ul v-if="commuteW2hArrSuggestions.length" class="pa-settings__suggestions">
						<li v-for="poi in commuteW2hArrSuggestions" :key="`${poi.name}-${poi.lat}-${poi.lon}`" @click="pickCommuteStation('w2hArr', poi)">
							{{ poi.name }}<template v-if="poi.address"> — {{ poi.address }}</template>
						</li>
					</ul>
				</template>

				<!-- Eén rij, drie standen, net als op de telefoon (Ramin, 24-09): leeg is geen werkdag, K is op
				     kantoor, T is thuis. Eén tik loopt ze langs. De letter staat in het vakje zelf, want een
				     vinkje kan maar twee dingen zeggen en wij hebben er drie te zeggen. Hiervoor stonden de
				     werkdagen en de thuiswerkdagen als twee losse rijen op dit scherm -- dezelfde vraag, twee
				     keer gesteld, en je kon ze tegen elkaar in zetten. -->
				<p>{{ t('Work days') }}</p>
				<p class="pa-hint">{{ t('Tap a day: empty is no work, %1$s is at the office, %2$s is from home.', t('O'), t('H')) }}</p>
				<div class="pa-settings__chips">
					<button v-for="d in weekDays" :key="d" type="button" class="pa-werkdag"
						:class="{ 'pa-werkdag--kantoor': werktOp(d) && !thuisOp(d), 'pa-werkdag--thuis': thuisOp(d) }"
						:title="d" @click="wisselWerkdag(d)">
						<span class="pa-werkdag__dag">{{ d.slice(0, 2) }}</span>
						<span class="pa-werkdag__stand">{{ thuisOp(d) ? t('H') : (werktOp(d) ? t('O') : '') }}</span>
					</button>
				</div>

				<NcTextField :model-value="workStartTime" :label="t('Work start (HH:mm)')" @update:model-value="(v) => { workStartTime = v; save() }" />
				<NcTextField :model-value="workEndTime" :label="t('Work end (HH:mm)')" @update:model-value="(v) => { workEndTime = v; save() }" />
			</template>

			<!-- Reizen: hoe je ergens komt en wat er bij vliegen hoort (24-09, indeling gelijk aan de telefoon). -->
			<template v-else-if="detailsSubTab === 'travel'">
			<h3>{{ t('Ride-hailing') }}</h3>
			<!-- Welke app je normaal gebruikt; de onboarding op de site vraagt dit ook en schrijft
			     hetzelfde veld (24-09). -->
			<NcTextField :model-value="taxiApp" :label="t('App you usually use')" :placeholder="'Uber'" @update:model-value="(v) => { taxiApp = v; save() }" />
			<label class="pa-settings__checkbox-row">
				<input type="checkbox" :checked="rideHailing.uberEnabled" @change="setRideHailing('uberEnabled', $event.target.checked)">
				Uber
			</label>
			<label class="pa-settings__checkbox-row">
				<input type="checkbox" :checked="rideHailing.boltEnabled" @change="setRideHailing('boltEnabled', $event.target.checked)">
				Bolt
			</label>
			<label class="pa-settings__checkbox-row">
				<input type="checkbox" :checked="rideHailing.lyftEnabled" @change="setRideHailing('lyftEnabled', $event.target.checked)">
				Lyft
			</label>
			<template v-if="rideHailingEnabledCount > 1">
				<p>{{ t('Default provider') }}</p>
				<div class="pa-settings__chips">
					<button v-for="p in rideHailingProviders" :key="p" type="button"
						:class="{ 'pa-settings__chip--active': rideHailing.defaultProvider === p }"
						class="pa-settings__chip"
						@click="setRideHailing('defaultProvider', p)">{{ p }}</button>
				</div>
			</template>
			<NcTextField v-if="rideHailing.uberEnabled" :model-value="rideHailing.uberProductId"
				:label="t('Uber product ID (optional)')"
				@update:model-value="(v) => setRideHailing('uberProductId', v)" />
			<template v-if="rideHailing.lyftEnabled">
				<NcTextField :model-value="rideHailing.lyftPartnerId"
					:label="t('Lyft partner (client) ID')"
					@update:model-value="(v) => setRideHailing('lyftPartnerId', v)" />
				<NcTextField :model-value="rideHailing.lyftRideTypeId"
					:label="t('Lyft ride type (default: lyft)')"
					@update:model-value="(v) => setRideHailing('lyftRideTypeId', v)" />
			</template>

				<h3>{{ t('Preferred airlines') }}</h3>
				<!-- Van welk vliegveld je normaal vertrekt: dan hoeft de planner er niet naar te raden
				     bij een vlucht zonder vertrekpunt (24-09). -->
				<NcTextField :model-value="vertrekVliegveld" :label="t('Usual departure airport')" :placeholder="'AMS'" @update:model-value="(v) => { vertrekVliegveld = (v || '').toUpperCase(); save() }" />
				<ol v-if="preferredAirlines.length" class="pa-settings__airlines">
					<li v-for="code in preferredAirlines" :key="code">
						{{ airlineName(code) ? `${code} — ${airlineName(code)}` : code }}
						<button type="button" class="pa-settings__linklike" @click="removeAirline(code)">{{ t('remove') }}</button>
					</li>
				</ol>
				<div class="pa-settings__row">
					<NcTextField :model-value="newAirlineCode" :label="t('Add airline (name or 2-letter code)')" @update:model-value="(v) => { newAirlineCode = v }" />
					<NcButton :disabled="newAirlineCode.trim().length !== 2" @click="addAirline">{{ t('Add') }}</NcButton>
				</div>
				<!-- Name-based search-while-typing over the same bundled
				     openflights.org IATA snapshot Android already uses
				     (Ramin, 2026-09-09: "geen search-while-typing naar
				     airliners") — a raw 2-letter code still works via the
				     Add button above for anything this ~980-entry snapshot
				     doesn't have. -->
				<ul v-if="airlineSuggestions.length" class="pa-settings__airline-suggestions">
					<li v-for="s in airlineSuggestions" :key="s.code" @click="addAirlineCode(s.code)">
						{{ s.name }} ({{ s.code }})
					</li>
				</ul>

				<h3>{{ t('Airport timing') }}</h3>
				<NcTextField :model-value="checkinLeadMinutes" :label="t('Default check-in lead (minutes)')" type="number" @update:model-value="(v) => { checkinLeadMinutes = v; save() }" />
				<NcTextField :model-value="arrivalProcessingMinutes" :label="t('Default arrival processing (minutes)')" type="number" @update:model-value="(v) => { arrivalProcessingMinutes = v; save() }" />
			</template>

			<!-- Bezittingen: wat je hebt en wat de planner ervan moet weten. -->
			<template v-else>
				<h3>{{ t('Vehicles') }}</h3>
				<div v-for="(v, i) in vehicles" :key="i" class="pa-vehicle">
					<label class="pa-vehicle__active">
						<input type="radio" name="pa-active-vehicle" :checked="activeVehiclePlate === v.plate" @change="activeVehiclePlate = v.plate; save()">
						{{ t('Driving this one') }}
					</label>
					<NcTextField :model-value="v.name" :label="t('Name')" @update:model-value="(x) => { v.name = x; save() }" />
					<NcTextField :model-value="v.plate" :label="t('Licence plate')" @update:model-value="(x) => { v.plate = x; save() }" />
					<label class="pa-vehicle__field">{{ t('Fuel type') }}
						<select :value="v.fuelType" class="pa-vehicle__select" @change="v.fuelType = $event.target.value; save()">
							<option v-for="f in fuelTypes" :key="f.value" :value="f.value">{{ f.label }}</option>
						</select>
					</label>
					<NcTextField :model-value="String(v.tankLitres || '')" :label="t('Tank (litres)')" type="number" @update:model-value="(x) => { v.tankLitres = parseInt(x, 10) || 0; save() }" />
					<NcTextField :model-value="String(v.kmPerLitre || '')" :label="t('Km per litre')" type="number" @update:model-value="(x) => { v.kmPerLitre = parseFloat(x) || 0; save() }" />
					<NcButton @click="removeVehicle(i)">{{ t('Remove') }}</NcButton>
				</div>
				<NcButton @click="addVehicle">{{ t('Add vehicle') }}</NcButton>
				<!-- Pauzes op lange ritten, zoals op de telefoon (24-09). Op een rit van twintig uur is dat
				     geen detail maar de helft van het verhaal. -->
				<h3>{{ t('Breaks on long drives') }}</h3>
				<NcTextField :model-value="String(pauzeElke || '')" :label="t('Break every (minutes)')" type="number"
					@update:model-value="(v) => { pauzeElke = parseInt(v, 10) || 0; save() }" />
				<NcTextField :model-value="String(pauzeLang || '')" :label="t('Break length (minutes)')" type="number"
					@update:model-value="(v) => { pauzeLang = parseInt(v, 10) || 0; save() }" />
				<!-- Documenten, medicijnen en vaste lasten: dezelfde velden als op de telefoon, zodat wat je
				     hier invult daar ook staat (Ramin, 24-09). De planner kijkt ernaar: een paspoort dat
				     binnenkort verloopt levert een melding bij een vlucht. -->
			</template>
		</template>

		<!-- Weergave (24-09): op de telefoon een eigen tabblad, hier stond dit door Algemeen heen. -->
		<template v-else-if="tab === 'display'">
			<div class="pa-settings__subtabs">
				<button v-for="t in displaySubTabs" :key="t.id" type="button" :class="{ 'pa-settings__chip--active': displaySubTab === t.id }" class="pa-settings__chip" @click="displaySubTab = t.id">
					{{ t.label }}
				</button>
			</div>

			<template v-if="displaySubTab === 'general'">
				<!-- Dezelfde drie knoppen als op de telefoon (Ramin, 24-09). Deze keuze blijft op dit
				     apparaat: een monitor op kantoor vraagt iets anders dan een telefoon in het donker. -->
				<h3 v-if="web">{{ t('Theme') }}</h3>
				<div v-if="web" class="pa-settings__chips">
					<button v-for="s in themaStanden" :key="s.id" type="button" class="pa-settings__chip"
						:class="{ 'pa-settings__chip--active': thema.stand === s.id }" @click="zetThema(s.id)">{{ s.label() }}</button>
				</div>
				<p v-if="web" class="pa-hint">{{ t('This choice stays on this device.') }}</p>

				<h3>{{ t('Country') }}</h3>
			<select class="pa-settings__select" :value="country" @change="onCountry($event.target.value)">
				<option value="">{{ web ? t('Follow the browser') : t('Follow Nextcloud') }}</option>
				<option v-for="c in countries" :key="c.cc" :value="c.cc">{{ flag(c.cc) }} {{ c.name }}</option>
			</select>
			<!-- Meer talen in dit land? Dan kies je de taal erbij (Ramin, 2026-09-13). -->
			<div v-if="landTalen.length > 1" class="pa-settings__chips">
				<button v-for="lc in landTalen" :key="lc" type="button" class="pa-settings__chip"
					:class="{ 'pa-settings__chip--active': language === lc }" @click="onLanguage(lc)">{{ taalNaam(lc) }}</button>
			</div>

			<!-- Anina (AI) onder Algemeen, net als de landkeuze (Ramin, 17-09); de sleutels blijven onder Account › API. -->

				<h3>{{ t('Menu order') }}</h3>
				<p class="pa-hint">{{ t('Drag to reorder the menu. The order is the same on your phone and in Nextcloud.') }}</p>
				<ol class="pa-prio">
					<li v-for="(m, i) in menuVolgorde" :key="m" class="pa-prio__rij" :class="{ 'pa-prio__rij--sleep': menuSleepIndex === i }" draggable="true"
						@dragstart="menuSleepStart(i)" @dragover.prevent @drop.prevent="menuSleepDrop(i)" @dragend="menuSleepIndex = null">
						<span class="pa-prio__greep" aria-hidden="true">⋮⋮</span>
						<span class="pa-prio__naam" :class="{ 'pa-prio__naam--uit': menuVerborgen.includes(m) }">{{ menuLabel(m) }}</span>
						<button type="button" class="pa-prio__knop" :title="menuVerborgen.includes(m) ? t('Show') : t('Hide')" @click="menuWisselZichtbaar(m)">{{ menuVerborgen.includes(m) ? '🙈' : '👁' }}</button>
						<button type="button" class="pa-prio__knop" :disabled="i === 0" :title="t('Up')" @click="menuVerplaats(i, i - 1)">▲</button>
						<button type="button" class="pa-prio__knop" :disabled="i === menuVolgorde.length - 1" :title="t('Down')" @click="menuVerplaats(i, i + 1)">▼</button>
					</li>
				</ol>

				<!-- Voertuigen: dezelfde lijst als op de telefoon (kenteken als
				     sleutel), voor de tankberekening (2026-09-13). -->

				<h3>{{ t('Priorities') }}</h3>
				<p class="pa-hint">{{ t('Drag to reorder: what wins when two things overlap. Top = most important.') }}</p>
				<ol class="pa-prio">
					<li v-for="(p, i) in prioriteiten" :key="p" class="pa-prio__rij" :class="{ 'pa-prio__rij--sleep': sleepIndex === i }" draggable="true"
						@dragstart="sleepStart(i)" @dragover.prevent @drop.prevent="sleepDrop(i)" @dragend="sleepIndex = null">
						<span class="pa-prio__greep" aria-hidden="true">⋮⋮</span>
						<span class="pa-prio__naam">{{ prioriteitLabel(p) }}</span>
						<button type="button" class="pa-prio__knop" :disabled="i === 0" :title="t('Up')" @click="prioriteitVerplaats(i, i - 1)">▲</button>
						<button type="button" class="pa-prio__knop" :disabled="i === prioriteiten.length - 1" :title="t('Down')" @click="prioriteitVerplaats(i, i + 1)">▼</button>
					</li>
				</ol>

				<!-- Menu-volgorde: hetzelfde veld dat de telefoon gebruikt, dus een wijziging hier staat
				     daar ook zo (Ramin, 24-09). Het oog zet een item weg zonder het uit je volgorde te halen. -->
			</template>

			<template v-else-if="displaySubTab === 'today'">
			<h3>{{ t('View') }}</h3>
			<div class="pa-settings__chips">
				<button type="button" :class="{ 'pa-settings__chip--active': viewMode === 'DAY' }" class="pa-settings__chip" @click="viewMode = 'DAY'; save()">{{ t('Day') }}</button>
				<button type="button" :class="{ 'pa-settings__chip--active': viewMode === 'ROLLING_24H' }" class="pa-settings__chip" @click="viewMode = 'ROLLING_24H'; save()">{{ t('Rolling 24h') }}</button>
			</div>


			<h3>{{ t('Week view') }}</h3>
			<div class="pa-settings__chips">
				<button type="button" :class="{ 'pa-settings__chip--active': weekMode === 'fixed' }" class="pa-settings__chip" @click="weekMode = 'fixed'; save()">{{ t('Fixed week') }}</button>
				<button type="button" :class="{ 'pa-settings__chip--active': weekMode === 'today' }" class="pa-settings__chip" @click="weekMode = 'today'; save()">{{ t('Today first') }}</button>
			</div>
			<p class="pa-settings__hint">{{ t('First day of the week') }}</p>
			<div class="pa-settings__chips">
				<button type="button" :class="{ 'pa-settings__chip--active': weekFirstDay === 'auto' }" class="pa-settings__chip" @click="weekFirstDay = 'auto'; save()">{{ t('Automatic') }}</button>
				<button type="button" :class="{ 'pa-settings__chip--active': weekFirstDay === 'mon' }" class="pa-settings__chip" @click="weekFirstDay = 'mon'; save()">{{ t('Monday') }}</button>
				<button type="button" :class="{ 'pa-settings__chip--active': weekFirstDay === 'sun' }" class="pa-settings__chip" @click="weekFirstDay = 'sun'; save()">{{ t('Sunday') }}</button>
			</div>

			<!-- Android schedules these locally (WorkManager) so setting a
			     time here has no effect on ITS OWN notifications — but it's
			     the same field Android reads back out, so setting it from a
			     desktop keyboard is genuinely easier than the phone's time
			     picker (Ramin, 2026-09-09: "neem [Android] over"). -->
			</template>

			<template v-else-if="displaySubTab === 'drive'">
			<!--
			  Rijmodus (Ramin, 24-09). Deze instellingen horen bij je telefoon -- daar rijd je mee -- maar
			  ze zijn hier gewoon aan te passen, zodat het onderdeel niet als lege plek in je menu staat.
			  Ze gaan langs dezelfde weg als alle andere instellingen en staan dus meteen op je telefoon.
			-->
			<h3>{{ t('Navigation app') }}</h3>
			<p class="pa-settings__hint">{{ t('Which app opens when you tap Navigate.') }}</p>
			<select class="pa-settings__select" :value="navigationApp" @change="navigationApp = $event.target.value; save()">
				<option value="GOOGLE_MAPS">Google Maps</option>
				<option value="WAZE">Waze</option>
				<option value="FLITSMEISTER">Flitsmeister</option>
			</select>

			<h3>{{ t('Swipe a card') }}</h3>
			<p class="pa-settings__hint">{{ t('What happens when you swipe a card left or right.') }}</p>
			<div class="pa-settings__rij">
				<label>{{ t('Swipe left') }}</label>
				<select class="pa-settings__select" :value="swipeLeftAction" @change="swipeLeftAction = $event.target.value; save()">
					<option value="ARCHIVE">{{ t('Archive') }}</option>
					<option value="DONE">{{ t('Done') }}</option>
					<option value="NONE">{{ t('Nothing') }}</option>
				</select>
			</div>
			<div class="pa-settings__rij">
				<label>{{ t('Swipe right') }}</label>
				<select class="pa-settings__select" :value="swipeRightAction" @change="swipeRightAction = $event.target.value; save()">
					<option value="ARCHIVE">{{ t('Archive') }}</option>
					<option value="DONE">{{ t('Done') }}</option>
					<option value="NONE">{{ t('Nothing') }}</option>
				</select>
			</div>
			</template>


			<template v-else>
			<h3>{{ t('Digests') }}</h3>
			<label class="pa-settings__checkbox-row">
				<input type="checkbox" :checked="morningDigestTime !== ''" @change="toggleDigest('morning', $event.target.checked)">
				{{ t('Morning digest') }}
			</label>
			<input v-if="morningDigestTime !== ''" type="time" v-model="morningDigestTime" class="pa-settings__time" @change="save()">
			<label class="pa-settings__checkbox-row">
				<input type="checkbox" :checked="eveningDigestTime !== ''" @change="toggleDigest('evening', $event.target.checked)">
				{{ t('Evening digest') }}
			</label>
			<input v-if="eveningDigestTime !== ''" type="time" v-model="eveningDigestTime" class="pa-settings__time" @change="save()">

			<!-- Per-browser, not synced (Ramin, 2026-09-09: "taxi app" under
			     Settings) — same reasoning as Android's own SettingsStore:
			     which ride-hailing apps you have only means something on
			     the device you're using right now. See rideHailing.js. -->
			</template>
		</template>

		<!-- Apps: de bronnen van buiten, zoals op de telefoon een eigen tabblad. -->
		<template v-else-if="tab === 'apps'">
			<h3>{{ t('RSS feeds') }}</h3>
			<ul class="pa-settings__lijst">
				<li v-for="(f, i) in rssFeeds" :key="f.url" class="pa-settings__lijstrij">
					<span class="pa-settings__grow">{{ f.title || f.url }}</span>
					<button type="button" class="pa-settings__x" :title="t('Remove')" @click="verwijderFeed(i)">×</button>
				</li>
			</ul>
			<div class="pa-settings__rij">
				<input v-model="nieuweFeed" type="url" class="pa-settings__veld pa-settings__grow" :placeholder="t('Add a website or feed address')" @keyup.enter="voegFeedToe">
				<NcButton :disabled="feedBezig || !nieuweFeed.trim()" @click="voegFeedToe">{{ t('Add') }}</NcButton>
			</div>
			<p v-if="feedFout" class="pa-settings__fout">{{ feedFout }}</p>


			<h3>{{ t('Podcasts') }}</h3>
			<ul class="pa-settings__lijst">
				<li v-for="(p, i) in podcasts" :key="p.feedUrl" class="pa-settings__lijstrij">
					<img v-if="p.artwork" :src="p.artwork" alt="" class="pa-settings__art">
					<span class="pa-settings__grow">{{ p.name }} <small>{{ p.artist }}</small></span>
					<button type="button" class="pa-settings__x" :title="t('Remove')" @click="verwijderPodcast(i)">×</button>
				</li>
			</ul>
			<div class="pa-settings__rij">
				<input v-model="podcastZoek" type="search" class="pa-settings__veld pa-settings__grow" :placeholder="t('Search podcasts')" @keyup.enter="zoekPodcasts">
				<NcButton :disabled="podcastBezig || podcastZoek.trim().length < 2" @click="zoekPodcasts">{{ t('Search') }}</NcButton>
			</div>
			<ul v-if="podcastResultaten.length" class="pa-settings__lijst">
				<li v-for="r in podcastResultaten" :key="r.feedUrl" class="pa-settings__lijstrij">
					<img v-if="r.artwork" :src="r.artwork" alt="" class="pa-settings__art">
					<span class="pa-settings__grow">{{ r.name }} <small>{{ r.artist }}<template v-if="r.genre"> · {{ r.genre }}</template></small></span>
					<NcButton v-if="!podcasts.some((p) => p.feedUrl === r.feedUrl)" @click="abonneer(r)">{{ t('Subscribe') }}</NcButton>
					<span v-else class="pa-settings__hint">{{ t('Subscribed') }}</span>
				</li>
			</ul>

			<!-- Landen, geen talen (Ramin, 2026-09-13): het land bepaalt de
			     taal én de gewoontes, en de telefoon leest dezelfde keuze. -->
			<!-- MailWatcher (24-09): de server leest je mailbox mee en haalt er vier dingen uit. Stond alleen
				     op de telefoon; het wachtwoord blijft op de server en komt nooit terug naar het scherm. -->

				<h3>{{ t('MailWatcher') }}</h3>
				<p class="pa-hint">{{ t('The server reads along in your mailbox and picks out parcels, boarding passes, reservations and meeting invitations.') }}</p>
				<label class="pa-settings__checkbox-row">
					<input type="checkbox" :checked="mail.enabled" @change="mail.enabled = $event.target.checked; saveMail()">
					{{ t('Read along in my mailbox') }}
				</label>
				<template v-if="mail.enabled">
					<NcTextField :model-value="mail.username" :label="t('Email address')" @update:model-value="(v) => { mail.username = v }" />
					<NcButton :disabled="!mail.username || mailZoekt" @click="zoekMailServer">{{ mailZoekt ? t('Searching…') : t('Find server') }}</NcButton>
					<NcTextField :model-value="mail.host" :label="t('Mail server')" @update:model-value="(v) => { mail.host = v }" />
					<NcTextField :model-value="mailWachtwoord" :label="mail.hasPassword ? t('Password (leave empty to keep)') : t('Password')" type="password" @update:model-value="(v) => { mailWachtwoord = v }" />
					<label v-for="o in MAIL_ONDERWERPEN" :key="o.id" class="pa-vehicle__field">{{ o.label() }}
						<select :value="mail[o.id]" class="pa-vehicle__select" @change="mail[o.id] = parseInt($event.target.value, 10); saveMail()">
							<option v-for="st in MAIL_STANDEN" :key="st.id" :value="st.id">{{ st.label() }}</option>
						</select>
					</label>
					<label class="pa-vehicle__field">{{ t('Look every') }}
						<select :value="mail.intervalMinutes" class="pa-vehicle__select" @change="mail.intervalMinutes = parseInt($event.target.value, 10); saveMail()">
							<option v-for="m in [5, 10, 15, 30, 60]" :key="m" :value="m">{{ t('%s minutes', String(m)) }}</option>
						</select>
					</label>
					<NcButton type="primary" @click="saveMail(true)">{{ t('Save mailbox') }}</NcButton>
					<p v-if="mail.lastError" class="pa-hint">{{ mail.lastError }}</p>
					<p v-else-if="mail.lastRun" class="pa-hint">{{ t('Last looked: %s', mail.lastRun) }}</p>
				</template>


			<h3>{{ t('Anina (AI)') }}</h3>
			<!-- Welke AI (Ramin, 2026-09-16: Claude, OpenAI of Gemini), met eigen sleutel per leverancier. -->
			<p class="pa-settings__label">{{ t('AI behind Anina') }}</p>
			<div class="pa-settings__chips">
				<button v-for="p in [['anthropic', 'Claude'], ['openai', 'OpenAI'], ['gemini', 'Gemini']]" :key="p[0]" type="button" class="pa-settings__chip" :class="{ 'pa-settings__chip--active': aiProvider === p[0] }" @click="aiProvider = p[0]; save()">{{ p[1] }}</button>
			</div>
			<p class="pa-settings__hint">{{ t('Claude works with the server key or your own; OpenAI and Gemini need your own key.') }}</p>
			<p class="pa-settings__hint">{{ t('Your own API keys are under Account › API.') }}</p>
			<!-- Eigen taal voor Anina (kaart 41): luisteren, praten en antwoorden. -->
			<label for="pa-nova-taal">{{ t('Anina language') }}</label>
			<select id="pa-nova-taal" v-model="novaTaal" @change="save()">
				<option value="">{{ t('Same as app') }}</option>
				<option value="nl">Nederlands</option>
				<option value="en">English</option>
				<option value="de">Deutsch</option>
				<option value="fr">Français</option>
				<option value="es">Español</option>
				<option value="it">Italiano</option>
				<option value="pt">Português</option>
			</select>


		</template>

		<template v-else-if="tab === 'account'">
			<!-- Above the Account/Nextcloud/APIs sub-tabs, not inside just
			     one of them (Ramin, 2026-09-09: "omdat er voor alle opties
			     een api nodig is... plaats APP-API invoerveld boven de
			     tabbladen" — every one of these sub-tabs needs it. -->
			<div class="pa-settings__app-api-row">
				<NcTextField :model-value="accessCode"
					:label="t('USER-API')"
					:placeholder="t('Paste your PersonalAssistant API-code')"
					class="pa-settings__app-api-field"
					@update:model-value="onAccessCodeChanged" />
				<p v-if="rekeyStatus" class="pa-settings__ok">{{ rekeyStatus }}</p>
				<!-- Says out loud whether the typed code is real. Without it a
				     typo behaves exactly like a working code — it just becomes a
				     different, empty data partition, which you only notice much
				     later. Same green tick / red cross as the Android app. -->
				<span v-if="apiCodeValid === true" class="pa-settings__api-ok" :title="t('Code is valid')">&#10004;</span>
				<span v-else-if="apiCodeValid === false" class="pa-settings__api-bad" :title="t('Code not recognised')">&#10006;</span>
				<button type="button" class="pa-settings__info-button" :title="t('About USER-API')" @click="showApiInfo = !showApiInfo">
					<MaterialIcoon naam="info" :size="20" />
				</button>
			</div>
			<NcNoteCard v-if="showApiInfo" type="info" class="pa-settings__app-api-info">
				<p>{{ t('Needed no matter which data source you use. Use the same code on all your devices, so they see the same data; it is also how an Account sign-in identifies you. Leave blank and your settings cannot be saved.') }}</p>
				<a :href="APP_API_REQUEST_URL" target="_blank" rel="noopener">{{ t('Request an API-code') }}</a>
			</NcNoteCard>
			<!-- Onder de code, boven de sub-tabs: het abonnement hoort bij de persoon die de code is, niet bij een databron (zoals op de telefoon). -->
			<SubscriptionCard v-if="accessCode" />
			<p v-if="web" class="pa-settings__uitknoppen"><NcButton @click="vergrendelen">{{ t('Lock screen') }}</NcButton> <NcButton @click="uitloggen">{{ t('Sign out') }}</NcButton></p>
			<!-- Passkeys (18-09): inloggen met de sleutel op je apparaat, in plaats van wachtwoord + 6 cijfers. -->
			<NcNoteCard v-if="web && accessCode" type="info" class="pa-settings__privacy">
				<p><strong>{{ t('Passkeys') }}</strong></p>
				<p>{{ t('A passkey is the key on your phone or laptop (fingerprint, face or PIN). With it you sign in here, on the website and in the back office without a password or authenticator code.') }}</p>
				<p v-if="passkeyLijst === null">{{ t('Loading…') }}</p>
				<p v-else-if="!passkeyLijst.length">{{ t('No passkey yet.') }}</p>
				<ul v-else class="pa-settings__passkeys">
					<li v-for="pk in passkeyLijst" :key="pk.id">
						<span>{{ pk.label || t('Unnamed') }} · {{ t('added %s', String(pk.created_at || '').slice(0, 10)) }}<template v-if="pk.last_used_at"> · {{ t('last used %s', String(pk.last_used_at).slice(0, 16)) }}</template></span>
						<NcButton type="error" :disabled="passkeyBusy" @click="passkeyWeg(pk)">{{ passkeyWegVraag === pk.id ? t('Sure?') : t('Remove') }}</NcButton>
					</li>
				</ul>
				<p v-if="passkeySupported" class="pa-settings__uitknoppen">
					<NcTextField :model-value="passkeyNaam" :label="t('Name (e.g. laptop, phone)')" @update:model-value="(v) => { passkeyNaam = v }" />
					<NcButton type="primary" :disabled="passkeyBusy" @click="passkeyToevoegen">{{ t('Add passkey') }}</NcButton>
				</p>
				<p v-else>{{ t('This browser cannot create passkeys.') }}</p>
				<p v-if="passkeyMelding">{{ passkeyMelding }}</p>
			</NcNoteCard>
			<!-- Je gegevens en je account (privacy-check kaart 121): download alles, of verwijder met veertien dagen bedenktijd. -->
			<NcNoteCard v-if="accessCode" type="info" class="pa-settings__privacy">
				<p>{{ t('Everything we store for you, as one file; or delete your account — everything on our server is removed after 14 days, until then you can cancel.') }}</p>
				<p class="pa-settings__uitknoppen">
					<NcButton :disabled="privacyBusy" @click="downloadGegevens">{{ t('Download my data') }}</NcButton>
					<NcButton v-if="!deleteAt" type="error" :disabled="privacyBusy" @click="deleteVraag = true">{{ t('Delete my account') }}</NcButton>
				</p>
				<p v-if="deleteAt" class="pa-settings__delete-gepland">
					{{ t('Deletion scheduled for %s. You can still cancel.', deleteAt.slice(0, 16)) }}
					<NcButton :disabled="privacyBusy" @click="intrekkenVerwijdering">{{ t('Cancel deletion') }}</NcButton>
				</p>
				<p v-if="deleteVraag" class="pa-settings__delete-vraag">
					{{ t('Your account and all data on our server (including receipt photos and your subscription) will be deleted after 14 days. Continue?') }}
					<NcButton type="error" :disabled="privacyBusy" @click="vraagVerwijdering">{{ t('Yes, delete everything') }}</NcButton>
					<NcButton :disabled="privacyBusy" @click="deleteVraag = false">{{ t('Cancel') }}</NcButton>
				</p>
				<p v-if="privacyMelding">{{ privacyMelding }}</p>
			</NcNoteCard>

			<div class="pa-settings__subtabs">
				<button v-for="t in accountSubTabs" :key="t.id" type="button" :class="{ 'pa-settings__chip--active': accountSubTab === t.id }" class="pa-settings__chip" @click="accountSubTab = t.id">
					{{ t.label }}
				</button>
			</div>

			<template v-if="web && accountSubTab === 'apis'">
				<!-- Je eigen Nextcloud koppelen (24-09). In de Nextcloud-app zelf is dit overbodig -- daar
				     zit de verbinding er al -- maar in de web-jas draait alles op ons account, tenzij je
				     hier je eigen server opgeeft. Het app-wachtwoord maak je in Nextcloud onder
				     Persoonlijke instellingen > Beveiliging; je echte wachtwoord hoort hier niet. -->
				<h3>{{ t('Your own Nextcloud') }}</h3>
				<p class="pa-hint">{{ t('Optional. Give a server here and your calendars, notes and tasks come from there instead of from us.') }}</p>
				<NcTextField :model-value="nextcloudUrl" :label="t('Address')" :placeholder="'https://cloud.example.com'" @update:model-value="(v) => { nextcloudUrl = v; save() }" />
				<NcTextField :model-value="nextcloudAppPassword" :label="t('App password')" type="password" @update:model-value="(v) => { nextcloudAppPassword = v; save() }" />
				<p class="pa-hint">{{ t('Make an app password in Nextcloud under Personal settings, Security. Not your normal password.') }}</p>
			</template>

			<template v-if="accountSubTab === 'nextcloud'">
				<h3>{{ t('Calendars') }}</h3>
				<NcButton :disabled="loadingCalendars" @click="loadCalendars">
					{{ loadingCalendars ? 'Loading…' : 'Load calendars' }}
				</NcButton>
				<NcNoteCard v-if="calendarsError" type="error">{{ calendarsError }}</NcNoteCard>
				<ul class="pa-settings__calendars">
					<li v-for="calendar in availableCalendars" :key="calendar.href">
						<!-- Plain native checkbox, not NcCheckboxRadioSwitch
						     (Ramin, 2026-09-09: "slaat het niet de gekozen
						     calendars op" — couldn't confirm NcCheckboxRadioSwitch's
						     exact modelValue contract without a live browser
						     to test against, so this sidesteps that risk
						     entirely with something unambiguous). -->
						<label class="pa-settings__checkbox-row">
							<input type="checkbox" :checked="isSelected(calendar)" @change="toggleCalendar(calendar, $event.target.checked)">
							{{ calendar.displayName }}
						</label>
						<div v-if="isSelected(calendar)" class="pa-settings__calendar-options">
							<label class="pa-settings__checkbox-row">
								<input type="checkbox" :checked="entryFor(calendar).ignoreLocationAlwaysHome" @change="setIgnoreLocationAlwaysHome(calendar, $event.target.checked)">
								{{ t('Ignore location (no travel, you stay where you are)') }}
							</label>
							<NcTextField :model-value="entryFor(calendar).allDayReminderOffset || ''"
								:label="t('All-day reminder offset')"
								:placeholder="t('e.g. 20:00, +1d20:00, or +2d')"
								@update:model-value="(v) => setAllDayOffset(calendar, v)" />
						</div>
					</li>
				</ul>

				<template v-if="availableBooks.length">
					<h3>{{ t('Address books') }}</h3>
					<p class="pa-settings__hint">{{ t('Which address books show in Contacts. Nothing ticked means all of them.') }}</p>
					<ul class="pa-settings__calendars">
						<li v-for="boek in availableBooks" :key="boek.href">
							<label class="pa-settings__checkbox-row">
								<input type="checkbox" :checked="!contactBooks.length || contactBooks.includes(boek.href)" @change="toggleBook(boek, $event.target.checked)">
								{{ boek.displayName }}
							</label>
						</li>
					</ul>
				</template>

				<h3>{{ t('Calendar sync') }}</h3>
				<label class="pa-settings__checkbox-row">
					<input type="checkbox" :checked="pushTravelCheckinToCalendar" @change="pushTravelCheckinToCalendar = $event.target.checked; save()">
					Push travel, check-in &amp; check-out to calendar
				</label>
			</template>

			<template v-else>
				<h3>{{ t('APIs') }}</h3>
				<NcTextField :model-value="airLabsKey" :label="t('AirLabs API key')" @update:model-value="(v) => { airLabsKey = v; save() }" />
				<p class="pa-settings__hint">{{ t('Which AI answers and which language Anina speaks: Settings › General › Anina.') }}</p>
				<!-- Eigen sleutel voor Anina met AI (Ramin, 2026-09-15). Versleuteld bewaard op de server. -->
				<template v-if="aiProvider === 'openai'">
					<NcTextField :model-value="openaiApiKey" :label="t('OpenAI API key (Anina)')" type="password" @update:model-value="(v) => { openaiApiKey = v; save() }" />
					<p class="pa-settings__hint">{{ t('Your own key from platform.openai.com.') }}</p>
				</template>
				<template v-else-if="aiProvider === 'gemini'">
					<NcTextField :model-value="geminiApiKey" :label="t('Gemini API key (Anina)')" type="password" @update:model-value="(v) => { geminiApiKey = v; save() }" />
					<p class="pa-settings__hint">{{ t('Your own key from aistudio.google.com.') }}</p>
				</template>
				<template v-else>
					<NcTextField :model-value="anthropicApiKey" :label="t('Anthropic API key (Anina)')" type="password" @update:model-value="(v) => { anthropicApiKey = v; save() }" />
					<p class="pa-settings__hint">{{ t('Optional: your own key from console.anthropic.com. Without it Anina uses the server key, when the server has one.') }}</p>
					<NcTextField :model-value="anthropicWorkspaceId" :label="t('Anthropic workspace ID')" :placeholder="'wrkspc_…'" @update:model-value="(v) => { anthropicWorkspaceId = v; save() }" />
					<p class="pa-settings__hint">{{ t('Only needed when Anthropic says the key is not scoped to a workspace. Found under Settings, Workspaces in the console.') }}</p>
				</template>
			</template>
		</template>

		<template v-else>
			<h3>{{ t('About') }}</h3>
			<p>{{ t('Personal Assistant — the same day-timeline, travel and flight intelligence as the Android app, called live from askanina.com.') }}</p>
		</template>

		<p v-if="saved" class="pa-settings__saved">{{ t('Saved.') }}</p>
		<NcNoteCard v-if="saveError" type="error">Save failed: {{ saveError }}</NcNoteCard>
	</div>
</template>

<script>
// F4 (V1): de soorten die je op volgorde kunt zetten; de server vertaalt de plek naar een prioriteit 9…1.
const ROLLEN = ['werknemer', 'zelfstandig', 'student', 'thuis', 'ouder', 'reiziger', 'onderweg', 'senior']
const ROL_LABEL = { werknemer: 'Employee', zelfstandig: 'Self-employed', student: 'Student', thuis: 'Running the household', ouder: 'Parent', reiziger: 'Frequent traveller', onderweg: 'On the road for work', senior: 'Retired' }
/**
 * De menu-items in de volgorde waarin ze standaard staan, met exact de codes die de Android-app gebruikt
 * (`Rollen.ALLE_MENU`). Ze delen een instelling, dus een verschil in spelling zou een item op het andere
 * apparaat laten verdwijnen.
 *
 * Er staan er een paar bij die het web (nog) niet heeft -- gesprekken, ritten, series, in de buurt,
 * rijmodus. Die zijn hier wel te verslepen: anders kun je op het web de volgorde van je telefoon niet
 * compleet zetten. Ze worden in het web-menu simpelweg overgeslagen.
 */
/** De dagen zoals de telefoon ze opschrijft; de naam eromheen is de vertaling. */
/** Dezelfde vijf vervolgvragen als Rollen.VRAGEN op de telefoon, met dezelfde sleutels. */
/** De vier onderwerpen die MailWatcher uit je mailbox haalt, met dezelfde sleutels als de telefoon. */
const MAIL_ONDERWERPEN = [
	{ id: 'parcelsMode', label: () => t('Parcels') },
	{ id: 'boardingMode', label: () => t('Boarding passes') },
	{ id: 'reservationsMode', label: () => t('Reservations') },
	{ id: 'meetingsMode', label: () => t('Meeting invitations') },
]

/** Wat er met zo een bericht gebeurt: niets, alleen lezen, een melding, of een regel op je dag. */
const MAIL_STANDEN = [
	{ id: 0, label: () => t('Off') },
	{ id: 1, label: () => t('Read only') },
	{ id: 2, label: () => t('Notify me') },
	{ id: 3, label: () => t('On my timeline') },
]

const ROL_VRAGEN = ['podcasts', 'markten', 'gezin', 'tanken', 'reizen']
const ROL_VRAAG_ROLLEN = {
	podcasts: ['student', 'senior', 'onderweg', 'zelfstandig', 'werknemer', 'reiziger'],
	markten: ['zelfstandig', 'reiziger', 'senior'],
	gezin: ['ouder', 'thuis', 'senior', 'student'],
	tanken: ['thuis', 'ouder', 'zelfstandig', 'onderweg', 'senior'],
	reizen: ['reiziger', 'zelfstandig', 'onderweg', 'werknemer'],
}
const ROL_VRAAG_LABEL = {
	podcasts: () => t('Do you listen to podcasts or read news?'),
	markten: () => t('Do you follow shares or crypto?'),
	gezin: () => t('Do you plan for other people too?'),
	tanken: () => t('Do you drive a car that needs fuel or charging?'),
	reizen: () => t('Do you travel by plane now and then?'),
}

const WEEKDAGEN = [
	{ id: 'MONDAY', label: () => t('Monday') },
	{ id: 'TUESDAY', label: () => t('Tuesday') },
	{ id: 'WEDNESDAY', label: () => t('Wednesday') },
	{ id: 'THURSDAY', label: () => t('Thursday') },
	{ id: 'FRIDAY', label: () => t('Friday') },
	{ id: 'SATURDAY', label: () => t('Saturday') },
	{ id: 'SUNDAY', label: () => t('Sunday') },
]

const MENU_STANDAARD = [
	'deck', 'open', 'tasks', 'contacts', 'calls', 'groceries', 'notes', 'receipts', 'locations', 'nearby',
	'fuel', 'rides', 'news', 'podcasts', 'series', 'markets', 'deliveries', 'trips', 'calendar', 'support', 'drive',
]

/** De naam als functie, niet als tekst: de taal staat pas vast nadat de instellingen geladen zijn. */
const MENU_NAMEN = {
	deck: () => 'Deck',
	open: () => t('Open items'),
	tasks: () => t('Tasks'),
	contacts: () => t('Contacts'),
	calls: () => t('Calls'),
	groceries: () => t('Shopping list'),
	notes: () => t('Notes'),
	receipts: () => t('Receipts'),
	locations: () => t('Locations'),
	nearby: () => t('Nearby'),
	fuel: () => t('Fuel'),
	rides: () => t('Rides'),
	news: () => t('News'),
	podcasts: () => t('Podcasts'),
	series: () => t('Series'),
	markets: () => t('Markets'),
	deliveries: () => t('Deliveries'),
	trips: () => t('Trip'),
	calendar: () => t('Calendar'),
	support: () => t('Help'),
	drive: () => t('Driving mode'),
}

const PRIORITEITEN_STANDAARD = ['vlucht', 'arts', 'afspraak', 'verblijf', 'werk', 'lunch', 'dinner', 'studie', 'festiviteit', 'thuis']
import MaterialIcoon from './MaterialIcoon.vue'
import { t, useCountry, COUNTRIES } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import { localeFor, LANGUAGE_NAMES, flag } from '../l10n/countries.js'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import { parseVehicles } from './FuelView.vue'

/**
 * F7 (plan §12): een voertuig heeft een eigen id (vrtId); het kenteken is een eigenschap met geschiedenis, zodat
 * ritten, tankstanden en de bluetooth-koppeling blijven kloppen als het bord wisselt.
 */
function voertuigMetId(v) {
	const { _vorigKenteken, ...rest } = v
	const uit = { ...rest, vrtId: rest.vrtId || Math.random().toString(16).slice(2, 10), plateHistory: Array.isArray(rest.plateHistory) ? rest.plateHistory.slice() : [] }
	if (_vorigKenteken && _vorigKenteken !== uit.plate && !uit.plateHistory.includes(_vorigKenteken)) uit.plateHistory.push(_vorigKenteken)
	return uit
}
import SubscriptionCard from './SubscriptionCard.vue'
import { getAccessCode, setAccessCode, setLocked } from '../api/accessCode.js'
import { exportAccount, deleteAccountStatus, requestAccountDeletion, cancelAccountDeletion, passkeyList, passkeyRegister, passkeyDelete, passkeySupported } from '../api/paApi.js'
import { rekeyUserData } from '../api/nextcloudUserData.js'
import { WEB } from '../mode.js'
import { discoverAddressBooks } from '../api/shortcutSources.js'
import { feedDiscover, podcastSearch } from '../api/paApi.js'
import { mailWatchGet, mailWatchSave, mailWatchDiscover } from '../api/paApi.js'
import { watch } from 'vue'
import { staat as sync, gingOver } from '../api/sync.js'
import { getRideHailingPrefs, setRideHailingPrefs } from '../api/rideHailing.js'
import { geocode, poiSearch, getSettings as getBackendSettings, setSettings as setBackendSettings, waitChanged, notifyChanged, checkApiCode, logAction } from '../api/paApi.js'
import { getSettings, setSettings, invalidateUserData } from '../api/nextcloudUserData.js'
import { discoverCalendars } from '../api/nextcloudCalendar.js'
import AIRLINES_IATA from '../data/airlines_iata.json'
import { thema, zet as zetThemaStand } from '../api/thema.js'

const WEEK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

// PLACEHOLDER (Ramin, 2026-09-09: "maak er een placeholder van zodat we de
// link makkelijk kunnen aanpassen") — the real API-code request/management
// page doesn't exist yet. Swap this one constant once it does; Android's
// SettingsScreen.kt has the identical constant (APP_API_REQUEST_URL) to
// keep in sync.
const APP_API_REQUEST_URL = 'https://askanina.com/api-code/'

// Two-route commute redesign (Ramin, 2026-09-10) — field-name lookup so
// searchCommuteStation/pickCommuteStation stay a single implementation
// instead of 4 near-duplicates. Field names MUST match Android's
// SyncedSettings exactly (commuteH2wDepartureStation etc.) — this is the
// shape mirrored through the APP-API-code settings bridge.
const COMMUTE_FIELDS = {
	h2wDep: { station: 'commuteH2wDepartureStation', lat: 'commuteH2wDepartureStationLat', lon: 'commuteH2wDepartureStationLon', suggestions: 'commuteH2wDepSuggestions' },
	h2wArr: { station: 'commuteH2wArrivalStation', lat: 'commuteH2wArrivalStationLat', lon: 'commuteH2wArrivalStationLon', suggestions: 'commuteH2wArrSuggestions' },
	w2hDep: { station: 'commuteW2hDepartureStation', lat: 'commuteW2hDepartureStationLat', lon: 'commuteW2hDepartureStationLon', suggestions: 'commuteW2hDepSuggestions' },
	w2hArr: { station: 'commuteW2hArrivalStation', lat: 'commuteW2hArrivalStationLat', lon: 'commuteW2hArrivalStationLon', suggestions: 'commuteW2hArrSuggestions' },
}

// Mirrors Android's commuteTimeDefault() exactly — "set the from-
// work_dep_time to work_time plus thirty minutes... arrival_time is thirty
// minutes before start working_time".
function commuteTimeDefault(workHhmm, deltaMinutes) {
	const m = /^(\d{2}):(\d{2})$/.exec(workHhmm || '')
	if (!m) return ''
	const total = ((parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + deltaMinutes) % 1440 + 1440) % 1440
	const h = String(Math.floor(total / 60)).padStart(2, '0')
	const mm = String(total % 60).padStart(2, '0')
	return `${h}:${mm}`
}

export default {
	name: 'SettingsView',
	props: {
		// Vanuit een foutknop: welke tab (en sub-tab) open moet (2026-09-14).
		initialTab: { type: String, default: null },
		initialSubTab: { type: String, default: null },
	},
	components: { MaterialIcoon, NcTextField, NcButton, NcNoteCard, SubscriptionCard },
	data() {
		return {
			// De drie standen van de telefoon, in dezelfde volgorde (Ramin, 24-09).
			thema,
			themaStanden: [
				{ id: 'light', label: () => t('Light') },
				{ id: 'dark', label: () => t('Dark') },
				{ id: 'system', label: () => t('System') },
			],
			// Passkeys (18-09).
			passkeyLijst: null, passkeyNaam: '', passkeyBusy: false, passkeyMelding: '', passkeyWegVraag: null, passkeySupported: passkeySupported(),
			// Je gegevens en je account (kaart 121).
			privacyBusy: false,
			privacyMelding: '',
			deleteAt: null,
			deleteVraag: false,
			accessCode: getAccessCode(),
			showApiInfo: false,
			// true / false / null — null means "say nothing" (empty field,
			// still typing, or the check itself could not be made).
			apiCodeValid: null,
			APP_API_REQUEST_URL,
			// 'general' bestaat niet meer als tabblad; wie er via een zoekresultaat naartoe wordt gestuurd
			// komt op Weergave uit, waar de algemene instellingen nu staan (24-09).
			tab: (this.initialTab === 'general' ? 'display' : this.initialTab) || 'details',
			detailsSubTab: 'private',
			accountSubTab: this.initialSubTab || (WEB ? 'apis' : 'nextcloud'),
			// Een diepe link naar Weergave mag ook een sub-tabblad noemen (Ramin, 24-09): het menu-onderdeel
			// Rijmodus brengt je hierheen, en dan hoor je meteen bij de rijmodus uit te komen.
			displaySubTab: (this.initialTab === 'display' && this.initialSubTab) || 'general',
			// Dezelfde indeling als op de telefoon (Ramin, 24-09: "instellingen is echt anders dan op
			// Android"): Mijn gegevens, Weergave, Apps, Account. Het oude "Algemeen" was een verzamelbak
			// waar weergave, apps en reizen door elkaar stonden.
			tabs: [
				{ id: 'details', label: t('My details') },
				{ id: 'display', label: t('Display') },
				{ id: 'apps', label: t('Apps') },
				{ id: 'account', label: t('Account') },
				{ id: 'about', label: t('About') },
			],
			detailsSubTabs: [
				{ id: 'private', label: t('Private') },
				{ id: 'work', label: t('Work') },
				{ id: 'travel', label: t('Travel') },
				{ id: 'assets', label: t('Assets') },
			],
			displaySubTabs: [
				{ id: 'general', label: t('General') },
				{ id: 'today', label: t('Today') },
				// Rijden zelf doe je met je telefoon, maar wat je erover instelt hoort overal te bereiken
				// te zijn (Ramin, 24-09). Het menu-onderdeel Rijmodus brengt je hierheen.
				{ id: 'drive', label: t('Drive mode') },
				{ id: 'notifications', label: t('Notifications') },
			],
			accountSubTabs: [
				...(WEB ? [] : [{ id: 'nextcloud', label: t('Nextcloud') }]),
				{ id: 'apis', label: t('APIs') },
			],
			weekDays: WEEK_DAYS,

			viewMode: 'DAY',
			weekMode: 'fixed',
			weekFirstDay: 'auto',
			country: '',
			language: '',
			countries: COUNTRIES,
			homeAddress: '',
			homeGeocodeStatus: '',
			homeLat: null,
			homeLon: null,
			homeCountryCode: null,
			gymAddress: '',
			gymGeocodeStatus: '',
			gymLat: null,
			gymLon: null,
			gettingReadyHomeMinutes: '30',
			gettingReadyWorkMinutes: '15',
			arrivalBufferMinutes: '10',
			gapThresholdMinutes: '90',
			returnToOfficeMinutes: '60',
			prioriteiten: PRIORITEITEN_STANDAARD.slice(),
			menuVolgorde: MENU_STANDAARD.slice(),
			documenten: [],
			firstName: '',
			lastName: '',
			dateOfBirth: '',
			thuiswerkdagen: [],
			vertrekVliegveld: '',
			thuiswerkdatums: [],
			pauzeElke: 0,
			pauzeLang: 0,
			workCalendarTarget: null,
			taxiApp: '',
			mail: { enabled: false, host: '', username: '', hasPassword: false, parcelsMode: 3, boardingMode: 1, reservationsMode: 1, meetingsMode: 1, intervalMinutes: 5, lastRun: null, lastError: null },
			mailWachtwoord: '',
			mailZoekt: false,
			nextcloudUrl: '',
			nextcloudAppPassword: '',
			rolAntwoorden: {},
			medicijnen: [],
			vasteLasten: [],
			menuVerborgen: [],
			menuSleepIndex: null,
			rollen: [],
			ROLLEN,
			WEEKDAGEN,
			MAIL_ONDERWERPEN,
			MAIL_STANDEN,
			ROL_LABEL,
			sleepIndex: null,
			workAddress: '',
			workGeocodeStatus: '',
			workLat: null,
			workLon: null,
			workCountryCode: null,
			workTravelMode: 'CAR',
			commuteH2wDepartureStation: '',
			commuteH2wDepartureStationLat: null,
			commuteH2wDepartureStationLon: null,
			commuteH2wDepartureTime: '',
			commuteH2wArrivalStation: '',
			commuteH2wArrivalStationLat: null,
			commuteH2wArrivalStationLon: null,
			commuteH2wArrivalTime: '',
			commuteW2hDepartureStation: '',
			commuteW2hDepartureStationLat: null,
			commuteW2hDepartureStationLon: null,
			commuteW2hDepartureTime: '',
			commuteW2hArrivalStation: '',
			commuteW2hArrivalStationLat: null,
			commuteW2hArrivalStationLon: null,
			commuteW2hArrivalTime: '',
			commuteH2wDepSuggestions: [],
			commuteH2wArrSuggestions: [],
			commuteW2hDepSuggestions: [],
			commuteW2hArrSuggestions: [],
			workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
			workStartTime: '09:00',
			workEndTime: '17:00',
			preferredAirlines: [],
			newAirlineCode: '',
			checkinLeadMinutes: '150',
			arrivalProcessingMinutes: '60',

			availableCalendars: [],
			selectedCalendars: [],
			availableBooks: [],
			contactBooks: [],
			rssFeeds: [],
			podcasts: [],
			nieuweFeed: '',
			feedBezig: false,
			feedFout: '',
			podcastZoek: '',
			podcastBezig: false,
			podcastResultaten: [],
			loadingCalendars: false,
			calendarsError: null,
			pushTravelCheckinToCalendar: true,
			airLabsKey: '',
			anthropicApiKey: '',
			anthropicWorkspaceId: '',
			aiProvider: 'anthropic', openaiApiKey: '', geminiApiKey: '',
			// HEET BEWUST NOG novaTaal, ook nu alles Anina heet (27-09). Dit is geen naam maar een
			// SLEUTEL in de instellingen-blob die de telefoon en dit scherm delen. Hernoem je hem hier,
			// dan leest de app een veld dat niet bestaat en verliest iedereen zijn taalkeuze. Android
			// houdt hem daarom met @SerialName("novaTaal") vast terwijl de code daar aninaTaal heet.
			// Hetzelfde geldt voor novaConsent, novaVoorlezen en novaShare*.
			novaTaal: '',
			vehicles: [],
			activeVehiclePlate: '',
			tankerkoenigKey: '',
			fuelTypes: [
				{ value: 'E10', label: 'Euro 95 E10' }, { value: 'E5', label: 'Euro 95 E5' }, { value: 'DIESEL', label: 'Diesel' },
				{ value: 'DIESEL_PREMIUM', label: 'Premium diesel' }, { value: 'LPG', label: 'LPG' }, { value: 'CNG', label: 'CNG' },
				{ value: 'HVO', label: 'HVO' }, { value: 'ELECTRIC', label: 'Electric' },
			],
			morningDigestTime: '',
			eveningDigestTime: '',
			rideHailing: getRideHailingPrefs(),
			rideHailingProviders: ['UBER', 'BOLT', 'LYFT'],
			// Rijmodus (Ramin, 24-09): nu ook hier in te stellen, niet alleen op de telefoon.
			navigationApp: 'GOOGLE_MAPS',
			swipeLeftAction: 'ARCHIVE',
			swipeRightAction: 'DONE',

			// The full settings object exactly as last loaded from the blob
			// (Ramin, 2026-09-09: "Settings van de NC-app is nog miniem...
			// neem [Android] over") — Android's SyncedSettings also writes
			// quickPicks/navigationApp/swipeLeftAction/swipeRightAction into
			// this SAME file for fields this browser UI has no equivalent
			// for. save() used to call setSettings() with a hand-typed
			// literal of only the fields THIS component manages, which is a
			// full REPLACE server-side (setSettings does `blob.settings =
			// settings`, not a merge) — so opening this screen and changing
			// literally anything silently wiped out whatever Android-only
			// values were sitting in those other fields. Spreading this
			// underneath the managed fields in save() keeps them intact.
			rawSettings: {},

			saved: false,
			saveError: null,
			loadError: null,
			saveTimer: null,
			accessCodeTimer: null,
			geladenPayload: null,
			web: WEB,
			// De code waarmee het bestand het laatst gelezen kon worden: bij een
			// wissel is dat de code waarmee we het overzetten.
			werkendeCode: '',
			rekeyStatus: '',
			loadSeq: 0,
			watching: false,
		}
	},
	async mounted() {
		this.laadVerwijderStatus(); this.laadPasskeys()
		await this.loadSettings()
		this.laadMail()
		this.verifyApiCode()
		this.watching = true
		// Meekijken met het gedeelde oor (24-09), in plaats van hier een eigen verbinding open te houden.
		this.stopKijken = watch(() => sync.versie, () => {
			if (this.watching && gingOver('settings')) this.loadSettings()
		})
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
		this.watching = false
	},
	computed: {
		/** Alleen de vragen die bij de rollen horen die je gekozen hebt -- net als op de telefoon. */
		rolVragen() {
			if (!this.rollen.length) return []
			return ROL_VRAGEN.filter((v) => (ROL_VRAAG_ROLLEN[v] || []).some((r) => this.rollen.includes(r)))
		},
		landTalen() {
			return this.countries.find((c) => c.cc === this.country)?.languages || []
		},
		rideHailingEnabledCount() {
			return ['uberEnabled', 'boltEnabled', 'lyftEnabled'].filter((k) => this.rideHailing[k]).length
		},
		// Mirrors AirlineDirectory.search() (Android) exactly: exact-code
		// match first, then name-starts-with, then contains — same ranking,
		// same 8-result cap, same bundled openflights.org snapshot.
		airlineSuggestions() {
			const q = this.newAirlineCode.trim()
			if (!q) return []
			const qUpper = q.toUpperCase()
			const qLower = q.toLowerCase()
			return Object.entries(AIRLINES_IATA)
				.filter(([code, name]) => code === qUpper || name.toLowerCase().includes(qLower))
				.sort((a, b) => {
					const aExact = a[0] === qUpper ? 0 : 1
					const bExact = b[0] === qUpper ? 0 : 1
					if (aExact !== bExact) return aExact - bExact
					const aStarts = a[1].toLowerCase().startsWith(qLower) ? 0 : 1
					const bStarts = b[1].toLowerCase().startsWith(qLower) ? 0 : 1
					if (aStarts !== bStarts) return aStarts - bStarts
					return a[1].localeCompare(b[1])
				})
				.slice(0, 8)
				.map(([code, name]) => ({ code, name }))
		},
	},
	methods: {
		/**
		 * Licht, donker of het apparaat volgen. Meteen zichtbaar, geen opslaan-knop nodig.
		 *
		 * Gaat ook naar het gedragslogboek (Ramin, 24-09: "zorg je ervoor dat nieuwe dingen die je maakt
		 * ook in het behaviour log komen"). De keuze zelf blijft op dit apparaat; dat je hem maakte is wel
		 * iets wat je later wilt kunnen terugzien.
		 */
		zetThema(stand) {
			zetThemaStand(stand)
			logAction(getAccessCode(), 'settings.thema', { summary: stand })
		},
		prioriteitLabel(p) {
			return ({
				vlucht: t('Flight'), arts: t('Doctor'), afspraak: t('Appointment'), verblijf: t('Stay'), werk: t('Work'),
				lunch: t('Lunch'), dinner: t('Dinner'), studie: t('Study'), festiviteit: t('Party'), thuis: t('Home'),
			})[p] || p
		},
		wisselRol(r) {
			this.rollen = this.rollen.includes(r) ? this.rollen.filter((x) => x !== r) : this.rollen.concat([r])
			this.save()
		},
		prioriteitVerplaats(van, naar) {
			if (naar < 0 || naar >= this.prioriteiten.length) return
			const lijst = this.prioriteiten.slice()
			const [x] = lijst.splice(van, 1)
			lijst.splice(naar, 0, x)
			this.prioriteiten = lijst
			this.save()
		},
		/**
		 * De mailbox-instellingen ophalen. Mislukt dit, dan laten we staan wat er staat: niet kunnen kijken
		 * is iets anders dan niets gevonden -- anders zou het scherm zeggen dat MailWatcher uit staat
		 * terwijl hij gewoon draait.
		 */
		async laadMail() {
			const code = getAccessCode()
			if (!code) return
			const m = await mailWatchGet(code).catch(() => null)
			if (m && m.ok !== false) this.mail = { ...this.mail, ...m }
		},
		async zoekMailServer() {
			const code = getAccessCode()
			if (!code || !this.mail.username) return
			this.mailZoekt = true
			const gevonden = await mailWatchDiscover(code, this.mail.username).catch(() => null)
			this.mailZoekt = false
			if (gevonden && gevonden.host) this.mail.host = gevonden.host
		},
		async saveMail(metWachtwoord = false) {
			const code = getAccessCode()
			if (!code) return
			const payload = {
				host: this.mail.host || '',
				username: this.mail.username || '',
				parcelsMode: this.mail.parcelsMode,
				boardingMode: this.mail.boardingMode,
				reservationsMode: this.mail.reservationsMode,
				meetingsMode: this.mail.meetingsMode,
				intervalMinutes: this.mail.intervalMinutes,
				enabled: !!this.mail.enabled,
			}
			// Een leeg wachtwoord betekent "laat staan wat er is" -- de server geeft het nooit terug, dus
			// meesturen van een lege waarde zou het wissen.
			if (metWachtwoord && this.mailWachtwoord) payload.password = this.mailWachtwoord
			const antwoord = await mailWatchSave(code, payload).catch(() => null)
			if (antwoord && antwoord.ok !== false) {
				this.mailWachtwoord = ''
				this.mail = { ...this.mail, ...antwoord }
			}
		},
		rolVraagLabel(v) { return ROL_VRAAG_LABEL[v] ? ROL_VRAAG_LABEL[v]() : v },
		zetRolAntwoord(v, ja) {
			this.rolAntwoorden = { ...this.rolAntwoorden, [v]: ja }
			this.save()
		},
		werktOp(d) { return this.workDays.includes(d) },
		thuisOp(d) { return this.workDays.includes(d) && this.thuiswerkdagen.includes(d) },
		/**
		 * Eén tik loopt de drie standen langs: uit → kantoor → thuis → uit. Exact dezelfde volgorde als op
		 * de telefoon, zodat het op beide hetzelfde voelt.
		 */
		wisselWerkdag(d) {
			if (!this.werktOp(d)) {
				this.workDays = this.workDays.concat([d])
				this.thuiswerkdagen = this.thuiswerkdagen.filter((x) => x !== d)
			} else if (!this.thuisOp(d)) {
				this.thuiswerkdagen = this.thuiswerkdagen.concat([d])
			} else {
				this.workDays = this.workDays.filter((x) => x !== d)
				this.thuiswerkdagen = this.thuiswerkdagen.filter((x) => x !== d)
			}
			this.save()
		},
		wisselThuiswerkdag(id) {
			this.thuiswerkdagen = this.thuiswerkdagen.includes(id)
				? this.thuiswerkdagen.filter((x) => x !== id)
				: this.thuiswerkdagen.concat([id])
			this.save()
		},
		menuLabel(id) { return MENU_NAMEN[id] ? MENU_NAMEN[id]() : id },
		menuVerplaats(van, naar) {
			if (naar < 0 || naar >= this.menuVolgorde.length) return
			const lijst = this.menuVolgorde.slice()
			const [x] = lijst.splice(van, 1)
			lijst.splice(naar, 0, x)
			this.menuVolgorde = lijst
			this.save()
		},
		menuWisselZichtbaar(id) {
			// Wegzetten haalt het item NIET uit je volgorde: zet je het later weer aan, dan staat het
			// terug op de plek waar je het had. Dezelfde afspraak als op de telefoon.
			this.menuVerborgen = this.menuVerborgen.includes(id)
				? this.menuVerborgen.filter((x) => x !== id)
				: this.menuVerborgen.concat([id])
			this.save()
		},
		menuSleepStart(i) { this.menuSleepIndex = i },
		menuSleepDrop(i) {
			if (this.menuSleepIndex === null || this.menuSleepIndex === i) { this.menuSleepIndex = null; return }
			this.menuVerplaats(this.menuSleepIndex, i)
			this.menuSleepIndex = null
		},
		sleepStart(i) { this.sleepIndex = i },
		sleepDrop(i) {
			if (this.sleepIndex === null || this.sleepIndex === i) { this.sleepIndex = null; return }
			this.prioriteitVerplaats(this.sleepIndex, i)
			this.sleepIndex = null
		},
		uitloggen() {
			setAccessCode('')
			window.location.reload()
		},
		/** Alles als JSON-bestand (kaart 121). */
		async downloadGegevens() {
			this.privacyBusy = true
			try {
				const data = await exportAccount(this.accessCode)
				const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
				const a = document.createElement('a')
				a.href = URL.createObjectURL(blob)
				a.download = 'askanina-export-' + new Date().toISOString().slice(0, 10) + '.json'
				a.click()
				setTimeout(() => URL.revokeObjectURL(a.href), 10000)
				this.privacyMelding = this.t('Saved.')
			} catch (e) {
				this.privacyMelding = this.t('That did not work. Try again.')
			}
			this.privacyBusy = false
		},
		async laadPasskeys() {
			if (!this.web || !this.accessCode) return
			try { this.passkeyLijst = await passkeyList(this.accessCode) } catch (e) { this.passkeyLijst = [] }
		},
		async passkeyToevoegen() {
			this.passkeyBusy = true; this.passkeyMelding = ''
			try {
				await passkeyRegister(this.accessCode, this.passkeyNaam.trim())
				this.passkeyNaam = ''
				this.passkeyMelding = this.t('Passkey saved.')
				await this.laadPasskeys()
			} catch (e) {
				if (!(e && e.name === 'NotAllowedError')) this.passkeyMelding = this.t('That did not work. Try again.')
			}
			this.passkeyBusy = false
		},
		/** Twee keer klikken, geen native confirm. */
		async passkeyWeg(pk) {
			if (this.passkeyWegVraag !== pk.id) { this.passkeyWegVraag = pk.id; setTimeout(() => { if (this.passkeyWegVraag === pk.id) this.passkeyWegVraag = null }, 3000); return }
			this.passkeyBusy = true; this.passkeyWegVraag = null
			try { await passkeyDelete(this.accessCode, pk.id); await this.laadPasskeys() } catch (e) { this.passkeyMelding = this.t('That did not work. Try again.') }
			this.passkeyBusy = false
		},
		async laadVerwijderStatus() {
			if (!this.accessCode) return
			try { this.deleteAt = (await deleteAccountStatus(this.accessCode)).deleteAt || null } catch (e) { this.deleteAt = null }
		},
		async vraagVerwijdering() {
			this.privacyBusy = true
			try {
				const d = await requestAccountDeletion(this.accessCode)
				this.deleteAt = d.deleteAt || null
				this.deleteVraag = false
			} catch (e) {
				this.privacyMelding = this.t('That did not work. Try again.')
			}
			this.privacyBusy = false
		},
		async intrekkenVerwijdering() {
			this.privacyBusy = true
			try {
				await cancelAccountDeletion(this.accessCode)
				this.deleteAt = null
				this.privacyMelding = this.t('Deletion cancelled.')
			} catch (e) {
				this.privacyMelding = this.t('That did not work. Try again.')
			}
			this.privacyBusy = false
		},
		/** Op slot zonder het account kwijt te raken (kaart 7). */
		vergrendelen() {
			setLocked(true)
			window.location.reload()
		},
		/** Alle velden die dit scherm beheert, in de vorm van het bestand. */
		huidigePayload() {
			return {
				// Everything this component doesn't manage (quickPicks,
				// navigationApp, swipeLeftAction/swipeRightAction —
				// mobile-only, no browser equivalent) rides along
				// unchanged instead of being dropped — see rawSettings'
				// own docblock above.
				...this.rawSettings,
				navigationApp: this.navigationApp,
				swipeLeftAction: this.swipeLeftAction,
				swipeRightAction: this.swipeRightAction,
				selectedCalendars: this.selectedCalendars,
				contactBooks: this.contactBooks,
				rssFeeds: this.rssFeeds,
				podcasts: this.podcasts,
				viewMode: this.viewMode,
				weekMode: this.weekMode,
				weekFirstDay: this.weekFirstDay,
				country: this.country || null,
				language: this.language || null,
				homeAddress: this.homeAddress || null,
				homeLat: this.homeLat,
				homeLon: this.homeLon,
				homeCountryCode: this.homeCountryCode,
				gymAddress: this.gymAddress || null,
				gymLat: this.gymLat,
				gymLon: this.gymLon,
				gettingReadyHomeMinutes: parseInt(this.gettingReadyHomeMinutes, 10) || 30,
				gettingReadyWorkMinutes: parseInt(this.gettingReadyWorkMinutes, 10) || 15,
				arrivalBufferMinutes: parseInt(this.arrivalBufferMinutes, 10) || 10,
				gapThresholdMinutes: parseInt(this.gapThresholdMinutes, 10) || 90,
				returnToOfficeMinutes: Math.max(0, parseInt(this.returnToOfficeMinutes, 10) || 0),
				prioriteiten: this.prioriteiten.slice(),
				menuOrder: this.menuVolgorde.slice(),
				documents: this.documenten.filter((d) => (d.name || '').trim()),
				firstName: this.firstName || null,
				lastName: this.lastName || null,
				dateOfBirth: this.dateOfBirth || null,
				// De telefoon bewaart dit als MONDAY,TUESDAY — dezelfde vorm, anders leest hij het niet.
				workFromHomeDays: this.thuiswerkdagen.join(',') || null,
				preferredDepartureAirport: this.vertrekVliegveld || null,
				workFromHomeDates: this.thuiswerkdatums.filter(Boolean).join(',') || null,
				breakEveryMinutes: this.pauzeElke || null,
				breakLengthMinutes: this.pauzeLang || null,
				workCalendarTarget: this.workCalendarTarget || null,
				taxiApp: this.taxiApp || null,
				nextcloudUrl: this.nextcloudUrl || null,
				nextcloudAppPassword: this.nextcloudAppPassword || null,
				rolAntwoorden: { ...this.rolAntwoorden },
				medicines: this.medicijnen.filter((m) => (m.name || '').trim()),
				subscriptions: this.vasteLasten.filter((a) => (a.name || '').trim()),
				menuHidden: this.menuVerborgen.slice(),
				rollen: this.rollen.slice(),
				workAddress: this.workAddress || null,
				workLat: this.workLat,
				workLon: this.workLon,
				workCountryCode: this.workCountryCode,
				workTravelMode: this.workTravelMode,
				commuteH2wDepartureStation: this.commuteH2wDepartureStation || null,
				commuteH2wDepartureStationLat: this.commuteH2wDepartureStationLat,
				commuteH2wDepartureStationLon: this.commuteH2wDepartureStationLon,
				commuteH2wDepartureTime: this.commuteH2wDepartureTime,
				commuteH2wArrivalStation: this.commuteH2wArrivalStation || null,
				commuteH2wArrivalStationLat: this.commuteH2wArrivalStationLat,
				commuteH2wArrivalStationLon: this.commuteH2wArrivalStationLon,
				commuteH2wArrivalTime: this.commuteH2wArrivalTime,
				commuteW2hDepartureStation: this.commuteW2hDepartureStation || null,
				commuteW2hDepartureStationLat: this.commuteW2hDepartureStationLat,
				commuteW2hDepartureStationLon: this.commuteW2hDepartureStationLon,
				commuteW2hDepartureTime: this.commuteW2hDepartureTime,
				commuteW2hArrivalStation: this.commuteW2hArrivalStation || null,
				commuteW2hArrivalStationLat: this.commuteW2hArrivalStationLat,
				commuteW2hArrivalStationLon: this.commuteW2hArrivalStationLon,
				commuteW2hArrivalTime: this.commuteW2hArrivalTime,
				workDays: this.workDays,
				workStartTime: this.workStartTime,
				workEndTime: this.workEndTime,
				preferredAirlines: this.preferredAirlines,
				checkinLeadMinutes: parseInt(this.checkinLeadMinutes, 10) || 150,
				arrivalProcessingMinutes: parseInt(this.arrivalProcessingMinutes, 10) || 60,
				pushTravelCheckinToCalendar: this.pushTravelCheckinToCalendar,
				airLabsKey: this.airLabsKey,
				anthropicApiKey: this.anthropicApiKey || null,
				anthropicWorkspaceId: this.anthropicWorkspaceId || null,
				aiProvider: this.aiProvider || 'anthropic',
				openaiApiKey: this.openaiApiKey || null,
				geminiApiKey: this.geminiApiKey || null,
				novaTaal: this.novaTaal || null,
				// Als JSON-tekst, precies zoals de telefoon het schrijft en leest.
				vehicles: this.vehicles.length ? JSON.stringify(this.vehicles.map(voertuigMetId)) : null,
				activeVehiclePlate: this.activeVehiclePlate || null,
				tankerkoenigKey: this.tankerkoenigKey || null,
				morningDigestTime: this.morningDigestTime || null,
				eveningDigestTime: this.eveningDigestTime || null,
			}
		},
		addVehicle() {
			this.vehicles.push({ plate: '', name: '', fuelType: 'E10', tankLitres: 0, kmPerLitre: 0, reserveLitres: 8, kmSinceRefuel: 0 })
		},
		removeVehicle(i) {
			const weg = this.vehicles[i]
			this.vehicles.splice(i, 1)
			if (weg && this.activeVehiclePlate === weg.plate) this.activeVehiclePlate = this.vehicles[0]?.plate || ''
			this.save()
		},
		t(...args) {
			return t(...args)
		},
		onCountry(cc) {
			this.country = cc
			this.language = localeFor(cc) || ''
			useCountry(cc, this.language)
			this.save()
		},
		onLanguage(lc) {
			this.language = lc
			useCountry(this.country, lc)
			this.save()
		},
		taalNaam(lc) {
			return LANGUAGE_NAMES[String(lc).split('-')[0]] || lc
		},
		flag,
		// The API-code is now ALSO the encryption key for the WebDAV blob
		// (2026-09-09: "gebruik de API key als sleutel" — see
		// nextcloudUserData.js/cryptoUtil.js), on top of its original future-
		// licensing purpose ("API-code om geldigheid te bewaken") — so a
		// changed code must retry the load, not just persist silently: the
		// old code's data would otherwise look identical to "nothing saved
		// yet" instead of "wrong code, couldn't decrypt". Debounced (every
		// keystroke while typing/pasting a new code would otherwise fire its
		// own load — caught live 2026-09-09: an earlier, still-wrong-
		// mid-typing keystroke's request resolving AFTER the final correct
		// one clobbered a successful result with a stale "invalid tag"
		// error) — `loadSeq` on top of the debounce guards against a slow
		// stale request still winning the race even after debouncing.
		onAccessCodeChanged(value) {
			this.accessCode = value
			setAccessCode(value)
			// null while typing: show nothing rather than flashing a red cross
			// at someone halfway through their code.
			this.apiCodeValid = null
			clearTimeout(this.accessCodeTimer)
			this.accessCodeTimer = setTimeout(async () => {
				await this.verifyApiCode()
				// Een echte, andere code dan waarmee het bestand gelezen werd:
				// zet het bestand over, zodat telefoon en browser dezelfde
				// sleutel hebben (Ramin, 2026-09-13: "aes-gcm: invalid tag").
				const nieuw = (this.accessCode || '').trim()
				if (this.apiCodeValid && this.werkendeCode && nieuw && nieuw !== this.werkendeCode) {
					try {
						const r = await rekeyUserData(this.werkendeCode, nieuw)
						if (r === 'rekeyed') this.rekeyStatus = t('Your data has been re-encrypted with the new code.')
					} catch (e) { /* dan meldt loadSettings dat de code het bestand niet leest */ }
				}
				this.loadSettings()
			}, 500)
		},
		/** A failed request leaves this null — "no connection" is not the
		 * same as "wrong code", and showing the latter would be a lie. */
		async verifyApiCode() {
			const code = (this.accessCode || '').trim()
			if (!code) { this.apiCodeValid = null; return }
			this.apiCodeValid = await checkApiCode(code)
		},
		async loadSettings() {
			const seq = ++this.loadSeq
			this.loadError = null
			let s
			try {
				s = await getSettings()
			} catch (e) {
				if (seq === this.loadSeq) this.loadError = foutTekst(e)
				return
			}
			if (seq !== this.loadSeq) return // a newer load has since started; this result is stale
			this.werkendeCode = (this.accessCode || '').trim()
			if (!s) {
				// Bootstrap from the shared backend row (Ramin, 2026-09-10:
				// same APP-API-code bridge as save()'s mirror push) — only
				// when this app's own WebDAV file has nothing yet, so it
				// never overwrites something already saved here.
				const code = getAccessCode()
				if (code) {
					s = await getBackendSettings(code).catch(() => null)
					if (s && seq === this.loadSeq) setSettings(s).catch(() => {})
				}
				if (!s) return
			}
			this.rawSettings = s
			this.selectedCalendars = s.selectedCalendars || []
			this.navigationApp = s.navigationApp || 'GOOGLE_MAPS'
			this.swipeLeftAction = s.swipeLeftAction || 'ARCHIVE'
			this.swipeRightAction = s.swipeRightAction || 'DONE'
			this.contactBooks = Array.isArray(s.contactBooks) ? s.contactBooks : []
			this.rssFeeds = Array.isArray(s.rssFeeds) ? s.rssFeeds : []
			this.podcasts = Array.isArray(s.podcasts) ? s.podcasts : []
			this.viewMode = s.viewMode ?? 'DAY'
			this.weekMode = s.weekMode === 'today' ? 'today' : 'fixed'
			this.weekFirstDay = s.weekFirstDay || 'auto'
			this.country = s.country || ''
			this.language = (s.language || '').toLowerCase()
			this.homeAddress = s.homeAddress || ''
			this.homeLat = s.homeLat ?? null
			this.homeLon = s.homeLon ?? null
			this.homeCountryCode = s.homeCountryCode || null
			this.gymAddress = s.gymAddress || ''
			this.gymLat = s.gymLat ?? null
			this.gymLon = s.gymLon ?? null
			this.gettingReadyHomeMinutes = String(s.gettingReadyHomeMinutes ?? 30)
			this.gettingReadyWorkMinutes = String(s.gettingReadyWorkMinutes ?? 15)
			this.arrivalBufferMinutes = String(s.arrivalBufferMinutes ?? 10)
			this.gapThresholdMinutes = String(s.gapThresholdMinutes ?? 90)
			this.returnToOfficeMinutes = String(s.returnToOfficeMinutes ?? 60)
			// Bekende soorten in de opgeslagen volgorde, en wat nieuw is achteraan.
			this.rollen = Array.isArray(s.rollen) ? s.rollen.filter((r) => ROLLEN.includes(r)) : []
			const bewaard = Array.isArray(s.prioriteiten) ? s.prioriteiten.filter((p) => PRIORITEITEN_STANDAARD.includes(p)) : []
			this.prioriteiten = bewaard.concat(PRIORITEITEN_STANDAARD.filter((p) => !bewaard.includes(p)))
			// Wat de telefoon kent maar wij niet (gesprekken, ritten, series, in de buurt, rijmodus) blijft
			// in de lijst staan en is hier ook te verslepen -- anders zou je op het web de volgorde van je
			// telefoon niet compleet kunnen zetten.
			const menuBewaard = Array.isArray(s.menuOrder) ? s.menuOrder.filter((m) => MENU_STANDAARD.includes(m)) : []
			this.menuVolgorde = menuBewaard.concat(MENU_STANDAARD.filter((m) => !menuBewaard.includes(m)))
			this.menuVerborgen = Array.isArray(s.menuHidden) ? s.menuHidden.slice() : []
			this.documenten = Array.isArray(s.documents) ? s.documents.map((d) => ({ ...d })) : []
			this.firstName = s.firstName || ''
			this.lastName = s.lastName || ''
			this.dateOfBirth = s.dateOfBirth || ''
			this.thuiswerkdagen = (s.workFromHomeDays || '').split(',').map((x) => x.trim()).filter(Boolean)
			this.vertrekVliegveld = s.preferredDepartureAirport || ''
			this.thuiswerkdatums = (s.workFromHomeDates || '').split(',').map((x) => x.trim()).filter(Boolean)
			this.pauzeElke = s.breakEveryMinutes || 0
			this.pauzeLang = s.breakLengthMinutes || 0
			this.workCalendarTarget = s.workCalendarTarget || null
			this.taxiApp = s.taxiApp || ''
			this.nextcloudUrl = s.nextcloudUrl || ''
			this.nextcloudAppPassword = s.nextcloudAppPassword || ''
			this.rolAntwoorden = (s.rolAntwoorden && typeof s.rolAntwoorden === 'object') ? { ...s.rolAntwoorden } : {}
			this.medicijnen = Array.isArray(s.medicines) ? s.medicines.map((m) => ({ ...m })) : []
			this.vasteLasten = Array.isArray(s.subscriptions) ? s.subscriptions.map((a) => ({ ...a })) : []
			this.workAddress = s.workAddress || ''
			this.workLat = s.workLat ?? null
			this.workLon = s.workLon ?? null
			this.workCountryCode = s.workCountryCode || null
			this.workTravelMode = s.workTravelMode ?? 'CAR'
			this.commuteH2wDepartureStation = s.commuteH2wDepartureStation || ''
			this.commuteH2wDepartureStationLat = s.commuteH2wDepartureStationLat ?? null
			this.commuteH2wDepartureStationLon = s.commuteH2wDepartureStationLon ?? null
			this.commuteH2wArrivalStation = s.commuteH2wArrivalStation || ''
			this.commuteH2wArrivalStationLat = s.commuteH2wArrivalStationLat ?? null
			this.commuteH2wArrivalStationLon = s.commuteH2wArrivalStationLon ?? null
			this.commuteW2hDepartureStation = s.commuteW2hDepartureStation || ''
			this.commuteW2hDepartureStationLat = s.commuteW2hDepartureStationLat ?? null
			this.commuteW2hDepartureStationLon = s.commuteW2hDepartureStationLon ?? null
			this.commuteW2hArrivalStation = s.commuteW2hArrivalStation || ''
			this.commuteW2hArrivalStationLat = s.commuteW2hArrivalStationLat ?? null
			this.commuteW2hArrivalStationLon = s.commuteW2hArrivalStationLon ?? null
			// Een LEGE lijst is een antwoord: je hebt geen werkdagen ingesteld. Alleen als het veld
			// helemaal ontbreekt weten we het niet, en dan pas vallen we terug op maandag t/m vrijdag.
			// Hiervoor werd leeg behandeld als onbekend, waardoor het web vijf werkdagen liet zien die er
			// niet waren -- en ze bij de eerste de beste wijziging ook echt wegschreef (Ramin, 24-09:
			// "op mijn telefoon zie ik GEEN werkdagen, web-based wel").
			this.workDays = Array.isArray(s.workDays) ? s.workDays.slice() : this.workDays
			this.workStartTime = s.workStartTime || '09:00'
			this.workEndTime = s.workEndTime || '17:00'
			this.commuteH2wArrivalTime = s.commuteH2wArrivalTime || commuteTimeDefault(this.workStartTime, -30)
			this.commuteW2hDepartureTime = s.commuteW2hDepartureTime || commuteTimeDefault(this.workEndTime, 30)
			this.commuteH2wDepartureTime = s.commuteH2wDepartureTime || ''
			this.commuteW2hArrivalTime = s.commuteW2hArrivalTime || ''
			this.preferredAirlines = s.preferredAirlines || []
			this.checkinLeadMinutes = String(s.checkinLeadMinutes ?? 150)
			this.arrivalProcessingMinutes = String(s.arrivalProcessingMinutes ?? 60)
			this.pushTravelCheckinToCalendar = s.pushTravelCheckinToCalendar ?? true
			this.airLabsKey = s.airLabsKey || ''
			this.anthropicApiKey = s.anthropicApiKey || ''
			this.anthropicWorkspaceId = s.anthropicWorkspaceId || ''
			this.aiProvider = ['anthropic', 'openai', 'gemini'].includes(s.aiProvider) ? s.aiProvider : 'anthropic'
			this.openaiApiKey = s.openaiApiKey || ''
			this.geminiApiKey = s.geminiApiKey || ''
			this.novaTaal = s.novaTaal || ''
			this.vehicles = parseVehicles(s.vehicles).map((v) => ({ ...v, _vorigKenteken: v.plate }))
			this.activeVehiclePlate = s.activeVehiclePlate || ''
			this.tankerkoenigKey = s.tankerkoenigKey || ''
			this.morningDigestTime = s.morningDigestTime || ''
			this.eveningDigestTime = s.eveningDigestTime || ''
			this.geladenPayload = this.huidigePayload()
		},
		async geocodeHome() {
			this.homeGeocodeStatus = 'Searching…'
			try {
				const found = await geocode(this.homeAddress)
				this.homeLat = found.lat
				this.homeLon = found.lon
				this.homeCountryCode = found.country_code || null
				this.homeGeocodeStatus = 'Found'
				this.save()
			} catch (e) {
				this.homeGeocodeStatus = foutTekst(e)
			}
		},
		async geocodeWork() {
			this.workGeocodeStatus = 'Searching…'
			try {
				const found = await geocode(this.workAddress)
				this.workLat = found.lat
				this.workLon = found.lon
				this.workCountryCode = found.country_code || null
				this.workGeocodeStatus = 'Found'
				this.save()
			} catch (e) {
				this.workGeocodeStatus = foutTekst(e)
			}
		},
		async geocodeGym() {
				this.gymGeocodeStatus = 'Searching...'
				try {
					const found = await geocode(this.gymAddress)
					this.gymLat = found.lat
					this.gymLon = found.lon
					this.gymGeocodeStatus = 'Found'
					this.save()
				} catch (e) {
					this.gymGeocodeStatus = foutTekst(e)
				}
			},
			async searchCommuteStation(which, query) {
				const key = COMMUTE_FIELDS[which].suggestions
				if (query.length < 3) {
					this[key] = []
					return
				}
				try {
					this[key] = await poiSearch(query, 5, 'railway')
				} catch (e) {
					this[key] = []
				}
			},
			pickCommuteStation(which, poi) {
				const f = COMMUTE_FIELDS[which]
				this[f.station] = poi.name
				this[f.lat] = poi.lat
				this[f.lon] = poi.lon
				this[f.suggestions] = []
				this.save()
			},
			setRideHailing(key, value) {
			this.rideHailing = { ...this.rideHailing, [key]: value }
			setRideHailingPrefs(this.rideHailing)
		},
		toggleDigest(which, checked) {
			const key = which === 'morning' ? 'morningDigestTime' : 'eveningDigestTime'
			this[key] = checked ? (this[key] || '08:00') : ''
			this.save()
		},
		toggleWorkDay(day) {
			this.workDays = this.workDays.includes(day) ? this.workDays.filter((d) => d !== day) : [...this.workDays, day]
			this.save()
		},
		addAirline() {
			this.addAirlineCode(this.newAirlineCode.trim().toUpperCase())
		},
		addAirlineCode(code) {
			if (code.length === 2 && !this.preferredAirlines.includes(code)) {
				this.preferredAirlines = [...this.preferredAirlines, code]
				this.save()
			}
			this.newAirlineCode = ''
		},
		removeAirline(code) {
			this.preferredAirlines = this.preferredAirlines.filter((c) => c !== code)
			this.save()
		},
		airlineName(code) {
			return AIRLINES_IATA[code] || null
		},
		async loadCalendars() {
			this.loadingCalendars = true
			this.calendarsError = null
			try {
				this.availableCalendars = await discoverCalendars()
				if (!WEB) this.availableBooks = await discoverAddressBooks().catch(() => [])
			} catch (e) {
				this.calendarsError = foutTekst(e)
			} finally {
				this.loadingCalendars = false
			}
		},
		isSelected(calendar) {
			return this.selectedCalendars.some((c) => c.href === calendar.href)
		},
		entryFor(calendar) {
			return this.selectedCalendars.find((c) => c.href === calendar.href) || {}
		},
		setIgnoreLocationAlwaysHome(calendar, checked) {
			this.selectedCalendars = this.selectedCalendars.map((c) => (c.href === calendar.href ? { ...c, ignoreLocationAlwaysHome: checked } : c))
			this.save()
		},
		setAllDayOffset(calendar, value) {
			this.selectedCalendars = this.selectedCalendars.map((c) => (c.href === calendar.href ? { ...c, allDayReminderOffset: value || null } : c))
			this.save()
		},
		/** Een website of feed-adres: de server herkent de feed(s) op die pagina. */
		async voegFeedToe() {
			const url = this.nieuweFeed.trim()
			if (!url) return
			this.feedBezig = true
			this.feedFout = ''
			try {
				const gevonden = await feedDiscover(getAccessCode(), url)
				if (!gevonden.length) { this.feedFout = t('No feed found on that page.'); return }
				for (const f of gevonden.slice(0, 3)) {
					if (!this.rssFeeds.some((x) => x.url === f.url)) this.rssFeeds = [...this.rssFeeds, { url: f.url, title: f.title || f.url }]
				}
				this.nieuweFeed = ''
				this.save()
			} catch (e) {
				this.feedFout = foutTekst(e)
			} finally {
				this.feedBezig = false
			}
		},
		verwijderFeed(i) {
			this.rssFeeds = this.rssFeeds.filter((_, j) => j !== i)
			this.save()
		},
		async zoekPodcasts() {
			const q = this.podcastZoek.trim()
			if (q.length < 2) return
			this.podcastBezig = true
			try {
				this.podcastResultaten = await podcastSearch(getAccessCode(), q, (this.country || 'nl-nl').split('-').pop())
			} catch (e) {
				this.podcastResultaten = []
			} finally {
				this.podcastBezig = false
			}
		},
		abonneer(r) {
			if (this.podcasts.some((p) => p.feedUrl === r.feedUrl)) return
			this.podcasts = [...this.podcasts, { feedUrl: r.feedUrl, name: r.name, artist: r.artist, artwork: r.artwork }]
			this.save()
		},
		verwijderPodcast(i) {
			this.podcasts = this.podcasts.filter((_, j) => j !== i)
			this.save()
		},
		toggleBook(boek, checked) {
			const basis = this.contactBooks.length ? this.contactBooks : this.availableBooks.map((b) => b.href)
			this.contactBooks = checked ? [...new Set([...basis, boek.href])] : basis.filter((h) => h !== boek.href)
			this.save()
		},
		toggleCalendar(calendar, checked) {
			this.selectedCalendars = checked
				? [...this.selectedCalendars, calendar]
				: this.selectedCalendars.filter((c) => c.href !== calendar.href)
			this.save()
		},
		save() {
			clearTimeout(this.saveTimer)
			this.saveTimer = setTimeout(async () => {
				try {
				// Alleen wat je HIER veranderd hebt gaat terug, bovenop een verse
				// kopie van het bestand. Anders zette deze browser, met zijn eigen
				// lege velden, stilzwijgend de AirLabs-sleutel en de voertuigen van
				// de telefoon op leeg (Ramin, 2026-09-13).
				const alles = this.huidigePayload()
				const gewijzigd = {}
				for (const [k, v] of Object.entries(alles)) {
					if (JSON.stringify(v ?? null) !== JSON.stringify(this.geladenPayload?.[k] ?? null)) gewijzigd[k] = v
				}
				invalidateUserData()
				const vers = (await getSettings()) || {}
				const payload = { ...vers, ...gewijzigd }
				await setSettings(payload)
				this.rawSettings = payload
				this.geladenPayload = { ...(this.geladenPayload || {}), ...gewijzigd }
				this.saved = true
				this.saveError = null
				setTimeout(() => { this.saved = false }, 2000)
				// Mirror to the shared backend row keyed by the APP-API
				// code (Ramin, 2026-09-10: "Er is een APP-API-key... als
				// die in account-modus wordt gebruikt en op de laptop in
				// Nextcloud, dan kunnen de settings gedeeld worden") — same
				// code Android's Account-mode now uses as its own
				// pa_settings owner_key when set, so this becomes the
				// bridge between the two storage mechanisms. Best-effort:
				// this app's own WebDAV save above is already the primary,
				// successful save — a failure here must never surface as
				// this component's own save error.
				const code = getAccessCode()
				if (code) {
					// notifyChanged wakes Android's own waitChanged() loop
					// (Ramin, 2026-09-10: "ze moeten instant veranderen")
					// within ~1s instead of its next ~25s poll cycle — same
					// "push then ping" pattern Android's own SettingsScreen
					// already uses on its side.
					setBackendSettings(code, payload)
						.then(() => notifyChanged(code, 'settings'))
						.catch(() => {})
				}
				} catch (e) {
					this.saveError = foutTekst(e)
				}
			}, 500)
		},
		// Instant cross-device sync, the other direction (Ramin, 2026-09-10:
		// same request — this app previously never listened for anything,
		// only ever picked up a change on its own next load/save). Same
		// long-poll wait_changed.php Android's TodayScreen loop uses.
	},
}
</script>

<style scoped>
.pa-werkdag { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; width: 44px; height: 44px; font: inherit; font-size: 0.78em; border: 1px solid var(--color-border); border-radius: 10px; background: transparent; color: var(--color-text-maxcontrast, #777); cursor: pointer; }
.pa-werkdag--kantoor { background: var(--color-primary-element); color: var(--color-primary-element-text, #fff); border-color: transparent; }
.pa-werkdag--thuis { background: var(--color-background-dark, #444); color: var(--color-main-text); border-color: var(--color-primary-element); }
.pa-werkdag__stand { font-weight: 700; font-size: 1.05em; min-height: 1em; }
.pa-rollen { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.pa-rol { border: 1px solid var(--color-border-dark, #999); border-radius: 999px; padding: 6px 12px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.pa-rol--aan { background: var(--color-primary-element, #1B2E4B); color: var(--color-primary-element-text, #fff); border-color: var(--color-primary-element, #1B2E4B); }
/* F4: de prioriteiten-lijst (slepen of pijltjes). */
.pa-prio { list-style: none; margin: 0 0 12px; padding: 0; }
.pa-prio__rij { display: flex; align-items: center; gap: 8px; padding: 6px 8px; margin-bottom: 4px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-main-background); cursor: grab; }
.pa-prio__rij--sleep { opacity: .5; }
.pa-prio__greep { color: var(--color-text-maxcontrast); }
.pa-prio__naam { flex: 1; }
.pa-prio__knop { font: inherit; min-width: 32px; min-height: 28px; border-radius: 6px; border: 1px solid var(--color-border); background: var(--color-main-background); cursor: pointer; }
.pa-prio__knop:disabled { opacity: .35; cursor: default; }
.pa-hint { color: var(--color-text-maxcontrast); margin: 0 0 8px; }
.pa-settings__hint { margin: 8px 0 2px; color: var(--color-text-maxcontrast); font-size: 0.9em; }
.pa-settings__label { margin: 10px 0 4px; font-weight: 600; }
.pa-settings__app-api-row {
	display: flex;
	align-items: center;
	gap: 4px;
}
.pa-settings__app-api-field {
	flex: 1;
}
.pa-settings__api-ok,
.pa-settings__api-bad {
	font-size: 18px;
	line-height: 1;
	flex: 0 0 auto;
}

.pa-settings__api-ok { color: #2e7d32; }
.pa-settings__api-bad { color: var(--color-error, #c0392b); }

.pa-settings__info-button {
	background: none;
	border: none;
	cursor: pointer;
	color: var(--color-text-maxcontrast);
	padding: 4px;
	display: flex;
}
.pa-settings__app-api-info {
	margin-top: 4px;
}
.pa-settings__app-api-info a {
	color: var(--color-primary-element);
	font-weight: 600;
}
.pa-settings__checkbox-row {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 4px 0;
}
.pa-settings__calendar-options {
	padding-left: 28px;
	margin-bottom: 8px;
}
.pa-settings__time {
	display: block;
	margin: 4px 0 12px;
	padding: 6px 8px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius);
	background: var(--color-main-background);
	color: var(--color-main-text);
}
.pa-settings__row {
	display: flex;
	align-items: flex-end;
	gap: 8px;
}
.pa-settings__row--capped {
	max-width: 360px;
}
.pa-settings__row-grow {
	flex: 1;
	min-width: 0;
}
.pa-settings__time--inline {
	flex-shrink: 0;
	width: 110px;
}
/* Two-route commute rows (Ramin, 2026-09-10): four fields per row —
   time, station, time, station — scroll horizontally instead of
   squeezing onto one narrow column. */
.pa-settings__row--commute {
	flex-wrap: nowrap;
	overflow-x: auto;
	padding-bottom: 4px;
}
.pa-settings__commute-station {
	flex: 0 0 170px;
	min-width: 170px;
}
.pa-settings__commute-direction {
	font-weight: 600;
	margin: 10px 0 2px;
}
.pa-settings__suggestions {
	list-style: none;
	margin: 0 0 8px;
	padding: 0;
}
.pa-settings__suggestions li {
	padding: 6px 4px;
	font-size: 0.9em;
	cursor: pointer;
}
.pa-settings__suggestions li:hover {
	background: var(--color-background-hover);
}
.pa-settings__tabs, .pa-settings__subtabs, .pa-settings__chips {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin: 8px 0;
}
.pa-settings__tab, .pa-settings__chip {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-pill);
	background: var(--color-main-background);
	color: var(--color-main-text);
	padding: 6px 14px;
	cursor: pointer;
}
.pa-settings__tab--active, .pa-settings__chip--active {
	background: var(--color-primary-element);
	color: var(--color-primary-element-text);
	border-color: var(--color-primary-element);
}
.pa-settings__row {
	display: flex;
	gap: 8px;
	align-items: flex-end;
}
.pa-settings__calendars, .pa-settings__airlines {
	list-style: none;
	padding: 0;
}
.pa-settings__airline-suggestions {
	list-style: none;
	padding: 0;
	margin: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius);
	max-height: 220px;
	overflow-y: auto;
}
.pa-settings__airline-suggestions li {
	padding: 8px 12px;
	cursor: pointer;
	font-size: 0.9em;
}
.pa-settings__airline-suggestions li:hover {
	background: var(--color-background-hover);
}
.pa-settings__linklike {
	background: none;
	border: none;
	color: var(--color-primary-element);
	cursor: pointer;
	padding: 0 0 0 8px;
}
.pa-settings__saved {
	color: var(--color-success);
}
.pa-vehicle { border: 1px solid var(--color-border); border-radius: var(--border-radius-large); padding: 10px 12px; margin: 8px 0; }
.pa-vehicle__active, .pa-vehicle__field { display: flex; gap: 8px; align-items: center; font-size: 0.9em; margin: 6px 0; }
.pa-vehicle__select { font: inherit; min-height: 32px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); }
.pa-settings__ok { color: var(--color-success); font-size: 0.9em; }

.pa-settings__lijst { list-style: none; margin: 0 0 8px; padding: 0; }
.pa-settings__lijstrij { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--color-border, #eee); }
.pa-settings__lijstrij small { color: var(--color-text-maxcontrast, #666); }
.pa-settings__art { width: 40px; height: 40px; object-fit: cover; border-radius: 6px; }
.pa-settings__grow { flex: 1; min-width: 0; }
.pa-settings__rij { display: flex; gap: 8px; align-items: center; }
.pa-settings__veld { padding: 7px 10px; border: 1px solid var(--color-border, #ccc); border-radius: 8px; font: inherit; background: var(--color-main-background, #fff); color: inherit; }
.pa-settings__x { background: none; border: none; cursor: pointer; font-size: 1.2em; color: var(--color-text-maxcontrast, #666); }
.pa-settings__fout { color: var(--color-error, #c0392b); font-size: 0.9em; }
.pa-settings__passkeys { list-style: none; padding: 0; margin: 0 0 8px; }
.pa-settings__passkeys li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 0; flex-wrap: wrap; }
</style>
