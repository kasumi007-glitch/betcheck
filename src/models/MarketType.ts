import { Model, DataTypes } from "sequelize";
import sequelize from "../config/database";

class MarketType extends Model {
  public id!: number;
  public market_id!: number;
  public name!: string;
  public order!: number;
}

MarketType.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    market_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    order: { type: DataTypes.INTEGER, allowNull: false },
  },
  { sequelize, modelName: "market_types", timestamps: false }
);

export default MarketType;
