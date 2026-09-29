<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * "Ben je hier geweest?" attendance tracking — ported from the LIFE tool
 * Android app's AttendanceHandler. Existence-based: a row here means
 * "marked as NOT attended"; no row means "attended" (the default
 * assumption for a past appointment). Keyed by (event_uid, occurrence_date)
 * rather than just event_uid so a recurring event's individual occurrences
 * can each be marked independently.
 */
class Version000400Date20260905160000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('personalassistant_not_attend')) {
            $table = $schema->createTable('personalassistant_not_attend');
            $table->addColumn('id', 'integer', [
                'autoincrement' => true,
                'notnull' => true,
                'length' => 4,
            ]);
            $table->addColumn('user_id', 'string', [
                'notnull' => true,
                'length' => 64,
            ]);
            $table->addColumn('event_uid', 'string', [
                'notnull' => true,
                'length' => 255,
            ]);
            $table->addColumn('occurrence_date', 'string', [
                'notnull' => true,
                'length' => 10,
            ]);
            $table->addColumn('created_at', 'integer', [
                'notnull' => true,
                'length' => 4,
                'unsigned' => true,
            ]);
            $table->setPrimaryKey(['id']);
            $table->addUniqueIndex(['user_id', 'event_uid', 'occurrence_date'], 'pa_not_attend_unique_idx');
        }

        return $schema;
    }
}
