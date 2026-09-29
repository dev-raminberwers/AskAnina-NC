/**
 * Lijkt een nieuwe titel op iets dat er al is? (Ramin, 2026-09-16: "Tracking
 * cade" als nieuwe kaart terwijl "Tracking code" al bestond: eerst zeggen en
 * vragen of het erbij moet, of toch nieuw.) Losjes: hoofdletters en leestekens
 * tellen niet, een tikfout of twee ook niet, en de ene mag in de andere zitten.
 */
export function normaal(s) {
	return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

function afstand(a, b) {
	let vorige = Array.from({ length: b.length + 1 }, (_, i) => i)
	for (let i = 1; i <= a.length; i++) {
		const huidige = [i]
		for (let j = 1; j <= b.length; j++) {
			const kosten = a[i - 1] === b[j - 1] ? 0 : 1
			huidige[j] = Math.min(huidige[j - 1] + 1, vorige[j] + 1, vorige[j - 1] + kosten)
		}
		vorige = huidige
	}
	return vorige[b.length]
}

export function lijktOp(a, b) {
	const x = normaal(a)
	const y = normaal(b)
	if (!x || !y) return false
	if (x === y) return true
	if (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))) return true
	if (afstand(x, y) <= Math.floor(Math.max(x.length, y.length) / 4)) return true
	const wx = new Set(x.split(' ').filter((w) => w.length >= 3))
	const wy = new Set(y.split(' ').filter((w) => w.length >= 3))
	if (!wx.size || !wy.size) return false
	let samen = 0
	for (const w of wx) if (wy.has(w)) samen++
	return samen / (wx.size + wy.size - samen) >= 0.6
}

/** Het eerste bestaande ding waar de titel op lijkt, of null. */
export function eersteGelijkende(titel, lijst, naam) {
	return (lijst || []).find((x) => lijktOp(titel, naam(x))) || null
}
