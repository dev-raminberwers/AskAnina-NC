<template>
	<div class="pa-tasks">
		<div class="pa-tasks__toolbar">
			<h2>{{ t('Tasks') }}</h2>
			<input id="pa-task-search" v-model="zoek" type="search" :placeholder="t('Search')" class="pa-tasks__zoek">
		</div>
		<form class="pa-tasks__form" @submit.prevent="add">
			<input id="pa-task-new" v-model="summary" type="text" :placeholder="t('New task')">
			<input id="pa-task-new-start" v-model="start" type="date" :title="t('Start date')">
			<input id="pa-task-new-due" v-model="due" type="date" :title="t('Due date')">
			<select v-if="calendars.length > 1" id="pa-task-new-calendar" v-model="calendarHref" :title="t('List')">
				<option v-for="c in calendars" :key="c.href" :value="c.href">{{ c.displayName }}</option>
			</select>
			<NcButton type="primary" native-type="submit" :disabled="busy || !summary.trim()">{{ nieuwOnder ? t('Add subtask') : t('Add task') }}</NcButton>
			<span v-if="nieuwOnder" class="pa-tasks__meta">{{ t('Subtask of %s', nieuwOnder.summary) }} <button type="button" class="pa-tasks__x" :title="t('Cancel')" @click="nieuwOnder = null">×</button></span>
		</form>
		<FoutMelding v-if="error" :error="error" />
		<!-- Lijkt de nieuwe taak op een open taak? Eerst vragen (Ramin, 2026-09-16). -->
		<NcNoteCard v-if="dubbel" type="info">
			<p>{{ t('There is already a %s named %s. Add to it, or make a new one?', t('task'), dubbel.bestaand) }}</p>
			<NcButton type="primary" :disabled="busy" @click="dubbelNieuw">{{ t('Make a new one') }}</NcButton>
			<NcButton :disabled="busy" @click="dubbel = null">{{ t('Cancel') }}</NcButton>
		</NcNoteCard>
		<NcLoadingIcon v-else-if="loading" :size="24" />
		<template v-else>
			<!-- Bewerken: één paneel boven de lijsten. -->
			<div v-if="edit" class="pa-tasks__editor">
				<input id="pa-task-edit-title" v-model="edit.summary" type="text" :placeholder="t('Title')" class="pa-tasks__veld">
				<textarea id="pa-task-edit-notes" v-model="edit.notes" rows="3" :placeholder="t('Notes')" class="pa-tasks__veld" />
				<div class="pa-tasks__rij">
					<label for="pa-task-edit-start">{{ t('Start date') }}</label>
					<input id="pa-task-edit-start" v-model="edit.start" type="date">
					<label for="pa-task-edit-due">{{ t('Due date') }}</label>
					<input id="pa-task-edit-due" v-model="edit.due" type="date">
					<label for="pa-task-edit-prio">{{ t('Priority') }}</label>
					<select id="pa-task-edit-prio" v-model.number="edit.priority">
						<option :value="0">{{ t('None') }}</option>
						<option :value="1">{{ t('High') }}</option>
						<option :value="5">{{ t('Medium') }}</option>
						<option :value="9">{{ t('Low') }}</option>
					</select>
					<label for="pa-task-edit-parent">{{ t('Subtask of') }}</label>
					<select id="pa-task-edit-parent" v-model="edit.parentUid">
						<option :value="null">—</option>
						<option v-for="p in ouderKandidaten(edit.task)" :key="p.uid" :value="p.uid">{{ p.summary }}</option>
					</select>
					<span v-if="edit.task.calendarName" class="pa-tasks__meta">{{ edit.task.calendarName }}</span>
				</div>
				<div class="pa-tasks__rij">
					<NcButton type="primary" :disabled="busy || !edit.summary.trim()" @click="saveEdit">{{ t('Save') }}</NcButton>
					<NcButton type="error" :disabled="busy" @click="remove(edit.task); edit = null">{{ t('Delete') }}</NcButton>
					<NcButton :disabled="busy" @click="edit = null">{{ t('Cancel') }}</NcButton>
				</div>
			</div>

			<p v-if="!open.length && !done.length" class="pa-tasks__empty">{{ t('No tasks yet.') }}</p>
			<template v-for="sectie in secties" :key="sectie.naam">
				<h3 v-if="sectie.taken.length" :class="'pa-tasks__kop--' + sectie.klasse">{{ sectie.naam }} <span class="pa-tasks__aantal">{{ sectie.taken.length }}</span></h3>
				<ul v-if="sectie.taken.length" class="pa-tasks__list">
					<template v-for="task in sectie.taken" :key="task.href || task.id">
						<li class="pa-tasks__row" :class="{ 'pa-tasks__row--sub': task.parentUid && perUid[task.parentUid] }">
							<input :id="'pa-task-' + (task.id || task.href)" type="checkbox" :title="t('Mark done')" @change="toggle(task, true)">
							<button type="button" class="pa-tasks__vlag" :class="'pa-tasks__vlag--' + prioKlasse(task)" :title="t('Priority')" @click="wisselPrio(task)"><MaterialIcoon naam="flag" :size="16" /></button>
							<button type="button" class="pa-tasks__titel pa-tasks__grow" :title="t('Edit')" @click="openEdit(task)">
								<span>{{ task.summary }}</span>
								<span v-if="task.notes" class="pa-tasks__notitie">{{ task.notes }}</span>
							</button>
							<span v-if="task.calendarName && calendars.length > 1" class="pa-tasks__meta">{{ task.calendarName }}</span>
							<span v-if="task.start" class="pa-tasks__meta">{{ t('From %s', dagTekst(task.start)) }}</span>
							<span v-if="task.due" class="pa-tasks__meta" :class="{ 'pa-tasks__late': task.due < vandaag }">{{ dagTekst(task.due) }}</span>
							<button type="button" class="pa-tasks__x" :title="t('Add subtask')" @click="nieuwOnder = task; focusNieuw()">⤷</button>
							<button type="button" class="pa-tasks__x" :title="t('Delete')" @click="remove(task)">×</button>
						</li>
						<li v-for="sub in kinderen(task)" :key="'s' + (sub.href || sub.id)" class="pa-tasks__row pa-tasks__row--sub">
							<input :id="'pa-task-' + (sub.id || sub.href)" type="checkbox" :title="t('Mark done')" @change="toggle(sub, true)">
							<button type="button" class="pa-tasks__vlag" :class="'pa-tasks__vlag--' + prioKlasse(sub)" :title="t('Priority')" @click="wisselPrio(sub)"><MaterialIcoon naam="flag" :size="16" /></button>
							<button type="button" class="pa-tasks__titel pa-tasks__grow" :title="t('Edit')" @click="openEdit(sub)">
								<span>{{ sub.summary }}</span>
								<span v-if="sub.notes" class="pa-tasks__notitie">{{ sub.notes }}</span>
							</button>
							<span v-if="sub.due" class="pa-tasks__meta" :class="{ 'pa-tasks__late': sub.due < vandaag }">{{ dagTekst(sub.due) }}</span>
							<button type="button" class="pa-tasks__x" :title="t('Delete')" @click="remove(sub)">×</button>
						</li>
					</template>
				</ul>
			</template>
			<h3 v-if="done.length" class="pa-tasks__kop--done">
				<button type="button" class="pa-tasks__klap" @click="toonKlaar = !toonKlaar">{{ toonKlaar ? '▾' : '▸' }} {{ t('Done') }} <span class="pa-tasks__aantal">{{ done.length }}</span></button>
			</h3>
			<ul v-if="done.length && toonKlaar" class="pa-tasks__list">
				<li v-for="task in done" :key="'d' + (task.href || task.id)" class="pa-tasks__row">
					<input :id="'pa-task-done-' + (task.id || task.href)" type="checkbox" checked :title="t('Reopen')" @change="toggle(task, false)">
					<span class="pa-tasks__grow pa-tasks__done">{{ task.summary }}</span>
					<button type="button" class="pa-tasks__x" :title="t('Delete')" @click="remove(task)">×</button>
				</li>
			</ul>
		</template>
	</div>
</template>

<script>
import MaterialIcoon from './MaterialIcoon.vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import FoutMelding from './FoutMelding.vue'
import { discoverCalendars } from '../api/nextcloudCalendar.js'
import { neemVoorinvulling, pastOpNaam } from '../api/voorinvulling.js'
import { eersteGelijkende } from '../api/lijktOp.js'
import { listTasks, createTask, setTaskDone, deleteTask, updateTask } from '../api/shortcutSources.js'
import { t, currentLocale } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import { watch } from 'vue'
import { staat as sync } from '../api/sync.js'

function twee(n) { return String(n).padStart(2, '0') }
function dagSleutel(d) { return d.getFullYear() + '-' + twee(d.getMonth() + 1) + '-' + twee(d.getDate()) }

/**
 * Eigen takenlijst (Ramin, 2026-09-14): verlopen / vandaag / later / zonder
 * datum, met notitie, prioriteit (vlag) en bewerken. In Nextcloud zijn het
 * VTODO's in je agenda's; in de web-agenda staan ze bij ons (account/tasks).
 */
export default {
	name: 'TasksView',
	components: { MaterialIcoon, NcNoteCard, NcButton, NcLoadingIcon, FoutMelding },
	data() {
		return { tasks: [], calendars: [], calendarHref: '', loading: true, error: null, summary: '', due: '', start: '', busy: false, zoek: '', edit: null, toonKlaar: false, nieuwOnder: null, dubbel: null }
	},
	computed: {
		vandaag() { return dagSleutel(new Date()) },
		gefilterd() {
			const q = this.zoek.trim().toLowerCase()
			return q ? this.tasks.filter((x) => (x.summary + ' ' + (x.notes || '')).toLowerCase().includes(q)) : this.tasks
		},
		perUid() {
			const uit = {}
			for (const x of this.tasks) if (x.uid) uit[x.uid] = x
			return uit
		},
		/** Open hoofdtaken; subtaken hangen onder hun ouder (als die er nog is). */
		open() { return this.gefilterd.filter((x) => !x.completed && !(x.parentUid && this.perUid[x.parentUid] && !this.perUid[x.parentUid].completed)).sort(this.sorteer) },
		done() { return this.gefilterd.filter((x) => x.completed) },
		secties() {
			const morgen = dagSleutel(new Date(Date.now() + 86400000))
			return [
				{ naam: t('Overdue'), klasse: 'late', taken: this.open.filter((x) => x.due && x.due < this.vandaag) },
				{ naam: t('Today'), klasse: 'today', taken: this.open.filter((x) => x.due === this.vandaag) },
				{ naam: t('Tomorrow'), klasse: 'soon', taken: this.open.filter((x) => x.due === morgen) },
				{ naam: t('Later'), klasse: 'later', taken: this.open.filter((x) => x.due && x.due > morgen) },
				{ naam: t('No date'), klasse: 'none', taken: this.open.filter((x) => !x.due) },
			]
		},
	},
	beforeUnmount() {
		if (this.stopKijken) this.stopKijken()
	},
	async mounted() {
		// Meeluisteren met de rest van de app (24-09): verandert dit ergens anders, dan staat het
		// hier meteen goed in plaats van pas als je het scherm opnieuw opent.
		this.stopKijken = watch(() => sync.versie, () => { this.load() })

		await this.load()
		// Vanuit zoeken (kaart 104): de lijst gefilterd op die taak.
		const z = neemVoorinvulling('open-task')
		if (z && z.zoek) this.zoek = z.zoek
		// Ingesproken taak via Anina (kaart 100): het formulier ingevuld, de gebruiker kijkt na.
		const v = neemVoorinvulling('task')
		if (v) {
			this.summary = v.title || ''
			this.due = v.due || ''
			this.start = v.start || ''
			const lijst = this.calendars.find((c) => pastOpNaam(c.displayName, v.list))
			if (lijst) this.calendarHref = lijst.href
			this.$nextTick(() => { const el = document.getElementById('pa-task-new'); if (el) el.focus() })
		}
	},
	methods: {
		t(...args) { return t(...args) },
		sorteer(a, b) {
			// Hoogste prioriteit eerst (1 is hoogst, 0 is geen), dan op datum.
			const pa = a.priority ? a.priority : 10
			const pb = b.priority ? b.priority : 10
			if (pa !== pb) return pa - pb
			return String(a.due || '9').localeCompare(String(b.due || '9'))
		},
		dagTekst(iso) { return new Date(iso + 'T00:00:00').toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short' }) },
		prioKlasse(task) {
			const p = Number(task.priority || 0)
			if (!p) return 'none'
			if (p <= 3) return 'high'
			if (p <= 6) return 'medium'
			return 'low'
		},
		async load() {
			this.loading = true
			try {
				// Decks spiegel-agenda's ("app-generated--deck--board-6") zijn Deck-kaarten
				// en alleen-lezen: die horen onder Deck, niet hier (403 bij verwijderen).
				this.calendars = (await discoverCalendars()).filter((c) => !/app-generated--deck/.test(String(c.href || '')))
				if (!this.calendarHref && this.calendars.length) this.calendarHref = this.calendars[0].href
				const per = await Promise.all(this.calendars.map((c) => listTasks(c).catch(() => [])))
				this.tasks = per.flat()
				this.error = null
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.loading = false
			}
		},
		async doe(actie) {
			this.busy = true
			try {
				await actie()
				this.error = null
				await this.load()
			} catch (e) {
				this.error = foutTekst(e)
			} finally {
				this.busy = false
			}
		},
		add(ondanksDubbel = false) {
			const summary = this.summary.trim()
			if (!ondanksDubbel && !this.nieuwOnder) {
				const al = eersteGelijkende(summary, this.tasks.filter((x) => !x.completed), (x) => x.summary)
				if (al) { this.dubbel = { bestaand: al.summary }; return }
			}
			const due = this.due || null
			const start = this.start || null
			this.start = ''
			const ouder = this.nieuwOnder
			const calendar = (ouder && this.calendars.find((c) => c.href === ouder.calendarHref)) || this.calendars.find((c) => c.href === this.calendarHref) || this.calendars[0] || null
			this.summary = ''
			this.due = ''
			this.nieuwOnder = null
			return this.doe(() => createTask({ summary, due, start, calendar, parent: ouder }))
		},
		dubbelNieuw() { this.dubbel = null; return this.add(true) },
		async toggle(task, done) {
			try {
				await setTaskDone(task, done)
				task.completed = done
			} catch (e) {
				this.error = foutTekst(e)
			}
		},
		remove(task) { return this.doe(() => deleteTask(task)) },
		kinderen(task) {
			if (!task.uid) return []
			return this.gefilterd.filter((x) => !x.completed && x.parentUid === task.uid).sort(this.sorteer)
		},
		ouderKandidaten(task) {
			return this.tasks.filter((x) => x.uid && x !== task && !x.completed && x.parentUid !== task.uid && (!task.calendarHref || x.calendarHref === task.calendarHref))
		},
		focusNieuw() {
			this.$nextTick(() => { const el = document.getElementById('pa-task-new'); if (el) el.focus() })
		},
		openEdit(task) {
			this.edit = { task, summary: task.summary, notes: task.notes || '', due: task.due || '', start: task.start || '', priority: Number(task.priority || 0), parentUid: task.parentUid || null }
		},
		saveEdit() {
			const e = this.edit
			this.edit = null
			const ouderGewijzigd = (e.parentUid || null) !== (e.task.parentUid || null)
			return this.doe(() => updateTask(e.task, { summary: e.summary.trim(), notes: e.notes.trim(), due: e.due || null, start: e.start || null, priority: e.priority, ...(ouderGewijzigd ? { parentUid: e.parentUid || null } : {}) }))
		},
		wisselPrio(task) {
			// Eén tik: geen → hoog → midden → laag → geen.
			const volgorde = [0, 1, 5, 9]
			const huidig = volgorde.indexOf(Number(task.priority || 0))
			const nieuw = volgorde[(huidig + 1) % volgorde.length]
			return this.doe(() => updateTask(task, { summary: task.summary, notes: task.notes || '', due: task.due || null, start: task.start || null, priority: nieuw }))
		},
	},
}
</script>

<style scoped>
.pa-tasks__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.pa-tasks__zoek { min-width: 180px; }
.pa-tasks__form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.pa-tasks__form input[type="text"] { flex: 1; min-width: 160px; }
.pa-tasks__editor { border: 1px solid var(--color-border, #ccc); border-radius: var(--border-radius-large, 8px); padding: 12px 14px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; background: var(--color-main-background, #fff); }
.pa-tasks__veld { width: 100%; box-sizing: border-box; font: inherit; }
.pa-tasks__rij { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.pa-tasks__list { list-style: none; padding: 0; margin: 0 0 12px; }
.pa-tasks__row { display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-bottom: 1px solid var(--color-border, #ddd); }
.pa-tasks__row--sub { padding-left: 32px; border-bottom-style: dashed; }
.pa-tasks__grow { flex: 1; min-width: 0; }
.pa-tasks__titel { border: none; background: transparent; text-align: left; cursor: pointer; color: inherit; font: inherit; padding: 0; display: flex; flex-direction: column; }
.pa-tasks__notitie { color: var(--color-text-maxcontrast); font-size: 0.8em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60ch; }
.pa-tasks__meta { color: var(--color-text-maxcontrast); font-size: 0.85em; }
.pa-tasks__late { color: var(--color-error, #c00); font-weight: 600; }
.pa-tasks__done { text-decoration: line-through; color: var(--color-text-maxcontrast); }
.pa-tasks__empty { color: var(--color-text-maxcontrast); }
.pa-tasks__x { border: none; background: transparent; font-size: 1.1em; cursor: pointer; color: var(--color-text-maxcontrast); }
.pa-tasks__vlag { border: none; background: transparent; cursor: pointer; padding: 0; display: inline-flex; color: var(--color-border, #ccc); }
.pa-tasks__vlag--high { color: #c0392b; }
.pa-tasks__vlag--medium { color: #e0a800; }
.pa-tasks__vlag--low { color: #2e8b57; }
.pa-tasks__aantal { font-weight: normal; color: var(--color-text-maxcontrast); font-size: 0.85em; }
.pa-tasks__kop--late { color: #c0392b; }
.pa-tasks__klap { border: none; background: transparent; cursor: pointer; font: inherit; color: inherit; padding: 0; }
h3 { margin: 12px 0 4px; font-size: 1em; }
</style>
