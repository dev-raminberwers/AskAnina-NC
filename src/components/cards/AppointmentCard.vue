<template>
	<div class="pa-card" :style="{ borderLeftColor: event.calendarColor || 'var(--color-primary-element)' }" @click="$emit('click')">
		<div class="pa-card__header">
			<MaterialIcoon :naam="cardIcon" :size="18" class="pa-card__icon" />
			<div class="pa-card__title">{{ event.title }}</div>
			<!-- Op elke kaart dezelfde plek, rechtsboven: Klaar, prullenbak (Ramin, 2026-09-15). -->
			<span class="pa-card__kopknoppen" @click.stop>
				<button type="button" class="pa-card__btn pa-card__btn--klein" :class="{ 'pa-card__btn--on': done }" @click="$emit('toggle-done')">
					{{ done ? '✓ ' : '' }}{{ t('Done') }}
				</button>
				<template v-if="deletable">
					<span v-if="vraagWeg" class="pa-card__vraag">
						{{ t('Delete this appointment?') }}
						<button type="button" class="pa-card__btn pa-card__btn--klein pa-card__btn--weg" @click="vraagWeg = false; $emit('delete')">{{ t('Yes') }}</button>
						<button type="button" class="pa-card__btn pa-card__btn--klein" @click="vraagWeg = false">{{ t('No') }}</button>
					</span>
					<button v-else type="button" class="pa-card__btn pa-card__btn--klein pa-card__btn--stil pa-card__btn--weg" :title="t('Delete')" @click="vraagWeg = true"><svg class="pa-prullenbak" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
				</template>
			</span>
		</div>
		<div class="pa-card__time">{{ formatTime(event.start) }} – {{ formatTime(event.end) }}</div>
		<div v-if="location" class="pa-card__meta">{{ location }}</div>
		<!-- Dezelfde knoppen als op de telefoon: klaar, en nu beginnen. De
		     status gaat naar het versleutelde bestand in je Nextcloud, zodat
		     de telefoon hem ook ziet (Ramin, 2026-09-13). -->
		<div v-if="!done && cardType !== 'gesprek'" class="pa-card__actions" @click.stop>
			<!-- Een gelogd gesprek is al gebeurd: daar begin je niet aan (Ramin, 2026-09-13). -->
			<button type="button" class="pa-card__btn pa-card__btn--klein" :class="{ 'pa-card__btn--busy': busy }" @click="$emit('toggle-busy')">
				{{ busy ? t('Busy now') : t('Start now') }}
			</button>
		</div>
	</div>
</template>

<script>
import MaterialIcoon from '../MaterialIcoon.vue'
import { t, currentLocale } from '../../l10n/index.js'

// Same server-detected classification as Android's CardType.kt — icon-only
// here (the NC-app doesn't need the enum's other Compose-specific plumbing).
const CARD_ICONS = {
	afspraak: 'event',
	herinnering: 'notifications',
	taak: 'taskAlt',
	bellen: 'call',
	gesprek: 'phoneCallback',
	emailen: 'email',
	lunch: 'localCafe',
	dinner: 'restaurantMenu',
	festiviteit: 'celebration',
	focus_tijd: 'selfImprovement',
	studie: 'school',
	reistijd: 'directionsCar',
	vlucht: 'flight',
}

export default {
	name: 'AppointmentCard',
	components: { MaterialIcoon },
	props: {
		event: { type: Object, required: true },
		resolvedLocation: { type: Object, default: null },
		cardType: { type: String, default: 'afspraak' },
		deletable: { type: Boolean, default: false },
		// Keyword/gym-address detected (Ramin, 2026-09-10) — not its own
		// cardType, just an icon override on top of whatever this already is.
		isSport: { type: Boolean, default: false },
		done: { type: Boolean, default: false },
		busy: { type: Boolean, default: false },
	},
	emits: ['click', 'toggle-done', 'toggle-busy', 'delete'],
	data() {
		return { vraagWeg: false }
	},
	computed: {
		location() {
			return this.resolvedLocation?.display_name || this.event.location
		},
		cardIcon() {
			if (this.isSport) return 'fitnessCenter'
			return CARD_ICONS[this.cardType] || 'event'
		},
	},
	methods: {
		formatTime(iso) {
			return new Date(iso).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' })
		},
		t(text) {
			return t(text)
		},
	},
}
</script>

<style scoped>
.pa-card {
	border: 1px solid var(--color-border);
	border-left-width: 4px;
	border-radius: var(--border-radius-large);
	padding: 12px 16px;
	margin-bottom: 8px;
	cursor: pointer;
}
.pa-card__header {
	display: flex;
	align-items: center;
	gap: 8px;
}
.pa-card__icon {
	flex-shrink: 0;
	color: var(--color-text-maxcontrast);
}
.pa-card__title {
	font-weight: bold;
}
.pa-card__time {
	color: var(--color-text-maxcontrast);
	font-size: 0.9em;
}
.pa-card__meta {
	font-size: 0.85em;
	color: var(--color-text-maxcontrast);
	margin-top: 4px;
}
.pa-card__kopknoppen { margin-left: auto; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.pa-card__btn--klein { padding-top: 3px; padding-bottom: 3px; line-height: 1.3; }
.pa-card__actions {
	display: flex;
	gap: 6px;
	margin-top: 10px;
	padding-top: 8px;
	border-top: 1px solid var(--color-border);
}
.pa-card__btn {
	font: inherit;
	font-size: 0.85em;
	min-height: 32px;
	padding: 0 12px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	background: var(--color-main-background);
	color: var(--color-main-text);
	cursor: pointer;
}
.pa-card__btn--on {
	background: var(--color-primary-element);
	color: var(--color-primary-element-text);
	border-color: transparent;
}
.pa-card__vraag { display: inline-flex; align-items: center; gap: 6px; font-size: 0.85em; }
.pa-card__btn--weg { color: #c0392b; }
.pa-card__btn--stil { margin-left: auto; opacity: .7; }
/* Prullenbak: rood, zonder rand, op elke kaartsoort (Ramin, 2026-09-15, kaart 65). */
.pa-card__btn--weg { border: none !important; background: none !important; color: #d64541 !important; opacity: 1; padding-left: 6px; padding-right: 6px; }
.pa-card__btn--weg:hover { color: #b3231f !important; }
.pa-prullenbak { display: block; }
.pa-card__btn--busy {
	border-color: var(--color-success);
	color: var(--color-success);
}
</style>
