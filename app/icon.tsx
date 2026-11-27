import { ImageResponse } from "next/og"
import { AppIcon } from "@/components/app-icon"

// The manifest's icons (app/manifest.ts), at /icon/192 and /icon/512.
const SIZES = [192, 512]

export function generateImageMetadata() {
  return SIZES.map((size) => ({ id: String(size), size: { width: size, height: size }, contentType: "image/png" }))
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const size = Number(await id)
  return new ImageResponse(<AppIcon size={size} />, { width: size, height: size })
}
