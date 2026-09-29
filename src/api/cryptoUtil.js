/**
 * Application-layer encryption for the WebDAV personal-data blob
 * (nextcloudUserData.js) — Ramin, 2026-09-09: "Verstuur data encrypted
 * over internet en gebruik de API key als sleutel. dus wordt http ook
 * veiliger". The Nextcloud connection itself is often plain HTTP (self-
 * hosted instances, this app's own test server included — see
 * feedback_cleartext_nextcloud memory), so the blob's CONTENT is
 * encrypted independently of transport security.
 *
 * Deliberately NOT the browser's native Web Crypto API (`crypto.subtle`)
 * — that's only available in a secure context (HTTPS/localhost), i.e.
 * unavailable on EXACTLY the plain-HTTP pages this is meant to protect
 * (same class of gap as the crypto.randomUUID bug fixed earlier this
 * session). @noble/ciphers + @noble/hashes are pure-JS, audited, and work
 * identically regardless of the page's own transport security.
 *
 * Key: SHA-256(apiCode) used directly as the AES-256 key. This must be
 * the SHARED API-code (see accessCode.js), not anything Nextcloud-
 * specific — Android encrypts/decrypts the exact same file with the exact
 * same derivation (see NextcloudUserData.kt), so both platforms must
 * agree byte-for-byte on this scheme. The API-code never travels over the
 * (possibly-HTTP) Nextcloud connection at all — only to askanina.com
 * over HTTPS — so an eavesdropper on the Nextcloud connection sees only
 * ciphertext, never the key. (This is why the Nextcloud app-password
 * could NOT be used as this key on Android: it's already sent in cleartext-
 * equivalent Basic-Auth form on that exact same connection.)
 *
 * Wire format: raw bytes, IV (12 bytes) followed by GCM ciphertext+tag
 * (16-byte tag appended by @noble/ciphers, same as javax.crypto's default)
 * — no JSON/base64 envelope, just octet-stream, so Android's javax.crypto
 * "AES/GCM/NoPadding" can read/write the identical byte layout directly.
 */

import { gcm } from '@noble/ciphers/aes.js'
import { sha256 } from '@noble/hashes/sha2.js'

const IV_LENGTH = 12

function deriveKey(apiCode) {
	return sha256(new TextEncoder().encode(apiCode))
}

/** @param {string} apiCode @param {object} data @returns {Uint8Array} IV || ciphertext+tag */
export function encryptJson(apiCode, data) {
	const key = deriveKey(apiCode)
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
	const plaintext = new TextEncoder().encode(JSON.stringify(data))
	const ciphertext = gcm(key, iv).encrypt(plaintext)
	const out = new Uint8Array(iv.length + ciphertext.length)
	out.set(iv, 0)
	out.set(ciphertext, iv.length)
	return out
}

/**
 * Dezelfde ontsleuteling, maar dan voor ruwe bytes in plaats van JSON -- een bonfoto (Ramin, 24-09).
 *
 * De telefoon versleutelt de verkleinde foto met exact deze sleutel (ReceiptSync.kt), dus hier komt er
 * gewoon een jpeg uit. Wat eruit komt blijft in het geheugen: de aanroeper maakt er een blob-url van om
 * te tonen en geeft die weer vrij. Er gaat niets naar de schijf en niets naar de cache.
 */
export function decryptBytes(apiCode, bytes) {
	const key = deriveKey(apiCode)
	const iv = bytes.slice(0, IV_LENGTH)
	const ciphertext = bytes.slice(IV_LENGTH)
	return gcm(key, iv).decrypt(ciphertext)
}

/** @param {string} apiCode @param {Uint8Array} bytes IV || ciphertext+tag @returns {object} */
export function decryptJson(apiCode, bytes) {
	const key = deriveKey(apiCode)
	const iv = bytes.slice(0, IV_LENGTH)
	const ciphertext = bytes.slice(IV_LENGTH)
	const plaintext = gcm(key, iv).decrypt(ciphertext)
	return JSON.parse(new TextDecoder().decode(plaintext))
}
