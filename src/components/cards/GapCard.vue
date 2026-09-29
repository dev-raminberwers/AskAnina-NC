<template>
	<div class="pa-card pa-card--gap">
		<!-- Headline uses rawMinutes (the plain appointment-to-appointment
			window) — gap.minutes is the NET free time after the round trip
			via home/base (2026-09-10 redefinition, see Android's GapCard
			doc comment). The card appears whenever the raw window clears
			the threshold; `worthwhile` (server-computed) decides which
			line renders below — a normal at-home breakdown, or a warning
			that going home isn't worth it ("if it's less than 45 min, I
			need to see the card" — as a warning, not silence). -->
		<div>{{ gap.rawMinutes ?? gap.minutes }}min gap · {{ gap.fromLabel }} → {{ gap.toLabel }}</div>
		<div v-if="gap.toBaseMinutes != null && gap.fromBaseMinutes != null">
			<div v-if="gap.worthwhile" class="pa-card--gap__breakdown">
				{{ gap.toBaseMinutes }}min home · {{ gap.minutes }}min at home · {{ gap.fromBaseMinutes }}min → {{ gap.toLabel }}
			</div>
			<div v-else class="pa-card--gap__warning">
				⚠️ Only {{ gap.minutes }}min left if you went home in between ({{ gap.viaBaseMinutes }}min round trip) — not worth it
			</div>
		</div>

		<!-- Arrived by taxi (Ramin, 2026-09-10: "als taxi, dan in de gap card
			nadat de keuze is gemaakt de taxi-button plaatsen") — dropoff =
			home/base. Web equivalent of Android's launchRideHailing(): only
			Uber/Lyft have a reliable universal web link; Bolt has none, so
			it opens bolt.eu instead of guessing at a broken deep link. -->
		<NcButton v-if="gap.taxiProvider && gap.baseLat != null && gap.baseLon != null" @click="orderTaxi" class="pa-card--gap__taxi">
			{{ taxiLabel }}
		</NcButton>

		<!-- POI search near either end of the gap — parity with Android's
			GapCard, and the natural alternative when going home isn't
			worthwhile (or there's no home configured at all). -->
		<div v-if="gap.lat != null || gap.toLat != null" class="pa-card--gap__poi-row">
			<NcButton v-if="gap.lat != null && gap.lon != null" :disabled="poiLoading" @click="searchPoi(gap.lat, gap.lon)">
				Search POI near {{ gap.fromLabel }}
			</NcButton>
			<NcButton v-if="gap.toLat != null && gap.toLon != null" :disabled="poiLoading" @click="searchPoi(gap.toLat, gap.toLon)">
				Search POI near {{ gap.toLabel }}
			</NcButton>
		</div>
		<!-- Open-ended search (Ramin, 2026-09-10: "vrij tekstveld zodat de
			gebruiker een poi kan 'open/ruim' zoeken: 'makamba
			Doetinchem'") — not tied to either end of the gap, for a
			specific named place wherever it actually is. -->
		<div class="pa-card--gap__poi-row">
			<NcTextField
				:model-value="poiQuery"
				label="Search for a place (e.g. &quot;cafe name city&quot;)"
				class="pa-card--gap__poi-search"
				@update:model-value="(v) => (poiQuery = v)"
				@keydown.enter="runFreeTextPoiSearch"
			/>
			<NcButton :disabled="poiLoading || !poiQuery.trim()" @click="runFreeTextPoiSearch">{{ t('Search') }}</NcButton>
		</div>
		<NcLoadingIcon v-if="poiLoading" :size="20" />
		<!-- Collapsible (Ramin, 2026-09-10: "zet de poi zoekresultaten in een
			collapsable 'ding'... krijg ze niet meer uit beeld" / growing
			whitespace below the card as more results come back) — expands
			automatically right after a fresh search, collapsible afterward. -->
		<div v-if="pois" class="pa-card--gap__poi-list">
			<div class="pa-card--gap__poi-toggle" @click="poiExpanded = !poiExpanded">
				<span>{{ pois.length }} results</span>
				<MaterialIcoon naam="keyboardArrowUp" v-if="poiExpanded" :size="18" />
				<MaterialIcoon naam="keyboardArrowDown" v-else :size="18" />
			</div>
			<template v-if="poiExpanded">
				<PoiResultCard v-for="poi in pois" :key="`${poi.name}-${poi.lat}-${poi.lon}`" :poi="poi" />
			</template>
		</div>
	</div>
</template>

<script>
import MaterialIcoon from '../MaterialIcoon.vue'
import { t } from '../../l10n/index.js'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import PoiResultCard from './PoiResultCard.vue'
import { poiNearby, poiSearch } from '../../api/paApi.js'

export default {
	name: 'GapCard',
	components: { MaterialIcoon, NcButton, NcTextField, NcLoadingIcon, PoiResultCard },
	props: { gap: { type: Object, required: true } },
	data() {
		return {
			pois: null,
			poiLoading: false,
			poiQuery: '',
			poiExpanded: false,
		}
	},
	computed: {
		taxiLabel() {
			switch (this.gap.taxiProvider) {
			case 'bolt': return 'Open Bolt'
			case 'lyft': return 'Order Lyft'
			default: return 'Order Uber'
			}
		},
	},
	methods: {
		t(...args) {
			return t(...args)
		},
		orderTaxi() {
			const { taxiProvider, baseLat, baseLon, fromLabel } = this.gap
			let url
			if (taxiProvider === 'lyft') {
				url = `https://www.lyft.com/ride?id=lyft&destination[latitude]=${baseLat}&destination[longitude]=${baseLon}`
			} else if (taxiProvider === 'bolt') {
				url = 'https://bolt.eu/'
			} else {
				const params = new URLSearchParams({
					action: 'setPickup',
					'dropoff[latitude]': baseLat,
					'dropoff[longitude]': baseLon,
				})
				if (fromLabel) params.set('dropoff[nickname]', fromLabel)
				url = `https://m.uber.com/ul/?${params.toString()}`
			}
			window.open(url, '_blank', 'noopener,noreferrer')
		},
		async searchPoi(lat, lon) {
			this.poiLoading = true
			try {
				this.pois = await poiNearby(lat, lon)
				this.poiExpanded = true
			} catch (e) {
				this.pois = null
			} finally {
				this.poiLoading = false
			}
		},
		async runFreeTextPoiSearch() {
			const q = this.poiQuery.trim()
			if (!q) return
			this.poiLoading = true
			try {
				this.pois = await poiSearch(q)
				this.poiExpanded = true
			} catch (e) {
				this.pois = null
			} finally {
				this.poiLoading = false
			}
		},
	},
}
</script>

<style scoped>
.pa-card--gap {
	padding: 6px 16px;
	color: var(--color-text-maxcontrast);
	font-size: 0.85em;
	font-style: italic;
}
.pa-card--gap__breakdown {
	margin-top: 2px;
	font-style: normal;
	opacity: 0.85;
}
.pa-card--gap__warning {
	margin-top: 2px;
	font-style: normal;
	color: var(--color-error-text, #c9302c);
}
.pa-card--gap__taxi {
	display: block;
	margin-top: 6px;
}
.pa-card--gap__poi-row {
	display: flex;
	gap: 8px;
	margin-top: 6px;
	font-style: normal;
	align-items: flex-end;
}
.pa-card--gap__poi-search {
	flex: 1;
}
.pa-card--gap__poi-list {
	margin-top: 4px;
	font-style: normal;
}
.pa-card--gap__poi-toggle {
	display: flex;
	align-items: center;
	gap: 4px;
	cursor: pointer;
	font-weight: 600;
}
</style>
