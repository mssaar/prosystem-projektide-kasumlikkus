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
      dok_kuupaev: normTekst(lahter(rida, kpVeerg)) || null,  // ainult duplikaatide tuvastuseks
      fail: failinimi,
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
    const kuupaev = normTekst(lahter(rida, veerud['Kuupäev']));
    read.push({ proj_kood_raw: projekt, tootaja_nimi: nimi, kuu, kuupaev, tunnid, fail: failinimi });
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
