# Account Health Dashboard

Internal agency tool for tracking and scoring client relationship health.

## Structure

```
/frontend   → React + Vite app
/backend    → Express API (Google Sheets proxy)
```

## Setup

### Backend
```bash
cd backend
npm install
# Add your service-account.json to this folder
# Copy .env.example to .env and fill in PORT if needed
npm run dev
```

### Frontend
```bash
cd frontend
npm install
# Copy .env.example to .env and set VITE_API_BASE_URL
npm run dev
```

Run both in separate terminals. Frontend runs on http://localhost:5173, backend on http://localhost:3001.
