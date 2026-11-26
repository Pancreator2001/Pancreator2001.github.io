// Lo que se dibuja como en la app de Android (BoardView, Pieces, EvalBar, ClockView, BatteryIcon): el tablero con
// marco de madera, coordenadas, la última jugada con el color de su nota, las casillas encendidas con los puntos rojos
// de los LEDs, la flecha verde de la jugada de Maia y las azules de las candidatas; las piezas Staunton (Colin M. L.
// Burnett, las de Lichess); la barra de evaluación; el reloj de LCD.
'use strict';

// ---- las piezas Staunton (cuadrícula de 45 x 45), como Pieces.java
const PIECE_W = '#fff', PIECE_B = '#000';
function circ(cx, cy, r) { return 'M' + (cx + r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0z'; }
const PIECE_PARTS = (() => {
  const p = (d, fill, stroke, butt = false, miter = false, width = 1.5) => ({ path: new Path2D(d), fill, stroke, butt, miter, width });
  const W = PIECE_W, B = PIECE_B, N = null;
  const kingTop = 'M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5';
  const kingBody = 'M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z';
  const kingBands = 'M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0';
  const queenBase = 'M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z';
  const bishop = 'M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2zM15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z';
  const bishopLines = 'M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5';
  const knightBack = 'M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21';
  const knightHead = 'M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3';
  const knightEyes = 'M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z';
  const pawn = 'M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z';
  return {
    K: [p('M22.5 11.63V6M20 8h5', N, B, false, true), p(kingTop, W, B, true, true), p(kingBody, W, B), p(kingBands, N, B)],
    k: [p('M22.5 11.63V6', N, B, false, true), p(kingTop, B, B, true, true), p(kingBody, B, B), p('M20 8h5', N, B, false, true),
        p('M32 29.5s8.5-4 6.03-9.65C34.15 14 25 18 22.5 24.5l.01 2.1-.01-2.1C20 18 9.906 14 6.997 19.85c-2.497 5.65 4.853 9 4.853 9' + kingBands, N, W)],
    Q: [p(circ(6, 12, 2) + circ(14, 9, 2) + circ(22.5, 8, 2) + circ(31, 9, 2) + circ(39, 12, 2), W, B),
        p('M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z' + queenBase, W, B, true),
        p('M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0', N, B)],
    q: [p(circ(6, 12, 2.75) + circ(14, 9, 2.75) + circ(22.5, 8, 2.75) + circ(31, 9, 2.75) + circ(39, 12, 2.75), B, N),
        p('M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z' + queenBase, B, B, true),
        p('M11 38.5a35 35 1 0 0 23 0', N, B, true),
        p('M11 29a35 35 1 0 1 23 0M12.5 31.5h20M11.5 34.5a35 35 1 0 0 22 0M10.5 37.5a35 35 1 0 0 24 0', N, W)],
    R: [p('M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5', W, B, true), p('M34 14l-3 3H14l-3-3', W, B),
        p('M31 17v12.5H14V17', W, B, true, true), p('M31 29.5l1.5 2.5h-20l1.5-2.5', W, B), p('M11 14h23', N, B, false, true)],
    r: [p('M9 39h27v-3H9v3zM12.5 32l1.5-2.5h17l1.5 2.5h-20zM12 36v-4h21v4H12z', B, B, true), p('M14 29.5v-13h17v13H14z', B, B, true, true),
        p('M14 16.5L11 14h23l-3 2.5H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z', B, B, true),
        p('M12 35.5h21M13 31.5h19M14 29.5h17M14 16.5h17M11 14h23', N, W, false, true, 1)],
    B: [p(bishop, W, B, true), p(bishopLines, N, B, false, true)],
    b: [p(bishop, B, B, true), p(bishopLines, N, W, false, true)],
    N: [p(knightBack, W, B), p(knightHead, W, B), p(knightEyes, B, B)],
    n: [p(knightBack, B, B), p(knightHead, B, B), p(knightEyes, W, W),
        p('M24.55 10.4l-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34-2.37-4.49-5.79-6.64-9.19-7.16l-.51-.1z', W, N)],
    P: [p(pawn, W, B)],
    p: [p(pawn, B, B)],
  };
})();

const pieceCache = new Map();
/** La pieza dibujada en un cuadrado de size píxeles (con sombra suave y un poco de relieve, como en Android). */
function pieceImage(piece, size) {
  const key = piece + size;
  if (pieceCache.has(key)) return pieceCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const parts = PIECE_PARTS[piece];
  if (parts) {
    g.scale(size / 45, size / 45);
    g.save();
    g.translate(0.8, 1.1);
    g.fillStyle = 'rgba(0,0,0,0.235)';
    for (const x of parts) if (x.fill) g.fill(x.path, 'evenodd');
    g.restore();
    for (const x of parts) {
      if (x.fill) {
        const gr = g.createLinearGradient(0, 6, 0, 40);
        if (x.fill === PIECE_W) { gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(1, '#ECE6DA'); }
        else { gr.addColorStop(0, '#464442'); gr.addColorStop(1, '#121212'); }
        g.fillStyle = gr;
        g.fill(x.path, 'evenodd');
      }
      if (x.stroke) {
        g.strokeStyle = x.stroke;
        g.lineWidth = x.width;
        g.lineCap = x.butt ? 'butt' : 'round';
        g.lineJoin = x.miter ? 'miter' : 'round';
        g.stroke(x.path);
      }
    }
  }
  if (pieceCache.size > 60) pieceCache.clear();
  pieceCache.set(key, c);
  return c;
}

// ---- las notas de las jugadas (Review.java)
const GRADE = {
  'Mejor': { color: '#81B64C', sym: '★' }, 'Excelente': { color: '#96BC4B', sym: '!' }, 'Buena': { color: '#779159', sym: '✓' },
  'Imprecision': { color: '#E6B414', sym: '?!' }, 'Error': { color: '#FF8C32', sym: '?' }, 'Error grave': { color: '#E63223', sym: '??' },
};
const gradeText = l => l === 'Imprecision' ? 'Imprecisión' : l;
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }

/** Prepara un lienzo a su tamaño en pantalla (nítido en pantallas de alta densidad); devuelve el contexto. */
function fitCanvas(cv) {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return cv.getContext('2d');
}

/** El tablero (BoardView.java). o: {board (64, a1 = 0), flipped, lit, move [de, a], cands [[de, a]...], last {from, to, label}, sel,
 *  targets (64: adónde puede ir la pieza tocada), drag {from, x, y (px CSS), touch}, overlay} */
function drawBoard(cv, o) {
  const g = fitCanvas(cv), side = Math.min(cv.width, cv.height);
  const frame = Math.round(side * 0.045), sq = (side - 2 * frame) / 8;
  const xy = s => o.flipped ? [7 - (s & 7), s >> 3] : [s & 7, 7 - (s >> 3)];
  g.clearRect(0, 0, cv.width, cv.height);
  // marco de madera
  const fr = g.createLinearGradient(0, 0, side, side);
  fr.addColorStop(0, '#6E4527'); fr.addColorStop(1, '#3F2614');
  g.fillStyle = fr;
  g.beginPath(); g.roundRect(0, 0, side, side, frame * 0.5); g.fill();
  // coordenadas
  g.fillStyle = '#EBD7B4';
  g.font = 'bold ' + (frame * 0.62) + 'px -apple-system, system-ui, sans-serif';
  g.textAlign = 'center';
  for (let i = 0; i < 8; i++) {
    const file = String.fromCharCode(o.flipped ? 104 - i : 97 + i), rank = String(o.flipped ? i + 1 : 8 - i);
    g.fillText(file, frame + sq * i + sq / 2, side - frame * 0.28);
    g.fillText(rank, frame / 2, frame + sq * i + sq / 2 + frame * 0.22);
  }
  // casillas, última jugada, casillas encendidas
  const lw = Math.max(2, sq * 0.035);
  for (let s = 0; s < 64; s++) {
    const [c, r] = xy(s), x = frame + c * sq, y = frame + r * sq;
    const light = ((s >> 3) + (s & 7)) % 2 === 1;
    g.fillStyle = light ? '#F0D9B5' : '#B58863';
    g.fillRect(x, y, sq + 0.5, sq + 0.5);
    if (o.last && (s === o.last.from || s === o.last.to)) {
      const gr = GRADE[o.last.label];
      g.fillStyle = gr ? hexA(gr.color, s === o.last.to ? 0.59 : 0.45) : 'rgba(255,225,77,0.55)';
      g.fillRect(x, y, sq, sq);
      g.strokeStyle = gr ? hexA(gr.color, 0.82) : 'rgba(217,163,0,0.82)';
      g.lineWidth = lw;
      g.strokeRect(x + lw / 2, y + lw / 2, sq - lw, sq - lw);
    }
    if (o.lit && o.lit[s]) { g.fillStyle = light ? 'rgba(245,208,0,0.59)' : 'rgba(224,184,0,0.62)'; g.fillRect(x, y, sq, sq); }
    if (o.sel === s) { g.strokeStyle = '#1E88E5'; g.lineWidth = Math.max(3, sq * 0.06); g.strokeRect(x + g.lineWidth / 2, y + g.lineWidth / 2, sq - g.lineWidth, sq - g.lineWidth); }
  }
  // los LEDs: puntos rojos en las esquinas de las casillas encendidas
  if (o.lit) {
    g.fillStyle = '#E0301E';
    const led = Math.max(2.5, sq * 0.06);
    for (let s = 0; s < 64; s++) {
      if (!o.lit[s]) continue;
      const [c, r] = xy(s), x = frame + c * sq, y = frame + r * sq;
      for (const [dx, dy] of [[0, 0], [sq, 0], [0, sq], [sq, sq]]) { g.beginPath(); g.arc(x + dx, y + dy, led, 0, 2 * Math.PI); g.fill(); }
    }
  }
  // piezas (la que se arrastra, no en su casilla: bajo el dedo)
  const dragFrom = o.drag ? o.drag.from : -1;
  if (o.board) {
    const size = Math.round(sq);
    for (let s = 0; s < 64; s++) {
      const p = o.board[s];
      if (p === '.' || s === dragFrom) continue;
      const [c, r] = xy(s);
      g.drawImage(pieceImage(p, size), frame + c * sq + (sq - size) / 2, frame + r * sq + (sq - size) / 2);
    }
  }
  // (26/11) adónde puede ir la pieza tocada: puntos, y aros donde hay algo que comer
  if (o.targets) {
    for (let s = 0; s < 64; s++) {
      if (!o.targets[s]) continue;
      const [c, r] = xy(s), cx = frame + c * sq + sq / 2, cy = frame + r * sq + sq / 2;
      g.beginPath();
      if (o.board && o.board[s] !== '.') {
        g.strokeStyle = 'rgba(30,58,138,0.6)'; g.lineWidth = Math.max(3, sq * 0.08);
        g.arc(cx, cy, sq * 0.44, 0, 2 * Math.PI); g.stroke();
      } else {
        g.fillStyle = 'rgba(30,58,138,0.48)';
        g.arc(cx, cy, sq * 0.15, 0, 2 * Math.PI); g.fill();
      }
    }
  }
  // flechas: candidatas (azules, la primera más fuerte) y la jugada de Maia (verde)
  const arrow = (from, to, color, k) => {
    const [ac, ar] = xy(from), [bc, br] = xy(to);
    const x1 = frame + ac * sq + sq / 2, y1 = frame + ar * sq + sq / 2, x2 = frame + bc * sq + sq / 2, y2 = frame + br * sq + sq / 2;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, shaft = sq * k, head = sq * 0.32, headW = sq * (k + 0.15);
    const bx = x2 - ux * head, by = y2 - uy * head;
    g.beginPath();
    g.moveTo(x1 + nx * shaft, y1 + ny * shaft); g.lineTo(bx + nx * shaft, by + ny * shaft); g.lineTo(bx + nx * headW, by + ny * headW);
    g.lineTo(x2, y2); g.lineTo(bx - nx * headW, by - ny * headW); g.lineTo(bx - nx * shaft, by - ny * shaft); g.lineTo(x1 - nx * shaft, y1 - ny * shaft);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  };
  if (o.cands) for (let i = o.cands.length - 1; i >= 0; i--) if (o.cands[i]) arrow(o.cands[i][0], o.cands[i][1], i === 0 ? 'rgba(31,99,200,0.63)' : 'rgba(31,99,200,0.43)', i === 0 ? 0.075 : 0.06);
  if (o.move) arrow(o.move[0], o.move[1], 'rgba(30,122,50,0.71)', 0.09);
  // la nota de la última jugada: un círculo en la esquina de su casilla de llegada
  const gr = o.last && GRADE[o.last.label];
  if (o.board && gr && o.last.to >= 0) {
    const [c, r] = xy(o.last.to), rad = sq * 0.21;
    let cx = frame + (c + 1) * sq - rad * 0.75, cy = frame + r * sq + rad * 0.75;
    cx = Math.min(cx, side - rad - 1); cy = Math.max(cy, rad + 1);
    g.fillStyle = 'rgba(0,0,0,0.31)'; g.beginPath(); g.arc(cx + rad * 0.08, cy + rad * 0.12, rad, 0, 2 * Math.PI); g.fill();
    g.fillStyle = gr.color; g.beginPath(); g.arc(cx, cy, rad, 0, 2 * Math.PI); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.5, rad * 0.12); g.stroke();
    g.fillStyle = '#fff';
    g.font = 'bold ' + (rad * (gr.sym.length > 1 ? 0.95 : 1.2)) + 'px -apple-system, system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(gr.sym, cx, cy + rad * 0.05);
    g.textBaseline = 'alphabetic';
  }
  // (26/11) la pieza que se arrastra con el dedo: algo más grande y por encima de la yema, para que se vea
  if (o.board && o.drag && o.drag.from >= 0 && o.board[o.drag.from] !== '.') {
    const dpr = window.devicePixelRatio || 1, big = Math.round(sq * 1.25);
    g.drawImage(pieceImage(o.board[o.drag.from], big), o.drag.x * dpr - big / 2, o.drag.y * dpr - big * (o.drag.touch ? 0.9 : 0.5));
  }
  // un aviso encima del tablero
  if (o.overlay) {
    const bandH = sq * 0.9;
    g.fillStyle = 'rgba(40,26,16,0.78)';
    g.fillRect(frame, side / 2 - bandH / 2, side - 2 * frame, bandH);
    g.fillStyle = '#FFF5E6';
    g.font = 'bold ' + Math.min(sq * 0.34, (side - 2 * frame) / Math.max(12, o.overlay.length) * 1.7) + 'px -apple-system, system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.fillText(o.overlay, side / 2, side / 2);
    g.textBaseline = 'alphabetic';
  }
  return { frame: frame / (window.devicePixelRatio || 1), sq: sq / (window.devicePixelRatio || 1), flipped: o.flipped };
}

/** La casilla bajo un toque (coordenadas del lienzo en píxeles CSS), o -1. */
function squareAt(geo, x, y) {
  const c = Math.floor((x - geo.frame) / geo.sq), r = Math.floor((y - geo.frame) / geo.sq);
  if (c < 0 || c > 7 || r < 0 || r > 7) return -1;
  return geo.flipped ? r * 8 + (7 - c) : (7 - r) * 8 + c;
}

/** La barra de evaluación (EvalBar.java): se desliza hasta cada valor nuevo. */
class EvalBar {
  constructor(cv) { this.cv = cv; this.target = 0.5; this.shown = 0.5; this.score = ''; this.flipped = false; this.active = false; }
  set(share, score, flipped, active) {
    this.target = Math.max(0, Math.min(1, share));
    this.score = score || ''; this.flipped = flipped; this.active = active;
    if (!this.raf) this.raf = requestAnimationFrame(() => this.draw());
  }
  draw() {
    this.raf = 0;
    const d = this.target - this.shown;
    if (Math.abs(d) < 0.002) this.shown = this.target; else { this.shown += d * 0.25; this.raf = requestAnimationFrame(() => this.draw()); }
    const cv = this.cv, g = fitCanvas(cv), w = cv.width, h = cv.height, dpr = window.devicePixelRatio || 1, rad = Math.min(w * 0.3, 8 * dpr);
    g.clearRect(0, 0, w, h);
    g.save();
    g.beginPath(); g.roundRect(0, 0, w, h, rad); g.clip();
    const whiteH = h * (this.active ? this.shown : 0.5);
    const whiteY = this.flipped ? 0 : h - whiteH, blackY = this.flipped ? whiteH : 0;
    let gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#845937'); gr.addColorStop(1, '#54351E');
    g.fillStyle = gr; g.fillRect(0, blackY, w, h - whiteH);
    gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#EECFA2'); gr.addColorStop(1, '#CDA574');
    g.fillStyle = gr; g.fillRect(0, whiteY, w, whiteH);
    if (!this.active) { g.fillStyle = 'rgba(244,238,226,0.53)'; g.fillRect(0, 0, w, h); }
    g.fillStyle = 'rgba(60,36,18,0.43)'; g.fillRect(0, h / 2 - dpr, w, 2 * dpr);
    g.restore();
    g.strokeStyle = '#3C2616'; g.lineWidth = 2 * dpr;
    g.beginPath(); g.roundRect(dpr, dpr, w - 2 * dpr, h - 2 * dpr, rad); g.stroke();
    if (!this.active || !this.score) return;
    const whiteAhead = this.shown >= 0.5, atBottom = whiteAhead !== this.flipped;
    g.font = 'bold 100px -apple-system, system-ui, sans-serif';
    const fit = 100 * w * 0.88 / Math.max(1, g.measureText(this.score).width);
    const size = Math.min(fit, 22 * dpr);
    g.font = 'bold ' + size + 'px -apple-system, system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = whiteAhead ? '#462A14' : '#FAECD0';
    g.fillText(this.score, w / 2, atBottom ? h - size * 0.55 : size * 1.25);
  }
}

/** El reloj (ClockView.java): dos ventanas de LCD en una caja de madera, con cifras de siete segmentos. */
const SEGMENT_DIGITS = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F];
function drawClock(cv, v, whiteName, blackName) {
  const g = fitCanvas(cv), w = cv.width, h = cv.height;
  g.clearRect(0, 0, w, h);
  if (!v || !v.on) return;
  const pad = h * 0.07;
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7A4B2A'); gr.addColorStop(1, '#4A2C17');
  g.fillStyle = gr; g.beginPath(); g.roundRect(0, 0, w, h, h * 0.14); g.fill();
  const faceW = (w - 3 * pad) / 2;
  clockFace(g, v, pad, pad, faceW, h - 2 * pad, v.white, 0, whiteName);
  clockFace(g, v, 2 * pad + faceW, pad, faceW, h - 2 * pad, v.black, 1, blackName);
}
function clockFace(g, v, x, y, w, h, ms, side, name) {
  const run = v.running === side && !v.paused, out = v.flag === side;
  g.fillStyle = '#15110D'; g.beginPath(); g.roundRect(x, y, w, h, h * 0.12); g.fill();
  if (run) {
    g.strokeStyle = '#3FD06A'; g.lineWidth = Math.max(2, h * 0.045); g.stroke();
    g.fillStyle = '#3FD06A'; g.beginPath(); g.arc(x + h * 0.26, y + h * 0.55, h * 0.12, 0, 2 * Math.PI); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(x + h * 0.23, y + h * 0.51, h * 0.04, 0, 2 * Math.PI); g.fill();
  }
  g.font = 'bold ' + (h * 0.21) + 'px -apple-system, system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillStyle = out ? '#FF4A3A' : run ? '#E8D9B8' : '#9A8B70';
  const top = out ? 'TIEMPO' : v.ended ? name + '  ·  FIN' : v.paused && v.started ? 'PAUSA' : name;
  g.fillText(top, x + w / 2, y + h * 0.24);
  const t = v.up ? ChessClock.used(ms) : ChessClock.text(ms);
  const color = out ? '#FF4A3A' : run ? (!v.up && ms < 10000 ? '#FF4A3A' : '#FFB627') : '#C9A25A';
  let dh = h * 0.54, tw = segWidth(t, dh);
  const room = w - h;
  if (tw > room) { dh *= room / tw; tw = segWidth(t, dh); }
  segText(g, t, x + (w - tw) / 2, y + h * 0.33 + (h * 0.63 - dh) / 2, dh, color);
}
const segCharW = (ch, h) => ch === ':' ? h * 0.26 : ch === '.' ? h * 0.22 : h * 0.56;
function segWidth(t, h) { let s = 0; for (const ch of t) s += segCharW(ch, h) + h * 0.1; return s - h * 0.1; }
function segText(g, t, x, y, h, color) {
  g.save();
  g.transform(1, 0, -0.08, 1, y * 0.08, 0);
  let cx = x;
  for (const ch of t) {
    const cw = segCharW(ch, h);
    g.fillStyle = color;
    if (ch === ':') { const d = h * 0.11; g.fillRect(cx + cw / 2 - d / 2, y + h * 0.28, d, d); g.fillRect(cx + cw / 2 - d / 2, y + h * 0.66, d, d); }
    else if (ch === '.') { const d = h * 0.12; g.fillRect(cx + cw / 2 - d / 2, y + h - d, d, d); }
    else if (ch >= '0' && ch <= '9') segDigit(g, SEGMENT_DIGITS[+ch], cx, y, cw, h, color);
    cx += cw + h * 0.1;
  }
  g.restore();
}
function segDigit(g, mask, x, y, w, h, color) {
  const t = h * 0.12, k = t / 2, l = x + k, rt = x + w - k, tp = y + k, bt = y + h - k, mid = (tp + bt) / 2;
  const s = [[l, tp, rt, tp, 0], [rt, tp, rt, mid, 1], [rt, mid, rt, bt, 1], [l, bt, rt, bt, 0], [l, mid, l, bt, 1], [l, tp, l, mid, 1], [l, mid, rt, mid, 0]];
  for (let i = 0; i < 7; i++) {
    g.fillStyle = mask & (1 << i) ? color : 'rgba(255,192,96,0.086)';
    const [x1, y1, x2, y2, vert] = s[i], gap = t * 0.18;
    g.beginPath();
    if (vert) { const a = y1 + gap, b = y2 - gap; g.moveTo(x1, a); g.lineTo(x1 + k, a + k); g.lineTo(x1 + k, b - k); g.lineTo(x1, b); g.lineTo(x1 - k, b - k); g.lineTo(x1 - k, a + k); }
    else { const a = x1 + gap, b = x2 - gap; g.moveTo(a, y1); g.lineTo(a + k, y1 - k); g.lineTo(b - k, y1 - k); g.lineTo(b, y1); g.lineTo(b - k, y1 + k); g.lineTo(a + k, y1 + k); }
    g.closePath();
    g.fill();
  }
}

/** El icono de la batería (BatteryIcon.java), en SVG: verde, ámbar o rojo; un rayo si se carga. */
function batteryIcon(level, charging) {
  const color = level >= 50 ? '#2E9D44' : level >= 20 ? '#E09A00' : '#C8402F';
  const w = Math.max(2, Math.round(26 * Math.min(100, level) / 100));
  return '<svg width="34" height="16" viewBox="0 0 34 16" style="vertical-align:-3px;margin:0 6px">' +
    '<rect x="1" y="1" width="29" height="14" rx="3" fill="none" stroke="#2B2118" stroke-width="1.6"/>' +
    '<rect x="30.5" y="5" width="2.5" height="6" rx="1" fill="#2B2118"/>' +
    '<rect x="2.5" y="2.5" width="' + w + '" height="11" rx="1.6" fill="' + color + '"/>' +
    (charging ? '<path d="M17 2 L11 9 h4 l-2 5 l7-8 h-4 z" fill="#FFD23F" stroke="#5A4000" stroke-width=".6"/>' : '') + '</svg>';
}
