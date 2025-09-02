import { SourceConfig, CountryCode, SyncType, BookmakerConfig, Bookmaker, CountrySources } from "../syncTypes";

type SourceConfigByCountry = Record<CountryCode, Record<string, SourceConfig[]>>;

export const SOURCES_CONFIG: SourceConfigByCountry = {
    ci: {
        betclic: [
            {
                id: "ci-betclic-leagues",
                label: "CI_Betclic_Leagues",
                service: () => import("../services/betclic/FetchBetclicLeaguesService")
                    .then(m => m.default.syncLeagues()),
                enabled: true,
                country: "ci",
                type: "leagues",
                bookmaker: "betclic"
            },
            {
                id: "ci-betclic-fixtures",
                label: "CI_Betclic_Fixtures",
                service: () => import("../services/betclic/FetchBetclicFixturesService")
                    .then(m => m.default.syncFixtures()),
                enabled: true,
                country: "ci",
                type: "fixtures",
                bookmaker: "betclic"
            },
            {
                id: "ci-betclic-odds",
                label: "CI_Betclic_Odds",
                service: () => import("../services/betclic/AddBetclicOddService")
                    .then(m => m.default.syncOdds()),
                enabled: true,
                country: "ci",
                type: "odds",
                bookmaker: "betclic"
            }
        ],
        betmomo: [
            {
                id: "ci-betmomo-leagues",
                label: "CI_Betmomo_Leagues",
                service: () => import("../services/betmomo/FetchBetmomoLeaguesService")
                    .then(m => new m.default().syncLeagues("BETMOMO")),
                enabled: true,
                country: "ci",
                type: "leagues",
                bookmaker: "betmomo"
            },
            {
                id: "ci-betmomo-fixtures",
                label: "CI_Betmomo_Fixtures",
                service: () => import("../services/betmomo/FetchBetmomoFixturesService")
                    .then(m => new m.default().syncFixtures("BETMOMO")),
                enabled: true,
                country: "ci",
                type: "fixtures",
                bookmaker: "betmomo"
            },
            {
                id: "ci-betmomo-odds",
                label: "CI_Betmomo_Odds",
                service: () => import("../services/betmomo/FetchBetmomoOddsService")
                    .then(m => new m.default().syncOdds("BETMOMO")),
                enabled: true,
                country: "ci",
                type: "odds",
                bookmaker: "betmomo"
            }
        ],
        "1win": [
            {
                id: "ci-1win-leagues",
                label: "CI_1Win_Leagues",
                service: () => import("../services/1win/Fetch1WinLeaguesWithFixturesService")
                    .then(m => m.default.syncLeaguesAndFixtures(true)),
                enabled: true,
                country: "ci",
                type: "leagues",
                bookmaker: "1win"
            },
            {
                id: "ci-1win-fixtures",
                label: "CI_1Win_Fixtures",
                service: () => import("../services/1win/Fetch1WinLeaguesWithFixturesService")
                    .then(m => m.default.syncLeaguesAndFixtures(false, true)),
                enabled: true,
                country: "ci",
                type: "fixtures",
                bookmaker: "1win"
            },
            {
                id: "ci-1win-odds",
                label: "CI_1Win_Odds",
                service: () => import("../services/1win/Add1WinOddService")
                    .then(m => m.default.syncOdds()),
                enabled: true,
                country: "ci",
                type: "odds",
                bookmaker: "1win"
            }
        ],
        "1xbet": [
            {
                id: "ci-1xbet-leagues",
                label: "CI_1xBet_Leagues",
                service: () => import("../services/1xbet/Fetch1xBetLeagueService")
                    .then(m => m.default.syncLeagues()),
                enabled: true,
                country: "ci",
                type: "leagues",
                bookmaker: "1xbet"
            },
            {
                id: "ci-1xbet-fixtures",
                label: "CI_1xBet_Fixtures",
                service: () => import("../services/1xbet/Fetch1xBetFixturesWithOddsService")
                    .then(m => m.default.syncFixtures(true)),
                enabled: true,
                country: "ci",
                type: "fixtures",
                bookmaker: "1xbet"
            },
            {
                id: "ci-1xbet-odds",
                label: "CI_1xBet_Odds",
                service: () => import("../services/1xbet/Fetch1xBetFixturesWithOddsService")
                    .then(m => m.default.syncFixtures(false, true)),
                enabled: true,
                country: "ci",
                type: "odds",
                bookmaker: "1xbet"
            }
        ],
        linebet: [
            {
                id: "ci-linebet-leagues",
                label: "CI_LineBet_Leagues",
                service: () => import("../services/linebet/FetchLineBetLeagueService")
                    .then(m => m.default.syncLeagues()),
                enabled: true,
                country: "ci",
                type: "leagues",
                bookmaker: "linebet"
            },
            {
                id: "ci-linebet-fixtures",
                label: "CI_LineBet_Fixtures",
                service: () => import("../services/linebet/FetchLineBetFixturesWithOddsService")
                    .then(m => m.default.syncFixtures(true)),
                enabled: true,
                country: "ci",
                type: "fixtures",
                bookmaker: "linebet"
            },
            {
                id: "ci-linebet-odds",
                label: "CI_LineBet_Odds",
                service: () => import("../services/linebet/FetchLineBetFixturesWithOddsService")
                    .then(m => m.default.syncFixtures(false, true)),
                enabled: true,
                country: "ci",
                type: "odds",
                bookmaker: "linebet"
            }
        ],
        melbet: [
            {
                id: "ci-melbet-leagues",
                label: "CI_MelBet_Leagues",
                service: () => import("../services/melbet/FetchMelBetLeagueService")
                    .then(m => m.default.syncLeagues()),
                enabled: true,
                country: "ci",
                type: "leagues",
                bookmaker: "melbet"
            },
            {
                id: "ci-melbet-fixtures",
                label: "CI_MelBet_Fixtures",
                service: () => import("../services/melbet/FetchMelBetFixturesWithOddsService")
                    .then(m => m.default.syncFixtures(true)),
                enabled: true,
                country: "ci",
                type: "fixtures",
                bookmaker: "melbet"
            },
            {
                id: "ci-melbet-odds",
                label: "CI_MelBet_Odds",
                service: () => import("../services/melbet/FetchMelBetFixturesWithOddsService")
                    .then(m => m.default.syncFixtures(false, true)),
                enabled: true,
                country: "ci",
                type: "odds",
                bookmaker: "melbet"
            }
        ],
        paripesa: [
            {
                id: "ci-paripesa-leagues",
                label: "CI_Paripesa_Leagues",
                service: () => import("../services/paripesa/FetchParipesaLeagueService")
                    .then(m => m.default.syncLeagues()),
                enabled: true,
                country: "ci",
                type: "leagues",
                bookmaker: "paripesa"
            },
            {
                id: "ci-paripesa-fixtures",
                label: "CI_Paripesa_Fixtures",
                service: () => import("../services/paripesa/FetchParipesaFixturesWithOddsService")
                    .then(m => m.default.syncFixtures(true)),
                enabled: true,
                country: "ci",
                type: "fixtures",
                bookmaker: "paripesa"
            },
            {
                id: "ci-paripesa-odds",
                label: "CI_Paripesa_Odds",
                service: () => import("../services/paripesa/FetchParipesaFixturesWithOddsService")
                    .then(m => m.default.syncFixtures(false, true)),
                enabled: true,
                country: "ci",
                type: "odds",
                bookmaker: "paripesa"
            }
        ],
        "mega-pari": [
            {
                id: "ci-mega-pari-leagues",
                label: "CI_MegaPari_Leagues",
                service: () => import("../services/mega-pari/FetchMegaPariLeagueService")
                    .then(m => m.default.syncLeagues()),
                enabled: true,
                country: "ci",
                type: "leagues",
                bookmaker: "mega-pari"
            },
            {
                id: "ci-mega-pari-fixtures",
                label: "CI_MegaPari_Fixtures",
                service: () => import("../services/mega-pari/FetchMegaPariFixturesWithOddsService")
                    .then(m => m.default.syncFixtures(true)),
                enabled: true,
                country: "ci",
                type: "fixtures",
                bookmaker: "mega-pari"
            },
            {
                id: "ci-mega-pari-odds",
                label: "CI_MegaPari_Odds",
                service: () => import("../services/mega-pari/FetchMegaPariFixturesWithOddsService")
                    .then(m => m.default.syncFixtures(false, true)),
                enabled: true,
                country: "ci",
                type: "odds",
                bookmaker: "mega-pari"
            }
        ],
        akwabet: [
            {
                id: "ci-akwabet-leagues",
                label: "CI_AkwaBet_Leagues",
                service: () => import("../services/akwabet/FetchAkwaBetLeagueService")
                    .then(m => new m.default().syncLeagues()),
                enabled: true,
                country: "ci",
                type: "leagues",
                bookmaker: "akwabet"
            },
            {
                id: "ci-akwabet-fixtures",
                label: "CI_AkwaBet_Fixtures",
                service: () => import("../services/akwabet/FetchAkwaBetFixturesService")
                    .then(m => new m.default().syncFixtures()),
                enabled: true,
                country: "ci",
                type: "fixtures",
                bookmaker: "akwabet"
            },
            {
                id: "ci-akwabet-odds",
                label: "CI_AkwaBet_Odds",
                service: () => import("../services/akwabet/FetchAkwaBetOddsService")
                    .then(m => new m.default().syncOdds()),
                enabled: true,
                country: "ci",
                type: "odds",
                bookmaker: "akwabet"
            }
        ]
    }
};

// export const getAllSources = (): SourceConfig[] => {
//     return Object.values(SOURCES_CONFIG)
//         .flatMap(country => Object.values(country))
//         .flat();
// };

// export const getSourcesByCountry = (country: CountryCode): SourceConfig[] => {
//     return Object.values(SOURCES_CONFIG[country] || {}).flat();
// };

// export const getSourcesByBookmaker = (bookmaker: string): SourceConfig[] => {
//     return getAllSources().filter(s => s.bookmaker === bookmaker);
// };

// Helper functions
export const getAllSources = (): SourceConfig[] => {
    return Object.values(SOURCES_CONFIG)
        .flatMap(country => Object.values(country))
        .flat();
};

export const getSourcesByCountry = (country: CountryCode): SourceConfig[] => {
    return Object.values(SOURCES_CONFIG[country] || {})
        .flat();
};

export const getSourcesByBookmaker = (bookmaker: Bookmaker): SourceConfig[] => {
    return getAllSources()
        .filter(source => source.bookmaker === bookmaker);
};

export const getSourceById = (id: string): SourceConfig | undefined => {
    return getAllSources()
        .find(source => source.id === id);
};

export const getAvailableCountries = (): CountryCode[] => {
    return Object.keys(SOURCES_CONFIG) as CountryCode[];
};

export const getAvailableBookmakers = (country?: CountryCode): Bookmaker[] => {
    if (country) {
        return Object.keys(SOURCES_CONFIG[country] || {});
    }
    return Array.from(new Set(getAllSources().map(s => s.bookmaker)));
};

export const getAvailableTypes = (): SyncType[] => {
    return ["leagues", "fixtures", "odds"];
};

export const getCountryConfig = (country: CountryCode): CountrySources | undefined => {
    return SOURCES_CONFIG[country];
};

export const getBookmakerConfig = (country: CountryCode, bookmaker: Bookmaker): SourceConfig[] | undefined => {
    return SOURCES_CONFIG[country]?.[bookmaker];
};