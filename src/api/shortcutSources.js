/**
 * Read-only list fetchers for Notes/Tasks/Contacts/Deck — the "load the
 * item list, clicking one deep-links to the real Nextcloud app in a new
 * tab" scope Ramin picked (2026-09-09) over rebuilding those 3 apps'
 * full UIs a second time inside this one. Each is a thin port of the
 * matching Android source (NotesSource.kt/DeckSource.kt/CardDavSource.kt/
 * NextcloudSource.searchTasks) — same REST/CalDAV/CardDAV contracts,
 * running here over the browser's own session cookie via @nextcloud/axios
 * instead of Basic-Auth-with-app-password.
 */

import axios from '@nextcloud/axios'
import { generateUrl, generateRemoteUrl } from '@nextcloud/router'
import { getCurrentUser } from '@nextcloud/auth'
import { WEB } from '../mode.js'
import * as paApi from './paApi.js'
import { getAccessCode } from './accessCode.js'
import { t } from '../l10n/index.js'

// In de web-jas is er geen Nextcloud: notities, taken en Deck staan dan bij
// ons (account/notes|tasks|deck/*.php; Ramin, 2026-09-13). Dezelfde
// lijstvormen als hieronder, zodat de schermen niets hoeven te weten.
function code() {
	const c = getAccessCode()
	if (!c) throw new Error(t('Enter your USER-API code first.'))
	return c
}
// ---- Notes (apps/notes/api/v1/notes) ----

export async function listNotes() {
	if (WEB) return paApi.accountNotes(code())
	const response = await axios.get(generateUrl('/apps/notes/api/v1/notes'), {
		params: { exclude: 'content', pruneBefore: 0 },
		headers: { Accept: 'application/json' },
	})
	return response.data
}

export function noteUrl(note) {
	if (WEB) return null
	return origin() + generateUrl('/apps/notes/note/' + note.id)
}

// ---- Deck (apps/deck/api/v1.0) ----

export async function listDeckBoards() {
	if (WEB) return (await paApi.accountDeck(code())).filter((b) => !b.archived)
	const response = await axios.get(generateUrl('/apps/deck/api/v1.0/boards'), {
		headers: { Accept: 'application/json', 'OCS-APIRequest': 'true' },
	})
	// Deck verwijdert een bord niet echt maar zet deletedAt; zonder deze
	// filter bleven verwijderde borden als tabblad staan (LAN-test 2026-09-14).
	return (response.data || []).filter((b) => !b.archived && !b.deletedAt)
}

/** De kaarten van een bord, met hun termijn als dag. */
export async function listDeckCards(board) {
	if (WEB) {
		return (board.stacks || []).flatMap((s) => (s.cards || []).map((c) => ({
			id: c.id, title: c.title, done: !!c.done,
			due: c.duedate ? String(c.duedate).slice(0, 10) : null,
			board: board.title, stack: s.title, stackId: s.id,
		})))
	}
	const response = await axios.get(generateUrl('/apps/deck/api/v1.0/boards/' + board.id + '/stacks'), {
		headers: { Accept: 'application/json', 'OCS-APIRequest': 'true' },
	})
	const out = []
	for (const stack of response.data || []) {
		for (const card of stack.cards || []) {
			out.push({
				id: card.id,
				title: card.title,
				done: !!card.done || !!card.archived,
				due: card.duedate ? String(card.duedate).slice(0, 10) : null,
				board: board.title,
			})
		}
	}
	return out
}

export function boardUrl(board) {
	if (WEB) return null
	return origin() + generateUrl('/apps/deck/board/' + board.id)
}

// ---- Tasks (VTODO over the same CalDAV calendars Today already reads) ----

const REPORT_TASKS_BODY = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VTODO"/>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`

/** @param {{href: string}} calendar */
export async function listTasks(calendar) {
	if (WEB) {
		return (await paApi.accountTasks(code(), 'all')).map((x) => ({
			href: 'task-' + x.id, id: x.id, summary: x.summary, completed: !!x.completed,
			due: x.due ? String(x.due).slice(0, 10) : null,
			start: x.start ? String(x.start).slice(0, 10) : null,
			notes: x.notes || '', priority: Number(x.priority || 0), calendarName: t('My tasks'),
			uid: 'task-' + x.id, parentUid: x.parentId ? 'task-' + x.parentId : null,
		}))
	}
	const url = calendar.href.startsWith('http') ? calendar.href : origin() + calendar.href
	const response = await axios({
		method: 'REPORT',
		url,
		headers: { Depth: '1', 'Content-Type': 'application/xml' },
		data: REPORT_TASKS_BODY,
	})
	const doc = parseXml(response.data)
	const responses = Array.from(doc.getElementsByTagNameNS('*', 'response'))
	const tasks = []
	for (const el of responses) {
		const href = firstChildText(el, 'href')
		const dataNode = el.getElementsByTagNameNS('*', 'calendar-data')[0]
		if (!href || !dataNode || !dataNode.textContent) continue
		const task = parseVtodo(dataNode.textContent, href)
		if (task) tasks.push({ ...task, calendarName: calendar.displayName, calendarHref: calendar.href })
	}
	return tasks
}

function parseVtodo(raw, href) {
	let summary = null
	let completed = false
	let due = null
	let notes = ''
	let priority = 0
	let uid = null
	let parentUid = null
	let start = null
	for (const line of unfold(raw)) {
		const colonIdx = line.indexOf(':')
		if (colonIdx < 0) continue
		const head = line.substring(0, colonIdx).split(';')[0].toUpperCase()
		const value = line.substring(colonIdx + 1)
		if (head === 'SUMMARY') summary = icsOntsnap(value)
		if (head === 'DESCRIPTION') notes = icsOntsnap(value)
		if (head === 'PRIORITY') priority = parseInt(value, 10) || 0
		if (head === 'UID') uid = value.trim()
		// Subtaak: RELATED-TO wijst naar de UID van de bovenliggende taak.
		if (head === 'RELATED-TO' && !/RELTYPE=(CHILD|SIBLING)/i.test(line.substring(0, colonIdx))) parentUid = value.trim()
		if (head === 'STATUS') completed = value.trim() === 'COMPLETED'
		// De termijn, als dag: 20260915 of 20260915T180000Z -> 2026-09-15.
		if (head === 'DUE') {
			const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim())
			if (m) due = m[1] + '-' + m[2] + '-' + m[3]
		}
		// Begindatum (kaart 34): DTSTART als dag.
		if (head === 'DTSTART') {
			const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim())
			if (m) start = m[1] + '-' + m[2] + '-' + m[3]
		}
	}
	if (!summary) return null
	return { href, summary, completed, due, start, notes, priority, raw, uid, parentUid }
}

// Nextcloud Tasks has no reliable client-derivable per-task deep link (its
// internal list id isn't exposed over CalDAV) — the app's own root is the
// one link guaranteed not to 404.
export function tasksAppUrl() {
	if (WEB) return null
	return origin() + generateUrl('/apps/tasks/')
}

// ---- Contacts (CardDAV) ----

const PROPFIND_ADDRESSBOOKS_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`

const REPORT_LIST_ALL_BODY = `<?xml version="1.0" encoding="utf-8"?>
<c:addressbook-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:getetag/>
    <c:address-data/>
  </d:prop>
  <c:filter/>
</c:addressbook-query>`

export async function discoverAddressBooks() {
	if (WEB) return [{ href: 'account', displayName: t('My contacts') }]
	const user = getCurrentUser()?.uid
	if (!user) throw new Error('Not logged in')
	const url = generateRemoteUrl(`dav/addressbooks/users/${encodeURIComponent(user)}/`)
	const response = await axios({
		method: 'PROPFIND',
		url,
		headers: { Depth: '1', 'Content-Type': 'application/xml' },
		data: PROPFIND_ADDRESSBOOKS_BODY,
	})
	const doc = parseXml(response.data)
	const responses = Array.from(doc.getElementsByTagNameNS('*', 'response'))
	const homePath = new URL(url, origin()).pathname
	const addressBooks = []
	for (const el of responses) {
		const href = firstChildText(el, 'href')
		if (!href) continue
		if (href.replace(/\/$/, '') + '/' === homePath) continue
		const resourceTypeEl = el.getElementsByTagNameNS('*', 'resourcetype')[0]
		const isAddressBook = resourceTypeEl && resourceTypeEl.getElementsByTagNameNS('*', 'addressbook').length > 0
		if (!isAddressBook) continue
		const displayName = firstChildText(el, 'displayname')
		if (!displayName) continue
		addressBooks.push({ href, displayName })
	}
	return addressBooks
}

/** @param {{href: string}} addressBook */
export async function listContacts(addressBook) {
	if (WEB) {
		return (await paApi.accountContacts(code())).map((c) => ({
			href: 'acc-' + c.id, id: c.id, fullName: c.fullName, phones: c.phones || [], emails: c.emails || [], birthday: c.birthday || null,
			organisation: c.organisation || '', address: c.address || '', notes: c.notes || '',
		}))
	}
	const url = addressBook.href.startsWith('http') ? addressBook.href : origin() + addressBook.href
	const response = await axios({
		method: 'REPORT',
		url,
		headers: { Depth: '1', 'Content-Type': 'application/xml' },
		data: REPORT_LIST_ALL_BODY,
	})
	const doc = parseXml(response.data)
	const responses = Array.from(doc.getElementsByTagNameNS('*', 'response'))
	const contacts = []
	for (const el of responses) {
		const href = firstChildText(el, 'href')
		const dataNode = el.getElementsByTagNameNS('*', 'address-data')[0]
		if (!href || !dataNode || !dataNode.textContent) continue
		const contact = parseVcard(dataNode.textContent, href)
		if (contact) contacts.push(contact)
	}
	return contacts.sort((a, b) => a.fullName.localeCompare(b.fullName))
}

function unfold(raw) {
	const rawLines = raw.split(/\r\n|\n/)
	const unfolded = []
	for (const line of rawLines) {
		if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length) {
			unfolded[unfolded.length - 1] += line.substring(1)
		} else if (line) {
			unfolded.push(line)
		}
	}
	return unfolded
}

function parseVcard(raw, href) {
	const lines = unfold(raw)
	let fullName = null
	let birthday = null
	let organisation = ''
	let address = ''
	let notes = ''
	let uid = null
	const phones = []
	const emails = []
	for (const line of lines) {
		const colonIdx = line.indexOf(':')
		if (colonIdx < 0) continue
		const head = line.substring(0, colonIdx).split(';')[0].toUpperCase()
		const value = line.substring(colonIdx + 1)
		if (head === 'FN') fullName = unescapeVcardText(value)
		if (head === 'TEL') phones.push(unescapeVcardText(value))
		if (head === 'EMAIL') emails.push(unescapeVcardText(value))
		if (head === 'BDAY') birthday = value.trim()
		if (head === 'UID') uid = value.trim()
		if (head === 'ORG' && !organisation) organisation = unescapeVcardText(value).replace(/;+$/, '').replace(/;/g, ', ')
		if (head === 'NOTE' && !notes) notes = unescapeVcardText(value)
		// ADR: postbus;extra;straat;plaats;provincie;postcode;land — als één regel.
		if (head === 'ADR' && !address) address = value.split(';').map((d) => unescapeVcardText(d).trim()).filter(Boolean).join(', ')
	}
	if (!fullName) return null
	return { href, uid, fullName, phones, emails, birthday, organisation, address, notes, raw }
}

function unescapeVcardText(value) {
	return value.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

// Same reasoning as tasksAppUrl() — the Contacts app's own permalink scheme
// isn't reliably derivable from a CardDAV href alone, so this links to the
// app root rather than risk a wrong/404 per-contact deep link.
export function contactsAppUrl() {
	return origin() + generateUrl('/apps/contacts/')
}

// ---- Bewerken (Ramin, 2026-09-14: eigen editors, geen doorklik) ----

const NOTES_HEADERS = { Accept: 'application/json' }
const DECK_HEADERS = { Accept: 'application/json', 'OCS-APIRequest': 'true' }

// De Nextcloud-oorsprong (http://host/), voor DAV-paden die relatief
// terugkomen. Ontbrak samen met de twee imports hierboven: in de
// Nextcloud-jas gaf elke notitie/Deck/contact-actie een ReferenceError
// (gevonden bij de LAN-test 2026-09-14; de web-jas merkte er niets van
// omdat die alleen de WEB-takken loopt).
function origin() {
	return window.location.origin
}

// Ook weggevallen bij dezelfde herschrijving (gevonden 2026-09-14 in de
// Nextcloud-jas: "parseXml is not defined" op het contactenscherm).
function parseXml(xmlText) {
	return new DOMParser().parseFromString(xmlText, 'application/xml')
}

function firstChildText(el, localName) {
	const node = el.getElementsByTagNameNS('*', localName)[0]
	return node ? node.textContent : null
}

function nieuweUid() {
	return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function absoluut(href) {
	return href.startsWith('http') ? href : origin() + href
}

// Het omgekeerde van icsTekst: "Apeldoorn\, Defensie" wordt weer
// "Apeldoorn, Defensie" (gezien in de takenlijst, 2026-09-14).
function icsOntsnap(text) {
	return String(text ?? '').replace(/\\n/g, '\n').replace(/\\([,;\\])/g, '$1')
}

function icsTekst(text) {
	return String(text ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// Notities
export async function getNote(note) {
	if (WEB) return note
	const r = await axios.get(generateUrl('/apps/notes/api/v1/notes/' + note.id), { headers: NOTES_HEADERS })
	return r.data
}
export async function createNote({ title, content, category = '' }) {
	if (WEB) return paApi.saveAccountNote(code(), { title, content, category: category || null })
	const r = await axios.post(generateUrl('/apps/notes/api/v1/notes'), { title, content, category }, { headers: NOTES_HEADERS })
	return r.data
}
export async function updateNote(note, { title, content, category, favorite }) {
	const cat = category !== undefined ? category : (note.category || '')
	const fav = favorite !== undefined ? !!favorite : !!note.favorite
	if (WEB) return paApi.saveAccountNote(code(), { id: note.id, title, content, category: cat || null, favorite: fav })
	const r = await axios.put(generateUrl('/apps/notes/api/v1/notes/' + note.id), { title, content, category: cat, favorite: fav }, { headers: NOTES_HEADERS })
	return r.data
}
export async function deleteNote(id) {
	if (WEB) return paApi.deleteAccountNote(code(), id)
	await axios.delete(generateUrl('/apps/notes/api/v1/notes/' + id))
}

// Taken: bij ons, of als VTODO in de eerste gekozen agenda
export async function createTask({ summary, due, calendar, notes = '', priority = 0, parent = null, start = null }) {
	if (WEB) return paApi.saveAccountTask(code(), { summary, due: due ? due + 'T12:00:00Z' : null, start: start ? start + 'T12:00:00Z' : null, notes: notes || null, priority: priority || 0, parentId: parent ? parent.id : null })
	if (!calendar) throw new Error(t('Pick a calendar in Settings first.'))
	const uid = nieuweUid()
	const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
	const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PersonalAssistant//EN', 'BEGIN:VTODO', `UID:${uid}`, `DTSTAMP:${stamp}`, `SUMMARY:${icsTekst(summary)}`, 'STATUS:NEEDS-ACTION']
	if (due) lines.push(`DUE;VALUE=DATE:${String(due).replace(/-/g, '')}`)
	if (start) lines.push(`DTSTART;VALUE=DATE:${String(start).replace(/-/g, '')}`)
	if (notes) lines.push(`DESCRIPTION:${icsTekst(notes)}`)
	if (priority) lines.push(`PRIORITY:${priority}`)
	if (parent && parent.uid) lines.push(`RELATED-TO:${parent.uid}`)
	lines.push('END:VTODO', 'END:VCALENDAR')
	await axios({
		method: 'PUT',
		url: absoluut(calendar.href).replace(/\/?$/, '/') + `${uid}.ics`,
		headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'If-None-Match': '*' },
		data: lines.join('\r\n') + '\r\n',
	})
	return { uid }
}
export async function setTaskDone(task, done) {
	if (WEB) return paApi.saveAccountTask(code(), { id: task.id, summary: task.summary, completed: !!done })
	const url = absoluut(task.href)
	const r = await axios.get(url, { headers: { Accept: 'text/calendar' } })
	let ics = String(r.data)
	ics = ics.replace(/^STATUS:.*\r?\n/gm, '').replace(/^PERCENT-COMPLETE:.*\r?\n/gm, '').replace(/^COMPLETED:.*\r?\n/gm, '')
	const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
	const extra = done ? `STATUS:COMPLETED\r\nPERCENT-COMPLETE:100\r\nCOMPLETED:${stamp}\r\n` : 'STATUS:NEEDS-ACTION\r\n'
	ics = ics.replace(/END:VTODO/, extra + 'END:VTODO')
	await axios({ method: 'PUT', url, headers: { 'Content-Type': 'text/calendar; charset=utf-8' }, data: ics })
}
export async function deleteTask(task) {
	if (WEB) return paApi.deleteAccountTask(code(), task.id)
	await axios({ method: 'DELETE', url: absoluut(task.href) })
}

// Deck
/**
 * Lijsten met kaarten. Per kaart ook: owner (wie verantwoordelijk is; in
 * Deck de toegewezen gebruiker, anders de maker), status (open | busy |
 * waiting | finished; Deck kent alleen open/finished) en attachments (aantal
 * plaatjes). Ramin, 2026-09-14: Deck volwaardig.
 */
export async function listDeckStacks(board) {
	if (WEB) return (board.stacks || []).map((s) => ({ ...s, order: s.position ?? 0, boardId: board.id, cards: (s.cards || []).map((c) => ({ ...c, order: c.position ?? 0, status: c.status || (c.done ? 'finished' : 'open'), attachments: c.attachments || 0 })) }))
	const r = await axios.get(generateUrl('/apps/deck/api/v1.0/boards/' + board.id + '/stacks'), { headers: DECK_HEADERS })
	return (r.data || []).map((s) => ({ id: s.id, title: s.title, order: s.order ?? 0, boardId: board.id, cards: (s.cards || []).map((c) => {
		const toegewezen = (c.assignedUsers || []).map((a) => (a.participant && (a.participant.displayname || a.participant.uid)) || a.participant || '').filter(Boolean)
		const done = !!c.done || !!c.archived
		return { id: c.id, title: c.title, duedate: c.duedate || null, startdate: c.startdate || null, done, status: done ? 'finished' : 'open', order: c.order, description: c.description || '', owner: toegewezen[0] || (c.owner && (c.owner.displayname || c.owner.uid)) || c.owner || null, ownerUid: (c.owner && c.owner.uid) || c.owner || null, assignedUids: (c.assignedUsers || []).map((a) => (a.participant && a.participant.uid) || '').filter(Boolean), createdAt: c.createdAt || null, attachments: c.attachmentCount || 0, labels: (c.labels || []).map((l) => ({ id: l.id, title: l.title, color: l.color })) }
	}) }))
}

/** Kaarten binnen een lijst in een nieuwe volgorde (ids), eventueel uit een andere lijst erbij. */
export async function reorderCards(board, stack, ids) {
	if (WEB) return paApi.reorderAccountDeck(code(), { type: 'cards', ids, stack_id: stack.id })
	for (const [i, id] of ids.entries()) {
		const van = (stack.cards || []).find((c) => c.id === id) ? stack.id : null
		await axios.put(generateUrl('/apps/deck/api/v1.0/boards/' + board.id + '/stacks/' + (van || stack.id) + '/cards/' + id + '/reorder'), { order: i, stackId: stack.id }, { headers: DECK_HEADERS })
	}
}

/** Lijsten van een bord in een nieuwe volgorde. */
export async function reorderStacks(board, stacks) {
	if (WEB) return paApi.reorderAccountDeck(code(), { type: 'stacks', ids: stacks.map((s) => s.id) })
	for (const [i, st] of stacks.entries()) {
		await axios.put(generateUrl('/apps/deck/api/v1.0/boards/' + board.id + '/stacks/' + st.id), { title: st.title, order: i }, { headers: DECK_HEADERS })
	}
}

/** In Deck: mijzelf toewijzen of weghalen (bij ons is owner een vrije naam, zie updateCard). */
export async function assignMe(board, stack, card, aan) {
	if (WEB) return
	const uid = getCurrentUser()?.uid
	if (!uid) return
	await axios.put(generateUrl('/apps/deck/api/v1.0/boards/' + board.id + '/stacks/' + stack.id + '/cards/' + card.id + (aan ? '/assignUser' : '/unassignUser')), { userId: uid }, { headers: DECK_HEADERS })
}

// ---- Plaatjes bij een kaart (Ramin, 2026-09-14: "voeg picture(s) toe, openen en verwijderen per item") ----

/** [{id, name, mime, size, url?}] — bij ons zonder url (haal op met attachmentDataUrl), in Deck met een directe url. */
export async function listAttachments(board, stack, card) {
	if (WEB) return paApi.accountDeckAttachments(code(), card.id)
	const r = await axios.get(generateUrl('/apps/deck/api/v1.1/boards/' + board.id + '/stacks/' + stack.id + '/cards/' + card.id + '/attachments'), { headers: DECK_HEADERS })
	return (r.data || []).filter((a) => !a.deletedAt).map((a) => ({
		id: a.id, name: (a.extendedData && a.extendedData.path ? String(a.extendedData.path).split('/').pop() : a.data) || String(a.id),
		mime: (a.extendedData && a.extendedData.mimetype) || '', size: (a.extendedData && a.extendedData.filesize) || 0, type: a.type,
		url: generateUrl('/apps/deck/cards/' + card.id + '/attachment/' + a.id),
	}))
}

/** Een plaatje als data-url (voor <img>), of de directe url in Deck. */
export async function attachmentDataUrl(att) {
	if (att.url) return att.url
	const a = await paApi.accountDeckAttachment(code(), att.id)
	return 'data:' + a.mime + ';base64,' + a.data
}

/** Een plaatje (File) toevoegen; de aanroeper heeft het al verkleind. */
export async function addAttachment(board, stack, card, file) {
	if (WEB) {
		const b64 = await new Promise((ok, nee) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = nee; r.readAsDataURL(file) })
		return paApi.addAccountDeckAttachment(code(), { card_id: card.id, name: file.name, mime: file.type, data: b64 })
	}
	const form = new FormData()
	form.append('type', 'file')
	form.append('file', file, file.name)
	await axios.post(generateUrl('/apps/deck/api/v1.1/boards/' + board.id + '/stacks/' + stack.id + '/cards/' + card.id + '/attachments'), form, { headers: { ...DECK_HEADERS, 'Content-Type': 'multipart/form-data' } })
}

export async function deleteAttachment(board, stack, card, att) {
	if (WEB) return paApi.deleteAccountDeckAttachment(code(), att.id)
	await axios.delete(generateUrl('/apps/deck/api/v1.1/boards/' + board.id + '/stacks/' + stack.id + '/cards/' + card.id + '/attachments/' + att.id + '?type=' + encodeURIComponent(att.type || 'file')), { headers: DECK_HEADERS })
}
export async function createBoard(title) {
	if (WEB) return paApi.saveAccountDeck(code(), { type: 'board', title })
	const r = await axios.post(generateUrl('/apps/deck/api/v1.0/boards'), { title, color: '1e3a5f' }, { headers: DECK_HEADERS })
	const board = r.data
	// Een nieuw bord begint met de drie lijsten die iedereen toch maakt.
	for (const [i, naam] of ['To do', 'Doing', 'Done'].entries()) {
		await axios.post(generateUrl('/apps/deck/api/v1.0/boards/' + board.id + '/stacks'), { title: naam, order: i }, { headers: DECK_HEADERS })
	}
	return board
}
export async function createStack(board, title) {
	if (WEB) return paApi.saveAccountDeck(code(), { type: 'stack', board_id: board.id, title, position: 99 })
	const r = await axios.post(generateUrl('/apps/deck/api/v1.0/boards/' + board.id + '/stacks'), { title, order: 99 }, { headers: DECK_HEADERS })
	return r.data
}
export async function createCard(board, stack, title, due = null, { owner = null } = {}) {
	if (WEB) return paApi.saveAccountDeck(code(), { type: 'card', title, stack_id: stack.id, duedate: due, owner: owner || '', position: 999 })
	// Zonder datum: eind over een week (Ramin, kaart 32; de Nextcloud-Deck kent geen begindatum).
	const einde = due || new Date(Date.now() + 7 * 86400000).toISOString()
	const r = await axios.post(generateUrl('/apps/deck/api/v1.0/boards/' + board.id + '/stacks/' + stack.id + '/cards'), { title, type: 'plain', order: 999, duedate: einde }, { headers: DECK_HEADERS })
	return r.data
}
export async function setCardDone(board, stack, card, done) {
	if (WEB) return paApi.saveAccountDeck(code(), { type: 'card', id: card.id, title: card.title, stack_id: stack.id, duedate: card.duedate || null, done: !!done })
	// Deck 1.18 weigert de update (400) zonder owner (LAN-test 2026-09-14).
	await axios.put(generateUrl('/apps/deck/api/v1.0/boards/' + board.id + '/stacks/' + stack.id + '/cards/' + card.id), {
		title: card.title, type: 'plain', order: card.order ?? 0, description: card.description || '', duedate: card.duedate || null, owner: card.owner || getCurrentUser()?.uid, done: done ? new Date().toISOString() : null,
	}, { headers: DECK_HEADERS })
}
export async function deleteCard(board, stack, card) {
	if (WEB) return paApi.deleteAccountDeck(code(), 'card', card.id)
	await axios.delete(generateUrl('/apps/deck/api/v1.0/boards/' + board.id + '/stacks/' + stack.id + '/cards/' + card.id), { headers: DECK_HEADERS })
}

export async function deleteStack(board, stack) {
	if (WEB) return paApi.deleteAccountDeck(code(), 'stack', stack.id)
	await axios.delete(generateUrl('/apps/deck/api/v1.0/boards/' + board.id + '/stacks/' + stack.id), { headers: DECK_HEADERS })
}
export async function deleteBoard(board) {
	if (WEB) return paApi.deleteAccountDeck(code(), 'board', board.id)
	await axios.delete(generateUrl('/apps/deck/api/v1.0/boards/' + board.id), { headers: DECK_HEADERS })
}

// Contacten
/**
 * Een vCard opbouwen uit onze velden. Bij een bestaande kaart blijven de
 * regels die wij niet beheren (foto, categorieën, …) staan; alleen naam,
 * nummers, adressen, verjaardag, organisatie, adres en notitie worden
 * vervangen (Ramin, 2026-09-14: volwaardige contacten).
 */
function bouwVcard(basisRaw, uid, { fullName, phones = [], emails = [], birthday, organisation, address, notes }) {
	const eigen = /^(FN|N|TEL|EMAIL|BDAY|ORG|ADR|NOTE|END)[;:]/i
	const lines = basisRaw
		? unfold(basisRaw).filter((l) => !eigen.test(l))
		: ['BEGIN:VCARD', 'VERSION:3.0', `UID:${uid}`]
	const delen = String(fullName).trim().split(/\s+/)
	const achternaam = delen.length > 1 ? delen[delen.length - 1] : ''
	const voornaam = delen.length > 1 ? delen.slice(0, -1).join(' ') : delen[0]
	lines.push(`FN:${icsTekst(fullName)}`, `N:${icsTekst(achternaam)};${icsTekst(voornaam)};;;`)
	for (const tel of phones.filter(Boolean)) lines.push(`TEL;TYPE=CELL:${icsTekst(tel)}`)
	for (const mail of emails.filter(Boolean)) lines.push(`EMAIL;TYPE=INTERNET:${icsTekst(mail)}`)
	if (birthday) lines.push(`BDAY:${String(birthday)}`)
	if (organisation) lines.push(`ORG:${icsTekst(organisation)}`)
	if (address) lines.push(`ADR;TYPE=HOME:;;${icsTekst(address)};;;;`)
	if (notes) lines.push(`NOTE:${icsTekst(notes)}`)
	lines.push('END:VCARD')
	return lines.join('\r\n') + '\r\n'
}

function contactVelden({ fullName, phone, email, phones, emails, birthday, organisation, address, notes }) {
	const tels = (phones && phones.length ? phones : [phone]).filter(Boolean)
	const mails = (emails && emails.length ? emails : [email]).filter(Boolean)
	return { fullName, phones: tels, emails: mails, birthday: birthday || null, organisation: organisation || '', address: address || '', notes: notes || '' }
}

export async function createContact(addressBook, velden) {
	const v = contactVelden(velden)
	if (WEB) return paApi.saveAccountContact(code(), { ...v, phone: v.phones[0] || null, email: v.emails[0] || null })
	if (!addressBook) throw new Error('No address book')
	const uid = nieuweUid()
	await axios({
		method: 'PUT',
		url: absoluut(addressBook.href).replace(/\/?$/, '/') + `${uid}.vcf`,
		headers: { 'Content-Type': 'text/vcard; charset=utf-8', 'If-None-Match': '*' },
		data: bouwVcard(null, uid, v),
	})
	return { uid }
}

export async function updateContact(contact, velden) {
	const v = contactVelden(velden)
	if (WEB) return paApi.saveAccountContact(code(), { id: contact.id, ...v, phone: v.phones[0] || null, email: v.emails[0] || null })
	await axios({
		method: 'PUT',
		url: absoluut(contact.href),
		headers: { 'Content-Type': 'text/vcard; charset=utf-8' },
		data: bouwVcard(contact.raw || null, contact.uid || nieuweUid(), v),
	})
}
export async function deleteContact(contact) {
	if (WEB) return paApi.deleteAccountContact(code(), contact.id)
	await axios({ method: 'DELETE', url: absoluut(contact.href) })
}

// ---- Bijwerken (Ramin, 2026-09-14: volwaardige apps, ook zonder Nextcloud) ----

/** Titel, notitie, termijn en prioriteit van een taak; afvinken gaat via setTaskDone. */
export async function updateTask(task, { summary, notes, due, priority, parentUid, start = null }) {
	const ouderGegeven = parentUid !== undefined
	if (WEB) return paApi.saveAccountTask(code(), { id: task.id, summary, notes: notes || null, due: due ? due + 'T12:00:00Z' : null, start: start ? start + 'T12:00:00Z' : null, priority: priority || 0, ...(ouderGegeven ? { parentId: parentUid ? Number(String(parentUid).replace('task-', '')) : null } : {}) })
	const url = absoluut(task.href)
	const r = await axios.get(url, { headers: { Accept: 'text/calendar' } })
	// Eerst de gevouwen regels rechttrekken, anders blijft de staart van een
	// lange DESCRIPTION als losse regel achter.
	let ics = String(r.data).replace(/\r?\n[ \t]/g, '')
	ics = ics.replace(/^(SUMMARY|DESCRIPTION|DUE|DTSTART|PRIORITY|LAST-MODIFIED)[;:].*\r?\n/gm, '')
	if (ouderGegeven) ics = ics.replace(/^RELATED-TO[;:].*\r?\n/gm, '')
	const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
	const extra = [`SUMMARY:${icsTekst(summary)}`, `LAST-MODIFIED:${stamp}`]
	if (ouderGegeven && parentUid) extra.push(`RELATED-TO:${parentUid}`)
	if (notes) extra.push(`DESCRIPTION:${icsTekst(notes)}`)
	if (due) extra.push(`DUE;VALUE=DATE:${String(due).replace(/-/g, '')}`)
	if (start) extra.push(`DTSTART;VALUE=DATE:${String(start).replace(/-/g, '')}`)
	if (priority) extra.push(`PRIORITY:${priority}`)
	ics = ics.replace(/^END:VTODO/m, extra.join('\r\n') + '\r\nEND:VTODO')
	await axios({ method: 'PUT', url, headers: { 'Content-Type': 'text/calendar; charset=utf-8' }, data: ics })
}

/**
 * Een Deck-kaart bijwerken: titel, beschrijving, begin- en einddatum, af, en
 * eventueel naar een andere lijst (stackId). Deck 1.18 wil bij een PUT ook
 * de eigenaar mee, en verplaatsen gaat via /reorder.
 */
export async function updateCard(board, stack, card, { title, description, duedate, startdate, done, stackId, owner, status, position }) {
	const naarStack = stackId && stackId !== stack.id ? stackId : null
	// Status en klaar horen bij elkaar: finished = klaar, elke andere status = niet klaar.
	const st = status || (done ? 'finished' : (card.status && card.status !== 'finished' ? card.status : 'open'))
	const klaar = st === 'finished'
	if (WEB) {
		const body = {
			type: 'card', id: card.id, title, description: description || '', duedate: duedate || null, startdate: startdate || null,
			done: klaar, status: st, stack_id: naarStack || stack.id, position: position ?? card.order ?? 0,
		}
		if (owner !== undefined) body.owner = owner || ''
		return paApi.saveAccountDeck(code(), body)
	}
	await axios.put(generateUrl('/apps/deck/api/v1.0/boards/' + board.id + '/stacks/' + stack.id + '/cards/' + card.id), {
		title, type: 'plain', order: position ?? card.order ?? 0, description: description || '', duedate: duedate || null, startdate: startdate || null,
		owner: card.ownerUid || getCurrentUser()?.uid, done: klaar ? (card.doneAt || new Date().toISOString()) : null,
	}, { headers: DECK_HEADERS })
	if (naarStack) {
		await axios.put(generateUrl('/apps/deck/api/v1.0/boards/' + board.id + '/stacks/' + stack.id + '/cards/' + card.id + '/reorder'), { order: 999, stackId: naarStack }, { headers: DECK_HEADERS })
	}
}

export async function renameBoard(board, title) {
	if (WEB) return paApi.saveAccountDeck(code(), { type: 'board', id: board.id, title, color: board.color || null })
	await axios.put(generateUrl('/apps/deck/api/v1.0/boards/' + board.id), { title, color: board.color || '1e3a5f' }, { headers: DECK_HEADERS })
}

export async function renameStack(board, stack, title) {
	if (WEB) return paApi.saveAccountDeck(code(), { type: 'stack', id: stack.id, board_id: board.id, title, position: stack.position ?? stack.order ?? 0 })
	await axios.put(generateUrl('/apps/deck/api/v1.0/boards/' + board.id + '/stacks/' + stack.id), { title, order: stack.order ?? 0 }, { headers: DECK_HEADERS })
}

// ---- Labels (Ramin, 2026-09-14: "labels en kleuren per kaart") ----

/** De labels van een bord: [{id, title, color}] (kleur als hex zonder #). */
export async function boardLabels(board) {
	if (WEB) return board.labels || []
	const r = await axios.get(generateUrl('/apps/deck/api/v1.0/boards/' + board.id), { headers: DECK_HEADERS })
	return (r.data.labels || []).map((l) => ({ id: l.id, title: l.title, color: l.color }))
}

export async function createLabel(board, title, color) {
	if (WEB) {
		const bestaand = board.labels || []
		const id = bestaand.reduce((m, l) => Math.max(m, Number(l.id) || 0), 0) + 1
		return paApi.saveAccountDeck(code(), { type: 'board', id: board.id, title: board.title, color: board.color || null, labels: [...bestaand, { id, title, color }] })
	}
	await axios.post(generateUrl('/apps/deck/api/v1.0/boards/' + board.id + '/labels'), { title, color }, { headers: DECK_HEADERS })
}

/** Welke labels een kaart draagt: bij ons in één keer, in Deck per label toewijzen of weghalen. */
export async function setCardLabels(board, stack, card, labelIds) {
	if (WEB) {
		return paApi.saveAccountDeck(code(), {
			type: 'card', id: card.id, title: card.title, description: card.description || '', duedate: card.duedate || null, startdate: card.startdate || null,
			done: !!card.done, stack_id: stack.id, position: card.order ?? 0, labels: labelIds,
		})
	}
	const huidig = new Set((card.labels || []).map((l) => l.id))
	const basis = generateUrl('/apps/deck/api/v1.0/boards/' + board.id + '/stacks/' + stack.id + '/cards/' + card.id)
	for (const id of labelIds) if (!huidig.has(id)) await axios.put(basis + '/assignLabel', { labelId: id }, { headers: DECK_HEADERS })
	for (const id of huidig) if (!labelIds.includes(id)) await axios.put(basis + '/removeLabel', { labelId: id }, { headers: DECK_HEADERS })
}
