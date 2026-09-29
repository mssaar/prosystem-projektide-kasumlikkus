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

// Identsed read ERINEVATEST failidest (nt kumulatiivne eksport vana kõrval) → hoiatus failipaari kohta.
// Ridu ei eemaldata: sama rida samas failis on lubatud, eri failides on see tõenäoliselt topeltlaadimine.
// Kuupäev (kui olemas) on võtmes päeva täpsusega, et järjestikuste ekspordide piirikuu ei annaks valehoiatust.
function duplikaadiHoiatused(silt, read, voti) {
  const grupid = new Map();  // võti → fail → ridade arv
  for (const r of read) {
    if (r.fail == null) continue;
    const failid = saa(grupid, voti(r), () => new Map());
    failid.set(r.fail, (failid.get(r.fail) ?? 0) + 1);
  }
  const paarid = new Map();  // "a\u0000b" → identsete ridade arv
  for (const failid of grupid.values()) {
    if (failid.size < 2) continue;
    const f = [...failid.keys()].sort();
    for (let i = 0; i < f.length; i++) {
      for (let j = i + 1; j < f.length; j++) {
        const k = `${f[i]}\u0000${f[j]}`;
        paarid.set(k, (paarid.get(k) ?? 0) + Math.min(failid.get(f[i]), failid.get(f[j])));
      }
    }
  }
  return [...paarid].map(([k, n]) => {
    const [a, b] = k.split('\u0000');
    return `${silt}: failides „${a}“ ja „${b}“ on ${n.toLocaleString('et-EE')} identset rida — ekspordid kattuvad ja arvestatakse topelt. Asenda vana fail uuega, ära lisa neid kõrvuti.`;
  });
}

export function arvuta({ kuludTulud, tooaeg, palgad, kontroll = [] }, seadedSisse) {
  const s = looSeaded(seadedSisse);
  const aliased = new Map(s.aliased.filter((a) => normTekst(a.kust) && normTekst(a.kuhu))
    .map((a) => [nimeVoti(a.kust), normTekst(a.kuhu)]));
  const nimi = (n) => aliased.get(nimeVoti(n)) ?? normTekst(n);
  const erandid = new Set(s.erandid.map(nimeVoti).filter(Boolean));
  const valjas = new Set(s.valjaJaetudTasuliigid.map(nimeVoti));
  const teada = new Set(TEADAOLEVAD_TASULIIGID.map(nimeVoti));
  const duplikaadid = [
    ...duplikaadiHoiatused('Palgad', palgad,
      (r) => [nimeVoti(r.tootaja_nimi), nimeVoti(r.tasuliik), r.kuu, r.kokku].join('\u0000')),
    ...duplikaadiHoiatused('Tööaeg', tooaeg,
      (r) => [normTekst(r.proj_kood_raw), nimeVoti(r.tootaja_nimi), r.kuupaev ?? r.kuu, r.tunnid].join('\u0000')),
    ...duplikaadiHoiatused('Kulud-tulud', kuludTulud,
      (r) => [r.projekti_kood, r.konto_nimetus, r.klient_tarnija, r.summa, r.dok_kuupaev ?? r.kuu].join('\u0000')),
  ];
  const hoiatused = [...duplikaadid];

  const tundmatudTasuliigid = [...new Set(palgad.map((x) => x.tasuliik)
    .filter((tl) => !teada.has(nimeVoti(tl))))].sort();

  // palk: kuu → isiku võti → {nimi, palk}
  const palk = new Map();
  const palgaNimed = new Set();
  for (const r of palgad) {
    const n = nimi(r.tootaja_nimi);
    palgaNimed.add(nimeVoti(n));
    if (!vahemikus(r.kuu, s.periood) || valjas.has(nimeVoti(r.tasuliik))) continue;
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

  for (const e of s.erandid) {
    const v = nimeVoti(e);
    if (v && !tooajaNimed.has(v) && !palgaNimed.has(v)) {
      hoiatused.push(`Erandtöötajat „${normTekst(e)}“ ei leitud tööajast ega palkadest`);
    }
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
        if (x && x.kokku > 0 && !P.has(v)) {
          hoiatused.push(`${kuu}: ${kuvaNimi}: erandtöötajal on tunnid, aga palka pole`);
          const k = saa(palgata, v, () => ({ tootaja_nimi: kuvaNimi, kuud: [], tunnid: 0, erand: true }));
          k.kuud.push(kuu);
          k.tunnid += x.kokku;
        }
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

  const kt = kuludTulud.filter((r) => vahemikus(r.kuu, s.periood)).map(({ fail, dok_kuupaev, ...r }) => r);
  if (s.periood.algus || s.periood.lopp) {
    const kuupaevata = kt.filter((r) => !r.kuu).length;
    if (kuupaevata) {
      hoiatused.push(`${kuupaevata.toLocaleString('et-EE')} rida kulud-tuludest ei sisalda kuupäeva (veerg „Dok. kuupäev“), periood ei rakendu neile — need on arvestatud`);
    }
  }
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
    tundmatudTasuliigid, hoiatused, duplikaadid,
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
