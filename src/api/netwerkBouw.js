/**
 * De regels van het netwerk: lijsten erin, knopen en lijnen eruit.
 *
 * Ramin, 27-09: *"Nextcloud is een grote database met allerlei data en wij verbinden die data aan elkaar
 * en later dat zien in een overzicht. En als iemand geen nextcloud heeft dan kan men kiezen voor een
 * MySQL database. Hun eigen of die van ons. Sterker in een Android telefoon zitten sql Light dus daar kan
 * zelfs dit ook nog gedaan worden."*
 *
 * Dat is de hele architectuur in drie zinnen, en dit bestand is de middelste laag ervan:
 *
 * ```
 * lijsten ophalen    per bak anders: onze MySQL, hun MySQL, Nextcloud, de telefoon
 * verbanden leggen   DIT BESTAND -- overal hetzelfde
 * tekenen            weet niet waar het vandaan komt
 * ```
 *
 * Daarom staan hier geen vragen aan een database. Een MySQL kun je vragen *geef me alle gesprekken met
 * een notitie*; Nextcloud is een la met bestanden en kan dat niet. Alles hier werkt met lijsten die al
 * in het geheugen staan, zodat dezelfde regels op alle vier de bakken kloppen.
 *
 * ## Dit bestaat twee keer, met opzet
 *
 * Dezelfde regels staan in `Lib\Pa\Netwerk` (PHP, voor wie bij ons opslaat). PHP en JavaScript kunnen
 * geen code delen, dus is er een testset: dezelfde lijsten erin, dezelfde grafiek eruit. Loopt er een uit
 * de pas, dan zie je dat meteen in plaats van over een half jaar in een scherm dat net iets anders telt.
 *
 * ## De vorm van wat erin gaat
 *
 * ```
 * ik            'p3'  -- welke mens jij bent
 * mensen        [{ id, naam, aanduiding, ikZelf, telefoon, email, bron, zeker }]
 * relaties      [{ id, van, naar, soort, context, bron, zeker }]
 * gesprekken    [{ id, nummer, naam, uitgaand, datum, minuten, notitie, taakTitel }]
 * dingen        [{ id, soort, naam }]            notities, taken, bonnen: alles wat geen mens is
 * koppelingen   [{ vanSoort, vanId, naarSoort, naarId, relatie, label, bron }]
 * ```
 */

/** Hoe vaak je iemand sprak, geteld -- en de gesprekken die iets opleverden, los. */
function gesprekRondes(lijsten, knoopVan, knopen, lijnen, ikId) {
	const perDoel = new Map()

	for (const g of lijsten.gesprekken || []) {
		const doel = knoopVan(g)
		if (!doel) continue

		const telling = perDoel.get(doel) || { n: 0, minuten: 0, laatst: null }
		telling.n += 1
		telling.minuten += g.minuten || 0
		if (!telling.laatst || (g.datum && g.datum > telling.laatst)) telling.laatst = g.datum || null
		perDoel.set(doel, telling)

		// Een gesprek waar iets uit kwam is een eigen knoop; de rest is een streepje in de telling.
		// Alle gesprekken tekenen maakt de mensen onvindbaar, en die zoek je juist.
		const heeftInhoud = (g.notitie && g.notitie.trim()) || g.taakTitel
		if (!heeftInhoud) continue

		const id = 'c' + g.id
		knopen.set(id, {
			id, soort: 'gesprek', naam: null, uitgaand: !!g.uitgaand, datum: g.datum || null,
			minuten: g.minuten || 0, bron: 'afgeleid', zeker: 'bevestigd',
		})
		lijnen.push({ id: 'ikc-' + g.id, van: ikId, naar: id, soort: 'gesprek', label: '', aantal: 1, bron: 'afgeleid', zeker: 'bevestigd' })
		if (doel !== ikId) {
			lijnen.push({ id: 'cp-' + g.id, van: id, naar: doel, soort: 'met', label: '', bron: 'afgeleid', zeker: 'bevestigd' })
		}
		if (g.notitie && g.notitie.trim()) {
			const nid = 'nt' + g.id
			knopen.set(nid, { id: nid, soort: 'notitie', naam: g.notitie.trim().slice(0, 60), bron: 'handmatig', zeker: 'bevestigd' })
			lijnen.push({ id: 'cn-' + g.id, van: id, naar: nid, soort: 'notitie', label: '', bron: 'handmatig', zeker: 'bevestigd' })
		}
		if (g.taakTitel) {
			const tid = 'tk' + g.id
			knopen.set(tid, { id: tid, soort: 'taak', naam: String(g.taakTitel).slice(0, 60), bron: 'handmatig', zeker: 'bevestigd' })
			lijnen.push({ id: 'ct-' + g.id, van: id, naar: tid, soort: 'taak', label: '', bron: 'handmatig', zeker: 'bevestigd' })
		}
	}

	for (const [doel, t] of perDoel) {
		if (doel === ikId) continue
		lijnen.push({
			id: 'bel-' + doel, van: ikId, naar: doel, soort: 'gesprek', label: '',
			aantal: t.n, minuten: t.minuten, laatst: t.laatst, bron: 'afgeleid', zeker: 'bevestigd',
		})
	}
}

/** Alleen de cijfers, en alleen het staartje -- hetzelfde nummer staat overal anders geschreven. */
function cijfers(nummer) {
	return String(nummer || '').replace(/\D/g, '').slice(-9)
}

export function bouwNetwerk(lijsten) {
	const knopen = new Map()
	const lijnen = []
	const ikId = lijsten.ik || null

	for (const m of lijsten.mensen || []) {
		knopen.set(m.id, {
			id: m.id, soort: 'mens', naam: m.naam || null, aanduiding: m.aanduiding || null,
			ikZelf: !!m.ikZelf, telefoon: m.telefoon || null, email: m.email || null,
			bron: m.bron || 'handmatig', zeker: m.zeker || 'bevestigd', persoonId: m.persoonId || m.id,
		})
	}
	for (const d of lijsten.dingen || []) {
		knopen.set(d.id, { id: d.id, soort: d.soort, naam: d.naam || null, bron: d.bron || 'handmatig', zeker: 'bevestigd' })
	}

	// Wat JIJ zei. Dit is het enige handwerk in de hele tekening.
	for (const r of lijsten.relaties || []) {
		if (!knopen.has(r.van) || !knopen.has(r.naar)) continue
		lijnen.push({
			id: 'rel-' + r.id, van: r.van, naar: r.naar, soort: r.soort,
			label: r.context ? r.soort + ' (' + r.context + ')' : r.soort,
			richting: true, bron: r.bron || 'handmatig', zeker: r.zeker || 'bevestigd',
		})
	}

	// Welke mens hoort bij dit gesprek? Op naam of op nummer, en anders een knoop voor het nummer zelf:
	// die verzamelt lijnen tot je weet wie het is.
	const mensen = [...knopen.values()].filter((k) => k.soort === 'mens' && !k.ikZelf)
	const knoopVan = (g) => {
		const nr = cijfers(g.nummer)
		const naam = (g.naam || '').trim().toLowerCase()
		const gevonden = mensen.find((m) => (nr && cijfers(m.telefoon) === nr) || (naam && (m.naam || '').toLowerCase() === naam))
		if (gevonden) return gevonden.id
		if (!nr) return null
		const id = 'n' + nr
		if (!knopen.has(id)) {
			knopen.set(id, { id, soort: 'nummer', naam: g.nummer, aanduiding: g.naam || null, bron: 'afgeleid', zeker: 'bevestigd' })
		}
		return id
	}
	gesprekRondes(lijsten, knoopVan, knopen, lijnen, ikId)

	// Wat waaraan hangt: een notitie uit een gesprek, een taak uit een gesprek, een bon bij een afspraak.
	for (const k of lijsten.koppelingen || []) {
		const van = k.vanSoort === 'gesprek' ? 'c' + k.vanId : k.vanId
		const naar = k.naarSoort === 'gesprek' ? 'c' + k.naarId : k.naarId
		if (!knopen.has(van) || !knopen.has(naar) || van === naar) continue
		lijnen.push({
			id: 'kop-' + k.vanSoort + k.vanId + '-' + k.naarSoort + k.naarId,
			van, naar, soort: k.naarSoort, label: k.label || '', richting: true,
			bron: k.bron || 'handmatig', zeker: 'bevestigd',
		})
	}

	// Een knoop zonder lijn en zonder naam zegt niets. Een naamloze knoop MET een lijn blijft juist staan:
	// dat is de man van dinsdag.
	const gebruikt = new Set()
	for (const l of lijnen) { gebruikt.add(l.van); gebruikt.add(l.naar) }
	const lijst = [...knopen.values()].filter((k) => gebruikt.has(k.id) || k.naam || k.ikZelf)

	return {
		knopen: lijst,
		lijnen,
		ik: ikId,
		telling: {
			knopen: lijst.length,
			lijnen: lijnen.length,
			vermoed: lijnen.filter((l) => l.zeker === 'vermoed').length,
		},
	}
}
