<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Settings;

use OCP\AppFramework\Http\TemplateResponse;
use OCP\Settings\ISettings;
use OCP\Util;

class PersonalSettings implements ISettings {
    public function getForm(): TemplateResponse {
        Util::addScript('personalassistant', 'personalassistant-settings');
        Util::addStyle('personalassistant', 'main');
        return new TemplateResponse('personalassistant', 'settings');
    }

    public function getSection(): ?string {
        return 'personalassistant';
    }

    public function getPriority(): int {
        return 50;
    }
}
