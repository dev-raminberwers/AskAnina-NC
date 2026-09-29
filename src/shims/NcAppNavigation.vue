<template>
	<nav class="pa-nav">
		<div class="pa-nav__brand"><img src="../../img/app.svg" alt="" class="pa-nav__logo" onerror="this.style.display='none'"><span>AskAnina</span></div>
		<ul class="pa-nav__list"><slot name="list" /></ul>
	</nav>
</template>
<script>
export default { name: 'NcAppNavigation' }
</script>
<style>
.pa-nav { flex: 0 0 196px; border-right: 1px solid var(--color-border); padding: 6px 6px; box-sizing: border-box; }
.pa-nav__brand { display: flex; align-items: center; gap: 7px; font-weight: bold; padding: 1px 8px 6px; font-size: 0.97em; }
.pa-nav__logo { width: 19px; height: 19px; }
.pa-nav__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0; }
@media (max-width: 720px) {
	.pa-nav { flex: none; border-right: 0; border-bottom: 1px solid var(--color-border); padding: 8px; }
	.pa-nav__list { flex-direction: row; flex-wrap: wrap; gap: 4px; }
}
</style>
