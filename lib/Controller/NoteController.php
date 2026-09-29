<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Controller;

use OCA\PersonalAssistant\Db\Link;
use OCA\PersonalAssistant\Db\LinkMapper;
use OCA\PersonalAssistant\Db\Note;
use OCA\PersonalAssistant\Db\NoteMapper;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IDBConnection;
use OCP\IRequest;
use OCP\IUserSession;
use RuntimeException;
use Throwable;

/** A note is this app's own lightweight entity — Nextcloud Notes is file/markdown-based and isn't queryable the way a contact-history feed needs. */
class NoteController extends Controller {
    public function __construct(
        string $appName,
        IRequest $request,
        private NoteMapper $noteMapper,
        private LinkMapper $linkMapper,
        private IUserSession $userSession,
        private IDBConnection $db,
    ) {
        parent::__construct($appName, $request);
    }

    /**
     * Creates a note, and — for every contact currently linked to the
     * appointment it was written from (possibly several — "koppel meerdere
     * personen aan het item") — a link row in the SAME request/transaction,
     * so "add a note" is one atomic action from the user's side, not a
     * note that can end up orphaned from its contact(s) if a second
     * request failed partway.
     */
    #[NoAdminRequired]
    public function create(): DataResponse {
        $userId = $this->requireUserId();
        $body = $this->request->getParams();

        $text = trim((string)($body['text'] ?? ''));
        if ($text === '') {
            return new DataResponse(['error' => 'text is required'], 400);
        }
        $contacts = self::parseContacts($body);
        $now = time();

        $this->db->beginTransaction();
        try {
            $note = new Note();
            $note->setUserId($userId);
            $note->setText($text);
            $note->setCreatedAt($now);
            $saved = $this->noteMapper->insert($note);

            $title = mb_strlen($text) > 80 ? mb_substr($text, 0, 77) . '...' : $text;
            foreach ($contacts as $contact) {
                $link = new Link();
                $link->setUserId($userId);
                $link->setContactAddressbook($contact['addressbook']);
                $link->setContactUri($contact['uri']);
                $link->setContactDisplayName($contact['displayName']);
                $link->setLinkType(Link::TYPE_NOTE);
                $link->setLinkRef((string)$saved->getId());
                $link->setCalendarUri(null);
                $link->setTitle($title);
                $link->setOccurredAt($now);
                $link->setCreatedAt($now);
                $this->linkMapper->insert($link);
            }
            $this->db->commit();
        } catch (Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }

        return new DataResponse(['id' => $saved->getId()], 201);
    }

    /**
     * Accepts either the current `contacts: [{addressbook, uri,
     * displayName}, ...]` shape or the older single-contact
     * `contactAddressbook`/`contactUri`/`contactDisplayName` fields, so an
     * older client (or a stray direct API call) linking just one contact
     * still works.
     *
     * @return array<int, array{addressbook: string, uri: string, displayName: ?string}>
     */
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
            return $contacts;
        }
        $addressbook = trim((string)($body['contactAddressbook'] ?? ''));
        $uri = trim((string)($body['contactUri'] ?? ''));
        if ($addressbook !== '' && $uri !== '') {
            $contacts[] = [
                'addressbook' => $addressbook,
                'uri' => $uri,
                'displayName' => isset($body['contactDisplayName']) ? (string)$body['contactDisplayName'] : null,
            ];
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
