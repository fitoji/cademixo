/**
 * Zumbido del motor (S10): la parte pura decide el nivel 0..1 a partir de la
 * cantidad de motores energizados, del estado de la corrida y de los ajustes.
 *
 * Sin DOM: el módulo se importa entero —no crea ningún nodo de audio hasta que
 * hay un gesto real— y sólo se testea la función pura, que es la que manda.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { humLevel, type HumInput } from '../src/ui/motor-hum.ts';

/** Un frame que sí suena: un motor energizado, simulación andando y sonido prendido. */
function frame(patch: Partial<HumInput> = {}): HumInput {
  return {
    motoresEnergizados: 1,
    simulando: true,
    oculta: false,
    ajustes: { silenciado: false, sonidoMotor: true },
    ...patch,
  };
}

test('sin motores energizados el zumbido no suena', () => {
  assert.equal(humLevel(frame({ motoresEnergizados: 0 })), 0);
  assert.equal(humLevel(frame({ motoresEnergizados: -2 })), 0);
});

test('el nivel crece con la cantidad de motores y se queda en el techo de 3', () => {
  const uno = humLevel(frame({ motoresEnergizados: 1 }));
  const dos = humLevel(frame({ motoresEnergizados: 2 }));
  const tres = humLevel(frame({ motoresEnergizados: 3 }));
  const seis = humLevel(frame({ motoresEnergizados: 6 }));

  assert.ok(uno > 0 && uno < 1, `un motor tiene que sonar por debajo del techo: ${uno}`);
  assert.ok(dos > uno, 'dos motores suenan más que uno');
  assert.ok(tres > dos, 'tres motores suenan más que dos');
  assert.equal(seis, tres, 'a partir de 3 el nivel no sube más');
  assert.equal(tres, 1, 'el techo es el nivel máximo');
});

test('los cinco cortes de S10 devuelven 0', () => {
  // 1. sin motores energizados
  assert.equal(humLevel(frame({ motoresEnergizados: 0 })), 0);
  // 2. simulación detenida
  assert.equal(humLevel(frame({ simulando: false })), 0);
  // 3. mute maestro de la barra
  assert.equal(humLevel(frame({ ajustes: { silenciado: true, sonidoMotor: true } })), 0);
  // 4. «Sonido del motor» apagado a mano
  assert.equal(humLevel(frame({ ajustes: { silenciado: false, sonidoMotor: false } })), 0);
  // 5. pestaña oculta
  assert.equal(humLevel(frame({ oculta: true })), 0);

  // Con el techo de motores los cortes mandan igual.
  assert.equal(humLevel(frame({ motoresEnergizados: 6, oculta: true })), 0);
  assert.equal(humLevel(frame({ motoresEnergizados: 6, simulando: false })), 0);
  assert.equal(humLevel(frame({ motoresEnergizados: 6, ajustes: { silenciado: true, sonidoMotor: true } })), 0);
});

test('la función no muta su entrada', () => {
  const entrada: HumInput = {
    motoresEnergizados: 4,
    simulando: true,
    oculta: false,
    ajustes: { silenciado: false, sonidoMotor: true },
  };
  const copia = structuredClone(entrada);

  humLevel(entrada);
  humLevel({ ...entrada, oculta: true });
  humLevel({ ...entrada, ajustes: { silenciado: true, sonidoMotor: false } });

  assert.deepEqual(entrada, copia);
  assert.deepEqual(entrada.ajustes, { silenciado: false, sonidoMotor: true });
});
