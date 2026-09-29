<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Quick-capture reminders/notes — ported from the LIFE tool Android app's
 * "reminders" collection (the "+"-FAB: Herinnering/Notitie/Afspraak).
 * Afspraak bypasses this table entirely and writes straight to a real
 * calendar event instead (see AppointmentController), same as the Android
 * app's addCalendarAppointment().
 */
class Version000500Date20260905180000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('personalassistant_reminders')) {
            $table = $schema->createTable('personalassistant_reminders');
            $table->addColumn('id', 'integer', [
                'autoincrement' => true,
                'notnull' => true,
                'length' => 4,
            ]);
            $table->addColumn('user_id', 'string', [
                'notnull' => true,
                'length' => 64,
            ]);
            $table->addColumn('text', 'text', [
                'notnull' => true,
            ]);
            // 'reminder' | 'note'
            $table->addColumn('type', 'string', [
                'notnull' => true,
                'length' => 16,
            ]);
            $table->addColumn('remind_at', 'string', [
                'notnull' => false,
                'length' => 32,
            ]);
            $table->addColumn('contact_type', 'string', [
                'notnull' => false,
                'length' => 16,
            ]);
            $table->addColumn('contact_value', 'string', [
                'notnull' => false,
                'length' => 255,
            ]);
            $table->addColumn('done', 'boolean', [
                'notnull' => true,
                'default' => false,
            ]);
            $table->addColumn('created_at', 'integer', [
                'notnull' => true,
                'length' => 4,
                'unsigned' => true,
            ]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id', 'done'], 'pa_reminders_user_done_idx');
        }

        return $schema;
    }
}
