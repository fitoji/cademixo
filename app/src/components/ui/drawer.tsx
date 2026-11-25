"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import {
  Drawer as DrawerPrimitive,
  DrawerBackdrop,
  DrawerClose as DrawerClosePrimitive,
  DrawerContent as DrawerContentPrimitive,
  DrawerDescription as DrawerDescriptionPrimitive,
  DrawerTitle as DrawerTitlePrimitive,
} from "@ui-sdk/react/drawer"
import { cn } from "@/lib/utils"

/**
 * Isla `drawer` de ui-sdk: hoja inferior con backdrop. `sheet.tsx` es la misma
 * primitiva de costado y no modal, para el inspector.
 */
function Drawer(props: React.ComponentProps<typeof DrawerPrimitive>) {
  return <DrawerPrimitive side="bottom" {...props} />
}

function DrawerOverlay({ className, ...props }: React.ComponentProps<typeof DrawerBackdrop>) {
  return <DrawerBackdrop className={cn("bg-black/40 backdrop-blur-[1px]", className)} {...props} />
}

function DrawerContent({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof DrawerContentPrimitive>, "children"> & {
  children?: React.ReactNode
}) {
  return (
    <DrawerContentPrimitive
      className={cn(
        "flex max-h-[min(85dvh,40rem)] w-full flex-col overflow-hidden rounded-t-xl border-t border-border bg-card text-card-foreground shadow-chrome-up outline-none",
        className,
      )}
      {...props}
    >
      <div
        data-slot="grip"
        aria-hidden="true"
        className="mx-auto mt-2 mb-1 h-1 w-9 shrink-0 rounded-full bg-border"
      />
      <div className="mx-auto flex min-h-0 w-full max-w-[46rem] flex-1 flex-col">{children}</div>
    </DrawerContentPrimitive>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 pb-3",
        className,
      )}
      {...props}
    />
  )
}

function DrawerBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3", className)}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex shrink-0 justify-end gap-2 border-t border-border px-4 py-2.5",
        className,
      )}
      {...props}
    />
  )
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerTitlePrimitive>) {
  return <DrawerTitlePrimitive className={cn("text-sm font-semibold", className)} {...props} />
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerDescriptionPrimitive>) {
  return (
    <DrawerDescriptionPrimitive
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function DrawerClose(props: React.ComponentProps<typeof DrawerClosePrimitive>) {
  return <DrawerClosePrimitive {...props} />
}

function DrawerDismiss({ className, ...props }: React.ComponentProps<typeof DrawerClosePrimitive>) {
  return (
    <DrawerClosePrimitive
      aria-label="Cerrar"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none [&_svg]:size-4",
        className,
      )}
      {...props}
    >
      <XIcon />
    </DrawerClosePrimitive>
  )
}

export { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerDescription, DrawerDismiss, DrawerFooter, DrawerHeader, DrawerOverlay, DrawerTitle }
