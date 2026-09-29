<template>
	<span class="material-design-icon pa-icoon" :aria-hidden="!titel" :aria-label="titel || undefined" :role="titel ? 'img' : undefined">
		<svg class="material-design-icon__svg" :width="size" :height="size" viewBox="0 0 24 24">
			<title v-if="titel">{{ titel }}</title>
			<path v-for="(p, i) in paden" :key="i" :d="p" fill="currentColor" />
		</svg>
	</span>
</template>

<script>
import { ICONEN } from '../vendor/materialIcons.js'

/**
 * Een icoon van de telefoon, hier getekend (Ramin, 24-09: *"gebruik de icons van android ook voor de
 * andere platformen"*).
 *
 * Staat met opzet in dezelfde jas als de iconen die hier al gebruikt werden: dezelfde klassenamen
 * (`material-design-icon`) en dezelfde `size`-eigenschap, zodat hij overal past waar een MDI-icoon paste
 * en de bestaande uitlijning in het menu blijft kloppen.
 *
 * De kleur komt van de tekst eromheen (`currentColor`), dus een actief menu-item kleurt het icoon mee --
 * net als op de telefoon.
 *
 * Kent het icoon niet? Dan tekent hij niets in plaats van een kruisje of een blokje. Een ontbrekend icoon
 * mag geen rommel in het menu zetten.
 */
export default {
	name: 'MaterialIcoon',
	props: {
		/** De naam zoals in vendor/materialIcons.js, bv. 'shoppingCart'. */
		naam: { type: String, required: true },
		/** Zelfde eigenschap als de MDI-iconen hier gebruikten. */
		size: { type: [Number, String], default: 24 },
		/** Alleen invullen als het icoon op zichzelf iets betekent; naast een label hoort het stil te zijn. */
		titel: { type: String, default: '' },
	},
	computed: {
		paden() { return ICONEN[this.naam] || [] },
	},
}
</script>

<style scoped>
.pa-icoon { display: inline-flex; align-items: center; justify-content: center; }
.pa-icoon svg { display: block; }
</style>
