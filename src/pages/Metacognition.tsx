import { useNavigate } from 'react-router-dom'
import MetacognitionMode from '../components/MetacognitionMode'
import { markMetacognitionComplete } from '../lib/metacognitionStatus'

export default function Metacognition() {
  const navigate = useNavigate()

  function handleComplete() {
    markMetacognitionComplete()
    navigate('/metacognition-logs', { replace: true })
  }

  return (
    <MetacognitionMode
      onComplete={handleComplete}
      onCancel={() => navigate(-1)}
    />
  )
}
