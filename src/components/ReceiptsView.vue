<template>
	<div class="pa-rec">
		<h2>{{ t('Receipts') }}</h2>
		<FoutMelding v-if="error" :error="error" />
		<NcLoadingIcon v-if="loading" :size="28" />

		<template v-else>
			<p v-if="!bonnen.length" class="pa-rec__empty">{{ t('No receipts yet — scan one with the phone, or add one below.') }}</p>
			<div v-for="b in bonnen" :key="b.receiptUid" class="pa-rec__row" @click="wisselBon(b)">
				<div class="pa-rec__head">
					<div class="pa-rec__body">
						<div class="pa-rec__title">{{ b.merchant || t('Other') }}</div>
						<div class="pa-rec__sub">{{ euro(b.totalCents) }} · {{ datum(b.boughtAt) }} · {{ categorie(b.category) }} · {{ t('%d items', b.items.length) }}</div>
					</div>
					<span class="pa-rec__caret">{{ open === b.receiptUid ? '▴' : '▾' }}</span>
				</div>
				<div v-if="open === b.receiptUid" class="pa-rec__lines" @click.stop>
					<!-- De bon zelf (Ramin, 24-09): versleuteld opgehaald, in de browser ontsleuteld met je
					     eigen code, alleen hier getoond. Er wordt niets bewaard -- de afbeelding bestaat
					     zolang deze bon openstaat en is daarna weg. -->
					<div v-if="fotoBezig" class="pa-rec__foto-wacht">{{ t('Fetching the receipt…') }}</div>
					<img v-else-if="fotoUrl" :src="fotoUrl" :alt="t('Receipt')" class="pa-rec__foto">
					<p v-else-if="fotoFout" class="pa-rec__foto-fout">{{ fotoFout }}</p>
					<p v-if="fotoUrl" class="pa-rec__foto-uitleg">
						{{ t('Fetched encrypted and unlocked here with your own code. Nothing is saved on this device.') }}
					</p>
					<div v-for="(it, i) in b.items" :key="i" class="pa-rec__line">
						<span class="pa-rec__qty">{{ it.quantity }}×</span>
						<span class="pa-rec__name">{{ it.name }}</span>
						<span class="pa-rec__price">{{ it.priceCents != null ? euro(it.priceCents) : '' }}</span>
					</div>
				</div>
			</div>

			<!-- Toevoegen zonder camera: in de browser typ je de regels (Ramin,
			     2026-09-13: "anders — bestand uploaden" hoort bij de telefoon
			     met zijn tekstherkenning; hier is dit de eerlijke weg). -->
			<button v-if="!toevoegen" type="button" class="pa-rec__btn pa-rec__btn--primary" @click="toevoegen = true">{{ t('Add receipt') }}</button>
			<form v-else class="pa-rec__form" @submit.prevent="save">
				<input v-model="form.merchant" type="text" class="pa-rec__input" :placeholder="t('Store')">
				<div class="pa-rec__two">
					<input v-model="form.date" type="date" class="pa-rec__input">
					<select v-model="form.category" class="pa-rec__input">
						<option value="supermarket">{{ t('Supermarket') }}</option>
						<option value="fuel">{{ t('Fuel station') }}</option>
						<option value="lumber">{{ t('Hardware store') }}</option>
						<option value="home">{{ t('Home / household') }}</option>
						<option value="">{{ t('Other') }}</option>
					</select>
				</div>
				<label class="pa-rec__label">{{ t('Lines') }}</label>
				<textarea v-model="form.lines" class="pa-rec__input pa-rec__textarea" rows="6" :placeholder="t('one per line, e.g. Melk 2 1.98')"></textarea>
				<div class="pa-rec__two">
					<button type="submit" class="pa-rec__btn pa-rec__btn--primary" :disabled="saving || !form.lines.trim()">{{ t('Save') }}</button>
					<button type="button" class="pa-rec__btn" @click="toevoegen = false">{{ t('Cancel') }}</button>
				</div>
			</form>
		</template>
	</div>
</template>

<script>
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import { t, currentLocale } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import FoutMelding from './FoutMelding.vue'
import { getAccessCode } from '../api/accessCode.js'
import * as paApi from '../api/paApi.js'
import { decryptBytes } from '../api/cryptoUtil.js'
import { volgSync } from '../api/sync.js'

/**
 * Je bonnen — wat de telefoon naar de server stuurde: winkel, datum,
 * categorie en de regels. De foto blijft versleuteld op de telefoon en de
 * server; hier gaat het om wat je kocht en wanneer.
 */
export default {
	name: 'ReceiptsView',
	components: { FoutMelding, NcLoadingIcon, NcNoteCard },
	data() {
		return { stopKijken: null, loading: true, error: null, bonnen: [], open: null, fotoUrl: null, fotoBezig: false, fotoFout: '', toevoegen: false, saving: false, form: { merchant: '', date: new Date().toISOString().slice(0, 10), category: 'supermarket', lines: '' } }
	},
	async mounted() {
		await this.load()
		// Meeluisteren met je andere apparaten (Ramin, 24-09): verandert dit elders, dan staat
		// het hier meteen goed in plaats van pas als je het scherm opnieuw opent.
		this.stopKijken = volgSync(() => this.load())
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
		this.vergeetFoto()
	},
	methods: {
		/**
		 * Een bon open- of dichtklappen. Bij het openen halen we de foto op, bij het sluiten gooien we hem
		 * weg -- letterlijk: de blob-url wordt ingetrokken, zodat de browser het beeld uit zijn geheugen
		 * haalt. Zo staat er nooit een bon te wachten in een scherm dat je allang gesloten hebt.
		 */
		async wisselBon(b) {
			const dicht = this.open === b.receiptUid
			this.vergeetFoto()
			this.open = dicht ? null : b.receiptUid
			if (dicht) return
			await this.haalFoto(b.receiptUid)
		},
		vergeetFoto() {
			if (this.fotoUrl) URL.revokeObjectURL(this.fotoUrl)
			this.fotoUrl = null
			this.fotoFout = ''
			this.fotoBezig = false
		},
		/**
		 * De foto ophalen en in het geheugen ontsleutelen.
		 *
		 * Elke stap kan misgaan en elke fout betekent iets anders, dus we zeggen wat er aan de hand is in
		 * plaats van stil een leeg vlak te laten: geen foto bij deze bon, de server niet bereikbaar, of
		 * wel bytes maar niet te openen met deze code.
		 */
		async haalFoto(uid) {
			const code = getAccessCode()
			if (!code) return
			this.fotoBezig = true
			this.fotoFout = ''
			try {
				const lijst = await paApi.receiptImages(code, uid)
				const eerste = (Array.isArray(lijst) ? lijst : (lijst && lijst.images) || [])[0]
				if (!eerste) {
					this.fotoBezig = false
					return
				}
				const bytes = await paApi.receiptImageBytes(code, eerste.id || eerste.imageId || eerste)
				const plat = decryptBytes(code, bytes)
				// Alleen in het geheugen; de url wordt weer ingetrokken zodra je de bon sluit.
				this.fotoUrl = URL.createObjectURL(new Blob([plat], { type: 'image/jpeg' }))
			} catch (e) {
				this.fotoFout = e && e.status === 404
					? t('No photo with this receipt.')
					: t('The receipt cannot be fetched right now. Try again in a moment.')
			} finally {
				this.fotoBezig = false
			}
		},
		t(...args) { return t(...args) },
		euro(cents) { return (Number(cents || 0) / 100).toLocaleString(currentLocale(), { style: 'currency', currency: 'EUR' }) },
		datum(iso) { const d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) },
		categorie(c) {
			return { supermarket: t('Supermarket'), fuel: t('Fuel station'), lumber: t('Hardware store'), home: t('Home / household') }[c] || t('Other')
		},
		async load() {
			this.loading = true; this.error = null
			try { this.bonnen = await paApi.listReceipts(getAccessCode()) } catch (e) { this.error = foutTekst(e) } finally { this.loading = false }
		},
		async save() {
			// "Melk 2 1.98" -> naam, aantal, prijs; aantal en prijs mogen ontbreken.
			const items = this.form.lines.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
				const m = /^(.*?)(?:\s+(\d+))?(?:\s+(\d+[.,]\d{2}))?$/.exec(l)
				const name = (m && m[1] ? m[1] : l).trim()
				const quantity = m && m[2] ? parseInt(m[2], 10) : 1
				const priceCents = m && m[3] ? Math.round(parseFloat(m[3].replace(',', '.')) * 100) : null
				return { name, quantity, priceCents }
			})
			if (!items.length) return
			this.saving = true
			try {
				const uid = 'nc-' + Date.now().toString(36)
				await paApi.syncReceipt(getAccessCode(), { receiptUid: uid, boughtAt: this.form.date, merchant: this.form.merchant.trim(), category: this.form.category, items })
				this.toevoegen = false
				this.form = { merchant: '', date: new Date().toISOString().slice(0, 10), category: 'supermarket', lines: '' }
				await this.load()
			} catch (e) { this.error = foutTekst(e) } finally { this.saving = false }
		},
	},
}
</script>

<style scoped>
.pa-rec__foto { max-width: 100%; max-height: 62vh; border-radius: 8px; display: block; margin: 0 0 6px; }
.pa-rec__foto-wacht, .pa-rec__foto-fout { color: var(--color-text-maxcontrast, #666); font-size: 0.9em; margin: 0 0 8px; }
.pa-rec__foto-fout { color: var(--color-error, #c33); }
.pa-rec__foto-uitleg { color: var(--color-text-maxcontrast, #666); font-size: 0.82em; margin: 0 0 10px; }
.pa-rec__row { border: 1px solid var(--color-border); border-radius: var(--border-radius-large); padding: 10px 14px; margin-bottom: 8px; cursor: pointer; }
.pa-rec__head { display: flex; align-items: center; gap: 8px; }
.pa-rec__body { flex: 1; }
.pa-rec__title { font-weight: bold; }
.pa-rec__sub, .pa-rec__empty, .pa-rec__caret { color: var(--color-text-maxcontrast); font-size: 0.9em; }
.pa-rec__lines { border-top: 1px solid var(--color-border); margin-top: 8px; padding-top: 6px; }
.pa-rec__line { display: flex; gap: 8px; font-size: 0.9em; padding: 2px 0; }
.pa-rec__qty { color: var(--color-text-maxcontrast); min-width: 28px; font-family: ui-monospace, monospace; }
.pa-rec__name { flex: 1; }
.pa-rec__price { font-family: ui-monospace, monospace; }
.pa-rec__form { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.pa-rec__two { display: flex; gap: 8px; }
.pa-rec__two > * { flex: 1; }
.pa-rec__input { font: inherit; min-height: 36px; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); width: 100%; }
.pa-rec__textarea { min-height: 120px; }
.pa-rec__label { font-size: 0.85em; color: var(--color-text-maxcontrast); }
.pa-rec__btn { font: inherit; font-size: 0.9em; min-height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); cursor: pointer; }
.pa-rec__btn--primary { background: var(--color-primary-element); color: var(--color-primary-element-text); border-color: transparent; }
</style>
