# ProSystem — projektide kasumlikkus

Projektide (objektide) kasumlikkuse kalkulaator: kulude-tulude aruandele lisatakse palgakulu, mis tuletatakse tööaja- ja palgaaruannetest. Kaks osa:

- **`web/`** — staatiline veebirakendus (HTML/CSS/JS ES moodulid, ilma build-sammuta)
  - **Veebilehe aadress:** https://mssaar.github.io/prosystem-projektide-kasumlikkus/
  - Kasutaja laeb Excelid brauseris; andmed ei lahku kasutaja arvutist
  - Avaldatakse GitHub Pagesis GitHub Actionsi kaudu (vt allpool)
- **`analyys/Prosystem_Praktika.qmd`** — R/Quarto analüüs (sama arvutusloogika + juhumetsa masinõpe)

Disain ja põhjendused: `docs/superpowers/specs/2026-09-29-projektide-kasumlikkus-design.md`.

## Andmete laadimise juhend

Rakendus nõuab järgmisi Exceli faile. **Andmeid ei panda kunagi repo'sse** — need peavad olema lokaalsetes `*.xlsx` failides:

### 1. Kulud ja tulud
- **Faili nimi:** `ProSystem OÜ Dimensiooni Projekt detailne aruanne ...`
- Sisaldab: objektikoodid, kuud, kulude ja tulude summad
- **Näide:** `ProSystem OÜ Dimensiooni Projekt detailne aruanne 1.jan2024-30okt2024.xlsx`
- Perioodifilter (seadetes) kasutab veergu `Dok. kuupäev`. Kui see veerg või kuupäev puudub, periood neile ridadele ei rakendu — faililoendis on siis märge „kuupäev puudub“ ja tulemustes hoiatus.

### 2. Tööaeg
- **Faili nimi:** `Tööaeg_yyyy-mm-dd_yyyy-mm-dd_Projektid.xlsx`
- Sisaldab: töötajate nimed, tööaja koodid, tunnid kuude kaupa
- **Näide:** `Tööaeg_2024-01-01-2026-07-31_Projektid.xlsx`

### 3. Palgad
- **Faili nimi:** `Tasude ja tundide aruanne <Ettevõte> <Kuu Aasta>.xlsx`
- Sisaldab töötajate tasusid; palgakuluks loetakse veergu `kokku` (bruto + sotsiaalmaks + töötuskindlustus)
- Võib laadida mitu faili (nt iga ettevõtte kohta eraldi); sama isiku sama kuu tasud liidetakse

### 4. Palgafondi kontroll (valikuline)
- Eraldi Excel (nimi vabalt valitav), milles on veerg `kuu` ja üks summaveerg: `PR kanne`, `kokku` või `summa` (eelistus selles järjekorras).
- Seda kasutatakse ainult võrdluseks: tulemustes näidatakse iga kuu kohta kontrollsumma, arvutatud palgafond ja nende suhe. Arvutust see ei mõjuta.
- NB! PR-kannete summa ei ole palgafondi kulu — see sisaldab ka kinnipeetud makse jm. Palgafondi kulu on palgafaili veerg `kokku` (bruto + sotsiaalmaks + töötuskindlustus). Pikemalt: `docs/superpowers/specs/2026-09-29-projektide-kasumlikkus-design.md`.

**Uue ekspordi korral asenda vana fail, ära lisa uut vana kõrvale (ekspordid on kumulatiivsed).** Kui eri failides on identseid ridu, näitab rakendus hoiatust (topeltarvestus); sama nimega faili teist korda ei laeta.

## Privaatsus ja andmekaitse

- **Andmed jäävad kasutaja brauseris** — serveripoole logimist ei toimu
- **Väliseid skripte ei laeta** — Exceli teek SheetJS (0.20.3, Apache-2.0) on lokaalselt kaasas (`web/vendor/`), leht lubab ainult oma skripte (CSP `script-src 'self'`)
- **Andmeid repo'sse ei panda** — `.gitignore` keelab `*.xlsx` ja `*.csv` failid
- Päris andmed asuvad repo kõrval olevas kaustas `prosystem-andmed` (nt `../prosystem-andmed`)

## Arendus

### Sõltuvuste paigaldus (esimesena)
```bash
npm ci
```
Vaja testide ja `npm run kontroll` jaoks (SheetJS arendussõltuvusena).

### Testid käivitada
```bash
npm test
```

### Päris andmetega kontroll
```bash
npm run kontroll -- ../prosystem-andmed
```

### Lokaalne vaatamine
```bash
npx serve web
```
või
```bash
python -m http.server -d web
```
(ES moodulid ei tööta `file://` protokolli kaudu — vaja serveri!)

## GitHub Pages seadistamine

1. **Repo → Settings → Pages**
2. **Source:** GitHub Actions
3. Testid käivituvad iga pushi ja pull requesti peale; avaldamine ainult `main` haru pushil (või käsitsi)

Workflow (`.github/workflows/pages.yml`) paigaldab sõltuvused (`npm ci`), käivitab testid ja avaldab `web/` kausta.

## Arvutusloogika lühidalt

- Tavatöötaja: objektikulu = tunnid × (kuu palk / kuu tunnid)
- Erandtöötajad (seadetes määratud erandtöötajad, vaikimisi eeltäidetud): objektitunnid × kuu tavatöötajate keskmine tunnihind; ülejäänud palk → kuu üldkulupotti
- Üldkulupotti lähevad ka Kontori tunnid (oma tunnihinnaga) ja tunnideta palgasaajate palk
- Üldkulupott jaotub kuu objektidele kõigi töötajate objektitundide osakaalu järgi
- `Kontor` — tööaja projekti koodi `_`-eelne osa ei vasta mustrile `^\p{L}{1,3}[0-9]` (nt „Tööd kontoris_…“); mustrit saab seadetes muuta
- Nimed: palgafailis `PERENIMI, Eesnimi` → `Eesnimi Perenimi`; aliaste tabel parandab kirjavead

Täpsemalt: `docs/superpowers/specs/2026-09-29-projektide-kasumlikkus-design.md`.

## Kriitilised reeglid arenduses

- **Andmed ei tohi kunagi repo'sse jõuda.** Palgad on konfidentsiaalsed ja repo on avalik.
- **Palgakulu = palgafaili veerg `kokku`** (bruto + sotsmaks + töötuskindlustus). **EI korrutata 1,338-ga** — see oli vana viga.
- **Veerud leitakse päise nime järgi**, mitte asukoha järgi — kasutaja muudab faile käsitsi.
- Invariant: iga kuu `Σ jaotatud + jaotamata = Σ kokku`. Iga muudatus arvutusloogikas peab selle säilitama.

## Koodistruktuur

- `web/js/parse.js` ja `web/js/calc.js` — puhtad funktsioonid (ei sõltu DOM-ist ega SheetJS-ist), Node'is testitavad
- `web/js/app.js`, `web/js/export.js`, `web/js/abi.js` — UI loogika
- `web/index.html`, `web/styles.css` — leht ja stiil
- `web/tests/*.test.js` — testid (käivita: `npm test`)

UI tekstid ja muutujanimed on eesti keeles (`projekti_kood`, `tootaja_nimi`, `kuu` jne).
