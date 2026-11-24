# Ajedrez contra Maia (web)

Juega en un tablero **Chessnut Air** contra **Maia**, que juega como la gente de 1100 a 1900 de Lichess, errores incluidos. Funciona en el navegador, también en el iPhone con Bluefy (App Store: «Bluefy – Web BLE Browser»), que deja a las páginas usar el Bluetooth. La pantalla es la de la app de Android «Ajedrez contra Maia».

- La jugada de Maia se enciende en los LEDs del tablero; hazla en el tablero y te toca. La pieza que coges también se enciende.
- **◀ Atrás**: tu última jugada y la de Maia; se encienden las casillas que cambian. Las tomas atrás también se hacen directamente en el tablero.
- **Montar**: coloca las piezas y elige quién empieza.
- **Tablas** (Maia las acepta si no va mejor) y **Rendirse**.
- **▶ Juega Maia**: si Maia no contesta, la obliga a mover (o juega desde la posición que haya en el tablero). **Nueva partida**: limpia la partida.
- Las jugadas ilegales se explican (por ejemplo, un enroque pasando por una casilla atacada) y se encienden sus casillas para devolver las piezas. El enroque vale empezando por el rey o por la torre.
- Análisis de **Stockfish 18**: barra de evaluación, de 0 a 5 jugadas candidatas y la nota de cada jugada (Mejor, Excelente, Buena, Imprecisión, Error, Error grave).
- Reloj (tiempo usado o partida con tiempo), material, apertura.
- **Enviar partida**: el PGN, con el menú de compartir. Las partidas terminadas se guardan en el navegador.
- Sin tablero se juega tocando la pantalla; mantener pulsado el tablero lo gira.

Maia es la red neuronal del proyecto [Maia Chess](https://github.com/CSSLab/maia-chess) (GPL-3.0), pasada a ONNX y ejecutada con ONNX Runtime Web; elige su jugada como `go nodes 1` de Lc0. Ver `LICENCIAS.txt`.

La carpeta `pruebas` compara las jugadas con las de Lc0 (`pruebas/prueba-maia.html`).
