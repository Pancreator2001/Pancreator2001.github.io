// Reglas del ajedrez para "Maia en el navegador" (prueba para el iPhone con Bluefy, 23/11/2026).
// Casillas 0..63: a1 = 0, b1 = 1 ... h1 = 7, a2 = 8 ... h8 = 63 (como Lc0). '.' = casilla vacía;
// piezas con las letras del FEN (PNBRQK blancas, pnbrqk negras).
'use strict';

const FILES = 'abcdefgh';
const sqName = s => FILES[s & 7] + ((s >> 3) + 1);
const sqIndex = n => FILES.indexOf(n[0]) + 8 * (n.charCodeAt(1) - 49);
const isWhite = p => p !== '.' && p === p.toUpperCase();
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

class Pos {
  constructor() {
    this.b = new Array(64).fill('.');
    this.white = true;                       // juegan blancas
    this.castle = { K: false, Q: false, k: false, q: false };
    this.ep = -1;                            // casilla de captura al paso (solo si hay un peón que pueda)
    this.half = 0;                           // jugadas para la regla de las 50
    this.full = 1;
  }

  static fromFen(fen) {
    const p = new Pos();
    const parts = fen.trim().split(/\s+/);
    let r = 7, f = 0;
    for (const c of parts[0]) {
      if (c === '/') { r--; f = 0; continue; }
      if (c >= '1' && c <= '8') { f += +c; continue; }
      p.b[r * 8 + f] = c;
      f++;
    }
    p.white = (parts[1] || 'w') === 'w';
    const cs = parts[2] || '-';
    p.castle = { K: cs.includes('K'), Q: cs.includes('Q'), k: cs.includes('k'), q: cs.includes('q') };
    p.ep = parts[3] && parts[3] !== '-' ? sqIndex(parts[3]) : -1;
    p.half = parts[4] ? parseInt(parts[4], 10) : 0;
    p.full = parts[5] ? parseInt(parts[5], 10) : 1;
    p.fixCastling();
    return p;
  }

  /** Solo los derechos de enroque que el tablero permite (rey y torre en su sitio). */
  fixCastling() {
    const c = this.castle, b = this.b;
    if (b[4] !== 'K') { c.K = false; c.Q = false; }
    if (b[7] !== 'R') c.K = false;
    if (b[0] !== 'R') c.Q = false;
    if (b[60] !== 'k') { c.k = false; c.q = false; }
    if (b[63] !== 'r') c.k = false;
    if (b[56] !== 'r') c.q = false;
  }

  clone() {
    const p = new Pos();
    p.b = this.b.slice();
    p.white = this.white;
    p.castle = Object.assign({}, this.castle);
    p.ep = this.ep;
    p.half = this.half;
    p.full = this.full;
    return p;
  }

  boardFen() {
    let s = '';
    for (let r = 7; r >= 0; r--) {
      let e = 0;
      for (let f = 0; f < 8; f++) {
        const c = this.b[r * 8 + f];
        if (c === '.') { e++; continue; }
        if (e) { s += e; e = 0; }
        s += c;
      }
      if (e) s += e;
      if (r) s += '/';
    }
    return s;
  }

  castleStr() {
    const c = this.castle;
    const s = (c.K ? 'K' : '') + (c.Q ? 'Q' : '') + (c.k ? 'k' : '') + (c.q ? 'q' : '');
    return s || '-';
  }

  fen() {
    return this.boardFen() + ' ' + (this.white ? 'w' : 'b') + ' ' + this.castleStr() + ' ' +
      (this.ep >= 0 ? sqName(this.ep) : '-') + ' ' + this.half + ' ' + this.full;
  }

  /** Para las repeticiones: piezas, turno, enroques y al paso. */
  key() { return this.b.join('') + (this.white ? 'w' : 'b') + this.castleStr() + this.ep; }

  isStart() { return this.key() === Pos.fromFen(START_FEN).key(); }

  kingSq(white) { return this.b.indexOf(white ? 'K' : 'k'); }

  /** ¿Ataca el bando byWhite la casilla sq? */
  attacked(sq, byWhite) {
    const b = this.b, r = sq >> 3, f = sq & 7;
    const at = (rr, ff) => rr >= 0 && rr < 8 && ff >= 0 && ff < 8 ? b[rr * 8 + ff] : null;
    const pr = byWhite ? r - 1 : r + 1, pawn = byWhite ? 'P' : 'p';
    if (at(pr, f - 1) === pawn || at(pr, f + 1) === pawn) return true;
    const kn = byWhite ? 'N' : 'n';
    for (const [dr, df] of KNIGHT) if (at(r + dr, f + df) === kn) return true;
    const kg = byWhite ? 'K' : 'k';
    for (const [dr, df] of KING) if (at(r + dr, f + df) === kg) return true;
    const slide = (dirs, a, c) => {
      for (const [dr, df] of dirs) {
        let rr = r + dr, ff = f + df;
        while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
          const p = b[rr * 8 + ff];
          if (p !== '.') { if (p === a || p === c) return true; break; }
          rr += dr; ff += df;
        }
      }
      return false;
    };
    const Q = byWhite ? 'Q' : 'q';
    if (slide(ROOK_DIRS, byWhite ? 'R' : 'r', Q)) return true;
    if (slide(BISHOP_DIRS, byWhite ? 'B' : 'b', Q)) return true;
    return false;
  }

  inCheck(white = this.white) {
    const k = this.kingSq(white);
    return k >= 0 && this.attacked(k, !white);
  }

  /** Las casillas de las piezas del bando byWhite que atacan sq. */
  attackers(sq, byWhite) {
    const out = [], b = this.b, r = sq >> 3, f = sq & 7;
    const at = (rr, ff) => rr >= 0 && rr < 8 && ff >= 0 && ff < 8 ? rr * 8 + ff : -1;
    const pr = byWhite ? r - 1 : r + 1, pawn = byWhite ? 'P' : 'p';
    for (const df of [-1, 1]) { const s = at(pr, f + df); if (s >= 0 && b[s] === pawn) out.push(s); }
    for (const [dr, df] of KNIGHT) { const s = at(r + dr, f + df); if (s >= 0 && b[s] === (byWhite ? 'N' : 'n')) out.push(s); }
    for (const [dr, df] of KING) { const s = at(r + dr, f + df); if (s >= 0 && b[s] === (byWhite ? 'K' : 'k')) out.push(s); }
    const Q = byWhite ? 'Q' : 'q';
    const slide = (dirs, piece) => {
      for (const [dr, df] of dirs) {
        let rr = r + dr, ff = f + df;
        while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
          const s = rr * 8 + ff, p = b[s];
          if (p !== '.') { if (p === piece || p === Q) out.push(s); break; }
          rr += dr; ff += df;
        }
      }
    };
    slide(ROOK_DIRS, byWhite ? 'R' : 'r');
    slide(BISHOP_DIRS, byWhite ? 'B' : 'b');
    return out;
  }

  /** " por el alfil de a6": quién ataca la casilla. */
  byWhom(sq, byWhite) {
    const a = this.attackers(sq, byWhite);
    if (!a.length) return '';
    const name = { p: 'el peón', n: 'el caballo', b: 'el alfil', r: 'la torre', q: 'la dama', k: 'el rey' }[this.b[a[0]].toLowerCase()];
    return ' por ' + name + ' de ' + sqName(a[0]);
  }

  /** El tablero después de enrocar ('K' corto, 'Q' largo) el bando que mueve, sea legal o no (null: no están rey y torre). */
  castleBoard(side) {
    const w = this.white, base = w ? 0 : 56, K = w ? 'K' : 'k', R = w ? 'R' : 'r', b = this.b.slice();
    const rf = side === 'K' ? base + 7 : base, rt = side === 'K' ? base + 5 : base + 3, kt = side === 'K' ? base + 6 : base + 2;
    if (b[base + 4] !== K || b[rf] !== R) return null;
    b[base + 4] = '.'; b[rf] = '.'; b[kt] = K; b[rt] = R;
    return b;
  }

  /** Por qué no vale la jugada que lleva de esta posición al tablero after (null: no es una jugada reconocible,
   *  o sí vale). 24/11: el usuario enrocó pasando por f1 atacada (y quedando en jaque en g1) y no entendía por
   *  qué Maia no contestaba. */
  illegalReason(after) {
    const w = this.white, key = after.join('');
    for (const side of ['K', 'Q']) {
      const cb = this.castleBoard(side);
      if (!cb || cb.join('') !== key) continue;
      const base = w ? 0 : 56, name = side === 'K' ? 'en corto' : 'en largo';
      if (!(w ? this.castle[side] : this.castle[side.toLowerCase()])) return 'No puedes enrocar ' + name + ': el rey o esa torre ya se han movido en esta partida.';
      const between = side === 'K' ? [base + 5, base + 6] : [base + 1, base + 2, base + 3];
      if (between.some(s => this.b[s] !== '.')) return 'No puedes enrocar ' + name + ': hay piezas entre el rey y la torre.';
      if (this.inCheck(w)) return 'No puedes enrocar ' + name + ': tu rey está en jaque' + this.byWhom(this.kingSq(w), !w) + '.';
      const cross = side === 'K' ? base + 5 : base + 3, land = side === 'K' ? base + 6 : base + 2;
      if (this.attacked(cross, !w)) return 'No puedes enrocar ' + name + ': el rey pasaría por ' + sqName(cross) + ', atacada' + this.byWhom(cross, !w) + '.';
      if (this.attacked(land, !w)) return 'No puedes enrocar ' + name + ': el rey quedaría en jaque en ' + sqName(land) + this.byWhom(land, !w) + '.';
      return null;
    }
    for (const m of this.pseudo()) {
      const n = this.play(m);
      if (n.b.join('') !== key || !n.inCheck(w)) continue;
      return this.inCheck(w) ? 'Esa jugada no saca a tu rey del jaque' + n.byWhom(n.kingSq(w), !w) + '.'
                             : 'Esa jugada deja a tu rey en jaque' + n.byWhom(n.kingSq(w), !w) + '.';
    }
    return null;
  }

  /** El rey movido dos casillas desde su sitio y la torre aún en la esquina: un enroque a medias ('K'/'Q', o null). */
  halfCastle(after) {
    const w = this.white, base = w ? 0 : 56, K = w ? 'K' : 'k';
    for (const side of ['K', 'Q']) {
      const b = this.b.slice(), kt = side === 'K' ? base + 6 : base + 2;
      if (b[base + 4] !== K) continue;
      b[base + 4] = '.'; b[kt] = K;
      if (b.join('') === after.join('')) return side;
    }
    return null;
  }

  pseudo() {
    const moves = [], b = this.b, w = this.white;
    const own = p => p !== '.' && isWhite(p) === w;
    const enemy = p => p !== '.' && isWhite(p) !== w;
    const add = (from, to, promo = '') => moves.push({ from, to, promo });
    for (let s = 0; s < 64; s++) {
      const p = b[s];
      if (!own(p)) continue;
      const r = s >> 3, f = s & 7, t = p.toLowerCase();
      if (t === 'p') {
        const dir = w ? 1 : -1, last = w ? 7 : 0, startRank = w ? 1 : 6;
        const pawnTo = (to) => {
          if ((to >> 3) === last) for (const pr of ['q', 'r', 'b', 'n']) add(s, to, pr);
          else add(s, to);
        };
        const r1 = r + dir;
        if (r1 >= 0 && r1 < 8) {
          const one = r1 * 8 + f;
          if (b[one] === '.') {
            pawnTo(one);
            const two = (r + 2 * dir) * 8 + f;
            if (r === startRank && b[two] === '.') add(s, two);
          }
          for (const df of [-1, 1]) {
            const ff = f + df;
            if (ff < 0 || ff > 7) continue;
            const to = r1 * 8 + ff;
            if (enemy(b[to])) pawnTo(to);
            else if (to === this.ep) add(s, to);
          }
        }
      } else if (t === 'n' || t === 'k') {
        for (const [dr, df] of (t === 'n' ? KNIGHT : KING)) {
          const rr = r + dr, ff = f + df;
          if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
          const to = rr * 8 + ff;
          if (!own(b[to])) add(s, to);
        }
        if (t === 'k') {
          const base = w ? 0 : 56, c = this.castle;
          if (s === base + 4 && !this.inCheck(w)) {
            if ((w ? c.K : c.k) && b[base + 5] === '.' && b[base + 6] === '.' &&
                !this.attacked(base + 5, !w) && !this.attacked(base + 6, !w)) add(s, base + 6);
            if ((w ? c.Q : c.q) && b[base + 3] === '.' && b[base + 2] === '.' && b[base + 1] === '.' &&
                !this.attacked(base + 3, !w) && !this.attacked(base + 2, !w)) add(s, base + 2);
          }
        }
      } else {
        const dirs = t === 'r' ? ROOK_DIRS : t === 'b' ? BISHOP_DIRS : ROOK_DIRS.concat(BISHOP_DIRS);
        for (const [dr, df] of dirs) {
          let rr = r + dr, ff = f + df;
          while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
            const to = rr * 8 + ff;
            if (own(b[to])) break;
            add(s, to);
            if (b[to] !== '.') break;
            rr += dr; ff += df;
          }
        }
      }
    }
    return moves;
  }

  legal() {
    const out = [];
    for (const m of this.pseudo()) {
      const n = this.play(m);
      if (!n.inCheck(this.white)) { m.uci = sqName(m.from) + sqName(m.to) + m.promo; out.push(m); }
    }
    return out;
  }

  /** La posición después de la jugada m (sin comprobar que sea legal). */
  play(m) {
    const n = this.clone(), b = n.b, p = b[m.from], t = p.toLowerCase(), w = this.white;
    const capture = b[m.to] !== '.';
    b[m.to] = m.promo ? (w ? m.promo.toUpperCase() : m.promo) : p;
    b[m.from] = '.';
    if (t === 'p' && m.to === this.ep) b[m.to + (w ? -8 : 8)] = '.';
    if (t === 'k' && Math.abs(m.to - m.from) === 2) {
      const base = w ? 0 : 56;
      if (m.to === base + 6) { b[base + 5] = b[base + 7]; b[base + 7] = '.'; }
      else { b[base + 3] = b[base]; b[base] = '.'; }
    }
    if (t === 'k') { if (w) { n.castle.K = n.castle.Q = false; } else { n.castle.k = n.castle.q = false; } }
    for (const s of [m.from, m.to]) {
      if (s === 0) n.castle.Q = false;
      if (s === 7) n.castle.K = false;
      if (s === 56) n.castle.q = false;
      if (s === 63) n.castle.k = false;
    }
    n.ep = -1;
    if (t === 'p' && Math.abs(m.to - m.from) === 16) {
      const ep = (m.from + m.to) >> 1, f = m.to & 7, enemyPawn = w ? 'p' : 'P';
      if ((f > 0 && b[m.to - 1] === enemyPawn) || (f < 7 && b[m.to + 1] === enemyPawn)) n.ep = ep;
    }
    n.half = t === 'p' || capture ? 0 : this.half + 1;
    if (!w) n.full++;
    n.white = !w;
    return n;
  }

  /** Notación en español: Cf3, Txa5, O-O, exd5, e8=D+, Dxf7#; en = true, la inglesa del PGN (Nf3, Rxa5...). */
  san(m, legal = this.legal(), en = false) {
    const b = this.b, p = b[m.from], t = p.toLowerCase();
    const L = en ? { n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' } : { n: 'C', b: 'A', r: 'T', q: 'D', k: 'R' };
    let s;
    if (t === 'k' && Math.abs(m.to - m.from) === 2) s = (m.to & 7) === 6 ? 'O-O' : 'O-O-O';
    else {
      const capture = b[m.to] !== '.' || (t === 'p' && m.to === this.ep);
      const letter = L[t] || '';
      s = letter;
      if (t === 'p') { if (capture) s += FILES[m.from & 7]; }
      else {
        const others = legal.filter(o => o.to === m.to && o.from !== m.from && b[o.from] === p);
        if (others.length) {
          const sameFile = others.some(o => (o.from & 7) === (m.from & 7));
          const sameRank = others.some(o => (o.from >> 3) === (m.from >> 3));
          if (!sameFile) s += FILES[m.from & 7];
          else if (!sameRank) s += (m.from >> 3) + 1;
          else s += sqName(m.from);
        }
      }
      if (capture) s += 'x';
      s += sqName(m.to);
      if (m.promo) s += '=' + L[m.promo];
    }
    const n = this.play(m);
    if (n.inCheck()) s += n.legal().length ? '+' : '#';
    return s;
  }

  /** Material que no puede dar mate: solo reyes, o rey y un alfil o un caballo. */
  insufficient() {
    const rest = this.b.filter(p => p !== '.' && p.toLowerCase() !== 'k');
    if (rest.length === 0) return true;
    return rest.length === 1 && 'nb'.includes(rest[0].toLowerCase());
  }
}

/** Una partida: las posiciones desde la primera (montada o la inicial) y las jugadas hechas. */
class Partida {
  constructor(first = Pos.fromFen(START_FEN)) {
    this.positions = [first];
    this.moves = [];            // {uci, san, white, number}
  }
  get pos() { return this.positions[this.positions.length - 1]; }
  get fromStart() { return this.positions[0].isStart(); }

  play(m) {
    const p = this.pos, legal = p.legal();
    this.moves.push({ uci: m.uci || (sqName(m.from) + sqName(m.to) + (m.promo || '')), san: p.san(m, legal), sanEn: p.san(m, legal, true), white: p.white, number: p.full });
    this.positions.push(p.play(m));
  }

  /** La partida en PGN (letras inglesas, como piden los programas de ajedrez). */
  pgn(white, black, result) {
    const d = new Date(), z = n => (n < 10 ? '0' : '') + n;
    let h = '[Event "Partida contra Maia"]\n[Site "Ajedrez contra Maia (web)"]\n[Date "' + d.getFullYear() + '.' + z(d.getMonth() + 1) + '.' + z(d.getDate()) + '"]\n' +
      '[Round "-"]\n[White "' + white + '"]\n[Black "' + black + '"]\n[Result "' + result + '"]\n';
    if (!this.fromStart) h += '[SetUp "1"]\n[FEN "' + this.positions[0].fen() + '"]\n';
    let s = '';
    this.moves.forEach((m, i) => {
      if (m.white) s += m.number + '. ';
      else if (i === 0) s += m.number + '... ';
      s += m.sanEn + ' ';
    });
    return h + '\n' + (s + result).replace(/(.{1,78})(\s|$)/g, '$1\n');
  }

  undo() {
    if (!this.moves.length) return false;
    this.moves.pop();
    this.positions.pop();
    return true;
  }

  /** Cuántas veces había salido antes cada posición (para las repeticiones). */
  repetitions() {
    const seen = new Map(), out = [];
    for (const p of this.positions) {
      const k = p.key(), n = seen.get(k) || 0;
      out.push(n);
      seen.set(k, n + 1);
    }
    return out;
  }

  /** null si la partida sigue; si no, por qué ha terminado. */
  end() {
    const p = this.pos;
    if (!p.legal().length) return p.inCheck() ? 'Jaque mate' : 'Rey ahogado';
    if (p.insufficient()) return 'Tablas por material insuficiente';
    if (p.half >= 100) return 'Tablas por la regla de las 50 jugadas';
    const reps = this.repetitions();
    if (reps[reps.length - 1] >= 2) return 'Tablas por triple repetición';
    return null;
  }

  /** "1. e4 e5 2. Cf3 ...", con "1... e5" si empieza el negro. */
  text() {
    let s = '';
    this.moves.forEach((m, i) => {
      if (m.white) s += m.number + '. ';
      else if (i === 0) s += m.number + '... ';
      s += m.san + ' ';
    });
    return s.trim();
  }
}

if (typeof module !== 'undefined') module.exports = { Pos, Partida, sqName, sqIndex, isWhite, START_FEN };
