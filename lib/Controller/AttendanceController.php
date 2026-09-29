<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Controller;

use OCA\PersonalAssistant\Db\NotAttend;
use OCA\PersonalAssistant\Db\NotAttendMapper;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;
use RuntimeException;

/** "Ben je hier geweest?" — see NotAttend/Migration Version000400 for why this is existence-based. */
class AttendanceController extends Controller {
    public function __construct(
        string $appName,
        IRequest $request,
        private NotAttendMapper $mapper,
        private IUserSession $userSession,
    ) {
        parent::__construct($appName, $request);
    }

    #[NoAdminRequired]
    public function index(string $date): DataResponse {
        $userId = $this->requireUserId();
        return new DataResponse(['notAttended' => $this->mapper->findEventUidsForDate($userId, $date)]);
    }

    #[NoAdminRequired]
    public function mark(): DataResponse {
        $userId = $this->requireUserId();
        $body = $this->request->getParams();
        $eventUid = trim((string)($body['eventUid'] ?? ''));
        $date = trim((string)($body['date'] ?? ''));
        if ($eventUid === '' || $date === '') {
            return new DataResponse(['error' => 'eventUid and date are required'], 400);
        }

        try {
            $this->mapper->findOne($userId, $eventUid, $date);
            // already marked — idempotent, nothing to do
        } catch (DoesNotExistException) {
            $entry = new NotAttend();
            $entry->setUserId($userId);
            $entry->setEventUid($eventUid);
            $entry->setOccurrenceDate($date);
            $entry->setCreatedAt(time());
            $this->mapper->insert($entry);
        }

        return new DataResponse(['ok' => true]);
    }

    #[NoAdminRequired]
    public function unmark(string $eventUid, string $date): DataResponse {
        $userId = $this->requireUserId();
        try {
            $this->mapper->delete($this->mapper->findOne($userId, $eventUid, $date));
        } catch (DoesNotExistException) {
            // already not marked — idempotent
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
