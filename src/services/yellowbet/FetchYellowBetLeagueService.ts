import { db } from "../../infrastructure/database/Database";
import Country from "../../models/Country";
import { fetchFromApi } from "../../utils/ApiClient";
import { leagueNameMappings } from "../leagueNameMappings";

interface LeagueNode {
  id: string;
  n: string; // name of sport/category/league
  c: number; // a numeric value (could be used for ordering or other info)
  o?: number; // optional ordering number
  cs: string; // comma separated codes, if needed
  cl: LeagueNode[]; // child nodes (subcategories/leagues)
}

interface NewApiResponse {
  data: {
    id: string;
    n: string;
    c: number;
    cs: string;
    cl: LeagueNode[];
  };
  result: any;
  isSuccessfull: boolean;
  userInfo: any;
}

class FetchYellowBetLeagueService {
  private readonly apiUrl =
    "https://yellowbet.com.gn/services/evapi/event/GetSportsTree?statusId=0&eventTypeId=0"; // replace with the correct URL
  private readonly sourceName = "YELLOWBET";
  private sourceId!: number;

  async init() {
    const source = await db("sources").where("name", this.sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
        .insert({ name: this.sourceName })
        .returning("id");
    } else {
      this.sourceId = source.id;
    }
  }

  async syncLeagues() {
    await this.init();
    console.log(`🚀 Fetching leagues data from ${this.sourceName}...`);
    const response: NewApiResponse = await fetchFromApi(this.apiUrl);

    if (!response?.data?.cl?.length) {
      console.warn(`⚠️ No data received from ${this.sourceName}.`);
      return;
    }

    // Traverse each top-level node in the "cl" array.
    const football = response.data.cl.find((sport) => sport.n === "Soccer");
    if (!football?.cl?.length) {
      console.warn(`⚠️ No league data received from ${this.sourceName}.`);
      return;
    }

    for (const node of football.cl) {
      await this.traverseLeagueTree(node);
    }

    console.log(`✅ Successfully synced leagues from ${this.sourceName}!`);
  }

  /**
   * Recursively traverse the league tree.
   *
   * @param node The current node in the league tree.
   * @param currentCountryName The country name detected from a parent node (if any).
   */
  private async traverseLeagueTree(node: LeagueNode) {
    // Check if the current node's name matches a country in our database.
    const country = await db("countries").where("name", node.n).first();
    if (!country) {
      console.warn(
        `⚠️ No country mapping found for league "${node.n}". Skipping.`
      );
      return;
    }

    // If this node has children, recursively process them.
    if (node?.cl?.length > 0) {
      for (const child of node.cl) {
        await this.processLeague(child.n, child.id, country);
      }
    } else {
      console.warn(
        `⚠️ No league mapping found for country "${country.name}". Skipping.`
      );
    }
  }

  /**
   * Process a single league.
   *
   * @param leagueName The league name as obtained from the API.
   * @param sourceLeagueId The external league ID.
   * @param countryName The detected country name to use when matching a league.
   */
  private async processLeague(
    leagueName: string,
    sourceLeagueId: string,
    country: Country
  ) {
    // Optionally, you can adjust the league name here via your mappings.
    const mappedLeagueName = leagueNameMappings[leagueName] || leagueName;

    // Find a matching league in our database by name and country code.
    const league = await db("leagues")
      .where("name", mappedLeagueName)
      .andWhere("country_code", country.code)
      .first();

    if (league) {
      console.log(
        `✅ Matched league: ${mappedLeagueName} (Source: ${leagueName}) for ${country.name}`
      );

      const result = await db("source_league_matches")
        .insert({
          source_league_id: sourceLeagueId,
          source_league_name: mappedLeagueName,
          source_country_name: country.name,
          league_id: league.id,
          country_code: country.code,
          source_id: this.sourceId,
        })
        .onConflict(["league_id", "source_id"])
        .ignore() // Prevent duplicate inserts
        .returning("*");

      if (result.length > 0) {
        console.log(
          `✅ Inserted new league: ${mappedLeagueName} (League ID: ${league.id}, Source: ${this.sourceId})`
        );
      } else {
        console.warn(
          `⚠️ Ignored duplicate league: ${mappedLeagueName} (League ID: ${league.id}, Source: ${this.sourceId})`
        );
      }
    } else {
      console.warn(
        `⚠️ No match found for league: ${mappedLeagueName} (Source: ${leagueName}) in country: ${country.name}`
      );
    }
  }
}

export default new FetchYellowBetLeagueService();
