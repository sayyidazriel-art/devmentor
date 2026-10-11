from backend.routes.quests import router as quests_router
from fastapi import FastAPI
from backend.routes.profile import router as profile_router
from fastapi.middleware.cors import CORSMiddleware
from backend.routes import ai_review
from backend.routes.skills import router as skills_router

app = FastAPI(
    title="DevMentor API",
    description="AI Compass and Personal Coach for Junior Programmers",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", tags=["General"])
def home():
    return {
        "app": "DevMentor",
        "message": "Welcome to DevMentor!",
        "status": "running",
    }


@app.get("/health", tags=["General"])
def health_check():
    return {
        "status": "healthy",
        "service": "DevMentor API",
    }


app.include_router(profile_router)
app.include_router(skills_router)
app.include_router(quests_router)
app.include_router(ai_review.router)