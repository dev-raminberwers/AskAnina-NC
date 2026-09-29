<?php

declare(strict_types=1);

/*
 * Tot 27-09 stond hier bewust één route (Ramin, 2026-09-09: "Nextcloud app zo kaal mogelijk houden en
 * dat alle intelligentie in onze PHP zit"). De voorkant praat rechtstreeks met Nextclouds eigen
 * CalDAV/CardDAV en met askanina.com voor het rekenwerk.
 *
 * Het netwerk is de eerste uitzondering, en die komt van Ramin zelf (27-09):
 *
 *   "De nextCloud app mag alleen data halen uit nextcloud."
 *   "Als er een nextcloud verbinding is dan worden de calls naar die nextcloud gestuurd."
 *
 * Gesprekken, eigen mensen en relaties kunnen niet uit CalDAV of CardDAV komen -- daar bestaan ze niet.
 * Ze bij ons ophalen zou precies de regel breken. Dus krijgen ze hier eigen tabellen en eigen routes, en
 * blijft de rest zo kaal als hij was.
 */
return [
    'routes' => [
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],

        // Het netwerk: alles blijft in de Nextcloud van de gebruiker.
        ['name' => 'network#index', 'url' => '/api/network', 'verb' => 'GET'],
        ['name' => 'network#pushCalls', 'url' => '/api/network/calls', 'verb' => 'POST'],
        ['name' => 'network#addPerson', 'url' => '/api/network/person', 'verb' => 'POST'],
        ['name' => 'network#addRelation', 'url' => '/api/network/relation', 'verb' => 'POST'],
        ['name' => 'network#rejectRelation', 'url' => '/api/network/relation/{id}/reject', 'verb' => 'POST'],
        ['name' => 'network#linkCall', 'url' => '/api/network/call/link', 'verb' => 'POST'],
    ],
];
