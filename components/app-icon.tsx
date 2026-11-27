// Ask's app icon: the header's calendar tile, red along the top, with an "A" for Ask. Drawn by ImageResponse at any
// size (app/icon.tsx for the manifest, app/apple-icon.tsx for an iPhone's Home Screen), so there are no image
// files to keep in step.
function AppIcon({ size }: { size: number }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#ffffff" }}>
      <div style={{ height: size * 0.28, background: "#cc2e36" }} />
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#16181d",
          fontSize: size * 0.48,
          fontWeight: 700,
        }}
      >
        A
      </div>
    </div>
  )
}

export { AppIcon }
