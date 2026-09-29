<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
use OCP\Util;

class PageController extends Controller {
    public function __construct(string $appName, IRequest $request) {
        parent::__construct($appName, $request);
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function index(): TemplateResponse {
        Util::addScript('personalassistant', 'personalassistant-main');
        Util::addStyle('personalassistant', 'main');
        $response = new TemplateResponse('personalassistant', 'main');

        // Nextcloud's default CSP only allows fetch()/XHR back to this same
        // origin — every call this app makes to askanina.com (the
        // actual planning intelligence: settings, plan.php, geocode, ...)
        // was silently blocked by the BROWSER itself, not failing with any
        // error this app's own code could catch (2026-09-09, live Chrome
        // DevTools console: "Refused to connect because it violates the
        // document's Content Security Policy" on every single /pa/ call —
        // this is why Today stayed empty and Settings never saved).
        $csp = new ContentSecurityPolicy();
        // Sinds 21-09 heet onze server askanina.com. Dit stond nog op het oude adres, en omdat Nextcloud
        // een app alleen naar zijn eigen server laat praten, blokkeerde de browser elk verzoek: het scherm
        // zei "geen verbinding" zonder dat er iets in ons eigen logboek kwam (gevonden 24-09).
        // Het oude adres is er 26-09 uit: er leunde niets meer op.
        $csp->addAllowedConnectDomain('https://askanina.com');
        // De letters van het ontwerp zitten als data:-regels in de bundel (zie fonts.css); zonder dit
        // weigert de browser ze en staan de kaarten in een vervangende letter.
        $csp->addAllowedFontDomain('data:');
        // Nieuwsfoto's en podcast-audio komen van overal (2026-09-15, RSS en Podcasts).
        $csp->addAllowedImageDomain('*');
        $csp->addAllowedMediaDomain('*');
        $response->setContentSecurityPolicy($csp);

        return $response;
    }
}
