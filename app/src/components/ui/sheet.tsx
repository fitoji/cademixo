"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import {
  Drawer as SheetPrimitive,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@ui-sdk/react/drawer"
import { cn } from "@/lib/utils"

/**
 * Isla `sheet` de ui-sdk: el Drawer lateral con la API de shadcn.
 *
 * Por defecto es no modal y no se cierra al pulsar fuera: el inspector convive
 * con el lienzo, así que se pueden seguir seleccionando componentes mientras
 * está abierto. Quien lo use puede overridear ambas opciones.
 */
function Sheet({ modal = false, closeOnOutsidePress = false, ...props }: React.ComponentProps<typeof SheetPrimitive>) {
  return <SheetPrimitive modal={modal} closeOnOutsidePress={closeOnOutsidePress} {...props} />
}

function SheetTrigger(props: React.ComponentProps<typeof DrawerTrigger>) {
  return <DrawerTrigger {...props} />
}

function SheetContent({ className, ...props }: React.ComponentProps<typeof DrawerContent>) {
  return (
    <DrawerContent
      className={cn(
        // El header de 46px y el footer de 26px quedan libres: el menú y el
        // contador de avisos tienen que seguir siendo clicables con el sheet abierto.
        "relative mt-[46px] flex h-[calc(100dvh-72px)] w-[288px] max-w-[88vw] flex-col overflow-hidden border-border bg-card text-card-foreground outline-none",
        "data-[side=left]:border-r data-[side=left]:shadow-chrome-right data-[side=right]:border-l data-[side=right]:shadow-chrome-left",
        className,
      )}
      {...props}
    />
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DrawerTitle>) {
  return <DrawerTitle className={cn("text-sm font-semibold", className)} {...props} />
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof DrawerDescription>) {
  return <DrawerDescription className={cn("text-xs text-muted-foreground", className)} {...props} />
}

function SheetClose({ className, ...props }: React.ComponentProps<typeof DrawerClose>) {
  return (
    <DrawerClose
      aria-label="Cerrar"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none [&_svg]:size-4",
        className,
      )}
      {...props}
    >
      <XIcon />
    </DrawerClose>
  )
}

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose }
