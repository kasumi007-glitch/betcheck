import { Model, DataTypes } from "sequelize";
import sequelize from "../config/database";

class OddsSource extends Model {
  public id!: number;
  public name!: string;
  public url!: string;
}

OddsSource.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, unique: true, allowNull: false },
    url: { type: DataTypes.STRING, allowNull: false },
  },
  { sequelize, modelName: "odds_sources", timestamps: false }
);

export default OddsSource;
