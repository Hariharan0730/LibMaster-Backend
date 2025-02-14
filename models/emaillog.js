const mongoose = require("mongoose");

const emailLogSchema = new mongoose.Schema({
    to: String,
    subject: String,
    text: String,
    date: { type: Date, default: Date.now },
});
const EmailLog = mongoose.model("EmailLog", emailLogSchema);

module.exports = EmailLog;