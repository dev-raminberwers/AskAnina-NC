<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\IDBConnection;

/** @template-extends QBMapper<TravelChoice> */
class TravelChoiceMapper extends QBMapper {
    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'personalassistant_travel_choices', TravelChoice::class);
    }

    /** @return array<string, TravelChoice> keyed by leg_key, for one user's whole day in a single query */
    public function findForUserAndDate(string $userId, string $date): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->eq('occurrence_date', $qb->createNamedParameter($date)));
        $entities = $this->findEntities($qb);
        $byLegKey = [];
        foreach ($entities as $entity) {
            $byLegKey[$entity->getLegKey()] = $entity;
        }
        return $byLegKey;
    }

    /** @throws DoesNotExistException */
    public function findOne(string $userId, string $legKey, string $date): TravelChoice {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
            ->andWhere($qb->expr()->eq('leg_key', $qb->createNamedParameter($legKey)))
            ->andWhere($qb->expr()->eq('occurrence_date', $qb->createNamedParameter($date)));
        return $this->findEntity($qb);
    }

    /**
     * Merges the given fields into the existing row for this leg (creating
     * one if none exists yet) — a partial update, since e.g. setting the
     * flight number shouldn't wipe an already-entered booking number.
     *
     * @param array{flightNumber?: ?string, travelMode?: ?string, bookingNumber?: ?string, checkinLeadMinutes?: ?int, arrivalProcessingMinutes?: ?int, arrivalDecision?: ?string} $fields
     */
    public function upsert(string $userId, string $legKey, string $date, array $fields): TravelChoice {
        try {
            $choice = $this->findOne($userId, $legKey, $date);
        } catch (DoesNotExistException) {
            $choice = new TravelChoice();
            $choice->setUserId($userId);
            $choice->setLegKey($legKey);
            $choice->setOccurrenceDate($date);
        }
        if (array_key_exists('flightNumber', $fields)) {
            $choice->setFlightNumber($fields['flightNumber']);
        }
        if (array_key_exists('travelMode', $fields)) {
            $choice->setTravelMode($fields['travelMode']);
        }
        if (array_key_exists('bookingNumber', $fields)) {
            $choice->setBookingNumber($fields['bookingNumber']);
        }
        if (array_key_exists('checkinLeadMinutes', $fields)) {
            $choice->setCheckinLeadMinutes($fields['checkinLeadMinutes']);
        }
        if (array_key_exists('arrivalProcessingMinutes', $fields)) {
            $choice->setArrivalProcessingMinutes($fields['arrivalProcessingMinutes']);
        }
        if (array_key_exists('arrivalDecision', $fields)) {
            $choice->setArrivalDecision($fields['arrivalDecision']);
        }
        $choice->setUpdatedAt(time());
        return $choice->getId() === null ? $this->insert($choice) : $this->update($choice);
    }
}
