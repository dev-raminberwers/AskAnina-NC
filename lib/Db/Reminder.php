<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Db;

use OCP\AppFramework\Db\Entity;

/**
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string getText()
 * @method void setText(string $text)
 * @method string getType()
 * @method void setType(string $type)
 * @method string|null getRemindAt()
 * @method void setRemindAt(?string $remindAt)
 * @method string|null getContactType()
 * @method void setContactType(?string $contactType)
 * @method string|null getContactValue()
 * @method void setContactValue(?string $contactValue)
 * @method bool getDone()
 * @method void setDone(bool $done)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 */
class Reminder extends Entity {
    public const TYPE_REMINDER = 'reminder';
    public const TYPE_NOTE = 'note';

    protected $userId;
    protected $text;
    protected $type;
    protected $remindAt;
    protected $contactType;
    protected $contactValue;
    protected $done;
    protected $createdAt;

    public function __construct() {
        $this->addType('id', 'integer');
        $this->addType('done', 'boolean');
        $this->addType('createdAt', 'integer');
    }
}
