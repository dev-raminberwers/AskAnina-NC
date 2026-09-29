<template>
	<div class="pa-cont" :class="{ 'pa-cont--busy': bezig }">
		<div class="pa-cont__header">
			<MaterialIcoon naam="dateRange" :size="18" class="pa-cont__icon" />
			<div class="pa-cont__title">{{ item.event.title }}</div>
			<span class="pa-cont__kopknoppen" @click.stop>
				<button type="button" class="pa-cont__btn pa-cont__btn--klein" :class="{ 'pa-cont__btn--on': isDone(item) }" @click="$emit('toggle-done', item.event.id)">
					{{ isDone(item) ? '✓ ' : '' }}{{ t('Done') }}
				</button>
			</span>
		</div>
		<div class="pa-cont__range">{{ bereik }}</div>
		<div v-if="waar" class="pa-cont__meta">{{ t('Where') }} · {{ waar }}</div>

		<div v-if="children.length" class="pa-cont__list">
			<div class="pa-cont__listhead">{{ t('%d appointments during this', children.filter((k) => k.event).length) }}</div>
			<template v-for="kind in children" :key="sleutel(kind)">
			<!-- Reisstap (kaart 53): de rit naar de afspraak, of een losse rit (terug naar huis). -->
			<div v-if="kind.travel" class="pa-cont__row pa-cont__row--reis">
				<span class="pa-cont__rowtime">{{ formatTime(vertrekEcht(kind.travel)) }}</span>
				<div class="pa-cont__rowbody">
					<div class="pa-cont__rowtitle">{{ reisIcoon(kind.travel) }} {{ t('%s min travel', Math.round(kind.travel.duration_min || 0)) }}</div>
					<div class="pa-cont__rowsub">{{ kind.travel.fromLabel }} → {{ kind.travel.toLabel }}<template v-if="kind.travel.arrivalTime"> · {{ t('Arrival') }} {{ formatTime(kind.travel.arrivalTime) }}</template><template v-if="kind.travel.departureBufferMinutes > 0"> · {{ t('Get ready from') }} {{ formatTime(kind.travel.departureTime) }}</template></div>
				</div>
			</div>
			<div v-if="kind.event" class="pa-cont__row" :class="{ 'pa-cont__row--done': isDone(kind) }">
				<span class="pa-cont__rowtime">{{ formatTime(kind.event.start) }}</span>
				<div class="pa-cont__rowbody">
					<div class="pa-cont__rowtitle">{{ kind.event.title }}</div>
					<div v-if="onderregel(kind)" class="pa-cont__rowsub">{{ onderregel(kind) }}</div>
					<div class="pa-cont__rowbtns">
						<button v-if="!isDone(kind)" type="button" class="pa-cont__btn pa-cont__btn--primary" @click="$emit('toggle-busy', kind.event.id)">
							{{ isBusy(kind) ? t('Busy now') : t('Start now') }}
						</button>
						<button type="button" class="pa-cont__btn" :class="{ 'pa-cont__btn--on': isDone(kind) }" @click="$emit('toggle-done', kind.event.id)">
							{{ isDone(kind) ? '✓ ' : '' }}{{ t('Done') }}
						</button>
					</div>
				</div>
			</div>
			</template>
		</div>
	</div>
</template>

<script>
import MaterialIcoon from '../MaterialIcoon.vue'
import { t, currentLocale } from '../../l10n/index.js'

/**
 * Een container-afspraak (kaart 53, Ramin, 2026-09-15): een weekend weg,
 * vakantie, familiedag, "dochter hier" — een dunne kaart bovenaan met de
 * afspraken die erbinnen vallen eronder, zoals de werkdag-kaart. De server
 * bepaalt wat een container is (isContainer / containerId), de kaart tekent.
 */
export default {
	name: 'ContainerCard',
	components: { MaterialIcoon },
	props: {
		item: { type: Object, required: true },
		children: { type: Array, default: () => [] },
		itemStatus: { type: Object, default: () => ({}) },
	},
	emits: ['toggle-done', 'toggle-busy'],
	computed: {
		bezig() {
			const nu = Date.now()
			return new Date(this.item.event.start).getTime() <= nu && nu < new Date(this.item.event.end).getTime()
		},
		waar() {
			return (this.item.resolvedLocation && this.item.resolvedLocation.display_name) || this.item.event.location || ''
		},
		bereik() {
			const s = new Date(this.item.event.start)
			const e = new Date(this.item.event.end)
			const dag = (d) => d.toLocaleDateString(currentLocale(), { weekday: 'short', day: 'numeric', month: 'short' })
			if (s.toDateString() === e.toDateString()) return dag(s) + ' · ' + this.formatTime(this.item.event.start) + ' – ' + this.formatTime(this.item.event.end)
			// Een einde om middernacht is de vorige avond.
			const laatste = (e.getHours() === 0 && e.getMinutes() === 0) ? new Date(e.getTime() - 60000) : e
			return t('From %s to %s', dag(s), dag(laatste))
		},
	},
	methods: {
		t(...args) { return t(...args) },
		formatTime(iso) { return new Date(iso).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }) },
		isDone(kind) { return !!(kind.event && this.itemStatus[kind.event.id] && this.itemStatus[kind.event.id].doneAt) },
		isBusy(kind) { return !!(kind.event && this.itemStatus[kind.event.id] && this.itemStatus[kind.event.id].busySince) },
		onderregel(kind) {
			return (kind.resolvedLocation && kind.resolvedLocation.display_name) || kind.event.location || ''
		},
		sleutel(kind) { return kind.event ? kind.event.id : 'reis:' + (kind.travel && kind.travel.departureTime) },
		reisIcoon(travel) { return travel.isFlightLeg ? '✈️' : (travel.isTrainLeg ? '🚆' : '🚗') },
		vertrekEcht(travel) { return new Date(new Date(travel.departureTime).getTime() + Number(travel.departureBufferMinutes || 0) * 60000).toISOString() },
	},
}
</script>

<style scoped>
.pa-cont { border: 1px solid var(--color-border, #ddd); border-left: 4px solid #7b3f8c; border-radius: var(--border-radius-large, 8px); padding: 10px 14px; margin-bottom: 8px; background: var(--color-main-background, #fff); }
.pa-cont--busy { box-shadow: 0 0 0 2px #2e8b57 inset; }
.pa-cont__header { display: flex; align-items: center; gap: 8px; }
.pa-cont__row--reis { opacity: .85; }
.pa-cont__title { font-weight: bold; flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.pa-cont__kopknoppen { margin-left: auto; display: flex; gap: 6px; }
.pa-cont__range { font-size: 0.9em; color: var(--color-text-maxcontrast, #666); margin-top: 2px; }
.pa-cont__meta { font-size: 0.9em; color: var(--color-text-maxcontrast, #666); }
.pa-cont__list { margin-top: 8px; border-top: 1px solid var(--color-border, #eee); padding-top: 6px; }
.pa-cont__listhead { font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-maxcontrast, #666); margin-bottom: 4px; }
.pa-cont__row { display: flex; gap: 10px; padding: 4px 0; }
.pa-cont__row--done { opacity: 0.55; }
.pa-cont__rowtime { font-family: ui-monospace, monospace; flex: 0 0 3.2em; }
.pa-cont__rowbody { flex: 1; min-width: 0; }
.pa-cont__rowtitle { font-weight: 600; }
.pa-cont__rowsub { font-size: 0.85em; color: var(--color-text-maxcontrast, #666); }
.pa-cont__rowbtns { display: flex; gap: 6px; margin-top: 4px; }
.pa-cont__btn { padding: 3px 10px; border-radius: 999px; border: 1px solid var(--color-border-dark, #bbb); background: none; color: inherit; font: inherit; cursor: pointer; line-height: 1.3; }
.pa-cont__btn--primary { background: var(--color-primary-element, #1e3a5f); color: var(--color-primary-element-text, #fff); border-color: transparent; }
.pa-cont__btn--on { background: #2e8b57; color: #fff; border-color: transparent; }
.pa-cont__btn--klein { font-size: 0.9em; }
</style>
