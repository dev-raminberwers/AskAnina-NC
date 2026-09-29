/**
 * Wat Anina invulde voor een ander onderdeel (kaart 100, 2026-09-16): Vandaag
 * zet het hier neer en springt naar Taken, Notities of Deck; dat onderdeel
 * neemt het bij het openen mee en opent zijn formulier ingevuld. De gebruiker
 * kijkt na en slaat op.
 */
const wachtend = {}

export function zetVoorinvulling(soort, velden) { wachtend[soort] = velden }

/** Geeft de wachtende velden voor deze soort en vergeet ze meteen. */
export function neemVoorinvulling(soort) {
	const v = wachtend[soort] || null
	delete wachtend[soort]
	return v
}

/** Losjes op naam: "PA" past op "Bord PA" en andersom. */
export function pastOpNaam(naam, gezegd) {
	const a = String(naam || '').toLowerCase().trim()
	const b = String(gezegd || '').toLowerCase().trim()
	return !!b && (a.includes(b) || b.includes(a))
}
