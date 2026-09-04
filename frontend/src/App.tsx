import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AccountsProvider } from './accounts/AccountsContext'
import AccountsView from './accounts/AccountsView'
import Layout from './Layout'
import { SpendingProvider } from './spending/SpendingContext'
import SpendingView from './spending/SpendingView'

export default function App() {
  return (
    <AccountsProvider>
      <SpendingProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Navigate replace to="/accounts" />} />
              <Route path="/accounts" element={<AccountsView />} />
              <Route path="/spending" element={<SpendingView />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SpendingProvider>
    </AccountsProvider>
  )
}
