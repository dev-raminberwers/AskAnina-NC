<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Db;

use OCP\AppFramework\Db\Entity;

/**
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string getText()
 * @method void setText(string $text)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 */
class Note extends Entity {
    protected $userId;
    protected $text;
    protected $createdAt;

    public function __construct() {
        $this->addType('id', 'integer');
        $this->addType('createdAt', 'integer');
    }
}
