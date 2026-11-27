import type { ComponentProps, JSX } from 'react';
import { useSyncExternalStore } from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerDismiss,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Field, FieldContent, FieldDescription, FieldLabel, FieldSet, FieldLegend } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  getSettings,
  setSettings,
  subscribeSettings,
  type Paneles,
  type PinSize,
  type WireWidth,
} from './settings.ts';
import type { CableHandling } from '../editor/wiring/cable-move.ts';
import { resumeMotorHum } from './motor-hum.ts';

/**
 * Interruptor de dos estados.
 *
 * No hay pieza en `components/ui` para `Switch` todavía y el diálogo es el único
 * lugar que lo usa, así que se dibuja acá con el mismo criterio que las demás
 * piezas: el primitivo de Radix y las clases del tema.
 */
function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>): JSX.Element {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border border-transparent bg-input outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-3.5 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-[14px] data-[state=unchecked]:translate-x-0.5"
      />
    </SwitchPrimitive.Root>
  );
}

/**
 * Cajón «Ver → Configuración…». Escribe las preferencias en `settings.ts`, así que
 * el lienzo, la paleta y el sonido ven el cambio en el acto; el «Listo» sólo cierra.
 */
export function SettingsDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerOverlay />
      <DrawerContent initialFocus="content">
        <DrawerHeader>
          <div className="flex flex-col gap-1">
            <DrawerTitle>Configuración</DrawerTitle>
            <DrawerDescription>
              Cómo se dibuja el plano, cómo se comportan los paneles y qué suena.
            </DrawerDescription>
          </div>
          <DrawerDismiss />
        </DrawerHeader>

        <DrawerBody>
          <FieldSet>
            <Field>
              <FieldLabel>Tamaño de bornes</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={settings.pinSize}
                onValueChange={(value) => {
                  if (value) setSettings({ pinSize: value as PinSize });
                }}
              >
                <ToggleGroupItem value="chico" aria-label="Bornes chicos">
                  Chico
                </ToggleGroupItem>
                <ToggleGroupItem value="normal" aria-label="Bornes normales">
                  Normal
                </ToggleGroupItem>
                <ToggleGroupItem value="grande" aria-label="Bornes grandes">
                  Grande
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription className="font-mono text-[11px]">
                Radio de los puntos de borne del símbolo y de las conexiones del lienzo.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Grosor de cables</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={settings.wireWidth}
                onValueChange={(value) => {
                  if (value) setSettings({ wireWidth: value as WireWidth });
                }}
              >
                <ToggleGroupItem value="fino" aria-label="Cables finos">
                  Fino
                </ToggleGroupItem>
                <ToggleGroupItem value="normal" aria-label="Cables normales">
                  Normal
                </ToggleGroupItem>
                <ToggleGroupItem value="grueso" aria-label="Cables gruesos">
                  Grueso
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription className="font-mono text-[11px]">
                Ancho de todos los conductores, incluidos los de tensión y los seleccionados.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Paneles de componentes</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={settings.paneles}
                onValueChange={(value) => {
                  if (value) setSettings({ paneles: value as Paneles });
                }}
              >
                <ToggleGroupItem value="horizontal" aria-label="Paneles de componentes horizontales">
                  Horizontal
                </ToggleGroupItem>
                <ToggleGroupItem value="vertical" aria-label="Paneles de componentes verticales">
                  Vertical
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription className="font-mono text-[11px]">
                La barra de componentes arriba, como siempre, o al costado en una columna plegable.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Manejo de cables</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={settings.cableHandling}
                onValueChange={(value) => {
                  if (value) setSettings({ cableHandling: value as CableHandling });
                }}
              >
                <ToggleGroupItem value="actual" aria-label="Manejo de cables actual">
                  Actual
                </ToggleGroupItem>
                <ToggleGroupItem value="ortogonal" aria-label="Manejo de cables ortogonal Wybrow">
                  Ortogonal (Wybrow)
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription className="font-mono text-[11px]">
                Al mover componentes, Actual conserva la geometría de siempre. Ortogonal mantiene los
                tramos en sus carriles y enruta alrededor de obstáculos sin cambiar las conexiones.
              </FieldDescription>
            </Field>

            <Separator />

            <Field orientation="horizontal">
              <Checkbox
                id="ajustes-auto-cierre"
                checked={settings.autoCierre}
                onCheckedChange={(checked) => setSettings({ autoCierre: checked === true })}
              />
              <FieldContent>
                <FieldLabel htmlFor="ajustes-auto-cierre">Auto cierre</FieldLabel>
                <FieldDescription>
                  Al abrir un panel de la paleta se cierra el que estaba abierto.
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldSet>

          <Separator />

          {/* S7: los tres canales suenan de entrada; silenciar se elige. */}
          <FieldSet>
            <FieldLegend variant="label">Sonidos</FieldLegend>

            <Field orientation="horizontal">
              <Switch
                id="ajustes-sonidos-interfaz"
                aria-label="Sonidos de interfaz"
                checked={settings.sonidosInterfaz}
                onCheckedChange={(checked) => setSettings({ sonidosInterfaz: checked })}
              />
              <FieldContent>
                <FieldLabel htmlFor="ajustes-sonidos-interfaz">Sonidos de interfaz</FieldLabel>
                <FieldDescription>
                  Abrir, guardar y crear un proyecto, los avisos de error, accionar aparatos y
                  colocar componentes.
                </FieldDescription>
              </FieldContent>
            </Field>

            <Field orientation="horizontal">
              <Switch
                id="ajustes-sonidos-simulacion"
                aria-label="Sonidos de simulación"
                checked={settings.sonidosSimulacion}
                onCheckedChange={(checked) => setSettings({ sonidosSimulacion: checked })}
              />
              <FieldContent>
                <FieldLabel htmlFor="ajustes-sonidos-simulacion">Sonidos de simulación</FieldLabel>
                <FieldDescription>
                  Los flancos del circuito con la simulación andando: bobinas que se energizan o se
                  desenergizan y protecciones que disparan.
                </FieldDescription>
              </FieldContent>
            </Field>

            <Field orientation="horizontal">
              <Switch
                id="ajustes-sonido-motor"
                aria-label="Sonido del motor"
                checked={settings.sonidoMotor}
                onCheckedChange={(checked) => {
                  setSettings({ sonidoMotor: checked });
                  // El clic del interruptor es un gesto válido para crear el
                  // contexto del zumbido (S10), sin esperar al próximo Simular.
                  resumeMotorHum();
                }}
              />
              <FieldContent>
                <FieldLabel htmlFor="ajustes-sonido-motor">Sonido del motor</FieldLabel>
                <FieldDescription>
                  Zumbido continuo mientras haya motores energizados. Encendido por defecto: el motor
                  igual se ve girando.
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldSet>
        </DrawerBody>
        <DrawerFooter>
          <DrawerClose render={<Button size="sm" variant="secondary">Listo</Button>} />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
