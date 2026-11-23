// La apertura que se está jugando, pequeña bajo el tablero (Openings.java): la lista de Lichess (dominio público, CC0;
// recursos/aperturas.tsv.gz, la misma del puente), reconocida por la posición (vale con transposiciones), con la parte
// de las blancas y la de las negras por separado: "D00 · ♙ Apertura del Peón de Dama: Variante Mason · ♟ Defensa Holandesa".
'use strict';

const Aperturas = {
  map: null,
  HEADS: ['Defensa', 'Contragambito', 'Gambito', 'Contraataque', 'Apertura', 'Partida', 'Sistema', 'Ataque', 'Formación'],

  async load(url) {
    try {
      const res = await fetch(url);
      const text = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
      const m = new Map();
      for (const line of text.split('\n')) {
        const p = line.split('\t');
        if (p.length < 4) continue;
        const o = { eco: p[1], parts: [p[2]], owners: 'W' };
        if (p.length >= 6) {
          const parts = p[4].split('|'), own = p[5].split('/')[0];
          if (own.length === parts.length) { o.parts = parts; o.owners = own; }
        }
        m.set(p[0], o);
      }
      this.map = m;
      return true;
    } catch (e) { return false; }
  },

  headed(part) { return this.HEADS.some(h => part === h || part.startsWith(h + ' ')); },
  partsOf(o, side) { return o.parts.filter((_, i) => o.owners[i] === side); },

  sideText(path, side) {
    for (let i = path.length - 1; i >= 0; i--) {
      const mine = this.partsOf(path[i], side);
      if (!mine.length) continue;
      if (!this.headed(mine[0])) {
        const family = path[i].parts[0];
        let context = null;
        for (let j = i - 1; j >= 0 && !context; j--)
          if (path[j].parts[0] === family)
            for (const part of this.partsOf(path[j], side)) if (this.headed(part) && part !== family) { context = part; break; }
        mine.unshift(context || family);
      }
      let res = mine[0];
      for (let k = 1; k < mine.length; k++) res += (k === 1 ? ': ' : ', ') + mine[k];
      return res;
    }
    return '';
  },

  /** {eco, white, black} de la partida ('' si no hay apertura conocida). */
  describe(partida) {
    const out = { eco: '', white: '', black: '' };
    if (!this.map) return out;
    const path = [];
    for (let i = 1; i < partida.positions.length; i++) {
      const p = partida.positions[i], o = this.map.get(p.boardFen() + ' ' + (p.white ? 'w' : 'b'));
      if (o) path.push(o);
    }
    if (!path.length) return out;
    out.eco = path[path.length - 1].eco;
    out.white = this.sideText(path, 'W');
    out.black = this.sideText(path, 'B');
    return out;
  },
};
