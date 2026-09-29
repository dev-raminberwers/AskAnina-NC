<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Adds arrival_decision to personalassistant_travel_choices — whether the
 * user is actually staying at this flight's arrival airport ('staying') or
 * continuing on a connecting flight ('transfer'), asked right after landing
 * so DayPlanner knows whether to prompt for a temporary base immediately.
 */
class Version000800Date20260908090000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        $table = $schema->getTable('personalassistant_travel_choices');
        if (!$table->hasColumn('arrival_decision')) {
            $table->addColumn('arrival_decision', 'string', [
                'notnull' => false,
                'length' => 20,
            ]);
        }

        return $schema;
    }
}
