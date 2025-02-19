import { Request, Response } from "express";
import OddsService from "../services/OddsService";

class OddsController {
  async getOddsByFixture(req: Request, res: Response) {
    try {
      const { fixtureId } = req.params;
      const odds = await OddsService.getOddsByFixture(parseInt(fixtureId));
      res.json({ status: "success", data: odds });
    } catch (error) {
      res.status(500).json({ status: "error", message: "Server Error" });
    }
  }
}

export default new OddsController();
