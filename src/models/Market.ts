import { Model, DataTypes } from "sequelize";
import sequelize from "../config/database";
import Group from "./Group";
export class Market extends Model {
  declare market_id: number;

  declare market_name: string;

  declare type: number;

  declare group_id: number;

  declare category: string;

  declare order: number;

  declare alternative_name: string;
}

Market.init(
  {
    market_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      primaryKey: true,
    },
    market_name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    type: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    group_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    category: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    order: {
      type: DataTypes.NUMBER,
      allowNull: false,
    },
    alternative_name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "markets",
    timestamps: false,
  }
);

// Association: Market belongs to Group
Market.belongsTo(Group, { foreignKey: "group_id", as: "group" });

export default Market;
