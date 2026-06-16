import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './index.css';

function stripMarkdown(text) {
  if (!text) return text;
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^[\-\*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function ConfidenceMeter({ value, isHigh }) {
  return (
    <div className="confidence-track">
      <div
        className="confidence-fill"
        style={{
          width: `${value}%`,
          background: isHigh
            ? 'linear-gradient(90deg, #22c55e, #4ade80)'
            : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
        }}
      />
    </div>
  );
}

function LoadingPulse() {
  return (
    <div className="loading-pulse">
      <div className="pulse-ring" />
      <div className="pulse-ring delay1" />
      <div className="pulse-ring delay2" />
      <span className="pulse-label">AI is analysing your crop…</span>
    </div>
  );
}

function ResponseRenderer({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className="response-body">
      {lines.map((line, i) => {
        if (line.trim() === '---') return <div key={i} className="resp-divider" />;
        if (line.trim() === '') return <div key={i} className="resp-spacer" />;
        const isHeader = /^[🌾💡⚠️🌱🔴🌿]/.test(line) && line.includes(':');
        if (isHeader) return <div key={i} className="resp-header">{line}</div>;
        if (line.startsWith('- ')) {
          return (
            <div key={i} className="resp-bullet">
              <span className="bullet-dot" />
              <span>{line.slice(2)}</span>
            </div>
          );
        }
        return <div key={i} className="resp-text">{line}</div>;
      })}
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState('en');
  const [location, setLocation] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [status, setStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [response, setResponse] = useState('');
  const [detection, setDetection] = useState(null);
  const [visionAnalysis, setVisionAnalysis] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('advice'); // 'advice' | 'vision' | 'detection'
  const fileInputRef = useRef(null);
  const resultRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const clearAll = () => {
    setQuery(''); setLanguage('en'); setLocation('');
    setImageFile(null); setImagePreview(null);
    setStatus(null); setResponse('');
    setDetection(null); setVisionAnalysis(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!query.trim() && !imageFile) {
      setStatus('error');
      setResponse('Please provide a question or upload a crop image.');
      return;
    }
    setIsProcessing(true);
    setStatus('loading');
    setResponse(''); setDetection(null); setVisionAnalysis(null);
    setActiveTab('advice');

    try {
      let res;
      if (imageFile) {
        const fd = new FormData();
        fd.append('image', imageFile);
        fd.append('language', language);
        if (location.trim()) fd.append('location', location.trim());
        res = await axios.post('/api/image-query', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (res.data.success) {
          setDetection(res.data.data.detection || null);
          setVisionAnalysis(res.data.data.visionAnalysis || null);
        }
      } else {
        res = await axios.post('/api/query', {
          query: query.trim(), language, location: location.trim(),
        });
      }

      if (res.data.success) {
        setStatus('success');
        setResponse(res.data.data.response || '');
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else {
        throw new Error(res.data.error || 'Request failed');
      }
    } catch (err) {
      const d = err.response?.data || {};
      setStatus('error');
      setResponse(d.details || d.error || err.message || 'An unexpected error occurred.');
    } finally {
      setIsProcessing(false);
    }
  };

  const hasResults = status === 'success' || status === 'error';
  const tabsVisible = hasResults && (detection || visionAnalysis);

  return (
    <div className="root">
      {/* Animated background blobs */}
      <div className="bg-blob blob1" />
      <div className="bg-blob blob2" />
      <div className="bg-blob blob3" />

      <div className="page">
        {/* ── HERO NAV ── */}
        <nav className="nav">
          <div className="nav-logo">
            <span className="logo-icon">🌿</span>
            <span className="logo-text">CropMind<span className="logo-ai"> AI</span></span>
          </div>
          <div className="nav-pills">
            <span className="nav-pill">Multi-Modal RAG</span>
            <span className="nav-pill">Local Inference</span>
            <span className="nav-pill active">Vision + LLM</span>
          </div>
        </nav>

        {/* ── HERO HEADING ── */}
        <div className="hero">
          <div className="hero-badge">🚀 Powered by Llama 4 Scout Vision + FAISS RAG</div>
          <h1 className="hero-title">
            AI-Powered<br />
            <span className="gradient-text">Crop Advisory</span>
          </h1>
          <p className="hero-sub">
            Upload a photo or describe your crop problem. Our AI vision model analyses symptoms
            in real-time and generates grounded, expert-level treatment advice.
          </p>
        </div>

        {/* ── MAIN PANEL ── */}
        <div className="panel">
          {/* LEFT: Input */}
          <div className="glass-card input-card">
            <div className="card-label">📝 Input</div>

            {/* Question */}
            <div className="field">
              <label className="field-label">Your Question <span className="optional">(optional with image)</span></label>
              <textarea
                className="field-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. My wheat leaves have orange powder, what should I do?"
                rows={3}
                disabled={isProcessing}
              />
            </div>

            {/* Upload zone */}
            <div className="field">
              <label className="field-label">Crop Photo <span className="optional">(optional)</span></label>
              <div
                className={`drop-zone ${imagePreview ? 'has-image' : ''}`}
                onClick={() => !isProcessing && fileInputRef.current.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <input type="file" ref={fileInputRef} accept="image/*" hidden onChange={handleImageUpload} disabled={isProcessing} />
                {imagePreview ? (
                  <div className="drop-preview">
                    <img src={imagePreview} alt="crop" className="preview-img" />
                    <div className="preview-overlay">
                      <span>Click to change</span>
                    </div>
                  </div>
                ) : (
                  <div className="drop-placeholder">
                    <div className="drop-icon">📷</div>
                    <div className="drop-title">Drop image here or click to browse</div>
                    <div className="drop-sub">JPG, PNG, WebP • Vision AI analyses symptoms directly</div>
                  </div>
                )}
              </div>
            </div>

            {/* Controls row */}
            <div className="controls-row">
              <div className="field half">
                <label className="field-label">🌐 Language</label>
                <select className="field-input" value={language} onChange={(e) => setLanguage(e.target.value)} disabled={isProcessing}>
                  <option value="en">English</option>
                  <option value="ur">اردو Urdu</option>
                  <option value="pa">پنجابی Punjabi</option>
                </select>
              </div>
              <div className="field half">
                <label className="field-label">🌤 City <span className="optional">(weather)</span></label>
                <input
                  className="field-input"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Lahore"
                  disabled={isProcessing}
                />
              </div>
            </div>

            {/* CTA */}
            <button
              className={`cta-btn ${isProcessing ? 'processing' : ''}`}
              onClick={handleSubmit}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <><span className="btn-spinner" /><span>Analysing…</span></>
              ) : (
                <><span>⚡</span><span>Get Expert Advice</span></>
              )}
            </button>
            {(response || detection) && (
              <button className="clear-btn" onClick={clearAll} disabled={isProcessing}>
                ↩ Clear &amp; Reset
              </button>
            )}
          </div>

          {/* RIGHT: Results */}
          <div className="glass-card result-card" ref={resultRef}>
            <div className="card-label">📊 Analysis</div>

            {/* Empty state */}
            {!status && (
              <div className="empty-state">
                <div className="empty-icon">🌱</div>
                <div className="empty-title">Ready to analyse</div>
                <div className="empty-sub">Ask a question or upload a crop photo to get started</div>
                <div className="feature-pills">
                  <span className="fpill">🤖 MobileNetV2 Classifier</span>
                  <span className="fpill">👁 Llama 4 Vision LLM</span>
                  <span className="fpill">📚 FAISS RAG Knowledge</span>
                  <span className="fpill">🌦 Live Weather Context</span>
                </div>
              </div>
            )}

            {/* Loading */}
            {status === 'loading' && <LoadingPulse />}

            {/* Results */}
            {hasResults && (
              <div className="results-wrapper">
                {/* Detection summary strip */}
                {detection && (
                  <div className={`detect-strip ${detection.isHighConfidence ? 'high' : 'low'}`}>
                    <div className="detect-left">
                      <span className="detect-icon">{detection.isHighConfidence ? '✅' : '⚠️'}</span>
                      <div className="detect-info">
                        <div className="detect-name">
                          {detection.crop}
                          {detection.disease !== 'None' && <span className="detect-disease"> · {detection.disease}</span>}
                        </div>
                        <div className="detect-meta">
                          {detection.status} · Local AI Classifier · {detection.confidence}% confidence
                          {!detection.isHighConfidence && ' · Vision model override active'}
                        </div>
                      </div>
                    </div>
                    <ConfidenceMeter value={detection.confidence} isHigh={detection.isHighConfidence} />
                  </div>
                )}

                {/* Tab bar (only when vision data exists) */}
                {tabsVisible && (
                  <div className="tab-bar">
                    <button className={`tab ${activeTab === 'advice' ? 'active' : ''}`} onClick={() => setActiveTab('advice')}>💡 Advisory</button>
                    {visionAnalysis && <button className={`tab ${activeTab === 'vision' ? 'active' : ''}`} onClick={() => setActiveTab('vision')}>👁 Visual Analysis</button>}
                    {detection && <button className={`tab ${activeTab === 'detection' ? 'active' : ''}`} onClick={() => setActiveTab('detection')}>🤖 Classifier</button>}
                  </div>
                )}

                {/* Tab content */}
                <div className="tab-content">
                  {(activeTab === 'advice' || !tabsVisible) && (
                    <div className="advice-panel">
                      {status === 'error' ? (
                        <div className="error-msg">⚠️ {response}</div>
                      ) : (
                        <ResponseRenderer text={response} />
                      )}
                    </div>
                  )}

                  {activeTab === 'vision' && visionAnalysis && (
                    <div className="vision-panel">
                      <div className="vision-header">
                        <span className="vision-badge">👁 Llama 4 Scout Vision Analysis</span>
                        <span className="vision-note">Based on direct visual examination of your image</span>
                      </div>
                      <p className="vision-text">{stripMarkdown(visionAnalysis)}</p>
                    </div>
                  )}

                  {activeTab === 'detection' && detection && (
                    <div className="detect-panel">
                      <div className="detect-grid">
                        <div className="detect-cell">
                          <div className="dc-label">Crop</div>
                          <div className="dc-value">{detection.crop}</div>
                        </div>
                        <div className="detect-cell">
                          <div className="dc-label">Status</div>
                          <div className={`dc-value ${detection.status === 'Healthy' ? 'healthy' : 'diseased'}`}>{detection.status}</div>
                        </div>
                        <div className="detect-cell">
                          <div className="dc-label">Disease</div>
                          <div className="dc-value">{detection.disease === 'None' ? '—' : detection.disease}</div>
                        </div>
                        <div className="detect-cell">
                          <div className="dc-label">Confidence</div>
                          <div className={`dc-value ${detection.isHighConfidence ? 'healthy' : 'warn'}`}>{detection.confidence}%</div>
                        </div>
                      </div>
                      <div className="detect-model-note">
                        Model: MobileNetV2 (linkanjarad/plant-disease-identification) · Runs locally · 38 disease classes
                      </div>
                      {!detection.isHighConfidence && (
                        <div className="override-notice">
                          ℹ️ Confidence below 50% — Llama 4 Scout Vision was used to override label with direct image analysis.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="footer">
          <span>CropMind AI · Multi-Modal RAG Pipeline</span>
          <span>MobileNetV2 + Llama 4 Scout + FAISS + Groq</span>
        </footer>
      </div>
    </div>
  );
}
