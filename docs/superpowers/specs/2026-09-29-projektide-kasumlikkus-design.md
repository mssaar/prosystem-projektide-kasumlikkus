# Projektide kasumlikkuse kalkulaator — disain

Kuupäev: 2026-09-29 · Autor: Mark Sverker Saar (koos Claude'iga)

## Eesmärk

ProSystemi projektide (objektide) kasumlikkuse hindamine: kulude-tulude aruandele lisatakse iga
projekti palgakulu, mis tuletatakse tööaja- ja palgaaruannetest. Tulemus peab:

1. jaotama **kogu palgafondi** (tööandja kulu) objektidele, ilma topeltarvestuseta;
2. olema kasutatav veebilehel, kuhu kasutaja laeb Excelid ise — tasuta GitHub Pages, andmed ei lahku
   brauserist;
3. näitama selgelt kõik probleemid (projektid ilma palgakuluta, nimede mittevasted jne).

R/Quarto analüüs (`analyys/Prosystem_Praktika.qmd`) jääb alles ja saab samad parandused; masinõpe
(juhumets) jääb ainult R-i.

## Leitud vead senises koodis

1. **Topelt tööandja maksud.** Palgafaili 13. veerg on `kokku` = summa + sotsmaks +
   töötuskindlustusmakse. Kood korrutas selle veel 1,338-ga. Õige: kasutada `kokku` otse, koefitsienti
   ei ole. (`kokku` arvestab ka sotsmaksu miinimumbaasi, mida 1,338 ei teeks.)
2. **Veerud asukoha järgi.** Faile muudetakse käsitsi (nt Projektbüroo failis on `arvestuskuu`
   liigutatud L-veergu). Veerud tuleb leida **päise nime järgi**.
3. **Kaduv palk.** Palk, mille saajal pole tööaja ridu (~16 inimest), kadus `inner_join`-iga.
4. **Kontori kulu kogu perioodi keskmisega**, mitte kuu kaupa.

## Palgafond vs PR-kanded

Kontrolltabeli „PR kanne“ summa ≈ 2,2–2,35 × bruto (≈ 1,65 × `kokku`), kuid see **ei ole palgafondi
kulu**: sama palgaga kuudel erineb PR-summa mitmesaja euro võrra ja vahe sõltub tulumaksu
muudatustest (nt tulumaksuvabastuse muutus), st PR-summasse on arvatud kinnipeetavad maksud ja muud read.
Ükski bruto/maksude/neto kombinatsioon ei selgita PR-summat täpselt. Rakenduse palgafond = Σ `kokku`.
PR-summasid saab rakenduses valikuliselt kõrvutada (kontrollpaneel näitab vahet ja suhet kuude kaupa).

## Arvutusloogika (kuu kaupa)

Tähistused kuul *m*:

- **Palgakulu** `P(i,m)` = Σ `kokku` isikul *i* (kõik ettevõtted/failid kokku), arvestades ainult
  seadetes lubatud tasuliike (vaikimisi kõik). Tundmatu tasuliik → hoiatus.
- **Tunnid** `H(i,p,m)` tööajast; `p = Kontor`, kui koodi osa enne esimest `_` ei vasta mustrile
  `^\p{L}{1,3}[0-9]` (unicode; vana `^.[0-9]` liigitas päris projektid IK2/IK3 valesti Kontoriks).
- Isikud: **tavatöötaja** (on palk ja tunnid, pole erand), **erandtöötaja** (seadetes; vaikimisi
  Veiko Venig, Koit Roasto, Allar Jõõts), **tunnideta** (kuul *m* on palk, aga tunde sel kuul
  pole; UI eristab need, kellel pole tööaja failis üldse ühtegi rida), **palgata** (on tunnid, pole palka → hoiatus, kulu 0).

Sammud:

1. Tavatöötaja tunnihind `r(i,m) = P(i,m) / Σ_p H(i,p,m)`.
2. Kuu keskmine tunnihind `r̄(m) = Σ P(tava) / Σ H(tava)` (kõik tavatöötajate tunnid, ka Kontor).
3. Tavatöötaja otsene kulu objektile `p ≠ Kontor`: `H(i,p,m) × r(i,m)`.
4. Erandtöötaja objektikulu: `H(e,p,m) × r̄(m)` (p ≠ Kontor).
5. **Kuu üldkulupott** `O(m)` =
   - tavatöötajate Kontor-tunnid × nende oma tunnihind;
   - erandtöötajate `P(e,m) − Σ_p H(e,p,m) × r̄(m)` (võib olla negatiivne → hoiatus);
   - tunnideta isikute `P(i,m)` (sh tavatöötaja kuu, kus palk on, tunde pole).
6. `O(m)` jaotatakse objektidele osakaaluga `Σ_i H(i,p,m) / Σ_i Σ_{p≠Kontor} H(i,p,m)`
   (kõigi töötajate, ka erandite, objektitunnid). Kui kuul pole objektitunde → „jaotamata“ summa.
7. **Kontroll:** `Σ jaotatud + jaotamata = Σ_i P(i,m)` iga kuu kohta (ümardusviga < 0,01 €).

Nimed: palgafailis `PERENIMI, Eesnimi` → `Eesnimi Perenimi` (Title Case, sidekriips ja
eesti tähed säilivad); võrdlus tõstutundetu, tühikud normaliseeritud. **Aliaste tabel** (vaikimisi
`Nokilai Fomenko → Nikolai Fomenko`) rakendub mõlemale failile enne sidumist.

Väljundread lisatakse kulud-tulud tabelisse (summa negatiivne):

| konto_nimetus | klient_tarnija |
|---|---|
| Tööjõukulud | Palgakulu: *nimi* |
| Tööjõukulud (erand, keskmine tunnihind) | Palgakulu: *nimi* |
| Tööjõukulud (üldkulu jaotus) | Üldkulu jaotus |

Igal real on ka `kuu` ja `nimetus` = projekti algne nimetus tööaja failist.

## Sisendfailid (veerud päise nime järgi)

- **Kulud ja tulud** (`ProSystem OÜ Dimensiooni Projekt detailne aruanne*`): `Kood`, `Nimetus`,
  `Konto nimetus`, `Klient/Tarnija`, `Summa`. Mitu faili liidetakse.
- **Tööaeg** (`Tööaeg*`): päiserida leitakse otsides rida, kus on `Projekt`, `Isik`, `Kuupäev`,
  `Tööaeg`. Projekti nimi täidetakse allapoole; arvesse lähevad read, kus on kuupäev. Kuupäev
  Exceli seerianumber või kuupäev; tööaeg `HH:MM:SS` tekst või Exceli ajaväärtus (päeva murdosa).
- **Palgad** (`Tasude ja tundide aruanne*`): `isik`, `tasuliik`, `arvestuskuu`, `kokku`
  (+ `summa`, `tunde` info jaoks). Read tühja `kokku`-ga (tunniread) jäetakse välja.
- **Valikuline palgafondi kontroll:** Excel veergudega `kuu` ja `PR kanne` (või `kokku`/`summa`).

Puuduv kohustuslik veerg → selge veateade, mis failis ja mis veerg.

## Veebirakendus

- Puhas HTML + CSS + JS (ES moodulid), **ilma build-sammuta**. SheetJS (lokaalselt kaasas: `web/vendor/`,
  mitte CDN-ist) Exceli lugemiseks ja ekspordiks; graafikud oma SVG-na (sõltuvus puudub).
- Moodulid: `parse.js` (tabeli massiiv → normaliseeritud read), `calc.js` (puhtad funktsioonid,
  ülal toodud loogika + kontrollid), `app.js` (UI), `export.js` (Excel eksport).
  `parse.js` ja `calc.js` ei sõltu DOM-ist ega SheetJS-ist → testitavad Node'is.
- **Samm 1 — failid:** kolm lohistusala (+ valikuline kontrollfail), igas mitu faili; iga faili all
  tuvastatud ridade arv ja periood või veateade.
- **Samm 2 — seaded** (vaikimisi eeltäidetud, avatavad paneelid; salvestuvad brauserisse
  `localStorage`-isse, „taasta vaikeväärtused“ nupp):
  - erandtöötajad (Veiko Venig, Koit Roasto, Allar Jõõts);
  - nimede aliased;
  - arvestatavad tasuliigid (linnukesed, vaikimisi kõik; tundmatud märgitud);
  - periood (algus- ja lõppkuu);
  - Kontori tuvastamise muster (`^\p{L}{1,3}[0-9]`);
  - tunnihinna anomaaliate piirid (vaikimisi < 10 € ja > 30 €).
- **Tulemused** — iga plokk eraldi avatav/suletav, kinnisena näitab pealkirjas arvu/summat:
  1. Kokkuvõte: palgafond, jaotatud, jaotamata, projektide arv kategooriate kaupa.
  2. ⚠ Projektid kulud-tuludes, mis ei saanud palgakulu.
  3. ⚠ Palgakuluga projektid, mida kulud-tuludes pole.
  4. ⚠ Nimede mittevasted (tunnid ilma palgata; palk ilma tundideta).
  5. Erandtöötajad kuude kaupa (sh negatiivne ülejääk).
  6. Palgafondi kuukontroll (+ PR kõrvutus, kui kontrollfail on laetud).
  7. Tunnihinna anomaaliad (töötaja × kuu tabel).
  8. Projektide kasumlikkus: sorteerimine (kasum €, marginaal %), projekti valik, tulbad kulude
     kontode kaupa, klõps kontol → tehingute tabel.
  9. **Ekspordi Excel:** lõplik tabel + kõik kontrolltabelid eraldi lehtedel.
- Keel eesti. Disain: impeccable'i põhimõtted (selge hierarhia, loetavad tabelid, mobiilis kasutatav).

## Repo ja avaldamine

- Uus avalik repo **`mssaar/prosystem-projektide-kasumlikkus`**, puhas ajalugu. `.gitignore`
  keelab `*.xlsx`/`*.csv` — andmed ei jõua kunagi repo'sse.
- Andmed hoitakse väljaspool repot: `C:\Proge_(laptop)\RStudio\prosystem-andmed\`.
  Quarto dokument loeb kausta muutujast `andmete_kaust`.
- GitHub Pages läbi GitHub Actionsi, avaldatakse ainult `web/` kaust.
- Vana repo `mssaar/prosystem-praktika` (sisaldab palgafaile ajaloos) kustutab kasutaja ise GitHubist.

## Testimine

- `npm test`: väikesed käsitsi arvutatud näited — tavatöötaja, erand (positiivne ja
  negatiivne ülejääk), Kontor, tunnideta palgasaaja, kuu ilma objektitundideta, aliased, nimede
  teisendus, veergude leidmine päise järgi, tööaja teisendus, kontrollsumma.
- Päris andmetega kontroll: Σ jaotatud + jaotamata = Σ `kokku` iga kuu kohta; R ja JS tulemused
  projektide kaupa kattuvad (< 0,01 €).
- Brauseris käsitsi läbi: failide laadimine, vead, seaded, paneelid, eksport, mobiilivaade.

## Väljaspool ulatust

Masinõpe veebis; serveripool; kasutajakontod; PR-kannete täpne lahtimõtestamine (vajab raamatupidaja
kontopõhist väljavõtet).
