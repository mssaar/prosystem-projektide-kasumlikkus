import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  kuuSisendist, kuuSisendiks, kuuKuvaks, puhastaSeaded, kuuVahemik, kuupaevata, raha, arv, marginaal,
} from '../js/abi.js';
import { looTooraamat } from '../js/export.js';
import { arvuta, looSeaded, VAIKESEADED } from '../js/calc.js';

test('kuu teisendus <input type=month> ↔ YYYYMM', () => {
  assert.equal(kuuSisendist('2026-07'), '202607');
  assert.equal(kuuSisendist(''), '');
  assert.equal(kuuSisendist('vale'), '');
  assert.equal(kuuSisendiks('202607'), '2026-07');
  assert.equal(kuuSisendiks(''), '');
  assert.equal(kuuKuvaks('202607'), '2026-07');
  assert.equal(kuuKuvaks(null), '—');
});

test('puhastaSeaded: osalised pesastatud objektid saavad vaikeväärtused', () => {
  const s = puhastaSeaded({ periood: { algus: '202401' }, anomaalia: { ule: 40 }, erandid: ['A B'] });
  assert.deepEqual(s.periood, { algus: '202401', lopp: '' });
  assert.deepEqual(s.anomaalia, { alla: 10, ule: 40 });
  assert.deepEqual(s.erandid, ['A B']);
  assert.deepEqual(s.aliased, VAIKESEADED.aliased);
  assert.equal(s.kontoriMuster, VAIKESEADED.kontoriMuster);
});

test('puhastaSeaded: vigased väärtused asendatakse vaikeväärtustega', () => {
  const s = puhastaSeaded({
    erandid: 'pole massiiv', aliased: [null, { kust: 'X', kuhu: 5 }], valjaJaetudTasuliigid: [1, 'Lisatasu'],
    periood: { algus: '2024-01', lopp: 202612 }, anomaalia: { alla: 'abc', ule: null }, kontoriMuster: 7,
  });
  assert.deepEqual(s.erandid, VAIKESEADED.erandid);
  assert.deepEqual(s.aliased, [{ kust: 'X', kuhu: '5' }]);
  assert.deepEqual(s.valjaJaetudTasuliigid, ['Lisatasu']);
  assert.deepEqual(s.periood, { algus: '', lopp: '' });
  assert.deepEqual(s.anomaalia, { alla: 10, ule: 30 });
  assert.equal(s.kontoriMuster, VAIKESEADED.kontoriMuster);
  assert.deepEqual(puhastaSeaded(null), looSeaded());
});

test('kuuVahemik', () => {
  assert.equal(kuuVahemik([{ kuu: '202403' }, { kuu: null }, { kuu: '202401' }]), '2024-01 – 2024-03');
  assert.equal(kuuVahemik([{ kuu: '202401' }]), '2024-01');
  assert.equal(kuuVahemik([{ kuu: null }]), '');
});

test('kuupaevata: kulud-tulude faili meta', () => {
  assert.equal(kuupaevata([{ kuu: '202401' }]), '');
  assert.equal(kuupaevata([{ kuu: null }, { kuu: null }]), 'kuupäev puudub');
  assert.equal(kuupaevata([{ kuu: '202401' }, { kuu: null }]), '1 rida kuupäevata');
});

test('vormindus et-EE', () => {
  const nbsp = /[\s  ]/g;
  assert.equal(raha(12345.5).replace(nbsp, ' '), '12 345,50');
  assert.equal(arv(12345.567, 0).replace(nbsp, ' '), '12 346');
  assert.equal(raha(null), '—');
  assert.equal(marginaal({ tulu: 0, marginaal: -100 }), 'tuluta');
  assert.equal(marginaal({ tulu: 100, marginaal: 12.345 }), '12,3 %');
});

test('looTooraamat: kõik lehed olemas, tühjad lehed märgitud', () => {
  const tulemus = arvuta({
    kuludTulud: [{ projekti_kood: 'P1', nimetus: 'P1 X', konto_nimetus: 'Müük', klient_tarnija: 'K', summa: 100, kuu: '202401' }],
    tooaeg: [{ proj_kood_raw: 'P1_X', tootaja_nimi: 'Mari Maasikas', kuu: '202401', tunnid: 10 }],
    palgad: [{ tootaja_nimi: 'Mari Maasikas', tasuliik: 'Kuupalk', kuu: '202401', kokku: 50, fail: 'a' }],
  }, looSeaded());
  const wb = looTooraamat(XLSX, tulemus, looSeaded());
  assert.deepEqual(wb.SheetNames, ['Lõplik tabel', 'Kuud', 'Tunnihinnad', 'Erandid', 'Tunnideta', 'Palgata',
    'Ilma palgakuluta', 'Palk ilma kulu-tuluta', 'Anomaaliad', 'Projektid', 'Seaded']);
  const kuud = XLSX.utils.sheet_to_json(wb.Sheets.Kuud);
  assert.equal(kuud[0].palgafond, 50);
  assert.equal(XLSX.utils.sheet_to_json(wb.Sheets.Palgata, { header: 1 })[1][0], 'andmed puuduvad');
});
