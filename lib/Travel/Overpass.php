<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Travel;

use OCP\ICacheFactory;

/**
 * Overpass POI search for the gap-decision "koffie/eten in de buurt"
 * suggestion — ported from the LIFE tool backend's Overpass::nearby(),
 * radius-based lookup only (the name-search variant for phone-lookup isn't
 * needed in this app).
 */
class Overpass {
    private const CATEGORY_REGEX = [
        'coffee_food' => ['amenity', '^(cafe|restaurant|bar|fast_food)$'],
        // "Waar verblijf je?" — a bare word like "hotel" typed into Nominatim's
        // free-text search finds nothing (it needs an actual venue name or
        // address, not a category word), so that prompt browses real nearby
        // places by OSM tag instead, same as the existing coffee/food lookup.
        'hotel' => ['tourism', '^(hotel|guest_house|hostel|apartment|motel)$'],
    ];

    public function __construct(private ICacheFactory $cacheFactory, private Geocoder $geocoder) {
    }

    /**
     * @param ?string $nameFilter partial, case-insensitive name match (e.g.
     *     "Sonesta" matching "Sonesta Maho Beach Resort") — lets "Waar
     *     verblijf je?" narrow the browse list instead of only offering
     *     "show everything nearby", without requiring the exact full name
     *     Nominatim's free-text search would need.
     * @return array<int, array{name: string, lat: float, lon: float}>
     */
    public function nearby(float $lat, float $lon, string $category = 'coffee_food', int $radiusMeters = 2000, ?string $nameFilter = null): array {
        $regex = self::CATEGORY_REGEX[$category] ?? null;
        if ($regex === null) {
            return [];
        }
        $nameFilter = $nameFilter !== null ? trim($nameFilter) : '';

        $cache = $this->cacheFactory->createDistributed('personalassistant_poi');
        $cacheKey = sprintf('%.3F,%.3F,%s,%s', round($lat, 3), round($lon, 3), $category, mb_strtolower($nameFilter));
        $cached = $cache->get($cacheKey);
        if (is_string($cached)) {
            $decoded = json_decode($cached, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        [$key, $pattern] = $regex;
        $nameClause = '';
        if ($nameFilter !== '') {
            // Overpass QL's own double-quoted-string/regex dialect, not a
            // PHP regex — this is a public read-only API with no query
            // execution risk, so stripping the characters that could break
            // out of the quoted literal is enough; everything else is used
            // as a literal substring match (",i" = case-insensitive).
            $safeName = str_replace(['"', '\\'], '', mb_substr($nameFilter, 0, 80));
            $nameClause = sprintf('["name"~"%s",i]', $safeName);
        }
        $query = sprintf(
            '[out:json][timeout:15];nwr["%s"~"%s"]%s(around:%d,%F,%F);out center %d;',
            $key,
            $pattern,
            $nameClause,
            $radiusMeters,
            $lat,
            $lon,
            20
        );

        $ch = curl_init('https://overpass-api.de/api/interpreter');
        if ($ch === false) {
            return [];
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query(['data' => $query]),
            CURLOPT_USERAGENT => 'NextcloudPersonalAssistant/0.1',
        ]);
        $body = curl_exec($ch);
        $errno = curl_errno($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0 || $body === false || $status >= 400) {
            return []; // transient failure — never cache an empty result as if it were a real "nothing nearby"
        }

        $data = json_decode((string)$body, true);
        // The public Overpass instance can return a "the server is busy"
        // error as an HTML/XML body inside an otherwise-200 response — not
        // valid JSON at all, not even an "elements" key, unlike a genuine
        // "found nothing" answer (which is still a real elements: [] array).
        // Treating that malformed case the same as "nothing nearby" would
        // cache a transient server hiccup as gospel for 30 days.
        if (!is_array($data) || !array_key_exists('elements', $data)) {
            return [];
        }
        $elements = $data['elements'];

        $pois = [];
        foreach ($elements as $element) {
            // A hotel is often mapped as a building (way/relation), which
            // Overpass reports via a "center" object instead of top-level
            // lat/lon — same fallback findAirportByIata() already needed.
            $poiLat = $element['lat'] ?? $element['center']['lat'] ?? null;
            $poiLon = $element['lon'] ?? $element['center']['lon'] ?? null;
            if ($poiLat === null || $poiLon === null) {
                continue;
            }
            $tags = $element['tags'] ?? [];
            $fallback = (string)($tags[$key] ?? 'plek');
            $pois[] = [
                'name' => (string)($tags['name'] ?? ucfirst(str_replace('_', ' ', $fallback))),
                'lat' => (float)$poiLat,
                'lon' => (float)$poiLon,
            ];
        }

        $cache->set($cacheKey, json_encode($pois), 60 * 60 * 24 * 30);
        return $pois;
    }

    /**
     * Resolves an IATA airport code (e.g. "AMS") to real coordinates via an
     * exact tag match — deliberately NOT the nationwide case-insensitive
     * name-regex scan that timed out during the earlier phone-lookup work
     * (see ContactLookupHandler's history): an exact `["iata"="AMS"]` match
     * is a different, cheap class of query since Overpass can use its tag
     * index directly, confirmed in ~0.6s against the live server for AMS.
     *
     * @return array{lat: float, lon: float, display_name: string}|null
     */
    public function findAirportByIata(string $iataCode): ?array {
        $code = strtoupper(trim($iataCode));
        if (!preg_match('/^[A-Z]{3}$/', $code)) {
            return null;
        }

        $cache = $this->cacheFactory->createDistributed('personalassistant_airport');
        $cached = $cache->get($code);
        if (is_string($cached)) {
            $decoded = json_decode($cached, true);
            return is_array($decoded) && $decoded !== [] ? $decoded : null;
        }

        $query = sprintf('[out:json][timeout:20];nwr["aeroway"="aerodrome"]["iata"="%s"];out center 1;', $code);

        $ch = curl_init('https://overpass-api.de/api/interpreter');
        if ($ch === false) {
            return null;
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query(['data' => $query]),
            CURLOPT_USERAGENT => 'NextcloudPersonalAssistant/0.1',
        ]);
        $body = curl_exec($ch);
        $errno = curl_errno($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0 || $body === false || $status >= 400) {
            return null; // transient failure — don't cache, try fresh next time
        }

        $data = json_decode((string)$body, true);
        // Same distinction nearby() makes: the public Overpass instance can
        // answer a "server is busy" error as HTML/XML inside an otherwise-200
        // response — not valid JSON, not even an "elements" key — which is
        // NOT the same thing as a genuine "no airport with this code" (a
        // real elements: [] array). Caching the former as if it were the
        // latter would falsely remember "unknown airport" for a month over
        // what was really just a transient overload.
        if (!is_array($data) || !array_key_exists('elements', $data)) {
            return null;
        }
        $element = $data['elements'][0] ?? null;
        if (!is_array($element)) {
            $cache->set($code, json_encode([]), 60 * 60 * 24 * 30);
            return null;
        }

        $lat = $element['lat'] ?? $element['center']['lat'] ?? null;
        $lon = $element['lon'] ?? $element['center']['lon'] ?? null;
        if ($lat === null || $lon === null) {
            return null;
        }

        $tags = $element['tags'] ?? [];
        $countryTag = $tags['addr:country'] ?? $tags['is_in:country_code'] ?? null;
        $countryCode = $countryTag !== null && $countryTag !== '' ? strtoupper((string)$countryTag) : null;
        $countryName = null;
        // Not every airport's OSM entry carries its own addr:country (BCN's
        // doesn't, PJIA's does) — reverse-geocoding the airport's own
        // coordinates doesn't depend on that self-tagging at all, so it's a
        // reliable fallback rather than silently leaving the country
        // unknown. One extra call ever per airport (result is cached
        // permanently below alongside the rest of this record).
        if ($countryCode === null) {
            $reverse = $this->geocoder->reverseCountry((float)$lat, (float)$lon);
            $countryCode = $reverse['code'];
            $countryName = $reverse['name'];
        }
        $resolved = [
            'lat' => (float)$lat,
            'lon' => (float)$lon,
            'display_name' => (string)($tags['name:en'] ?? $tags['name'] ?? "$code Airport"),
            'countryCode' => $countryCode,
            'countryName' => $countryName,
        ];
        $cache->set($code, json_encode($resolved), 60 * 60 * 24 * 30);
        return $resolved;
    }
}
