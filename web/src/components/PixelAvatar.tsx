import { useEffect, useRef } from 'react'

export type PixelAvatarVariant = 'portrait' | 'seated'

const HAIR = ['#5c4033', '#e91e8c', '#1a1a2e', '#c9a227', '#6b4f9c', '#2e7d8a'] as const
const SHIRTS = ['#e91e8c', '#76e08d', '#a2ff00', '#ffd54f', '#9c27b0', '#00bcd4', '#5c9fd4'] as const
const SKIN = ['#f0c6a8', '#e8b89a', '#d4a574', '#c68642', '#8d5524'] as const

function hash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pick<T>(arr: readonly T[], h: number, salt: number): T {
  return arr[(h ^ salt) % arr.length]
}

/**
 * Renders a crisp 8-bit–style figure on canvas (low-res grid, nearest-neighbor scale).
 */
export function PixelAvatar({
  seed,
  variant = 'portrait',
  scale = 4,
  className,
  title,
}: {
  seed: string
  variant?: PixelAvatarVariant
  scale?: number
  className?: string
  title?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const h0 = hash(seed)
    const hair = pick(HAIR, h0, 1)
    const shirt = pick(SHIRTS, h0, 3)
    const skin = pick(SKIN, h0, 5)
    const hairWide = 2 + (h0 % 3) // 2-4 px wider face
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const GW = 14
    const GH = variant === 'seated' ? 19 : 18
    canvas.width = GW * scale
    canvas.height = GH * scale
    ctx.imageSmoothingEnabled = false

    const fill = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color
      ctx.fillRect(x * scale, y * scale, w * scale, h * scale)
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const hx0 = Math.floor((GW - hairWide - 6) / 2)
    const hairFlip = h0 % 2 === 0
    // Hair — blocky bangs / side volume (seed-tilted)
    fill(hx0 + (hairFlip ? 2 : 0), 1, hairWide + (hairFlip ? 2 : 4), 2, hair)
    fill(hx0, 3, hairWide + 6, 2, hair)
    if (h0 % 3 === 0) fill(hx0 - 1, 4, 2, 2, hair)
    if (h0 % 3 !== 0) fill(hx0 + hairWide + 5, 4, 2, 2, hair)
    // Face block
    const fx = Math.floor((GW - 6) / 2)
    fill(fx, 5, 6, 5, skin)
    // Eyes (single-pixel each)
    fill(fx + 1, 7, 1, 1, '#0c0c12')
    fill(fx + 4, 7, 1, 1, '#0c0c12')
    if (h0 % 2 === 0) fill(fx + 2, 9, 2, 1, '#8a5a44')

    // Shirt / torso
    fill(fx - 1, 10, 8, variant === 'seated' ? 6 : 8, shirt)

    if (variant === 'seated') {
      // Desk bar + two glowing monitors (pixel CRT vibe)
      fill(0, 16, GW, 2, '#4a3728')
      fill(0, 18, GW, 1, '#2c2118')
      fill(0, 12, 5, 3, '#152018')
      fill(1, 11, 3, 1, '#a2ff00')
      fill(9, 12, 5, 3, '#152018')
      fill(10, 11, 3, 1, '#a2ff00')
    }
  }, [seed, variant, scale])

  return (
    <canvas
      ref={ref}
      className={className}
      role="img"
      aria-label={title ?? `Pixel avatar ${seed}`}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}
