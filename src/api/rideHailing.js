/**
 * Ride-hailing preferences (Ramin, 2026-09-09: "taxi app" under Settings) —
 * which of Uber/Bolt/Lyft this browser should offer, and the default when
 * more than one is enabled. Stored in this browser's localStorage, same as
 * accessCode.js, rather than the shared Nextcloud data.enc blob: Android's
 * own SyncedSettings deliberately excludes these fields too (see
 * PaApi.kt's docblock — "which ride-hailing apps are installed" is
 * inherently tied to a specific physical device, not something to sync).
 */

const STORAGE_KEY = 'personalassistant.rideHailing'

const DEFAULTS = {
	uberEnabled: false,
	boltEnabled: false,
	lyftEnabled: false,
	defaultProvider: 'UBER',
	uberProductId: '',
	lyftPartnerId: '',
	lyftRideTypeId: '',
}

export function getRideHailingPrefs() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
	} catch {
		return { ...DEFAULTS }
	}
}

export function setRideHailingPrefs(prefs) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}
