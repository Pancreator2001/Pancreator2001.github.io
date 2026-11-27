// Ajedrez contra Maia en el navegador, con la pantalla de la app de Android: el tablero con la barra de evaluación, la
// apertura y las jugadas candidatas debajo; el reloj; el estado (Chessnut con su batería, Maia y lo que está haciendo);
// Barra / Material / Candidatas, el material, el turno y la profundidad de Stockfish; ◀ Atrás / Montar / Tablas /
// Rendirse; las jugadas con su nota; Maia, Juegas con, Piensa, Variedad; Girar tablero / Conectar Chessnut; Reloj;
// el registro. La partida se juega como en Android: la jugada de Maia se enciende en el tablero y se espera a que la
// hagas; las tomas atrás se hacen en el tablero; sin tablero se juega tocando la pantalla.
'use strict';

ort.env.wasm.numThreads = 1;
const $ = id => document.getElementById(id);
const START = Pos.fromFen(START_FEN);
const LEVELS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900];
const GREEN = '#2E9D44', AMBER = '#E09A00', RED = '#C8402F', GREY = '#9A948A';

const S = {
  partida: new Partida(), humanWhite: true, level: 1100, variety: true, pause: 2,
  barOn: true, materialOn: true, candCount: 5, clockCtl: ChessClock.USED, flipped: false,
  maiaMove: null, thinking: false, thinkId: 0, settingUp: false, over: null, result: null,
  physical: null, sel: -1, liftRef: null, lifted: new Array(64).fill(false),
  info: '', infoClass: '', undo: null, undoPaused: false, illegal: null,
  setUpByUser: false, fixArrow: null, targets: null, drag: null, editBoard: null, palette: null,
  review: -1, reviewKey: '',
  maiaState: 'loading', maiaError: '', view: null, lastShare: 0.5, lastScore: '', analyzedKey: '',
};

const maia = new Maia('redes/');
const nut = new Chessnut(log);
const clock = new ChessClock();
const revision = new Revision();
const motor = new Motor('stockfish/stockfish-18-lite-single.js', v => { S.view = v; scheduleRender(); }, log);
const bar = new EvalBar($('bar'));
let geo = null, reviewFen = null;

// ---- ajustes y partidas guardadas en este navegador

function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { } }
function load(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; } }

(() => {
  const p = load('maia-web', {});
  if (LEVELS.includes(p.level)) S.level = p.level;
  if (typeof p.humanWhite === 'boolean') S.humanWhite = p.humanWhite;
  if (typeof p.variety === 'boolean') S.variety = p.variety;
  if (p.pause >= 0 && p.pause <= 10) S.pause = p.pause;
  if (typeof p.barOn === 'boolean') S.barOn = p.barOn;
  if (typeof p.materialOn === 'boolean') S.materialOn = p.materialOn;
  if (p.candCount >= 0 && p.candCount <= 5) S.candCount = p.candCount;
  if (CLOCKS.includes(p.clockCtl)) S.clockCtl = p.clockCtl;
  S.flipped = !S.humanWhite;
})();
function savePrefs() {
  store('maia-web', { level: S.level, humanWhite: S.humanWhite, variety: S.variety, pause: S.pause, barOn: S.barOn, materialOn: S.materialOn, candCount: S.candCount, clockCtl: S.clockCtl });
}

/** La partida en curso, para seguirla si se cierra o recarga la página (como la app: si el tablero coincide). */
function saveGame() {
  const p = S.partida;
  store('maia-web-partida', { start: p.positions[0].fen(), moves: p.moves.map(m => m.uci), over: S.over, result: S.result });
}
function restoreGame() {
  const g = load('maia-web-partida', null);
  if (!g || !g.start) return;
  try {
    const p = new Partida(Pos.fromFen(g.start));
    for (const u of g.moves || []) {
      const m = p.pos.legal().find(x => x.uci === u);
      if (!m) return;
      p.play(m);
    }
    if (!p.moves.length && p.fromStart) return;
    S.partida = p;
    S.over = g.over || null;
    S.result = g.result || null;
    log('Partida recuperada: ' + p.moves.length + ' jugadas' + (S.over ? ' (terminada: ' + S.over + ')' : '') + '. Si el tablero no coincide, coloca la posición inicial o usa «Montar».');
  } catch (e) { }
}

// ---- registro

function log(s) {
  const d = new Date(), z = n => (n < 10 ? '0' : '') + n;
  const el = $('log');
  el.textContent += z(d.getDate()) + '/' + z(d.getMonth() + 1) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds()) + '  ' + s + '\n';
  const lines = el.textContent.split('\n');
  if (lines.length > 300) el.textContent = lines.slice(-300).join('\n');
  el.scrollTop = el.scrollHeight;
  if (location.hostname === 'localhost' || location.hostname.endsWith('.trycloudflare.com')) fetch('registro', { method: 'POST', body: s, keepalive: true }).catch(() => { });
}
window.addEventListener('error', e => log('ERROR JS: ' + e.message + ' (' + (e.filename || '').split('/').pop() + ':' + e.lineno + ')'));
window.addEventListener('unhandledrejection', e => log('ERROR JS (promesa): ' + (e.reason && e.reason.message || e.reason)));

function setInfo(s, cls = '') { S.info = s; S.infoClass = cls; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const same = (a, b) => a.join('') === b.join('');
const connected = () => !!nut.write;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const wide = () => window.matchMedia('(min-width: 600px)').matches;

/** Un peón en la última fila cuenta como dama (se corona con el propio peón, como en el Puente). */
function normalize(b) {
  const n = b.slice();
  for (let f = 0; f < 8; f++) { if (n[56 + f] === 'P') n[56 + f] = 'Q'; if (n[f] === 'p') n[f] = 'q'; }
  return n;
}

function cancelThinking() { S.thinkId++; S.thinking = false; }

// ---- las luces: Atrás, la jugada de Maia; si no, la pieza que tienes en la mano

function undoLit() {
  if (!S.undo || !S.physical) return null;
  const t = S.partida.positions[S.undo.k].b, b = normalize(S.physical);
  return t.map((c, i) => c !== b[i]);
}
function maiaLit() {
  if (!S.maiaMove) return null;
  const lit = new Array(64).fill(false), m = S.maiaMove.m, b = S.partida.pos.b;
  lit[m.from] = lit[m.to] = true;
  if (b[m.from].toLowerCase() === 'k' && Math.abs(m.to - m.from) === 2) {
    if (m.to > m.from) lit[m.from + 3] = lit[m.from + 1] = true; else lit[m.from - 4] = lit[m.from - 1] = true;
  }
  return lit;
}
let lastLedLog = '';
function refreshLeds(force) {
  if (!connected()) return;
  const lit = undoLit() || S.illegal || maiaLit();
  // en el registro, las luces de Maia y de Atrás (como Android: "LEDs: e7,e5"); las de la pieza en la mano, no
  const names = lit ? lit.map((x, i) => x ? sqName(i) : null).filter(x => x).join(',') : '';
  if (names !== lastLedLog) { lastLedLog = names; log('LEDs: ' + (names || '-')); }
  nut.leds(lit || S.lifted, force);
}
// mientras una jugada de Maia (o Atrás) espera encendida, se vuelve a mandar cada 3 s por si el tablero perdió la orden
setInterval(() => { if (connected() && (S.maiaMove || S.undo || S.illegal)) refreshLeds(true); }, 3000);
function updateLift(b) {
  const lit = new Array(64).fill(false);
  let only = S.liftRef !== null;
  for (let i = 0; i < 64 && only; i++) {
    if (b[i] === S.liftRef[i]) continue;
    if (b[i] === '.' && S.liftRef[i] !== '.') lit[i] = true; else only = false;
  }
  if (!only) { S.liftRef = b.slice(); lit.fill(false); }
  S.lifted = lit;
}

// ---- el reloj sigue el turno (con la jugada de Maia encendida corre el tuyo: Maia ya ha jugado)

function updateClock() {
  if (S.settingUp) return;
  if (S.over) { clock.stop(); return; }
  let side = S.partida.pos.white ? 0 : 1;
  if (S.maiaMove) side = S.humanWhite ? 0 : 1;
  clock.turn(side);
}

// ---- análisis: Stockfish en la posición de la partida y, cuando acaba, repaso de las jugadas sin nota

const analysisOn = () => S.barOn || S.candCount > 0;

function analyze() {
  if (!analysisOn()) { motor.halt(); S.analyzedKey = ''; return; }
  const p = S.partida.pos, fen = p.fen(), mpv = Math.max(1, S.candCount), key = fen + '|' + mpv;
  if (key === S.analyzedKey) return;
  S.analyzedKey = key;
  reviewFen = null;
  if (!p.legal().length) { motor.halt(); return; }
  motor.request({ fen, white: p.white, multipv: mpv, depth: 20, movetime: 20000 });
}

motor.onEval = (fen, e) => { revision.record(fen, e); };
motor.onIdle = () => {
  if (!analysisOn() || S.thinking) return;
  if (reviewFen) {
    const e = revision.evals.get(reviewFen);
    if (!e || e.depth < Revision.REVIEW_DEPTH) revision.skipped.add(reviewFen);
    reviewFen = null;
    scheduleRender();
  }
  const pos = revision.needEval(S.partida);
  if (!pos) return;
  const fen = pos.fen();
  if (fen === S.partida.pos.fen()) { revision.skipped.add(fen); return; }
  reviewFen = fen;
  motor.request({ fen, white: pos.white, multipv: 1, depth: Revision.REVIEW_DEPTH, movetime: 5000, review: true });
};

// ---- la partida

function afterChange() {
  saveGame();
  refreshLeds();
  updateClock();
  analyze();
  maiaTurn();
  scheduleRender();
}

function resultOf(why) {
  const p = S.partida;
  if (why.startsWith('Jaque mate')) return p.moves[p.moves.length - 1].white ? '1-0' : '0-1';
  return '1/2-1/2';
}

function endGame(why, res, notice) {
  cancelThinking();
  S.over = why;
  S.result = res;
  S.maiaMove = null;
  clock.stop();
  log(notice + ' Para jugar otra, coloca las piezas en la posición inicial.');
  setInfo('Partida terminada: ' + why);
  saveFinished();
  saveGame();
  refreshLeds();
  scheduleRender();
}

function checkEnd() {
  const e = S.partida.end();
  if (e) endGame(e, resultOf(e), 'Fin de la partida: ' + e + '.');
  return e;
}

const playing = () => S.partida.moves.length > 0 && !S.over;

function userMove(m) {
  cancelThinking();
  S.partida.play(m);
  S.sel = -1;
  S.targets = null;
  const mv = S.partida.moves[S.partida.moves.length - 1];
  log('Tú: ' + (mv.white ? mv.number + '. ' : mv.number + '... ') + mv.san);
  if (!checkEnd()) afterChange();
}

function makeMaia() {
  const mm = S.maiaMove;
  if (!mm) return;
  S.maiaMove = null;
  S.partida.play(mm.m);
  if (!checkEnd()) { setInfo('Te toca'); afterChange(); }
}

function takeBack(k) {
  cancelThinking();
  const p = S.partida, n = p.positions.length - 1 - k;
  while (p.positions.length - 1 > k) p.undo();
  S.maiaMove = null;
  if (S.over) { S.over = null; S.result = null; clock.resume(); }
  log('Deshecha' + (n > 1 ? 's ' + n + ' jugadas' : ' una jugada') + ' en el tablero.');
  afterChange();
}

function newGame() {
  cancelThinking();
  S.setUpByUser = false;
  S.partida = new Partida();
  S.over = null; S.result = null; S.maiaMove = null; S.undo = null;
  clock.newGame();
  log('Posición inicial: partida nueva contra Maia ' + S.level + '.');
  afterChange();
}

async function maiaTurn() {
  const p = S.partida;
  if (S.over || S.settingUp || S.maiaMove || S.thinking || S.undo) return;
  if (p.pos.white === S.humanWhite) { if (!S.info.startsWith('Esa no es')) setInfo('Te toca'); return; }
  if (S.maiaState !== 'ready') { setInfo('Maia aún no está lista'); return; }
  if (!p.pos.legal().length) return;
  const id = ++S.thinkId;
  S.thinking = true;
  setInfo('Maia piensa...');
  scheduleRender();
  try {
    const pick = await maia.move(p, S.variety, S.level);
    await sleep(S.pause * 1000 * (0.6 + 0.8 * Math.random()));
    if (id !== S.thinkId || p !== S.partida) return;
    S.thinking = false;
    if (!pick) return;
    const pos = p.pos, san = pos.san(pick.m);
    const text = (pos.white ? pos.full + '. ' : pos.full + '... ') + san;
    S.maiaMove = { m: pick.m, after: pos.play(pick.m), san, text, p: pick.p };
    log('Maia juega ' + text + '  (la gente de su nivel la juega el ' + Math.round(pick.p) + ' % de las veces).');
    if (connected() && S.physical) {
      setInfo('Maia juega: ' + text, 'go');
      refreshLeds();
      updateClock();
    } else {
      makeMaia();
      return;
    }
  } catch (e) {
    S.thinking = false;
    setInfo('Maia no puede jugar: ' + e.message, 'bad');
    log('ERROR de Maia: ' + e.message);
  }
  scheduleRender();
}

/** Una jugada ilegal en el tablero: por qué, y sus casillas encendidas para devolver las piezas (las que difieren de ref). */
function showIllegal(why, ref, nb) {
  S.illegal = ref.map((c, i) => c !== nb[i]);
  const t = 'Jugada ilegal: ' + why;
  if (S.info !== t) log(t + ' Devuelve las piezas de las casillas encendidas.');
  setInfo(t, 'bad');
}

/** El enroque empezado por la torre (24/11: Tf1 se tomaba como una jugada suelta, Maia contestaba y luego el rey ya
 *  no encajaba): si el tablero es el enroque desde la posición de antes de esa torre, {move} (legal) o {why}. */
function rookFirstCastle(nb) {
  const p = S.partida, n = p.moves.length;
  if (!n) return null;
  const last = p.moves[n - 1], before = p.positions[n - 1];
  if (last.white !== S.humanWhite) return null;
  const side = { h1f1: 'K', a1d1: 'Q', h8f8: 'K', a8d8: 'Q' }[last.uci];
  const cb = side ? before.castleBoard(side) : null;
  if (!cb || !same(cb, nb)) return null;
  const move = before.legal().find(x => before.b[x.from].toLowerCase() === 'k' && Math.abs(x.to - x.from) === 2 && (side === 'K') === (x.to > x.from));
  return { move: move || null, why: move ? null : before.illegalReason(nb), before };
}

/** Todas las piezas de salida, en las filas 1, 2, 7 y 8, pero no la posición inicial (piezas cambiadas de sitio). */
function looksLikeStart(b) {
  if (same(b, START.b)) return false;
  for (let i = 16; i < 48; i++) if (b[i] !== '.') return false;
  const count = a => { const c = {}; for (const x of a) c[x] = (c[x] || 0) + 1; return c; };
  const have = count(b), want = count(START.b);
  return [...'KQRBNPkqrbnp'].every(x => (have[x] || 0) === want[x]);
}

/** Una posición nueva y quieta en el tablero. */
function onPhysical(b) {
  S.physical = b;
  updateLift(b);
  S.illegal = null;
  if (S.settingUp) { refreshLeds(); scheduleRender(); return; }
  if (S.undo) { checkUndo(); return; }
  const nb = normalize(b), p = S.partida;
  // 26/11 (como en el PC y en Android): antes de la primera jugada, todas las piezas en sus filas de salida pero alguna
  // en otra casilla: en rojo, sus casillas encendidas y los pasos para ponerlas bien; Maia espera
  if (!S.setUpByUser && p.moves.length === 0 && looksLikeStart(nb)) {
    cancelThinking();
    S.maiaMove = null;
    const d = Restore.describe(Restore.steps(nb, START.b, null), nb, START.b);
    S.illegal = START.b.map((c, i) => c !== nb[i]);
    S.fixArrow = d.arrow;
    if (!S.info.startsWith('Piezas mal colocadas')) log('Piezas mal colocadas para empezar: ponlas en la posición inicial; Maia espera.');
    setInfo('Piezas mal colocadas: ponlas en la posición inicial:\n' + d.text, 'bad');
    refreshLeds(); scheduleRender(); return;
  }
  S.fixArrow = null;
  if (same(nb, START.b) && !(p.fromStart && p.moves.length === 0 && !S.over)) { newGame(); return; }
  if (S.maiaMove && same(nb, S.maiaMove.after.b)) { makeMaia(); return; }
  if (same(nb, p.pos.b)) {
    if (S.maiaMove) setInfo('Maia juega: ' + S.maiaMove.text, 'go');
    else if (!S.over && !S.thinking) {
      if (p.pos.white === S.humanWhite) setInfo('Te toca');
      else maiaTurn();                                    // le toca a Maia y no estaba pensando: que juegue
    }
    refreshLeds(); scheduleRender(); return;
  }
  for (let k = p.positions.length - 2; k >= Math.max(0, p.positions.length - 5); k--)
    if (same(nb, p.positions[k].b)) { takeBack(k); return; }
  if (!S.over) {
    const rf = rookFirstCastle(nb);
    if (rf && rf.move) {
      cancelThinking();
      S.maiaMove = null;
      p.undo();
      log('Enroque en dos tiempos (primero la torre): cuenta como enroque.');
      userMove(rf.move);
      return;
    }
    if (rf && rf.why) {
      cancelThinking();
      S.maiaMove = null;
      showIllegal(rf.why, rf.before.b, nb);
      refreshLeds(); scheduleRender(); return;
    }
    const pos = p.pos, mine = pos.white === S.humanWhite && !S.maiaMove;
    const m = pos.legal().find(x => same(pos.play(x).b, nb));
    if (m && mine) { userMove(m); return; }
    if (m && S.maiaMove) {
      const w = 'Esa no es la jugada de Maia: has hecho ' + pos.san(m) + ' y Maia juega ' + S.maiaMove.text + '. Deshaz la tuya y haz la de Maia (sigue encendida).';
      if (S.info !== 'Esa no es la jugada de Maia: haz ' + S.maiaMove.text) log(w);
      setInfo('Esa no es la jugada de Maia: haz ' + S.maiaMove.text, 'bad');
    } else {
      const why = mine ? pos.illegalReason(nb) : null;
      const half = mine && !why ? pos.halfCastle(nb) : null;
      if (why) showIllegal(why, pos.b, nb);
      else if (half) {
        const cb = pos.castleBoard(half), ok = cb && pos.legal().some(x => same(pos.play(x).b, cb));
        const hw = cb && !ok ? pos.illegalReason(cb) : null;
        if (hw) showIllegal(hw, pos.b, nb);
        else setInfo('Enroque: mueve ahora la torre', 'go');
      } else if (!S.lifted.some(x => x)) setInfo(S.maiaMove ? 'Maia juega: ' + S.maiaMove.text : 'El tablero no coincide con la partida (coloca la posición inicial, usa «Montar» o pulsa «Juega Maia»)', S.maiaMove ? 'go' : 'amber');
    }
  }
  refreshLeds();
  scheduleRender();
}

// ---- ▶ Juega Maia: obligarla a mover (24/11: "a veces Maia no contesta al movimiento")

function forceMaia() {
  if (S.settingUp) { log('Estás montando una posición: pulsa quién empieza (Blancas o Negras) o Cancelar.'); return; }
  if (S.undo) { log('Estás volviendo atrás: devuelve las piezas o pulsa Cancelar.'); return; }
  const p = S.partida;
  if (S.maiaMove) { log('Maia ya ha jugado ' + S.maiaMove.text + ': hazla en el tablero (está encendida).'); refreshLeds(true); return; }
  const nb = connected() && S.physical ? normalize(S.physical) : null;
  if (nb && !S.over && !same(nb, p.pos.b)) {
    // tu jugada en el tablero que no se había tomado (o un enroque empezado por la torre): se toma ahora
    const rf = rookFirstCastle(nb);
    if (rf && rf.move) { cancelThinking(); p.undo(); userMove(rf.move); return; }
    const m = p.pos.legal().find(x => same(p.pos.play(x).b, nb));
    if (m && p.pos.white === S.humanWhite) { userMove(m); return; }
    const why = (rf && rf.why) || (p.pos.white === S.humanWhite ? p.pos.illegalReason(nb) : null);
    if (why) { log('Maia no puede jugar: tu jugada no es legal. ' + why); setInfo('Jugada ilegal: ' + why, 'bad'); scheduleRender(); return; }
  }
  // le toca a Maia en la partida: vuelve a pensar
  if (!S.over && (!nb || same(nb, p.pos.b)) && p.pos.white !== S.humanWhite) {
    cancelThinking();
    log('Juega Maia: vuelve a pensar su jugada.');
    maiaTurn();
    return;
  }
  // si no: Maia juega desde la posición del tablero (o la de la pantalla), con su color
  const b = nb || p.pos.b.slice();
  const pos = new Pos();
  pos.b = b.slice();
  pos.white = !S.humanWhite;
  pos.castle = { K: true, Q: true, k: true, q: true };
  pos.fixCastling();
  const maiaSide = pos.white ? 'blancas' : 'negras';
  if (b.filter(c => c === 'K').length !== 1 || b.filter(c => c === 'k').length !== 1) { log('Maia no puede jugar desde el tablero: tiene que haber un rey blanco y uno negro.'); return; }
  if (pos.inCheck(!pos.white)) { log('Maia no puede jugar desde el tablero: tu rey está en jaque y no te toca.'); return; }
  if (!pos.legal().length) { log('Maia no tiene ninguna jugada en esa posición (' + (pos.inCheck() ? 'jaque mate' : 'ahogado') + ').'); return; }
  const go = () => {
    cancelThinking();
    S.partida = new Partida(pos);
    S.over = null; S.result = null; S.maiaMove = null; S.illegal = null;
    if (clock.snapshot().ended) clock.resume();
    log('Juega Maia con las ' + maiaSide + ' desde la posición del tablero (la lista de jugadas empieza aquí).');
    afterChange();
  };
  const sameAsGame = same(b, p.pos.b);
  const text = S.over ? 'La partida ha terminado. ¿Juega Maia con las ' + maiaSide + ' desde la posición del tablero? Se sigue jugando desde aquí.'
    : sameAsGame ? 'Te toca a ti. ¿Quieres que Maia juegue ahora con las ' + maiaSide + '? Se sigue jugando desde esta posición.'
    : 'El tablero no sigue la partida. ¿Juega Maia con las ' + maiaSide + ' desde la posición del tablero? Se sigue jugando desde aquí.';
  dialog('Juega Maia', '<p>' + esc(text) + '</p>', [{ label: 'No' }, { label: 'Sí, que juegue', primary: true, fn: go }]);
}

// ---- Nueva partida: limpia la partida (terminada o no) y espera la posición inicial

function newGameButton() {
  const doIt = () => {
    if (S.undo) endUndo();
    S.settingUp = false;
    S.illegal = null;
    newGame();
    if (connected() && S.physical && !same(normalize(S.physical), START.b)) setInfo('Partida nueva: coloca las piezas en la posición inicial', 'amber');
    scheduleRender();
  };
  if (playing()) dialog('Nueva partida', '<p>¿Empezar una partida nueva? La de ahora no ha terminado y no se guarda.</p>', [{ label: 'Seguir con esta' }, { label: 'Nueva partida', primary: true, fn: doIt }]);
  else doIt();
}

// ---- ◀ Atrás: tu última jugada y la de Maia; las casillas que cambian se encienden hasta que el tablero lo muestra

function back() {
  const p = S.partida;
  if (!p.moves.length) { log('Atrás: no hay jugadas que deshacer.'); return; }
  const n = p.positions.length - 1, min = Math.max(0, n - 12);
  let k;
  if (S.undo) k = Math.max(min, S.undo.k - 2);
  else k = Math.max(min, n - (p.pos.white === S.humanWhite ? 2 : 1));
  if (S.undo && k === S.undo.k) { log('Atrás: no se puede retroceder más.'); return; }
  cancelThinking();
  S.maiaMove = null;
  if (S.over) { S.over = null; S.result = null; clock.resume(); }
  const undone = p.moves.slice(k).map(m => m.san).reverse().join(', ');
  const maiaNext = p.positions[k].white !== S.humanWhite;
  if (!connected() || !S.physical) {                       // sin tablero: se deshace ya
    while (p.positions.length - 1 > k) p.undo();
    log('Atrás: deshecho ' + undone + '. ' + (maiaNext ? 'Juega Maia.' : 'Te toca.'));
    S.undo = null;
    afterChange();
    return;
  }
  if (!S.undo) {
    const c = clock.snapshot();
    S.undoPaused = c.started && !c.paused && !c.ended && c.flag < 0;
    if (S.undoPaused) clock.togglePause();
  }
  // (24/11, pedido por el usuario) la posición de antes en la pantalla en el acto, y los pasos para colocar el
  // tablero igual, uno a uno, el que toca con una flecha
  S.undo = { k, order: Restore.order(p, k), plan: null, arrow: null };
  log('Atrás: la pantalla ya muestra la posición de antes de ' + undone + '. Coloca el tablero igual, siguiendo los pasos (se encienden las casillas que cambian). Cuando el tablero lo muestre, ' + (maiaNext ? 'jugará Maia.' : 'te tocará a ti.'));
  checkUndo();
}

function checkUndo() {
  const lit = undoLit();
  const diff = lit ? lit.filter(x => x).length : 0;
  if (diff > 0) {
    const u = S.undo, t = S.partida.positions[u.k].b, b = normalize(S.physical);
    if (!u.plan || !Restore.fits(u.plan, b, t)) u.plan = Restore.steps(b, t, u.order);
    const d = Restore.describe(u.plan, b, t);
    u.arrow = d.arrow;
    setInfo('Atrás: coloca las piezas como en la pantalla:\n' + d.text, 'go');
    refreshLeds(); scheduleRender(); return;
  }
  const k = S.undo.k, p = S.partida;
  endUndo();
  while (p.positions.length - 1 > k) p.undo();
  log('Hecho: la partida ha vuelto atrás. ' + (p.pos.white !== S.humanWhite ? 'Juega Maia.' : 'Te toca.'));
  afterChange();
}

function endUndo() {
  S.undo = null;
  if (S.undoPaused && clock.snapshot().paused) clock.togglePause();
  S.undoPaused = false;
  refreshLeds();
}

function cancelBack() {
  if (!S.undo) return;
  endUndo();
  log('Atrás cancelado: la partida sigue desde la posición del tablero.');
  if (S.physical) onPhysical(S.physical); else afterChange();
}

// ---- Montar posición

function startSetUp() {
  if (S.undo) endUndo();
  cancelThinking();
  S.settingUp = true;
  S.maiaMove = null;
  clearSel();
  S.palette = null;
  S.editBoard = onScreen() ? S.partida.pos.b.slice() : null;   // en la pantalla: se monta sobre la posición de ahora
  clock.newGame();
  setInfo('Montando posición: coloca las piezas y pulsa abajo quién empieza: blancas o negras', 'amber');
  log('Montar posición: coloca las piezas como quieras (Maia espera, el reloj no corre y no se apuntan jugadas) y luego pulsa quién empieza: blancas o negras.');
  refreshLeds();
  scheduleRender();
}

function startFrom(white) {
  const b = S.physical && connected() ? normalize(S.physical) : (S.editBoard || S.partida.pos.b).slice();
  const pos = new Pos();
  pos.b = b.slice();
  pos.white = white;
  pos.castle = { K: true, Q: true, k: true, q: true };
  pos.fixCastling();
  const bad = t => { log(t); setInfo(t, 'bad'); scheduleRender(); };
  if (b.filter(c => c === 'K').length !== 1 || b.filter(c => c === 'k').length !== 1) return bad('Esa posición no vale: tiene que haber un rey blanco y uno negro.');
  if (pos.inCheck(!white)) return bad('Esa posición no vale: el rey ' + (white ? 'negro' : 'blanco') + ' está en jaque y no le toca mover. ¿Empiezan las ' + (white ? 'negras' : 'blancas') + '?');
  if (pos.isStart() === false && same(b, START.b) && !white) return bad('En la posición inicial empiezan las blancas.');
  if (!pos.legal().length) return bad('En esa posición las ' + (white ? 'blancas' : 'negras') + ' no tienen ninguna jugada.');
  S.settingUp = false;
  S.setUpByUser = true;                  // (sus piezas están donde las puso el usuario: no son "mal colocadas")
  S.editBoard = null; S.palette = null; S.sel = -1; S.targets = null;
  S.partida = new Partida(pos);
  S.over = null; S.result = null; S.maiaMove = null;
  clock.newGame();
  log('Posición montada: empiezan las ' + (white ? 'blancas' : 'negras') + (white === S.humanWhite ? ' (tú).' : ' (Maia).'));
  setInfo(white === S.humanWhite ? 'Te toca' : 'Maia piensa...');
  afterChange();
}

function cancelSetUp() {
  S.settingUp = false;
  S.editBoard = null; S.palette = null; S.sel = -1;
  log('Montar posición cancelado.');
  if (S.physical) onPhysical(S.physical); else afterChange();
}

// ---- Tablas y Rendirse

function offerDraw() {
  if (!playing()) { log('No hay ninguna partida en marcha.'); return; }
  const maiaWhite = !S.humanWhite, v = S.view, cur = S.partida.pos.fen();
  let accepts;
  if (v && v.fen === cur && v.lines[0] && v.depth > 0) {
    const share = Motor.whiteShare(v.lines[0]);
    accepts = (maiaWhite ? share : 1 - share) <= 0.55;
  } else {
    const m = material(S.partida.pos.b);
    accepts = (maiaWhite ? m[0] - m[1] : m[1] - m[0]) <= 0;
  }
  if (!accepts) { log('Ofreces tablas: Maia las rechaza (cree que va mejor). La partida sigue.'); setInfo('Maia rechaza las tablas'); scheduleRender(); return; }
  endGame('Tablas de acuerdo', '1/2-1/2', 'Maia acepta las tablas.');
}

function resign() {
  if (!playing()) { log('No hay ninguna partida en marcha.'); return; }
  dialog('Rendirse', '<p>¿Te rindes? La partida termina y gana Maia.</p>', [
    { label: 'Seguir jugando' },
    { label: 'Me rindo', primary: true, fn: () => endGame('Te rindes: gana Maia', S.humanWhite ? '0-1' : '1-0', 'Te has rendido. Gana Maia ' + S.level + '.') },
  ]);
}

// ---- el turno a mano (posición montada sin jugadas) y girar el tablero

function toggleTurn() {
  const p = S.partida;
  if (S.settingUp) return;
  if (p.moves.length) { log('La partida ya tiene jugadas: para empezar con el otro bando, usa «Montar».'); return; }
  const pos = p.positions[0].clone();
  pos.white = !pos.white;
  pos.ep = -1;
  if (pos.inCheck(!pos.white) || !pos.legal().length) { log('No pueden empezar las ' + (pos.white ? 'blancas' : 'negras') + ' en esta posición.'); return; }
  cancelThinking();
  S.partida = new Partida(pos);
  S.maiaMove = null;
  clock.newGame();
  log('Turno cambiado a mano: juegan ' + (pos.white ? 'blancas.' : 'negras.'));
  afterChange();
}

function flip() { S.flipped = !S.flipped; scheduleRender(); }

// ---- tocar la pantalla (sin tablero)

const onScreen = () => !(connected() && S.physical);      // sin el Chessnut: se juega tocando la pantalla

/** Se puede mover ahora en la pantalla: te toca y no hay nada pendiente. */
function userMayMove() {
  const p = S.partida;
  return onScreen() && !S.settingUp && !S.over && !S.undo && !S.thinking && !S.maiaMove && p.pos.white === S.humanWhite;
}

/** La pieza tocada (o arrastrada): se marca y se ven sus casillas (26/11: puntos, como en Android y en el PC). */
function selectSquare(sq) {
  const pos = S.partida.pos;
  S.sel = sq;
  S.targets = new Array(64).fill(false);
  for (const m of pos.legal()) if (m.from === sq) S.targets[m.to] = true;
}
function clearSel() { S.sel = -1; S.targets = null; }

/** La jugada de from a to en la pantalla, si vale (al coronar se pregunta la pieza); true: hecha o preguntada. */
function screenMove(from, to) {
  const c = S.partida.pos.legal().filter(m => m.from === from && m.to === to);
  if (!c.length) return false;
  clearSel();
  if (c.length > 1 && c.some(m => m.promo)) {
    const names = { q: 'Dama', r: 'Torre', b: 'Alfil', n: 'Caballo' };
    dialog('Coronación: ¿qué pieza?', '', [{ label: 'Cancelar', fn: () => scheduleRender() }],
           ['q', 'r', 'b', 'n'].map(k => ({ label: names[k], fn: () => { const m = c.find(x => x.promo === k); if (m) userMove(m); } })));
    scheduleRender();
    return true;
  }
  userMove(c[0]);
  return true;
}

function onSquare(sq) {
  if (sq < 0 || !onScreen()) return;                        // con el Chessnut, las jugadas se hacen en el tablero
  if (S.settingUp) { editTap(sq); return; }
  const p = S.partida;
  if (!userMayMove()) { clearSel(); scheduleRender(); return; }
  if (S.sel >= 0 && screenMove(S.sel, sq)) return;
  const mine = c => c !== '.' && isWhite(c) === S.humanWhite;
  if (mine(p.pos.b[sq]) && S.sel !== sq) selectSquare(sq); else clearSel();
  scheduleRender();
}

// ---- montar posición en la pantalla (26/11, como en Android y en el PC): una pieza elegida en la fila de abajo va
// donde toques (otra vez: se quita), la cruz quita; sin ninguna elegida, una pieza tocada va donde toques después

function editTap(sq) {
  if (!S.editBoard) S.editBoard = S.partida.pos.b.slice();
  const e = S.editBoard;
  if (S.palette === 'x') e[sq] = '.';
  else if (S.palette) e[sq] = e[sq] === S.palette ? '.' : S.palette;
  else if (S.sel >= 0) { if (sq !== S.sel) { e[sq] = e[S.sel]; e[S.sel] = '.'; } clearSel(); }
  else if (e[sq] !== '.') { S.sel = sq; S.targets = null; }
  scheduleRender();
}

function buildPalette() {
  const row = $('palette');
  if (!row || row.childElementCount) return;
  for (const p of 'KQRBNPkqrbnpx') {
    const c = document.createElement('canvas');
    c.className = 'pc';
    c.title = p === 'x' ? 'Quitar' : '';
    c.onclick = () => { S.palette = S.palette === p ? null : p; clearSel(); renderPalette(); };
    c.dataset.p = p;
    row.appendChild(c);
  }
  const empty = document.createElement('button');
  empty.textContent = 'Vaciar';
  empty.onclick = () => { S.editBoard = new Array(64).fill('.'); clearSel(); scheduleRender(); };
  const start = document.createElement('button');
  start.textContent = 'Inicial';
  start.onclick = () => { S.editBoard = START.b.slice(); clearSel(); scheduleRender(); };
  row.appendChild(empty);
  row.appendChild(start);
}

function renderPalette() {
  const row = $('palette');
  if (!row) return;
  const show = S.settingUp && onScreen();
  row.style.display = show ? '' : 'none';
  if (!show) return;
  buildPalette();
  for (const c of row.querySelectorAll('canvas.pc')) {
    const dpr = window.devicePixelRatio || 1, w = Math.round(c.getBoundingClientRect().width * dpr) || 34, h = Math.round(c.getBoundingClientRect().height * dpr) || 34;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d'), p = c.dataset.p, s = Math.min(w, h);
    g.clearRect(0, 0, w, h);
    g.fillStyle = S.palette === p ? '#BBD7F5' : '#F0D9B5';
    g.fillRect(0, 0, w, h);
    if (p === 'x') {
      g.strokeStyle = '#C8402F'; g.lineWidth = Math.max(3, s * 0.1);
      g.beginPath(); g.moveTo(w / 2 - s * 0.22, h / 2 - s * 0.22); g.lineTo(w / 2 + s * 0.22, h / 2 + s * 0.22);
      g.moveTo(w / 2 + s * 0.22, h / 2 - s * 0.22); g.lineTo(w / 2 - s * 0.22, h / 2 + s * 0.22); g.stroke();
    } else g.drawImage(pieceImage(p, Math.round(s * 0.92)), (w - s * 0.92) / 2, (h - s * 0.92) / 2);
    if (S.palette === p) { g.strokeStyle = '#1E88E5'; g.lineWidth = Math.max(2, s * 0.07); g.strokeRect(1, 1, w - 2, h - 2); }
  }
}

// ---- arrastrar con el dedo o con el ratón (26/11, como en Android y en el PC): pulsa en una de tus piezas, llévala (se
// ven sus casillas) y suéltala en una de ellas; si no, vuelve. Montando: cualquier pieza, y soltarla fuera la quita.

function dragStart(sq) {
  if (sq < 0 || !onScreen()) return false;
  if (S.settingUp) {
    if (!S.editBoard) S.editBoard = S.partida.pos.b.slice();
    if (S.editBoard[sq] === '.') return false;
    clearSel();
    return true;
  }
  const b = S.partida.pos.b;
  if (!userMayMove() || b[sq] === '.' || isWhite(b[sq]) !== S.humanWhite) return false;
  selectSquare(sq);
  return true;
}

function drop(from, to) {
  if (S.settingUp) {
    const e = S.editBoard;
    if (to < 0) e[from] = '.';
    else if (to !== from) { e[to] = e[from]; e[from] = '.'; }
    clearSel();
    scheduleRender();
    return;
  }
  if (to < 0 || to === from || !userMayMove() || !screenMove(from, to)) { clearSel(); scheduleRender(); }
}

// ---- partidas: las terminadas se guardan en este navegador; "Enviar partida" las manda (menú de compartir)

function pgnOf(partida, res) {
  const me = 'Tú', her = 'Maia ' + S.level;
  return partida.pgn(S.humanWhite ? me : her, S.humanWhite ? her : me, res);
}
function gameName(extra) {
  const d = new Date(), z = n => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + '-' + z(d.getMinutes()) +
    ' - Maia ' + S.level + ' - ' + (S.humanWhite ? 'blancas' : 'negras') + extra + '.pgn';
}
function describeGame(name, res, white) {
  const m = /(\d{4})-(\d\d)-(\d\d) (\d\d)-(\d\d) - Maia (\d+) - (blancas|negras)/.exec(name);
  if (!m) return name;
  const youWhite = m[7] === 'blancas';
  const how = res === '1-0' ? (youWhite ? ' · ganaste' : ' · ganó Maia') : res === '0-1' ? (youWhite ? ' · ganó Maia' : ' · ganaste') : res === '1/2-1/2' ? ' · tablas' : ' · sin terminar';
  return m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5] + ' · Maia ' + m[6] + ' · con ' + m[7] + how;
}
function saveFinished() {
  const p = S.partida;
  if (p.moves.length < 2) return;
  const list = load('maia-web-partidas', []);
  const name = gameName('');
  list.unshift({ name, res: S.result, pgn: pgnOf(p, S.result) });
  store('maia-web-partidas', list.slice(0, 60));
  log('Partida guardada en este navegador. Para mandarla (correo, WhatsApp...): «Enviar partida», encima de la lista de jugadas.');
}
async function shareGame(name, text) {
  try {
    const file = new File([text], name, { type: 'application/x-chess-pgn' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    if (navigator.share) { await navigator.share({ title: name, text }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); log('PGN copiado al portapapeles.'); }
  catch (e) { log('No se pudo enviar ni copiar la partida.'); }
}
function sendGame() {
  const items = [];
  if (S.partida.moves.length && !S.over) items.push({ label: 'Esta partida (sin terminar)', fn: () => shareGame(gameName(' (sin terminar)'), pgnOf(S.partida, '*')) });
  for (const g of load('maia-web-partidas', [])) items.push({ label: describeGame(g.name, g.res), fn: () => shareGame(g.name, g.pgn) });
  if (!items.length) {
    dialog('Enviar partida', '<p>Todavía no hay ninguna partida para enviar. Cada partida se guarda al terminar (mate, tablas, rendirse...) y la que estás jugando sale en cuanto tenga una jugada.</p>', [{ label: 'Vale', primary: true }]);
    return;
  }
  dialog('¿Qué partida quieres enviar?', '', [{ label: 'Cancelar' }], items);
}

function dialog(title, html, acts, items) {
  $('dlgTitle').textContent = title;
  const body = $('dlgBody');
  body.innerHTML = html || '';
  const close = () => { $('dialog').style.display = 'none'; };
  for (const it of items || []) {
    const b = document.createElement('button');
    b.className = 'item';
    b.textContent = it.label;
    b.onclick = () => { close(); it.fn(); };
    body.appendChild(b);
  }
  const a = $('dlgActs');
  a.innerHTML = '';
  for (const it of acts || []) {
    const b = document.createElement('button');
    b.textContent = it.label;
    if (it.primary) { b.style.background = '#5B3A24'; b.style.color = '#fff'; }
    b.onclick = () => { close(); if (it.fn) it.fn(); };
    a.appendChild(b);
  }
  $('dialog').style.display = 'flex';
}

// ---- la pantalla

const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 };
function material(b) {
  let w = 0, k = 0;
  for (const c of b) { const v = VALUES[c.toLowerCase()] || 0; if (c !== '.' && isWhite(c)) w += v; else k += v; }
  return [w, k];
}

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

function render() {
  const p = S.partida, pos = p.pos, fen = pos.fen();
  // «Atrás»: la posición a la que se vuelve, en la pantalla en el acto (el Chessnut se coloca igual)
  const backTo = S.undo ? p.positions[S.undo.k].b : null;
  const editing = S.settingUp && onScreen() && S.editBoard;    // montando en la pantalla
  const ri = reviewIndex();                                     // una jugada de la lista que se está mirando (27/11)
  const viewed = ri >= 0 ? p.positions[ri + 1].b : null;
  const shown = backTo || viewed || (editing ? S.editBoard : connected() && S.physical ? S.physical : pos.b);
  // la última jugada con su nota (volviendo atrás: la última que queda; mirando una: esa)
  const graded = analysisOn();
  let last = null;
  const li = backTo ? S.undo.k - 1 : viewed ? ri : p.moves.length - 1;
  if (li >= 0) {
    const lm = p.moves[li];
    last = { from: sqIndex(lm.uci.slice(0, 2)), to: sqIndex(lm.uci.slice(2, 4)), label: graded ? revision.grade(p, li).label : '' };
  }
  // análisis
  const v = S.view && S.view.fen === fen ? S.view : null;
  const legal = pos.legal();
  let cands = null, candHtml = [], depth = '';
  if (!legal.length) {
    const mate = pos.inCheck();
    S.lastShare = mate ? (pos.white ? 0 : 1) : 0.5;
    S.lastScore = mate ? (pos.white ? '0-1' : '1-0') : '½';
    candHtml = [mate ? 'Jaque mate — ganan ' + (pos.white ? 'negras' : 'blancas') : 'Rey ahogado — tablas'];
    depth = motor.name;
  } else if (!v) {
    candHtml = ['…'];
    depth = analysisOn() ? 'pensando…' : '';
  } else {
    depth = motor.name + '  ·  prof. ' + v.depth + (v.thinking ? '' : '  ✓');
    if (v.lines[0]) { S.lastShare = Motor.whiteShare(v.lines[0]); S.lastScore = Motor.scoreText(v.lines[0], false); }
    cands = [];
    for (let i = 0; i < S.candCount; i++) {
      const l = v.lines[i];
      if (!l || !l.pv.length) { candHtml.push(i === 0 ? '…' : ''); continue; }
      const m = legal.find(x => x.uci === l.pv[0]);
      if (!m) { candHtml.push(''); continue; }
      let rest = '', q = pos.play(m);
      for (let j = 1; j < Math.min(l.pv.length, 5); j++) {
        const mm = q.legal().find(x => x.uci === l.pv[j]);
        if (!mm) break;
        rest += (j > 1 ? ' ' : '') + q.san(mm);
        q = q.play(mm);
      }
      candHtml.push((i + 1) + '.  <b>' + esc(pos.san(m, legal)) + '</b>   <span class="sc">' + Motor.scoreText(l, true) + '</span>' + (rest ? '     <span class="pv">' + esc(rest) + '</span>' : ''));
      cands.push([m.from, m.to]);
    }
  }
  // tablero y barra
  geo = drawBoard($('board'), {
    board: shown, flipped: S.flipped, lit: viewed ? null : undoLit() || S.illegal || maiaLit(),
    move: viewed ? null : backTo ? S.undo.arrow : S.maiaMove ? [S.maiaMove.m.from, S.maiaMove.m.to] : S.fixArrow,
    cands: S.candCount > 0 && !backTo && !editing && !viewed && !S.fixArrow ? cands : null, last: editing ? null : last,
    sel: viewed ? -1 : S.sel, targets: viewed ? null : S.targets, drag: viewed ? null : S.drag,
  });
  $('bar').style.display = S.barOn ? '' : 'none';
  bar.set(S.lastShare, S.lastScore, S.flipped, S.barOn && (!!v || !legal.length));
  // apertura
  const o = Aperturas.describe(p);
  const WP = '♙︎', BP = '♟︎';                    // (sin el selector, el iPhone los pinta como emoji)
  $('opening').innerHTML = o.eco ? '<b>' + o.eco + '</b>' + (o.white ? '  ·  ' + WP + ' ' + esc(o.white) : '') + (o.black ? (o.white ? '\n' + BP + ' ' : '  ·  ' + BP + ' ') + esc(o.black) : '') : '';
  // candidatas bajo el tablero, en dos columnas (con 5: tres a la izquierda y dos a la derecha)
  const cd = $('cands');
  const n = S.candCount;
  cd.style.display = n > 0 ? '' : 'none';
  cd.style.gridTemplateRows = 'repeat(' + Math.max(1, Math.ceil(n / 2)) + ', auto)';
  cd.style.gridAutoFlow = 'column';
  let ch = '';
  for (let i = 0; i < Math.max(n, candHtml.length && n ? 1 : 0); i++) ch += '<div>' + (candHtml[i] || '&nbsp;') + '</div>';
  cd.innerHTML = ch;
  // reloj
  drawClock($('clock'), clock.snapshot(), 'BLANCAS · ' + (S.humanWhite ? 'tú' : 'Maia'), 'NEGRAS · ' + (S.humanWhite ? 'Maia' : 'tú'));
  $('clock').style.display = clock.on ? '' : 'none';
  // estado
  const dot = c => '<span class="dot" style="background:' + c + '"></span>';
  let st;
  if (!Chessnut.available()) st = dot(RED) + 'Chessnut: este navegador no tiene Bluetooth (en el iPhone, abre la página con Bluefy)';
  else if (connected()) st = dot(GREEN) + 'Chessnut: ' + esc(nut.statusText || 'Conectado') + (nut.battery >= 0 ? batteryIcon(nut.battery, nut.charging) + nut.battery + ' %' : '');
  else st = dot(nut.device ? AMBER : GREY) + 'Chessnut: ' + (nut.device ? 'desconectado (pulsa «Conectar Chessnut»)' : 'sin conectar (pulsa «Conectar Chessnut»)');
  st += '<br>' + (S.maiaState === 'ready' ? dot(GREEN) + 'Maia ' + S.level + ' (juega como la gente de ese nivel)'
    : S.maiaState === 'error' ? dot(RED) + 'Maia no arranca: ' + esc(S.maiaError) : dot(AMBER) + 'Cargando Maia ' + S.level + '...');
  $('status').innerHTML = st;
  const info = $('info');
  const rm = viewed ? p.moves[ri] : null;
  info.textContent = rm ? 'Viendo ' + (rm.white ? rm.number + '. ' : rm.number + '... ') + rm.san + ': toca otra vez la jugada, o el tablero, para volver a la partida'
                   : S.over && !S.info.startsWith('Partida terminada') ? 'Partida terminada: ' + S.over
                   : onScreen() && S.info === 'Te toca' ? 'Te toca: toca una pieza y luego su casilla (o arrástrala)'
                   : onScreen() && S.settingUp ? 'Montando posición: elige una pieza abajo y toca las casillas (otra vez: se quita; sin elegir, toca una pieza y luego dónde va, o arrástrala); luego pulsa quién empieza'
                   : S.info || ' ';
  info.className = S.infoClass;
  renderPalette();
  // material
  const mt = $('material');
  mt.style.display = S.materialOn ? '' : 'none';
  if (S.materialOn) {
    const [w, k] = material(normalize(shown)), d = w - k;
    mt.innerHTML = '<span class="k">Material:</span>  <b>' + (d === 0 ? 'igualado' : d > 0 ? '+' + d + ' blancas' : '+' + (-d) + ' negras') + '</b>     <span class="r">blancas ' + w + '  ·  negras ' + k + '</span>';
  }
  // turno y profundidad
  $('analysisRow').style.display = analysisOn() ? '' : 'none';
  const tn = $('turn');
  tn.textContent = 'Juegan ' + (pos.white ? 'blancas' : 'negras') + '  ⇄';
  tn.style.visibility = S.settingUp ? 'hidden' : 'visible';
  $('depth').textContent = depth;
  // botones
  const w2 = wide(), undoing = !!S.undo, setting = S.settingUp;
  $('btnBack').textContent = setting ? (w2 ? 'Empiezan blancas' : 'Blancas') : undoing ? '◀ Más atrás' : '◀ Atrás';
  $('btnSetup').textContent = setting ? (w2 ? 'Empiezan negras' : 'Negras') : w2 ? 'Montar posición' : 'Montar';
  $('btnDraw').textContent = setting || undoing ? 'Cancelar' : w2 ? 'Ofrecer tablas' : 'Tablas';
  $('btnResign').disabled = setting;
  $('btnForce').disabled = setting || undoing;
  $('btnConnect').textContent = connected() ? 'Chessnut conectado' : nut.device ? 'Reconectar Chessnut' : 'Conectar Chessnut';
  $('btnConnect').disabled = connected();
  renderMoves(graded);
}

let shownMovesKey = '';
function renderMoves(graded) {
  const p = S.partida;
  const grades = graded ? p.moves.map((_, i) => revision.grade(p, i)) : [];
  const gone = S.undo ? S.undo.k : -1;            // «Atrás»: las jugadas que se deshacen, tachadas
  const key = p.moves.map(m => m.uci).join(' ') + '|' + grades.map(g => g.label + g.better).join(',') + '|' + graded + '|' + S.over + '|' + gone + '|' + S.review;
  if (key === shownMovesKey) return;
  shownMovesKey = key;
  const box = $('moves');
  if (!p.moves.length) {
    box.innerHTML = '<div class="empty">' + (graded ? 'Aquí saldrán las jugadas, con su calificación.' : 'Aquí saldrán las jugadas (para calificarlas, marca la barra o las candidatas).') + '</div>';
    return;
  }
  let h = '', open = false;
  p.moves.forEach((m, i) => {
    const isGone = gone >= 0 && i >= gone;
    const lastOne = gone >= 0 ? i === gone - 1 : i === p.moves.length - 1;
    let cell = '<span class="san">' + esc(m.san) + '</span>';
    const g = isGone ? null : grades[i];
    if (g && g.label) {
      cell += '   <span class="g" style="color:' + GRADE[g.label].color + '">' + GRADE[g.label].sym + ' ' + gradeText(g.label) + '</span>';
      if (g.better) cell += '<span class="bt">  (mejor ' + esc(g.better) + ')</span>';
    } else if (lastOne && graded) cell += '<span class="bt">   …</span>';
    const viewed = i === S.review;
    const td = '<div class="cell' + (viewed ? ' viewed' : lastOne ? ' last' : '') + (isGone ? ' gone' : '') + '" data-i="' + i + '">' + cell + '</div>';
    if (m.white || !open) {
      if (open) h += '</div>';
      h += '<div class="mrow"><div class="num">' + m.number + '.</div>' + (m.white ? td : '<div class="cell">…</div>' + td);
      open = true;
      if (!m.white) { h += '</div>'; open = false; }
    } else { h += td + '</div>'; open = false; }
  });
  // el resultado tras la última jugada (27/11, pedido por el usuario): «16. Db2#  1-0»; tras una de negras, en otra fila
  const res = S.over && S.result && S.result !== '*' && gone < 0 ? (S.result === '1/2-1/2' ? '½-½' : S.result) : '';
  const resCell = '<div class="cell result"><b>' + res + '</b></div>';
  if (open) h += (res ? resCell : '<div class="cell"></div>') + '</div>';
  else if (res) h += '<div class="mrow"><div class="num"></div>' + resCell + '<div class="cell"></div></div>';
  if (S.over) h += '<div class="empty"><b>' + esc(S.over) + '</b></div>';
  box.innerHTML = h;
  if (S.review < 0) box.scrollTop = box.scrollHeight;
}

// ---- una jugada de la lista (27/11, pedido por el usuario: "cuando pulse la lista de jugadas en una jugada concreta,
// las piezas de la pantalla se coloquen en la posición ... de esa jugada", de blancas o de negras): su posición en el
// tablero de la pantalla, la jugada marcada allí y en azul en la lista. Se vuelve a la partida tocándola otra vez,
// tocando el tablero o al seguir la partida. Solo la pantalla: el Chessnut y la partida no se tocan.

const reviewKeyNow = () => S.partida.moves.length + '|' + (S.physical ? S.physical.join('') : '');

/** La jugada que se está mirando, si sigue valiendo (si no, de vuelta a la partida: -1). */
function reviewIndex() {
  if (S.review < 0) return -1;
  if (S.review >= S.partida.moves.length || S.undo || S.settingUp || reviewKeyNow() !== S.reviewKey) S.review = -1;
  return S.review;
}

$('moves').addEventListener('click', e => {
  const c = e.target.closest('.cell[data-i]');
  if (!c) return;
  const i = +c.dataset.i;
  S.review = S.review === i ? -1 : i;
  S.reviewKey = reviewKeyNow();
  clearSel();
  scheduleRender();
});

function endReview() { if (S.review >= 0) { S.review = -1; scheduleRender(); } }

/** El tamaño del tablero: a todo lo ancho en el móvil, dejando sitio al panel debajo. */
function layout() {
  const big = window.matchMedia('(min-width: 820px) and (min-aspect-ratio: 1/1)').matches;
  const vh = window.innerHeight, vw = document.documentElement.clientWidth;
  const head = document.querySelector('header').offsetHeight;
  const candsH = S.candCount > 0 ? Math.ceil(S.candCount / 2) * 21 : 0;
  const barW = S.barOn ? 52 : 0;                          // la barra, 46 px (24/11: más ancha para leer la cifra)
  let bs = big ? Math.min(vh - head - 30 - 34 - candsH, vw * 0.6 - barW - 20) : Math.min(vw - 16 - barW, vh - head - 14 - 34 - candsH - 150);
  bs = Math.max(220, Math.floor(bs));
  document.documentElement.style.setProperty('--bs', bs + 'px');
  $('bar').style.height = bs + 'px';
  $('bar').style.width = '46px';
  scheduleRender();
  setTimeout(() => { bar.draw(); scheduleRender(); }, 50);
}

// ---- los mandos

function longPress(el, onTap, onLong) {
  let timer = null, fired = false, start = null;
  el.addEventListener('pointerdown', e => {
    fired = false; start = e;
    timer = setTimeout(() => { fired = true; timer = null; onLong(e); }, 650);
  });
  const end = e => {
    if (timer) { clearTimeout(timer); timer = null; if (!fired && start) onTap(start); }
    start = null;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', () => { if (timer) clearTimeout(timer); timer = null; start = null; });
  el.addEventListener('contextmenu', e => e.preventDefault());
}

// el tablero: un toque (casilla), arrastrar una pieza (26/11) o dejar el dedo encima (girar el tablero)
(function boardPointer() {
  const el = $('board');
  let start = null, timer = null, longFired = false, dragging = false, from = -1;
  const pt = e => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  el.addEventListener('pointerdown', e => {
    if (S.review >= 0) { endReview(); start = null; return; }     // mirando una jugada de la lista: de vuelta a la partida
    const p = pt(e);
    start = p; longFired = false; dragging = false;
    from = geo ? squareAt(geo, p.x, p.y) : -1;
    try { el.setPointerCapture(e.pointerId); } catch (_) { }
    timer = setTimeout(() => { timer = null; if (!dragging) { longFired = true; flip(); } }, 650);
  });
  el.addEventListener('pointermove', e => {
    if (!start) return;
    const p = pt(e);
    if (!dragging) {
      if (Math.hypot(p.x - start.x, p.y - start.y) < 8) return;
      if (timer) { clearTimeout(timer); timer = null; }
      if (longFired || !dragStart(from)) { start = null; return; }
      dragging = true;
    }
    S.drag = { from, x: p.x, y: p.y, touch: e.pointerType === 'touch' };
    scheduleRender();
  });
  el.addEventListener('pointerup', e => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!start) return;
    const p = pt(e);
    if (dragging) { S.drag = null; drop(from, geo ? squareAt(geo, p.x, p.y) : -1); }
    else if (!longFired && geo) onSquare(squareAt(geo, start.x, start.y));
    start = null; dragging = false;
  });
  el.addEventListener('pointercancel', () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (dragging) { S.drag = null; clearSel(); scheduleRender(); }
    start = null; dragging = false;
  });
  el.addEventListener('contextmenu', e => e.preventDefault());
})();
longPress($('clock'), () => { clock.togglePause(); scheduleRender(); }, () => { clock.newGame(); updateClock(); log('Reloj a cero: empieza con la primera jugada.'); scheduleRender(); });

const fill = (sel, items, val) => { for (const [v, t] of items) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); } sel.value = val; };
fill($('level'), LEVELS.map(l => [l, l]), S.level);
fill($('pause'), Array.from({ length: 11 }, (_, i) => [i, i + ' s']), S.pause);
fill($('candCount'), [0, 1, 2, 3, 4, 5].map(i => [i, i]), S.candCount);
fill($('clockSel'), CLOCKS.map(c => [c, clockName(c)]), S.clockCtl);
$('color').value = S.humanWhite ? 'w' : 'b';
$('variety').checked = S.variety;
$('chkBar').checked = S.barOn;
$('chkMaterial').checked = S.materialOn;

$('level').onchange = () => {
  S.level = +$('level').value; savePrefs();
  log('Nivel de Maia: ' + S.level + '.');
  loadMaia().then(() => { if (S.thinking) { cancelThinking(); } maiaTurn(); });
};
$('color').onchange = () => {
  S.humanWhite = $('color').value === 'w'; S.flipped = !S.humanWhite; savePrefs();
  cancelThinking(); S.maiaMove = null;
  log(S.humanWhite ? 'Juegas con blancas: Maia lleva las negras.' : 'Juegas con negras: Maia lleva las blancas.');
  afterChange();
};
$('pause').onchange = () => { S.pause = +$('pause').value; savePrefs(); };
$('variety').onchange = () => { S.variety = $('variety').checked; savePrefs(); };
$('chkBar').onchange = () => { S.barOn = $('chkBar').checked; savePrefs(); analyze(); layout(); };
$('chkMaterial').onchange = () => { S.materialOn = $('chkMaterial').checked; savePrefs(); scheduleRender(); };
$('candCount').onchange = () => { S.candCount = +$('candCount').value; savePrefs(); analyze(); layout(); };
$('clockSel').onchange = () => { S.clockCtl = $('clockSel').value; savePrefs(); clock.setControl(S.clockCtl); updateClock(); log('Reloj: ' + clockName(S.clockCtl) + '.'); scheduleRender(); };
$('turn').onclick = toggleTurn;
$('btnBack').onclick = () => { if (S.settingUp) startFrom(true); else back(); };
$('btnSetup').onclick = () => { if (S.settingUp) startFrom(false); else startSetUp(); };
$('btnDraw').onclick = () => { if (S.settingUp) cancelSetUp(); else if (S.undo) cancelBack(); else offerDraw(); };
$('btnResign').onclick = resign;
$('btnForce').onclick = forceMaia;
$('btnNew').onclick = newGameButton;
$('btnFlip').onclick = flip;
$('send').onclick = sendGame;
$('btnConnect').onclick = async () => {
  try {
    nut.onBoard = onPhysical;
    nut.onStatus = () => scheduleRender();
    if (nut.device) await nut.reconnect(); else await nut.connect();
  } catch (e) {
    if (e.name !== 'NotFoundError') { log('Chessnut: ' + e.message); setInfo('No se pudo conectar: ' + e.message, 'amber'); }
    nut.status(nut.device ? 'Desconectado' : 'sin conectar');
  }
  scheduleRender();
};
window.addEventListener('resize', layout);
setInterval(() => { const c = clock.snapshot(); if (c.running >= 0 && !c.paused) drawClock($('clock'), c, 'BLANCAS · ' + (S.humanWhite ? 'tú' : 'Maia'), 'NEGRAS · ' + (S.humanWhite ? 'Maia' : 'tú')); }, 250);

async function loadMaia() {
  const lv = S.level;
  S.maiaState = 'loading';
  scheduleRender();
  try {
    const t0 = performance.now();
    await maia.session(lv);
    if (lv !== S.level) return;
    S.maiaState = 'ready';
    log('Maia ' + lv + ' lista (' + Math.round(performance.now() - t0) + ' ms).');
  } catch (e) {
    S.maiaState = 'error';
    S.maiaError = e.message;
    log('ERROR: Maia no arranca: ' + e.message);
  }
  scheduleRender();
}

// ---- arranque
log('Ajedrez contra Maia (web). Bluetooth web: ' + (Chessnut.available() ? 'sí' : 'no (en el iPhone, abre esta página con Bluefy)') + '.');
log('Navegador: ' + navigator.userAgent + ' · pantalla ' + screen.width + 'x' + screen.height);
clock.setControl(S.clockCtl);
restoreGame();
setInfo(S.over ? 'Partida terminada: ' + S.over : S.partida.pos.white === S.humanWhite ? 'Te toca' : 'Maia piensa...');
layout();
motor.start();
Aperturas.load('recursos/aperturas.tsv.gz').then(() => scheduleRender());
updateClock();
analyze();
loadMaia().then(() => maiaTurn());
