<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\IDBConnection;

/** @template-extends QBMapper<Person> */
class PersonMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'personalassistant_persons', Person::class);
    }

    /**
     * Iedereen, behalve wie is samengevoegd.
     *
     * Die rijen blijven bestaan zodat oude verwijzingen niet doodlopen, maar ze horen niet meer als
     * eigen knoop in de tekening -- anders staat dezelfde mens er twee keer.
     *
     * @return Person[]
     */
    public function findAll(string $userId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->isNull('merged_into'));
        return $this->findEntities($qb);
    }
}
