<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\IDBConnection;

/** @template-extends QBMapper<Call> */
class CallMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'personalassistant_calls', Call::class);
    }

    /** @return Call[] */
    public function findAll(string $userId, int $limit = 500): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->orderBy('start_ms', 'DESC')
            ->setMaxResults($limit);
        return $this->findEntities($qb);
    }

    /**
     * Hetzelfde gesprek twee keer gestuurd hoort één rij te blijven.
     *
     * De telefoon stuurt zijn hele lijst opnieuw zodra je het scherm opent; zonder deze stap groeide de
     * tabel bij elke keer kijken.
     */
    public function upsert(string $userId, array $rij): Call {
        try {
            $bestaand = $this->findByCallId($userId, (string)$rij['callId']);
            foreach ($rij as $veld => $waarde) {
                $zetter = 'set' . ucfirst($veld);
                if (method_exists($bestaand, $zetter)) {
                    $bestaand->$zetter($waarde);
                }
            }
            $bestaand->setUpdatedAt(time());
            return $this->update($bestaand);
        } catch (DoesNotExistException $e) {
            $call = new Call();
            $call->setUserId($userId);
            foreach ($rij as $veld => $waarde) {
                $zetter = 'set' . ucfirst($veld);
                if (method_exists($call, $zetter)) {
                    $call->$zetter($waarde);
                }
            }
            $call->setUpdatedAt(time());
            return $this->insert($call);
        }
    }

    /** @throws DoesNotExistException */
    public function findByCallId(string $userId, string $callId): Call {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->eq('call_id', $qb->createNamedParameter($callId)));
        return $this->findEntity($qb);
    }
}
