<template>
	<div class="pa-support">
		<p class="pa-support__status">{{ chatAan ? t('We are online: you usually get an answer within minutes.') : (offlineTekst || t('Chat is offline right now; we answer by e-mail.')) }}</p>
		<div ref="lijst" class="pa-support__lijst">
			<NcLoadingIcon v-if="laden" />
			<p v-else-if="!berichten.length" class="pa-support__leeg">{{ t('Ask us anything, or tell us what you miss.') }}</p>
			<div v-for="m in berichten" :key="m.id" class="pa-support__bubbel" :class="'pa-support__bubbel--' + m.sender">
				<div>{{ m.text }}</div>
				<small>{{ String(m.created_at).slice(0, 16).replace('T', ' ') }}</small>
			</div>
		</div>
		<FoutMelding v-if="error" :error="error" />
		<form class="pa-support__form" @submit.prevent="verstuur">
			<NcTextField :model-value="tekst" :label="t('Your message')" @update:model-value="(v) => tekst = v" />
			<NcButton type="primary" native-type="submit" :disabled="bezig || !tekst.trim()">{{ t('Send') }}</NcButton>
		</form>
	</div>
</template>

<script>
import * as paApi from '../api/paApi.js'
import { getAccessCode } from '../api/accessCode.js'
import { t } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import FoutMelding from './FoutMelding.vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import { WEB } from '../mode.js'
import { volgSync } from '../api/sync.js'

/** Hulp (kaart 119): één gesprek met ons, als chat; offline = antwoord per mail. */
export default {
	name: 'SupportView',
	components: { FoutMelding, NcButton, NcTextField, NcLoadingIcon },
	data() {
		return { stopKijken: null, berichten: [], chatAan: false, offlineTekst: '', laden: true, tekst: '', bezig: false, error: null, timer: null }
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
	},
	mounted() {
		// Meeluisteren met je andere apparaten (Ramin, 24-09): verandert dit elders, dan staat
		// het hier meteen goed in plaats van pas als je het scherm opnieuw opent.
		this.stopKijken = volgSync(() => this.laad())
		this.laad()
		this.timer = setInterval(() => this.laad(true), 20000)
	},
	beforeUnmount() { if (this.timer) clearInterval(this.timer) },
	methods: {
		t(...a) { return t(...a) },
		async laad(stil) {
			try {
				const uit = await paApi.supportMessages(getAccessCode())
				this.berichten = uit.messages || []
				this.chatAan = !!uit.chatAvailable
				this.offlineTekst = uit.offlineText || ''
				this.error = null
				this.$nextTick(() => { const l = this.$refs.lijst; if (l) l.scrollTop = l.scrollHeight })
			} catch (e) {
				if (!stil) this.error = foutTekst(e)
			}
			this.laden = false
		},
		async verstuur() {
			if (!this.tekst.trim() || this.bezig) return
			this.bezig = true
			try {
				await paApi.supportSend(getAccessCode(), { text: this.tekst.trim(), app: WEB ? 'web' : 'nc' })
				this.tekst = ''
				await this.laad()
			} catch (e) {
				this.error = foutTekst(e)
			}
			this.bezig = false
		},
	},
}
</script>

<style scoped>
.pa-support { display: flex; flex-direction: column; height: calc(100vh - 140px); padding: 8px 12px; }
.pa-support__status { color: var(--color-text-maxcontrast); margin: 4px 0 8px; }
.pa-support__lijst { flex: 1 1 auto; overflow: auto; display: flex; flex-direction: column; gap: 6px; padding: 4px; }
.pa-support__leeg { color: var(--color-text-maxcontrast); margin: auto; }
.pa-support__bubbel { max-width: 75%; padding: 8px 12px; border-radius: 12px; white-space: pre-wrap; }
.pa-support__bubbel--user { align-self: flex-end; background: var(--color-primary-element-light); }
.pa-support__bubbel--admin { align-self: flex-start; background: var(--color-background-dark); }
.pa-support__bubbel small { display: block; color: var(--color-text-maxcontrast); font-size: 11px; margin-top: 2px; }
.pa-support__form { display: flex; gap: 8px; align-items: flex-end; padding-top: 8px; }
.pa-support__form > :first-child { flex: 1 1 auto; }
</style>
