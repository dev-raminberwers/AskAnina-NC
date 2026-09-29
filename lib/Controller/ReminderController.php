<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Controller;

use OCA\PersonalAssistant\Db\Reminder;
use OCA\PersonalAssistant\Db\ReminderMapper;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;
use RuntimeException;

/**
 * Quick-capture reminders/notes — the "+"-button's Herinnering/Notitie
 * types (Afspraak goes through AppointmentController instead, since it
 * writes a real calendar event). Ported from the Android app's reminders
 * collection/QuickAddDialog.
 */
class ReminderController extends Controller {
    private const VALID_TYPES = [Reminder::TYPE_REMINDER, Reminder::TYPE_NOTE];
    private const VALID_CONTACT_TYPES = ['call', 'email'];

    public function __construct(
        string $appName,
        IRequest $request,
        private ReminderMapper $mapper,
        private IUserSession $userSession,
    ) {
        parent::__construct($appName, $request);
    }

    #[NoAdminRequired]
    public function index(): DataResponse {
        $userId = $this->requireUserId();
        $reminders = array_map(static fn(Reminder $r) => [
            'id' => $r->getId(),
            'text' => $r->getText(),
            'type' => $r->getType(),
            'remindAt' => $r->getRemindAt(),
            'contactType' => $r->getContactType(),
            'contactValue' => $r->getContactValue(),
            'done' => $r->getDone(),
        ], $this->mapper->findAllForUser($userId));

        return new DataResponse(['reminders' => $reminders]);
    }

    #[NoAdminRequired]
    public function create(): DataResponse {
        $userId = $this->requireUserId();
        $body = $this->request->getParams();

        $text = trim((string)($body['text'] ?? ''));
        $type = (string)($body['type'] ?? Reminder::TYPE_REMINDER);
        if ($text === '' || !in_array($type, self::VALID_TYPES, true)) {
            return new DataResponse(['error' => 'text and a valid type are required'], 400);
        }

        $contactType = (string)($body['contactType'] ?? '');
        $contactType = in_array($contactType, self::VALID_CONTACT_TYPES, true) ? $contactType : null;

        $reminder = new Reminder();
        $reminder->setUserId($userId);
        $reminder->setText($text);
        $reminder->setType($type);
        $reminder->setRemindAt(isset($body['remindAt']) && $body['remindAt'] !== '' ? (string)$body['remindAt'] : null);
        $reminder->setContactType($contactType);
        $reminder->setContactValue($contactType !== null ? trim((string)($body['contactValue'] ?? '')) : null);
        $reminder->setDone(false);
        $reminder->setCreatedAt(time());

        $saved = $this->mapper->insert($reminder);

        return new DataResponse(['id' => $saved->getId()], 201);
    }

    #[NoAdminRequired]
    public function update(int $id): DataResponse {
        $userId = $this->requireUserId();
        try {
            $reminder = $this->mapper->find($id, $userId);
        } catch (DoesNotExistException) {
            return new DataResponse(['error' => 'not found'], 404);
        }

        $body = $this->request->getParams();
        if (array_key_exists('done', $body)) {
            $reminder->setDone((bool)$body['done']);
        }
        if (array_key_exists('remindAt', $body)) {
            $reminder->setRemindAt($body['remindAt'] !== '' ? (string)$body['remindAt'] : null);
        }
        $this->mapper->update($reminder);

        return new DataResponse(['ok' => true]);
    }

    #[NoAdminRequired]
    public function delete(int $id): DataResponse {
        $userId = $this->requireUserId();
        try {
            $this->mapper->delete($this->mapper->find($id, $userId));
        } catch (DoesNotExistException) {
            // already gone — idempotent
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
