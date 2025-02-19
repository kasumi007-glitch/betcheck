# Betting Odds Service

## Project Structure
```
/betting-odds-service
│── /src
│   ├── /config            # Database and environment configuration
│   ├── /models            # Sequelize models
│   ├── /services          # Service logic for fetching and processing data
│   ├── /jobs              # Background jobs for data fetching
│   ├── /routes            # API routes
│   ├── /controllers       # Controllers handling API requests
│   ├── /utils             # Utility functions
│   ├── app.ts             # Main application entry
│   ├── server.ts          # Starts the Express server
│── /migrations            # Sequelize migrations
│── /seeders               # Database seeding data
│── .env                   # Environment variables
│── package.json           # Node.js dependencies
│── tsconfig.json          # TypeScript configuration
│── README.md              # Documentation
```