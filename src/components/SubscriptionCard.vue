<template>
	<div class="pa-sub">
		<h3>{{ t('Subscription') }}</h3>
		<FoutMelding v-if="error" :error="error" />
		<p v-if="loading" class="pa-sub__sub">{{ t('Checking subscription status…') }}</p>
		<template v-else-if="status && status.subscribed">
			<div class="pa-sub__row">
				<span>{{ status.sandbox ? t('Your plan: %s (sandbox)', tierName(status.tier)) : t('Your plan: %s', tierName(status.tier)) }}<template v-if="status.currentPeriodEnd"> · {{ t('until %s', datum(status.currentPeriodEnd)) }}</template></span>
				<button type="button" class="pa-sub__btn" :disabled="busy" @click="portal">{{ t('Manage subscription') }}</button>
			</div>
		</template>
		<template v-else>
			<p class="pa-sub__sub">{{ t('No active subscription') }}</p>
			<!-- Abonneren doe je op de site: daar staan de plannen en de prijzen, en daar is de betaling
			     ingericht (Ramin, 27-09). Hier alleen wat je moet weten en de weg ernaartoe. -->
			<a class="pa-sub__btn pa-sub__btn--primary" :href="prijzenUrl" target="_blank" rel="noopener">{{ t('View plans and subscribe') }}</a>
		</template>
	</div>
</template>

<script>
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import { t, currentLocale } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import FoutMelding from './FoutMelding.vue'
import { getAccessCode } from '../api/accessCode.js'
import * as paApi from '../api/paApi.js'

/**
 * Het abonnement, zoals op de telefoon (2026-09-13): status, plan kiezen,
 * afrekenen via Stripe (kaart) of per factuur, en beheren via het portaal.
 * Alles via dezelfde server-endpoints; de USER-API-code is de identiteit.
 */
export default {
	name: 'SubscriptionCard',
	components: { FoutMelding, NcNoteCard },
	data() {
		return {
			loading: true, busy: false, error: null, status: null,
			/** Waar de plannen en de prijzen staan; betalen gebeurt daar, niet hier. */
			prijzenUrl: 'https://askanina.com/?p=pricing',
		}
	},
	async mounted() { await this.load() },
	watch: {
		/**
		 * Opnieuw kijken zodra de code verandert.
		 *
		 * Vulde je je USER-API-code in op ditzelfde scherm, dan bleef hier "Geen actief abonnement" staan
		 * terwijl je er wel een hebt -- de kaart had zijn antwoord al opgehaald voordat je de code had
		 * (Ramin, 27-09).
		 */
		code: { handler() { this.load() } },
	},
	computed: {
		code() { return getAccessCode() },
	},
	methods: {
		t(...args) { return t(...args) },
		tierName(tier) { return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : '' },
		datum(iso) { const d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleDateString(currentLocale()) },
		async load() {
			this.loading = true
			const code = getAccessCode()
			this.status = code ? await paApi.billingStatus(code) : null
			this.loading = false
		},
		async portal() {
			this.busy = true; this.error = null
			try {
				const r = await paApi.billingPortal(getAccessCode(), currentLocale(), window.location.href)
				if (r.portalUrl) window.open(r.portalUrl, '_blank', 'noopener')
			} catch (e) { this.error = foutTekst(e) } finally { this.busy = false }
		},
	},
}
</script>

<style scoped>
.pa-sub__row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin: 6px 0; }
.pa-sub__sub { font-size: 0.9em; color: var(--color-text-maxcontrast); }
.pa-sub__warn { font-size: 0.9em; color: var(--color-error); }
.pa-sub__tiers { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
.pa-sub__tier { flex: 1 1 220px; display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--color-border); border-radius: var(--border-radius-large); padding: 10px 12px; cursor: pointer; }
.pa-sub__tier--on { border-color: var(--color-primary-element); }
.pa-sub__tiername { font-weight: bold; }
.pa-sub__price { font-weight: normal; color: var(--color-text-maxcontrast); }
.pa-sub__btn { font: inherit; font-size: 0.9em; min-height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); cursor: pointer; }
.pa-sub__btn--primary { background: var(--color-primary-element); color: var(--color-primary-element-text); border-color: transparent; }
</style>
