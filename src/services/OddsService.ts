import axios from "axios";
import Fixture from "../models/Fixture";
import OddsSource from "../models/OddsSource";
import FixtureOdds from "../models/FixtureOdds";
import { parseOddsData } from "../utils/OddsParser";

class OddsService {
  async fetchAndStoreOdds() {
    const sources = await OddsSource.findAll();

    for (const source of sources) {
      try {
        const response = await axios.get(`${source.url}/odds`);
        const oddsData = response.data;

        for (const fixtureId in oddsData) {
          const fixture = await Fixture.findByPk(fixtureId);
          if (!fixture) continue;

          const parsedOdds = await parseOddsData(
            oddsData[fixtureId],
            fixture.id,
            source.id
          );

          await FixtureOdds.bulkCreate(parsedOdds);
        }
      } catch (error) {
        console.error(`Error fetching odds from ${source.name}:`, error);
      }
    }
  }

  async getOddsByFixture(fixtureId: number) {
    return await FixtureOdds.findAll({ where: { fixture_id: fixtureId } });
  }
}

export default new OddsService();
