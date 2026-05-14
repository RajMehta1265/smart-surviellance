import asyncio
import websockets

async def listen():

    uri = "ws://127.0.0.1:8000/ws"

    async with websockets.connect(uri) as websocket:

        print("Connected to WebSocket server")

        while True:
            message = await websocket.recv()
            print("Received:", message)

asyncio.run(listen())