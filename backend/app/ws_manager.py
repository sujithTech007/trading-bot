from fastapi import WebSocket
from typing import List
import json

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        """Accept a new websocket connection and add to pool."""
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"New connection added. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        """Remove connection from active pool."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"Connection removed. Total connections: {len(self.active_connections)}")

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Send message to a specific connection."""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception:
            # Client might have disconnected, disconnect cleanup will occur
            pass

    async def broadcast(self, message: dict):
        """Broadcast message to all active connections."""
        disconnected_clients = []
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception as e:
                print(f"Error sending message, marking for disconnect: {e}")
                disconnected_clients.append(connection)
                
        # Cleanup broken connections
        for connection in disconnected_clients:
            self.disconnect(connection)

manager = ConnectionManager()
