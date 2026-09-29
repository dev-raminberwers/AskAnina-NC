<template>
	<div class="pa-notes">
		<div class="pa-notes__list">
			<div class="pa-notes__toolbar">
				<h2>{{ t('Notes') }}</h2>
				<NcButton type="primary" @click="nieuw">{{ t('New note') }}</NcButton>
			</div>
			<input id="pa-notes-search" v-model="zoek" type="search" :placeholder="t('Search')" class="pa-notes__zoek">
			<div v-if="categorieen.length" class="pa-notes__chips">
				<button type="button" class="pa-notes__chip" :class="{ 'pa-notes__chip--active': categorie === '' }" @click="categorie = ''">{{ t('All') }}</button>
				<button v-for="c in categorieen" :key="c" type="button" class="pa-notes__chip" :class="{ 'pa-notes__chip--active': categorie === c }" @click="categorie = c">{{ c }}</button>
			</div>
			<FoutMelding v-if="error" :error="error" />
			<!-- Lijkt de nieuwe notitie op een bestaande? Eerst vragen (Ramin, 2026-09-16). -->
			<NcNoteCard v-if="dubbel" type="info">
				<p>{{ t('There is already a %s named %s. Add to it, or make a new one?', t('note'), dubbel.bestaand.title) }}</p>
				<NcButton type="primary" :disabled="busy" @click="dubbelOpen">{{ t('Open the existing one') }}</NcButton>
				<NcButton :disabled="busy" @click="dubbelNieuw">{{ t('Make a new one') }}</NcButton>
				<NcButton :disabled="busy" @click="dubbel = null">{{ t('Cancel') }}</NcButton>
			</NcNoteCard>
			<NcLoadingIcon v-else-if="loading" :size="24" />
			<p v-else-if="!gefilterd.length" class="pa-notes__empty">{{ t('No notes yet.') }}</p>
			<ul v-else class="pa-notes__items">
				<li v-for="note in gefilterd" :key="note.id" :class="{ 'pa-notes__item--active': current && current.id === note.id }" @click="open(note)">
					<span class="pa-notes__ster" :class="{ 'pa-notes__ster--aan': note.favorite }">★</span>
					<span class="pa-notes__titelblok">
						<span class="pa-notes__title">{{ note.title || t('Untitled') }}</span>
						<span class="pa-notes__meta">{{ note.category || '' }}<template v-if="note.category && note.modified"> · </template>{{ wanneer(note.modified) }}</span>
					</span>
				</li>
			</ul>
		</div>
		<div class="pa-notes__editor">
			<p v-if="!current" class="pa-notes__empty">{{ t('Select a note on the left, or make a new one.') }}</p>
			<template v-else>
				<div class="pa-notes__rij">
					<input id="pa-note-title" v-model="draft.title" type="text" class="pa-notes__input pa-notes__grow" :placeholder="t('Title')" @input="wijzig">
					<button type="button" class="pa-notes__sterknop" :class="{ 'pa-notes__ster--aan': draft.favorite }" :title="t('Favorite')" @click="draft.favorite = !draft.favorite; wijzig()">★</button>
				</div>
				<div class="pa-notes__rij">
					<input id="pa-note-category" v-model="draft.category" type="text" class="pa-notes__input pa-notes__grow" :placeholder="t('Category')" list="pa-note-categories" @input="wijzig">
					<datalist id="pa-note-categories"><option v-for="c in categorieen" :key="c" :value="c" /></datalist>
					<div class="pa-notes__chips">
						<button type="button" class="pa-notes__chip" :class="{ 'pa-notes__chip--active': !preview }" @click="preview = false">{{ t('Edit') }}</button>
						<button type="button" class="pa-notes__chip" :class="{ 'pa-notes__chip--active': preview }" @click="preview = true">{{ t('Preview') }}</button>
					</div>
				</div>
				<div v-if="preview" class="pa-notes__preview" v-html="html" />
				<textarea v-else id="pa-note-content" v-model="draft.content" class="pa-notes__textarea" rows="16" :placeholder="t('Text')" @input="wijzig" />
				<div class="pa-notes__actions">
					<NcButton type="primary" :disabled="busy || (!draft.title.trim() && !draft.content.trim())" @click="save">{{ t('Save') }}</NcButton>
					<template v-if="current.id && !vraagWeg">
						<NcButton type="error" :disabled="busy" @click="vraagWeg = true">{{ t('Delete') }}</NcButton>
					</template>
					<template v-if="vraagWeg">
						<span>{{ t('Delete this note?') }}</span>
						<NcButton type="error" :disabled="busy" @click="remove">{{ t('Yes') }}</NcButton>
						<NcButton :disabled="busy" @click="vraagWeg = false">{{ t('No') }}</NcButton>
					</template>
					<span class="pa-notes__meta">{{ status }}</span>
				</div>
			</template>
		</div>
	</div>
</template>

<script>
import NcButton from '@nextcloud/vue/components/NcButton'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import FoutMelding from './FoutMelding.vue'
import { listNotes, getNote, createNote, updateNote, deleteNote } from '../api/shortcutSources.js'
import { t, currentLocale } from '../l10n/index.js'
import { neemVoorinvulling } from '../api/voorinvulling.js'
import { eersteGelijkende } from '../api/lijktOp.js'
import { foutTekst } from '../api/fouten.js'
import { watch } from 'vue'
import { staat as sync } from '../api/sync.js'

/* Ook de aanhalingstekens: een link komt in href="…", en een " in de notitie mag daar niet uit breken. */
function ontsmet(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }

/**
 * Een klein beetje Markdown, genoeg voor notities: koppen, vet, cursief,
 * lijsten, links en regeleinden. Alles wordt eerst ontsmet, dus geen HTML
 * uit de notitie zelf.
 */
function markdown(tekst) {
	const regels = ontsmet(tekst || '').split('\n')
	const uit = []
	let inLijst = false
	for (const r of regels) {
		const lijst = /^\s*[-*]\s+(.*)$/.exec(r)
		if (lijst) {
			if (!inLijst) { uit.push('<ul>'); inLijst = true }
			uit.push('<li>' + inline(lijst[1]) + '</li>')
			continue
		}
		if (inLijst) { uit.push('</ul>'); inLijst = false }
		const kop = /^(#{1,3})\s+(.*)$/.exec(r)
		if (kop) { uit.push('<h' + (kop[1].length + 2) + '>' + inline(kop[2]) + '</h' + (kop[1].length + 2) + '>'); continue }
		if (r.trim() === '') { uit.push('<br>'); continue }
		uit.push('<p>' + inline(r) + '</p>')
	}
	if (inLijst) uit.push('</ul>')
	return uit.join('')
}
function inline(s) {
	return s
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/(^|\W)\*(.+?)\*/g, '$1<em>$2</em>')
		.replace(/`(.+?)`/g, '<code>$1</code>')
		.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
}

/**
 * Eigen notitiebewerker (Ramin, 2026-09-14: "We gaan onze eigen editors
 * maken"). Links zoeken, categorieën en de lijst (favorieten bovenaan),
 * rechts titel, categorie, ster, tekst met voorbeeldweergave. Bewaart
 * vanzelf anderhalve seconde na de laatste toets. In Nextcloud via de
 * Notes-app (REST), in de web-agenda bij ons (account/notes).
 */
export default {
	name: 'NotesView',
	components: { NcNoteCard, NcButton, NcLoadingIcon, FoutMelding },
	data() {
		return { notes: [], dubbel: null, loading: true, error: null, current: null, draft: { title: '', content: '', category: '', favorite: false }, busy: false, status: '', zoek: '', categorie: '', preview: false, vraagWeg: false, timer: null, vuil: false }
	},
	computed: {
		categorieen() {
			return Array.from(new Set(this.notes.map((n) => n.category).filter(Boolean))).sort()
		},
		gefilterd() {
			const q = this.zoek.trim().toLowerCase()
			return this.notes
				.filter((n) => !this.categorie || n.category === this.categorie)
				.filter((n) => !q || (n.title + ' ' + (n.content || '') + ' ' + (n.category || '')).toLowerCase().includes(q))
				.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || (Number(b.modified) || 0) - (Number(a.modified) || 0))
		},
		html() { return markdown(this.draft.content) },
	},
	async mounted() {
		// Meeluisteren met de rest van de app (24-09): verandert dit ergens anders, dan staat het
		// hier meteen goed in plaats van pas als je het scherm opnieuw opent.
		this.stopKijken = watch(() => sync.versie, () => { this.load() })

		await this.load()
		// Vanuit zoeken (kaart 104): die notitie meteen open.
		const z = neemVoorinvulling('open-note')
		if (z && z.id != null) {
			const n = this.notes.find((x) => String(x.id) === String(z.id))
			if (n) await this.open(n)
		}
		// Ingesproken notitie via Anina (kaart 100): nieuw, ingevuld; de gebruiker kijkt na en slaat op.
		const v = neemVoorinvulling('note')
		if (v) {
			this.nieuw()
			this.draft = { ...this.draft, title: v.title || '', content: v.text || '', category: v.folder || this.draft.category }
		}
	},
	beforeUnmount() {
		clearTimeout(this.timer)
	},
	methods: {
		t(...args) { return t(...args) },
		wanneer(seconden) {
			if (!seconden) return ''
			return new Date(Number(seconden) * 1000).toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short' })
		},
		async load() {
			this.loading = true
			try {
				this.notes = await listNotes()
				this.error = null
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.loading = false
			}
		},
		nieuw() {
			this.current = { id: 0, title: '', content: '', category: this.categorie || '', favorite: false }
			this.draft = { title: '', content: '', category: this.categorie || '', favorite: false }
			this.status = ''
			this.vraagWeg = false
			this.preview = false
		},
		async open(note) {
			if (this.vuil && this.current) await this.save()
			this.status = ''
			this.vraagWeg = false
			try {
				const vol = await getNote(note)
				this.current = vol || note
				this.draft = { title: this.current.title || '', content: this.current.content || '', category: this.current.category || '', favorite: !!this.current.favorite }
			} catch (e) {
				this.error = foutTekst(e)
			}
		},
		dubbelNieuw() { this.dubbel = null; return this.save(true) },
		/** De bestaande notitie openen met de nieuwe tekst eronder; de gebruiker kijkt na en slaat op. */
		async dubbelOpen() {
			const d = this.dubbel
			this.dubbel = null
			this.vuil = false
			await this.open(d.bestaand)
			if (d.tekst && d.tekst.trim()) {
				this.draft.content = ((this.draft.content || '').trimEnd() + '\n\n' + d.tekst.trim()).trim()
				this.vuil = true
			}
		},
		wijzig() {
			// Vanzelf bewaren, anderhalve seconde na de laatste toets.
			this.vuil = true
			this.status = t('Unsaved changes')
			clearTimeout(this.timer)
			this.timer = setTimeout(() => { if (this.draft.title.trim() || this.draft.content.trim()) this.save() }, 1500)
		},
		async save(ondanksDubbel = false) {
			if (!this.current) return
			clearTimeout(this.timer)
			if (!this.current.id && !ondanksDubbel) {
				const al = eersteGelijkende(this.draft.title.trim(), this.notes, (n) => n.title)
				if (al) { this.dubbel = { bestaand: al, tekst: this.draft.content }; return }
			}
			this.busy = true
			try {
				const velden = { title: this.draft.title.trim(), content: this.draft.content, category: this.draft.category.trim(), favorite: this.draft.favorite }
				const opgeslagen = this.current.id ? await updateNote(this.current, velden) : await createNote(velden)
				this.current = { ...this.current, ...(opgeslagen || {}), ...velden }
				this.vuil = false
				this.status = t('Saved')
				this.error = null
				await this.load()
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.busy = false
			}
		},
		async remove() {
			this.busy = true
			try {
				await deleteNote(this.current.id)
				this.current = null
				this.vraagWeg = false
				this.vuil = false
				await this.load()
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.busy = false
			}
		},
	},
}
</script>

<style scoped>
.pa-notes { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
.pa-notes__list { flex: 0 0 300px; max-width: 100%; }
.pa-notes__editor { flex: 1 1 340px; min-width: 0; }
.pa-notes__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pa-notes__zoek { width: 100%; box-sizing: border-box; margin: 6px 0; }
.pa-notes__chips { display: flex; gap: 4px; flex-wrap: wrap; margin: 4px 0; }
.pa-notes__chip { border: 1px solid var(--color-border, #ccc); background: transparent; border-radius: 16px; padding: 2px 10px; cursor: pointer; color: inherit; font-size: 0.85em; }
.pa-notes__chip--active { background: var(--color-primary-element, #1e3a5f); color: var(--color-primary-element-text, #fff); border-color: transparent; }
.pa-notes__items { list-style: none; padding: 0; margin: 8px 0 0; max-height: 70vh; overflow-y: auto; }
.pa-notes__items > li { padding: 8px 10px; border-radius: var(--border-radius-large, 8px); cursor: pointer; display: flex; align-items: center; gap: 8px; }
.pa-notes__items > li:hover, .pa-notes__item--active { background: var(--color-background-hover); }
.pa-notes__titelblok { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.pa-notes__title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pa-notes__meta { color: var(--color-text-maxcontrast); font-size: 0.85em; }
.pa-notes__ster { color: var(--color-border, #ccc); }
.pa-notes__ster--aan { color: #e0a800; }
.pa-notes__sterknop { border: none; background: transparent; font-size: 1.4em; cursor: pointer; color: var(--color-border, #ccc); padding: 0 6px; }
.pa-notes__empty { color: var(--color-text-maxcontrast); }
.pa-notes__rij { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
.pa-notes__grow { flex: 1; min-width: 0; }
.pa-notes__input, .pa-notes__textarea { width: 100%; box-sizing: border-box; }
.pa-notes__textarea { resize: vertical; font: inherit; margin-bottom: 8px; }
.pa-notes__preview { border: 1px solid var(--color-border, #ddd); border-radius: var(--border-radius-large, 8px); padding: 10px 14px; min-height: 200px; margin-bottom: 8px; }
.pa-notes__preview :deep(p) { margin: 0 0 6px; }
.pa-notes__actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
</style>
