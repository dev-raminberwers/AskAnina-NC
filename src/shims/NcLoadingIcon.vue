<template>
	<span class="pa-spinner" :style="{ width: size + 'px', height: size + 'px' }" role="status" aria-label="…" />
</template>
<script>
export default { name: 'NcLoadingIcon', props: { size: { type: Number, default: 20 } } }
</script>
<style>
.pa-spinner { display: inline-block; border: 3px solid var(--color-border); border-top-color: var(--color-primary-element); border-radius: 50%; animation: pa-spin 0.9s linear infinite; margin: 8px 0; }
@keyframes pa-spin { to { transform: rotate(360deg); } }
</style>
