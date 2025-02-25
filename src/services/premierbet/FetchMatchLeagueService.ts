import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";

class FetchMatchLeagueService {
  private readonly apiUrl =
    "https://sports-api.premierbet.com/ci/v1/competitions?country=CI&group=g4&platform=desktop&locale=en&timeOffset=-180&sportId=1";

  // Dictionary for name mappings to handle variations
  // can be done based on countries ..add new table for alias name of countries and fetch from there ..and also can be done based on source incase
  private readonly nameMappings: Record<string, string> = {
    "LaLiga": "La Liga",
    "Taca de Portugal": "Taça de Portugal",
    "U23 Liga Revelacao" : "Liga Revelação U23"
  };

  async syncLeagues() {
    console.log("🚀 Fetching leagues data...");
    const response = await fetchFromApi(this.apiUrl);

    if (!response?.categories.length) {
      console.warn("⚠️ No data received from API.");
      return;
    }

    for (const category of response.categories) {
      const sourceCountryName = category.name;
      console.log(`🔍 Processing leagues for country: ${sourceCountryName}`);

      for (const competition of category.competitions) {
        await this.processCompetition(category, competition);
      }
    }

    console.log("✅ Leagues data synced successfully!");
  }

  private async processCompetition(category: any, competition: any) {
    const { id: sourceLeagueId, name: sourceLeagueName } = competition;
    const sourceCountryName = category.name;

    // Apply name mappings if available
    const mappedLeagueName =
      this.nameMappings[sourceLeagueName] || sourceLeagueName;

    const country = await db("countries")
      .where("name", sourceCountryName)
      .first();

    if (!country) {
      console.warn(`⚠️ No match found for country: ${sourceCountryName}`);
      return;
    }

    const league = await db("leagues")
      .where("name", mappedLeagueName)
      .andWhere("country_code", country.code)
      .first();

    if (league) {
      console.log(
        `✅ Matched league: ${mappedLeagueName} in ${sourceCountryName}`
      );

      await db("source_league_matches")
        .insert({
          source_league_id: sourceLeagueId,
          source_league_name: sourceLeagueName,
          source_country_name: sourceCountryName,
          league_id: league.id,
          country_code: country.code,
        })
        .onConflict("league_id")
        .merge();

      console.log(`✅ Stored source league match for league ID: ${league.id}`);
    } else {
      console.warn(
        `⚠️ No match found for league: ${sourceLeagueName} in ${sourceCountryName}`
      );
    }
  }
}

export default new FetchMatchLeagueService();
