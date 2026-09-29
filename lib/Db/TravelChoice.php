<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Db;

use OCP\AppFramework\Db\Entity;

/**
 * A user's own correction/decision for one leg of the day, keyed by the
 * UID of the event that leg travels TO — several unrelated things share
 * this one row because they're all "the user knows better than what we
 * detected/computed" for the same leg: an auto-detected flight number that
 * was actually wrong (flightNumber), a booking reference for their own
 * reference (bookingNumber, never auto-looked-up — see AirLabs' own
 * doc-comment for why), an explicit transport mode for a leg the planner
 * couldn't reasonably route by car (travelMode), and a custom check-in lead
 * time for this specific flight (checkinLeadMinutes) overriding the user's
 * own Settings default, a custom post-arrival handling time
 * (arrivalProcessingMinutes) for passport control/baggage/customs, and
 * whether this flight's own arrival is where the user is actually staying
 * or just a connecting-flight stop (arrivalDecision: 'staying'|'transfer').
 *
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string getLegKey()
 * @method void setLegKey(string $legKey)
 * @method string getOccurrenceDate()
 * @method void setOccurrenceDate(string $occurrenceDate)
 * @method ?string getFlightNumber()
 * @method void setFlightNumber(?string $flightNumber)
 * @method ?string getTravelMode()
 * @method void setTravelMode(?string $travelMode)
 * @method ?string getBookingNumber()
 * @method void setBookingNumber(?string $bookingNumber)
 * @method ?int getCheckinLeadMinutes()
 * @method void setCheckinLeadMinutes(?int $checkinLeadMinutes)
 * @method ?int getArrivalProcessingMinutes()
 * @method void setArrivalProcessingMinutes(?int $arrivalProcessingMinutes)
 * @method ?string getArrivalDecision()
 * @method void setArrivalDecision(?string $arrivalDecision)
 * @method int getUpdatedAt()
 * @method void setUpdatedAt(int $updatedAt)
 */
class TravelChoice extends Entity {
    protected $userId;
    protected $legKey;
    protected $occurrenceDate;
    protected $flightNumber;
    protected $travelMode;
    protected $bookingNumber;
    protected $checkinLeadMinutes;
    protected $arrivalProcessingMinutes;
    protected $arrivalDecision;
    protected $updatedAt;

    public function __construct() {
        $this->addType('id', 'integer');
        $this->addType('checkinLeadMinutes', 'integer');
        $this->addType('arrivalProcessingMinutes', 'integer');
        $this->addType('updatedAt', 'integer');
    }
}
