import { Model, DataTypes } from "sequelize";
import sequelize from "../config/database";

export class Group extends Model {
  declare group_id: number;

  declare group_name: string;

  declare is_main: boolean;

  declare order: number;

  declare alternative_name: string;
}

Group.init(
  {
    group_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      primaryKey: true,
    },
    group_name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    is_main: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
    tableName: "groups",
    timestamps: false,
  }
);

export default Group;
