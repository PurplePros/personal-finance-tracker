import { useAccounts } from './AccountsContext'
import type { AccountView, InstitutionGroup } from '../dashboard/deriveDashboard'

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

function InstitutionList({ institutions }: { institutions: InstitutionGroup[] }) {
  return (
    <section className="institutions" aria-label="Accounts by institution">
      {institutions.map((institution) => (
        <article className="institution" key={institution.id}>
          <header className="institution-header">
            <h2>{institution.name}</h2>
            <Balance balance={institution.subtotal} />
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
      ))}
    </section>
  )
}

export default function AccountsView() {
  const { dashboard, institutions, reconnectPrompts, status, error, isReconnecting, refresh, reconnect } = useAccounts()

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

      <p className="status" role="status">{error ?? status}</p>
      {error && (
        <button className="try-again" onClick={() => void refresh()} type="button">
          Try again
        </button>
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
          ? <InstitutionList institutions={dashboard.institutions} />
          : <p className="empty-state">No Canadian accounts to show yet.</p>
      )}
    </div>
  )
}
