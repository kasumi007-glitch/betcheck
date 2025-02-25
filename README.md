# Betting Odds Service

## Project Structure
```plaintext
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

## Betting Market Database Schema

### 1. Market Groups: Main, Goal, Goal Scorers, etc.
```sql
CREATE TABLE market_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE -- e.g., "Main", "Goal", "Goal Scorers"
);
```

### 2. Markets: Contains static markets (like "1X2") and dynamic ones (players in Goal Scorers)
```sql
CREATE TABLE markets (
    id SERIAL PRIMARY KEY,
    group_id INT REFERENCES market_groups(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, -- e.g., "1X2", "Over / Under", or dynamically: player name ("Digne, Lucas")
    UNIQUE(group_id, name) -- Ensures unique market per group
);
```

### 3. Market Entries: Usually used for sub-entries in standard markets
```sql
CREATE TABLE market_entries (
    id SERIAL PRIMARY KEY,
    market_id INT REFERENCES markets(id) ON DELETE CASCADE,
    entry_name VARCHAR(255) NOT NULL -- e.g., "Over 2.5 Goals"
);
```

### 4. Market Outcomes: Holds final betting values
```sql
CREATE TABLE market_outcomes (
    id SERIAL PRIMARY KEY,
    market_id INT REFERENCES markets(id) ON DELETE CASCADE, -- Directly link to markets
    market_entry_id INT NULL REFERENCES market_entries(id) ON DELETE CASCADE, -- Optional for standard markets
    outcome_name VARCHAR(255) NOT NULL, -- e.g., "First Goal Scorer", "1", "X"
    coefficient DECIMAL(10,2) NOT NULL
);
```

### Constraints
```sql
ALTER TABLE market_outcomes 
ADD CONSTRAINT unique_market_outcome_entry UNIQUE (market_entry_id, outcome_name);

ALTER TABLE market_outcomes 
ADD CONSTRAINT unique_market_outcome_market UNIQUE (market_id, market_entry_id, outcome_name);
```

### Fixtures Source Map
```sql
CREATE TABLE source_matches (
  id SERIAL PRIMARY KEY,
  source_fixture_id VARCHAR(50),
  source_competition_id VARCHAR(50),
  source_event_name VARCHAR(255),
  fixture_id INT REFERENCES fixtures(id) UNIQUE,
  competition_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### Leagues Source Map
```sql
CREATE TABLE source_league_matches (
  id SERIAL PRIMARY KEY,
  source_league_id VARCHAR(50) UNIQUE,
  source_league_name VARCHAR(255),
  source_country_name VARCHAR(255),
  league_id INT REFERENCES leagues(id) UNIQUE,
  country_code TEXT REFERENCES countries(code),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```