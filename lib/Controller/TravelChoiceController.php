<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Controller;

use OCA\PersonalAssistant\Db\TravelChoiceMapper;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;
use RuntimeException;

/**
 * User corrections/decisions for one travel leg — see TravelChoice's own
 * doc-comment for why flight number, travel mode, booking number and
 * check-in lead time all live in the same row.
 */
class TravelChoiceController extends Controller {
    private const VALID_MODES = ['driving', 'training', 'flying'];
    private const VALID_ARRIVAL_DECISIONS = ['staying', 'transfer'];

    public function __construct(
        string $appName,
        IRequest $request,
        private TravelChoiceMapper $mapper,
        private IUserSession $userSession,
    ) {
        parent::__construct($appName, $request);
    }

    #[NoAdminRequired]
    public function update(): DataResponse {
        $userId = $this->requireUserId();
        $body = $this->request->getParams();
        $legKey = trim((string)($body['legKey'] ?? ''));
        $date = trim((string)($body['date'] ?? ''));
        if ($legKey === '' || $date === '') {
            return new DataResponse(['error' => 'legKey and date are required'], 400);
        }

        $fields = [];
        if (array_key_exists('flightNumber', $body)) {
            $value = trim((string)$body['flightNumber']);
            $fields['flightNumber'] = $value !== '' ? strtoupper($value) : null;
        }
        if (array_key_exists('travelMode', $body)) {
            $value = (string)$body['travelMode'];
            $fields['travelMode'] = in_array($value, self::VALID_MODES, true) ? $value : null;
        }
        if (array_key_exists('bookingNumber', $body)) {
            $value = trim((string)$body['bookingNumber']);
            $fields['bookingNumber'] = $value !== '' ? $value : null;
        }
        if (array_key_exists('checkinLeadMinutes', $body)) {
            // A 0 here is never a real, intended override — it's what an
            // emptied number field coerces to (JS: Number('') === 0) — so
            // treat it the same as "cleared", falling back to the user's
            // Settings default rather than silently pinning this leg to 0.
            $minutes = (int)$body['checkinLeadMinutes'];
            $fields['checkinLeadMinutes'] = $minutes > 0 ? $minutes : null;
        }
        if (array_key_exists('arrivalProcessingMinutes', $body)) {
            $minutes = (int)$body['arrivalProcessingMinutes'];
            $fields['arrivalProcessingMinutes'] = $minutes > 0 ? $minutes : null;
        }
        if (array_key_exists('arrivalDecision', $body)) {
            $value = (string)$body['arrivalDecision'];
            $fields['arrivalDecision'] = in_array($value, self::VALID_ARRIVAL_DECISIONS, true) ? $value : null;
        }

        $choice = $this->mapper->upsert($userId, $legKey, $date, $fields);
        return new DataResponse([
            'flightNumber' => $choice->getFlightNumber(),
            'travelMode' => $choice->getTravelMode(),
            'bookingNumber' => $choice->getBookingNumber(),
            'checkinLeadMinutes' => $choice->getCheckinLeadMinutes(),
            'arrivalProcessingMinutes' => $choice->getArrivalProcessingMinutes(),
            'arrivalDecision' => $choice->getArrivalDecision(),
        ]);
    }

    private function requireUserId(): string {
        $user = $this->userSession->getUser();
        if ($user === null) {
            throw new RuntimeException('no user in session');
        }
        return $user->getUID();
    }
}
