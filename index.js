const express = require("express");
const path = require("path");
const cors = require("cors");
const mongoose = require("mongoose");
const cron = require("node-cron");
const BookRoutes = require("./routes/bookroutes");
const userRoutes = require("./routes/authRoutes");
const { sendOverdueEmails, sendAdminSummary } = require("./emailService");
require("dotenv").config();
const app = express();

app.use(express.json());
app.use(cors());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/book", BookRoutes);
app.use("/api/user", userRoutes);

mongoose
  .connect(process.env.mongo_server)
  .then(() => {
    console.log("The Server is Connected to MongoDB");

    cron.schedule("0 8 * * *", async () => {
      await sendOverdueEmails();
    });

    cron.schedule("0 21 * * *", async () => {
      await sendAdminSummary();
    });

  })
  .catch((err) => console.error(" Database Connection Error:", err));

app.listen(process.env.PORT, () => {
  console.log(`Server started on port ${process.env.PORT}`);
});
