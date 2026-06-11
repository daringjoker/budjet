export interface SpinnerProps {
  /** Diameter in px, defaults to 18 */
  size?: number
  /** Wrap in a centered, padded container */
  center?: boolean
}

/** Small CSS spinner. */
export default function Spinner({ size = 18, center = false }: SpinnerProps) {
  const el = <div className="spinner" style={size !== 18 ? { width: size, height: size } : undefined} aria-label="Loading" />
  if (center) return <div className="spinner-center">{el}</div>
  return el
}
