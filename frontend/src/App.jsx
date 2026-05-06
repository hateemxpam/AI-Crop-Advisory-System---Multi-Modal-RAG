import React, { useState, useRef } from 'react';
import axios from 'axios';
import './index.css'; // Make sure the new styles are imported

function App() {
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState('en');
  const [location, setLocation] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  
  const [status, setStatus] = useState({ type: '', text: '' }); // type: 'loading', 'success', 'error'
  const [response, setResponse] = useState('');
  const [detection, setDetection] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const fileInputRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearAll = () => {
    setQuery('');
    setLanguage('en');
    setLocation('');
    setImageFile(null);
    setImagePreview(null);
    setStatus({ type: '', text: '' });
    setResponse('');
    setDetection(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!query.trim() && !imageFile) {
      setStatus({ type: 'error', text: 'Please provide a question or an image.' });
      return;
    }

    setIsProcessing(true);
    setStatus({ type: 'loading', text: imageFile ? 'Analyzing Image & Fetching Advice...' : 'Consulting Expert Database...' });
    setResponse('');
    setDetection(null);

    try {
      let res;
      if (imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);
        formData.append('language', language);
        if (location.trim()) formData.append('location', location.trim());

        res = await axios.post('/api/image-query', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (res.data.success && res.data.data.detection) {
          setDetection(res.data.data.detection);
        }
      } else {
        res = await axios.post('/api/query', {
          query: query.trim(),
          language,
          location: location.trim()
        });
      }

      if (res.data.success) {
        setStatus({ type: 'success', text: 'Analysis Complete' });
        setResponse(res.data.data.response);
      } else {
        throw new Error(res.data.error || 'Request Failed');
      }
    } catch (err) {
      const errorData = err.response?.data || {};
      const errorMsg = errorData.details || errorData.error || err.message || "An unexpected error occurred.";
      setStatus({ type: 'error', text: 'Error' });
      setResponse(`Error: ${errorMsg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>AI Crop Advisory</h1>
        <p>Grounded Expertise for Modern Farmers</p>
      </header>

      <div className="grid">
        {/* Input Panel */}
        <div className="card">
          <div className="section-title">🌱 Advisory Input</div>

          <div className="input-group">
            <label>Your Question</label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="How should I manage wheat rust in current conditions?"
              disabled={isProcessing}
            ></textarea>
          </div>

          <div className="input-group">
            <label>Identify via Image (Optional)</label>
            <div 
              className={`upload-zone ${imagePreview ? 'active' : ''}`}
              onClick={() => fileInputRef.current.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                hidden
                onChange={handleImageUpload}
                disabled={isProcessing}
              />
              {!imagePreview && (
                <div id="uploadPlaceholder">
                  <span className="icon">📸</span>
                  <span className="text">Click to Upload Crop Photo</span>
                  <p>Analyze diseases instantly</p>
                </div>
              )}
              {imagePreview && (
                <img src={imagePreview} className="image-preview" alt="Crop Preview" />
              )}
            </div>
          </div>

          <div className="controls">
            <div className="input-group">
              <label>Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isProcessing}
              >
                <option value="en">English</option>
                <option value="ur">اردو (Urdu)</option>
                <option value="pa">پنجابی (Punjabi)</option>
              </select>
            </div>
            <div class="input-group">
              <label>City (For Weather)</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Lahore"
                disabled={isProcessing}
              />
              {location.trim() && (
                <div className="weather-info">🌤 Weather Data Linked</div>
              )}
            </div>
          </div>

          <button 
            className="btn btn-primary" 
            onClick={handleSubmit} 
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing...' : 'Get Expert Advice'}
          </button>
          
          <button 
            className="btn btn-secondary" 
            onClick={clearAll} 
            disabled={isProcessing}
          >
            Clear All
          </button>
        </div>

        {/* Result Panel */}
        <div className="card response-container">
          <div className="section-title">📋 Expert Consultation</div>

          {status.type && (
            <div className={`status-badge status-${status.type}`}>
              {status.text}
            </div>
          )}

          {detection && (
            <div className="detection-result">
              <h4>HuggingFace Analysis Result</h4>
              <p>
                {detection.crop} - {detection.status}
                {detection.disease !== 'None' ? ` (${detection.disease})` : ''}
              </p>
            </div>
          )}

          <div className="answer-box">
            {response ? (
              <div style={{ whiteSpace: 'pre-wrap' }}>{response}</div>
            ) : (
              <div className="answer-placeholder">
                Your personalized agricultural advice will appear here after analysis.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
