import { Router, Route, Navigate } from '@solidjs/router'
import { Layout } from './components/Layout'
import { Config } from './pages/Config'
import { Agent } from './pages/Agent'
import { state } from './state/store'

function Home() {
  return <Navigate href={state.defaultAgentId ? '/agent' : '/config'} />
}

export default function App() {
  return (
    <Router root={Layout}>
      <Route path="/" component={Home} />
      <Route path="/config" component={Config} />
      <Route path="/agent" component={Agent} />
    </Router>
  )
}
