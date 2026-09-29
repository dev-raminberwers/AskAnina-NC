<template>
	<div class="pa-net">
		<h2>{{ t('Network') }}</h2>
		<p class="pa-hint">{{ t('Your contacts, calls and what you linked to them. Click someone to see what their lines are based on; hold Ctrl for a second one to connect them.') }}</p>

		<FoutMelding v-if="error" :error="error" />
		<NcLoadingIcon v-else-if="bezig" :size="24" />

		<template v-else>
			<p v-if="geenGesprekken" class="pa-net__stil">
				{{ t('No calls in this Nextcloud yet. Open Calls on your phone once; from then on they are stored here, not with us.') }}
			</p>

			<div class="pa-net__lint">
				<NcButton v-for="n in [12, 24, 50, 0]" :key="n" :type="hoeveel === n ? 'primary' : 'secondary'"
					@click="hoeveel = n">
					{{ n === 0 ? t('all') : n }}
				</NcButton>
				<input v-model="zoek" class="pa-net__zoek" :placeholder="t('Search for someone')">
				<span class="pa-net__telling">{{ zichtbaar.knopen.length }} · {{ zichtbaar.lijnen.length }}</span>
			</div>

			<div class="pa-net__vlak">
				<svg ref="doek" class="pa-net__doek" @click="kiesNiets">
					<g :transform="`translate(${kijk.x},${kijk.y}) scale(${kijk.k})`">
						<line v-for="l in zichtbaar.lijnen" :key="l.id"
							:x1="plek(l.van).x" :y1="plek(l.van).y" :x2="plek(l.naar).x" :y2="plek(l.naar).y"
							:class="['pa-net__lijn', l.soort === 'gesprek' ? 'is-gesprek' : '', l.zeker === 'vermoed' ? 'is-vermoed' : '']"
							:stroke-width="dikte(l)" />
						<g v-for="k in zichtbaar.knopen" :key="k.id"
							:class="['pa-net__knoop', gekozen.includes(k.id) ? 'is-gekozen' : '']"
							:transform="`translate(${plek(k.id).x},${plek(k.id).y})`"
							@click.stop="kies(k, $event)">
							<circle v-if="k.soort === 'mens'" :r="k.ikZelf ? 20 : 14" :class="k.ikZelf ? 'is-ik' : ''" />
							<rect v-else-if="k.soort === 'gesprek'" x="-10" y="-10" width="20" height="20" rx="4"
								transform="rotate(45)" class="is-gesprek" />
							<rect v-else x="-9" y="-9" width="18" height="18" rx="4" />
							<text y="30">{{ opschrift(k) }}</text>
						</g>
					</g>
				</svg>

				<aside class="pa-net__pane">
					<template v-if="gekozen.length === 2">
						<h3>{{ t('Connection') }}</h3>
						<p class="pa-hint">{{ naamVan(gekozen[0]) }} → {{ naamVan(gekozen[1]) }}</p>
						<div class="pa-net__chips">
							<NcButton v-for="s in soorten" :key="s" :type="soort === s ? 'primary' : 'secondary'"
								@click="soort = s">
								{{ s }}
							</NcButton>
						</div>
						<input v-model="context" class="pa-net__veld" :placeholder="t('Where, for example a company')">
						<NcButton type="primary" :disabled="!soort" @click="bewaarRelatie">
							{{ t('Save') }}
						</NcButton>
					</template>

					<template v-else-if="dossier">
						<h3>{{ dossier.naam || dossier.aanduiding || t('Without a name') }}</h3>
						<p v-if="dossier.telefoon" class="pa-hint">{{ dossier.telefoon }}</p>

						<h4>{{ t('Relations') }}</h4>
						<p v-if="!relatiesVan.length" class="pa-hint">{{ t('None yet. This is the part only you know.') }}</p>
						<div v-for="r in relatiesVan" :key="r.id" class="pa-net__rij">
							<span><b>{{ r.soort }}</b><template v-if="r.context"> · {{ r.context }}</template></span>
							<NcButton type="tertiary" @click="afwijzen(r)">{{ t('Not true') }}</NcButton>
						</div>

						<h4>{{ t('What this is based on') }}</h4>
						<p v-if="!gesprekkenVan.length" class="pa-hint">{{ t('No calls found.') }}</p>
						<div v-for="g in gesprekkenVan" :key="g.id" class="pa-net__rij">
							<span>
								<small>{{ g.datum }}</small>
								{{ g.uitgaand ? t('you called') : t('you were called') }}
								<template v-if="g.minuten"> · {{ g.minuten }} {{ t('min') }}</template>
								<em v-if="g.notitie" class="pa-net__notitie">{{ g.notitie }}</em>
							</span>
						</div>
					</template>

					<p v-else class="pa-hint">{{ t('Nothing selected.') }}</p>
				</aside>
			</div>
		</template>
	</div>
</template>

<script>
/**
 * Het netwerk, getekend uit wat in déze Nextcloud staat.
 *
 * Ramin, 27-09: *"De nextCloud app mag alleen data halen uit nextcloud."* Daarom haalt dit scherm niets
 * bij ons: `netwerk.js` praat met de eigen tabellen van deze app en met het adresboek, en `netwerkBouw.js`
 * legt de verbanden -- dezelfde regels die aan onze kant in PHP staan.
 *
 * De tekening is met opzet karig gehouden ten opzichte van de webwerkbank: twee ringen, geen slepen, geen
 * zoomen met het wiel. Wat je hier doet is kijken en betekenis toevoegen; het grote uitzoekwerk doe je op
 * een groot scherm.
 */
import NcButton from '@nextcloud/vue/components/NcButton'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import FoutMelding from './FoutMelding.vue'
import { bouwNetwerk } from '../api/netwerkBouw.js'
import { haalLijsten, legRelatie, wijsAf } from '../api/netwerk.js'
import { foutTekst } from '../api/fouten.js'
import { t } from '../l10n/index.js'

export default {
	name: 'NetwerkView',
	components: { NcButton, NcLoadingIcon, FoutMelding },
	data() {
		return {
			bezig: true,
			error: null,
			grafiek: { knopen: [], lijnen: [], ik: null },
			geenGesprekken: false,
			plekken: {},
			gekozen: [],
			hoeveel: 24,
			zoek: '',
			soort: '',
			context: '',
			kijk: { x: 320, y: 300, k: 1 },
			soorten: ['klant', 'collega', 'familie', 'partner', 'vriend', 'buren', 'leverancier', 'baas'],
		}
	},
	computed: {
		/*
		 * Niet alles tegelijk: met honderd mensen is elke naam te klein om te lezen. De drukste eerst, en
		 * de rest haal je erbij met de zoekbalk. Gebeurtenissen (een gesprek met een notitie eraan) tellen
		 * niet mee in dat aantal maar komen wel mee -- dat is juist het bewijs dat je zoekt.
		 */
		zichtbaar() {
			const g = this.grafiek
			if (this.zoek.trim().length >= 2) {
				const t2 = this.zoek.trim().toLowerCase()
				const houd = new Set(g.knopen
					.filter((k) => ((k.naam || '') + ' ' + (k.aanduiding || '')).toLowerCase().includes(t2))
					.map((k) => k.id))
				if (g.ik) houd.add(g.ik)
				return { knopen: g.knopen.filter((k) => houd.has(k.id)), lijnen: g.lijnen.filter((l) => houd.has(l.van) && houd.has(l.naar)) }
			}
			const gewicht = {}
			for (const l of g.lijnen) {
				gewicht[l.van] = (gewicht[l.van] || 0) + (l.aantal || 1)
				gewicht[l.naar] = (gewicht[l.naar] || 0) + (l.aantal || 1)
			}
			const mensen = g.knopen.filter((k) => k.id !== g.ik && (k.soort === 'mens' || k.soort === 'nummer'))
			mensen.sort((a, b) => (gewicht[b.id] || 0) - (gewicht[a.id] || 0))
			const houd = new Set(this.hoeveel === 0 ? mensen.map((k) => k.id) : mensen.slice(0, this.hoeveel).map((k) => k.id))
			for (const id of this.gekozen) houd.add(id)
			if (g.ik) houd.add(g.ik)
			for (let ronde = 0; ronde < 2; ronde++) {
				for (const l of g.lijnen) {
					const a = g.knopen.find((k) => k.id === l.van)
					const b = g.knopen.find((k) => k.id === l.naar)
					if (!a || !b) continue
					const los = (k) => k.soort !== 'mens' && k.soort !== 'nummer'
					if (houd.has(a.id) && los(b)) houd.add(b.id)
					if (houd.has(b.id) && los(a)) houd.add(a.id)
				}
			}
			return { knopen: g.knopen.filter((k) => houd.has(k.id)), lijnen: g.lijnen.filter((l) => houd.has(l.van) && houd.has(l.naar)) }
		},
		dossier() {
			if (this.gekozen.length !== 1) return null
			return this.grafiek.knopen.find((k) => k.id === this.gekozen[0]) || null
		},
		relatiesVan() {
			if (!this.dossier) return []
			return this.grafiek.lijnen
				.filter((l) => (l.van === this.dossier.id || l.naar === this.dossier.id) && l.bron !== 'afgeleid' && l.soort !== 'gesprek')
				.map((l) => ({ id: l.id.replace('rel-', ''), soort: l.soort, context: '' }))
		},
		gesprekkenVan() {
			if (!this.dossier) return []
			const ids = this.grafiek.lijnen
				.filter((l) => l.soort === 'met' && l.naar === this.dossier.id)
				.map((l) => l.van)
			return this.grafiek.knopen.filter((k) => ids.includes(k.id))
		},
	},
	watch: {
		zichtbaar: 'legNeer',
		hoeveel: 'legNeer',
	},
	async mounted() {
		await this.laad()
	},
	methods: {
		t,
		async laad() {
			this.bezig = true
			this.error = null
			try {
				const lijsten = await haalLijsten()
				this.grafiek = lijsten.alKlaar || bouwNetwerk(lijsten)
				this.geenGesprekken = !!lijsten.geenGesprekken
				this.legNeer()
			} catch (e) {
				this.error = foutTekst(e)
			}
			this.bezig = false
		},
		/*
		 * Twee ringen met een bedoeling: mensen binnen, de rest daarbuiten. Een veerstelsel zou hier een
		 * egel maken, want bijna elke lijn loopt naar dezelfde knoop -- jij belt nu eenmaal zelf met
		 * iedereen.
		 */
		legNeer() {
			const z = this.zichtbaar
			const plekken = {}
			if (this.grafiek.ik) plekken[this.grafiek.ik] = { x: 0, y: 0 }
			const binnen = z.knopen.filter((k) => k.id !== this.grafiek.ik && k.soort === 'mens')
			const buiten = z.knopen.filter((k) => k.id !== this.grafiek.ik && k.soort !== 'mens')
			const ring = (lijst, straal) => lijst.forEach((k, i) => {
				const hoek = (i / Math.max(1, lijst.length)) * Math.PI * 2
				plekken[k.id] = { x: Math.cos(hoek) * straal, y: Math.sin(hoek) * straal }
			})
			ring(binnen, Math.max(150, (binnen.length * 110) / (2 * Math.PI)))
			ring(buiten, Math.max(230, (buiten.length * 60) / (2 * Math.PI)) + 60)
			this.plekken = plekken
			const stralen = Object.values(plekken).map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))
			const grootste = Math.max(120, ...stralen)
			this.kijk = { x: 320, y: 300, k: Math.min(1, 260 / grootste) }
		},
		plek(id) {
			return this.plekken[id] || { x: 0, y: 0 }
		},
		dikte(l) {
			return Math.min(6, 1.2 + Math.log((l.aantal || 1) + 1) * 1.1)
		},
		opschrift(k) {
			if (k.ikZelf) return t('you')
			if (k.naam) return k.naam.length > 20 ? k.naam.slice(0, 19) + '…' : k.naam
			if (k.soort === 'gesprek') return k.datum || t('call')
			return k.aanduiding || '?'
		},
		naamVan(id) {
			const k = this.grafiek.knopen.find((x) => x.id === id)
			return k ? this.opschrift(k) : id
		},
		kies(k, ev) {
			if (ev.ctrlKey || ev.metaKey) {
				this.gekozen = this.gekozen.includes(k.id)
					? this.gekozen.filter((x) => x !== k.id)
					: this.gekozen.slice(-1).concat([k.id])
			} else {
				this.gekozen = [k.id]
			}
		},
		kiesNiets() {
			this.gekozen = []
		},
		async bewaarRelatie() {
			try {
				await legRelatie({ van: this.gekozen[0], naar: this.gekozen[1], soort: this.soort, context: this.context })
				this.soort = ''
				this.context = ''
				this.gekozen = []
				await this.laad()
			} catch (e) {
				this.error = foutTekst(e)
			}
		},
		async afwijzen(r) {
			try {
				await wijsAf(r.id)
				await this.laad()
			} catch (e) {
				this.error = foutTekst(e)
			}
		},
	},
}
</script>

<style scoped>
.pa-net { padding: 12px 16px 24px; }
.pa-hint { color: var(--color-text-maxcontrast); font-size: 13px; }
.pa-net__stil { color: var(--color-text-maxcontrast); font-size: 13px; background: var(--color-background-hover); border-radius: 8px; padding: 8px 10px; }
.pa-net__lint { display: flex; align-items: center; gap: 6px; margin: 10px 0; flex-wrap: wrap; }
.pa-net__zoek, .pa-net__veld { border-radius: 8px; padding: 6px 10px; border: 1px solid var(--color-border); background: var(--color-main-background); }
.pa-net__veld { width: 100%; margin: 6px 0; }
.pa-net__telling { color: var(--color-text-maxcontrast); font-size: 12px; margin-left: auto; }
.pa-net__vlak { display: flex; gap: 12px; align-items: stretch; min-height: 600px; }
.pa-net__doek { flex: 1; min-height: 600px; background: var(--color-background-hover); border-radius: 10px; }
.pa-net__pane { width: 300px; flex-shrink: 0; }
.pa-net__lijn { stroke: var(--color-main-text); stroke-opacity: .45; }
.pa-net__lijn.is-gesprek { stroke: #B0530A; stroke-opacity: .7; }
.pa-net__lijn.is-vermoed { stroke-dasharray: 6 5; stroke-opacity: .4; }
.pa-net__knoop circle, .pa-net__knoop rect { fill: var(--color-main-background); stroke: var(--color-border-dark); stroke-width: 2; cursor: pointer; }
.pa-net__knoop circle.is-ik { fill: var(--color-primary-element); stroke: none; }
.pa-net__knoop rect.is-gesprek { stroke: #B0530A; }
.pa-net__knoop.is-gekozen circle, .pa-net__knoop.is-gekozen rect { stroke: #B0530A; stroke-width: 3; }
.pa-net__knoop text { font-size: 11px; fill: var(--color-main-text); text-anchor: middle; pointer-events: none; }
.pa-net__rij { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid var(--color-border); font-size: 13px; }
.pa-net__rij span { flex: 1; }
.pa-net__rij small { color: var(--color-text-maxcontrast); margin-right: 6px; }
.pa-net__notitie { display: block; color: var(--color-text-maxcontrast); font-size: 12px; }
.pa-net__chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
</style>
