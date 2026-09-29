<template>
	<div v-if="speler.huidig" class="pa-speler" :class="opPodcastPagina ? 'pa-speler--breed' : 'pa-speler--zij'">
		<img :src="podcastBeeld(speler.art)" alt="" class="pa-speler__art">
		<div class="pa-speler__tekst">
			<div class="pa-speler__titel" :title="speler.huidig.title">{{ speler.huidig.title }}</div>
			<audio ref="audio"
				controls
				:src="speler.huidig.audio.url"
				class="pa-speler__audio"
				@timeupdate="bewaarPositie"
				@play="speler.speelt = true"
				@pause="speler.speelt = false"
				@loadedmetadata="herstelPositie" />
		</div>
		<label class="pa-speler__snelheid">{{ t('Speed') }}
			<select :value="speler.snelheid" @change="zetSnelheid($event.target.value)">
				<option value="0.8">0.8×</option>
				<option value="1">1×</option>
				<option value="1.25">1.25×</option>
				<option value="1.5">1.5×</option>
				<option value="2">2×</option>
			</select>
		</label>
		<button type="button" class="pa-speler__sluit" :title="t('Close')" @click="sluit">×</button>
	</div>
</template>

<script>
/**
 * De podcastbalk van de hele app.
 *
 * Staat één keer in [App.vue] en wordt daar nooit afgebroken -- daarom loopt het geluid door als je van
 * scherm wisselt (Ramin, 25-09). Waar hij STAAT hangt wel van het scherm af:
 *
 * - op het podcastscherm onderin dat scherm, waar hij altijd stond;
 * - overal elders onderin het paneel ernaast, zodat hij niet over je werk heen ligt.
 *
 * Dat is puur een kwestie van positie, geen verhuizing in de pagina: het element zelf blijft staan waar
 * het staat, want een `<audio>` dat verplaatst wordt kan zijn geluid verliezen.
 */
import { t } from '../l10n/index.js'
import { podcastBeeld } from '../api/aninaBeeld.js'
import { staat as speler, koppel, herstelPositie, bewaarPositie, zetSnelheid, sluit } from '../api/speler.js'

export default {
	name: 'SpelerBalk',
	props: {
		/** Sta je op het podcastscherm? Bepaalt alleen waar de balk hangt. */
		opPodcastPagina: { type: Boolean, default: false },
	},
	data() {
		return { speler }
	},
	mounted() {
		koppel(this.$refs.audio || null)
	},
	updated() {
		// De balk verschijnt pas zodra er iets te spelen is; dan pas bestaat het element.
		if (this.$refs.audio) koppel(this.$refs.audio)
	},
	beforeUnmount() {
		koppel(null)
	},
	methods: { t, podcastBeeld, herstelPositie, bewaarPositie, zetSnelheid, sluit },
}
</script>

<style scoped>
.pa-speler {
	position: fixed;
	bottom: 0;
	z-index: 50;
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 8px 14px;
	background: var(--color-main-background, #fff);
	border-top: 1px solid var(--color-border, #ddd);
	box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.06);
}

/* Op het podcastscherm: over de breedte van dat scherm, het paneel ernaast vrijlatend. */
.pa-speler--breed {
	left: var(--app-navigation-width, 300px);
	right: 38%;
}

/* Elders: onderin het paneel ernaast, even breed als dat paneel. */
.pa-speler--zij {
	right: 0;
	width: 38%;
	max-width: 520px;
	min-width: 300px;
}

.pa-speler__art { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; flex: 0 0 auto; }
.pa-speler__tekst { flex: 1 1 auto; min-width: 0; }
.pa-speler__titel {
	font-size: 0.85em;
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.pa-speler__audio { width: 100%; height: 32px; }
.pa-speler__snelheid { font-size: 0.8em; display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
.pa-speler__sluit {
	background: none;
	border: none;
	cursor: pointer;
	font-size: 1.4em;
	line-height: 1;
	color: var(--color-text-maxcontrast, #666);
	flex: 0 0 auto;
}

/* Smal scherm: geen paneel ernaast, dus over de volle breedte. */
@media (max-width: 1100px) {
	.pa-speler--breed,
	.pa-speler--zij {
		left: 0;
		right: 0;
		width: auto;
		max-width: none;
		min-width: 0;
	}
}
</style>
