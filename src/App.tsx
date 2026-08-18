import { Router, Route, Navigate } from '@solidjs/router'
import { Layout } from './components/Layout'
import { Config } from './pages/Config'
import { Agent } from './pages/Agent'
import { state } from './state/store'

const base =
  import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/+$/, '')

function Home() {
  return <Navigate href={state.defaultAgentId ? '/agent' : '/config'} />
}

export default function App() {
  return (
    <Router root={Layout} base={base}>
      <Route path="/" component={Home} />
      <Route path="/config" component={Config} />
      <Route path="/agent" component={Agent} />
      <Route path="*" component={Home} />
    </Router>
  )
}
