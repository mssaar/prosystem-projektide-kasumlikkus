# ProSystem — projektide kasumlikkus

Projektide (objektide) kasumlikkuse kalkulaator: kulude-tulude aruandele lisatakse palgakulu, mis
tuletatakse tööaja- ja palgaaruannetest. Kaks osa:

- `web/` — staatiline veebirakendus (HTML/CSS/JS ES moodulid, **ilma build-sammuta**), GitHub Pages.
  SheetJS on lokaalselt kaasas (`web/vendor/xlsx.full.min.js`, ei laeta CDN-ist; CSP `script-src 'self'`).
  Kasutaja laeb Excelid brauseris; andmed ei lahku kasutaja arvutist.
- `analyys/Prosystem_Praktika.qmd` — R/Quarto analüüs (sama arvutusloogika + juhumetsa masinõpe).

Disain ja põhjendused: `docs/superpowers/specs/2026-09-29-projektide-kasumlikkus-design.md`.

## Kriitilised reeglid

- **Andmed ei tohi kunagi repo'sse jõuda.** Palgad on konfidentsiaalsed ja repo on avalik.
  `.gitignore` keelab `*.xlsx`/`*.csv`; ära lisa näidisandmeid päris nimede või summadega.
  Päris andmed asuvad `C:\Proge_(laptop)\RStudio\prosystem-andmed\` (väljaspool repot).
  Testides kasuta väljamõeldud nimesid ja summasid.
- **Palgakulu = palgafaili veerg `kokku`** (bruto + sotsmaks + töötuskindlustus). EI korrutata
  1,338-ga — see oli vana viga (maksud topelt).
- **Veerud leitakse päise nime järgi**, mitte asukoha järgi — kasutaja muudab faile käsitsi.
- PR-kannete summa ≠ palgafondi kulu (sisaldab kinnipeetud makse jm). Ära „paranda“ arvutust
  PR-summaga klappima; PR on ainult kõrvutamiseks.
- Arvutused kuu kaupa. Invariant: iga kuu `Σ jaotatud + jaotamata = Σ kokku`. Iga muudatus
  arvutusloogikas peab selle säilitama ja testis kontrollima.

## Arvutusloogika lühidalt

- Tavatöötaja: objektikulu = tunnid × (kuu palk / kuu tunnid).
- Erandtöötajad (seadetes; vaikimisi erandid: vt `VAIKESEADED` failis web/js/calc.js): objektitunnid ×
  kuu tavatöötajate keskmine tunnihind; ülejäänud palk → kuu üldkulupotti.
- Üldkulupotti lähevad ka Kontori tunnid (oma tunnihinnaga) ja tunnideta palgasaajate palk.
- Üldkulupott jaotub kuu objektidele kõigi töötajate objektitundide osakaalu järgi.
- `Kontor` — tööaja projekti koodi `_`-eelne osa ei vasta mustrile `^\p{L}{1,3}[0-9]` (nt „Tööd kontoris_…“); mustrit saab seadetes muuta.
- Nimed: palgafailis `PERENIMI, Eesnimi` → `Eesnimi Perenimi`; aliaste tabel parandab kirjavead.

## Käsud

- Testid: `npm test`
- Lokaalselt vaatamine: `npx serve web` (või `python -m http.server -d web`) — ES moodulid ei tööta
  `file://` kaudu.
- Quarto: renderda RStudios; `andmete_kaust` muutuja dokumendi alguses näitab andmekausta.

## Kood

- `web/js/parse.js` ja `web/js/calc.js` on puhtad funktsioonid (ei sõltu DOM-ist ega SheetJS-ist),
  sisendiks tabelid massiivide massiivina (`sheet_to_json(ws, {header: 1})` kuju). Hoia nii, et
  need jääksid Node'is testitavaks.
- `styles.css`/`app.js` muutmisel suurenda `web/index.html`-is versiooni (`?v=N`), muidu brauseri vahemälu annab uue HTML-iga vana CSS-i.
- UI tekstid ja muutujanimed eesti keeles, nagu R-koodis (`projekti_kood`, `tootaja_nimi`, `kuu`).
- Kasutajale nähtav disain: kasuta `impeccable` skilli.
