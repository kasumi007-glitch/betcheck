import { Model, DataTypes } from "sequelize";
import sequelize from "../config/database";

class Fixture extends Model {
  public id!: number;
  public home_team!: string;
  public away_team!: string;
  public match_date!: Date;
}

Fixture.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    home_team: { type: DataTypes.STRING, allowNull: false },
    away_team: { type: DataTypes.STRING, allowNull: false },
    match_date: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: "fixtures",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Fixture;
