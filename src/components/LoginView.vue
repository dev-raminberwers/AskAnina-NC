<template>
	<div class="pa-login">
		<div class="pa-login__card">
			<h2>AskAnina</h2>

			<!-- Stap 2: tweestapsverificatie (alleen als het account dat aan heeft). -->
			<template v-if="pendingToken">
				<p class="pa-login__sub">{{ t('Enter the 6-digit code from your authenticator app.') }}</p>
				<NcTextField :model-value="totp" :label="t('Code')" inputmode="numeric" autocomplete="one-time-code" @update:model-value="(v) => { totp = String(v || '').replace(/\D/g, '').slice(0, 6); status = null }" @keyup.enter="verifieer" />
				<NcNoteCard v-if="status === false" type="error">{{ t('Incorrect code') }}</NcNoteCard>
				<FoutMelding v-if="error" :error="error" />
				<NcButton type="primary" :disabled="totp.length !== 6 || busy" @click="verifieer">{{ t('Verify') }}</NcButton>
				<p class="pa-login__sub"><a href="#" @click.prevent="pendingToken = null; totp = ''; status = null; error = null">{{ t('Back') }}</a></p>
			</template>

			<!-- Tweestapsverificatie instellen, verplicht (Deck 67): zonder kom je er niet in. -->
			<template v-else-if="instellen">
				<p class="pa-login__sub">{{ t('Your agenda is private. Two-step verification is required: scan the code with an authenticator app and enter the 6 digits it shows.') }}</p>
				<div class="pa-login__qr" v-html="instellen.qr" />
				<p class="pa-login__sub">{{ t('Secret') }}: <code>{{ instellen.secretMooi }}</code> · <a :href="instellen.otpauthUri">{{ t('Open in authenticator app') }}</a></p>
				<NcTextField :model-value="totp" :label="t('Code')" inputmode="numeric" autocomplete="one-time-code" @update:model-value="(v) => { totp = String(v || '').replace(/\D/g, '').slice(0, 6); status = null }" @keyup.enter="bevestigInstellen" />
				<NcNoteCard v-if="status === false" type="error">{{ t('Incorrect code') }}</NcNoteCard>
				<FoutMelding v-if="error" :error="error" />
				<NcButton type="primary" :disabled="totp.length !== 6 || busy" @click="bevestigInstellen">{{ t('Switch on and continue') }}</NcButton>
			</template>

			<!-- Inloggen met e-mail en wachtwoord (Deck 67, 2026-09-15): niemand
			     onthoudt zijn USER-API; de server kent hem bij het account. -->
			<template v-else-if="modus === 'email'">
				<p class="pa-login__sub">{{ vergrendeld ? t('Locked. Sign in again to continue.') : t('Sign in with your e-mail address and the password you chose when you registered.') }}</p>
				<NcTextField :model-value="email" :label="t('E-mail address')" type="email" autocomplete="username" @update:model-value="(v) => { email = String(v || '').trim(); status = null }" @keyup.enter="loginEmail" />
				<NcTextField :model-value="wachtwoord" :label="t('Password')" type="password" autocomplete="current-password" @update:model-value="(v) => { wachtwoord = v; status = null }" @keyup.enter="loginEmail" />
				<NcNoteCard v-if="status === false" type="error">{{ t('Wrong e-mail address or password') }}</NcNoteCard>
				<FoutMelding v-if="error" :error="error" />
				<NcButton type="primary" :disabled="!email || !wachtwoord || busy" @click="loginEmail">{{ vergrendeld ? t('Unlock') : t('Sign in') }}</NcButton>
				<NcButton v-if="passkeys" :disabled="busy" @click="loginPasskey">{{ t('Sign in with a passkey') }}</NcButton>
				<NcNoteCard v-if="passkeyFout" type="error">{{ t('Signing in with the passkey did not work. Try again, or use your password.') }}</NcNoteCard>
				<p v-if="vergrendeld" class="pa-login__sub"><a href="#" @click.prevent="$emit('uitloggen')">{{ t('Sign out') }}</a></p>
				<p v-else class="pa-login__sub"><a :href="registerUrl" target="_blank" rel="noopener">{{ t('No account yet? Create one') }}</a></p>
			</template>

			<!-- Alleen nog via de koppeling met de telefoon (modus code wordt niet meer aangeboden). -->
			<template v-else-if="modus === 'code'">
				<p class="pa-login__sub">{{ t('Your agenda in the browser. Enter the USER-API code from your phone or your welcome e-mail.') }}</p>
				<NcTextField :model-value="code" :label="t('USER-API')" :placeholder="'XXXX-XXXX-XXXX'" @update:model-value="(v) => { code = maakCode(v); status = null }" @keyup.enter="loginCode" />
				<NcNoteCard v-if="status === false" type="error">{{ t('Code not recognised') }}</NcNoteCard>
				<FoutMelding v-if="error" :error="error" />
				<NcButton type="primary" :disabled="!code || busy" @click="loginCode">{{ t('Sign in') }}</NcButton>
				<p class="pa-login__sub"><a href="#" @click.prevent="wissel('email')">{{ t('Sign in with e-mail instead') }}</a></p>
				<p class="pa-login__sub"><a :href="registerUrl" target="_blank" rel="noopener">{{ t('No code yet? Create an account') }}</a></p>
			</template>
		</div>
	</div>
</template>

<script>
import NcTextField from '@nextcloud/vue/components/NcTextField'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import { t } from '../l10n/index.js'
import { foutTekst } from '../api/fouten.js'
import FoutMelding from './FoutMelding.vue'
import { setAccessCode, setLocked, getLoginEmail, setLoginEmail } from '../api/accessCode.js'
import { checkApiCode, loginEmail, loginVerify2fa, twoFactorSetup, twoFactorConfirm, passkeyLogin, passkeySupported } from '../api/paApi.js'
import qrcode from '../vendor/qrcode.min.js'

/** Inloggen in de web-jas: met e-mail + wachtwoord (standaard) of met de USER-API-code. */
export default {
	name: 'LoginView',
	components: { FoutMelding, NcTextField, NcButton, NcNoteCard },
	props: {
		/** Vergrendelscherm (kaart 7): zelfde inlog, maar het account blijft. */
		vergrendeld: { type: Boolean, default: false },
	},
	emits: ['ingelogd', 'uitloggen'],
	data() {
		return {
			modus: 'email', email: getLoginEmail(), wachtwoord: '', code: '', totp: '', pendingToken: null, instellen: null, wachtendeCode: null,
			status: null, error: null, busy: false, registerUrl: '../?p=register',
			passkeys: passkeySupported(), passkeyFout: false,
		}
	},
	methods: {
		t(...args) { return t(...args) },
		wissel(modus) { this.modus = modus; this.status = null; this.error = null },
		/** Alleen letters en cijfers; het streepje na de 4e en 8e zetten wij. */
		maakCode(ruw) {
			const schoon = String(ruw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
			const delen = []
			for (let i = 0; i < schoon.length; i += 4) delen.push(schoon.slice(i, i + 4))
			return delen.join('-')
		},
		klaar(apiCode) {
			if (!apiCode) { this.status = false; return }
			setAccessCode(apiCode)
			setLocked(false)
			if (this.email) setLoginEmail(this.email)
			this.$emit('ingelogd')
		},
		async loginEmail() {
			if (!this.email || !this.wachtwoord || this.busy) return
			this.busy = true; this.error = null; this.status = null
			try {
				const uit = await loginEmail(this.email, this.wachtwoord)
				if (uit && uit.needs2fa) { this.pendingToken = uit.pendingToken; this.totp = ''; return }
				if (uit && uit.apiCode && uit.totpEnabled === false) { await this.startInstellen(uit.apiCode); return }
				this.klaar(uit && uit.apiCode)
			} catch (e) {
				if (e && e.status === 401) this.status = false
				else this.error = foutTekst(e)
			} finally { this.busy = false }
		},
		/** Verplichte instelstap: geheim ophalen en als QR tekenen. */
		async startInstellen(apiCode) {
			const d = await twoFactorSetup(apiCode)
			const q = qrcode(0, 'M')
			q.addData(d.otpauthUri || '')
			q.make()
			this.wachtendeCode = apiCode
			this.totp = ''
			this.instellen = { otpauthUri: d.otpauthUri, secretMooi: String(d.secret || '').replace(/(.{4})/g, '$1 ').trim(), qr: q.createSvgTag({ cellSize: 5, margin: 0 }) }
		},
		async bevestigInstellen() {
			if (this.totp.length !== 6 || this.busy) return
			this.busy = true; this.error = null; this.status = null
			try {
				await twoFactorConfirm(this.wachtendeCode, this.totp)
				const code = this.wachtendeCode
				this.instellen = null
				this.klaar(code)
			} catch (e) {
				if (e && e.status === 400) this.status = false
				else this.error = foutTekst(e)
			} finally { this.busy = false }
		},
		/** Passkey (18-09): vingerafdruk, gezicht of pincode van dit apparaat; geen wachtwoord, geen 6 cijfers. */
		async loginPasskey() {
			if (this.busy) return
			this.busy = true; this.error = null; this.status = null; this.passkeyFout = false
			try {
				const uit = await passkeyLogin(this.email)
				this.klaar(uit && uit.apiCode)
			} catch (e) {
				if (!(e && e.name === 'NotAllowedError')) this.passkeyFout = true
			} finally { this.busy = false }
		},
		async verifieer() {
			if (this.totp.length !== 6 || this.busy) return
			this.busy = true; this.error = null; this.status = null
			try {
				const uit = await loginVerify2fa(this.pendingToken, this.totp)
				this.klaar(uit && uit.apiCode)
			} catch (e) {
				if (e && e.status === 401) { this.status = false; if (/expired/i.test(String(e.message || ''))) { this.pendingToken = null } }
				else this.error = foutTekst(e)
			} finally { this.busy = false }
		},
		async loginCode() {
			this.busy = true; this.error = null
			try {
				const ok = await checkApiCode(this.code)
				this.status = ok
				if (ok) { setAccessCode(this.code); this.$emit('ingelogd') }
			} catch (e) { this.error = foutTekst(e) } finally { this.busy = false }
		},
	},
}
</script>

<style scoped>
.pa-login { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; }
.pa-login__card { width: 100%; max-width: 420px; border: 1px solid var(--color-border); border-radius: 14px; padding: 24px; background: var(--color-main-background); display: flex; flex-direction: column; gap: 8px; }
.pa-login__sub { color: var(--color-text-maxcontrast); font-size: 0.9em; margin: 0; }
.pa-login__qr { align-self: center; padding: 10px; background: #fff; border-radius: 12px; }
.pa-login__qr :deep(svg) { display: block; width: 180px; height: 180px; }
</style>
