<template>
	<div class="pa-card pa-card--muted">
		<div v-if="window.start && window.end">
			Bags expected {{ formatTime(window.start) }}–{{ formatTime(window.end) }} at {{ window.airportName }}
		</div>
		<div v-if="window.baggage" class="pa-card__title">🧳 Belt {{ window.baggage }}</div>
	</div>
</template>

<script>
import { currentLocale } from '../../l10n/index.js'
export default {
	name: 'CheckOutCard',
	props: { window: { type: Object, required: true } },
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
.pa-card__title {
	font-weight: bold;
	margin-top: 4px;
}
</style>
