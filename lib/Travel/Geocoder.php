<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Travel;

use OCP\ICache;
use OCP\ICacheFactory;

/**
 * Nominatim forward geocoder — full port of the LIFE tool backend's
 * Geocoder.php (the same logic the Android app's OSRM pipeline uses), not
 * the simplified single-query version this file started as. That
 * simplified version is exactly why real calendar addresses that resolve
 * fine on Android showed no travel card here: a calendar LOCATION field
 * often needs iCal-escape unescaping (DAVx5/CalDAV encodes real newlines as
 * literal "\n" two-char sequences per RFC 5545), postcode/street/city
 * splitting into a structured Nominatim query, and a multi-window free-text
 * fallback — sending the whole raw multi-line/escaped string as one `q=`
 * blob (what this class used to do) fails to resolve for exactly the kind
 * of address that has a venue name on one line and street/postcode on
 * another. Fail-soft: returns null on any error, never throws.
 */
class Geocoder {
    private const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
    private const USER_AGENT = 'NextcloudPersonalAssistant/0.1 (personal use)';

    public function __construct(private ICacheFactory $cacheFactory) {
    }

    /**
     * Reverse-geocodes a country only, from bare coordinates — used as a
     * fallback when a POI itself carries no country tag of its own (e.g.
     * Overpass::findAirportByIata() for an airport whose OSM entry has no
     * addr:country, unlike most). Nominatim's boundary-polygon lookup
     * doesn't need the POI to self-report anything — it just needs to know
     * which country's polygon contains this point — so this works
     * regardless of how completely any individual POI is tagged.
     *
     * @return array{code: ?string, name: ?string}
     */
    public function reverseCountry(float $lat, float $lon): array {
        $cacheKey = sprintf('rev-country:%.3F,%.3F', round($lat, 3), round($lon, 3));
        $cache = $this->cacheFactory->createDistributed('personalassistant_geocode');
        $cached = $cache->get($cacheKey);
        if (is_string($cached)) {
            $decoded = json_decode($cached, true);
            if (is_array($decoded)) {
                return ['code' => $decoded['code'] ?? null, 'name' => $decoded['name'] ?? null];
            }
        }

        $this->throttle();
        $url = self::NOMINATIM_BASE . '/reverse?' . http_build_query([
            'lat' => $lat,
            'lon' => $lon,
            'format' => 'jsonv2',
            'zoom' => 3,
            'addressdetails' => 1,
        ]);
        $result = $this->fetchJson($url);
        $address = is_array($result) ? ($result['address'] ?? null) : null;
        $resolved = [
            'code' => isset($address['country_code']) ? strtoupper((string)$address['country_code']) : null,
            'name' => isset($address['country']) ? (string)$address['country'] : null,
        ];
        // A country genuinely doesn't move — cache even a null result
        // briefly isn't worth it either way, so this always caches
        // permanently like the rest of the airport-data cache it feeds.
        $cache->set($cacheKey, json_encode($resolved), 60 * 60 * 24 * 30);
        return $resolved;
    }

    /**
     * Multiple raw candidates for a user-picked disambiguation — e.g.
     * "Hilton" plus a known ISO country code (from a detected flight's
     * arrival country) narrows Nominatim's global search via its own
     * `countrycodes` filter, returning a short, actually-useful list
     * instead of the single best (and possibly wrong-country) guess
     * search() would give. Deliberately NOT cached (unlike search()'s
     * single-answer methods) — a disambiguation pick is a one-off
     * interactive lookup, not something replayed on every page load.
     *
     * @return list<array{lat: float, lon: float, display_name: string}>
     */
    public function searchCandidates(string $query, ?string $countryCode = null, int $limit = 5): array {
        $this->throttle();
        $params = [
            'q' => $query,
            'format' => 'jsonv2',
            'limit' => $limit,
        ];
        if ($countryCode !== null && $countryCode !== '') {
            $params['countrycodes'] = strtolower($countryCode);
        }
        $url = self::NOMINATIM_BASE . '/search?' . http_build_query($params);
        $result = $this->fetchJson($url);
        if (!is_array($result)) {
            return [];
        }

        $candidates = [];
        foreach ($result as $entry) {
            if (is_array($entry) && isset($entry['lat'], $entry['lon'])) {
                $candidates[] = [
                    'lat' => (float)$entry['lat'],
                    'lon' => (float)$entry['lon'],
                    'display_name' => (string)($entry['display_name'] ?? $query),
                ];
            }
        }
        return $candidates;
    }

    /** @return array{lat: float, lon: float, display_name: string}|null */
    public function search(string $rawQuery): ?array {
        $lines = self::splitLines(self::unescapeIcalText($rawQuery));
        if ($lines === []) {
            return null;
        }

        // Structured query (street=/postalcode=/city= as separate params)
        // tried first — far more reliable than free text for an address
        // combining a house-number-with-letter-suffix ("24a") and a
        // postcode.
        $structured = self::extractStructuredParams($lines);
        if ($structured !== null) {
            $resolved = $this->searchStructured($structured);
            if ($resolved !== null) {
                return $resolved;
            }
        }

        foreach (self::candidateQueries($lines) as $query) {
            $resolved = $this->searchFreeText($query);
            if ($resolved !== null) {
                return $resolved;
            }
        }
        return null;
    }

    /**
     * Splits on real newlines *and* commas — a location saved as multiple
     * visual lines (venue / street / postcode+city) and one saved as a
     * single comma-separated line both need to decompose into the same
     * components for postcode/street detection below.
     *
     * @return list<string>
     */
    private static function splitLines(string $text): array {
        return array_values(array_filter(
            array_map('trim', preg_split('/\r\n|\r|\n|,/', $text) ?: []),
            static fn(string $line): bool => $line !== ''
        ));
    }

    /**
     * Recognizes a "street + number" line and a "postcode + city" line
     * (Dutch postcode format: 4 digits, 2 letters) among the calendar
     * text's lines, if both are clearly identifiable — a venue-name line,
     * if present, is simply ignored rather than guessed at.
     *
     * @param list<string> $lines
     * @return array{street: string, city: string, postalcode?: string}|null
     */
    private static function extractStructuredParams(array $lines): ?array {
        $postcodeLineIndex = null;
        $postalcode = null;
        $city = null;
        foreach ($lines as $i => $line) {
            if (preg_match('/^(\d{4}\s?[A-Za-z]{2})\s+(.+)$/', $line, $m) === 1) {
                $postcodeLineIndex = $i;
                $postalcode = strtoupper(preg_replace('/\s+/', ' ', trim($m[1])) ?? '');
                $city = trim($m[2]);
                break;
            }
        }

        // A street line is any other line containing a digit (a house
        // number) — the first such line, since a venue name rarely
        // contains one.
        $street = null;
        foreach ($lines as $i => $line) {
            if ($i === $postcodeLineIndex) {
                continue;
            }
            if (preg_match('/\d/', $line) === 1) {
                $street = $line;
                break;
            }
        }

        if ($street === null || $city === null) {
            return null;
        }

        $params = ['street' => self::sanitize($street), 'city' => self::sanitize($city)];
        if ($postalcode !== null && $postalcode !== '') {
            $params['postalcode'] = $postalcode;
        }
        return $params;
    }

    /**
     * A calendar location field that carries a venue name *and* a pasted-in
     * street/postcode block as separate lines often fails to resolve as one
     * combined free-text query even when a structured query couldn't be
     * built — so as a further fallback, try every contiguous run of lines
     * (longest first), from the full text down to each single line by itself.
     *
     * @param list<string> $lines
     * @return list<string>
     */
    private static function candidateQueries(array $lines): array {
        if (count($lines) <= 1) {
            $single = self::sanitize($lines[0] ?? '');
            return $single === '' ? [] : [$single];
        }

        $windows = [];
        for ($length = count($lines); $length >= 1; $length--) {
            for ($start = 0; $start + $length <= count($lines); $start++) {
                $windows[] = [$length, $start];
            }
        }

        $candidates = [];
        foreach ($windows as [$length, $start]) {
            $candidate = self::sanitize(implode(' ', array_slice($lines, $start, $length)));
            if ($candidate !== '' && !in_array($candidate, $candidates, true)) {
                $candidates[] = $candidate;
            }
        }
        return $candidates;
    }

    /**
     * DAVx5/iCalendar TEXT values escape real newlines, commas and
     * semicolons as literal two-character sequences (RFC 5545 §3.3.11) —
     * `\n`/`\N` for a line break, `\,`/`\;` for the literal punctuation,
     * `\\` for a literal backslash. Left un-decoded, EVENT_LOCATION ends up
     * containing the literal two-char sequence "\n" (backslash then the
     * letter n) rather than a real line break, which splitLines()'s regex
     * (which matches actual newline bytes) silently doesn't split on —
     * turning e.g. "Venue\nStreet 1\n1234 AB City" into one glued-together
     * blob that Nominatim can't parse.
     */
    private static function unescapeIcalText(string $text): string {
        // Order matters: backslash-backslash must be handled without
        // clobbering the other sequences or re-matching bytes it just produced.
        return strtr($text, ['\\\\' => "\x00", '\\n' => "\n", '\\N' => "\n", '\\,' => ',', '\\;' => ';', "\x00" => '\\']);
    }

    /** @return array{lat: float, lon: float, display_name: string, country_code: ?string, country_name: ?string}|null */
    private function searchFreeText(string $query): ?array {
        $cacheKey = 'fwd:' . mb_strtolower($query);
        $cached = $this->getCached($cacheKey);
        if ($cached !== null) {
            return $cached === [] ? null : $cached;
        }

        $this->throttle();

        $url = self::NOMINATIM_BASE . '/search?' . http_build_query([
            'q' => $query,
            'format' => 'jsonv2',
            'limit' => 1,
            'addressdetails' => 1,
        ]);
        $result = $this->fetchJson($url);

        if (!is_array($result) || count($result) === 0 || !isset($result[0]['lat'], $result[0]['lon'])) {
            error_log("PersonalAssistant Geocoder: no free-text match for '$query'");
            $this->cache($cacheKey, []);
            return null;
        }

        $resolved = [
            'lat' => (float)$result[0]['lat'],
            'lon' => (float)$result[0]['lon'],
            'display_name' => (string)($result[0]['display_name'] ?? $query),
            'country_code' => isset($result[0]['address']['country_code']) ? strtoupper((string)$result[0]['address']['country_code']) : null,
            // Nominatim's own name for the country, straight from its
            // address block — NOT the same as looking up country_code in a
            // code→name table: some Dutch Caribbean territories (Sint
            // Maarten included) report country_code "nl" while this field
            // still correctly says "Sint Maarten", and this is the one that
            // should win when both are available.
            'country_name' => isset($result[0]['address']['country']) ? (string)$result[0]['address']['country'] : null,
        ];
        $this->cache($cacheKey, $resolved);
        return $resolved;
    }

    /**
     * @param array{street: string, city: string, postalcode?: string} $params
     * @return array{lat: float, lon: float, display_name: string}|null
     */
    private function searchStructured(array $params): ?array {
        $cacheKey = 'fwd:structured:' . mb_strtolower(implode('|', $params));
        $cached = $this->getCached($cacheKey);
        if ($cached !== null) {
            return $cached === [] ? null : $cached;
        }

        $this->throttle();

        $url = self::NOMINATIM_BASE . '/search?' . http_build_query($params + [
            'format' => 'jsonv2',
            'limit' => 1,
            'addressdetails' => 1,
        ]);
        $result = $this->fetchJson($url);

        if (!is_array($result) || count($result) === 0 || !isset($result[0]['lat'], $result[0]['lon'])) {
            error_log('PersonalAssistant Geocoder: no structured match for ' . json_encode($params));
            $this->cache($cacheKey, []);
            return null;
        }

        $resolved = [
            'lat' => (float)$result[0]['lat'],
            'lon' => (float)$result[0]['lon'],
            'display_name' => (string)($result[0]['display_name'] ?? $params['street']),
            'country_code' => isset($result[0]['address']['country_code']) ? strtoupper((string)$result[0]['address']['country_code']) : null,
            'country_name' => isset($result[0]['address']['country']) ? (string)$result[0]['address']['country'] : null,
        ];
        $this->cache($cacheKey, $resolved);
        return $resolved;
    }

    private function fetchJson(string $url): mixed {
        $ch = curl_init($url);
        if ($ch === false) {
            return null;
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_HTTPHEADER => ['User-Agent: ' . self::USER_AGENT],
        ]);
        $body = curl_exec($ch);
        $errno = curl_errno($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0 || $body === false || $status >= 400) {
            error_log("PersonalAssistant Geocoder: request to $url failed (errno=$errno, status=$status)");
            return null;
        }
        return json_decode((string)$body, true);
    }

    /**
     * Calendar location fields sometimes carry an address as several
     * newline-separated lines rather than one line — sent as-is, the
     * embedded newlines make Nominatim's free-text parser fail to match
     * anything even though each line would resolve fine on its own.
     * Collapsing all whitespace (newlines included) to single spaces turns
     * that into one query Nominatim can actually parse.
     */
    private static function sanitize(string $query): string {
        return trim(preg_replace('/\s+/', ' ', $query) ?? '');
    }

    /** @return array{lat: float, lon: float, display_name: string}|array{}|null null = never looked up before; [] = looked up, nothing found */
    private function getCached(string $key): ?array {
        $cache = $this->cacheFactory->createDistributed('personalassistant_geocode');
        $cached = $cache->get($key);
        if (!is_string($cached)) {
            return null;
        }
        $decoded = json_decode($cached, true);
        return is_array($decoded) ? $decoded : null;
    }

    /** @param array{lat: float, lon: float, display_name: string}|array{} $resolved */
    private function cache(string $key, array $resolved): void {
        $cache = $this->cacheFactory->createDistributed('personalassistant_geocode');
        // A "not found" result is cached far more briefly than a real hit —
        // addresses don't move, but a transient Nominatim hiccup or a typo
        // that gets corrected shouldn't stay "unresolved" for a month.
        $ttl = $resolved === [] ? 60 * 60 : 60 * 60 * 24 * 30;
        $cache->set($key, json_encode($resolved), $ttl);
    }

    /** Best-effort 1 req/sec spacing per Nominatim's usage policy — good enough for a single-user app with no real request concurrency. */
    private function throttle(): void {
        $cache = $this->cacheFactory->createDistributed('personalassistant_geocode');
        $last = $cache->get('nominatim:last_call_at');
        if (is_string($last)) {
            $elapsed = microtime(true) - (float)$last;
            if ($elapsed < 1.1) {
                usleep((int)((1.1 - $elapsed) * 1_000_000));
            }
        }
        $cache->set('nominatim:last_call_at', (string)microtime(true), 60);
    }
}
