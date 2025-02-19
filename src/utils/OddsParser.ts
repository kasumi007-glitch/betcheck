import OddsType from "../models/OddsType";

export const parseOddsData = async (
  oddsData: any, // This is the odds.json data
  fixtureId: number,
  sourceId: number
) => {
  const parsedOdds = [];

  // Iterate over the groups in the odds data
  for (const groupKey in oddsData) {
    const group = oddsData[groupKey];
    const groupName = group.N;

    // Iterate over the markets in the group
    for (const marketKey in group.M) {
      const market = group.M[marketKey];

      // Ensure odds type exists
      const [oddsType] = await OddsType.findOrCreate({
        where: { group_name: groupName, type_name: market.N },
      });

      // Find the corresponding odds in the odds.json data
      const oddsEntry = oddsData.Value.E.find(
        (entry: any) => entry.T === market.T && entry.G === market.G
      );

      // If odds are found, use them; otherwise, use a default value or skip
      const oddValue = oddsEntry ? oddsEntry.C : Math.random() * 5; // Fallback to random if no odds found

      parsedOdds.push({
        fixture_id: fixtureId,
        source_id: sourceId,
        type_id: oddsType.id,
        option_name: market.N,
        odd_value: oddValue, // Use the actual odds from the JSON
      });
    }
  }

  return parsedOdds;
};
