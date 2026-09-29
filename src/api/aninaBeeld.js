/**
 * De afbeelding die we tonen als een bericht of aflevering er zelf geen heeft (Ramin, 24-09).
 *
 * Gemeten over vijftien feeds had 96 van de 276 berichten een plaatje; de rest kreeg een leeg grijs vlak.
 * Tweakers, NCSC en CyberScoop sturen er simpelweg geen mee, dus dat gat gaat niet dicht met beter
 * uitlezen. Liever iets dat bij de app hoort dan niets.
 *
 * Ze staan bij de site en niet in deze bundel: zo gebruiken de telefoon, het web en Nextcloud dezelfde
 * tekening, en hoeft een wijziging maar op één plek.
 */
const BASIS = 'https://askanina.com/site/assets/'

export const ANINA_NIEUWS = BASIS + 'anina-news.png'
export const ANINA_PODCAST = BASIS + 'anina-podcast.png'

/**
 * Anina naast het inlogscherm (Ramin, 30-09).
 *
 * `PA_left` kijkt naar links, dus ze hoort RECHTS van de kaart: dan kijkt ze ernaartoe in plaats van
 * ervan weg. Er is ook een `PA_right`; die zou hier de verkeerde kant op staren.
 *
 * Langs deze weg en niet in de bundel: het bestand is 299 KB, en ingebakken als tekst wordt dat ruim
 * 400 KB die IEDEREEN bij elk bezoek ophaalt -- ook wie allang is ingelogd en dit scherm nooit meer
 * ziet. Zo haalt de browser hem alleen op wanneer hij hem laat zien, en bewaart hij hem daarna zelf.
 */
export const ANINA_INLOG = BASIS + 'PA_left.png'

/** Het plaatje van dit bericht, of dat van Anina als het er niet is. */
export function nieuwsBeeld(eigen) {
	return (eigen || '').trim() || ANINA_NIEUWS
}

/** De hoes van deze aflevering, of die van Anina als er geen is. */
export function podcastBeeld(eigen) {
	return (eigen || '').trim() || ANINA_PODCAST
}
