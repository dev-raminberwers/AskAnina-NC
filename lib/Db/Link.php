<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Db;

use OCP\AppFramework\Db\Entity;

/**
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string getContactAddressbook()
 * @method void setContactAddressbook(string $contactAddressbook)
 * @method string getContactUri()
 * @method void setContactUri(string $contactUri)
 * @method string|null getContactDisplayName()
 * @method void setContactDisplayName(?string $contactDisplayName)
 * @method string getLinkType()
 * @method void setLinkType(string $linkType)
 * @method string getLinkRef()
 * @method void setLinkRef(string $linkRef)
 * @method string|null getCalendarUri()
 * @method void setCalendarUri(?string $calendarUri)
 * @method string getTitle()
 * @method void setTitle(string $title)
 * @method int getOccurredAt()
 * @method void setOccurredAt(int $occurredAt)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 */
class Link extends Entity {
    public const TYPE_EVENT = 'event';
    public const TYPE_NOTE = 'note';
    public const TYPE_TASK = 'task';

    protected $userId;
    protected $contactAddressbook;
    protected $contactUri;
    protected $contactDisplayName;
    protected $linkType;
    protected $linkRef;
    protected $calendarUri;
    protected $title;
    protected $occurredAt;
    protected $createdAt;

    public function __construct() {
        $this->addType('id', 'integer');
        $this->addType('occurredAt', 'integer');
        $this->addType('createdAt', 'integer');
    }
}
