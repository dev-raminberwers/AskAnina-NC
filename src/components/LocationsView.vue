<template>
	<div class="pa-locations">
		<h2>{{ t('Locations') }}</h2>

		<FoutMelding v-if="error" :error="error" />
		<NcLoadingIcon v-if="loading" :size="32" />

		<template v-else>
				<div v-if="hasHome" class="pa-locations__fixed">
					<MaterialIcoon naam="home" :size="20" />
					<div>
						<div class="pa-locations__fixed-label">{{ t('Home') }}</div>
						<div class="pa-locations__fixed-address">{{ homeAddress }}</div>
					</div>
				</div>
				<div v-if="hasWork" class="pa-locations__fixed">
					<MaterialIcoon naam="work" :size="20" />
					<div>
						<div class="pa-locations__fixed-label">{{ t('Work') }}</div>
						<div class="pa-locations__fixed-address">{{ workAddress }}</div>
					</div>
				</div>

				<p v-if="!locations.length && !hasHome && !hasWork" class="pa-locations__empty">
					{{ t('No locations yet — add one below.') }}
				</p>

				<div v-for="location in locations" :key="location.id" class="pa-locations__row">
					<MaterialIcoon naam="place" :size="20" />
					<div class="pa-locations__row-body">
						<div>{{ location.name }}</div>
						<div v-if="location.display_name" class="pa-locations__row-sub">{{ location.display_name }}</div>
						<div v-if="location.category" class="pa-locations__row-sub">{{ location.category }}</div>
					</div>
					<button type="button" class="pa-locations__remove" :title="t('Remove')" @click="remove(location)">
						<MaterialIcoon naam="close" :size="18" />
					</button>
				</div>

				<NcButton v-if="!showAdd" @click="showAdd = true">
					<template #icon>
						<MaterialIcoon naam="add" :size="20" />
					</template>
					{{ t('Add location') }}
				</NcButton>

				<div v-else class="pa-locations__add">
					<NcTextField :model-value="form.name" :label="t('Name')" @update:model-value="(v) => (form.name = v)" />
					<NcTextField :model-value="form.address"
						:label="t('Location')"
						@update:model-value="(v) => { form.address = v; resolved = null; poiResults = null; poiNoResults = false }" />
					<NcTextField :model-value="form.nearQuery"
						:label="t('Place (optional)')"
						:placeholder="t('e.g. Utrecht — search near a different place than your current one')"
						@update:model-value="(v) => (form.nearQuery = v)" />

					<div class="pa-locations__add-actions">
						<NcButton :disabled="!form.address || searching" @click="searchAddress">{{ t('Search address') }}</NcButton>
						<NcButton :disabled="!form.address || searching" @click="searchNearby">{{ t('Search nearby') }}</NcButton>
					</div>

					<NcNoteCard v-if="searchError" type="error">{{ searchError }}</NcNoteCard>
					<p v-if="poiNoResults" class="pa-locations__row-sub">No matches for "{{ form.address }}".</p>
					<p v-if="resolved" class="pa-locations__row-sub">Resolved: {{ resolved.display_name }}</p>

					<div v-for="(poi, index) in poiResults || []" :key="index" class="pa-locations__poi" @click="pickPoi(poi)">
						<div>{{ poi.name }}</div>
						<div v-if="poi.address" class="pa-locations__row-sub">{{ poi.address }}</div>
					</div>

					<p class="pa-locations__category-label">{{ t('Category') }}</p>
					<div class="pa-locations__chips">
						<button v-for="preset in categoryPresets" :key="preset" type="button"
							class="pa-locations__chip" :class="{ 'pa-locations__chip--active': form.category === preset }"
							@click="form.category = form.category === preset ? '' : preset">{{ preset }}</button>
					</div>
					<NcTextField :model-value="form.category" :label="t('Custom category')" @update:model-value="(v) => (form.category = v)" />

					<div class="pa-locations__add-actions">
						<NcButton type="primary" :disabled="!form.name || !resolved || saving" @click="save">{{ t('Save') }}</NcButton>
						<NcButton @click="cancelAdd">{{ t('Cancel') }}</NcButton>
					</div>
				</div>
		</template>
	</div>
</template>

<script>
import MaterialIcoon from './MaterialIcoon.vue'
import { t } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import FoutMelding from './FoutMelding.vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import { geocode, poiNearby } from '../api/paApi.js'
import { getSettings, listLocations, createLocation, deleteLocation } from '../api/nextcloudUserData.js'
import { volgSync } from '../api/sync.js'

const CATEGORY_PRESETS = ['Supermarkt', 'Tankstation', 'Apotheek', 'Sportschool']

/**
 * NC-app port of LocationsScreen.kt's "mark-a-location" flow (architecture
 * spec #8) — MINUS geofence monitoring: that's a background-service concept
 * with no browser equivalent, and even if it were toggled here it would
 * never reach the phone anyway (locations live in THIS Nextcloud's own
 * WebDAV storage now, see nextcloudUserData.js — a separate file/account
 * from whatever Android has, Nextcloud-connection or Account-mode either
 * way), so the field is simply not offered rather than shown non-functional.
 *
 * No NcModal for the add-form (unlike Android's AlertDialog) — an inline
 * expanding section instead, same reasoning as SettingsView.vue's plain
 * checkboxes: this codebase avoids leaning on an under-verified NC-vue
 * component contract when a plain, unambiguous alternative works just as
 * well (bitten twice already by NcCheckboxRadioSwitch's modelValue
 * contract, see project memory).
 */
export default {
	name: 'LocationsView',
	components: { MaterialIcoon, FoutMelding, NcButton, NcTextField, NcLoadingIcon, NcNoteCard },
	data() {
		return { stopKijken: null,
			loading: true,
			saving: false,
			searching: false,
			error: null,
			searchError: null,
			locations: [],
			homeAddress: '',
			workAddress: '',
			homeLat: null,
			homeLon: null,
			showAdd: false,
			form: { name: '', address: '', nearQuery: '', category: '' },
			resolved: null,
			poiResults: null,
			poiNoResults: false,
			categoryPresets: CATEGORY_PRESETS,
		}
	},
	computed: {
		hasHome() {
			return !!this.homeAddress
		},
		hasWork() {
			return !!this.workAddress
		},
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
	},
	async mounted() {
		// Meeluisteren met je andere apparaten (Ramin, 24-09): verandert dit elders, dan staat
		// het hier meteen goed in plaats van pas als je het scherm opnieuw opent.
		this.stopKijken = volgSync(() => this.load())
		await this.load()
	},
	methods: {
		t(...args) {
			return t(...args)
		},
		async load() {
			this.loading = true
			this.error = null
			try {
				const [settings, locations] = await Promise.all([
					getSettings(),
					listLocations(),
				])
				this.homeAddress = settings.homeAddress || ''
				this.workAddress = settings.workAddress || ''
				this.homeLat = settings.homeLat ?? null
				this.homeLon = settings.homeLon ?? null
				this.locations = locations
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.loading = false
			}
		},
		cancelAdd() {
			this.showAdd = false
			this.form = { name: '', address: '', nearQuery: '', category: '' }
			this.resolved = null
			this.poiResults = null
			this.poiNoResults = false
			this.searchError = null
		},
		async searchAddress() {
			this.searching = true
			this.searchError = null
			this.poiResults = null
			this.poiNoResults = false
			try {
				const found = await geocode(this.form.address)
				this.resolved = found
				this.form.address = found.display_name
			} catch (e) {
				this.searchError = foutTekst(e)
			} finally {
				this.searching = false
			}
		},
		// "Place (optional)" wins over the browser's own geolocation entirely
		// when filled in — search near Utrecht while sitting in Doetinchem
		// (Ramin, 2026-09-09), not near wherever this tab happens to be.
		async searchNearby() {
			this.searching = true
			this.searchError = null
			this.resolved = null
			this.poiNoResults = false
			try {
				let lat
				let lon
				if (this.form.nearQuery.trim()) {
					const geocoded = await geocode(this.form.nearQuery)
					lat = geocoded.lat
					lon = geocoded.lon
				} else {
					const current = await currentBrowserLocation().catch(() => null)
					lat = current?.lat ?? this.homeLat
					lon = current?.lon ?? this.homeLon
				}
				if (lat == null || lon == null) {
					this.searchError = 'No location available — set a home address or fill in "Place".'
					return
				}
				const found = await poiNearby(lat, lon, { category: 'shop', radius: 15000, nameFilter: this.form.address })
				this.poiResults = found
				this.poiNoResults = found.length === 0
			} catch (e) {
				this.searchError = foutTekst(e)
			} finally {
				this.searching = false
			}
		},
		pickPoi(poi) {
			const label = [poi.name, poi.address].filter(Boolean).join(', ')
			this.resolved = { lat: poi.lat, lon: poi.lon, display_name: label }
			this.form.address = label
			this.poiResults = null
		},
		async save() {
			if (!this.form.name || !this.resolved) return
			this.saving = true
			try {
				await createLocation({
					name: this.form.name,
					lat: this.resolved.lat,
					lon: this.resolved.lon,
					display_name: this.resolved.display_name,
					category: this.form.category || null,
				})
				this.cancelAdd()
				await this.load()
			} catch (e) {
				this.searchError = foutTekst(e)
			} finally {
				this.saving = false
			}
		},
		async remove(location) {
			try {
				await deleteLocation(location.id)
				await this.load()
			} catch (e) {
				this.error = foutTekst(e)
			}
		},
	},
}

function currentBrowserLocation() {
	return new Promise((resolve, reject) => {
		if (!navigator.geolocation) {
			reject(new Error('Geolocation not available'))
			return
		}
		navigator.geolocation.getCurrentPosition(
			(pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
			(err) => reject(err),
			{ timeout: 8000 },
		)
	})
}
</script>

<style scoped>
.pa-locations__fixed, .pa-locations__row {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 0;
	border-bottom: 1px solid var(--color-border);
}
.pa-locations__fixed-label {
	font-weight: 600;
}
.pa-locations__fixed-address, .pa-locations__row-sub {
	color: var(--color-text-maxcontrast);
	font-size: 0.85em;
}
.pa-locations__row-body {
	flex: 1;
}
.pa-locations__remove {
	background: none;
	border: none;
	cursor: pointer;
	color: var(--color-text-maxcontrast);
}
.pa-locations__empty {
	color: var(--color-text-maxcontrast);
}
.pa-locations__add {
	margin-top: 16px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius);
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.pa-locations__add-actions {
	display: flex;
	gap: 8px;
}
.pa-locations__poi {
	padding: 6px 0;
	cursor: pointer;
	border-bottom: 1px solid var(--color-border);
}
.pa-locations__category-label {
	margin: 4px 0 0;
	font-weight: 600;
	font-size: 0.9em;
}
.pa-locations__chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.pa-locations__chip {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-pill, 16px);
	background: var(--color-background-hover);
	padding: 4px 12px;
	cursor: pointer;
	font-size: 0.85em;
}
.pa-locations__chip--active {
	background: var(--color-primary-element);
	color: var(--color-primary-element-text);
	border-color: var(--color-primary-element);
}
</style>
