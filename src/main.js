import { createApp } from 'vue'
import App from './App.vue'
// Dezelfde kaarten als in de web-jas (Ramin, 24-09: *"Bekijk de kaarten van Android en maak ze zo ook voor
// webapp"* -- en binnen Nextcloud horen ze er net zo uit te zien). Dit werd alleen in web.js geladen,
// waardoor de kaartklassen hier wel in de opmaak stonden maar zonder vormgeving.
import './kaarten.css'
// Binnen Nextcloud komen de kleuren van Nextcloud, niet van het besturingssysteem: anders staat onze
// donkere kaart onder zijn lichte thema, met donkere letters erop.
import './kaarten-nc.css'
import { reportError } from './api/paApi.js'
import { getAccessCode } from './api/accessCode.js'
import { WEB } from './mode.js'

// Fouten in de browser naar de back-office (kaart 119), hooguit vijf per sessie.
let gemeld = 0
function meld(bericht, detail) {
	if (gemeld >= 5) return
	gemeld++
	reportError(getAccessCode() || '', { app: WEB ? 'web' : 'nc', version: 'web', screen: location.hash || location.pathname, kind: 'error', message: String(bericht).slice(0, 500), detail: String(detail || '').slice(0, 6000) })
}
window.addEventListener('error', (e) => meld(e.message, e.error && e.error.stack))
window.addEventListener('unhandledrejection', (e) => meld(e.reason && (e.reason.message || e.reason), e.reason && e.reason.stack))

const app = createApp(App)
app.config.errorHandler = (err, _instance, info) => { meld(err && err.message ? err.message : err, (err && err.stack ? err.stack + '\n' : '') + info); console.error(err) }
app.mount('#personalassistant-content')
