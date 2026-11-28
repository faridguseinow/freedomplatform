import { AppProviders } from './app/providers/AppProviders'
import { AppRouter } from './app/router/AppRouter'
import { publicEnv } from './lib/env'
import { EnvironmentErrorPage } from './pages/EnvironmentErrorPage'

function App() {
  if (!publicEnv.isValid) {
    return <EnvironmentErrorPage missingKeys={publicEnv.missingKeys} />
  }

  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  )
}

export default App
