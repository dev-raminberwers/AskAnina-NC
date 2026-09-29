<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Db;

use OCP\AppFramework\Db\Entity;

/**
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string getEventUid()
 * @method void setEventUid(string $eventUid)
 * @method string getOccurrenceDate()
 * @method void setOccurrenceDate(string $occurrenceDate)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 */
class NotAttend extends Entity {
    protected $userId;
    protected $eventUid;
    protected $occurrenceDate;
    protected $createdAt;

    public function __construct() {
        $this->addType('id', 'integer');
        $this->addType('createdAt', 'integer');
    }
}
