import { Model, DataTypes } from "sequelize";
import sequelize from "../config/database";

class Market extends Model {
  public id!: number;
  public group_id!: number;
  public name!: string;
  public order!: number;
}

Market.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    group_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    order: { type: DataTypes.INTEGER, allowNull: false },
  },
  { sequelize, modelName: "markets", timestamps: false }
);

export default Market;
