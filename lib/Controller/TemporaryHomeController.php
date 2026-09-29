<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Controller;

use OCA\PersonalAssistant\Travel\Geocoder;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IUserSession;
use RuntimeException;

/**
 * Backs the "where are you staying tonight?" prompt DayPlanner surfaces
 * whenever a day can't plausibly end back at the current base (a flight
 * abroad, or a road-trip leg too long to double back on same-day) — see
 * DayPlanner::plan()'s closing block. Whatever the user picks here becomes
 * the base every subsequent day's plan starts and ends at, until a later
 * answer replaces it or DayPlanner notices the user is back at the real
 * home and clears it automatically.
 */
class TemporaryHomeController extends Controller {
    private const APP_ID = 'personalassistant';

    public function __construct(
        string $appName,
        IRequest $request,
        private IConfig $config,
        private IUserSession $userSession,
        private Geocoder $geocoder,
    ) {
        parent::__construct($appName, $request);
    }

    /** Disambiguation candidates for a free-text place name ("Hilton") — an ISO country code (from a detected flight's arrival country) narrows Nominatim's otherwise-global search. */
    #[NoAdminRequired]
    public function search(): DataResponse {
        $query = trim((string)$this->request->getParam('query', ''));
        if ($query === '') {
            return new DataResponse(['candidates' => []]);
        }
        $countryCode = $this->request->getParam('countryCode');
        $countryCode = is_string($countryCode) && trim($countryCode) !== '' ? trim($countryCode) : null;

        return new DataResponse(['candidates' => $this->geocoder->searchCandidates($query, $countryCode)]);
    }

    #[NoAdminRequired]
    public function update(): DataResponse {
        $userId = $this->requireUserId();
        $body = $this->request->getParams();

        $displayName = trim((string)($body['displayName'] ?? ''));
        $lat = $body['lat'] ?? null;
        $lon = $body['lon'] ?? null;
        if ($displayName === '' || !is_numeric($lat) || !is_numeric($lon)) {
            return new DataResponse(['error' => 'displayName, lat and lon are required'], 400);
        }

        $this->config->setUserValue($userId, self::APP_ID, 'temp_home_display_name', $displayName);
        $this->config->setUserValue($userId, self::APP_ID, 'temp_home_lat', (string)(float)$lat);
        $this->config->setUserValue($userId, self::APP_ID, 'temp_home_lon', (string)(float)$lon);

        $country = isset($body['country']) ? strtoupper(trim((string)$body['country'])) : '';
        if ($country !== '') {
            $this->config->setUserValue($userId, self::APP_ID, 'temp_home_country', $country);
        } else {
            $this->config->deleteUserValue($userId, self::APP_ID, 'temp_home_country');
        }

        // The day this was decided FOR (the viewed date when the user
        // answered "staying") — DayPlanner needs this to know the temp home
        // must not retroactively become the START-of-day base for THAT same
        // day (you haven't left real home yet that morning), only for
        // later days and for the rest of that day once the flight lands.
        $setDate = trim((string)($body['setDate'] ?? ''));
        if ($setDate !== '') {
            $this->config->setUserValue($userId, self::APP_ID, 'temp_home_set_date', $setDate);
        } else {
            $this->config->deleteUserValue($userId, self::APP_ID, 'temp_home_set_date');
        }

        return new DataResponse(['ok' => true]);
    }

    #[NoAdminRequired]
    public function clear(): DataResponse {
        $userId = $this->requireUserId();
        foreach (['temp_home_display_name', 'temp_home_lat', 'temp_home_lon', 'temp_home_country', 'temp_home_set_date'] as $key) {
            $this->config->deleteUserValue($userId, self::APP_ID, $key);
        }
        return new DataResponse(['ok' => true]);
    }

    private function requireUserId(): string {
        $user = $this->userSession->getUser();
        if ($user === null) {
            throw new RuntimeException('no user in session');
        }
        return $user->getUID();
    }
}
