import asyncio
import os
import sys
from pathlib import Path
from typing import List, Optional

import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

# Add parent directory to path so we can import app module
sys.path.append(str(Path(__file__).parent.parent))

from app.agent.manus import Manus
from app.agent.browser import BrowserAgent
from app.agent.mcp import MCPAgent
from app.agent.data_analysis import DataAnalysis
from app.config import config
from app.logger import logger


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)


class AgentRequest(BaseModel):
    agent_type: str
    prompt: str


class LogMessage(BaseModel):
    level: str
    message: str
    timestamp: str


app = FastAPI(title="OpenManus Dashboard")
templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))
manager = ConnectionManager()

# Mount static files
app.mount("/static", StaticFiles(directory=str(Path(__file__).parent / "static")), name="static")

# In-memory storage for logs and agent states
logs = []
agent_states = {}
running_agents = {}


class LogHandler:
    """Custom handler to capture logs and send them to the dashboard"""
    
    def __init__(self, connection_manager):
        self.connection_manager = connection_manager
    
    def emit(self, record):
        log_entry = {
            "level": record.levelname,
            "message": record.getMessage(),
            "timestamp": record.asctime
        }
        logs.append(log_entry)
        asyncio.create_task(self.connection_manager.broadcast(f"LOG:{record.getMessage()}"))


@app.on_event("startup")
async def startup_event():
    """Initialize application state on startup"""
    # Add WebSocket handler for logs
    # Create workspace directory if it doesn't exist
    os.makedirs(config.workspace_root, exist_ok=True)


@app.get("/", response_class=HTMLResponse)
async def get_dashboard(request: Request):
    """Render the main dashboard page"""
    return templates.TemplateResponse(
        "dashboard.html", 
        {
            "request": request,
            "agents": [
                {"name": "Manus", "description": "A versatile agent that can solve various tasks using multiple tools"},
                {"name": "BrowserAgent", "description": "A browser agent that can control a browser to accomplish tasks"},
                {"name": "MCPAgent", "description": "An agent that connects to an MCP server and uses its tools"},
                {"name": "DataAnalysis", "description": "An analytical agent for data analysis and visualization"}
            ],
            "config": {
                "workspace_path": str(config.workspace_root),
                "llm_models": list(config.llm.keys())
            }
        }
    )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates"""
    await manager.connect(websocket)
    try:
        await websocket.send_text("Connected to OpenManus Dashboard")
        while True:
            data = await websocket.receive_text()
            if data.startswith("RUN:"):
                # Parse agent type and prompt
                _, payload = data.split(":", 1)
                agent_type, prompt = payload.split("|", 1)
                
                # Run the requested agent
                asyncio.create_task(run_agent(agent_type, prompt, websocket))
            elif data == "GET_LOGS":
                # Send recent logs
                for log in logs[-50:]:  # Send the last 50 logs
                    await manager.send_message(f"LOG:{log['message']}", websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)


async def run_agent(agent_type: str, prompt: str, websocket: WebSocket):
    """Run an agent with the given prompt and send updates to the client"""
    try:
        await manager.send_message(f"STATUS:Creating {agent_type} agent...", websocket)
        agent = None
        
        # Create the appropriate agent type
        if agent_type == "Manus":
            agent = await Manus.create()
        elif agent_type == "BrowserAgent":
            agent = BrowserAgent()
        elif agent_type == "MCPAgent":
            agent = MCPAgent()
        elif agent_type == "DataAnalysis":
            agent = DataAnalysis()
        else:
            await manager.send_message(f"ERROR:Unknown agent type: {agent_type}", websocket)
            return
            
        # Store the agent instance
        agent_id = f"{agent_type}_{id(agent)}"
        running_agents[agent_id] = agent
        
        # Run the agent and capture output
        await manager.send_message(f"STATUS:Running {agent_type} with prompt: {prompt}", websocket)
        
        # Custom message handler to capture agent messages
        async def message_handler(message):
            await manager.send_message(f"AGENT:{message}", websocket)
            return message
        
        # Run the agent
        result = await agent.run(prompt)
        
        # Send the result
        await manager.send_message(f"RESULT:{result}", websocket)
        
        # Cleanup
        if hasattr(agent, "cleanup"):
            await agent.cleanup()
        
        # Remove from running agents
        running_agents.pop(agent_id, None)
        
    except Exception as e:
        error_msg = f"Error running {agent_type}: {str(e)}"
        logger.error(error_msg)
        await manager.send_message(f"ERROR:{error_msg}", websocket)


@app.get("/api/config")
async def get_config():
    """Get system configuration"""
    return {
        "workspace_path": str(config.workspace_root),
        "llm_models": list(config.llm.keys()),
    }


@app.get("/api/logs")
async def get_logs(limit: Optional[int] = 100):
    """Get recent logs"""
    return {"logs": logs[-limit:]}


@app.get("/api/agents")
async def get_agents():
    """Get information about available and running agents"""
    return {
        "available_agents": [
            {"name": "Manus", "description": "A versatile agent that can solve various tasks using multiple tools"},
            {"name": "BrowserAgent", "description": "A browser agent that can control a browser to accomplish tasks"},
            {"name": "MCPAgent", "description": "An agent that connects to an MCP server and uses its tools"},
            {"name": "DataAnalysis", "description": "An analytical agent for data analysis and visualization"}
        ],
        "running_agents": [
            {"id": agent_id, "type": agent_id.split("_")[0]} 
            for agent_id in running_agents
        ]
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)