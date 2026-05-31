"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "oklch(0.95 0.05 145)",
          "--success-text": "oklch(0.35 0.12 145)",
          "--success-border": "oklch(0.80 0.10 145)",
          "--error-bg": "oklch(0.95 0.05 25)",
          "--error-text": "oklch(0.40 0.15 25)",
          "--error-border": "oklch(0.80 0.12 25)",
          "--warning-bg": "oklch(0.97 0.06 80)",
          "--warning-text": "oklch(0.40 0.14 80)",
          "--warning-border": "oklch(0.82 0.12 80)",
          "--info-bg": "oklch(0.95 0.04 240)",
          "--info-text": "oklch(0.38 0.12 240)",
          "--info-border": "oklch(0.78 0.10 240)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
