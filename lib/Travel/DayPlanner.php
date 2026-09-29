<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Travel;

use DateTimeImmutable;
use DateTimeZone;
use OCA\PersonalAssistant\Db\TravelChoice;

/**
 * Computes real travel time between a day's consecutive events and flags
 * gaps exceeding the configured threshold — ported from the LIFE tool
 * Android app's TodayViewModel::buildTimeline() + TodayScreen's TravelRow
 * (not the simplified card this file used to build): the reistijd card's
 * time range, "REISTIJD" framing, and footnote text/math are all copied
 * verbatim from there, since that's the actual reference implementation,
 * not something to redesign from scratch.
 *
 * Deliberately side-effect-free (no travel_log/history writes) — this is
 * the live-planning view, computed fresh on every page load. A gap that
 * starts already at home isn't a real dilemma ("blijven of naar huis" is
 * meaningless when you're already there), so those are skipped — same fix
 * as the Android app's backend.
 */
class DayPlanner {
    /**
     * A car/OSRM route this long is never actually a normal domestic drive —
     * it means the "leg" really crosses somewhere a car can't go (an ocean,
     * usually), and the user needs to say HOW they're actually getting
     * there instead of us silently showing a nonsense multi-day "driving"
     * route. Checked on distance alone (not OSRM's own "estimated" flag) —
     * the public demo server can return a technically-real, non-estimated
     * route that still isn't a plausible day-to-day drive (e.g. stitching
     * ferry-tagged OSM ways across an ocean into a 27-hour "route").
     */
    private const IMPLAUSIBLE_DRIVE_KM = 300;

    public function __construct(
        private Geocoder $geocoder,
        private Osrm $osrm,
        private Overpass $overpass,
        private AirLabs $airLabs,
    ) {
    }

    /**
     * @param array<int, array{id:string,title:string,start:string,end:string,location:?string,calendarName:string,calendarColor:?string,homeOverride:bool,notAttended:bool}> $events ascending by start
     * @param array{lat:float,lon:float}|null $home the user's real, permanent home
     * @param array<string, \OCA\PersonalAssistant\Db\TravelChoice> $travelChoices keyed by event UID — the user's own corrections/decisions for the leg arriving at that event
     * @param array{lat:float,lon:float,display_name:string}|null $tempHome the user-picked "staying at" location for a multi-day trip abroad (or elsewhere) — when set, this replaces $home as the day's start/end anchor and as what "Thuis" resolves to (both the calendar-level homeOverride flag and a literal "Thuis" typed into an event's own location field — see resolveLocation()'s doc-comment)
     * @param ?string $baseCountry ISO country code of wherever $tempHome ?? $home currently is — display-only, lets a travel-mode question name both countries instead of just a km figure
     * @param bool $tempHomeAppliesAtStart false on the day $tempHome was decided (the outbound-flight day itself) — see this param's use at the top of the method for why
     * @param ?string $homeCountry ISO country code of the REAL home specifically — separate from $baseCountry because a literal "Thuis" always means the real house (see resolveLocation()) and needs the real house's own country, not wherever the current trip base happens to be
     * @return array{items: array<int, array<string, mixed>>, clearTempHome: bool, setTempHome: ?array{lat: float, lon: float, displayName: string, country: ?string}}
     */
    public function plan(
        array $events,
        ?array $home,
        string $profile,
        int $gapThresholdMinutes,
        int $departureBufferMinutes,
        int $arrivalBufferMinutes,
        string $airlabsApiKey = '',
        int $checkinLeadMinutesDefault = 150,
        int $arrivalProcessingMinutesDefault = 60,
        array $travelChoices = [],
        ?array $tempHome = null,
        ?string $baseCountry = null,
        bool $tempHomeAppliesAtStart = true,
        ?string $homeCountry = null,
    ): array {
        $items = [];
        // The "base" is what the day actually starts at and what a "Thuis"
        // calendar entry resolves to — normally the real home, but a
        // multi-day trip abroad (or anywhere) replaces it with wherever the
        // user said they're staying, per "Zowel in buitenland als in eigen
        // land hoeft Thuis niet altijd zijn waar de dag eindigt en begint."
        //
        // $tempHomeAppliesAtStart is false specifically on the day a temp
        // home gets DECIDED (the day of the outbound flight itself) — the
        // morning of that day hasn't left real home yet, so starting there
        // too would retroactively turn "pick a hotel for after I land" into
        // "you need to drive from that hotel to the departure airport this
        // morning," a nonsense multi-hour "leg" before the flight has even
        // happened. $base is instead PROMOTED to $tempHome mid-loop, right
        // when the flight that leads there actually lands (see below) — a
        // later day that already started at the temp home (no flight of its
        // own, or a return-flight day continuing from it) passes true here
        // and uses it from the top as before.
        $base = $tempHomeAppliesAtStart ? ($tempHome ?? $home) : $home;
        $baseLabel = ($tempHomeAppliesAtStart && $tempHome !== null) ? $tempHome['display_name'] : 'Thuis';
        $prevLocation = $base;
        $prevLabel = $baseLabel;
        $prevEnd = null;
        // Country hint for wherever the day currently is — starts as
        // $baseCountry (wherever "Thuis" resolves to right now), then
        // updates as the day moves: a flight gives AirLabs' own arr_country
        // or the arrival airport's OSM country tag, an ordinary geocoded
        // appointment gives Nominatim's country_code. Display-only (used to
        // name both countries in a travel-mode question), never decision
        // logic — a plain road-trip leg with no fresh signal just keeps
        // whatever it already had.
        $prevCountry = $baseCountry;
        // Overrides the code→name table with Nominatim's own country name
        // when a geocoded address supplied one — needed because Nominatim
        // reports country_code "nl" for some Dutch Caribbean territories
        // (Sint Maarten included) even though its own "country" field
        // correctly says "Sint Maarten". Null falls back to the table.
        $prevCountryName = null;
        $clearTempHome = false;
        // Once any real flight lands today, that flight's own transfer/
        // staying question (see below) is what resolves "where are you
        // staying tonight" — the generic end-of-day distance check must not
        // ALSO ask again for a pure road-trip day with no flights at all.
        $hadFlightToday = false;
        // Shows an inline "new base" marker on whichever event's own item
        // comes right after the promotion below — the promotion itself
        // happens mid-flight-processing (right when it lands), but the
        // marker is deliberately deferred to the NEXT event so it renders
        // after that event's own travel-to-there leg, not before it (you
        // haven't arrived at the new base until that leg completes). Only
        // set on the day it's decided — later days start there already via
        // $tempHomeAppliesAtStart, so the top banner covers it instead.
        $basePromotedInline = false;
        $pendingBaseChange = null;
        // Auto-detected from the calendar itself, once at most (last one
        // found wins) — see the transfer/staying block below.
        $autoDetectedTempHome = null;

        // Anchors the timeline the same way the Android app's Vandaag-scherm
        // does: a "Huis — start van de dag" node first, so every travel leg
        // and gap has a visible starting point rather than floating above
        // the first appointment with no anchor.
        if ($base !== null && $events !== []) {
            $items[] = self::waypointItem($base, $baseLabel, isHomeStart: true);
        }

        foreach ($events as $eventIndex => $event) {
            // Consumed here (this event's own item gets it), not where it
            // was set — see $pendingBaseChange's own doc-comment above.
            $baseChangeForThisEvent = $pendingBaseChange;
            $pendingBaseChange = null;
            // Set true only when the airport-to-hotel leg below already
            // landed $prevEnd at the hotel's own arrival time — otherwise
            // the generic "$prevEnd advances to this event's own end" logic
            // further down would clobber it back to the flight's landing
            // time, as if no taxi ride had happened at all.
            $prevEndOverridden = false;

            $flightInfo = self::detectFlight($event);
            $choice = $travelChoices[$event['id']] ?? null;
            // "Wij hebben zelf het vluchtnummer opgezocht" (a route-only
            // detection like "AMS SXM" guessed a flight number via
            // /routes) — the user can correct it via the "Change
            // flightnumber" button, and that correction wins over whatever
            // we detected/guessed.
            if ($flightInfo !== null && $choice?->getFlightNumber() !== null) {
                $flightInfo['flightNumber'] = $choice->getFlightNumber();
            }

            // Resolve REAL flight times as early as possible — everything
            // downstream (when to leave by car, the check-in window, when
            // the day continues after landing) should be driven by the
            // actual departure/arrival time, not the calendar entry's own
            // (often a placeholder) start/end. Same three-tier chain used
            // for display: live exact match, live schedules-by-route, then
            // AirLabs' static weekly timetable for anything further out.
            $liveFlight = null;
            $scheduledFlight = null;
            if ($flightInfo !== null && $airlabsApiKey !== '') {
                $resolvedTimes = $this->airLabs->resolveFlightTimes(
                    $airlabsApiKey,
                    $flightInfo['flightNumber'],
                    $flightInfo['fromCode'],
                    $flightInfo['toCode'],
                    $event['start'],
                );
                $liveFlight = $resolvedTimes['live'];
                $scheduledFlight = $resolvedTimes['scheduled'];
            }
            $flightTimes = $liveFlight ?? $scheduledFlight;
            // AirLabs times are naive local-at-that-airport strings (no
            // timezone marker) — AirLabs::toUtcInstant() anchors each one
            // explicitly via the airport's own real UTC offset, so the
            // result is an unambiguous real instant no matter what
            // timezone this server happens to be configured with (see its
            // own doc-comment for the full reasoning).
            $flightDepAnchor = $flightTimes !== null
                ? AirLabs::toUtcInstant($flightTimes['depEstimated'] ?? $flightTimes['depTime'], $flightTimes['depOffsetMinutes'] ?? null)->format(DATE_ATOM)
                : $event['start'];
            $flightArrAnchor = $flightTimes !== null
                ? AirLabs::toUtcInstant($flightTimes['arrEstimated'] ?? $flightTimes['arrTime'], $flightTimes['arrOffsetMinutes'] ?? null)->format(DATE_ATOM)
                : $event['end'];
            // Passport control / baggage / customs after landing — same
            // "user default, per-leg override via the 'Aanpassen' pill"
            // pattern as the check-in lead time. Deliberately built from the
            // ORIGINAL naive arrival string (SXM's own "13:00"), not
            // $flightArrAnchor — this card explicitly shows the clock AT
            // THAT AIRPORT, and $flightArrAnchor is a real UTC instant that
            // the browser would "helpfully" re-render in ITS OWN timezone
            // (wrong here: it turned 13:00 SXM into 19:00 on an
            // Amsterdam-timezone browser). AirLabs::shiftNaive() adds
            // minutes while staying in that same local frame.
            $arrivalProcessingMinutes = $choice?->getArrivalProcessingMinutes() ?? $arrivalProcessingMinutesDefault;
            $arrivalWindow = $flightTimes !== null ? [
                'start' => str_replace(' ', 'T', $flightTimes['arrEstimated'] ?? $flightTimes['arrTime']),
                'end' => AirLabs::shiftNaive($flightTimes['arrEstimated'] ?? $flightTimes['arrTime'], $arrivalProcessingMinutes),
                'minutes' => $arrivalProcessingMinutes,
            ] : null;

            $resolved = $this->resolveLocation($event, $base, $baseLabel, $baseCountry, $home, $homeCountry);
            $flightAirportResolved = false;

            // A flight's calendar entry rarely has a real LOCATION field —
            // people write "AMS SXM" as the title, not "Amsterdam Airport
            // Schiphol" as the location. When we detected a route, resolve
            // the DEPARTURE code to real airport coordinates via Overpass
            // (exact tag match — fast, see Overpass::findAirportByIata's
            // own doc-comment for why this is NOT the earlier nationwide
            // regex-scan mistake) so the normal travel pipeline below has
            // somewhere real to route to. Prefer AirLabs' own dep_iata (more
            // reliable than our title-regex fromCode) when we have it.
            if ($resolved === null && $flightInfo !== null) {
                $depCode = $flightTimes['depIata'] ?? $flightInfo['fromCode'];
                if ($depCode !== null) {
                    $airport = $this->overpass->findAirportByIata($depCode);
                    if ($airport !== null) {
                        $resolved = $airport;
                        $flightAirportResolved = true;
                    }
                }
            }

            $locationText = trim((string)($event['location'] ?? ''));
            $needsAddress = !$event['homeOverride'] && $locationText === '' && !$flightAirportResolved;
            // Distinct from needsAddress: an address WAS entered but
            // Nominatim couldn't find it — silently treating this the same
            // as "nothing entered" hid geocoding failures completely (no
            // travel card, no warning, no visible reason why).
            $unresolvedLocationText = (!$event['homeOverride'] && $locationText !== '' && $resolved === null)
                ? $locationText
                : null;
            if ($unresolvedLocationText !== null) {
                error_log("PersonalAssistant: could not geocode event location '$unresolvedLocationText' (event: {$event['title']})");
            }
            $notAttended = !empty($event['notAttended']);

            // Resolved as early as this so the transfer/staying question
            // below already knows where this flight actually lands — same
            // fallback the display layer and $prevLocation update further
            // down both rely on (AirLabs' arrIata first, our own
            // title-regex toCode second).
            $arrIataForOverride = $flightTimes['arrIata'] ?? $flightInfo['toCode'] ?? null;
            $arrivalOverride = ($flightInfo !== null && $arrIataForOverride !== null)
                ? $this->overpass->findAirportByIata($arrIataForOverride)
                : null;
            if ($arrivalOverride === null && $arrIataForOverride !== null) {
                // Nothing crashed — Overpass just didn't answer this time
                // (transient "server busy", see its own doc-comment) — but
                // this is exactly the condition the temp-home promotion
                // fallback further down exists for, so it's worth a log line
                // to confirm when it actually happens live.
                error_log("PersonalAssistant DayPlanner: could not resolve arrival airport '$arrIataForOverride' via Overpass (event: {$event['title']})");
            }
            // The arrival-processing card shows the real airport name
            // ("Barcelona El Prat...") rather than the bare IATA code, same
            // as the departure check-in card already does.
            if ($arrivalWindow !== null) {
                $arrivalWindow['airportName'] = $arrivalOverride['display_name'] ?? $arrIataForOverride;
            }

            // Right after a flight lands (passport control etc.), the very
            // first thing to resolve is whether this airport is actually
            // where the user is staying, or just a stop on the way to a
            // connecting flight — asking "how do you get to your next
            // appointment" before that is answered doesn't make sense (the
            // next appointment might not even apply if they're not staying
            // here at all). Answered once via TravelChoice, then remembered.
            $arrivalDecision = $choice?->getArrivalDecision();
            $needsTransferDecision = null;
            $needsTransferFlight = null;
            $needsAccommodationForFlight = null;
            if (!$event['homeOverride'] && !$notAttended && $flightInfo !== null) {
                $hadFlightToday = true;
                $airportLabel = $arrivalOverride['display_name'] ?? $flightInfo['route'];
                $arrCountryForLeg = $flightTimes['arrCountry'] ?? $arrivalOverride['countryCode'] ?? null;

                // Don't ask what the calendar itself already answers: a
                // later flight today is an obvious connecting leg, and a
                // "Hotel ..."-style appointment after this one tells us
                // exactly where the user is staying — both make the
                // transfer/staying question moot.
                if ($arrivalDecision === null) {
                    if (self::findFollowingFlight($events, $eventIndex) !== null) {
                        $arrivalDecision = 'transfer';
                    } else {
                        $stayEvent = self::findFollowingAccommodation($events, $eventIndex);
                        if ($stayEvent !== null) {
                            $stayLocationText = trim((string)($stayEvent['location'] ?? '')) ?: trim($stayEvent['title']);
                            $stayLocation = $this->geocoder->search($stayLocationText);
                            if ($stayLocation !== null) {
                                $arrivalDecision = 'staying';
                                $autoDetectedTempHome = [
                                    'lat' => $stayLocation['lat'],
                                    'lon' => $stayLocation['lon'],
                                    'displayName' => trim($stayEvent['title']),
                                    'country' => $arrCountryForLeg,
                                ];
                            }
                        }
                    }
                }

                if ($arrivalDecision === null) {
                    $needsTransferDecision = ['airportName' => $airportLabel];
                } elseif ($arrivalDecision === 'transfer' && self::findFollowingFlight($events, $eventIndex) === null) {
                    // Only ask for the connecting flight's details when one
                    // hasn't already been auto-detected on the calendar.
                    $needsTransferFlight = ['airportName' => $airportLabel];
                } elseif ($arrivalDecision === 'staying' && $autoDetectedTempHome === null && $tempHome === null) {
                    // Likewise: only ask where they're staying when that
                    // wasn't already resolved via the manual "Waar verblijf
                    // je?" search either — $tempHome reflects the LAST
                    // accommodation the user actually picked, so once one
                    // exists this stops asking again for this same leg.
                    $needsAccommodationForFlight = [
                        'reason' => 'flight',
                        'fromLabel' => $airportLabel,
                        'distanceKm' => null,
                        'arrCountry' => $arrCountryForLeg,
                        'lat' => $arrivalOverride['lat'] ?? null,
                        'lon' => $arrivalOverride['lon'] ?? null,
                    ];
                }
            }

            $isAtHome = $resolved !== null && $base !== null && self::isSameLocation($resolved, $base);
            // A "thuis" TV/screen event (football fixtures, episode
            // calendars) never represents an actual physical relocation —
            // "watching it" is true wherever you physically are, so it must
            // never generate a travel leg, even when the day's current
            // location has drifted away from home (e.g. still abroad after
            // a flight). Same no-op treatment as a not-attended event.
            $skipTravel = $notAttended || $event['homeOverride'];

            // A flight needs to be checked in and through security well
            // before boarding, not just the usual few-minutes arrival
            // buffer — overriding the buffer here (rather than in Settings)
            // keeps this specific to actual flights. The user's own
            // Settings default applies unless they set a custom lead time
            // for this specific flight (the "Aanpassen" pill on the
            // check-in card).
            $checkinLeadMinutes = $choice?->getCheckinLeadMinutes() ?? $checkinLeadMinutesDefault;
            $effectiveArrivalBufferMinutes = $flightInfo !== null
                ? $checkinLeadMinutes
                : $arrivalBufferMinutes;

            $travel = null;
            $travelUnknown = null;
            $sameLocation = false;
            $gap = null;
            $travelWarning = null;
            $needsTravelDecision = null;

            // A "niet gaan"/"niet geweest" appointment gets no travel card at
            // all, in either direction — you're not physically going there,
            // so there's nothing to route to, and the chain must connect
            // straight through to the next REAL stop (prevLocation/prevLabel/
            // prevEnd below simply don't advance for this event).
            if (!$skipTravel && $prevLocation !== null) {
                if ($resolved !== null && self::isSameLocation($prevLocation, $resolved)) {
                    $sameLocation = true;
                } elseif ($resolved !== null) {
                    $rawTravel = $this->osrm->route($prevLocation['lat'], $prevLocation['lon'], $resolved['lat'], $resolved['lon'], $profile);
                    // A detected flight already has its own real handling —
                    // this check is only for an otherwise-ordinary
                    // appointment the planner can't actually reach by car.
                    // Nominatim's own country name (when a geocoded address
                    // gave one) wins over the code→name table — see
                    // $prevCountryName's own doc-comment for why.
                    $fromCountryDisplay = $prevCountryName ?? AirLabs::countryName($prevCountry);
                    $toCountryDisplay = ($resolved['country_name'] ?? null) ?? AirLabs::countryName($resolved['country_code'] ?? null);
                    $decision = $flightInfo === null
                        ? $this->evaluateImplausibleDrive($rawTravel, $choice, $airlabsApiKey, $event['start'], $prevLabel, $resolved['display_name'], $fromCountryDisplay, $toCountryDisplay)
                        : null;

                    if ($decision !== null && $decision['needsTravelDecision'] !== null) {
                        $needsTravelDecision = $decision['needsTravelDecision'];
                    } else {
                        $arriveAt = (new DateTimeImmutable($flightDepAnchor))->modify("-{$effectiveArrivalBufferMinutes} minutes");
                        $departAt = $arriveAt->modify('-' . (int)round($rawTravel['duration_min'] * 60) . ' seconds');
                        $travel = $rawTravel + [
                            'departureTime' => $departAt->format(DATE_ATOM),
                            'arrivalTime' => $arriveAt->format(DATE_ATOM),
                            'fromLabel' => $prevLabel,
                            'toLabel' => $resolved['display_name'],
                            'isLastLeg' => false,
                            'isFlightLeg' => $flightInfo !== null,
                            'isTrainLeg' => ($decision['chosenMode'] ?? null) === 'training' || self::detectTrain($event),
                        ];
                    }
                } else {
                    // Same fallback Android shows: a real leg exists (there is
                    // a previous stop to travel from) but this event's own
                    // address can't be resolved, so there's nothing to route
                    // to — "Reistijd onbekend" rather than silently no card.
                    $travelUnknown = ['toLabel' => $event['title']];
                }
            }

            if (!$notAttended && $prevEnd !== null && $travel !== null && $flightInfo === null) {
                // Gap/too-tight-travel detection is about ordinary
                // appointments; a flight already gets its own
                // "aankomst/instap"-style buffer above, and reusing the
                // generic gap logic on top of that would just double up.
                $mustLeaveBy = (new DateTimeImmutable($event['start']))
                    ->modify('-' . (int)ceil($travel['duration_min']) . ' minutes');
                $freeMinutes = ($mustLeaveBy->getTimestamp() - (new DateTimeImmutable($prevEnd))->getTimestamp()) / 60;
                $gapStartsAtHome = $base !== null && $prevLocation !== null && self::isSameLocation($prevLocation, $base);

                if ($freeMinutes >= $gapThresholdMinutes && !$gapStartsAtHome) {
                    $gap = [
                        'minutes' => (int)round($freeMinutes),
                        'fromLabel' => $prevLabel,
                        'toLabel' => $resolved['display_name'] ?? $event['title'],
                        'lat' => $prevLocation['lat'],
                        'lon' => $prevLocation['lon'],
                    ];
                } elseif ($freeMinutes < 0) {
                    $travelWarning = [
                        'shortByMinutes' => (int)ceil(-$freeMinutes),
                    ];
                }
            }

            // For a flight with a real travel leg, the leg and the
            // "check-in & security" wait get their own standalone cards
            // (same pattern as the return-home travel card) instead of
            // being embedded in the appointment's own item — mirrors how
            // an airport trip actually breaks into separate stages.
            if ($flightInfo !== null && $travel !== null) {
                $items[] = [
                    'event' => null,
                    'resolvedLocation' => $resolved,
                    'needsAddress' => false,
                    'unresolvedLocationText' => null,
                    'isAtHome' => false,
                    'travel' => $travel,
                    'travelUnknown' => null,
                    'sameLocation' => false,
                    'gapBefore' => null,
                    'travelWarning' => $travelWarning,
                    'flightInfo' => null,
                    'checkIn' => null,
                    'departureBufferMinutes' => $departureBufferMinutes,
                    'arrivalBufferMinutes' => $arrivalBufferMinutes,
                    'isReturnHome' => false,
                    'isHomeStart' => false,
                    'isHomeEnd' => false,
                    'isFootball' => false,
                    'isTvSeries' => false,
                    'liveFlight' => null,
                    'scheduledFlight' => null,
                    'needsTravelDecision' => null,
                    'bookingNumber' => null,
                    'legKey' => $event['id'],
                    'arrivalWindow' => null,
                    'needsAccommodation' => null,
                    'needsTransferDecision' => null,
                    'needsTransferFlight' => null,
                    'baseChange' => null,
                ];
                $items[] = [
                    'event' => null,
                    'resolvedLocation' => null,
                    'needsAddress' => false,
                    'unresolvedLocationText' => null,
                    'isAtHome' => false,
                    'travel' => null,
                    'travelUnknown' => null,
                    'sameLocation' => false,
                    'gapBefore' => null,
                    'travelWarning' => null,
                    'flightInfo' => null,
                    'checkIn' => [
                        'start' => $travel['arrivalTime'],
                        'end' => $flightDepAnchor,
                        'airportName' => $resolved['display_name'] ?? $flightInfo['route'],
                    ],
                    'departureBufferMinutes' => $departureBufferMinutes,
                    'arrivalBufferMinutes' => $arrivalBufferMinutes,
                    'isReturnHome' => false,
                    'isHomeStart' => false,
                    'isHomeEnd' => false,
                    'isFootball' => false,
                    'isTvSeries' => false,
                    'liveFlight' => null,
                    'scheduledFlight' => null,
                    'needsTravelDecision' => null,
                    'bookingNumber' => null,
                    'legKey' => $event['id'],
                    'arrivalWindow' => null,
                    'needsAccommodation' => null,
                    'needsTransferDecision' => null,
                    'needsTransferFlight' => null,
                    'baseChange' => null,
                ];
                $travel = null; // already shown as its own card above
            }

            $items[] = [
                'event' => $event,
                'resolvedLocation' => $resolved,
                'needsAddress' => $needsAddress,
                'unresolvedLocationText' => $unresolvedLocationText,
                'isAtHome' => $isAtHome,
                'travel' => $travel,
                'travelUnknown' => $travelUnknown,
                'sameLocation' => $sameLocation,
                'gapBefore' => $gap,
                'travelWarning' => $flightInfo !== null ? null : $travelWarning,
                'flightInfo' => $flightInfo,
                'checkIn' => null,
                'departureBufferMinutes' => $departureBufferMinutes,
                'arrivalBufferMinutes' => $arrivalBufferMinutes,
                'isReturnHome' => false,
                'isHomeStart' => false,
                'isHomeEnd' => false,
                'isFootball' => $isAtHome && self::detectFootball($event),
                'isTvSeries' => $isAtHome && self::detectTvSeries($event),
                'liveFlight' => $liveFlight,
                'scheduledFlight' => $scheduledFlight,
                'needsTravelDecision' => $needsTravelDecision,
                'bookingNumber' => $choice?->getBookingNumber(),
                'legKey' => $event['id'],
                'arrivalWindow' => $arrivalWindow,
                'needsAccommodation' => $needsAccommodationForFlight,
                'needsTransferDecision' => $needsTransferDecision,
                'needsTransferFlight' => $needsTransferFlight,
                'baseChange' => $baseChangeForThisEvent,
            ];

            // After a flight, the rest of the day continues from the
            // ARRIVAL airport, not the departure one $resolved points to —
            // and only when we actually know where that is (real dep/arr
            // data), otherwise fall back to whatever $resolved already gave.
            // ($arrivalOverride/$arrIataForOverride were already resolved
            // earlier, right after $resolved, so the transfer/staying
            // question above could use them too — no need to look the
            // airport up a second time here.)
            if (!$skipTravel && $arrivalOverride !== null) {
                $prevLocation = $arrivalOverride;
                $prevLabel = $arrivalOverride['display_name'];
                $prevCountry = $flightTimes['arrCountry'] ?? $arrivalOverride['countryCode'] ?? null;
                // Overpass::findAirportByIata() already falls back to a
                // Nominatim reverse-geocode (with its own real country name)
                // whenever the airport's own OSM entry has no addr:country
                // tag — use that name when present rather than guessing from
                // the code→name table a second time.
                $prevCountryName = $arrivalOverride['countryName'] ?? null;
                // The moment a flight actually lands, "Thuis" promotes to
                // the temp home for the REST of today (any events later
                // today, and the day's own closing leg) — see
                // $tempHomeAppliesAtStart's doc-comment for why this can't
                // just apply from the top of the day instead.
                if ($tempHome !== null) {
                    $base = $tempHome;
                    $baseLabel = $tempHome['display_name'];
                    if (!$tempHomeAppliesAtStart && !$basePromotedInline) {
                        // The trip base doesn't just silently BECOME the
                        // airport-to-hotel — that's a real taxi/car leg with
                        // a real travel time, exactly like any other leg
                        // today, so it gets its own computed travel card
                        // rather than a bare label change. Departs once
                        // arrival processing (passport control etc.) is
                        // done; $prevLocation/$prevEnd land at the HOTEL
                        // afterwards so the next appointment measures its
                        // own distance from there, not from the airport.
                        $hotelRoute = $this->osrm->route($arrivalOverride['lat'], $arrivalOverride['lon'], $tempHome['lat'], $tempHome['lon'], $profile);
                        $hotelDepartAt = (new DateTimeImmutable($flightArrAnchor))->modify("+{$arrivalProcessingMinutes} minutes");
                        $hotelArriveAt = $hotelDepartAt->modify('+' . (int)round($hotelRoute['duration_min'] * 60) . ' seconds');
                        $items[] = [
                            'event' => null,
                            'resolvedLocation' => $tempHome,
                            'needsAddress' => false,
                            'unresolvedLocationText' => null,
                            'isAtHome' => false,
                            'travel' => $hotelRoute + [
                                'departureTime' => $hotelDepartAt->format(DATE_ATOM),
                                'arrivalTime' => $hotelArriveAt->format(DATE_ATOM),
                                'fromLabel' => $arrivalOverride['display_name'],
                                'toLabel' => $tempHome['display_name'],
                                'isLastLeg' => false,
                                'isFlightLeg' => false,
                                'isTrainLeg' => false,
                            ],
                            'travelUnknown' => null,
                            'sameLocation' => false,
                            'gapBefore' => null,
                            'travelWarning' => null,
                            'flightInfo' => null,
                            'checkIn' => null,
                            'departureBufferMinutes' => $departureBufferMinutes,
                            'arrivalBufferMinutes' => $arrivalBufferMinutes,
                            'isReturnHome' => false,
                            'isHomeStart' => false,
                            'isHomeEnd' => false,
                            'isFootball' => false,
                            'isTvSeries' => false,
                            'liveFlight' => null,
                            'scheduledFlight' => null,
                            'needsTravelDecision' => null,
                            'bookingNumber' => null,
                            'legKey' => $event['id'] . '-to-base',
                            'arrivalWindow' => null,
                            'needsAccommodation' => null,
                            'needsTransferDecision' => null,
                            'needsTransferFlight' => null,
                            'baseChange' => null,
                        ];
                        $prevLocation = $tempHome;
                        $prevLabel = $tempHome['display_name'];
                        $prevCountry = $baseCountry;
                        $prevCountryName = null;
                        $prevEnd = $hotelArriveAt->format(DATE_ATOM);
                        $prevEndOverridden = true;
                        $pendingBaseChange = ['label' => $tempHome['display_name'], 'lat' => $tempHome['lat'], 'lon' => $tempHome['lon']];
                        $basePromotedInline = true;
                    }
                }
            } elseif (!$skipTravel && $flightInfo !== null && $tempHome !== null) {
                // The arrival airport itself couldn't be resolved this time
                // (e.g. a transient Overpass "server busy" response) but the
                // user has already told us where they're staying — falling
                // through to $resolved (always null for a flight, which has
                // no location field) would leave $prevLocation stuck at
                // $base/$home, and the day's closing check further down
                // would then misread that as "already back home" and
                // silently delete the just-chosen hotel before the user ever
                // saw it survive a reload. Promote straight to $tempHome
                // instead; the precise computed airport-to-hotel leg is
                // skipped just this once, but the hotel choice itself
                // survives.
                $base = $tempHome;
                $baseLabel = $tempHome['display_name'];
                $prevLocation = $tempHome;
                $prevLabel = $tempHome['display_name'];
                $prevCountry = $baseCountry;
                $prevCountryName = null;
            } elseif (!$skipTravel && $resolved !== null) {
                $prevLocation = $resolved;
                $prevLabel = $resolved['display_name'];
                $prevCountry = $resolved['country_code'] ?? null;
                $prevCountryName = $resolved['country_name'] ?? null;
            }
            if (!$skipTravel) {
                // Likewise: a flight's real landing time (once known) is
                // what the rest of the day actually continues from, not the
                // calendar entry's own (often placeholder) end time.
                // $flightArrAnchor is already a real, unambiguous UTC-
                // tagged instant (see toUtcInstant()) — every comparison
                // against it elsewhere uses ->getTimestamp(), which is
                // timezone-agnostic, so no further re-projection into any
                // particular wall-clock is needed here.
                if (!$prevEndOverridden) {
                    $prevEnd = $flightInfo !== null ? $flightArrAnchor : $event['end'];
                }
            }
        }

        // Closes the timeline with a trip back to today's base after the
        // last stop — ONLY when that's actually a plausible car trip.
        // Auto-generating this leg (or even ASKING how you're getting back)
        // every single day bakes in "today ends where it started" as a
        // default, which is false both abroad AND on a domestic road trip
        // where no two nights are in the same place. So when the base isn't
        // reachable by car from where the day actually ended, this doesn't
        // silently assume anything — it asks where tonight's stay is, and
        // that answer (via the accommodation endpoint) becomes the base the
        // NEXT day's plan starts from. Once a real return flight is on some
        // later day's calendar (e.g. via "Enter return flight"), DayPlanner's
        // normal per-event flight handling picks it up on THAT day instead.
        // Deliberately the RAW $tempHome here, not $base — $tempHomeAppliesAtStart
        // exists to stop a temp home decided TODAY from retroactively becoming
        // this MORNING's anchor (see its own doc-comment above), but that
        // concern doesn't apply to closing the day out: once a hotel is
        // picked for tonight, tonight's own plan must end there immediately,
        // not "from tomorrow onward." Without this, choosing a hotel here and
        // reloading the same day recomputed the return trip against the real
        // home again (still implausible) and asked the same question again —
        // the exact bug reported live ("kies ik een hotel en refresh ik, dan
        // moet ik weer een hotel kiezen").
        $closingBase = $tempHome ?? $base;
        $closingBaseLabel = $tempHome !== null ? $tempHome['display_name'] : $baseLabel;
        // Also gated on $tempHomeAppliesAtStart (i.e. never on the very day
        // the temp home was just decided): on that first day $prevLocation
        // can end up EQUAL to $home not because the user is actually back,
        // but simply because nothing this loop resolved ever moved it away
        // from its own starting value (e.g. a transient Overpass hiccup
        // failing to resolve the arrival airport, so the mid-loop promotion
        // above never ran) — a false positive that silently deleted the
        // just-chosen hotel before the user ever saw it survive a reload.
        // From the next day onward $prevLocation only reaches $home via a
        // real, resolved leg, so the check is trustworthy there.
        if ($tempHomeAppliesAtStart && $tempHome !== null && $home !== null && $prevLocation !== null && self::isSameLocation($prevLocation, $home)) {
            // The day's last real stop is back at the real home — whatever
            // temporary base an earlier leg of the trip set no longer
            // applies, subsequent days should anchor on the real home again.
            $clearTempHome = true;
            $closingBase = $home;
            $closingBaseLabel = 'Thuis';
        }

        if ($events !== [] && $prevLocation !== null && $closingBase !== null && !self::isSameLocation($prevLocation, $closingBase)) {
            $rawTravel = $this->osrm->route($prevLocation['lat'], $prevLocation['lon'], $closingBase['lat'], $closingBase['lon'], $profile);
            // Same distance-only test as evaluateImplausibleDrive() — see its
            // doc-comment for why this can't be gated on estimated alone.
            $isImplausibleReturn = $rawTravel['distance_km'] > self::IMPLAUSIBLE_DRIVE_KM;

            if (!$isImplausibleReturn) {
                $departAt = new DateTimeImmutable((string)$prevEnd);
                $arriveAt = $departAt->modify('+' . (int)round($rawTravel['duration_min'] * 60) . ' seconds');

                $items[] = [
                    'event' => null,
                    'resolvedLocation' => null,
                    'needsAddress' => false,
                    'unresolvedLocationText' => null,
                    'isAtHome' => false,
                    'travel' => $rawTravel + [
                        'departureTime' => $departAt->format(DATE_ATOM),
                        'arrivalTime' => $arriveAt->format(DATE_ATOM),
                        'fromLabel' => $prevLabel,
                        'toLabel' => $closingBaseLabel,
                        'isLastLeg' => true,
                        'isFlightLeg' => false,
                        'isTrainLeg' => false,
                    ],
                    'travelUnknown' => null,
                    'sameLocation' => false,
                    'gapBefore' => null,
                    'travelWarning' => null,
                    'flightInfo' => null,
                    'checkIn' => null,
                    'departureBufferMinutes' => $departureBufferMinutes,
                    'arrivalBufferMinutes' => $arrivalBufferMinutes,
                    'isReturnHome' => true,
                    'isHomeStart' => false,
                    'isHomeEnd' => false,
                    'isFootball' => false,
                    'isTvSeries' => false,
                    'liveFlight' => null,
                    'scheduledFlight' => null,
                    'needsTravelDecision' => null,
                    'bookingNumber' => null,
                    'legKey' => 'return-home',
                    'arrivalWindow' => null,
                    'needsAccommodation' => null,
                    'needsTransferDecision' => null,
                    'needsTransferFlight' => null,
                    'baseChange' => null,
                ];
                $items[] = self::waypointItem($closingBase, $closingBaseLabel, isHomeStart: false, isHomeEnd: true);
            } elseif (!$hadFlightToday) {
                // Can't plausibly get back to today's base — a road-trip leg
                // too far to double back on same-day (a flight abroad is
                // already handled by that flight's own transfer/staying
                // question above, so this only fires for a pure driving
                // day). Ask where tonight's stay is instead of assuming
                // anything; the answer replaces the base for subsequent days.
                $items[] = [
                    'event' => null,
                    'resolvedLocation' => null,
                    'needsAddress' => false,
                    'unresolvedLocationText' => null,
                    'isAtHome' => false,
                    'travel' => null,
                    'travelUnknown' => null,
                    'sameLocation' => false,
                    'gapBefore' => null,
                    'travelWarning' => null,
                    'flightInfo' => null,
                    'checkIn' => null,
                    'departureBufferMinutes' => $departureBufferMinutes,
                    'arrivalBufferMinutes' => $arrivalBufferMinutes,
                    'isReturnHome' => false,
                    'isHomeStart' => false,
                    'isHomeEnd' => false,
                    'isFootball' => false,
                    'isTvSeries' => false,
                    'liveFlight' => null,
                    'scheduledFlight' => null,
                    'needsTravelDecision' => null,
                    'bookingNumber' => null,
                    'legKey' => 'overnight',
                    'arrivalWindow' => null,
                    'needsAccommodation' => [
                        'reason' => 'endOfDay',
                        'fromLabel' => $prevLabel,
                        'distanceKm' => (int)round($rawTravel['distance_km']),
                        'arrCountry' => $prevCountry,
                        'lat' => $prevLocation['lat'],
                        'lon' => $prevLocation['lon'],
                    ],
                    'needsTransferDecision' => null,
                    'needsTransferFlight' => null,
                    'baseChange' => null,
                ];
            }
        }

        return ['items' => $items, 'clearTempHome' => $clearTempHome, 'setTempHome' => $autoDetectedTempHome];
    }

    /** A "Huis" anchor node (start or end of day) — no travel/event data of its own. */
    private static function waypointItem(array $home, string $label, bool $isHomeStart = false, bool $isHomeEnd = false): array {
        return [
            'event' => null,
            'resolvedLocation' => ['lat' => $home['lat'], 'lon' => $home['lon'], 'display_name' => $label],
            'needsAddress' => false,
            'unresolvedLocationText' => null,
            'isAtHome' => true,
            'travel' => null,
            'travelUnknown' => null,
            'sameLocation' => false,
            'gapBefore' => null,
            'travelWarning' => null,
            'flightInfo' => null,
            'checkIn' => null,
            'departureBufferMinutes' => null,
            'arrivalBufferMinutes' => null,
            'isReturnHome' => false,
            'isHomeStart' => $isHomeStart,
            'isHomeEnd' => $isHomeEnd,
            'baseChange' => null,
            'isFootball' => false,
            'isTvSeries' => false,
            'liveFlight' => null,
            'scheduledFlight' => null,
            'needsTravelDecision' => null,
            'bookingNumber' => null,
            'legKey' => null,
            'arrivalWindow' => null,
            'needsAccommodation' => null,
            'needsTransferDecision' => null,
            'needsTransferFlight' => null,
        ];
    }

    /**
     * @param array{location:?string,homeOverride:bool} $event
     * @param array{lat:float,lon:float}|null $base wherever the day's CURRENT base is — the temp home when active, else the real home; used ONLY for the calendar-level homeOverride flag (TV/fixture calendars: "this happens wherever you currently are", never a real trip)
     * @param array{lat:float,lon:float}|null $home the REAL permanent house — a literal "Thuis"/"Home" typed into an event's own location field is ALWAYS this: THUIS is THUIS (the actual address, e.g. a car service picking you up there), ACCOMMODATION (the temp base) is a separate concept that only applies while actually traveling
     * @return array{lat: float, lon: float, display_name: string, country_code?: ?string}|null
     */
    private function resolveLocation(array $event, ?array $base, string $baseLabel, ?string $baseCountry, ?array $home, ?string $homeCountry): ?array {
        if ($event['homeOverride'] && $base !== null) {
            return ['lat' => $base['lat'], 'lon' => $base['lon'], 'display_name' => $baseLabel, 'country_code' => $baseCountry];
        }
        $locationText = trim((string)($event['location'] ?? ''));
        if ($locationText === '') {
            return null;
        }
        $normalized = mb_strtolower($locationText);
        if (($normalized === 'home' || $normalized === 'thuis') && $home !== null) {
            return ['lat' => $home['lat'], 'lon' => $home['lon'], 'display_name' => 'Thuis', 'country_code' => $homeCountry];
        }
        return $this->geocoder->search($locationText);
    }

    /**
     * Free-tier flight awareness: no live delay/gate data or exact
     * schedule lookup (both need a real flight-data API — see the
     * project_pa_nextcloud_flight_tracking memory), just "this looks like
     * a flight" plus a rule-of-thumb departure time and (when a route was
     * found) resolving the departure airport for real routing.
     *
     * Two independent signals, either is enough:
     *  1. The literal word "vlucht"/"flight" appears anywhere.
     *  2. The WHOLE title is exactly two IATA-looking airport codes
     *     ("AMS SXM", "AMS -> SXM", "AMS-SXM", "AMS → SXM") — deliberately
     *     anchored to the full title (not "found anywhere in the text")
     *     and requires real uppercase, since a bare 3-letter-code pattern
     *     matches far too many unrelated things if allowed to appear
     *     loosely inside a longer, mixed-case string.
     *
     * @param array{title:string,start:string,description?:?string} $event
     * @return array{flightNumber: ?string, route: ?string, fromCode: ?string, suggestedDepartureTime: string}|null
     */
    private static function detectFlight(array $event): ?array {
        $title = trim($event['title']);
        $text = $title . ' ' . ($event['description'] ?? '');

        $hasKeyword = preg_match('/\b(vlucht|flight)\b/i', $text) === 1;
        // Same route-pattern AirLabs::parseRouteOrFlightNumber() uses for
        // AppointmentController's "route or flight number" field — shared
        // so the two never drift apart.
        $routeParse = AirLabs::parseRouteOrFlightNumber($title);
        $route = null;
        $fromCode = null;
        $toCode = null;
        if ($routeParse['depIata'] !== null) {
            $fromCode = $routeParse['depIata'];
            $toCode = $routeParse['arrIata'];
            $route = "{$fromCode} → {$toCode}";
        }

        if (!$hasKeyword && $route === null) {
            return null;
        }

        $flightNumber = null;
        if (preg_match('/\b([A-Z]{2}\s?\d{2,4})\b/', strtoupper($text), $m) === 1) {
            // Normalized (no space) — this is also the exact flight_iata
            // value AirLabs' /flight endpoint expects for the live lookup.
            $flightNumber = str_replace(' ', '', trim($m[1]));
        }

        // Static method, no access to the user's own configurable check-in
        // lead-time setting — this is only shown as a last-resort hint when
        // the airport's own location couldn't be resolved at all, so a flat
        // 2.5h rule-of-thumb here (rather than plumbing the setting through
        // just for this one fallback string) is good enough.
        $leaveBy = (new DateTimeImmutable($event['start']))->modify('-150 minutes');
        return [
            'flightNumber' => $flightNumber,
            'route' => $route,
            'fromCode' => $fromCode,
            'toCode' => $toCode,
            'suggestedDepartureTime' => $leaveBy->format(DATE_ATOM),
        ];
    }

    /**
     * "Thuis" appointments that are really a TV/screen thing rather than a
     * place you go to, only meaningful when the event is isAtHome. Primary
     * signal is the calendar itself — a fixtures/episode-tracker calendar
     * (e.g. an "icsfixtures"/"episodecalendarcom" ICS subscription) means
     * every event in it is that kind of thing, no title guessing needed —
     * with a keyword scan on title+description as a fallback for anyone
     * whose calendar is named differently.
     */
    private static function detectFootball(array $event): bool {
        if (stripos((string)$event['calendarUri'], 'fixtures') !== false) {
            return true;
        }
        $text = $event['title'] . ' ' . ($event['description'] ?? '');
        return preg_match('/\b(voetbal|football|wedstrijd|competitie)\b/i', $text) === 1;
    }

    /** "car-card" vs "train-card": same loose keyword idea as detectFlight(), scoped to the destination event being traveled to. */
    private static function detectTrain(array $event): bool {
        $text = $event['title'] . ' ' . ($event['description'] ?? '');
        return preg_match('/\b(trein|train|ns\.nl|ic\s?\d|intercity)\b/i', $text) === 1;
    }

    private static function detectTvSeries(array $event): bool {
        if (stripos((string)$event['calendarUri'], 'episode') !== false || stripos((string)$event['calendarUri'], 'series') !== false) {
            return true;
        }
        $text = $event['title'] . ' ' . ($event['description'] ?? '');
        return preg_match('/\b(serie|series|aflevering|episode|seizoen|season)\b/i', $text) === 1;
    }

    /**
     * A later flight the same day is an unambiguous connecting leg — no
     * need to ask "transfer or staying" when the calendar already answers
     * it. $events is ascending by start, so anything after $afterIndex is
     * chronologically later today.
     *
     * @param array<int, array{title:string,start:string,description?:?string}> $events
     */
    private static function findFollowingFlight(array $events, int $afterIndex): ?array {
        for ($i = $afterIndex + 1, $count = count($events); $i < $count; $i++) {
            if (self::detectFlight($events[$i]) !== null) {
                return $events[$i];
            }
        }
        return null;
    }

    /**
     * A "Hotel ..."-style appointment later the same day tells us exactly
     * where the user is staying, without asking — same lookahead as
     * findFollowingFlight().
     *
     * @param array<int, array{title:string,location:?string,description?:?string}> $events
     */
    private static function findFollowingAccommodation(array $events, int $afterIndex): ?array {
        for ($i = $afterIndex + 1, $count = count($events); $i < $count; $i++) {
            if (self::detectAccommodation($events[$i])) {
                return $events[$i];
            }
        }
        return null;
    }

    private static function detectAccommodation(array $event): bool {
        $text = $event['title'] . ' ' . ($event['description'] ?? '');
        return preg_match('/\b(hotel|resort|guesthouse|guest house|hostel|airbnb|b&b|overnachting|verblijf|accommodation)\b/i', $text) === 1;
    }

    /** ~50m tolerance — close enough to call it "the same place" (geocoding jitter). */
    private static function isSameLocation(array $a, array $b): bool {
        return abs($a['lat'] - $b['lat']) < 0.0005 && abs($a['lon'] - $b['lon']) < 0.0005;
    }

    /**
     * Shared by both the per-event travel-building loop AND the final
     * return-home leg — an implausible car route (OSRM had to fall back to
     * its own straight-line estimate, and the distance is well beyond a
     * normal domestic drive) means the "route" actually crosses somewhere
     * a car can't go, most often an ocean between two countries. Missing
     * this on the return-home leg specifically was the exact bug reported:
     * "how am I supposed to drive home from Sint Maarten?" — that leg is
     * built in its own code path at the end of plan(), which never ran
     * this check before.
     *
     * @return array{needsTravelDecision: ?array, chosenMode: ?string}|null null = not an implausible drive, proceed with a normal route
     */
    private function evaluateImplausibleDrive(array $rawTravel, ?TravelChoice $choice, string $airlabsApiKey, string $eventStartIso, string $fromLabel, string $toLabel, ?string $fromCountryName = null, ?string $toCountryName = null): ?array {
        // Distance alone decides this, regardless of OSRM's own "estimated"
        // flag — the public demo server sometimes stitches together
        // ferry-tagged OSM ways into a technically-real (non-estimated)
        // route across an ocean that's just as impractical as a haversine
        // fallback would have been (e.g. a "27h19min" SXM→NL "drive").
        // Gating this on estimated-only let exactly that kind of route
        // through silently.
        if ($rawTravel['distance_km'] <= self::IMPLAUSIBLE_DRIVE_KM) {
            return null;
        }

        // $fromCountryName/$toCountryName arrive pre-resolved (Nominatim's
        // own name preferred over a code→name table guess — see the call
        // site) — used for "we see you're in X, your next appointment is in
        // Y" framing. Null when either side's country isn't known; the
        // frontend just omits the intro sentence in that case.
        $chosenMode = $choice?->getTravelMode();
        if ($chosenMode === null) {
            return [
                'needsTravelDecision' => [
                    'fromLabel' => $fromLabel,
                    'toLabel' => $toLabel,
                    'distanceKm' => (int)round($rawTravel['distance_km']),
                    'chosenMode' => null,
                    'flightNumber' => null,
                    'flightLookup' => null,
                    'fromCountryName' => $fromCountryName,
                    'toCountryName' => $toCountryName,
                ],
                'chosenMode' => null,
            ];
        }

        if ($chosenMode === 'flying') {
            $declaredFlightNumber = $choice->getFlightNumber();
            $flightLookup = ($declaredFlightNumber !== null && $airlabsApiKey !== '')
                ? ($this->airLabs->lookupFlight($airlabsApiKey, $declaredFlightNumber, $eventStartIso)
                    ?? $this->airLabs->lookupSchedule($airlabsApiKey, null, null, $declaredFlightNumber, $eventStartIso))
                : null;
            return [
                'needsTravelDecision' => [
                    'fromLabel' => $fromLabel,
                    'toLabel' => $toLabel,
                    'distanceKm' => (int)round($rawTravel['distance_km']),
                    'chosenMode' => 'flying',
                    'flightNumber' => $declaredFlightNumber,
                    'flightLookup' => $flightLookup,
                    'fromCountryName' => $fromCountryName,
                    'toCountryName' => $toCountryName,
                ],
                'chosenMode' => 'flying',
            ];
        }

        // 'driving' or 'training' explicitly chosen despite the implausible
        // distance (e.g. a long ferry-inclusive drive) — proceed with the
        // normal route rather than blocking on it forever.
        return ['needsTravelDecision' => null, 'chosenMode' => $chosenMode];
    }
}
