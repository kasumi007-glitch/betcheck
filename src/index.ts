import app from "./app";
import sequelize from "./config/database";
// import "./jobs/OddsJob";

const PORT = process.env.PORT ?? 3000;

sequelize.sync().then(() => {
  console.log("Database connected successfully.");
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
