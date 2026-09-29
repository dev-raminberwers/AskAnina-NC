<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Db;

use OCP\AppFramework\Db\Entity;

/**
 * Een mens die niet (of nog niet) in het adresboek staat.
 *
 * Het adresboek blijft de bron voor wie je kent. Deze tabel is voor de knopen die daar niet in horen: een
 * nummer dat twee keer belde, de broer van iemand, een mens zonder naam. Die half in je adresboek zetten
 * vervuilt precies het bestand dat je elders ook gebruikt.
 *
 * `name` mag leeg zijn en `designation` is hoe je hem NU noemt. Twee verschillende dingen: wie ze op een
 * hoop gooit, krijgt "de man van dinsdag" als naam in zijn adresboek.
 *
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string|null getName()
 * @method void setName(?string $name)
 * @method string|null getDesignation()
 * @method void setDesignation(?string $designation)
 * @method int getIsMe()
 * @method void setIsMe(int $isMe)
 * @method string|null getContactAddressbook()
 * @method void setContactAddressbook(?string $contactAddressbook)
 * @method string|null getContactUri()
 * @method void setContactUri(?string $contactUri)
 * @method string|null getPhone()
 * @method void setPhone(?string $phone)
 * @method string|null getEmail()
 * @method void setEmail(?string $email)
 * @method string getSource()
 * @method void setSource(string $source)
 * @method string getCertainty()
 * @method void setCertainty(string $certainty)
 * @method int|null getMergedInto()
 * @method void setMergedInto(?int $mergedInto)
 * @method int|null getCreatedAt()
 * @method void setCreatedAt(?int $createdAt)
 */
class Person extends Entity {
    protected $userId;
    protected $name;
    protected $designation;
    protected $isMe;
    protected $contactAddressbook;
    protected $contactUri;
    protected $phone;
    protected $email;
    protected $source;
    protected $certainty;
    protected $mergedInto;
    protected $createdAt;

    public function __construct() {
        $this->addType('isMe', 'integer');
        $this->addType('mergedInto', 'integer');
        $this->addType('createdAt', 'integer');
    }
}
