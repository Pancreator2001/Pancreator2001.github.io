// Maia en el navegador: la red Maia (Lc0, pasada a ONNX con "lc0 leela2onnx") con ONNX Runtime Web.
// Hace lo mismo que "go nodes 1" de Lc0: la jugada sale directamente de la red (su "política"), sin buscar.
// Las entradas (112 planos de 8x8) y la tabla de 1858 jugadas son las de Lc0 (formato clásico).
'use strict';

const POLICY_TEMP = 1.359;          // PolicyTemperature de Lc0 por omisión (los % de VerboseMoveStats)

/** Las 1858 salidas de la red: todas las jugadas de dama y caballo desde cada casilla, y las coronaciones. */
const POLICY_MOVES = (() => {
  const out = [];
  for (let from = 0; from < 64; from++) {
    const fr = from >> 3, ff = from & 7;
    for (let to = 0; to < 64; to++) {
      if (to === from) continue;
      const dr = (to >> 3) - fr, df = (to & 7) - ff;
      const queen = dr === 0 || df === 0 || Math.abs(dr) === Math.abs(df);
      const knight = (Math.abs(dr) === 1 && Math.abs(df) === 2) || (Math.abs(dr) === 2 && Math.abs(df) === 1);
      if (queen || knight) out.push(sqName(from) + sqName(to));
    }
  }
  for (let f = 0; f < 8; f++)
    for (let df = -1; df <= 1; df++) {
      const t = f + df;
      if (t < 0 || t > 7) continue;
      for (const pr of ['q', 'r', 'b']) out.push(FILES[f] + '7' + FILES[t] + '8' + pr);
    }
  return out;
})();
const POLICY_INDEX = new Map(POLICY_MOVES.map((m, i) => [m, i]));

/** El índice de la red para una jugada, vista desde el bando que mueve (las negras, con el tablero al revés).
 *  La coronación a caballo va como la jugada sin letra; el enroque, como el rey que toma su torre (e1h1,
 *  e1a1: así lo dejó claro la comparación con Lc0). */
function nnIndex(m, white, board) {
  let f = m.from, t = m.to;
  if (board && board[f].toLowerCase() === 'k' && Math.abs(t - f) === 2) t = t > f ? f + 3 : f - 4;
  if (!white) { f ^= 56; t ^= 56; }
  let s = sqName(f) + sqName(t);
  if (m.promo && m.promo !== 'n') s += m.promo;
  return POLICY_INDEX.get(s);
}

/** Las 112 entradas de la red (Lc0 "INPUT_CLASSICAL_112_PLANE") para la última posición de la partida.
 *  fenOnly: la partida no empezó en la posición inicial (como "position fen ..." en Lc0): el historial que
 *  falta se rellena con la primera posición (HistoryFill = fen_only). */
function encode(positions, reps) {
  const planes = new Float32Array(112 * 64);
  const cur = positions[positions.length - 1], us = cur.white;
  for (let i = 0; i < 8; i++) {
    let idx = positions.length - 1 - i, p, rep = 0;
    if (idx >= 0) { p = positions[idx]; rep = reps[idx]; }
    else {
      p = positions[0];
      if (p.isStart()) break;                         // desde la posición inicial no se rellena
      if (p.ep >= 0) {                                // al rellenar, se deshace el avance doble del peón
        p = p.clone();
        const dir = p.white ? 1 : -1;                 // el peón que avanzó es del otro bando
        const now = p.ep - 8 * dir, before = p.ep + 8 * dir;
        p.b[before] = p.b[now];
        p.b[now] = '.';
      }
    }
    const base = i * 13;
    for (let s = 0; s < 64; s++) {
      const c = p.b[s];
      if (c === '.') continue;
      const ours = isWhite(c) === us;
      const type = 'pnbrqk'.indexOf(c.toLowerCase());
      const sq = us ? s : s ^ 56;
      planes[(base + (ours ? 0 : 6) + type) * 64 + sq] = 1;
    }
    if (rep >= 1) planes.fill(1, (base + 12) * 64, (base + 13) * 64);
  }
  const fillPlane = (n, v) => planes.fill(v, n * 64, (n + 1) * 64);
  const c = cur.castle;
  if (us ? c.Q : c.q) fillPlane(104, 1);
  if (us ? c.K : c.k) fillPlane(105, 1);
  if (us ? c.q : c.Q) fillPlane(106, 1);
  if (us ? c.k : c.K) fillPlane(107, 1);
  if (!us) fillPlane(108, 1);
  fillPlane(109, cur.half);
  fillPlane(111, 1);
  return planes;
}

class Maia {
  constructor(base = 'redes/') {
    this.base = base;
    this.sessions = new Map();
    this.level = 1100;
  }

  async session(level) {
    if (!this.sessions.has(level)) {
      const p = ort.InferenceSession.create(this.base + 'maia-' + level + '.onnx', { executionProviders: ['wasm'] });
      this.sessions.set(level, p);
      p.catch(() => this.sessions.delete(level));
    }
    return this.sessions.get(level);
  }

  /** Los % de cada jugada legal (como VerboseMoveStats de Lc0), de más a menos: [{m, uci, p}]. */
  async shares(partida, level = this.level) {
    const s = await this.session(level);
    const positions = partida.fromStart ? partida.positions : partida.positions.slice(-1);
    const reps = partida.fromStart ? partida.repetitions() : [0];
    const input = new ort.Tensor('float32', encode(positions, reps), [1, 112, 8, 8]);
    const t0 = performance.now();
    const out = await s.run({ '/input/planes': input });
    this.lastMs = performance.now() - t0;
    const logits = out['/output/policy'].data;
    const pos = partida.pos, legal = pos.legal();
    const vals = legal.map(m => logits[nnIndex(m, pos.white, pos.b)] / POLICY_TEMP);
    const max = Math.max(...vals);
    const ex = vals.map(v => Math.exp(v - max));
    const sum = ex.reduce((a, b) => a + b, 0);
    return legal.map((m, i) => ({ m, uci: m.uci, p: 100 * ex[i] / sum })).sort((a, b) => b.p - a.p);
  }

  /** La jugada de Maia: la más típica, o con "variedad" una de las que juega la gente de su nivel, tan a
   *  menudo como la juegan (las de al menos el 2 % y la décima parte de la favorita), como en las apps. */
  async move(partida, variety, level = this.level) {
    const sh = await this.shares(partida, level);
    if (!sh.length) return null;
    if (!variety) return sh[0];
    const top = sh[0].p, pool = sh.filter(x => x.p >= Math.max(2, top * 0.1));
    let r = Math.random() * pool.reduce((a, x) => a + x.p, 0);
    for (const x of pool) { r -= x.p; if (r <= 0) return x; }
    return pool[pool.length - 1];
  }
}

/** Compara con los % de Lc0 (pruebas/referencia-lc0.json): devuelve un informe por posición. */
async function compareWithLc0(maia, ref) {
  const report = [];
  for (const r of ref) {
    const words = r.pos.split(/\s+/);
    let partida;
    if (words[0] === 'startpos') partida = new Partida();
    else partida = new Partida(Pos.fromFen(words.slice(1, 7).join(' ')));
    const mi = words.indexOf('moves');
    if (mi >= 0) for (const u of words.slice(mi + 1)) {
      const m = partida.pos.legal().find(x => x.uci === u);
      if (!m) { report.push({ pos: r.pos, error: 'jugada ilegal ' + u }); partida = null; break; }
      partida.play(m);
    }
    if (!partida) continue;
    const sh = await maia.shares(partida, 1100);
    // Lc0 escribe el enroque como rey toma torre (e1h1): al rey dos casillas
    const lc0 = {};
    for (const [u, p] of Object.entries(r.p)) {
      let k = u;
      const from = sqIndex(u.slice(0, 2)), to = sqIndex(u.slice(2, 4)), pc = partida.pos.b[from];
      if (pc.toLowerCase() === 'k' && (from >> 3) === (to >> 3) && Math.abs(to - from) >= 2) k = u.slice(0, 2) + sqName(to > from ? from + 2 : from - 2);
      lc0[k] = p;
    }
    let maxDiff = 0, worst = '';
    for (const x of sh) {
      const d = Math.abs((lc0[x.uci] ?? -100) - x.p);
      if (d > maxDiff) { maxDiff = d; worst = x.uci + ' web ' + x.p.toFixed(2) + ' / lc0 ' + lc0[x.uci]; }
    }
    report.push({ pos: r.pos, n: sh.length, nLc0: Object.keys(lc0).length, best: sh[0].uci, bestLc0: r.best, maxDiff: +maxDiff.toFixed(2), worst, ms: +maia.lastMs.toFixed(1) });
  }
  return report;
}
