export interface SkeletonProps {
  /** CSS height, defaults to 16 (px) */
  height?: number | string
  /** CSS width, defaults to '100%' */
  width?: number | string
  /** Number of shimmer blocks, defaults to 1 */
  count?: number
}

/** Shimmering placeholder block(s) for loading states. */
export default function Skeleton({ height = 16, width = '100%', count = 1 }: SkeletonProps) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height, width, marginBottom: count > 1 && i < count - 1 ? 8 : undefined }}
        />
      ))}
    </>
  )
}
