<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\IDBConnection;

/** @template-extends QBMapper<Relation> */
class RelationMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'personalassistant_relations', Relation::class);
    }

    /** @throws \OCP\AppFramework\Db\DoesNotExistException */
    public function find(int $id): Relation {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id)));
        return $this->findEntity($qb);
    }

    /** @return Relation[] */
    public function findAll(string $userId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return $this->findEntities($qb);
    }

    /** @return Relation[] */
    public function findForRef(string $userId, string $ref): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->orX(
                $qb->expr()->eq('from_ref', $qb->createNamedParameter($ref)),
                $qb->expr()->eq('to_ref', $qb->createNamedParameter($ref)),
            ));
        return $this->findEntities($qb);
    }
}
