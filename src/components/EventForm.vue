<template>
	<div class="pa-eventform">
		<h3>{{ event ? t('Edit appointment') : t('New appointment') }}</h3>
		<FoutMelding v-if="recurring" type="warning" :error="t('This is a repeating appointment. Change it from the day view or in your calendar app.')" />
		<NcTextField id="pa-event-title" :model-value="form.title" :label="t('Title')" @update:model-value="(v) => (form.title = v)" />
		<div v-if="!event && calendars.length > 1" class="pa-eventform__chips">
			<button v-for="c in calendars" :key="c.href" type="button" class="pa-eventform__chip" :class="{ 'pa-eventform__chip--active': calendar && calendar.href === c.href }" @click="calendar = c">{{ c.displayName }}</button>
		</div>
		<div class="pa-eventform__row">
			<label for="pa-event-start-date">{{ t('Start') }}</label>
			<input id="pa-event-start-date" v-model="form.startDate" type="date" @change="eindVolgt">
			<input id="pa-event-start-time" v-model="form.startTime" type="time" @change="eindVolgt">
		</div>
		<div class="pa-eventform__row">
			<label for="pa-event-end-date">{{ t('End') }}</label>
			<input id="pa-event-end-date" v-model="form.endDate" type="date">
			<input id="pa-event-end-time" v-model="form.endTime" type="time">
		</div>
		<NcTextField id="pa-event-location" :model-value="form.location" :label="t('Location')" @update:model-value="(v) => (form.location = v)" />
		<NcTextField id="pa-event-description" :model-value="form.description" :label="t('Description')" @update:model-value="(v) => (form.description = v)" />
		<div v-if="!event" class="pa-eventform__row">
			<label for="pa-event-recurrence">{{ t('Repeat') }}</label>
			<select id="pa-event-recurrence" v-model="form.recurrence">
				<option value="NONE">{{ t('Never') }}</option>
				<option value="DAILY">{{ t('Every day') }}</option>
				<option value="WEEKLY">{{ t('Every week') }}</option>
				<option value="BIWEEKLY">{{ t('Every two weeks') }}</option>
				<option value="MONTHLY">{{ t('Every month, same date') }}</option>
				<option value="MONTHLY_NTH">{{ t('Every month, same weekday') }}</option>
				<option value="YEARLY">{{ t('Every year') }}</option>
			</select>
			<input v-if="form.recurrence !== 'NONE'" id="pa-event-recurrence-until" v-model="form.recurrenceUntil" type="date" :title="t('Until (optional)')">
		</div>
		<FoutMelding v-if="error" :error="error" />
		<div class="pa-eventform__actions">
			<NcButton type="primary" :disabled="busy || recurring || !form.title.trim()" @click="save">{{ t('Save') }}</NcButton>
			<NcButton v-if="event" type="error" :disabled="busy" @click="vraagWeg = true">{{ t('Delete') }}</NcButton>
			<template v-if="vraagWeg && recurring">
				<span>{{ t('This is part of a series. Delete only this time, or every time?') }}</span>
				<NcButton type="error" :disabled="busy" @click="remove('once')">{{ t('Only this time') }}</NcButton>
				<NcButton type="error" :disabled="busy" @click="remove('all')">{{ t('Every time') }}</NcButton>
				<NcButton :disabled="busy" @click="vraagWeg = false">{{ t('No') }}</NcButton>
			</template>
			<template v-else-if="vraagWeg">
				<span>{{ t('Delete this appointment?') }}</span>
				<NcButton type="error" :disabled="busy" @click="remove('all')">{{ t('Yes') }}</NcButton>
				<NcButton :disabled="busy" @click="vraagWeg = false">{{ t('No') }}</NcButton>
			</template>
			<NcButton @click="$emit('cancel')">{{ t('Cancel') }}</NcButton>
		</div>
	</div>
</template>

<script>
import NcButton from '@nextcloud/vue/components/NcButton'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import FoutMelding from './FoutMelding.vue'
import { t } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import { createEvent, updateEvent, deleteEvent } from '../api/nextcloudCalendar.js'

function twee(n) { return String(n).padStart(2, '0') }
function datumDeel(d) { return d.getFullYear() + '-' + twee(d.getMonth() + 1) + '-' + twee(d.getDate()) }
function tijdDeel(d) { return twee(d.getHours()) + ':' + twee(d.getMinutes()) }

/**
 * Eén afspraakformulier voor de week- en maandweergave (Ramin, 2026-09-14):
 * nieuw op een gekozen moment, of een bestaande bewerken/verwijderen. Het
 * dagscherm houdt zijn eigen, rijkere formulier (met reisvoorbeeld).
 */
export default {
	name: 'EventForm',
	components: { NcButton, NcTextField, FoutMelding },
	props: {
		calendars: { type: Array, default: () => [] },
		/** Bestaande afspraak (uit parseEventsForDay), of null voor nieuw. */
		event: { type: Object, default: null },
		/** Voorgesteld begin voor een nieuwe afspraak. */
		start: { type: Date, default: null },
	},
	emits: ['saved', 'cancel'],
	data() {
		const begin = this.event ? new Date(this.event.start) : (this.start || new Date())
		const eind = this.event ? new Date(this.event.end) : new Date(begin.getTime() + 60 * 60 * 1000)
		return {
			busy: false,
			error: null,
			vraagWeg: false,
			calendar: this.event ? (this.calendars.find((c) => c.href === this.event.calendarUri) || this.calendars[0] || null) : (this.calendars[0] || null),
			form: {
				title: this.event ? (this.event.title || '') : '',
				startDate: datumDeel(begin), startTime: tijdDeel(begin),
				endDate: datumDeel(eind), endTime: tijdDeel(eind),
				location: this.event ? (this.event.location || '') : '',
				description: this.event ? (this.event.description || '') : '',
				recurrence: 'NONE', recurrenceUntil: '',
			},
		}
	},
	computed: {
		recurring() { return !!(this.event && this.event.recurring) },
	},
	methods: {
		t(...args) { return t(...args) },
		eindVolgt() {
			// Einde schuift mee: een uur na het begin, als het einde niet meer klopt.
			const s = new Date(this.form.startDate + 'T' + this.form.startTime)
			const e = new Date(this.form.endDate + 'T' + this.form.endTime)
			if (!(e > s)) {
				const nieuw = new Date(s.getTime() + 60 * 60 * 1000)
				this.form.endDate = datumDeel(nieuw)
				this.form.endTime = tijdDeel(nieuw)
			}
		},
		async save() {
			const start = new Date(this.form.startDate + 'T' + this.form.startTime)
			const end = new Date(this.form.endDate + 'T' + this.form.endTime)
			if (!(end > start)) { this.error = t('The end must be after the start.'); return }
			if (!this.calendar) { this.error = t('No calendars selected yet — pick one or more under Settings.'); return }
			this.busy = true
			this.error = null
			try {
				const velden = { title: this.form.title.trim(), start, end, location: this.form.location.trim() || null, description: this.form.description.trim() || null }
				if (this.event) {
					await updateEvent(this.calendar, this.event.id, velden)
				} else {
					await createEvent(this.calendar, { ...velden, recurrence: this.form.recurrence, recurrenceUntil: this.form.recurrenceUntil || null })
				}
				this.$emit('saved')
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.busy = false
			}
		},
		async remove(bereik) {
			this.busy = true
			try {
				// Eén keer uit een reeks (Ramin, 21-09: "deze of allemaal"): het id draagt de dag, de start is die keer.
				const alleenDezeKeer = bereik === 'once' && String(this.event.id).includes('@')
				await deleteEvent(this.calendar, this.event.id, alleenDezeKeer ? { occurrence: true, start: this.event.start } : {})
				this.$emit('saved')
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.busy = false
			}
		},
	},
}
</script>

<style scoped>
.pa-eventform { border: 1px solid var(--color-border, #ccc); border-radius: var(--border-radius-large, 8px); padding: 12px 14px; margin: 8px 0 12px; background: var(--color-main-background, #fff); display: flex; flex-direction: column; gap: 8px; }
.pa-eventform h3 { margin: 0; }
.pa-eventform__row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.pa-eventform__row label { min-width: 60px; }
.pa-eventform__chips { display: flex; gap: 6px; flex-wrap: wrap; }
.pa-eventform__chip { border: 1px solid var(--color-border, #ccc); background: transparent; border-radius: 16px; padding: 3px 10px; cursor: pointer; }
.pa-eventform__chip--active { background: var(--color-primary-element, #1e3a5f); color: var(--color-primary-element-text, #fff); border-color: transparent; }
.pa-eventform__actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
</style>
