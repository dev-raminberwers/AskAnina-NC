<template>
	<li class="pa-nav__item" :class="{ 'pa-nav__item--active': active, 'pa-nav__item--sleep': sleept, 'pa-nav__item--doel': doel }"
		:draggable="draggable" @dragstart="$emit('sleep-start')" @dragover.prevent="$emit('sleep-over')"
		@drop.prevent="$emit('sleep-drop')" @dragend="$emit('sleep-eind')">
		<a href="#" @click.prevent="$emit('click')">
			<span class="pa-nav__icon"><slot name="icon" /></span>
			<span class="pa-nav__name">{{ name }}</span>
			<!-- Hoeveel er nog op je wacht (Ramin, 24-09). Alleen tonen als het er zijn; een badge met 0
			     is geen informatie maar ruis. -->
			<span v-if="telling > 0" class="pa-nav__badge">{{ telling > 99 ? '99+' : telling }}</span>
		</a>
	</li>
</template>
<script>
export default {
	name: 'NcAppNavigationItem',
	props: {
		name: { type: String, default: '' },
		active: { type: Boolean, default: false },
		/** Ongelezen of nog te beluisteren; 0 = geen badge. */
		telling: { type: Number, default: 0 },
		/** Mag dit item versleept worden om de volgorde te wijzigen (Ramin, 24-09)? */
		draggable: { type: Boolean, default: false },
		sleept: { type: Boolean, default: false },
		doel: { type: Boolean, default: false },
	},
	emits: ['click', 'sleep-start', 'sleep-over', 'sleep-drop', 'sleep-eind'],
}
</script>
<style>
.pa-nav__item a { display: flex; align-items: center; gap: 7px; padding: 1px 8px; border-radius: 5px; color: inherit; text-decoration: none; line-height: 1.5; font-size: 0.86em; }
.pa-nav__item a:hover { background: var(--color-background-hover); }
.pa-nav__item--active a { background: var(--color-primary-element-light); font-weight: bold; }
/* Slepen: wat je vasthoudt vervaagt, en waar het terechtkomt krijgt een streep. */
.pa-nav__item--sleep { opacity: 0.45; }
.pa-nav__item--doel a { box-shadow: inset 0 2px 0 var(--color-primary-element); }
.pa-nav__item[draggable='true'] a { cursor: grab; }
.pa-nav__item[draggable='true'] a:active { cursor: grabbing; }
.pa-nav__icon { display: inline-flex; width: 17px; }
.pa-nav__icon svg { width: 17px; height: 17px; }
.pa-nav__badge { margin-left: auto; min-width: 17px; padding: 0 5px; border-radius: 999px; background: var(--color-primary-element); color: var(--color-primary-element-text, #fff); font-size: 0.75em; font-weight: bold; line-height: 16px; text-align: center; font-variant-numeric: tabular-nums; }
@media (max-width: 720px) { .pa-nav__name { font-size: 0.85em; } }
</style>
