<template>
	<div class="pa-shell"><slot /></div>
</template>
<script>
/** Web-jas van NcContent: zijbalk links, inhoud rechts; op een telefoon onder elkaar. */
export default { name: 'NcContent' }
</script>
<style>
/* Elke kolom scrolt voortaan zelf (Ramin, 24-09: "blijft in ELKE pagina de statusbalk in beeld?").
   Daarvoor scrolde het hele document als een geheel: het nieuwspaneel rechts maakte de pagina 34.000
   pixels hoog, terwijl de linkerkolom op Vandaag maar 283 hoog was. Een vastgezette statusbalk kan niet
   verder reizen dan zijn eigen kolom, dus die liep na 283 pixels gewoon mee weg -- op 15 van de 22
   schermen. Nu is de schil precies zo hoog als het venster en scrollen menu, inhoud en paneel apart. */
.pa-shell { display: flex; height: 100vh; overflow: hidden; background: var(--color-main-background); color: var(--color-main-text); }
.pa-shell > * { overflow-y: auto; }
/* Op een telefoon staan de kolommen onder elkaar; dan scrolt de pagina weer als geheel. */
@media (max-width: 720px) { .pa-shell { flex-direction: column; height: auto; min-height: 100vh; overflow: visible; } .pa-shell > * { overflow-y: visible; } }
</style>
