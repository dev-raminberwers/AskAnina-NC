<template>
	<div class="pa-card-form">
		<!-- Hoe het echt ging (kaart 220). Hier en niet op de tijdlijn, en pas als de afspraak voorbij is:
		     een begin zonder eind zegt alleen dat je bezig bent, en dat zie je al aan de kaart (Ramin, 27-09). -->
		<div v-if="echteMomenten" class="pa-echt">
			<div class="pa-echt__kop">{{ t('How it actually went') }}</div>
			<div class="feiten">
				<span v-for="m in echteMomenten" :key="m.l"><span class="l">{{ m.l }}</span> <span class="v">{{ m.v }}</span></span>
			</div>
		</div>
		<template v-if="cardType === 'afspraak'">
			<p>{{ t('Attended?') }}</p>
			<div class="pa-card-form__chips">
				<button type="button" :class="{ active: form.attended === true }" @click="form.attended = true">{{ t('Yes') }}</button>
				<button type="button" :class="{ active: form.attended === false }" @click="form.attended = false">{{ t('No') }}</button>
			</div>
			<NcTextField v-if="form.attended === true" :model-value="form.note" :label="t('Note')" @update:model-value="(v) => (form.note = v)" />
			<template v-if="form.attended === false">
				<NcTextField :model-value="form.reason" :label="t('Reason')" @update:model-value="(v) => (form.reason = v)" />
				<div class="pa-card-form__chips">
					<button type="button" :class="{ active: form.cancelled }" @click="form.cancelled = true; wantsReschedule = false">{{ t('Cancelled') }}</button>
					<button type="button" :class="{ active: wantsReschedule }" @click="wantsReschedule = true; form.cancelled = false">{{ t('Reschedule') }}</button>
				</div>
				<input v-if="wantsReschedule" type="datetime-local" v-model="form.newDateTime" class="pa-card-form__datetime">
			</template>
		</template>

		<template v-else-if="cardType === 'herinnering'">
			<p>{{ t('Handled?') }}</p>
			<div class="pa-card-form__chips">
				<button type="button" :class="{ active: form.handled === true }" @click="form.handled = true">{{ t('Yes') }}</button>
				<button type="button" :class="{ active: form.handled === false }" @click="form.handled = false">{{ t('No') }}</button>
			</div>
			<template v-if="form.handled === false">
				<NcButton @click="wantsReschedule = true">{{ t('Reschedule') }}</NcButton>
				<input v-if="wantsReschedule" type="datetime-local" v-model="form.newDateTime" class="pa-card-form__datetime">
			</template>
		</template>

		<template v-else-if="cardType === 'taak'">
			<p>{{ t('Done?') }}</p>
			<div class="pa-card-form__chips">
				<button type="button" :class="{ active: form.done === true }" @click="form.done = true">{{ t('Yes') }}</button>
				<button type="button" :class="{ active: form.done === false }" @click="form.done = false">{{ t('No') }}</button>
			</div>
			<NcTextField v-if="form.done === true" :model-value="form.result" :label="t('Result')" @update:model-value="(v) => (form.result = v)" />
			<template v-if="form.done === false">
				<NcTextField :model-value="form.progress" :label="t('Progress')" @update:model-value="(v) => (form.progress = v)" />
				<NcButton @click="wantsReschedule = true">{{ t('Reschedule') }}</NcButton>
				<input v-if="wantsReschedule" type="datetime-local" v-model="form.newDateTime" class="pa-card-form__datetime">
			</template>
		</template>

		<template v-else-if="cardType === 'bellen'">
			<p>{{ t('Called?') }}</p>
			<div class="pa-card-form__chips">
				<button type="button" :class="{ active: form.gebeld === true }" @click="form.gebeld = true">{{ t('Yes') }}</button>
				<button type="button" :class="{ active: form.gebeld === false }" @click="form.gebeld = false">{{ t('No') }}</button>
			</div>
			<template v-if="form.gebeld === false">
				<div class="pa-card-form__chips">
					<NcButton @click="save">{{ t('Keep as is') }}</NcButton>
					<NcButton @click="wantsReschedule = true">{{ t('Call again') }}</NcButton>
				</div>
				<input v-if="wantsReschedule" type="datetime-local" v-model="form.vervolgDatumTijd" class="pa-card-form__datetime">
			</template>
			<template v-if="form.gebeld === true">
				<NcTextField :model-value="form.gesprokenMet" :label="t('Spoke with')" @update:model-value="(v) => (form.gesprokenMet = v)" />
				<NcTextField :model-value="form.besproken" :label="t('Discussed')" @update:model-value="(v) => (form.besproken = v)" />
				<NcTextField :model-value="form.afspraken" :label="t('Agreements')" @update:model-value="(v) => (form.afspraken = v)" />
				<p>{{ t('Follow-up') }}</p>
				<div class="pa-card-form__chips">
					<button type="button" :class="{ active: form.vervolg === 'teruggebeld' }" @click="form.vervolg = 'teruggebeld'">{{ t('They call back') }}</button>
					<button type="button" :class="{ active: form.vervolg === 'terugbellen' }" @click="form.vervolg = 'terugbellen'">{{ t('I call back') }}</button>
				</div>
				<input v-if="form.vervolg === 'teruggebeld'" type="datetime-local" v-model="form.vervolgDatumTijd" class="pa-card-form__datetime">
				<template v-if="form.vervolg === 'terugbellen'">
					<NcTextField :model-value="form.nieuweNaam" :label="t('New name')" @update:model-value="(v) => (form.nieuweNaam = v)" />
					<NcTextField :model-value="form.nieuwNummer" :label="t('New number')" @update:model-value="(v) => (form.nieuwNummer = v)" />
					<input type="datetime-local" v-model="form.vervolgDatumTijd" class="pa-card-form__datetime">
				</template>
			</template>
		</template>

		<template v-else-if="cardType === 'emailen'">
			<p>{{ t('Sent?') }}</p>
			<div class="pa-card-form__chips">
				<button type="button" :class="{ active: form.sent === true }" @click="form.sent = true">{{ t('Yes') }}</button>
				<button type="button" :class="{ active: form.sent === false }" @click="form.sent = false">{{ t('No') }}</button>
			</div>
			<template v-if="form.sent === true">
				<NcTextField :model-value="form.sentTo" :label="t('Sent to')" @update:model-value="(v) => (form.sentTo = v)" />
				<NcTextField :model-value="form.subject" :label="t('Subject')" @update:model-value="(v) => (form.subject = v)" />
			</template>
			<template v-if="form.sent === false">
				<NcButton @click="wantsReschedule = true">{{ t('Reschedule') }}</NcButton>
				<input v-if="wantsReschedule" type="datetime-local" v-model="form.newDateTime" class="pa-card-form__datetime">
			</template>
		</template>

		<template v-else-if="cardType === 'lunch'">
			<p>{{ t('Attended?') }}</p>
			<div class="pa-card-form__chips">
				<button type="button" :class="{ active: form.attended === true }" @click="form.attended = true">{{ t('Yes') }}</button>
				<button type="button" :class="{ active: form.attended === false }" @click="form.attended = false">{{ t('No') }}</button>
			</div>
			<template v-if="form.attended === true">
				<NcTextField :model-value="form.withWhom" :label="t('With whom')" @update:model-value="(v) => (form.withWhom = v)" />
				<NcTextField :model-value="form.location" :label="t('Location')" @update:model-value="(v) => (form.location = v)" />
			</template>
			<template v-if="form.attended === false">
				<div class="pa-card-form__chips">
					<button type="button" :class="{ active: form.cancelled }" @click="form.cancelled = true; wantsReschedule = false">{{ t('Cancelled') }}</button>
					<button type="button" :class="{ active: wantsReschedule }" @click="wantsReschedule = true; form.cancelled = false">{{ t('Reschedule') }}</button>
				</div>
				<input v-if="wantsReschedule" type="datetime-local" v-model="form.newDateTime" class="pa-card-form__datetime">
			</template>
		</template>

		<template v-else-if="cardType === 'dinner'">
			<p>{{ t('Attended?') }}</p>
			<div class="pa-card-form__chips">
				<button type="button" :class="{ active: form.attended === true }" @click="form.attended = true">{{ t('Yes') }}</button>
				<button type="button" :class="{ active: form.attended === false }" @click="form.attended = false">{{ t('No') }}</button>
			</div>
			<template v-if="form.attended === true">
				<NcTextField :model-value="form.withWhom" :label="t('With whom')" @update:model-value="(v) => (form.withWhom = v)" />
				<NcTextField :model-value="form.restaurant" :label="t('Restaurant')" @update:model-value="(v) => (form.restaurant = v)" />
				<label class="pa-card-form__time-label">{{ t('Reservation time') }}
					<input type="time" v-model="form.reservationTime" class="pa-card-form__datetime">
				</label>
			</template>
			<template v-if="form.attended === false">
				<div class="pa-card-form__chips">
					<button type="button" :class="{ active: form.cancelled }" @click="form.cancelled = true; wantsReschedule = false">{{ t('Cancelled') }}</button>
					<button type="button" :class="{ active: wantsReschedule }" @click="wantsReschedule = true; form.cancelled = false">{{ t('Reschedule') }}</button>
				</div>
				<input v-if="wantsReschedule" type="datetime-local" v-model="form.newDateTime" class="pa-card-form__datetime">
			</template>
		</template>

		<template v-else-if="cardType === 'festiviteit'">
			<p>{{ t('Attended?') }}</p>
			<div class="pa-card-form__chips">
				<button type="button" :class="{ active: form.attended === true }" @click="form.attended = true">{{ t('Yes') }}</button>
				<button type="button" :class="{ active: form.attended === false }" @click="form.attended = false">{{ t('No') }}</button>
			</div>
			<template v-if="form.attended === true">
				<NcTextField :model-value="form.withWhom" :label="t('With whom')" @update:model-value="(v) => (form.withWhom = v)" />
				<p>{{ t('Brought a gift?') }}</p>
				<div class="pa-card-form__chips">
					<button type="button" :class="{ active: form.broughtGift === true }" @click="form.broughtGift = true">{{ t('Yes') }}</button>
					<button type="button" :class="{ active: form.broughtGift === false }" @click="form.broughtGift = false">{{ t('No') }}</button>
				</div>
				<NcTextField :model-value="form.highlight" :label="t('Highlight')" @update:model-value="(v) => (form.highlight = v)" />
			</template>
			<template v-if="form.attended === false">
				<div class="pa-card-form__chips">
					<button type="button" :class="{ active: form.cancelled }" @click="form.cancelled = true; wantsReschedule = false">{{ t('Cancelled') }}</button>
					<button type="button" :class="{ active: wantsReschedule }" @click="wantsReschedule = true; form.cancelled = false">{{ t('Reschedule') }}</button>
				</div>
				<input v-if="wantsReschedule" type="datetime-local" v-model="form.newDateTime" class="pa-card-form__datetime">
			</template>
		</template>

		<template v-else-if="cardType === 'focus_tijd'">
			<p>{{ t('Completed?') }}</p>
			<div class="pa-card-form__chips">
				<button type="button" :class="{ active: form.completed === true }" @click="form.completed = true">{{ t('Yes') }}</button>
				<button type="button" :class="{ active: form.completed === false }" @click="form.completed = false">{{ t('No') }}</button>
			</div>
			<NcTextField :model-value="form.workedOn" :label="t('Worked on')" @update:model-value="(v) => (form.workedOn = v)" />
			<NcTextField v-if="form.completed === true" :model-value="form.progress" :label="t('Progress')" @update:model-value="(v) => (form.progress = v)" />
			<template v-if="form.completed === false">
				<NcTextField :model-value="form.interruptedBy" :label="t('Interrupted by')" @update:model-value="(v) => (form.interruptedBy = v)" />
				<NcButton @click="wantsReschedule = true">{{ t('Reschedule') }}</NcButton>
				<input v-if="wantsReschedule" type="datetime-local" v-model="form.newDateTime" class="pa-card-form__datetime">
			</template>
		</template>

		<!-- vlucht/reistijd already have their own dedicated cards on Today — no outcome form, same as Android. -->

		<p v-if="saved" class="pa-card-form__saved">{{ t('Saved.') }}</p>
	</div>
</template>

<script>
import { t } from '../l10n/index.js'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import { loadCardState, saveCardState } from '../api/cardStateRepo.js'
import { echteMomentenVan, echtAfgerond } from './cards/regelTekst.js'

/**
 * JS port of the 9 bespoke card-outcome forms (Afspraak/Herinnering/Taak/
 * Bellen/Emailen/Lunch/Dinner/Festiviteit/FocusTijd — architecture spec #6,
 * "niet generiek, specifiek per card") — one file instead of 9 (Vue single-
 * file components carry more per-file overhead than Kotlin @Composables
 * for forms this small), but the exact same fields, same conditional
 * visibility and same JSON keys as each Kotlin form, so behavior matches
 * 1:1. Persisted via [cardStateRepo.js], same pa_links "card_state" scheme
 * as Android — self-contained under this app's own API-code partition,
 * not shared with Android's saved outcomes (see
 * project_pa_nextcloud_app_and_api_codes memory).
 */
export default {
	name: 'CardDetailForm',
	components: { NcButton, NcTextField },
	props: {
		cardType: { type: String, required: true },
		eventUid: { type: String, required: true },
		/** Wat er werkelijk gebeurde, op regel-id (kaart 220). */
		werkelijk: { type: Object, default: () => ({}) },
		/** De regel waar dit detail bij hoort; nodig om heen- en terugrit uit elkaar te houden. */
		regel: { type: Object, default: null },
	},
	data() {
		return {
			wantsReschedule: false,
			saving: false,
			saved: false,
			ready: false,
			form: {
				attended: null,
				note: '',
				reason: '',
				cancelled: false,
				handled: null,
				done: null,
				result: '',
				progress: '',
				gebeld: null,
				gesprokenMet: '',
				besproken: '',
				afspraken: '',
				vervolg: null,
				vervolgDatumTijd: '',
				nieuweNaam: '',
				nieuwNummer: '',
				sent: null,
				sentTo: '',
				subject: '',
				withWhom: '',
				location: '',
				restaurant: '',
				reservationTime: '',
				broughtGift: null,
				highlight: '',
				completed: null,
				workedOn: '',
				interruptedBy: '',
				newDateTime: '',
			},
		}
	},
	async mounted() {
		const existing = await loadCardState(this.eventUid).catch(() => null)
		if (existing) {
			Object.assign(this.form, existing)
		}
		await this.$nextTick()
		this.ready = true
	},
	beforeUnmount() {
		clearTimeout(this._saveTimer)
	},
	// Auto-save, no button (Ramin, 2026-09-10: "geen save buttons... bij een
	// verandering wordt de waarde direct opgeslagen") — same debounced
	// pattern as the Kotlin forms; `ready` guards against the initial
	// Object.assign() hydration in mounted() firing a spurious save.
	watch: {
		form: {
			deep: true,
			handler() {
				if (!this.ready) return
				this.saved = false
				clearTimeout(this._saveTimer)
				this._saveTimer = setTimeout(() => { this.save() }, 400)
			},
		},
	},
	computed: {
		/**
		 * De gemeten momenten, maar alleen als de afspraak AF is -- er moet een eindtijd zijn.
		 * Ramin, 27-09: *"het moet pas staan op het moment dat de afspraak is afgelopen"*.
		 */
		echteMomenten() {
			if (!this.regel) return null
			// Geen eindtijd = nog niet afgelopen = nog niets te vertellen.
			if (!echtAfgerond(this.werkelijk || {}, this.regel)) return null
			return echteMomentenVan(this.werkelijk || {}, this.regel)
		},
	},
	methods: {
		t(...args) {
			return t(...args)
		},
		async save() {
			this.saving = true
			try {
				await saveCardState(this.eventUid, this.buildMetadata())
				this.saved = true
			} finally {
				this.saving = false
			}
		},
		// Mirrors each Kotlin form's own buildJsonObject exactly — only the
		// keys that type actually puts, in the same conditional shape
		// (nullable booleans use `?.let`, i.e. omitted entirely while null).
		buildMetadata() {
			const f = this.form
			const put = (obj, key, value) => {
				if (value !== null && value !== undefined) obj[key] = value
			}
			const metadata = { formType: this.cardType }
			switch (this.cardType) {
			case 'afspraak':
				put(metadata, 'attended', f.attended)
				metadata.note = f.note
				metadata.reason = f.reason
				metadata.cancelled = f.cancelled
				metadata.newDateTime = f.newDateTime
				break
			case 'herinnering':
				put(metadata, 'handled', f.handled)
				metadata.newDateTime = f.newDateTime
				break
			case 'taak':
				put(metadata, 'done', f.done)
				metadata.result = f.result
				metadata.progress = f.progress
				metadata.newDateTime = f.newDateTime
				break
			case 'bellen':
				put(metadata, 'gebeld', f.gebeld)
				metadata.gesprokenMet = f.gesprokenMet
				metadata.besproken = f.besproken
				metadata.afspraken = f.afspraken
				put(metadata, 'vervolg', f.vervolg)
				metadata.vervolgDatumTijd = f.vervolgDatumTijd
				metadata.nieuweNaam = f.nieuweNaam
				metadata.nieuwNummer = f.nieuwNummer
				break
			case 'emailen':
				put(metadata, 'sent', f.sent)
				metadata.sentTo = f.sentTo
				metadata.subject = f.subject
				metadata.newDateTime = f.newDateTime
				break
			case 'lunch':
				put(metadata, 'attended', f.attended)
				metadata.withWhom = f.withWhom
				metadata.location = f.location
				metadata.cancelled = f.cancelled
				metadata.newDateTime = f.newDateTime
				break
			case 'dinner':
				put(metadata, 'attended', f.attended)
				metadata.withWhom = f.withWhom
				metadata.restaurant = f.restaurant
				metadata.reservationTime = f.reservationTime
				metadata.cancelled = f.cancelled
				metadata.newDateTime = f.newDateTime
				break
			case 'festiviteit':
				put(metadata, 'attended', f.attended)
				metadata.withWhom = f.withWhom
				put(metadata, 'broughtGift', f.broughtGift)
				metadata.highlight = f.highlight
				metadata.cancelled = f.cancelled
				metadata.newDateTime = f.newDateTime
				break
			case 'focus_tijd':
				put(metadata, 'completed', f.completed)
				metadata.workedOn = f.workedOn
				metadata.progress = f.progress
				metadata.interruptedBy = f.interruptedBy
				metadata.newDateTime = f.newDateTime
				break
			}
			return metadata
		},
	},
}
</script>

<style scoped>
.pa-card-form {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-top: 8px;
}
.pa-card-form__chips {
	display: flex;
	gap: 8px;
}
.pa-card-form__chips button, .pa-card-form :deep(button.native) {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-pill, 16px);
	background: var(--color-background-hover);
	padding: 4px 12px;
	cursor: pointer;
	font-size: 0.85em;
}
.pa-card-form__chips button.active {
	background: var(--color-primary-element);
	color: var(--color-primary-element-text);
	border-color: var(--color-primary-element);
}
.pa-card-form__datetime {
	padding: 6px 8px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius);
	background: var(--color-main-background);
	color: var(--color-main-text);
}
.pa-card-form__time-label {
	display: flex;
	flex-direction: column;
	gap: 4px;
	font-size: 0.9em;
}
.pa-card-form__save {
	align-self: flex-start;
	margin-top: 4px;
}
.pa-card-form__saved {
	color: var(--color-success-text, green);
	font-size: 0.85em;
}
</style>
