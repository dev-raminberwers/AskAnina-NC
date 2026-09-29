<template>
	<div class="pa-work" :class="{ 'pa-work--busy': bezig }">
		<div class="pa-work__header">
			<MaterialIcoon :naam="thuiswerken ? 'home' : 'business'" :size="18" class="pa-work__icon" />
			<div class="pa-work__title">{{ thuiswerken ? t('Working from home') : t('At the office') }}</div>
			<span v-if="bezig" class="pa-work__now">{{ t('Busy now') }}</span>
		</div>

		<div class="pa-work__time">
			<span class="pa-work__big">{{ formatTime(item.event.start) }}</span>
			<span class="pa-work__until">{{ t('Until %s', formatTime(item.event.end)) }}</span>
		</div>
		<div v-if="waar" class="pa-work__meta">{{ t('Where') }} · {{ waar }}</div>

		<div v-if="children.length" class="pa-work__list">
			<div class="pa-work__listhead">{{ t('%d appointments inside your working hours', children.length) }}</div>
			<div v-for="kind in children" :key="kind.event.id" class="pa-work__row" :class="{ 'pa-work__row--done': isDone(kind) }">
				<span class="pa-work__rowtime">{{ formatTime(kind.event.start) }}</span>
				<div class="pa-work__rowbody">
					<div class="pa-work__rowtitle">{{ kind.event.title }}</div>
					<div v-if="onderregel(kind)" class="pa-work__rowsub">{{ onderregel(kind) }}</div>
					<div class="pa-work__rowbtns">
						<button v-if="!isDone(kind)" type="button" class="pa-work__btn pa-work__btn--primary" @click="$emit('toggle-busy', kind.event.id)">
							{{ isBusy(kind) ? t('Busy now') : t('Start now') }}
						</button>
						<button type="button" class="pa-work__btn" :class="{ 'pa-work__btn--on': isDone(kind) }" @click="$emit('toggle-done', kind.event.id)">
							{{ isDone(kind) ? '✓ ' : '' }}{{ t('Done') }}
						</button>
					</div>
				</div>
			</div>
		</div>

		<div class="pa-work__actions">
			<button type="button" class="pa-work__btn pa-work__btn--primary" @click="$emit('toggle-done', item.event.id)">{{ t('Done for today') }}</button>
			<button type="button" class="pa-work__btn" @click="$emit('toggle-home')">
				{{ thuiswerken ? t('Go to the office after all') : t('Work from home today') }}
			</button>
		</div>
	</div>
</template>

<script>
import MaterialIcoon from '../MaterialIcoon.vue'
import { t, currentLocale } from '../../l10n/index.js'

/**
 * Je werkdag als één kaart, met je afspraken erin — dezelfde kaart als
 * WerkKaart in de Android-app (Ramin, 2026-09-12: "Ik zou de Op kantoor en
 * Weg van kantoor integreren tot 1 kaart"). Elke afspraak erbinnen houdt
 * zijn eigen knoppen.
 */
export default {
	name: 'WorkCard',
	components: { MaterialIcoon },
	props: {
		item: { type: Object, required: true },
		children: { type: Array, default: () => [] },
		itemStatus: { type: Object, default: () => ({}) },
		thuiswerken: { type: Boolean, default: false },
	},
	emits: ['toggle-done', 'toggle-busy', 'toggle-home'],
	data() {
		return { 'home' }
	},
	computed: {
		waar() {
			const naam = this.item.resolvedLocation?.display_name || this.item.event.location || ''
			return naam.split(',')[0].trim()
		},
		bezig() {
			const nu = Date.now()
			const s = new Date(this.item.event.start).getTime(); const e = new Date(this.item.event.end).getTime()
			return nu >= s && nu < e
		},
	},
	methods: {
		t(...args) { return t(...args) },
		formatTime(iso) {
			return new Date(iso).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' })
		},
		isDone(kind) { return !!this.itemStatus[kind.event.id]?.doneAt },
		isBusy(kind) { return !!this.itemStatus[kind.event.id]?.busySince },
		onderregel(kind) {
			const delen = []
			if (kind.travel?.departureTime) delen.push(t('Leave at %s', this.formatTime(kind.travel.departureTime)))
			const plek = (kind.resolvedLocation?.display_name || kind.event.location || '').split(',')[0].trim()
			if (plek) delen.push(plek)
			return delen.join(' · ')
		},
	},
}
</script>

<style scoped>
.pa-work {
	border: 1px solid var(--color-primary-element);
	border-radius: var(--border-radius-large);
	padding: 12px 16px;
	margin-bottom: 8px;
}
.pa-work--busy { box-shadow: 0 0 0 1px var(--color-success); border-color: var(--color-success); }
.pa-work__header { display: flex; align-items: center; gap: 8px; }
.pa-work__icon { color: var(--color-text-maxcontrast); }
.pa-work__title { font-weight: bold; flex: 1; }
.pa-work__now { font-size: 0.75em; text-transform: uppercase; letter-spacing: .06em; color: var(--color-success); }
.pa-work__time { display: flex; align-items: baseline; gap: 10px; margin-top: 6px; }
.pa-work__big { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.9em; font-weight: 500; letter-spacing: -.02em; }
.pa-work__until, .pa-work__meta { color: var(--color-text-maxcontrast); font-size: 0.9em; }
.pa-work__list { border-top: 1px solid var(--color-border); margin-top: 10px; padding-top: 6px; }
.pa-work__listhead { font-size: 0.75em; text-transform: uppercase; letter-spacing: .06em; color: var(--color-text-maxcontrast); margin-bottom: 4px; }
.pa-work__row { display: flex; gap: 10px; padding: 6px 0; }
.pa-work__row--done .pa-work__rowtitle { text-decoration: line-through; color: var(--color-text-maxcontrast); }
.pa-work__rowtime { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; min-width: 48px; }
.pa-work__rowbody { flex: 1; }
.pa-work__rowsub { font-size: 0.85em; color: var(--color-text-maxcontrast); }
.pa-work__rowbtns { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.pa-work__actions { display: flex; gap: 6px; flex-wrap: wrap; border-top: 1px solid var(--color-border); margin-top: 10px; padding-top: 8px; }
.pa-work__btn {
	font: inherit; font-size: 0.85em; min-height: 32px; padding: 0 12px; border-radius: 8px;
	border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); cursor: pointer;
}
.pa-work__btn--primary { background: var(--color-primary-element); color: var(--color-primary-element-text); border-color: transparent; }
.pa-work__btn--on { background: var(--color-primary-element-light); }
</style>
