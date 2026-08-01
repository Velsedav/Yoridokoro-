import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import './TodayDashboard.css'

export default function ModulePlaceholder({ module, description }: { module: string; description: string }) {
  const navigate = useNavigate()
  return (
    <section className="yd-placeholder" aria-labelledby="module-title">
      <span className="yd-eyebrow">Yoridokoro · prochain chapitre</span>
      <h1 id="module-title">{module}</h1>
      <p>{description}</p>
      <button className="yd-secondary-button" onClick={() => navigate('/')}><ArrowLeft size={16} /> Revenir à Aujourd’hui</button>
    </section>
  )
}
