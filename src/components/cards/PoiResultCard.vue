<template>
	<div class="pa-poi-card" @click="navigate">
		<div class="pa-poi-card__info">
			<div class="pa-poi-card__name">{{ poi.name }}</div>
			<div v-if="line2" class="pa-poi-card__line2">{{ line2 }}</div>
		</div>
		<a v-if="poi.phone" :href="`tel:${poi.phone}`" class="pa-poi-card__icon" :title="poi.phone" @click.stop>
			<MaterialIcoon naam="call" :size="20" />
		</a>
		<a v-if="poi.website" :href="websiteHref" target="_blank" rel="noopener noreferrer" class="pa-poi-card__icon" :title="t('Website')" @click.stop>
			<MaterialIcoon naam="language" :size="20" />
		</a>
		<MaterialIcoon :naam="categoryIcon" :size="20" :titel="poi.type" class="pa-poi-card__category" />
	</div>
</template>

<script>
import MaterialIcoon from '../MaterialIcoon.vue'
import { t } from '../../l10n/index.js'

/**
 * One uniform POI result layout (Ramin, 2026-09-10, refined same day:
 * "filled color card met witte letters (contrasterend)... naam/adres/
 * telefoon links, bel-icon, categorie-icon rechts") — mirrors Android's
 * PoiResultCard composable exactly. Filled accent card using Nextcloud's own
 * `--color-primary-element` / `--color-primary-element-text` tokens, which
 * the theme itself already guarantees sufficient contrast for in both light
 * and dark — no hardcoded white. Tapping the card body opens directions;
 * the phone/website icons are their own links with `.stop` so they don't
 * also trigger that navigation.
 */
export default {
	name: 'PoiResultCard',
	components: { MaterialIcoon },
	props: { poi: { type: Object, required: true } },
	computed: {
		line2() {
			return [this.poi.address, this.poi.phone].filter(Boolean).join(' · ')
		},
		websiteHref() {
			const site = this.poi.website || ''
			return site.startsWith('http') ? site : `https://${site}`
		},
		categoryIcon() {
			switch ((this.poi.type || '').toLowerCase()) {
			case 'restaurant':
			case 'fast_food':
				return 'restaurant'
			case 'cafe':
				return 'localCafe'
			case 'bar':
			case 'pub':
				return 'localBar'
			case 'hotel':
			case 'guest_house':
			case 'hostel':
			case 'motel':
			case 'apartment':
				return 'hotel'
			case 'station':
				return 'train'
			case '':
				return 'place'
			default:
				return 'store'
			}
		},
	},
	methods: {
		t(...args) {
			return t(...args)
		},
		navigate() {
			window.open(`https://www.openstreetmap.org/directions?to=${this.poi.lat}%2C${this.poi.lon}`, '_blank', 'noopener,noreferrer')
		},
	},
}
</script>

<style scoped>
.pa-poi-card {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	margin-top: 4px;
	border-radius: var(--border-radius-large);
	background: var(--color-primary-element);
	color: var(--color-primary-element-text);
	font-style: normal;
	cursor: pointer;
}
.pa-poi-card__info {
	min-width: 0;
	flex: 1;
}
.pa-poi-card__name {
	font-weight: 600;
}
.pa-poi-card__line2 {
	font-size: 0.9em;
	opacity: 0.85;
}
.pa-poi-card__icon {
	display: flex;
	align-items: center;
	justify-content: center;
	color: inherit;
	flex-shrink: 0;
}
.pa-poi-card__category {
	flex-shrink: 0;
	opacity: 0.9;
}
</style>
