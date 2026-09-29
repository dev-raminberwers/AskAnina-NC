<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Db;

use OCP\AppFramework\Db\Entity;

/**
 * Een gesprek, zoals de telefoon het hierheen stuurde.
 *
 * Ramin, 27-09: *"Als er een nextcloud verbinding is dan worden de calls naar die nextcloud gestuurd."*
 * Dus niet naar ons: wie zijn gegevens in zijn eigen Nextcloud houdt, houdt ook zijn gesprekken daar.
 *
 * `notes` is het veld waar het om gaat. De rest is wat het toestel toch al wist; dit is wat de gebruiker
 * er zelf bij dacht, en het is het enige dat nergens anders bestaat.
 *
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string getCallId()
 * @method void setCallId(string $callId)
 * @method string|null getNumber()
 * @method void setNumber(?string $number)
 * @method string|null getContactName()
 * @method void setContactName(?string $contactName)
 * @method string|null getDirection()
 * @method void setDirection(?string $direction)
 * @method string|null getCallType()
 * @method void setCallType(?string $callType)
 * @method int|null getStartMs()
 * @method void setStartMs(?int $startMs)
 * @method int|null getAnsweredMs()
 * @method void setAnsweredMs(?int $answeredMs)
 * @method int|null getEndMs()
 * @method void setEndMs(?int $endMs)
 * @method string|null getNotes()
 * @method void setNotes(?string $notes)
 * @method string|null getNoteId()
 * @method void setNoteId(?string $noteId)
 * @method string|null getTaskId()
 * @method void setTaskId(?string $taskId)
 * @method string|null getTaskTitle()
 * @method void setTaskTitle(?string $taskTitle)
 * @method int|null getPersonId()
 * @method void setPersonId(?int $personId)
 * @method int|null getUpdatedAt()
 * @method void setUpdatedAt(?int $updatedAt)
 */
class Call extends Entity {
    protected $userId;
    protected $callId;
    protected $number;
    protected $contactName;
    protected $direction;
    protected $callType;
    protected $startMs;
    protected $answeredMs;
    protected $endMs;
    protected $notes;
    protected $noteId;
    protected $taskId;
    protected $taskTitle;
    protected $personId;
    protected $updatedAt;

    public function __construct() {
        $this->addType('startMs', 'integer');
        $this->addType('answeredMs', 'integer');
        $this->addType('endMs', 'integer');
        $this->addType('personId', 'integer');
        $this->addType('updatedAt', 'integer');
    }
}
