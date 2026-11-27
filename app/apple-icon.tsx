import { ImageResponse } from "next/og"
import { AppIcon } from "@/components/app-icon"

// The icon an iPhone shows on its Home Screen once Ask is added there.
export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(<AppIcon size={size.width} />, size)
}
