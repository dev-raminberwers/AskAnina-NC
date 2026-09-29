<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Settings;

use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\Settings\IIconSection;

class Section implements IIconSection {
    public function __construct(
        private IURLGenerator $urlGenerator,
        private IL10N $l,
    ) {
    }

    public function getID(): string {
        return 'personalassistant';
    }

    public function getName(): string {
        return $this->l->t('Personal Assistant');
    }

    public function getPriority(): int {
        return 55;
    }

    public function getIcon(): string {
        return $this->urlGenerator->imagePath('personalassistant', 'app.svg');
    }
}
