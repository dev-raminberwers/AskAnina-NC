<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * The actual point of this app: Nextcloud's own Calendar/Contacts/Deck have
 * no way to link a contact to an appointment or a note (a years-old, still
 * open feature request against nextcloud/contacts and nextcloud/deck) — this
 * is the schema for that. A contact is identified by (addressbook, URI),
 * since that is exactly what OCP\Contacts\IManager::search() results carry
 * (see AddressBookImpl::vCard2Array / ContactsManager::search); events and
 * notes are external to this app (events live in Nextcloud's own CalDAV
 * tables), so a link row just records the reference plus enough denormalized
 * display data to render a history feed without re-fetching everything.
 */
class Version000300Date20260905140000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('personalassistant_notes')) {
            $table = $schema->createTable('personalassistant_notes');
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
            $table->addColumn('created_at', 'integer', [
                'notnull' => true,
                'length' => 4,
                'unsigned' => true,
            ]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'pa_notes_user_idx');
        }

        if (!$schema->hasTable('personalassistant_links')) {
            $table = $schema->createTable('personalassistant_links');
            $table->addColumn('id', 'integer', [
                'autoincrement' => true,
                'notnull' => true,
                'length' => 4,
            ]);
            $table->addColumn('user_id', 'string', [
                'notnull' => true,
                'length' => 64,
            ]);
            $table->addColumn('contact_addressbook', 'string', [
                'notnull' => true,
                'length' => 64,
            ]);
            $table->addColumn('contact_uri', 'string', [
                'notnull' => true,
                'length' => 255,
            ]);
            $table->addColumn('contact_display_name', 'string', [
                'notnull' => false,
                'length' => 255,
            ]);
            // 'event' | 'note' — kept a plain string rather than an enum
            // type so a future link type never needs a schema migration.
            $table->addColumn('link_type', 'string', [
                'notnull' => true,
                'length' => 16,
            ]);
            // Event UID (for link_type=event) or personalassistant_notes.id
            // (for link_type=note) — always stored as a string since the two
            // reference spaces are different shapes.
            $table->addColumn('link_ref', 'string', [
                'notnull' => true,
                'length' => 255,
            ]);
            $table->addColumn('calendar_uri', 'string', [
                'notnull' => false,
                'length' => 255,
            ]);
            $table->addColumn('title', 'string', [
                'notnull' => true,
                'length' => 255,
            ]);
            $table->addColumn('occurred_at', 'integer', [
                'notnull' => true,
                'length' => 4,
                'unsigned' => true,
            ]);
            $table->addColumn('created_at', 'integer', [
                'notnull' => true,
                'length' => 4,
                'unsigned' => true,
            ]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id', 'contact_addressbook', 'contact_uri'], 'pa_links_contact_idx');
            $table->addIndex(['user_id', 'link_type', 'link_ref'], 'pa_links_ref_idx');
        }

        return $schema;
    }
}
