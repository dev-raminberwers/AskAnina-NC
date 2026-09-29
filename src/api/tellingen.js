import { reactive } from 'vue'
import * as paApi from './paApi.js'
import { getSettings } from './nextcloudUserData.js'
import { getAccessCode } from './accessCode.js'

/**
 * Hoeveel er nog op je wacht: ongelezen nieuws en niet-beluisterde afleveringen.
 *
 * Ramin, 24-09: *"web-based, plaats badges met aantallen in het menu en right pane van
 * unread/unlistened"*. Die getallen moeten er staan zonder dat je het scherm eerst opent -- anders is de
 * badge pas te zien als je al bent waar hij je heen wilde sturen. Vandaar één plek die ze bijhoudt.
 *
 * Twee bronnen vullen hem:
 *  - [ververs] rekent ze uit bij het opstarten, met één verzoek voor alle bronnen samen;
 *  - Nieuws en Podcasts melden hun eigen getal zodra ze het weten, want dat is het meest verse.
 */
export const tellingen = reactive({ nieuws: 0, podcasts: 0 })

/** Een scherm dat het zelf net heeft uitgerekend. */
export function meld(wat, aantal) {
	tellingen[wat] = Number(aantal) || 0
	gemeldOp = Date.now()
}

let bezig = false
let laatst = 0
/** Wanneer een scherm het laatst zelf een getal doorgaf. */
let gemeldOp = 0

/** Een gezien-lijst, of null als hij niet op te halen was. Null is iets anders dan leeg. */
async function lijst(soort) {
	try {
		const d = await paApi.seenList(getAccessCode(), soort)
		if (!d || !Array.isArray(d.keys)) return null
		const weg = new Set(d.weg || [])
		return d.keys.filter((k) => !weg.has(k))
	} catch (e) {
		return null
	}
}

/**
 * De twee getallen opnieuw uitrekenen. Hoogstens eens per vijf minuten echt: de server cachet de bronnen
 * toch al, en vaker vragen levert alleen verkeer op.
 */
export async function ververs({ altijd = false } = {}) {
	if (bezig) return
	// Heeft Nieuws of Podcasts zelf net geteld, dan is dat getal beter dan wat wij zouden ophalen -- en
	// scheelt het een ronde langs alle veertig bronnen. Ramin liep 24-09 tegen "te veel verzoeken achter
	// elkaar" aan doordat dit er bovenop kwam; een tweede som over dezelfde gegevens is die prijs niet waard.
	if (!altijd && Date.now() - gemeldOp < 10 * 60 * 1000) return
	if (!altijd && Date.now() - laatst < 15 * 60 * 1000) return
	bezig = true
	try {
		const s = (await getSettings()) || {}
		const code = getAccessCode()
		const nieuwsFeeds = Array.isArray(s.rssFeeds) ? s.rssFeeds.map((f) => f.url) : []
		const podcasts = Array.isArray(s.podcasts) ? s.podcasts : []
		const alle = nieuwsFeeds.concat(podcasts.map((p) => p.feedUrl))
		if (!alle.length) return
		const d = await paApi.feedBundel(code, alle, { max: 60 }).catch(() => null)
		const feeds = (d && d.feeds) || []

		// Rechtstreeks ophalen, niet via de gedeelde hulp: die geeft bij een mislukking stilletjes een
		// LEGE lijst terug, en dan lijkt alles ongelezen. Zo stond er even 'Podcasts 7' terwijl er niets
		// openstond (24-09). Lukt het niet, dan laten we de oude getallen staan -- een verkeerd getal is
		// erger dan een getal dat even niet meebeweegt.
		const gelezen = await lijst('rssRead')
		if (gelezen === null) return
		let nieuws = 0
		nieuwsFeeds.forEach((url, i) => {
			const feed = feeds[i]
			if (!feed) return
			for (const it of (feed.items || [])) {
				const sleutel = it.id || it.link
				if (sleutel && !gelezen.includes(sleutel)) nieuws++
			}
		})

		const beluisterd = await lijst('podcastListened')
		if (beluisterd === null) return
		const gehoordTot = (s.podcastListenedUpTo && typeof s.podcastListenedUpTo === 'object') ? s.podcastListenedUpTo : {}
		const vanaf = (s.podcastFrom && typeof s.podcastFrom === 'object') ? s.podcastFrom : {}
		// Zelfde grens als de wachtrij zelf: zonder die maand stond het complete archief klaar.
		const maandTerug = new Date(Date.now() - 30 * 86400000).toISOString()
		let luisteren = 0
		podcasts.forEach((p, j) => {
			const feed = feeds[nieuwsFeeds.length + j]
			if (!feed) return
			const start = vanaf[p.feedUrl] || maandTerug
			const tot = gehoordTot[p.feedUrl] || ''
			for (const ep of (feed.items || [])) {
				if (!ep.audio || !ep.audio.url) continue
				if (start && (ep.published || '') < start) continue
				if ([ep.id, ep.audio.url, ep.link].filter(Boolean).some((k) => beluisterd.includes(k))) continue
				if (tot && ep.published && ep.published <= tot) continue
				luisteren++
			}
		})

		tellingen.nieuws = nieuws
		tellingen.podcasts = luisteren
		laatst = Date.now()
	} finally {
		bezig = false
	}
}
