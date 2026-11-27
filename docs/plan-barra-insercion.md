# Barra de inserción de componentes

**Estado:** implementado y verificado en v0.13.0 (2026-11-27).  
**Objetivo:** pasar de «sé qué componente necesito» a «lo tengo listo para colocar» sin recorrer categorías ni perder de vista el circuito.

## Experiencia de referencia

Con el lienzo activo y sin una operación en curso, la persona escribe `contactor`. La primera letra ya forma parte de la consulta. Desde una barra discreta al pie del lienzo se despliega hacia arriba una lista con el símbolo eléctrico real, el nombre y el código CADe de cada coincidencia. Las flechas recorren las variantes. **Enter prepara el símbolo; el clic en el lienzo lo coloca.** Navegar o confirmar en la barra nunca debe insertar un componente por sí solo.

## Alcance de la primera versión

- Buscar **componentes del catálogo para insertar**, no instancias ya dibujadas. Mantener disponible la paleta actual.
- Buscar por nombre y código con el mismo motor, catálogo insertable y orden que la paleta. No añadir un segundo índice ni un ranking propio.
- Ofrecer entrada por teclado desde el lienzo y activación explícita por clic o tabulación. La barra no es modal: al cerrarla se conserva la vista del circuito.
- **Fuera de alcance:** ejecutar comandos, historial, favoritos, búsqueda remota y rediseño de la paleta. Una ampliación futura podría reservar `>` para acciones como rotar; no implementar el prefijo ni mostrar comandos ficticios en esta versión.

## Contrato de interacción

| Situación | Resultado esperado |
|---|---|
| Reposo | La barra es visible sin cubrir controles. La lista permanece cerrada y no reclama el foco al abrir el proyecto. |
| Escritura con el lienzo activo | Si el editor está disponible para insertar, un carácter imprimible sin atajo asociado enfoca la barra e inicia la consulta sin perderlo ni duplicarlo. Los atajos existentes tienen prioridad. |
| Cambio de consulta | Actualizar los resultados; resaltar el primero. Si la consulta queda vacía, ocultar los resultados. Si no hay coincidencias, indicarlo y dejar Enter sin efecto. |
| ↑ / ↓ | Cambiar la fila activa, mantenerla visible y conservar el foco de escritura. No mover el lienzo ni modificar la selección del dibujo. |
| Enter o clic en un resultado | Activar el mismo flujo de colocación que la paleta, cerrar resultados, limpiar la consulta y devolver el control al lienzo. La herramienta existente decide qué ocurre después de colocar. |
| Esc durante la búsqueda | Cerrar, limpiar y devolver el foco al lienzo sin modificar el documento. Consumir ese Escape una sola vez: no cancelar además otra acción del editor. |
| Clic fuera o Tab para salir | Cerrar sin confirmar ni atrapar el foco. Un clic en otro control debe llegar a su destino; no forzar el foco al lienzo en este caso. |
| Campo de texto, diálogo o composición IME | No interceptar escritura ajena, teclas de composición ni combinaciones con Ctrl, Cmd o Alt. No confirmar un resultado con el Enter que finaliza una composición. |
| Cableado, arrastre u otra operación en curso; modo que impide insertar | No iniciar búsqueda automática ni reemplazar la operación. La activación explícita tampoco debe saltarse las restricciones de inserción de la paleta. |

## Estructura e integración

| Responsabilidad | Punto de partida |
|---|---|
| Coincidencias | Reutilizar `searchSymbols` de [search.ts](../app/src/symbols/search.ts). Para una misma consulta, la lista debe preservar el orden de la paleta incluso si solo muestra parte de los resultados a la vez. |
| Catálogo, iconografía y colocación | Seguir [Palette.tsx](../app/src/ui/Palette.tsx) hasta el callback que activa la herramienta. Compartir esa ruta y la representación del símbolo; no simular clics en la paleta ni escribir directamente en el documento. |
| Presentación | Crear un componente de barra en `app/src/ui/` (nombre sugerido: `ComponentInsertionBar`). Posee la consulta y el estado transitorio. Usar el componente **Command** de [UI SDK](https://ui-sdk.dev/) para el comportamiento de lista y teclado. Verificar en la versión instalada cómo suministrar resultados preordenados sin aplicar un segundo filtro. |
| Coordinación con el editor | En el punto que ya conoce foco, herramienta y modo, determinar cuándo puede iniciarse la búsqueda. Antes de añadir listeners, localizar el manejo de teclado existente y comprobar sus prioridades. No agregar un listener global que gane por orden de montaje. |

**Criterio visual:** usar tipografía, colores y bordes del editor. Mostrar pocas filas a la vez con desplazamiento, distinguir claramente la activa y mantener legibles símbolo, nombre y código. Limitar la altura al espacio disponible; comprobar que a tamaño reducido no tape los controles ni provoque desplazamiento horizontal. Presentar ayudas breves para navegar, elegir y cancelar.

**Accesibilidad:** dar nombre accesible al campo, exponer la opción activa y comunicar la ausencia de resultados. La identificación de cada variante debe funcionar sin ver el icono. No distinguir el foco solo por color.

## Orden de trabajo para el agente

1. Trazar el recorrido actual desde el resultado de la paleta hasta la colocación. Identificar catálogo, permisos de inserción, foco y atajos. Comprobar las dependencias de UI SDK antes de cambiar paquetes.
2. Escribir primero un caso de paridad con la paleta y un caso de interacción: teclear desde el lienzo, recorrer, confirmar y colocar con un clic.
3. Integrar la barra con el buscador y la herramienta existentes. Resolver después cancelación, foco, estados vacíos y conflictos de teclado. No modificar el motor de búsqueda para acomodar la presentación.
4. Pulir y verificar en navegador con un circuito abierto. Entregar pruebas y señalar cualquier limitación comprobada.

## Criterios de aceptación

- [x] Para una consulta por nombre, una por código y una con acentos o errata, barra y paleta devuelven los mismos símbolos en el mismo orden. Referencia: [pruebas del buscador](../app/test/symbol-search.test.ts).
- [x] Al escribir desde el lienzo se conserva la primera letra; las flechas permiten elegir una variante distinta de la primera sin alterar el circuito.
- [x] Confirmar por teclado o ratón prepara exactamente la variante elegida. Antes del clic de colocación no cambia el documento; después se agrega un solo componente y se puede deshacer como desde la paleta.
- [x] Consulta vacía, cero coincidencias, Escape, Tab y clic fuera no insertan nada. El siguiente evento de teclado llega al control que corresponde.
- [x] Escribir en una etiqueta o usar un atajo no abre la barra; con un cable o arrastre en curso la operación permanece intacta. En los modos que impiden insertar no hay una vía alternativa desde la barra.
- [x] Verificación en navegador: recorrido solo con teclado, nombre y opción activa accesibles, foco visible, símbolos reconocibles y lista utilizable en una ventana estrecha.

## Implementación final

La barra usa `Command` de UI SDK con `filter={false}` sobre resultados ya ordenados por `codeOrder` + `searchSymbols`, y comparte con la paleta el callback que arma la herramienta: la colocación sigue siendo un clic en el lienzo. El listener de activación va en `window`, detrás de los atajos de `document`, y exige foco en el lienzo, sin modificadores y sin operación en curso.

El alcance inicial es `all`: paleta y barra muestran también los códigos dibujados que no están en el menú del binario (`8016`, `8017`, `8018`). El filtro «Solo componentes CADe_SIMU» sigue disponible en Ver para quien quiera restringirse al catálogo extraído.

Sobre el diseño original se añadió, por pedido posterior, una **barra flotante** con apariencia de línea de comandos (`Insertar:`, prompt monoespaciado, lista sobre el campo) que sigue los tokens del mundo clásico o moderno. El tirador permite arrastrarla y moverla con flechas, `Inicio` la centra y soltarla cerca del borde inferior la acopla a todo el ancho como franja fija; el mismo botón la separa. El botón `-` la pliega a `+ Insertar:` con una transición de 200 ms que respeta `prefers-reduced-motion`.

Verificación: 11 pruebas E2E propias en `app/e2e/component-insertion-bar.spec.ts`, 16 pruebas unitarias de paridad en `app/test/insertion-matches.test.ts` y veredicto S1-S10 «met» del verificador independiente. Seguimiento detallado en [`odd/tasks/component-insertion-bar.md`](../odd/tasks/component-insertion-bar.md).
