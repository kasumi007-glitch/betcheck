import express from "express";
import routes from "./routes";
import { scheduler } from "../services/scheduler";
import dotenv from "dotenv";
import basicAuth from "express-basic-auth";

dotenv.config();

const app = express();

// Middleware
app.use(express.json());

// Basic Authentication
app.use(basicAuth({
    users: { [process.env.API_USER as string]: process.env.API_PASSWORD as string },
    challenge: true,
    unauthorizedResponse: { success: false, error: "Unauthorized" }
}));

// Routes
app.use("/api", routes);

// Initialize scheduler
// scheduler.init();

export default app;