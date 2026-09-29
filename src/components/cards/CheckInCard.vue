<template>
	<div class="pa-card pa-card--muted">
		🎫 💼 🛡 🪪 Check-in {{ formatTime(checkIn.start) }}–{{ formatTime(checkIn.end) }} at {{ checkIn.airportName }}
	</div>
</template>

<script>
import { currentLocale } from '../../l10n/index.js'
export default {
	name: 'CheckInCard',
	props: { checkIn: { type: Object, required: true } },
	methods: {
		formatTime(iso) {
			return new Date(iso).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' })
		},
	},
}
</script>

<style scoped>
.pa-card {
	border-radius: var(--border-radius-large);
	padding: 12px 16px;
	margin-bottom: 8px;
}
.pa-card--muted {
	background: var(--color-background-hover);
}
</style>
