<template>
	<main class="pa-main"><div class="pa-main__inner"><slot /></div></main>
</template>
<script>
export default { name: 'NcAppContent' }
</script>
<style>
.pa-main { flex: 1; min-width: 0; overflow-y: auto; }
.pa-main__inner { width: 100%; padding: 16px 20px 24px; box-sizing: border-box; }
</style>
