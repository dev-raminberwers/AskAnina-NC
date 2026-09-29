/** Startpunt van de web-jas (askanina.com/app). */
import { createApp } from 'vue'
import App from './App.vue'
import './web.css'
// De kaarten zoals Design ze aanleverde (site/kaarten.html); zie kaarten.css.
import './kaarten.css'
import { start as startThema } from './api/thema.js'

// Kleur eerst, dan pas tekenen: anders zie je een flits van het verkeerde thema (Ramin, 24-09).
startThema()
createApp(App).mount('#pa-web-app')
