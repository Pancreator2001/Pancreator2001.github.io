// Ajedrez contra Maia en el navegador: la partida, el Chessnut y la pantalla. Funciona como la app de Android:
// la jugada de Maia se enciende en los LEDs y se espera a que la hagas en el tablero; las tomas atrás se hacen en
// el tablero; "Montar posición" para jugar una posición eligiendo quién empieza; la pieza que coges se enciende.
// Sin tablero, las jugadas se hacen tocando la pantalla (y la de Maia se hace sola).
'use strict';

ort.env.wasm.numThreads = 1;
const $ = id => document.getElementById(id);
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const START = Pos.fromFen(START_FEN);
const LEVELS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900];

const S = {
  partida: new Partida(),
  humanWhite: true, level: 1100, variety: true,
  maiaMove: null, thinking: false, thinkId: 0,
  settingUp: false, over: null,
  physical: null, sel: -1,
  liftRef: null, lifted: new Array(64).fill(false),
  info: '', infoClass: '',
};

const maia = new Maia('redes/');
const nut = new Chessnut(log);

// ---- ajustes guardados en este navegador
try {
  const p = JSON.parse(localStorage.getItem('maia-web') || '{}');
  if (LEVELS.includes(p.level)) S.level = p.level;
  if (typeof p.humanWhite === 'boolean') S.humanWhite = p.humanWhite;
  if (typeof p.variety === 'boolean') S.variety = p.variety;
} catch (e) { }
function savePrefs() {
  try { localStorage.setItem('maia-web', JSON.stringify({ level: S.level, humanWhite: S.humanWhite, variety: S.variety })); } catch (e) { }
}

function log(s) {
  const d = new Date(), z = n => (n < 10 ? '0' : '') + n;
  const el = $('log');
  el.textContent += z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds()) + '  ' + s + '\n';
  const lines = el.textContent.split('\n');
  if (lines.length > 200) el.textContent = lines.slice(-200).join('\n');
  el.scrollTop = el.scrollHeight;
  // una copia al PC que sirve la página (solo en las pruebas: el servidor del PC o su túnel; nunca en GitHub)
  if (location.hostname === 'localhost' || location.hostname.endsWith('.trycloudflare.com')) fetch('registro', { method: 'POST', body: s, keepalive: true }).catch(() => { });
}
window.addEventListener('error', e => log('ERROR JS: ' + e.message + ' (' + (e.filename || '').split('/').pop() + ':' + e.lineno + ')'));
window.addEventListener('unhandledrejection', e => log('ERROR JS (promesa): ' + (e.reason && e.reason.message || e.reason)));

function setInfo(s, cls = '') { S.info = s; S.infoClass = cls; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const same = (a, b) => a.join('') === b.join('');
const connected = () => !!nut.write;

/** Un peón en la última fila cuenta como dama (se corona con el propio peón, como en el Puente). */
function normalize(b) {
  const n = b.slice();
  for (let f = 0; f < 8; f++) {
    if (n[56 + f] === 'P') n[56 + f] = 'Q';
    if (n[f] === 'p') n[f] = 'q';
  }
  return n;
}

function cancelThinking() { S.thinkId++; S.thinking = false; }

// ---- las luces: la jugada de Maia; si no, la pieza que tienes en la mano

function maiaLit() {
  if (!S.maiaMove) return null;
  const lit = new Array(64).fill(false), m = S.maiaMove.m, b = S.partida.pos.b;
  lit[m.from] = lit[m.to] = true;
  if (b[m.from].toLowerCase() === 'k' && Math.abs(m.to - m.from) === 2) {
    if (m.to > m.from) lit[m.from + 3] = lit[m.from + 1] = true;
    else lit[m.from - 4] = lit[m.from - 1] = true;
  }
  return lit;
}

function refreshLeds() {
  if (!connected()) return;
  nut.leds(maiaLit() || S.lifted);
}

function updateLift(b) {
  const lit = new Array(64).fill(false);
  let only = S.liftRef !== null;
  for (let i = 0; i < 64 && only; i++) {
    if (b[i] === S.liftRef[i]) continue;
    if (b[i] === '.' && S.liftRef[i] !== '.') lit[i] = true;
    else only = false;
  }
  if (!only) { S.liftRef = b.slice(); lit.fill(false); }
  S.lifted = lit;
}

// ---- la partida

function checkEnd() {
  const e = S.partida.end();
  if (e) {
    S.over = e;
    S.maiaMove = null;
    setInfo('Partida terminada: ' + e);
    log('Fin de la partida: ' + e + '. Para jugar otra, coloca la posición inicial.');
  }
  return e;
}

function userMove(m) {
  cancelThinking();
  S.partida.play(m);
  S.sel = -1;
  const mv = S.partida.moves[S.partida.moves.length - 1];
  log('Tú: ' + (mv.white ? mv.number + '. ' : mv.number + '... ') + mv.san);
  if (!checkEnd()) maiaTurn();
  refreshLeds();
  render();
}

function makeMaia() {
  const mm = S.maiaMove;
  if (!mm) return;
  S.maiaMove = null;
  S.partida.play(mm.m);
  if (!checkEnd()) setInfo('Te toca');
  refreshLeds();
  render();
}

function takeBack(k) {
  cancelThinking();
  const p = S.partida;
  const n = p.positions.length - 1 - k;
  while (p.positions.length - 1 > k) p.undo();
  S.maiaMove = null;
  S.over = null;
  log('Deshecha' + (n > 1 ? 's ' + n + ' jugadas' : ' una jugada') + ' en el tablero.');
  refreshLeds();
  maiaTurn();
  render();
}

function newGame() {
  cancelThinking();
  S.partida = new Partida();
  S.over = null;
  S.maiaMove = null;
  log('Posición inicial: partida nueva contra Maia ' + S.level + '.');
  refreshLeds();
  maiaTurn();
  render();
}

async function maiaTurn() {
  const p = S.partida;
  if (S.over || S.settingUp || S.maiaMove || S.thinking) return;
  if (p.pos.white === S.humanWhite) { setInfo('Te toca'); return; }
  const id = ++S.thinkId;
  S.thinking = true;
  setInfo('Maia piensa...');
  render();
  try {
    const pick = await maia.move(p, S.variety, S.level);
    await sleep(900 + Math.random() * 900);           // "piensa" un momento (contesta al instante)
    if (id !== S.thinkId || p !== S.partida) return;  // la partida cambió entretanto
    S.thinking = false;
    if (!pick) return;
    const pos = p.pos, san = pos.san(pick.m);
    const text = (pos.white ? pos.full + '. ' : pos.full + '... ') + san;
    S.maiaMove = { m: pick.m, after: pos.play(pick.m), san, text, p: pick.p };
    log('Maia juega ' + text + '  (la gente de su nivel la juega el ' + Math.round(pick.p) + ' % de las veces; ' + maia.lastMs.toFixed(0) + ' ms)');
    if (connected() && S.physical) {
      setInfo('Maia juega ' + text + ': hazla en el tablero');
      refreshLeds();
    } else {
      makeMaia();
    }
  } catch (e) {
    S.thinking = false;
    setInfo('Maia no puede jugar: ' + e.message, 'bad');
    log('ERROR de Maia: ' + e.message);
  }
  render();
}

/** Una posición nueva y quieta en el tablero. */
function onPhysical(b) {
  S.physical = b;
  updateLift(b);
  if (S.settingUp) { refreshLeds(); render(); return; }
  const nb = normalize(b), p = S.partida;
  if (same(nb, START.b) && !(p.fromStart && p.moves.length === 0 && !S.over)) { newGame(); return; }
  if (S.maiaMove && same(nb, S.maiaMove.after.b)) { makeMaia(); return; }
  if (same(nb, p.pos.b)) {
    if (S.maiaMove) setInfo('Maia juega ' + S.maiaMove.text + ': hazla en el tablero');
    else if (!S.over && !S.thinking) setInfo(p.pos.white === S.humanWhite ? 'Te toca' : 'Maia piensa...');
    refreshLeds(); render(); return;
  }
  for (let k = p.positions.length - 2; k >= Math.max(0, p.positions.length - 5); k--)
    if (same(nb, p.positions[k].b)) { takeBack(k); return; }
  if (!S.over) {
    const m = p.pos.legal().find(x => same(p.pos.play(x).b, nb));
    if (m && !S.maiaMove && p.pos.white === S.humanWhite) { userMove(m); return; }
    if (m && S.maiaMove) setInfo('Esa no es la jugada de Maia: has hecho ' + p.pos.san(m) + '. Deshazla y haz ' + S.maiaMove.text, 'warn');
    else if (!S.lifted.some(x => x)) setInfo(S.maiaMove ? 'Haz la jugada de Maia: ' + S.maiaMove.text : 'El tablero no coincide con la partida (coloca la posición inicial o usa «Montar posición»)', 'warn');
  }
  refreshLeds();
  render();
}

// ---- Montar posición

function startSetUp() {
  cancelThinking();
  S.settingUp = true;
  S.maiaMove = null;
  setInfo('Montando posición: coloca las piezas y pulsa quién empieza');
  log('Montar posición: coloca las piezas como quieras (Maia espera) y luego pulsa quién empieza.');
  refreshLeds();
  render();
}

function startFrom(white) {
  const b = S.physical ? normalize(S.physical) : S.partida.pos.b.slice();
  const pos = new Pos();
  pos.b = b.slice();
  pos.white = white;
  pos.castle = { K: true, Q: true, k: true, q: true };
  pos.fixCastling();
  const kings = b.filter(c => c === 'K').length + ' ' + b.filter(c => c === 'k').length;
  if (kings !== '1 1') { log('Esa posición no vale: tiene que haber un rey blanco y uno negro.'); setInfo('Esa posición no vale: falta un rey (o sobra)', 'warn'); render(); return; }
  if (pos.inCheck(!white)) { log('Esa posición no vale: el rey ' + (white ? 'negro' : 'blanco') + ' está en jaque y no le toca mover.'); setInfo('Esa posición no vale: el rey que no mueve está en jaque', 'warn'); render(); return; }
  if (!pos.legal().length) { log('En esa posición las ' + (white ? 'blancas' : 'negras') + ' no tienen ninguna jugada.'); setInfo('En esa posición no hay ninguna jugada', 'warn'); render(); return; }
  S.settingUp = false;
  S.partida = new Partida(pos);
  S.over = null;
  S.maiaMove = null;
  log('Posición montada: empiezan las ' + (white ? 'blancas' : 'negras') + (white === S.humanWhite ? ' (tú).' : ' (Maia).'));
  maiaTurn();
  render();
}

function cancelSetUp() {
  S.settingUp = false;
  log('Montar posición cancelado.');
  if (S.physical) onPhysical(S.physical); else { maiaTurn(); render(); }
}

// ---- tocar la pantalla (sin tablero)

function onSquare(sq) {
  if (connected() && S.physical) return;                  // con el Chessnut, las jugadas se hacen en el tablero
  const p = S.partida;
  if (S.settingUp || S.over || p.pos.white !== S.humanWhite || S.thinking || S.maiaMove) return;
  const mine = c => c !== '.' && isWhite(c) === S.humanWhite;
  if (S.sel >= 0) {
    const c = p.pos.legal().filter(m => m.from === S.sel && m.to === sq);
    if (c.length) { userMove(c.find(m => !m.promo || m.promo === 'q')); return; }
  }
  S.sel = mine(p.pos.b[sq]) && S.sel !== sq ? sq : -1;
  render();
}

// ---- enviar la partida (menú de compartir del iPhone; si no, se copia)

async function sendGame() {
  const p = S.partida;
  if (!p.moves.length) { setInfo('Todavía no hay jugadas que enviar', 'warn'); render(); return; }
  const res = S.over ? (S.over.startsWith('Jaque mate') ? (p.moves[p.moves.length - 1].white ? '1-0' : '0-1') : '1/2-1/2') : '*';
  const me = 'Tú', her = 'Maia ' + S.level;
  const text = p.pgn(S.humanWhite ? me : her, S.humanWhite ? her : me, res);
  const d = new Date(), z = n => (n < 10 ? '0' : '') + n;
  const name = d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + '-' + z(d.getMinutes()) +
    ' - Maia ' + S.level + ' - ' + (S.humanWhite ? 'blancas' : 'negras') + '.pgn';
  try {
    const file = new File([text], name, { type: 'application/x-chess-pgn' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    if (navigator.share) { await navigator.share({ title: name, text }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); setInfo('PGN copiado al portapapeles'); }
  catch (e) { setInfo('No se pudo enviar ni copiar la partida', 'warn'); }
  render();
}

// ---- la pantalla

function render() {
  const p = S.partida;
  const shown = connected() && S.physical ? S.physical : p.pos.b;
  const last = p.moves.length ? p.moves[p.moves.length - 1].uci : '';
  const lastSq = last ? [sqIndex(last.slice(0, 2)), sqIndex(last.slice(2, 4))] : [];
  const maiaSq = S.maiaMove ? [S.maiaMove.m.from, S.maiaMove.m.to] : [];
  const board = $('board');
  board.innerHTML = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const r = S.humanWhite ? 7 - row : row, f = S.humanWhite ? col : 7 - col, s = r * 8 + f;
      const d = document.createElement('div');
      d.className = 'sq ' + ((r + f) % 2 ? 'l' : 'd') +
        (maiaSq.includes(s) ? ' maia' : lastSq.includes(s) ? ' last' : '') +
        (S.sel === s ? ' sel' : '') + (S.lifted[s] && !S.maiaMove ? ' lift' : '');
      const c = shown[s];
      if (c !== '.') {
        const sp = document.createElement('span');
        sp.className = 'pc ' + (isWhite(c) ? 'w' : 'b');
        sp.textContent = GLYPH[c.toLowerCase()] + '︎';
        d.appendChild(sp);
      }
      if (row === 7) { const k = document.createElement('span'); k.className = 'coord f'; k.textContent = FILES[f]; d.appendChild(k); }
      if (col === 0) { const k = document.createElement('span'); k.className = 'coord r'; k.textContent = r + 1; d.appendChild(k); }
      d.addEventListener('click', () => onSquare(s));
      board.appendChild(d);
    }
  }
  // estado
  const nutOn = connected();
  $('nutDot').className = 'dot ' + (nutOn ? 'on' : nut.device ? 'off' : '');
  $('nutText').textContent = 'Chessnut: ' + (nut.statusText || 'sin conectar') + (nutOn && nut.battery >= 0 ? ' · batería ' + nut.battery + ' %' + (nut.charging ? ' (cargando)' : '') : '');
  $('btnConnect').textContent = nutOn ? 'Chessnut conectado' : nut.device ? 'Volver a conectar' : 'Conectar Chessnut';
  $('btnConnect').disabled = nutOn;
  const info = $('info');
  info.textContent = S.info;
  info.className = S.infoClass;
  // botones
  $('btnSetup').hidden = S.settingUp;
  $('btnWhite').hidden = $('btnBlack').hidden = $('btnCancel').hidden = !S.settingUp;
  $('btnSend').hidden = S.settingUp;
  // jugadas
  const mv = $('moves');
  if (!p.moves.length) mv.innerHTML = '<span class="muted">' + (p.fromStart ? 'Coloca la posición inicial en el tablero (o toca las piezas en la pantalla) para empezar.' : 'Posición montada: aún no hay jugadas.') + '</span>';
  else {
    let h = '';
    p.moves.forEach((m, i) => {
      if (m.white) h += (i ? '<br>' : '') + '<span class="n">' + m.number + '.</span> ' + m.san + ' ';
      else h += (i === 0 ? '<span class="n">' + m.number + '...</span> ' : '') + m.san + ' ';
    });
    if (S.over) h += '<br><b>' + S.over + '</b>';
    mv.innerHTML = h;
    mv.scrollTop = mv.scrollHeight;
  }
}

// ---- los mandos

const levelSel = $('level');
for (const l of LEVELS) { const o = document.createElement('option'); o.value = l; o.textContent = l; levelSel.appendChild(o); }
levelSel.value = S.level;
levelSel.addEventListener('change', () => {
  S.level = +levelSel.value;
  savePrefs();
  log('Nivel de Maia: ' + S.level + '.');
  loadMaia();
  if (S.thinking) { cancelThinking(); maiaTurn(); }
});
$('color').value = S.humanWhite ? 'w' : 'b';
$('color').addEventListener('change', () => {
  S.humanWhite = $('color').value === 'w';
  savePrefs();
  cancelThinking();
  S.maiaMove = null;
  log(S.humanWhite ? 'Juegas con blancas: Maia lleva las negras.' : 'Juegas con negras: Maia lleva las blancas.');
  refreshLeds();
  maiaTurn();
  render();
});
$('variety').checked = S.variety;
$('variety').addEventListener('change', () => { S.variety = $('variety').checked; savePrefs(); });
$('btnSetup').addEventListener('click', startSetUp);
$('btnWhite').addEventListener('click', () => startFrom(true));
$('btnBlack').addEventListener('click', () => startFrom(false));
$('btnCancel').addEventListener('click', cancelSetUp);
$('btnSend').addEventListener('click', sendGame);
$('btnConnect').addEventListener('click', async () => {
  try {
    nut.onBoard = onPhysical;
    nut.onStatus = () => render();
    if (nut.device) await nut.reconnect(); else await nut.connect();
  } catch (e) {
    if (e.name !== 'NotFoundError') { log('Chessnut: ' + e.message); setInfo('No se pudo conectar: ' + e.message, 'warn'); }
    nut.status(nut.device ? 'Desconectado' : 'sin conectar');
  }
  render();
});

async function loadMaia() {
  const lv = S.level;
  $('maiaDot').className = 'dot wait';
  $('maiaText').textContent = 'Cargando Maia ' + lv + '...';
  try {
    const t0 = performance.now();
    await maia.session(lv);
    if (lv !== S.level) return;
    $('maiaDot').className = 'dot on';
    $('maiaText').textContent = 'Maia ' + lv + ' (juega como la gente de ese nivel)';
    log('Maia ' + lv + ' lista (' + Math.round(performance.now() - t0) + ' ms).');
  } catch (e) {
    $('maiaDot').className = 'dot off';
    $('maiaText').textContent = 'Maia no arranca: ' + e.message;
    log('ERROR: Maia no arranca: ' + e.message);
  }
}

log('Ajedrez contra Maia (web). Bluetooth web: ' + (Chessnut.available() ? 'sí' : 'no (en el iPhone, abre esta página con Bluefy)') + '.');
log('Navegador: ' + navigator.userAgent + ' · pantalla ' + screen.width + 'x' + screen.height);
setInfo(S.humanWhite ? 'Te toca' : 'Maia piensa...');
render();
loadMaia().then(() => maiaTurn());
