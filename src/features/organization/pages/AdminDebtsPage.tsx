import { Banknote, CreditCard, HandCoins, Loader2, Pencil, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { useAuth } from '../../../hooks/useAuth'
import { getCurrentLocale } from '../../../lib/i18n/translator'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { getTenantRoutePath } from '../../../lib/routing/appHost'
import type { CustomerDebtRow, CustomerDebtStatus, PaymentMethod } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { useCustomerDebts, useDebtMutations } from '../../debts/debtsApi'

type DebtFilter = CustomerDebtStatus | 'all'

const formatMoney = (value: number) =>
  `${new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 2 }).format(value)} AZN`

const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat(getCurrentLocale()).format(new Date(`${value}T00:00:00`)) : '—'

const statusClass: Record<CustomerDebtStatus, string> = {
  open: 'bg-red-50 text-red-700',
  partial: 'bg-amber-50 text-amber-800',
  paid: 'bg-emerald-50 text-emerald-800',
  written_off: 'bg-slate-100 text-slate-600',
}

const statusKey: Record<CustomerDebtStatus, string> = {
  open: 'debt.open',
  partial: 'debt.partial',
  paid: 'debt.paid',
  written_off: 'debt.writtenOff',
}

export function AdminDebtsPage() {
  const { currentOrganization, organizationId } = useAuth()
  const { t } = useI18n()
  const debtsQuery = useCustomerDebts(organizationId)
  const debtMutations = useDebtMutations(organizationId)
  const [filter, setFilter] = useState<DebtFilter>('all')
  const [search, setSearch] = useState('')
  const [paymentDebt, setPaymentDebt] = useState<CustomerDebtRow | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentComment, setPaymentComment] = useState('')
  const [editDebt, setEditDebt] = useState<CustomerDebtRow | null>(null)
  const [editCustomerName, setEditCustomerName] = useState('')
  const [editCustomerPhone, setEditCustomerPhone] = useState('')
  const [editDueOn, setEditDueOn] = useState('')
  const [editComment, setEditComment] = useState('')
  const [deleteDebt, setDeleteDebt] = useState<CustomerDebtRow | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const debts = useMemo(() => debtsQuery.data ?? [], [debtsQuery.data])
  const today = new Date().toISOString().slice(0, 10)

  const visibleDebts = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return debts.filter((debt) => {
      if (filter !== 'all' && debt.status !== filter) return false
      if (!needle) return true
      return [debt.customer_name, debt.customer_phone, String(debt.order_number_snapshot), debt.comment]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [debts, filter, search])

  const summary = useMemo(() => ({
    outstanding: debts.reduce((sum, debt) => sum + Number(debt.balance_amount), 0),
    recorded: debts.reduce((sum, debt) => sum + Number(debt.original_amount), 0),
    overdue: debts.filter((debt) => debt.due_on && debt.due_on < today && debt.balance_amount > 0).length,
  }), [debts, today])

  const openPayment = (debt: CustomerDebtRow) => {
    setPaymentDebt(debt)
    setPaymentAmount(String(debt.balance_amount))
    setPaymentMethod('cash')
    setPaymentComment('')
    setError(null)
  }

  const submitPayment = async () => {
    if (!paymentDebt) return
    const amount = Number(paymentAmount.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0 || amount > paymentDebt.balance_amount) {
      setError(`${t('debt.paymentAmount')}: 0.01–${formatMoney(paymentDebt.balance_amount)}`)
      return
    }
    setError(null)
    try {
      await debtMutations.receivePayment.mutateAsync({
        debtId: paymentDebt.id,
        amount,
        method: paymentMethod,
        comment: paymentComment.trim() || null,
      })
      setPaymentDebt(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Операция не выполнена.')
    }
  }

  const openEdit = (debt: CustomerDebtRow) => {
    setEditDebt(debt)
    setEditCustomerName(debt.customer_name)
    setEditCustomerPhone(debt.customer_phone)
    setEditDueOn(debt.due_on ?? '')
    setEditComment(debt.comment ?? '')
    setError(null)
  }

  const submitEdit = async () => {
    if (!editDebt || editCustomerName.trim().length < 2 || editCustomerPhone.trim().length < 5) return
    setError(null)
    try {
      await debtMutations.update.mutateAsync({
        debtId: editDebt.id,
        customerName: editCustomerName.trim(),
        customerPhone: editCustomerPhone.trim(),
        dueOn: editDueOn || null,
        comment: editComment.trim() || null,
      })
      setEditDebt(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Операция не выполнена.')
    }
  }

  const openDelete = (debt: CustomerDebtRow) => {
    setDeleteDebt(debt)
    setDeleteReason('')
    setError(null)
  }

  const submitDelete = async () => {
    if (!deleteDebt || deleteReason.trim().length < 3) return
    setError(null)
    try {
      await debtMutations.remove.mutateAsync({ debtId: deleteDebt.id, reason: deleteReason.trim() })
      setDeleteDebt(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Операция не выполнена.')
    }
  }

  const adminOrderPath = (orderId: string) =>
    getTenantRoutePath(`/admin/orders/${orderId}`, currentOrganization?.slug)

  return (
    <section className="grid gap-5">
      <header className="grid gap-1">
        <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">{t('debt.pageTitle')}</h2>
        <p className="text-sm text-slate-600">{t('debt.pageDescription')}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <article className="rounded-lg border border-red-200 bg-red-50/50 p-4">
          <p className="text-xs font-semibold uppercase text-red-700">{t('debt.outstanding')}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatMoney(summary.outstanding)}</p>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">{t('debt.totalRecorded')}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatMoney(summary.recorded)}</p>
        </article>
        <article className="col-span-2 rounded-lg border border-amber-200 bg-amber-50/50 p-4 lg:col-span-1">
          <p className="text-xs font-semibold uppercase text-amber-800">{t('debt.overdue')}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.overdue}</p>
        </article>
      </div>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:grid-cols-[1fr_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input className="min-h-11 w-full rounded-md border border-slate-200 pl-10 pr-3 text-sm outline-none focus:border-emerald-700" onChange={(event) => setSearch(event.target.value)} placeholder={t('debt.search')} type="search" value={search} />
        </label>
        <div className="flex flex-wrap gap-2">
          {(['all', 'open', 'partial', 'paid'] as const).map((item) => (
            <button className={cn('min-h-10 rounded-md border px-3 text-sm font-medium', filter === item ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600')} key={item} onClick={() => setFilter(item)} type="button">
              {item === 'all' ? t('debt.all') : t(statusKey[item])}
            </button>
          ))}
        </div>
      </div>

      {debtsQuery.isLoading ? (
        <div className="flex min-h-32 items-center justify-center"><Loader2 className="size-5 animate-spin text-emerald-700" /></div>
      ) : visibleDebts.length ? (
        <div className="grid gap-3">
          <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="min-w-[940px] w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-3">{t('debt.customer')}</th>
                    <th className="px-3 py-3">{t('debt.order')}</th>
                    <th className="px-3 py-3">{t('debt.status')}</th>
                    <th className="px-3 py-3">{t('debt.incurredOn')}</th>
                    <th className="px-3 py-3">{t('debt.dueOn')}</th>
                    <th className="px-3 py-3 text-right">{t('debt.remaining')}</th>
                    <th className="px-3 py-3 text-right">{t('debt.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleDebts.map((debt) => {
                    const overdue = Boolean(debt.due_on && debt.due_on < today && debt.balance_amount > 0)
                    const active = debt.status === 'open' || debt.status === 'partial'
                    return (
                      <tr className="cursor-pointer hover:bg-slate-50" key={debt.id} onClick={() => active && openEdit(debt)}>
                        <td className="px-3 py-3"><p className="font-semibold text-slate-950">{debt.customer_name}</p><p className="mt-0.5 text-xs text-slate-500">{debt.customer_phone}</p></td>
                        <td className="px-3 py-3"><Link className="font-medium text-emerald-700 hover:underline" onClick={(event) => event.stopPropagation()} to={adminOrderPath(debt.order_id)}>#{debt.order_number_snapshot}</Link></td>
                        <td className="px-3 py-3"><span className={cn('rounded-md px-2 py-1 text-xs font-semibold', statusClass[debt.status])}>{t(statusKey[debt.status])}</span></td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatDate(debt.incurred_on)}</td>
                        <td className={cn('whitespace-nowrap px-3 py-3', overdue ? 'font-semibold text-red-700' : 'text-slate-700')}>{formatDate(debt.due_on)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right"><p className="font-semibold text-slate-950">{formatMoney(debt.balance_amount)}</p><p className="text-xs text-slate-500">{formatMoney(debt.paid_amount)} / {formatMoney(debt.original_amount)}</p></td>
                        <td className="px-3 py-3"><div className="flex justify-end gap-1.5">
                          {active ? <Button aria-label={t('debt.edit')} className="size-9 min-h-9 px-0" onClick={(event) => { event.stopPropagation(); openEdit(debt) }} type="button" variant="secondary"><Pencil className="size-4" /></Button> : null}
                          {active ? <Button aria-label={t('debt.receivePayment')} className="size-9 min-h-9 px-0" onClick={(event) => { event.stopPropagation(); openPayment(debt) }} type="button"><HandCoins className="size-4" /></Button> : null}
                          {active && debt.paid_amount <= 0 ? <Button aria-label={t('debt.delete')} className="size-9 min-h-9 px-0" onClick={(event) => { event.stopPropagation(); openDelete(debt) }} type="button" variant="danger"><Trash2 className="size-4" /></Button> : null}
                        </div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-3 md:hidden">
            {visibleDebts.map((debt) => {
              const overdue = Boolean(debt.due_on && debt.due_on < today && debt.balance_amount > 0)
              const active = debt.status === 'open' || debt.status === 'partial'
              return (
                <article className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={debt.id}>
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold text-slate-950">{debt.customer_name}</h3><a className="mt-1 block text-sm text-slate-600" href={`tel:${debt.customer_phone}`}>{debt.customer_phone}</a></div><span className={cn('shrink-0 rounded-md px-2 py-1 text-xs font-semibold', statusClass[debt.status])}>{t(statusKey[debt.status])}</span></div>
                  <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs uppercase text-slate-500">{t('debt.order')}</p><Link className="mt-1 inline-block font-medium text-emerald-700" to={adminOrderPath(debt.order_id)}>#{debt.order_number_snapshot}</Link></div><div><p className="text-xs uppercase text-slate-500">{t('debt.remaining')}</p><p className="mt-1 font-semibold text-slate-950">{formatMoney(debt.balance_amount)}</p></div><div><p className="text-xs uppercase text-slate-500">{t('debt.incurredOn')}</p><p className="mt-1 text-slate-700">{formatDate(debt.incurred_on)}</p></div><div><p className="text-xs uppercase text-slate-500">{t('debt.dueOn')}</p><p className={cn('mt-1', overdue ? 'font-semibold text-red-700' : 'text-slate-700')}>{formatDate(debt.due_on)}</p></div></div>
                  {debt.comment ? <p className="text-sm text-slate-500">{debt.comment}</p> : null}
                  {active ? <div className="grid grid-cols-3 gap-2"><Button onClick={() => openEdit(debt)} type="button" variant="secondary"><Pencil className="size-4" /><span className="sr-only">{t('debt.edit')}</span></Button><Button onClick={() => openPayment(debt)} type="button"><HandCoins className="size-4" /><span className="sr-only">{t('debt.receivePayment')}</span></Button><Button disabled={debt.paid_amount > 0} onClick={() => openDelete(debt)} title={debt.paid_amount > 0 ? t('debt.cannotDeletePaid') : t('debt.delete')} type="button" variant="danger"><Trash2 className="size-4" /><span className="sr-only">{t('debt.delete')}</span></Button></div> : null}
                </article>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">{t('debt.noRows')}</div>
      )}

      {editDebt ? (
        <Modal onClose={() => setEditDebt(null)}>
          <section className="grid w-full max-w-lg gap-4 rounded-xl bg-white p-5 shadow-xl">
            <div><h3 className="text-lg font-semibold text-slate-950">{t('debt.editTitle')}</h3><p className="mt-1 text-sm text-slate-600">{t('debt.order')} #{editDebt.order_number_snapshot} · {formatMoney(editDebt.balance_amount)}</p></div>
            {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>{t('debt.customerName')}</span><input autoFocus className="min-h-11 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-emerald-700" onChange={(event) => setEditCustomerName(event.target.value)} value={editCustomerName} /></label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>{t('debt.customerPhone')}</span><input className="min-h-11 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-emerald-700" inputMode="tel" onChange={(event) => setEditCustomerPhone(event.target.value)} type="tel" value={editCustomerPhone} /></label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2"><span>{t('debt.dueOn')}</span><input className="min-h-11 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-emerald-700" min={editDebt.incurred_on} onChange={(event) => setEditDueOn(event.target.value)} type="date" value={editDueOn} /></label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2"><span>{t('debt.comment')}</span><textarea className="min-h-24 resize-none rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-700" onChange={(event) => setEditComment(event.target.value)} value={editComment} /></label>
            </div>
            <div className="grid grid-cols-2 gap-2"><Button disabled={debtMutations.update.isPending} onClick={() => setEditDebt(null)} type="button" variant="secondary">{t('employeeShift.cancelAction')}</Button><Button disabled={debtMutations.update.isPending || editCustomerName.trim().length < 2 || editCustomerPhone.trim().length < 5} onClick={submitEdit} type="button">{debtMutations.update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}{t('debt.saveChanges')}</Button></div>
          </section>
        </Modal>
      ) : null}

      {deleteDebt ? (
        <Modal onClose={() => setDeleteDebt(null)}>
          <section className="grid w-full max-w-md gap-4 rounded-xl bg-white p-5 shadow-xl">
            <div><h3 className="text-lg font-semibold text-slate-950">{t('debt.deleteTitle')}</h3><p className="mt-1 text-sm leading-5 text-slate-600">{t('debt.deleteDescription')}</p></div>
            {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"><p className="font-semibold text-slate-950">{deleteDebt.customer_name} · {formatMoney(deleteDebt.balance_amount)}</p><p className="mt-0.5 text-slate-500">{t('debt.order')} #{deleteDebt.order_number_snapshot}</p></div>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>{t('debt.deleteReason')}</span><textarea autoFocus className="min-h-24 resize-none rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-600" onChange={(event) => setDeleteReason(event.target.value)} placeholder={t('debt.deleteReasonPlaceholder')} value={deleteReason} /></label>
            <div className="grid grid-cols-2 gap-2"><Button disabled={debtMutations.remove.isPending} onClick={() => setDeleteDebt(null)} type="button" variant="secondary">{t('employeeShift.cancelAction')}</Button><Button disabled={debtMutations.remove.isPending || deleteReason.trim().length < 3} onClick={submitDelete} type="button" variant="danger">{debtMutations.remove.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}{t('debt.delete')}</Button></div>
          </section>
        </Modal>
      ) : null}

      {paymentDebt ? (
        <Modal onClose={() => setPaymentDebt(null)}>
          <section className="grid w-full max-w-md gap-4 rounded-xl bg-white p-5 shadow-xl">
            <div><h3 className="text-lg font-semibold text-slate-950">{t('debt.paymentTitle')}</h3><p className="mt-1 text-sm text-slate-600">{paymentDebt.customer_name} · {t('debt.remaining')}: {formatMoney(paymentDebt.balance_amount)}</p></div>
            {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>{t('debt.paymentAmount')}</span><input autoFocus className="min-h-11 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-emerald-700" inputMode="decimal" max={paymentDebt.balance_amount} min="0.01" onChange={(event) => setPaymentAmount(event.target.value)} step="0.01" type="number" value={paymentAmount} /></label>
            <div className="grid gap-1.5"><span className="text-sm font-medium text-slate-700">{t('debt.paymentMethod')}</span><div className="grid grid-cols-2 gap-2"><Button onClick={() => setPaymentMethod('cash')} type="button" variant={paymentMethod === 'cash' ? 'primary' : 'secondary'}><Banknote className="size-4" />{t('debt.cash')}</Button><Button onClick={() => setPaymentMethod('card_transfer')} type="button" variant={paymentMethod === 'card_transfer' ? 'primary' : 'secondary'}><CreditCard className="size-4" />{t('debt.card')}</Button></div></div>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>{t('debt.comment')}</span><textarea className="min-h-20 resize-none rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-700" onChange={(event) => setPaymentComment(event.target.value)} value={paymentComment} /></label>
            <div className="grid grid-cols-2 gap-2"><Button disabled={debtMutations.receivePayment.isPending} onClick={() => setPaymentDebt(null)} type="button" variant="secondary">{t('employeeShift.cancelAction')}</Button><Button disabled={debtMutations.receivePayment.isPending} onClick={submitPayment} type="button">{debtMutations.receivePayment.isPending ? <Loader2 className="size-4 animate-spin" /> : <HandCoins className="size-4" />}{t('debt.receivePayment')}</Button></div>
          </section>
        </Modal>
      ) : null}
    </section>
  )
}
