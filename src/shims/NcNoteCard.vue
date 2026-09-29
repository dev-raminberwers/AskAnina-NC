<template>
	<div class="pa-note" :class="'pa-note--' + type" role="note"><slot /></div>
</template>
<script>
/** Web-jas van NcNoteCard: een gekleurd kader met een tekst. */
export default { name: 'NcNoteCard', props: { type: { type: String, default: 'info' } } }
</script>
<style>
.pa-note { border-radius: 10px; padding: 10px 14px; margin: 8px 0; border: 1px solid var(--color-border); background: var(--color-background-hover); }
.pa-note--error { border-color: var(--color-error); background: color-mix(in srgb, var(--color-error) 10%, var(--color-main-background)); }
.pa-note--warning { border-color: var(--color-warning); background: color-mix(in srgb, var(--color-warning) 12%, var(--color-main-background)); }
.pa-note--success { border-color: var(--color-success); background: color-mix(in srgb, var(--color-success) 10%, var(--color-main-background)); }
</style>
