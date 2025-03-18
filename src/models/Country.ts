import { Model, DataTypes } from "sequelize";
import sequelize from "../config/database";

class Country extends Model {
  public code!: string;
  public name!: string;
  public flag!: string;
  public is_live!: boolean;
  public is_active!: boolean;
  public is_featured!: boolean;
}

Country.init(
  {
    code: { type: DataTypes.STRING, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    flag: { type: DataTypes.STRING, allowNull: true },
    is_live: { type: DataTypes.BOOLEAN, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false },
    is_featured: { type: DataTypes.BOOLEAN, allowNull: true },
  },
  { sequelize, modelName: "markets", timestamps: false }
);

export default Country;
