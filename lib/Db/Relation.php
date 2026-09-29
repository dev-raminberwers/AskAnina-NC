<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Db;

use OCP\AppFramework\Db\Entity;

/**
 * Wat twee mensen van elkaar zijn.
 *
 * Met een richting, want "ik ben zijn klant" is iets anders dan "hij is mijn klant". En met een periode,
 * want *collega bij X tot 2024* is iets anders dan *collega* -- dat laatste kun je niet achteraf
 * toevoegen zonder alles opnieuw te vragen.
 *
 * Een kant is een verwijzing in tekst: `person:12` voor deze tabel, of `contact:<adresboek>/<uri>` voor
 * iemand uit het adresboek. Zo hoeft een contact niet eerst overgeschreven te worden om een relatie te
 * kunnen hebben.
 *
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string getFromRef()
 * @method void setFromRef(string $fromRef)
 * @method string getToRef()
 * @method void setToRef(string $toRef)
 * @method string getKind()
 * @method void setKind(string $kind)
 * @method string|null getContext()
 * @method void setContext(?string $context)
 * @method string|null getFromDate()
 * @method void setFromDate(?string $fromDate)
 * @method string|null getToDate()
 * @method void setToDate(?string $toDate)
 * @method string getSource()
 * @method void setSource(string $source)
 * @method string getCertainty()
 * @method void setCertainty(string $certainty)
 * @method int|null getCreatedAt()
 * @method void setCreatedAt(?int $createdAt)
 */
class Relation extends Entity {
    protected $userId;
    protected $fromRef;
    protected $toRef;
    protected $kind;
    protected $context;
    protected $fromDate;
    protected $toDate;
    protected $source;
    protected $certainty;
    protected $createdAt;

    public function __construct() {
        $this->addType('createdAt', 'integer');
    }
}
