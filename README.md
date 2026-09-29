# AskAnina-NC

De Nextcloud-app van AskAnina: een dagelijkse tijdlijn die je Nextcloud-agenda samenbrengt met reistijd,
vluchtinformatie en check-in-herinneringen. De app rekent zelf niets uit; dat gebeurt op de AskAnina-API
(askanina.com), waarvoor je een account nodig hebt.

Licentie: **AGPL-3.0-or-later**.

## LEES DIT EERST als je hier iets wilt wijzigen

Deze repo is een **publicatie**, niet de werkplek. De bron waaraan gewerkt wordt staat op de machine van
de maker, in een andere repo (`PRODUCTION/WEBSITE/nextcloud-app/personalassistant`), en die heeft zijn
eigen geschiedenis.

Daaruit volgen twee dingen die je moet weten:

1. **Een push die deze map overschrijft, kan werk wissen** dat hier niet zichtbaar is. Wie vanuit de
   werkkopie publiceert, haalt eerst op wat hier staat.
2. **Een wijziging die je hier maakt, komt niet vanzelf in de draaiende app.** De app die mensen gebruiken
   wordt vanuit die werkkopie gebouwd en geïnstalleerd. Verbeteringen zijn welkom, maar reis als
   **voorstel** — via een pull request of een issue — en niet als een stille commit op `main`.

Dat is geen formaliteit. Er werken meerdere mensen en sessies aan dit product vanaf verschillende plekken;
elke verandering die alleen hier bestaat, is een verandering die niemand ziet tot hij verdwenen is.

## Wat er in deze repo staat

```
src/         de app zelf (Vue): schermen, kaarten, de dagtijdlijn
lib/         de PHP-kant binnen Nextcloud: controllers, database, migraties
appinfo/     info.xml en de routes -- de verplichte velden voor de Nextcloud-appstore
js/          de gebouwde app, zodat deze map rechtstreeks te installeren is
css/ img/ templates/
```

Met opzet **niet** meegeleverd: `node_modules/` (haal je met `npm install`) en de bronkaart `*.js.map`
(6,9 MB, alleen nuttig bij debuggen op je eigen machine).

## Bouwen

```sh
npm install
npm run build        # webpack --node-env production  ->  js/personalassistant-main.js
```

Dezelfde broncode levert ook de web-agenda op, met een andere webpack-config
(`webpack.web.config.js`). `src/main.js` is de ingang voor de Nextcloud-jas, `src/web.js` die voor het
web; alles daarboven staat er één keer.

## Installeren op een eigen Nextcloud

Zet de map als `personalassistant` in `nextcloud/apps/`. De bestanden horen van `www-data` te zijn --
anders stopt de Nextcloud-updater met *"Check for write permissions failed"*:

```sh
sudo chown -R www-data:www-data /var/www/html/nextcloud/apps/personalassistant
```

Verhoog het versienummer in `appinfo/info.xml` niet zonder reden: een hoger nummer laat Nextcloud een
installatie-brede update-bevestiging tonen, die onderweg incompatibele apps uitschakelt. De inhoud
vervangen werkt op hetzelfde nummer; de browser heeft dan wel één harde herlaad nodig.

## Fouten melden

https://github.com/dev-raminberwers/AskAnina-NC/issues
