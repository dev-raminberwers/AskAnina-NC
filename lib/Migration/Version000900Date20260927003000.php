<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Het netwerk in de Nextcloud van de gebruiker zelf (Ramin, 27-09).
 *
 * *"De nextCloud app mag alleen data halen uit nextcloud."* En: *"Als er een nextcloud verbinding is dan
 * worden de calls naar die nextcloud gestuurd."*
 *
 * Daarmee is dit geen bestand meer in een map maar een echte tabel in hun eigen database -- waar hij
 * hoort. Drie tabellen erbij; de vierde die het netwerk nodig heeft bestond al:
 *
 * ```
 * personalassistant_links       BESTOND AL -- contact <-> afspraak/notitie/taak
 * personalassistant_calls       de gesprekken die de telefoon hierheen stuurt
 * personalassistant_persons     mensen die niet in het adresboek staan (de broer van Delroy)
 * personalassistant_relations   de betekenis: klant, buurman, zwager
 * ```
 *
 * ## Waarom mensen hier ook een tabel krijgen, naast het adresboek
 *
 * Het adresboek is de bron voor wie je kent. Maar een netwerk heeft ook knopen die daar niet in horen:
 * een nummer dat twee keer belde, de broer van iemand, een mens waarvan je de naam nog niet weet. Die
 * als half contact in het adresboek zetten vervuilt precies het bestand dat de gebruiker elders ook
 * gebruikt. Vandaar een eigen tabel, met een verwijzing (`contact_uri`) naar het adresboek zodra die
 * bekend is.
 *
 * ## Waarom elke rij zijn herkomst draagt
 *
 * `source` en `certainty` staan op elke rij, net als aan onze kant. Anders staat wat JIJ weet naast wat
 * een machine afleidde, en zien ze er hetzelfde uit.
 */
class Version000900Date20260927003000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        // ── De gesprekken van de telefoon ────────────────────────────────
        if (!$schema->hasTable('personalassistant_calls')) {
            $table = $schema->createTable('personalassistant_calls');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true, 'length' => 20]);
            $table->addColumn('user_id', 'string', ['notnull' => true, 'length' => 64]);
            // Het id dat de telefoon eraan gaf; daarmee overschrijft een tweede zending dezelfde rij.
            $table->addColumn('call_id', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('number', 'string', ['notnull' => false, 'length' => 40]);
            $table->addColumn('contact_name', 'string', ['notnull' => false, 'length' => 190]);
            $table->addColumn('direction', 'string', ['notnull' => false, 'length' => 16]);
            $table->addColumn('call_type', 'string', ['notnull' => false, 'length' => 16]);
            $table->addColumn('start_ms', 'bigint', ['notnull' => false, 'length' => 20]);
            $table->addColumn('answered_ms', 'bigint', ['notnull' => false, 'length' => 20]);
            $table->addColumn('end_ms', 'bigint', ['notnull' => false, 'length' => 20]);
            // Wat je er zelf bij schreef. Dit is het waardevolste veld van de hele tabel.
            $table->addColumn('notes', 'text', ['notnull' => false]);
            $table->addColumn('note_id', 'string', ['notnull' => false, 'length' => 190]);
            $table->addColumn('task_id', 'string', ['notnull' => false, 'length' => 190]);
            $table->addColumn('task_title', 'string', ['notnull' => false, 'length' => 255]);
            $table->addColumn('person_id', 'bigint', ['notnull' => false, 'length' => 20]);
            $table->addColumn('updated_at', 'bigint', ['notnull' => false, 'length' => 20]);
            $table->setPrimaryKey(['id']);
            $table->addUniqueIndex(['user_id', 'call_id'], 'pa_calls_user_call');
            $table->addIndex(['user_id', 'start_ms'], 'pa_calls_user_start');
        }

        // ── Mensen die niet in het adresboek staan ───────────────────────
        if (!$schema->hasTable('personalassistant_persons')) {
            $table = $schema->createTable('personalassistant_persons');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true, 'length' => 20]);
            $table->addColumn('user_id', 'string', ['notnull' => true, 'length' => 64]);
            // Leeg zolang je niet weet wie het is.
            $table->addColumn('name', 'string', ['notnull' => false, 'length' => 190]);
            // Hoe je hem NU noemt: de broer van Delroy. Nooit als naam gebruiken.
            $table->addColumn('designation', 'string', ['notnull' => false, 'length' => 190]);
            $table->addColumn('is_me', 'smallint', ['notnull' => true, 'default' => 0]);
            $table->addColumn('contact_addressbook', 'string', ['notnull' => false, 'length' => 190]);
            $table->addColumn('contact_uri', 'string', ['notnull' => false, 'length' => 190]);
            $table->addColumn('phone', 'string', ['notnull' => false, 'length' => 40]);
            $table->addColumn('email', 'string', ['notnull' => false, 'length' => 190]);
            $table->addColumn('source', 'string', ['notnull' => true, 'length' => 24, 'default' => 'manual']);
            $table->addColumn('certainty', 'string', ['notnull' => true, 'length' => 16, 'default' => 'confirmed']);
            // Bleek dezelfde mens: deze rij blijft staan en wijst daarheen, zodat niets doodloopt.
            $table->addColumn('merged_into', 'bigint', ['notnull' => false, 'length' => 20]);
            $table->addColumn('created_at', 'bigint', ['notnull' => false, 'length' => 20]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'pa_persons_user');
            $table->addIndex(['user_id', 'contact_uri'], 'pa_persons_contact');
        }

        // ── De betekenis ─────────────────────────────────────────────────
        if (!$schema->hasTable('personalassistant_relations')) {
            $table = $schema->createTable('personalassistant_relations');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true, 'length' => 20]);
            $table->addColumn('user_id', 'string', ['notnull' => true, 'length' => 64]);
            // Een kant kan een rij uit persons zijn of een contact uit het adresboek; vandaar tekst.
            $table->addColumn('from_ref', 'string', ['notnull' => true, 'length' => 190]);
            $table->addColumn('to_ref', 'string', ['notnull' => true, 'length' => 190]);
            $table->addColumn('kind', 'string', ['notnull' => true, 'length' => 40]);
            $table->addColumn('context', 'string', ['notnull' => false, 'length' => 190]);
            // "collega bij X tot 2024" is iets anders dan "collega" -- zonder deze twee is een tijdlijn
            // geen tijdlijn.
            $table->addColumn('from_date', 'string', ['notnull' => false, 'length' => 10]);
            $table->addColumn('to_date', 'string', ['notnull' => false, 'length' => 10]);
            $table->addColumn('source', 'string', ['notnull' => true, 'length' => 24, 'default' => 'manual']);
            $table->addColumn('certainty', 'string', ['notnull' => true, 'length' => 16, 'default' => 'confirmed']);
            $table->addColumn('created_at', 'bigint', ['notnull' => false, 'length' => 20]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'pa_relations_user');
            $table->addIndex(['user_id', 'from_ref'], 'pa_relations_from');
            $table->addIndex(['user_id', 'to_ref'], 'pa_relations_to');
        }

        return $schema;
    }
}
