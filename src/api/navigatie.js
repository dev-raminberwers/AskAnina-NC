/**
 * Van binnen een scherm naar een ander scherm springen, met een plek erin
 * (Ramin, 2026-09-14: "bij een error altijd een deeplink naar de
 * settingspagina waar het opgelost kan worden"). App.vue kijkt naar
 * `verzoek` en wisselt van tabblad; SettingsView opent de gevraagde tab.
 */
import { reactive } from 'vue'

export const navigatie = reactive({ verzoek: null })

/**
 * Staat er een Deck-kaart open, en is er een rechterpaneel om hem in te zetten?
 *
 * Ramin, 24-09: *"als ik een deck card open, open die dan in de right pane"*. Het bewerkvenster stond als
 * derde kolom naast het bord, waardoor het bord smaller werd juist op het moment dat je een kaart las.
 *
 * Het venster zelf blijft in DeckView staan -- daar zit alle invoer en het opslaan -- en wordt met een
 * Teleport naar het paneel verplaatst. Zo hoeft er geen regel formulier verhuisd te worden en kan het
 * terugvallen op de oude plek als er geen paneel is (smal scherm, paneel uitgezet).
 */
export const zijPaneel = reactive({ aanwezig: false, deckKaartOpen: false })

let volgnummer = 0

/** @param {string} tab bijv. 'settings' @param {?string} onderdeel bijv. 'account' */
export function gaNaar(tab, onderdeel = null, subOnderdeel = null) {
	navigatie.verzoek = { tab, onderdeel, subOnderdeel, nr: ++volgnummer }
}
