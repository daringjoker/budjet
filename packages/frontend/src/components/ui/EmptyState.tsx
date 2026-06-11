import type { ReactNode } from 'react'

export interface EmptyStateProps {
  /** Optional icon element (e.g. an icon from components/icons) */
  icon?: ReactNode
  title: string
  hint?: string
}

/** Centered empty-state placeholder with optional icon and hint. */
export default function EmptyState({ icon, title, hint }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{title}</div>
      {hint && <div className="empty-hint">{hint}</div>}
    </div>
  )
}
