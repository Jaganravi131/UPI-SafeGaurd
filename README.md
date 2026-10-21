# UPI SafeGuard

The implementation plan and service topology are documented in:

- [Build plan](docs/BUILD_PLAN.md)
- [Full-stack architecture](docs/FULL_STACK_ARCHITECTURE.md)
- [Architecture, API, and design guide](docs/PROJECT_ARCHITECTURE_AND_API_GUIDE.md)

The repository has one Spring Boot application, [core-backend](core-backend/),
one Python AI service, the transitional FastAPI backend, and a React frontend.
Use Docker Compose for the full local topology.