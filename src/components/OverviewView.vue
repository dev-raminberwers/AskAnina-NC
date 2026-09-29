<template>
	<div class="pa-overview">
		<h2>{{ t('Overview') }}</h2>

		<FoutMelding v-if="error" :error="error" />
		<NcNoteCard v-else-if="!selectedCalendars.length && !loading" type="warning">
			{{ t('No calendars selected yet — pick one or more under Settings.') }}
		</NcNoteCard>

		<NcLoadingIcon v-if="loading" :size="32" />

		<template v-else>
			<div v-for="day in days" :key="day.date.toISOString()" class="pa-overview__day">
				<h3 class="pa-overview__day-heading" @click="$emit('day-click', day.date)">{{ dayLabel(day.date) }}</h3>
				<p v-if="!day.events.length" class="pa-overview__empty">{{ t('Nothing planned.') }}</p>
				<div v-for="event in day.events" :key="event.id" class="pa-overview__event" @click="$emit('day-click', day.date)">
					<MaterialIcoon v-if="iconFor(event)" :naam="iconFor(event)" :size="18" class="pa-overview__event-icon" />
					<div>
						<div>{{ event.title }}</div>
						<div class="pa-overview__event-time">{{ formatTime(event.start) }} – {{ formatTime(event.end) }}</div>
					</div>
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
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import { getSettings } from '../api/nextcloudUserData.js'
import { fetchCalendarData, gekozenKalenders } from '../api/nextcloudCalendar.js'
import { parseEventsForDay } from '../api/icsEvents.js'
import { volgSync } from '../api/sync.js'

// Same lightweight keyword flight-detection as DayPlanner::detectFlight() —
// not a real flight-card build, just an icon hint (mirrors OverviewScreen.kt).
const FLIGHT_KEYWORD_REGEX = /\b(vlucht|flight)\b/i

export default {
	name: 'OverviewView',
	components: { MaterialIcoon, FoutMelding, NcLoadingIcon, NcNoteCard },
	emits: ['day-click'],
	data() {
		return { stopKijken: null,
			loading: true,
			error: null,
			days: [],
			selectedCalendars: [],
			homeAddress: '',
			workAddress: '',
		}
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
		// Deliberately no travel/gap/buffer synthesis here (that's plan.php's
		// job for a single focused day, not a bird's-eye week view) — just
		// real calendar events with a lightweight home/work/flight icon,
		// same scope as Android's OverviewScreen.kt.
		async load() {
			this.loading = true
			this.error = null
			try {
				const settings = await getSettings()
				this.selectedCalendars = await gekozenKalenders(settings)
				this.homeAddress = settings.homeAddress || ''
				this.workAddress = settings.workAddress || ''
				if (!this.selectedCalendars.length) return

				const today = new Date()
				today.setHours(0, 0, 0, 0)
				const rangeEnd = new Date(today)
				rangeEnd.setDate(rangeEnd.getDate() + 7)
				const startUtc = toIcsUtc(today)
				const endUtc = toIcsUtc(rangeEnd)

				const blocksByCalendar = []
				for (const calendar of this.selectedCalendars) {
					const blocks = await fetchCalendarData(calendar, startUtc, endUtc)
					blocksByCalendar.push({ calendar, blocks })
				}

				const days = []
				for (let offset = 0; offset < 7; offset++) {
					const date = new Date(today)
					date.setDate(date.getDate() + offset)
					const events = []
					for (const { calendar, blocks } of blocksByCalendar) {
						for (const block of blocks) {
							events.push(...parseEventsForDay(block, date, calendar))
						}
					}
					events.sort((a, b) => new Date(a.start) - new Date(b.start))
					days.push({ date, events })
				}
				this.days = days
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.loading = false
			}
		},
		dayLabel(date) {
			return date.toLocaleDateString(currentLocale(), { weekday: 'long', day: 'numeric', month: 'long' })
		},
		formatTime(iso) {
			const d = new Date(iso)
			return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' })
		},
		// A flight always wins the icon; otherwise a loose text match against
		// the saved home/work address — same "good enough" tradeoff as Android.
		iconFor(event) {
			const text = `${event.title} ${event.description || ''}`
			if (FLIGHT_KEYWORD_REGEX.test(text)) return 'flight'
			if (event.homeOverride) return 'home'
			const location = event.location || ''
			if (location && this.homeAddress && location.toLowerCase().includes(this.homeAddress.toLowerCase())) return 'home'
			if (location && this.workAddress && location.toLowerCase().includes(this.workAddress.toLowerCase())) return 'work'
			return null
		},
	},
}

function toIcsUtc(date) {
	return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}
</script>

<style scoped>
.pa-overview__day {
	margin-bottom: 16px;
}
.pa-overview__day-heading {
	cursor: pointer;
	margin-bottom: 4px;
}
.pa-overview__empty {
	color: var(--color-text-maxcontrast);
	font-size: 0.9em;
}
.pa-overview__event {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 0;
	cursor: pointer;
}
.pa-overview__event-icon {
	flex-shrink: 0;
}
.pa-overview__event-time {
	color: var(--color-text-maxcontrast);
	font-size: 0.85em;
}
</style>
