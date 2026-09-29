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
