import fuzzball from "fuzzball";

class FetchMatchService {
  // Function to clean and normalize names
  cleanName = (name: string) => {
    return name
      .toLowerCase()
      .replace(/^england\./, "") // Remove "England." prefix
      .replace(/women'?s/gi, "women") // Normalize "Women's" and "Womens"
      .replace(/non league|lower league/gi, "nonleague") // Standardize non-league naming
      .replace(/play-offs?/gi, "playoffs") // Standardize "Play-offs" to "Playoffs"
      .replace(/efl trophy/gi, "football league trophy") // Ensure correct matching
      .replace(/fa youth cup/gi, "fa youth cup") // Avoid FA Cup mismatch
      .replace(/u18 premier league/i, "u18 premier div") // Standardize U18 Premier League
      .replace(/wsl/gi, "women super league") // Ensure WSL matches correctly
      .replace(/cup\b/i, " cup") // Add space before "Cup" to avoid concatenation issues
      .replace(/championship\b/i, "championship") // Ensure proper Championship matching
      .replace(/-|\./g, " ") // Convert dashes and dots to spaces
      .replace(/\s+/g, " ") // Remove extra spaces
      .trim();
  };

  // Main list of competitions
  mainList: string[] = [
    "League Two",
    "National League - South",
    "Championship",
    "Non League Premier - Southern Central - Play-offs",
    "National League",
    "National League - North",
    "Premier League",
    "WSL Cup",
    "National League Cup",
    "FA Youth Cup",
    "U18 Premier League - South",
    "U18 Premier League - North",
    "Professional Development League",
    "National League - Play-offs",
    "Community Shield Women",
    "National League - North - Play-offs",
    "National League - South - Play-offs",
    "Non League Div One - Play-offs",
    "U18 Premier League - Championship",
    "Non League Premier - Isthmian - Play-offs",
    "Non League Premier - Northern - Play-offs",
    "Non League Premier - Southern South - Play-offs",
    "Premier League - Summer Series",
    "Premier League 2 Division One",
    "Premier League Cup",
    "FA Women's Cup",
    "League One",
    "League Cup",
    "EFL Trophy",
    "Community Shield",
    "FA Cup",
    "FA Trophy",
    "Non League Div One - Isthmian North",
    "Non League Premier - Isthmian",
    "Non League Premier - Northern",
    "Non League Premier - Southern South",
    "Non League Div One - Southern South",
    "Non League Div One - Isthmian South Central",
    "Non League Div One - Isthmian South East",
    "Non League Div One - Northern West",
    "Non League Div One - Northern Midlands",
    "Non League Div One - Southern Central",
    "Non League Premier - Southern Central",
    "Women's Championship",
    "FA WSL",
    "Non League Div One - Northern East",
  ].map(this.cleanName); // Clean before matching

  // Dataset from second list
  dataset: string[] = [
    "England. Premier League",
    "England. Championship",
    "England. League One",
    "England. League Two",
    "England. National League",
    "England. National League North",
    "England. National League South",
    "England. FA Cup",
    "England. League Cup",
    "England. Football League Trophy",
    "England. FA Trophy",
    "England. National League Cup",
    "England. Premier League Cup U21",
    "England. FA Cup (Women)",
    "England. League Cup (Women)",
    "England. Community Shield",
    "England. Community Shield Women",
    "England. Development League U21",
    "England. Isthmian League",
    "England. Isthmian League. 1st Division. North",
    "England. Isthmian League. 1st Division. South",
    "England. Northern Premier League",
    "England. Southern Premier League. Central",
    "England. Southern Premier League. South",
    "England. National League Play-offs",
    "England. National League North Play-offs",
    "England. National League South Play-offs",
    "England. U18 Premier League - South",
    "England. U18 Premier League - North",
    "England. FA Youth Cup",
    "England. Women's Super League",
    "England. Women's Championship",
    "England. Premier League Summer Series"
  ].map(this.cleanName); // Normalize dataset before matching

  // Function to find the best match for each item in the main list
  matchNames = (
    mainList: string[],
    dataset: string[],
    threshold: number = 65 // More accurate filtering
  ) => {
    const results: { main: string; match: string; score: number }[] = [];

    mainList.forEach((item) => {
      const matches = fuzzball.extract(item, dataset, {
        scorer: fuzzball.token_sort_ratio, // More robust matching
      });
      const bestMatch = matches.length > 0 ? matches[0] : null;

      if (bestMatch && bestMatch[1] >= threshold) {
        results.push({
          main: item,
          match: bestMatch[0],
          score: bestMatch[1],
        });
      } else {
        results.push({
          main: item,
          match: "No Match Found",
          score: 0,
        });
      }
    });

    return results;
  };

  async processData() {
    // Run matching and print results
    const matchedResults = this.matchNames(this.mainList, this.dataset);
    console.table(matchedResults);
  }
}

export default new FetchMatchService();
