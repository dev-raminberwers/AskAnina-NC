<template>
	<div class="pa-deck">
		<div class="pa-deck__toolbar">
			<h2>Deck</h2>
			<div class="pa-deck__chips">
				<button type="button" class="pa-deck__chip" :class="{ 'pa-deck__chip--active': view === 'board' }" @click="view = 'board'">{{ t('Board') }}</button>
				<button type="button" class="pa-deck__chip" :class="{ 'pa-deck__chip--active': view === 'gantt' }" @click="view = 'gantt'">{{ t('Gantt') }}</button>
			</div>
			<div v-if="view === 'gantt'" class="pa-deck__chips" :title="t('Zoom')">
				<button type="button" class="pa-deck__chip" :class="{ 'pa-deck__chip--active': schaal === 'uur' }" @click="schaal = 'uur'">{{ t('Hours') }}</button>
				<button type="button" class="pa-deck__chip" :class="{ 'pa-deck__chip--active': schaal === 'dag' }" @click="schaal = 'dag'">{{ t('Days') }}</button>
				<button type="button" class="pa-deck__chip" :class="{ 'pa-deck__chip--active': schaal === 'week' }" @click="schaal = 'week'">{{ t('Weeks') }}</button>
				<button type="button" class="pa-deck__chip" :class="{ 'pa-deck__chip--active': schaal === 'maand' }" @click="schaal = 'maand'">{{ t('Months') }}</button>
			</div>
			<form class="pa-deck__form" @submit.prevent="addBoard">
				<input id="pa-deck-board" v-model="boardTitle" type="text" :placeholder="t('New board')">
				<NcButton type="primary" native-type="submit" :disabled="busy || !boardTitle.trim()">{{ t('Add') }}</NcButton>
			</form>
		</div>
		<div v-if="wachtend" class="pa-deck__wachtend">
			<span>{{ t('The board was changed elsewhere.') }}</span>
			<NcButton type="primary" @click="neemOver">{{ t('Show changes') }}</NcButton>
		</div>
		<FoutMelding v-if="error" :error="error" />
		<!-- Lijkt de nieuwe kaart op een bestaande? Eerst vragen (Ramin, 2026-09-16). -->
		<NcNoteCard v-if="dubbel" type="info">
			<p>{{ t('There is already a %s named %s. Add to it, or make a new one?', t('card'), dubbel.kaart.title) }}</p>
			<div class="pa-deck__rij">
				<NcButton type="primary" :disabled="busy" @click="dubbelOpen">{{ t('Open the existing one') }}</NcButton>
				<NcButton :disabled="busy" @click="dubbelNieuw">{{ t('Make a new one') }}</NcButton>
				<NcButton :disabled="busy" @click="dubbel = null">{{ t('Cancel') }}</NcButton>
			</div>
		</NcNoteCard>
		<NcLoadingIcon v-else-if="loading" :size="24" />
		<p v-else-if="!boards.length" class="pa-deck__empty">{{ t('No boards yet.') }}</p>
		<template v-else>
			<div class="pa-deck__boards">
				<button v-for="board in boards" :key="board.id" type="button" class="pa-deck__boardtab" :class="{ 'pa-deck__boardtab--active': current && current.id === board.id }" @click="openBoard(board)">
					{{ board.title }}
				</button>
				<template v-if="current">
					<button v-if="!hernoem" type="button" class="pa-deck__x" :title="t('Rename')" @click="hernoem = { type: 'board', id: current.id, titel: current.title }"><MaterialIcoon naam="edit" :size="16" /></button>
					<form v-if="hernoem && hernoem.type === 'board'" class="pa-deck__inline" @submit.prevent="bewaarNaam">
						<input v-model="hernoem.titel" type="text">
						<NcButton native-type="submit" type="primary" :disabled="busy || !hernoem.titel.trim()">{{ t('Save') }}</NcButton>
						<NcButton :disabled="busy" @click="hernoem = null">{{ t('Cancel') }}</NcButton>
					</form>
					<span v-if="vraag && vraag.type === 'board'" class="pa-deck__vraag">
						{{ t('Delete board?') }}
						<NcButton type="error" :disabled="busy" @click="removeBoard">{{ t('Yes') }}</NcButton>
						<NcButton :disabled="busy" @click="vraag = null">{{ t('No') }}</NcButton>
					</span>
					<button v-else-if="!hernoem" type="button" class="pa-deck__x" :title="t('Delete')" @click="vraag = { type: 'board', id: current.id }">×</button>
				</template>
			</div>

			<div class="pa-deck__werk" :class="{ 'pa-deck__werk--open': edit }">
			<!-- Kaart bewerken: één paneel rechts naast bord én Gantt (Ramin, 2026-09-15). -->
			<!-- De kaart opent in het rechterpaneel als dat er staat (Ramin, 24-09). Het venster zelf
			     blijft hier -- alle invoer en het opslaan horen bij dit scherm -- en wordt alleen naar
			     een ander plekje in de pagina getekend. Geen paneel (smal scherm, uitgezet), dan valt
			     hij vanzelf terug op de kolom naast het bord. -->
			<Teleport to="#pa-zij-deckkaart" :disabled="!naarPaneel">
			<div v-if="edit" class="pa-deck__editor" :class="{ 'pa-deck__editor--paneel': naarPaneel }">
				<h3>{{ edit.card.nieuw ? t('New card') : t('Card') }} <span v-if="!edit.card.nieuw" class="pa-deck__nummer">#{{ edit.card.id }}</span></h3>
				<input id="pa-deck-edit-title" v-model="edit.title" type="text" :placeholder="t('Title')" class="pa-deck__veld">
				<textarea id="pa-deck-edit-desc" v-model="edit.description" rows="5" :placeholder="t('Description')" class="pa-deck__veld" />
				<div class="pa-deck__rij">
					<label for="pa-deck-edit-owner">{{ t('Owner') }}</label>
					<input v-if="web" id="pa-deck-edit-owner" v-model="edit.owner" type="text" :placeholder="mijnNaam">
					<template v-else>
						<span>{{ edit.owner || '—' }}</span>
						<label class="pa-deck__check"><input v-model="edit.mij" type="checkbox"> {{ t('Assigned to me') }}</label>
					</template>
					<label for="pa-deck-edit-status">{{ t('Status') }}</label>
					<select id="pa-deck-edit-status" v-model="edit.status">
						<option v-for="st in statussen" :key="st" :value="st">{{ statusTekst(st) }}</option>
					</select>
				</div>
				<div class="pa-deck__rij">
					<label for="pa-deck-edit-start">{{ t('Start date') }}</label>
					<input id="pa-deck-edit-start" v-model="edit.startdate" type="datetime-local">
					<label for="pa-deck-edit-due">{{ t('Due date') }}</label>
					<input id="pa-deck-edit-due" v-model="edit.duedate" type="datetime-local">
				</div>
				<div class="pa-deck__rij">
					<label for="pa-deck-edit-stack">{{ t('List') }}</label>
					<select id="pa-deck-edit-stack" v-model="edit.stackId">
						<option v-for="s in stacks" :key="s.id" :value="s.id">{{ s.title }}</option>
					</select>
				</div>
				<div class="pa-deck__rij pa-deck__labels">
					<span class="pa-deck__labelkop">{{ t('Labels') }}</span>
					<button v-for="l in labels" :key="l.id" type="button" class="pa-deck__label" :class="{ 'pa-deck__label--uit': !edit.labelIds.includes(l.id) }" :style="{ background: '#' + l.color, color: tekstKleur(l.color) }" @click="wisselLabel(l)">{{ l.title }}</button>
					<form class="pa-deck__inline" @submit.prevent="nieuwLabel">
						<input id="pa-deck-new-label" v-model="labelTitel" type="text" :placeholder="t('New label')">
						<input id="pa-deck-new-label-color" v-model="labelKleur" type="color" :title="t('Color')">
						<NcButton native-type="submit" :disabled="busy || !labelTitel.trim()">{{ t('Add') }}</NcButton>
					</form>
				</div>
				<!-- Plaatjes: toevoegen, openen, weghalen (Ramin, 2026-09-14). -->
				<div class="pa-deck__rij pa-deck__plaatjes">
					<span class="pa-deck__labelkop">{{ t('Pictures') }}</span>
					<span v-if="plaatjesBezig" class="pa-deck__meta">{{ t('Uploading…') }}</span>
					<template v-for="a in plaatjes" :key="a.id">
						<span class="pa-deck__plaatje">
							<img v-if="a.src" :src="a.src" :alt="a.name" :title="t('Open picture')" @click="openPlaatje(a)">
							<span v-else class="pa-deck__meta">{{ a.name }}</span>
							<button type="button" class="pa-deck__x" :title="t('Remove picture')" @click="verwijderPlaatje(a)">×</button>
						</span>
					</template>
					<label class="pa-deck__upload">
						<input type="file" accept="image/*" multiple @change="kiesPlaatjes">
						<span class="pa-deck__chip">{{ t('Add picture') }}</span>
					</label>
				</div>
				<div class="pa-deck__rij">
					<NcButton type="primary" :disabled="busy || !edit.title.trim()" @click="saveCard">{{ t('Save') }}</NcButton>
					<NcButton v-if="!edit.card.nieuw" type="error" :disabled="busy" @click="removeCard(edit.stack, edit.card); edit = null">{{ t('Delete') }}</NcButton>
					<NcButton :disabled="busy" @click="edit = null">{{ t('Cancel') }}</NcButton>
				</div>
			</div>
			</Teleport>

			<!-- Bord: lijsten naast elkaar. Slepen op een leeg stuk schuift het paneel. -->
			<div v-if="current && view === 'board'" ref="stacksEl" class="pa-deck__stacks" :class="{ 'pa-deck__stacks--pan': pan }" @pointerdown="beginPan">
				<div v-for="(stack, si) in stacks" :key="stack.id" class="pa-deck__stack" :class="{ 'pa-deck__stack--doel': sleepKaart && sleepDoel === stack.id, 'pa-deck__stack--lijstdoel': sleepStack && sleepStack.id !== stack.id && sleepDoel === stack.id }" @dragover.prevent="overStack($event, stack)" @drop.prevent="dropOp(stack)">
					<div class="pa-deck__stackkop" draggable="true" :title="t('Move list')" @dragstart="beginStackSleep($event, stack)" @dragend="sleepStack = null; sleepDoel = null">
						<form v-if="hernoem && hernoem.type === 'stack' && hernoem.id === stack.id" class="pa-deck__inline" @submit.prevent="bewaarNaam">
							<input v-model="hernoem.titel" type="text">
							<NcButton native-type="submit" type="primary" :disabled="busy || !hernoem.titel.trim()">{{ t('Save') }}</NcButton>
							<NcButton :disabled="busy" @click="hernoem = null">{{ t('Cancel') }}</NcButton>
						</form>
						<h3 v-else class="pa-deck__grow" :title="t('Rename')" @dblclick="hernoem = { type: 'stack', id: stack.id, titel: stack.title }">{{ stack.title }} <span class="pa-deck__aantal">{{ stack.cards.length }}</span></h3>
						<span v-if="vraag && vraag.type === 'stack' && vraag.id === stack.id" class="pa-deck__vraag">
							{{ t('Delete list?') }}
							<NcButton type="error" :disabled="busy" @click="removeStack(stack)">{{ t('Yes') }}</NcButton>
							<NcButton :disabled="busy" @click="vraag = null">{{ t('No') }}</NcButton>
						</span>
						<button v-else type="button" class="pa-deck__x" :title="t('Delete')" @click="vraag = { type: 'stack', id: stack.id }">×</button>
					</div>
					<template v-for="(card, ci) in stack.cards" :key="card.id">
						<div class="pa-deck__card" :class="{ 'pa-deck__card--done': card.status === 'finished', 'pa-deck__card--sleep': sleepKaart && sleepKaart.card.id === card.id, 'pa-deck__card--boven': sleepKaart && sleepDoel === stack.id && sleepIndex === ci && sleepKaart.card.id !== card.id }" draggable="true" @dragstart="beginKaartSleep($event, stack, card)" @dragend="sleepKaart = null; sleepDoel = null; sleepIndex = null" @dragover.prevent="overKaart($event, stack, ci)">
							<input :id="'pa-deck-card-' + card.id" type="checkbox" :checked="card.status === 'finished'" :title="card.status === 'finished' ? t('Reopen') : t('Mark done')" @change="toggle(stack, card)">
							<button type="button" class="pa-deck__cardtitel pa-deck__grow" :title="t('Edit')" @click="openCard(stack, card)">
								<span :class="{ 'pa-deck__done': card.status === 'finished' }"><span class="pa-deck__nummer">#{{ card.id }}</span> {{ card.title }}</span>
								<span v-if="card.labels && card.labels.length" class="pa-deck__cardlabels">
									<span v-for="l in card.labels" :key="l.id" class="pa-deck__label pa-deck__label--klein" :style="{ background: '#' + l.color, color: tekstKleur(l.color) }">{{ l.title }}</span>
								</span>
								<span class="pa-deck__meta">
									<span v-if="card.owner" class="pa-deck__eigenaar" :title="t('Owner')">{{ card.owner }}</span>
									<span v-if="card.status === 'busy' || card.status === 'waiting'" class="pa-deck__status" :class="'pa-deck__status--' + card.status">{{ statusTekst(card.status) }}</span>
									<span v-if="card.attachments" :title="t('Pictures')">🖼 {{ card.attachments }}</span>
									<span v-if="card.duedate" class="pa-deck__due" :class="dueKlasse(card)">{{ momentTekst(card.duedate) }}</span>
								</span>
							</button>
							<button v-if="si > 0" type="button" class="pa-deck__x" :title="t('Move left')" @click="verplaats(stack, card, stacks[si - 1])">‹</button>
							<button v-if="si < stacks.length - 1" type="button" class="pa-deck__x" :title="t('Move right')" @click="verplaats(stack, card, stacks[si + 1])">›</button>
						</div>
					</template>
					<form class="pa-deck__form" :class="{ 'pa-deck__form--boven': sleepKaart && sleepDoel === stack.id && sleepIndex >= stack.cards.length }" @submit.prevent="addCard(stack)">
						<input :id="'pa-deck-new-' + stack.id" v-model="newCard[stack.id]" type="text" :placeholder="t('New card')">
						<NcButton native-type="submit" :disabled="busy || !(newCard[stack.id] || '').trim()">{{ t('Add') }}</NcButton>
					</form>
				</div>
				<form class="pa-deck__stack pa-deck__stack--new" @submit.prevent="addStack">
					<input id="pa-deck-new-stack" v-model="stackTitle" type="text" :placeholder="t('New list')">
					<NcButton native-type="submit" :disabled="busy || !stackTitle.trim()">{{ t('Add') }}</NcButton>
				</form>
			</div>

			<!-- Gantt: elke kaart met een datum als balk op de tijdlijn; zonder datum in het bakje eronder. -->
			<div v-if="current && view === 'gantt'" class="pa-deck__gantt">
				<p v-if="!ganttRijen.length && !zonderDatum.length" class="pa-deck__empty">{{ t('Give cards a start or due date to see them here.') }}</p>
				<div v-if="ganttRijen.length || zonderDatum.length" ref="ganttEl" class="pa-deck__ganttscroll" @pointerdown="beginPan">
					<div class="pa-deck__ganttkop" :style="{ width: ganttBreedte + 'px' }">
						<div class="pa-deck__ganttlabel" />
						<div class="pa-deck__ganttdagen">
							<div v-for="d in ganttDagen" :key="d.sleutel" class="pa-deck__ganttdag" :class="{ 'pa-deck__ganttdag--vandaag': d.vandaag, 'pa-deck__ganttdag--weekend': d.weekend, 'pa-deck__ganttdag--grens': d.grens }" :style="{ width: dagPx + 'px', flexBasis: dagPx + 'px' }" :title="d.sleutel">
								<span v-if="d.kop" class="pa-deck__ganttmaand">{{ d.kop }}</span>
								<span v-if="schaal === 'dag'">{{ d.datum.getDate() }}</span>
								<span v-if="schaal === 'uur'" class="pa-deck__uren"><span v-for="u in uren" :key="u" class="pa-deck__uur" :style="{ width: (dagPx / 24) * 3 + 'px' }">{{ u }}</span></span>
							</div>
						</div>
					</div>
					<template v-for="groep in ganttRijen" :key="'g' + groep.stack.id">
						<div class="pa-deck__ganttrij pa-deck__ganttrij--kop" :class="{ 'pa-deck__ganttrij--doel': doelStack === groep.stack.id }" :data-stack="groep.stack.id" :style="{ width: ganttBreedte + 'px' }" @dragover.prevent="losOver($event, groep.stack)" @drop.prevent="losDrop($event, groep.stack)">
							<div class="pa-deck__ganttlabel"><strong>{{ groep.stack.title }}</strong></div>
							<div class="pa-deck__ganttspoor" />
						</div>
						<div v-for="r in groep.rijen" :key="r.card.id" class="pa-deck__ganttrij" :class="{ 'pa-deck__ganttrij--doel': doelStack === groep.stack.id }" :data-stack="groep.stack.id" :style="{ width: ganttBreedte + 'px' }" @dragover.prevent="losOver($event, groep.stack)" @drop.prevent="losDrop($event, groep.stack)">
							<div class="pa-deck__ganttlabel" :title="'#' + r.card.id + ' ' + r.card.title"><span class="pa-deck__nummer">#{{ r.card.id }}</span> {{ r.card.title }}</div>
							<div class="pa-deck__ganttspoor">
								<div class="pa-deck__ganttvandaag" :style="{ left: ganttVandaagX + 'px' }" />
								<!-- Midden = hele balk verschuiven, uiteinden = begin of eind; omhoog/omlaag = andere lijst. -->
								<div class="pa-deck__balk" :class="{ 'pa-deck__balk--done': r.card.status === 'finished', 'pa-deck__balk--laat': r.laat, 'pa-deck__balk--punt': r.punt, 'pa-deck__balk--sleep': sleep && sleep.card.id === r.card.id }" :style="balkStijl(r, groep)" :title="r.titel" @pointerdown.stop.prevent="beginSleep($event, groep.stack, r, 'verplaats')">
									<span v-if="!r.punt" class="pa-deck__greep pa-deck__greep--links" :title="t('Drag to change the start')" @pointerdown.stop.prevent="beginSleep($event, groep.stack, r, 'begin')" />
									<span class="pa-deck__balktekst">{{ sleep && sleep.card.id === r.card.id ? sleepTekst : r.card.title }}</span>
									<span class="pa-deck__greep pa-deck__greep--rechts" :title="t('Drag to change the end')" @pointerdown.stop.prevent="beginSleep($event, groep.stack, r, 'eind')" />
								</div>
							</div>
						</div>
					</template>
				</div>
				<div v-if="zonderDatum.length" class="pa-deck__los">
					<span class="pa-deck__labelkop">{{ t('Without date') }} · {{ t('Drag a card onto the timeline to schedule it') }}</span>
					<button v-for="k in zonderDatum" :key="k.card.id" type="button" class="pa-deck__loskaart" :style="{ borderColor: k.kleur }" draggable="true" :title="k.stack.title" @dragstart="sleepLos = k" @dragend="sleepLos = null; doelStack = null" @click="openCard(k.stack, k.card)">{{ k.card.title }}</button>
				</div>
			</div>
			</div>
		</template>
	</div>
</template>

<script>
import MaterialIcoon from './MaterialIcoon.vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import FoutMelding from './FoutMelding.vue'
import { listDeckBoards, listDeckStacks, createBoard, createStack, createCard, deleteCard, deleteStack, deleteBoard, updateCard, renameBoard, renameStack, boardLabels, createLabel, setCardLabels, reorderCards, reorderStacks, assignMe, listAttachments, attachmentDataUrl, addAttachment, deleteAttachment } from '../api/shortcutSources.js'
import { WEB } from '../mode.js'
import { getSettings } from '../api/nextcloudUserData.js'
import { t, currentLocale } from '../l10n/index.js'
import { neemVoorinvulling, pastOpNaam } from '../api/voorinvulling.js'
import { eersteGelijkende } from '../api/lijktOp.js'
import { foutTekst } from '../api/fouten.js'
import { zijPaneel } from '../api/navigatie.js'
import { tekstKleur } from '../api/kleur.js'
import { volgSync } from '../api/sync.js'

// Pixels per dag per schaal. Uren: 20 px per uur.
const SCHALEN = { uur: 480, dag: 28, week: 9, maand: 3 }
const KLEUREN = ['#1e3a5f', '#2e8b57', '#8a6a2c', '#7b3f8c', '#c0392b', '#1f7a8c', '#b5651d', '#4b6b3c']
const DAG_MS = 86400000
const UUR_MS = 3600000

function twee(n) { return String(n).padStart(2, '0') }
function dagSleutel(d) { return d.getFullYear() + '-' + twee(d.getMonth() + 1) + '-' + twee(d.getDate()) }
function dagStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function plusDagen(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
/** ISO → waarde voor <input type=datetime-local> (plaatselijke tijd). */
function naarLokaal(iso) {
	if (!iso) return ''
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return ''
	return d.getFullYear() + '-' + twee(d.getMonth() + 1) + '-' + twee(d.getDate()) + 'T' + twee(d.getHours()) + ':' + twee(d.getMinutes())
}
function vanLokaal(v) { return v ? new Date(v).toISOString() : null }

/** Een plaatje verkleinen tot max 1600 px en als JPEG teruggeven. */
async function verklein(file) {
	if (!/^image\//.test(file.type)) return file
	const bitmap = await createImageBitmap(file).catch(() => null)
	if (!bitmap) return file
	const max = 1600
	const schaal = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
	if (schaal >= 1 && file.size < 1200000) return file
	const canvas = document.createElement('canvas')
	canvas.width = Math.round(bitmap.width * schaal)
	canvas.height = Math.round(bitmap.height * schaal)
	canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
	const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85))
	return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg', { type: 'image/jpeg' })
}

/**
 * Eigen Deck (Ramin, 2026-09-14): borden als tabbladen, lijsten naast
 * elkaar met hun kaarten; kaart openen = titel, beschrijving, eigenaar,
 * status, begin en eind (met tijd), lijst, labels en plaatjes. Slepen:
 * kaarten binnen en tussen lijsten, lijsten onderling, het hele paneel op een
 * leeg stuk. Gantt met uren, dagen, weken, maanden; balken verschuiven of
 * aan de uiteinden rekken; kaarten zonder datum vanuit het bakje op de
 * tijdlijn slepen (dan een uur). In Nextcloud via de Deck-API, in de
 * web-agenda bij ons (account/deck).
 */
export default {
	name: 'DeckView',
	components: { MaterialIcoon, NcNoteCard, NcButton, NcLoadingIcon, FoutMelding },
	props: {
		/** Vanuit Nog open: {deckBoardId, deckCardId} om meteen die kaart te openen (2026-09-15). */
		springNaar: { type: Object, default: null },
	},
	data() {
		return { stopKijken: null,
			boards: [], current: null, stacks: [], labels: [], loading: true, error: null, busy: false,
			// {stack, kaart, tekst, maak}: de bestaande kaart waar de nieuwe op lijkt, en wat er anders gemaakt zou worden.
			dubbel: null,
			boardTitle: '', stackTitle: '', newCard: {}, vraag: null, hernoem: null, edit: null, view: 'board',
			sleep: null, schaal: 'dag', sleepKaart: null, sleepDoel: null, sleepIndex: null, sleepStack: null, sleepLos: null, doelStack: null,
			labelTitel: '', labelKleur: '#1e3a5f', pan: false, web: WEB, mijnNaam: '',
			plaatjes: [], plaatjesBezig: false, klok: null, zichtbaar: null, laatsteStand: '', wachtend: null,
		}
	},
	computed: {
		/** Staat er een paneel rechts? Dan opent de kaart daar (Ramin, 24-09). Anders naast het bord. */
		naarPaneel() { return zijPaneel.aanwezig && !!this.edit },
		statussen() { return this.web ? ['open', 'busy', 'waiting', 'finished'] : ['open', 'finished'] },
		uren() { return [0, 3, 6, 9, 12, 15, 18, 21] },
		vandaagSleutel() { return dagSleutel(new Date()) },
		dagPx() { return SCHALEN[this.schaal] || 28 },
		/** Hoe fijn er gesleept wordt: een kwartier op de urenschaal, anders een dag. */
		stapMs() { return this.schaal === 'uur' ? 15 * 60000 : DAG_MS },
		/** Alle kaarten met een datum, met begin en eind als tijdstip (ms). */
		ganttKaarten() {
			const uit = []
			this.stacks.forEach((stack, i) => {
				for (const card of stack.cards) {
					const due = card.duedate ? new Date(card.duedate).getTime() : null
					const start = card.startdate ? new Date(card.startdate).getTime() : null
					if (!due && !start) continue
					let van = start ?? due
					let tot = due ?? start
					if (van > tot) [van, tot] = [tot, van]
					uit.push({ stack, kleur: KLEUREN[i % KLEUREN.length], card, van, tot, punt: start === null || start === due })
				}
			})
			return uit
		},
		/** Kaarten zonder enige datum: het bakje onder de Gantt. */
		zonderDatum() {
			const uit = []
			this.stacks.forEach((stack, i) => {
				for (const card of stack.cards) {
					if (!card.duedate && !card.startdate && card.status !== 'finished') uit.push({ stack, card, kleur: KLEUREN[i % KLEUREN.length] })
				}
			})
			return uit
		},
		ganttBereik() {
			const vandaag = dagStart(new Date())
			let min = plusDagen(vandaag, this.schaal === 'uur' ? -1 : -7)
			let max = plusDagen(vandaag, this.schaal === 'uur' ? 3 : 21)
			for (const k of this.ganttKaarten) {
				const v = dagStart(new Date(k.van))
				const t2 = dagStart(new Date(k.tot))
				if (v < min) min = plusDagen(v, -2)
				if (t2 > max) max = plusDagen(t2, 3)
			}
			const dagen = Math.min(this.schaal === 'uur' ? 60 : 400, Math.round((max - min) / DAG_MS) + 1)
			return { start: min, dagen }
		},
		ganttDagen() {
			const uit = []
			for (let i = 0; i < this.ganttBereik.dagen; i++) {
				const datum = plusDagen(this.ganttBereik.start, i)
				const sleutel = dagSleutel(datum)
				// Wat er boven de kolom staat, hangt van de schaal af.
				let kop = null
				let grens = false
				if (this.schaal === 'uur') { kop = datum.toLocaleDateString(currentLocale(), { weekday: 'short', day: 'numeric', month: 'short' }); grens = true }
				if (this.schaal === 'dag' && (datum.getDate() === 1 || i === 0)) kop = datum.toLocaleDateString(currentLocale(), { month: 'short' })
				if (this.schaal === 'week' && datum.getDay() === 1) { kop = datum.toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short' }); grens = true }
				if (this.schaal === 'maand' && datum.getDate() === 1) { kop = datum.toLocaleDateString(currentLocale(), { month: 'short' }); grens = true }
				uit.push({ datum, sleutel, vandaag: sleutel === this.vandaagSleutel, weekend: datum.getDay() === 0 || datum.getDay() === 6, kop, grens })
			}
			return uit
		},
		ganttBreedte() { return 220 + this.ganttBereik.dagen * this.dagPx },
		/** Wat de balk tijdens het slepen zegt: de nieuwe tijden. */
		sleepTekst() {
			const s = this.sleep
			if (!s) return ''
			const n = this.nieuweTijden(s)
			const lijst = s.naarStack && s.naarStack !== s.stack.id ? ' → ' + (this.stacks.find((x) => x.id === s.naarStack)?.title || '') : ''
			return (n.van !== null && !s.rij.punt ? this.momentTekst(n.van) + ' – ' : '') + this.momentTekst(n.tot) + lijst
		},
		ganttVandaagX() { return this.tijdX(Date.now()) },
		ganttRijen() {
			const perStack = new Map()
			const minBreedte = this.schaal === 'uur' ? this.dagPx / 24 : this.dagPx
			for (const k of this.ganttKaarten) {
				if (!perStack.has(k.stack.id)) perStack.set(k.stack.id, { stack: k.stack, kleur: k.kleur, rijen: [] })
				const x = this.tijdX(k.van)
				// Een kaart met alleen een einddatum: een blokje van een dag (of een uur op de urenschaal).
				const w = Math.max(minBreedte - 4, (k.punt ? minBreedte : this.tijdX(k.tot) - x) - 4)
				perStack.get(k.stack.id).rijen.push({
					card: k.card, x: k.punt && this.schaal !== 'uur' ? this.tijdX(dagStart(new Date(k.van)).getTime()) : (k.punt ? x - minBreedte : x), w, punt: k.punt, van: k.van, tot: k.tot,
					laat: k.card.status !== 'finished' && k.tot < Date.now(),
					titel: k.card.title + ' · ' + (k.punt ? this.momentTekst(k.tot) : this.momentTekst(k.van) + ' – ' + this.momentTekst(k.tot)),
				})
			}
			for (const g of perStack.values()) g.rijen.sort((a, b) => a.x - b.x)
			return Array.from(perStack.values())
		},
	},
	watch: {
		springNaar() { this.springNaarKaart() },
		// Zolang de kaart het paneel gebruikt, blijven de tabbladen eronder weg.
		naarPaneel: { handler(v) { zijPaneel.deckKaartOpen = v }, immediate: true },
	},
	async mounted() {
		// Meeluisteren met je andere apparaten (Ramin, 24-09): verandert dit elders, dan staat
		// het hier meteen goed in plaats van pas als je het scherm opnieuw opent.
		this.stopKijken = volgSync(() => this.ververs())
		await this.load()
		await this.springNaarKaart()
		await this.ingesprokenKaart()
		// De eigenaar van een nieuwe kaart: jijzelf, tenzij de lijst CLAUDE CODE heet.
		try { const s = await getSettings(); this.mijnNaam = (s && s.firstName) || '' } catch (e) { /* zonder naam */ }
		// Live bijwerken (Ramin, 2026-09-14: "Deck met live veranderingen"): elke
		// 15 seconden stil kijken of er iets veranderd is, zonder spinner en
		// zonder een open editor of een sleep te storen.
		this.klok = setInterval(() => this.ververs(), 5000)
		this.zichtbaar = () => { if (document.visibilityState === 'visible') this.ververs() }
		document.addEventListener('visibilitychange', this.zichtbaar)
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
		zijPaneel.deckKaartOpen = false
		if (this.klok) clearInterval(this.klok)
		if (this.zichtbaar) document.removeEventListener('visibilitychange', this.zichtbaar)
	},
	methods: {
		t(...args) { return t(...args) },
		statusTekst(st) { return { open: t('Open'), busy: t('In progress'), waiting: t('Waiting'), finished: t('Finished') }[st] || st },
		/** Datum, en de tijd erbij als die niet op een hele dag staat. */
		momentTekst(iso) {
			if (!iso) return ''
			const d = new Date(iso)
			if (Number.isNaN(d.getTime())) return ''
			const datum = d.toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short' })
			const metTijd = this.schaal === 'uur' || d.getHours() !== 0 || d.getMinutes() !== 0
			return metTijd ? datum + ' ' + twee(d.getHours()) + ':' + twee(d.getMinutes()) : datum
		},
		tijdX(ms) { return Math.round((ms - this.ganttBereik.start.getTime()) / DAG_MS * this.dagPx) },
		balkStijl(r, groep) {
			const stijl = { left: r.x + 'px', width: r.w + 'px', background: groep.kleur }
			if (this.sleep && this.sleep.card.id === r.card.id) {
				const n = this.nieuweTijden(this.sleep)
				const x = this.tijdX(r.punt ? n.tot : n.van)
				const w = r.punt ? r.w : Math.max(6, this.tijdX(n.tot) - x - 4)
				stijl.left = (r.punt ? r.x + (x - this.tijdX(r.tot)) : x) + 'px'
				stijl.width = w + 'px'
			}
			return stijl
		},
		/** Begin en eind na een sleep: verschuiven, of alleen begin of alleen eind. */
		nieuweTijden(s) {
			const delta = s.deltaMs
			let van = s.rij.punt ? null : s.rij.van
			let tot = s.rij.tot
			if (s.wijze === 'verplaats') { if (van !== null) van += delta; tot += delta }
			if (s.wijze === 'begin' && van !== null) van = Math.min(van + delta, tot - this.stapMs)
			if (s.wijze === 'eind') tot = Math.max(tot + delta, (van ?? tot - this.stapMs) + this.stapMs)
			return { van, tot }
		},
		beginSleep(e, stack, rij, wijze) {
			const start = { x: e.clientX, y: e.clientY }
			this.sleep = { card: rij.card, stack, rij, wijze, deltaMs: 0, naarStack: stack.id, bewogen: false }
			const move = (ev) => {
				const dx = ev.clientX - start.x
				const dy = ev.clientY - start.y
				if (Math.abs(dx) > 4 || Math.abs(dy) > 4) this.sleep.bewogen = true
				this.sleep.deltaMs = Math.round(dx / this.dagPx * DAG_MS / this.stapMs) * this.stapMs
				const onder = document.elementFromPoint(ev.clientX, ev.clientY)
				const rijEl = onder && onder.closest ? onder.closest('.pa-deck__ganttrij') : null
				if (rijEl && rijEl.dataset.stack && wijze === 'verplaats') this.sleep.naarStack = Number(rijEl.dataset.stack)
			}
			const up = () => {
				window.removeEventListener('pointermove', move)
				window.removeEventListener('pointerup', up)
				const s = this.sleep
				this.sleep = null
				if (!s) return
				if (!s.bewogen) { this.openCard(s.stack, s.card); return }
				const naar = s.naarStack && s.naarStack !== s.stack.id ? s.naarStack : null
				if (!s.deltaMs && !naar) return
				const n = this.nieuweTijden(s)
				const c = s.card
				this.doe(() => updateCard(this.current, s.stack, c, {
					title: c.title, description: c.description, status: c.status, stackId: naar || s.stack.id,
					startdate: c.startdate ? new Date(n.van).toISOString() : (s.wijze === 'begin' ? new Date(n.van).toISOString() : null),
					duedate: c.duedate || !c.startdate ? new Date(n.tot).toISOString() : (c.duedate ? new Date(n.tot).toISOString() : null),
				}))
			}
			window.addEventListener('pointermove', move)
			window.addEventListener('pointerup', up)
		},
		/** Kaart zonder datum boven een rij: die lijst licht op. */
		losOver(e, stack) { if (this.sleepLos) this.doelStack = stack.id },
		/** Losgelaten op de tijdlijn: begin op dat moment, een uur lang (Ramin, 2026-09-14). */
		losDrop(e, stack) {
			const k = this.sleepLos
			this.sleepLos = null
			this.doelStack = null
			if (!k) return
			const spoor = e.currentTarget.querySelector('.pa-deck__ganttspoor')
			const rect = spoor.getBoundingClientRect()
			const ms = (e.clientX - rect.left) / this.dagPx * DAG_MS
			let start = this.ganttBereik.start.getTime() + Math.round(ms / this.stapMs) * this.stapMs
			if (this.schaal !== 'uur') start += 9 * UUR_MS
			const c = k.card
			this.doe(() => updateCard(this.current, k.stack, c, {
				title: c.title, description: c.description, status: c.status, stackId: stack.id,
				startdate: new Date(start).toISOString(), duedate: new Date(start + UUR_MS).toISOString(),
			}))
		},
		/** Het paneel verschuiven door op een leeg stuk te slepen (Ramin, 2026-09-14). */
		beginPan(e) {
			const el = e.currentTarget
			const leeg = e.target === el || e.target.classList.contains('pa-deck__stack') || e.target.classList.contains('pa-deck__stackkop') || e.target.classList.contains('pa-deck__ganttspoor') || e.target.classList.contains('pa-deck__ganttrij') || e.target.classList.contains('pa-deck__ganttdagen')
			if (!leeg || e.button !== 0) return
			const startX = e.clientX
			const startScroll = el.scrollLeft
			this.pan = true
			const move = (ev) => { el.scrollLeft = startScroll - (ev.clientX - startX) }
			const up = () => { this.pan = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
			window.addEventListener('pointermove', move)
			window.addEventListener('pointerup', up)
		},
		dueKlasse(card) {
			if (card.status === 'finished') return ''
			const due = new Date(card.duedate).getTime()
			if (due < Date.now()) return 'pa-deck__due--laat'
			return due <= Date.now() + 2 * DAG_MS ? 'pa-deck__due--straks' : ''
		},
		/**
		 * Stil kijken of er elders iets veranderd is. Het scherm verandert dan NIET
		 * vanzelf (Ramin, 2026-09-15: "dat het scherm niet meer refreshed"): er
		 * verschijnt een knopje, en pas als je daarop klikt zie je de nieuwe stand.
		 */
		async ververs() {
			if (this.busy || document.visibilityState !== 'visible') return
			try {
				const boards = await listDeckBoards()
				const huidig = this.current && boards.find((b) => b.id === this.current.id)
				if (!huidig) {
					if (JSON.stringify(boards) !== JSON.stringify(this.boards)) await this.load()
					return
				}
				const stacks = await listDeckStacks(huidig)
				const nieuw = JSON.stringify({ b: boards.map((b) => [b.id, b.title, b.labels]), s: stacks })
				if (nieuw === this.laatsteStand) { this.wachtend = null; return }
				// Stil doorvoeren (Ramin, 2026-09-15: "het moet realtime up-to-date zijn"):
				// geen spinner, geen sprong, het bewerkvenster blijft open. Alleen midden
				// in een sleepbeweging wachten we even met het knopje.
				if (this.sleepKaart || this.sleepStack || this.sleepLos) { this.wachtend = { boards, huidig, stacks, stand: nieuw }; return }
				this.wachtend = null
				this.laatsteStand = nieuw
				this.boards = boards
				this.current = huidig
				this.stacks = stacks
				if (this.edit && this.edit.card) {
					const vers = stacks.flatMap((st) => st.cards || []).find((c) => c.id === this.edit.card.id)
					if (vers) this.edit.card = vers
				}
			} catch (e) { /* even geen verbinding: volgende ronde weer */ }
		},
		/** De klaarstaande wijzigingen alsnog laten zien (op verzoek). */
		async neemOver() {
			const w = this.wachtend
			this.wachtend = null
			if (!w) return
			if (!w.huidig) { await this.load(); return }
			this.laatsteStand = w.stand
			this.boards = w.boards
			this.current = w.huidig
			this.stacks = w.stacks
			this.labels = await boardLabels(w.huidig).catch(() => this.labels)
		},
		async load() {
			this.loading = true
			try {
				this.boards = await listDeckBoards()
				this.error = null
				const blijf = this.current && this.boards.find((b) => b.id === this.current.id)
				if (blijf) await this.openBoard(blijf)
				else if (this.boards.length) await this.openBoard(this.boards[0])
				else { this.current = null; this.stacks = [] }
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.loading = false
			}
		},
		async openBoard(board) {
			this.current = board
			this.vraag = null
			this.hernoem = null
			try {
				this.stacks = await listDeckStacks(board)
				this.labels = await boardLabels(board).catch(() => [])
				this.laatsteStand = JSON.stringify({ b: this.boards.map((b) => [b.id, b.title, b.labels]), s: this.stacks })
			} catch (e) {
				this.error = foutTekst(e)
			}
		},
		tekstKleur,
		// ---- slepen in het bord: kaarten (met volgorde) en lijsten ----
		beginKaartSleep(e, stack, card) {
			this.sleepKaart = { stack, card }
			this.sleepStack = null
			if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(card.id)) }
		},
		beginStackSleep(e, stack) {
			this.sleepStack = stack
			this.sleepKaart = null
			if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'stack-' + stack.id) }
			e.stopPropagation()
		},
		// Tijdens het slepen alleen iets zetten als het echt verandert: dragover
		// vuurt tientallen keren per seconde, en elke wijziging tekent het bord
		// opnieuw. Met een invoeg-element dat onder de muis verscheen en verdween
		// liep Chrome vast (Ramin, 2026-09-15). Nu alleen een klasse op de kaart.
		overStack(e, stack) {
			if (this.sleepDoel !== stack.id) this.sleepDoel = stack.id
			// Onder de laatste kaart = achteraan.
			if (this.sleepKaart && (e.target === e.currentTarget || e.target.classList.contains('pa-deck__form') || e.target.closest('.pa-deck__form'))) {
				if (this.sleepIndex !== stack.cards.length) this.sleepIndex = stack.cards.length
			}
		},
		overKaart(e, stack, ci) {
			if (!this.sleepKaart) return
			const rect = e.currentTarget.getBoundingClientRect()
			const index = e.clientY < rect.top + rect.height / 2 ? ci : ci + 1
			if (this.sleepDoel !== stack.id) this.sleepDoel = stack.id
			if (this.sleepIndex !== index) this.sleepIndex = index
		},
		/** Losgelaten op een lijst: lijst-volgorde, of kaart op een plek (ook binnen dezelfde lijst). */
		dropOp(stack) {
			const st = this.sleepStack
			const s = this.sleepKaart
			const index = this.sleepIndex
			this.sleepKaart = null
			this.sleepStack = null
			this.sleepDoel = null
			this.sleepIndex = null
			if (st) {
				if (st.id === stack.id) return
				const volgorde = this.stacks.filter((x) => x.id !== st.id)
				volgorde.splice(this.stacks.findIndex((x) => x.id === stack.id), 0, st)
				return this.doe(() => reorderStacks(this.current, volgorde))
			}
			if (!s) return
			const ids = stack.cards.map((c) => c.id).filter((id) => id !== s.card.id)
			ids.splice(Math.min(index ?? ids.length, ids.length), 0, s.card.id)
			return this.doe(async () => {
				if (s.stack.id !== stack.id) await updateCard(this.current, s.stack, s.card, { title: s.card.title, description: s.card.description, duedate: s.card.duedate, startdate: s.card.startdate, status: s.card.status, stackId: stack.id })
				await reorderCards(this.current, stack, ids)
			})
		},
		wisselLabel(l) {
			const ids = this.edit.labelIds
			this.edit.labelIds = ids.includes(l.id) ? ids.filter((x) => x !== l.id) : [...ids, l.id]
		},
		async nieuwLabel() {
			const titel = this.labelTitel.trim()
			const kleur = this.labelKleur.replace('#', '')
			this.labelTitel = ''
			this.busy = true
			try {
				await createLabel({ ...this.current, labels: this.labels }, titel, kleur)
				this.boards = await listDeckBoards()
				this.current = this.boards.find((b) => b.id === this.current.id) || this.current
				this.labels = await boardLabels(this.current)
				this.error = null
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.busy = false
			}
		},
		// ---- plaatjes ----
		async laadPlaatjes(stack, card) {
			this.plaatjes = []
			try {
				const lijst = await listAttachments(this.current, stack, card)
				this.plaatjes = lijst.map((a) => ({ ...a, src: null }))
				for (const a of this.plaatjes) {
					if (a.mime && !/^image\//.test(a.mime)) continue
					a.src = await attachmentDataUrl(a).catch(() => null)
				}
			} catch (e) {
				this.error = foutTekst(e)
			}
		},
		async kiesPlaatjes(e) {
			const files = Array.from(e.target.files || [])
			e.target.value = ''
			if (!files.length || !this.edit) return
			this.plaatjesBezig = true
			try {
				for (const f of files) await addAttachment(this.current, this.edit.stack, this.edit.card, await verklein(f))
				await this.laadPlaatjes(this.edit.stack, this.edit.card)
				this.error = null
			} catch (err) {
				this.error = foutTekst(err)
			} finally {
				this.plaatjesBezig = false
			}
		},
		openPlaatje(a) {
			if (!a.src) return
			if (a.url) { window.open(a.url, '_blank'); return }
			// Een data-url mag niet zomaar in een nieuw tabblad; via een blob wel.
			fetch(a.src).then((r) => r.blob()).then((b) => window.open(URL.createObjectURL(b), '_blank'))
		},
		async verwijderPlaatje(a) {
			if (!this.edit) return
			try {
				await deleteAttachment(this.current, this.edit.stack, this.edit.card, a)
				this.plaatjes = this.plaatjes.filter((x) => x.id !== a.id)
			} catch (e) {
				this.error = foutTekst(e)
			}
		},
		/** De kaart uit Nog open openen: het juiste bord, dan het kaartvenster. */
		/** Ingesproken kaart via Anina (kaart 100): bord en lijst losjes op naam, dan het kaartformulier ingevuld. */
		async ingesprokenKaart() {
			const v = neemVoorinvulling('deck')
			if (!v) return
			const board = this.boards.find((b) => pastOpNaam(b.title, v.board)) || this.current || this.boards[0]
			if (!board) return
			if (!this.current || this.current.id !== board.id) await this.openBoard(board)
			const stack = this.stacks.find((s) => pastOpNaam(s.title, v.list)) || this.stacks[0]
			if (!stack) return
			this.view = 'board'
			this.edit = { stack, card: { id: 0, nieuw: true, labels: [] }, title: v.title || '', description: v.text || '', owner: this.web ? this.standaardEigenaar(stack) : '', mij: false, status: 'open', startdate: '', duedate: v.due ? v.due + 'T17:00' : '', stackId: stack.id, labelIds: [] }
			this.plaatjes = []
			this.$nextTick(() => { const el = document.getElementById('pa-deck-edit-title'); if (el) el.focus() })
		},
		async springNaarKaart() {
			const s = this.springNaar
			if (!s || !s.deckCardId) return
			const board = this.boards.find((b) => b.id === s.deckBoardId) || this.current
			if (board && (!this.current || this.current.id !== board.id)) await this.openBoard(board)
			for (const st of this.stacks) {
				const card = (st.cards || []).find((c) => c.id === s.deckCardId)
				if (card) { this.openCard(st, card); return }
			}
		},
		/** Stil herladen na een actie: geen spinner, dus geen verspringend scherm (Ramin, 2026-09-14). */
		async herlaadStil() {
			this.boards = await listDeckBoards()
			const blijf = this.current && this.boards.find((b) => b.id === this.current.id)
			if (!blijf) { await this.load(); return }
			this.current = blijf
			this.stacks = await listDeckStacks(blijf)
			this.labels = await boardLabels(blijf).catch(() => [])
			this.laatsteStand = JSON.stringify({ b: this.boards.map((b) => [b.id, b.title, b.labels]), s: this.stacks })
			this.wachtend = null
		},
		async doe(actie) {
			this.busy = true
			try {
				await actie()
				this.error = null
				await this.herlaadStil()
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.busy = false
			}
		},
		addBoard() { const titel = this.boardTitle.trim(); this.boardTitle = ''; return this.doe(() => createBoard(titel)) },
		addStack() { if (!this.current) return; const titel = this.stackTitle.trim(); this.stackTitle = ''; return this.doe(() => createStack(this.current, titel)) },
		/** De eigenaar van een nieuwe kaart: jij, of Claude in de lijst CLAUDE CODE (Ramin, 2026-09-14). */
		standaardEigenaar(stack) { return /claude/i.test(stack.title) ? 'Claude' : this.mijnNaam },
		addCard(stack) {
			const titel = (this.newCard[stack.id] || '').trim()
			if (!titel) return
			this.newCard = { ...this.newCard, [stack.id]: '' }
			const maak = () => this.doe(() => createCard(this.current, stack, titel, null, { owner: this.standaardEigenaar(stack) }))
			const al = this.bestaandeKaart(titel)
			if (al) { this.dubbel = { ...al, tekst: '', maak }; return }
			return maak()
		},
		/** De kaart op dit bord waar de titel op lijkt: {stack, kaart} of null. */
		bestaandeKaart(titel) {
			for (const stack of this.stacks) {
				const kaart = eersteGelijkende(titel, stack.cards || [], (c) => c.title)
				if (kaart) return { stack, kaart }
			}
			return null
		},
		dubbelOpen() {
			const d = this.dubbel
			this.dubbel = null
			this.openCard(d.stack, d.kaart)
			if (d.tekst && this.edit) this.edit.description = ((this.edit.description || '').trimEnd() + '\n\n' + d.tekst).trim()
		},
		dubbelNieuw() {
			const d = this.dubbel
			this.dubbel = null
			return d.maak()
		},
		toggle(stack, card) {
			const status = card.status === 'finished' ? 'open' : 'finished'
			return this.doe(() => updateCard(this.current, stack, card, { title: card.title, description: card.description, duedate: card.duedate, startdate: card.startdate, status }))
		},
		removeCard(stack, card) { return this.doe(() => deleteCard(this.current, stack, card)) },
		removeStack(stack) { this.vraag = null; return this.doe(() => deleteStack(this.current, stack)) },
		removeBoard() { this.vraag = null; const b = this.current; this.current = null; return this.doe(() => deleteBoard(b)) },
		verplaats(stack, card, naar) { return this.doe(() => updateCard(this.current, stack, card, { title: card.title, description: card.description, duedate: card.duedate, startdate: card.startdate, status: card.status, stackId: naar.id })) },
		bewaarNaam() {
			const h = this.hernoem
			this.hernoem = null
			if (h.type === 'board') return this.doe(() => renameBoard(this.current, h.titel.trim()))
			const stack = this.stacks.find((s) => s.id === h.id)
			return this.doe(() => renameStack(this.current, stack, h.titel.trim()))
		},
		openCard(stack, card) {
			const mij = !this.web && (card.assignedUids || []).includes((window.OC && OC.getCurrentUser && OC.getCurrentUser().uid) || '')
			this.edit = { stack, card, title: card.title, description: card.description || '', owner: card.owner || (this.web ? this.standaardEigenaar(stack) : ''), mij, status: card.status || 'open', startdate: naarLokaal(card.startdate), duedate: naarLokaal(card.duedate), stackId: stack.id, labelIds: (card.labels || []).map((l) => l.id) }
			this.laadPlaatjes(stack, card)
			// Alleen naar boven springen als de kaart náást het bord opent. Staat hij in het rechterpaneel,
			// dan is hij al in beeld en zou dit het bord onnodig verschuiven (Ramin, 24-09: "als ik in DECK
			// een card open, verschuift de midden kolom met deckcards iets naar boven").
			if (!zijPaneel.aanwezig) this.$el.scrollIntoView({ behavior: 'smooth', block: 'start' })
		},
		saveCard() {
			const e = this.edit
			this.edit = null
			const oud = (e.card.labels || []).map((l) => l.id).sort().join(',')
			const nieuw = [...e.labelIds].sort().join(',')
			const velden = { title: e.title.trim(), description: e.description, status: e.status, stackId: e.stackId, startdate: vanLokaal(e.startdate), duedate: vanLokaal(e.duedate), owner: e.owner }
			const maakNieuw = () => this.doe(async () => {
				const gemaakt = await createCard(this.current, e.stack, velden.title, velden.duedate, { owner: velden.owner })
				const id = gemaakt && gemaakt.id
				if (!id) return
				const kaart = { id, labels: [], status: 'open' }
				await updateCard(this.current, e.stack, kaart, velden)
				if (e.labelIds.length) await setCardLabels(this.current, e.stack, { ...kaart, ...velden, done: false }, e.labelIds)
			})
			if (e.card.nieuw) {
				const al = this.bestaandeKaart(velden.title)
				if (al) { this.dubbel = { ...al, tekst: (e.description || '').trim(), maak: maakNieuw }; return }
				return maakNieuw()
			}
			return this.doe(async () => {
				if (e.card.nieuw) {
					// Nieuwe kaart uit het volledige formulier (ingesproken, kaart 100): eerst maken, dan de rest erbij.
					const gemaakt = await createCard(this.current, e.stack, velden.title, velden.duedate, { owner: velden.owner })
					const id = gemaakt && gemaakt.id
					if (!id) return
					const kaart = { id, labels: [], status: 'open' }
					await updateCard(this.current, e.stack, kaart, velden)
					if (e.labelIds.length) await setCardLabels(this.current, e.stack, { ...kaart, ...velden, done: false }, e.labelIds)
					return
				}
				await updateCard(this.current, e.stack, e.card, velden)
				if (!this.web) {
					const was = (e.card.assignedUids || []).includes((window.OC && OC.getCurrentUser && OC.getCurrentUser().uid) || '')
					if (was !== e.mij) await assignMe(this.current, e.stack, e.card, e.mij)
				}
				if (oud !== nieuw) {
					const stack = this.stacks.find((x) => x.id === e.stackId) || e.stack
					await setCardLabels(this.current, stack, { ...e.card, ...velden, done: e.status === 'finished' }, e.labelIds)
				}
			})
		},
	},
}
</script>

<style scoped>
.pa-deck__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.pa-deck__chips { display: flex; gap: 4px; }
.pa-deck__chip { border: 1px solid var(--color-border, #ccc); background: transparent; border-radius: 16px; padding: 4px 12px; cursor: pointer; color: inherit; }
.pa-deck__chip--active { background: var(--color-primary-element, #1e3a5f); color: var(--color-primary-element-text, #fff); border-color: transparent; }
.pa-deck__form { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
.pa-deck__form input { flex: 1; min-width: 120px; }
.pa-deck__inline { display: inline-flex; gap: 6px; align-items: center; }
.pa-deck__boards { display: flex; gap: 6px; flex-wrap: wrap; margin: 12px 0; align-items: center; }
.pa-deck__boardtab { border: 1px solid var(--color-border, #ccc); background: transparent; border-radius: 16px; padding: 4px 12px; cursor: pointer; color: inherit; }
.pa-deck__boardtab--active { background: var(--color-primary-element, #1e3a5f); color: var(--color-primary-element-text, #fff); border-color: transparent; }
.pa-deck__werk { display: flex; gap: 12px; align-items: flex-start; }
.pa-deck__werk > .pa-deck__stacks, .pa-deck__werk > .pa-deck__gantt { flex: 1 1 auto; min-width: 0; }
.pa-deck__editor { order: 2; flex: 0 0 360px; max-width: 360px; position: sticky; top: 8px; max-height: calc(100vh - 32px); overflow-y: auto; box-sizing: border-box; border: 1px solid var(--color-border, #ccc); border-radius: var(--border-radius-large, 8px); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; background: var(--color-main-background, #fff); }
/* In het paneel geen eigen kader en geen vaste breedte: het paneel is al een kader. */
/* In het paneel geen eigen kader en geen vaste breedte: het paneel is al een kader. De kaart vult de
   hoogte, zodat de beschrijving meegroeit en Opslaan onderaan staat in plaats van halverwege met
   een leeg vlak eronder (Ramin, 24-09). */
.pa-deck__editor--paneel { order: 0; flex: none; max-width: none; width: 100%; position: static;
	max-height: none; border: 0; padding: 0; height: 100%; }
.pa-deck__editor--paneel textarea.pa-deck__veld { flex: 1 1 auto; min-height: 8em; }
.pa-deck__editor textarea.pa-deck__veld { min-height: 40vh; resize: vertical; }
@media (max-width: 900px) { .pa-deck__werk { flex-direction: column; } .pa-deck__editor { order: 0; flex: none; max-width: none; width: 100%; position: static; max-height: none; } }
.pa-deck__editor h3 { margin: 0; }
.pa-deck__veld { width: 100%; box-sizing: border-box; font: inherit; }
/* Kaartnummer: zo weten Ramin en Claude over welke kaart het gaat (2026-09-15). */
.pa-deck__nummer { color: var(--color-text-maxcontrast, #888); font-size: 0.85em; font-variant-numeric: tabular-nums; }
.pa-deck__rij { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.pa-deck__check { display: inline-flex; gap: 6px; align-items: center; }
.pa-deck__stacks { display: flex; gap: 12px; align-items: flex-start; overflow-x: auto; padding-bottom: 8px; cursor: grab; }
.pa-deck__stacks--pan { cursor: grabbing; user-select: none; }
.pa-deck__stack { flex: 0 0 260px; background: var(--color-background-hover); border-radius: var(--border-radius-large, 8px); padding: 10px; }
.pa-deck__stack h3 { margin: 0 0 6px; font-size: 1em; cursor: text; }
.pa-deck__stackkop { display: flex; align-items: center; gap: 4px; cursor: grab; }
.pa-deck__aantal { font-weight: normal; color: var(--color-text-maxcontrast); font-size: 0.85em; }
.pa-deck__vraag { display: inline-flex; align-items: center; gap: 6px; font-size: 0.9em; }
.pa-deck__stack--new { display: flex; gap: 6px; align-items: center; background: transparent; border: 1px dashed var(--color-border, #ccc); }
.pa-deck__card { display: flex; align-items: center; gap: 6px; padding: 4px 0; cursor: grab; }
.pa-deck__card--sleep { opacity: .4; }
.pa-deck__invoeg { height: 3px; margin: 2px 0; border-radius: 2px; background: #2e8b57; }
.pa-deck__card--boven { box-shadow: 0 -3px 0 0 #2e8b57; }
.pa-deck__form--boven { box-shadow: 0 -3px 0 0 #2e8b57; }
.pa-deck__cardtitel { border: none; background: transparent; text-align: left; cursor: pointer; color: inherit; padding: 2px 0; display: flex; flex-direction: column; gap: 2px; font: inherit; }
.pa-deck__grow { flex: 1; min-width: 0; }
.pa-deck__meta { display: flex; gap: 8px; flex-wrap: wrap; color: var(--color-text-maxcontrast); font-size: 0.8em; align-items: center; }
.pa-deck__eigenaar { border: 1px solid var(--color-border, #ccc); border-radius: 10px; padding: 0 6px; }
.pa-deck__status { border-radius: 10px; padding: 0 6px; color: #fff; }
.pa-deck__status--busy { background: #1f7a8c; }
.pa-deck__wachtend { display: flex; align-items: center; gap: 12px; margin: 0 0 8px; padding: 6px 12px; border-radius: 8px; background: var(--color-primary-element-light, #e8f0fe); font-size: 0.9em; }
.pa-deck__status--waiting { background: #8a6a2c; }
.pa-deck__due--laat { color: #c0392b; font-weight: 600; }
.pa-deck__due--straks { color: #b7791f; font-weight: 600; }
.pa-deck__done { text-decoration: line-through; color: var(--color-text-maxcontrast); }
.pa-deck__empty { color: var(--color-text-maxcontrast); }
.pa-deck__x { border: none; background: transparent; cursor: pointer; color: var(--color-text-maxcontrast); font-size: 1.1em; padding: 0 4px; display: inline-flex; align-items: center; }
.pa-deck__stack--doel { outline: 2px dashed #2e8b57; }
.pa-deck__stack--lijstdoel { outline: 2px solid #1f7a8c; }
.pa-deck__labels { align-items: center; }
.pa-deck__labelkop { font-size: 0.85em; color: var(--color-text-maxcontrast); }
.pa-deck__label { border: none; border-radius: 10px; padding: 2px 8px; font-size: 0.8em; cursor: pointer; }
.pa-deck__label--uit { opacity: .35; }
.pa-deck__label--klein { padding: 0 6px; font-size: 0.7em; cursor: inherit; }
.pa-deck__cardlabels { display: flex; gap: 4px; flex-wrap: wrap; }
/* Plaatjes */
.pa-deck__plaatjes { align-items: center; }
.pa-deck__plaatje { position: relative; display: inline-flex; align-items: flex-start; }
.pa-deck__plaatje img { width: 96px; height: 96px; object-fit: cover; border-radius: 6px; cursor: zoom-in; border: 1px solid var(--color-border, #ccc); }
.pa-deck__upload input { display: none; }
.pa-deck__upload .pa-deck__chip { display: inline-block; }

/* Gantt */
.pa-deck__ganttscroll { overflow-x: auto; border: 1px solid var(--color-border, #ddd); border-radius: var(--border-radius-large, 8px); cursor: grab; }
.pa-deck__ganttkop, .pa-deck__ganttrij { display: flex; min-height: 30px; }
.pa-deck__ganttkop { position: sticky; top: 0; background: var(--color-main-background, #fff); z-index: 2; border-bottom: 1px solid var(--color-border, #ddd); }
.pa-deck__ganttlabel { flex: 0 0 220px; width: 220px; padding: 4px 8px; box-sizing: border-box; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9em; position: sticky; left: 0; background: var(--color-main-background, #fff); z-index: 1; border-right: 1px solid var(--color-border, #ddd); }
.pa-deck__ganttdagen { display: flex; }
.pa-deck__ganttdag { flex: 0 0 28px; width: 28px; text-align: center; font-size: 0.7em; color: var(--color-text-maxcontrast); position: relative; padding-top: 12px; box-sizing: border-box; min-height: 28px; }
.pa-deck__ganttdag--grens { border-left: 1px solid var(--color-border, #ddd); }
.pa-deck__uren { display: flex; }
.pa-deck__uur { text-align: left; padding-left: 2px; box-sizing: border-box; border-left: 1px dotted var(--color-border, #ddd); }
.pa-deck__ganttdag--weekend { background: var(--color-background-hover, rgba(0,0,0,.03)); }
.pa-deck__ganttdag--vandaag { color: #c0392b; font-weight: 700; }
.pa-deck__ganttmaand { position: absolute; top: 0; left: 2px; font-size: 0.9em; white-space: nowrap; color: var(--color-main-text); }
.pa-deck__ganttspoor { position: relative; flex: 1; min-height: 30px; border-bottom: 1px solid var(--color-border, #eee); }
.pa-deck__ganttrij--kop .pa-deck__ganttspoor { background: var(--color-background-hover, rgba(0,0,0,.03)); }
.pa-deck__ganttvandaag { position: absolute; top: 0; bottom: 0; width: 2px; background: #c0392b; opacity: .6; }
.pa-deck__balk { position: absolute; top: 5px; height: 20px; border-radius: 10px; color: #fff; font-size: 0.75em; display: flex; align-items: center; overflow: hidden; white-space: nowrap; cursor: grab; text-shadow: 0 1px 2px rgba(0,0,0,.5); touch-action: none; user-select: none; box-sizing: border-box; }
.pa-deck__balktekst { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; padding: 0 4px; }
.pa-deck__greep { flex: 0 0 8px; height: 100%; cursor: ew-resize; background: rgba(255,255,255,.35); }
.pa-deck__greep--links { border-radius: 10px 0 0 10px; }
.pa-deck__greep--rechts { border-radius: 0 10px 10px 0; margin-left: auto; }
.pa-deck__balk--punt { border-radius: 4px; }
.pa-deck__balk--punt .pa-deck__greep--rechts { border-radius: 0 4px 4px 0; }
.pa-deck__balk--laat { outline: 2px solid #c0392b; }
.pa-deck__balk--done { opacity: .45; text-decoration: line-through; }
.pa-deck__balk--sleep { cursor: grabbing; z-index: 3; box-shadow: 0 2px 8px rgba(0,0,0,.4); opacity: .95; }
.pa-deck__ganttrij--doel .pa-deck__ganttspoor, .pa-deck__ganttrij--doel .pa-deck__ganttlabel { background: rgba(46, 139, 87, .18); }
.pa-deck__los { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 10px; }
.pa-deck__loskaart { border: 2px solid; background: var(--color-main-background, #fff); color: inherit; border-radius: 10px; padding: 3px 10px; cursor: grab; font: inherit; }
</style>
