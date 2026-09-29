<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Controller;

use OCA\PersonalAssistant\Db\Link;
use OCA\PersonalAssistant\Db\LinkMapper;
use OCA\PersonalAssistant\Db\NoteMapper;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\Constants;
use OCP\Contacts\IManager;
use OCP\IRequest;
use OCP\IUserSession;
use RuntimeException;

/**
 * The actual point of this app: Calendar/Contacts/Deck have no way to link a
 * contact to an appointment or note (see nextcloud/contacts#2544,
 * nextcloud/deck#2462/#3855/#781 — a years-old, still-open feature request).
 * A contact is identified by (addressbook, URI) — exactly what
 * IManager::search() results carry — since events/notes live elsewhere and
 * this app just records the reference.
 */
class ContactController extends Controller {
    public function __construct(
        string $appName,
        IRequest $request,
        private IManager $contactsManager,
        private LinkMapper $linkMapper,
        private NoteMapper $noteMapper,
        private IUserSession $userSession,
    ) {
        parent::__construct($appName, $request);
    }

    #[NoAdminRequired]
    public function search(string $q = ''): DataResponse {
        if (trim($q) === '') {
            return new DataResponse(['results' => []]);
        }

        $matches = $this->contactsManager->search($q, ['FN', 'EMAIL'], ['limit' => 15]);
        $results = [];
        foreach ($matches as $contact) {
            if (!isset($contact['URI'], $contact['addressbook-key'])) {
                continue;
            }
            $email = $contact['EMAIL'][0] ?? null;
            $results[] = [
                'addressbook' => (string)$contact['addressbook-key'],
                'uri' => (string)$contact['URI'],
                'displayName' => (string)($contact['FN'] ?? $contact['URI']),
                'email' => $email !== null ? (string)$email : null,
            ];
        }

        return new DataResponse(['results' => $results]);
    }

    /**
     * Creates a brand-new Nextcloud contact (not linking an existing one —
     * see createLink() for that) from a name/phone/email the user picked up
     * from an appointment's title/description, same "quick add to contacts"
     * concept as the old Android app's addContactIntent(), just writing
     * straight into a real CardDAV address book instead of handing off to
     * Android's own Contacts app.
     */
    #[NoAdminRequired]
    public function create(): DataResponse {
        $body = $this->request->getParams();
        $displayName = trim((string)($body['displayName'] ?? ''));
        if ($displayName === '') {
            return new DataResponse(['error' => 'displayName is required'], 400);
        }

        $target = null;
        foreach ($this->contactsManager->getUserAddressBooks() as $addressBook) {
            if (($addressBook->getPermissions() & Constants::PERMISSION_CREATE) !== 0) {
                $target = $addressBook;
                break;
            }
        }
        if ($target === null) {
            return new DataResponse(['error' => 'no writable address book found'], 400);
        }

        $properties = ['FN' => $displayName];
        $phone = trim((string)($body['phone'] ?? ''));
        if ($phone !== '') {
            $properties['TEL'] = $phone;
        }
        $email = trim((string)($body['email'] ?? ''));
        if ($email !== '') {
            $properties['EMAIL'] = $email;
        }

        $created = $target->createOrUpdate($properties);

        return new DataResponse([
            'addressbook' => $target->getKey(),
            'uri' => $created['URI'] ?? null,
            'displayName' => $displayName,
        ], 201);
    }

    /**
     * The current Nextcloud user's own contact identity — reused as the
     * default "linked to" for every appointment/note/task unless the user
     * deliberately links someone else instead (per the "elke afspraak is
     * standaard aan jezelf gekoppeld" requirement). Prefers an existing
     * contact card matching the account's own email so this stays a real,
     * stable identity in the SAME (addressbook, uri) system every other
     * contact uses — the planned "pick a contact, see their whole history"
     * tool needs that consistency to also work for the user's own items.
     * Auto-creates one (same mechanism as create()) if none exists yet.
     */
    #[NoAdminRequired]
    public function self(): DataResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            throw new RuntimeException('no user in session');
        }
        $displayName = $user->getDisplayName();
        $email = $user->getEMailAddress();

        if ($email !== null) {
            foreach ($this->contactsManager->search($email, ['EMAIL'], ['limit' => 5]) as $contact) {
                if (!isset($contact['URI'], $contact['addressbook-key'])) {
                    continue;
                }
                $contactEmails = is_array($contact['EMAIL'] ?? null) ? $contact['EMAIL'] : array_filter([$contact['EMAIL'] ?? null]);
                if (in_array($email, $contactEmails, true)) {
                    return new DataResponse([
                        'addressbook' => (string)$contact['addressbook-key'],
                        'uri' => (string)$contact['URI'],
                        'displayName' => (string)($contact['FN'] ?? $displayName),
                    ]);
                }
            }
        }

        $target = null;
        foreach ($this->contactsManager->getUserAddressBooks() as $addressBook) {
            if (($addressBook->getPermissions() & Constants::PERMISSION_CREATE) !== 0) {
                $target = $addressBook;
                break;
            }
        }
        if ($target === null) {
            return new DataResponse(['error' => 'no writable address book found'], 400);
        }

        $properties = ['FN' => $displayName];
        if ($email !== null) {
            $properties['EMAIL'] = $email;
        }
        $created = $target->createOrUpdate($properties);

        return new DataResponse([
            'addressbook' => $target->getKey(),
            'uri' => $created['URI'] ?? null,
            'displayName' => $displayName,
        ]);
    }

    /** Every contact currently linked to one item — the sidebar's "who's this about" list, since an item can now have several. */
    #[NoAdminRequired]
    public function forItem(string $linkType, string $linkRef): DataResponse {
        $userId = $this->requireUserId();
        $links = $this->linkMapper->findAllForRef($userId, $linkType, $linkRef);
        return new DataResponse([
            'contacts' => array_map(static fn($link) => [
                'linkId' => $link->getId(),
                'addressbook' => $link->getContactAddressbook(),
                'uri' => $link->getContactUri(),
                'displayName' => $link->getContactDisplayName(),
            ], $links),
        ]);
    }

    /** Contacts that already have at least one link — so a contact can be revisited without re-searching. */
    #[NoAdminRequired]
    public function index(): DataResponse {
        $userId = $this->requireUserId();
        return new DataResponse(['contacts' => $this->linkMapper->findDistinctContacts($userId)]);
    }

    #[NoAdminRequired]
    public function history(string $addressbook, string $uri): DataResponse {
        $userId = $this->requireUserId();
        $links = $this->linkMapper->findForContact($userId, $addressbook, $uri);

        $items = [];
        foreach ($links as $link) {
            $noteText = null;
            if ($link->getLinkType() === Link::TYPE_NOTE) {
                try {
                    $noteText = $this->noteMapper->find((int)$link->getLinkRef(), $userId)->getText();
                } catch (DoesNotExistException) {
                    // the note itself was since removed — the link's own denormalized title still shows
                }
            }
            $items[] = [
                'id' => $link->getId(),
                'linkType' => $link->getLinkType(),
                'title' => $link->getTitle(),
                'noteText' => $noteText,
                'occurredAt' => date(DATE_ATOM, $link->getOccurredAt()),
            ];
        }

        return new DataResponse(['links' => $items]);
    }

    #[NoAdminRequired]
    public function createLink(): DataResponse {
        $userId = $this->requireUserId();
        $body = $this->request->getParams();

        $addressbook = trim((string)($body['contactAddressbook'] ?? ''));
        $uri = trim((string)($body['contactUri'] ?? ''));
        $linkType = (string)($body['linkType'] ?? '');
        $linkRef = trim((string)($body['linkRef'] ?? ''));
        $title = trim((string)($body['title'] ?? ''));

        if ($addressbook === '' || $uri === '' || $linkRef === '' || $title === ''
            || !in_array($linkType, [Link::TYPE_EVENT, Link::TYPE_NOTE, Link::TYPE_TASK], true)) {
            return new DataResponse(['error' => 'invalid request'], 400);
        }

        // Idempotent per (item, contact) pair, not per item — an item can
        // have SEVERAL contacts linked ("koppel meerdere personen aan het
        // item"): re-linking the SAME person just updates their row
        // (e.g. the auto-link-to-self default firing again harmlessly),
        // but a DIFFERENT contact is a genuinely new row alongside them,
        // not a replacement.
        try {
            $link = $this->linkMapper->findOneForRefAndContact($userId, $linkType, $linkRef, $addressbook, $uri);
            $isNew = false;
        } catch (DoesNotExistException) {
            $link = new Link();
            $link->setUserId($userId);
            $link->setLinkType($linkType);
            $link->setLinkRef($linkRef);
            $link->setCreatedAt(time());
            $isNew = true;
        }

        $occurredAt = isset($body['occurredAt']) ? strtotime((string)$body['occurredAt']) : time();

        $link->setContactAddressbook($addressbook);
        $link->setContactUri($uri);
        $link->setContactDisplayName(isset($body['contactDisplayName']) ? (string)$body['contactDisplayName'] : null);
        $link->setCalendarUri(isset($body['calendarUri']) ? (string)$body['calendarUri'] : null);
        $link->setTitle($title);
        $link->setOccurredAt($occurredAt !== false ? $occurredAt : time());

        $saved = $isNew ? $this->linkMapper->insert($link) : $this->linkMapper->update($link);

        return new DataResponse(['id' => $saved->getId()], $isNew ? 201 : 200);
    }

    #[NoAdminRequired]
    public function deleteLink(int $id): DataResponse {
        $userId = $this->requireUserId();
        try {
            $link = $this->linkMapper->find($id, $userId);
        } catch (DoesNotExistException) {
            return new DataResponse(['error' => 'not found'], 404);
        }
        if ($link->getUserId() !== $userId) {
            return new DataResponse(['error' => 'not found'], 404);
        }
        $this->linkMapper->delete($link);
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
