import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Yoridokoro renderer crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="app-recovery" role="alert">
        <span className="app-recovery-mark" aria-hidden="true">拠</span>
        <p className="app-recovery-kicker">Récupération</p>
        <h1>Quelque chose s’est interrompu.</h1>
        <p>Votre session en cours reste enregistrée localement. Rechargez l’interface pour la reprendre.</p>
        <div>
          <button type="button" onClick={() => window.location.reload()}>Recharger Yoridokoro</button>
          <button type="button" className="is-secondary" onClick={() => { window.location.hash = '#/'; window.location.reload() }}>Revenir à Aujourd’hui</button>
        </div>
        <details><summary>Détail technique</summary><pre>{this.state.error.message}</pre></details>
      </main>
    )
  }
}
