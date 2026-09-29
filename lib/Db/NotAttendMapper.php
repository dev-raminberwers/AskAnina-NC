<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\IDBConnection;

/** @template-extends QBMapper<NotAttend> */
class NotAttendMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'personalassistant_not_attend', NotAttend::class);
    }

    /** @return list<string> event UIDs marked "not attended" for this date */
    public function findEventUidsForDate(string $userId, string $date): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('event_uid')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->eq('occurrence_date', $qb->createNamedParameter($date)));
        $result = $qb->executeQuery();
        $uids = [];
        while ($row = $result->fetch()) {
            $uids[] = (string)$row['event_uid'];
        }
        $result->closeCursor();
        return $uids;
    }

    /** @throws DoesNotExistException */
    public function findOne(string $userId, string $eventUid, string $date): NotAttend {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->eq('event_uid', $qb->createNamedParameter($eventUid)))
            ->andWhere($qb->expr()->eq('occurrence_date', $qb->createNamedParameter($date)));
        return $this->findEntity($qb);
    }
}
