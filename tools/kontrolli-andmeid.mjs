// Päris andmete kontroll: node tools/kontrolli-andmeid.mjs [andmekaust] [--json väljund.json]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { parseKuludTulud, parseTooaeg, parsePalgad, parseKontroll } from '../web/js/parse.js';
import { arvuta } from '../web/js/calc.js';

const argumendid = process.argv.slice(2);
const jsonIdx = argumendid.indexOf('--json');
const jsonFail = jsonIdx >= 0 ? argumendid[jsonIdx + 1] : null;
const jaataVahele = jsonIdx >= 0 ? jsonIdx + 1 : -1;
const kaust = argumendid.find((a, i) => !a.startsWith('--') && i !== jaataVahele) ?? '../prosystem-andmed';

const failid = readdirSync(kaust).filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$'));
const loe = (f) => {
  const wb = XLSX.read(readFileSync(join(kaust, f)));
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
};
const vali = (re, parse) => failid.filter((f) => re.test(f.normalize('NFC'))).flatMap((f) => parse(loe(f), f));

const sisend = {
  kuludTulud: vali(/^ProSystem OÜ Dimensiooni Projekt detailne aruanne/, parseKuludTulud),
  tooaeg: vali(/^Tööaeg/, parseTooaeg),
  palgad: vali(/^Tasude ja tundide aruanne/, parsePalgad),
  kontroll: vali(/^palga kontroll/, parseKontroll),
};
console.log('Ridu:', Object.fromEntries(Object.entries(sisend).map(([k, v]) => [k, v.length])));

if (sisend.kuludTulud.length === 0) {
  console.error('VIGA: kuludTulud - andmeid ei leitud');
  process.exit(1);
}
if (sisend.tooaeg.length === 0) {
  console.error('VIGA: tooaeg - andmeid ei leitud');
  process.exit(1);
}
if (sisend.palgad.length === 0) {
  console.error('VIGA: palgad - andmeid ei leitud');
  process.exit(1);
}

const r = arvuta(sisend, {});

if (r.kuud.length === 0) {
  console.error('VIGA: kuud - arvutatud andmeid ei leitud');
  process.exit(1);
}
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
console.log('Duplikaadihoiatusi (identsed read eri failides):', r.duplikaadid.length);

if (jsonFail) {
  const proj = {};
  for (const x of r.palgaread) proj[x.projekti_kood] = (proj[x.projekti_kood] ?? 0) + x.summa;
  writeFileSync(jsonFail, JSON.stringify(proj, null, 1));
  console.log('Kirjutatud', jsonFail);
}
process.exit(maxVahe < 0.01 ? 0 : 1);
