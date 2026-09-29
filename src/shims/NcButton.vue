<template>
	<button class="pa-btn" :class="{ 'pa-btn--primary': type === 'primary', 'pa-btn--error': type === 'error', 'pa-btn--tertiary': type === 'tertiary' }" :type="nativeType" :disabled="disabled" @click="$emit('click', $event)">
		<span v-if="$slots.icon" class="pa-btn__icon"><slot name="icon" /></span>
		<slot />
	</button>
</template>
<script>
export default {
	name: 'NcButton',
	props: { type: { type: String, default: 'secondary' }, nativeType: { type: String, default: 'button' }, disabled: { type: Boolean, default: false } },
	emits: ['click'],
}
</script>
<style>
.pa-btn { font: inherit; font-size: 0.9em; min-height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); cursor: pointer; margin: 4px 0; display: inline-flex; align-items: center; gap: 6px; }
.pa-btn--primary { background: var(--color-primary-element); color: var(--color-primary-element-text); border-color: transparent; }
.pa-btn--error { background: #c0392b; color: #fff; border-color: transparent; }
.pa-btn--tertiary { background: transparent; border-color: transparent; }
.pa-btn:disabled { opacity: .5; cursor: default; }
.pa-btn__icon { display: inline-flex; align-items: center; }
</style>
