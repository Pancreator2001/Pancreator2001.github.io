// El Chessnut Air por Bluetooth web (Chrome/Edge en el PC, Bluefy en el iPhone): el mismo protocolo que el
// Puente Chessnut para Android (Bridge.java / Board.java). Posición: notificación 0x01 0x24 + 32 bytes (dos
// casillas por byte, de la fila 8 a la 1, de h a a dentro de cada fila). LEDs: 0x0A 0x08 + 8 bytes (byte 0 = fila
// 8, bit 7 = columna a). Órdenes: 21 01 00 (posición en tiempo real) y 29 01 00 (batería -> 2A 02 <%> <carga>).
'use strict';

const NUT_SERVICES = [
  '1b7e8261-2877-41c3-b46e-cf057c562023',
  '1b7e8271-2877-41c3-b46e-cf057c562023',
  '1b7e8281-2877-41c3-b46e-cf057c562023',
];
const NUT_BOARD = '1b7e8262-2877-41c3-b46e-cf057c562023';
const NUT_WRITE = '1b7e8272-2877-41c3-b46e-cf057c562023';
const NUT_CMD = '1b7e8273-2877-41c3-b46e-cf057c562023';
const NUT_PIECES = '.qkbpnRPrBNQK';

class Chessnut {
  constructor(log) {
    this.log = log || (() => {});
    this.onBoard = null;            // (tablero de 64, a1 = 0) cada vez que cambia y se queda quieto
    this.onStatus = null;           // (texto)
    this.battery = -1;
    this.queue = Promise.resolve();
    this.lastWrite = 0;
    this.partial = null;
    this.raw = null;
    this.stable = null;
    this.timer = null;
    this.wantLeds = null;
    this.sentLeds = null;
  }

  static available() { return !!(navigator.bluetooth && navigator.bluetooth.requestDevice); }

  status(s) { this.statusText = s; if (this.onStatus) this.onStatus(s); }

  /** Pide el tablero (sale la lista de Bluetooth: hay que elegir el Chessnut) y se conecta. */
  async connect() {
    if (!Chessnut.available()) throw new Error('Este navegador no tiene Bluetooth web (en el iPhone, usa Bluefy)');
    this.status('Elige el Chessnut en la lista...');
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'Chessnut' }],
      optionalServices: NUT_SERVICES,
    });
    this.device.addEventListener('gattserverdisconnected', () => {
      this.status('Desconectado');
      this.log('Chessnut desconectado.');
      this.write = null;
    });
    await this.open();
  }

  async open() {
    this.status('Conectando con ' + (this.device.name || 'el Chessnut') + '...');
    const server = await this.device.gatt.connect();
    const services = await server.getPrimaryServices();
    let board = null, cmd = null, write = null;
    const found = [];
    for (const s of services) {
      let chars = [];
      try { chars = await s.getCharacteristics(); } catch (e) { found.push(s.uuid.slice(4, 8) + ': ' + e.message); continue; }
      found.push(s.uuid.slice(4, 8) + ': ' + chars.map(c => c.uuid.slice(4, 8)).join(' '));
      for (const c of chars) {
        const u = c.uuid.toLowerCase();               // Bluefy (iPhone) los da en mayúsculas
        if (u === NUT_BOARD) board = c;
        else if (u === NUT_WRITE) write = c;
        else if (u === NUT_CMD) cmd = c;
      }
    }
    this.log('Chessnut: servicios y características: ' + found.join(' | '));
    if (!board || !write) throw new Error('No es un tablero Chessnut compatible (servicios: ' + services.map(s => s.uuid.slice(4, 8)).join(', ') + ')');
    this.write = write;
    const pr = write.properties || {};
    this.log('Chessnut: escritura ' + ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate'].filter(k => pr[k]).join(',') + '.');
    board.addEventListener('characteristicvaluechanged', e => this.message(new Uint8Array(e.target.value.buffer)));
    await board.startNotifications();
    if (cmd) {
      cmd.addEventListener('characteristicvaluechanged', e => this.message(new Uint8Array(e.target.value.buffer)));
      await cmd.startNotifications();
    }
    this.log('Chessnut conectado: ' + (this.device.name || ''));
    this.status('Conectado (' + (this.device.name || 'Chessnut') + ')');
    this.send([0x21, 0x01, 0x00]);
    this.send([0x29, 0x01, 0x00]);
    this.sentLeds = null;
    if (this.wantLeds) this.leds(this.wantLeds);
    clearInterval(this.batteryTimer);
    this.batteryTimer = setInterval(() => { if (this.write) this.send([0x29, 0x01, 0x00]); }, 60000);
  }

  async reconnect() {
    if (!this.device) return this.connect();
    await this.open();
  }

  /** Una orden al tablero: el Chessnut pierde las que llegan a menos de 200 ms de la anterior. Si una escritura
   *  no se confirma en 2 s se sigue con las demás (24/11: en el iPhone dejaron de encenderse las jugadas de Maia;
   *  una escritura sin respuesta habría parado la cola para siempre). */
  send(bytes) {
    const data = new Uint8Array(bytes);
    this.queue = this.queue.then(async () => {
      const w = this.write;
      if (!w) return;
      const wait = 200 - (performance.now() - this.lastWrite);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      this.lastWrite = performance.now();
      try {
        let p;
        if (w.properties.write && w.writeValueWithResponse) p = w.writeValueWithResponse(data);
        else if (w.writeValueWithoutResponse) p = w.writeValueWithoutResponse(data);
        else p = w.writeValue(data);
        const r = await Promise.race([Promise.resolve(p).then(() => 'ok'), new Promise(res => setTimeout(() => res('tarde'), 2000))]);
        if (r === 'tarde') {
          this.unanswered = (this.unanswered || 0) + 1;
          if (this.unanswered <= 5 || this.unanswered % 20 === 0) this.log('Chessnut: no confirma una orden (' + Array.from(data.slice(0, 3)).map(x => x.toString(16).padStart(2, '0')).join(' ') + '...) en 2 s; sigo con las demás (' + this.unanswered + ').');
        }
      } catch (e) { this.log('Chessnut: no se pudo enviar (' + e.message + ')'); }
    });
    return this.queue;
  }

  /** Enciende las casillas de lit (64 valores, a1 = 0); repite el dibujo una vez, como el puente. force: lo manda
   *  aunque sea el mismo (para refrescar las luces de una jugada que espera). */
  leds(lit, force) {
    this.wantLeds = lit.slice();
    const cmd = [0x0A, 0x08, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let s = 0; s < 64; s++) if (lit[s]) { const r = 7 - (s >> 3), f = s & 7; cmd[2 + r] |= 0x80 >> f; }
    const key = cmd.join(',');
    if (key === this.sentLeds && !force) return;
    this.sentLeds = key;
    this.send(cmd);
    if (!force) setTimeout(() => { if (this.sentLeds === key) this.send(cmd); }, 600);
  }

  message(m) {
    if (this.partial) {
      const j = new Uint8Array(this.partial.length + m.length);
      j.set(this.partial); j.set(m, this.partial.length);
      this.partial = null;
      m = j;
    }
    if (m.length >= 2 && m[0] === 0x01 && m[1] === 0x24 && m.length < 38) { this.partial = m; return; }
    for (let i = 0; i + 1 < m.length; i++) {
      if (m[i] === 0x01 && (m[i + 1] === 0x24 || m[i + 1] === 0x3D) && m.length >= i + 34) {
        const b = Chessnut.decode(m, i);
        if (b) this.rawBoard(b);
        return;
      }
      if (m[i] === 0x2A && m[i + 1] === 0x02 && m.length >= i + 4) {
        this.battery = m[i + 2];
        this.charging = m[i + 3] !== 0;
        if (this.onStatus) this.onStatus(this.statusText);
        return;
      }
    }
  }

  static decode(d, off) {
    const b = new Array(64);
    for (let row = 0; row < 8; row++)
      for (let file = 0; file < 8; file++) {
        const j = 7 - file;
        const v0 = d[off + 2 + ((row * 8 + j) >> 1)];
        const v = (j % 2 === 0) ? (v0 & 0x0F) : (v0 >> 4);
        if (v >= NUT_PIECES.length) return null;
        b[(7 - row) * 8 + file] = NUT_PIECES[v];
      }
    return b;
  }

  /** Una posición se da por buena cuando lleva 250 ms sin cambiar (las piezas a medio camino no cuentan). */
  rawBoard(b) {
    const k = b.join('');
    if (k === this.raw) return;
    this.raw = k;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.raw === this.stable) return;
      this.stable = this.raw;
      if (this.onBoard) this.onBoard(this.stable.split(''));
    }, 250);
  }
}
