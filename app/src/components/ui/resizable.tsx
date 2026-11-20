"use client"

import * as React from "react"
import { cn } from "cn"
import {
  Resizable as ResizablePrimitive,
  ResizableHandle as ResizableHandlePrimitive,
  ResizablePanel as ResizablePanelPrimitive,
} from "@ui-sdk/react/resizable"
import { layoutStorage } from "./resizable-storage.ts"

/**
 * Isla `resizable` de ui-sdk.
 *
 * Es la única puerta a `@ui-sdk/*`: el resto de la app importa este archivo, así
 * que cambiar de librería es cambiar este wrapper y su adaptador de
 * persistencia. Las partes vienen sin estilo salvo el layout que la primitiva
 * necesita; acá se les da el de la casa (tokens `border`/`ring`, hairlines).
 *
 * El tamaño de cada panel no se pasa por clase: la primitiva escribe
 * `--resizable-panel-size` (en %) en cada frame del arrastre y lo consume su
 * `flex-basis` en línea. Por eso los paneles sólo aportan `min-w-0`/`min-h-0`
 * para poder encogerse, y el handle queda como única línea visible.
 */
function Resizable({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive>) {
  return (
    <ResizablePrimitive
      data-slot="resizable"
      className={cn(
        "flex min-h-0 min-w-0 data-[orientation=horizontal]:flex-row data-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePanelPrimitive>) {
  return (
    <ResizablePanelPrimitive
      data-slot="resizable-panel"
      className={cn("flex min-h-0 min-w-0 flex-col", className)}
      {...props}
    />
  )
}

function ResizableHandle({
  className,
  ...props
}: React.ComponentProps<typeof ResizableHandlePrimitive>) {
  return (
    <ResizableHandlePrimitive
      data-slot="resizable-handle"
      className={cn(
        "relative z-10 touch-none bg-border outline-none transition-colors",
        "data-[orientation=horizontal]:w-px data-[orientation=horizontal]:cursor-col-resize",
        "data-[orientation=vertical]:h-px data-[orientation=vertical]:cursor-row-resize",
        "data-[hovering]:bg-ring data-[dragging]:bg-ring focus-visible:bg-ring",
        className
      )}
      {...props}
    />
  )
}

export { Resizable, ResizablePanel, ResizableHandle, layoutStorage }
export type {
  ResizableSize,
  ResizableStorage,
  ResizableState,
  ResizablePanelState,
  ResizableHandleState,
} from "@ui-sdk/react/resizable"
