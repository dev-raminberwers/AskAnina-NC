<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Adds arrival_processing_minutes to personalassistant_travel_choices — a
 * per-leg override for the default post-arrival handling time (passport
 * control/baggage/customs), same pattern as checkin_lead_minutes.
 */
class Version000700Date20260907090000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        $table = $schema->getTable('personalassistant_travel_choices');
        if (!$table->hasColumn('arrival_processing_minutes')) {
            $table->addColumn('arrival_processing_minutes', 'integer', [
                'notnull' => false,
                'length' => 4,
            ]);
        }

        return $schema;
    }
}
