import { Model, DataTypes } from "sequelize";
import sequelize from "../config/database";

class OddsType extends Model {
  public id!: number;
  public group_name!: string;
  public type_name!: string;
}

OddsType.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    group_name: { type: DataTypes.STRING, allowNull: false },
    type_name: { type: DataTypes.STRING, allowNull: false },
  },
  { sequelize, modelName: "odds_types", timestamps: false }
);

export default OddsType;
