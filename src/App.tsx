import { Router, Route } from '@solidjs/router'
import { Layout } from './components/Layout'
import { Config } from './pages/Config'
import { Agent } from './pages/Agent'

export default function App() {
  return (
    <Router root={Layout}>
      <Route path="/" component={Config} />
      <Route path="/config" component={Config} />
      <Route path="/agent" component={Agent} />
    </Router>
  )
}
