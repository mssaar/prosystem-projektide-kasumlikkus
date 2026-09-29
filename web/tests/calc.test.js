import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arvuta, projektiKoond, kontodeKaupa, looSeaded, KONTO_YLDKULU } from '../js/calc.js';

const lahedal = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);
const summa = (read, f) => read.filter(f).reduce((s, r) => s + r.summa, 0);
const t = (raw, nimi, kuu, tunnid) => ({ proj_kood_raw: raw, tootaja_nimi: nimi, kuu, tunnid });
const p = (nimi, kuu, kokku, tasuliik = 'Kuupalk', fail = 'a.xlsx') => ({ tootaja_nimi: nimi, tasuliik, kuu, kokku, fail });
const seaded = looSeaded({ erandid: ['Erand Mees'], aliased: [] });

// Invariant akumulaatoritest sõltumatult: iga kuu Σ(−palgaread.summa) + jaotamata = Σ sisendi `kokku`.
function kontrolliJaotust(r, palgad) {
  const fond = new Map();
  for (const x of palgad) fond.set(x.kuu, (fond.get(x.kuu) ?? 0) + x.kokku);
  const kuud = new Set([...fond.keys(), ...r.kuud.map((k) => k.kuu)]);
  for (const kuu of kuud) {
    const jaotatud = -summa(r.palgaread, (x) => x.kuu === kuu);
    const jaotamata = r.kuud.find((k) => k.kuu === kuu)?.jaotamata ?? 0;
    lahedal(jaotatud + jaotamata, fond.get(kuu) ?? 0);
  }
}

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
  kontrolliJaotust(r, baas.palgad);
  assert.deepEqual(r.hoiatused, []);
});

test('negatiivne ülejääk: erandi tunnid × keskmine > palk, invariant kehtib', () => {
  const palgad = [p('Tava Üks', '202401', 3000), p('Tava Kaks', '202401', 2000), p('Erand Mees', '202401', 100)];
  const r = arvuta({ ...baas, palgad }, seaded);
  lahedal(r.erandid[0].ylejaak, -100);
  lahedal(r.kuud[0].vahe, 0);
  kontrolliJaotust(r, palgad);
  assert.ok(r.hoiatused.some((h) => h.includes('negatiivne')));
});

test('kaks faili sama isik samal kuul → summeeritakse', () => {
  const r = arvuta({ ...baas, palgad: [p('Tava Üks', '202401', 1000, 'Kuupalk', 'a.xlsx'), p('Tava Üks', '202401', 2000, 'Kuupalk', 'b.xlsx'), p('Tava Kaks', '202401', 2000)] }, seaded);
  lahedal(r.tunnihinnad.find((x) => x.tootaja_nimi === 'Tava Üks').tunnihind, 20);
  assert.ok(!r.hoiatused.some((h) => h.includes('identset')), 'erinevad read ei ole duplikaadid');
});

test('kuu ilma objektitundideta → jaotamata', () => {
  const r = arvuta({ ...baas, palgad: [...baas.palgad, p('Tava Üks', '202402', 777)] }, seaded);
  const k = r.kuud.find((x) => x.kuu === '202402');
  lahedal(k.jaotamata, 777);
  lahedal(k.vahe, 0);
});

test('aliased ja palgata tunnid', () => {
  const palgad = [...baas.palgad, p('Kirjaviga Nimi', '202401', 500)];
  const r = arvuta({
    ...baas,
    tooaeg: [...baas.tooaeg, t('P1_Kool', 'Kirjavea Nimi', '202401', 5), t('P1_Kool', 'Ilma Palgata', '202401', 7)],
    palgad,
  }, looSeaded({ erandid: ['Erand Mees'], aliased: [{ kust: 'Kirjaviga Nimi', kuhu: 'Kirjavea Nimi' }] }));
  assert.ok(r.tunnihinnad.some((x) => x.tootaja_nimi === 'Kirjavea Nimi'));
  assert.deepEqual(r.palgata.map((x) => [x.tootaja_nimi, x.tunnid]), [['Ilma Palgata', 7]]);
  lahedal(r.kuud[0].vahe, 0);
  kontrolliJaotust(r, palgad);
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

test('periood: kuupäevata kulud-tulud read jäävad sisse, hoiatus nende arvuga', () => {
  const kt = [...baas.kuludTulud, { projekti_kood: 'P1', nimetus: 'P1 Kool', konto_nimetus: 'Müük', klient_tarnija: 'K', summa: 50, kuu: null },
    { projekti_kood: 'P3', nimetus: 'P3 Maja', konto_nimetus: 'Müük', klient_tarnija: 'K', summa: 60, kuu: null }];
  const r = arvuta({ ...baas, kuludTulud: kt }, looSeaded({ erandid: ['Erand Mees'], aliased: [], periood: { algus: '202401', lopp: '' } }));
  assert.equal(r.lopptabel.filter((x) => x.kuu == null).length, 2);
  assert.ok(r.hoiatused.some((h) => h.includes('2 rida kulud-tuludest ei sisalda kuupäeva')), r.hoiatused.join('\n'));
  const ilmaPerioodita = arvuta({ ...baas, kuludTulud: kt }, seaded);
  assert.ok(!ilmaPerioodita.hoiatused.some((h) => h.includes('kuupäeva')));
});

test('duplikaadid: samad palgaread kahes erinevas failis → hoiatus failinimede ja arvuga, ridu ei eemaldata', () => {
  const vana = [p('Tava Üks', '202401', 3000, 'Kuupalk', 'palk.xlsx'), p('Tava Kaks', '202401', 2000, 'Kuupalk', 'palk.xlsx')];
  const uus = [p('TAVA ÜKS', '202401', 3000, 'kuupalk', 'palk (1).xlsx'), p('Tava  Kaks', '202401', 2000, 'Kuupalk', 'palk (1).xlsx'),
    p('Tava Kaks', '202402', 2000, 'Kuupalk', 'palk (1).xlsx')];
  const r = arvuta({ ...baas, palgad: [...vana, ...uus] }, seaded);
  const h = r.hoiatused.filter((x) => x.includes('identset'));
  assert.equal(h.length, 1, r.hoiatused.join('\n'));
  assert.match(h[0], /Palgad/);
  assert.match(h[0], /„palk\.xlsx“/);
  assert.match(h[0], /„palk \(1\)\.xlsx“/);
  assert.match(h[0], /\b2 identset rida/);
  assert.deepEqual(r.duplikaadid, h);  // UI näitab neid eraldi esile
  lahedal(r.kuud.find((k) => k.kuu === '202401').palgafond, 10000);  // topelt, sest ridu ei eemaldata
});

test('duplikaadid: identsed read samas failis ei ole hoiatus', () => {
  const r = arvuta({ ...baas, palgad: [...baas.palgad, p('Tava Üks', '202401', 3000)] }, seaded);
  assert.ok(!r.hoiatused.some((x) => x.includes('identset')));
});

test('duplikaadid: tööaeg ja kulud-tulud erinevatest failidest', () => {
  const ta = (fail) => baas.tooaeg.map((x) => ({ ...x, fail }));
  const kt = (fail) => baas.kuludTulud.map((x) => ({ ...x, fail }));
  const r = arvuta({ ...baas, tooaeg: [...ta('t1.xlsx'), ...ta('t2.xlsx')], kuludTulud: [...kt('k1.xlsx'), ...kt('k2.xlsx').slice(0, 1)] }, seaded);
  const h = r.hoiatused.filter((x) => x.includes('identset'));
  assert.equal(h.length, 2, r.hoiatused.join('\n'));
  assert.ok(h.some((x) => /Tööaeg/.test(x) && x.includes('„t1.xlsx“') && x.includes('„t2.xlsx“') && /\b4 identset rida/.test(x)));
  assert.ok(h.some((x) => /Kulud-tulud/.test(x) && x.includes('„k1.xlsx“') && x.includes('„k2.xlsx“') && /\b1 identset rida/.test(x)));
});

test('duplikaadid: kulud-tulud sama kuu, kuid eri dokumendi kuupäev → ei ole duplikaat', () => {
  const rida = (fail, dok_kuupaev) => ({ ...baas.kuludTulud[0], fail, dok_kuupaev });
  const r = arvuta({ ...baas, kuludTulud: [rida('k1.xlsx', '30.01.2024'), rida('k2.xlsx', '31.01.2024')] }, seaded);
  assert.ok(!r.hoiatused.some((x) => x.includes('identset')), r.hoiatused.join('\n'));
  const r2 = arvuta({ ...baas, kuludTulud: [rida('k1.xlsx', '31.01.2024'), rida('k2.xlsx', '31.01.2024')] }, seaded);
  assert.ok(r2.hoiatused.some((x) => x.includes('1 identset rida')));
  assert.ok(r2.lopptabel.every((x) => !('fail' in x) && !('dok_kuupaev' in x)));
  const tr = (fail, kuupaev) => ({ ...baas.tooaeg[0], fail, kuupaev });
  const r3 = arvuta({ ...baas, tooaeg: [...baas.tooaeg, tr('t1.xlsx', '45300'), tr('t2.xlsx', '45301')] }, seaded);
  assert.ok(!r3.hoiatused.some((x) => x.includes('identset')), r3.hoiatused.join('|'));
});

test('erand: tunnid, aga palka pole → hoiatus ja palgata (erand: true), invariant kehtib', () => {
  const palgad = baas.palgad.filter((x) => x.tootaja_nimi !== 'Erand Mees');
  const r = arvuta({ ...baas, palgad }, seaded);
  assert.ok(r.hoiatused.includes('202401: Erand Mees: erandtöötajal on tunnid, aga palka pole'), r.hoiatused.join('\n'));
  assert.deepEqual(r.palgata, [{ tootaja_nimi: 'Erand Mees', kuud: ['202401'], tunnid: 10, erand: true }]);
  lahedal(r.kuud[0].palgafond, 6000);
  lahedal(r.kuud[0].vahe, 0);
  kontrolliJaotust(r, palgad);
});

test('erand, keda andmetes pole → hoiatus', () => {
  const r = arvuta(baas, looSeaded({ erandid: ['Erand Mees', 'Keegi Puudub'], aliased: [] }));
  assert.ok(r.hoiatused.includes('Erandtöötajat „Keegi Puudub“ ei leitud tööajast ega palkadest'), r.hoiatused.join('\n'));
  assert.ok(!r.hoiatused.some((h) => h.includes('Erand Mees“')));
  // väljaspool perioodi olev erand on andmetes olemas → hoiatust pole
  const r2 = arvuta(baas, looSeaded({ erandid: ['Erand Mees'], aliased: [], periood: { algus: '202402', lopp: '' } }));
  assert.ok(!r2.hoiatused.some((h) => h.includes('ei leitud')));
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
