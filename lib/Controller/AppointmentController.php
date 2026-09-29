<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Controller;

use DateTimeImmutable;
use DateTimeZone;
use Exception;
use OCA\PersonalAssistant\Db\Link;
use OCA\PersonalAssistant\Db\LinkMapper;
use OCA\PersonalAssistant\Db\TravelChoiceMapper;
use OCA\PersonalAssistant\Travel\AirLabs;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\Calendar\Exceptions\CalendarException;
use OCP\Calendar\ICalendarIsWritable;
use OCP\Calendar\ICreateFromString;
use OCP\Calendar\IManager;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IUserSession;
use RuntimeException;
use Throwable;

/**
 * "Afspraak" from the "+"-button writes a REAL calendar event — same as the
 * Android app's addCalendarAppointment(), just server-side via
 * ICalendarEventBuilder instead of Android's CalendarProvider insert.
 */
class AppointmentController extends Controller {
    private const APP_ID = 'personalassistant';

    public function __construct(
        string $appName,
        IRequest $request,
        private IManager $calendarManager,
        private IUserSession $userSession,
        private AirLabs $airLabs,
        private IConfig $config,
        private TravelChoiceMapper $travelChoiceMapper,
        private LinkMapper $linkMapper,
        private IDBConnection $db,
    ) {
        parent::__construct($appName, $request);
    }

    /** Calendars the current user can actually write a new event into. */
    #[NoAdminRequired]
    public function writableCalendars(): DataResponse {
        $userId = $this->requireUserId();
        $principalUri = 'principals/users/' . $userId;

        $calendars = [];
        foreach ($this->calendarManager->getCalendarsForPrincipal($principalUri) as $calendar) {
            $writable = !($calendar instanceof ICalendarIsWritable) || $calendar->isWritable();
            if ($calendar instanceof ICreateFromString && $writable) {
                $calendars[] = [
                    'uri' => $calendar->getUri(),
                    'name' => $calendar->getDisplayName() ?? $calendar->getUri(),
                    'color' => $calendar->getDisplayColor(),
                ];
            }
        }

        return new DataResponse(['calendars' => $calendars]);
    }

    #[NoAdminRequired]
    public function create(): DataResponse {
        $userId = $this->requireUserId();
        $principalUri = 'principals/users/' . $userId;
        $body = $this->request->getParams();

        $calendarUri = (string)($body['calendarUri'] ?? '');
        $title = trim((string)($body['title'] ?? ''));
        $startRaw = (string)($body['start'] ?? '');
        $endRaw = (string)($body['end'] ?? '');
        $description = trim((string)($body['description'] ?? ''));

        if ($calendarUri === '' || $title === '' || $startRaw === '' || $endRaw === '') {
            return new DataResponse(['error' => 'calendarUri, title, start and end are required'], 400);
        }

        $timezone = new DateTimeZone('Europe/Amsterdam');
        try {
            $start = new DateTimeImmutable($startRaw, $timezone);
            $end = new DateTimeImmutable($endRaw, $timezone);
        } catch (Exception) {
            return new DataResponse(['error' => 'invalid start/end'], 400);
        }

        $calendar = null;
        foreach ($this->calendarManager->getCalendarsForPrincipal($principalUri, [$calendarUri]) as $candidate) {
            if ($candidate instanceof ICreateFromString) {
                $calendar = $candidate;
                break;
            }
        }
        if ($calendar === null) {
            return new DataResponse(['error' => 'calendar not found or not writable'], 404);
        }

        $builder = $this->calendarManager->createEventBuilder()
            ->setStartDate($start)
            ->setEndDate($end)
            ->setSummary($title);
        if ($description !== '') {
            $builder->setDescription($description);
        }

        try {
            $filename = $builder->createInCalendar($calendar);
        } catch (CalendarException $e) {
            return new DataResponse(['error' => 'could not create event: ' . $e->getMessage()], 500);
        }

        return new DataResponse(['ok' => true, 'filename' => $filename], 201);
    }

    /**
     * "Enter return flight" — the user gives a route ("SXM AMS") or flight
     * number and a date; this looks it up via AirLabs (same three-tier
     * chain as DayPlanner, though a return flight booked far ahead will
     * realistically only ever hit the static /routes schedule tier) and
     * writes a real calendar event with the route as its title, so it
     * round-trips correctly through DayPlanner::detectFlight() the next
     * time this day's timeline is planned.
     */
    #[NoAdminRequired]
    public function createFlight(): DataResponse {
        $userId = $this->requireUserId();
        $principalUri = 'principals/users/' . $userId;
        $body = $this->request->getParams();

        $calendarUri = (string)($body['calendarUri'] ?? '');
        $routeOrNumber = strtoupper(trim((string)($body['routeOrNumber'] ?? '')));
        $dateStr = trim((string)($body['date'] ?? ''));
        // Set when this flight was entered from the "aansluitende vlucht"
        // (connecting flight) prompt with "geen nieuwe incheck nodig"
        // checked — an airside transfer skips the full international
        // check-in buffer entirely, so this leg gets a short, fixed lead
        // time instead of the user's own (much longer) Settings default.
        $skipCheckin = !empty($body['skipCheckin']);
        if ($calendarUri === '' || $routeOrNumber === '' || $dateStr === '') {
            return new DataResponse(['error' => 'calendarUri, routeOrNumber and date are required'], 400);
        }

        $apiKey = $this->config->getUserValue($userId, self::APP_ID, 'airlabs_api_key', '');
        if ($apiKey === '') {
            return new DataResponse(['error' => 'Geen AirLabs API-key ingesteld — zie Instellingen → Vlucht-info'], 400);
        }

        ['depIata' => $depIata, 'arrIata' => $arrIata, 'flightNumber' => $flightNumber] = AirLabs::parseRouteOrFlightNumber($routeOrNumber);

        $anchorIso = $dateStr . 'T12:00:00';
        $resolved = $this->airLabs->resolveFlightTimes($apiKey, $flightNumber, $depIata, $arrIata, $anchorIso);
        $flightTimes = $resolved['live'] ?? $resolved['scheduled'];
        if ($flightTimes === null) {
            return new DataResponse(['error' => 'Vlucht niet gevonden'], 404);
        }

        $depInstant = AirLabs::toUtcInstant($flightTimes['depEstimated'] ?? $flightTimes['depTime'], $flightTimes['depOffsetMinutes'] ?? null);
        $arrInstant = AirLabs::toUtcInstant($flightTimes['arrEstimated'] ?? $flightTimes['arrTime'], $flightTimes['arrOffsetMinutes'] ?? null);

        $calendar = null;
        foreach ($this->calendarManager->getCalendarsForPrincipal($principalUri, [$calendarUri]) as $candidate) {
            if ($candidate instanceof ICreateFromString) {
                $calendar = $candidate;
                break;
            }
        }
        if ($calendar === null) {
            return new DataResponse(['error' => 'calendar not found or not writable'], 404);
        }

        $title = $depIata !== null && $arrIata !== null
            ? "$depIata $arrIata"
            : (string)($flightTimes['flightNumber'] ?? $flightNumber ?? $routeOrNumber);
        $builder = $this->calendarManager->createEventBuilder()
            ->setStartDate($depInstant)
            ->setEndDate($arrInstant)
            ->setSummary($title);

        try {
            $filename = $builder->createInCalendar($calendar);
        } catch (CalendarException $e) {
            return new DataResponse(['error' => 'could not create event: ' . $e->getMessage()], 500);
        }

        if ($skipCheckin) {
            // Nextcloud's DAV backend names the object file after its own
            // iCal UID — the same UID DayPlanner later reads back as this
            // event's legKey — so this is the only way to attach a
            // check-in override to a leg whose UID doesn't exist until
            // createInCalendar() has already run.
            $uid = preg_replace('/\.ics$/i', '', basename($filename)) ?? '';
            if ($uid !== '') {
                $this->travelChoiceMapper->upsert($userId, $uid, $dateStr, ['checkinLeadMinutes' => 15]);
            }
        }

        return new DataResponse(['ok' => true, 'filename' => $filename], 201);
    }

    /**
     * "Taak toevoegen" → Tasks (a VTODO written straight into a calendar)
     * as the alternative to a Deck card — OCP\Calendar\IManager only offers
     * createEventBuilder() (VEVENT-only), so this writes the VTODO's raw
     * iCalendar block itself and hands it to the SAME ICreateFromString
     * write path create()/createFlight() already use; CalDAV calendar
     * collections natively mix VEVENT/VTODO/VJOURNAL objects (RFC 4791), so
     * no event-specific builder is actually required for this to work.
     */
    #[NoAdminRequired]
    public function createTask(): DataResponse {
        $userId = $this->requireUserId();
        $principalUri = 'principals/users/' . $userId;
        $body = $this->request->getParams();

        $calendarUri = (string)($body['calendarUri'] ?? '');
        $title = trim((string)($body['title'] ?? ''));
        if ($calendarUri === '' || $title === '') {
            return new DataResponse(['error' => 'calendarUri and title are required'], 400);
        }

        $calendar = null;
        foreach ($this->calendarManager->getCalendarsForPrincipal($principalUri, [$calendarUri]) as $candidate) {
            if ($candidate instanceof ICreateFromString) {
                $calendar = $candidate;
                break;
            }
        }
        if ($calendar === null) {
            return new DataResponse(['error' => 'calendar not found or not writable'], 404);
        }

        $uid = bin2hex(random_bytes(16));
        $now = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Ymd\THis\Z');
        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//PersonalAssistant//EN',
            'BEGIN:VTODO',
            "UID:$uid",
            "DTSTAMP:$now",
            'SUMMARY:' . self::escapeIcsText($title),
            'STATUS:NEEDS-ACTION',
        ];
        $dueRaw = trim((string)($body['due'] ?? ''));
        if ($dueRaw !== '') {
            try {
                $due = (new DateTimeImmutable($dueRaw, new DateTimeZone('Europe/Amsterdam')))->setTimezone(new DateTimeZone('UTC'));
                $lines[] = 'DUE:' . $due->format('Ymd\THis\Z');
            } catch (Exception) {
                // an unparseable due date just gets skipped, not worth failing the whole task over
            }
        }
        $lines[] = 'END:VTODO';
        $lines[] = 'END:VCALENDAR';

        try {
            $calendar->createFromString("$uid.ics", implode("\r\n", $lines) . "\r\n");
        } catch (CalendarException $e) {
            return new DataResponse(['error' => 'could not create task: ' . $e->getMessage()], 500);
        }

        // Linking happens server-side, in the SAME request that just wrote
        // the VTODO — hardens the earlier two-step (create task, then a
        // SEPARATE frontend call to link it) flow, which could leave an
        // orphaned task if that second request failed. The VTODO write
        // itself (CalDAV/file storage) can't share a transaction with our
        // own DB, but the link row(s) — possibly several, one per linked
        // contact — are at least atomic among themselves, and there's now
        // only one network round-trip that can fail instead of two.
        $contacts = self::parseContacts($body);
        if ($contacts !== []) {
            $now2 = time();
            $this->db->beginTransaction();
            try {
                foreach ($contacts as $contact) {
                    $link = new Link();
                    $link->setUserId($userId);
                    $link->setContactAddressbook($contact['addressbook']);
                    $link->setContactUri($contact['uri']);
                    $link->setContactDisplayName($contact['displayName']);
                    $link->setLinkType(Link::TYPE_TASK);
                    $link->setLinkRef($uid);
                    $link->setCalendarUri($calendarUri);
                    $link->setTitle($title);
                    $link->setOccurredAt($now2);
                    $link->setCreatedAt($now2);
                    $this->linkMapper->insert($link);
                }
                $this->db->commit();
            } catch (Throwable $e) {
                $this->db->rollBack();
                // The task itself is real and already saved — surface the
                // link failure distinctly rather than as a generic "could
                // not create task" (which would wrongly imply nothing was
                // created at all).
                return new DataResponse(['ok' => true, 'uid' => $uid, 'linkError' => $e->getMessage()], 201);
            }
        }

        return new DataResponse(['ok' => true, 'uid' => $uid], 201);
    }

    /** RFC 5545 §3.3.11 text escaping — the only special characters SUMMARY can contain unescaped-ly break the ICS parser. */
    private static function escapeIcsText(string $text): string {
        return str_replace(["\\", ',', ';', "\n"], ['\\\\', '\,', '\;', '\n'], $text);
    }

    /** Same shape/behaviour as NoteController::parseContacts() — kept as its own copy since the two controllers don't otherwise share a base. */
    private static function parseContacts(array $body): array {
        $contacts = [];
        if (isset($body['contacts']) && is_array($body['contacts'])) {
            foreach ($body['contacts'] as $c) {
                if (!is_array($c)) {
                    continue;
                }
                $addressbook = trim((string)($c['addressbook'] ?? ''));
                $uri = trim((string)($c['uri'] ?? ''));
                if ($addressbook === '' || $uri === '') {
                    continue;
                }
                $contacts[] = [
                    'addressbook' => $addressbook,
                    'uri' => $uri,
                    'displayName' => isset($c['displayName']) ? (string)$c['displayName'] : null,
                ];
            }
        }
        return $contacts;
    }

    private function requireUserId(): string {
        $user = $this->userSession->getUser();
        if ($user === null) {
            throw new RuntimeException('no user in session');
        }
        return $user->getUID();
    }
}
