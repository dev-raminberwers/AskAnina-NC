<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\IDBConnection;

/** @template-extends QBMapper<Link> */
class LinkMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'personalassistant_links', Link::class);
    }

    /**
     * Alle koppelingen van deze gebruiker.
     *
     * Voor het netwerk (27-09): daar telt niet welk contact je open hebt staan, maar het geheel -- welke
     * notitie bij wie hoort, welke afspraak bij wie. Met een grens, want een tekening van tienduizend
     * lijnen is geen tekening.
     *
     * @return Link[]
     */
    public function findAllForUser(string $userId, int $limit = 2000): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->orderBy('occurred_at', 'DESC')
            ->setMaxResults($limit);
        return $this->findEntities($qb);
    }

    /** @throws DoesNotExistException */
    public function find(int $id, string $userId): Link {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return $this->findEntity($qb);
    }

    /** @return Link[] */
    public function findForContact(string $userId, string $addressbook, string $uri): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->eq('contact_addressbook', $qb->createNamedParameter($addressbook)))
            ->andWhere($qb->expr()->eq('contact_uri', $qb->createNamedParameter($uri)))
            ->orderBy('occurred_at', 'DESC');
        return $this->findEntities($qb);
    }

    /**
     * Every distinct contact that has at least one link — the "contacts
     * with history" overview, so a contact can be revisited without
     * re-searching them every time.
     *
     * @return array<int, array{contact_addressbook: string, contact_uri: string, contact_display_name: ?string, link_count: int}>
     */
    public function findDistinctContacts(string $userId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('contact_addressbook', 'contact_uri')
            ->selectAlias($qb->func()->max('contact_display_name'), 'contact_display_name')
            ->selectAlias($qb->func()->count('id'), 'link_count')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->groupBy('contact_addressbook', 'contact_uri')
            ->orderBy('link_count', 'DESC');

        $result = $qb->executeQuery();
        $rows = [];
        while ($row = $result->fetch()) {
            $rows[] = [
                'contact_addressbook' => (string)$row['contact_addressbook'],
                'contact_uri' => (string)$row['contact_uri'],
                'contact_display_name' => $row['contact_display_name'] !== null ? (string)$row['contact_display_name'] : null,
                'link_count' => (int)$row['link_count'],
            ];
        }
        $result->closeCursor();
        return $rows;
    }

    /**
     * Every contact currently linked to one item (an appointment/note/task
     * can now have several — "koppel meerdere personen aan het item") — the
     * "who's this about" list the sidebar's Koppel-contact tab shows.
     *
     * @return Link[]
     */
    public function findAllForRef(string $userId, string $linkType, string $linkRef): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->eq('link_type', $qb->createNamedParameter($linkType)))
            ->andWhere($qb->expr()->eq('link_ref', $qb->createNamedParameter($linkRef)))
            ->orderBy('created_at', 'ASC');
        return $this->findEntities($qb);
    }

    /**
     * The specific (item, contact) pair, if that exact person is already
     * one of the (possibly several) contacts linked to this item — lets
     * createLink() stay idempotent (re-linking the same person again just
     * updates the row) while still allowing a DIFFERENT contact to be
     * added alongside them rather than replacing them.
     *
     * @throws DoesNotExistException
     */
    public function findOneForRefAndContact(string $userId, string $linkType, string $linkRef, string $addressbook, string $uri): Link {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->eq('link_type', $qb->createNamedParameter($linkType)))
            ->andWhere($qb->expr()->eq('link_ref', $qb->createNamedParameter($linkRef)))
            ->andWhere($qb->expr()->eq('contact_addressbook', $qb->createNamedParameter($addressbook)))
            ->andWhere($qb->expr()->eq('contact_uri', $qb->createNamedParameter($uri)));
        return $this->findEntity($qb);
    }
}
