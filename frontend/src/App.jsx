import { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import "./App.css";

// =========================================================
// LIGHTWEIGHT MARKDOWN RENDERER
// Converts Ollama text output to styled React elements.
// Supports: headers (##), bold (**), lists (- / 1.), code (`)
// =========================================================
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let listBuffer = [];
  let listType = null;
  let keyIdx = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const Tag = listType === "ol" ? "ol" : "ul";
    elements.push(
      <Tag key={`list-${keyIdx++}`} className="md-list">
        {listBuffer.map((item, i) => (
          <li key={i} className="md-li">{inlineFormat(item)}</li>
        ))}
      </Tag>
    );
    listBuffer = [];
    listType = null;
  };

  const inlineFormat = (str) => {
    // Bold: **text**
    const parts = str.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`"))
        return <code key={i} className="md-code">{part.slice(1, -1)}</code>;
      return part;
    });
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed === "") { flushList(); elements.push(<br key={`br-${i}`} />); return; }
    if (/^###/.test(trimmed)) { flushList(); elements.push(<h4 key={i} className="md-h4">{trimmed.replace(/^###\s*/, "")}</h4>); return; }
    if (/^##/.test(trimmed))  { flushList(); elements.push(<h3 key={i} className="md-h3">{trimmed.replace(/^##\s*/,  "")}</h3>); return; }
    if (/^#/.test(trimmed))   { flushList(); elements.push(<h2 key={i} className="md-h2">{trimmed.replace(/^#\s*/,   "")}</h2>); return; }
    const olMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (olMatch) { if (listType !== "ol") { flushList(); listType = "ol"; } listBuffer.push(olMatch[2]); return; }
    const ulMatch = trimmed.match(/^[-*]\s+(.*)/);
    if (ulMatch) { if (listType !== "ul") { flushList(); listType = "ul"; } listBuffer.push(ulMatch[1]); return; }
    flushList();
    elements.push(<p key={i} className="md-p">{inlineFormat(trimmed)}</p>);
  });
  flushList();
  return <div className="md-root">{elements}</div>;
}

const BACKEND_URL = "http://localhost:5001";
const AI_SERVICE_URL = "http://localhost:8000";
const WS_URL = "ws://localhost:8000/ws";

function App() {
  // Surveillance states
  const [events, setEvents] = useState([]);
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [dbAlerts, setDbAlerts] = useState([]);
  
  // Grok/Groq AI states
  const [groqOnline, setGroqOnline] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile");
  
  // UI Tabs
  const [activeTab, setActiveTab] = useState("chat"); // 'report' | 'chat'
  const [selectedIntruderSnap, setSelectedIntruderSnap] = useState(null); // for report panel header
  
  // Intruder Analyzer States
  const [selectedIntruderId, setSelectedIntruderId] = useState("all");
  const [reportLoading, setReportLoading] = useState(false);
  const [aiReport, setAiReport] = useState("");
  
  // Chatbot States
  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      content: "Hello! I am your AI Surveillance Security Assistant. I have real-time access to the intrusion logs database. You can select a model and ask me security questions about recorded events."
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  
  // Refs
  const chatEndRef = useRef(null);

  // Auto-scroll chat history
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  // ==========================================
  // FETCH DATA ON MOUNT
  // ==========================================
  const fetchSurveillanceLogs = async () => {
    try {
      const response = await axios.get(`${AI_SERVICE_URL}/events`);
      if (response.data && response.data.events) {
        setEvents(response.data.events.reverse());
      }
    } catch (error) {
      console.error("Failed to fetch events:", error);
    }
  };

  const fetchDatabaseAlerts = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/ai/alerts`);
      setDbAlerts(response.data || []);
    } catch (error) {
      console.error("Failed to fetch alerts from database:", error);
    }
  };

  const fetchGroqModels = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/ai/models`);
      if (response.data && response.data.models && response.data.models.length > 0) {
        setModels(response.data.models);
        setGroqOnline(true);
        if (response.data.models.includes("llama-3.3-70b-versatile")) {
          setSelectedModel("llama-3.3-70b-versatile");
        } else {
          setSelectedModel(response.data.models[0]);
        }
      } else {
        setModels([]);
        setGroqOnline(false);
      }
    } catch (error) {
      console.error("Failed to fetch Groq models:", error);
      setGroqOnline(false);
    }
  };

  useEffect(() => {
    fetchSurveillanceLogs();
    fetchDatabaseAlerts();
    fetchGroqModels();

    // WebSocket connection for live camera alerts
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log("Surveillance WebSocket Connected");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Live Alert Received:", data);
        
        // Add to live alerts array
        setLiveAlerts((prev) => [data, ...prev]);
        
        // Refresh event lists and database records
        fetchSurveillanceLogs();
        fetchDatabaseAlerts();
      } catch (err) {
        console.error("WebSocket message parsing error:", err);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket Disconnected");
    };

    return () => {
      ws.close();
    };
  }, []);

  // Get list of unique intruder person IDs from dbAlerts
  const uniqueIntruderIds = Array.from(
    new Set(dbAlerts.map((alert) => alert.person_id))
  ).sort((a, b) => a - b);

  // ==========================================
  // DESCRIBE INTRUDER ACTION (Grok)
  // ==========================================
  const generateIntruderReport = async (personId, forceRequery = false) => {
    const idToQuery = personId || selectedIntruderId;
    if (!idToQuery || idToQuery === "all") return;

    setReportLoading(true);
    setAiReport("");
    setActiveTab("report");
    setSelectedIntruderId(idToQuery);

    // Set snapshot preview for the report header
    const matchedAlert = dbAlerts.find((a) => String(a.person_id) === String(idToQuery));
    setSelectedIntruderSnap(matchedAlert || null);

    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/ai/describe/${idToQuery}?model=${selectedModel}${forceRequery ? "&force=true" : ""}`
      );

      if (response.data && response.data.success) {
        setAiReport(response.data.description);
        fetchDatabaseAlerts();
      } else {
        setAiReport("Failed to generate report. Check backend console logs.");
      }
    } catch (error) {
      console.error(error);
      setAiReport(
        `**Error generating security report:**\n\n${error.response?.data?.error || "Groq/Grok API is down or key is invalid."}\n\nTip: Make sure you have added your valid API key to the backend .env file.`
      );
    } finally {
      setReportLoading(false);
    }
  };

  // ==========================================
  // CONTEXTUAL SECURITY CHAT (Grok)
  // ==========================================
  const handleChatSubmit = async (e, textToSend = null) => {
    if (e) e.preventDefault();
    const queryText = textToSend || chatInput;
    if (!queryText.trim()) return;

    const userMessage = { role: "user", content: queryText };
    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput("");
    setChatLoading(true);

    try {
      // Build messages history including new one
      const history = [...chatMessages.slice(1), userMessage]; // exclude first system instructions

      const response = await axios.post(`${BACKEND_URL}/api/ai/chat`, {
        messages: history,
        model: selectedModel,
        person_id: "all"
      });

      if (response.data && response.data.success) {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: response.data.message.content
          }
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "I ran into a problem communicating with Groq/Grok API. Check your backend .env file."
          }
        ]);
      }
    } catch (error) {
      console.error(error);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error communicating with AI Assistant: ${
            error.response?.data?.error || "Network error. Make sure the backend server is running and the GROQ_API_KEY is set."
          }`
        }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Preset Chips
  const triggerPresetQuestion = (question) => {
    handleChatSubmit(null, question);
  };

  return (
    <div className="dashboard-container">
      {/* =========================================================
          DASHBOARD HEADER
          ========================================================= */}
      <header className="dashboard-header">
        <div className="header-title-section">
          <h1>
            <span>🛡️</span> AI Smart Surveillance Control Center
          </h1>
          <p>Real-time computer vision threat logs paired with Grok/Groq Gen AI</p>
        </div>

        <div className="ollama-control">
          {groqOnline ? (
            <div className="status-badge online">
              <span className="status-dot"></span>
              GROK: ACTIVE
            </div>
          ) : (
            <div className="status-badge offline">
              <span className="status-dot"></span>
              GROK: OFFLINE
            </div>
          )}

          <select
            className="model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={!groqOnline || models.length === 0}
          >
            {models.length === 0 ? (
              <option value="llama-3.3-70b-versatile">Select Grok Model</option>
            ) : (
              models.map((m) => (
                <option key={m} value={m}>
                  Model: {m}
                </option>
              ))
            )}
          </select>
        </div>
      </header>

      {/* =========================================================
          MAIN GRID LAYOUT
          ========================================================= */}
      <div className="dashboard-grid">
        
        {/* LEFT COLUMN: LIVE STREAM, RECENT ALERTS, RAW LOGS */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Live Camera Feed */}
          <div className="panel">
            <div className="panel-header">
              <h2>📹 Restricted Zone Live Stream</h2>
            </div>
            <div className="camera-wrapper">
              <img
                className="live-feed-img"
                src={`${AI_SERVICE_URL}/video_feed`}
                alt="Intruder Tracking Feed"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = "https://images.unsplash.com/photo-1557597774-9d273605dfa9?q=80&w=800&auto=format&fit=crop";
                }}
              />
              <div className="live-indicator">
                <span className="pulse-ring"></span>
                LIVE VIDEO
              </div>
            </div>
          </div>

          {/* Incident Feed (Saved Alerts from Database) */}
          <div className="panel">
            <div className="panel-header">
              <h2>🚨 Recorded Intrusions (Database Logs)</h2>
              <button className="btn" onClick={fetchDatabaseAlerts}>🔄 Refresh</button>
            </div>
            
            <div className="alerts-list">
              {dbAlerts.length === 0 ? (
                <div className="alerts-list-empty">
                  No intrusions have been logged in the database yet. Restricted zone is clear.
                </div>
              ) : (
                dbAlerts.map((alert) => (
                  <div className="alert-card" key={alert.id}>
                    <div className="alert-snapshot-wrapper">
                      <img
                        className="alert-snapshot"
                        src={`${AI_SERVICE_URL}/snapshot/${alert.snapshot}`}
                        alt="Intruder Snapshot"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = "https://images.unsplash.com/photo-1508962914676-134849a727f0?q=80&w=300&auto=format&fit=crop";
                        }}
                      />
                    </div>
                    
                    <div className="alert-card-info">
                      <div className="alert-card-header">
                        <h3 className="alert-label">⚠️ INTRUSION DETECTED</h3>
                        <span className="alert-meta">{alert.timestamp}</span>
                      </div>
                      
                      <div className="alert-details">
                        <span className="alert-stat">ID: {alert.person_id}</span>
                        <span className="alert-stat">Confidence: {(alert.confidence * 100).toFixed(0)}%</span>
                      </div>
                      
                      <div className="alert-actions">
                        <button
                          className="btn"
                          onClick={() => generateIntruderReport(alert.person_id)}
                        >
                          🧠 Gen AI Audit
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => {
                            setActiveTab("chat");
                            triggerPresetQuestion(`Give me details on intruder Person ID ${alert.person_id}`);
                          }}
                        >
                          💬 Chat About Intruder
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Event History Logs */}
          <div className="panel">
            <div className="panel-header">
              <h2>🗃️ raw security logs</h2>
            </div>
            <div className="event-log-container">
              {events.length === 0 ? (
                <p style={{ margin: 0, color: "var(--text-muted)" }}>No logs recorded in logs/events.txt</p>
              ) : (
                events.map((logLine, index) => (
                  <div className="event-log-line" key={index}>
                    {logLine}
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: GEN AI ASSISTANT CENTER */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          <div className="panel" style={{ flexGrow: 1, minHeight: "600px", display: "flex", flexDirection: "column" }}>
            <div className="panel-header">
              <h2>🤖 Grok Security Assistant</h2>
            </div>
            
            {/* Action Tabs */}
            <div className="ai-tabs">
              <button
                className={`ai-tab-btn ${activeTab === "chat" ? "active" : ""}`}
                onClick={() => setActiveTab("chat")}
              >
                💬 Security Chat
              </button>
              <button
                className={`ai-tab-btn ${activeTab === "report" ? "active" : ""}`}
                onClick={() => setActiveTab("report")}
              >
                🧠 Behavior Audit
              </button>
            </div>

            {/* TAB CONTENT: CHAT ASSISTANT */}
            {activeTab === "chat" && (
              <div className="chat-container">
                <div className="chat-history">
                  {chatMessages.map((msg, index) => (
                    <div className={`chat-message ${msg.role}`} key={index}>
                      <div className="chat-avatar">
                        {msg.role === "user" ? "👤" : "🤖"}
                      </div>
                      <div className="chat-bubble">
                        {msg.role === "assistant"
                          ? renderMarkdown(msg.content)
                          : msg.content}
                      </div>
                    </div>
                  ))}
                  
                  {chatLoading && (
                    <div className="chat-message assistant">
                      <div className="chat-avatar">AI</div>
                      <div className="chat-bubble" style={{ display: "flex", gap: "4px", padding: "14px" }}>
                        <span className="skeleton skeleton-text" style={{ width: "8px", height: "8px", borderRadius: "50%" }}></span>
                        <span className="skeleton skeleton-text" style={{ width: "8px", height: "8px", borderRadius: "50%", animationDelay: "0.2s" }}></span>
                        <span className="skeleton skeleton-text" style={{ width: "8px", height: "8px", borderRadius: "50%", animationDelay: "0.4s" }}></span>
                      </div>
                    </div>
                  )}
                  
                  <div ref={chatEndRef} />
                </div>
                
                {/* Suggestion Prompts */}
                <div className="presets-bar">
                  <button className="preset-chip" onClick={() => triggerPresetQuestion("Summarize all recorded intrusion logs in a table")}>
                    📊 All logs summary
                  </button>
                  <button className="preset-chip" onClick={() => triggerPresetQuestion("Which intruder had the highest confidence score and when?")}
                  >
                    🎯 Highest confidence
                  </button>
                  <button className="preset-chip" onClick={() => triggerPresetQuestion("Is there any suspicious behavior logged today?")}
                  >
                    🕵️ Suspicious activity?
                  </button>
                  <button className="preset-chip" onClick={() => triggerPresetQuestion("How many unique intruders have been detected in total?")}
                  >
                    👥 Total intruders
                  </button>
                  <button className="preset-chip" onClick={() => triggerPresetQuestion("What time was the most recent intrusion event?")}
                  >
                    🕐 Last intrusion
                  </button>
                  <button className="preset-chip" onClick={() => triggerPresetQuestion("Recommend security improvements based on the logs")}
                  >
                    🔐 Security advice
                  </button>
                </div>

                {/* Chat Form Input */}
                <form className="chat-input-bar" onSubmit={handleChatSubmit}>
                  <input
                    type="text"
                    className="chat-input"
                    placeholder="Ask security AI (e.g. 'When did intruder ID 1 enter?')"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={chatLoading}
                  />
                  <button
                    type="submit"
                    className="chat-send-btn"
                    disabled={chatLoading || !chatInput.trim()}
                  >
                    Send
                  </button>
                </form>
              </div>
            )}

            {/* TAB CONTENT: BEHAVIOR AUDIT */}
            {activeTab === "report" && (
              <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
                
                <div className="describe-control-bar">
                  <select
                    className="describe-dropdown"
                    value={selectedIntruderId}
                    onChange={(e) => setSelectedIntruderId(e.target.value)}
                  >
                    <option value="all">-- Select Intruder to Audit --</option>
                    {uniqueIntruderIds.map((id) => (
                      <option key={id} value={id}>
                        Intruder Person {id}
                      </option>
                    ))}
                  </select>
                  
                  <button
                    className="report-btn"
                    onClick={() => generateIntruderReport(null, true)}
                    disabled={selectedIntruderId === "all" || reportLoading}
                  >
                    {reportLoading ? "Analyzing..." : "Generate Audit"}
                  </button>
                </div>

                {/* Intruder snapshot preview in report header */}
                {selectedIntruderSnap && (
                  <div className="intruder-report-header">
                    <img
                      className="intruder-report-thumb"
                      src={`${AI_SERVICE_URL}/snapshot/${selectedIntruderSnap.snapshot}`}
                      alt="Intruder Snapshot"
                      onError={(e) => { e.target.onerror = null; e.target.src = "https://images.unsplash.com/photo-1508962914676-134849a727f0?q=80&w=200"; }}
                    />
                    <div className="intruder-report-meta">
                      <span className="report-meta-badge">👤 Person ID: {selectedIntruderSnap.person_id}</span>
                      <span className="report-meta-badge">🎯 Confidence: {(selectedIntruderSnap.confidence * 100).toFixed(0)}%</span>
                      <span className="report-meta-badge">🕐 {selectedIntruderSnap.timestamp}</span>
                      <span className="report-meta-badge model-badge">🤖 {selectedModel}</span>
                    </div>
                  </div>
                )}

                <div className="ai-report-box">
                  {reportLoading ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <p style={{ color: "var(--neon-ai)", fontWeight: 600 }}>🤖 Grok is analyzing the surveillance timeline...</p>
                      {["100%","90%","95%","75%","85%","60%"].map((w, i) => (
                        <div key={i} className="skeleton skeleton-text" style={{ height: "14px", width: w, animationDelay: `${i * 0.15}s` }}></div>
                      ))}
                    </div>
                  ) : aiReport ? (
                    <div className="report-content">
                      {renderMarkdown(aiReport)}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", color: "var(--text-muted)", paddingTop: "60px" }}>
                      <p style={{ fontSize: "40px", margin: "0 0 12px 0" }}>🧠</p>
                      <p style={{ fontWeight: 600 }}>Select an Intruder ID above and click <strong style={{color:"var(--neon-ai)"}}>Generate Audit</strong>.</p>
                      <p style={{ fontSize: "11px", marginTop: "12px", lineHeight: 1.6 }}>
                        Grok will analyze detection history, confidence data, zone entry/exit, and produce a detailed professional threat assessment report.
                      </p>
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
}

export default App;