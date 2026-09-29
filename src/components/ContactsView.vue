<template>
	<div class="pa-contacts">
		<div class="pa-contacts__list">
			<div class="pa-contacts__toolbar">
				<h2>{{ t('Contacts') }}</h2>
				<NcButton type="primary" @click="nieuw">{{ t('Add contact') }}</NcButton>
			</div>
			<input id="pa-contacts-search" v-model="zoek" type="search" :placeholder="t('Search')" class="pa-contacts__zoek">
			<FoutMelding v-if="error" :error="error" />
			<NcLoadingIcon v-else-if="loading" :size="24" />
			<p v-else-if="!gefilterd.length" class="pa-contacts__empty">{{ t('No contacts yet.') }}</p>
			<ul v-else class="pa-contacts__items">
				<li v-for="contact in gefilterd" :key="contact.href || contact.id" :class="{ 'pa-contacts__item--active': current && current.href === contact.href }" @click="open(contact)">
					<span class="pa-contacts__avatar">{{ initialen(contact.fullName) }}</span>
					<span class="pa-contacts__titelblok">
						<span class="pa-contacts__naam">{{ contact.fullName }}</span>
						<span class="pa-contacts__meta">{{ contact.organisation || (contact.phones && contact.phones[0]) || (contact.emails && contact.emails[0]) || '' }}<template v-if="books.length > 1 && contact.boek"> · {{ contact.boek }}</template></span>
					</span>
				</li>
			</ul>
		</div>
		<div class="pa-contacts__detail">
			<p v-if="!current" class="pa-contacts__empty">{{ t('Select a contact on the left, or add a new one.') }}</p>
			<template v-else>
				<div class="pa-contacts__kop">
					<span class="pa-contacts__avatar pa-contacts__avatar--groot">{{ initialen(draft.fullName) }}</span>
					<input id="pa-contact-name" v-model="draft.fullName" type="text" class="pa-contacts__veld pa-contacts__grow" :placeholder="t('Name')">
				</div>
				<input id="pa-contact-org" v-model="draft.organisation" type="text" class="pa-contacts__veld" :placeholder="t('Organisation')">
				<div class="pa-contacts__groep">
					<label>{{ t('Phone') }}</label>
					<div v-for="(tel, i) in draft.phones" :key="'t' + i" class="pa-contacts__rij">
						<input v-model="draft.phones[i]" type="tel" class="pa-contacts__veld pa-contacts__grow" :placeholder="t('Phone')">
						<a v-if="tel" :href="'tel:' + tel" class="pa-contacts__link" :title="t('Call')">☎</a>
						<button type="button" class="pa-contacts__x" :title="t('Remove')" @click="draft.phones.splice(i, 1)">×</button>
					</div>
					<button type="button" class="pa-contacts__plus" @click="draft.phones.push('')">+ {{ t('Add phone') }}</button>
				</div>
				<div class="pa-contacts__groep">
					<label>{{ t('Email') }}</label>
					<div v-for="(mail, i) in draft.emails" :key="'m' + i" class="pa-contacts__rij">
						<input v-model="draft.emails[i]" type="email" class="pa-contacts__veld pa-contacts__grow" :placeholder="t('Email')">
						<a v-if="mail" :href="'mailto:' + mail" class="pa-contacts__link" :title="t('Mail')">✉</a>
						<button type="button" class="pa-contacts__x" :title="t('Remove')" @click="draft.emails.splice(i, 1)">×</button>
					</div>
					<button type="button" class="pa-contacts__plus" @click="draft.emails.push('')">+ {{ t('Add email') }}</button>
				</div>
				<div class="pa-contacts__rij">
					<label for="pa-contact-birthday">{{ t('Birthday') }}</label>
					<input id="pa-contact-birthday" v-model="draft.birthday" type="date">
				</div>
				<input id="pa-contact-address" v-model="draft.address" type="text" class="pa-contacts__veld" :placeholder="t('Address')">
				<textarea id="pa-contact-notes" v-model="draft.notes" rows="3" class="pa-contacts__veld" :placeholder="t('Notes')" />
				<div class="pa-contacts__acties">
					<NcButton type="primary" :disabled="busy || !draft.fullName.trim()" @click="save">{{ t('Save') }}</NcButton>
					<NcButton v-if="current.href && !vraagWeg" type="error" :disabled="busy" @click="vraagWeg = true">{{ t('Delete') }}</NcButton>
					<template v-if="vraagWeg">
						<span>{{ t('Delete this contact?') }}</span>
						<NcButton type="error" :disabled="busy" @click="remove">{{ t('Yes') }}</NcButton>
						<NcButton :disabled="busy" @click="vraagWeg = false">{{ t('No') }}</NcButton>
					</template>
					<NcButton :disabled="busy" @click="current = null">{{ t('Close') }}</NcButton>
					<span v-if="status" class="pa-contacts__meta">{{ status }}</span>
				</div>
			</template>
		</div>
	</div>
</template>

<script>
import NcButton from '@nextcloud/vue/components/NcButton'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import FoutMelding from './FoutMelding.vue'
import { discoverAddressBooks, listContacts, createContact, updateContact, deleteContact } from '../api/shortcutSources.js'
import { getSettings } from '../api/nextcloudUserData.js'
import { t } from '../l10n/index.js'
import { neemVoorinvulling } from '../api/voorinvulling.js'
import { foutTekst } from '../api/fouten.js'
import { volgSync } from '../api/sync.js'

/**
 * Eigen contacten (Ramin, 2026-09-14: volwaardig). Links zoeken en de
 * lijst, rechts de kaart: naam, organisatie, meerdere nummers en adressen,
 * verjaardag, adres, notitie. In Nextcloud via CardDAV (de vCard blijft
 * verder onaangeroerd), in de web-agenda bij ons (account/contacts).
 */
export default {
	name: 'ContactsView',
	components: { NcButton, NcLoadingIcon, FoutMelding },
	data() {
		return { stopKijken: null, contacts: [], books: [], loading: true, error: null, busy: false, zoek: '', current: null, draft: this.leeg(), vraagWeg: false, status: '' }
	},
	computed: {
		gefilterd() {
			const q = this.zoek.trim().toLowerCase()
			if (!q) return this.contacts
			return this.contacts.filter((c) => [c.fullName, c.organisation, ...(c.phones || []), ...(c.emails || [])].join(' ').toLowerCase().includes(q))
		},
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
	},
	async mounted() {
		// Meeluisteren met je andere apparaten (Ramin, 24-09): verandert dit elders, dan staat
		// het hier meteen goed in plaats van pas als je het scherm opnieuw opent.
		this.stopKijken = volgSync(() => this.load())
		await this.load()
		// Vanuit zoeken (kaart 104): dat contact meteen open.
		const z = neemVoorinvulling('open-contact')
		if (z && z.zoek) {
			const c = this.contacts.find((x) => (x.fullName || '').toLowerCase() === String(z.zoek).toLowerCase())
			if (c) this.open(c); else this.zoek = z.zoek
		}
	},
	methods: {
		t(...args) { return t(...args) },
		leeg() { return { fullName: '', organisation: '', phones: [''], emails: [''], birthday: '', address: '', notes: '' } },
		initialen(naam) {
			return String(naam || '').trim().split(/\s+/).slice(0, 2).map((d) => d[0] || '').join('').toUpperCase() || '?'
		},
		async load() {
			this.loading = true
			try {
				// Alleen de adresboeken die je in Instellingen aanvinkte (leeg = alle; Ramin, 2026-09-15).
				const alle = await discoverAddressBooks()
				let gekozen = []
				try { gekozen = ((await getSettings()) || {}).contactBooks || [] } catch (e) { gekozen = [] }
				this.books = gekozen.length ? alle.filter((b) => gekozen.includes(b.href)) : alle
				if (!this.books.length) this.books = alle
				const per = await Promise.all(this.books.map((b) => listContacts(b).then((l) => l.map((c) => ({ ...c, boek: b.displayName }))).catch(() => [])))
				this.contacts = per.flat().sort((a, b) => a.fullName.localeCompare(b.fullName))
				this.error = null
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.loading = false
			}
		},
		nieuw() {
			this.current = { href: null }
			this.draft = this.leeg()
			this.vraagWeg = false
			this.status = ''
		},
		open(contact) {
			this.current = contact
			this.vraagWeg = false
			this.status = ''
			this.draft = {
				fullName: contact.fullName || '', organisation: contact.organisation || '',
				phones: (contact.phones && contact.phones.length ? [...contact.phones] : ['']),
				emails: (contact.emails && contact.emails.length ? [...contact.emails] : ['']),
				birthday: this.alsDatum(contact.birthday), address: contact.address || '', notes: contact.notes || '',
			}
		},
		alsDatum(bday) {
			// vCard: 1980-05-14, 19800514 of --05-14; het veld wil 1980-05-14.
			const s = String(bday || '').trim()
			const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s)
			return m ? m[1] + '-' + m[2] + '-' + m[3] : ''
		},
		async save() {
			this.busy = true
			try {
				const velden = {
					fullName: this.draft.fullName.trim(), organisation: this.draft.organisation.trim(),
					phones: this.draft.phones.map((x) => x.trim()).filter(Boolean),
					emails: this.draft.emails.map((x) => x.trim()).filter(Boolean),
					birthday: this.draft.birthday || null, address: this.draft.address.trim(), notes: this.draft.notes.trim(),
				}
				if (this.current.href) await updateContact(this.current, velden)
				else await createContact(this.books[0] || null, velden)
				this.status = t('Saved')
				this.error = null
				const naam = velden.fullName
				await this.load()
				this.current = this.contacts.find((c) => c.fullName === naam) || null
				if (this.current) this.open(this.current)
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.busy = false
			}
		},
		async remove() {
			this.busy = true
			try {
				await deleteContact(this.current)
				this.current = null
				this.vraagWeg = false
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
.pa-contacts { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
.pa-contacts__list { flex: 0 0 300px; max-width: 100%; }
.pa-contacts__detail { flex: 1 1 340px; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.pa-contacts__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pa-contacts__zoek { width: 100%; box-sizing: border-box; margin: 6px 0; }
.pa-contacts__items { list-style: none; padding: 0; margin: 0; max-height: 70vh; overflow-y: auto; }
.pa-contacts__items > li { padding: 6px 8px; border-radius: var(--border-radius-large, 8px); cursor: pointer; display: flex; align-items: center; gap: 10px; }
.pa-contacts__items > li:hover, .pa-contacts__item--active { background: var(--color-background-hover); }
.pa-contacts__avatar { flex: 0 0 32px; width: 32px; height: 32px; border-radius: 50%; background: var(--color-primary-element, #1e3a5f); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 0.8em; font-weight: 600; }
.pa-contacts__avatar--groot { flex-basis: 48px; width: 48px; height: 48px; font-size: 1.1em; }
.pa-contacts__titelblok { display: flex; flex-direction: column; min-width: 0; }
.pa-contacts__naam { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pa-contacts__meta { color: var(--color-text-maxcontrast); font-size: 0.85em; }
.pa-contacts__empty { color: var(--color-text-maxcontrast); }
.pa-contacts__kop { display: flex; gap: 10px; align-items: center; }
.pa-contacts__veld { width: 100%; box-sizing: border-box; font: inherit; }
.pa-contacts__grow { flex: 1; min-width: 0; }
.pa-contacts__groep { display: flex; flex-direction: column; gap: 4px; }
.pa-contacts__groep > label { font-size: 0.85em; color: var(--color-text-maxcontrast); }
.pa-contacts__rij { display: flex; gap: 8px; align-items: center; }
.pa-contacts__link { color: var(--color-primary-element, #1e3a5f); text-decoration: none; font-size: 1.1em; }
.pa-contacts__x { border: none; background: transparent; cursor: pointer; color: var(--color-text-maxcontrast); font-size: 1.1em; }
.pa-contacts__plus { border: none; background: transparent; cursor: pointer; color: var(--color-primary-element, #1e3a5f); text-align: left; padding: 0; font: inherit; }
.pa-contacts__acties { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
</style>
