/**
 * Zoeken bovenin (Ramin, 2026-09-15, kaart Search): een veld dat in een keer
 * zoekt in de instellingen en in je gegevens: afspraken, taken, Deck-kaarten,
 * notities, contacten, plekken. Elke bron apart, met try/catch, zodat een
 * bron die even niet werkt de rest niet tegenhoudt.
 */
import * as paApi from './paApi.js'
import { getAccessCode } from './accessCode.js'
import { WEB } from '../mode.js'
import { listNotes, listDeckBoards, listDeckStacks, listTasks, discoverAddressBooks, listContacts } from './shortcutSources.js'
import { listLocations, getSettings } from './nextcloudUserData.js'
import { fetchCalendarData, gekozenKalenders } from './nextcloudCalendar.js'
import { parseEventsForDay } from './icsEvents.js'
import { t, currentLocale } from '../l10n/index.js'

const INSTELLINGEN = () => [
	{ titel: t('My details'), tab: 'details', sub: null },
	{ titel: t('Work'), tab: 'details', sub: null },
	{ titel: t('Vehicles'), tab: 'details', sub: null },
	{ titel: t('Display'), tab: 'general', sub: null },
	{ titel: t('Calendars'), tab: 'general', sub: null },
	{ titel: t('Account'), tab: 'account', sub: null },
	{ titel: t('Nextcloud'), tab: 'account', sub: 'nextcloud' },
	{ titel: t('APIs'), tab: 'account', sub: 'apis' },
	{ titel: t('About'), tab: 'account', sub: 'about' },
]

let agendaCache = null
let agendaCacheOp = 0

function icsUtc(d) {
	return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Afspraken van -30 tot +120 dagen, twee minuten gecachet. */
async function afspraken() {
	if (agendaCache && Date.now() - agendaCacheOp < 120000) return agendaCache
	const uit = []
	if (WEB) {
		const rows = await paApi.listAppointments(getAccessCode())
		for (const a of rows || []) uit.push({ title: a.title, start: a.start_utc, location: a.location || '' })
		// Plus wat de telefoon uit zijn eigen agenda's spiegelt (-30 tot +120 dagen).
		try {
			const van = new Date(Date.now() - 30 * 86400000).toISOString()
			const tot = new Date(Date.now() + 120 * 86400000).toISOString()
			for (const m of (await paApi.mirrorEvents(getAccessCode(), van, tot)) || []) uit.push({ title: m.title, start: m.start || m.start_utc, location: m.location || '' })
		} catch (e) { /* zonder spiegel */ }
	} else {
		const kalenders = await gekozenKalenders(await getSettings())
		const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 30)
		const eind = new Date(start.getTime() + 150 * 86400000)
		const per = await Promise.all(kalenders.map(async (c) => {
			try { return { c, blokken: await fetchCalendarData(c, icsUtc(start), icsUtc(eind)) } } catch (e) { return { c, blokken: [] } }
		}))
		const gezien = new Set()
		for (let i = 0; i < 150; i++) {
			const dag = new Date(start.getTime() + i * 86400000)
			for (const { c, blokken } of per) {
				for (const blok of blokken) {
					for (const ev of parseEventsForDay(blok, dag, c)) {
						const k = ev.id + '|' + ev.start
						if (gezien.has(k)) continue
						gezien.add(k)
						uit.push({ title: ev.title, start: ev.start, location: ev.location || '' })
					}
				}
			}
		}
	}
	agendaCache = uit
	agendaCacheOp = Date.now()
	return uit
}

/**
 * De Deck-kaart met dit nummer, uit welk bord of welke stapel dan ook.
 *
 * De gewone Deck-zoekactie hieronder filtert op TEKST in titel en beschrijving; een nummer matcht daar
 * niet mee. En juist een kaart die al afgerond is wil je kunnen terugzoeken.
 */
async function deckOpNummer(nummer) {
	for (const b of await listDeckBoards()) {
		for (const s of await listDeckStacks(b)) {
			const kaart = (s.cards || []).find((c) => Number(c.id) === nummer)
			if (!kaart) continue
			return [{
				soort: t('Deck card'),
				titel: '#' + nummer + ' ' + kaart.title,
				onder: b.title + ' · ' + s.title,
				tab: 'deck',
				deck: { deckBoardId: b.id, deckCardId: kaart.id },
			}]
		}
	}
	return []
}

export async function zoek(vraag) {
	const q = String(vraag || '').trim().toLowerCase()
	if (q.length < 2) return []

	// "#119" is een Deck-kaartnummer, geen zoekterm (Ramin, 26-09). Noem je een nummer, dan wil je die ene
	// kaart -- niet alles waar toevallig 119 in staat. Dus hier eruit, met alleen dat resultaat.
	const nummer = /^#\s*(\d{1,9})$/.exec(q)
	if (nummer) return await deckOpNummer(Number(nummer[1]))

	const past = (...teksten) => teksten.some((x) => String(x || '').toLowerCase().includes(q))
	const uit = []
	for (const i of INSTELLINGEN()) {
		if (past(i.titel)) uit.push({ soort: t('Setting'), titel: i.titel, onder: '', tab: 'settings', settingsTab: i.tab, settingsSubTab: i.sub })
	}
	const nu = Date.now()
	const bronnen = [
		async () => {
			const lijst = (await afspraken()).filter((a) => past(a.title, a.location))
			lijst.sort((a, b) => Math.abs(new Date(a.start) - nu) - Math.abs(new Date(b.start) - nu))
			for (const a of lijst.slice(0, 15)) {
				const d = new Date(a.start)
				uit.push({ soort: t('Appointment'), titel: a.title, onder: [d.toLocaleString(currentLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), a.location].filter(Boolean).join(' · '), tab: 'today', date: d })
			}
		},
		async () => {
			if (!WEB) return
			for (const x of (await listTasks(null)).filter((x) => past(x.summary)).slice(0, 10)) uit.push({ soort: t('Task'), titel: x.summary, onder: x.due || '', tab: 'tasks', open: { soort: 'task', zoek: x.summary } })
		},
		async () => {
			for (const b of await listDeckBoards()) {
				for (const s of await listDeckStacks(b)) {
					// Met bord en kaart erbij: klikken opent die kaart zelf (kaart 104, Ramin, 2026-09-16).
					for (const c of (s.cards || []).filter((c) => past(c.title, c.description)).slice(0, 10)) uit.push({ soort: t('Deck card'), titel: c.title, onder: b.title + ' · ' + s.title, tab: 'deck', deck: { deckBoardId: b.id, deckCardId: c.id } })
				}
			}
		},
		async () => {
			for (const n of (await listNotes()).filter((n) => past(n.title, n.content)).slice(0, 10)) uit.push({ soort: t('Note'), titel: n.title, onder: String(n.content || '').replace(/\n/g, ' ').slice(0, 80), tab: 'notes', open: { soort: 'note', id: n.id } })
		},
		async () => {
			for (const boek of await discoverAddressBooks()) {
				for (const c of (await listContacts(boek)).filter((c) => past(c.fullName, ...(c.emails || []), ...(c.phones || []))).slice(0, 10)) uit.push({ soort: t('Contact'), titel: c.fullName, onder: [...(c.phones || []), ...(c.emails || [])].join(' · '), tab: 'contacts', open: { soort: 'contact', zoek: c.fullName } })
			}
		},
		async () => {
			for (const p of (await listLocations()).filter((p) => past(p.name, p.display_name, p.displayName)).slice(0, 10)) uit.push({ soort: t('Place'), titel: p.name, onder: p.display_name || p.displayName || '', tab: 'locations' })
		},
	]
	await Promise.all(bronnen.map((f) => f().catch(() => {})))
	return uit
}
