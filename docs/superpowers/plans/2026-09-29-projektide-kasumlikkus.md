# Projektide kasumlikkuse kalkulaator — teostusplaan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staatiline veebirakendus (GitHub Pages), mis laeb kolm Exceli kategooriat brauseris, jaotab kogu palgafondi kuu kaupa projektidele (erandtöötajate ja üldkulu loogikaga) ning näitab kasumlikkust ja kõiki andmeprobleeme; R/Quarto analüüs saab samad parandused.

**Architecture:** `web/js/parse.js` (tabel → normaliseeritud read) ja `web/js/calc.js` (puhas arvutus) on DOM-ist ja SheetJS-ist sõltumatud ning testitakse Node'i `node:test`-iga. `web/js/app.js` seob need UI-ga, SheetJS (CDN) loeb/kirjutab Exceleid. Build-sammu pole; Pages avaldab `web/` kausta GitHub Actionsiga.

**Tech Stack:** HTML/CSS/JS ES moodulid, SheetJS 0.20.3 (CDN brauseris, tarball devDependency Node'is), Node ≥ 20 (`node --test`), R 4.5 + tidyverse/readxl (Quarto).

**Spec:** `docs/superpowers/specs/2026-09-29-projektide-kasumlikkus-design.md`

## Global Constraints

- Palgakulu = palgafaili veerg `kokku`; **mitte kunagi** × 1,338.
- Veerud leitakse päise nime järgi (tõstutundetu, tühikud normaliseeritud), mitte asukoha järgi.
- Invariant iga kuu: `otsene + erandite_objektikulu + jaotatud_üldkulu + jaotamata = palgafond` (|vahe| < 0,01 €).
- Vaikimisi erandtöötajad: `Veiko Venig`, `Koit Roasto`, `Allar Jõõts`. Vaikimisi alias: `Nokilai Fomenko → Nikolai Fomenko`.
- Vaikimisi Kontori muster: `^\p{L}{1,3}[0-9]` (unicode lipuga). Projekt = koodi osa enne esimest `_`; kui muster ei sobi → `Kontor`. (Vana `^.[0-9]` liigitas päris projektid IK2/IK3 valesti Kontoriks.)
- Anomaalia piirid vaikimisi: tunnihind < 10 € või > 30 €.
- Andmefailid (`*.xlsx`, `*.csv`) ei tohi repo'sse jõuda; testides ainult väljamõeldud nimed/summad.
- UI keel eesti; kuu kujul `YYYYMM` string.
- Andmed ei lahku brauserist (ei mingit fetch'i andmetega, analüütikat ega välist API-t).

## Review Focus

1. Tööaja lahter on Exceli ajaväärtus (päeva murdosa number), mitte tekst `HH:MM:SS` → tunnid peavad tulema õigesti (× 24). *(Task 1 test „tundideks numbrist“)*
2. Palgafailis on veerud ümber tõstetud, päises lisaveerud ja tühi veerg (nagu kasutaja Projektbüroo fail) → veerud leitakse nime järgi. *(Task 1 test „parsePalgad ümbertõstetud veergudega“)*
3. Sama inimene kahe ettevõtte palgafailis samal kuul → palgad summeeritakse üheks. *(Task 2 test „kaks faili sama isik“)*
4. Erandtöötaja tunnid × keskmine > tema palk → negatiivne ülejääk, invariant kehtib. *(Task 2 test „negatiivne ülejääk“)*
5. Vale fail vales lohistusalas → veateade nimetab faili ja puuduvad veerud; teised failid ja rakendus töötavad edasi. *(Task 1 test „puuduvad veerud“ + Task 4 samm „vale fail“)*

---

## Failide struktuur

```
package.json                 # "type": "module", test-skript, xlsx devDependency
web/index.html               # leht
web/styles.css               # stiilid
web/js/parse.js              # Excel-tabel → read
web/js/calc.js               # arvutus, kontrollid, projektide koond
web/js/export.js             # tulemus → SheetJS töövihik
web/js/app.js                # UI: failid, seaded, tulemuste paneelid, graafik
web/tests/parse.test.js
web/tests/calc.test.js
tools/kontrolli-andmeid.mjs  # päris andmete kontroll Node'is (andmed väljaspool repot)
.github/workflows/pages.yml  # GitHub Pages deploy web/ kaustast
analyys/Prosystem_Praktika.qmd  # R: samad parandused
```

---

### Task 1: parse.js — Exceli tabelite lugemine

**Files:**
- Create: `package.json`, `web/js/parse.js`, `web/tests/parse.test.js`

**Interfaces:**
- Produces:
  - `normTekst(v): string`, `nimeVoti(v): string`, `parseArv(v): number|null`
  - `leiaPaiserida(rows, noutud: string[], failinimi): {reaIndeks, veerud: Record<string,number>, paised: string[]}` — viskab `Error("<fail>: puuduvad veerud „x“, „y“")`
  - `kuuVaartusest(v): string|null` (`"YYYYMM"`), `tundideks(v): number|null`
  - `projektiKood(toores, muster = VAIKIMISI_KONTORI_MUSTER): string`, `VAIKIMISI_KONTORI_MUSTER = '^\\p{L}{1,3}[0-9]'`
  - `teisendaPalgaNimi(isik): string`
  - `parseKuludTulud(rows, failinimi): {projekti_kood, nimetus, konto_nimetus, klient_tarnija, summa, kuu}[]`
  - `parseTooaeg(rows, failinimi): {proj_kood_raw, tootaja_nimi, kuu, tunnid}[]`
  - `parsePalgad(rows, failinimi): {tootaja_nimi, tasuliik, kuu, kokku, fail}[]`
  - `parseKontroll(rows, failinimi): {kuu, summa}[]`
  - `rows` = `XLSX.utils.sheet_to_json(ws, {header: 1, raw: true, defval: null})`

- [ ] **Step 1: package.json**

```json
{
  "name": "prosystem-projektide-kasumlikkus",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test web/tests/",
    "kontroll": "node tools/kontrolli-andmeid.mjs"
  },
  "devDependencies": {
    "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
  }
}
```

- [ ] **Step 2: Kirjuta failivad testid** `web/tests/parse.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normTekst, parseArv, leiaPaiserida, kuuVaartusest, tundideks, projektiKood,
  teisendaPalgaNimi, parseKuludTulud, parseTooaeg, parsePalgad, parseKontroll,
} from '../js/parse.js';

test('normTekst ja parseArv', () => {
  assert.equal(normTekst('  a \n b '), 'a b');
  assert.equal(parseArv('1 234,5'), 1234.5);
  assert.equal(parseArv(''), null);
  assert.equal(parseArv('abc'), null);
  assert.equal(parseArv(-3), -3);
});

test('leiaPaiserida: puuduvad veerud nimetatakse', () => {
  const rows = [['isik', 'tasuliik', 'summa']];
  assert.throws(() => leiaPaiserida(rows, ['isik', 'arvestuskuu', 'kokku'], 'x.xlsx'),
    /x\.xlsx: puuduvad veerud „arvestuskuu“, „kokku“/);
});

test('kuuVaartusest', () => {
  assert.equal(kuuVaartusest(45617), '202411');          // Exceli seerianumber
  assert.equal(kuuVaartusest('45617'), '202411');
  assert.equal(kuuVaartusest(45617.75), '202411');
  assert.equal(kuuVaartusest(202607), '202607');         // juba YYYYMM
  assert.equal(kuuVaartusest('202607'), '202607');
  assert.equal(kuuVaartusest('11.09.2024'), '202409');
  assert.equal(kuuVaartusest('2024-11-21 00:00:00'), '202411');
  assert.equal(kuuVaartusest(null), null);
  assert.equal(kuuVaartusest('Kokku'), null);
});

test('tundideks tekstist', () => {
  assert.equal(tundideks('01:30:00'), 1.5);
  assert.ok(Math.abs(tundideks('68:01:45') - (68 + 1 / 60 + 45 / 3600)) < 1e-9);
  assert.equal(tundideks('02:15'), 2.25);
});

test('tundideks numbrist (Exceli ajaväärtus = päeva murdosa)', () => {
  assert.equal(tundideks(0.0625), 1.5);
});

test('projektiKood', () => {
  assert.equal(projektiKood('K5_Näidise 1 UPS käit'), 'K5');
  assert.equal(projektiKood('E720_Näidiskool'), 'E720');
  assert.equal(projektiKood('IK3_Näidisobjektide käit'), 'IK3');
  assert.equal(projektiKood('Tööd kontoris_Veiko'), 'Kontor');
  assert.equal(projektiKood('Avariitöö_Koit'), 'Kontor');
  assert.equal(projektiKood('* Projekt määramata'), 'Kontor');
  assert.equal(projektiKood(''), 'Kontor');
  assert.equal(projektiKood('IK3_x', '^.[0-9]'), 'Kontor');  // vana muster
});

test('teisendaPalgaNimi', () => {
  assert.equal(teisendaPalgaNimi('TAMM, Mari'), 'Mari Tamm');
  assert.equal(teisendaPalgaNimi('KÄŠPER, Anne-Liis'), 'Anne-Liis Käšper');
  assert.equal(teisendaPalgaNimi('Juba Õige'), 'Juba Õige');
});

test('parseKuludTulud', () => {
  const rows = [
    ['Kood', 'Nimetus', 'Konto kood', 'Konto nimetus', 'Klient/Tarnija', 'Dok. kuupäev', 'Summa'],
    ['A1', 'A1 Kool', 4021, 'Valgustid', 'Tarnija OÜ', '11.09.2024', -595.4],
    ['A1', 'A1 Kool', 3004, 'Müügitulu', 'Klient AS', '30.09.2024', 1000],
    ['A1', 'A1 Kool', 4021, 'Valgustid', 'Tarnija OÜ', '30.09.2024', null],   // summata → välja
  ];
  const r = parseKuludTulud(rows, 'kt.xlsx');
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], {
    projekti_kood: 'A1', nimetus: 'A1 Kool', konto_nimetus: 'Valgustid',
    klient_tarnija: 'Tarnija OÜ', summa: -595.4, kuu: '202409',
  });
});

test('parseTooaeg: projekt täidetakse allapoole, vahesummad jäetakse välja', () => {
  const rows = [
    ['Tööaja aruanne: Projektid', null, null, '70513:08:39'],
    [null, null, null, null],
    ['Projekt', 'Isik', 'Kuupäev', 'Tööaeg'],
    ['A1_Kool', null, null, '87:35:25'],
    [null, 'Mari Tamm', null, '01:30:00'],
    [null, 'Mari Tamm', 45617, '01:30:00'],
    ['Tööd kontoris_Mari', null, null, '10:00:00'],
    [null, 'Mari Tamm', 45618, '02:00:00'],
  ];
  assert.deepEqual(parseTooaeg(rows, 't.xlsx'), [
    { proj_kood_raw: 'A1_Kool', tootaja_nimi: 'Mari Tamm', kuu: '202411', tunnid: 1.5 },
    { proj_kood_raw: 'Tööd kontoris_Mari', tootaja_nimi: 'Mari Tamm', kuu: '202411', tunnid: 2 },
  ]);
});

test('parsePalgad ümbertõstetud veergudega (kasutaja muudetud fail)', () => {
  const rows = [
    ['isik', 'tasuliik', null, 'tunde', 'summa', 'konto', 'sotsmaks', 'arvestuskuu', 'kokku', null, 'PR kanne', 'kuu'],
    ['TAMM, Mari', 'Kuupalk', null, 160, 2000, '4710', 660, '202607', 2676, null, 5000, 202607],
    ['TAMM, Mari', 'Tunnitasu', null, 12, null, '4710', null, '202607', null, null, null, null], // tunnirida
  ];
  assert.deepEqual(parsePalgad(rows, 'p.xlsx'), [
    { tootaja_nimi: 'Mari Tamm', tasuliik: 'Kuupalk', kuu: '202607', kokku: 2676, fail: 'p.xlsx' },
  ]);
});

test('parseKontroll eelistab veergu „PR kanne“', () => {
  const rows = [
    ['isik', 'kokku', 'PR kanne', 'kuu'],
    ['TAMM, Mari', 2676, 3210.55, 202607],
    ['TAMM, Mari', 335, 3190.45, 202606],
    ['TAMM, Mari', 100, null, null],
  ];
  assert.deepEqual(parseKontroll(rows, 'k.xlsx'), [
    { kuu: '202607', summa: 3210.55 }, { kuu: '202606', summa: 3190.45 },
  ]);
});

test('parseKontroll: KOKKU veerg (palga kontroll.xlsx kuju)', () => {
  const rows = [
    ['Kande kuupäev', 'PROSYSTEM', 'KOKKU', 'kuu', 'kokku_palgakulu'],
    ['31.07.2026', 60000.5, 85000.25, 202607, 77000.75],
  ];
  assert.deepEqual(parseKontroll(rows, 'k.xlsx'), [{ kuu: '202607', summa: 85000.25 }]);
});
```

- [ ] **Step 3: Käivita, veendu et kukub läbi**

Run: `node --test web/tests/` — Expected: FAIL, `Cannot find module '../js/parse.js'`.

- [ ] **Step 4: Kirjuta `web/js/parse.js`**

```js
// Exceli tabelite (massiivide massiiv, SheetJS sheet_to_json {header: 1}) teisendamine
// normaliseeritud ridadeks. Ei sõltu DOM-ist ega SheetJS-ist — testitav Node'is.

export const VAIKIMISI_KONTORI_MUSTER = '^\\p{L}{1,3}[0-9]';

export const normTekst = (v) =>
  String(v ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();

export const nimeVoti = (v) => normTekst(v).toLocaleLowerCase('et');

export function parseArv(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = normTekst(v).replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Otsib esimesest 30 reast päiserea, kus on kõik nõutud veerud (nime järgi).
export function leiaPaiserida(rows, noutud, failinimi) {
  const votmed = noutud.map(nimeVoti);
  let parimPuudu = noutud;
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const paised = (rows[r] ?? []).map(nimeVoti);
    const veerud = {};
    votmed.forEach((v, i) => {
      const j = paised.indexOf(v);
      if (j >= 0) veerud[noutud[i]] = j;
    });
    const puudu = noutud.filter((n) => !(n in veerud));
    if (puudu.length === 0) return { reaIndeks: r, veerud, paised };
    if (puudu.length < parimPuudu.length) parimPuudu = puudu;
  }
  throw new Error(`${failinimi}: puuduvad veerud ${parimPuudu.map((p) => `„${p}“`).join(', ')}`);
}

const kuuKuju = (aasta, kuu) => `${aasta}${String(kuu).padStart(2, '0')}`;

export function kuuVaartusest(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return kuuKuju(v.getFullYear(), v.getMonth() + 1);
  const n = parseArv(v);
  if (n != null && n >= 190001 && n <= 299912) return String(Math.trunc(n));
  if (n != null && n > 20000 && n < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
    return kuuKuju(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }
  const t = normTekst(v);
  const iso = t.match(/^(\d{4})-(\d{2})/);
  if (iso) return iso[1] + iso[2];
  const ee = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ee) return kuuKuju(ee[3], ee[2]);
  return null;
}

// "68:01:45" → 68.029…; Exceli ajaväärtus (päeva murdosa) → × 24.
export function tundideks(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v * 24 : null;
  const osad = normTekst(v).split(':');
  if (osad.length >= 2) {
    const [h, m, s = 0] = osad.map(Number);
    return [h, m, s].some(Number.isNaN) ? null : h + m / 60 + s / 3600;
  }
  return parseArv(v);
}

export function projektiKood(toores, muster = VAIKIMISI_KONTORI_MUSTER) {
  const osa = normTekst(toores).split('_')[0];
  return osa && new RegExp(muster, 'u').test(osa) ? osa : 'Kontor';
}

const suurAlgustaht = (t) =>
  t.toLocaleLowerCase('et').replace(/(^|[\s-])(\p{L})/gu, (_, ees, taht) => ees + taht.toLocaleUpperCase('et'));

// "TAMM, Mari" → "Mari Tamm"
export function teisendaPalgaNimi(isik) {
  const t = normTekst(isik);
  const osad = t.split(/\s*,\s*/);
  return osad.length === 2 ? suurAlgustaht(`${osad[1]} ${osad[0]}`) : t;
}

const lahter = (rida, j) => (j == null || j < 0 ? null : rida?.[j] ?? null);

export function parseKuludTulud(rows, failinimi) {
  const { reaIndeks, veerud, paised } = leiaPaiserida(
    rows, ['Kood', 'Nimetus', 'Konto nimetus', 'Klient/Tarnija', 'Summa'], failinimi);
  const kpVeerg = paised.indexOf(nimeVoti('Dok. kuupäev'));
  const read = [];
  for (const rida of rows.slice(reaIndeks + 1)) {
    const summa = parseArv(lahter(rida, veerud.Summa));
    const kood = normTekst(lahter(rida, veerud.Kood));
    if (summa == null || kood === '') continue;
    read.push({
      projekti_kood: kood,
      nimetus: normTekst(lahter(rida, veerud.Nimetus)),
      konto_nimetus: normTekst(lahter(rida, veerud['Konto nimetus'])),
      klient_tarnija: normTekst(lahter(rida, veerud['Klient/Tarnija'])),
      summa,
      kuu: kuuVaartusest(lahter(rida, kpVeerg)),
    });
  }
  return read;
}

export function parseTooaeg(rows, failinimi) {
  const { reaIndeks, veerud } = leiaPaiserida(rows, ['Projekt', 'Isik', 'Kuupäev', 'Tööaeg'], failinimi);
  const read = [];
  let projekt = '';
  for (const rida of rows.slice(reaIndeks + 1)) {
    const p = normTekst(lahter(rida, veerud.Projekt));
    if (p) projekt = p;
    const kuu = kuuVaartusest(lahter(rida, veerud['Kuupäev']));
    const nimi = normTekst(lahter(rida, veerud.Isik));
    const tunnid = tundideks(lahter(rida, veerud['Tööaeg']));
    if (!kuu || !nimi || tunnid == null) continue;
    read.push({ proj_kood_raw: projekt, tootaja_nimi: nimi, kuu, tunnid });
  }
  return read;
}

export function parsePalgad(rows, failinimi) {
  const { reaIndeks, veerud } = leiaPaiserida(rows, ['isik', 'tasuliik', 'arvestuskuu', 'kokku'], failinimi);
  const read = [];
  for (const rida of rows.slice(reaIndeks + 1)) {
    const kokku = parseArv(lahter(rida, veerud.kokku));
    const kuu = kuuVaartusest(lahter(rida, veerud.arvestuskuu));
    const isik = normTekst(lahter(rida, veerud.isik));
    if (kokku == null || !kuu || !isik) continue;
    read.push({
      tootaja_nimi: teisendaPalgaNimi(isik),
      tasuliik: normTekst(lahter(rida, veerud.tasuliik)),
      kuu, kokku, fail: failinimi,
    });
  }
  return read;
}

// Valikuline palgafondi kontroll (nt PR-kannete summad kuude kaupa).
export function parseKontroll(rows, failinimi) {
  for (const summaVeerg of ['PR kanne', 'kokku', 'summa']) {
    let leitud;
    try { leitud = leiaPaiserida(rows, ['kuu', summaVeerg], failinimi); } catch { continue; }
    const { reaIndeks, veerud } = leitud;
    const read = [];
    for (const rida of rows.slice(reaIndeks + 1)) {
      const kuu = kuuVaartusest(lahter(rida, veerud.kuu));
      const summa = parseArv(lahter(rida, veerud[summaVeerg]));
      if (kuu && summa != null) read.push({ kuu, summa });
    }
    return read;
  }
  throw new Error(`${failinimi}: kontrollfailis peavad olema veerud „kuu“ ja „PR kanne“ (või „kokku“/„summa“)`);
}
```

- [ ] **Step 5: Käivita testid** — `npm test` → kõik PASS.

- [ ] **Step 6: Commit** — `git add package.json web/js/parse.js web/tests/parse.test.js && git commit -m "Exceli failide lugemine päise nime järgi (parse.js) + testid"`

---

### Task 2: calc.js — palgakulu jaotus, kontrollid, projektide koond

**Files:**
- Create: `web/js/calc.js`, `web/tests/calc.test.js`

**Interfaces:**
- Consumes: `normTekst`, `nimeVoti`, `projektiKood`, `VAIKIMISI_KONTORI_MUSTER` (Task 1); parse* väljundid.
- Produces:
  - `TEADAOLEVAD_TASULIIGID: string[]`, `VAIKESEADED`, `looSeaded(osaline?)`
  - `arvuta({kuludTulud, tooaeg, palgad, kontroll?}, seaded) → Tulemus`:
    `{ palgaread, lopptabel, kuud, tunnihinnad, erandid, tunnideta, palgata, anomaaliad,
       projektidIlmaPalgata, palkIlmaKuluTuluta, kategooriad, tundmatudTasuliigid, hoiatused }`
    - `palgaread[i] = {projekti_kood, nimetus, konto_nimetus, klient_tarnija, summa (<0), kuu}`
    - `kuud[i] = {kuu, palgafond, otsene, erandite_objektikulu, yldkulu, jaotatud, jaotamata, keskmine_tunnihind, objektitunnid, vahe, kontroll}` (`kontroll` = kontrollfaili summa või `null`)
  - `projektiKoond(read) → {projekti_kood, nimetus, tulu, kulu, kasum, marginaal}[]`
  - `kontodeKaupa(read, kood) → {konto_nimetus, tulu, kulu}[]` (kulu kahanevalt)
  - konto nimetused: `KONTO_OTSENE = 'Tööjõukulud'`, `KONTO_ERAND = 'Tööjõukulud (erand, keskmine tunnihind)'`, `KONTO_YLDKULU = 'Tööjõukulud (üldkulu jaotus)'`

- [ ] **Step 1: Kirjuta failivad testid** `web/tests/calc.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arvuta, projektiKoond, kontodeKaupa, looSeaded, KONTO_YLDKULU } from '../js/calc.js';

const lahedal = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);
const summa = (read, f) => read.filter(f).reduce((s, r) => s + r.summa, 0);
const t = (raw, nimi, kuu, tunnid) => ({ proj_kood_raw: raw, tootaja_nimi: nimi, kuu, tunnid });
const p = (nimi, kuu, kokku, tasuliik = 'Kuupalk', fail = 'a.xlsx') => ({ tootaja_nimi: nimi, tasuliik, kuu, kokku, fail });
const seaded = looSeaded({ erandid: ['Erand Mees'], aliased: [] });

// Käsitsi arvutatud näide (kuu 202401):
// Tava Üks 3000 €, P1 100 h + Kontor 50 h → 20 €/h; Tava Kaks 2000 €, P2 100 h → 20 €/h
// Erand Mees 4000 €, P1 10 h; Tunnideta Naine 1000 €
// keskmine = 5000/250 = 20; otsene P1 2000, P2 2000; erand P1 200
// üldkulu = 1000 (Kontor) + 3800 (erandi ülejääk) + 1000 (tunnideta) = 5800
// objektitunnid P1 110, P2 100 → P1 5800·110/210, P2 5800·100/210
const baas = {
  kuludTulud: [
    { projekti_kood: 'P1', nimetus: 'P1 Kool', konto_nimetus: 'Müük', klient_tarnija: 'K', summa: 9000, kuu: '202401' },
    { projekti_kood: 'P3', nimetus: 'P3 Maja', konto_nimetus: 'Müük', klient_tarnija: 'K', summa: 500, kuu: '202401' },
  ],
  tooaeg: [
    t('P1_Kool', 'Tava Üks', '202401', 100), t('Tööd kontoris_Tava', 'Tava Üks', '202401', 50),
    t('P2_Park', 'Tava Kaks', '202401', 100), t('P1_Kool', 'Erand Mees', '202401', 10),
  ],
  palgad: [p('Tava Üks', '202401', 3000), p('Tava Kaks', '202401', 2000),
    p('Erand Mees', '202401', 4000), p('Tunnideta Naine', '202401', 1000)],
};

test('käsitsi arvutatud näide', () => {
  const r = arvuta(baas, seaded);
  const k = r.kuud[0];
  lahedal(k.palgafond, 10000);
  lahedal(k.keskmine_tunnihind, 20);
  lahedal(k.otsene, 4000);
  lahedal(k.erandite_objektikulu, 200);
  lahedal(k.yldkulu, 5800);
  lahedal(k.jaotamata, 0);
  lahedal(k.vahe, 0);
  lahedal(summa(r.palgaread, (x) => x.projekti_kood === 'P1'), -(2000 + 200 + 5800 * 110 / 210));
  lahedal(summa(r.palgaread, (x) => x.projekti_kood === 'P2'), -(2000 + 5800 * 100 / 210));
  assert.equal(r.palgaread.find((x) => x.projekti_kood === 'P1').nimetus, 'P1_Kool');
  assert.ok(!r.palgaread.some((x) => x.projekti_kood === 'Kontor'));
  assert.deepEqual(r.erandid.map((e) => [e.tootaja_nimi, e.ylejaak]), [['Erand Mees', 3800]]);
  assert.deepEqual(r.tunnideta.map((x) => [x.tootaja_nimi, x.pole_tooajas]), [['Tunnideta Naine', true]]);
  assert.deepEqual(r.projektidIlmaPalgata.map((x) => x.projekti_kood), ['P3']);
  assert.deepEqual(r.palkIlmaKuluTuluta.map((x) => x.projekti_kood), ['P2']);
  assert.deepEqual(r.kategooriad, { molemad: 1, vaidKuluTulu: 1, vaidPalk: 1 });
  assert.equal(r.lopptabel.length, 2 + r.palgaread.length);
});

test('negatiivne ülejääk: erandi tunnid × keskmine > palk, invariant kehtib', () => {
  const r = arvuta({ ...baas, palgad: [p('Tava Üks', '202401', 3000), p('Tava Kaks', '202401', 2000), p('Erand Mees', '202401', 100)] }, seaded);
  lahedal(r.erandid[0].ylejaak, -100);
  lahedal(r.kuud[0].vahe, 0);
  assert.ok(r.hoiatused.some((h) => h.includes('negatiivne')));
});

test('kaks faili sama isik samal kuul → summeeritakse', () => {
  const r = arvuta({ ...baas, palgad: [p('Tava Üks', '202401', 1000, 'Kuupalk', 'a.xlsx'), p('Tava Üks', '202401', 2000, 'Kuupalk', 'b.xlsx'), p('Tava Kaks', '202401', 2000)] }, seaded);
  lahedal(r.tunnihinnad.find((x) => x.tootaja_nimi === 'Tava Üks').tunnihind, 20);
});

test('kuu ilma objektitundideta → jaotamata', () => {
  const r = arvuta({ ...baas, palgad: [...baas.palgad, p('Tava Üks', '202402', 777)] }, seaded);
  const k = r.kuud.find((x) => x.kuu === '202402');
  lahedal(k.jaotamata, 777);
  lahedal(k.vahe, 0);
});

test('aliased ja palgata tunnid', () => {
  const r = arvuta({
    ...baas,
    tooaeg: [...baas.tooaeg, t('P1_Kool', 'Kirjavea Nimi', '202401', 5), t('P1_Kool', 'Ilma Palgata', '202401', 7)],
    palgad: [...baas.palgad, p('Kirjaviga Nimi', '202401', 500)],
  }, looSeaded({ erandid: ['Erand Mees'], aliased: [{ kust: 'Kirjaviga Nimi', kuhu: 'Kirjavea Nimi' }] }));
  assert.ok(r.tunnihinnad.some((x) => x.tootaja_nimi === 'Kirjavea Nimi'));
  assert.deepEqual(r.palgata.map((x) => [x.tootaja_nimi, x.tunnid]), [['Ilma Palgata', 7]]);
  lahedal(r.kuud[0].vahe, 0);
});

test('tasuliigi väljajätmine ja tundmatu tasuliik', () => {
  const r = arvuta({ ...baas, palgad: [...baas.palgad, p('Tava Üks', '202401', 999, 'Autokompensatsioon'), p('Tava Üks', '202401', 1, 'Uus imelik tasu')] },
    looSeaded({ erandid: ['Erand Mees'], aliased: [], valjaJaetudTasuliigid: ['Autokompensatsioon'] }));
  lahedal(r.kuud[0].palgafond, 10001);
  assert.deepEqual(r.tundmatudTasuliigid, ['Uus imelik tasu']);
});

test('periood filtreerib kõik kolm allikat', () => {
  const r = arvuta({ ...baas, palgad: [...baas.palgad, p('Tava Üks', '202402', 777)] },
    looSeaded({ erandid: ['Erand Mees'], aliased: [], periood: { algus: '202402', lopp: '202402' } }));
  assert.deepEqual(r.kuud.map((k) => k.kuu), ['202402']);
  assert.equal(r.lopptabel.filter((x) => x.konto_nimetus === 'Müük').length, 0);
});

test('kontrollfaili summa lisatakse kuule', () => {
  const r = arvuta({ ...baas, kontroll: [{ kuu: '202401', summa: 15000 }] }, seaded);
  assert.equal(r.kuud[0].kontroll, 15000);
});

test('projektiKoond ja kontodeKaupa', () => {
  const r = arvuta(baas, seaded);
  const p1 = projektiKoond(r.lopptabel).find((x) => x.projekti_kood === 'P1');
  assert.equal(p1.nimetus, 'P1 Kool');
  lahedal(p1.tulu, 9000);
  lahedal(p1.kasum, 9000 - p1.kulu);
  const p2 = projektiKoond(r.lopptabel).find((x) => x.projekti_kood === 'P2');
  assert.equal(p2.marginaal, -100);
  const kontod = kontodeKaupa(r.lopptabel, 'P1');
  assert.ok(kontod.some((k) => k.konto_nimetus === KONTO_YLDKULU));
});
```

- [ ] **Step 2: Käivita** — `npm test` → FAIL (`Cannot find module '../js/calc.js'`).

- [ ] **Step 3: Kirjuta `web/js/calc.js`**

```js
// Palgakulu jaotus projektidele kuu kaupa. Puhtad funktsioonid (ilma DOM-i ja SheetJS-ita).
import { normTekst, nimeVoti, projektiKood, VAIKIMISI_KONTORI_MUSTER } from './parse.js';

export const KONTO_OTSENE = 'Tööjõukulud';
export const KONTO_ERAND = 'Tööjõukulud (erand, keskmine tunnihind)';
export const KONTO_YLDKULU = 'Tööjõukulud (üldkulu jaotus)';

export const TEADAOLEVAD_TASULIIGID = [
  'Kuupalk', 'Kombineeritud tasu', 'Lepinguline tasu', 'Lisatasu', 'Põhipuhkuse tasu',
  'Puhkusetasu kompensatsioon', 'Tunnitasu', 'Katkestatud põhipuhkuse tasaarveldus',
  'Pikendatud puhkuse tasu', 'Pikendatud puhkuse tasu kompensatsioon', 'Juhatuse liikme tasu',
  'Lepingu summa', 'Koondamistasu', 'Töövõimetuse hüvitis', 'Autokompensatsioon',
  'Autokompensatsioon (päevikuga)',
];

export const VAIKESEADED = Object.freeze({
  erandid: ['Veiko Venig', 'Koit Roasto', 'Allar Jõõts'],
  aliased: [{ kust: 'Nokilai Fomenko', kuhu: 'Nikolai Fomenko' }],
  valjaJaetudTasuliigid: [],
  periood: { algus: '', lopp: '' },
  kontoriMuster: VAIKIMISI_KONTORI_MUSTER,
  anomaalia: { alla: 10, ule: 30 },
});

export const looSeaded = (osaline = {}) => ({ ...structuredClone(VAIKESEADED), ...osaline });

const vahemikus = (kuu, { algus, lopp }) =>
  !kuu || ((!algus || kuu >= algus) && (!lopp || kuu <= lopp));
const saa = (map, voti, loo) => {
  if (!map.has(voti)) map.set(voti, loo());
  return map.get(voti);
};
const summaMap = (m) => [...m.values()].reduce((s, v) => s + v, 0);
const eur = (x) => x.toLocaleString('et-EE', { maximumFractionDigits: 2 });

export function arvuta({ kuludTulud, tooaeg, palgad, kontroll = [] }, seadedSisse) {
  const s = looSeaded(seadedSisse);
  const aliased = new Map(s.aliased.filter((a) => normTekst(a.kust) && normTekst(a.kuhu))
    .map((a) => [nimeVoti(a.kust), normTekst(a.kuhu)]));
  const nimi = (n) => aliased.get(nimeVoti(n)) ?? normTekst(n);
  const erandid = new Set(s.erandid.map(nimeVoti).filter(Boolean));
  const valjas = new Set(s.valjaJaetudTasuliigid.map(nimeVoti));
  const teada = new Set(TEADAOLEVAD_TASULIIGID.map(nimeVoti));
  const hoiatused = [];

  const tundmatudTasuliigid = [...new Set(palgad.map((x) => x.tasuliik)
    .filter((tl) => !teada.has(nimeVoti(tl))))].sort();

  // palk: kuu → isiku võti → {nimi, palk}
  const palk = new Map();
  for (const r of palgad) {
    if (!vahemikus(r.kuu, s.periood) || valjas.has(nimeVoti(r.tasuliik))) continue;
    const n = nimi(r.tootaja_nimi);
    saa(saa(palk, r.kuu, () => new Map()), nimeVoti(n), () => ({ nimi: n, palk: 0 })).palk += r.kokku;
  }

  // tunnid: kuu → isiku võti → {nimi, projektid: kood → h, kontor, kokku}
  const tunnid = new Map();
  const nimetused = new Map();
  const tooajaNimed = new Set();
  for (const r of tooaeg) {
    const n = nimi(r.tootaja_nimi);
    const v = nimeVoti(n);
    tooajaNimed.add(v);
    if (!vahemikus(r.kuu, s.periood)) continue;
    const kood = projektiKood(r.proj_kood_raw, s.kontoriMuster);
    const k = saa(saa(tunnid, r.kuu, () => new Map()), v,
      () => ({ nimi: n, projektid: new Map(), kontor: 0, kokku: 0 }));
    if (kood === 'Kontor') k.kontor += r.tunnid;
    else {
      k.projektid.set(kood, (k.projektid.get(kood) ?? 0) + r.tunnid);
      if (!nimetused.has(kood)) nimetused.set(kood, r.proj_kood_raw);
    }
    k.kokku += r.tunnid;
  }

  const kontrollKuud = new Map();
  for (const r of kontroll) kontrollKuud.set(r.kuu, (kontrollKuud.get(r.kuu) ?? 0) + r.summa);

  const palgaread = [];
  const rida = (kood, konto, klient, summa, kuu) => palgaread.push({
    projekti_kood: kood, nimetus: nimetused.get(kood) ?? kood,
    konto_nimetus: konto, klient_tarnija: klient, summa: -summa, kuu,
  });

  const kuud = [], tunnihinnad = [], erandiTabel = [], tunnideta = [];
  const palgata = new Map();
  const koikKuud = [...new Set([...palk.keys(), ...tunnid.keys()])].sort();

  for (const kuu of koikKuud) {
    const P = palk.get(kuu) ?? new Map();
    const T = tunnid.get(kuu) ?? new Map();

    let tavaPalk = 0, tavaTunnid = 0;
    for (const [v, x] of T) {
      if (erandid.has(v) || !P.has(v) || x.kokku <= 0) continue;
      tavaPalk += P.get(v).palk;
      tavaTunnid += x.kokku;
    }
    const keskmine = tavaTunnid > 0 ? tavaPalk / tavaTunnid : null;

    const objektitunnid = new Map();
    for (const x of T.values()) {
      for (const [kood, h] of x.projektid) objektitunnid.set(kood, (objektitunnid.get(kood) ?? 0) + h);
    }
    const objektitunnidKokku = summaMap(objektitunnid);

    let palgafond = 0, otsene = 0, erandObj = 0, pott = 0;
    const isikud = new Set([...P.keys(), ...[...T.keys()].filter((v) => erandid.has(v))]);
    for (const v of isikud) {
      const x = T.get(v);
      const palgaSumma = P.get(v)?.palk ?? 0;
      const kuvaNimi = x?.nimi ?? P.get(v).nimi;
      palgafond += palgaSumma;

      if (erandid.has(v)) {
        let obj = 0;
        if (x && keskmine != null) {
          for (const [kood, h] of x.projektid) {
            obj += h * keskmine;
            rida(kood, KONTO_ERAND, `Palgakulu: ${kuvaNimi}`, h * keskmine, kuu);
          }
        } else if (x && x.projektid.size > 0) {
          hoiatused.push(`${kuu}: tavatöötajate tunde pole — ${kuvaNimi} objektitunnid hinnatud 0-ga, palk läheb üldkulusse`);
        }
        const ylejaak = palgaSumma - obj;
        erandObj += obj;
        pott += ylejaak;
        if (ylejaak < 0) hoiatused.push(`${kuu}: ${kuvaNimi} ülejääk on negatiivne (${eur(ylejaak)} €)`);
        erandiTabel.push({
          kuu, tootaja_nimi: kuvaNimi, palk: palgaSumma,
          objektitunnid: x ? summaMap(x.projektid) : 0, kontoritunnid: x?.kontor ?? 0,
          keskmine_tunnihind: keskmine, objektikulu: obj, ylejaak,
        });
      } else if (x && x.kokku > 0) {
        const hind = palgaSumma / x.kokku;
        tunnihinnad.push({ kuu, tootaja_nimi: kuvaNimi, palk: palgaSumma, tunnid: x.kokku, tunnihind: hind });
        for (const [kood, h] of x.projektid) {
          otsene += h * hind;
          rida(kood, KONTO_OTSENE, `Palgakulu: ${kuvaNimi}`, h * hind, kuu);
        }
        pott += x.kontor * hind;
      } else {
        pott += palgaSumma;
        tunnideta.push({ kuu, tootaja_nimi: kuvaNimi, palk: palgaSumma, pole_tooajas: !tooajaNimed.has(v) });
      }
    }

    for (const [v, x] of T) {
      if (erandid.has(v) || P.has(v)) continue;
      const k = saa(palgata, v, () => ({ tootaja_nimi: x.nimi, kuud: [], tunnid: 0 }));
      k.kuud.push(kuu);
      k.tunnid += x.kokku;
    }

    let jaotatud = 0, jaotamata = 0;
    if (objektitunnidKokku > 0) {
      if (pott !== 0) {
        for (const [kood, h] of objektitunnid) {
          const osa = (pott * h) / objektitunnidKokku;
          jaotatud += osa;
          rida(kood, KONTO_YLDKULU, 'Üldkulu jaotus', osa, kuu);
        }
      }
    } else {
      jaotamata = pott;
    }
    const jaotatudKokku = otsene + erandObj + jaotatud;
    kuud.push({
      kuu, palgafond, otsene, erandite_objektikulu: erandObj, yldkulu: pott,
      jaotatud: jaotatudKokku, jaotamata, keskmine_tunnihind: keskmine,
      objektitunnid: objektitunnidKokku, vahe: palgafond - jaotatudKokku - jaotamata,
      kontroll: kontrollKuud.get(kuu) ?? null,
    });
    if (jaotamata !== 0) hoiatused.push(`${kuu}: objektitunde pole, ${eur(jaotamata)} € jäi jaotamata`);
  }

  const kt = kuludTulud.filter((r) => vahemikus(r.kuu, s.periood));
  const ktNimetus = new Map();
  for (const r of kt) if (!ktNimetus.has(r.projekti_kood)) ktNimetus.set(r.projekti_kood, r.nimetus);
  const palgaSummad = new Map();
  for (const r of palgaread) palgaSummad.set(r.projekti_kood, (palgaSummad.get(r.projekti_kood) ?? 0) + r.summa);

  const projektidIlmaPalgata = [...ktNimetus].filter(([k]) => !palgaSummad.has(k))
    .map(([projekti_kood, nimetus]) => ({ projekti_kood, nimetus }))
    .sort((a, b) => a.projekti_kood.localeCompare(b.projekti_kood, 'et'));
  const palkIlmaKuluTuluta = [...palgaSummad].filter(([k]) => !ktNimetus.has(k))
    .map(([projekti_kood, s2]) => ({ projekti_kood, nimetus: nimetused.get(projekti_kood) ?? projekti_kood, palgakulu: s2 }))
    .sort((a, b) => a.palgakulu - b.palgakulu);
  const molemad = [...palgaSummad.keys()].filter((k) => ktNimetus.has(k)).length;

  const anomaaliad = tunnihinnad.filter((r) => r.tunnihind < s.anomaalia.alla || r.tunnihind > s.anomaalia.ule);

  return {
    palgaread,
    lopptabel: [...kt, ...palgaread],
    kuud, tunnihinnad, erandid: erandiTabel, tunnideta,
    palgata: [...palgata.values()],
    anomaaliad, projektidIlmaPalgata, palkIlmaKuluTuluta,
    kategooriad: { molemad, vaidKuluTulu: projektidIlmaPalgata.length, vaidPalk: palkIlmaKuluTuluta.length },
    tundmatudTasuliigid, hoiatused,
  };
}

export function projektiKoond(read) {
  const m = new Map();
  for (const r of read) {
    const k = saa(m, r.projekti_kood, () => ({ projekti_kood: r.projekti_kood, nimetus: '', tulu: 0, kulu: 0 }));
    if (!k.nimetus && r.nimetus) k.nimetus = r.nimetus;
    if (r.summa > 0) k.tulu += r.summa; else k.kulu -= r.summa;
  }
  return [...m.values()].map((k) => ({
    ...k,
    nimetus: k.nimetus || k.projekti_kood,
    kasum: k.tulu - k.kulu,
    marginaal: k.tulu > 0 ? ((k.tulu - k.kulu) / k.tulu) * 100 : -100,
  }));
}

export function kontodeKaupa(read, kood) {
  const m = new Map();
  for (const r of read) {
    if (r.projekti_kood !== kood) continue;
    const k = saa(m, r.konto_nimetus || '(konto puudub)', () => ({ konto_nimetus: r.konto_nimetus || '(konto puudub)', tulu: 0, kulu: 0 }));
    if (r.summa > 0) k.tulu += r.summa; else k.kulu -= r.summa;
  }
  return [...m.values()].sort((a, b) => (b.kulu + b.tulu) - (a.kulu + a.tulu));
}
```

- [ ] **Step 4: Käivita** — `npm test` → kõik PASS.

- [ ] **Step 5: Commit** — `git commit -m "Palgakulu jaotus kuu kaupa (calc.js) + testid"`

---

### Task 3: Päris andmete kontrollskript

**Files:**
- Create: `tools/kontrolli-andmeid.mjs`

**Interfaces:**
- Consumes: kõik Task 1–2 ekspordid; `xlsx` npm pakett.
- Produces: CLI `node tools/kontrolli-andmeid.mjs [andmekaust]` (vaikimisi `../prosystem-andmed`), trükib kuude tabeli, invariandi, probleemide arvud; `--json <fail>` kirjutab projektide palgakulu JSON-i R-iga võrdlemiseks.

- [ ] **Step 1: `npm install`** (laeb SheetJS tarball'i).

- [ ] **Step 2: Kirjuta skript**

```js
// Päris andmete kontroll: node tools/kontrolli-andmeid.mjs [andmekaust] [--json väljund.json]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { parseKuludTulud, parseTooaeg, parsePalgad, parseKontroll } from '../web/js/parse.js';
import { arvuta } from '../web/js/calc.js';

const argumendid = process.argv.slice(2);
const jsonIdx = argumendid.indexOf('--json');
const jsonFail = jsonIdx >= 0 ? argumendid[jsonIdx + 1] : null;
const kaust = argumendid.find((a, i) => !a.startsWith('--') && i !== jsonIdx + 1) ?? '../prosystem-andmed';

const failid = readdirSync(kaust).filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$'));
const loe = (f) => {
  const wb = XLSX.read(readFileSync(join(kaust, f)));
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
};
const vali = (re, parse) => failid.filter((f) => re.test(f)).flatMap((f) => parse(loe(f), f));

const sisend = {
  kuludTulud: vali(/^ProSystem OÜ Dimensiooni Projekt detailne aruanne/, parseKuludTulud),
  tooaeg: vali(/^Tööaeg/, parseTooaeg),
  palgad: vali(/^Tasude ja tundide aruanne/, parsePalgad),
  kontroll: vali(/^palga kontroll/, parseKontroll),
};
console.log('Ridu:', Object.fromEntries(Object.entries(sisend).map(([k, v]) => [k, v.length])));

const r = arvuta(sisend, {});
console.table(r.kuud.map((k) => ({
  kuu: k.kuu, palgafond: k.palgafond.toFixed(2), jaotatud: k.jaotatud.toFixed(2),
  jaotamata: k.jaotamata.toFixed(2), vahe: k.vahe.toFixed(4), keskmine: k.keskmine_tunnihind?.toFixed(2),
  kontroll: k.kontroll?.toFixed(2), suhe: k.kontroll ? (k.kontroll / k.palgafond).toFixed(3) : '',
})));
const maxVahe = Math.max(...r.kuud.map((k) => Math.abs(k.vahe)));
console.log('Invariant max |vahe|:', maxVahe, maxVahe < 0.01 ? 'OK' : 'VIGA');
console.log('Kategooriad:', r.kategooriad);
console.log('Tundmatud tasuliigid:', r.tundmatudTasuliigid);
console.log('Palgata tunnid:', r.palgata.map((x) => x.tootaja_nimi));
console.log('Tunnideta palgasaajad:', [...new Set(r.tunnideta.map((x) => x.tootaja_nimi))]);
console.log('Erandite read:', r.erandid.length, 'negatiivseid:', r.erandid.filter((e) => e.ylejaak < 0).length);
console.log('Hoiatusi:', r.hoiatused.length);

if (jsonFail) {
  const proj = {};
  for (const x of r.palgaread) proj[x.projekti_kood] = (proj[x.projekti_kood] ?? 0) + x.summa;
  writeFileSync(jsonFail, JSON.stringify(proj, null, 1));
  console.log('Kirjutatud', jsonFail);
}
process.exit(maxVahe < 0.01 ? 0 : 1);
```

- [ ] **Step 3: Käivita** — `node tools/kontrolli-andmeid.mjs ../prosystem-andmed`
  Expected: 31 kuud (202401–202607), `Invariant … OK`, `tundmatud tasuliigid: []`, palgata ≈ 3 nime (vt kontrolli väljundit). Kontroll-suhe ≈ 1,4–1,6 (dokumenteeritud: PR ≠ palgafond). Kui Projektbüroo fail on veel vanas kaustas, kopeeri see enne andmekausta.

- [ ] **Step 4: Commit** — `git add tools/kontrolli-andmeid.mjs package.json package-lock.json && git commit -m "Päris andmete kontrollskript"`

---

### Task 4: Veebiliides (impeccable)

**Files:**
- Create: `web/index.html`, `web/styles.css`, `web/js/app.js`, `web/js/export.js`

**Interfaces:**
- Consumes: parse.js ja calc.js ekspordid; globaalne `XLSX` (SheetJS `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`).
- Produces: `export.js`: `looTooraamat(XLSX, tulemus, seaded) → Workbook` (lehed: `Lõplik tabel`, `Kuud`, `Tunnihinnad`, `Erandid`, `Tunnideta`, `Palgata`, `Ilma palgakuluta`, `Palk ilma kulu-tuluta`, `Anomaaliad`, `Projektid`, `Seaded`).

- [ ] **Step 1: Lae `impeccable` skill** ja tee `shape` samm selle lehe jaoks: töövahend raamatupidajale/juhile, andmemahukas, rahulik ja usaldusväärne; eesti keel; hele + tume teema; mobiilis kasutatav.

- [ ] **Step 2: `web/js/export.js`**

```js
// Tulemuse eksport Excelisse (SheetJS antakse parameetrina, et moodul ei sõltuks globaalist).
import { projektiKoond } from './calc.js';

export function looTooraamat(XLSX, tulemus, seaded) {
  const wb = XLSX.utils.book_new();
  const leht = (nimi, read) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(read.length ? read : [{ '': 'andmed puuduvad' }]), nimi);
  leht('Lõplik tabel', tulemus.lopptabel);
  leht('Kuud', tulemus.kuud);
  leht('Tunnihinnad', tulemus.tunnihinnad);
  leht('Erandid', tulemus.erandid);
  leht('Tunnideta', tulemus.tunnideta);
  leht('Palgata', tulemus.palgata.map((x) => ({ ...x, kuud: x.kuud.join(', ') })));
  leht('Ilma palgakuluta', tulemus.projektidIlmaPalgata);
  leht('Palk ilma kulu-tuluta', tulemus.palkIlmaKuluTuluta);
  leht('Anomaaliad', tulemus.anomaaliad);
  leht('Projektid', projektiKoond(tulemus.lopptabel).sort((a, b) => b.kasum - a.kasum));
  leht('Seaded', [{ seaded: JSON.stringify(seaded) }]);
  return wb;
}
```

- [ ] **Step 3: `web/index.html` struktuur** (ID-d, millele app.js tugineb):
  - `<header>`: pealkiri „Projektide kasumlikkus“, lause „Failid töödeldakse ainult sinu brauseris — midagi ei laeta üles.“
  - `<section id="failid">`: neli `<label class="lohistus" data-liik="kuludTulud|tooaeg|palgad|kontroll">` igaühes `<input type="file" accept=".xlsx,.xls" multiple>` + `<ul class="faililoend">`; kontroll märgitud „valikuline“.
  - `<details id="seaded">` alampaneelidega (`<details>`): `#erandid` (textarea, üks nimi reale), `#aliased` (tabel kust/kuhu + „lisa rida“), `#tasuliigid` (checkboxid, tundmatud märgisega „uus“), `#periood` (`<input type="month">` ×2), `#kontorimuster` (text), `#anomaalia` (2 × number); nupp `#taasta`.
  - `<button id="arvuta" disabled>` — lubatud, kui kolm kohustuslikku kategooriat on laetud veata.
  - `<section id="tulemused" hidden>`: `<details class="paneel" data-paneel="...">` iga spec'i tulemusploki kohta, `<summary>` sees pealkiri + `<span class="mark">` (arv või summa, hoiatusplokkidel hoiatusvärv, kui > 0); nupp `#ekspordi`.
  - Skriptid: SheetJS CDN `<script>`, siis `<script type="module" src="js/app.js">`.

- [ ] **Step 4: `web/js/app.js` käitumine**
  - Olek: `{ failid: {kuludTulud: [], tooaeg: [], palgad: [], kontroll: []}, seaded, tulemus }`; iga fail `{nimi, read|viga}`.
  - Faili lugemine: `XLSX.read(await fail.arrayBuffer())` → esimene leht → `sheet_to_json(..., {header:1, raw:true, defval:null})` → vastav `parse*`; `try/catch` → viga salvestatakse failile ja kuvatakse punasena faililoendis („x.xlsx: puuduvad veerud …“), teised failid jäävad alles. Iga faili juures ✕ eemaldamiseks. Loendis: ridade arv ja kuuvahemik.
  - Lohistamine: `dragover`/`drop` samal label'il; drop'i failid läbivad sama raja.
  - Seaded `localStorage` võtmes `prosystem-seaded-v1` (try/catch ümber); `#taasta` → `looSeaded()`. Tasuliikide nimekiri = `TEADAOLEVAD_TASULIIGID` ∪ laetud palgafailide tasuliigid.
  - Arvuta: `arvuta(sisend, seaded)` → renderda paneelid. Seadete muutus pärast esimest arvutust arvutab automaatselt uuesti (debounce 300 ms).
  - Tabelid: ühine `renderTabel(veerud, read, {max: 200})` — numbrid `Intl.NumberFormat('et-EE', {minimumFractionDigits: 2, maximumFractionDigits: 2})`, paremale joondatud, `tabular-nums`; üle 200 rea → „näita kõiki“.
  - Kasumlikkuse paneel: sorteerimise `<select>` (kasum ↓/↑, marginaal ↓/↑), otsingukast, projektide nimekiri (kasum, marginaal); valitud projekti kokkuvõte + kontode kaupa horisontaalsed tulbad (SVG, tulu ja kulu eri toonid, väärtused otse tulba kõrval); tulbale klõps → selle konto tehingud tabelina.
  - Palgafondi kuukontrolli paneel: tabel kuu, palgafond, jaotatud, jaotamata, vahe, (kontroll, suhe) + lühike selgitus, et PR-kannete summa ei ole palgafondi kulu.
  - Eksport: `XLSX.writeFile(looTooraamat(XLSX, tulemus, seaded), 'projektide-kasumlikkus.xlsx')`.

- [ ] **Step 5: `web/styles.css`** vastavalt impeccable `shape` tulemusele (tokenid `:root`-il, tume teema `prefers-color-scheme`-iga, `details`/`summary` selge avamise vihje, fookus nähtav, 16px küljevaru mobiilis, tabelid horisontaalselt keritavad oma konteineris).

- [ ] **Step 6: Käsitsi kontroll brauseris** — `python -m http.server 8000 -d web`; lae päris failid `../prosystem-andmed`-ist:
  - numbrid kattuvad Task 3 skripti väljundiga (palgafond 202607, kategooriad);
  - **vale fail:** tööaja fail palkade alasse → selge viga, ✕ eemaldab, õige fail töötab;
  - seadete muutus (lisa/eemalda erand) arvutab uuesti; värskendus säilitab seaded; „taasta“ töötab;
  - paneelid avanevad/sulguvad; eksport avaneb Excelis kõigi lehtedega;
  - 375 px laiusel pole horisontaalset lehe kerimist.

- [ ] **Step 7: impeccable `audit` + `polish`**, paranda leitu.

- [ ] **Step 8: Commit** — `git add web && git commit -m "Veebiliides: failide laadimine, seaded, tulemuste paneelid, eksport"`

---

### Task 5: GitHub Pages ja README

**Files:**
- Create: `.github/workflows/pages.yml`; Modify: `README.md`

- [ ] **Step 1: Workflow**

```yaml
name: Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: node --test web/tests/
  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: web
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: README** — mis see on, veebilehe link `https://mssaar.github.io/prosystem-projektide-kasumlikkus/`, millised failid kuhu laadida, arvutusloogika lühidalt (viide spec'ile), privaatsus (andmed ei lahku brauserist, repo'sse andmeid ei panda), arendus (`npm test`, `npm run kontroll`, lokaalne server). Pages seadistus: *Settings → Pages → Source: GitHub Actions*.

- [ ] **Step 3: Commit** — `git commit -m "GitHub Pages deploy ja README"`

---

### Task 6: Quarto/R analüüsi parandus

**Files:**
- Modify: `analyys/Prosystem_Praktika.qmd` (tekstiosa „Palgad“ ja „PALGAKULU“, R-plokk jaotised 1–6)

**Interfaces:**
- Consumes: sama loogika nagu `calc.js`; `tools/kontrolli-andmeid.mjs --json` väljund võrdluseks.
- Produces: `kulud_tulud_loplik` (samad veerud + `kuu`), `tootaja_tunnihind`, `palgad_df`, `kuu_kontroll` — hilisemad plokid (Shiny, ML, testid) kasutavad neid nimesid edasi.

- [ ] **Step 1:** Dokumendi algusesse seadete plokk:

```r
andmete_kaust <- "../../prosystem-andmed"   # andmed väljaspool repot
erandtootajad <- c("Veiko Venig", "Koit Roasto", "Allar Jõõts")
nime_aliased  <- c("Nokilai Fomenko" = "Nikolai Fomenko")
kontori_muster <- "^\\p{L}{1,3}[0-9]"
```
  ja kõik `list.files(pattern = …)` → `list.files(andmete_kaust, pattern = …, full.names = TRUE)`.

- [ ] **Step 2: Palgad** — veerud nime järgi, `kokku` ilma koefitsiendita:

```r
loe_palgad <- function(f) {
  read_excel(f, col_types = "text") %>%
    select(tootaja_raw = isik, tasuliik, kuu = arvestuskuu, kokku) %>%
    mutate(kokku = as.numeric(kokku), kuu = str_trim(kuu)) %>%
    filter(!is.na(kokku))
}
palgad_raw <- map_df(palgad_files, loe_palgad)
# tundmatu tasuliik → hoiatus (mitte stop), sest arvutus ei sõltu enam tasuliigist
tundmatud_tasud <- setdiff(unique(palgad_raw$tasuliik), teadaolevad_tasuliigid)
if (length(tundmatud_tasud) > 0) warning("Tundmatud tasuliigid: ", paste(tundmatud_tasud, collapse = ", "))

teisenda_nimi <- function(x) {
  osad <- str_split_fixed(x, ",\\s*", 2)
  if_else(osad[, 2] != "", str_to_title(paste(osad[, 2], osad[, 1]), locale = "et"), x)
}
rakenda_alias <- function(x) if_else(x %in% names(nime_aliased), unname(nime_aliased[x]), x)

palgad_df <- palgad_raw %>%
  mutate(tootaja_nimi = rakenda_alias(teisenda_nimi(tootaja_raw))) %>%
  group_by(kuu, tootaja_nimi) %>%
  summarise(kokku_palgakulu = sum(kokku), .groups = "drop")
```
  `teadaolevad_tasuliigid` = sama loend mis `TEADAOLEVAD_TASULIIGID` JS-is.

- [ ] **Step 3: Tööaeg** — `projekti_kood` `kontori_muster`-iga (`str_detect(koodi_osa, regex(kontori_muster))`, ICU toetab `\p{L}`), nimedele `rakenda_alias`.

- [ ] **Step 4: Jaotus kuu kaupa** — asenda jaotised 4–5:

```r
tunnid_isik <- tooaeg_df %>%
  group_by(kuu, tootaja_nimi) %>%
  summarise(kokku_tunnid = sum(tooaeg_tundides), kontori_tunnid = sum(tooaeg_tundides[projekti_kood == "Kontor"]), .groups = "drop")

isikud <- full_join(palgad_df, tunnid_isik, by = c("kuu", "tootaja_nimi")) %>%
  mutate(
    erand = tootaja_nimi %in% erandtootajad,
    on_palk = !is.na(kokku_palgakulu),          # nagu JS-is P.has(v)
    kokku_palgakulu = replace_na(kokku_palgakulu, 0),
    kokku_tunnid = replace_na(kokku_tunnid, 0),
    kontori_tunnid = replace_na(kontori_tunnid, 0),
    tyyp = case_when(erand ~ "erand", kokku_tunnid > 0 & on_palk ~ "tava",
                     kokku_tunnid > 0 ~ "palgata", TRUE ~ "tunnideta")
  ) %>%
  filter(!(tyyp == "palgata"))   # palgata tunnid: kulu 0, kuvatakse eraldi

tootaja_tunnihind <- isikud %>% filter(tyyp == "tava") %>%
  mutate(tunnihind = kokku_palgakulu / kokku_tunnid)
keskmine_kuu <- tootaja_tunnihind %>% group_by(kuu) %>%
  summarise(keskmine_tunnihind = sum(kokku_palgakulu) / sum(kokku_tunnid), .groups = "drop")

objekti_tunnid <- tooaeg_koond %>% filter(projekti_kood != "Kontor")

otsene <- objekti_tunnid %>%
  inner_join(tootaja_tunnihind %>% select(kuu, tootaja_nimi, tunnihind), by = c("kuu", "tootaja_nimi")) %>%
  transmute(kuu, projekti_kood, nimetus = proj_kood_raw, konto_nimetus = "Tööjõukulud",
            klient_tarnija = paste("Palgakulu:", tootaja_nimi), summa = -tooaeg_tundides * tunnihind)

erandi_obj <- objekti_tunnid %>% filter(tootaja_nimi %in% erandtootajad) %>%
  inner_join(keskmine_kuu, by = "kuu") %>%
  transmute(kuu, projekti_kood, nimetus = proj_kood_raw, tootaja_nimi,
            konto_nimetus = "Tööjõukulud (erand, keskmine tunnihind)",
            klient_tarnija = paste("Palgakulu:", tootaja_nimi), summa = -tooaeg_tundides * keskmine_tunnihind)

erandid_kuu <- isikud %>% filter(tyyp == "erand") %>%
  left_join(erandi_obj %>% group_by(kuu, tootaja_nimi) %>% summarise(obj = -sum(summa), .groups = "drop"),
            by = c("kuu", "tootaja_nimi")) %>%
  mutate(obj = replace_na(obj, 0), ylejaak = kokku_palgakulu - obj)

yldkulu_pott <- bind_rows(
  tootaja_tunnihind %>% transmute(kuu, summa = kontori_tunnid * tunnihind),
  erandid_kuu %>% transmute(kuu, summa = ylejaak),
  isikud %>% filter(tyyp == "tunnideta") %>% transmute(kuu, summa = kokku_palgakulu)
) %>% group_by(kuu) %>% summarise(pott = sum(summa), .groups = "drop")

projekti_nimetus <- objekti_tunnid %>% distinct(projekti_kood, .keep_all = TRUE) %>% select(projekti_kood, proj_kood_raw)
yldkulu_jaotus <- objekti_tunnid %>% group_by(kuu, projekti_kood) %>%
  summarise(h = sum(tooaeg_tundides), .groups = "drop_last") %>% mutate(osakaal = h / sum(h)) %>% ungroup() %>%
  inner_join(yldkulu_pott, by = "kuu") %>% left_join(projekti_nimetus, by = "projekti_kood") %>%
  transmute(kuu, projekti_kood, nimetus = proj_kood_raw, konto_nimetus = "Tööjõukulud (üldkulu jaotus)",
            klient_tarnija = "Üldkulu jaotus", summa = -pott * osakaal)

projekti_palgakulu_jaotatud <- bind_rows(otsene, erandi_obj %>% select(-tootaja_nimi), yldkulu_jaotus)

kuu_kontroll <- palgad_df %>% group_by(kuu) %>% summarise(palgafond = sum(kokku_palgakulu), .groups = "drop") %>%
  left_join(projekti_palgakulu_jaotatud %>% group_by(kuu) %>% summarise(jaotatud = -sum(summa), .groups = "drop"), by = "kuu") %>%
  mutate(jaotatud = replace_na(jaotatud, 0), jaotamata = palgafond - jaotatud)
stopifnot(all(abs(kuu_kontroll$jaotamata[kuu_kontroll$kuu %in% objekti_tunnid$kuu]) < 0.01))
```
  (Periood 202401–202607 — `palgad_df` kuud ilma objektitundideta jäävad `jaotamata` alla ja on stopifnot'ist välja arvatud.)

- [ ] **Step 5:** Jaotis 6 (ühendamine/kontrollid) jääb, `kulud_tulud_df` saab `kuu` veeru; eemalda vana tekst 1,338 kohta, asenda: „Palgakulu = veerg `kokku` (sisaldab juba sotsmaksu ja töötuskindlustust)“. Lisa lõik palgafondi vs PR-kannete kohta. Vana TESTIMISED plokk `write.table(... "clipboard")` jääb.

- [ ] **Step 6: Võrdle JS-iga** — `node tools/kontrolli-andmeid.mjs ../prosystem-andmed --json %TEMP%/js.json`; R-is kirjuta `projekti_palgakulu_jaotatud %>% group_by(projekti_kood) %>% summarise(s = sum(summa))` ja võrdle: max |vahe| < 0,01 €. Käivita R: `"C:/Program Files/R/R-4.5.2/bin/Rscript.exe"` (qmd koodiplokid läbi `knitr::purl` või `quarto render`).

- [ ] **Step 7: Commit** — `git commit -m "R analüüs: kokku ilma 1,338-ta, erandid ja üldkulu kuu kaupa, veerud nime järgi"`

---

### Task 7: Lõppkontroll

- [ ] `npm test` → kõik PASS; `npm run kontroll` → invariant OK.
- [ ] `git ls-files | grep -Ei '\.(xlsx|csv)$'` → tühi.
- [ ] superpowers:requesting-code-review kogu harule; paranda leitu.
- [ ] Push `origin main` alles pärast kasutaja nõusolekut; seejärel kasutaja lülitab Pages'i sisse (Settings → Pages → GitHub Actions).
