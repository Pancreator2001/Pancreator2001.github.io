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
    return this.shapeReason(after);
  }

  /** 26/11, como en Windows y Android: una pieza que salta por encima de otras (solo salta el caballo) o que no mueve
   *  así, y un peón en diagonal a una casilla vacía (la captura al paso fuera de tiempo): por qué; null si no es eso. */
  shapeReason(after) {
    const w = this.white, own = p => p !== '.' && isWhite(p) === w;
    const vac = [], fil = [];
    for (let s = 0; s < 64; s++) {
      if (this.b[s] === after[s]) continue;
      if (this.b[s] !== '.' && after[s] === '.') vac.push(s);
      else if (after[s] !== '.') fil.push(s);
    }
    if (fil.length !== 1 || (vac.length !== 1 && vac.length !== 2)) return null;
    const to = fil[0], from = vac.find(s => own(this.b[s]) && this.b[s] === after[to] ||
                                            own(this.b[s]) && this.b[s].toLowerCase() === 'p' && ((to >> 3) === 7 || (to >> 3) === 0));
    if (from === undefined) return null;
    const p = this.b[from], up = p.toUpperCase();
    const dr = (to >> 3) - (from >> 3), dc = (to & 7) - (from & 7), ar = Math.abs(dr), ac = Math.abs(dc);
    const sq = s => sqName(s), who = Restore.the(p), Who = who.charAt(0).toUpperCase() + who.slice(1);
    if (up === 'P') {
      if (ac !== 1 || dr !== (w ? 1 : -1) || this.b[to] !== '.' || to === this.ep) return null;
      const beside = (from & ~7) | (to & 7);
      return this.b[beside] === (w ? 'p' : 'P')
        ? 'La captura al paso solo vale justo después de que ese peón avance dos casillas y quede al lado del tuyo.'
        : 'Un peón solo va en diagonal para comer.';
    }
    if (vac.length !== 1) return null;
    if (up === 'N') return (ar === 1 && ac === 2) || (ar === 2 && ac === 1) ? null : Who + ' mueve en L (dos casillas hacia un lado y una más en ángulo), no de ' + sq(from) + ' a ' + sq(to) + '.';
    if (up === 'K') return ar <= 1 && ac <= 1 ? null : Who + ' solo mueve una casilla (salvo al enrocar), no de ' + sq(from) + ' a ' + sq(to) + '.';
    if (up === 'B' && ar !== ac) return Who + ' solo mueve en diagonal, no de ' + sq(from) + ' a ' + sq(to) + '.';
    if (up === 'R' && dr !== 0 && dc !== 0) return Who + ' solo mueve en línea recta (por su fila o su columna), no de ' + sq(from) + ' a ' + sq(to) + '.';
    if (up === 'Q' && dr !== 0 && dc !== 0 && ar !== ac) return Who + ' solo mueve en línea recta o en diagonal, no de ' + sq(from) + ' a ' + sq(to) + '.';
    const step = Math.sign(dr) * 8 + Math.sign(dc);
    for (let s = from + step; s !== to; s += step)
      if (this.b[s] !== '.') return Who + ' no puede saltar por encima de otras piezas (solo salta el caballo): entre ' + sq(from) + ' y ' + sq(to) + ' está ' + Restore.the(this.b[s]) + ' de ' + sq(s) + '.';
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

/**
 * «Atrás» (pedido por el usuario el 24/11): los pasos para dejar el tablero como estaba, uno a uno - «Lleva el
 * caballo negro de d5 a f6 y pon un peón negro en d5» -, la última jugada primero. Salen del tablero tal como está y
 * de la posición buscada, así que valen hagas lo que hagas y en el orden que sea. (Como Restore.java de Android;
 * aquí a1 = 0.)
 */
const Restore = (() => {
  const LATE = 1000, SHOWN = 6;
  const NAME = { K: 'rey', Q: 'dama', R: 'torre', B: 'alfil', N: 'caballo', P: 'peón' };
  const fem = p => 'QR'.includes(p.toUpperCase());
  const colour = p => isWhite(p) ? (fem(p) ? 'blanca' : 'blanco') : (fem(p) ? 'negra' : 'negro');
  const the = p => (fem(p) ? 'la ' : 'el ') + NAME[p.toUpperCase()] + ' ' + colour(p);
  const a = p => (fem(p) ? 'una ' : 'un ') + NAME[p.toUpperCase()] + ' ' + colour(p);
  const distance = (x, y) => { const dr = Math.abs((x >> 3) - (y >> 3)), df = Math.abs((x & 7) - (y & 7)); return Math.max(dr, df) * 16 + dr + df; };

  function squares(st) {
    const s = [];
    if (st.from >= 0) s.push(st.from);
    if (st.to >= 0) s.push(st.to);
    if (st.put >= 0 && st.put !== st.from) s.push(st.put);
    return s;
  }
  /** Hecho en este tablero: la pieza está donde va y se ha ido de donde estaba. */
  function done(st, b, t) {
    if (st.to >= 0 && b[st.to] !== t[st.to]) return false;
    if (st.put >= 0 && b[st.put] !== t[st.put]) return false;
    if (st.from >= 0 && st.put < 0 && b[st.from] !== '.' && b[st.from] !== t[st.from]) return false;
    return true;
  }
  /** Las casillas que cambió cada jugada que se deshace: las de la última 0, las de la anterior 1... */
  function order(partida, keep) {
    const o = new Array(64).fill(LATE);
    for (let i = partida.moves.length - 1, k = 0; i >= keep && i >= 0; i--, k++) {
      const b = partida.positions[i].b, af = partida.positions[i + 1].b;
      for (let s = 0; s < 64; s++) if (b[s] !== af[s] && o[s] === LATE) o[s] = k;
    }
    return o;
  }
  function text(st) {
    const parts = [];
    if (st.aside !== '.') parts.push('aparta ' + the(st.aside) + ' de ' + sqName(st.to) + ' (' + (fem(st.aside) ? 'tenla' : 'tenlo') + ' a mano)');
    let putDone = false;
    if (st.from >= 0 && st.to >= 0 && st.piece === st.toPiece) parts.push('lleva ' + the(st.piece) + ' de ' + sqName(st.from) + ' a ' + sqName(st.to));
    else if (st.from >= 0 && st.to >= 0) { parts.push('quita ' + the(st.piece) + ' de ' + sqName(st.from)); parts.push('pon ' + a(st.toPiece) + ' en ' + sqName(st.to)); }
    else if (st.from >= 0 && st.put >= 0) { parts.push('cambia ' + the(st.piece) + ' de ' + sqName(st.from) + ' por ' + a(st.putPiece)); putDone = true; }
    else if (st.from >= 0) parts.push('quita ' + the(st.piece) + ' de ' + sqName(st.from));
    else parts.push('pon ' + a(st.toPiece) + ' en ' + sqName(st.to));
    if (st.put >= 0 && !putDone) parts.push('pon ' + a(st.putPiece) + ' en ' + sqName(st.put));
    let t = '';
    parts.forEach((x, i) => { t += (i === 0 ? '' : i === parts.length - 1 ? ' y ' : ', ') + x; });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  /** Los pasos de board a target, en un orden que se puede seguir (la casilla de cada uno libre cuando toca). */
  function steps(board, target, ord) {
    const extra = [], need = [];
    for (let s = 0; s < 64; s++) {
      if (board[s] === target[s]) continue;
      if (board[s] !== '.') extra.push(s);          // una pieza que tiene que irse
      if (target[s] !== '.') need.push(s);          // una pieza que tiene que venir
    }
    const mk = o => Object.assign({ from: -1, to: -1, piece: '.', toPiece: '.', put: -1, putPiece: '.', aside: '.', order: LATE, text: '' }, o);
    const list = [];
    // la misma pieza de donde está a donde estaba, la pareja más cercana primero
    for (;;) {
      let bi = -1, bj = -1, best = Infinity;
      extra.forEach((x, i) => need.forEach((y, j) => {
        if (board[x] !== target[y]) return;
        const d = distance(x, y);
        if (d < best) { best = d; bi = i; bj = j; }
      }));
      if (bi < 0) break;
      const from = extra.splice(bi, 1)[0], to = need.splice(bj, 1)[0];
      list.push(mk({ from, to, piece: board[from], toPiece: board[from] }));
    }
    // una coronación deshecha: la pieza nueva fuera de la última fila, el peón otra vez en la casilla de antes
    for (let i = 0; i < extra.length; i++) {
      const x = extra[i], p = board[x];
      if ('PpKk'.includes(p)) continue;
      const w = isWhite(p);
      if ((x >> 3) !== (w ? 7 : 0)) continue;
      const j = need.findIndex(y => target[y] === (w ? 'P' : 'p') && (y >> 3) === (w ? 6 : 1) && Math.abs((y & 7) - (x & 7)) <= 1);
      if (j < 0) continue;
      list.push(mk({ from: x, to: need[j], piece: p, toPiece: target[need[j]] }));
      extra.splice(i--, 1);
      need.splice(j, 1);
    }
    extra.forEach(x => list.push(mk({ from: x, piece: board[x] })));            // piezas fuera
    need.forEach(y => {                                                       // piezas que vuelven: donde se va una, en el mismo paso
      const host = list.find(st => st.from === y && st.put < 0);
      if (host) { host.put = y; host.putPiece = target[y]; } else list.push(mk({ to: y, toPiece: target[y] }));
    });
    list.forEach((st, i) => { st.i = i; squares(st).forEach(s => { st.order = Math.min(st.order, ord ? ord[s] : LATE); }); });
    list.sort((x, y) => x.order - y.order || x.i - y.i);
    // en ese orden, cada paso cuando su casilla está libre
    const out = [], left = list.slice(), sim = board.slice();
    while (left.length) {
      let pick = left.find(st => st.to < 0 || sim[st.to] === '.');
      if (!pick) {                                 // piezas que se cambian el sitio: primero se aparta la que estorba
        pick = left[0];
        pick.aside = sim[pick.to];
        left.forEach(st => { if (st !== pick && st.from === pick.to) { st.from = -1; st.piece = '.'; } });
      }
      if (pick.from >= 0) sim[pick.from] = '.';
      if (pick.to >= 0) sim[pick.to] = pick.toPiece;
      if (pick.put >= 0) sim[pick.put] = pick.putPiece;
      out.push(pick);
      left.splice(left.indexOf(pick), 1);
    }
    out.forEach(st => { st.text = text(st); });
    return out;
  }
  /** El plan sigue valiendo: cada casilla distinta es de un paso aún sin hacer. */
  function fits(plan, b, t) {
    const covered = new Array(64).fill(false);
    plan.forEach(st => { if (!done(st, b, t)) squares(st).forEach(s => { covered[s] = true; }); });
    for (let s = 0; s < 64; s++) if (b[s] !== t[s] && !covered[s]) return false;
    return true;
  }
  /** Los pasos en líneas («✓ 1.» hecho, «→ 2.» el que toca) y la flecha del que toca ([de, a] o null). */
  function describe(plan, b, t) {
    const n = plan.length, dn = plan.map(st => done(st, b, t)), cur = dn.indexOf(false);
    const arrow = cur >= 0 && plan[cur].from >= 0 && plan[cur].to >= 0 ? [plan[cur].from, plan[cur].to] : null;
    const start = n <= SHOWN + 1 ? 0 : Math.max(0, Math.min(cur - 1, n - SHOWN));
    const end = n <= SHOWN + 1 ? n : Math.min(n, start + SHOWN);
    const lines = [];
    if (start > 0) lines.push(start === 1 ? '✓ paso 1 hecho' : '✓ pasos 1–' + start + ' hechos');
    for (let i = start; i < end; i++) lines.push((dn[i] ? '✓ ' : i === cur ? '→ ' : '    ') + (i + 1) + '. ' + plan[i].text);
    if (end < n) lines.push('    … y ' + (n - end) + (n - end === 1 ? ' paso más' : ' pasos más'));
    return { text: lines.join('\n'), arrow };
  }
  return { order, steps, fits, describe, done, the };
})();

if (typeof module !== 'undefined') module.exports = { Pos, Partida, sqName, sqIndex, isWhite, START_FEN, Restore };
