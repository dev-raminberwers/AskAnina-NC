/**
 * In welke jas draait deze code?
 *
 * Dezelfde Vue-app draait op twee plekken (2026-09-13, Ramin: "een web-agenda
 * voor degene die geen Nextcloud hebben"):
 *  - als Nextcloud-app: agenda's via CalDAV, persoonlijke gegevens in een
 *    versleuteld bestand in de eigen Nextcloud;
 *  - als losse website (askanina.com/app): afspraken en gegevens in
 *    onze eigen database, met de USER-API-code als identiteit — precies wat
 *    de telefoon in Account-modus doet.
 *
 * De schermen zijn hetzelfde; alleen de laag eronder wisselt. De web-pagina
 * heeft een element #pa-web-app; Nextcloud niet. Dat is het hele verschil,
 * en het is er al vóór de eerste regel JavaScript draait.
 */
export const WEB = typeof document !== 'undefined' && document.getElementById('pa-web-app') !== null
