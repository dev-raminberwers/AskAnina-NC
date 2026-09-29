/**
 * HTML van buiten veilig maken voordat hij via v-html op het scherm komt (29-09).
 *
 * De inhoud van een RSS-bericht komt van een feed die wij niet in de hand hebben. Zonder filter kan
 * zo'n bericht script, event-handlers of `javascript:`-links meebrengen die dan binnen de app draaien,
 * met de toegangscode van de gebruiker in dezelfde pagina. DOMPurify haalt dat eruit; opmaak, plaatjes
 * en gewone links blijven staan.
 */
import DOMPurify from 'dompurify'

/* Links in een bericht openen in een nieuw tabblad, zodat de app zelf niet wegnavigeert. */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
	if (node.tagName === 'A' && node.getAttribute('href')) {
		node.setAttribute('target', '_blank')
		node.setAttribute('rel', 'noopener noreferrer')
	}
})

/** Opgeschoonde HTML: geen script, style, formulieren of event-handlers. */
export function veiligeHtml(html) {
	return DOMPurify.sanitize(String(html || ''), { FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'] })
}

/** Alleen http(s)-adressen; al het andere (bijvoorbeeld `javascript:`) wordt een lege link. */
export function veiligeLink(url) {
	const u = String(url || '').trim()
	return /^https?:\/\//i.test(u) ? u : undefined
}
