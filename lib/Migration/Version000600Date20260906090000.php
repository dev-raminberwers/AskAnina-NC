<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * "I know better than what was detected/computed" corrections for a single
 * leg — flight number, transport mode, booking reference, custom check-in
 * lead time — keyed by (user, destination event UID, occurrence date). See
 * TravelChoice's own doc-comment for why these unrelated-looking fields
 * share one row.
 */
class Version000600Date20260906090000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('personalassistant_travel_choices')) {
            $table = $schema->createTable('personalassistant_travel_choices');
            $table->addColumn('id', 'integer', [
                'autoincrement' => true,
                'notnull' => true,
                'length' => 4,
            ]);
            $table->addColumn('user_id', 'string', [
                'notnull' => true,
                'length' => 64,
            ]);
            $table->addColumn('leg_key', 'string', [
                'notnull' => true,
                'length' => 255,
            ]);
            $table->addColumn('occurrence_date', 'string', [
                'notnull' => true,
                'length' => 10,
            ]);
            $table->addColumn('flight_number', 'string', [
                'notnull' => false,
                'length' => 20,
            ]);
            $table->addColumn('travel_mode', 'string', [
                'notnull' => false,
                'length' => 20,
            ]);
            $table->addColumn('booking_number', 'string', [
                'notnull' => false,
                'length' => 40,
            ]);
            $table->addColumn('checkin_lead_minutes', 'integer', [
                'notnull' => false,
                'length' => 4,
            ]);
            $table->addColumn('updated_at', 'integer', [
                'notnull' => true,
                'length' => 4,
                'unsigned' => true,
            ]);
            $table->setPrimaryKey(['id']);
            $table->addUniqueIndex(['user_id', 'leg_key', 'occurrence_date'], 'pa_travel_choice_unique_idx');
        }

        return $schema;
    }
}
