// El reloj de ajedrez de la app (ChessClock.java): "usado" (cada reloj suma el tiempo que gasta su bando, por omisión)
// o un control de tiempo ("15+10": cuenta atrás con incremento). Corre el reloj del bando al que le toca; empieza
// solo con la primera jugada; tocarlo lo para.
'use strict';

class ChessClock {
  constructor() { this.setControl(ChessClock.USED); }
  static get USED() { return 'usado'; }

  static parse(c) {
    const p = String(c).split('+'), m = parseInt(p[0], 10), s = p.length > 1 ? parseInt(p[1], 10) : 0;
    return isNaN(m) ? [0, 0] : [m * 60000, (isNaN(s) ? 0 : s) * 1000];
  }

  setControl(c) {
    this.up = c === ChessClock.USED;
    const [base, inc] = this.up ? [0, 0] : ChessClock.parse(c);
    this.base = base; this.inc = inc;
    this.on = this.up || base > 0;
    this.reset();
  }

  newGame() { this.reset(); }
  reset() { this.left = [this.base, this.base]; this.running = this.toMove = this.flag = -1; this.started = this.paused = this.ended = false; }

  /** side (0 blancas, 1 negras) mueve ahora. */
  turn(side) {
    if (!this.on || side < 0 || this.flag >= 0 || this.ended) return;
    const t = performance.now();
    if (!this.started) {
      if (this.toMove < 0 || side === this.toMove) { this.toMove = side; return; }
      if (!this.up) this.left[this.toMove] += this.inc;
      this.started = true; this.running = side; this.since = t;
      return;
    }
    if (side === this.running) return;
    this.settle(t);
    if (this.flag >= 0) return;
    if (!this.up) this.left[this.running] += this.inc;
    this.running = side; this.since = t;
  }

  stop() { if (this.ended) return; this.settle(performance.now()); this.ended = true; }
  resume() { if (!this.ended) return; this.ended = false; this.since = performance.now(); }

  togglePause() {
    if (!this.started || this.flag >= 0 || this.ended) return;
    const t = performance.now();
    this.settle(t);
    this.paused = !this.paused;
    this.since = t;
  }

  settle(t) {
    if (this.started && this.running >= 0 && !this.paused && this.flag < 0 && !this.ended) {
      if (this.up) this.left[this.running] += t - this.since;
      else {
        this.left[this.running] -= t - this.since;
        if (this.left[this.running] <= 0) { this.left[this.running] = 0; this.flag = this.running; }
      }
    }
    this.since = t;
  }

  snapshot() {
    this.settle(performance.now());
    return {
      on: this.on, up: this.up, white: this.left[0], black: this.left[1],
      running: this.started && this.flag < 0 && !this.ended ? this.running : -1,
      started: this.started, paused: this.paused, ended: this.ended, flag: this.flag,
    };
  }

  /** Cuenta atrás: 1:30:00, 14:59, 0:45 y, por debajo de 20 s, 19.5. */
  static text(ms) {
    if (ms < 0) ms = 0;
    if (ms < 20000) return Math.floor(ms / 1000) + '.' + Math.floor((ms % 1000) / 100);
    const s = Math.floor((ms + 999) / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const ss = (sec < 10 ? '0' : '') + sec;
    return h > 0 ? h + ':' + (m < 10 ? '0' : '') + m + ':' + ss : m + ':' + ss;
  }

  /** Tiempo usado: 0:00, 7:05, 95:12. */
  static used(ms) {
    const s = Math.floor(Math.max(0, ms) / 1000), m = Math.floor(s / 60), sec = s % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }
}

const CLOCKS = [ChessClock.USED, '', '3+2', '5+0', '5+3', '10+0', '10+5', '15+10', '25+10', '30+0', '30+20', '45+15', '60+0', '60+30', '90+30'];
const clockName = c => c === ChessClock.USED ? 'Tiempo usado' : c === '' ? 'Sin reloj' : c;
