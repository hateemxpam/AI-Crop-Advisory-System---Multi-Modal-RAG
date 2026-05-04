import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import './index.css'

function formatResponse(text) {
  return text.replace(/\*\*(.*?)\*\*/g, '$1').trim()
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  const isSystem = msg.role === 'system'

  if (isSystem) {
    return <div className="system-msg"><span>{msg.content}</span></div>
  }

  return (
    <div className={`bubble-row ${isUser ? 'user-row' : 'ai-row'}`}>
      <div className={`avatar ${isUser ? 'user-avatar' : 'ai-avatar'}`}>
        {isUser ? '🧑‍🌾' : '🌱'}
      </div>
      <div className={`bubble ${isUser ? 'user-bubble' : 'ai-bubble'}`}>
        {msg.imagePreview && (
          <img src={msg.imagePreview} alt="uploaded crop" className="preview-img" />
        )}
        {msg.detection && (
          <div className="detection-badge">
            <span>🔬 Crop: <strong>{msg.detection.crop}</strong></span>
            <span>Status: <strong>{msg.detection.status}</strong></span>
            {msg.detection.disease !== 'None' && (
              <span>Disease: <strong>{msg.detection.disease}</strong></span>
            )}
          </div>
        )}
        <pre className="bubble-text">{formatResponse(msg.content)}</pre>
        <span className="timestamp">{msg.time}</span>
      </div>
    </div>
  )
}

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'system', content: 'Welcome! Ask a crop question or upload an image for disease detection.' },
  ])
  const [input, setInput] = useState('')
  const [language, setLanguage] = useState('en')
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)

  const bottomRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function getTime() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function addMessage(msg) {
    setMessages(prev => [...prev, { ...msg, time: getTime() }])
  }

  function handleImageSelect(e) {
    const file = e.target.files[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function sendTextQuery() {
    const query = input.trim()
    if (!query) return
    addMessage({ role: 'user', content: query })
    setInput('')
    setLoading(true)
    try {
      const { data } = await axios.post('/api/query', {
        query,
        language,
        location: location.trim() || undefined,
      })
      addMessage({ role: 'ai', content: data.data.response })
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to get a response. Please try again.'
      addMessage({ role: 'ai', content: `⚠️ ${msg}` })
    } finally {
      setLoading(false)
    }
  }

  async function sendImageQuery() {
    if (!imageFile) return
    addMessage({ role: 'user', content: `Uploaded: ${imageFile.name}`, imagePreview })
    const savedPreview = imagePreview
    clearImage()
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('image', imageFile)
      formData.append('language', language)
      if (location.trim()) formData.append('location', location.trim())
      const { data } = await axios.post('/api/image-query', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      addMessage({ role: 'ai', content: data.data.response, detection: data.data.detection })
    } catch (err) {
      const msg = err.response?.data?.error || 'Image analysis failed. Please try again.'
      addMessage({ role: 'ai', content: `⚠️ ${msg}` })
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendTextQuery()
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">🌾</span>
            <div>
              <h1 className="logo-title">AI Crop Advisory</h1>
              <p className="logo-sub">Powered by RAG · Groq · HuggingFace</p>
            </div>
          </div>
          <div className="header-controls">
            <select className="select" value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="en">🌐 English</option>
              <option value="ur">اردو Urdu</option>
              <option value="pa">پنجابی Punjabi</option>
            </select>
            <input
              className="location-input"
              type="text"
              placeholder="📍 City (optional)"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </div>
        </div>
      </header>

      <main className="chat-window">
        {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
        {loading && (
          <div className="bubble-row ai-row">
            <div className="avatar ai-avatar">🌱</div>
            <div className="bubble ai-bubble loading-bubble">
              <span className="dot" /><span className="dot" /><span className="dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {imagePreview && (
        <div className="image-strip">
          <img src={imagePreview} alt="preview" className="strip-preview" />
          <div className="strip-info">
            <span className="strip-name">{imageFile?.name}</span>
            <button className="strip-remove" onClick={clearImage}>✕ Remove</button>
          </div>
          <button className="btn btn-primary" onClick={sendImageQuery} disabled={loading}>
            🔬 Analyze Image
          </button>
        </div>
      )}

      <footer className="input-bar">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/jpeg,image/png,image/webp"
          onChange={handleImageSelect}
          style={{ display: 'none' }}
        />
        <button className="btn btn-icon" onClick={() => fileInputRef.current?.click()} disabled={loading} title="Upload image">
          📷
        </button>
        <textarea
          className="chat-input"
          rows={1}
          placeholder="Ask a crop question..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button className="btn btn-primary" onClick={sendTextQuery} disabled={loading || !input.trim()}>
          Send
        </button>
      </footer>
    </div>
  )
}
