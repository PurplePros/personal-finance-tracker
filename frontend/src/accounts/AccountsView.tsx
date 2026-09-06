import { useAccounts } from './AccountsContext'
import type { Institution } from '../api/types'
import type { AccountView, InstitutionGroup } from '../dashboard/deriveDashboard'

// Plaid update-mode Link is opened with item_id when available; institution id
// is the fallback for items whose plaid_item_id hasn't been populated yet (this
// path predates account_selection_enabled and triggers a fresh link flow).
type ManageOpts = { itemId: string; institutionId?: never } | { institutionId: string; itemId?: never }

const currency = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })

function formatBalance(balance: number) {
  return currency.format(balance / 100)
}

function Balance({
  balance,
  className,
  as: Tag = 'strong',
}: {
  balance: number
  className?: string
  as?: 'p' | 'strong'
}) {
  const isLiability = balance < 0
  return (
    <Tag className={[className, isLiability ? 'liability' : 'asset'].filter(Boolean).join(' ')}>
      {isLiability ? `−${formatBalance(-balance)}` : formatBalance(balance)}
    </Tag>
  )
}

function AccountRow({ account }: { account: AccountView }) {
  return (
    <li className="account-row">
      <span>{account.name}</span>
      <Balance balance={account.balance} />
    </li>
  )
}

function InstitutionList({
  institutions,
  rawInstitutions,
  isReconnecting,
  onManage,
}: {
  institutions: InstitutionGroup[]
  rawInstitutions: Institution[]
  isReconnecting: boolean
  onManage: (opts: ManageOpts) => void
}) {
  return (
    <section className="institutions" aria-label="Accounts by institution">
      {institutions.map((institution) => {
        const raw = rawInstitutions.find((i) => i.id === institution.id)
        const manageOpts: ManageOpts | null = raw
          ? raw.plaid_item_id
            ? { itemId: raw.plaid_item_id }
            : { institutionId: raw.id }
          : null
        return (
        <article className="institution" key={institution.id}>
          <header className="institution-header">
            <h2>{institution.name}</h2>
            <Balance balance={institution.subtotal} />
            {manageOpts && (
              <button
                className="manage-accounts-btn"
                disabled={isReconnecting}
                onClick={() => onManage(manageOpts)}
                type="button"
              >
                Manage accounts
              </button>
            )}
          </header>

          {institution.accounts.length > 0 && (
            <ul className="account-list">
              {institution.accounts.map((account) => (
                <AccountRow account={account} key={account.id} />
              ))}
            </ul>
          )}

          {institution.investments.length > 0 && (
            <section className="investments" aria-label={`${institution.name} investments`}>
              <p>Investments</p>
              <ul className="account-list">
                {institution.investments.flatMap((product) =>
                  product.accounts.map((account) => (
                    <AccountRow account={account} key={account.id} />
                  )),
                )}
              </ul>
            </section>
          )}
        </article>
        )
      })}
    </section>
  )
}

export default function AccountsView() {
  const { dashboard, institutions, reconnectPrompts, isReconnecting, reconnect } = useAccounts()

  return (
    <div className="accounts-view">
      {dashboard && (
        <section className="net-worth-card" aria-label="Net worth summary">
          <p className="net-worth-label">Net worth</p>
          <Balance as="p" balance={dashboard.netWorth} className="net-worth" />
          <dl className="totals">
            <div><dt>Assets</dt><dd>{formatBalance(dashboard.totalAssets)}</dd></div>
            <div><dt>Liabilities</dt><dd>{formatBalance(dashboard.totalLiabilities)}</dd></div>
          </dl>
        </section>
      )}

      {reconnectPrompts.length > 0 && (
        <div className="reconnect-prompts">
          {reconnectPrompts.map((r) => {
            const institution = institutions.find((i) => i.id === r.institution_id)
            const reconnectOpts = institution
              ? institution.plaid_item_id
                ? { itemId: institution.plaid_item_id }
                : { institutionId: institution.id }
              : null
            return (
              <div className="reconnect-prompt" key={r.institution_id ?? r.institution}>
                <span>{r.institution} needs to be reconnected.</span>
                {reconnectOpts && (
                  <button disabled={isReconnecting} onClick={() => void reconnect(reconnectOpts)} type="button">
                    {isReconnecting ? 'Reconnecting…' : `Reconnect ${r.institution}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {dashboard && (
        dashboard.institutions.length > 0
          ? <InstitutionList
              institutions={dashboard.institutions}
              rawInstitutions={institutions}
              isReconnecting={isReconnecting}
              onManage={(opts: ManageOpts) => void reconnect(opts)}
            />
          : <p className="empty-state">No accounts to show yet.</p>
      )}
    </div>
  )
}
