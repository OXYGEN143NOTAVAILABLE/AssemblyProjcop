"""Compatibility entrypoint.

The project now keeps the FastAPI app and PostgreSQL data flow in app.py.
Importing it here keeps older commands like `python app_fastapi.py` working.
"""

from app import app


if __name__ == "__main__":
    import os
    import uvicorn

    uvicorn.run(app, host=os.getenv("APP_HOST", "0.0.0.0"), port=int(os.getenv("APP_PORT", "5000")))
