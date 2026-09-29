<template>
	<NcNoteCard :type="type" class="pa-fout">
		<span class="pa-fout__tekst">{{ tekst }}</span>
		<NcButton v-if="link" class="pa-fout__knop" @click="ga">{{ link.label }}</NcButton>
	</NcNoteCard>
</template>

<script>
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcButton from '@nextcloud/vue/components/NcButton'
import { foutLink } from '../api/fouten.js'
import { gaNaar } from '../api/navigatie.js'

/**
 * Eén foutkaart voor alle schermen: de tekst, en als je de fout zelf kunt
 * oplossen een knop naar de juiste plek in Instellingen (Ramin, 2026-09-14).
 */
export default {
	name: 'FoutMelding',
	components: { NcNoteCard, NcButton },
	props: {
		error: { type: [String, Error, Object], default: '' },
		type: { type: String, default: 'error' },
	},
	computed: {
		tekst() { return typeof this.error === 'string' ? this.error : (this.error?.message || String(this.error || '')) },
		link() { return foutLink(this.tekst) },
	},
	methods: {
		ga() { gaNaar(this.link.tab, this.link.onderdeel, this.link.subOnderdeel) },
	},
}
</script>

<style scoped>
.pa-fout :deep(.notecard__content), .pa-fout { display: block; }
.pa-fout__tekst { display: inline-block; margin-right: 10px; }
.pa-fout__knop { display: inline-flex; vertical-align: middle; margin-top: 4px; }
</style>
