# Ajedrez contra Maia (web)

Juega en un tablero **Chessnut Air** contra **Maia**, que juega como la gente de 1100 a 1900 de Lichess, errores incluidos. Funciona en el navegador, también en el iPhone con Bluefy (App Store: «Bluefy – Web BLE Browser»), que deja a las páginas usar el Bluetooth.

- La jugada de Maia se enciende en los LEDs del tablero; hazla en el tablero y te toca.
- Las tomas atrás se hacen en el tablero.
- **Montar posición**: coloca las piezas y elige quién empieza.
- Sin tablero se juega tocando la pantalla.
- **Enviar partida**: el PGN, con el menú de compartir.

Maia es la red neuronal del proyecto [Maia Chess](https://github.com/CSSLab/maia-chess) (GPL-3.0), pasada a ONNX y ejecutada con ONNX Runtime Web; elige su jugada como `go nodes 1` de Lc0. Ver `LICENCIAS.txt`.

La carpeta `pruebas` compara las jugadas con las de Lc0 (`pruebas/prueba-maia.html`).
