import os
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.absolute()
sys.path.append(str(project_root))

if __name__ == "__main__":
    # Change to dashboard directory and run the server
    # Install chart visualization dependencies if needed
    chart_viz_dir = Path(__file__).parent / "app" / "tool" / "chart_visualization"
    if chart_viz_dir.exists() and (chart_viz_dir / "package.json").exists():
        print("Installing chart visualization dependencies...")
        subprocess.run([
            sys.executable, "-c", 
            f"import os, subprocess; os.chdir(r'{chart_viz_dir.absolute()}'); subprocess.run(['npm', 'install'])"
        ], check=False)
    
    dashboard_dir = project_root / "dashboard"
    os.chdir(str(dashboard_dir.resolve()))
    
    # Create workspace directory if it doesn't exist
    from app.config import config
    os.makedirs(config.workspace_root, exist_ok=True)
    
    # Run the dashboard
    os.system(f"{sys.executable} -m uvicorn main:app --reload --host 0.0.0.0 --port 8000")