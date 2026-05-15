import { useEffect, useState } from "react"
import axios from "axios"

function App() {

  const [events, setEvents] = useState([])
  const [liveAlerts, setLiveAlerts] = useState([])

  // =========================
  // FETCH EVENT LOGS
  // =========================
  const fetchEvents = async () => {

    try {

      const response = await axios.get(
        "http://127.0.0.1:8000/events"
      )

      setEvents(response.data.events.reverse())

    } catch (error) {
      console.log(error)
    }
  }

  // =========================
  // WEBSOCKET CONNECTION
  // =========================
  useEffect(() => {

    fetchEvents()

    const ws = new WebSocket(
      "ws://127.0.0.1:8000/ws"
    )

    ws.onopen = () => {
      console.log("WebSocket Connected")
    }

    ws.onmessage = (event) => {

      const data = JSON.parse(event.data)

      console.log("Live Alert:", data)

      setLiveAlerts(prev => [
        data,
        ...prev
      ])

      fetchEvents()
    }

    ws.onclose = () => {
      console.log("WebSocket Closed")
    }

    return () => {
      ws.close()
    }

  }, [])

  return (

    <div
      style={{
        padding: "20px",
        fontFamily: "Arial"
      }}
    >

      <h1>AI Smart Surveillance Dashboard</h1>

      <h2>Live Camera Feed</h2>

      <div
        style={{
          marginBottom: "20px"
        }}
      >

        <img
          src="http://127.0.0.1:8000/video_feed"
          alt="Live Feed"
          width="800"
          style={{
            border: "3px solid black"
          }}
        />

      </div>

      {/* ========================= */}
      {/* LIVE ALERTS */}
      {/* ========================= */}

      <h2>Live Alerts</h2>

      <div>

        {liveAlerts.length === 0 && (
          <p>No live alerts</p>
        )}

        {liveAlerts.map((alert, index) => (

          <div
            key={index}
            style={{
              border: "2px solid red",
              padding: "10px",
              marginBottom: "10px",
              background: "#ffe5e5"
            }}
          >

            <p>
              <strong>Event:</strong> {alert.event}
            </p>

            <p>
              <strong>Person ID:</strong> {alert.person_id}
            </p>

            <p>
              <strong>Time:</strong> {alert.timestamp}
            </p>

            <img
              src={
                `http://127.0.0.1:8000/snapshot/${alert.snapshot}`
              }
              alt="snapshot"
              width="300"
            />

          </div>

        ))}

      </div>

      {/* ========================= */}
      {/* EVENT HISTORY */}
      {/* ========================= */}

      <h2>Event History</h2>

      <div>

        {events.map((event, index) => (

          <div
            key={index}
            style={{
              border: "1px solid gray",
              padding: "10px",
              marginBottom: "10px"
            }}
          >

            {event}

          </div>

        ))}

      </div>

    </div>
  )
}

export default App