/* ------------------------------------------------------------------ */
/* Merchant rules card                                                 */
/* ------------------------------------------------------------------ */

import { useMemo, useState } from "react"
import { useToast } from "../components/ui/Toast"
import { trpc } from "../trpc"
import EmptyState from "../components/ui/EmptyState"
import ConfirmDialog from "../components/ui/ConfirmDialog"

interface MerchantRule {
  id: number
  pattern: string
  merchant: string
  categoryId: number | null
}

function MerchantRulesCard({
  rules,
  categories,
}: {
  rules: MerchantRule[]
  categories: Array<{ id: number; name: string }>
}) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const [ruleToDelete, setRuleToDelete] = useState<MerchantRule | null>(null)

  const categoryName = useMemo(() => {
    const map = new Map<number, string>()
    categories.forEach(c => map.set(c.id, c.name))
    return map
  }, [categories])

  const deleteRule = trpc.merchants.deleteRule.useMutation({
    onSuccess: () => {
      toast.success('Rule deleted')
      utils.merchants.rules.invalidate()
      setRuleToDelete(null)
    },
    onError: err => {
      toast.error(err.message)
      setRuleToDelete(null)
    },
  })

  return (
    <div className="card">
      <h2 className="card-title">Rules</h2>
      {rules.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Pattern</th>
                <th>Merchant</th>
                <th>Category</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id}>
                  <td
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {r.pattern}
                  </td>
                  <td>
                    <span className="badge">{r.merchant}</span>
                  </td>
                  <td>
                    {r.categoryId !== null && categoryName.has(r.categoryId) ? (
                      categoryName.get(r.categoryId)
                    ) : (
                      <span style={{ color: 'var(--text-dim)' }}>automatic</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setRuleToDelete(r)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No rules yet"
          hint="Tag a transaction to create your first rule"
        />
      )}

      <ConfirmDialog
        open={ruleToDelete !== null}
        title="Delete rule?"
        message="Existing tags stay; future transactions won't be tagged."
        confirmLabel={deleteRule.isPending ? 'Deleting…' : 'Delete'}
        danger
        onConfirm={() => {
          if (ruleToDelete && !deleteRule.isPending) deleteRule.mutate({ id: ruleToDelete.id })
        }}
        onCancel={() => {
          if (!deleteRule.isPending) setRuleToDelete(null)
        }}
      />
    </div>
  )
}

export function Rules() {
  const rules = trpc.merchants.rules.useQuery()
  const categories = trpc.categories.list.useQuery()


  const sortedCategories = useMemo(
    () => [...(categories.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [categories.data]
  )


  return < MerchantRulesCard rules={rules.data ?? []} categories={sortedCategories} />

}
