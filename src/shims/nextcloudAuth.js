/** Web-jas van @nextcloud/auth: de "gebruiker" is de USER-API-code. */
import { getAccessCode } from '../api/accessCode.js'
export function getCurrentUser() {
	const code = getAccessCode()
	return code ? { uid: code, displayName: code } : null
}
