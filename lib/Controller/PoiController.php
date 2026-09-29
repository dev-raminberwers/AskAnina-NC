<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Controller;

use OCA\PersonalAssistant\Travel\Overpass;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;

/** "Koffie/eten in de buurt" suggestion for a gap card — see Overpass::nearby(). */
class PoiController extends Controller {
    public function __construct(string $appName, IRequest $request, private Overpass $overpass) {
        parent::__construct($appName, $request);
    }

    #[NoAdminRequired]
    public function nearby(float $lat, float $lon, string $category = 'coffee_food', string $q = ''): DataResponse {
        // Hotels are sparser than cafes/restaurants — a wider search radius
        // than the 2km default actually finds something on a small island.
        $radiusMeters = $category === 'hotel' ? 8000 : 2000;
        $nameFilter = trim($q) !== '' ? trim($q) : null;
        return new DataResponse(['results' => $this->overpass->nearby($lat, $lon, $category, $radiusMeters, $nameFilter)]);
    }
}
