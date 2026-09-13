import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AccountsProvider } from './accounts/AccountsContext'
import AccountsView from './accounts/AccountsView'
import { BudgetProvider } from './budget/BudgetContext'
import BudgetView from './budget/BudgetView'
import Layout from './Layout'
import SettingsView from './settings/SettingsView'
import { SpendingProvider } from './spending/SpendingContext'
import SpendingView from './spending/SpendingView'

export default function App() {
  return (
    <AccountsProvider>
      <SpendingProvider>
        <BudgetProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Navigate replace to="/accounts" />} />
                <Route path="/accounts" element={<AccountsView />} />
                <Route path="/spending" element={<SpendingView />} />
                <Route path="/budget" element={<BudgetView />} />
                <Route path="/settings" element={<SettingsView />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </BudgetProvider>
      </SpendingProvider>
    </AccountsProvider>
  )
}
