import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AccountsProvider } from './accounts/AccountsContext'
import AccountsView from './accounts/AccountsView'
import Layout from './Layout'

export default function App() {
  return (
    <AccountsProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate replace to="/accounts" />} />
            <Route path="/accounts" element={<AccountsView />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AccountsProvider>
  )
}
