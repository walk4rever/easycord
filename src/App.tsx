import './App.css'
import EasyCord from './components/EasyCord'

function App() {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div>
          <div className="app-title">EasyCord</div>
          <div className="app-subtitle">极简录制 · MP4 直出</div>
        </div>
        <div className="status-pill">Ready</div>
      </header>

      <main className="app-main">
        <div className="studio-stage">
          <EasyCord />
        </div>
      </main>
    </div>
  )
}

export default App
