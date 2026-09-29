<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Controller;

use OCA\PersonalAssistant\Travel\Geocoder;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\Calendar\IManager;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IUserSession;
use RuntimeException;

class SettingsController extends Controller {
    private const APP_ID = 'personalassistant';

    public function __construct(
        string $appName,
        IRequest $request,
        private IConfig $config,
        private IManager $calendarManager,
        private IUserSession $userSession,
        private Geocoder $geocoder,
    ) {
        parent::__construct($appName, $request);
    }

    #[NoAdminRequired]
    public function index(): DataResponse {
        $userId = $this->requireUserId();
        $principalUri = 'principals/users/' . $userId;

        $selected = $this->getJsonListOrNull($userId, 'selected_calendar_uris');
        $homeOverride = $this->getJsonListOrNull($userId, 'home_override_calendar_uris') ?? [];
        $allDayOffsets = $this->getAllDayDisplayOffsets($userId);

        $calendars = [];
        foreach ($this->calendarManager->getCalendarsForPrincipal($principalUri) as $calendar) {
            $uri = $calendar->getUri();
            $offset = $allDayOffsets[$uri] ?? null;
            $calendars[] = [
                'uri' => $uri,
                'name' => $calendar->getDisplayName() ?? $uri,
                'color' => $calendar->getDisplayColor(),
                // Never configured yet (selected === null) defaults to "everything counts",
                // matching this app's original (pre-settings) behaviour.
                'selected' => $selected === null || in_array($uri, $selected, true),
                'alwaysHome' => in_array($uri, $homeOverride, true),
                // Full-day items (e.g. a "TV-Episodes" calendar's daily release
                // marker) normally show as a full-day block — this lets the
                // user instead pin them to a specific clock time N days after
                // their own all-day date, e.g. "+1 day at 20:00" for a series
                // released the day before it's actually watched.
                'allDayDisplayDays' => $offset['days'] ?? null,
                'allDayDisplayTime' => $offset['time'] ?? null,
            ];
        }

        return new DataResponse([
            'calendars' => $calendars,
            'gapThresholdMinutes' => (int)$this->config->getUserValue($userId, self::APP_ID, 'gap_threshold_minutes', '90'),
            'departureBufferMinutes' => (int)$this->config->getUserValue($userId, self::APP_ID, 'departure_buffer_minutes', '5'),
            'arrivalBufferMinutes' => (int)$this->config->getUserValue($userId, self::APP_ID, 'arrival_buffer_minutes', '10'),
            'travelProfile' => $this->config->getUserValue($userId, self::APP_ID, 'travel_profile', 'driving'),
            'homeAddress' => $this->config->getUserValue($userId, self::APP_ID, 'home_address', ''),
            'homeResolved' => $this->config->getUserValue($userId, self::APP_ID, 'home_lat', '') !== '',
            'airlabsApiKey' => $this->config->getUserValue($userId, self::APP_ID, 'airlabs_api_key', ''),
            'checkinLeadMinutes' => (int)$this->config->getUserValue($userId, self::APP_ID, 'checkin_lead_minutes', '150'),
            'arrivalProcessingMinutes' => (int)$this->config->getUserValue($userId, self::APP_ID, 'arrival_processing_minutes', '60'),
        ]);
    }

    #[NoAdminRequired]
    public function update(): DataResponse {
        $userId = $this->requireUserId();
        $body = $this->request->getParams();

        if (array_key_exists('selectedCalendarUris', $body)) {
            $this->config->setUserValue($userId, self::APP_ID, 'selected_calendar_uris', json_encode(array_values((array)$body['selectedCalendarUris'])));
        }
        if (array_key_exists('homeOverrideCalendarUris', $body)) {
            $this->config->setUserValue($userId, self::APP_ID, 'home_override_calendar_uris', json_encode(array_values((array)$body['homeOverrideCalendarUris'])));
        }
        if (array_key_exists('allDayDisplayOffsets', $body) && is_array($body['allDayDisplayOffsets'])) {
            $clean = [];
            foreach ($body['allDayDisplayOffsets'] as $uri => $offset) {
                if (!is_array($offset)) {
                    continue;
                }
                $days = (int)($offset['days'] ?? 0);
                $time = (string)($offset['time'] ?? '');
                if (preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time) !== 1) {
                    continue;
                }
                $clean[(string)$uri] = ['days' => max(0, $days), 'time' => $time];
            }
            $this->config->setUserValue($userId, self::APP_ID, 'all_day_display_offsets', json_encode($clean));
        }
        if (array_key_exists('gapThresholdMinutes', $body)) {
            $this->config->setUserValue($userId, self::APP_ID, 'gap_threshold_minutes', (string)max(0, (int)$body['gapThresholdMinutes']));
        }
        if (array_key_exists('departureBufferMinutes', $body)) {
            $this->config->setUserValue($userId, self::APP_ID, 'departure_buffer_minutes', (string)max(0, (int)$body['departureBufferMinutes']));
        }
        if (array_key_exists('arrivalBufferMinutes', $body)) {
            $this->config->setUserValue($userId, self::APP_ID, 'arrival_buffer_minutes', (string)max(0, (int)$body['arrivalBufferMinutes']));
        }
        if (array_key_exists('travelProfile', $body)) {
            $profile = in_array($body['travelProfile'], ['driving', 'cycling', 'walking'], true) ? (string)$body['travelProfile'] : 'driving';
            $this->config->setUserValue($userId, self::APP_ID, 'travel_profile', $profile);
        }
        if (array_key_exists('homeAddress', $body)) {
            $address = trim((string)$body['homeAddress']);
            $this->config->setUserValue($userId, self::APP_ID, 'home_address', $address);
            if ($address !== '') {
                $resolved = $this->geocoder->search($address);
                if ($resolved !== null) {
                    $this->config->setUserValue($userId, self::APP_ID, 'home_lat', (string)$resolved['lat']);
                    $this->config->setUserValue($userId, self::APP_ID, 'home_lon', (string)$resolved['lon']);
                    // Display-only: lets a "why can't you drive there?" travel
                    // question name both countries ("we see you're in X, your
                    // next appointment is in Y") instead of just a km figure.
                    if (!empty($resolved['country_code'])) {
                        $this->config->setUserValue($userId, self::APP_ID, 'home_country', $resolved['country_code']);
                    }
                }
                // Fail-soft: a failed geocode keeps any previously resolved lat/lon rather than wiping it.
            } else {
                $this->config->deleteUserValue($userId, self::APP_ID, 'home_lat');
                $this->config->deleteUserValue($userId, self::APP_ID, 'home_lon');
                $this->config->deleteUserValue($userId, self::APP_ID, 'home_country');
            }
        }
        if (array_key_exists('airlabsApiKey', $body)) {
            $this->config->setUserValue($userId, self::APP_ID, 'airlabs_api_key', trim((string)$body['airlabsApiKey']));
        }
        if (array_key_exists('checkinLeadMinutes', $body)) {
            $minutes = (int)$body['checkinLeadMinutes'];
            // A 0 here is never a real, intended check-in lead time — it's
            // what an emptied number field coerces to (NcTextField/JS both
            // turn '' into 0, not null) — so treat it as "clear the
            // setting" rather than permanently pinning the default to zero.
            if ($minutes > 0) {
                $this->config->setUserValue($userId, self::APP_ID, 'checkin_lead_minutes', (string)$minutes);
            } else {
                $this->config->deleteUserValue($userId, self::APP_ID, 'checkin_lead_minutes');
            }
        }
        if (array_key_exists('arrivalProcessingMinutes', $body)) {
            $minutes = (int)$body['arrivalProcessingMinutes'];
            if ($minutes > 0) {
                $this->config->setUserValue($userId, self::APP_ID, 'arrival_processing_minutes', (string)$minutes);
            } else {
                $this->config->deleteUserValue($userId, self::APP_ID, 'arrival_processing_minutes');
            }
        }

        return new DataResponse(['ok' => true]);
    }

    /** @return array<string, array{days: int, time: string}> keyed by calendar uri */
    private function getAllDayDisplayOffsets(string $userId): array {
        $raw = $this->config->getUserValue($userId, self::APP_ID, 'all_day_display_offsets', '');
        if ($raw === '') {
            return [];
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    /** @return list<string>|null null = not configured yet -> caller should treat as "all" */
    private function getJsonListOrNull(string $userId, string $key): ?array {
        $raw = $this->config->getUserValue($userId, self::APP_ID, $key, '');
        if ($raw === '') {
            return null;
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? array_values($decoded) : null;
    }

    private function requireUserId(): string {
        $user = $this->userSession->getUser();
        if ($user === null) {
            throw new RuntimeException('no user in session');
        }
        return $user->getUID();
    }
}
