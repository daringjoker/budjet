import type { SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 17, ...props }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    ...props,
  }
}

/** Grid of four squares */
export function IconDashboard(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  )
}

/** Arrows left-right */
export function IconTransactions(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M17 4l4 4-4 4" />
      <path d="M21 8H7" />
      <path d="M7 12l-4 4 4 4" />
      <path d="M3 16h14" />
    </svg>
  )
}

/** Wallet */
export function IconAccounts(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  )
}

/** Target / donut */
export function IconBudgets(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Rotate / repeat */
export function IconRecurring(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v5h-5" />
    </svg>
  )
}

/** Bar chart */
export function IconReports(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 21h18" />
      <path d="M7 21V12" />
      <path d="M12 21V6" />
      <path d="M17 21V9" />
    </svg>
  )
}

/** Insights — sparkline with a spark */
export function IconInsights(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 17l5-6 4 3 6-8" />
      <path d="M18 3v4" />
      <path d="M16 5h4" />
      <path d="M3 21h18" />
    </svg>
  )
}

/** Plus */
export function IconPlus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

/** Alert triangle */
export function IconAlert(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10.3 4.06 1.86 18.14A2 2 0 0 0 3.57 21h16.86a2 2 0 0 0 1.71-2.86L13.7 4.06a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}
/** Rules */
export function IconRules(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10.3 4.06 1.86 18.14A2 2 0 0 0 3.57 21h16.86a2 2 0 0 0 1.71-2.86L13.7 4.06a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}
