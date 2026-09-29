// Veebiliides: failide laadimine, seaded, tulemuste paneelid, eksport.
// Kõik andmed jäävad brauserisse — ükski funktsioon siin ei tee võrgupäringut.
import { parseKuludTulud, parseTooaeg, parsePalgad, parseKontroll, normTekst, nimeVoti } from './parse.js';
import {
  arvuta, projektiKoond, kontodeKaupa, looSeaded, TEADAOLEVAD_TASULIIGID,
  KONTO_OTSENE, KONTO_ERAND, KONTO_YLDKULU,
} from './calc.js';
import {
  kuuSisendist, kuuSisendiks, kuuKuvaks, puhastaSeaded, kuuVahemik, kuupaevata, raha, arv, marginaal,
} from './abi.js';
import { looTooraamat } from './export.js';

const PARSERID = { kuludTulud: parseKuludTulud, tooaeg: parseTooaeg, palgad: parsePalgad, kontroll: parseKontroll };
const KOHUSTUSLIKUD = ['kuludTulud', 'tooaeg', 'palgad'];
const LIIGI_NIMI = { kuludTulud: 'kulud ja tulud', tooaeg: 'tööaeg', palgad: 'palgad', kontroll: 'kontroll' };
const SALV_VOTI = 'prosystem-seaded-v1';
const PALGAKONTOD = new Set([KONTO_OTSENE, KONTO_ERAND, KONTO_YLDKULU]);
const MAX_READ = 200;

const olek = {
  failid: { kuludTulud: [], tooaeg: [], palgad: [], kontroll: [] },
  seaded: laeSeaded(),
  tulemus: null,
  aegunud: false,
  alaTeated: {},
  koond: [],
  valitudProjekt: null,
  valitudKonto: null,
  koikKontod: false,
};
let idLoendur = 0;

// ---------- DOM abi ----------

const $ = (s, juur = document) => juur.querySelector(s);
const $$ = (s, juur = document) => [...juur.querySelectorAll(s)];

function h(silt, omadused = {}, ...lapsed) {
  const el = document.createElement(silt);
  for (const [k, v] of Object.entries(omadused)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const l of lapsed.flat()) if (l != null && l !== false) el.append(l);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function s(silt, omadused = {}, ...lapsed) {
  const el = document.createElementNS(SVG_NS, silt);
  for (const [k, v] of Object.entries(omadused)) {
    if (v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const l of lapsed.flat()) if (l != null) el.append(l);
  return el;
}
const ikoon = (nimi, klass = '') => s('svg', { class: `ikoon ${klass}`.trim(), 'aria-hidden': 'true' }, s('use', { href: `#i-${nimi}` }));

const teata = (tekst) => { $('#teade').textContent = tekst; };

// ---------- Seaded ----------

function laeSeaded() {
  try {
    const t = localStorage.getItem(SALV_VOTI);
    return t ? puhastaSeaded(JSON.parse(t)) : looSeaded();
  } catch {
    return looSeaded();
  }
}

function salvestaSeaded() {
  try { localStorage.setItem(SALV_VOTI, JSON.stringify(olek.seaded)); } catch { /* privaatne aken vms */ }
}

let arvutusTaimer = null;
function seadedMuutusid({ uuendaVaade = false } = {}) {
  salvestaSeaded();
  if (uuendaVaade) renderSeaded(); else renderSeadeMargid();
  if (!olek.tulemus) return;
  clearTimeout(arvutusTaimer);
  arvutusTaimer = setTimeout(() => arvutaNyyd(), 300);
}

function koikTasuliigid() {
  const nahtud = new Map(TEADAOLEVAD_TASULIIGID.map((t) => [nimeVoti(t), { nimi: t, uus: false }]));
  for (const f of olek.failid.palgad) {
    for (const r of f.read ?? []) {
      const v = nimeVoti(r.tasuliik);
      if (v && !nahtud.has(v)) nahtud.set(v, { nimi: r.tasuliik, uus: true });
    }
  }
  return [...nahtud.values()];
}

function renderSeaded() {
  const sd = olek.seaded;
  $('#erandid-tekst').value = sd.erandid.join('\n');
  renderAliased();
  renderTasuliigid();
  $('#periood-algus').value = kuuSisendiks(sd.periood.algus);
  $('#periood-lopp').value = kuuSisendiks(sd.periood.lopp);
  $('#periood-viga').hidden = true;
  $('#kontorimuster-tekst').value = sd.kontoriMuster;
  $('#kontorimuster-viga').hidden = true;
  $('#kontorimuster-tekst').removeAttribute('aria-invalid');
  $('#anomaalia-alla').value = sd.anomaalia.alla;
  $('#anomaalia-ule').value = sd.anomaalia.ule;
  renderSeadeMargid();
}

function renderAliased() {
  const tbody = $('#aliased-read');
  tbody.replaceChildren(...olek.seaded.aliased.map((a, i) => h('tr', {},
    h('td', {}, h('input', {
      type: 'text', value: a.kust, 'aria-label': `Rida ${i + 1}: kust`, spellcheck: 'false',
      oninput: (e) => { olek.seaded.aliased[i].kust = e.target.value; seadedMuutusid(); },
    })),
    h('td', {}, h('input', {
      type: 'text', value: a.kuhu, 'aria-label': `Rida ${i + 1}: kuhu`, spellcheck: 'false',
      oninput: (e) => { olek.seaded.aliased[i].kuhu = e.target.value; seadedMuutusid(); },
    })),
    h('td', { class: 'veerg-nupp' }, h('button', {
      type: 'button', class: 'ikoon-nupp', 'aria-label': `Eemalda rida ${i + 1}`,
      onclick: () => {
        olek.seaded.aliased.splice(i, 1);
        seadedMuutusid({ uuendaVaade: true });
        ($('#aliased-read input') ?? $('#lisa-alias')).focus();
      },
    }, ikoon('sulge'))),
  )));
}

function renderTasuliigid() {
  const valjas = new Set(olek.seaded.valjaJaetudTasuliigid.map(nimeVoti));
  $('#tasuliigid-loend').replaceChildren(...koikTasuliigid().map((t) => h('label', { class: 'linnuke' },
    h('input', {
      type: 'checkbox', checked: !valjas.has(nimeVoti(t.nimi)),
      onchange: (e) => {
        const v = nimeVoti(t.nimi);
        const loend = olek.seaded.valjaJaetudTasuliigid.filter((x) => nimeVoti(x) !== v);
        if (!e.target.checked) loend.push(t.nimi);
        olek.seaded.valjaJaetudTasuliigid = loend;
        seadedMuutusid();
      },
    }),
    h('span', { text: t.nimi }),
    t.uus ? h('span', { class: 'silt silt-uus', text: 'uus' }) : null,
  )));
}

function renderSeadeMargid() {
  const sd = olek.seaded;
  const kasutusel = sd.aliased.filter((a) => normTekst(a.kust) && normTekst(a.kuhu)).length;
  const koik = koikTasuliigid().length;
  const valjas = sd.valjaJaetudTasuliigid.length;
  const { algus, lopp } = sd.periood;
  const perioodTekst = !algus && !lopp ? 'kogu periood' : `${algus ? kuuKuvaks(algus) : '…'} – ${lopp ? kuuKuvaks(lopp) : '…'}`;
  const margid = {
    erandid: `${sd.erandid.length}`,
    aliased: `${kasutusel}`,
    tasuliigid: valjas ? `${koik - valjas} / ${koik}` : 'kõik',
    periood: perioodTekst,
    kontorimuster: sd.kontoriMuster,
    anomaalia: `< ${arv(sd.anomaalia.alla, 0)} € · > ${arv(sd.anomaalia.ule, 0)} €`,
  };
  for (const [k, v] of Object.entries(margid)) $(`[data-mark="${k}"]`).textContent = v;
  $('#seaded-mark').textContent = `${sd.erandid.length} erandit · ${valjas ? `${koik - valjas} tasuliiki` : 'kõik tasuliigid'} · ${perioodTekst}`;
}

function seoSeaded() {
  $('#erandid-tekst').addEventListener('input', (e) => {
    olek.seaded.erandid = e.target.value.split('\n').map(normTekst).filter(Boolean);
    seadedMuutusid();
  });
  $('#lisa-alias').addEventListener('click', () => {
    olek.seaded.aliased.push({ kust: '', kuhu: '' });
    salvestaSeaded();
    renderAliased();
    renderSeadeMargid();
    $$('#aliased-read tr').at(-1).querySelector('input').focus();
  });

  const periood = () => {
    const algus = kuuSisendist($('#periood-algus').value);
    const lopp = kuuSisendist($('#periood-lopp').value);
    const viga = $('#periood-viga');
    if (algus && lopp && algus > lopp) {
      viga.textContent = 'Alguskuu on hilisem kui lõppkuu — muudatust ei rakendatud.';
      viga.hidden = false;
      return;
    }
    viga.hidden = true;
    olek.seaded.periood = { algus, lopp };
    seadedMuutusid();
  };
  $('#periood-algus').addEventListener('change', periood);
  $('#periood-lopp').addEventListener('change', periood);

  $('#kontorimuster-tekst').addEventListener('input', (e) => {
    const muster = e.target.value.trim();
    const viga = $('#kontorimuster-viga');
    let sobib = muster !== '';
    try { new RegExp(muster, 'u'); } catch { sobib = false; }
    viga.hidden = sobib;
    e.target.toggleAttribute('aria-invalid', !sobib);
    if (!sobib) {
      viga.textContent = muster ? 'See ei ole korrektne regulaaravaldis — kehtib eelmine muster.' : 'Muster ei tohi olla tühi — kehtib eelmine muster.';
      return;
    }
    olek.seaded.kontoriMuster = muster;
    seadedMuutusid();
  });

  const anomaalia = () => {
    const alla = $('#anomaalia-alla').valueAsNumber;
    const ule = $('#anomaalia-ule').valueAsNumber;
    // Mõlemad väljad alati koos: looSeaded ühendab pesastatud objekte pinnapealselt.
    olek.seaded.anomaalia = {
      alla: Number.isFinite(alla) ? alla : olek.seaded.anomaalia.alla,
      ule: Number.isFinite(ule) ? ule : olek.seaded.anomaalia.ule,
    };
    seadedMuutusid();
  };
  $('#anomaalia-alla').addEventListener('input', anomaalia);
  $('#anomaalia-ule').addEventListener('input', anomaalia);

  $('#taasta').addEventListener('click', () => {
    olek.seaded = looSeaded();
    seadedMuutusid({ uuendaVaade: true });
    teata('Seaded taastatud vaikeväärtustele.');
  });
}

// ---------- Failid ----------

const ALA_TEATE_AEG = 8000;
const alaTaimerid = {};
// Mööduv teade faili alas (nt sama nimega fail jäeti vahele) — ei ole failiviga ega blokeeri arvutust.
function alaTeade(liik, tekst) {
  olek.alaTeated[liik] = tekst;
  clearTimeout(alaTaimerid[liik]);
  alaTaimerid[liik] = setTimeout(() => { delete olek.alaTeated[liik]; renderFailid(liik); }, ALA_TEATE_AEG);
  renderFailid(liik);
  teata(tekst);
}

async function lisaFailid(liik, failid) {
  const koik = [...failid];
  if (!koik.length) return;
  const nimed = new Set(olek.failid[liik].filter((f) => !f.viga).map((f) => f.nimi));
  const vahele = [];
  const uued = koik.filter((fail) => {
    if (nimed.has(fail.name)) { vahele.push(fail.name); return false; }
    nimed.add(fail.name);
    return true;
  });
  if (vahele.length) {
    alaTeade(liik, vahele.length === 1
      ? `„${vahele[0]}“ on juba laetud — jäeti vahele.`
      : `${vahele.length} faili on juba laetud — jäeti vahele: ${vahele.map((n) => `„${n}“`).join(', ')}.`);
  }
  if (!uued.length) return;
  const tood = uued.map((fail) => {
    const kirje = { id: ++idLoendur, nimi: fail.name, laeb: true };
    if (!/\.xlsx?$/i.test(fail.name)) {
      kirje.laeb = false;
      kirje.viga = `${fail.name}: ei ole Exceli fail (.xlsx või .xls)`;
    }
    olek.failid[liik].push(kirje);
    return { fail, kirje };
  });
  renderFailid(liik);

  for (const { fail, kirje } of tood) {
    if (!kirje.laeb) continue;
    try {
      if (typeof XLSX === 'undefined') throw new Error('Exceli lugemise teek puudub');
      const wb = XLSX.read(await fail.arrayBuffer());
      const leht = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(leht, { header: 1, raw: true, defval: null });
      const read = PARSERID[liik](rows, fail.name);
      if (!read.length) throw new Error(`${fail.name}: päis leiti, kuid andmeridu pole`);
      kirje.read = read;
    } catch (e) {
      const tekst = String(e?.message ?? e);
      kirje.viga = tekst.startsWith(fail.name) ? tekst : `${fail.name}: ${tekst}`;
    }
    kirje.laeb = false;
    // Kirje võidi vahepeal eemaldada.
    if (!olek.failid[liik].includes(kirje)) continue;
    renderFailid(liik);
    teata(kirje.viga ? `Viga: ${kirje.viga}` : `Laetud ${kirje.nimi}: ${arv(kirje.read.length, 0)} rida.`);
  }
  failidMuutusid(liik);
}

function eemaldaFail(liik, id) {
  const loend = olek.failid[liik];
  const i = loend.findIndex((f) => f.id === id);
  if (i < 0) return;
  const [kirje] = loend.splice(i, 1);
  renderFailid(liik);
  teata(`Eemaldatud ${kirje.nimi}.`);
  const nupud = $$(`.faililoend[data-liik="${liik}"] .ikoon-nupp`);
  (nupud[Math.min(i, nupud.length - 1)] ?? $(`.lohistus[data-liik="${liik}"] input`)).focus();
  failidMuutusid(liik);
}

function failidMuutusid(liik) {
  if (liik === 'palgad') { renderTasuliigid(); renderSeadeMargid(); }
  renderArvutaNupp();
  if (!olek.tulemus) return;
  if (valmis().ok) arvutaNyyd();
  else if (!olek.aegunud) {
    // Eelmised tulemused jäävad nähtavale, kuid märgitakse aegunuks, kuni failid on jälle korras.
    olek.aegunud = true;
    renderAegunud();
    renderArvutaNupp();
  }
}

function renderAegunud() {
  $('#tulemused-aegunud').hidden = !olek.aegunud;
  $('#tulemused').classList.toggle('aegunud', olek.aegunud);
  $('#ekspordi').disabled = olek.aegunud;
}

function renderFailid(liik) {
  const ul = $(`.faililoend[data-liik="${liik}"]`);
  ul.replaceChildren(...olek.failid[liik].map((f) => {
    let meta;
    if (f.laeb) meta = h('span', { class: 'fail-meta', text: 'Loen…' });
    else if (f.viga) {
      const eesliide = `${f.nimi}: `;
      meta = h('span', { class: 'fail-meta' }, ikoon('viga', 'ikoon-vaike'),
        h('span', { text: f.viga.startsWith(eesliide) ? f.viga.slice(eesliide.length) : f.viga }));
    } else {
      const vahemik = kuuVahemik(f.read);
      const ilmaKp = liik === 'kuludTulud' ? kuupaevata(f.read) : '';
      meta = h('span', { class: 'fail-meta', text: [`${arv(f.read.length, 0)} rida`, vahemik, ilmaKp].filter(Boolean).join(' · ') });
    }
    return h('li', { class: `fail${f.viga ? ' fail-viga' : ''}${f.laeb ? ' fail-laeb' : ''}` },
      h('div', { class: 'fail-info' }, h('span', { class: 'fail-nimi', text: f.nimi, title: f.nimi }), meta),
      h('button', {
        type: 'button', class: 'ikoon-nupp', 'aria-label': `Eemalda ${f.nimi}`,
        onclick: () => eemaldaFail(liik, f.id),
      }, ikoon('sulge')));
  }));
  if (olek.alaTeated[liik]) {
    ul.append(h('li', { class: 'fail-teade' }, ikoon('hoiatus', 'ikoon-vaike'), h('span', { text: olek.alaTeated[liik] })));
  }
  $(`.lohistus[data-liik="${liik}"]`).classList.toggle('on-faile', olek.failid[liik].some((f) => f.read));
}

function seoLohistus() {
  for (const label of $$('.lohistus')) {
    const liik = label.dataset.liik;
    const input = $('input', label);
    input.addEventListener('change', () => {
      lisaFailid(liik, input.files);
      input.value = '';
    });
    let sygavus = 0;
    label.addEventListener('dragenter', (e) => { e.preventDefault(); sygavus++; label.classList.add('lohistamas'); });
    label.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    label.addEventListener('dragleave', () => { if (--sygavus <= 0) { sygavus = 0; label.classList.remove('lohistamas'); } });
    label.addEventListener('drop', (e) => {
      e.preventDefault();
      sygavus = 0;
      label.classList.remove('lohistamas');
      lisaFailid(liik, e.dataTransfer.files);
    });
  }
  // Mööda lohistusala lastud fail ei tohi brauserit failile navigeerima panna.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
}

// Info-nupp: arvutis avaneb kirjeldus hoveriga (CSS), telefonis klikiga.
function seoInfoNupud() {
  const nupud = $$('.info-nupp');
  const sulge = (va) => { for (const n of nupud) if (n !== va) n.setAttribute('aria-expanded', 'false'); };
  for (const nupp of nupud) {
    nupp.addEventListener('click', () => {
      const lahti = nupp.getAttribute('aria-expanded') !== 'true';
      sulge(nupp);
      nupp.setAttribute('aria-expanded', String(lahti));
    });
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('.info')) sulge(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    sulge();
    if (document.activeElement?.matches('.info-nupp')) document.activeElement.blur();
  });
}

// ---------- Arvutamine ----------

function valmis() {
  const puudu = KOHUSTUSLIKUD.filter((l) => !olek.failid[l].some((f) => f.read));
  const vigased = KOHUSTUSLIKUD.filter((l) => olek.failid[l].some((f) => f.viga));
  const laeb = Object.values(olek.failid).flat().some((f) => f.laeb);
  return { ok: !puudu.length && !vigased.length && !laeb, puudu, vigased, laeb };
}

function renderArvutaNupp() {
  const v = valmis();
  $('#arvuta').disabled = !v.ok;
  const vihje = $('#arvuta-vihje');
  vihje.classList.toggle('vihje-viga', v.vigased.length > 0);
  if (v.laeb) vihje.textContent = 'Loen faile…';
  else if (v.vigased.length) vihje.textContent = `Eemalda vigased failid alast: ${v.vigased.map((l) => LIIGI_NIMI[l]).join(', ')}.`;
  else if (v.puudu.length) vihje.textContent = `Lisa failid: ${v.puudu.map((l) => LIIGI_NIMI[l]).join(', ')}.`;
  else if (olek.tulemus && !olek.aegunud) vihje.textContent = 'Tulemused on ajakohased. Seadete muutus arvutab uuesti.';
  else vihje.textContent = 'Kõik vajalikud failid on laetud.';
}

function sisend() {
  const read = (l) => olek.failid[l].filter((f) => f.read).flatMap((f) => f.read);
  return { kuludTulud: read('kuludTulud'), tooaeg: read('tooaeg'), palgad: read('palgad'), kontroll: read('kontroll') };
}

function arvutaNyyd() {
  clearTimeout(arvutusTaimer);
  if (!valmis().ok) return;
  const vigaEl = $('#arvutuse-viga');
  try {
    olek.tulemus = arvuta(sisend(), olek.seaded);
    olek.aegunud = false;
    renderAegunud();
    vigaEl.hidden = true;
  } catch (e) {
    vigaEl.textContent = `Arvutus ebaõnnestus: ${e?.message ?? e}`;
    vigaEl.hidden = false;
    return;
  }
  olek.koond = projektiKoond(olek.tulemus.lopptabel);
  if (!olek.koond.some((p) => p.projekti_kood === olek.valitudProjekt)) {
    olek.valitudProjekt = null;
    olek.valitudKonto = null;
  }
  const esimest = $('#tulemused').hidden;
  $('#tulemused').hidden = false;
  renderTulemused();
  renderArvutaNupp();
  teata(`Arvutatud: ${olek.tulemus.kuud.length} kuud, ${olek.koond.length} projekti.`);
  if (esimest) $('#tulemused-pealkiri').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

// ---------- Tabelid ----------

// veerud: [{ voti, pealkiri, tyyp: 'raha'|'arv'|'tunnid'|'kuu'|'tekst', vorm?(rida), klass?(rida) }]
function renderTabel(veerud, read, { max = MAX_READ, pealdis, reaKlass } = {}) {
  const numbriline = (v) => ['raha', 'arv', 'tunnid'].includes(v.tyyp);
  const vorminda = (v, r) => {
    if (v.vorm) return v.vorm(r);
    const x = r[v.voti];
    if (v.tyyp === 'raha') return raha(x);
    if (v.tyyp === 'tunnid') return arv(x, 1);
    if (v.tyyp === 'arv') return arv(x, 0);
    if (v.tyyp === 'kuu') return kuuKuvaks(x);
    return x == null || x === '' ? '—' : String(x);
  };
  const konteiner = h('div', { class: 'tabel-plokk' });
  const joonista = (piir) => {
    const naha = read.slice(0, piir);
    const tabel = h('table', { class: 'tabel' },
      pealdis ? h('caption', { class: 'sr', text: pealdis }) : null,
      h('thead', {}, h('tr', {}, veerud.map((v) => h('th', { scope: 'col', class: numbriline(v) ? 'nr' : null, text: v.pealkiri })))),
      h('tbody', {}, naha.map((r) => h('tr', { class: reaKlass?.(r) ?? null },
        veerud.map((v) => h('td', {
          class: [numbriline(v) ? 'nr' : '', v.tyyp === 'kuu' ? 'kuu' : '', v.klass?.(r) ?? ''].join(' ').trim() || null,
          text: vorminda(v, r),
        }))))));
    const kerimine = h('div', { class: 'tabel-kerimine', tabindex: '0', role: 'region', 'aria-label': pealdis ?? 'Tabel' }, tabel);
    const osad = [kerimine];
    if (read.length > piir) {
      osad.push(h('div', { class: 'tabel-jalus' },
        h('span', { class: 'vihje', text: `Näidatud ${arv(piir, 0)} rida ${arv(read.length, 0)}-st.` }),
        h('button', {
          type: 'button', class: 'nupp nupp-teisene nupp-vaike', text: `Näita kõiki (${arv(read.length, 0)})`,
          onclick: () => { joonista(Infinity); $('.tabel-kerimine', konteiner).focus(); },
        })));
    }
    konteiner.replaceChildren(...osad);
  };
  joonista(max);
  return konteiner;
}

const tyhi = (tekst) => h('p', { class: 'tyhi' }, ikoon('ok', 'ikoon-vaike'), h('span', { text: tekst }));
const selgitus = (tekst) => h('p', { class: 'selgitus', text: tekst });

// ---------- Paneelid ----------

function paneel(nimi, { mark, hoiatus = false, sisu }) {
  const d = $(`details[data-paneel="${nimi}"]`);
  const m = $('summary .mark', d);
  m.textContent = mark;
  d.classList.toggle('on-hoiatus', hoiatus);
  if (sisu) $('.paneel-sisu', d).replaceChildren(...[sisu].flat().filter(Boolean));
}

const summa = (read, voti) => read.reduce((a, r) => a + (r[voti] ?? 0), 0);
const eur0 = (x) => `${arv(x, 0)} €`;

function renderTulemused() {
  const t = olek.tulemus;
  const kuud = t.kuud;
  const palgafond = summa(kuud, 'palgafond');
  const jaotatud = summa(kuud, 'jaotatud');
  const jaotamata = summa(kuud, 'jaotamata');
  const maxVahe = kuud.reduce((m, k) => Math.max(m, Math.abs(k.vahe)), 0);
  const periood = kuud.length ? `${kuuKuvaks(kuud[0].kuu)} – ${kuuKuvaks(kuud.at(-1).kuu)}` : '—';
  $('#tulemused-kirjeldus').textContent = `${periood} · ${kuud.length} kuud · ${arv(olek.koond.length, 0)} projekti`;

  // 1. Kokkuvõte
  const k = t.kategooriad;
  const rida = (silt, vaartus, klass) => h('div', { class: `kv-rida ${klass ?? ''}`.trim() }, h('dt', { text: silt }), h('dd', { text: vaartus }));
  paneel('kokkuvote', {
    mark: `palgafond ${eur0(palgafond)}`,
    sisu: [
      h('div', { class: 'kv-veerud' },
        h('section', { class: 'kv-grupp', 'aria-label': 'Palgafond' },
          h('h4', { text: 'Palgafond' }),
          h('dl', { class: 'kv' },
            rida('Palgafond kokku', `${raha(palgafond)} €`),
            rida('Jaotatud projektidele', `${raha(jaotatud)} €`),
            rida('Jaotamata', `${raha(jaotamata)} €`, jaotamata ? 'kv-hoiatus' : null),
            rida('Suurim kuu vahe', `${raha(maxVahe)} €`, maxVahe >= 0.01 ? 'kv-hoiatus' : null))),
        h('section', { class: 'kv-grupp', 'aria-label': 'Projektid' },
          h('h4', { text: 'Projektid' }),
          h('dl', { class: 'kv' },
            rida('Kulud-tulud ja palgakulu', arv(k.molemad, 0)),
            rida('Ainult kulud-tulud', arv(k.vaidKuluTulu, 0), k.vaidKuluTulu ? 'kv-hoiatus' : null),
            rida('Ainult palgakulu', arv(k.vaidPalk, 0), k.vaidPalk ? 'kv-hoiatus' : null),
            rida('Kokku', arv(k.molemad + k.vaidKuluTulu + k.vaidPalk, 0))))),
      t.duplikaadid.length
        ? h('p', { class: 'teade teade-hoiatus' }, ikoon('hoiatus', 'ikoon-vaike'),
          h('span', { text: `Laetud failides on kattuvaid ridu (${t.duplikaadid.length} failipaari) — need arvestatakse topelt. Uue ekspordi korral asenda vana fail, ära lisa uut vana kõrvale. Täpsemalt: „Arvutuse hoiatused“.` }))
        : null,
      t.tundmatudTasuliigid.length
        ? h('p', { class: 'teade teade-hoiatus' }, ikoon('hoiatus', 'ikoon-vaike'),
          h('span', { text: `Tundmatud tasuliigid (arvestatud, kontrolli seadetes): ${t.tundmatudTasuliigid.join(', ')}` }))
        : null,
    ],
  });

  // Hoiatused
  paneel('hoiatused', {
    mark: arv(t.hoiatused.length, 0),
    hoiatus: t.hoiatused.length > 0,
    sisu: t.hoiatused.length
      ? h('ul', { class: 'hoiatuste-loend' }, t.hoiatused.map((x) => h('li', { text: x })))
      : tyhi('Arvutus lõppes hoiatusteta: kõik kuud jaotati ja erandite ülejäägid on positiivsed.'),
  });
  if (t.duplikaadid.length) $('details[data-paneel="hoiatused"]').open = true;

  // 2. Kulud-tuludes, palgakuluta
  paneel('ilmaPalgata', {
    mark: arv(t.projektidIlmaPalgata.length, 0),
    hoiatus: t.projektidIlmaPalgata.length > 0,
    sisu: t.projektidIlmaPalgata.length
      ? [selgitus('Nendel projektidel on kulusid või tulusid, kuid tööajas pole neile tunde (või tunnid on väljaspool perioodi). Kontrolli projektikoodi kirjapilti tööaja failis.'),
        renderTabel([{ voti: 'projekti_kood', pealkiri: 'Kood' }, { voti: 'nimetus', pealkiri: 'Nimetus' }],
          t.projektidIlmaPalgata, { pealdis: 'Projektid ilma palgakuluta' })]
      : tyhi('Kõik kulude-tulude projektid said palgakulu.'),
  });

  // 3. Palgakulu, kulud-tuludes pole
  paneel('palkIlmaKuluTuluta', {
    mark: t.palkIlmaKuluTuluta.length
      ? `${arv(t.palkIlmaKuluTuluta.length, 0)} · ${eur0(-summa(t.palkIlmaKuluTuluta, 'palgakulu'))}`
      : '0',
    hoiatus: t.palkIlmaKuluTuluta.length > 0,
    sisu: t.palkIlmaKuluTuluta.length
      ? [selgitus('Tööajas on tunnid projektikoodile, mida kulude-tulude aruandes pole. Palgakulu on arvestatud, kuid projekt jääb aruandes ainult kuluga.'),
        renderTabel([{ voti: 'projekti_kood', pealkiri: 'Kood' }, { voti: 'nimetus', pealkiri: 'Nimetus' },
          { voti: 'palgakulu', pealkiri: 'Palgakulu, €', tyyp: 'raha', vorm: (r) => raha(-r.palgakulu) }], t.palkIlmaKuluTuluta, { pealdis: 'Palgakulu ilma kulude-tuludeta' })]
      : tyhi('Kõik palgakuluga projektid on kulude-tulude aruandes olemas.'),
  });

  // 4. Nimede mittevasted
  const tunnidetaNimed = new Map();
  for (const r of t.tunnideta) {
    const x = tunnidetaNimed.get(r.tootaja_nimi) ?? { tootaja_nimi: r.tootaja_nimi, kuud: [], palk: 0, pole_tooajas: r.pole_tooajas };
    x.kuud.push(r.kuu);
    x.palk += r.palk;
    tunnidetaNimed.set(r.tootaja_nimi, x);
  }
  const tunnideta = [...tunnidetaNimed.values()].sort((a, b) => a.tootaja_nimi.localeCompare(b.tootaja_nimi, 'et'));
  const kuudeLoend = (kuud) => (kuud.length > 3 ? `${kuuKuvaks(kuud[0])} … ${kuuKuvaks(kuud.at(-1))} (${kuud.length})` : kuud.map(kuuKuvaks).join(', '));
  paneel('mittevasted', {
    mark: `${arv(t.palgata.length, 0)} + ${arv(tunnideta.length, 0)}`,
    hoiatus: t.palgata.length + tunnideta.length > 0,
    sisu: [
      selgitus('Nimed seotakse tööaja ja palgafailide vahel. Kirjavea korral lisa seadetes alias; kontori- ja juhtkonna töötajatel on tundideta palk tavaline — see läheb üldkulusse.'),
      h('h4', { text: `Tunnid ilma palgata (${t.palgata.length})` }),
      t.palgata.length
        ? renderTabel([{ voti: 'tootaja_nimi', pealkiri: 'Töötaja', vorm: (r) => (r.erand ? `${r.tootaja_nimi} (erand)` : r.tootaja_nimi) },
          { voti: 'kuud', pealkiri: 'Kuud', vorm: (r) => kuudeLoend(r.kuud) },
          { voti: 'tunnid', pealkiri: 'Tunnid', tyyp: 'tunnid' }], t.palgata, { pealdis: 'Tunnid ilma palgata' })
        : tyhi('Kõigil tööajas olijatel on palk.'),
      h('h4', { text: `Palk ilma tundideta (${tunnideta.length})` }),
      tunnideta.length
        ? renderTabel([{ voti: 'tootaja_nimi', pealkiri: 'Töötaja' }, { voti: 'kuud', pealkiri: 'Kuud', vorm: (r) => kuudeLoend(r.kuud) },
          { voti: 'palk', pealkiri: 'Palk kokku, €', tyyp: 'raha' },
          { voti: 'pole_tooajas', pealkiri: 'Tööaja failis', vorm: (r) => (r.pole_tooajas ? 'puudub' : 'on, 0 h') }],
          tunnideta, { pealdis: 'Palk ilma tundideta' })
        : tyhi('Kõigil palgasaajatel on tunnid.'),
    ],
  });

  // 5. Erandid
  const negatiivseid = t.erandid.filter((e) => e.ylejaak < 0).length;
  paneel('erandid', {
    mark: negatiivseid ? `${arv(t.erandid.length, 0)} rida · ${negatiivseid} negatiivset` : `${arv(t.erandid.length, 0)} rida`,
    hoiatus: negatiivseid > 0,
    sisu: t.erandid.length
      ? [selgitus('Objektikulu = objektitunnid × kuu tavatöötajate keskmine tunnihind. Ülejääk (palk − objektikulu) läheb kuu üldkulusse; negatiivne ülejääk vähendab üldkulu.'),
        renderTabel([
          { voti: 'kuu', pealkiri: 'Kuu', tyyp: 'kuu' }, { voti: 'tootaja_nimi', pealkiri: 'Töötaja' },
          { voti: 'palk', pealkiri: 'Palk, €', tyyp: 'raha' }, { voti: 'objektitunnid', pealkiri: 'Objektitunnid', tyyp: 'tunnid' },
          { voti: 'kontoritunnid', pealkiri: 'Kontoritunnid', tyyp: 'tunnid' },
          { voti: 'keskmine_tunnihind', pealkiri: 'Keskm. €/h', tyyp: 'raha' },
          { voti: 'objektikulu', pealkiri: 'Objektikulu, €', tyyp: 'raha' },
          { voti: 'ylejaak', pealkiri: 'Ülejääk, €', tyyp: 'raha', klass: (r) => (r.ylejaak < 0 ? 'negatiivne' : '') },
        ], t.erandid, { pealdis: 'Erandtöötajad kuude kaupa' })]
      : tyhi('Perioodis pole erandtöötajate ridu.'),
  });

  // 6. Kuukontroll
  const onKontroll = kuud.some((x) => x.kontroll != null);
  const kuuVeerud = [
    { voti: 'kuu', pealkiri: 'Kuu', tyyp: 'kuu' },
    { voti: 'palgafond', pealkiri: 'Palgafond, €', tyyp: 'raha' },
    { voti: 'jaotatud', pealkiri: 'Jaotatud, €', tyyp: 'raha' },
    { voti: 'jaotamata', pealkiri: 'Jaotamata, €', tyyp: 'raha', klass: (r) => (r.jaotamata ? 'hoiatus-tekst' : '') },
    { voti: 'vahe', pealkiri: 'Vahe, €', tyyp: 'raha', vorm: (r) => raha(Math.abs(r.vahe) < 0.005 ? 0 : r.vahe), klass: (r) => (Math.abs(r.vahe) >= 0.01 ? 'negatiivne' : '') },
    { voti: 'keskmine_tunnihind', pealkiri: 'Keskm. €/h', tyyp: 'raha' },
  ];
  if (onKontroll) {
    kuuVeerud.push({ voti: 'kontroll', pealkiri: 'PR kanne, €', tyyp: 'raha' },
      { voti: 'suhe', pealkiri: 'PR / palgafond', tyyp: 'arv', vorm: (r) => (r.kontroll != null && r.palgafond ? arv(r.kontroll / r.palgafond, 3) : '—') });
  }
  const probleemKuud = kuud.filter((x) => Math.abs(x.vahe) >= 0.01 || x.jaotamata).length;
  paneel('kuukontroll', {
    mark: probleemKuud ? `${kuud.length} kuud · ${probleemKuud} kontrollida` : `${kuud.length} kuud · klapib`,
    hoiatus: probleemKuud > 0,
    sisu: [
      selgitus('Iga kuu peab kehtima: jaotatud + jaotamata = palgafond (vahe 0). Jaotatud sisaldab otsest palgakulu, erandite objektikulu ja jaotatud üldkulu.'
        + (onKontroll ? ' PR-kannete summa ei ole palgafondi kulu — see sisaldab kinnipeetud makse jm ja on siin ainult kõrvutamiseks; suhe ei peagi olema 1.' : ' PR-kannete kõrvutamiseks lisa valikuline kontrollfail.')),
      renderTabel(kuuVeerud, kuud, { pealdis: 'Palgafondi kuukontroll', reaKlass: (r) => (Math.abs(r.vahe) >= 0.01 || r.jaotamata ? 'rida-hoiatus' : null) }),
    ],
  });

  // 7. Anomaaliad
  const { alla, ule } = olek.seaded.anomaalia;
  const anomaaliad = [...t.anomaaliad].sort((a, b) => a.tootaja_nimi.localeCompare(b.tootaja_nimi, 'et') || a.kuu.localeCompare(b.kuu));
  paneel('anomaaliad', {
    mark: arv(anomaaliad.length, 0),
    hoiatus: anomaaliad.length > 0,
    sisu: anomaaliad.length
      ? [selgitus(`Tavatöötajate kuud, kus tunnihind (kuu palk / kuu tunnid) on alla ${arv(alla, 2)} € või üle ${arv(ule, 2)} €. Sageli põhjus: puuduvad tunnid, puhkusetasu või osaline kuu.`),
        renderTabel([
          { voti: 'tootaja_nimi', pealkiri: 'Töötaja' }, { voti: 'kuu', pealkiri: 'Kuu', tyyp: 'kuu' },
          { voti: 'palk', pealkiri: 'Palk, €', tyyp: 'raha' }, { voti: 'tunnid', pealkiri: 'Tunnid', tyyp: 'tunnid' },
          { voti: 'tunnihind', pealkiri: '€/h', tyyp: 'raha', klass: (r) => (r.tunnihind < alla ? 'madal' : 'korge') },
        ], anomaaliad, { pealdis: 'Tunnihinna anomaaliad' })]
      : tyhi(`Kõik tunnihinnad jäävad vahemikku ${arv(alla, 2)}–${arv(ule, 2)} €.`),
  });

  // 8. Kasumlikkus
  const kasumKokku = summa(olek.koond, 'kasum');
  paneel('kasumlikkus', { mark: `kasum ${eur0(kasumKokku)}`, hoiatus: false });
  renderProjektid();
}

// ---------- Kasumlikkus ----------

function sorteeritudProjektid() {
  const [voti, suund] = $('#kasum-sort').value.split('-');
  const otsing = nimeVoti($('#kasum-otsi').value);
  const m = suund === 'kahanev' ? -1 : 1;
  return olek.koond
    .filter((p) => !otsing || nimeVoti(p.projekti_kood).includes(otsing) || nimeVoti(p.nimetus).includes(otsing))
    .sort((a, b) => m * (a[voti] - b[voti]) || a.projekti_kood.localeCompare(b.projekti_kood, 'et'));
}

function renderProjektid() {
  const loend = sorteeritudProjektid();
  $('#projektid-arv').textContent = loend.length === olek.koond.length
    ? `${arv(loend.length, 0)} projekti`
    : `${arv(loend.length, 0)} / ${arv(olek.koond.length, 0)} projekti`;
  if (!olek.valitudProjekt && loend.length) olek.valitudProjekt = loend[0].projekti_kood;
  $('#projektid').replaceChildren(...loend.map((p) => h('li', {},
    h('button', {
      type: 'button', class: 'projekt', 'aria-pressed': String(p.projekti_kood === olek.valitudProjekt),
      onclick: (e) => {
        olek.valitudProjekt = p.projekti_kood;
        olek.valitudKonto = null;
        olek.koikKontod = false;
        for (const b of $$('#projektid .projekt')) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        renderDetail();
      },
    },
    h('span', { class: 'projekt-nimi' }, h('span', { class: 'projekt-kood', text: p.projekti_kood }),
      h('span', { class: 'projekt-nimetus', text: ilmaKoodita(p) })),
    h('span', { class: `projekt-kasum nr ${p.kasum < 0 ? 'negatiivne' : ''}`, text: `${raha(p.kasum)} €` }),
    h('span', { class: `projekt-marginaal nr ${p.tulu > 0 && p.marginaal < 0 ? 'negatiivne' : ''}`, text: marginaal(p) })),
  )));
  if (!loend.length) $('#projektid').replaceChildren(h('li', { class: 'tyhi-rida', text: 'Otsingule vastavat projekti pole.' }));
  renderDetail();
}

// Nimetus algab tihti koodiga ("K100 Näidismaja …" või "E900_Näidiskool …") — kood on juba eraldi näha.
function ilmaKoodita(p) {
  if (p.nimetus === p.projekti_kood) return '';
  const t = p.nimetus.startsWith(p.projekti_kood) ? p.nimetus.slice(p.projekti_kood.length).replace(/^[\s_\-–:]+/, '') : p.nimetus;
  return t || '';
}

function renderDetail() {
  const el = $('#projekt-detail');
  const p = olek.koond.find((x) => x.projekti_kood === olek.valitudProjekt);
  if (!p) { el.replaceChildren(h('p', { class: 'vihje', text: 'Vali vasakult projekt.' })); return; }
  const read = olek.tulemus.lopptabel.filter((r) => r.projekti_kood === p.projekti_kood);
  const palgakulu = -read.filter((r) => PALGAKONTOD.has(r.konto_nimetus)).reduce((a, r) => a + r.summa, 0);
  const kontod = kontodeKaupa(olek.tulemus.lopptabel, p.projekti_kood);

  const naitaja = (silt, vaartus, klass) => h('div', { class: `naitaja ${klass ?? ''}`.trim() }, h('dt', { text: silt }), h('dd', { class: 'nr', text: vaartus }));
  el.replaceChildren(
    h('h4', { class: 'detail-pealkiri' }, h('span', { class: 'projekt-kood', text: p.projekti_kood }), ' ', ilmaKoodita(p)),
    h('dl', { class: 'naitajad' },
      naitaja('Tulu', `${raha(p.tulu)} €`),
      naitaja('Kulu', `${raha(p.kulu)} €`),
      naitaja('sh palgakulu', `${raha(palgakulu)} €`),
      naitaja('Kasum', `${raha(p.kasum)} €`, p.kasum < 0 ? 'negatiivne' : 'positiivne'),
      naitaja('Marginaal', marginaal(p), p.tulu > 0 && p.marginaal < 0 ? 'negatiivne' : null)),
    h('div', { class: 'graafik-pais' },
      h('h5', { text: 'Kontode kaupa' }),
      h('div', { class: 'legend', 'aria-hidden': 'true' },
        h('span', { class: 'legend-tulu', text: 'tulu' }), h('span', { class: 'legend-kulu', text: 'kulu' }))),
    h('p', { class: 'vihje', text: 'Vali konto, et näha selle tehinguid.' }),
    h('div', { class: 'graafik', id: 'graafik' }),
    h('div', { id: 'tehingud' }),
  );
  joonistaGraafik(kontod);
  renderTehingud(read);
}

const GRAAFIK_MAX = 12;

function joonistaGraafik(kontodKoik) {
  const koht = $('#graafik');
  if (!koht) return;
  if (!kontodKoik.length) { koht.replaceChildren(h('p', { class: 'vihje', text: 'Projektil pole ridu.' })); return; }
  // Vaikimisi suurimad kontod; valitud konto on alati nähtav.
  const kontod = olek.koikKontod || kontodKoik.length <= GRAAFIK_MAX + 2
    ? kontodKoik
    : kontodKoik.filter((k, i) => i < GRAAFIK_MAX || k.konto_nimetus === olek.valitudKonto);
  const W = Math.max(260, (koht.clientWidth || 600) - 12);
  const RIBA = 12, VAHE = 4, PEALKIRI = 20, ALUMINE = 12, VAARTUS_RUUM = 108;
  const max = Math.max(...kontod.map((k) => Math.max(k.tulu, k.kulu)), 1);
  const skaala = (x) => (x / max) * (W - VAARTUS_RUUM);
  let y = 0;
  const read = kontod.map((k) => {
    const y0 = y;
    const ribad = [];
    let ry = y0 + PEALKIRI;
    for (const [liik, v] of [['tulu', k.tulu], ['kulu', k.kulu]]) {
      if (v <= 0) continue;
      const w = Math.max(2, skaala(v));
      ribad.push(s('rect', { class: `riba riba-${liik}`, x: 0, y: ry, width: w, height: RIBA, rx: 2 }));
      ribad.push(s('text', { class: 'riba-vaartus', x: w + 6, y: ry + RIBA - 2 }, `${raha(v)} €`));
      ry += RIBA + VAHE;
    }
    const korgus = ry - VAHE + ALUMINE - y0;
    y += korgus;
    const kirjeldus = [k.tulu > 0 ? `tulu ${raha(k.tulu)} €` : '', k.kulu > 0 ? `kulu ${raha(k.kulu)} €` : ''].filter(Boolean).join(', ');
    const valitud = k.konto_nimetus === olek.valitudKonto;
    const vali = () => {
      olek.valitudKonto = valitud ? null : k.konto_nimetus;
      renderDetailSailitaFookus(k.konto_nimetus);
    };
    return s('g', {
      class: `graafik-rida${valitud ? ' valitud' : ''}`, tabindex: '0', role: 'button',
      'aria-pressed': String(valitud), 'aria-label': `${k.konto_nimetus}: ${kirjeldus}`, 'data-konto': k.konto_nimetus,
      onclick: vali,
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vali(); } },
    },
    s('rect', { class: 'rida-taust', x: -6, y: y0 + 1, width: W + 12, height: korgus - 2, rx: 4 }),
    s('text', { class: 'konto-nimi', x: 0, y: y0 + 15 }, lyhenda(k.konto_nimetus, Math.floor((W - 10) / 7))),
    ...ribad);
  });
  const osad = [s('svg', {
    viewBox: `-6 0 ${W + 12} ${y}`, width: W + 12, height: y, role: 'group', 'aria-label': 'Tulu ja kulu kontode kaupa',
  }, ...read)];
  if (kontodKoik.length > GRAAFIK_MAX + 2) {
    osad.push(h('button', {
      type: 'button', class: 'nupp nupp-teisene nupp-vaike graafik-rohkem',
      text: olek.koikKontod ? `Näita ainult suurimat ${GRAAFIK_MAX}` : `Näita kõiki kontosid (${kontodKoik.length})`,
      'aria-expanded': String(Boolean(olek.koikKontod)),
      onclick: () => {
        olek.koikKontod = !olek.koikKontod;
        joonistaGraafik(kontodKoik);
        $('#graafik .graafik-rohkem')?.focus();
      },
    }));
  }
  koht.replaceChildren(...osad);
}

const lyhenda = (t, n) => (t.length > n ? `${t.slice(0, Math.max(1, n - 1))}…` : t);

function renderDetailSailitaFookus(konto) {
  renderDetail();
  const g = $$('#graafik .graafik-rida').find((x) => x.dataset.konto === konto);
  g?.focus();
}

function renderTehingud(read) {
  const koht = $('#tehingud');
  if (!olek.valitudKonto) { koht.replaceChildren(); return; }
  const konto = olek.valitudKonto;
  const tehingud = read.filter((r) => (r.konto_nimetus || '(konto puudub)') === konto)
    .sort((a, b) => (a.kuu ?? '').localeCompare(b.kuu ?? '') || a.summa - b.summa);
  koht.replaceChildren(
    h('h5', { class: 'tehingud-pealkiri' }, `${konto} `, h('span', { class: 'vihje', text: `· ${arv(tehingud.length, 0)} rida · ${raha(tehingud.reduce((a, r) => a + r.summa, 0))} €` })),
    renderTabel([
      { voti: 'kuu', pealkiri: 'Kuu', tyyp: 'kuu' },
      { voti: 'klient_tarnija', pealkiri: 'Klient / tarnija' },
      { voti: 'summa', pealkiri: 'Summa, €', tyyp: 'raha', klass: (r) => (r.summa < 0 ? 'kulu-tekst' : '') },
    ], tehingud, { pealdis: `Tehingud: ${konto}` }),
  );
}

// ---------- Eksport ----------

function ekspordi() {
  if (!olek.tulemus || olek.aegunud) return;
  try {
    XLSX.writeFile(looTooraamat(XLSX, olek.tulemus, olek.seaded), 'projektide-kasumlikkus.xlsx');
    teata('Excel koostatud: projektide-kasumlikkus.xlsx');
  } catch (e) {
    const vigaEl = $('#arvutuse-viga');
    vigaEl.textContent = `Eksport ebaõnnestus: ${e?.message ?? e}`;
    vigaEl.hidden = false;
  }
}

// ---------- Käivitus ----------

function kaivita() {
  if (typeof XLSX === 'undefined') $('#teegi-viga').hidden = false;
  seoLohistus();
  seoInfoNupud();
  seoSeaded();
  renderSeaded();
  renderArvutaNupp();
  $('#arvuta').addEventListener('click', arvutaNyyd);
  $('#ekspordi').addEventListener('click', ekspordi);
  $('#kasum-sort').addEventListener('change', () => { olek.valitudProjekt = null; olek.valitudKonto = null; renderProjektid(); });
  let otsiTaimer;
  $('#kasum-otsi').addEventListener('input', () => { clearTimeout(otsiTaimer); otsiTaimer = setTimeout(renderProjektid, 150); });

  let laius = 0;
  new ResizeObserver(([kirje]) => {
    const w = Math.round(kirje.contentRect.width);
    if (w === laius || !olek.tulemus) { laius = w; return; }
    laius = w;
    joonistaGraafik(kontodeKaupa(olek.tulemus.lopptabel, olek.valitudProjekt));
  }).observe($('#projekt-detail'));
}

kaivita();
