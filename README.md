# Ajedrez contra Maia (web)

Juega en un tablero **Chessnut Air** contra **Maia**, que juega como la gente de 1100 a 1900 de Lichess, errores incluidos. Funciona en el navegador, también en el iPhone con Bluefy (App Store: «Bluefy – Web BLE Browser»), que deja a las páginas usar el Bluetooth. La pantalla es la de la app de Android «Ajedrez contra Maia».

- La jugada de Maia se enciende en los LEDs del tablero; hazla en el tablero y te toca. La pieza que coges también se enciende.
- **◀ Atrás**: tu última jugada y la de Maia. La pantalla muestra en el acto la posición de antes (las jugadas deshechas, tachadas) y debajo salen los pasos para colocar el Chessnut igual, uno a uno y la última jugada primero («Lleva el caballo negro de d5 a f6 y pon un peón negro en d5»); el que toca lleva una flecha y en el Chessnut se encienden las casillas que aún están mal. Las tomas atrás también se hacen directamente en el tablero.
- **Montar**: coloca las piezas y elige quién empieza. Sin tablero, en la pantalla: una fila con las piezas, una cruz y «Vaciar» / «Inicial».
- **Tablas** (Maia las acepta si no va mejor) y **Rendirse**.
- **▶ Juega Maia**: si Maia no contesta, la obliga a mover (o juega desde la posición que haya en el tablero). **Nueva partida**: limpia la partida.
- Las jugadas ilegales se explican (por ejemplo, un enroque pasando por una casilla atacada) y se encienden sus casillas para devolver las piezas. El enroque vale empezando por el rey o por la torre. Una pieza que salta por encima de otras (solo salta el caballo) o una captura al paso fuera de tiempo también se explican. Antes de la primera jugada, las piezas cambiadas de sitio se avisan en rojo con los pasos para colocarlas (Maia espera).
- Análisis de **Stockfish 18**: barra de evaluación, de 0 a 5 jugadas candidatas y la nota de cada jugada (Mejor, Excelente, Buena, Imprecisión, Error, Error grave).
- Reloj (tiempo usado o partida con tiempo), material, apertura.
- Toca una jugada de la lista (de blancas o de negras): el tablero de la pantalla muestra la posición después de esa jugada, marcada en azul. Tócala otra vez, o toca el tablero, para volver a la partida.
- **Enviar partida**: el PGN, con el menú de compartir. Las partidas terminadas se guardan en el navegador.
- Sin tablero se juega tocando la pantalla: toca una pieza (salen puntos donde puede ir) y luego su casilla, o arrástrala con el dedo; al coronar se elige la pieza. Mantener pulsado el tablero lo gira.

Maia es la red neuronal del proyecto [Maia Chess](https://github.com/CSSLab/maia-chess) (GPL-3.0), pasada a ONNX y ejecutada con ONNX Runtime Web; elige su jugada como `go nodes 1` de Lc0. Ver `LICENCIAS.txt`.

La carpeta `pruebas` compara las jugadas con las de Lc0 (`pruebas/prueba-maia.html`).
