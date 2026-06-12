export class Scheduler {
  private timers: NodeJS.Timeout[] = []
  private stopped = false

  daily(hour: number, fn: () => Promise<unknown>) {
    if (this.stopped) return
    const now = new Date()
    const next = new Date(now)
    next.setHours(hour, 0, 0, 0)
    if (next <= now) next.setDate(next.getDate() + 1)
    const delay = next.getTime() - now.getTime()

    const timeout = setTimeout(() => {
      fn().catch(console.error)
      this.daily(hour, fn) // reschedule
    }, delay)

    this.timers.push(timeout)
  }

  stop() {
    this.stopped = true
    this.timers.forEach(t => clearTimeout(t))
    this.timers = []
  }
}
