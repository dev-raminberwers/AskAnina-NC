<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Travel;

use DateTimeImmutable;
use DateTimeZone;
use Exception;
use OCP\ICache;
use OCP\ICacheFactory;

/**
 * Live flight status via AirLabs (https://airlabs.co) — each Nextcloud user
 * brings their own free-tier API key (Settings → Vlucht-info), not a
 * platform-shared service. API shape confirmed LIVE against the real
 * endpoints with a real key (AirLabs' own docs pages describe the payload as
 * bare root-level JSON, which is wrong): both /flight and /schedules wrap
 * their actual payload under a top-level "response" key — a single object
 * for /flight, a (possibly empty) array for /schedules. Failure responses
 * have no "response" key and instead carry {"error":{"message":...,"code":...}}
 * at the root.
 */
class AirLabs {
    private const FLIGHT_URL = 'https://airlabs.co/api/v9/flight';
    private const SCHEDULES_URL = 'https://airlabs.co/api/v9/schedules';
    private const ROUTES_URL = 'https://airlabs.co/api/v9/routes';

    /** A flight in one of these states is done for good — its gate/delay/status will never change again, so once seen it never needs asking AirLabs again for that same calendar date. */
    private const TERMINAL_STATUSES = ['landed', 'cancelled', 'incident', 'diverted'];

    public function __construct(private ICacheFactory $cacheFactory) {
    }

    /**
     * The full three-tier resolution chain (live exact-flight, live
     * schedules-by-route, static weekly timetable) in one place — used by
     * both DayPlanner (planning an already-detected flight's real timeline)
     * and AppointmentController (looking up a flight to create a brand new
     * calendar event for, e.g. "Enter return flight"), so a fix here never
     * needs to happen twice. Returns 'live' and 'scheduled' separately
     * (rather than one merged result) because callers care which tier
     * answered — DayPlanner shows a different status label and offers a
     * different "eigen tijden" toggle wording depending on which one it was.
     *
     * @return array{live: ?array, scheduled: ?array}
     */
    public function resolveFlightTimes(string $apiKey, ?string $flightNumber, ?string $depIata, ?string $arrIata, string $eventStartIso): array {
        $live = null;
        if ($flightNumber !== null) {
            $live = $this->lookupFlight($apiKey, $flightNumber, $eventStartIso);
        } elseif ($depIata !== null && $arrIata !== null) {
            $live = $this->lookupByRoute($apiKey, $depIata, $arrIata, $eventStartIso);
        }
        $scheduled = $live === null ? $this->lookupSchedule($apiKey, $depIata, $arrIata, $flightNumber, $eventStartIso) : null;
        return ['live' => $live, 'scheduled' => $scheduled];
    }

    /** ISO 3166-1 alpha-2 → English name — used to turn a country CODE (all we ever get from AirLabs/OSM) into something showable, e.g. "we see you're in {country}". */
    private const COUNTRY_NAMES = [
        'AD' => 'Andorra', 'AE' => 'United Arab Emirates', 'AF' => 'Afghanistan', 'AG' => 'Antigua and Barbuda',
        'AI' => 'Anguilla', 'AL' => 'Albania', 'AM' => 'Armenia', 'AO' => 'Angola', 'AQ' => 'Antarctica',
        'AR' => 'Argentina', 'AS' => 'American Samoa', 'AT' => 'Austria', 'AU' => 'Australia', 'AW' => 'Aruba',
        'AX' => 'Åland Islands', 'AZ' => 'Azerbaijan', 'BA' => 'Bosnia and Herzegovina', 'BB' => 'Barbados',
        'BD' => 'Bangladesh', 'BE' => 'Belgium', 'BF' => 'Burkina Faso', 'BG' => 'Bulgaria', 'BH' => 'Bahrain',
        'BI' => 'Burundi', 'BJ' => 'Benin', 'BL' => 'Saint Barthélemy', 'BM' => 'Bermuda', 'BN' => 'Brunei',
        'BO' => 'Bolivia', 'BQ' => 'Bonaire, Sint Eustatius and Saba', 'BR' => 'Brazil', 'BS' => 'Bahamas',
        'BT' => 'Bhutan', 'BV' => 'Bouvet Island', 'BW' => 'Botswana', 'BY' => 'Belarus', 'BZ' => 'Belize',
        'CA' => 'Canada', 'CC' => 'Cocos Islands', 'CD' => 'DR Congo', 'CF' => 'Central African Republic',
        'CG' => 'Congo', 'CH' => 'Switzerland', 'CI' => "Côte d'Ivoire", 'CK' => 'Cook Islands', 'CL' => 'Chile',
        'CM' => 'Cameroon', 'CN' => 'China', 'CO' => 'Colombia', 'CR' => 'Costa Rica', 'CU' => 'Cuba',
        'CV' => 'Cabo Verde', 'CW' => 'Curaçao', 'CX' => 'Christmas Island', 'CY' => 'Cyprus',
        'CZ' => 'Czechia', 'DE' => 'Germany', 'DJ' => 'Djibouti', 'DK' => 'Denmark', 'DM' => 'Dominica',
        'DO' => 'Dominican Republic', 'DZ' => 'Algeria', 'EC' => 'Ecuador', 'EE' => 'Estonia', 'EG' => 'Egypt',
        'EH' => 'Western Sahara', 'ER' => 'Eritrea', 'ES' => 'Spain', 'ET' => 'Ethiopia', 'FI' => 'Finland',
        'FJ' => 'Fiji', 'FK' => 'Falkland Islands', 'FM' => 'Micronesia', 'FO' => 'Faroe Islands',
        'FR' => 'France', 'GA' => 'Gabon', 'GB' => 'United Kingdom', 'GD' => 'Grenada', 'GE' => 'Georgia',
        'GF' => 'French Guiana', 'GG' => 'Guernsey', 'GH' => 'Ghana', 'GI' => 'Gibraltar', 'GL' => 'Greenland',
        'GM' => 'Gambia', 'GN' => 'Guinea', 'GP' => 'Guadeloupe', 'GQ' => 'Equatorial Guinea', 'GR' => 'Greece',
        'GS' => 'South Georgia', 'GT' => 'Guatemala', 'GU' => 'Guam', 'GW' => 'Guinea-Bissau', 'GY' => 'Guyana',
        'HK' => 'Hong Kong', 'HM' => 'Heard Island and McDonald Islands', 'HN' => 'Honduras', 'HR' => 'Croatia',
        'HT' => 'Haiti', 'HU' => 'Hungary', 'ID' => 'Indonesia', 'IE' => 'Ireland', 'IL' => 'Israel',
        'IM' => 'Isle of Man', 'IN' => 'India', 'IO' => 'British Indian Ocean Territory', 'IQ' => 'Iraq',
        'IR' => 'Iran', 'IS' => 'Iceland', 'IT' => 'Italy', 'JE' => 'Jersey', 'JM' => 'Jamaica', 'JO' => 'Jordan',
        'JP' => 'Japan', 'KE' => 'Kenya', 'KG' => 'Kyrgyzstan', 'KH' => 'Cambodia', 'KI' => 'Kiribati',
        'KM' => 'Comoros', 'KN' => 'Saint Kitts and Nevis', 'KP' => 'North Korea', 'KR' => 'South Korea',
        'KW' => 'Kuwait', 'KY' => 'Cayman Islands', 'KZ' => 'Kazakhstan', 'LA' => 'Laos', 'LB' => 'Lebanon',
        'LC' => 'Saint Lucia', 'LI' => 'Liechtenstein', 'LK' => 'Sri Lanka', 'LR' => 'Liberia', 'LS' => 'Lesotho',
        'LT' => 'Lithuania', 'LU' => 'Luxembourg', 'LV' => 'Latvia', 'LY' => 'Libya', 'MA' => 'Morocco',
        'MC' => 'Monaco', 'MD' => 'Moldova', 'ME' => 'Montenegro', 'MF' => 'Saint Martin', 'MG' => 'Madagascar',
        'MH' => 'Marshall Islands', 'MK' => 'North Macedonia', 'ML' => 'Mali', 'MM' => 'Myanmar',
        'MN' => 'Mongolia', 'MO' => 'Macao', 'MP' => 'Northern Mariana Islands', 'MQ' => 'Martinique',
        'MR' => 'Mauritania', 'MS' => 'Montserrat', 'MT' => 'Malta', 'MU' => 'Mauritius', 'MV' => 'Maldives',
        'MW' => 'Malawi', 'MX' => 'Mexico', 'MY' => 'Malaysia', 'MZ' => 'Mozambique', 'NA' => 'Namibia',
        'NC' => 'New Caledonia', 'NE' => 'Niger', 'NF' => 'Norfolk Island', 'NG' => 'Nigeria',
        'NI' => 'Nicaragua', 'NL' => 'Netherlands', 'NO' => 'Norway', 'NP' => 'Nepal', 'NR' => 'Nauru',
        'NU' => 'Niue', 'NZ' => 'New Zealand', 'OM' => 'Oman', 'PA' => 'Panama', 'PE' => 'Peru',
        'PF' => 'French Polynesia', 'PG' => 'Papua New Guinea', 'PH' => 'Philippines', 'PK' => 'Pakistan',
        'PL' => 'Poland', 'PM' => 'Saint Pierre and Miquelon', 'PN' => 'Pitcairn', 'PR' => 'Puerto Rico',
        'PS' => 'Palestine', 'PT' => 'Portugal', 'PW' => 'Palau', 'PY' => 'Paraguay', 'QA' => 'Qatar',
        'RE' => 'Réunion', 'RO' => 'Romania', 'RS' => 'Serbia', 'RU' => 'Russia', 'RW' => 'Rwanda',
        'SA' => 'Saudi Arabia', 'SB' => 'Solomon Islands', 'SC' => 'Seychelles', 'SD' => 'Sudan',
        'SE' => 'Sweden', 'SG' => 'Singapore', 'SH' => 'Saint Helena', 'SI' => 'Slovenia',
        'SJ' => 'Svalbard and Jan Mayen', 'SK' => 'Slovakia', 'SL' => 'Sierra Leone', 'SM' => 'San Marino',
        'SN' => 'Senegal', 'SO' => 'Somalia', 'SR' => 'Suriname', 'SS' => 'South Sudan',
        'ST' => 'São Tomé and Príncipe', 'SV' => 'El Salvador', 'SX' => 'Sint Maarten', 'SY' => 'Syria',
        'SZ' => 'Eswatini', 'TC' => 'Turks and Caicos Islands', 'TD' => 'Chad', 'TF' => 'French Southern Territories',
        'TG' => 'Togo', 'TH' => 'Thailand', 'TJ' => 'Tajikistan', 'TK' => 'Tokelau', 'TL' => 'Timor-Leste',
        'TM' => 'Turkmenistan', 'TN' => 'Tunisia', 'TO' => 'Tonga', 'TR' => 'Turkey', 'TT' => 'Trinidad and Tobago',
        'TV' => 'Tuvalu', 'TW' => 'Taiwan', 'TZ' => 'Tanzania', 'UA' => 'Ukraine', 'UG' => 'Uganda',
        'UM' => 'United States Minor Outlying Islands', 'US' => 'United States', 'UY' => 'Uruguay',
        'UZ' => 'Uzbekistan', 'VA' => 'Vatican City', 'VC' => 'Saint Vincent and the Grenadines',
        'VE' => 'Venezuela', 'VG' => 'British Virgin Islands', 'VI' => 'U.S. Virgin Islands', 'VN' => 'Vietnam',
        'VU' => 'Vanuatu', 'WF' => 'Wallis and Futuna', 'WS' => 'Samoa', 'YE' => 'Yemen', 'YT' => 'Mayotte',
        'ZA' => 'South Africa', 'ZM' => 'Zambia', 'ZW' => 'Zimbabwe',
    ];

    /** @return ?string a human-readable country name for an ISO 3166-1 alpha-2 code, or the code itself if not in the table, or null for null/empty input */
    public static function countryName(?string $code): ?string {
        if ($code === null || $code === '') {
            return null;
        }
        return self::COUNTRY_NAMES[strtoupper($code)] ?? $code;
    }

    /**
     * Recognizes either a bare IATA route ("AMS SXM", "AMS->SXM", "AMS→SXM")
     * or a flight number ("KL777") from free text — the same route pattern
     * DayPlanner::detectFlight() uses for a calendar title, shared here so
     * both that (scanning existing text) and AppointmentController (parsing
     * a user-typed "route or flight number" field) stay in sync.
     *
     * @return array{depIata: ?string, arrIata: ?string, flightNumber: ?string}
     */
    public static function parseRouteOrFlightNumber(string $text): array {
        $text = strtoupper(trim($text));
        if (preg_match('/^([A-Z]{3})\s*(?:->|→|-)?\s*([A-Z]{3})$/', $text, $m) === 1) {
            return ['depIata' => $m[1], 'arrIata' => $m[2], 'flightNumber' => null];
        }
        return ['depIata' => null, 'arrIata' => null, 'flightNumber' => str_replace(' ', '', $text)];
    }

    /**
     * Anchors a naive local wall-clock string from some airport (e.g. "AMS
     * 2026-09-06 10:05", no timezone marker) to a real, unambiguous instant,
     * using that airport's own UTC offset in minutes (already computed
     * instant-specifically by offsetMinutes(), so DST is already baked in —
     * see its own doc-comment for why an offset is the right primitive here
     * instead of a named IANA zone, which we have no way to look up for an
     * arbitrary airport). Constructing a DateTimeImmutable straight from a
     * naive string lets PHP's ambient default timezone silently decide what
     * the digits mean, which is essentially never correct for a foreign
     * airport — this sidesteps that entirely by treating the digits as UTC
     * on purpose, then shifting by the real offset to land on the true UTC
     * instant. Every later ->format(DATE_ATOM) off the result carries an
     * explicit "+00:00", so any further DateTimeImmutable built from that
     * formatted string stays unambiguous too, regardless of server
     * timezone. Falls back to a naive interpretation when the offset isn't
     * known (calendar-only fallback tier, no AirLabs data).
     */
    public static function toUtcInstant(string $naiveLocal, ?int $offsetMinutes): DateTimeImmutable {
        $naiveLocal = str_replace(' ', 'T', $naiveLocal);
        $asIfUtc = new DateTimeImmutable($naiveLocal, new DateTimeZone('UTC'));
        return $offsetMinutes !== null ? $asIfUtc->modify('-' . $offsetMinutes . ' minutes') : $asIfUtc;
    }

    /**
     * Shifts a naive local-at-some-airport string by N minutes and returns
     * another naive string in that SAME local frame — deliberately the
     * opposite of toUtcInstant(): this is for values the user will actually
     * SEE as "the clock reading at that airport" (e.g. "be at the gate by
     * 07:35" or "arrival processing until 14:00 SXM-local"), where
     * converting through a real UTC instant would let the browser
     * "helpfully" re-render it in ITS OWN timezone — exactly wrong for a
     * foreign airport's own clock. Never mix this with toUtcInstant()'s
     * result for the same value: one is for cross-event comparisons
     * (needs a real instant), the other is for what a human reads off a
     * clock at that specific place (needs to stay naive).
     */
    public static function shiftNaive(string $naiveLocal, int $deltaMinutes): string {
        $naiveLocal = str_replace(' ', 'T', $naiveLocal);
        $asIfUtc = new DateTimeImmutable($naiveLocal, new DateTimeZone('UTC'));
        return $asIfUtc->modify(($deltaMinutes >= 0 ? '+' : '') . $deltaMinutes . ' minutes')->format('Y-m-d\TH:i:s');
    }

    /**
     * Exact match by flight number (e.g. "KL793") — used whenever the
     * calendar text actually names a flight, per DayPlanner::detectFlight().
     *
     * AirLabs' /flight endpoint takes no date parameter: for a flight
     * number that operates daily (e.g. KL1513 AMS→BCN every day), it always
     * answers with whatever it currently knows about that NUMBER, which can
     * be an already-landed flight from earlier today/yesterday even when
     * $eventStartIso is for a future date — the exact bug reported live
     * ("a future flight already shows as landed"). $eventStartIso is
     * required so the result can be checked against the flight's own
     * departure date before it's trusted; a mismatch returns null so the
     * caller falls through to the date-aware static schedule instead.
     *
     * @return array{status:string,depIata:?string,depGate:?string,depTerminal:?string,depTime:?string,depEstimated:?string,depDelayedMinutes:int,arrIata:?string,arrGate:?string,arrTerminal:?string,arrTime:?string,arrEstimated:?string,arrDelayedMinutes:int,arrBaggage:?string}|null
     */
    public function lookupFlight(string $apiKey, string $flightIata, string $eventStartIso): ?array {
        $flightIata = strtoupper(trim($flightIata));
        if ($flightIata === '') {
            return null;
        }

        $cache = $this->cacheFactory->createDistributed('personalassistant_airlabs');

        // A flight whose OUTCOME is already final for THIS calendar date
        // (landed/cancelled/etc.) never needs asking AirLabs again — checked
        // first, ahead of the live cache below, because that one is keyed
        // by flight NUMBER alone and gets overwritten the moment this same
        // number's next daily occurrence starts, which would otherwise
        // silently lose a past date's already-settled answer. Revisiting an
        // old day's timeline (the exact case reported: "every time you open
        // that day, it calls AirLabs again even though we already know the
        // answer") is the reason this exists.
        $eventDateKey = self::eventDateKey($eventStartIso);
        $finalCacheKey = $eventDateKey !== null ? "flight-final:$flightIata:$eventDateKey" : null;
        if ($finalCacheKey !== null) {
            $cachedFinal = $this->readCache($cache, $finalCacheKey);
            if ($cachedFinal !== false && $cachedFinal !== null) {
                return $cachedFinal;
            }
        }

        $cacheKey = "flight:$flightIata";
        $cached = $this->readCache($cache, $cacheKey);
        if ($cached !== false) {
            $resolved = $cached;
        } else {
            $envelope = $this->request($cache, $cacheKey, self::FLIGHT_URL, [
                'flight_iata' => $flightIata,
                'api_key' => $apiKey,
            ]);
            $flight = is_array($envelope) ? ($envelope['response'] ?? null) : null;
            if (!is_array($flight) || (!isset($flight['flight_iata']) && !isset($flight['status']))) {
                $this->writeCache($cache, $cacheKey, null, 300);
                return null;
            }

            $resolved = self::mapFields($flight);
            // Cached date-independent on purpose — this genuinely is "the
            // live state of flight KL1513 right now", which is valid
            // regardless of which caller's calendar date is asking. The
            // date check below is applied per-call, not baked into the
            // cache.
            $this->writeCache($cache, $cacheKey, $resolved, 120);
        }

        if ($resolved === null || !self::matchesEventDate($resolved, $eventStartIso)) {
            return null;
        }

        if ($finalCacheKey !== null && in_array($resolved['status'] ?? '', self::TERMINAL_STATUSES, true)) {
            $this->writeCache($cache, $finalCacheKey, $resolved, 60 * 60 * 24 * 30);
        }

        return $resolved;
    }

    /** @return ?string the calendar date (Y-m-d) $eventStartIso falls on, or null if it doesn't parse — never worth failing the whole lookup over. */
    private static function eventDateKey(string $eventStartIso): ?string {
        try {
            return (new DateTimeImmutable($eventStartIso))->format('Y-m-d');
        } catch (Exception) {
            return null;
        }
    }

    /**
     * True when a live /flight result's own departure instant is close
     * enough in real (UTC) time to the calendar event's own start to be
     * "the same occurrence" of a daily-or-more-frequent route, or when
     * there's nothing to compare — never reject on our own parse failure.
     *
     * Deliberately compares real UTC instants (via toUtcInstant(), the
     * same anchor DayPlanner itself uses), not calendar-date strings: a
     * first attempt here compared dates with a ±1-day tolerance meant to
     * absorb late-night-departure timezone framing, but that tolerance is
     * exactly wide enough to also accept a DIFFERENT day's already-landed
     * occurrence of the same daily flight number (confirmed live: KL1513
     * flies AMS→BCN every day at the same local time, so yesterday's
     * completed flight and today's not-yet-departed one differ by exactly
     * one day — the case the tolerance was supposed to allow through by
     * mistake). A tight few-hour window on the real instant distinguishes
     * "this occurrence" from "a distinct daily occurrence ~24h away"
     * without needing any calendar-date arithmetic at all.
     */
    private static function matchesEventDate(array $flight, string $eventStartIso): bool {
        $depNaive = $flight['depEstimated'] ?? $flight['depTime'] ?? null;
        if ($depNaive === null) {
            return true;
        }
        try {
            $depInstant = self::toUtcInstant($depNaive, $flight['depOffsetMinutes'] ?? null);
            $eventInstant = new DateTimeImmutable($eventStartIso);
        } catch (Exception) {
            return true;
        }
        // Consecutive occurrences of a daily route are ~24h apart; a
        // window well under that (but generous enough for a calendar
        // entry's own placeholder time to be a few hours off the airline's
        // precise scheduled time) cleanly tells the two apart.
        return abs($depInstant->getTimestamp() - $eventInstant->getTimestamp()) < 12 * 3600;
    }

    /**
     * Route-only fallback (e.g. calendar just says "AMS SXM", no flight
     * number) — AirLabs' /schedules only looks up to 10 hours ahead of NOW
     * (their documented limit, not something we can widen), so this
     * deliberately does nothing outside that window rather than wasting a
     * request that can never succeed. Picks the schedule entry whose
     * departure is closest to the calendar event's own start time — on a
     * route with more than one flight/day this is "the nearest flight",
     * exactly like a human would pick.
     *
     * @return array{status:string,depIata:?string,depGate:?string,depTerminal:?string,depTime:?string,depEstimated:?string,depDelayedMinutes:int,arrIata:?string,arrGate:?string,arrTerminal:?string,arrTime:?string,arrEstimated:?string,arrDelayedMinutes:int,arrBaggage:?string}|null
     */
    public function lookupByRoute(string $apiKey, string $depIata, string $arrIata, string $eventStartIso): ?array {
        $depIata = strtoupper(trim($depIata));
        $arrIata = strtoupper(trim($arrIata));
        if ($depIata === '' || $arrIata === '') {
            return null;
        }

        try {
            $eventStart = new DateTimeImmutable($eventStartIso);
        } catch (Exception) {
            return null;
        }
        $hoursUntilDeparture = ($eventStart->getTimestamp() - time()) / 3600;
        if ($hoursUntilDeparture > 10 || $hoursUntilDeparture < -2) {
            return null; // outside AirLabs' schedules look-ahead window — would just waste a request
        }

        $cache = $this->cacheFactory->createDistributed('personalassistant_airlabs');
        $cacheKey = "route:$depIata:$arrIata:" . $eventStart->format('Y-m-d');
        $cached = $this->readCache($cache, $cacheKey);
        if ($cached !== false) {
            return $cached;
        }

        $envelope = $this->request($cache, $cacheKey, self::SCHEDULES_URL, [
            'dep_iata' => $depIata,
            'arr_iata' => $arrIata,
            'api_key' => $apiKey,
        ]);
        $list = is_array($envelope) ? ($envelope['response'] ?? null) : null;
        if (!is_array($list) || $list === []) {
            $this->writeCache($cache, $cacheKey, null, 120);
            return null;
        }

        $targetTs = $eventStart->getTimestamp();
        $closest = null;
        $closestDelta = null;
        foreach ($list as $candidate) {
            if (!is_array($candidate) || !isset($candidate['dep_time_ts'])) {
                continue;
            }
            $delta = abs((int)$candidate['dep_time_ts'] - $targetTs);
            if ($closestDelta === null || $delta < $closestDelta) {
                $closest = $candidate;
                $closestDelta = $delta;
            }
        }
        if ($closest === null) {
            $this->writeCache($cache, $cacheKey, null, 120);
            return null;
        }

        $resolved = self::mapFields($closest);
        $this->writeCache($cache, $cacheKey, $resolved, 120);
        return $resolved;
    }

    /**
     * Real scheduled departure/arrival times regardless of date — AirLabs'
     * /routes endpoint (their own docs claim it needs dep_iata+arr_iata+
     * airline_iata together, which is wrong: confirmed LIVE that dep_iata+
     * arr_iata alone works, and flight_iata alone also works). It's a static
     * weekly timetable (days-of-week + local HH:MM, no live status/gate/
     * delay), unlike /flight and /schedules which are live-only and useless
     * more than ~10h before departure — this is the "look elsewhere" source
     * for a flight that's simply too far in the future for live data yet.
     * Filters the route's operating days down to the one matching the
     * calendar event's own date, preferring the operating flight number over
     * a codeshare duplicate of the same slot when both exist.
     *
     * @return array{status:string,depIata:?string,depGate:null,depTerminal:?string,depTime:?string,depEstimated:null,depDelayedMinutes:0,arrIata:?string,arrGate:null,arrTerminal:?string,arrTime:?string,arrEstimated:null,arrDelayedMinutes:0,arrBaggage:null}|null
     */
    public function lookupSchedule(string $apiKey, ?string $depIata, ?string $arrIata, ?string $flightIata, string $eventStartIso): ?array {
        $depIata = $depIata !== null ? strtoupper(trim($depIata)) : null;
        $arrIata = $arrIata !== null ? strtoupper(trim($arrIata)) : null;
        $flightIata = $flightIata !== null ? strtoupper(trim($flightIata)) : null;
        if ($depIata === null && $arrIata === null && $flightIata === null) {
            return null;
        }

        try {
            $eventStart = new DateTimeImmutable($eventStartIso);
        } catch (Exception) {
            return null;
        }
        $dateKey = $eventStart->format('Y-m-d');
        $weekday = strtolower($eventStart->format('D'));

        $cache = $this->cacheFactory->createDistributed('personalassistant_airlabs');
        // Cached by weekday, not exact date — this is a static weekly
        // schedule, so every future occurrence of that weekday reuses it.
        $cacheKey = 'routes:' . ($flightIata ?? '') . ':' . ($depIata ?? '') . ':' . ($arrIata ?? '') . ':' . $weekday;
        $cached = $this->readCache($cache, $cacheKey);
        if ($cached !== false) {
            return $cached !== null ? self::combineScheduleWithDate($cached, $dateKey) : null;
        }

        $params = ['api_key' => $apiKey];
        if ($flightIata !== null) {
            $params['flight_iata'] = $flightIata;
        }
        if ($depIata !== null) {
            $params['dep_iata'] = $depIata;
        }
        if ($arrIata !== null) {
            $params['arr_iata'] = $arrIata;
        }

        $envelope = $this->request($cache, $cacheKey, self::ROUTES_URL, $params);
        $list = is_array($envelope) ? ($envelope['response'] ?? null) : null;
        if (!is_array($list) || $list === []) {
            $this->writeCache($cache, $cacheKey, null, 60 * 60 * 24);
            return null;
        }

        $matches = array_values(array_filter(
            $list,
            static fn($entry) => is_array($entry) && in_array($weekday, $entry['days'] ?? [], true),
        ));
        if ($matches === []) {
            $this->writeCache($cache, $cacheKey, null, 60 * 60 * 24);
            return null;
        }
        usort($matches, static fn($a, $b) => (($a['cs_airline_iata'] ?? null) !== null ? 1 : 0) <=> (($b['cs_airline_iata'] ?? null) !== null ? 1 : 0));
        $entry = $matches[0];

        $depTerminals = $entry['dep_terminals'] ?? null;
        $arrTerminals = $entry['arr_terminals'] ?? null;
        $raw = [
            'flightIata' => (string)($entry['flight_iata'] ?? ''),
            'depIata' => (string)($entry['dep_iata'] ?? ''),
            'depTerminal' => is_array($depTerminals) && $depTerminals !== [] ? (string)$depTerminals[0] : null,
            'depTimeHm' => (string)($entry['dep_time'] ?? ''),
            'depTimeUtcHm' => (string)($entry['dep_time_utc'] ?? ''),
            'arrIata' => (string)($entry['arr_iata'] ?? ''),
            'arrTerminal' => is_array($arrTerminals) && $arrTerminals !== [] ? (string)$arrTerminals[0] : null,
            'arrTimeHm' => (string)($entry['arr_time'] ?? ''),
            'arrTimeUtcHm' => (string)($entry['arr_time_utc'] ?? ''),
            'arrDayOffset' => self::dayOffsetFromUtc((string)($entry['dep_time_utc'] ?? '00:00'), (int)($entry['duration'] ?? 0)),
        ];

        // Weekly static schedule barely ever changes — a week-long cache is
        // safe and keeps this well within the free-tier monthly quota.
        $this->writeCache($cache, $cacheKey, $raw, 60 * 60 * 24 * 7);
        return self::combineScheduleWithDate($raw, $dateKey);
    }

    /**
     * How many UTC calendar days past departure the arrival falls — computed
     * by actually placing both instants on the UTC timeline (not by
     * eyeballing raw minute arithmetic), so a multi-day layover works just
     * as correctly as a same-day hop. AirLabs never gives a real IANA
     * timezone name for either airport (no data source we have access to
     * reliably does, for arbitrary airports worldwide) — its own
     * local/UTC time PAIR for this specific instant is the only offset
     * information available, but that pairing already has whatever DST
     * applies on that date baked in, so working from it is exactly as
     * correct as a named-zone lookup would be.
     */
    private static function dayOffsetFromUtc(string $depTimeUtc, int $durationMinutes): int {
        $depInstant = new DateTimeImmutable("1970-01-01 $depTimeUtc", new DateTimeZone('UTC'));
        $arrInstant = $depInstant->modify("+{$durationMinutes} minutes");
        $depDate = new DateTimeImmutable($depInstant->format('Y-m-d'), new DateTimeZone('UTC'));
        $arrDate = new DateTimeImmutable($arrInstant->format('Y-m-d'), new DateTimeZone('UTC'));
        return (int)$depDate->diff($arrDate)->format('%r%a');
    }

    /** @param array{depIata:string,depTerminal:?string,depTimeHm:string,depTimeUtcHm:string,arrIata:string,arrTerminal:?string,arrTimeHm:string,arrTimeUtcHm:string,arrDayOffset:int} $raw */
    private static function combineScheduleWithDate(array $raw, string $dateKey): array {
        $arrDate = (new DateTimeImmutable($dateKey))->modify("+{$raw['arrDayOffset']} days")->format('Y-m-d');
        return [
            'status' => 'scheduled',
            'flightNumber' => $raw['flightIata'] !== '' ? $raw['flightIata'] : null,
            'depIata' => $raw['depIata'],
            'depGate' => null,
            'depTerminal' => $raw['depTerminal'],
            'depTime' => "{$dateKey} {$raw['depTimeHm']}",
            'depEstimated' => null,
            'depDelayedMinutes' => 0,
            'depOffsetMinutes' => self::offsetMinutes($raw['depTimeHm'], $raw['depTimeUtcHm']),
            'depCountry' => null, // /routes carries no country data — DayPlanner falls back to the airport's own country tag
            'arrIata' => $raw['arrIata'],
            'arrGate' => null,
            'arrTerminal' => $raw['arrTerminal'],
            'arrTime' => "{$arrDate} {$raw['arrTimeHm']}",
            'arrEstimated' => null,
            'arrDelayedMinutes' => 0,
            'arrOffsetMinutes' => self::offsetMinutes($raw['arrTimeHm'], $raw['arrTimeUtcHm']),
            'arrCountry' => null,
            'arrBaggage' => null,
        ];
    }

    /** @return array<string,mixed>|null raw decoded envelope (still has the "response" key to unwrap), or null on transport/API error */
    private function request(ICache $cache, string $cacheKey, string $baseUrl, array $params): ?array {
        $url = $baseUrl . '?' . http_build_query($params);

        $ch = curl_init($url);
        if ($ch === false) {
            return null;
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_USERAGENT => 'NextcloudPersonalAssistant/0.1',
        ]);
        $body = curl_exec($ch);
        $errno = curl_errno($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0 || $body === false || $status >= 400) {
            error_log("PersonalAssistant AirLabs: request failed for '$cacheKey' (status=$status, errno=$errno)");
            return null; // transient — don't cache, retry on next page load
        }

        $data = json_decode((string)$body, true);
        if (!is_array($data) || isset($data['error'])) {
            $code = is_array($data) ? (string)($data['error']['code'] ?? 'unknown') : 'unparseable';
            error_log("PersonalAssistant AirLabs: API error for '$cacheKey': $code");
            // A wrong/expired key would otherwise be retried on every single
            // page load — still short, so a corrected key recovers quickly.
            $this->writeCache($cache, $cacheKey, null, 120);
            return null;
        }

        return $data;
    }

    /** @param array<string,mixed> $data */
    private static function mapFields(array $data): array {
        return [
            'status' => (string)($data['status'] ?? 'scheduled'),
            'flightNumber' => isset($data['flight_iata']) && $data['flight_iata'] !== '' ? (string)$data['flight_iata'] : null,
            'depIata' => isset($data['dep_iata']) ? (string)$data['dep_iata'] : null,
            'depGate' => isset($data['dep_gate']) && $data['dep_gate'] !== '' ? (string)$data['dep_gate'] : null,
            'depTerminal' => isset($data['dep_terminal']) && $data['dep_terminal'] !== '' ? (string)$data['dep_terminal'] : null,
            'depTime' => isset($data['dep_time']) ? (string)$data['dep_time'] : null,
            'depEstimated' => isset($data['dep_estimated']) ? (string)$data['dep_estimated'] : null,
            'depDelayedMinutes' => (int)($data['dep_delayed'] ?? 0),
            'depOffsetMinutes' => self::offsetMinutes((string)($data['dep_time'] ?? ''), (string)($data['dep_time_utc'] ?? '')),
            'depCountry' => isset($data['dep_country']) && $data['dep_country'] !== '' ? strtoupper((string)$data['dep_country']) : null,
            'arrIata' => isset($data['arr_iata']) ? (string)$data['arr_iata'] : null,
            'arrGate' => isset($data['arr_gate']) && $data['arr_gate'] !== '' ? (string)$data['arr_gate'] : null,
            'arrTerminal' => isset($data['arr_terminal']) && $data['arr_terminal'] !== '' ? (string)$data['arr_terminal'] : null,
            'arrTime' => isset($data['arr_time']) ? (string)$data['arr_time'] : null,
            'arrEstimated' => isset($data['arr_estimated']) ? (string)$data['arr_estimated'] : null,
            'arrDelayedMinutes' => (int)($data['arr_delayed'] ?? 0),
            'arrOffsetMinutes' => self::offsetMinutes((string)($data['arr_time'] ?? ''), (string)($data['arr_time_utc'] ?? '')),
            'arrCountry' => isset($data['arr_country']) && $data['arr_country'] !== '' ? strtoupper((string)$data['arr_country']) : null,
            'arrBaggage' => isset($data['arr_baggage']) && $data['arr_baggage'] !== '' ? (string)$data['arr_baggage'] : null,
        ];
    }

    /**
     * The wall-clock UTC offset (in minutes, signed) implied by a local time
     * vs its UTC counterpart at the same instant — only the last "HH:MM" of
     * each string matters (both /flight's "YYYY-MM-DD HH:MM" and /routes'
     * bare "HH:MM" work), since the offset is a same-instant comparison, not
     * a date computation. Used to show a timezone tag when departure and
     * arrival airports don't share one (flying always crosses one when the
     * trip is long enough).
     */
    private static function offsetMinutes(string $local, string $utc): ?int {
        $localHm = substr($local, -5);
        $utcHm = substr($utc, -5);
        if (!preg_match('/^\d{2}:\d{2}$/', $localHm) || !preg_match('/^\d{2}:\d{2}$/', $utcHm)) {
            return null;
        }
        $diff = self::hmToMinutes($localHm) - self::hmToMinutes($utcHm);
        // Normalize into (-720, 720] so a wraparound near midnight (e.g.
        // local 23:50 vs utc 00:10, a real +40min zone) doesn't come out as
        // a nonsensical ±1400-odd minutes.
        return (($diff + 720) % 1440 + 1440) % 1440 - 720;
    }

    private static function hmToMinutes(string $hm): int {
        [$h, $m] = explode(':', $hm);
        return ((int)$h) * 60 + (int)$m;
    }

    /** @return array<string,mixed>|null|false false = not cached yet */
    private function readCache(ICache $cache, string $key): mixed {
        $cached = $cache->get($key);
        if (!is_string($cached)) {
            return false;
        }
        $decoded = json_decode($cached, true);
        return is_array($decoded) && $decoded !== [] ? $decoded : null;
    }

    private function writeCache(ICache $cache, string $key, ?array $value, int $ttlSeconds): void {
        // Short TTL either way: this is live status (gate/delay can change),
        // but even a couple of minutes keeps repeated page loads/day
        // navigation from burning through the free-tier monthly quota.
        $cache->set($key, json_encode($value ?? []), $ttlSeconds);
    }
}
