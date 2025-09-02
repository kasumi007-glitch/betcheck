
import app from './api/app';
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Source Server is running on port ${PORT}`);
});

// API Endpoints Summary
// GET /api/health - Health check

// GET /api/sources - List all sources

// Query param: ?active=true for only active sources

// POST /api/sources/sync - Trigger sync

// Body: { "sourceIds": ["betika", "1xbet"] } (optional)

// PUT /api/sources/:id/status - Enable/disable source

// Body: { "enabled": true }

// GET /api/sources/status - Get last sync status

// Authentication
// The API is protected with Basic Auth using credentials from .env:

// Username: admin

// Password: secret