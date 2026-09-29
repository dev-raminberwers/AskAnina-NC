# -*- coding: utf-8 -*-
"""
Maakt src/fonts.css: de twee letters van het ontwerp, in het bestand zelf.

De kaarten gebruiken Archivo en IBM Plex Mono (zie kaarten.html). Die haalde kaarten.css met een @import
bij Google op, en dat blokkeert de beveiligingsregel van de web-agenda -- de kaarten stonden dus in een
vervangende letter. Ze hier meeleveren lost drie dingen tegelijk op: de regel hoeft niet losser, er gaat
geen bezoeker meer langs Google voor een lettertype, en de letter staat er meteen in plaats van na een
tweede verzoek.

Alleen de subset latin; draai dit opnieuw als het ontwerp een gewicht erbij krijgt.
"""
import base64
import io
import re
import urllib.request

BRON = ('https://fonts.googleapis.com/css2?'
        'family=Archivo:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap')
DOEL = ('C:/RAMIN/Documents/BUSINESS/WEBSITES/TENANTS/PERSONALASSISTANT/'
        'PRODUCTION/WEBSITE/nextcloud-app/personalassistant/src/fonts.css')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'

KOP = '\n'.join([
    '/*',
    ' * De letters van het ontwerp, in het bestand zelf.',
    ' *',
    ' * Gemaakt met scripts/maak_fonts_css.py uit Google Fonts (Archivo, IBM Plex Mono). Ze staan hier',
    ' * en niet achter een @import omdat de beveiligingsregel van de web-agenda alleen deze server toestaat,',
    ' * en omdat er zo geen bezoeker meer langs Google gaat voor een lettertype.',
    ' *',
    ' * Alleen de subset latin: die dekt de accenten van alle zeven talen. latin-ext is voor Pools en Turks',
    ' * en zou het bestand verdubbelen.',
    ' */',
    '',
])


def haal(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


css = haal(BRON).decode('utf-8')
blokken = re.findall(r'/\*\s*([a-z-]+)\s*\*/\s*(@font-face\s*\{[^}]*\})', css)
uit = [KOP]
mee = 0
for subset, blok in blokken:
    if subset != 'latin':
        continue
    m = re.search(r"url\((https://fonts\.gstatic\.com[^)]+\.woff2)\)", blok)
    if not m:
        continue
    data = haal(m.group(1))
    mee += len(data)
    b64 = base64.b64encode(data).decode('ascii')
    nieuw = blok.replace(m.group(1), 'data:font/woff2;base64,' + b64)
    nieuw = re.sub(r'\s*\n\s*', ' ', nieuw).strip()
    uit.append(nieuw + '\n')

io.open(DOEL, 'w', encoding='utf-8', newline='').write('\n'.join(uit))
print('letters meegeleverd:', len(uit) - 1, 'stuks,', round(mee / 1024), 'KB ruw')
