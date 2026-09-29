<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Controller;

use OCA\PersonalAssistant\Db\Call;
use OCA\PersonalAssistant\Db\CallMapper;
use OCA\PersonalAssistant\Db\LinkMapper;
use OCA\PersonalAssistant\Db\Person;
use OCA\PersonalAssistant\Db\PersonMapper;
use OCA\PersonalAssistant\Db\Relation;
use OCA\PersonalAssistant\Db\RelationMapper;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;
use RuntimeException;
use Throwable;

/**
 * Het netwerk, in de Nextcloud van de gebruiker zelf (Ramin, 27-09).
 *
 * *"De nextCloud app mag alleen data halen uit nextcloud"* en *"Als er een nextcloud verbinding is dan
 * worden de calls naar die nextcloud gestuurd."*
 *
 * Dit is dus geen doorgeefluik naar onze server. Alles wat hier binnenkomt of uitgaat, blijft in hun
 * eigen database staan.
 *
 * ## Wat deze controller WEL en NIET teruggeeft
 *
 * Hij geeft wat alleen hij heeft: gesprekken, eigen mensen, relaties en koppelingen. Het **adresboek**
 * haalt de voorkant zelf op via CardDAV -- daar is hij al mee verbonden, en het hier nog eens doorgeven
 * zou dezelfde gegevens twee keer over de lijn sturen.
 *
 * ## Waarom de telefoon hier ook bij kan
 *
 * De telefoon heeft een app-wachtwoord voor deze Nextcloud (daar leest hij al de agenda mee). Daarmee
 * komt hij ook langs deze routes; `#[NoCSRFRequired]` is nodig omdat hij geen webformulier is maar een
 * app die rechtstreeks praat.
 */
class NetworkController extends Controller {
    public function __construct(
        string $appName,
        IRequest $request,
        private CallMapper $callMapper,
        private PersonMapper $personMapper,
        private RelationMapper $relationMapper,
        private LinkMapper $linkMapper,
        private IUserSession $userSession,
    ) {
        parent::__construct($appName, $request);
    }

    /** Alles wat deze Nextcloud over jouw netwerk weet, in de vorm die `netwerkBouw.js` verwacht. */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function index(): DataResponse {
        $userId = $this->requireUserId();

        $mensen = [];
        foreach ($this->personMapper->findAll($userId) as $p) {
            $mensen[] = [
                'id' => 'person:' . $p->getId(),
                'naam' => $p->getName(),
                'aanduiding' => $p->getDesignation(),
                'ikZelf' => $p->getIsMe() === 1,
                'telefoon' => $p->getPhone(),
                'email' => $p->getEmail(),
                'contactUri' => $p->getContactUri(),
                'bron' => $p->getSource(),
                'zeker' => $p->getCertainty(),
            ];
        }

        $relaties = [];
        foreach ($this->relationMapper->findAll($userId) as $r) {
            $relaties[] = [
                'id' => (string)$r->getId(),
                'van' => $r->getFromRef(),
                'naar' => $r->getToRef(),
                'soort' => $r->getKind(),
                'context' => $r->getContext() ?? '',
                'vanDatum' => $r->getFromDate(),
                'totDatum' => $r->getToDate(),
                'bron' => $r->getSource(),
                'zeker' => $r->getCertainty(),
            ];
        }

        $gesprekken = [];
        foreach ($this->callMapper->findAll($userId) as $c) {
            $gesprekken[] = [
                'id' => $c->getCallId(),
                'nummer' => $c->getNumber(),
                'naam' => $c->getContactName(),
                'uitgaand' => $c->getDirection() === 'OUTGOING',
                'datum' => $c->getStartMs() ? gmdate('Y-m-d', (int)($c->getStartMs() / 1000)) : null,
                'minuten' => self::minuten($c),
                'notitie' => $c->getNotes(),
                'taakTitel' => $c->getTaskTitle(),
                'persoon' => $c->getPersonId() ? 'person:' . $c->getPersonId() : null,
            ];
        }

        // De bestaande koppelingen: contact <-> afspraak, notitie of taak. Die tabel lag er al.
        $koppelingen = [];
        try {
            foreach ($this->linkMapper->findAllForUser($userId) as $l) {
                $koppelingen[] = [
                    'vanSoort' => 'contact',
                    'vanId' => 'contact:' . $l->getContactAddressbook() . '/' . $l->getContactUri(),
                    'naarSoort' => $l->getLinkType() === 'event' ? 'afspraak' : ($l->getLinkType() === 'task' ? 'taak' : 'notitie'),
                    'naarId' => $l->getLinkType() . ':' . $l->getLinkRef(),
                    'relatie' => '',
                    'label' => $l->getTitle(),
                    'bron' => 'handmatig',
                ];
            }
        } catch (Throwable $e) {
            $koppelingen = [];      // oudere app-versie zonder die methode: dan zonder koppelingen
        }

        return new DataResponse([
            'ik' => $this->ikRef($userId),
            'mensen' => $mensen,
            'relaties' => $relaties,
            'gesprekken' => $gesprekken,
            'koppelingen' => $koppelingen,
        ]);
    }

    /**
     * De gesprekken van de telefoon, hierheen in plaats van naar ons.
     *
     * Dezelfde lijst mag zo vaak binnenkomen als de gebruiker zijn gesprekkenscherm opent; `upsert`
     * houdt het één rij per gesprek. Wat de telefoon stuurt is leidend, behalve de notitie: die kan hier
     * ook bewerkt zijn, en dan is de laatste bewerking de juiste.
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function pushCalls(): DataResponse {
        $userId = $this->requireUserId();
        $body = $this->request->getParams();
        $rijen = $body['calls'] ?? [];
        if (!is_array($rijen)) {
            return new DataResponse(['error' => 'calls must be a list'], 400);
        }

        $aantal = 0;
        foreach ($rijen as $r) {
            $callId = trim((string)($r['id'] ?? ''));
            if ($callId === '') {
                continue;
            }
            $this->callMapper->upsert($userId, [
                'callId' => $callId,
                'number' => isset($r['number']) ? (string)$r['number'] : null,
                'contactName' => isset($r['contactName']) ? (string)$r['contactName'] : null,
                'direction' => isset($r['direction']) ? (string)$r['direction'] : null,
                'callType' => isset($r['callType']) ? (string)$r['callType'] : null,
                'startMs' => isset($r['startMs']) ? (int)$r['startMs'] : null,
                'answeredMs' => isset($r['answeredMs']) ? (int)$r['answeredMs'] : null,
                'endMs' => isset($r['endMs']) ? (int)$r['endMs'] : null,
                'notes' => isset($r['notes']) ? (string)$r['notes'] : null,
                'noteId' => isset($r['noteId']) ? (string)$r['noteId'] : null,
                'taskId' => isset($r['taskId']) ? (string)$r['taskId'] : null,
                'taskTitle' => isset($r['taskTitle']) ? (string)$r['taskTitle'] : null,
            ]);
            $aantal++;
        }
        return new DataResponse(['ok' => true, 'opgeslagen' => $aantal]);
    }

    /** Iemand die niet in het adresboek staat: de broer van Delroy, een nummer zonder naam. */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function addPerson(): DataResponse {
        $userId = $this->requireUserId();
        $b = $this->request->getParams();

        $person = new Person();
        $person->setUserId($userId);
        $person->setName(self::leegIsNull($b['naam'] ?? null));
        $person->setDesignation(self::leegIsNull($b['aanduiding'] ?? null));
        $person->setIsMe(!empty($b['ikZelf']) ? 1 : 0);
        $person->setPhone(self::leegIsNull($b['telefoon'] ?? null));
        $person->setEmail(self::leegIsNull($b['email'] ?? null));
        $person->setContactUri(self::leegIsNull($b['contactUri'] ?? null));
        $person->setSource('manual');
        $person->setCertainty('confirmed');
        $person->setCreatedAt(time());
        $opgeslagen = $this->personMapper->insert($person);

        return new DataResponse(['ok' => true, 'id' => 'person:' . $opgeslagen->getId()]);
    }

    /** De betekenis: klant, buurman, zwager. Het enige wat geen machine voor je kan invullen. */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function addRelation(): DataResponse {
        $userId = $this->requireUserId();
        $b = $this->request->getParams();

        $van = trim((string)($b['van'] ?? ''));
        $naar = trim((string)($b['naar'] ?? ''));
        $soort = trim((string)($b['soort'] ?? ''));
        if ($van === '' || $naar === '' || $soort === '' || $van === $naar) {
            return new DataResponse(['error' => 'van, naar en soort zijn nodig, en niet hetzelfde'], 400);
        }

        $relatie = new Relation();
        $relatie->setUserId($userId);
        $relatie->setFromRef($van);
        $relatie->setToRef($naar);
        $relatie->setKind(mb_substr($soort, 0, 40));
        $relatie->setContext(self::leegIsNull($b['context'] ?? null));
        $relatie->setFromDate(self::leegIsNull($b['vanDatum'] ?? null));
        $relatie->setToDate(self::leegIsNull($b['totDatum'] ?? null));
        $relatie->setSource('manual');
        $relatie->setCertainty(($b['zeker'] ?? '') === 'vermoed' ? 'suspected' : 'confirmed');
        $relatie->setCreatedAt(time());
        $opgeslagen = $this->relationMapper->insert($relatie);

        return new DataResponse(['ok' => true, 'id' => (string)$opgeslagen->getId()]);
    }

    /**
     * "Klopt niet."
     *
     * Geen prullenbak maar geheugen: de rij blijft staan als `rejected`, zodat iets wat deze lijn eerder
     * voorstelde hem niet volgende maand opnieuw voorstelt.
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function rejectRelation(int $id): DataResponse {
        $userId = $this->requireUserId();
        try {
            $relatie = $this->relationMapper->find($id);
        } catch (DoesNotExistException $e) {
            return new DataResponse(['error' => 'onbekend'], 404);
        }
        if ($relatie->getUserId() !== $userId) {
            return new DataResponse(['error' => 'niet van jou'], 403);
        }
        $relatie->setCertainty('rejected');
        $this->relationMapper->update($relatie);
        return new DataResponse(['ok' => true]);
    }

    /** Dit gesprek was met die mens. Jouw besluit wint van wat wij zouden afleiden uit het nummer. */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function linkCall(): DataResponse {
        $userId = $this->requireUserId();
        $b = $this->request->getParams();
        $callId = trim((string)($b['gesprek'] ?? ''));
        $persoon = trim((string)($b['persoon'] ?? ''));
        if ($callId === '') {
            return new DataResponse(['error' => 'gesprek is nodig'], 400);
        }
        try {
            $call = $this->callMapper->findByCallId($userId, $callId);
        } catch (DoesNotExistException $e) {
            return new DataResponse(['error' => 'onbekend gesprek'], 404);
        }
        // 'person:12' -> 12, en leeg maakt de koppeling weer los.
        $call->setPersonId($persoon === '' ? null : (int)str_replace('person:', '', $persoon));
        $this->callMapper->update($call);
        return new DataResponse(['ok' => true]);
    }

    private static function minuten(Call $c): int {
        $begin = $c->getAnsweredMs() ?: $c->getStartMs();
        $eind = $c->getEndMs();
        if (!$begin || !$eind || $eind <= $begin) {
            return 0;
        }
        return (int)round(($eind - $begin) / 60000);
    }

    private static function leegIsNull(mixed $waarde): ?string {
        $tekst = trim((string)($waarde ?? ''));
        return $tekst === '' ? null : $tekst;
    }

    /**
     * Jouw eigen knoop.
     *
     * In een grafiek is "ik" gewoon een knoop; anders is elke lijn naar mij een uitzondering in de
     * tekening én in de code. Bestaat hij nog niet, dan maken we hem hier -- dat is goedkoper dan overal
     * controleren of hij er al is.
     */
    private function ikRef(string $userId): string {
        foreach ($this->personMapper->findAll($userId) as $p) {
            if ($p->getIsMe() === 1) {
                return 'person:' . $p->getId();
            }
        }
        $ik = new Person();
        $ik->setUserId($userId);
        $ik->setIsMe(1);
        $ik->setSource('manual');
        $ik->setCertainty('confirmed');
        $ik->setCreatedAt(time());
        return 'person:' . $this->personMapper->insert($ik)->getId();
    }

    private function requireUserId(): string {
        $user = $this->userSession->getUser();
        if ($user === null) {
            throw new RuntimeException('no user session');
        }
        return $user->getUID();
    }
}
