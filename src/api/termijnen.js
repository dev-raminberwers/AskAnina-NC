/**
 * Termijnen: taken met een DUE en Deck-kaarten met een datum, één plek voor
 * het scherm Nog open én het dunne kaartje "Open taken" op de tijdlijn
 * (Ramin, 2026-09-14). In Nextcloud uit de agenda-taken en Deck, in de
 * web-jas uit de taken en Deck bij ons — dat verschil zit al in
 * shortcutSources.js.
 */
import { discoverCalendars } from './nextcloudCalendar.js'
import { listTasks, listDeckBoards, listDeckCards } from './shortcutSources.js'

export function dagSleutel(d) {
	const x = new Date(d)
	return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0')
}

/**
 * @param {number|null} dagenVooruit hoe ver we kijken; null = geen grens.
 * @param {boolean} ookZonderDatum ook taken en kaarten zonder datum meenemen
 *   (het kaartje "Open taken": die tellen als "nog ruim op tijd").
 * @returns {Promise<Array<{title: string, due: string|null, bron: string, verlopen: boolean}>>} op datum gesorteerd, zonder datum achteraan
 */
export async function laadTermijnen(dagenVooruit = 2, ookZonderDatum = false) {
	const vandaag = dagSleutel(new Date())
	const grens = dagenVooruit === null ? null : dagSleutel(new Date(Date.now() + dagenVooruit * 86400000))
	const termijnen = []
	try {
		// Deck spiegelt elk bord als agenda ("app-generated--deck--board-6"):
		// die taken zijn dezelfde kaarten en telden dubbel (115 in plaats van
		// ~50, gezien 2026-09-14).
		const alle = (await discoverCalendars()).filter((c) => !/app-generated--deck/.test(String(c.href || '')))
		const per = await Promise.all(alle.map((c) => listTasks(c).catch(() => [])))
		per.flat().filter((x) => !x.completed && (x.due || ookZonderDatum)).forEach((x) => termijnen.push({ title: x.summary, due: x.due || null, bron: 'task', verlopen: !!x.due && x.due < vandaag }))
	} catch (e) { /* geen Taken-app */ }
	try {
		const boards = await listDeckBoards()
		for (const board of boards) {
			const kaarten = await listDeckCards(board).catch(() => [])
			kaarten.filter((k) => !k.done && (k.due || ookZonderDatum)).forEach((k) => termijnen.push({ title: k.title, due: k.due || null, bron: 'deck', verlopen: !!k.due && k.due < vandaag, deckBoardId: board.id, deckCardId: k.id }))
		}
	} catch (e) { /* geen Deck */ }
	return termijnen
		.filter((d) => grens === null || (d.due !== null && d.due <= grens))
		.filter((d, i, lijst) => lijst.findIndex((x) => x.bron === d.bron && x.title === d.title && x.due === d.due) === i)
		.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
}

/** Rood = verlopen, geel = binnen twee dagen, groen = nog ruim op tijd. */
export function verdeling(termijnen) {
	const vandaag = dagSleutel(new Date())
	const straks = dagSleutel(new Date(Date.now() + 2 * 86400000))
	const rood = termijnen.filter((d) => d.due && d.due < vandaag).length
	const geel = termijnen.filter((d) => d.due && d.due >= vandaag && d.due <= straks).length
	return { rood, geel, groen: termijnen.length - rood - geel }
}
