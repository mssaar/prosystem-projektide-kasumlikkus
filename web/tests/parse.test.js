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
    klient_tarnija: 'Tarnija OÜ', summa: -595.4, kuu: '202409', dok_kuupaev: '11.09.2024', fail: 'kt.xlsx',
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
    { proj_kood_raw: 'A1_Kool', tootaja_nimi: 'Mari Tamm', kuu: '202411', kuupaev: '45617', tunnid: 1.5, fail: 't.xlsx' },
    { proj_kood_raw: 'Tööd kontoris_Mari', tootaja_nimi: 'Mari Tamm', kuu: '202411', kuupaev: '45618', tunnid: 2, fail: 't.xlsx' },
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

test('parseKontroll eelistab veergu „PR kanne"', () => {
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
