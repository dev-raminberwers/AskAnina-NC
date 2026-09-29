<template>
	<div class="pa-card">
		<div class="pa-card__title">✈️ {{ routeLabel }}</div>
		<div v-if="flight.flightNumber" class="pa-card__meta">{{ flight.flightNumber }}</div>
		<div v-if="flight.actualDeparture" class="pa-card__meta">
			↗ {{ formatTime(flight.actualDeparture) }} · {{ flight.fromCode }}
			<span v-if="status?.depTerminal">· Terminal {{ status.depTerminal }}</span>
		</div>
		<div v-if="flight.actualArrival" class="pa-card__meta">
			↘ {{ formatTime(flight.actualArrival) }} · {{ flight.toCode }}
			<span v-if="status?.arrTerminal">· Terminal {{ status.arrTerminal }}</span>
		</div>
	</div>
</template>

<script>
import { currentLocale } from '../../l10n/index.js'
export default {
	name: 'FlightDetailsCard',
	props: {
		flight: { type: Object, required: true },
		status: { type: Object, default: null },
	},
	computed: {
		routeLabel() {
			const from = this.flight.fromAirportName || this.flight.fromCode
			const to = this.flight.toAirportName || this.flight.toCode
			return (from && to) ? `${from} → ${to}` : (this.flight.route || '')
		},
	},
	methods: {
		formatTime(iso) {
			return new Date(iso).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' })
		},
	},
}
</script>

<style scoped>
.pa-card {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large);
	padding: 12px 16px;
	margin-bottom: 8px;
}
.pa-card__title {
	font-weight: bold;
}
.pa-card__meta {
	font-size: 0.9em;
	color: var(--color-text-maxcontrast);
	margin-top: 4px;
}
</style>
