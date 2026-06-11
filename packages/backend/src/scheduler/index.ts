export class Scheduler {
  private timers: NodeJS.Timeout[] = []

  daily(hour: number, fn: () => Promise<void>) {
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
    this.timers.forEach(t => clearTimeout(t))
    this.timers = []
  }
}
