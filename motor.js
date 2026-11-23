// Stockfish en el navegador (stockfish.js 18 "lite single" de Nathan Rugg, GPL-3.0, en un Worker) como Engine.java:
// cada posición nueva para la búsqueda en marcha, espera su "bestmove" y empieza la nueva; las líneas que llegan entre
// un "stop" y su "bestmove" son de la posición vieja y no cuentan. Y la revisión de la partida (Review.java): la nota
// de cada jugada sale de la evaluación de la posición de antes y la de después.
'use strict';

class Motor {
  constructor(path, onView, log) {
    this.path = path;
    this.onView = onView;          // (view) en cada línea nueva de la posición actual
    this.onIdle = null;            // () cuando no queda nada que buscar
    this.onEval = null;            // (fen, eval) la mejor evaluación de una posición, para las notas
    this.log = log || (() => {});
    this.searching = false; this.stopSent = false;
    this.pending = null; this.current = null; this.multiPvSent = 0;
    this.name = 'Stockfish';
  }

  start() {
    if (this.worker) return;
    try {
      this.worker = new Worker(this.path);
      this.worker.onmessage = e => this.line(String(e.data));
      this.worker.onerror = e => { this.log('Stockfish: error ' + (e.message || '')); this.failed = true; };
      this.send('uci');
      this.send('isready');
    } catch (e) { this.failed = true; this.log('Stockfish no arranca: ' + e.message); }
  }

  send(s) { if (this.worker) this.worker.postMessage(s); }

  /** Busca en esta posición (FEN completo). job: {fen, white, multipv, depth, movetime, review} */
  request(job) {
    const same = j => j && j.fen === job.fen && j.multipv === job.multipv && !!j.review === !!job.review;
    if ((this.searching && same(this.current) && !this.stopSent) || same(this.pending)) return;
    this.pending = job;
    if (!this.worker) this.start();
    if (this.searching) { if (!this.stopSent) { this.send('stop'); this.stopSent = true; } }
    else this.startPending();
  }

  /** Deja de pensar. */
  halt() { this.pending = null; if (this.searching && !this.stopSent) { this.send('stop'); this.stopSent = true; } }

  startPending() {
    const j = this.pending;
    if (!j) { if (this.onIdle) this.onIdle(); return; }
    this.pending = null;
    this.current = j;
    if (j.multipv !== this.multiPvSent) { this.send('setoption name MultiPV value ' + j.multipv); this.multiPvSent = j.multipv; }
    this.view = { fen: j.fen, white: j.white, depth: 0, lines: [], thinking: true, review: !!j.review };
    this.send('position fen ' + j.fen);
    this.send('go depth ' + j.depth + ' movetime ' + j.movetime);
    this.searching = true;
    this.stopSent = false;
    if (!j.review && this.onView) this.onView(this.view);
  }

  line(s) {
    if (s.startsWith('id name')) {
      const full = s.slice(8).trim();
      this.name = full.replace(/ by .*$/, '').replace(/\s+(Lite|WASM|NNUE)\b.*$/i, '');
      this.log('Motor: ' + full);
      return;
    }
    if (s.startsWith('bestmove')) {
      const wasStopped = this.stopSent;
      this.searching = false;
      this.stopSent = false;
      if (this.view && !wasStopped) { this.view.thinking = false; if (!this.view.review && this.onView) this.onView(this.view); }
      this.startPending();
      return;
    }
    if (!s.startsWith('info') || !s.includes(' pv ') || this.stopSent || !this.searching) return;
    if (s.includes(' lowerbound') || s.includes(' upperbound')) return;
    const t = s.split(' ');
    let depth = 0, mpv = 1, score = 0, mate = false, pvAt = -1;
    for (let i = 1; i < t.length; i++) {
      const w = t[i];
      if (w === 'depth') depth = +t[++i];
      else if (w === 'multipv') mpv = +t[++i];
      else if (w === 'score') { mate = t[++i] === 'mate'; score = +t[++i]; }
      else if (w === 'pv') { pvAt = i + 1; break; }
    }
    if (pvAt < 0 || !this.view) return;
    const v = this.view;
    const white = v.white ? score : -score;            // la puntuación de las blancas
    v.lines[mpv - 1] = { depth, mate, score: white, pv: t.slice(pvAt) };
    if (mpv === 1) {
      v.depth = depth;
      if (this.onEval) this.onEval(v.fen, { depth, cp: mate ? (score > 0 ? 1 : -1) * (100000 - Math.min(1000, Math.abs(score))) : score, best: t[pvAt] });
    }
    if (!v.review && this.onView) this.onView(v);
  }

  /** Para la barra: la parte de las blancas (0..1). */
  static whiteShare(l) {
    if (!l) return 0.5;
    if (l.mate) return l.score > 0 ? 1 : l.score < 0 ? 0 : 0.5;
    return 1 / (1 + Math.exp(-0.00368208 * l.score));
  }

  /** "+0,4", "-1,2", "M3", "-M2"; largo: "+0,35". */
  static scoreText(l, long) {
    if (!l) return '';
    if (l.mate) return (l.score < 0 ? '-M' : 'M') + Math.abs(l.score);
    const v = l.score / 100, s = Math.abs(v).toFixed(long ? 2 : 1).replace('.', ',');
    if (s === '0,0' || s === '0,00') return s;
    return (v > 0 ? '+' : '-') + s;
  }
}

/** Las notas de las jugadas de la partida (Review.java): Mejor, Excelente, Buena, Imprecisión, Error, Error grave. */
class Revision {
  constructor() { this.evals = new Map(); this.version = 0; this.skipped = new Set(); }
  static get MIN_DEPTH() { return 10; }
  static get REVIEW_DEPTH() { return 12; }

  /** La evaluación más honda de una posición (desde el bando que mueve). */
  record(fen, e) {
    const old = this.evals.get(fen);
    if (old && old.depth > e.depth) return;
    if (this.evals.size > 3000) this.evals.clear();
    this.evals.set(fen, e);
    this.version++;
  }

  /** Las posiciones sin jugadas (mate o ahogado) no necesitan a Stockfish. */
  terminal(pos) {
    const fen = pos.fen();
    if (this.evals.has(fen) && this.evals.get(fen).depth === 99) return;
    if (pos.legal().length) return;
    this.record(fen, { depth: 99, cp: pos.inCheck() ? -100000 : 0, best: '' });
  }

  static wp(cp) { return 1 / (1 + Math.exp(-0.00368208 * cp)); }

  static classify(before, after) {
    const loss = Revision.wp(before) - Revision.wp(after);
    const c = loss <= 0.02 ? 0 : loss <= 0.05 ? 1 : loss <= 0.10 ? 2 : loss <= 0.20 ? 3 : 4;
    const clamp = x => Math.max(-1500, Math.min(1500, x));
    const p = clamp(before) - clamp(after);
    const q = p >= 300 ? 4 : p >= 200 ? 3 : p >= 100 ? 2 : p >= 50 ? 1 : 0;
    return ['Excelente', 'Buena', 'Imprecision', 'Error', 'Error grave'][Math.max(c, q)];
  }

  /** La nota de la jugada i de la partida: {label, better} (label '' mientras no se sepa). */
  grade(partida, i) {
    const pb = partida.positions[i], pa = partida.positions[i + 1], m = partida.moves[i];
    this.terminal(pa);
    const before = this.evals.get(pb.fen()), after = this.evals.get(pa.fen());
    if (after && after.depth === 99 && after.cp === -100000) return { label: 'Mejor', better: '' };
    if (!before || !after || before.depth < Revision.MIN_DEPTH || after.depth < Revision.MIN_DEPTH) return { label: '', better: '' };
    const label = m.uci === before.best ? 'Mejor' : Revision.classify(before.cp, -after.cp);
    let better = '';
    if ((label === 'Imprecision' || label === 'Error' || label === 'Error grave') && before.best.length >= 4) {
      const bm = pb.legal().find(x => x.uci === before.best);
      better = bm ? pb.san(bm) : before.best;
    }
    return { label, better };
  }

  /** Una posición de la partida aún sin evaluar lo bastante para su nota (la más reciente primero), o null. */
  needEval(partida) {
    const n = partida.moves.length;
    for (let i = n - 1; i >= Math.max(0, n - 80); i--) {
      const pa = partida.positions[i + 1], pb = partida.positions[i];
      this.terminal(pa);
      const fa = pa.fen(), a = this.evals.get(fa);
      if ((!a || a.depth < Revision.REVIEW_DEPTH) && !this.skipped.has(fa)) return pa;
      if (a && a.depth === 99) continue;
      const fb = pb.fen(), b = this.evals.get(fb);
      if ((!b || b.depth < Revision.REVIEW_DEPTH) && !this.skipped.has(fb)) return pb;
    }
    return null;
  }
}
