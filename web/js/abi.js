// UI puhtad abifunktsioonid (ilma DOM-ita) — testitavad Node'is.
import { looSeaded, VAIKESEADED } from './calc.js';

const KUU_RE = /^(\d{4})(\d{2})$/;

// <input type="month"> väärtus 'YYYY-MM' → seadete 'YYYYMM' ('' = piir puudub).
export const kuuSisendist = (v) => {
  const m = /^(\d{4})-(\d{2})$/.exec(v ?? '');
  return m ? m[1] + m[2] : '';
};
export const kuuSisendiks = (v) => {
  const m = KUU_RE.exec(v ?? '');
  return m ? `${m[1]}-${m[2]}` : '';
};
export const kuuKuvaks = (v) => kuuSisendiks(v) || '—';

const onObjekt = (x) => x != null && typeof x === 'object' && !Array.isArray(x);
const tekstid = (x) => (Array.isArray(x) ? x.filter((v) => typeof v === 'string') : null);
const kuuVoiTyhi = (v) => (typeof v === 'string' && KUU_RE.test(v) ? v : '');
const lopmatu = (v, vaikimisi) => (typeof v === 'number' && Number.isFinite(v) ? v : vaikimisi);

// localStorage'ist loetud (võimalik et vana või rikutud) seaded → täielik seadete objekt.
// Pesastatud objektid ühendatakse vaikeväärtustega, et puuduvad võtmed ei kaoks.
export function puhastaSeaded(s) {
  const v = VAIKESEADED;
  if (!onObjekt(s)) return looSeaded();
  const periood = onObjekt(s.periood) ? s.periood : {};
  const anomaalia = onObjekt(s.anomaalia) ? s.anomaalia : {};
  return looSeaded({
    erandid: tekstid(s.erandid) ?? [...v.erandid],
    aliased: Array.isArray(s.aliased)
      ? s.aliased.filter(onObjekt).map((a) => ({ kust: String(a.kust ?? ''), kuhu: String(a.kuhu ?? '') }))
      : structuredClone(v.aliased),
    valjaJaetudTasuliigid: tekstid(s.valjaJaetudTasuliigid) ?? [],
    periood: { algus: kuuVoiTyhi(periood.algus), lopp: kuuVoiTyhi(periood.lopp) },
    kontoriMuster: typeof s.kontoriMuster === 'string' && s.kontoriMuster ? s.kontoriMuster : v.kontoriMuster,
    anomaalia: { alla: lopmatu(anomaalia.alla, v.anomaalia.alla), ule: lopmatu(anomaalia.ule, v.anomaalia.ule) },
  });
}

export function kuuVahemik(read) {
  let min = null, max = null;
  for (const r of read) {
    if (!r.kuu) continue;
    if (min == null || r.kuu < min) min = r.kuu;
    if (max == null || r.kuu > max) max = r.kuu;
  }
  if (min == null) return '';
  return min === max ? kuuKuvaks(min) : `${kuuKuvaks(min)} – ${kuuKuvaks(max)}`;
}

// Kulud-tulude faili meta: periood rakendub ainult kuupäevaga ridadele („Dok. kuupäev“).
export function kuupaevata(read) {
  const n = read.filter((r) => !r.kuu).length;
  if (!n) return '';
  return n === read.length ? 'kuupäev puudub' : `${arv(n, 0)} rida kuupäevata`;
}

const vormijad = new Map();
const vormija = (kohti) => {
  if (!vormijad.has(kohti)) {
    vormijad.set(kohti, new Intl.NumberFormat('et-EE', { minimumFractionDigits: kohti, maximumFractionDigits: kohti }));
  }
  return vormijad.get(kohti);
};
export const arv = (x, kohti = 2) => (x == null || !Number.isFinite(x) ? '—' : vormija(kohti).format(x));
export const raha = (x) => arv(x, 2);
export const marginaal = (p) => (p.tulu > 0 ? `${arv(p.marginaal, 1)} %` : 'tuluta');
