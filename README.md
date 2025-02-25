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

### Countries
```sql
-- ----------------------------
-- Table structure for countries
-- ----------------------------
DROP TABLE IF EXISTS "public"."countries";
CREATE TABLE "public"."countries" (
  "code" text COLLATE "pg_catalog"."default" NOT NULL,
  "name" text COLLATE "pg_catalog"."default" NOT NULL,
  "flag" text COLLATE "pg_catalog"."default",
  "is_live" bool NOT NULL,
  "is_active" bool NOT NULL,
  "is_featured" bool
)
;

-- ----------------------------
-- Primary Key structure for table countries
-- ----------------------------
ALTER TABLE "public"."countries" ADD CONSTRAINT "countries_pkey" PRIMARY KEY ("code");
```

### Bookmakers
```sql
-- ----------------------------
-- Table structure for bookmakers
-- ----------------------------
DROP TABLE IF EXISTS "public"."bookmakers";
CREATE TABLE "public"."bookmakers" (
  "id" int4 NOT NULL DEFAULT nextval('bookmakers_id_seq'::regclass),
  "name" text COLLATE "pg_catalog"."default" NOT NULL,
  "country_code" text COLLATE "pg_catalog"."default" NOT NULL,
  "url" text COLLATE "pg_catalog"."default",
  "logo" text COLLATE "pg_catalog"."default",
  "has_casino" bool NOT NULL DEFAULT false
)
;

-- ----------------------------
-- Primary Key structure for table bookmakers
-- ----------------------------
ALTER TABLE "public"."bookmakers" ADD CONSTRAINT "bookmakers_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Foreign Keys structure for table bookmakers
-- ----------------------------
ALTER TABLE "public"."bookmakers" ADD CONSTRAINT "bookmakers_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "public"."countries" ("code") ON DELETE NO ACTION ON UPDATE CASCADE;
```

### Leagues
```sql
-- ----------------------------
-- Table structure for leagues
-- ----------------------------
DROP TABLE IF EXISTS "public"."leagues";
CREATE TABLE "public"."leagues" (
  "id" int4 NOT NULL DEFAULT nextval('leagues_id_seq'::regclass),
  "external_id" int8 NOT NULL,
  "name" text COLLATE "pg_catalog"."default" NOT NULL,
  "type" text COLLATE "pg_catalog"."default" NOT NULL,
  "logo" text COLLATE "pg_catalog"."default",
  "country_code" text COLLATE "pg_catalog"."default" NOT NULL,
  "season" int4 NOT NULL,
  "is_popular" bool NOT NULL,
  "is_active" bool NOT NULL,
  "is_live" bool NOT NULL DEFAULT false,
  "is_hot" bool,
  "created_at" timestamp(6) DEFAULT now(),
  "updated_at" timestamp(6) DEFAULT now()
)
;

-- ----------------------------
-- Uniques structure for table leagues
-- ----------------------------
ALTER TABLE "public"."leagues" ADD CONSTRAINT "leagues_external_id_key" UNIQUE ("external_id");

-- ----------------------------
-- Primary Key structure for table leagues
-- ----------------------------
ALTER TABLE "public"."leagues" ADD CONSTRAINT "leagues_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Foreign Keys structure for table leagues
-- ----------------------------
ALTER TABLE "public"."leagues" ADD CONSTRAINT "leagues_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "public"."countries" ("code") ON DELETE CASCADE ON UPDATE NO ACTION;
```

### Fixtures
```sql
-- ----------------------------
-- Table structure for fixtures
-- ----------------------------
DROP TABLE IF EXISTS "public"."fixtures";
CREATE TABLE "public"."fixtures" (
  "id" int4 NOT NULL DEFAULT nextval('fixtures_id_seq'::regclass),
  "created_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP,
  "external_id" int4 NOT NULL,
  "date" timestamp(6) NOT NULL,
  "status_short" text COLLATE "pg_catalog"."default",
  "status_long" text COLLATE "pg_catalog"."default",
  "home_team_id" int4 NOT NULL,
  "home_team_name" text COLLATE "pg_catalog"."default",
  "home_team_logo" text COLLATE "pg_catalog"."default",
  "away_team_id" int4 NOT NULL,
  "away_team_name" text COLLATE "pg_catalog"."default",
  "away_team_logo" text COLLATE "pg_catalog"."default",
  "winner_team_id" int4,
  "league_id" int4 NOT NULL
)
;

-- ----------------------------
-- Uniques structure for table fixtures
-- ----------------------------
ALTER TABLE "public"."fixtures" ADD CONSTRAINT "fixtures_external_id_key" UNIQUE ("external_id");

-- ----------------------------
-- Primary Key structure for table fixtures
-- ----------------------------
ALTER TABLE "public"."fixtures" ADD CONSTRAINT "fixtures_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Foreign Keys structure for table fixtures
-- ----------------------------
ALTER TABLE "public"."fixtures" ADD CONSTRAINT "fk_league" FOREIGN KEY ("league_id") REFERENCES "public"."leagues" ("external_id") ON DELETE CASCADE ON UPDATE NO ACTION;
```

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
-- ----------------------------
-- Table structure for market_entries
-- ----------------------------
DROP TABLE IF EXISTS "public"."market_entries";
CREATE TABLE "public"."market_entries" (
  "id" int4 NOT NULL DEFAULT nextval('market_entries_id_seq'::regclass),
  "market_id" int4,
  "entry_name" varchar(255) COLLATE "pg_catalog"."default" NOT NULL,
  "fixture_id" int4,
  "external_source_fixture_id" varchar(50) COLLATE "pg_catalog"."default"
)
;

-- ----------------------------
-- Uniques structure for table market_entries
-- ----------------------------
ALTER TABLE "public"."market_entries" ADD CONSTRAINT "unique_market_entries" UNIQUE ("fixture_id", "external_source_fixture_id", "entry_name");

-- ----------------------------
-- Primary Key structure for table market_entries
-- ----------------------------
ALTER TABLE "public"."market_entries" ADD CONSTRAINT "market_entries_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Foreign Keys structure for table market_entries
-- ----------------------------
ALTER TABLE "public"."market_entries" ADD CONSTRAINT "fk_market_entries_fixtures" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."market_entries" ADD CONSTRAINT "market_entries_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "public"."markets" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

```

### 4. Market Outcomes: Holds final betting values
```sql
-- ----------------------------
-- Table structure for market_outcomes
-- ----------------------------
DROP TABLE IF EXISTS "public"."market_outcomes";
CREATE TABLE "public"."market_outcomes" (
  "id" int4 NOT NULL DEFAULT nextval('market_outcomes_id_seq1'::regclass),
  "market_entry_id" int4,
  "market_id" int4,
  "outcome_name" varchar(255) COLLATE "pg_catalog"."default" NOT NULL,
  "coefficient" numeric(10,4),
  "fixture_id" int4,
  "external_source_fixture_id" varchar(50) COLLATE "pg_catalog"."default",
  "created_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP
)
;

-- ----------------------------
-- Uniques structure for table market_outcomes
-- ----------------------------
ALTER TABLE "public"."market_outcomes" ADD CONSTRAINT "market_outcomes_market_id_market_entry_id_outcome_name_fixt_key" UNIQUE ("market_id", "market_entry_id", "outcome_name", "fixture_id", "external_source_fixture_id");

-- ----------------------------
-- Primary Key structure for table market_outcomes
-- ----------------------------
ALTER TABLE "public"."market_outcomes" ADD CONSTRAINT "market_outcomes_pkey1" PRIMARY KEY ("id");

-- ----------------------------
-- Foreign Keys structure for table market_outcomes
-- ----------------------------
ALTER TABLE "public"."market_outcomes" ADD CONSTRAINT "market_outcomes_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."market_outcomes" ADD CONSTRAINT "market_outcomes_market_entry_id_fkey1" FOREIGN KEY ("market_entry_id") REFERENCES "public"."market_entries" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."market_outcomes" ADD CONSTRAINT "market_outcomes_market_id_fkey1" FOREIGN KEY ("market_id") REFERENCES "public"."markets" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
```

### Fixtures Source Map
```sql
-- ----------------------------
-- Table structure for source_matches
-- ----------------------------
DROP TABLE IF EXISTS "public"."source_matches";
CREATE TABLE "public"."source_matches" (
  "id" int4 NOT NULL DEFAULT nextval('source_matches_id_seq'::regclass),
  "source_fixture_id" varchar(50) COLLATE "pg_catalog"."default",
  "source_competition_id" varchar(50) COLLATE "pg_catalog"."default",
  "source_event_name" varchar(255) COLLATE "pg_catalog"."default",
  "fixture_id" int4,
  "competition_id" int4,
  "created_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP
)
;

-- ----------------------------
-- Uniques structure for table source_matches
-- ----------------------------
ALTER TABLE "public"."source_matches" ADD CONSTRAINT "source_matches_fixture_id_key" UNIQUE ("fixture_id");

-- ----------------------------
-- Primary Key structure for table source_matches
-- ----------------------------
ALTER TABLE "public"."source_matches" ADD CONSTRAINT "source_matches_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Foreign Keys structure for table source_matches
-- ----------------------------
ALTER TABLE "public"."source_matches" ADD CONSTRAINT "source_matches_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### Leagues Source Map
```sql
-- ----------------------------
-- Table structure for source_league_matches
-- ----------------------------
DROP TABLE IF EXISTS "public"."source_league_matches";
CREATE TABLE "public"."source_league_matches" (
  "id" int4 NOT NULL DEFAULT nextval('source_league_matches_id_seq'::regclass),
  "source_league_id" varchar(50) COLLATE "pg_catalog"."default",
  "source_league_name" varchar(255) COLLATE "pg_catalog"."default",
  "source_country_name" varchar(255) COLLATE "pg_catalog"."default",
  "league_id" int4,
  "country_code" text COLLATE "pg_catalog"."default",
  "created_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP
)
;

-- ----------------------------
-- Uniques structure for table source_league_matches
-- ----------------------------
ALTER TABLE "public"."source_league_matches" ADD CONSTRAINT "source_league_matches_source_league_id_key" UNIQUE ("source_league_id");
ALTER TABLE "public"."source_league_matches" ADD CONSTRAINT "source_league_matches_league_id_key" UNIQUE ("league_id");

-- ----------------------------
-- Primary Key structure for table source_league_matches
-- ----------------------------
ALTER TABLE "public"."source_league_matches" ADD CONSTRAINT "source_league_matches_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Foreign Keys structure for table source_league_matches
-- ----------------------------
ALTER TABLE "public"."source_league_matches" ADD CONSTRAINT "source_league_matches_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "public"."countries" ("code") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."source_league_matches" ADD CONSTRAINT "source_league_matches_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
```