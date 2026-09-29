<template>
	<label class="pa-field">
		<span class="pa-field__label">{{ label }}</span>
		<input class="pa-field__input" :type="type" :value="modelValue" :placeholder="placeholder" :disabled="disabled" @input="$emit('update:modelValue', $event.target.value)">
	</label>
</template>
<script>
/** Web-jas van NcTextField: label boven, invoer eronder, zelfde v-model-gedrag. */
export default {
	name: 'NcTextField',
	props: {
		modelValue: { type: [String, Number], default: '' },
		label: { type: String, default: '' },
		placeholder: { type: String, default: '' },
		type: { type: String, default: 'text' },
		disabled: { type: Boolean, default: false },
	},
	emits: ['update:modelValue'],
}
</script>
<style>
.pa-field { display: flex; flex-direction: column; gap: 4px; margin: 6px 0; width: 100%; }
.pa-field__label { font-size: 0.85em; color: var(--color-text-maxcontrast); }
.pa-field__input { font: inherit; min-height: 38px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-main-background); color: var(--color-main-text); width: 100%; box-sizing: border-box; }
</style>
