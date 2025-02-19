import { Model, DataTypes } from "sequelize";
import sequelize from "../config/database";
import Fixture from "./Fixture";
import OddsSource from "./OddsSource";
import OddsType from "./OddsType";

class FixtureOdds extends Model {
  public id!: number;
  public fixture_id!: number;
  public source_id!: number;
  public type_id!: number;
  public option_name!: string;
  public odd_value!: number;
}

FixtureOdds.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    fixture_id: {
      type: DataTypes.INTEGER,
      references: { model: Fixture, key: "id" },
    },
    source_id: {
      type: DataTypes.INTEGER,
      references: { model: OddsSource, key: "id" },
    },
    type_id: {
      type: DataTypes.INTEGER,
      references: { model: OddsType, key: "id" },
    },
    option_name: { type: DataTypes.STRING, allowNull: false },
    odd_value: { type: DataTypes.FLOAT, allowNull: false },
  },
  {
    sequelize,
    modelName: "fixture_odds",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default FixtureOdds;
