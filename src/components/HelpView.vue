<template>
	<div class="pa-help">
		<div class="pa-help__tabs">
			<button v-for="k in tabs" :key="k.id" type="button" class="pa-help__tab" :class="{ 'pa-help__tab--aan': tab === k.id }" @click="tab = k.id">{{ k.label }}</button>
		</div>
		<SupportView v-if="tab === 'chat'" />
		<div v-else class="pa-help__inhoud">
			<NcLoadingIcon v-if="laden" />
			<p v-else-if="!inhoud" class="pa-help__leeg">{{ t('Help could not be loaded. Check your connection and try again.') }}</p>
			<template v-else>
				<details v-for="(b, i) in lijst" :key="tab + i" class="pa-help__blok">
					<summary class="pa-help__kop">{{ b.title || b.q }}</summary>
					<p class="pa-help__tekst">{{ b.body || b.a }}</p>
					<!-- Plaatje bij de basis (Ramin, 20-09): de onderdelen van de app, klein en zonder werking. -->
					<div v-if="b.visual" class="pa-help__vis">
						<template v-if="b.visual === 'boxed_time'">
							<div class="pa-vis__rij"><span>🚗</span><span class="pa-vis__tijd pa-vis__tijd--kader">10:28</span><span>Home → Schiphol</span></div>
							<div class="pa-vis__rij"><span>✈️</span><span class="pa-vis__tijd pa-vis__tijd--kader">14:15</span><span class="pa-vis__slot">🔒</span><span>KL1517 AMS → BCN</span></div>
							<div class="pa-vis__rij"><span>🧳</span><span class="pa-vis__tijd">16:25</span><span>{{ t('Baggage claim') }}</span></div>
						</template>
						<template v-else-if="b.visual === 'buttons'">
							<div class="pa-vis__rij"><span class="pa-vis__knop pa-vis__knop--vol">▶ {{ t('Start now') }}</span><span class="pa-vis__knop">✓ {{ t('Done') }}</span><span class="pa-vis__knop pa-vis__knop--groen">✓ {{ t('Done') }}</span></div>
						</template>
						<template v-else-if="b.visual === 'rolling'">
							<div class="pa-vis__rij"><span class="pa-vis__chip pa-vis__chip--aan">{{ t('Rolling 24 hours') }}</span><span class="pa-vis__chip">{{ t('One day') }}</span></div>
						</template>
						<template v-else-if="b.visual === 'container'">
							<div class="pa-vis__kop">{{ t('Trip to Barcelona') }}</div>
							<div class="pa-vis__dag"><span>MON 21</span></div>
							<div class="pa-vis__rij"><span>✈️</span><span class="pa-vis__tijd">14:15</span><span>KL1517 AMS → BCN</span></div>
							<div class="pa-vis__rij"><span>🏨</span><span class="pa-vis__tijd">17:55</span><span>Hotel</span></div>
							<div class="pa-vis__dag"><span>TUE 22</span></div>
							<div class="pa-vis__rij"><span>📍</span><span class="pa-vis__tijd">09:00</span><span>{{ t('Appointment') }}</span></div>
						</template>
						<template v-else-if="b.visual === 'rides'">
							<div class="pa-vis__rij"><span>🚗</span><span class="pa-vis__tijd">10:28</span><span>Home → Schiphol</span></div>
							<div class="pa-vis__rij"><span>🛫</span><span class="pa-vis__tijd">12:15</span><span>{{ t('Check-in') }}</span></div>
							<div class="pa-vis__rij"><span>✈️</span><span class="pa-vis__tijd">14:15</span><span>KL1517 AMS → BCN</span></div>
							<div class="pa-vis__rij"><span>🧳</span><span class="pa-vis__tijd">16:25</span><span>{{ t('Baggage claim') }}</span></div>
							<div class="pa-vis__rij"><span>🚗</span><span class="pa-vis__tijd">17:26</span><span>BCN → Hotel</span></div>
						</template>
						<template v-else-if="b.visual === 'menu'">
							<div class="pa-vis__rij"><span>☰</span><span class="pa-vis__menu">📰<i class="pa-vis__bol" /></span><span class="pa-vis__menu">🧳<i class="pa-vis__bol" /></span><span class="pa-vis__grijs">{{ t('dot = something new') }}</span></div>
						</template>
						<template v-else-if="b.visual === 'statusbar'">
							<div class="pa-vis__rij"><span class="pa-vis__vak">☀️ 15° → 19°</span><span class="pa-vis__vak">🚗 10:28</span><span class="pa-vis__vak">🧳 1</span><span class="pa-vis__vak">🎉 2</span><span class="pa-vis__vak">P</span></div>
						</template>
						<template v-else-if="b.visual === 'alarms'">
							<div class="pa-vis__rij"><span>🔔</span><span><b>{{ t('Time to leave') }}</b><br><span class="pa-vis__grijs">Home → Schiphol · 10:28</span></span></div>
						</template>
						<template v-else-if="b.visual === 'anina'">
							<div class="pa-vis__rij"><span class="pa-vis__anina">✦</span><span>“{{ t('When do I have to leave?') }}”</span></div>
						</template>
						<template v-else-if="b.visual === 'data'">
							<div class="pa-vis__rij"><span class="pa-vis__knop">📱 {{ t('Phone') }}</span><span class="pa-vis__knop">☁️ Nextcloud</span><span class="pa-vis__knop">🗄️ {{ t('Our server') }}</span></div>
						</template>
					</div>
					<template v-if="b.settings && b.settings.length">
						<p class="pa-help__label">{{ t('Settings for this screen') }}</p>
						<ul class="pa-help__lijst"><li v-for="(s, j) in b.settings" :key="j">{{ s }}</li></ul>
					</template>
					<div v-if="b.route" class="pa-help__knoppen">
						<NcButton v-if="b.route !== 'support' && b.route !== 'settings' && tabBestaat(b.route)" type="secondary" @click="$emit('ga', { tab: naarTab(b.route) })">{{ t('Open screen') }}</NcButton>
						<NcButton type="secondary" @click="$emit('ga', naarInstellingen(b.settingsLink))">{{ t('Open settings') }}</NcButton>
					</div>
				</details>
				<p class="pa-help__voet">{{ t('Missing something? Tell us in the chat.') }}</p>
			</template>
		</div>
	</div>
</template>

<script>
import * as paApi from '../api/paApi.js'
import { t, currentLocale } from '../l10n/index.js'
import SupportView from './SupportView.vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'

/**
 * Help (Ramin, 20-09): basis, uitleg per scherm met de instellingen erbij, FAQ en de chat. De
 * teksten komen van /pa/help.php (één bron voor Android, Nextcloud en web) in de taal van de app.
 */
export default {
	name: 'HelpView',
	components: { SupportView, NcButton, NcLoadingIcon },
	emits: ['ga'],
	data() {
		return { tab: 'basics', inhoud: null, laden: true }
	},
	computed: {
		tabs() {
			return [
				{ id: 'basics', label: t('Basics') },
				{ id: 'screens', label: t('Screens') },
				{ id: 'faq', label: t('FAQ') },
				{ id: 'chat', label: t('Chat') },
			]
		},
		lijst() {
			if (!this.inhoud) return []
			if (this.tab === 'basics') return this.inhoud.basics || []
			if (this.tab === 'faq') return this.inhoud.faq || []
			// Alleen de schermen die deze app ook heeft (rijmodus: alleen op de telefoon), in de volgorde van het menu (Ramin, 20-09).
			const volgorde = ['today', 'open_items', 'trips', 'groceries', 'receipts', 'fuel', 'calendar', 'locations', 'notes', 'tasks', 'contacts', 'news', 'podcasts', 'markets', 'support', 'deliveries', 'deck', 'settings']
			return (this.inhoud.screens || [])
				.filter((s) => this.tabBestaat(s.route) || s.route === 'settings' || s.route === 'support')
				.sort((a, b) => (volgorde.indexOf(a.route) + 1 || 99) - (volgorde.indexOf(b.route) + 1 || 99))
		},
	},
	async mounted() {
		try {
			this.inhoud = await paApi.help(String(currentLocale() || 'en').slice(0, 2))
		} catch (e) {
			this.inhoud = null
		}
		this.laden = false
	},
	methods: {
		t(...a) { return t(...a) },
		tabBestaat(route) {
			return ['today', 'calendar', 'open_items', 'tasks', 'notes', 'contacts', 'deck', 'news', 'podcasts', 'markets', 'deliveries', 'trips', 'groceries', 'receipts', 'fuel', 'locations', 'settings', 'support'].includes(route)
		},
		naarTab(route) { return { open_items: 'open', trips: 'trip' }[route] || route },
		/** De Android-verwijzing (tab&sub) vertaald naar de tabs van deze app. */
		naarInstellingen(link) {
			const [tabDeel, subDeel] = String(link || '').split('&sub=')
			const kaart = { display: 'general', details: 'details', apps: 'general', account: 'account' }
			let settingsTab = kaart[tabDeel] || null
			let settingsSubTab = subDeel || null
			if (subDeel === 'about') { settingsTab = 'about'; settingsSubTab = null }
			return { tab: 'settings', settingsTab, settingsSubTab }
		},
	},
}
</script>

<style scoped>
.pa-help { padding: 8px 12px; }
.pa-help__tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.pa-help__tab { border: 1px solid var(--color-border-dark); background: var(--color-main-background); border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.pa-help__tab--aan { background: var(--color-primary-element-light); border-color: var(--color-primary-element); font-weight: 600; }
.pa-help__blok { border: 1px solid var(--color-border); border-radius: 12px; padding: 10px 14px; margin-bottom: 8px; background: var(--color-main-background); }
.pa-help__kop { font-weight: 600; cursor: pointer; }
.pa-help__tekst { margin: 8px 0 0; white-space: pre-wrap; }
.pa-help__label { margin: 10px 0 2px; color: var(--color-text-maxcontrast); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
.pa-help__lijst { margin: 0; padding-left: 18px; }
.pa-help__knoppen { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.pa-help__leeg, .pa-help__voet { color: var(--color-text-maxcontrast); }
.pa-help__vis { margin-top: 10px; padding: 10px; border-radius: 10px; background: var(--color-background-dark); }
.pa-vis__rij { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 3px 0; }
.pa-vis__tijd { font-weight: 600; min-width: 48px; padding: 2px 6px; }
.pa-vis__tijd--kader { border: 1px solid var(--color-border-dark); border-radius: 6px; }
.pa-vis__slot { font-size: 11px; margin-left: -4px; }
.pa-vis__knop { border: 1px solid var(--color-border-dark); border-radius: 999px; padding: 5px 12px; }
.pa-vis__knop--vol { background: #13294a; color: #fff; border-color: #13294a; }
.pa-vis__knop--groen { color: #2e8b57; border-color: #2e8b57; }
.pa-vis__chip { border: 1px solid var(--color-border-dark); border-radius: 8px; padding: 4px 10px; }
.pa-vis__chip--aan { background: var(--color-primary-element-light); font-weight: 600; }
.pa-vis__kop { font-weight: 600; margin-bottom: 4px; }
.pa-vis__dag { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; margin: 4px 0; }
.pa-vis__dag::before, .pa-vis__dag::after { content: ''; flex: 1; border-top: 1px solid var(--color-border-dark); }
.pa-vis__menu { position: relative; }
.pa-vis__bol { position: absolute; top: -2px; right: -6px; width: 8px; height: 8px; border-radius: 50%; background: #b5541c; }
.pa-vis__vak { border: 1px solid var(--color-border); border-radius: 14px; padding: 4px 10px; font-size: 12px; }
.pa-vis__grijs { color: var(--color-text-maxcontrast); font-size: 12px; }
.pa-vis__anina { display: inline-flex; width: 36px; height: 36px; align-items: center; justify-content: center; border-radius: 10px; background: #c9a24d; color: #13294a; font-size: 18px; }
</style>
